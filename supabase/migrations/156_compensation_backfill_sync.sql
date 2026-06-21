-- Compensation components — backfill existing allowances + keep allowance_idr
-- in sync (Phase 1 cont'd). Invisible to the app: it seeds one component per
-- existing contract and installs the trigger that maintains
-- contracts.allowance_idr = SUM(earning components). Values stay byte-identical
-- to before; no app code change ships with this migration.
--
-- Back-compat rule (locked 2026-06-21): allowance_idr := SUM(amount_idr) WHERE
-- kind='earning' across BOTH fixed and variable. NOT fixed-only — narrowing it
-- would silently lower the settlement floor -(base+allowance) and reduce
-- settled payouts (a behavioural break). A TRIGGER (not a Postgres GENERATED
-- column) is used deliberately so that SUM over zero rows writes NULL, which
-- preserves the existing "NULL = no allowance defined" vs "0 = zero allowance"
-- distinction that to_jsonb(c) and coalesce(allowance_idr,0) rely on.

-- ─── 1. Backfill one earning component per contract that has an allowance ────
-- Today's single allowance already means the broad/elastic bucket
-- (pkwtStarterDoc: "transport, meals and other tidak-tetap components"), so
-- is_fixed=false is the honest default; admins can split/rename it later.
-- allowance_idr = 0 also gets a (zero) line so the sum invariant holds exactly;
-- NULL allowances get NO row (they stay NULL).
--
-- The sync trigger does not exist yet (it is created in step 2 below), so this
-- INSERT does not fire it: contracts.allowance_idr is provably untouched here.
insert into public.contract_compensation_components
  (org_id, contract_id, name, kind, is_fixed, amount_idr, display_order)
select org_id, id, 'Tunjangan', 'earning', false, allowance_idr, 0
from public.contracts
where allowance_idr is not null;

-- ─── 2. Sync trigger: allowance_idr = SUM(earning components) ───────────────
create or replace function public.tg_contract_allowance_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract uuid := coalesce(new.contract_id, old.contract_id);
  v_sum      integer;
begin
  select sum(amount_idr) into v_sum
  from public.contract_compensation_components
  where contract_id = v_contract and kind = 'earning';

  -- v_sum is NULL when no earning rows remain — write NULL, do NOT coalesce to
  -- 0 (preserves "no allowance" vs "zero allowance"). Do NOT bump updated_at:
  -- the active-contract lookup (status='active' order by updated_at desc) must
  -- not silently reorder because a component was edited. The `is distinct from`
  -- guard avoids a no-op write (and avoids recursive/extra churn).
  update public.contracts
  set allowance_idr = v_sum
  where id = v_contract
    and allowance_idr is distinct from v_sum;

  return null; -- AFTER trigger: return value is ignored
end;
$$;

drop trigger if exists trg_contract_allowance_sync
  on public.contract_compensation_components;
create trigger trg_contract_allowance_sync
  after insert or update or delete on public.contract_compensation_components
  for each row execute function public.tg_contract_allowance_sync();

-- ─── 3. Drift assertion: allowance_idr == SUM(earning) for every contract ────
-- Self-contained invariant check. For contracts with a backfilled component the
-- single earning row equals the old allowance; for NULL-allowance contracts
-- there is no row so SUM() is NULL and `is distinct from` treats NULL=NULL as a
-- match. Any mismatch aborts the migration.
do $$
declare
  v_mismatch integer;
begin
  select count(*) into v_mismatch
  from public.contracts c
  where c.allowance_idr is distinct from (
    select sum(amount_idr)
    from public.contract_compensation_components
    where contract_id = c.id and kind = 'earning'
  );

  if v_mismatch <> 0 then
    raise exception
      'Compensation invariant violated: % contract(s) where allowance_idr <> SUM(earning components)',
      v_mismatch;
  end if;

  raise notice 'Compensation backfill OK: allowance_idr == SUM(earning components) for every contract.';
end;
$$;
