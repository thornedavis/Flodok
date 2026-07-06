-- Phase 4 (Fireflies tasks): crash-recoverable meeting claim.
--
-- Today claimMeeting inserts processed_meetings with status 'ok' BEFORE the
-- worker processes the transcript (index.ts → dedup-claim). If processing then
-- throws (LLM hiccup, Supabase blip, poison transcript), the row stays claimed
-- and the meeting is NEVER retried — a silent loss. And because the webhook
-- already returned 200, Fireflies never redelivers; the only retry path is the
-- */5 cron poll (runPollForOrg), which re-scans recent transcripts and claims
-- any it hasn't seen.
--
-- Fix: make the claim STATEFUL. Claim marks 'processing'; the worker marks the
-- outcome ('done' on success, else 'failed' or — once attempts are exhausted —
-- 'poison'). The poll can re-claim a 'failed' row under the attempt cap, so a
-- transient failure gets a bounded number of retries instead of vanishing. The
-- per-item idempotency (pending_tasks unique key, migration 207) is what makes
-- reprocessing safe: a retried meeting re-POSTs tasks that dedup on conflict.
--
-- This affects ALL worker processing (SOP updates too), not just tasks.

-- 1. Schema: attempts counter + widened status set ----------------------------

alter table public.processed_meetings
  add column if not exists attempts int not null default 0;

-- Keep the legacy values ('ok' = already-processed rows from before this change,
-- treated as terminal/non-claimable) and add the lifecycle states.
alter table public.processed_meetings
  drop constraint if exists processed_meetings_status_check;
alter table public.processed_meetings
  add constraint processed_meetings_status_check
  check (status in ('ok','error','skipped','processing','done','failed','poison'));

-- 2. claim_meeting: atomic claim-or-revive ------------------------------------
-- Returns true iff this call may process the meeting: either it's brand new, or
-- it's re-claimable under the attempt cap — a 'failed' row, OR a 'processing'
-- row that's been stuck > 15 min (the worker was evicted mid-waitUntil or the
-- mark_meeting call never landed, so it never reached 'done'/'failed'). Both
-- revive to 'processing' and bump attempts. One statement, so a concurrent
-- webhook+poll can't both win. A 'done'/'ok'/'poison' row is never re-claimed,
-- and a freshly-'processing' row (< 15 min) is left alone so a normal in-flight
-- run isn't double-processed. 15 min is far beyond real processing time (a
-- transcript + two LLM calls), and the poll only fires every 5 min.

create or replace function public.claim_meeting(
  p_org uuid,
  p_provider text,
  p_external_id text,
  p_max_attempts int
) returns boolean
language plpgsql
as $$
begin
  insert into public.processed_meetings (org_id, provider, external_id, status, attempts, processed_at)
  values (p_org, p_provider, p_external_id, 'processing', 1, now())
  on conflict (org_id, provider, external_id) do update
    set status       = 'processing',
        attempts     = public.processed_meetings.attempts + 1,
        processed_at = now()
    where public.processed_meetings.attempts < p_max_attempts
      and (
        public.processed_meetings.status = 'failed'
        or (
          public.processed_meetings.status = 'processing'
          and public.processed_meetings.processed_at < now() - interval '15 minutes'
        )
      );
  return found;  -- true if a row was inserted or revived; false if the conflict was suppressed
end;
$$;

-- 3. mark_meeting: record the processing outcome ------------------------------
-- success → 'done'; failure → 'poison' once attempts are exhausted, else
-- 'failed' (leaving it eligible for the poll to retry).

create or replace function public.mark_meeting(
  p_org uuid,
  p_provider text,
  p_external_id text,
  p_success boolean,
  p_max_attempts int
) returns void
language plpgsql
as $$
begin
  update public.processed_meetings
  set status = case
                 when p_success then 'done'
                 when attempts >= p_max_attempts then 'poison'
                 else 'failed'
               end,
      processed_at = now()
  where org_id = p_org and provider = p_provider and external_id = p_external_id;
end;
$$;

grant execute on function public.claim_meeting(uuid, text, text, int) to service_role;
grant execute on function public.mark_meeting(uuid, text, text, boolean, int) to service_role;
