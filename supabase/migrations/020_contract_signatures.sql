-- Contract signatures — mirrors sop_signatures so employees can sign the
-- current version of a contract from the employee portal, same UX as SOPs.

create table if not exists public.contract_signatures (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts on delete cascade,
  version_number integer not null,
  employee_id uuid not null references public.employees on delete cascade,
  typed_name text not null,
  signature_font text,
  signed_at timestamptz not null default now()
);

create index if not exists idx_contract_signatures_contract on public.contract_signatures(contract_id);
create index if not exists idx_contract_signatures_employee on public.contract_signatures(employee_id);

alter table public.contract_signatures enable row level security;

create policy "Managers can view contract signatures in own org"
  on public.contract_signatures for select
  using (
    contract_id in (select id from public.contracts where org_id = public.get_user_org_id())
  );

create policy "Public can insert contract signatures"
  on public.contract_signatures for insert
  to anon
  with check (true);

create policy "Public can view own contract signatures"
  on public.contract_signatures for select
  to anon
  using (true);

create policy "Authenticated can insert contract signatures"
  on public.contract_signatures for insert
  to authenticated
  with check (true);
