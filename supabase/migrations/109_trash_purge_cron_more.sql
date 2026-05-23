-- Daily purge of trashed hiring_requests / spotlight_posts / job_descriptions
-- past the 30-day retention window. Mirrors 105 for the original three
-- tables — idempotent reschedule, partial-index backed, runs at 03:00 UTC.

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'trash-purge-hiring-requests') then
    perform cron.unschedule('trash-purge-hiring-requests');
  end if;
  if exists (select 1 from cron.job where jobname = 'trash-purge-spotlight-posts') then
    perform cron.unschedule('trash-purge-spotlight-posts');
  end if;
  if exists (select 1 from cron.job where jobname = 'trash-purge-job-descriptions') then
    perform cron.unschedule('trash-purge-job-descriptions');
  end if;
end $$;

select cron.schedule(
  'trash-purge-hiring-requests',
  '0 3 * * *',
  $$
    delete from public.hiring_requests
    where deleted_at is not null
      and deleted_at < now() - interval '30 days';
  $$
);

select cron.schedule(
  'trash-purge-spotlight-posts',
  '0 3 * * *',
  $$
    delete from public.spotlight_posts
    where deleted_at is not null
      and deleted_at < now() - interval '30 days';
  $$
);

select cron.schedule(
  'trash-purge-job-descriptions',
  '0 3 * * *',
  $$
    delete from public.job_descriptions
    where deleted_at is not null
      and deleted_at < now() - interval '30 days';
  $$
);
