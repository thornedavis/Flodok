-- Migration 037 created employees.status with `default 'trial'`. Migration 073
-- later removed 'trial' from the allowed CHECK values but forgot to update the
-- column default, so any insert that omits `status` fails the constraint.
--
-- Reset the default to a value that's actually allowed. We use 'active'
-- because the column is now legacy (lifecycle_stage + derived status drive
-- new logic) and 'active' is the safest value for any code path still
-- omitting status on insert.

alter table public.employees
  alter column status set default 'active';
