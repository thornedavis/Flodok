-- Education & Experience tab — three child tables modeled on Talenta's
-- "Education & experience" section (Formal / Informal / Working experience).
--
-- All tables are org-scoped with cascading delete from employees, share the
-- same RLS pattern as employee_family_members, and carry a touch trigger.
-- File-upload support is shaped out via `certificate_file_url` columns even
-- though the picker UI lands later — schema-first means the upload feature
-- can drop in without another migration.

-- ─── Formal education ────────────────────────────────────

create table if not exists public.employee_formal_education (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  employee_id uuid not null references public.employees on delete cascade,

  degree text not null
    check (degree in (
      'elementary', 'junior_high', 'senior_high',
      'diploma', 'bachelor', 'master', 'doctorate', 'other'
    )),
  institution text not null,
  field_of_study text,
  grade text,
  start_year int,
  end_year int,
  activities text,
  has_certificate boolean not null default false,
  certificate_file_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_employee_formal_education_employee
  on public.employee_formal_education (employee_id, end_year desc nulls last);
create index if not exists idx_employee_formal_education_org
  on public.employee_formal_education (org_id);

-- ─── Informal education ──────────────────────────────────

create table if not exists public.employee_informal_education (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  employee_id uuid not null references public.employees on delete cascade,

  education_name text not null,
  held_by text,
  start_date date,
  end_date date,
  duration_type text
    check (duration_type is null or duration_type in ('day', 'week', 'month', 'year')),
  duration int,
  expired_date date,
  fee_idr bigint,
  activities text,
  has_certificate boolean not null default false,
  certificate_file_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_employee_informal_education_employee
  on public.employee_informal_education (employee_id, start_date desc nulls last);
create index if not exists idx_employee_informal_education_org
  on public.employee_informal_education (org_id);

-- ─── Working experience ──────────────────────────────────

create table if not exists public.employee_working_experience (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  employee_id uuid not null references public.employees on delete cascade,

  company text not null,
  job_position text not null,
  -- Stored at month precision (day = 01); UI uses a month/year picker.
  from_date date,
  to_date date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_employee_working_experience_employee
  on public.employee_working_experience (employee_id, from_date desc nulls last);
create index if not exists idx_employee_working_experience_org
  on public.employee_working_experience (org_id);

-- ─── Touch triggers ──────────────────────────────────────

create or replace function public.touch_employee_edu_exp()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_employee_formal_education_touch on public.employee_formal_education;
create trigger trg_employee_formal_education_touch
  before update on public.employee_formal_education
  for each row execute function public.touch_employee_edu_exp();

drop trigger if exists trg_employee_informal_education_touch on public.employee_informal_education;
create trigger trg_employee_informal_education_touch
  before update on public.employee_informal_education
  for each row execute function public.touch_employee_edu_exp();

drop trigger if exists trg_employee_working_experience_touch on public.employee_working_experience;
create trigger trg_employee_working_experience_touch
  before update on public.employee_working_experience
  for each row execute function public.touch_employee_edu_exp();

-- ─── RLS ────────────────────────────────────────────────

alter table public.employee_formal_education enable row level security;
alter table public.employee_informal_education enable row level security;
alter table public.employee_working_experience enable row level security;

create policy "Managers can manage formal education"
  on public.employee_formal_education for all to authenticated
  using (org_id in (select org_id from public.users where id = auth.uid()))
  with check (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Managers can manage informal education"
  on public.employee_informal_education for all to authenticated
  using (org_id in (select org_id from public.users where id = auth.uid()))
  with check (org_id in (select org_id from public.users where id = auth.uid()));

create policy "Managers can manage working experience"
  on public.employee_working_experience for all to authenticated
  using (org_id in (select org_id from public.users where id = auth.uid()))
  with check (org_id in (select org_id from public.users where id = auth.uid()));
