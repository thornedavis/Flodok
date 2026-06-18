-- NDA trash parity.
--
-- Make NDAs first-class trash entities, mirroring letters (120/130). Each of the
-- six trash RPCs gains an 'nda' arm, trash_employee cascades to the employee's
-- NDAs (1:1 via employee_id, like contracts), and a 30-day purge cron reaps
-- soft-deleted NDAs. Every function is re-created verbatim from its latest
-- definition (trash_document=120, trash_employee=115, the rest=130) with only
-- the NDA additions.

-- ─── trash_document: + 'nda' ───────────────────────────
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
    select org_id into doc_org from public.sops where id = p_doc_id and deleted_at is null;
  elsif p_doc_type = 'contract' then
    select org_id into doc_org from public.contracts where id = p_doc_id and deleted_at is null;
  elsif p_doc_type = 'job_description' then
    select org_id into doc_org from public.job_descriptions where id = p_doc_id and deleted_at is null;
  elsif p_doc_type = 'letter' then
    select org_id into doc_org from public.letters where id = p_doc_id and deleted_at is null;
  elsif p_doc_type = 'nda' then
    select org_id into doc_org from public.ndas where id = p_doc_id and deleted_at is null;
  else
    raise exception 'Unknown doc_type: %', p_doc_type;
  end if;

  if doc_org is null then
    raise exception 'Document not found or already trashed';
  end if;

  perform public._trash_assert_caller_authorized(doc_org);

  if p_doc_type = 'sop' then
    update public.sops set deleted_at = now(), deleted_by = actor where id = p_doc_id;
  elsif p_doc_type = 'contract' then
    update public.contracts set deleted_at = now(), deleted_by = actor where id = p_doc_id;
  elsif p_doc_type = 'job_description' then
    update public.job_descriptions set deleted_at = now(), deleted_by = actor where id = p_doc_id;
  elsif p_doc_type = 'letter' then
    update public.letters set deleted_at = now(), deleted_by = actor where id = p_doc_id;
  elsif p_doc_type = 'nda' then
    update public.ndas set deleted_at = now(), deleted_by = actor where id = p_doc_id;
  end if;
end;
$$;

-- ─── trash_employee: cascade to NDAs ───────────────────
create or replace function public.trash_employee(
  p_employee_id uuid,
  p_cascade_docs boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  emp_org uuid;
  now_ts timestamptz := now();
  actor uuid := auth.uid();
begin
  select org_id into emp_org from public.employees
  where id = p_employee_id and deleted_at is null;

  if emp_org is null then
    raise exception 'Employee not found or already trashed';
  end if;

  perform public._trash_assert_caller_authorized(emp_org);

  update public.employees
  set deleted_at = now_ts, deleted_by = actor
  where id = p_employee_id;

  if p_cascade_docs then
    update public.sops
    set deleted_at = now_ts,
        deleted_by = actor,
        trashed_with_parent_id = p_employee_id
    where deleted_at is null
      and id in (
        select sop_id
        from public.sop_audience
        where sop_id in (
          select sop_id from public.sop_audience where employee_id = p_employee_id
        )
        group by sop_id
        having bool_and(target_type = 'employee' and employee_id = p_employee_id)
      );

    update public.contracts
    set deleted_at = now_ts,
        deleted_by = actor,
        trashed_with_parent_id = p_employee_id
    where employee_id = p_employee_id
      and deleted_at is null;

    -- NDAs are 1:1 with employee_id like contracts.
    update public.ndas
    set deleted_at = now_ts,
        deleted_by = actor,
        trashed_with_parent_id = p_employee_id
    where employee_id = p_employee_id
      and deleted_at is null;
  end if;

  delete from public.sop_audience where employee_id = p_employee_id;
end;
$$;

revoke execute on function public.trash_employee(uuid, boolean) from public, anon;
grant execute on function public.trash_employee(uuid, boolean) to authenticated;

-- ─── restore_item: + 'nda' ─────────────────────────────
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
    select org_id into item_org from public.employees where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'sop' then
    select org_id into item_org from public.sops where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'contract' then
    select org_id into item_org from public.contracts where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'letter' then
    select org_id into item_org from public.letters where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'nda' then
    select org_id into item_org from public.ndas where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'job_description' then
    select org_id into item_org from public.job_descriptions where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'hiring_request' then
    select org_id into item_org from public.hiring_requests where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'spotlight_post' then
    select org_id into item_org from public.spotlight_posts where id = p_item_id and deleted_at is not null;
  else
    raise exception 'Unknown item_type: %', p_item_type;
  end if;

  if item_org is null then
    raise exception 'Item not found in trash';
  end if;

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

    update public.ndas
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
  elsif p_item_type = 'nda' then
    update public.ndas
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

-- ─── purge_item: + 'nda' ───────────────────────────────
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
    select org_id into item_org from public.employees where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'sop' then
    select org_id into item_org from public.sops where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'contract' then
    select org_id into item_org from public.contracts where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'letter' then
    select org_id into item_org from public.letters where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'nda' then
    select org_id into item_org from public.ndas where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'job_description' then
    select org_id into item_org from public.job_descriptions where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'hiring_request' then
    select org_id into item_org from public.hiring_requests where id = p_item_id and deleted_at is not null;
  elsif p_item_type = 'spotlight_post' then
    select org_id into item_org from public.spotlight_posts where id = p_item_id and deleted_at is not null;
  else
    raise exception 'Unknown item_type: %', p_item_type;
  end if;

  if item_org is null then
    raise exception 'Item not found in trash';
  end if;

  perform public._trash_assert_caller_authorized(item_org);

  if p_item_type = 'employee' then
    delete from public.employees where id = p_item_id;
  elsif p_item_type = 'sop' then
    delete from public.sops where id = p_item_id;
  elsif p_item_type = 'contract' then
    delete from public.contracts where id = p_item_id;
  elsif p_item_type = 'letter' then
    delete from public.letters where id = p_item_id;
  elsif p_item_type = 'nda' then
    delete from public.ndas where id = p_item_id;
  elsif p_item_type = 'job_description' then
    delete from public.job_descriptions where id = p_item_id;
  elsif p_item_type = 'hiring_request' then
    delete from public.hiring_requests where id = p_item_id;
  else
    delete from public.spotlight_posts where id = p_item_id;
  end if;
end;
$$;

-- ─── list_trash: + ndas UNION arm ──────────────────────
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
      'employee'::text, e.id, e.name, coalesce(e.lifecycle_stage, 'active'),
      e.deleted_at, e.deleted_by, u.name, u.photo_url, null::uuid
    from public.employees e
    left join public.users u on u.id = e.deleted_by
    where e.org_id = caller_org and e.deleted_at is not null
    union all
    select
      'sop'::text, s.id, s.title, null::text,
      s.deleted_at, s.deleted_by, u.name, u.photo_url, s.trashed_with_parent_id
    from public.sops s
    left join public.users u on u.id = s.deleted_by
    where s.org_id = caller_org and s.deleted_at is not null
    union all
    select
      'contract'::text, c.id, c.title, null::text,
      c.deleted_at, c.deleted_by, u.name, u.photo_url, c.trashed_with_parent_id
    from public.contracts c
    left join public.users u on u.id = c.deleted_by
    where c.org_id = caller_org and c.deleted_at is not null
    union all
    select
      'letter'::text, l.id, l.title, null::text,
      l.deleted_at, l.deleted_by, u.name, u.photo_url, l.trashed_with_parent_id
    from public.letters l
    left join public.users u on u.id = l.deleted_by
    where l.org_id = caller_org and l.deleted_at is not null
    union all
    select
      'nda'::text, nd.id, nd.title, null::text,
      nd.deleted_at, nd.deleted_by, u.name, u.photo_url, nd.trashed_with_parent_id
    from public.ndas nd
    left join public.users u on u.id = nd.deleted_by
    where nd.org_id = caller_org and nd.deleted_at is not null
    union all
    select
      'job_description'::text, jd.id, jd.title, null::text,
      jd.deleted_at, jd.deleted_by, u.name, u.photo_url, null::uuid
    from public.job_descriptions jd
    left join public.users u on u.id = jd.deleted_by
    where jd.org_id = caller_org and jd.deleted_at is not null
    union all
    select
      'hiring_request'::text, hr.id, coalesce(hr.position_name, '(untitled request)'), hr.status,
      hr.deleted_at, hr.deleted_by, u.name, u.photo_url, null::uuid
    from public.hiring_requests hr
    left join public.users u on u.id = hr.deleted_by
    where hr.org_id = caller_org and hr.deleted_at is not null
    union all
    select
      'spotlight_post'::text, sp.id, coalesce(sp.title, '(untitled post)'), sp.status,
      sp.deleted_at, sp.deleted_by, u.name, u.photo_url, null::uuid
    from public.spotlight_posts sp
    left join public.users u on u.id = sp.deleted_by
    where sp.org_id = caller_org and sp.deleted_at is not null
    order by 5 desc;
end;
$$;

-- ─── empty_trash: + ndas ───────────────────────────────
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
  delete from public.ndas where org_id = caller_org and deleted_at is not null;
  delete from public.job_descriptions where org_id = caller_org and deleted_at is not null;
  delete from public.hiring_requests where org_id = caller_org and deleted_at is not null;
  delete from public.spotlight_posts where org_id = caller_org and deleted_at is not null;
  delete from public.employees where org_id = caller_org and deleted_at is not null;
end;
$$;

-- ─── 30-day purge cron for NDAs ────────────────────────
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'trash-purge-ndas') then
    perform cron.unschedule('trash-purge-ndas');
  end if;
end $$;

select cron.schedule(
  'trash-purge-ndas',
  '0 3 * * *',
  $$
    delete from public.ndas
    where deleted_at is not null
      and deleted_at < now() - interval '30 days';
  $$
);
