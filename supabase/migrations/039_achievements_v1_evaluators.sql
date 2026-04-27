-- Achievements v1 — Evaluator functions
--
-- SQL functions that the cron and (later) event triggers call to award
-- achievements. All are SECURITY DEFINER and idempotent — running them
-- repeatedly does not produce duplicate unlocks (the partial unique index on
-- achievement_unlocks is the backstop, and each function checks existence
-- before inserting).
--
-- Public functions (granted to service_role for cron use):
--   run_daily_achievements()
--     Tenure + first_event for every active employee.
--
--   run_monthly_leaderboard(period_start date default last completed month)
--     Snapshot + leaderboard achievement evaluation for a single period.
--
-- Internal building blocks (called by the wrappers above; usable for backfill):
--   evaluate_tenure_for_employee(employee_id)
--   evaluate_first_event_for_employee(employee_id)
--   take_monthly_leaderboard_snapshot(period_start)
--   evaluate_leaderboard_achievements_for_period(period_start)


-- Tenure ----------------------------------------------------------------------
-- Awards any tenure achievement whose calendar interval since first contract
-- signature has now elapsed. Backdates unlocked_at to the historically-correct
-- moment (start_date + threshold) rather than now().

create or replace function public.evaluate_tenure_for_employee(p_employee_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_signature timestamptz;
  v_status text;
  v_org_id uuid;
  rec record;
  v_milestone_at timestamptz;
  v_inserted int;
  v_unlocked int := 0;
begin
  select e.status, e.org_id into v_status, v_org_id
  from public.employees e
  where e.id = p_employee_id;

  if v_status is null or v_status not in ('trial', 'active') then
    return 0;
  end if;

  select min(signed_at) into v_first_signature
  from public.contract_signatures
  where employee_id = p_employee_id;

  if v_first_signature is null then
    return 0;
  end if;

  for rec in
    select id, trigger_rule
    from public.achievement_definitions
    where org_id = v_org_id
      and is_active = true
      and trigger_type = 'auto'
      and trigger_rule->>'type' = 'tenure_calendar'
  loop
    v_milestone_at := v_first_signature
      + ((rec.trigger_rule->>'amount') || ' ' || (rec.trigger_rule->>'unit'))::interval;

    if now() >= v_milestone_at then
      insert into public.achievement_unlocks (employee_id, achievement_id, unlocked_at)
      select p_employee_id, rec.id, v_milestone_at
      where not exists (
        select 1 from public.achievement_unlocks
        where employee_id = p_employee_id
          and achievement_id = rec.id
          and awarded_by is null
      );
      get diagnostics v_inserted = row_count;
      v_unlocked := v_unlocked + v_inserted;
    end if;
  end loop;

  return v_unlocked;
end;
$$;


-- First-event compensation milestones -----------------------------------------
-- Handles First Earnings, First Bonus, First Payout. Dispatches by the
-- trigger_rule's source + filter pair. Honors delay_hours so unlock fires
-- 24 hours after the triggering compensation event (avoids activity-feed
-- pile-up with the underlying credit/bonus notification).

create or replace function public.evaluate_first_event_for_employee(p_employee_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_org_id uuid;
  rec record;
  v_first_at timestamptz;
  v_delay_hours int;
  v_unlock_at timestamptz;
  v_inserted int;
  v_unlocked int := 0;
begin
  select e.status, e.org_id into v_status, v_org_id
  from public.employees e
  where e.id = p_employee_id;

  if v_status is null or v_status not in ('trial', 'active') then
    return 0;
  end if;

  for rec in
    select id, trigger_rule
    from public.achievement_definitions
    where org_id = v_org_id
      and is_active = true
      and trigger_type = 'auto'
      and trigger_rule->>'type' = 'first_event'
  loop
    v_delay_hours := coalesce((rec.trigger_rule->>'delay_hours')::int, 0);
    v_first_at := null;

    if rec.trigger_rule->>'source' = 'credit_adjustments'
       and rec.trigger_rule->>'filter' = 'amount > 0' then
      select min(created_at) into v_first_at
      from public.credit_adjustments
      where employee_id = p_employee_id and amount > 0;

    elsif rec.trigger_rule->>'source' = 'credit_adjustments'
          and rec.trigger_rule->>'filter' = 'paid_out_at IS NOT NULL' then
      select min(paid_out_at) into v_first_at
      from public.credit_adjustments
      where employee_id = p_employee_id and paid_out_at is not null;

    elsif rec.trigger_rule->>'source' = 'bonus_adjustments'
          and rec.trigger_rule->>'filter' = 'amount_idr > 0' then
      select min(created_at) into v_first_at
      from public.bonus_adjustments
      where employee_id = p_employee_id and amount_idr > 0;
    end if;

    if v_first_at is null then
      continue;
    end if;

    v_unlock_at := v_first_at + (v_delay_hours || ' hours')::interval;

    if now() >= v_unlock_at then
      insert into public.achievement_unlocks (employee_id, achievement_id, unlocked_at)
      select p_employee_id, rec.id, v_unlock_at
      where not exists (
        select 1 from public.achievement_unlocks
        where employee_id = p_employee_id
          and achievement_id = rec.id
          and awarded_by is null
      );
      get diagnostics v_inserted = row_count;
      v_unlocked := v_unlocked + v_inserted;
    end if;
  end loop;

  return v_unlocked;
end;
$$;


-- Monthly leaderboard snapshot ------------------------------------------------
-- Writes one row per (org, employee) for the period. Includes only employees
-- with positive net credits in the period and active/trial status. Net score =
-- sum(credit_adjustments.amount) for the period. Tied scores get the same
-- rank() value (so two employees with equal totals both rank 1, next gets 3).

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
    where e.status in ('trial', 'active')
      and ca.period_month = p_period_start
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


-- Leaderboard achievement evaluator -------------------------------------------
-- Evaluates Podium, Number One, Reigning Champion against the snapshot for
-- the given period. Honors min_scorers gate and consecutive_periods (for
-- Reigning Champion). All consecutive periods checked must independently
-- satisfy the min_scorers gate, otherwise the streak doesn't count.

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

  for org_rec in select id from public.organizations loop
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


-- Top-level: daily run --------------------------------------------------------
-- Single entry point for the daily Cloudflare cron. Iterates every active
-- employee and runs both tenure + first_event evaluation for them.

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
    select id from public.employees
    where status in ('trial', 'active')
  loop
    v_processed := v_processed + 1;
    v_unlocks := v_unlocks + public.evaluate_tenure_for_employee(emp_rec.id);
    v_unlocks := v_unlocks + public.evaluate_first_event_for_employee(emp_rec.id);
  end loop;

  return query select v_processed, v_unlocks;
end;
$$;


-- Top-level: monthly run ------------------------------------------------------
-- Single entry point for the monthly Cloudflare cron. Defaults to last
-- completed month (in WIB / Asia/Jakarta). The Worker should call with no
-- argument on the 1st of each month; backfill or rebuild scenarios pass an
-- explicit period_start.

create or replace function public.run_monthly_leaderboard(p_period_start date default null)
returns table (snapshot_rows int, unlocks_awarded int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date;
  v_snapshot_rows int;
  v_unlocks int;
begin
  v_period := coalesce(
    p_period_start,
    (date_trunc('month', now() at time zone 'Asia/Jakarta') - interval '1 month')::date
  );

  v_snapshot_rows := public.take_monthly_leaderboard_snapshot(v_period);
  v_unlocks := public.evaluate_leaderboard_achievements_for_period(v_period);

  return query select v_snapshot_rows, v_unlocks;
end;
$$;


-- Permissions -----------------------------------------------------------------
-- Cron worker uses service_role; no public RPC exposure for the run_* funcs.
-- The internal building blocks aren't exposed either — call them via the
-- top-level wrappers or as superuser during backfill.

revoke all on function public.evaluate_tenure_for_employee(uuid) from public;
revoke all on function public.evaluate_first_event_for_employee(uuid) from public;
revoke all on function public.take_monthly_leaderboard_snapshot(date) from public;
revoke all on function public.evaluate_leaderboard_achievements_for_period(date) from public;
revoke all on function public.run_daily_achievements() from public;
revoke all on function public.run_monthly_leaderboard(date) from public;

grant execute on function public.run_daily_achievements() to service_role;
grant execute on function public.run_monthly_leaderboard(date) to service_role;
