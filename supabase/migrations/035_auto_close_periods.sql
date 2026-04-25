-- Worker-facing RPC for automatic period closure.
--
-- The flodok-router Worker runs a daily cron at ~01:00 WIB and calls this
-- function with its service token. The function checks today's WIB date
-- against each organization's `pay_day_of_month` setting and closes the
-- appropriate period for every active employee in matching orgs.
--
-- Rules:
--   * pay_day_of_month = 1..28 → on that day of the WIB month, close the
--     previous calendar month's period.
--   * pay_day_of_month = 0 → close the current month's period on the last
--     calendar day of that month (handles 28/29/30/31 transparently).
--
-- Runs as SECURITY DEFINER but only `service_role` has EXECUTE — the Worker
-- calls it via the service role key, anon/authenticated callers are rejected
-- at the permission layer. No `auth.uid()` dependency.
--
-- The freeze logic mirrors `close_period` but runs in-loop and is idempotent:
-- rows already marked `paid_out_at IS NOT NULL` are skipped, so a Worker
-- retry after a partial failure just picks up where it left off.

create or replace function public.auto_close_periods()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  today_wib date;
  is_last_day boolean;
  day_of_month smallint;
  org_record record;
  emp_record record;
  target_period date;
  org_divisor integer;
  allowance integer;
  employees_closed integer := 0;
  orgs_processed integer := 0;
  report jsonb := '[]'::jsonb;
begin
  today_wib := (now() at time zone 'Asia/Jakarta')::date;
  day_of_month := extract(day from today_wib)::smallint;
  -- Last day of month = tomorrow is in a different month.
  is_last_day := date_trunc('month', today_wib + interval '1 day')::date <> date_trunc('month', today_wib)::date;

  for org_record in
    select id, credits_divisor, pay_day_of_month
    from public.organizations
    where
      (pay_day_of_month = day_of_month and pay_day_of_month between 1 and 28)
      or (pay_day_of_month = 0 and is_last_day)
  loop
    orgs_processed := orgs_processed + 1;
    org_divisor := org_record.credits_divisor;

    if org_record.pay_day_of_month = 0 then
      -- Close current month (today is its last day).
      target_period := date_trunc('month', today_wib)::date;
    else
      -- Close previous month.
      target_period := (date_trunc('month', today_wib) - interval '1 month')::date;
    end if;

    for emp_record in
      select id from public.employees
      where org_id = org_record.id
    loop
      -- Skip employees whose period is already frozen (idempotent retry).
      if exists (
        select 1 from public.credit_adjustments
        where employee_id = emp_record.id
          and period_month = target_period
          and paid_out_at is not null
      ) then
        continue;
      end if;

      select coalesce(allowance_idr, 0) into allowance
      from public.contracts
      where employee_id = emp_record.id and status = 'active'
      order by updated_at desc
      limit 1;

      update public.credit_adjustments
      set payout_idr = case
            when org_divisor > 0 and coalesce(allowance, 0) > 0
              then round(amount::numeric * allowance / org_divisor)::integer
            else 0
          end,
          paid_out_at = now()
      where employee_id = emp_record.id
        and period_month = target_period
        and paid_out_at is null;

      update public.bonus_adjustments
      set payout_idr = amount_idr,
          paid_out_at = now()
      where employee_id = emp_record.id
        and period_month = target_period
        and paid_out_at is null;

      employees_closed := employees_closed + 1;
    end loop;

    report := report || jsonb_build_object(
      'org_id', org_record.id,
      'period_month', target_period,
      'pay_day_of_month', org_record.pay_day_of_month
    );
  end loop;

  return jsonb_build_object(
    'today_wib', today_wib,
    'orgs_processed', orgs_processed,
    'employees_closed', employees_closed,
    'closures', report
  );
end;
$$;

-- Service role only — not exposed to anon/authenticated. The Worker calls
-- this via the service role key on its internal path.
revoke all on function public.auto_close_periods() from public, anon, authenticated;
grant execute on function public.auto_close_periods() to service_role;
