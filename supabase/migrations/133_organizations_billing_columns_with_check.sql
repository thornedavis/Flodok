-- Stop owner/admins from self-upgrading their plan or clearing billing state.
--
-- The organizations UPDATE policy ("Admins can update own org",
-- 016_role_enforcement.sql) has no WITH CHECK, so an authenticated owner/admin
-- could UPDATE their own org row to set plan_tier='pro', subscription_status=
-- 'active', clear past_due_since, bump subscription_quantity, etc. — unlocking
-- paid features and clearing dunning without ever touching Stripe. 064's own
-- comment flagged this ("RLS policies should be tightened later if needed").
--
-- These columns are written only by the Stripe webhook (billing edge function),
-- which uses the service-role key and BYPASSES RLS entirely — so pinning them
-- here constrains only authenticated admins, never the webhook. Admins can
-- still freely edit every non-billing column (name, settings, etc.).
--
-- The subqueries read the org's committed row under the existing SELECT policy;
-- during a self-UPDATE they return the pre-update values, so the check reduces
-- to "the billing columns must not change." New billing columns added in future
-- must be pinned here too.

drop policy if exists "Admins can update own org" on public.organizations;

create policy "Admins can update own org"
  on public.organizations for update
  using (
    id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin')
  )
  with check (
    id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin')
    and plan_tier is not distinct from
        (select o.plan_tier from public.organizations o where o.id = public.get_user_org_id())
    and subscription_status is not distinct from
        (select o.subscription_status from public.organizations o where o.id = public.get_user_org_id())
    and subscription_quantity is not distinct from
        (select o.subscription_quantity from public.organizations o where o.id = public.get_user_org_id())
    and current_period_end is not distinct from
        (select o.current_period_end from public.organizations o where o.id = public.get_user_org_id())
    and cancel_at_period_end is not distinct from
        (select o.cancel_at_period_end from public.organizations o where o.id = public.get_user_org_id())
    and past_due_since is not distinct from
        (select o.past_due_since from public.organizations o where o.id = public.get_user_org_id())
    and stripe_customer_id is not distinct from
        (select o.stripe_customer_id from public.organizations o where o.id = public.get_user_org_id())
    and stripe_subscription_id is not distinct from
        (select o.stripe_subscription_id from public.organizations o where o.id = public.get_user_org_id())
  );
