-- Spotlight republish: re-fire an already-published post so it resurfaces
-- to every targeted employee (bell, banner, modal) and bumps a counter the
-- manager UI can use to flag posts that keep needing reminders.
--
-- Adds:
--   spotlight_posts.republish_count  — total times this post has been re-fired
--   spotlight_posts.last_republished_at — timestamp of most recent republish
--
-- Adds RPC public.republish_spotlight_post(post_id) which:
--   1. Validates the caller is in the same org as the post
--   2. Requires the post to be in 'published' status (use unarchive for archived)
--   3. Resets per-employee view state so banner/modal re-surface
--   4. Increments republish_count, sets last_republished_at and published_at
--   5. Inserts feed_events for the audience (with metadata.republish = true)
--
-- The existing fan-out trigger only fires on transitions INTO 'published',
-- so it doesn't double-fire when this RPC runs (status was already published).
--
-- Updates portal_spotlight_posts to return republish_count so the portal
-- can render a "Reminder #N" pill.

alter table public.spotlight_posts
  add column if not exists republish_count int not null default 0,
  add column if not exists last_republished_at timestamptz;

create or replace function public.republish_spotlight_post(p_post_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_post public.spotlight_posts%rowtype;
  v_caller_org uuid;
begin
  -- Caller must be authenticated and in the same org as the post.
  select org_id into v_caller_org from public.users where id = auth.uid();
  if v_caller_org is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_post from public.spotlight_posts where id = p_post_id;
  if v_post.id is null then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;
  if v_post.org_id <> v_caller_org then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_post.status <> 'published' then
    raise exception 'Post must be published before it can be republished'
      using errcode = 'P0001';
  end if;

  -- Reset per-employee state so banner/modal re-fire and the bell repings.
  delete from public.spotlight_post_views where post_id = p_post_id;

  -- Bump counters and freshen published_at so feeds re-sort.
  update public.spotlight_posts
  set republish_count = republish_count + 1,
      last_republished_at = now(),
      published_at = now()
  where id = p_post_id;

  -- Manual fan-out — the existing trigger only fires on first publish.
  insert into public.feed_events (org_id, employee_id, event_type, title, description, metadata)
  select
    v_post.org_id,
    e_id,
    'spotlight_published',
    v_post.title,
    v_post.what_happened,
    jsonb_build_object(
      'post_id', v_post.id,
      'priority', v_post.priority,
      'republish', true,
      'republish_count', v_post.republish_count + 1
    )
  from public.spotlight_target_employee_ids(v_post.id) e_id;
end;
$$;

revoke all on function public.republish_spotlight_post(uuid) from public;
grant execute on function public.republish_spotlight_post(uuid) to authenticated;

-- Re-create the portal RPC to include republish_count in the return shape
-- so the portal can render reminder badges.
drop function if exists public.portal_spotlight_posts(text, text);

create or replace function public.portal_spotlight_posts(
  emp_slug text,
  emp_token text
)
returns table (
  id uuid,
  title text,
  author_name text,
  what_happened text,
  what_to_do_instead text,
  who_applies_note text,
  priority text,
  display_mode text,
  requires_acknowledgement boolean,
  effective_from timestamptz,
  effective_until timestamptz,
  pinned boolean,
  published_at timestamptz,
  republish_count int,
  first_seen_at timestamptz,
  acknowledged_at timestamptz,
  dismissed_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  emp public.employees%rowtype;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token
  limit 1;

  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  return query
  select
    p.id,
    p.title,
    case
      when p.posted_as_kind = 'org' then coalesce(o.display_name, o.name, '')
      else coalesce(u.name, '')
    end as author_name,
    p.what_happened,
    p.what_to_do_instead,
    p.who_applies_note,
    p.priority,
    p.display_mode,
    p.requires_acknowledgement,
    p.effective_from,
    p.effective_until,
    p.pinned,
    p.published_at,
    p.republish_count,
    v.first_seen_at,
    v.acknowledged_at,
    v.dismissed_at
  from public.spotlight_posts p
  left join public.users u on u.id = p.created_by
  left join public.organizations o on o.id = p.org_id
  left join public.spotlight_post_views v
    on v.post_id = p.id and v.employee_id = emp.id
  where p.org_id = emp.org_id
    and p.status = 'published'
    and (p.effective_from is null or p.effective_from <= now())
    and (p.effective_until is null or p.effective_until > now())
    and (
      p.visibility_scope = 'org_wide'
      or (
        p.visibility_scope = 'departments'
        and exists (
          select 1 from unnest(p.target_departments) d
          where d = any(coalesce(emp.departments, array[]::text[]))
            or d = emp.department
        )
      )
      or (
        p.visibility_scope = 'specific_employees'
        and emp.id = any(p.target_employee_ids)
      )
    )
  order by p.pinned desc, p.published_at desc nulls last;
end;
$$;

grant execute on function public.portal_spotlight_posts(text, text) to anon, authenticated;
