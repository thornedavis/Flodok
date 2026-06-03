-- Make letters a first-class trash entity.
--
-- 120_letters_trash.sql taught trash_document about 'letter', but the four
-- sibling RPCs (last defined in 108_trash_more_rpcs.sql) were never extended,
-- so a soft-deleted letter could not be listed, restored, purged, or emptied,
-- and no purge-cron job reaped it at 30 days. The "Delete" button added to the
-- letter editor made that gap user-reachable: deleting a letter stranded it
-- permanently with no recovery path. Letters carry the same soft-delete columns
-- as other documents (deleted_at, deleted_by, trashed_with_parent_id), so each
-- branch mirrors the existing 'contract' arm.

-- ─── restore_item: + 'letter' ──────────────────────────

create or replace function public.restore_item(
  p_item_id uuid,
  p_item_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item_org uuid;
begin
  if p_item_type = 'employee' then
    select org_id into item_org from public.employees
    where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'sop' then
    select org_id into item_org from public.sops
    where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'contract' then
    select org_id into item_org from public.contracts
    where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'letter' then
    select org_id into item_org from public.letters
    where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'job_description' then
    select org_id into item_org from public.job_descriptions
    where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'hiring_request' then
    select org_id into item_org from public.hiring_requests
    where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'spotlight_post' then
    select org_id into item_org from public.spotlight_posts
    where id = p_item_id and deleted_at is not null;
  else
    raise exception 'Unknown item_type: %', p_item_type;
  end if;

  if item_org is null then
    raise exception 'Item not found in trash';
  end if;

  -- Spotlight matches the "any user in org" pattern; everything else
  -- requires the standard role gate.
  if p_item_type = 'spotlight_post' then
    perform public._trash_assert_caller_in_org(item_org);
  else
    perform public._trash_assert_caller_authorized(item_org);
  end if;

  if p_item_type = 'employee' then
    update public.employees
    set deleted_at = null, deleted_by = null
    where id = p_item_id;

    update public.sops
    set deleted_at = null, deleted_by = null, trashed_with_parent_id = null
    where trashed_with_parent_id = p_item_id;

    update public.contracts
    set deleted_at = null, deleted_by = null, trashed_with_parent_id = null
    where trashed_with_parent_id = p_item_id;
  elsif p_item_type = 'sop' then
    update public.sops
    set deleted_at = null, deleted_by = null, trashed_with_parent_id = null
    where id = p_item_id;
  elsif p_item_type = 'contract' then
    update public.contracts
    set deleted_at = null, deleted_by = null, trashed_with_parent_id = null
    where id = p_item_id;
  elsif p_item_type = 'letter' then
    update public.letters
    set deleted_at = null, deleted_by = null, trashed_with_parent_id = null
    where id = p_item_id;
  elsif p_item_type = 'job_description' then
    update public.job_descriptions
    set deleted_at = null, deleted_by = null
    where id = p_item_id;
  elsif p_item_type = 'hiring_request' then
    update public.hiring_requests
    set deleted_at = null, deleted_by = null
    where id = p_item_id;
  else
    update public.spotlight_posts
    set deleted_at = null, deleted_by = null
    where id = p_item_id;
  end if;
end;
$$;

-- ─── purge_item: + 'letter' ────────────────────────────

create or replace function public.purge_item(
  p_item_id uuid,
  p_item_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item_org uuid;
begin
  if p_item_type = 'employee' then
    select org_id into item_org from public.employees
    where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'sop' then
    select org_id into item_org from public.sops
    where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'contract' then
    select org_id into item_org from public.contracts
    where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'letter' then
    select org_id into item_org from public.letters
    where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'job_description' then
    select org_id into item_org from public.job_descriptions
    where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'hiring_request' then
    select org_id into item_org from public.hiring_requests
    where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'spotlight_post' then
    select org_id into item_org from public.spotlight_posts
    where id = p_item_id and deleted_at is not null;
  else
    raise exception 'Unknown item_type: %', p_item_type;
  end if;

  if item_org is null then
    raise exception 'Item not found in trash';
  end if;

  -- Purge from trash requires admin role even for spotlight — once it's in
  -- trash, "delete forever" is a destructive admin action.
  perform public._trash_assert_caller_authorized(item_org);

  if p_item_type = 'employee' then
    delete from public.employees where id = p_item_id;
  elsif p_item_type = 'sop' then
    delete from public.sops where id = p_item_id;
  elsif p_item_type = 'contract' then
    delete from public.contracts where id = p_item_id;
  elsif p_item_type = 'letter' then
    delete from public.letters where id = p_item_id;
  elsif p_item_type = 'job_description' then
    delete from public.job_descriptions where id = p_item_id;
  elsif p_item_type = 'hiring_request' then
    delete from public.hiring_requests where id = p_item_id;
  else
    delete from public.spotlight_posts where id = p_item_id;
  end if;
end;
$$;

-- ─── list_trash: + letters UNION arm ───────────────────

create or replace function public.list_trash()
returns table (
  item_type text,
  item_id uuid,
  title text,
  subtitle text,
  deleted_at timestamptz,
  deleted_by uuid,
  deleted_by_name text,
  deleted_by_avatar text,
  trashed_with_parent_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org uuid;
  caller_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select role, org_id into caller_role, caller_org
  from public.users where id = auth.uid();

  if caller_role not in ('owner', 'admin', 'hr') then
    raise exception 'Insufficient role to view trash';
  end if;

  return query
    select
      'employee'::text,
      e.id,
      e.name,
      coalesce(e.lifecycle_stage, 'active'),
      e.deleted_at,
      e.deleted_by,
      u.name,
      u.photo_url,
      null::uuid
    from public.employees e
    left join public.users u on u.id = e.deleted_by
    where e.org_id = caller_org and e.deleted_at is not null
    union all
    select
      'sop'::text,
      s.id,
      s.title,
      null::text,
      s.deleted_at,
      s.deleted_by,
      u.name,
      u.photo_url,
      s.trashed_with_parent_id
    from public.sops s
    left join public.users u on u.id = s.deleted_by
    where s.org_id = caller_org and s.deleted_at is not null
    union all
    select
      'contract'::text,
      c.id,
      c.title,
      null::text,
      c.deleted_at,
      c.deleted_by,
      u.name,
      u.photo_url,
      c.trashed_with_parent_id
    from public.contracts c
    left join public.users u on u.id = c.deleted_by
    where c.org_id = caller_org and c.deleted_at is not null
    union all
    select
      'letter'::text,
      l.id,
      l.title,
      null::text,
      l.deleted_at,
      l.deleted_by,
      u.name,
      u.photo_url,
      l.trashed_with_parent_id
    from public.letters l
    left join public.users u on u.id = l.deleted_by
    where l.org_id = caller_org and l.deleted_at is not null
    union all
    select
      'job_description'::text,
      jd.id,
      jd.title,
      null::text,
      jd.deleted_at,
      jd.deleted_by,
      u.name,
      u.photo_url,
      null::uuid
    from public.job_descriptions jd
    left join public.users u on u.id = jd.deleted_by
    where jd.org_id = caller_org and jd.deleted_at is not null
    union all
    select
      'hiring_request'::text,
      hr.id,
      coalesce(hr.position_name, '(untitled request)'),
      hr.status,
      hr.deleted_at,
      hr.deleted_by,
      u.name,
      u.photo_url,
      null::uuid
    from public.hiring_requests hr
    left join public.users u on u.id = hr.deleted_by
    where hr.org_id = caller_org and hr.deleted_at is not null
    union all
    select
      'spotlight_post'::text,
      sp.id,
      coalesce(sp.title, '(untitled post)'),
      sp.status,
      sp.deleted_at,
      sp.deleted_by,
      u.name,
      u.photo_url,
      null::uuid
    from public.spotlight_posts sp
    left join public.users u on u.id = sp.deleted_by
    where sp.org_id = caller_org and sp.deleted_at is not null
    order by 5 desc;
end;
$$;

-- ─── empty_trash: + letters ────────────────────────────

create or replace function public.empty_trash()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org uuid;
  caller_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select role, org_id into caller_role, caller_org
  from public.users where id = auth.uid();

  if caller_role not in ('owner', 'admin') then
    raise exception 'Only owners and admins can empty trash';
  end if;

  delete from public.sops where org_id = caller_org and deleted_at is not null;
  delete from public.contracts where org_id = caller_org and deleted_at is not null;
  delete from public.letters where org_id = caller_org and deleted_at is not null;
  delete from public.job_descriptions where org_id = caller_org and deleted_at is not null;
  delete from public.hiring_requests where org_id = caller_org and deleted_at is not null;
  delete from public.spotlight_posts where org_id = caller_org and deleted_at is not null;
  delete from public.employees where org_id = caller_org and deleted_at is not null;
end;
$$;

-- ─── 30-day purge cron for letters ─────────────────────
-- Mirrors 105/109: idempotent reschedule, runs daily at 03:00 UTC.

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'trash-purge-letters') then
    perform cron.unschedule('trash-purge-letters');
  end if;
end $$;

select cron.schedule(
  'trash-purge-letters',
  '0 3 * * *',
  $$
    delete from public.letters
    where deleted_at is not null
      and deleted_at < now() - interval '30 days';
  $$
);
