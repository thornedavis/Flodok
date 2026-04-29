-- Spotlight cron: auto-publish scheduled posts and auto-archive expired ones.
--
-- Enables pg_cron (idempotent) and schedules two minute-level jobs. Both
-- queries are index-backed and only touch the small set of rows in
-- transitional states, so steady-state cost is near-zero — the no-op case
-- is an empty index scan returning nothing. Runs entirely in-database, so
-- no egress is consumed by the cron itself.
--
-- Publish: flipping status to 'published' fires trg_spotlight_fanout, which
-- stamps published_at and writes feed_events for every targeted employee.
-- Archive: only fires for posts that explicitly set effective_until.

create extension if not exists pg_cron;

-- Idempotent: drop existing jobs of the same name before re-scheduling so
-- this migration can be re-applied without duplicating jobs.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'spotlight-publish-due') then
    perform cron.unschedule('spotlight-publish-due');
  end if;
  if exists (select 1 from cron.job where jobname = 'spotlight-archive-expired') then
    perform cron.unschedule('spotlight-archive-expired');
  end if;
end $$;

select cron.schedule(
  'spotlight-publish-due',
  '* * * * *',
  $$
    update public.spotlight_posts
    set status = 'published'
    where status = 'scheduled'
      and effective_from is not null
      and effective_from <= now();
  $$
);

select cron.schedule(
  'spotlight-archive-expired',
  '* * * * *',
  $$
    update public.spotlight_posts
    set status = 'archived'
    where status = 'published'
      and effective_until is not null
      and effective_until <= now();
  $$
);
