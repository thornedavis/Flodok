-- Founder Console — platform-wide admin dashboard (Phase 1).
--
-- A single login (hello@thornedavis.com) gets a cross-tenant "god view" of every
-- org: signups, billing status, last login, content scale. Everything here is
-- gated on users.is_platform_admin, which migration 170 already made
-- client-unwritable (revoked UPDATE from authenticated/anon), so it's safe to
-- trust as a server-side authorization bit.
--
-- See docs/founder-console.md for the full design.

-- ── Grant the founder the platform-admin bit ────────────────────────────────
-- Idempotent. Only this exact email; case-insensitive. If the user row doesn't
-- exist yet (signs up later) this is a no-op and can be re-run, or set by hand.
update public.users
set is_platform_admin = true
where lower(email) = 'hello@thornedavis.com';

-- ── admin_org_rows() — one row per organization ─────────────────────────────
-- Cross-org read, so it MUST bypass RLS via SECURITY DEFINER and gate on the
-- platform-admin bit itself. Counts use correlated subqueries (not a fan-out
-- join) so headcounts can't multiply each other. last_login reads
-- auth.users.last_sign_in_at — only reachable because the function owner
-- (postgres) can see the auth schema. MRR is intentionally NOT computed here:
-- the bracket math lives in src/lib/pricing.ts (calculateProMonthlyIdr) and the
-- frontend derives it from subscription_quantity, keeping one source of truth.
create or replace function public.admin_org_rows()
returns table (
  org_id                 uuid,
  name                   text,
  display_name           text,
  owner_name             text,
  owner_email            text,
  plan_tier              text,
  subscription_status    text,
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
