-- Candidate provenance: link each employee row to the JD they applied for
-- and the channel they came in through. Closes the audit trail from
-- hiring_request → job_description → employee that Phases B and C set up.
--
-- All three columns are nullable — historical employees won't have any of
-- this filled in, and the data only becomes meaningful for candidates
-- created from Phase D's intake form onward. No backfill.
--
-- source_request_id is intentionally derived from the JD's hiring_request_id
-- at intake time rather than asked of HR separately — the candidate
-- applies for a JD, the JD knows which request spawned it. We store the
-- derived value here so the audit chain doesn't break if the JD's link
-- ever gets cleared.

alter table public.employees
  add column if not exists source text
    check (source in ('jobseek', 'indeed', 'linkedin', 'referral', 'direct', 'other'));

alter table public.employees
  add column if not exists source_request_id uuid
    references public.hiring_requests(id) on delete set null;

alter table public.employees
  add column if not exists applied_for_jd_id uuid
    references public.job_descriptions(id) on delete set null;

-- Index supports the "candidates from this request/JD" lookup that the
-- detail pages will eventually do. Partial so we don't bloat the index
-- with the rows that have neither column set (i.e. existing employees).
create index if not exists idx_employees_applied_for_jd
  on public.employees (applied_for_jd_id)
  where applied_for_jd_id is not null;

create index if not exists idx_employees_source_request
  on public.employees (source_request_id)
  where source_request_id is not null;

comment on column public.employees.source is
  'Channel the candidate came in through. Free-form across orgs; this set covers the common cases.';

comment on column public.employees.source_request_id is
  'The hiring_request that spawned the JD this candidate applied for. Derived at intake from applied_for_jd_id → hiring_requests; stored explicitly so the link survives JD edits.';

comment on column public.employees.applied_for_jd_id is
  'The job_description this candidate applied for. Drives intake form auto-fill (position, department) and Phase E JD-signing at onboarding.';
