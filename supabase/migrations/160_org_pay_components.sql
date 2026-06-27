-- Per-org Pay Components catalog — Phase 7 (Talenta export foundation).
--
-- Each org defines its own pay components here (Talenta has no global list —
-- components are admin-typed free-text, confirmed by research). This catalog is
-- the hub: it names the org's earnings/deductions, carries the EXACT label to
-- emit in Talenta's import ("Component Name"), and tracks whether each one has
-- been mirrored into the org's Talenta yet. The export only emits rows whose
-- component is talenta_confirmed (and whose employee has an employee_code), so a
-- generated file never contains a row Talenta would reject.
--
-- Talenta's model is "three fixed buckets (Allowance/Deduction/Benefit) + admin-
-- named free-text line items"; we mirror it with kind + a free-text name, plus a
-- category to group them and route adjustments. taxable_hint is informational
-- only (a reminder for the org's Talenta setup) — Flodok never computes tax.

create table if not exists public.org_pay_components (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  name             text not null,
  kind             text not null check (kind in ('earning', 'deduction', 'benefit')),
  category         text not null default 'allowance'
                     check (category in ('base', 'allowance', 'bonus', 'overtime', 'penalty', 'unpaid_leave', 'other')),
  -- Exact Talenta "Component Name" to export. NULL → use `name` verbatim.
  talenta_name     text,
  -- Mirror state: has this component been created in the org's Talenta with the
  -- matching name? The export only includes confirmed components.
  talenta_confirmed boolean not null default false,
  -- Default fixed (tunjangan tetap) vs variable when added to a contract.
  is_fixed_default boolean not null default false,
  -- Informational reminder for Talenta setup; NOT a Flodok calculation input.
  taxable_hint     boolean not null default true,
  sort_order       integer not null default 0,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint org_pay_components_name_len check (length(btrim(name)) >= 1),
  unique (org_id, name)
);

create index if not exists org_pay_components_org_idx
  on public.org_pay_components (org_id, sort_order);

alter table public.org_pay_components enable row level security;

-- Payroll config is sensitive: owner/admin in the owning org manage it.
create policy "Admins manage pay components in own org"
  on public.org_pay_components
  for all
  using (org_id = public.get_user_org_id() and public.get_user_role() in ('owner', 'admin'))
  with check (org_id = public.get_user_org_id() and public.get_user_role() in ('owner', 'admin'));

comment on table public.org_pay_components is
  'Per-org catalog of pay components (Talenta-style free-text line items). Names + '
  'talenta_name drive the Talenta export; talenta_confirmed gates export-eligibility.';

-- ─── Seed helper (idempotent, per-org) ──────────────────────────────────────
-- A sensible Indonesian starter set. Doubles as the "set these up in Talenta"
-- checklist. No-op if the org already has any components.
create or replace function public._seed_pay_components_for_org(p_org uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if exists (select 1 from public.org_pay_components where org_id = p_org) then
    return 0;
  end if;

  insert into public.org_pay_components (org_id, name, kind, category, is_fixed_default, taxable_hint, sort_order)
  values
    (p_org, 'Gaji Pokok',                 'earning',   'base',         true,  true, 0),
    (p_org, 'Tunjangan Tetap',            'earning',   'allowance',    true,  true, 10),
    (p_org, 'Tunjangan Transport',        'earning',   'allowance',    false, true, 20),
    (p_org, 'Tunjangan Makan',            'earning',   'allowance',    false, true, 30),
    (p_org, 'Bonus',                      'earning',   'bonus',        false, true, 40),
    (p_org, 'Tunjangan Hari Raya (THR)',  'earning',   'bonus',        false, true, 50),
    (p_org, 'Lembur',                     'earning',   'overtime',     false, true, 60),
    (p_org, 'Potongan',                   'deduction', 'penalty',      false, true, 70),
    (p_org, 'Potongan Cuti Tanpa Gaji',   'deduction', 'unpaid_leave', false, true, 80);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public._seed_pay_components_for_org(uuid) from public, anon, authenticated;

-- Caller-facing seed: owner/admin seeds their own org (for new orgs / lazy seed).
create or replace function public.seed_default_pay_components()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  caller_org  uuid;
begin
  select role, org_id into caller_role, caller_org from public.users where id = auth.uid();
  if caller_role not in ('owner', 'admin') then
    raise exception 'Not authorized';
  end if;
  return public._seed_pay_components_for_org(caller_org);
end;
$$;

revoke all on function public.seed_default_pay_components() from public, anon;
grant execute on function public.seed_default_pay_components() to authenticated;

-- Backfill: seed every existing org that has no components yet.
do $$
declare
  o record;
begin
  for o in select id from public.organizations loop
    perform public._seed_pay_components_for_org(o.id);
  end loop;
end;
$$;
