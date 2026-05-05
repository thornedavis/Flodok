-- Branches are now owned by public.company_branches (migration 076).
-- The 'branch' kind in company_reference_values is leftover from the 075 seed
-- and is no longer read or written by the app. Drop the rows and tighten the
-- CHECK constraint so nothing can write that kind again.

delete from public.company_reference_values where kind = 'branch';

alter table public.company_reference_values
  drop constraint if exists company_reference_values_kind_check;

alter table public.company_reference_values
  add constraint company_reference_values_kind_check check (kind in (
    'department',
    'job_position',
    'job_level',
    'employee_class'
  ));
