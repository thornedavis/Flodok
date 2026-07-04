-- Tasks: a lightweight task manager that plugs into both the admin dashboard
-- and the employee portal. One flat `tasks` table is the single source every
-- view (list / board / calendar) renders from — a project, a board column, and
-- a calendar day are all just filters over it, so a drag-and-drop is a single
-- column update. `task_projects` are the first-class, colour-coded "lists" in
-- the left rail (a constrained set, not free-text — see the attribution rule).
--
-- Surfaces:
--   - Dashboard (staff / `users`): direct table access under the org-scoped RLS
--     below.
--   - Portal (employee / `employees`, no login): reached later via token-scoped
--     SECURITY DEFINER RPCs (Phase 5) that must self-filter deleted_at +
--     visible_in_portal + assignee, because they bypass RLS.
--
-- This migration is Phase 1 (schema only). No RPCs and no portal surface yet.

-- ─── Table: task_projects (the coloured rail "lists") ───────────────────────

create table if not exists public.task_projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  color text not null default '#378ADD',
  position numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.users(id) on delete set null
);

create index if not exists idx_task_projects_org
  on public.task_projects (org_id, position)
  where deleted_at is null;

-- ─── Table: tasks (the one object every view renders from) ──────────────────

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,

  -- Grouping. project_id null = "Inbox"; parent_task_id makes a subtask.
  project_id uuid references public.task_projects(id) on delete set null,
  parent_task_id uuid references public.tasks(id) on delete cascade,

  title text not null,
  notes text,

  -- Workflow. status drives the board columns; priority 0..3 (none..high)
  -- sorts naturally.
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'blocked', 'done')),
  priority smallint not null default 0 check (priority between 0 and 3),

  -- Who does it. The assignee is an employee (the portal actor), not a staff
  -- user. on delete set null so a task survives the employee being removed.
  assignee_employee_id uuid references public.employees(id) on delete set null,

  -- Scheduling. due_date only for now; due_at/duration land later for
  -- time-blocking (the hour-grid calendar).
  due_date date,

  -- Manual ordering within a list/column. Fractional index: insert between two
  -- neighbours at (prev + next) / 2 so a reorder rewrites one row, not the column.
  position numeric not null default 0,

  -- Gates portal exposure. Only meaningful once assigned; an employee sees a
  -- task only when it's theirs AND this is true.
  visible_in_portal boolean not null default true,

  completed_at timestamptz,
  created_by uuid references public.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.users(id) on delete set null
);

create index if not exists idx_tasks_org_status
  on public.tasks (org_id, status, position)
  where deleted_at is null;

create index if not exists idx_tasks_org_due
  on public.tasks (org_id, due_date)
  where deleted_at is null;

create index if not exists idx_tasks_project
  on public.tasks (project_id, position)
  where deleted_at is null;

create index if not exists idx_tasks_assignee
  on public.tasks (assignee_employee_id)
  where deleted_at is null;

create index if not exists idx_tasks_parent
  on public.tasks (parent_task_id)
  where deleted_at is null;

-- ─── updated_at touch triggers ──────────────────────────────────────────────

create or replace function public.tg_task_projects_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_task_projects_touch on public.task_projects;
create trigger trg_task_projects_touch
  before update on public.task_projects
  for each row execute function public.tg_task_projects_touch();

create or replace function public.tg_tasks_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_tasks_touch on public.tasks;
create trigger trg_tasks_touch
  before update on public.tasks
  for each row execute function public.tg_tasks_touch();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
--
-- v1 is uniformly org-scoped: any authenticated member of the org can read and
-- write its tasks/projects, and trashed rows (deleted_at set) drop out of every
-- normal path. Tightening writes to owner/admin/hr is an open decision; restore
-- from trash will come via a SECURITY DEFINER RPC (Phase 6) that bypasses this.

alter table public.task_projects enable row level security;
alter table public.tasks enable row level security;

create policy "Task projects are org-scoped"
  on public.task_projects for all to authenticated
  using (org_id = public.get_user_org_id() and deleted_at is null)
  with check (org_id = public.get_user_org_id());

create policy "Tasks are org-scoped"
  on public.tasks for all to authenticated
  using (org_id = public.get_user_org_id() and deleted_at is null)
  with check (org_id = public.get_user_org_id());

-- ─── Seed default projects ──────────────────────────────────────────────────
--
-- Give every org a starter set so the rail isn't empty on first open. Backfills
-- existing orgs now; a matching trigger seeds any org created afterwards. Both
-- guard on "no projects yet", so re-running — or an org that already made its
-- own projects — is a no-op.

create or replace function public.seed_default_task_projects(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.task_projects where org_id = p_org_id) then
    return;
  end if;
  insert into public.task_projects (org_id, name, color, position)
  values
    (p_org_id, 'Onboarding', '#378ADD', 0),
    (p_org_id, 'Payroll',    '#1D9E75', 1),
    (p_org_id, 'Compliance', '#D85A30', 2);
end $$;

do $$
declare r record;
begin
  for r in select id from public.organizations loop
    perform public.seed_default_task_projects(r.id);
  end loop;
end $$;

create or replace function public.tg_seed_task_projects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_task_projects(new.id);
  return new;
end $$;

drop trigger if exists trg_seed_task_projects on public.organizations;
create trigger trg_seed_task_projects
  after insert on public.organizations
  for each row execute function public.tg_seed_task_projects();
