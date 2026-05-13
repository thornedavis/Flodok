-- Hiring requests: the planning artifact that precedes any candidate.
--
-- A department head identifies a need, fills the request form (mirrors the
-- paper template), and submits it for approval. The chain is at most two
-- steps: the department's manager, then the org owner. A self-request
-- shortcut auto-stamps the manager step when the requester IS the
-- department's manager (filed in submit_hiring_request below).
--
-- Once approved, HR creates a Job Description from it (migration 091) and
-- eventually a candidate (Recruitment page). The request is closed
-- ('actioned') when a candidate has been created from it; the
-- candidate_employee_id FK records the eventual hire so the audit trail
-- runs Request → JD → Candidate → Employee.
--
-- Rejection is terminal. The requester can submit a fresh request with
-- revised reasoning, but cannot resurrect a rejected one.

-- ─── Table ────────────────────────────────────────────────────────────────

create table if not exists public.hiring_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,

  -- Requester block
  hiring_manager_id uuid not null references public.users(id) on delete restrict,
  department_id uuid not null references public.company_departments(id) on delete restrict,

  -- Position block
  employment_type text not null check (employment_type in ('freelance', 'fixed_contract', 'permanent')),
  category text not null check (category in ('new_hire', 'replacement')),
  replacing_employee_id uuid references public.employees(id) on delete set null,
  source_of_candidate text not null check (source_of_candidate in ('internal', 'external')),
  position_name text not null check (length(trim(position_name)) > 0),
  required_qualifications_md text not null default '',
  expected_hiring_date date,
  supporting_reason text not null default '',

  -- Remuneration block (IDR)
  source_of_fund text not null check (source_of_fund in ('budgeted', 'non_budgeted')),
  source_of_fund_justification text,
  base_salary_min bigint,
  base_salary_max bigint,
  allowances text[] not null default '{}',  -- meal | transport | overtime | incentive | bonus | other
  allowance_other text,
  other_benefits text,

  -- Workflow state. The chain advances one step at a time via the RPCs
  -- defined below; the table can only be reached by direct UPDATE for the
  -- requester's own pre-decision edits (RLS gated).
  status text not null default 'draft' check (status in (
    'draft',
    'submitted',
    'manager_approved',
    'approved',
    'rejected_by_manager',
    'rejected_by_owner',
    'actioned'
  )),
  submitted_at timestamptz,

  -- Manager step (department manager). Auto-stamped when the requester
  -- IS the department's manager (manager_auto_approved=true) so the
  -- requester doesn't have to approve their own request.
  manager_decision text check (manager_decision in ('approved', 'rejected')),
  manager_decided_at timestamptz,
  manager_decided_by uuid references public.users(id) on delete set null,
  manager_decision_note text,
  manager_auto_approved boolean not null default false,

  -- Owner step (final budget/headcount sign-off).
  owner_decision text check (owner_decision in ('approved', 'rejected')),
  owner_decided_at timestamptz,
  owner_decided_by uuid references public.users(id) on delete set null,
  owner_decision_note text,

  -- HR handoff. Set when a candidate is created from this request — closes
  -- the request and creates the audit-trail link.
  actioned_at timestamptz,
  actioned_by uuid references public.users(id) on delete set null,
  candidate_employee_id uuid references public.employees(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Salary range sanity (min ≤ max when both set).
  constraint hiring_requests_salary_range_check check (
    base_salary_min is null
    or base_salary_max is null
    or base_salary_min <= base_salary_max
  )
);

create index if not exists idx_hiring_requests_org_status
  on public.hiring_requests (org_id, status, created_at desc);

create index if not exists idx_hiring_requests_requester
  on public.hiring_requests (hiring_manager_id, created_at desc);

create index if not exists idx_hiring_requests_department
  on public.hiring_requests (department_id, status);

create index if not exists idx_hiring_requests_candidate
  on public.hiring_requests (candidate_employee_id)
  where candidate_employee_id is not null;

create or replace function public.tg_hiring_requests_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_hiring_requests_touch on public.hiring_requests;
create trigger trg_hiring_requests_touch
  before update on public.hiring_requests
  for each row execute function public.tg_hiring_requests_touch();

-- ─── RLS ──────────────────────────────────────────────────────────────────

alter table public.hiring_requests enable row level security;

-- Visibility:
--   - Requester always sees their own request (any state, including drafts).
--   - Owner / admin / hr see every request in the org.
--   - A department manager (user linked to the employee set as the dept's
--     manager_employee_id) sees all requests for departments they manage.
--   - Everyone else (regular members) sees only their own.
create policy "Hiring requests visible to authorised viewers"
  on public.hiring_requests for select to authenticated
  using (
    org_id = public.get_user_org_id()
    and (
      hiring_manager_id = auth.uid()
      or public.get_user_role() in ('owner', 'admin', 'hr')
      or department_id in (
        select d.id
        from public.company_departments d
        join public.users u on u.id = auth.uid()
        where d.org_id = u.org_id
          and d.manager_employee_id is not null
          and d.manager_employee_id = u.employee_id
      )
    )
  );

-- Creation: any signed-in user in the org can create a request for
-- themselves. They cannot create on behalf of someone else.
create policy "Users can create their own hiring requests"
  on public.hiring_requests for insert to authenticated
  with check (
    org_id = public.get_user_org_id()
    and hiring_manager_id = auth.uid()
  );

-- Direct edits: only the original requester, only while no decisions have
-- been recorded yet (status in draft/submitted). Owner edits, approvals,
-- and handoff go through SECURITY DEFINER RPCs below — they bypass this
-- policy intentionally.
create policy "Requester can edit while pre-decision"
  on public.hiring_requests for update to authenticated
  using (
    org_id = public.get_user_org_id()
    and hiring_manager_id = auth.uid()
    and status in ('draft', 'submitted')
  )
  with check (
    org_id = public.get_user_org_id()
    and hiring_manager_id = auth.uid()
    and status in ('draft', 'submitted')
  );

-- Deletion: only by the requester, only while it's a draft (never deletes
-- an actively-routing or actioned request — those leave audit trail).
create policy "Requester can delete own drafts"
  on public.hiring_requests for delete to authenticated
  using (
    org_id = public.get_user_org_id()
    and hiring_manager_id = auth.uid()
    and status = 'draft'
  );

-- ─── Helper: is the calling user the manager of this department? ─────────

create or replace function public.is_department_manager(p_department_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.company_departments d
    join public.users u on u.id = auth.uid()
    where d.id = p_department_id
      and d.org_id = u.org_id
      and d.manager_employee_id is not null
      and d.manager_employee_id = u.employee_id
  )
$$;

grant execute on function public.is_department_manager(uuid) to authenticated;

-- ─── RPC: submit a draft for approval ────────────────────────────────────

-- Moves draft → submitted (or → manager_approved if the requester is also
-- the department's manager, via the self-request shortcut). Validates that
-- the request is currently a draft owned by the caller and that the
-- required fields are populated.
create or replace function public.submit_hiring_request(p_request_id uuid)
returns public.hiring_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.hiring_requests%rowtype;
  caller_employee_id uuid;
  dept_manager_id uuid;
  shortcut boolean := false;
begin
  select * into req from public.hiring_requests where id = p_request_id;
  if req.id is null then
    raise exception 'Request not found';
  end if;

  if req.hiring_manager_id <> auth.uid() then
    raise exception 'Only the requester can submit this request';
  end if;

  if req.status <> 'draft' then
    raise exception 'Only drafts can be submitted (current status: %)', req.status;
  end if;

  -- Required field gate beyond the column-level NOT NULL checks: ensure
  -- the position name and an expected hiring date are filled in. Salary
  -- range is optional at submission so HR can fill it in later if needed.
  if length(trim(req.position_name)) = 0 then
    raise exception 'Position name is required to submit';
  end if;
  if req.expected_hiring_date is null then
    raise exception 'Expected hiring date is required to submit';
  end if;

  -- Self-request shortcut: if the caller's linked employee record is set
  -- as the department's manager, auto-stamp the manager step. The owner
  -- still has to approve the budget side.
  select u.employee_id into caller_employee_id
  from public.users u where u.id = auth.uid();

  select d.manager_employee_id into dept_manager_id
  from public.company_departments d where d.id = req.department_id;

  shortcut := (caller_employee_id is not null
               and dept_manager_id is not null
               and caller_employee_id = dept_manager_id);

  if shortcut then
    update public.hiring_requests
    set status = 'manager_approved',
        submitted_at = now(),
        manager_decision = 'approved',
        manager_decided_at = now(),
        manager_decided_by = auth.uid(),
        manager_decision_note = null,
        manager_auto_approved = true
    where id = p_request_id
    returning * into req;
  else
    update public.hiring_requests
    set status = 'submitted',
        submitted_at = now()
    where id = p_request_id
    returning * into req;
  end if;

  return req;
end;
$$;

grant execute on function public.submit_hiring_request(uuid) to authenticated;

-- ─── RPC: manager decision ───────────────────────────────────────────────

create or replace function public.manager_decide_hiring_request(
  p_request_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.hiring_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.hiring_requests%rowtype;
begin
  select * into req from public.hiring_requests where id = p_request_id;
  if req.id is null then
    raise exception 'Request not found';
  end if;

  if req.status <> 'submitted' then
    raise exception 'Request is not awaiting manager decision (current status: %)', req.status;
  end if;

  if not public.is_department_manager(req.department_id) then
    raise exception 'Only the department manager can decide this request';
  end if;

  if req.hiring_manager_id = auth.uid() then
    raise exception 'Cannot approve or reject your own request';
  end if;

  update public.hiring_requests
  set status = case when p_approve then 'manager_approved' else 'rejected_by_manager' end,
      manager_decision = case when p_approve then 'approved' else 'rejected' end,
      manager_decided_at = now(),
      manager_decided_by = auth.uid(),
      manager_decision_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_request_id
  returning * into req;

  return req;
end;
$$;

grant execute on function public.manager_decide_hiring_request(uuid, boolean, text) to authenticated;

-- ─── RPC: owner decision ─────────────────────────────────────────────────

create or replace function public.owner_decide_hiring_request(
  p_request_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.hiring_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.hiring_requests%rowtype;
  caller_role text;
  caller_org uuid;
begin
  select role, org_id into caller_role, caller_org
  from public.users where id = auth.uid();

  if caller_role <> 'owner' then
    raise exception 'Only the owner can make final decisions on hiring requests';
  end if;

  select * into req from public.hiring_requests where id = p_request_id;
  if req.id is null then
    raise exception 'Request not found';
  end if;

  if req.org_id <> caller_org then
    raise exception 'Request belongs to another organisation';
  end if;

  if req.status <> 'manager_approved' then
    raise exception 'Request is not awaiting owner decision (current status: %)', req.status;
  end if;

  update public.hiring_requests
  set status = case when p_approve then 'approved' else 'rejected_by_owner' end,
      owner_decision = case when p_approve then 'approved' else 'rejected' end,
      owner_decided_at = now(),
      owner_decided_by = auth.uid(),
      owner_decision_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_request_id
  returning * into req;

  return req;
end;
$$;

grant execute on function public.owner_decide_hiring_request(uuid, boolean, text) to authenticated;

-- ─── RPC: mark a request actioned (HR handoff) ───────────────────────────

-- Called when HR creates a candidate from an approved request. Stamps the
-- request with the resulting employee FK and flips status to 'actioned'.
create or replace function public.mark_hiring_request_actioned(
  p_request_id uuid,
  p_candidate_employee_id uuid
)
returns public.hiring_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.hiring_requests%rowtype;
  caller_role text;
  caller_org uuid;
  candidate_org uuid;
begin
  select role, org_id into caller_role, caller_org
  from public.users where id = auth.uid();

  if caller_role not in ('owner', 'admin', 'hr') then
    raise exception 'Not authorized to action hiring requests';
  end if;

  select * into req from public.hiring_requests where id = p_request_id;
  if req.id is null then
    raise exception 'Request not found';
  end if;

  if req.org_id <> caller_org then
    raise exception 'Request belongs to another organisation';
  end if;

  if req.status <> 'approved' then
    raise exception 'Only approved requests can be actioned (current status: %)', req.status;
  end if;

  select org_id into candidate_org
  from public.employees where id = p_candidate_employee_id;

  if candidate_org is null or candidate_org <> caller_org then
    raise exception 'Candidate not found in your organisation';
  end if;

  update public.hiring_requests
  set status = 'actioned',
      actioned_at = now(),
      actioned_by = auth.uid(),
      candidate_employee_id = p_candidate_employee_id
  where id = p_request_id
  returning * into req;

  return req;
end;
$$;

grant execute on function public.mark_hiring_request_actioned(uuid, uuid) to authenticated;
