-- portal_list_tasks: + project_id, so the employee portal can group and filter
-- tasks by project with a stable key (name + color alone can't disambiguate two
-- like-named lists). Read-only and already org-scoped inside the SECURITY
-- DEFINER body, so this exposes nothing new — it just adds the id already used
-- for the join. Mirrors how 202 refreshed this function to add due_time + url.

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
          'due_time', t.due_time,
          'url', t.url,
          'project_id', t.project_id,
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
