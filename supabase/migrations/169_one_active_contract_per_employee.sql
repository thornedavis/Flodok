-- Guarantee exactly one active contract per employee (pre-onboarding hardening).
--
-- Compensation (base_wage_idr, allowance_idr + the itemised components that sum
-- into it via the 156 trigger) is read straight off the employee's ACTIVE
-- contract by the payroll engine, leave accrual, the portal and the dashboards
-- — every one of them via `where status='active' ... order by updated_at desc
-- limit 1` (144, 152, 154, 158, 161, 126, …).
--
-- Nothing today stops an employee from having TWO active contracts at once:
-- issue a new one for a raise/promotion (a new row — createBlankContract /
-- Recruitment / from-template), forget to retire the old, and both stay
-- status='active'. When that happens:
--   * payroll silently pays whichever was *edited* most recently (updated_at),
--     so fixing a typo on the OLD contract hijacks pay back to the old figure;
--   * the Overview total double-counts (it SUMs every active contract);
--   * the employee page only renders the single limit-1 row, so the orphan is
--     invisible until the numbers fail to reconcile.
--
-- Fixed in two layers, both server-side so they also hold for SECURITY DEFINER /
-- service-role / edge writes (cf. the 168 rationale):
--
--   1. A trigger so ACTIVATING a contract auto-supersedes (archives) the
--      employee's other active contracts — the "issue a new contract, the old
--      one steps down" behaviour, with no manual termination step to forget.
--   2. A partial unique index as the hard backstop: at most one active,
--      non-deleted, non-template contract per employee. With this in place every
--      `status='active' ... limit 1` lookup is unambiguous regardless of its
--      order-by, so no existing query site has to change.
--
-- Note: this is contract-ROW supersession, distinct from the version-level
-- supersede in 168 (which bumps current_version within a single row).

-- ── Backfill: collapse any pre-existing duplicate actives ────────────────────
-- The unique index can't be created while duplicates exist. Keep the most
-- recent active contract per employee (latest start_date, then latest
-- created_at) and archive the rest. No-op on clean data.
with ranked as (
  select id,
         row_number() over (
           partition by employee_id
           order by start_date desc nulls last, created_at desc
         ) as rn
  from public.contracts
  where status = 'active'
    and deleted_at is null
    and coalesce(is_template, false) = false
    and employee_id is not null
)
update public.contracts c
   set status = 'archived', updated_at = now()
  from ranked r
 where c.id = r.id
   and r.rn > 1;

-- ── Layer 1: auto-supersede on activation ────────────────────────────────────
-- When a contract becomes active, archive the employee's other active contracts.
-- The sibling update only touches `status`, which 168's tg_lock_signed_live
-- explicitly permits even on signed rows, and sets status='archived' (not
-- 'active'), so this trigger does not re-enter itself.
create or replace function public.tg_supersede_active_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active'
     and new.employee_id is not null
     and new.deleted_at is null
     and coalesce(new.is_template, false) = false
  then
    update public.contracts
       set status = 'archived', updated_at = now()
     where employee_id = new.employee_id
       and id <> new.id
       and status = 'active'
       and deleted_at is null
       and coalesce(is_template, false) = false;
  end if;
  return new;
end;
$$;

-- BEFORE, so the sibling archive lands within the same statement and ahead of
-- the unique-index check on the row being activated. Covers both the
-- create-draft-then-activate path and any direct insert of an active contract.
drop trigger if exists trg_supersede_active_contract on public.contracts;
create trigger trg_supersede_active_contract
  before insert or update on public.contracts
  for each row execute function public.tg_supersede_active_contract();

-- ── Layer 2: hard backstop ───────────────────────────────────────────────────
-- At most one active, live, non-template contract per employee. Drafts
-- (status<>'active'), trashed (deleted_at), templates (is_template) and
-- unassigned drafts (employee_id null) are all exempt.
create unique index if not exists contracts_one_active_per_employee
  on public.contracts (employee_id)
  where status = 'active'
    and deleted_at is null
    and coalesce(is_template, false) = false
    and employee_id is not null;
