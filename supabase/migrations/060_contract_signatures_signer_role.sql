-- Extend contract_signatures to support employer (manager) signatures in
-- addition to employee signatures. Until now the table only ever held
-- employee signatures from the public portal — every existing row gets
-- backfilled as signer_role = 'employee'.
--
-- An employer signature has no employee_id (it's a user, not an employee),
-- so employee_id becomes nullable. A check constraint enforces that exactly
-- the right id column is populated for the role being recorded.

alter table public.contract_signatures
  add column if not exists signer_role text not null default 'employee'
    check (signer_role in ('employee', 'employer'));

alter table public.contract_signatures
  add column if not exists signer_user_id uuid references public.users on delete set null;

-- Manager's title at the time of signing (e.g. "Director"). Captured per
-- signature rather than pulled from the user profile because titles can
-- change over time and signed contracts must reflect what was rendered when
-- the contract was executed.
alter table public.contract_signatures
  add column if not exists signer_title text;

alter table public.contract_signatures
  alter column employee_id drop not null;

alter table public.contract_signatures
  drop constraint if exists contract_signatures_role_id_match;
alter table public.contract_signatures
  add constraint contract_signatures_role_id_match
  check (
    (signer_role = 'employee' and employee_id is not null and signer_user_id is null) or
    (signer_role = 'employer' and signer_user_id is not null and employee_id is null)
  );

create index if not exists idx_contract_signatures_signer_user
  on public.contract_signatures(signer_user_id);

-- Tighten RLS: the anon (employee portal) path must only ever create employee
-- rows; the authenticated (manager dashboard) path is the only way to record
-- an employer signature, and the inserted user_id must match the caller.
drop policy if exists "Public can insert contract signatures" on public.contract_signatures;
create policy "Public can insert employee contract signatures"
  on public.contract_signatures for insert
  to anon
  with check (signer_role = 'employee');

drop policy if exists "Authenticated can insert contract signatures" on public.contract_signatures;
create policy "Authenticated can insert contract signatures"
  on public.contract_signatures for insert
  to authenticated
  with check (
    -- Employee rows: any authenticated user in the org can record (rare but
    -- harmless — same surface as the existing permissive policy).
    (signer_role = 'employee'
      and contract_id in (select id from public.contracts where org_id = public.get_user_org_id()))
    or
    -- Employer rows: only the signing user themselves, in their own org.
    (signer_role = 'employer'
      and signer_user_id = auth.uid()
      and contract_id in (select id from public.contracts where org_id = public.get_user_org_id()))
  );
