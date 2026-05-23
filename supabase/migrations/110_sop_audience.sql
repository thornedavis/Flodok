-- SOP audience: multi-target acknowledgement model (Phase 1a).
--
-- Replaces single-employee SOP linking with a polymorphic audience join
-- that can target individuals, departments, branches, job positions,
-- job levels, employee classes, or "everyone in the org".
--
-- Also converts the free-text sops.owner_department into a proper FK on
-- company_departments (sops.owner_department_id), keeping the legacy text
-- column read-only for one release as a safety fallback. The legacy
-- sops.employee_id column is also retained for one release — the application
-- transitions to reading from sop_audience over the next deploy and a
-- follow-up migration drops both legacy columns.
--
-- The sop_acknowledgements / per-employee sign-tracking changes land in 111
-- (extending the existing sop_signatures table) once that data shape is
-- mapped against the audience resolver.

-- ─── sop_audience ─────────────────────────────────────────────

create table if not exists public.sop_audience (
  id            uuid primary key default gen_random_uuid(),
  sop_id        uuid not null references public.sops(id) on delete cascade,
  target_type   text not null check (target_type in (
                  'everyone', 'employee', 'department', 'branch',
                  'job_position', 'job_level', 'employee_class')),
  employee_id   uuid null references public.employees(id)               on delete cascade,
  department_id uuid null references public.company_departments(id)     on delete restrict,
  branch_id     uuid null references public.company_branches(id)        on delete restrict,
  reference_id  uuid null references public.company_reference_values(id) on delete restrict,
  added_at      timestamptz not null default now(),
  added_by      uuid null references auth.users(id) on delete set null,
  -- Exactly one target column is populated, matching target_type. 'everyone'
  -- populates none. The app layer additionally enforces that reference_id
  -- rows match company_reference_values.kind to target_type.
  constraint sop_audience_target_shape check (
    (target_type = 'everyone'
       and employee_id is null and department_id is null and branch_id is null and reference_id is null) or
    (target_type = 'employee'
       and employee_id is not null and department_id is null and branch_id is null and reference_id is null) or
    (target_type = 'department'
       and employee_id is null and department_id is not null and branch_id is null and reference_id is null) or
    (target_type = 'branch'
       and employee_id is null and department_id is null and branch_id is not null and reference_id is null) or
    (target_type in ('job_position', 'job_level', 'employee_class')
       and employee_id is null and department_id is null and branch_id is null and reference_id is not null)
  )
);

-- Partial unique indexes per target column (PRIMARY KEY can't span nullable cols).
create unique index if not exists sop_audience_uq_everyone
  on public.sop_audience (sop_id)
  where target_type = 'everyone';

create unique index if not exists sop_audience_uq_employee
  on public.sop_audience (sop_id, employee_id)
  where employee_id is not null;

create unique index if not exists sop_audience_uq_department
  on public.sop_audience (sop_id, department_id)
  where department_id is not null;

create unique index if not exists sop_audience_uq_branch
  on public.sop_audience (sop_id, branch_id)
  where branch_id is not null;

create unique index if not exists sop_audience_uq_reference
  on public.sop_audience (sop_id, reference_id, target_type)
  where reference_id is not null;

-- Lookup indexes for audience resolution (portal read path).
create index if not exists sop_audience_sop_idx        on public.sop_audience (sop_id);
create index if not exists sop_audience_employee_idx   on public.sop_audience (employee_id)   where employee_id is not null;
create index if not exists sop_audience_department_idx on public.sop_audience (department_id) where department_id is not null;
create index if not exists sop_audience_branch_idx     on public.sop_audience (branch_id)     where branch_id is not null;
create index if not exists sop_audience_reference_idx  on public.sop_audience (reference_id)  where reference_id is not null;

-- ─── RLS ──────────────────────────────────────────────────────

alter table public.sop_audience enable row level security;

create policy "Managers can manage sop audience in own org"
  on public.sop_audience for all to authenticated
  using (
    sop_id in (select id from public.sops where org_id = public.get_user_org_id())
  )
  with check (
    sop_id in (select id from public.sops where org_id = public.get_user_org_id())
  );

create policy "Public can view audience of active SOPs"
  on public.sop_audience for select to anon
  using (
    sop_id in (select id from public.sops where status = 'active')
  );

-- ─── owner_department_id FK on sops ───────────────────────────

alter table public.sops
  add column if not exists owner_department_id uuid null
  references public.company_departments(id) on delete set null;

create index if not exists sops_owner_department_id_idx
  on public.sops (owner_department_id);

-- ─── Backfills ────────────────────────────────────────────────

-- 1. sops.employee_id → sop_audience (target_type='employee').
insert into public.sop_audience (sop_id, target_type, employee_id, added_at)
select s.id, 'employee', s.employee_id, coalesce(s.updated_at, s.created_at, now())
from public.sops s
where s.employee_id is not null
  and s.deleted_at is null
on conflict do nothing;

-- 2. sops.owner_department (free text) → sops.owner_department_id (FK),
--    matched by case/whitespace-insensitive name within the same org.
update public.sops s
set owner_department_id = cd.id
from public.company_departments cd
where s.org_id = cd.org_id
  and s.owner_department is not null
  and lower(trim(s.owner_department)) = lower(trim(cd.name))
  and s.owner_department_id is null;

-- Surface unmatched values so they can be cleaned up manually after migration.
do $$
declare
  r record;
  unmatched int := 0;
begin
  for r in
    select s.id, s.title, s.owner_department, s.org_id
    from public.sops s
    where s.owner_department is not null
      and s.owner_department_id is null
      and s.deleted_at is null
  loop
    raise notice 'sop_audience migration: unmatched owner_department sop=% title=% value=% org=%',
      r.id, r.title, r.owner_department, r.org_id;
    unmatched := unmatched + 1;
  end loop;
  if unmatched > 0 then
    raise notice 'sop_audience migration: % SOP(s) have an owner_department that did not match any company_departments row. They keep the legacy text and owner_department_id stays null.', unmatched;
  end if;
end $$;
