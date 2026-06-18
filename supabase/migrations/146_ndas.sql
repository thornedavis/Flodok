-- NDA document type — data layer.
--
-- An NDA (non-disclosure agreement) is contract-shaped: employee-linked,
-- versioned/translated, and two-sided-signed (employer countersignature +
-- employee portal signature). This migration mirrors the *hardened* contract
-- schema (post-083 signatures, post-103 trash RLS, post-141 RPC-only portal
-- signing) but drops the employment-specific fields (wage / hours / PKWT /
-- leave / probation) and adds the three NDA knobs: effective_date,
-- survival_years, penalty_idr. Governing law lives in the document boilerplate,
-- not a column.
--
-- Tables: ndas, nda_versions, nda_signatures, nda_tags. The signing RPC +
-- feed trigger land in 147; this file is purely schema + RLS + indexes, plus
-- widening three shared check constraints to admit 'nda'.

-- ─── ndas (live rows) ──────────────────────────────────
create table if not exists public.ndas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations on delete cascade not null,
  employee_id uuid references public.employees on delete cascade,   -- receiving party; null while drafting
  title text not null,
  content_markdown text not null default '',
  content_markdown_id text,
  content_doc jsonb,
  current_version integer not null default 1,
  status text not null default 'draft' check (status in ('active', 'draft', 'archived')),
  -- NDA structured fields
  effective_date date,
  survival_years integer check (survival_years is null or survival_years >= 0),
  penalty_idr integer check (penalty_idr is null or penalty_idr >= 0),
  document_number text,
  -- soft delete / trash (mirrors contracts post-102)
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  trashed_with_parent_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── nda_versions (snapshot history) ───────────────────
-- Columns match what _shared/snapshot.ts writes for the non-contract path
-- (no wage/hours), keeping the employee_id snapshot + resolved markdown.
create table if not exists public.nda_versions (
  id uuid primary key default gen_random_uuid(),
  nda_id uuid references public.ndas on delete cascade not null,
  version_number integer not null,
  content_markdown text not null default '',
  content_markdown_id text,
  content_doc jsonb,
  resolved_markdown_en text,
  resolved_markdown_id text,
  translation_status text not null default 'complete'
    check (translation_status in ('complete', 'failed')),
  translation_error text,
  employee_id uuid references public.employees on delete set null,
  change_summary text,
  changed_by text not null,
  created_at timestamptz not null default now(),
  unique (nda_id, version_number)
);

-- ─── nda_signatures (employer + employee) ──────────────
-- Mirrors contract_signatures' final shape (020 + 060 + 083): role-tagged,
-- with the role/id-match constraint and the evidentiary columns
-- (hash / ip / user_agent / consent / email / phone).
create table if not exists public.nda_signatures (
  id uuid primary key default gen_random_uuid(),
  nda_id uuid not null references public.ndas on delete cascade,
  version_number integer not null,
  signer_role text not null default 'employee'
    check (signer_role in ('employee', 'employer')),
  employee_id uuid references public.employees on delete cascade,
  signer_user_id uuid references public.users on delete set null,
  signer_title text,
  typed_name text not null,
  signature_font text,
  signer_email text,
  signer_phone text,
  consent_text text,
  document_hash text,
  user_agent text,
  ip_address text,
  signed_at timestamptz not null default now(),
  constraint nda_signatures_role_id_match check (
    (signer_role = 'employee' and employee_id is not null and signer_user_id is null) or
    (signer_role = 'employer' and signer_user_id is not null and employee_id is null)
  )
);

-- ─── nda_tags (junction to shared tags) ────────────────
create table if not exists public.nda_tags (
  nda_id uuid references public.ndas on delete cascade not null,
  tag_id uuid references public.tags on delete cascade not null,
  primary key (nda_id, tag_id)
);

-- ─── Indexes ───────────────────────────────────────────
create index if not exists idx_ndas_org on public.ndas (org_id) where deleted_at is null;
create index if not exists idx_ndas_employee on public.ndas (employee_id);
create index if not exists idx_ndas_trash on public.ndas (org_id, deleted_at desc) where deleted_at is not null;
create index if not exists idx_ndas_trashed_with_parent on public.ndas (trashed_with_parent_id) where trashed_with_parent_id is not null;
create index if not exists idx_nda_versions_nda on public.nda_versions (nda_id);
create index if not exists idx_nda_signatures_nda on public.nda_signatures (nda_id);
create index if not exists idx_nda_signatures_employee on public.nda_signatures (employee_id);
create index if not exists idx_nda_signatures_signer_user on public.nda_signatures (signer_user_id);

-- ─── RLS ───────────────────────────────────────────────
alter table public.ndas enable row level security;
alter table public.nda_versions enable row level security;
alter table public.nda_signatures enable row level security;
alter table public.nda_tags enable row level security;

-- ndas: managers manage their org's non-trashed rows (mirrors contracts post-103).
create policy "Managers can manage their org NDAs"
  on public.ndas for all
  using (
    org_id in (select org_id from public.users where id = auth.uid())
    and deleted_at is null
  )
  with check (
    org_id in (select org_id from public.users where id = auth.uid())
  );

create policy "Managers can manage their org NDA versions"
  on public.nda_versions for all
  using (nda_id in (select id from public.ndas where org_id in (select org_id from public.users where id = auth.uid())));

create policy "Managers can manage their org NDA tags"
  on public.nda_tags for all
  using (nda_id in (select id from public.ndas where org_id in (select org_id from public.users where id = auth.uid())));

-- nda_signatures: managers read their org's; authenticated insert is for the
-- employer countersignature (direct insert from the editor). Employee portal
-- signing goes through portal_sign_nda() (SECURITY DEFINER, migration 147) —
-- no anon policy, matching the post-141 contract posture.
create policy "Managers can view nda signatures in own org"
  on public.nda_signatures for select
  using (nda_id in (select id from public.ndas where org_id = public.get_user_org_id()));

create policy "Authenticated can insert nda signatures"
  on public.nda_signatures for insert
  to authenticated
  with check (
    (signer_role = 'employee'
      and nda_id in (select id from public.ndas where org_id = public.get_user_org_id()))
    or
    (signer_role = 'employer'
      and signer_user_id = auth.uid()
      and nda_id in (select id from public.ndas where org_id = public.get_user_org_id()))
  );

-- ─── Widen shared check constraints to admit 'nda' ─────
-- View-mode prefs (112): also re-admits 'letter', which uses the toggle but
-- was silently failing the old ('sop','contract') check.
alter table public.document_view_prefs
  drop constraint if exists document_view_prefs_type_check;
alter table public.document_view_prefs
  add constraint document_view_prefs_type_check
  check (document_type in ('sop', 'contract', 'letter', 'nda'));

-- Template gallery type (121).
alter table public.document_templates
  drop constraint if exists document_templates_type_check;
alter table public.document_templates
  add constraint document_templates_type_check
  check (type in ('sop', 'contract', 'job_description', 'letter', 'nda'));

-- Feed events (129): add 'nda_signed' for the signing trigger in 147.
alter table public.feed_events
  drop constraint if exists feed_events_event_type_check;
alter table public.feed_events
  add constraint feed_events_event_type_check
  check (
    event_type in (
      'sop_signed', 'sop_updated', 'sop_assigned',
      'contract_assigned', 'contract_updated', 'contract_signed',
      'job_description_signed',
      'letter_issued',
      'nda_signed',
      'bonus_awarded',
      'welcome',
      'achievement_unlocked',
      'spotlight_published'
    )
    or event_type ~ '^hiring_request_'
  );
