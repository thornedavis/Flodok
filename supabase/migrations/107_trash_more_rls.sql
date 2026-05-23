-- Trash RLS for hiring_requests, spotlight_posts, job_descriptions.
--
-- Same pattern as 103: append `AND deleted_at IS NULL` to every existing
-- read/write policy so trashed rows are invisible to normal queries.
-- Trash UI reads via SECURITY DEFINER RPCs in 108, bypassing RLS.
--
-- Also re-schedules the spotlight cron (originally defined in 054) so it
-- only flips workflow state on non-trashed rows. Without this, a trashed
-- spotlight post that's scheduled for the future would still get
-- auto-published by trg_spotlight_fanout while it sits in Trash, which is
-- both surprising and would clutter feed_events with posts the user
-- thought they deleted.

-- ─── hiring_requests ────────────────────────────────────

drop policy if exists "Hiring requests visible to authorised viewers" on public.hiring_requests;
create policy "Hiring requests visible to authorised viewers"
  on public.hiring_requests for select to authenticated
  using (
    org_id = public.get_user_org_id()
    and deleted_at is null
    and (
      hiring_manager_id = auth.uid()
      or public.get_user_role() in ('owner', 'admin', 'hr')
      or department_id in (
        select d.id
        from public.company_departments d
        join public.users u on u.id = auth.uid()
        where d.org_id = u.org_id
          and d.manager_employee_id is not null
          and d.manager_employee_id = u.employee_id
      )
    )
  );

drop policy if exists "Requester can edit while pre-decision" on public.hiring_requests;
create policy "Requester can edit while pre-decision"
  on public.hiring_requests for update to authenticated
  using (
    org_id = public.get_user_org_id()
    and deleted_at is null
    and hiring_manager_id = auth.uid()
    and status in ('draft', 'submitted')
  )
  with check (
    org_id = public.get_user_org_id()
    and hiring_manager_id = auth.uid()
    and status in ('draft', 'submitted')
  );

drop policy if exists "Requester can delete own drafts" on public.hiring_requests;
create policy "Requester can delete own drafts"
  on public.hiring_requests for delete to authenticated
  using (
    org_id = public.get_user_org_id()
    and deleted_at is null
    and hiring_manager_id = auth.uid()
    and status = 'draft'
  );

-- (insert policy unchanged — new rows can't already be trashed)

-- ─── spotlight_posts ────────────────────────────────────

drop policy if exists "Managers can manage spotlight posts" on public.spotlight_posts;
create policy "Managers can manage spotlight posts"
  on public.spotlight_posts for all
  to authenticated
  using (
    org_id in (select org_id from public.users where id = auth.uid())
    and deleted_at is null
  )
  with check (
    org_id in (select org_id from public.users where id = auth.uid())
  );

-- ─── job_descriptions ───────────────────────────────────

drop policy if exists "Authorised viewers see JDs" on public.job_descriptions;
create policy "Authorised viewers see JDs"
  on public.job_descriptions for select to authenticated
  using (
    org_id = public.get_user_org_id()
    and deleted_at is null
    and (
      status in ('published', 'archived')
      or public.get_user_role() in ('owner', 'admin', 'hr')
    )
  );

drop policy if exists "HR can manage JDs" on public.job_descriptions;
create policy "HR can manage JDs"
  on public.job_descriptions for all to authenticated
  using (
    org_id = public.get_user_org_id()
    and deleted_at is null
    and public.get_user_role() in ('owner', 'admin', 'hr')
  )
  with check (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin', 'hr')
  );

-- ─── spotlight cron: skip trashed rows ──────────────────

do $$
begin
  if exists (select 1 from cron.job where jobname = 'spotlight-publish-due') then
    perform cron.unschedule('spotlight-publish-due');
  end if;
  if exists (select 1 from cron.job where jobname = 'spotlight-archive-expired') then
    perform cron.unschedule('spotlight-archive-expired');
  end if;
end $$;

select cron.schedule(
  'spotlight-publish-due',
  '* * * * *',
  $$
    update public.spotlight_posts
    set status = 'published'
    where status = 'scheduled'
      and effective_from is not null
      and effective_from <= now()
      and deleted_at is null;
  $$
);

select cron.schedule(
  'spotlight-archive-expired',
  '* * * * *',
  $$
    update public.spotlight_posts
    set status = 'archived'
    where status = 'published'
      and effective_until is not null
      and effective_until <= now()
      and deleted_at is null;
  $$
);
