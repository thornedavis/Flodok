-- First-run onboarding gate.
--
-- A single nullable timestamp on organizations drives whether a freshly
-- provisioned org is routed into the full-screen setup wizard or straight to
-- the dashboard. App.tsx checks it in the same place it already self-heals
-- orphans (session && user): null -> /onboarding, set -> dashboard.
--
-- It is stamped when the owner (or on-behalf admin) reaches the end of the
-- wizard OR explicitly skips, so the wizard is a guide, not a gate. Deriving
-- completion from "is org.name still the auto-generated value" is ambiguous
-- (the trigger writes a real string), so we track it explicitly. Nullable, no
-- backfill: every existing org reads as null and would see the wizard once —
-- acceptable, but we backfill existing orgs to "completed" so only genuinely
-- new signups get it.

alter table public.organizations
  add column if not exists onboarding_completed_at timestamptz;

-- Existing orgs predate onboarding; treat them as already set up so they are
-- never bounced into the wizard.
update public.organizations
  set onboarding_completed_at = coalesce(onboarding_completed_at, created_at)
  where onboarding_completed_at is null;
