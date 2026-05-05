-- Adds a `shortlisted` lifecycle stage for candidates who have been
-- internally approved by an interviewer but are awaiting final sign-off
-- from a higher-up before an offer is extended. Sits between `prospective`
-- and `offered` in the hiring funnel.

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
    'talent_pool'
  ));
