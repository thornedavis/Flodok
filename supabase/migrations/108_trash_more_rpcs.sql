-- Extend trash RPCs to cover hiring_requests, spotlight_posts, job_descriptions.
--
-- Permission matching the existing UX:
--   * job_descriptions: owner/admin/hr (HR-managed editorial content).
--   * spotlight_posts: any signed-in user in the same org (matches the
--     existing "Managers can manage spotlight posts" RLS — anyone with an
--     account in the org can post and delete).
--   * hiring_requests: the requester can trash their own draft (mirrors
--     the existing delete RLS) OR owner/admin/hr can trash any state, so
--     HR can clean up abandoned approved requests when needed.
--
-- list_trash, restore_item, purge_item, empty_trash all extend transparently
-- with three new item_type values: 'hiring_request', 'spotlight_post',
-- 'job_description'. trash_document gains a 'job_description' branch.

-- ─── permissive auth: any signed-in user in matching org ────

create or replace function public._trash_assert_caller_in_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select org_id into caller_org
  from public.users where id = auth.uid();

  if caller_org is null then
    raise exception 'Caller is not a registered user';
  end if;

  if caller_org <> p_org_id then
    raise exception 'Item belongs to another organisation';
  end if;
end;
$$;

revoke execute on function public._trash_assert_caller_in_org(uuid) from public, anon, authenticated;

-- ─── trash_document: extend to job_description ──────────

create or replace function public.trash_document(
  p_doc_id uuid,
  p_doc_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  doc_org uuid;
  actor uuid := auth.uid();
begin
  if p_doc_type = 'sop' then
    select org_id into doc_org from public.sops
    where id = p_doc_id and deleted_at is null;
  elsif p_doc_type = 'contract' then
    select org_id into doc_org from public.contracts
    where id = p_doc_id and deleted_at is null;
  elsif p_doc_type = 'job_description' then
    select org_id into doc_org from public.job_descriptions
    where id = p_doc_id and deleted_at is null;
  else
    raise exception 'Unknown doc_type: %', p_doc_type;
  end if;

  if doc_org is null then
    raise exception 'Document not found or already trashed';
  end if;

  perform public._trash_assert_caller_authorized(doc_org);

  if p_doc_type = 'sop' then
    update public.sops set deleted_at = now(), deleted_by = actor
    where id = p_doc_id;
  elsif p_doc_type = 'contract' then
    update public.contracts set deleted_at = now(), deleted_by = actor
    where id = p_doc_id;
  else
    update public.job_descriptions set deleted_at = now(), deleted_by = actor
    where id = p_doc_id;
  end if;
end;
$$;

-- ─── trash_hiring_request ──────────────────────────────

create or replace function public.trash_hiring_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req_org uuid;
  req_manager uuid;
  req_status text;
  caller_role text;
  caller_org uuid;
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'Not authenticated';
  end if;

  select org_id, hiring_manager_id, status
    into req_org, req_manager, req_status
  from public.hiring_requests
  where id = p_request_id and deleted_at is null;

  if req_org is null then
    raise exception 'Hiring request not found or already trashed';
  end if;

  select role, org_id into caller_role, caller_org
  from public.users where id = actor;

  if caller_org <> req_org then
    raise exception 'Item belongs to another organisation';
  end if;

  -- Permitted if: HR/admin/owner (any state), OR requester deleting own draft.
  if caller_role not in ('owner', 'admin', 'hr')
     and not (req_manager = actor and req_status = 'draft') then
    raise exception 'Only the requester (drafts) or HR can trash this request';
  end if;

  update public.hiring_requests
  set deleted_at = now(), deleted_by = actor
  where id = p_request_id;
end;
$$;

revoke execute on function public.trash_hiring_request(uuid) from public, anon;
grant execute on function public.trash_hiring_request(uuid) to authenticated;

-- ─── trash_spotlight_post ──────────────────────────────

create or replace function public.trash_spotlight_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  post_org uuid;
  actor uuid := auth.uid();
begin
  select org_id into post_org from public.spotlight_posts
  where id = p_post_id and deleted_at is null;

  if post_org is null then
    raise exception 'Spotlight post not found or already trashed';
  end if;

  -- Spotlight is a peer-broadcast surface — matches existing RLS allowing
  -- any signed-in user in the org to manage posts.
  perform public._trash_assert_caller_in_org(post_org);

  update public.spotlight_posts
  set deleted_at = now(), deleted_by = actor
  where id = p_post_id;
end;
$$;

revoke execute on function public.trash_spotlight_post(uuid) from public, anon;
grant execute on function public.trash_spotlight_post(uuid) to authenticated;

-- ─── restore_item: extend item_type set ─────────────────

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

-- ─── purge_item: extend item_type set ───────────────────

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
  elsif p_item_type = 'job_description' then
    delete from public.job_descriptions where id = p_item_id;
  elsif p_item_type = 'hiring_request' then
    delete from public.hiring_requests where id = p_item_id;
  else
    delete from public.spotlight_posts where id = p_item_id;
  end if;
end;
$$;

-- ─── list_trash: extend UNION ──────────────────────────

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

-- ─── empty_trash: extend deletions ─────────────────────

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
  delete from public.job_descriptions where org_id = caller_org and deleted_at is not null;
  delete from public.hiring_requests where org_id = caller_org and deleted_at is not null;
  delete from public.spotlight_posts where org_id = caller_org and deleted_at is not null;
  delete from public.employees where org_id = caller_org and deleted_at is not null;
end;
$$;
