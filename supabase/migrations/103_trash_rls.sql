-- Trash system RLS: exclude soft-deleted rows from every normal-access policy.
--
-- The trash UI reads via SECURITY DEFINER RPCs (next migration), so we don't
-- need a separate "view trash" policy here — RLS just becomes the safety net
-- that ensures trashed rows never leak into routine queries.

-- ─── employees ──────────────────────────────────────────

drop policy if exists "Managers can CRUD employees in own org" on public.employees;
create policy "Managers can CRUD employees in own org"
  on public.employees for all
  using (org_id = public.get_user_org_id() and deleted_at is null)
  with check (org_id = public.get_user_org_id());

drop policy if exists "Public can view employee by slug+token" on public.employees;
create policy "Public can view employee by slug+token"
  on public.employees for select
  to anon
  using (deleted_at is null);

-- ─── sops ───────────────────────────────────────────────

drop policy if exists "Managers can CRUD SOPs in own org" on public.sops;
create policy "Managers can CRUD SOPs in own org"
  on public.sops for all
  using (org_id = public.get_user_org_id() and deleted_at is null)
  with check (org_id = public.get_user_org_id());

drop policy if exists "Public can view active SOPs" on public.sops;
create policy "Public can view active SOPs"
  on public.sops for select
  to anon
  using (status = 'active' and deleted_at is null);

-- ─── contracts ──────────────────────────────────────────

drop policy if exists "Managers can manage their org contracts" on public.contracts;
create policy "Managers can manage their org contracts"
  on public.contracts for all
  using (
    org_id in (select org_id from public.users where id = auth.uid())
    and deleted_at is null
  )
  with check (
    org_id in (select org_id from public.users where id = auth.uid())
  );
