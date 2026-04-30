-- Capture contract effective range as structured columns. Until now the
-- start/end dates were collected in the create-contract modal but only
-- woven into the markdown body — the row itself had no date fields, so
-- nothing else in the system could reason about contract effectivity.
--
-- start_date is required-ish (every contract has an effective start);
-- end_date is null for permanent (PKWTT) contracts and set for fixed-term
-- (PKWT) contracts. Both nullable to allow backfill of historical rows.

alter table public.contracts
  add column if not exists start_date date,
  add column if not exists end_date date;

-- Backfill existing rows with a sensible default so {{contract_start_date}}
-- continues to render. created_at is the closest proxy we have for "when
-- this contract was put into effect".
update public.contracts
set start_date = created_at::date
where start_date is null;
