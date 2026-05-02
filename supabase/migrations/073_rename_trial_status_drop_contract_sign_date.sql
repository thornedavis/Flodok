-- Rename status='trial' → 'probation' and drop the redundant
-- employees.contract_sign_date column.
--
-- Why rename:
--   "trial" is SaaS-trial language and clashes with our subscription_status
--   vocabulary. "Probation" is the standard HR term and lines up with the
--   employment_type='probation' value we added in migration 069 — together
--   they describe the same lifecycle stage from two angles (status =
--   current state, employment_type = contract category).
--
-- Why drop contract_sign_date:
--   Contract signing is already tracked in contract_signatures.signed_at
--   per signer. Storing a flat sign-date on employees would drift from the
--   real source of truth. The Employment panel now displays the value as a
--   read-only field pulled from the active contract.

-- 1. Drop the existing CHECK constraint so we can rewrite the legal values.
do $$
declare
  c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.employees'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%trial%'
  loop
    execute format('alter table public.employees drop constraint %I', c);
  end loop;
end $$;

-- 2. Migrate existing rows.
update public.employees
   set status = 'probation'
 where status = 'trial';

-- 3. Re-add the constraint with the new vocabulary (skip if it already exists).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.employees'::regclass
      and conname = 'employees_status_check'
  ) then
    alter table public.employees
      add constraint employees_status_check
      check (status in ('probation', 'active', 'suspended', 'terminated', 'archived'));
  end if;
end $$;

-- 4. Drop the now-redundant column.
alter table public.employees
  drop column if exists contract_sign_date;
