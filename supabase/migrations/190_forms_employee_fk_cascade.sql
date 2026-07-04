-- Fix: form_submissions blocked the 30-day employee purge (ON DELETE RESTRICT).
--
-- form_submissions.employee_id was created (150) as
--   references public.employees(id) on delete restrict
-- — the only RESTRICT among all of employees' child tables (every other child
-- is CASCADE or SET NULL). Deleting an employee is a soft-delete, so RESTRICT
-- doesn't block the trash action; it defers the failure to PURGE time.
--
-- The purge cron (105) is a single bulk `delete from employees where deleted_at
-- < now()-30d`. Any trashed employee who ever filed a leave/overtime form has a
-- form_submissions row, so that DELETE raises a foreign-key violation and the
-- whole statement rolls back — no employees purged that night, silently, every
-- night, org-wide. Manual purge_item / empty_trash hit the same wall.
--
-- Form history should die with the employee (same as the pay/HR children:
-- pay_adjustments, pay_period_settlements, attachments, achievements, …), so
-- swap RESTRICT → CASCADE. form_submissions' own children (line-item detail,
-- leave ledger) already CASCADE off form_submissions, so they fan out cleanly.

alter table public.form_submissions
  drop constraint if exists form_submissions_employee_id_fkey;

alter table public.form_submissions
  add constraint form_submissions_employee_id_fkey
  foreign key (employee_id) references public.employees(id) on delete cascade;
