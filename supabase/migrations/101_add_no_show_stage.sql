-- Adds a `no_show` lifecycle stage for candidates who were scheduled for
-- a meeting (in-person or online) and didn't turn up. Terminal-ish state
-- that sits alongside `talent_pool` — a way to flag "ghosted" candidates
-- without losing the record entirely.

alter table public.employees
  drop constraint if exists employees_lifecycle_stage_check;

alter table public.employees
  add constraint employees_lifecycle_stage_check check (lifecycle_stage in (
    'prospective',
    'shortlisted',
    'offered',
    'signed',
    'active',
    'separated',
    'talent_pool',
    'no_show'
  ));
