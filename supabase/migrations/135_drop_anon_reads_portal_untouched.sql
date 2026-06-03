-- Drop cross-tenant anon reads on tables the portal never reads directly.
--
-- These four anon `using (true)` SELECT policies let any holder of the public
-- anon key read every org's rows. The portal does NOT read any of these tables
-- directly: leaderboard data is served through the SECURITY DEFINER
-- portal_leaderboard RPC (which bypasses RLS), and categories/tags are
-- manager-app-only. The manager app keeps its authenticated access via the
-- existing org-scoped policies that remain in place:
--   sop_categories        -> "Managers can CRUD categories in own org"  (FOR ALL)
--   tags / sop_tags        -> "Managers can CRUD ... in own org"          (FOR ALL)
--   leaderboard_snapshots  -> "Members read leaderboard snapshots in own org"
-- so dropping the anon policies closes the cross-tenant leak with no portal or
-- manager-app impact. leaderboard_snapshots is the sensitive one — since the
-- 126 rework its scores are derived from monthly pay.
--
-- This is the standalone, portal-safe slice of the broader anon-RLS cleanup.
-- The employees / sop(_versions) / signature / feed_events anon policies are
-- still relied on by Portal.tsx + CandidateOnboarding.tsx and will be dropped
-- only after those flows are moved onto token-validating RPCs.

drop policy if exists "Public can view categories"            on public.sop_categories;
drop policy if exists "Public can view tags"                  on public.tags;
drop policy if exists "Public can view sop_tags"              on public.sop_tags;
drop policy if exists "Public can view leaderboard snapshots" on public.leaderboard_snapshots;
