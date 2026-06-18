-- Forms: employee-submitted HR forms (leave / overtime requests) that route
-- through a two-tier approval chain (Manager → Owner) and are stored against
-- the employee. Mirrors the hiring_requests engine (migration 090) — typed
-- columns + a status machine + decision columns — rather than the document
-- editor, because a form is a structured record, not free prose.
--
-- Approval bindings are real permissions, not cosmetic labels:
--   - Owner step   → users.role = 'owner'.
--   - Manager step → an org-level designated approver
--     (organizations.forms_approver_user_id), defaulting to the owner when
--     unset. No department dependency, so small orgs never get stuck.
-- The owner step is optional, controlled per-org by
-- organizations.forms_require_owner_approval and snapshotted onto each
-- submission at submit time (so changing the setting can't reroute in-flight
-- forms). The RPCs that drive the workflow live in migration 151.

-- ─── Org-level governance settings ──────────────────────────────────────────

alter table public.organizations
  add column if not exists forms_enabled boolean not null default true,
  add column if not exists forms_approver_user_id uuid references public.users(id) on delete set null,
  add column if not exists forms_require_owner_approval boolean not null default false;

-- ─── Table: form_submissions ────────────────────────────────────────────────

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,

  form_type text not null check (form_type in ('leave_request', 'overtime_request')),

  -- Subject + submitter. employee_id is the person the form is ABOUT and who
  -- files it via the portal. submitter_user_id is set only when a dashboard
  -- user files on their behalf (null for portal submissions).
  employee_id uuid not null references public.employees(id) on delete restrict,
  submitter_user_id uuid references public.users(id) on delete set null,
  submitted_via text not null default 'portal' check (submitted_via in ('portal', 'dashboard')),

  -- Approval routing, resolved + snapshotted at submit time. manager_user_id
  -- is the designated Manager-tier approver; owner_approval_required freezes
  -- the org's owner-gate setting for this submission.
  manager_user_id uuid references public.users(id) on delete set null,
  owner_approval_required boolean not null default false,

  -- Workflow state. Advances one step at a time via the RPCs in migration 151.
  -- 'manager_approved' is the parked state when the owner gate is armed.
  status text not null default 'draft' check (status in (
    'draft',
    'submitted',
    'manager_approved',
    'approved',
    'rejected_by_manager',
    'rejected_by_owner'
  )),
  submitted_at timestamptz,

  -- Manager step (the designated approver). Auto-stamped when the submitter
  -- IS the approver (you can't approve your own) — see the submit RPCs.
  manager_decision text check (manager_decision in ('approved', 'rejected')),
  manager_decided_at timestamptz,
  manager_decided_by uuid references public.users(id) on delete set null,
  manager_decision_note text,
  manager_auto_approved boolean not null default false,

  -- Owner step (final sign-off; only reached when owner_approval_required).
  owner_decision text check (owner_decision in ('approved', 'rejected')),
  owner_decided_at timestamptz,
  owner_decided_by uuid references public.users(id) on delete set null,
  owner_decision_note text,

  -- Type-specific answers + the server-snapshotted identity header
  -- (field_data.identity). Validated per form_type in the submit RPCs.
  field_data jsonb not null default '{}'::jsonb,

  -- Stamped when status reaches 'approved' (fully committed). The hook for
  -- downstream payroll / leave-ledger posting lands here in a later phase.
  committed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.users(id) on delete set null
);

create index if not exists idx_form_submissions_org_status
  on public.form_submissions (org_id, status, created_at desc)
  where deleted_at is null;

create index if not exists idx_form_submissions_employee
  on public.form_submissions (employee_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_form_submissions_manager
  on public.form_submissions (manager_user_id, status)
  where deleted_at is null;

create or replace function public.tg_form_submissions_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_form_submissions_touch on public.form_submissions;
create trigger trg_form_submissions_touch
  before update on public.form_submissions
  for each row execute function public.tg_form_submissions_touch();

-- ─── Table: form_line_items (repeatable rows — overtime) ────────────────────
--
-- One row per overtime day. total_hours is server-computed in the submit RPC;
-- the client value is treated as a hint. org_id is denormalised so line-item
-- RLS can scope cheaply, but the policy still delegates to the parent.

create table if not exists public.form_line_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.form_submissions(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  line_no int not null,
  work_date date not null,
  is_ot_day boolean not null default false,
  start_time time not null,
  end_time time not null,
  total_hours numeric(5,2) not null default 0,
  reason text,
  unique (submission_id, line_no)
);

create index if not exists idx_form_line_items_submission
  on public.form_line_items (submission_id, line_no);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.form_submissions enable row level security;
alter table public.form_line_items enable row level security;

-- Visibility:
--   - The dashboard submitter sees their own submissions.
--   - The designated approver (manager_user_id) sees what's routed to them.
--   - Owner / admin / hr see every submission in the org.
--   - The employee the form is about sees their own (via their linked user).
create policy "Form submissions visible to authorised viewers"
  on public.form_submissions for select to authenticated
  using (
    org_id = public.get_user_org_id()
    and deleted_at is null
    and (
      submitter_user_id = auth.uid()
      or manager_user_id = auth.uid()
      or public.get_user_role() in ('owner', 'admin', 'hr')
      or employee_id in (
        select u.employee_id from public.users u
        where u.id = auth.uid() and u.employee_id is not null
      )
    )
  );

-- Dashboard creation (HR filing on behalf). Portal submissions go through the
-- SECURITY DEFINER RPCs in 151, which bypass this policy.
create policy "Users can create dashboard form submissions"
  on public.form_submissions for insert to authenticated
  with check (
    org_id = public.get_user_org_id()
    and submitter_user_id = auth.uid()
    and submitted_via = 'dashboard'
  );

-- Direct edits: only the dashboard submitter, only pre-decision. Approvals and
-- portal submissions go through the SECURITY DEFINER RPCs (they bypass this).
create policy "Submitter can edit while pre-decision"
  on public.form_submissions for update to authenticated
  using (
    org_id = public.get_user_org_id()
    and submitter_user_id = auth.uid()
    and status in ('draft', 'submitted')
  )
  with check (
    org_id = public.get_user_org_id()
    and submitter_user_id = auth.uid()
    and status in ('draft', 'submitted')
  );

create policy "Submitter can delete own draft submissions"
  on public.form_submissions for delete to authenticated
  using (
    org_id = public.get_user_org_id()
    and submitter_user_id = auth.uid()
    and status = 'draft'
  );

-- Line items delegate to the parent submission's visibility.
create policy "Form line items visible with parent"
  on public.form_line_items for select to authenticated
  using (
    exists (
      select 1 from public.form_submissions s
      where s.id = form_line_items.submission_id
        and s.org_id = public.get_user_org_id()
        and s.deleted_at is null
        and (
          s.submitter_user_id = auth.uid()
          or s.manager_user_id = auth.uid()
          or public.get_user_role() in ('owner', 'admin', 'hr')
          or s.employee_id in (
            select u.employee_id from public.users u
            where u.id = auth.uid() and u.employee_id is not null
          )
        )
    )
  );

-- ─── Feed events ─────────────────────────────────────────────────────────────
--
-- Extend the feed_events event_type whitelist to allow any 'form_*' kind
-- (form_submitted, form_manager_approved, form_owner_approved, form_rejected),
-- mirroring the '^hiring_request_' escape hatch.

alter table public.feed_events
  drop constraint if exists feed_events_event_type_check;
alter table public.feed_events
  add constraint feed_events_event_type_check
  check (
    event_type in (
      'sop_signed', 'sop_updated', 'sop_assigned',
      'contract_assigned', 'contract_updated', 'contract_signed',
      'job_description_signed',
      'letter_issued',
      'nda_signed',
      'bonus_awarded',
      'welcome',
      'achievement_unlocked',
      'spotlight_published'
    )
    or event_type ~ '^hiring_request_'
    or event_type ~ '^form_'
  );

-- Emit 'form_submitted' when a submission first leaves draft. Trigger-based
-- (not client-emitted) because portal submissions come from an anon SECURITY
-- DEFINER RPC that can't be trusted to also insert a feed row. Decision events
-- (approve / reject) are emitted client-side from the dashboard, mirroring the
-- hiring-request feed.

create or replace function public.tg_feed_form_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.feed_events (org_id, employee_id, event_type, title, description, metadata)
  values (
    new.org_id,
    new.employee_id,
    'form_submitted',
    coalesce(new.field_data->'identity'->>'name', 'Employee'),
    new.form_type,
    jsonb_build_object(
      'submission_id', new.id,
      'form_type', new.form_type,
      'manager_user_id', new.manager_user_id
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_feed_form_submitted on public.form_submissions;
create trigger trg_feed_form_submitted
  after insert on public.form_submissions
  for each row
  when (new.status <> 'draft')
  execute function public.tg_feed_form_submitted();
