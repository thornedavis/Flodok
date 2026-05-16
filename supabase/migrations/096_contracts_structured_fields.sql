-- Contracts: promote modal-only inputs to real columns.
--
-- Before this migration, the "create contract" modal collected six values
-- that were never persisted (contract type, KTP, address, work location,
-- probation months, annual leave). Of those, KTP and address legitimately
-- belong on the linked employee record (and already resolve from there
-- via merge fields), and work location can stay on the document body for
-- now. But three of them are genuinely per-contract editable values that
-- belong as columns on the contracts row:
--
--   - contract_type ('pkwt' | 'pkwtt') determines the starter-doc shape
--     and whether the contract has an end date or a probation period.
--     Editable post-creation with a "regenerate boilerplate" confirm.
--   - annual_leave_days — different roles negotiate different terms.
--   - probation_months — PKWTT-only; standard is 3 months but seniority
--     and role can shift this.
--
-- The PKWT/PKWTT starter doc (pkwtStarterDoc.ts) is being updated in the
-- same change to reference these as merge fields instead of hard-coded
-- prose, so the values entered on the edit page resolve into the
-- rendered contract.

alter table public.contracts
  add column contract_type text not null default 'pkwt'
    check (contract_type in ('pkwt', 'pkwtt')),
  add column annual_leave_days integer default 12
    check (annual_leave_days is null or annual_leave_days >= 0),
  add column probation_months integer default 3
    check (probation_months is null or probation_months >= 0);

comment on column public.contracts.contract_type is
  'PKWT (fixed-term, PP 35/2021) or PKWTT (permanent, UU 13/2003 + UU Cipta Kerja). Drives starter-doc shape; flipping post-creation requires a body regenerate confirm.';

comment on column public.contracts.annual_leave_days is
  'Per-contract annual leave entitlement, in days. Default 12 matches the Indonesian statutory minimum.';

comment on column public.contracts.probation_months is
  'PKWTT-only probation period in months. Legal max is 3. Ignored for PKWT contracts.';

-- Mirror the same fields on document_templates so contract templates can
-- carry sensible defaults for the contracts they instantiate.
alter table public.document_templates
  add column contract_type text default 'pkwt'
    check (contract_type is null or contract_type in ('pkwt', 'pkwtt')),
  add column annual_leave_days integer
    check (annual_leave_days is null or annual_leave_days >= 0),
  add column probation_months integer
    check (probation_months is null or probation_months >= 0);
