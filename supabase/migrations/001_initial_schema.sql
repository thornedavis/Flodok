-- Flodok: Initial Schema Migration
-- Creates all tables, indexes, and RLS policies

-- Enable required extensions
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  review_mode boolean not null default true,
  default_country_code text not null default '+62',
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key references auth.users on delete cascade,
  org_id uuid not null references organizations on delete cascade,
  email text not null,
  name text not null,
  role text not null default 'manager',
  created_at timestamptz not null default now()
);

create table employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  name text not null,
  phone text not null,
  email text,
  photo_url text,
  slug text not null unique,
  access_token text not null unique,
  created_at timestamptz not null default now(),
  unique (org_id, phone)
);

create table sop_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  name text not null,
  sort_order integer not null default 0
);

create table sops (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  employee_id uuid not null references employees on delete cascade,
  title text not null,
  content_markdown text not null default '',
  current_version integer not null default 1,
  status text not null default 'draft' check (status in ('active', 'draft', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id)
);

create table sop_versions (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid not null references sops on delete cascade,
  version_number integer not null,
  content_markdown text not null,
  change_summary text,
  changed_by text not null,
  created_at timestamptz not null default now(),
  unique (sop_id, version_number)
);

create table sop_signatures (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid not null references sops on delete cascade,
  version_number integer not null,
  employee_id uuid not null references employees on delete cascade,
  typed_name text not null,
  signed_at timestamptz not null default now()
);

create table pending_updates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  employee_id uuid references employees on delete set null,
  employee_identifier text not null,
  proposed_changes jsonb not null,
  source_meeting text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'auto_applied')),
  reviewed_by uuid references users,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  key_hash text not null,
  key_prefix text not null,
  name text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_users_org on users (org_id);
create index idx_employees_org on employees (org_id);
create index idx_employees_phone on employees (org_id, phone);
create index idx_employees_slug_token on employees (slug, access_token);
create index idx_sops_org on sops (org_id);
create index idx_sops_employee on sops (employee_id);
create index idx_sop_versions_sop on sop_versions (sop_id);
create index idx_sop_signatures_sop on sop_signatures (sop_id);
create index idx_sop_signatures_employee on sop_signatures (employee_id);
create index idx_pending_updates_org on pending_updates (org_id);
create index idx_pending_updates_status on pending_updates (org_id, status);
create index idx_api_keys_org on api_keys (org_id);
create index idx_sop_categories_org on sop_categories (org_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table organizations enable row level security;
alter table users enable row level security;
alter table employees enable row level security;
alter table sop_categories enable row level security;
alter table sops enable row level security;
alter table sop_versions enable row level security;
alter table sop_signatures enable row level security;
alter table pending_updates enable row level security;
alter table api_keys enable row level security;

-- Helper: get the current user's org_id
create or replace function public.get_user_org_id()
returns uuid
language sql
stable
security definer
as $$
  select org_id from public.users where id = auth.uid()
$$;

-- ---- Organizations ----
create policy "Managers can view own org"
  on organizations for select
  using (id = public.get_user_org_id());

create policy "Managers can update own org"
  on organizations for update
  using (id = public.get_user_org_id());

create policy "Authenticated users can insert orgs"
  on organizations for insert
  to authenticated
  with check (true);

-- ---- Users ----
create policy "Managers can view users in own org"
  on users for select
  using (org_id = public.get_user_org_id());

create policy "Authenticated users can insert own user record"
  on users for insert
  to authenticated
  with check (id = auth.uid());

create policy "Managers can update own profile"
  on users for update
  using (id = auth.uid());

-- ---- Employees ----
create policy "Managers can CRUD employees in own org"
  on employees for all
  using (org_id = public.get_user_org_id());

create policy "Public can view employee by slug+token"
  on employees for select
  to anon
  using (true);

-- ---- SOP Categories ----
create policy "Managers can CRUD categories in own org"
  on sop_categories for all
  using (org_id = public.get_user_org_id());

create policy "Public can view categories"
  on sop_categories for select
  to anon
  using (true);

-- ---- SOPs ----
create policy "Managers can CRUD SOPs in own org"
  on sops for all
  using (org_id = public.get_user_org_id());

create policy "Public can view active SOPs"
  on sops for select
  to anon
  using (status = 'active');

-- ---- SOP Versions ----
create policy "Managers can manage versions in own org"
  on sop_versions for all
  using (
    sop_id in (select id from sops where org_id = public.get_user_org_id())
  );

create policy "Public can view versions of active SOPs"
  on sop_versions for select
  to anon
  using (
    sop_id in (select id from sops where status = 'active')
  );

-- ---- SOP Signatures ----
create policy "Managers can view signatures in own org"
  on sop_signatures for select
  using (
    sop_id in (select id from sops where org_id = public.get_user_org_id())
  );

create policy "Public can insert signatures"
  on sop_signatures for insert
  to anon
  with check (true);

create policy "Public can view own signatures"
  on sop_signatures for select
  to anon
  using (true);

-- ---- Pending Updates ----
create policy "Managers can manage pending updates in own org"
  on pending_updates for all
  using (org_id = public.get_user_org_id());

-- ---- API Keys ----
create policy "Managers can manage API keys in own org"
  on api_keys for all
  using (org_id = public.get_user_org_id());
