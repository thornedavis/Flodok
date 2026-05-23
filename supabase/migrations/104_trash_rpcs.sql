-- Trash RPCs: SECURITY DEFINER functions that wrap soft-delete / restore /
-- purge / list operations. Every function:
--   * Asserts auth.uid() is set.
--   * Verifies caller role >= hr (owner | admin | hr).
--   * Verifies the target row belongs to caller's org.
--   * Bypasses RLS (definer rights), so it can touch trashed rows that the
--     normal SELECT policies would hide.
--
-- Restore propagation: trash_employee(..., cascade := true) stamps each
-- sop/contract with trashed_with_parent_id = employee_id; restore_item on
-- the employee un-nulls those tagged rows in the same transaction.

-- ─── role/org guard ────────────────────────────────────

create or replace function public._trash_assert_caller_authorized(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  caller_org uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select role, org_id into caller_role, caller_org
  from public.users where id = auth.uid();

  if caller_role is null then
    raise exception 'Caller is not a registered user';
  end if;

  if caller_org <> p_org_id then
    raise exception 'Item belongs to another organisation';
  end if;

  if caller_role not in ('owner', 'admin', 'hr') then
    raise exception 'Insufficient role to manage trash';
  end if;
end;
$$;

revoke execute on function public._trash_assert_caller_authorized(uuid) from public, anon, authenticated;

-- ─── trash_employee ────────────────────────────────────

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
    where employee_id = p_employee_id
      and deleted_at is null;

    update public.contracts
    set deleted_at = now_ts,
        deleted_by = actor,
        trashed_with_parent_id = p_employee_id
    where employee_id = p_employee_id
      and deleted_at is null;
  end if;
end;
$$;

revoke execute on function public.trash_employee(uuid, boolean) from public, anon;
grant execute on function public.trash_employee(uuid, boolean) to authenticated;

-- ─── trash_document (sop | contract) ───────────────────

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
  else
    update public.contracts set deleted_at = now(), deleted_by = actor
    where id = p_doc_id;
  end if;
end;
$$;

revoke execute on function public.trash_document(uuid, text) from public, anon;
grant execute on function public.trash_document(uuid, text) to authenticated;

-- ─── restore_item ──────────────────────────────────────

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
  else
    raise exception 'Unknown item_type: %', p_item_type;
  end if;

  if item_org is null then
    raise exception 'Item not found in trash';
  end if;

  perform public._trash_assert_caller_authorized(item_org);

  if p_item_type = 'employee' then
    update public.employees
    set deleted_at = null, deleted_by = null
    where id = p_item_id;

    -- Bring back anything that was cascade-trashed alongside this employee.
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
  else
    update public.contracts
    set deleted_at = null, deleted_by = null, trashed_with_parent_id = null
    where id = p_item_id;
  end if;
end;
$$;

revoke execute on function public.restore_item(uuid, text) from public, anon;
grant execute on function public.restore_item(uuid, text) to authenticated;

-- ─── purge_item ────────────────────────────────────────

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
  else
    delete from public.contracts where id = p_item_id;
  end if;
end;
$$;

revoke execute on function public.purge_item(uuid, text) from public, anon;
grant execute on function public.purge_item(uuid, text) to authenticated;

-- ─── list_trash ────────────────────────────────────────

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
      -- subtitle carries lifecycle_stage so the UI can split candidates
      -- (prospective/shortlisted/offered/signed/talent_pool/no_show) out
      -- from real employees (active/separated/probation) on the trash page.
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
    order by 5 desc;
end;
$$;

revoke execute on function public.list_trash() from public, anon;
grant execute on function public.list_trash() to authenticated;

-- ─── empty_trash ───────────────────────────────────────

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
  delete from public.employees where org_id = caller_org and deleted_at is not null;
end;
$$;

revoke execute on function public.empty_trash() from public, anon;
grant execute on function public.empty_trash() to authenticated;
