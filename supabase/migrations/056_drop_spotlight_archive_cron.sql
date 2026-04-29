-- Drop the spotlight-archive-expired cron job.
--
-- Date-based auto-archive turned out to be unnecessary for v1: the natural
-- end-of-life for a Spotlight post is per-employee dismiss/acknowledge, plus
-- a manager-initiated archive when the post-wide lifecycle is over. The
-- effective_until column stays in the schema for now (unused, no destructive
-- migration), but the corresponding cron job is removed.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'spotlight-archive-expired') then
    perform cron.unschedule('spotlight-archive-expired');
  end if;
end $$;
