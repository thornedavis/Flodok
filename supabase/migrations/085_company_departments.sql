-- Departments become a first-class entity with structural metadata.
--
-- Until now, departments lived as a 'kind' inside company_reference_values
-- (validation list only) and as free text on employees.department /
-- employees.departments[]. This migration follows the same pattern that
-- branches used in 076/077: extract departments into a dedicated table,
-- replace the text columns with a proper join table, and tighten the
-- reference-values CHECK constraint so 'department' can never sneak back.
--
-- Structural columns added now (manager, parent) are nullable; UI for setting
-- them lands in a later phase. Including them here avoids a second migration.
--
-- Hard cutover: employees.department and employees.departments[] are dropped
-- in the same migration. The app is pre-production, so no transitional reads.

-- 1. Canonical departments table

create table if not exists public.company_departments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  manager_employee_id uuid references public.employees(id) on delete set null,
  parent_department_id uuid references public.company_departments(id) on delete set null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists company_departments_org_name_key
  on public.company_departments (org_id, lower(trim(name)));

create index if not exists idx_company_departments_org
  on public.company_departments (org_id, display_order, name);

create index if not exists idx_company_departments_manager
  on public.company_departments (manager_employee_id)
  where manager_employee_id is not null;

create or replace function public.tg_company_departments_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_company_departments_touch on public.company_departments;
create trigger trg_company_departments_touch
  before update on public.company_departments
  for each row execute function public.tg_company_departments_touch();

alter table public.company_departments enable row level security;

create policy "Members can manage company departments"
  on public.company_departments for all to authenticated
  using (org_id in (select org_id from public.users where id = auth.uid()))
  with check (org_id in (select org_id from public.users where id = auth.uid()));

-- 2. Employee ↔ department join table

create table if not exists public.employee_departments (
  employee_id uuid not null references public.employees(id) on delete cascade,
  department_id uuid not null references public.company_departments(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (employee_id, department_id)
);

-- Exactly one primary per employee (schema-enforced; UI is single-select for now
-- but this index is what keeps multi-select correct when we flip it on later).
create unique index if not exists employee_departments_one_primary
  on public.employee_departments (employee_id)
  where is_primary;

create index if not exists idx_employee_departments_department
  on public.employee_departments (department_id);

alter table public.employee_departments enable row level security;

create policy "Members can manage employee departments"
  on public.employee_departments for all to authenticated
  using (
    employee_id in (
      select id from public.employees
      where org_id in (select org_id from public.users where id = auth.uid())
    )
  )
  with check (
    employee_id in (
      select id from public.employees
      where org_id in (select org_id from public.users where id = auth.uid())
    )
  );

-- 3. Seed company_departments from the existing reference-values list.
-- This list is what users have curated in Org Settings, so it is the
-- authoritative source of canonical names (more reliable than scraping
-- employee text columns directly, which may contain stale variants).

insert into public.company_departments (org_id, name, display_order)
select org_id, trim(name), coalesce(display_order, 0)
from public.company_reference_values
where kind = 'department'
  and trim(coalesce(name, '')) <> ''
on conflict do nothing;

-- 4. Backfill employee_departments from the legacy columns.
--
-- Order of preference for marking primary:
--   a. The first element of employees.departments[] (matches the documented
--      "first element mirrored to .department on write" behaviour from 021).
--   b. If departments[] is empty but the legacy single-text column is set,
--      that value is the primary.
--
-- Names are matched case-insensitively against company_departments. Any
-- legacy text value that does not resolve to a known department is silently
-- skipped (it was already invalid: not in the curated reference list).

insert into public.employee_departments (employee_id, department_id, is_primary)
select
  e.id,
  d.id,
  (t.idx = 1)
from public.employees e
cross join lateral unnest(coalesce(e.departments, array[]::text[]))
  with ordinality as t(dept_name, idx)
join public.company_departments d
  on d.org_id = e.org_id
  and lower(trim(d.name)) = lower(trim(t.dept_name))
on conflict do nothing;

insert into public.employee_departments (employee_id, department_id, is_primary)
select e.id, d.id, true
from public.employees e
join public.company_departments d
  on d.org_id = e.org_id
  and lower(trim(d.name)) = lower(trim(e.department))
where (e.departments is null or cardinality(e.departments) = 0)
  and e.department is not null
  and trim(e.department) <> ''
on conflict do nothing;

-- 5. Drop legacy storage on employees. The index from migration 003
-- (idx_employees_department) is dropped implicitly when its column goes.

alter table public.employees
  drop column if exists department,
  drop column if exists departments;

-- 6. Remove 'department' from company_reference_values and tighten the
-- CHECK constraint so the kind cannot return. Mirrors what 077 did for
-- branches.

delete from public.company_reference_values where kind = 'department';

alter table public.company_reference_values
  drop constraint if exists company_reference_values_kind_check;

alter table public.company_reference_values
  add constraint company_reference_values_kind_check check (kind in (
    'job_position',
    'job_level',
    'employee_class'
  ));
