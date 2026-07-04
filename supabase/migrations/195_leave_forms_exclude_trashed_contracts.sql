-- Exclude trashed contracts from the last two SECURITY DEFINER active-contract
-- reads (the leave/forms cluster), completing the class started in 192/194.
--
-- Same root cause: trashing a contract keeps status='active', so a contract
-- trashed while its employee stays live was read as the live active contract.
--   _leave_balance      (154) — reads annual_leave_days for the leave balance
--   _post_approved_form (173) — reads base_wage/days/annual_leave when posting
--                               an approved leave/overtime form to payroll
-- Reproduced verbatim from each function's LATEST definition (_leave_balance was
-- re-defined in 154 over 152's copy; _post_approved_form in 173) with only
-- `and deleted_at is null` added to the active-contract lookup.

-- === _leave_balance (from 154) ===
create or replace function public._leave_balance(p_employee_id uuid, p_org_id uuid, p_year int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_annual    int;
  v_join      date;
  v_ref       date := (now() at time zone 'Asia/Jakarta')::date;
  v_service_months int;
  v_monthly   numeric;
  v_accrued   numeric;
  v_gate_on   boolean;
  v_gate_months int;
  v_eligible  boolean;
  v_available numeric;
  v_used      numeric;
begin
  select annual_leave_days into v_annual
    from public.contracts where employee_id = p_employee_id and status = 'active' and deleted_at is null
    order by updated_at desc limit 1;
  v_annual := coalesce(v_annual, 12);

  select coalesce(join_date, created_at::date) into v_join
    from public.employees where id = p_employee_id;
  v_join := coalesce(v_join, v_ref);

  -- Completed whole months of continuous service.
  v_service_months := greatest(
    0,
    (extract(year from age(v_ref, v_join)) * 12 + extract(month from age(v_ref, v_join)))::int
  );

  -- Per-org use-gate: default ON (usable only after 12 months of service).
  v_gate_on := coalesce(
    (select forms_config->'leave_request'->>'require_service_year' from public.organizations where id = p_org_id),
    'true'
  ) <> 'false';
  v_gate_months := case when v_gate_on then 12 else 0 end;

  v_monthly := v_annual::numeric / 12.0;
  -- Full entitlement once a year of service is complete; pro-rated in the first year.
  v_accrued := case when v_service_months >= 12 then v_annual else round(v_monthly * v_service_months) end;
  v_eligible := v_service_months >= v_gate_months;
  v_available := case when v_eligible then v_accrued else 0 end;

  -- Days taken this leave year (annual_taken deltas are negative).
  select coalesce(-sum(delta_days), 0) into v_used
    from public.leave_ledger
    where employee_id = p_employee_id and leave_year = p_year and entry_type = 'annual_taken';

  return jsonb_build_object(
    'year', p_year,
    'entitlement', v_annual,
    'service_months', v_service_months,
    'accrued', v_accrued,
    'eligible', v_eligible,
    'gate_months', v_gate_months,
    'used', v_used,
    'remaining', greatest(0, v_available - v_used)
  );
end;
$$;

-- === _post_approved_form (from 173) ===
create or replace function public._post_approved_form(p_submission_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  sub          public.form_submissions%rowtype;
  fd           jsonb;
  v_ref        text;
  v_awarded_by uuid;
  v_base       int;
  v_days_per_week int;
  v_entitlement   int;
  v_leave_type text;
  v_total_days numeric;
  v_period     date;
  v_skip       text;
  v_pay_id     uuid;
  v_leave_id   uuid;
  v_hourly     numeric;
  v_charge     numeric;
  v_ot_hours   numeric;
  v_ot_period  date;
  v_li         record;
  v_daily      numeric;
  v_working_days int;
  v_deduction  int;
begin
  select * into sub from public.form_submissions where id = p_submission_id;
  if sub.id is null then return; end if;

  -- Idempotency latch + only fully-approved forms.
  if sub.payroll_posted_at is not null then return; end if;
  if sub.status <> 'approved' or sub.committed_at is null then return; end if;

  -- Overtime auto-approve inserts the submission row BEFORE its line items, so
  -- the AFTER-INSERT trigger can fire too early. No-op until line items exist;
  -- the trailing field_data UPDATE in the submit RPC re-fires the trigger.
  if sub.form_type = 'overtime_request'
     and not exists (select 1 from public.form_line_items where submission_id = sub.id) then
    return;
  end if;

  fd := coalesce(sub.field_data, '{}'::jsonb);
  v_awarded_by := coalesce(sub.owner_decided_by, sub.manager_decided_by, sub.manager_user_id);

  -- Reference number (allocate once; CUTI / LEMBUR per-year sequence).
  v_ref := sub.reference_number;
  if v_ref is null then
    v_ref := public.next_letter_reference_number(
      sub.org_id,
      case sub.form_type when 'leave_request' then 'CUTI' else 'LEMBUR' end,
      extract(year from coalesce(sub.committed_at, now()))::int);
  end if;

  -- Active contract wage inputs (the contract current at posting time).
  select base_wage_idr, days_per_week, annual_leave_days
    into v_base, v_days_per_week, v_entitlement
    from public.contracts
   where employee_id = sub.employee_id and status = 'active' and deleted_at is null
   order by updated_at desc limit 1;

  -- ─── Overtime → pay_adjustments (one row per touched period_month) ───
  if sub.form_type = 'overtime_request' then
    if v_base is null then
      v_skip := 'no_active_contract';
    elsif exists (
      select 1 from public.form_line_items li
      where li.submission_id = sub.id
        and public._period_frozen(sub.employee_id, date_trunc('month', li.work_date)::date)
    ) then
      -- All-or-nothing: if ANY touched period is frozen, skip the whole form
      -- (avoids a partial post that would double on a later repost).
      v_skip := 'period_frozen';
    else
      v_hourly := v_base::numeric / 173.0;
      -- One savepoint around all period inserts: any failure (cap/floor raised
      -- by the pay_adjustments trigger) rolls them ALL back — never a partial
      -- post, never an aborted approval transaction.
      begin
        for v_ot_period in
          select distinct date_trunc('month', work_date)::date
          from public.form_line_items where submission_id = sub.id
        loop
          v_charge := 0;
          v_ot_hours := 0;
          for v_li in
            select * from public.form_line_items
            where submission_id = sub.id and date_trunc('month', work_date)::date = v_ot_period
          loop
            v_charge := v_charge + public._pp35_line_charge(v_hourly, v_li.total_hours, v_li.is_ot_day, coalesce(v_days_per_week, 6));
            v_ot_hours := v_ot_hours + coalesce(v_li.total_hours, 0);
          end loop;
          if round(v_charge) > 0 then
            insert into public.pay_adjustments (org_id, employee_id, period_month, amount_idr, reason, awarded_by)
            values (sub.org_id, sub.employee_id, v_ot_period, round(v_charge)::int,
                    'Lembur disetujui — ' || v_ref || ' · ' || public._fmt_qty(v_ot_hours) || ' jam', v_awarded_by)
            returning id into v_pay_id;
          end if;
        end loop;
      exception when others then
        v_skip := 'post_failed';
        v_pay_id := null;
      end;
    end if;

  -- ─── Leave → deduction (unpaid) or balance decrement (annual) ───
  elsif sub.form_type = 'leave_request' then
    v_leave_type := fd->>'leave_type';
    v_total_days := coalesce((fd->>'total_days')::numeric, 0);
    v_period := date_trunc('month', coalesce(nullif(fd->>'date_start', '')::date, now()::date))::date;

    if v_leave_type = 'unpaid' then
      if v_base is null then
        v_skip := 'no_active_contract';
      elsif public._period_frozen(sub.employee_id, v_period) then
        v_skip := 'period_frozen';
      else
        -- Working days per month derived from the work week (Indonesian convention).
        v_working_days := case when coalesce(v_days_per_week, 6) >= 6 then 25 else 21 end;
        v_daily := v_base::numeric / v_working_days;
        v_deduction := round(v_daily * v_total_days)::int;
        if v_deduction > 0 then
          begin
            insert into public.pay_adjustments (org_id, employee_id, period_month, amount_idr, reason, awarded_by)
            values (sub.org_id, sub.employee_id, v_period, -v_deduction,
                    'Cuti tidak dibayar — ' || v_ref || ' · ' || public._fmt_qty(v_total_days) || ' hari', v_awarded_by)
            returning id into v_pay_id;
          exception when others then
            v_skip := 'post_failed';
          end;
        end if;
      end if;

    elsif v_leave_type = 'annual' then
      -- Leave balance is a yearly entitlement, not monthly pay → not gated by
      -- pay-period freeze. Record the decrement.
      if v_total_days > 0 then
        insert into public.leave_ledger
          (org_id, employee_id, leave_year, period_month, delta_days, entry_type,
           entitlement_snapshot, source_submission_id, reason, awarded_by)
        values
          (sub.org_id, sub.employee_id,
           extract(year from coalesce(nullif(fd->>'date_start', '')::date, now()))::int,
           v_period, -(v_total_days), 'annual_taken',
           v_entitlement, sub.id, 'Cuti tahunan — ' || v_ref || ' · ' || public._fmt_qty(v_total_days) || ' hari', v_awarded_by)
        returning id into v_leave_id;
      end if;

    else
      -- national_holiday / sick_* / short_time / special: no payroll effect.
      v_skip := 'non_decrementing_leave_type';
    end if;
  end if;

  -- Single final UPDATE — sets the guard fields so the trigger's WHEN clause
  -- is false on re-fire (no recursion).
  update public.form_submissions
     set reference_number       = v_ref,
         pay_adjustment_id       = coalesce(v_pay_id, pay_adjustment_id),
         leave_ledger_entry_id   = coalesce(v_leave_id, leave_ledger_entry_id),
         payroll_posted_at       = case when v_skip is null then now() else payroll_posted_at end,
         posting_skipped_reason  = v_skip
   where id = p_submission_id;
end;
$$;

revoke execute on function public._post_approved_form(uuid) from public, anon, authenticated;
