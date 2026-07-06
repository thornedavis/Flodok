# Fireflies → Pending Tasks → Tasks feature — implementation plan

**Status:** design settled 2026-07-06, not yet built.
**Goal:** meeting action items extracted from Fireflies transcripts are captured in Flodok,
reviewed by an owner/admin on the Pending page, and (on accept) become real rows in the
Tasks feature — with the whole path made anti-fragile (no silent drops, no double-inserts,
no confident-but-wrong assignments).

This plan is the outcome of a deep dive across the `flodok-router` worker, the `sop-updates`
ingestion path, the Pending page, the Tasks feature, and the integration/auth layer. See
`docs/tasks-feature-plan.md` for the Tasks feature itself.

---

## 0. The one-line reframe

This is ~80% a **routing + storage + review** problem, not an AI problem. The worker
*already* extracts a `tasks[]` array on every meeting (`FULL_ANALYSIS_SYSTEM_PROMPT`,
`flodok-router/src/prompts.ts`), but `routeOutputs` (`processor.ts:186`) sends tasks only to
**Asana** and silently drops them when Asana isn't configured. The native `tasks` table
(migration 197) is completely disconnected. We are re-pointing an existing output at a new
destination and building the review surface — plus a focused prompt tune-up.

---

## 1. Decisions locked in this design

| Area | Decision |
|---|---|
| **Storage** | New dedicated **`pending_tasks`** staging table (not a discriminator on `pending_updates`, not a new status on `tasks`). Keeps unreviewed AI output out of the portal and gives us the idempotency key `pending_updates` never had. |
| **Ingestion** | New **`tasks-ingest`** edge function, reusing the existing `validateWorkerOrApiKey` (`X-Worker-Token` + `X-Worker-Org-Id`) auth. SOP function untouched. |
| **Assignee model** | **Polymorphic** — a task belongs to an *operator* (`users`) **or** an *employee* (`employees`), or nobody. Add `assignee_user_id` to `tasks`/`pending_tasks` alongside the existing `assignee_employee_id`. Owners/admins are assignable directly; employee-assigned tasks reach the portal. A person who is both (linked via `users.employee_id`) collapses to their **employee** identity. |
| **Name resolution** | The LLM proposes a **name only** (never a UUID). A **server-side deterministic resolver** in `tasks-ingest` matches it against current assignable people. **Ambiguity → leave unassigned + keep the name + flag it** (never auto-pick). First-person tasks ("I'll…") resolve to the **speaker**. Re-validated at accept time. |
| **Review gate** | **Always human-reviewed.** Every AI task is a proposal in Pending until accepted; no auto-accept. Assignee is pre-filled but **always editable**. |
| **Accept** | Plain **authenticated** insert into `tasks` (no SECURITY DEFINER needed — `tasks` RLS `WITH CHECK (org_id = get_user_org_id())` already covers a logged-in manager). Done atomically with the pending-task status flip via a SECURITY **INVOKER** RPC. |
| **Portal safety** | Accepted tasks default `visible_in_portal = false`; portal visibility turns on **only** for a human-confirmed employee assignee. Prevents a mis-resolved assignee from leaking one employee's task to another. |
| **UI surface** | New **"Suggested tasks"** section on the Pending page + a `'task'` category in the inbox bell. Not on the Tasks page (keeps "proposed" separate from "real"). |
| **Asana** | **Dropped.** `routeOutputs` sends tasks to Flodok only; remove `asana.ts` and the Asana config path. |
| **Prompt** | Keep the single combined `{tasks, sop_updates}` pass. Harden it: **precision-omit** (only committed actions with an owner/deliverable), **speaker-aware** self-assignment, **grounded on Fireflies' native `summary.action_items`**, **relative-date anchoring** to the meeting date + org timezone. Unify the duplicated task-only prompt. |

---

## 2. Data model

### 2.1 `tasks` — add the operator assignee (polymorphic)

```sql
alter table public.tasks
  add column if not exists assignee_user_id uuid
    references public.users(id) on delete set null;

-- A task is assigned to at most one kind of person.
alter table public.tasks
  add constraint tasks_single_assignee
  check (not (assignee_user_id is not null and assignee_employee_id is not null));

create index if not exists idx_tasks_assignee_user
  on public.tasks (assignee_user_id) where deleted_at is null;
```

The portal RPC `portal_list_tasks` (migration 199) filters on `assignee_employee_id` only, so
operator-assigned tasks **never** surface in the portal — no portal migration needed. The
dashboard "assigned to me" filter must union `assignee_user_id = auth.uid()` **OR**
`assignee_employee_id = (select employee_id from users where id = auth.uid())`.

### 2.2 `pending_tasks` — the staging table

```sql
create table public.pending_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,

  -- provenance / idempotency
  source text not null default 'fireflies',
  source_ref text not null,          -- meetingId#<hash(normalized title + assignee)>  (chunk-independent)
  meeting_id text,                   -- raw Fireflies meeting id (provenance; threaded from the worker)
  source_meeting text,               -- human label "Title - date"

  -- extracted payload (pre-review)
  title text not null,
  notes text,
  due_date date,
  priority smallint not null default 2 check (priority between 0 and 3),

  -- assignee resolution (a PROPOSAL — validated again at accept time)
  assignee_name text,                -- raw spoken name / speaker
  assignee_employee_id uuid references public.employees(id) on delete set null,
  assignee_user_id uuid references public.users(id) on delete set null,
  assignee_ambiguous boolean not null default false,   -- >1 candidate → human picks

  -- lifecycle
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_task_id uuid references public.tasks(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,

  created_at timestamptz not null default now(),
  resolved_at timestamptz,

  unique (org_id, source, source_ref)   -- the idempotency backstop pending_updates lacks
);

create index if not exists idx_pending_tasks_org_status
  on public.pending_tasks (org_id, status, created_at desc);

alter table public.pending_tasks enable row level security;
create policy "Pending tasks are org-scoped"
  on public.pending_tasks for all to authenticated
  using (org_id = public.get_user_org_id())
  with check (org_id = public.get_user_org_id());
```

Why the unique key is content-derived and **chunk-independent**: long meetings run the
pipeline per chunk with no cross-chunk merge, and the LLM emits tasks in non-deterministic
order. A key based on array position would fail to dedup. `hash(normalize(title)+normalize(assignee))`
scoped to the meeting id collapses the same action item extracted twice (across chunks or on
a poll re-scan) into one row via `on conflict do nothing`. This constraint's primary job is
**intra-run / cross-chunk** dedup; the meeting-level claim (below) handles redelivery. Belt
and suspenders.

### 2.3 `processing_logs` — task counters

```sql
alter table public.processing_logs
  add column if not exists tasks_ingested int not null default 0,
  add column if not exists tasks_deduped  int not null default 0,
  add column if not exists tasks_failed   int not null default 0;
```

Mirrors the existing `sop_updates_sent` counter. Failed/rejected raw items are appended to the
existing `errors` array so nothing vanishes silently.

---

## 3. The worker (`flodok-router`)

### 3.1 Prompt hardening — `src/prompts.ts` (and unify `processor.ts:129`)

Reshape the task object and tighten the rules in `FULL_ANALYSIS_SYSTEM_PROMPT`; delete the
duplicated inline task-only prompt in `processTasksOnly` and reuse one shared task schema.

Task output object:

```jsonc
"tasks": [
  {
    "assignee_name": "Name exactly as spoken, OR the speaker's name for first-person commitments, OR null",
    "title": "Imperative, <=100 chars: what must be done",
    "notes": "Optional one-line context / the sentence it came from",
    "due_date": "YYYY-MM-DD or null",
    "priority": "high | medium | low"
  }
]
```

Rules to add:
- **Precision-omit:** "Only emit a task for an explicit committed action with an owner or a
  clear deliverable. Do NOT emit tasks for hypotheticals, questions, or things someone *might*
  do. When in doubt, omit."
- **Speaker-aware self-assignment:** "For first-person commitments ('I'll…', 'let me…'), set
  `assignee_name` to the name of the speaker of that line."
- **No UUIDs:** "Return the name only. Do not guess or emit any employee/user id."
- **Ground on native action items:** the meeting's Fireflies `summary.action_items` are
  provided; use them as a cross-check but only promote genuine committed asks with an owner.
- **Relative-date anchoring:** the meeting date and org timezone are provided; resolve "by
  Friday" against them.

User-message additions (`buildFullAnalysisUserMessage`): pass the **speaker list** and the
**`summary.action_items`** array (both already fetched — `fireflies.ts:66`, currently
discarded) and the org timezone.

### 3.2 LLM robustness — `src/llm.ts` + `src/processor.ts`

- Set **`max_tokens`** on the OpenRouter call, sized for the **SOP worst-case** (full-document
  rewrite), e.g. ~8000 — not tuned to the task case, or a real SOP meeting truncates and the
  whole meeting is lost on parse.
- After `parseLLMJson`, run a **per-item schema guard**: validate each task
  (`title:string`, `priority` in set, `due_date` null|`YYYY-MM-DD`) and each sop_update; drop
  malformed **individual** items (append to `log.errors`), keep the good ones. One bad task
  must never abort the meeting or lose the SOP updates — routing is already per-item in
  `Promise.all`, so just ensure task failures are caught per-item, not thrown.

### 3.3 Routing — `src/flodok.ts` + `src/processor.ts`

Add to `flodok.ts` (reuses `flodokFetch` → 3× backoff, same auth headers):

```ts
export async function submitTask(
  env: Env, orgId: string, meetingId: string, sourceMeeting: string,
  tasks: ExtractedTask[],
): Promise<{ ingested: number; deduped: number; failed: number }> {
  const res = await flodokFetch(env, orgId, "tasks-ingest", {
    method: "POST",
    body: JSON.stringify({ meeting_id: meetingId, source_meeting: sourceMeeting, tasks }),
  });
  return res.json();
}
```

In `routeOutputs`:
- **Thread `meetingId`** into `routeOutputs` (currently only the transcript object is passed,
  which carries no id — `types.ts:55`). This is required so the dedup key and provenance are
  real, not a display string.
- Replace the Asana task branch with a single `submitTask(...)` call. Tasks **always** go to
  Flodok.
- Delete `src/asana.ts`, its import, and the `asana_*` fields from `OrgConfig`/`config.ts`
  assembly. The `asana` rows in `org_integrations` become inert (cleanup later; no migration
  needed to stop routing).

### 3.4 Webhook hardening — `src/index.ts` (Phase 4)

- When an org **has** a `fireflies_webhook_secret`, **require** the `x-hub-signature` header and
  fail closed (today it warns and proceeds — `index.ts:310`). Free-plan orgs with no secret are
  unchanged; meeting-id dedup is their practical replay defense.
- Constant-time signature compare (mirror the Stripe pattern already in `billing/index.ts`).

### 3.5 Crash-recovery for the claim — `worker-config` + `processor` (Phase 4)

Today `claimMeeting` writes `processed_meetings` **before** processing (`index.ts:333`), and
the webhook returns 200 immediately then processes in `ctx.waitUntil`. So a background failure
**permanently loses** the meeting — and because Fireflies already got its 200, it won't
redeliver. **The retry path that actually exists is the cron poll** (`runPollForOrg`), which
re-scans recent transcripts and processes any not-yet-claimed one.

Make the claim **stateful** so the poll can recover failures:
- Add `status` (`processing|done|failed|poison`) and `attempts` to `processed_meetings`.
- Claim atomically as `processing` (keeps concurrency safety). On success → `done`. On failure
  → `failed`, `attempts++`; the poll reprocesses `failed` rows with `attempts < N`. After N →
  `poison`, logged to the dead-letter, skipped.
- Idempotent ingest (§2.2) is what makes reprocessing safe: a retried meeting re-POSTs tasks
  that `on conflict do nothing`.

---

## 4. Ingestion — `supabase/functions/tasks-ingest/index.ts`

Mirror `sop-updates` structure and auth:

1. `validateWorkerOrApiKey(req, supabase)` → `authed.org_id` (same primitive the SOP fn uses;
   no new secret).
2. Parse `{ meeting_id, source_meeting, tasks[] }`.
3. For each task, **server-side validate every field** (never trust the worker/LLM).
4. **Resolve the assignee** (§5) against current org people.
5. Compute `source_ref = meeting_id + "#" + hash(normalize(title) + "|" + normalize(assignee_name))`.
6. Insert into `pending_tasks` with `on conflict (org_id, source, source_ref) do nothing`.
7. Return `{ ingested, deduped, failed }`; bump `processing_logs` counters.

---

## 5. Assignee resolution (server-side, deterministic)

Runs in `tasks-ingest` and again at accept time.

**Candidate set** = currently-assignable people in the org:
- **Employees**: active workforce only (scope via `src/lib/lifecycle.ts` — the same
  WORKFORCE-stage convention used to stop recruitment bleed; exclude separated/pipeline/deleted).
- **Operators**: `users` in the org.
- **Collapse dual-identity**: if a `users` row has `employee_id` set, it's one person — prefer
  the **employee** identity (so the task can reach their portal, and the dashboard resolves
  ownership through the link).

**Matching:** normalize the spoken name and each candidate name; score exact > token-overlap >
Levenshtein (nicknames/first-name-only handled by the LLM upstream, confirmed here).

**Rules:**
- Exactly one candidate above threshold → set `assignee_employee_id` **or** `assignee_user_id`.
- More than one above threshold → `assignee_ambiguous = true`, leave both ids null, keep
  `assignee_name`. **Never auto-pick.**
- None → leave null, keep `assignee_name` as context.
- **Re-validate at accept time** so a person who left between the meeting and the review can't
  be silently assigned (degrade to unassigned).

Case behaviour:
| Transcript | Resolves to | Lands on |
|---|---|---|
| "I'll get the deck out Friday" (owner speaking) | speaker → owner `users` | owner's dashboard |
| "Andi, update the SOP" | employee | Andi's portal |
| "Sarah to review the contract" (HR, linked) | employee identity | Sarah's dashboard + portal |
| ambiguous "Andi" (two match) | unassigned + `assignee_ambiguous` | review card: "2 matches, pick one" |
| "chase the vendor" (external) | unassigned + name kept | founder assigns/owns at review |

---

## 6. Accept flow + review UI

### 6.1 `accept_pending_task` RPC (SECURITY **INVOKER**)

Runs as the logged-in manager, so it satisfies both `tasks` and `pending_tasks` RLS. Atomic:

```
accept_pending_task(p_pending_id uuid, p_overrides jsonb) returns uuid:
  - load pending_tasks row (RLS scopes to caller's org)
  - re-resolve / validate the assignee override against current people
  - insert into tasks { org_id, title, notes, due_date, priority,
                        assignee_employee_id | assignee_user_id,   -- from overrides
                        project_id,                                -- optional bucket
                        visible_in_portal = (confirmed employee assignee ? true : false),
                        created_by = auth.uid() }
  - update pending_tasks set status='accepted', created_task_id=<new>, reviewed_by=auth.uid(), resolved_at=now()
  - return new task id
```

Overrides carry the founder's inline edits (title/assignee/due/project). `visible_in_portal`
turns on only when a human confirms an **employee** assignee.

### 6.2 Pending page — new "Suggested tasks" section

`src/pages/dashboard/Pending.tsx`: add a third section mirroring the pending-updates card
list. Each card (expand-one-at-a-time, like the SOP cards):
- editable **title**, **notes**, **due date**, **priority**
- **assignee picker** (the shared polymorphic picker, §6.3) — pre-filled from resolution,
  **always editable**; ambiguous/unassigned shows the raw name as a hint chip
- optional **project** bucket (Inbox by default)
- source meeting label
- **Accept** → `accept_pending_task`; **Reject** → `status='rejected'`

### 6.3 Shared assignee picker

One "Assign to…" component used by both the Pending review card **and** the manual Tasks UI
(`Tasks.tsx`, currently employees-only). Unions:
- **"Me"** pinned top
- **Team** (operators / `users`) with a role label
- **Employees** (active workforce) with a department label
- **Unassigned**
- dual-identity people shown once (employee identity)

This upgrade also fixes a pre-existing limitation: today you can't hand a *manual* task to a
staff admin at all.

---

## 7. Notifications — inbox (Phase 3)

Add a `'task'` category to `src/lib/inbox.ts` derivation (`InboxCategory`, `ALL_CATEGORIES`,
both count maps) + a fetch in `src/hooks/useInboxItems.ts`. Lights up the bell and
`/dashboard/inbox` count, linking to `/dashboard/pending`. ~5 edit points.

---

## 8. Phased build sequence

Each phase is independently shippable and testable. **Anti-fragility that is non-negotiable
(content-hash dedup key, per-item validation, `max_tokens`) ships in Phase 1** — only the
crash-recovery/security *hardening* is deferred to Phase 4.

### Phase 1 — Backend spine: capture instead of drop (no UI)
- **Migration A:** `pending_tasks` (§2.2) + `tasks.assignee_user_id` (§2.1) + `processing_logs`
  counters (§2.3).
- **Edge fn:** `tasks-ingest` (§4) with server-side validation, deterministic assignee
  resolution (§5), dedup insert.
- **Worker:** `submitTask` (§3.3); `routeOutputs` → Flodok always; thread `meetingId`; remove
  Asana; prompt hardening (§3.1); `max_tokens` + per-item schema guard (§3.2).
- **Test:** replay a captured webhook → rows land; re-delivery / re-poll is a no-op;
  a malformed task is dropped without losing the SOP updates; a task across two chunks
  produces one row.
- **Ships:** tasks stop being dropped; captured server-side even before any UI.

### Phase 2 — Review & accept UI
- **Migration B:** `accept_pending_task` RPC (§6.1).
- **UI:** "Suggested tasks" section on Pending (§6.2) + shared polymorphic assignee picker
  (§6.3, also upgrades the manual Tasks picker).
- **Test:** accept creates a real task visible on the Tasks page and (assigned employee +
  confirmed) in that employee's portal; reject leaves no task; reassign before accept works.
- **Ships:** end-to-end Fireflies → review → real task, with correction.

### Phase 3 — Notifications
- `'task'` inbox category (§7). Bell + inbox count/link.
- **Ships:** founders notified without polling Pending.

### Phase 4 — Anti-fragility hardening
- Stateful claim + poll-driven retry + poison bound (§3.5).
- Fail-closed + constant-time webhook signature (§3.4).
- Dead-letter rejected items into `processing_logs.errors`.
- **Ships:** the property the founder cares about most, layered on a working feature.

---

## 9. Rollout / deploy notes

- **Migrations** apply to the Flodok Supabase project (remote), in order (A before B).
- **Edge fn** `tasks-ingest` deploys to the Flodok Supabase project (same as `sop-updates`).
- **Worker** deploys from `flodok-router/` — **always pass `--config`** (repo has two workers,
  `flodok` and `flodok-router`); the router is `flodok-router/wrangler.toml`.
- **Gate**: reuse the per-org enable pattern (like `attendance_enabled`) so the feature is
  inert until switched on, if we want a staged rollout. The worker already no-ops when an org's
  integration is absent/disabled.

## 10. Residual risks / open items

- **Owner/admins without an employee record** resolve as operators (dashboard tasks) and can't
  reach a portal — by design. If an HR is on payroll they add their own employee record; future
  tasks then also reach their portal. No breakage, natural upgrade.
- **Near-duplicate-but-not-identical** titles across chunks (e.g. slightly reworded) can slip
  the content-hash and produce two cards — the human review catches these. Acceptable residual.
- **Timezone**: relative-date anchoring depends on us passing a correct org timezone into the
  prompt; the system already juggles WIB/UTC (see the worker cron) so wire the org's actual tz.
- **`processing_logs` dead-letter** assumes we append to the existing `errors` array (confirmed
  present) rather than a new column — keep it there unless a structured `dead_letter jsonb` is
  wanted later.
