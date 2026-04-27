-- Org-level master switch for the badges feature.
--
-- When an org sets badges_enabled = false:
--   * The cron skips them — no new tenure / first-event / leaderboard unlocks
--     are awarded, no monthly snapshots are written.
--   * Existing achievement_unlocks rows are preserved untouched.
--   * UI surfaces hide the Badges tab on the portal, the Recognition Moments
--     widget on the dashboard, the badge overlay on leaderboard avatars,
--     etc. (handled in the frontend).
--
-- Re-enabling resumes the cron. Tenure and first-event achievements auto-
-- catch-up because their predicates compare against `now()` (any milestone
-- crossed during the disabled window will award on the next run). Monthly
-- leaderboard months that fell entirely within a disabled period are not
-- backfilled — they have no snapshot, so leaderboard achievements skip
-- those periods permanently.

alter table public.organizations
  add column if not exists badges_enabled boolean not null default true;


-- Updated evaluator wrappers. Signatures unchanged — only internal filter
-- changes, so CREATE OR REPLACE without a DROP.

create or replace function public.run_daily_achievements()
returns table (employees_processed int, unlocks_awarded int)
language plpgsql
security definer
set search_path = public
as $$
declare
  emp_rec record;
  v_processed int := 0;
  v_unlocks int := 0;
begin
  for emp_rec in
    select e.id
    from public.employees e
    join public.organizations o on o.id = e.org_id
    where e.status in ('trial', 'active')
      and o.badges_enabled = true
  loop
    v_processed := v_processed + 1;
    v_unlocks := v_unlocks + public.evaluate_tenure_for_employee(emp_rec.id);
    v_unlocks := v_unlocks + public.evaluate_first_event_for_employee(emp_rec.id);
  end loop;

  return query select v_processed, v_unlocks;
end;
$$;


create or replace function public.take_monthly_leaderboard_snapshot(p_period_start date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_end date;
  v_inserted int;
begin
  v_period_end := (p_period_start + interval '1 month' - interval '1 day')::date;

  with ranked as (
    select
      e.org_id,
      e.id as employee_id,
      sum(ca.amount) as net_score,
      rank() over (
        partition by e.org_id
        order by sum(ca.amount) desc
      ) as employee_rank
    from public.employees e
    join public.credit_adjustments ca on ca.employee_id = e.id
    join public.organizations o on o.id = e.org_id
    where e.status in ('trial', 'active')
      and ca.period_month = p_period_start
      and o.badges_enabled = true
    group by e.org_id, e.id
    having sum(ca.amount) > 0
  )
  insert into public.leaderboard_snapshots
    (org_id, period_type, period_start, period_end, employee_id, rank, score)
  select
    org_id,
    'month',
    p_period_start,
    v_period_end,
    employee_id,
    employee_rank,
    net_score
  from ranked
  on conflict (org_id, period_type, period_start, employee_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;


create or replace function public.evaluate_leaderboard_achievements_for_period(
  p_period_start date
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_end date;
  v_unlock_at timestamptz;
  v_unlocked int := 0;
  org_rec record;
  ach_rec record;
  emp_rec record;
  v_scorer_count int;
  v_consecutive_periods int;
  v_max_rank int;
  v_min_scorers int;
  v_periods_ok boolean;
  v_check_period date;
  v_check_qualifies boolean;
  v_check_size int;
  i int;
begin
  v_period_end := (p_period_start + interval '1 month' - interval '1 day')::date;
  v_unlock_at := (v_period_end + interval '1 day')::timestamptz;

  for org_rec in
    select id from public.organizations
    where badges_enabled = true
  loop
    select count(*) into v_scorer_count
    from public.leaderboard_snapshots
    where org_id = org_rec.id
      and period_type = 'month'
      and period_start = p_period_start;

    if v_scorer_count = 0 then
      continue;
    end if;

    for ach_rec in
      select id, trigger_rule
      from public.achievement_definitions
      where org_id = org_rec.id
        and trigger_type = 'auto'
        and is_active = true
        and trigger_rule->>'type' = 'leaderboard_rank'
    loop
      v_max_rank := (ach_rec.trigger_rule->>'max_rank')::int;
      v_min_scorers := (ach_rec.trigger_rule->>'min_scorers')::int;
      v_consecutive_periods := coalesce(
        (ach_rec.trigger_rule->>'consecutive_periods')::int, 1
      );

      if v_scorer_count < v_min_scorers then
        continue;
      end if;

      for emp_rec in
        select snap.employee_id
        from public.leaderboard_snapshots snap
        join public.employees e on e.id = snap.employee_id
        where snap.org_id = org_rec.id
          and snap.period_type = 'month'
          and snap.period_start = p_period_start
          and snap.rank <= v_max_rank
          and e.status in ('trial', 'active')
      loop
        if exists (
          select 1 from public.achievement_unlocks
          where employee_id = emp_rec.employee_id
            and achievement_id = ach_rec.id
            and awarded_by is null
        ) then
          continue;
        end if;

        v_periods_ok := true;
        for i in 1..(v_consecutive_periods - 1) loop
          v_check_period := (p_period_start - (i || ' month')::interval)::date;

          select
            bool_or(rank <= v_max_rank) filter (
              where employee_id = emp_rec.employee_id
            ),
            count(*)
          into v_check_qualifies, v_check_size
          from public.leaderboard_snapshots
          where org_id = org_rec.id
            and period_type = 'month'
            and period_start = v_check_period;

          if not coalesce(v_check_qualifies, false) or v_check_size < v_min_scorers then
            v_periods_ok := false;
            exit;
          end if;
        end loop;

        if not v_periods_ok then
          continue;
        end if;

        insert into public.achievement_unlocks (employee_id, achievement_id, unlocked_at)
        values (emp_rec.employee_id, ach_rec.id, v_unlock_at);

        v_unlocked := v_unlocked + 1;
      end loop;
    end loop;
  end loop;

  return v_unlocked;
end;
$$;
