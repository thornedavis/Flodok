-- Capture *why* an employee separated (resignation vs. termination) alongside
-- the existing resign_date. Status is now derived (active/probation from dates,
-- separated from lifecycle_stage). The legacy `status` column stays for
-- backward compatibility with the existing Employees list filters; new code
-- should rely on lifecycle_stage + this column instead.

alter table public.employees
  add column separation_type text,
  add column separation_reason text;

alter table public.employees
  add constraint employees_separation_type_check check (
    separation_type is null or separation_type in ('resigned', 'terminated')
  );
