-- Portal tasks (Phase 5): token-scoped RPCs so an employee sees and completes
-- the tasks assigned to them. The portal is public/anon — employees have no
-- login and authenticate with their slug + access_token — so these run as
-- SECURITY DEFINER and MUST self-filter to the token-holder's own visible,
-- non-deleted tasks (RLS is bypassed). Mirrors the portal_* pattern
-- (portal_feed / portal_sign_sop).

-- ─── portal_list_tasks ──────────────────────────────────────────────────────
--
-- Returns the caller's assigned, portal-visible, non-deleted tasks as a jsonb
-- array (dated first by due date, then manual position), each joined to its
-- project name + colour for display.

create or replace function public.portal_list_tasks(
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

  return coalesce((
    select jsonb_agg(obj order by ord_due_null, ord_due, ord_pos)
    from (
      select
        jsonb_build_object(
          'id', t.id,
          'title', t.title,
          'notes', t.notes,
          'status', t.status,
          'priority', t.priority,
          'due_date', t.due_date,
          'project_name', p.name,
          'project_color', p.color
        ) as obj,
        (t.due_date is null) as ord_due_null,
        t.due_date as ord_due,
        t.position as ord_pos
      from public.tasks t
      left join public.task_projects p
        on p.id = t.project_id and p.deleted_at is null
      where t.org_id = emp.org_id
        and t.assignee_employee_id = emp.id
        and t.visible_in_portal is true
        and t.deleted_at is null
    ) s
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.portal_list_tasks(text, text) from public;
grant execute on function public.portal_list_tasks(text, text) to anon, authenticated;

-- ─── portal_set_task_status ─────────────────────────────────────────────────
--
-- Flips one of the caller's OWN visible tasks to a valid status. Every guard is
-- explicit because SECURITY DEFINER bypasses RLS: the task must exist, be in the
-- caller's org, be assigned to the caller, and be portal-visible.

create or replace function public.portal_set_task_status(
  emp_slug text,
  emp_token text,
  p_task_id uuid,
  p_status text
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  emp public.employees%rowtype;
  tsk public.tasks%rowtype;
  new_row public.tasks%rowtype;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token and deleted_at is null
  limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  if p_status not in ('todo', 'in_progress', 'blocked', 'done') then
    raise exception 'Invalid status: %', p_status;
  end if;

  select * into tsk from public.tasks
  where id = p_task_id and deleted_at is null;
  if tsk.id is null then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  if tsk.org_id <> emp.org_id then
    raise exception 'Task belongs to another organisation';
  end if;
  if tsk.assignee_employee_id is distinct from emp.id then
    raise exception 'You are not assigned to this task';
  end if;
  if not tsk.visible_in_portal then
    raise exception 'This task is not visible in the portal';
  end if;

  update public.tasks
  set status = p_status,
      completed_at = case when p_status = 'done' then coalesce(completed_at, now()) else null end
  where id = p_task_id
  returning * into new_row;

  return new_row;
end;
$$;

revoke execute on function public.portal_set_task_status(text, text, uuid, text) from public;
grant execute on function public.portal_set_task_status(text, text, uuid, text) to anon, authenticated;
