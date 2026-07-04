# Tasks (`/dashboard/tasks`)

A lightweight-but-sturdy task manager that plugs natively into the admin
dashboard and the employee portal. Modelled on Apple Reminders' core insight:
a task is one flat object, and every "list" is just a **saved view** over it.
Same data renders as a **List**, a **Board** (kanban), or a **Calendar**
(month/week) — dragging between columns or days just rewrites one field on
the row.

Status: **Design / plan only** (2026-07-02) — no code written yet. Riffed with
four view mockups (list, board, calendar-month, calendar-week) plus a portal
tab. This doc is the agreed shape; next action is Phase 1 (backend). No
existing task/todo tables in the schema — clean build.

---

## Why

"Task management system" has sat on the Flodok list for a while. HR work is
inherently task-shaped — onboarding checklists, payroll cut-offs, compliance
follow-ups, offboarding — and today none of it is tracked inside the product.
The win is a single system that (a) lets admins organise work by project /
status / assignee / due date, and (b) pushes an employee's assigned items into
their portal so they see and complete them without a login.

## Core model (the load-bearing idea)

- **One `tasks` table.** Project, status, priority, assignee, due date are all
  columns. Everything the UI calls a "list" or "board column" or "calendar
  day" is a filter/group over that one table. A drag-and-drop = an update to
  one field. This is what keeps the three views cheap and consistent.
- **Projects are first-class** (a tiny `task_projects` table with a colour),
  not free-text tags. That gives the coloured Reminders-style rail and fits the
  no-free-text-attribution rule (see `[[feedback_attribution_no_freetext]]`).
- **Two orthogonal axes in the header**, not one:
  - **View** = layout: `List · Board · Calendar`.
  - **Time scope** = which slice of time: the date navigator. It *means*
    something different per view (period-driver in Calendar; optional filter in
    List/Board) but it is one shared control writing to one shared state.
- **Dual-surface, one spine.** Dashboard = authenticated staff via direct
  `supabase.from('tasks')` + RLS. Portal = employee via token-scoped
  `SECURITY DEFINER` RPCs. Same table underneath.

---

## Data model — migration `197_tasks.sql`

Next migration number is **197** (196 = attendance is the current head).
Follows the house conventions: `uuid` PKs, `org_id` scoping, `created_at /
updated_at / deleted_at / deleted_by` spine, `updated_at` touch trigger,
partial indexes excluding trash. RLS helpers `public.get_user_org_id()` and
`public.get_user_role()` already exist.

```sql
-- task_projects: the coloured "lists" in the left rail (org-scoped).
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

-- tasks: the one object every view renders from.
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.task_projects(id) on delete set null,     -- null = "Inbox"
  parent_task_id uuid references public.tasks(id) on delete cascade,          -- subtasks
  title text not null,
  notes text,
  status text not null default 'todo'
    check (status in ('todo','in_progress','blocked','done')),
  priority smallint not null default 0 check (priority between 0 and 3),       -- 0 none .. 3 high
  assignee_employee_id uuid references public.employees(id) on delete set null,
  due_date date,                                                              -- due_at/duration added later for time-blocking
  position numeric not null default 0,                                        -- fractional index for cheap drag-reorder
  visible_in_portal boolean not null default true,                           -- gates portal exposure (only meaningful when assigned)
  completed_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.users(id) on delete set null
);

-- ─── Indexes ───────────────────────────────────────────────────
create index if not exists idx_tasks_org_status
  on public.tasks (org_id, status, position) where deleted_at is null;
create index if not exists idx_tasks_org_due
  on public.tasks (org_id, due_date) where deleted_at is null;
create index if not exists idx_tasks_assignee
  on public.tasks (assignee_employee_id) where deleted_at is null;
create index if not exists idx_task_projects_org
  on public.task_projects (org_id, position) where deleted_at is null;

-- ─── Touch triggers (updated_at) ───────────────────────────────
create or replace function public.tg_tasks_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_tasks_touch on public.tasks;
create trigger trg_tasks_touch before update on public.tasks
  for each row execute function public.tg_tasks_touch();
-- (same touch trigger for task_projects)

-- ─── RLS: staff, org-scoped, trash-filtered ────────────────────
alter table public.tasks enable row level security;
alter table public.task_projects enable row level security;

create policy "tasks: org members read" on public.tasks
  for select to authenticated
  using (org_id = public.get_user_org_id() and deleted_at is null);
create policy "tasks: org members write" on public.tasks
  for all to authenticated
  using (org_id = public.get_user_org_id() and deleted_at is null)
  with check (org_id = public.get_user_org_id());
-- (mirror policies for task_projects)
```

**Position / fractional index.** `position` is `numeric`; insert between two
rows at `(prev + next) / 2`. Occasional renormalisation (rewrite 0,1,2,… per
group) if precision ever runs thin. Avoids reindexing a whole column on every
drag.

**Later columns (do not add in 197):**
- `due_at timestamptz` + `duration_min int` — turns tasks into schedulable
  blocks; enables a true hour-grid week/day view (time-blocking). `due_date`
  stays the primary field.
- `task_links (id, org_id, task_id, related_type, related_id)` — polymorphic
  link to a `contract` / `sop` / `nda` / `form_submission` / `employee`. The
  Flodok-native superpower: a task can point at a real document.

---

## Access model

The load-bearing separation Flodok already enforces:

- **`users`** = staff logins (owner / admin / hr / member). They use the
  dashboard.
- **`employees`** = the workforce. They have **no login**; they reach the
  portal via a token link (`/portal/:slugToken`, slug + token pair).

Therefore:

- **Dashboard (staff):** direct table access. RLS scopes to
  `org_id = get_user_org_id()` and filters `deleted_at is null`. Role gating
  (restrict writes to owner/admin/hr) is an open refinement — see Open
  decisions.
- **Portal (employee):** never touches the table directly. Two token-validated
  `SECURITY DEFINER` RPCs, matching the existing `portal_*` pattern
  (`portal_documents`, `portal_submit_*`):
  - `portal_list_tasks(p_slug, p_token)` → the employee's tasks.
  - `portal_set_task_status(p_slug, p_token, p_task_id, p_status)` → complete /
    reopen.
  - **Both must self-filter** `deleted_at is null`, `visible_in_portal = true`,
    and `assignee_employee_id = <the token's employee>` — because
    `SECURITY DEFINER` bypasses RLS. This is the recurring footgun; see
    `[[project_security_definer_rls_filter]]`.

---

## Page architecture

Within-page columns give the "3–4 column" feel on top of the app's own nav
rail:

- **Rail** (`w-64`, collapsible to an icon rail `w-12` in Calendar for space):
  smart lists (Today, Assigned to me, Scheduled, Flagged) + coloured projects +
  "New project". Collapse state persisted in `localStorage` per the
  `DocumentEditShell` convention (`flodok:tasks:railOpen`).
- **Main** (flex): the active view. Header on top is **shared across all three
  views** — same view switcher, same date navigator, same "unscheduled" tray,
  same detail-panel trigger. Only the body swaps.
- **Detail panel** (right-docked slide-over, ~`w-64/80`): opens on task click —
  notes, assignee, project, due, priority, status, `visible_in_portal` toggle,
  subtasks, linked document. Mirrors the `DocumentEditShell` sidebar pattern but
  on the right.

---

## Views

### List
Default view. Grouped checkable rows (Reminders-style): circle toggle, title,
optional meta line, due chip, priority flag, assignee avatar, a portal-visible
glyph when surfaced to the employee. Inline "Add a task" quick-add at top.
Filter + search reuse `FilterControls` (`FilterPanel` + `FilterSearchInput`).

### Board
Columns = status (`To do · In progress · Done`, with `blocked` available).
Drag a card between columns → update `status`; drag within a column → update
`position`. Swimlane dimension (status) is switchable to priority/assignee
later. Needs a DnD lib (see Dependencies).

### Calendar
- **Month** (default when Calendar is selected) — the planning lens: whole
  month, tasks as chips on their `due_date` cell, "+N more" overflow on busy
  days, today highlighted, weekends tinted.
- **Week** (secondary) — the execution lens: 7 day-columns, more room per day,
  matches the reference aesthetic. Drag a chip to another day → rewrites
  `due_date`.
- **Day / hour-grid** — deferred until `due_at` exists (time-blocking).
- Remember each user's last-used granularity in `localStorage`
  (`flodok:tasks:calGranularity`), like the editor sidebar.

### Detail panel
Shared across all views. Click a task anywhere → the right panel slides in.

---

## The date navigator (how it interfaces)

The part that was least obvious. One control, three behaviours, one state.

- **Single source of truth:** an "active date window" in page state. The rail's
  `Today` / `Scheduled` presets, the top navigator, and the calendar period all
  read/write it. Clicking `Today` in the rail snaps the navigator to today — no
  two competing date UIs.
- **In Calendar:** the navigator *is* the view. `‹ Today ›` + `Day/Week/Month`
  drive the grid.
- **In List / Board:** the navigator collapses to an **optional** time-scope
  chip defaulting to **"Any time."** Engaged (Today · This week · range), it
  filters. Disengaged, everything shows. Deliberately **not** always-on.
- **The undated-task trap** (the thing to design around): most tasks have no
  due date; a calendar and an always-on date filter both make them silently
  vanish. Two guards:
  1. An **"unscheduled" tray** in the header — a drawer of date-less tasks you
     drag onto days. Scheduling becomes a gesture.
  2. When a date scope is active in List/Board, show an explicit
     **"N with no date — hidden"** line, one click to reveal.

---

## Portal integration

- New `src/components/portal/TasksTab.tsx`, sibling to `RequestsTab.tsx`.
- New bottom-nav entry in `src/pages/public/Portal.tsx`
  (`home | documents | tasks | requests | more`).
- Employee sees only tasks where `assignee_employee_id = them` and
  `visible_in_portal = true`; checking one off calls `portal_set_task_status`,
  which flips the status back on the dashboard.
- v1 is **complete-only** (no employee-created tasks) — see Open decisions.

## i18n

`src/lib/translations.ts` — flat bilingual object (`{ en: {...}, id: {...} }`),
consumed via `useLang()` → `{ t, lang }`. Add keys to **both** `en` and `id`.
Namespaces: `tasksAdmin*` (dashboard) and `tasksPortal*` (portal). Add a
`navTasks` key for the Layout nav item.

---

## Build phases

Each phase is independently shippable (`tsc -b && vite build` green before
merge).

1. **Backend.** Migration 197 (`task_projects` + `tasks`, RLS, triggers,
   indexes). Extend `src/types/database.ts`. Thin `src/lib/tasks.ts` data layer.
   Seed a couple of default projects per org.
2. **Dashboard — List view (usable core).** `/dashboard/tasks` route in
   `App.tsx` + `navTasks` nav item in `Layout.tsx`. Rail (smart lists +
   projects), grouped checkable list, inline quick-add, create/edit via `Modal`,
   assignee picker (`EmployeeSelect`), complete/reopen, filter + search.
3. **Detail panel + Board + drag.** Right-docked detail slide-over. Board view
   with drag between status columns + reorder via `position`. Adds the DnD lib.
4. **Calendar + date navigator.** Month (default) + Week, the shared date
   navigator, the unscheduled tray, reconciliation with the rail smart lists.
5. **Portal surface.** `portal_list_tasks` / `portal_set_task_status` RPCs
   (migration), `TasksTab.tsx`, bottom-nav entry, `visible_in_portal` control on
   the dashboard, `tasksPortal*` bilingual strings.
6. **Extensions.** Subtasks UI, `task_links` to contracts/SOPs/forms,
   auto-created tasks from workflows ("sign contract", "complete leave form"),
   time-blocking (`due_at` + hour-grid day/week), Trash parity (extend
   `src/lib/trash.ts` + `list_trash` RPC), notifications on assignment/due.

---

## Open decisions (recommended defaults in **bold**)

1. **Portal: complete-only** for v1 (employee checks off what's assigned).
   Personal employee-created to-dos → Phase 6.
2. **Detail panel: right-docked** (Reminders/Things/Todoist convention).
   Alternative raised: a second *left* rail like the contract editor.
3. **Board swimlane = status** for v1; make it switchable
   (status/priority/assignee) once the drag plumbing exists.
4. **Calendar default = Month**, Week one tap away, remember last-used.
5. **Trash parity:** include `deleted_at/deleted_by` columns from day one
   (Phase 1), wire the `trash.ts` + `list_trash` UI in Phase 6. Everything else
   in Flodok soft-deletes, so the columns should exist from the start even if
   the trash UI lands later.
6. **Time-blocking (hour grid + `due_at`): deferred** to Phase 6 unless HR
   scheduling (e.g. interview slots) is wanted early.
7. **Dashboard write gating:** open — all org members, or restrict
   insert/update/delete to owner/admin/hr via `get_user_role()`? Leaning
   org-members-can-write for v1, tighten if needed.

## Dependencies

- **Drag-and-drop:** no DnD lib surfaced in the current deps. Recommend
  `@dnd-kit/core` (modern, accessible, tree-shakeable) — added in Phase 3.
  Confirm before adding.

## Files touched (map)

- New: `supabase/migrations/197_tasks.sql`, `src/pages/dashboard/Tasks.tsx`,
  `src/lib/tasks.ts`, `src/components/tasks/*` (rail, list, board, calendar,
  detail panel), `src/components/portal/TasksTab.tsx`.
- Edit: `src/App.tsx` (route), `src/components/Layout.tsx` (nav item),
  `src/pages/public/Portal.tsx` (tab + nav), `src/lib/translations.ts`
  (`tasksAdmin*` / `tasksPortal*` / `navTasks`), `src/types/database.ts`.
- Later: `src/lib/trash.ts` (+ a trash migration) in Phase 6.

## Invariants / risks

- **`SECURITY DEFINER` self-filters.** Every portal RPC must filter
  `deleted_at`, `visible_in_portal`, and the token's employee itself — RLS is
  bypassed. See `[[project_security_definer_rls_filter]]`.
- **Staff vs employees never blur.** Dashboard writers are `users`; portal
  actors are `employees` via token. Don't grant employees table access.
- **One date state.** Rail presets and the top navigator must share it, or the
  UI will feel like two fighting controls.
- **Undated tasks must never silently disappear.** The tray + hidden-count are
  not optional polish.
