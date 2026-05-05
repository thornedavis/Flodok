-- Adds a lifecycle_stage to employees so candidates / separated employees
-- can live in the same table as active employees, surfaced through different
-- views (Hiring vs. Employees) instead of a separate database.
--
-- Stages:
--   prospective  -- met them, no decision yet
--   offered      -- decided yes, contract pending or sent
--   signed       -- contract signed, start_date in the future
--   active       -- currently employed
--   separated    -- resigned or terminated
--   talent_pool  -- declined now, worth keeping in touch with

alter table public.employees
  add column lifecycle_stage text not null default 'active';

alter table public.employees
  add constraint employees_lifecycle_stage_check check (lifecycle_stage in (
    'prospective',
    'offered',
    'signed',
    'active',
    'separated',
    'talent_pool'
  ));

create index employees_lifecycle_stage_idx on public.employees (org_id, lifecycle_stage);
