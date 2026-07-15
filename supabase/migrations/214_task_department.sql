-- Link tasks to a department, orthogonal to project + assignee, so tasks can be
-- browsed and filtered per department (dashboard rail section + header filter).
--
-- Departments are already a first-class table (company_departments, migration
-- 085); this mirrors the FK pattern hiring_requests uses (department_id →
-- company_departments) rather than free text — a constrained, server-resolved
-- reference. Nullable, `on delete set null` so a task survives its department
-- being removed. RLS on tasks is unchanged (already org-scoped) and the portal
-- is untouched: employees see their own assigned tasks regardless of department.

alter table public.tasks
  add column if not exists department_id uuid
    references public.company_departments(id) on delete set null;

create index if not exists idx_tasks_department
  on public.tasks (department_id)
  where deleted_at is null;
