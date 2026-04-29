-- Spotlight: org-wide announcement / learning board.
--
-- Posts are authored from the dashboard and surfaced in the employee portal
-- via a feed tab, an optional top-of-home banner, and an optional
-- acknowledge-required modal. Targeting is org-wide, by department(s), or
-- by specific employee(s). Per-employee read state lives in
-- spotlight_post_views; the existing portal bell picks up new posts via a
-- 'spotlight_published' fan-out into feed_events.

-- ─── Tables ─────────────────────────────────────────────

create table if not exists spotlight_posts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations on delete cascade,
  created_by uuid references users on delete set null,

  -- Display author override. NULL falls back to the creator's name on read.
  posted_as text,

  -- Content (structured template — what happened / what to do instead).
  title text not null,
  what_happened text not null,
  what_to_do_instead text not null,
  who_applies_note text,

  -- Surfacing controls. priority is the conceptual urgency (drives WhatsApp
  -- routing later); display_mode is the actual UI behaviour. They're
  -- intentionally separate so admins can fine-tune.
  priority text not null default 'fyi'
    check (priority in ('critical', 'important', 'fyi')),
  display_mode text not null default 'bell_only'
    check (display_mode in ('modal', 'banner', 'bell_only')),
  requires_acknowledgement boolean not null default false,

  -- Targeting.
  visibility_scope text not null default 'org_wide'
    check (visibility_scope in ('org_wide', 'departments', 'specific_employees')),
  target_departments text[] not null default '{}',
  target_employee_ids uuid[] not null default '{}',

  -- Lifecycle.
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'published', 'archived')),
  effective_from timestamptz,
  effective_until timestamptz,
  pinned boolean not null default false,

  -- Audit.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create index idx_spotlight_posts_org_status
  on spotlight_posts (org_id, status, effective_from desc);

-- Per-employee read / acknowledgement state. Rows are created lazily the
-- first time an employee sees, dismisses, or acknowledges a post.
create table if not exists spotlight_post_views (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references spotlight_posts on delete cascade,
  employee_id uuid not null references employees on delete cascade,
  first_seen_at timestamptz,
  acknowledged_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (post_id, employee_id)
);

create index idx_spotlight_post_views_post on spotlight_post_views (post_id);
create index idx_spotlight_post_views_employee on spotlight_post_views (employee_id);

-- Touch updated_at on row update.
create or replace function public.touch_spotlight_post()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_spotlight_post_touch on spotlight_posts;
create trigger trg_spotlight_post_touch
  before update on spotlight_posts
  for each row execute function public.touch_spotlight_post();

-- ─── RLS ────────────────────────────────────────────────

alter table spotlight_posts enable row level security;
alter table spotlight_post_views enable row level security;

-- Managers (logged-in users in the same org) can manage everything.
create policy "Managers can manage spotlight posts"
  on spotlight_posts for all
  to authenticated
  using (org_id in (select org_id from users where id = auth.uid()))
  with check (org_id in (select org_id from users where id = auth.uid()));

create policy "Managers can manage spotlight views"
  on spotlight_post_views for all
  to authenticated
  using (
    post_id in (
      select id from spotlight_posts
      where org_id in (select org_id from users where id = auth.uid())
    )
  );

-- Anon (portal) reads/writes happen exclusively via SECURITY DEFINER RPCs
-- below; no anon policies — keeps cross-org data from leaking.

-- ─── Audience helper ────────────────────────────────────

-- Returns the active employees a post should reach. Used by the publish
-- fan-out trigger.
create or replace function public.spotlight_target_employee_ids(p_post_id uuid)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select e.id
  from public.employees e
  join public.spotlight_posts p on p.id = p_post_id
  where e.org_id = p.org_id
    and e.status = 'active'
    and (
      p.visibility_scope = 'org_wide'
      or (
        p.visibility_scope = 'departments'
        and exists (
          select 1 from unnest(p.target_departments) d
          where d = any(coalesce(e.departments, array[]::text[]))
            or d = e.department
        )
      )
      or (
        p.visibility_scope = 'specific_employees'
        and e.id = any(p.target_employee_ids)
      )
    )
$$;

-- ─── Portal RPCs (token-authed) ─────────────────────────
--
-- The portal is token-authenticated via (slug, access_token), not Supabase
-- auth, so these SECURITY DEFINER RPCs validate the pair internally and
-- refuse to return data for any other employee. Same pattern as
-- portal_home / portal_unread_count.

-- Returns posts visible to this employee, with their per-post view state.
create or replace function public.portal_spotlight_posts(
  emp_slug text,
  emp_token text
)
returns table (
  id uuid,
  title text,
  posted_as text,
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
    p.posted_as,
    coalesce(u.name, '') as author_name,
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
    v.first_seen_at,
    v.acknowledged_at,
    v.dismissed_at
  from public.spotlight_posts p
  left join public.spotlight_post_views v
    on v.post_id = p.id and v.employee_id = emp.id
  left join public.users u on u.id = p.created_by
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

-- Idempotent first-seen recorder.
create or replace function public.portal_spotlight_seen(
  emp_slug text,
  emp_token text,
  p_post_id uuid
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  emp public.employees%rowtype;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token
  limit 1;

  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  insert into public.spotlight_post_views (post_id, employee_id, first_seen_at)
  values (p_post_id, emp.id, now())
  on conflict (post_id, employee_id) do update
    set first_seen_at = coalesce(spotlight_post_views.first_seen_at, excluded.first_seen_at);
end;
$$;

create or replace function public.portal_spotlight_acknowledge(
  emp_slug text,
  emp_token text,
  p_post_id uuid
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  emp public.employees%rowtype;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token
  limit 1;

  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  insert into public.spotlight_post_views (post_id, employee_id, first_seen_at, acknowledged_at)
  values (p_post_id, emp.id, now(), now())
  on conflict (post_id, employee_id) do update
    set first_seen_at = coalesce(spotlight_post_views.first_seen_at, excluded.first_seen_at),
        acknowledged_at = coalesce(spotlight_post_views.acknowledged_at, excluded.acknowledged_at);
end;
$$;

create or replace function public.portal_spotlight_dismiss(
  emp_slug text,
  emp_token text,
  p_post_id uuid
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  emp public.employees%rowtype;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token
  limit 1;

  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  insert into public.spotlight_post_views (post_id, employee_id, first_seen_at, dismissed_at)
  values (p_post_id, emp.id, now(), now())
  on conflict (post_id, employee_id) do update
    set first_seen_at = coalesce(spotlight_post_views.first_seen_at, excluded.first_seen_at),
        dismissed_at = coalesce(spotlight_post_views.dismissed_at, excluded.dismissed_at);
end;
$$;

grant execute on function public.portal_spotlight_posts(text, text) to anon, authenticated;
grant execute on function public.portal_spotlight_seen(text, text, uuid) to anon, authenticated;
grant execute on function public.portal_spotlight_acknowledge(text, text, uuid) to anon, authenticated;
grant execute on function public.portal_spotlight_dismiss(text, text, uuid) to anon, authenticated;

-- ─── Bell integration ───────────────────────────────────
--
-- A 'spotlight_published' feed_event is fanned out per targeted employee
-- when a post transitions to published. The existing portal bell already
-- displays feed_events; we just teach the unread-count RPC about the new
-- type.

alter table public.feed_events
  drop constraint if exists feed_events_event_type_check;

alter table public.feed_events
  add constraint feed_events_event_type_check
  check (event_type in (
    'sop_signed', 'sop_updated', 'sop_assigned',
    'contract_assigned', 'contract_updated',
    'bonus_awarded',
    'welcome',
    'achievement_unlocked',
    'spotlight_published'
  ));

create or replace function public.fanout_spotlight_published()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and (old.status is distinct from 'published') then
    if new.published_at is null then
      new.published_at = now();
    end if;
    insert into public.feed_events (org_id, employee_id, event_type, title, description, metadata)
    select
      new.org_id,
      e_id,
      'spotlight_published',
      new.title,
      new.what_happened,
      jsonb_build_object('post_id', new.id, 'priority', new.priority)
    from public.spotlight_target_employee_ids(new.id) e_id;
  end if;
  return new;
end;
$$;

-- BEFORE-trigger so we can also stamp published_at in the same transaction.
drop trigger if exists trg_spotlight_fanout on spotlight_posts;
create trigger trg_spotlight_fanout
  before insert or update of status on spotlight_posts
  for each row execute function public.fanout_spotlight_published();

-- Surface spotlight notifications in the existing portal bell.
create or replace function public.portal_unread_count(
  emp_slug text,
  emp_token text
)
returns int
language plpgsql stable security definer set search_path = public as $$
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
    and event_type in ('achievement_unlocked', 'bonus_awarded', 'spotlight_published')
    and created_at > coalesce(emp.last_notifications_seen_at, emp.created_at);

  return v_count;
end;
$$;
