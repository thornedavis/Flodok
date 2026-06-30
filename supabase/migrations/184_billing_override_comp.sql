-- Complimentary access ("comp") — founder-granted full Pro access with no Stripe
-- subscription or payment. Used for test-case / partner orgs.
--
-- Design: a dedicated, Stripe-independent flag so it (a) is never clobbered by
-- the billing webhook, (b) stays distinct from real revenue (the Founder Console
-- excludes comped orgs from MRR), and (c) keeps plan_tier honest about Stripe
-- state. The app's access gates (isPro/dunningState in src/lib/billing.ts)
-- short-circuit to full Pro access when this is set. See docs/founder-console.md.

alter table public.organizations
  add column if not exists billing_override text
  check (billing_override is null or billing_override in ('comp'));

-- Lock it from client writes — like is_platform_admin (migration 170). Only the
-- SECURITY DEFINER RPC below (run as owner) may set it; a tenant admin can't
-- self-comp via a direct PATCH.
revoke update (billing_override) on public.organizations from authenticated, anon;

-- ── admin_set_org_comp — founder grants/revokes complimentary access ─────────
create or replace function public.admin_set_org_comp(p_org_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select is_platform_admin from public.users where id = auth.uid()), false) then
    raise exception 'Not authorized';
  end if;

  update public.organizations
  set billing_override = case when p_on then 'comp' else null end
  where id = p_org_id;
end;
$$;

revoke execute on function public.admin_set_org_comp(uuid, boolean) from public, anon;
grant execute on function public.admin_set_org_comp(uuid, boolean) to authenticated;

-- ── Re-create admin_org_rows to surface billing_override ─────────────────────
-- DROP first: adding billing_override to the RETURNS TABLE changes the function's
-- return type, which CREATE OR REPLACE cannot do (SQLSTATE 42P13).
drop function if exists public.admin_org_rows();
create or replace function public.admin_org_rows()
returns table (
  org_id                 uuid,
  name                   text,
  display_name           text,
  owner_name             text,
  owner_email            text,
  plan_tier              text,
  subscription_status    text,
  billing_override       text,
  subscription_quantity  integer,
  past_due_since         timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean,
  stripe_customer_id     text,
  created_at             timestamptz,
  onboarding_completed_at timestamptz,
  user_count             bigint,
  employee_count         bigint,
  contract_count         bigint,
  sop_count              bigint,
  form_count             bigint,
  nda_count              bigint,
  last_login             timestamptz,
  last_activity          timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select is_platform_admin from public.users where id = auth.uid()), false) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    o.id,
    o.name,
    o.display_name,
    (select u.name  from public.users u where u.org_id = o.id and u.role = 'owner' order by u.created_at limit 1),
    (select u.email from public.users u where u.org_id = o.id and u.role = 'owner' order by u.created_at limit 1),
    o.plan_tier,
    o.subscription_status,
    o.billing_override,
    o.subscription_quantity,
    o.past_due_since,
    o.current_period_end,
    o.cancel_at_period_end,
    o.stripe_customer_id,
    o.created_at,
    o.onboarding_completed_at,
    (select count(*) from public.users u            where u.org_id = o.id),
    (select count(*) from public.employees e        where e.org_id = o.id and e.deleted_at is null),
    (select count(*) from public.contracts c        where c.org_id = o.id and c.deleted_at is null),
    (select count(*) from public.sops s             where s.org_id = o.id and s.deleted_at is null),
    (select count(*) from public.form_submissions f where f.org_id = o.id and f.deleted_at is null),
    (select count(*) from public.ndas n             where n.org_id = o.id and n.deleted_at is null),
    (select max(au.last_sign_in_at)
       from public.users u
       join auth.users au on au.id = u.id
      where u.org_id = o.id),
    greatest(
      (select max(c.updated_at) from public.contracts c        where c.org_id = o.id),
      (select max(s.updated_at) from public.sops s             where s.org_id = o.id),
      (select max(f.updated_at) from public.form_submissions f where f.org_id = o.id),
      (select max(n.updated_at) from public.ndas n             where n.org_id = o.id),
      (select max(l.updated_at) from public.letters l          where l.org_id = o.id),
      (select max(j.updated_at) from public.job_descriptions j where j.org_id = o.id)
    )
  from public.organizations o
  order by o.created_at desc;
end;
$$;

revoke execute on function public.admin_org_rows() from public, anon;
grant execute on function public.admin_org_rows() to authenticated;

-- ── Re-create admin_org_detail to include billing_override in the org object ──
create or replace function public.admin_org_detail(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not coalesce((select is_platform_admin from public.users where id = auth.uid()), false) then
    raise exception 'Not authorized';
  end if;

  select jsonb_build_object(
    'org', (
      select to_jsonb(o2) from (
        select o.id, o.name, o.display_name, o.plan_tier, o.subscription_status,
               o.billing_override, o.subscription_quantity, o.current_period_end,
               o.cancel_at_period_end, o.past_due_since, o.created_at,
               o.onboarding_completed_at, o.stripe_customer_id, o.company_email
        from public.organizations o where o.id = p_org_id
      ) o2
    ),
    'counts', jsonb_build_object(
      'employees',        (select count(*) from public.employees        where org_id = p_org_id and deleted_at is null),
      'contracts',        (select count(*) from public.contracts        where org_id = p_org_id and deleted_at is null),
      'sops',             (select count(*) from public.sops             where org_id = p_org_id and deleted_at is null),
      'ndas',             (select count(*) from public.ndas             where org_id = p_org_id and deleted_at is null),
      'forms',            (select count(*) from public.form_submissions where org_id = p_org_id and deleted_at is null),
      'letters',          (select count(*) from public.letters          where org_id = p_org_id and deleted_at is null),
      'job_descriptions', (select count(*) from public.job_descriptions where org_id = p_org_id and deleted_at is null)
    ),
    'users', (
      select coalesce(jsonb_agg(to_jsonb(u2) order by u2.role, u2.created_at), '[]'::jsonb)
      from (
        select u.id, u.name, u.email, u.role, u.created_at, au.last_sign_in_at
        from public.users u
        left join auth.users au on au.id = u.id
        where u.org_id = p_org_id
      ) u2
    ),
    'ai_30d', (
      select jsonb_build_object(
        'calls', count(*),
        'cost_usd', coalesce(sum(cost_usd), 0),
        'total_tokens', coalesce(sum(total_tokens), 0)
      )
      from public.ai_usage
      where org_id = p_org_id and created_at >= now() - interval '30 days'
    ),
    'pending_claim', (
      select to_jsonb(c) from (
        select owner_email, owner_name, created_at, expires_at
        from public.owner_claims
        where org_id = p_org_id and status = 'pending'
        order by created_at desc
        limit 1
      ) c
    )
  ) into result;

  return result;
end;
$$;

revoke execute on function public.admin_org_detail(uuid) from public, anon;
grant execute on function public.admin_org_detail(uuid) to authenticated;
