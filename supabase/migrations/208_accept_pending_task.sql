-- Phase 2: accept a pending_task into the real tasks table, atomically.
--
-- SECURITY INVOKER (not DEFINER): the function runs as the logged-in owner/admin,
-- so the existing RLS on both pending_tasks and tasks applies unchanged — a plain
-- authenticated insert already satisfies tasks' `WITH CHECK (org_id =
-- get_user_org_id())`, so no bypass is needed. The value of the function is
-- ATOMICITY: the two writes (insert the task, stamp the pending row) run in one
-- transaction, so a half-accept can't happen (the un-transacted flaw the SOP
-- accept path has). The caller passes final field values — the review card is a
-- prefilled editor — which we validate against the caller's own org before use.
--
-- Reject stays a plain client-side UPDATE under RLS (no RPC needed): it's a
-- single-row status flip.

create or replace function public.accept_pending_task(
  p_pending_id            uuid,
  p_title                 text,
  p_notes                 text    default null,
  p_due_date              date    default null,
  p_priority              smallint default 2,
  p_assignee_employee_id  uuid    default null,
  p_assignee_user_id      uuid    default null,
  p_project_id            uuid    default null,
  p_visible_in_portal     boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org     uuid := public.get_user_org_id();
  v_pending public.pending_tasks%rowtype;
  v_task_id uuid;
begin
  if v_org is null then
    raise exception 'Not authorized';
  end if;

  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Title is required';
  end if;

  -- Load the proposal (RLS already scopes this to the caller's org).
  select * into v_pending from public.pending_tasks where id = p_pending_id;
  if v_pending.id is null then
    raise exception 'Pending task not found';
  end if;
  if v_pending.status <> 'pending' then
    raise exception 'Pending task already %', v_pending.status;
  end if;

  -- Mirror tasks_single_assignee: at most one assignee kind.
  if p_assignee_employee_id is not null and p_assignee_user_id is not null then
    raise exception 'A task can be assigned to only one of employee or user';
  end if;

  -- Never trust the client: the assignee / project must belong to this org.
  -- (The picker only offers valid people, but this is the real boundary.)
  if p_assignee_employee_id is not null and not exists (
    select 1 from public.employees
    where id = p_assignee_employee_id and org_id = v_org and deleted_at is null
  ) then
    raise exception 'Assignee employee not in your organization';
  end if;

  if p_assignee_user_id is not null and not exists (
    select 1 from public.users where id = p_assignee_user_id and org_id = v_org
  ) then
    raise exception 'Assignee user not in your organization';
  end if;

  if p_project_id is not null and not exists (
    select 1 from public.task_projects
    where id = p_project_id and org_id = v_org and deleted_at is null
  ) then
    raise exception 'Project not in your organization';
  end if;

  insert into public.tasks (
    org_id, title, notes, due_date, priority,
    assignee_employee_id, assignee_user_id, project_id,
    visible_in_portal, created_by
  ) values (
    v_org,
    trim(p_title),
    nullif(trim(coalesce(p_notes, '')), ''),
    p_due_date,
    greatest(0, least(3, coalesce(p_priority, 2))),
    p_assignee_employee_id,
    p_assignee_user_id,
    p_project_id,
    coalesce(p_visible_in_portal, false),
    auth.uid()
  )
  returning id into v_task_id;

  update public.pending_tasks
  set status          = 'accepted',
      created_task_id = v_task_id,
      reviewed_by     = auth.uid(),
      resolved_at     = now()
  where id = p_pending_id;

  return v_task_id;
end;
$$;

grant execute on function public.accept_pending_task(
  uuid, text, text, date, smallint, uuid, uuid, uuid, boolean
) to authenticated;
