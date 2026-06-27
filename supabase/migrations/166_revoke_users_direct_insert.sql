-- H2: route ALL users-row creation through the SECURITY DEFINER signup path
-- (the handle_new_user trigger + the handle_signup recovery primitive, both in
-- migration 164) by removing direct INSERT on public.users.
--
-- The only INSERT policy was "Authenticated users can insert own user record"
-- with check (id = auth.uid()) — it pinned the row id but placed NO constraint
-- on org_id or role. An authenticated session that has no users row yet (the
-- reachable orphan state) could therefore POST a users row into an ARBITRARY
-- org as role='owner' and gain full cross-tenant access. Revoking the privilege
-- closes it. The SECURITY DEFINER signup functions run as the table owner, so
-- they are unaffected and remain the only way a users row is created.
--
-- ORDERING: this MUST apply AFTER migration 164 (the trigger/handle_signup must
-- already be the provisioning path before direct INSERT is removed). The
-- on-disk numbering (164 < 166) guarantees apply order.

revoke insert on public.users from authenticated, anon;

drop policy if exists "Authenticated users can insert own user record" on public.users;
