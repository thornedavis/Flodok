-- Fireflies task extraction — Phase 1 storage spine.
--
-- Meeting action items extracted by the flodok-router worker land here as
-- PROPOSALS (pending_tasks). An owner/admin reviews them on the Pending page and,
-- on accept (Phase 2), they become real rows in `tasks`. Nothing here touches the
-- live tasks table until a human accepts.
--
-- See docs/fireflies-tasks-plan.md. Three changes:
--   1. tasks.assignee_user_id — the POLYMORPHIC assignee. A task can belong to an
--      operator (users) OR an employee (employees), or nobody. Owners/admins are
--      assignable directly (dashboard-only); employee-assigned tasks reach the
--      portal via the existing portal RPCs (which key on assignee_employee_id, so
--      operator-assigned tasks never leak there — no portal change needed).
--   2. pending_tasks — the AI-proposal staging table, with a content-derived,
--      chunk-independent idempotency key so re-delivered/re-polled/multi-chunk
--      extractions can't double-insert.
--   3. processing_logs task counters for dedup/failure observability.

-- 1. tasks: polymorphic assignee ----------------------------------------------

alter table public.tasks
  add column if not exists assignee_user_id uuid
    references public.users(id) on delete set null;

-- A task is assigned to at most one kind of person (or nobody). Existing rows
-- only ever set assignee_employee_id, so this holds for all current data.
alter table public.tasks
  drop constraint if exists tasks_single_assignee;
alter table public.tasks
  add constraint tasks_single_assignee
  check (not (assignee_user_id is not null and assignee_employee_id is not null));

create index if not exists idx_tasks_assignee_user
  on public.tasks (assignee_user_id)
  where deleted_at is null;

-- 2. pending_tasks: the AI-proposal staging table -----------------------------

create table if not exists public.pending_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,

  -- provenance / idempotency
  source text not null default 'fireflies',
  source_ref text not null,          -- meetingId#<hash(normTitle+assignee)>, chunk-independent
  meeting_id text,                   -- raw provider meeting id
  source_meeting text,               -- human label "Title - date"

  -- extracted payload (pre-review)
  title text not null,
  notes text,
  due_date date,
  priority smallint not null default 2 check (priority between 0 and 3),

  -- assignee resolution (a PROPOSAL — re-validated at accept time). At most one
  -- of employee/user is set; ambiguous = >1 candidate, left for the human.
  assignee_name text,
  assignee_employee_id uuid references public.employees(id) on delete set null,
  assignee_user_id uuid references public.users(id) on delete set null,
  assignee_ambiguous boolean not null default false,

  -- lifecycle
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_task_id uuid references public.tasks(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,

  created_at timestamptz not null default now(),
  resolved_at timestamptz,

  -- The idempotency backstop pending_updates never had. A re-extracted task with
  -- the same (meeting, normalized title+assignee) collapses via ON CONFLICT.
  constraint pending_tasks_source_unique unique (org_id, source, source_ref),

  -- Mirror the polymorphic-assignee invariant on the tasks table so a proposal
  -- can never carry both an employee and a user assignee (which would then
  -- violate tasks_single_assignee at Phase 2 accept time).
  constraint pending_tasks_single_assignee
    check (not (assignee_user_id is not null and assignee_employee_id is not null))
);

create index if not exists idx_pending_tasks_org_status
  on public.pending_tasks (org_id, status, created_at desc);

alter table public.pending_tasks enable row level security;

-- v1 mirrors the tasks table: uniformly org-scoped for any authenticated member.
-- (Tightening review to owner/admin/hr is an open decision, same as tasks.)
drop policy if exists "Pending tasks are org-scoped" on public.pending_tasks;
create policy "Pending tasks are org-scoped"
  on public.pending_tasks for all to authenticated
  using (org_id = public.get_user_org_id())
  with check (org_id = public.get_user_org_id());

-- 3. processing_logs: task ingestion counters ---------------------------------
-- tasks_created already exists (was Asana-success count; now = tasks ingested
-- into pending_tasks). Add dedup/failure counters so silent drops are visible.

alter table public.processing_logs
  add column if not exists tasks_deduped int not null default 0,
  add column if not exists tasks_failed  int not null default 0;
