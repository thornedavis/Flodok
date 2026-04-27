-- Achievements v1 — Schema additions
--
-- Structural changes needed before the v1 achievements feature can run.
-- Definitions data lives in 038.
--
-- This migration:
--   1. Adds employees.status (employment lifecycle)
--   2. Adds employees.last_notifications_seen_at (bell badge cursor)
--   3. Adds organizations.timezone (org-local cron + UI day boundaries)
--   4. Extends feed_events.event_type to include achievement_unlocked
--   5. Creates leaderboard_snapshots table for monthly historical rankings
--   6. Replaces achievement_unlocks unique constraint with a partial unique
--      index so manual achievements can be earned multiple times per employee


-- 1. Employee employment status -----------------------------------------------
-- Achievements only evaluate when status in ('trial','active'). The other states
-- exist so HR can mark employees out of scope without deleting their record.

alter table public.employees
  add column if not exists status text not null default 'trial';

alter table public.employees
  drop constraint if exists employees_status_check;
alter table public.employees
  add constraint employees_status_check
  check (status in ('trial', 'active', 'suspended', 'terminated', 'archived'));


-- 2. Notification cursor on employees -----------------------------------------
-- One column drives the unread-bell logic for informational notifications
-- (achievements, etc.). Actionable items like unsigned SOPs use their own
-- existing computed-pending-count mechanism and are unaffected.

alter table public.employees
  add column if not exists last_notifications_seen_at timestamptz;

update public.employees
  set last_notifications_seen_at = created_at
  where last_notifications_seen_at is null;


-- 3. Organization timezone ----------------------------------------------------
-- IANA timezone string used by the daily achievement cron to decide each org's
-- local "today", and by the manager dashboard to compute today's-milestones.
-- Default matches the existing +62 country code default and the WIB anchor
-- already used by current_period_month() in 027.

alter table public.organizations
  add column if not exists timezone text not null default 'Asia/Jakarta';


-- 4. feed_events event_type — add achievement_unlocked -----------------------
-- Single unified event log. Achievement unlocks insert a row here so they
-- surface in the activity tab and the bell-dropdown "Recent" section without
-- a parallel notifications table.

alter table public.feed_events
  drop constraint if exists feed_events_event_type_check;
alter table public.feed_events
  add constraint feed_events_event_type_check
  check (event_type in (
    'sop_signed', 'sop_updated', 'sop_assigned',
    'contract_assigned', 'contract_updated',
    'bonus_awarded',
    'welcome',
    'achievement_unlocked'
  ));


-- 5. Leaderboard snapshots ----------------------------------------------------
-- Monthly leaderboard rankings persisted as historical fact. The existing
-- portal_leaderboard() RPC computes rankings on the fly for live display;
-- snapshots are the source of truth for historical achievements (Podium,
-- Number One, Reigning Champion) and for the manager calendar view.
--
-- Snapshots are immutable once written. Backdated credit_adjustments do not
-- reshuffle past months — they only affect current and all-time rankings.

create table if not exists public.leaderboard_snapshots (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  period_type   text not null,
  period_start  date not null,
  period_end    date not null,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  rank          integer not null,
  score         numeric not null,
  created_at    timestamptz not null default now(),
  constraint leaderboard_snapshots_period_type
    check (period_type in ('month')),
  constraint leaderboard_snapshots_period_end_after_start
    check (period_end >= period_start),
  constraint leaderboard_snapshots_rank_positive
    check (rank >= 1),
  constraint leaderboard_snapshots_unique
    unique (org_id, period_type, period_start, employee_id)
);

create index if not exists leaderboard_snapshots_org_period_idx
  on public.leaderboard_snapshots (org_id, period_type, period_start);

create index if not exists leaderboard_snapshots_employee_idx
  on public.leaderboard_snapshots (employee_id);

alter table public.leaderboard_snapshots enable row level security;

create policy "Members read leaderboard snapshots in own org"
  on public.leaderboard_snapshots for select
  using (org_id = public.get_user_org_id());

create policy "Public can view leaderboard snapshots"
  on public.leaderboard_snapshots for select
  to anon
  using (true);

create policy "Admins insert leaderboard snapshots in own org"
  on public.leaderboard_snapshots for insert
  with check (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin')
  );

-- No update or delete policies — snapshots are append-only by RLS.
-- The monthly cron runs as service role, bypassing RLS.


-- 6. Achievement unlocks — allow repeats for manual awards --------------------
-- Drop the blanket unique constraint and replace with a partial unique index
-- that only enforces uniqueness when awarded_by IS NULL (i.e. for automated
-- unlocks). Manual awards (awarded_by NOT NULL) can repeat freely so a great
-- employee can earn Customer Praise multiple times.

alter table public.achievement_unlocks
  drop constraint if exists achievement_unlocks_unique;

create unique index if not exists achievement_unlocks_automated_unique
  on public.achievement_unlocks (employee_id, achievement_id)
  where awarded_by is null;
