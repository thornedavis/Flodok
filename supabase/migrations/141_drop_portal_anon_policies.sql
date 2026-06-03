-- Portal RLS hardening — Stage D: THE LOCKDOWN.
--
-- ⚠️  APPLY THIS LAST — only AFTER the Stage B/C frontend (Portal.tsx +
--     CandidateOnboarding.tsx) is deployed. Until that frontend ships, the live
--     portal still reads these tables directly as anon; dropping the policies
--     first would break the live employee portal. Order: apply 137–140 →
--     deploy frontend → smoke-test the portal → THEN apply this migration.
--
-- After Stages A–C, Portal.tsx and CandidateOnboarding.tsx access all of these
-- tables exclusively through token-validating SECURITY DEFINER RPCs
-- (portal_documents / portal_feed / portal_document_versions / portal_sign_sop /
-- portal_sign_contract / portal_sign_jd / portal_update_onboarding_profile /
-- portal_get_employee / portal_advance_to_signed / portal_get_emergency_contact /
-- portal_upsert_emergency_contact) plus AFTER INSERT feed triggers. Those run as
-- the function owner and bypass RLS, so they keep working once the anon and
-- permissive-authenticated policies below are gone.
--
-- The manager app is unaffected: each table retains its authenticated,
-- org-scoped policy:
--   employees                  -> "Managers can CRUD employees in own org"
--   sop_signatures             -> "Managers can view signatures in own org"
--   contract_signatures        -> "Managers can view contract signatures in own org"
--                                 + "Authenticated can insert contract signatures" (employer countersign)
--   job_description_signatures -> "Managers can view JD signatures in own org"
--   feed_events                -> "Managers can manage feed events" (org-scoped, FOR ALL)

-- ─── employees: close the cross-tenant PII + access_token read ─────
drop policy if exists "Public can view employee by slug+token" on public.employees;

-- ─── sop_signatures: close anon read + the authenticated forge insert ─────
drop policy if exists "Public can view own signatures"      on public.sop_signatures;
drop policy if exists "Authenticated can insert signatures" on public.sop_signatures;

-- ─── contract_signatures: close anon read + anon employee-sign insert ─────
-- (Employer countersign via "Authenticated can insert contract signatures" stays.)
drop policy if exists "Public can view own contract signatures"        on public.contract_signatures;
drop policy if exists "Public can insert employee contract signatures" on public.contract_signatures;

-- ─── job_description_signatures: close anon read + anon/authenticated forge inserts ─────
drop policy if exists "Public can view own JD signatures"    on public.job_description_signatures;
drop policy if exists "Public can insert JD signatures"      on public.job_description_signatures;
drop policy if exists "Authenticated can insert JD signatures" on public.job_description_signatures;

-- ─── feed_events: close anon read+forge AND the cross-tenant authenticated
--     using(true)/check(true) policies. "Managers can manage feed events"
--     (FOR ALL, org-scoped) remains and covers authenticated reads/inserts;
--     signing feed events come from SECURITY DEFINER triggers. ─────
drop policy if exists "Public can view feed events"          on public.feed_events;
drop policy if exists "Authenticated can view feed events"   on public.feed_events;
drop policy if exists "Anon can insert feed events"          on public.feed_events;
drop policy if exists "Authenticated can insert feed events" on public.feed_events;
