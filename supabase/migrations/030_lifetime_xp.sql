-- Lifetime XP — hours-worked accumulator.
--
-- Design intent: XP is a universal, cross-org portable measure of an
-- employee's working tenure. 1 XP = 1 hour of contracted work. The rate is
-- deliberately NOT org-configurable so that XP earned at Org A means exactly
-- the same thing as XP earned at Org B — this is a prerequisite for the
-- future cross-tenant employee registry ("see this candidate's history at
-- previous workplaces").
--
-- Computation is derived at read time from:
--   - employee.created_at (start of employment at this org)
--   - the active contract's hours_per_day × days_per_week
-- No stored counter, no background job — always correct, always in sync.
--
-- This migration:
--   1. Adds hours_per_day and days_per_week as first-class columns on
--      contracts (previously only captured inside content_markdown).
--   2. Updates portal_home RPC to return lifetime_xp along with the inputs
--      that derive it (days_employed, hours_per_week), so the portal can
--      show both the headline number and the breakdown in the drawer.

-- 1. Contract hours + days ---------------------------------------------------

alter table public.contracts
  add column if not exists hours_per_day integer,
  add column if not exists days_per_week integer;

alter table public.contracts
  drop constraint if exists contracts_hours_per_day_range;
alter table public.contracts
  add constraint contracts_hours_per_day_range
  check (hours_per_day is null or (hours_per_day > 0 and hours_per_day <= 24));

alter table public.contracts
  drop constraint if exists contracts_days_per_week_range;
alter table public.contracts
  add constraint contracts_days_per_week_range
  check (days_per_week is null or (days_per_week > 0 and days_per_week <= 7));

-- 2. portal_home RPC — add lifetime_xp + the breakdown inputs ---------------

create or replace function public.portal_home(
  emp_slug text,
  emp_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  emp public.employees%rowtype;
  org public.organizations%rowtype;
  active_contract public.contracts%rowtype;
  period date;
  days_employed integer;
  hours_per_week numeric;
  lifetime_xp integer;
  result jsonb;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token
  limit 1;

  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  select * into org from public.organizations where id = emp.org_id;

  select * into active_contract from public.contracts
  where employee_id = emp.id and status = 'active'
  order by updated_at desc
  limit 1;

  period := public.current_period_month();

  days_employed := greatest(
    0,
    floor(extract(epoch from (now() - emp.created_at)) / 86400)::integer
  );
  hours_per_week := coalesce(active_contract.hours_per_day, 0)
                  * coalesce(active_contract.days_per_week, 0);
  -- 1 XP per hour worked. Approximated as (days_employed / 7) * hours_per_week.
  lifetime_xp := floor((days_employed::numeric / 7.0) * hours_per_week)::integer;

  select jsonb_build_object(
    'employee', jsonb_build_object(
      'id', emp.id,
      'name', emp.name,
      'photo_url', emp.photo_url,
      'department', emp.department,
      'departments', to_jsonb(coalesce(emp.departments, array[]::text[])),
      'created_at', emp.created_at
    ),
    'org', jsonb_build_object(
      'id', org.id,
      'name', org.name,
      'logo_url', org.logo_url,
      'credits_divisor', org.credits_divisor
    ),
    'contract', case
      when active_contract.id is null then null
      else jsonb_build_object(
        'base_wage_idr', active_contract.base_wage_idr,
        'allowance_idr', active_contract.allowance_idr,
        'hours_per_day', active_contract.hours_per_day,
        'days_per_week', active_contract.days_per_week
      )
    end,
    'period_month', period,
    'days_employed', days_employed,
    'hours_per_week', hours_per_week,
    'lifetime_xp', lifetime_xp,
    'allowance_adjustments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'amount_idr', amount_idr,
          'reason', reason,
          'created_at', created_at
        )
        order by created_at desc
      )
      from public.allowance_adjustments
      where employee_id = emp.id and period_month = period
    ), '[]'::jsonb),
    'allowance_sum', coalesce((
      select sum(amount_idr)::integer
      from public.allowance_adjustments
      where employee_id = emp.id and period_month = period
    ), 0),
    'credit_adjustments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'amount', amount,
          'reason', reason,
          'created_at', created_at,
          'paid_out_at', paid_out_at,
          'payout_idr', payout_idr
        )
        order by created_at desc
      )
      from public.credit_adjustments
      where employee_id = emp.id and period_month = period
    ), '[]'::jsonb),
    'credit_net', coalesce((
      select sum(amount)::integer
      from public.credit_adjustments
      where employee_id = emp.id and period_month = period
    ), 0),
    'credit_frozen', exists (
      select 1 from public.credit_adjustments
      where employee_id = emp.id
        and period_month = period
        and paid_out_at is not null
    ),
    'achievements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'unlock_id', u.id,
          'unlocked_at', u.unlocked_at,
          'reason', u.reason,
          'name', d.name,
          'icon', d.icon,
          'description', d.description,
          'is_featured', d.is_featured
        )
        order by d.is_featured desc, u.unlocked_at desc
      )
      from public.achievement_unlocks u
      join public.achievement_definitions d on d.id = u.achievement_id
      where u.employee_id = emp.id
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;
