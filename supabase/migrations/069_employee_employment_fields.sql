-- Employment fields on employees, modeled on Talenta's bulk-import template.
--
-- Names chosen to avoid colliding with the existing `status` column, which
-- represents the lifecycle (trial/active/suspended/terminated/archived) and
-- is unrelated to Talenta's "Employment Status" (= contract type).
-- Talenta's Employment Status is captured here as `employment_type`.
--
-- All columns nullable. The UI marks the Talenta-required ones with a red
-- asterisk and enforces them on edit-save.
--
-- Position & job:
--   employee_code         — internal HR identifier; the join key for bulk
--                          re-imports from Talenta. Unique per org.
--   job_position          — title (e.g. "Senior Engineer"). Free text.
--   job_level             — e.g. Staff / Supervisor / Manager. Free text so
--                          Talenta levels import as-is.
--   grade, class          — pay grade / employee class. Free text.
--   branch_name           — for multi-branch orgs.
--
-- Employment timeline:
--   employment_type       — permanent | contract | probation | internship | outsource
--   join_date             — start date.
--   probation_end_date    — end of probation period.
--   contract_sign_date    — date the contract was signed.
--   resign_date           — when the employee resigned.

alter table public.employees
  add column if not exists employee_code text,
  add column if not exists job_position text,
  add column if not exists job_level text,
  add column if not exists grade text,
  add column if not exists class text,
  add column if not exists branch_name text,
  add column if not exists employment_type text
    check (employment_type is null or employment_type in (
      'permanent', 'contract', 'probation', 'internship', 'outsource'
    )),
  add column if not exists join_date date,
  add column if not exists probation_end_date date,
  add column if not exists contract_sign_date date,
  add column if not exists resign_date date;

-- employee_code must be unique within an org so re-importing the same
-- Talenta export is idempotent. Allowed null (existing rows + create flow).
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'employees_org_employee_code_key'
  ) then
    create unique index employees_org_employee_code_key
      on public.employees (org_id, employee_code)
      where employee_code is not null;
  end if;
end $$;
