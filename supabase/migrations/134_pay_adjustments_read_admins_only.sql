-- Restrict pay-adjustment reads to owner/admin.
--
-- 126's SELECT policy allowed ('owner','admin','manager'), but the INSERT
-- policy and the admin_rewards_roster RPC are both owner/admin only — and
-- 'manager' is the default role assigned to every new/invited user. So any
-- ordinary member could `select * from pay_adjustments` directly and read
-- every colleague's exact reward/penalty rupiah and free-text reasons (the UI
-- gating is cosmetic against a direct PostgREST call).
--
-- The pay UI (CompensationOverview / EmployeeActivityLog / Performance) is
-- owner/admin only, and employees read their OWN pay through the token-scoped
-- portal_home RPC (SECURITY DEFINER, unaffected by this policy) — so dropping
-- the third role from the table read aligns with the rest of the feature and
-- closes the cross-employee pay leak.

drop policy if exists "Members read pay adjustments in own org" on public.pay_adjustments;

create policy "Admins read pay adjustments in own org"
  on public.pay_adjustments for select
  using (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin')
  );
