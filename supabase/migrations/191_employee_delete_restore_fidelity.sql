-- Employee delete: faithful SOP-audience restore + NDA purge consistency.
--
-- (A) Restore fidelity. trash_employee HARD-deleted the employee's sop_audience
--     rows (their direct per-SOP signer assignments). Restoring the employee
--     never brought them back, so a trash→restore round-trip silently stripped
--     every direct SOP assignment. Just *keeping* the rows isn't enough: the
--     SOP editor saves audience as delete-all-then-reinsert-from-picker, and the
--     picker drops any target whose employee isn't in the live list — so the row
--     would be lost the next time that SOP is edited.
--
--     Fix: archive the employee's audience rows into sop_audience_trashed on
--     trash (removing them from the live table exactly as before, so the
--     resolver / editor behave identically), and re-insert them on restore. The
--     archive is keyed by employee_id with ON DELETE CASCADE, so a purge (or a
--     purged SOP) reaps the archived rows automatically. Only 'employee'-type
--     rows are ever the employee's own; department/branch/etc. rows are
--     untouched. Readers of sop_audience are unchanged.
--
-- (B) NDA purge consistency. 102 rewrote sops/contracts employee_id FK to
--     SET NULL so "delete-employee-only" docs survive the purge as floating
--     records. ndas came later (146) with ON DELETE CASCADE, so a non-cascaded
--     NDA was instead hard-deleted at purge — an inconsistent "keep the doc".
--     Align ndas (receiving-party employee_id, already nullable) to SET NULL.

-- ─── (A) SOP-audience archive ───────────────────────────────────────────────
create table if not exists public.sop_audience_trashed (
  id          uuid primary key default gen_random_uuid(),
  sop_id      uuid not null references public.sops(id)      on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  added_at    timestamptz not null,
  added_by    uuid references auth.users(id) on delete set null,
  trashed_at  timestamptz not null default now()
);

create index if not exists idx_sop_audience_trashed_employee
  on public.sop_audience_trashed (employee_id);

-- Internal archive: reached only via the SECURITY DEFINER trash/restore RPCs,
-- which bypass RLS. Enable RLS with no policies so it's inaccessible directly.
alter table public.sop_audience_trashed enable row level security;

-- ─── trash_employee: archive audience instead of hard-deleting ──────────────
-- Verbatim from 148 except the trailing `delete from sop_audience` is now an
-- archive-move (insert into sop_audience_trashed, then delete). Ordering is
-- unchanged: the sole-audience cascade still reads live sop_audience first.
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

  -- Detach the employee from every SOP audience, but archive first so a restore
  -- can put the assignments back (the resolver already hides trashed employees,
  -- so live behaviour is identical to the old hard-delete).
  insert into public.sop_audience_trashed (sop_id, employee_id, added_at, added_by)
    select sop_id, employee_id, added_at, added_by
    from public.sop_audience
    where employee_id = p_employee_id;

  delete from public.sop_audience where employee_id = p_employee_id;
end;
$$;

revoke execute on function public.trash_employee(uuid, boolean) from public, anon;
grant execute on function public.trash_employee(uuid, boolean) to authenticated;

-- ─── restore_item: re-insert archived audience on employee restore ──────────
-- Verbatim from 148 except the employee arm now restores sop_audience_trashed.
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

    -- Put back the direct SOP-audience assignments archived at trash time.
    insert into public.sop_audience (sop_id, target_type, employee_id, added_at, added_by)
      select sop_id, 'employee', employee_id, added_at, added_by
      from public.sop_audience_trashed
      where employee_id = p_item_id
      on conflict do nothing;

    delete from public.sop_audience_trashed where employee_id = p_item_id;
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

-- ─── (B) NDA employee_id FK: CASCADE → SET NULL ─────────────────────────────
alter table public.ndas drop constraint if exists ndas_employee_id_fkey;
alter table public.ndas
  add constraint ndas_employee_id_fkey
  foreign key (employee_id) references public.employees(id) on delete set null;
