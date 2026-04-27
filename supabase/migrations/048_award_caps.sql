-- Per-award caps for credits and bonuses.
--
-- max_credit_per_award caps both directions of credit_adjustments.amount,
-- so managers can't massively award OR deduct in a single transaction.
-- max_bonus_idr caps the bonus_adjustments.amount_idr per award.
--
-- NULL means no cap (existing behavior). Validation is enforced at the
-- application layer for clear error messages; the CHECK constraints below
-- are belt-and-suspenders against direct SQL inserts that bypass the UI.

alter table public.organizations
  add column if not exists max_credit_per_award integer,
  add column if not exists max_bonus_idr integer;

alter table public.organizations
  drop constraint if exists organizations_max_credit_per_award_positive;
alter table public.organizations
  add constraint organizations_max_credit_per_award_positive
  check (max_credit_per_award is null or max_credit_per_award > 0);

alter table public.organizations
  drop constraint if exists organizations_max_bonus_idr_positive;
alter table public.organizations
  add constraint organizations_max_bonus_idr_positive
  check (max_bonus_idr is null or max_bonus_idr > 0);
