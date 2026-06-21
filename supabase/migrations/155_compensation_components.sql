-- Compensation components — Phase 1 of the payroll initiative (PURELY ADDITIVE).
--
-- Splits the single contracts.allowance_idr into a typed, itemised, multi-line
-- model so contracts / payslips / the Talenta export can show named lines
-- (Meal, Transport, Service, ...) instead of one lumped number — WHILE keeping
-- contracts.allowance_idr alive as a derived "sum of earning components"
-- (maintained by the trigger added in migration 156). That keeps every existing
-- read path byte-for-byte unchanged: portal_documents' to_jsonb(c) emits the
-- same columns, the settlement engine still reads coalesce(allowance_idr,0),
-- the {{allowance_idr}} merge token still resolves, and frozen snapshots in
-- contract_versions / pay_period_settlements are untouched.
--
-- This migration adds ONE table and ONE nullable column. Nothing existing is
-- altered or dropped, and no app code reads the new objects yet. The backfill +
-- sync trigger land in migration 156; the payroll run that itemises a frozen
-- period (pay_period_settlement_lines) lands in the payroll-run phase, where its
-- shape is finalised against the run logic.
--
-- Design rules (locked 2026-06-21):
--   * kind in (earning | deduction | benefit). ONLY `earning` feeds allowance_idr.
--   * is_fixed (tunjangan tetap vs tidak tetap) is a LABEL ONLY — a Talenta
--     export / payslip hint. It never changes a Flodok-computed rupiah.
--   * amount_idr is always stored non-negative; `kind` carries the meaning.
--   * Flodok owns no tax math; deduction/benefit rows are display/export
--     metadata, not pay-engine inputs.

-- ─── 1. Per-contract compensation components ────────────────────────────────
create table if not exists public.contract_compensation_components (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  contract_id   uuid not null references public.contracts(id) on delete cascade,
  name          text not null,
  kind          text not null default 'earning'
                  check (kind in ('earning', 'deduction', 'benefit')),
  is_fixed      boolean not null default false,
  amount_idr    integer not null check (amount_idr >= 0),
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint contract_comp_name_len check (length(btrim(name)) >= 1)
);

create index if not exists contract_comp_components_contract_idx
  on public.contract_compensation_components (contract_id, display_order);
create index if not exists contract_comp_components_org_idx
  on public.contract_compensation_components (org_id);

alter table public.contract_compensation_components enable row level security;

-- Access mirrors the contracts table itself (009): any member of the owning org
-- can manage their org's contract components. These rows only itemise the
-- base/allowance numbers the contract row already exposes to the same audience,
-- so this introduces no new disclosure.
create policy "Members manage their org contract components"
  on public.contract_compensation_components
  for all
  using (org_id in (select org_id from public.users where id = auth.uid()))
  with check (org_id in (select org_id from public.users where id = auth.uid()));

comment on table public.contract_compensation_components is
  'Typed, itemised pay components for a contract (Meal/Transport/Service/...). '
  'Only kind=earning rows feed the derived contracts.allowance_idr (migration 156). '
  'is_fixed is a Talenta export/payslip label, never a Flodok calculation input.';

-- ─── 2. Version-snapshot parity ─────────────────────────────────────────────
-- Mirrors the 036 pattern: structured comp state is snapshotted onto the
-- version row at save time. NULL for pre-split versions — an honest "no
-- itemisation captured", never a fabricated breakdown.
alter table public.contract_versions
  add column if not exists compensation_components jsonb;

comment on column public.contract_versions.compensation_components is
  'Snapshot of the contract''s compensation component lines at this version. '
  'NULL for rows created before the component split existed.';
