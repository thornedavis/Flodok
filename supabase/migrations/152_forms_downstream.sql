-- Forms Phase 2 — downstream wiring: approved forms affect payroll + leave.
--
-- Decisions (Thorne, 2026-06-18):
--   - Overtime hourly rate = base_wage_idr / 173 (PP35/2021). Allowance is
--     EXCLUDED (treated as non-fixed / not tunjangan tetap). Unpaid-leave
--     deduction uses the same base-only daily rate for consistency.
--   - Auto-post on final approval (committed_at), via a DB trigger that covers
--     every approval path (dashboard decide RPCs + the portal self-approve insert).
--   - If the target pay period is frozen/settled, DO NOT post — record
--     posting_skipped_reason='period_frozen'; HR reposts manually later.
--   - Annual-leave carry-over is an org setting (default off).
--
-- The posting helper is idempotent (payroll_posted_at latch) and freeze-aware
-- (pre-checks; never lets pay_adjustments' freeze trigger abort the approval
-- transaction). Reference numbers reuse next_letter_reference_number (119).

-- ─── 1. Leave-balance ledger (mirrors pay_adjustments conventions) ──────────
-- Annual leave RESETS each calendar year; unused days do NOT accrue
-- (Indonesian Manpower practice) — so no carry-over org setting is needed.

create table if not exists public.leave_ledger (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  leave_year    int  not null,
  period_month  date not null,
  delta_days    numeric(5,2) not null,   -- signed: negative = taken, positive = grant/correction
  entry_type    text not null check (entry_type in ('annual_grant', 'annual_taken', 'correction')),
  entitlement_snapshot int,              -- annual_leave_days as-of approval (audit)
  source_submission_id uuid references public.form_submissions(id) on delete set null,
  reason        text not null,
  awarded_by    uuid not null references public.users(id),
  created_at    timestamptz not null default now(),
  constraint leave_ledger_delta_nonzero check (delta_days <> 0),
  constraint leave_ledger_period_first_of_month check (period_month = date_trunc('month', period_month)::date)
);

create index if not exists leave_ledger_emp_year_idx on public.leave_ledger (employee_id, leave_year);
create index if not exists leave_ledger_org_idx on public.leave_ledger (org_id, leave_year);

alter table public.leave_ledger enable row level security;

-- Reads gated to owner/admin (mirror pay_adjustments post-134). Writes happen
-- only via the SECURITY DEFINER posting helper — no INSERT/UPDATE policy.
drop policy if exists "Leave ledger visible to admins" on public.leave_ledger;
create policy "Leave ledger visible to admins"
  on public.leave_ledger for select to authenticated
  using (org_id = public.get_user_org_id() and public.get_user_role() in ('owner', 'admin'));

-- ─── 3. Hook columns on form_submissions ────────────────────────────────────

alter table public.form_submissions
  add column if not exists reference_number      text,
  add column if not exists payroll_posted_at      timestamptz,
  add column if not exists pay_adjustment_id       uuid references public.pay_adjustments(id) on delete set null,
  add column if not exists leave_ledger_entry_id   uuid references public.leave_ledger(id) on delete set null,
  add column if not exists posting_skipped_reason  text;

-- ─── 4. Helpers ─────────────────────────────────────────────────────────────

-- Is a given (employee, period_month) already frozen? Mirrors the OR logic in
-- tg_pay_adjustments_freeze (migration 144): a paid-out adjustment OR a
-- settlement snapshot for that period.
create or replace function public._period_frozen(p_employee_id uuid, p_period_month date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from public.pay_adjustments
      where employee_id = p_employee_id and period_month = p_period_month and paid_out_at is not null
    ) or exists (
      select 1 from public.pay_period_settlements
      where employee_id = p_employee_id and period_month = p_period_month
    )
$$;

-- PP35/2021 overtime charge for one line, given an hourly rate. Piecewise so
-- fractional hours are handled cleanly.
--   Regular working day: hour 1 ×1.5, subsequent hours ×2.0.
--   Rest day / holiday (6-day week): hours 1–7 ×2.0, hour 8 ×3.0, 9+ ×4.0.
--   Rest day / holiday (5-day week): hours 1–8 ×2.0, hour 9 ×3.0, 10+ ×4.0.
create or replace function public._pp35_line_charge(
  p_hourly numeric, p_hours numeric, p_ot_day boolean, p_days_per_week int
)
returns numeric language sql immutable as $$
  select case
    when p_hours is null or p_hours <= 0 then 0
    when not coalesce(p_ot_day, false) then
      p_hourly * (1.5 * least(p_hours, 1) + 2.0 * greatest(p_hours - 1, 0))
    when coalesce(p_days_per_week, 6) >= 6 then
      p_hourly * (2.0 * least(p_hours, 7) + 3.0 * (least(p_hours, 8) - least(p_hours, 7)) + 4.0 * greatest(p_hours - 8, 0))
    else
      p_hourly * (2.0 * least(p_hours, 8) + 3.0 * (least(p_hours, 9) - least(p_hours, 8)) + 4.0 * greatest(p_hours - 9, 0))
  end
$$;

-- ─── 5. The posting engine ──────────────────────────────────────────────────
--
-- Called by the trigger below whenever a submission is fully approved. Posts
-- overtime pay / unpaid-leave deductions to pay_adjustments and annual-leave
-- decrements to leave_ledger. Idempotent (payroll_posted_at). Freeze-aware
-- (pre-checks, skips gracefully — never raises into the approval transaction).
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
   where employee_id = sub.employee_id and status = 'active'
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
          for v_li in
            select * from public.form_line_items
            where submission_id = sub.id and date_trunc('month', work_date)::date = v_ot_period
          loop
            v_charge := v_charge + public._pp35_line_charge(v_hourly, v_li.total_hours, v_li.is_ot_day, coalesce(v_days_per_week, 6));
          end loop;
          if round(v_charge) > 0 then
            insert into public.pay_adjustments (org_id, employee_id, period_month, amount_idr, reason, awarded_by)
            values (sub.org_id, sub.employee_id, v_ot_period, round(v_charge)::int,
                    'Lembur disetujui — ' || v_ref, v_awarded_by)
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
                    'Cuti tidak dibayar — ' || v_ref, v_awarded_by)
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
           v_entitlement, sub.id, 'Cuti tahunan — ' || v_ref, v_awarded_by)
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

-- ─── 6. Trigger: fire posting on every approval path ────────────────────────
--
-- Covers dashboard decide RPCs (UPDATE status→approved) AND the portal
-- self-approve path (INSERT status=approved). The WHEN guard prevents
-- recursion: once _post_approved_form stamps payroll_posted_at or
-- posting_skipped_reason, the re-fired condition is false.
create or replace function public.tg_post_approved_form()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._post_approved_form(new.id);
  return new;
end $$;

drop trigger if exists trg_post_approved_form on public.form_submissions;
create trigger trg_post_approved_form
  after insert or update on public.form_submissions
  for each row
  when (new.status = 'approved'
        and new.committed_at is not null
        and new.payroll_posted_at is null
        and new.posting_skipped_reason is null)
  execute function public.tg_post_approved_form();

-- ─── 7. Leave-balance read RPCs ─────────────────────────────────────────────

-- Live balance for a year. With carry-over enabled, last year's remaining
-- (floored at 0) is added to this year's entitlement.
create or replace function public._leave_balance(p_employee_id uuid, p_org_id uuid, p_year int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_entitlement int;
  v_net_year    numeric;
begin
  select annual_leave_days into v_entitlement
    from public.contracts where employee_id = p_employee_id and status = 'active'
    order by updated_at desc limit 1;
  v_entitlement := coalesce(v_entitlement, 12);

  -- Resets each year: only the current year's ledger counts (no carry-over).
  select coalesce(sum(delta_days), 0) into v_net_year
    from public.leave_ledger where employee_id = p_employee_id and leave_year = p_year;

  return jsonb_build_object(
    'year', p_year,
    'entitlement', v_entitlement,
    'used', -v_net_year,                        -- annual_taken deltas are negative
    'remaining', v_entitlement + v_net_year
  );
end;
$$;

-- Dashboard (owner/admin) read.
create or replace function public.admin_leave_balance(p_employee_id uuid, p_year int default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  caller_role text;
  caller_org  uuid;
  emp_org     uuid;
  yr          int;
begin
  select role, org_id into caller_role, caller_org from public.users where id = auth.uid();
  if caller_role not in ('owner', 'admin', 'hr') then
    raise exception 'Not authorized';
  end if;
  select org_id into emp_org from public.employees where id = p_employee_id;
  if emp_org is null or emp_org <> caller_org then
    raise exception 'Employee not found in your organisation';
  end if;
  yr := coalesce(p_year, extract(year from (now() at time zone 'Asia/Jakarta'))::int);
  return public._leave_balance(p_employee_id, emp_org, yr);
end;
$$;

revoke execute on function public.admin_leave_balance(uuid, int) from public, anon;
grant  execute on function public.admin_leave_balance(uuid, int) to authenticated;

-- Employee portal (token-authed) read of own balance.
create or replace function public.portal_leave_balance(emp_slug text, emp_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  emp public.employees%rowtype;
  yr  int;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token and deleted_at is null limit 1;
  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
  yr := extract(year from (now() at time zone 'Asia/Jakarta'))::int;
  return public._leave_balance(emp.id, emp.org_id, yr);
end;
$$;

revoke execute on function public.portal_leave_balance(text, text) from public;
grant  execute on function public.portal_leave_balance(text, text) to anon, authenticated;

-- ─── 8. Admin retry: repost a form that was skipped (e.g. frozen period) ────
--
-- Lets an owner/admin re-run posting for a submission whose payroll post was
-- skipped, after resolving the cause (e.g. choosing to post into the open period
-- is out of scope here — this simply re-attempts; if still frozen it re-skips).
create or replace function public.repost_form_to_payroll(p_submission_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  caller_role text;
  caller_org  uuid;
  sub_org     uuid;
begin
  select role, org_id into caller_role, caller_org from public.users where id = auth.uid();
  if caller_role not in ('owner', 'admin') then
    raise exception 'Not authorized';
  end if;
  select org_id into sub_org from public.form_submissions where id = p_submission_id;
  if sub_org is null or sub_org <> caller_org then
    raise exception 'Form not found in your organisation';
  end if;
  -- Clear the skip latch so the helper re-attempts.
  update public.form_submissions set posting_skipped_reason = null where id = p_submission_id;
  perform public._post_approved_form(p_submission_id);
end;
$$;

revoke execute on function public.repost_form_to_payroll(uuid) from public, anon;
grant  execute on function public.repost_form_to_payroll(uuid) to authenticated;
