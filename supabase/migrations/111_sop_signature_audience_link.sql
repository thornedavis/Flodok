-- SOP signature acknowledgement under the audience model (Phase 1b).
--
-- Two small changes to public.sop_signatures so it can serve as the
-- per-employee, per-version acknowledgement record under the new
-- multi-target audience model introduced in 110_sop_audience.sql:
--
-- 1. UNIQUE(sop_id, employee_id, version_number) — a given employee
--    can only sign a given SOP version once. Existing data is empty so
--    no dedup backfill is needed.
--
-- 2. required_via text column — audit field recording WHICH audience
--    target made this employee a required signer (e.g. 'department',
--    'employee', 'everyone'). Nullable; the application reads null as
--    'employee' for backwards compatibility with the legacy 1:1 link.
--
-- "Required but not yet signed" is intentionally NOT materialised in
-- this table. It is computed on demand from sop_audience by an RPC
-- (added in a later migration) so audience changes never need to be
-- synced into pending signature rows.

alter table public.sop_signatures
  add column if not exists required_via text
  check (required_via is null or required_via in (
    'everyone', 'employee', 'department', 'branch',
    'job_position', 'job_level', 'employee_class'
  ));

create unique index if not exists sop_signatures_uq_employee_version
  on public.sop_signatures (sop_id, employee_id, version_number);

-- Lookup index for the admin "X of Y signed" panel against a given
-- SOP version. Existing select queries also benefit.
create index if not exists sop_signatures_sop_version_idx
  on public.sop_signatures (sop_id, version_number);
