-- Org-level master switches for the Credits and Bonuses features. Mirrors
-- organizations.badges_enabled (added in 046) — when an org turns either
-- one off, the corresponding UI surfaces hide everywhere (portal stat rows,
-- portal leaderboard, manager Performance controls). Existing data rows
-- are preserved untouched.
--
-- Cron evaluators are not filtered on these flags. Credits-based and
-- bonus-based achievements naturally don't fire when no new rows are being
-- inserted (because the UI is hidden), and existing rows continue to back
-- the badges UI / activity feed for orgs that re-enable later.

alter table public.organizations
  add column if not exists credits_enabled boolean not null default true,
  add column if not exists bonuses_enabled boolean not null default true;
