-- Restrict contract pay visibility to owner/admin/hr.
--
-- The contracts policy (recreated in 103) and the contract_versions policy (009)
-- were scoped by org only, so any 'member' could read base_wage_idr /
-- allowance_idr off the live contract row (e.g. the inbox's select('*'), or by
-- navigating to a contract URL — the routes aren't role-gated, RLS is the only
-- gate). Migration 036 also snapshots those wage fields onto contract_versions,
-- so the history row leaks them too. M4 already locked the itemised components;
-- this closes the lumped numbers.
--
-- Payroll/settlement and the employee portal read contracts through SECURITY
-- DEFINER functions (158/144/137/152), which bypass RLS, so they are unaffected.

drop policy if exists "Managers can manage their org contracts" on public.contracts;
create policy "Admins manage their org contracts"
  on public.contracts for all
  using (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin', 'hr')
    and deleted_at is null
  )
  with check (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin', 'hr')
  );

drop policy if exists "Managers can manage their org contract versions" on public.contract_versions;
create policy "Admins manage their org contract versions"
  on public.contract_versions for all
  using (
    contract_id in (select id from public.contracts where org_id = public.get_user_org_id())
    and public.get_user_role() in ('owner', 'admin', 'hr')
  )
  with check (
    contract_id in (select id from public.contracts where org_id = public.get_user_org_id())
    and public.get_user_role() in ('owner', 'admin', 'hr')
  );
