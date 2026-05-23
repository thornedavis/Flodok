-- Extend trash system to cover three more top-level entities:
--   * hiring_requests
--   * spotlight_posts
--   * job_descriptions
--
-- Same shape as 102 — adds deleted_at + deleted_by + partial indexes for the
-- trash listing and the purge cron. RLS updates land in 107; RPC + cron
-- extensions in 108 and 109.
--
-- Note on job_descriptions: this table already has an `archived_at` column
-- used as a workflow state (an HR-published JD that's been retired from
-- active hiring). That's orthogonal to trash — `archived_at` survives the
-- soft-delete, and a restored JD comes back in whatever workflow state it
-- was in. The two concepts coexist deliberately.

-- ─── hiring_requests ────────────────────────────────────

alter table public.hiring_requests
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create index if not exists idx_hiring_requests_trash
  on public.hiring_requests (org_id, deleted_at desc)
  where deleted_at is not null;

create index if not exists idx_hiring_requests_deleted_at
  on public.hiring_requests (deleted_at)
  where deleted_at is not null;

-- ─── spotlight_posts ────────────────────────────────────

alter table public.spotlight_posts
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create index if not exists idx_spotlight_posts_trash
  on public.spotlight_posts (org_id, deleted_at desc)
  where deleted_at is not null;

create index if not exists idx_spotlight_posts_deleted_at
  on public.spotlight_posts (deleted_at)
  where deleted_at is not null;

-- ─── job_descriptions ───────────────────────────────────

alter table public.job_descriptions
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create index if not exists idx_job_descriptions_trash
  on public.job_descriptions (org_id, deleted_at desc)
  where deleted_at is not null;

create index if not exists idx_job_descriptions_deleted_at
  on public.job_descriptions (deleted_at)
  where deleted_at is not null;
