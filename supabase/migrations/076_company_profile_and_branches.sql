-- Richer company profile fields and first-class branches.
--
-- These are intentionally limited to values that support contracts, employee
-- records, imports, Indonesian compliance, and future company assets. We are
-- not copying a full HRIS settings surface wholesale.

alter table public.organizations
  add column if not exists company_email text,
  add column if not exists website_url text,
  add column if not exists industry text,
  add column if not exists company_size_range text,
  add column if not exists npwp_15 text,
  add column if not exists npwp_16 text,
  add column if not exists nitku text,
  add column if not exists taxable_date date,
  add column if not exists tax_person_name text,
  add column if not exists tax_person_npwp_15 text,
  add column if not exists tax_person_npwp_16 text,
  add column if not exists bpjs_ketenagakerjaan_number text,
  add column if not exists jkk_rate text,
  add column if not exists klu_code text,
  add column if not exists company_registration_number text,
  add column if not exists business_license_number text;

create table if not exists public.company_branches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text,
  name text not null check (length(trim(name)) > 0),
  parent_branch_id uuid references public.company_branches(id) on delete set null,
  phone text,
  address_street text,
  address_city text,
  address_province text,
  address_postal_code text,
  address_country text not null default 'ID',
  is_headquarters boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists company_branches_org_name_key
  on public.company_branches (org_id, lower(trim(name)));

create unique index if not exists company_branches_org_code_key
  on public.company_branches (org_id, lower(trim(code)))
  where code is not null and trim(code) <> '';

create index if not exists idx_company_branches_org
  on public.company_branches (org_id, is_active, name);

create or replace function public.tg_company_branches_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_company_branches_touch on public.company_branches;
create trigger trg_company_branches_touch
  before update on public.company_branches
  for each row execute function public.tg_company_branches_touch();

alter table public.company_branches enable row level security;

create policy "Managers can manage company branches"
  on public.company_branches for all to authenticated
  using (org_id in (select org_id from public.users where id = auth.uid()))
  with check (org_id in (select org_id from public.users where id = auth.uid()));

insert into public.company_branches (org_id, name)
select distinct org_id, trim(name)
from (
  select org_id, name
  from public.company_reference_values
  where kind = 'branch'
  union all
  select org_id, branch_name as name
  from public.employees
) seed
where trim(coalesce(name, '')) <> ''
on conflict do nothing;
