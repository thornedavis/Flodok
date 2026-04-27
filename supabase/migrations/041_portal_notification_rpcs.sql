-- Notification RPCs for the employee portal bell
--
-- Follows the same (emp_slug, emp_token) auth pattern as portal_home and
-- portal_leaderboard — the portal is token-authenticated, not Supabase-auth,
-- so these SECURITY DEFINER RPCs validate the (slug, token) pair internally
-- and refuse to return data for any other employee.
--
-- portal_unread_count(emp_slug, emp_token)
--   Returns count of informational feed_events newer than the employee's
--   last_notifications_seen_at cursor. Pending actionable items (unsigned
--   SOPs / contracts) are computed client-side from existing data and added
--   to this count for the bell badge total.
--
-- portal_mark_notifications_seen(emp_slug, emp_token)
--   Sets the employee's cursor to now(). Called when the bell dropdown opens
--   so informational items drop out of the unread count.


create or replace function public.portal_unread_count(
  emp_slug text,
  emp_token text
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  emp public.employees%rowtype;
  v_count int;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token
  limit 1;

  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  select count(*) into v_count
  from public.feed_events
  where employee_id = emp.id
    and event_type in ('achievement_unlocked', 'bonus_awarded')
    and created_at > coalesce(emp.last_notifications_seen_at, emp.created_at);

  return v_count;
end;
$$;


create or replace function public.portal_mark_notifications_seen(
  emp_slug text,
  emp_token text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  emp public.employees%rowtype;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token
  limit 1;

  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  update public.employees
  set last_notifications_seen_at = now()
  where id = emp.id;
end;
$$;


-- Both RPCs are callable by anon (the portal context).
grant execute on function public.portal_unread_count(text, text) to anon, authenticated;
grant execute on function public.portal_mark_notifications_seen(text, text) to anon, authenticated;
