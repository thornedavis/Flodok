-- Allow multiple placeholder employees with a blank phone number.
--
-- `employees` was created (001) with `phone text not null` and a blanket
-- `unique (org_id, phone)` constraint (auto-named employees_org_id_phone_key).
--
-- The "Add employee" quick-create (Employees.tsx handleAddClick) inserts a
-- placeholder row before any phone is known. Because the column is NOT NULL it
-- writes phone = '' (empty string). The first quick-add succeeds; the moment a
-- blank-phone row exists, the NEXT quick-add tries to insert another
-- (org_id, '') pair and trips the unique constraint:
--
--   duplicate key value violates unique constraint "employees_org_id_phone_key"
--
-- Empty string is the codebase-wide "no phone yet" sentinel (the column is
-- non-null, and reads use `phone || ''` / completeness checks treat '' as
-- missing), so we keep the '' convention and instead teach the uniqueness rule
-- to ignore blanks: at most one employee per real phone number, but any number
-- of not-yet-filled placeholders. Same partial-index pattern as 169.
--
-- A plain table `unique(...)` constraint cannot be partial, so we drop it and
-- replace it with a partial unique index. The non-unique lookup index
-- idx_employees_phone (also from 001) is unaffected and stays.

alter table employees drop constraint if exists employees_org_id_phone_key;

create unique index if not exists employees_org_id_phone_unique
  on employees (org_id, phone)
  where phone <> '';
