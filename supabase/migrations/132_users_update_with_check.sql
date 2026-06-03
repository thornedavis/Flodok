-- Close the users self-privilege-escalation hole.
--
-- The only UPDATE policy on public.users (001_initial_schema.sql) had no
-- WITH CHECK. Per Postgres, an omitted WITH CHECK defaults to the USING
-- expression (id = auth.uid()), so any authenticated user could UPDATE their
-- own row to role='owner' (vertical escalation) or change org_id (cross-tenant
-- move) via a direct PostgREST call, bypassing the admin_update_user_role /
-- transfer_ownership RPCs entirely.
--
-- No client code updates the users table directly — all mutations go through
-- SECURITY DEFINER RPCs, which run as the function owner and are unaffected by
-- this policy — so pinning role + org_id to their current values breaks nothing.
--
-- get_user_role() / get_user_org_id() are SECURITY DEFINER + STABLE and read
-- the caller's committed row (bypassing RLS, so no policy recursion). During a
-- self-UPDATE they return the pre-update values (the in-progress new tuple is
-- not visible to a same-statement read), so the check reduces to "role and
-- org_id must not change."

drop policy if exists "Managers can update own profile" on public.users;

create policy "Managers can update own profile"
  on public.users for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = public.get_user_role()
    and org_id = public.get_user_org_id()
  );
