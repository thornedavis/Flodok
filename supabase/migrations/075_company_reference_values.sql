-- Company reference values used by employee profiles and bulk imports.
--
-- Employees keep the current text columns for compatibility with the portal,
-- contracts, SOP filters, and merge fields. This table is the canonical list
-- of allowed values that forms/imports validate against.

create table if not exists public.company_reference_values (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in (
    'department',
    'branch',
    'job_position',
    'job_level',
    'employee_class'
  )),
  name text not null check (length(trim(name)) > 0),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists company_reference_values_org_kind_name_key
  on public.company_reference_values (org_id, kind, lower(trim(name)));

create index if not exists idx_company_reference_values_org_kind
  on public.company_reference_values (org_id, kind, display_order, name);

create or replace function public.tg_company_reference_values_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_company_reference_values_touch on public.company_reference_values;
create trigger trg_company_reference_values_touch
  before update on public.company_reference_values
  for each row execute function public.tg_company_reference_values_touch();

alter table public.company_reference_values enable row level security;

create policy "Managers can manage company reference values"
  on public.company_reference_values for all to authenticated
  using (org_id in (select org_id from public.users where id = auth.uid()))
  with check (org_id in (select org_id from public.users where id = auth.uid()));

-- Seed the new canonical lists from existing employee text values so current
-- orgs do not lose their department/position data when the controlled inputs
-- are enabled.
insert into public.company_reference_values (org_id, kind, name)
select distinct org_id, 'department', trim(name)
from (
  select org_id, unnest(coalesce(departments, array[]::text[])) as name
  from public.employees
  union all
  select org_id, department as name
  from public.employees
) seed
where trim(coalesce(name, '')) <> ''
on conflict do nothing;

insert into public.company_reference_values (org_id, kind, name)
select distinct org_id, 'job_position', trim(job_position)
from public.employees
where trim(coalesce(job_position, '')) <> ''
on conflict do nothing;

insert into public.company_reference_values (org_id, kind, name)
select distinct org_id, 'job_level', trim(job_level)
from public.employees
where trim(coalesce(job_level, '')) <> ''
on conflict do nothing;

insert into public.company_reference_values (org_id, kind, name)
select distinct org_id, 'employee_class', trim(class)
from public.employees
where trim(coalesce(class, '')) <> ''
on conflict do nothing;

insert into public.company_reference_values (org_id, kind, name)
select distinct org_id, 'branch', trim(branch_name)
from public.employees
where trim(coalesce(branch_name, '')) <> ''
on conflict do nothing;
