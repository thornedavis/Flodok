-- Server-side enforcement of the Free-plan employee cap.
--
-- Until now FREE_EMPLOYEE_LIMIT (src/lib/pricing.ts = 2) was enforced only in
-- the dashboard UI (Employees "Add" / duplicate / bulk import). A tenant could
-- bypass it entirely with a direct PostgREST insert: their own JWT already
-- satisfies the "Managers can CRUD employees in own org" RLS policy (migration
-- 103), which checks org membership but has no count check. This adds a
-- BEFORE INSERT trigger so the cap holds at the database level no matter how
-- the row arrives.
--
-- "Billable employee" mirrors the definition used everywhere else (Employees
-- page, Performance, the payroll RPCs in migration 182): a row whose
-- lifecycle_stage is in ('active','separated') and which isn't soft-deleted.
-- Recruitment-pipeline rows (prospective / shortlisted / offered / signed /
-- talent_pool / no_show) share the table but never count, so a Free org can
-- still run an unbounded hiring pipeline.
--
-- Scope: INSERT only. Promoting an existing candidate into 'active' (the
-- signed -> active auto-advance in src/lib/lifecycleAdvance.ts) is intentionally
-- NOT guarded here — a raising trigger on that UPDATE would make the auto-advance
-- throw mid-flow on the Recruitment page / Portal. The insert path is the real
-- bypass vector; this closes it.
--
-- "Capped" mirrors isPro()/isComped() in src/lib/billing.ts: an org is capped
-- unless it is on Pro (plan_tier = 'pro' — which the billing webhook only sets
-- for active/trialing/past_due subscriptions, so past-due orgs in their grace
-- window are NOT capped) OR has complimentary access (billing_override = 'comp',
-- migration 184).

create or replace function public.enforce_free_employee_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_tier        text;
  v_billing_override text;
  v_count            int;
  -- Keep in sync with FREE_EMPLOYEE_LIMIT in src/lib/pricing.ts.
  c_free_limit       constant int := 2;
begin
  -- Only billable rows count toward the cap. Recruitment stages and
  -- soft-deleted rows are free — let them through untouched.
  if new.lifecycle_stage not in ('active', 'separated') or new.deleted_at is not null then
    return new;
  end if;

  select plan_tier, billing_override
    into v_plan_tier, v_billing_override
  from public.organizations
  where id = new.org_id;

  -- Pro and comped orgs have no employee cap.
  if v_plan_tier = 'pro' or v_billing_override = 'comp' then
    return new;
  end if;

  select count(*)
    into v_count
  from public.employees
  where org_id = new.org_id
    and lifecycle_stage in ('active', 'separated')
    and deleted_at is null;

  if v_count >= c_free_limit then
    raise exception
      'Free plan is limited to % employees. Upgrade to Pro to add more.', c_free_limit
      using errcode = 'check_violation',
            hint = 'Upgrade the organization to Pro before adding employees beyond the free limit.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_free_employee_limit on public.employees;
create trigger trg_enforce_free_employee_limit
  before insert on public.employees
  for each row
  execute function public.enforce_free_employee_limit();
