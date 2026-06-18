-- Forms RPCs: portal submission (anon, token-authed) + dashboard decisions.
--
-- Submission mirrors the portal_sign_* pattern (migration 117): validate the
-- (slug, access_token) session, then do everything server-side — resolve the
-- approver, snapshot the identity header and the owner-gate setting, recompute
-- totals (never trust the client's arithmetic), and insert. Decisions mirror
-- the hiring_requests manager/owner decide RPCs (migration 090).
--
-- Approver routing is org-level (organizations.forms_approver_user_id, else the
-- owner) — no department dependency. Collapse shortcuts at submit time:
--   - submitter IS the approver AND the owner → auto-approved outright.
--   - submitter IS the approver (only)        → manager step auto-stamped,
--     escalated to the owner (you can't approve your own request).

-- ─── Helper: resolve the Manager-tier approver for an org ───────────────────

create or replace function public.resolve_form_approver(p_org_id uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select o.forms_approver_user_id from public.organizations o where o.id = p_org_id),
    (select u.id from public.users u
       where u.org_id = p_org_id and u.role = 'owner'
       order by u.created_at limit 1)
  )
$$;

revoke execute on function public.resolve_form_approver(uuid) from public;
grant execute on function public.resolve_form_approver(uuid) to anon, authenticated;

-- ─── RPC: submit a leave request (Cuti) via the portal ──────────────────────

create or replace function public.portal_submit_leave_request(
  emp_slug text,
  emp_token text,
  p_field_data jsonb
)
returns public.form_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  emp public.employees%rowtype;
  new_row public.form_submissions%rowtype;
  v_leave_type text;
  v_date_start date;
  v_date_end date;
  v_total_days int := 0;
  v_replacements jsonb;
  v_identity jsonb;
  v_field_data jsonb;
  -- routing / status
  v_approver uuid;
  v_owner uuid;
  v_owner_required boolean;
  v_approver_emp uuid;
  v_owner_emp uuid;
  v_manager_self boolean;
  v_owner_self boolean;
  v_status text := 'submitted';
  v_mgr_auto boolean := false;
  v_mgr_decision text;
  v_mgr_at timestamptz;
  v_mgr_by uuid;
  v_own_decision text;
  v_own_at timestamptz;
  v_own_by uuid;
  v_committed timestamptz;
begin
  -- 1. Portal auth.
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token and deleted_at is null
  limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
  if not coalesce((select forms_enabled from public.organizations where id = emp.org_id), true) then
    raise exception 'Forms are not enabled for this organisation';
  end if;

  -- 2. Validate + recompute (server is the source of truth).
  v_leave_type := p_field_data->>'leave_type';
  if v_leave_type is null or v_leave_type not in (
    'annual','unpaid','national_holiday','sick_no_note','sick_with_note','short_time','special'
  ) then
    raise exception 'Invalid or missing leave type';
  end if;

  v_date_start := nullif(p_field_data->>'date_start', '')::date;
  v_date_end   := nullif(p_field_data->>'date_end', '')::date;

  if v_leave_type = 'short_time' then
    if v_date_start is null then
      raise exception 'A date is required for short-time';
    end if;
    if nullif(p_field_data->>'short_time_from','') is null
       or nullif(p_field_data->>'short_time_to','') is null then
      raise exception 'Short-time requires a from and to time';
    end if;
    v_total_days := 0;
  else
    if v_date_start is null then
      raise exception 'A start date is required';
    end if;
    if v_date_end is null then
      v_date_end := v_date_start;
    end if;
    if v_date_end < v_date_start then
      raise exception 'End date cannot be before the start date';
    end if;
    v_total_days := (v_date_end - v_date_start) + 1;
  end if;

  -- Replacements: at most 2, and each must be an employee in the same org.
  v_replacements := coalesce(p_field_data->'replacement_employee_ids', '[]'::jsonb);
  if jsonb_typeof(v_replacements) <> 'array' then
    raise exception 'replacement_employee_ids must be an array';
  end if;
  if jsonb_array_length(v_replacements) > 2 then
    raise exception 'At most two replacement employees may be named';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(v_replacements) r
    left join public.employees e on e.id = r::uuid and e.org_id = emp.org_id and e.deleted_at is null
    where e.id is null
  ) then
    raise exception 'A named replacement is not a valid employee in this organisation';
  end if;

  -- 3. Identity snapshot (server-resolved; never free-text).
  v_identity := jsonb_build_object(
    'name', emp.name,
    'employee_code', emp.employee_code,
    'job_position', emp.job_position,
    'job_level', emp.job_level,
    'employment_type', emp.employment_type,
    'ktp_nik', emp.ktp_nik,
    'phone', emp.phone,
    'department', (
      select d.name from public.employee_departments ed
      join public.company_departments d on d.id = ed.department_id
      where ed.employee_id = emp.id
      order by ed.is_primary desc, d.name asc
      limit 1
    )
  );

  v_field_data := (coalesce(p_field_data, '{}'::jsonb) - 'identity' - 'total_days')
    || jsonb_build_object('identity', v_identity, 'total_days', v_total_days);
  if v_leave_type <> 'short_time' then
    v_field_data := v_field_data || jsonb_build_object('date_end', to_jsonb(v_date_end));
  end if;

  -- 4. Resolve approver + owner-gate, then compute the initial status.
  v_approver       := public.resolve_form_approver(emp.org_id);
  v_owner          := (select id from public.users where org_id = emp.org_id and role = 'owner' order by created_at limit 1);
  v_owner_required := coalesce((select forms_require_owner_approval from public.organizations where id = emp.org_id), false);
  v_approver_emp   := (select employee_id from public.users where id = v_approver);
  v_owner_emp      := (select employee_id from public.users where id = v_owner);
  v_manager_self   := v_approver_emp is not null and v_approver_emp = emp.id;
  v_owner_self     := v_owner_emp is not null and v_owner_emp = emp.id;

  if v_manager_self and v_owner_self then
    -- Submitter is both the approver and the owner → nobody else to approve.
    v_status := 'approved'; v_mgr_auto := true; v_committed := now();
    v_mgr_decision := 'approved'; v_mgr_at := now(); v_mgr_by := v_approver;
    v_own_decision := 'approved'; v_own_at := now(); v_own_by := v_owner;
  elsif v_manager_self then
    -- Submitter is the manager approver → escalate to the owner (you can't
    -- approve your own), regardless of the owner-gate setting.
    v_status := 'manager_approved'; v_mgr_auto := true;
    v_mgr_decision := 'approved'; v_mgr_at := now(); v_mgr_by := v_approver;
  else
    v_status := 'submitted';
  end if;

  -- 5. Insert.
  insert into public.form_submissions (
    org_id, form_type, employee_id, submitter_user_id, submitted_via,
    manager_user_id, owner_approval_required, status, submitted_at,
    manager_decision, manager_decided_at, manager_decided_by, manager_auto_approved,
    owner_decision, owner_decided_at, owner_decided_by,
    field_data, committed_at
  ) values (
    emp.org_id, 'leave_request', emp.id, null, 'portal',
    v_approver, v_owner_required, v_status, now(),
    v_mgr_decision, v_mgr_at, v_mgr_by, v_mgr_auto,
    v_own_decision, v_own_at, v_own_by,
    v_field_data, v_committed
  ) returning * into new_row;

  return new_row;
end;
$$;

revoke execute on function public.portal_submit_leave_request(text, text, jsonb) from public;
grant execute on function public.portal_submit_leave_request(text, text, jsonb) to anon, authenticated;

-- ─── RPC: submit an overtime request (Lembur) via the portal ────────────────

create or replace function public.portal_submit_overtime_request(
  emp_slug text,
  emp_token text,
  p_field_data jsonb,
  p_line_items jsonb
)
returns public.form_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  emp public.employees%rowtype;
  new_row public.form_submissions%rowtype;
  v_work_status text;
  v_identity jsonb;
  v_field_data jsonb;
  v_item jsonb;
  v_idx int := 0;
  v_st time;
  v_et time;
  v_line_hours numeric(5,2);
  v_total_hours numeric(7,2) := 0;
  v_ot_days int := 0;
  -- routing / status
  v_approver uuid;
  v_owner uuid;
  v_owner_required boolean;
  v_approver_emp uuid;
  v_owner_emp uuid;
  v_manager_self boolean;
  v_owner_self boolean;
  v_status text := 'submitted';
  v_mgr_auto boolean := false;
  v_mgr_decision text;
  v_mgr_at timestamptz;
  v_mgr_by uuid;
  v_own_decision text;
  v_own_at timestamptz;
  v_own_by uuid;
  v_committed timestamptz;
begin
  -- 1. Portal auth.
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token and deleted_at is null
  limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
  if not coalesce((select forms_enabled from public.organizations where id = emp.org_id), true) then
    raise exception 'Forms are not enabled for this organisation';
  end if;

  -- 2. Validate header.
  v_work_status := p_field_data->>'work_status';
  if v_work_status is null or v_work_status not in ('permanent','contract','daily','piecework') then
    raise exception 'Invalid or missing work status';
  end if;
  if jsonb_typeof(coalesce(p_line_items, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_line_items) = 0 then
    raise exception 'At least one overtime line is required';
  end if;

  -- 3. Identity snapshot.
  v_identity := jsonb_build_object(
    'name', emp.name,
    'employee_code', emp.employee_code,
    'job_position', emp.job_position,
    'job_level', emp.job_level,
    'employment_type', emp.employment_type,
    'ktp_nik', emp.ktp_nik,
    'phone', emp.phone,
    'department', (
      select d.name from public.employee_departments ed
      join public.company_departments d on d.id = ed.department_id
      where ed.employee_id = emp.id
      order by ed.is_primary desc, d.name asc
      limit 1
    )
  );
  v_field_data := jsonb_build_object(
    'work_status', v_work_status,
    'identity', v_identity,
    'total_ot_hours', 0,
    'total_ot_days', 0
  );

  -- 4. Resolve approver + owner-gate, then compute the initial status.
  v_approver       := public.resolve_form_approver(emp.org_id);
  v_owner          := (select id from public.users where org_id = emp.org_id and role = 'owner' order by created_at limit 1);
  v_owner_required := coalesce((select forms_require_owner_approval from public.organizations where id = emp.org_id), false);
  v_approver_emp   := (select employee_id from public.users where id = v_approver);
  v_owner_emp      := (select employee_id from public.users where id = v_owner);
  v_manager_self   := v_approver_emp is not null and v_approver_emp = emp.id;
  v_owner_self     := v_owner_emp is not null and v_owner_emp = emp.id;

  if v_manager_self and v_owner_self then
    v_status := 'approved'; v_mgr_auto := true; v_committed := now();
    v_mgr_decision := 'approved'; v_mgr_at := now(); v_mgr_by := v_approver;
    v_own_decision := 'approved'; v_own_at := now(); v_own_by := v_owner;
  elsif v_manager_self then
    v_status := 'manager_approved'; v_mgr_auto := true;
    v_mgr_decision := 'approved'; v_mgr_at := now(); v_mgr_by := v_approver;
  else
    v_status := 'submitted';
  end if;

  -- 5. Insert the submission, then the line items (recomputing hours).
  insert into public.form_submissions (
    org_id, form_type, employee_id, submitter_user_id, submitted_via,
    manager_user_id, owner_approval_required, status, submitted_at,
    manager_decision, manager_decided_at, manager_decided_by, manager_auto_approved,
    owner_decision, owner_decided_at, owner_decided_by,
    field_data, committed_at
  ) values (
    emp.org_id, 'overtime_request', emp.id, null, 'portal',
    v_approver, v_owner_required, v_status, now(),
    v_mgr_decision, v_mgr_at, v_mgr_by, v_mgr_auto,
    v_own_decision, v_own_at, v_own_by,
    v_field_data, v_committed
  ) returning * into new_row;

  for v_item in select * from jsonb_array_elements(p_line_items) loop
    v_idx := v_idx + 1;
    v_st := (v_item->>'start_time')::time;
    v_et := (v_item->>'end_time')::time;
    if v_st is null or v_et is null or v_et <= v_st then
      raise exception 'Overtime end time must be after start time (row %)', v_idx;
    end if;
    v_line_hours := round((extract(epoch from (v_et - v_st)) / 3600.0)::numeric, 2);
    insert into public.form_line_items (
      submission_id, org_id, line_no, work_date, is_ot_day, start_time, end_time, total_hours, reason
    ) values (
      new_row.id, emp.org_id, v_idx,
      (v_item->>'work_date')::date,
      coalesce((v_item->>'is_ot_day')::boolean, false),
      v_st, v_et, v_line_hours,
      nullif(trim(coalesce(v_item->>'reason', '')), '')
    );
    v_total_hours := v_total_hours + v_line_hours;
    if v_line_hours >= 8 then v_ot_days := v_ot_days + 1; end if;
  end loop;

  update public.form_submissions
  set field_data = field_data || jsonb_build_object(
        'total_ot_hours', v_total_hours,
        'total_ot_days', v_ot_days
      )
  where id = new_row.id
  returning * into new_row;

  return new_row;
end;
$$;

revoke execute on function public.portal_submit_overtime_request(text, text, jsonb, jsonb) from public;
grant execute on function public.portal_submit_overtime_request(text, text, jsonb, jsonb) to anon, authenticated;

-- ─── RPC: list the employee's own submissions (portal) ──────────────────────

create or replace function public.portal_forms_list(
  emp_slug text,
  emp_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  emp public.employees%rowtype;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token and deleted_at is null
  limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'forms_enabled', coalesce((select forms_enabled from public.organizations where id = emp.org_id), true),
    'identity', jsonb_build_object(
      'name', emp.name,
      'employee_code', emp.employee_code,
      'job_position', emp.job_position,
      'job_level', emp.job_level,
      'employment_type', emp.employment_type,
      'ktp_nik', emp.ktp_nik,
      'phone', emp.phone,
      'department', (
        select d.name from public.employee_departments ed
        join public.company_departments d on d.id = ed.department_id
        where ed.employee_id = emp.id
        order by ed.is_primary desc, d.name asc
        limit 1
      )
    ),
    'submissions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'form_type', s.form_type,
        'status', s.status,
        'field_data', s.field_data,
        'created_at', s.created_at,
        'submitted_at', s.submitted_at,
        'committed_at', s.committed_at,
        'manager_decision', s.manager_decision,
        'manager_decision_note', s.manager_decision_note,
        'owner_decision', s.owner_decision,
        'owner_decision_note', s.owner_decision_note,
        'line_items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'line_no', li.line_no, 'work_date', li.work_date, 'is_ot_day', li.is_ot_day,
            'start_time', li.start_time, 'end_time', li.end_time,
            'total_hours', li.total_hours, 'reason', li.reason
          ) order by li.line_no)
          from public.form_line_items li where li.submission_id = s.id
        ), '[]'::jsonb)
      ) order by s.created_at desc)
      from public.form_submissions s
      where s.employee_id = emp.id and s.deleted_at is null
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.portal_forms_list(text, text) from public;
grant execute on function public.portal_forms_list(text, text) to anon, authenticated;

-- ─── RPC: manager decision (dashboard) ──────────────────────────────────────

create or replace function public.manager_decide_form(
  p_submission_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.form_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  sub public.form_submissions%rowtype;
  caller_role text;
  caller_org uuid;
  caller_emp uuid;
  v_status text;
  v_committed timestamptz;
begin
  select role, org_id, employee_id into caller_role, caller_org, caller_emp
  from public.users where id = auth.uid();

  select * into sub from public.form_submissions where id = p_submission_id and deleted_at is null;
  if sub.id is null then
    raise exception 'Form not found';
  end if;
  if sub.org_id <> caller_org then
    raise exception 'Form belongs to another organisation';
  end if;
  if sub.status <> 'submitted' then
    raise exception 'Form is not awaiting manager decision (current status: %)', sub.status;
  end if;
  if not (auth.uid() = sub.manager_user_id or caller_role in ('owner', 'admin')) then
    raise exception 'Only the designated approver can decide this form';
  end if;
  if caller_emp is not null and caller_emp = sub.employee_id then
    raise exception 'Cannot approve or reject your own request';
  end if;

  if p_approve then
    if sub.owner_approval_required then
      v_status := 'manager_approved';
    else
      v_status := 'approved';
      v_committed := now();
    end if;
  else
    v_status := 'rejected_by_manager';
  end if;

  update public.form_submissions
  set status = v_status,
      manager_decision = case when p_approve then 'approved' else 'rejected' end,
      manager_decided_at = now(),
      manager_decided_by = auth.uid(),
      manager_decision_note = nullif(trim(coalesce(p_note, '')), ''),
      committed_at = coalesce(v_committed, committed_at)
  where id = p_submission_id
  returning * into sub;

  return sub;
end;
$$;

grant execute on function public.manager_decide_form(uuid, boolean, text) to authenticated;

-- ─── RPC: owner decision (dashboard) ────────────────────────────────────────

create or replace function public.owner_decide_form(
  p_submission_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.form_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  sub public.form_submissions%rowtype;
  caller_role text;
  caller_org uuid;
begin
  select role, org_id into caller_role, caller_org
  from public.users where id = auth.uid();

  if caller_role <> 'owner' then
    raise exception 'Only the owner can make the final decision';
  end if;

  select * into sub from public.form_submissions where id = p_submission_id and deleted_at is null;
  if sub.id is null then
    raise exception 'Form not found';
  end if;
  if sub.org_id <> caller_org then
    raise exception 'Form belongs to another organisation';
  end if;
  if sub.status <> 'manager_approved' then
    raise exception 'Form is not awaiting owner decision (current status: %)', sub.status;
  end if;

  update public.form_submissions
  set status = case when p_approve then 'approved' else 'rejected_by_owner' end,
      owner_decision = case when p_approve then 'approved' else 'rejected' end,
      owner_decided_at = now(),
      owner_decided_by = auth.uid(),
      owner_decision_note = nullif(trim(coalesce(p_note, '')), ''),
      committed_at = case when p_approve then now() else committed_at end
  where id = p_submission_id
  returning * into sub;

  return sub;
end;
$$;

grant execute on function public.owner_decide_form(uuid, boolean, text) to authenticated;
