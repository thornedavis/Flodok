-- Job-description assignee.
--
-- A JD describes a role, but HR often wants to record who currently holds
-- (or is being onboarded into) that role — e.g. to surface the JD on an
-- employee's portal, or to track which role doc applies to whom. This adds
-- an optional employee link to the live JD and to its version snapshots.
--
-- Nullable + `on delete set null`: a JD without an assignee is the normal
-- case (role exists before the hire), and deleting an employee should not
-- cascade-delete role documentation.

alter table public.job_descriptions
  add column if not exists assignee_employee_id uuid
    references public.employees(id) on delete set null;

create index if not exists idx_job_descriptions_assignee
  on public.job_descriptions (assignee_employee_id)
  where assignee_employee_id is not null;

-- Mirror onto the immutable snapshot so history shows who the JD was
-- assigned to at each save, consistent with the other header metadata.
alter table public.job_description_versions
  add column if not exists assignee_employee_id uuid
    references public.employees(id) on delete set null;
