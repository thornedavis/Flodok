-- Daily purge of trashed employees / sops / contracts past the 30-day
-- retention window. Pattern matches the spotlight cron in 054 — idempotent
-- (drop existing job first), runs in-database, partial-index backed so the
-- steady-state cost is an empty index scan when nothing is due.
--
-- CASCADE on employee delete fans out to nested records (attachments,
-- family, emergency contacts, education, custom fields, badges, etc.) per
-- the existing FK definitions. sops/contracts that were "delete employee
-- only" had their employee_id FK rewritten to SET NULL in 102, so they
-- survive the cascade — they only get purged via their own deleted_at.
--
-- Storage objects (employee_attachments, KTP/KK photos) are NOT cleaned up
-- here yet. Flagged as a follow-up: needs an edge function comparing the
-- bucket listing against live employee_attachments rows after each purge.

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'trash-purge-employees') then
    perform cron.unschedule('trash-purge-employees');
  end if;
  if exists (select 1 from cron.job where jobname = 'trash-purge-sops') then
    perform cron.unschedule('trash-purge-sops');
  end if;
  if exists (select 1 from cron.job where jobname = 'trash-purge-contracts') then
    perform cron.unschedule('trash-purge-contracts');
  end if;
end $$;

-- 03:00 UTC daily — well outside business hours for APAC orgs which are the
-- primary user base today.
select cron.schedule(
  'trash-purge-sops',
  '0 3 * * *',
  $$
    delete from public.sops
    where deleted_at is not null
      and deleted_at < now() - interval '30 days';
  $$
);

select cron.schedule(
  'trash-purge-contracts',
  '0 3 * * *',
  $$
    delete from public.contracts
    where deleted_at is not null
      and deleted_at < now() - interval '30 days';
  $$
);

-- Employees last so any docs still pointing at them get SET NULL'd cleanly
-- before the row vanishes.
select cron.schedule(
  'trash-purge-employees',
  '0 3 * * *',
  $$
    delete from public.employees
    where deleted_at is not null
      and deleted_at < now() - interval '30 days';
  $$
);
