-- Billing columns on organizations.
--
-- plan_tier              — 'free' (default) or 'pro'. Drives feature gating.
-- subscription_status    — mirror of Stripe Subscription.status. Null for free orgs.
-- stripe_customer_id     — set on first checkout; one Stripe Customer per org.
-- stripe_subscription_id — set when a Pro subscription is created.
-- current_period_end     — Stripe Subscription.current_period_end. Drives "next bill on"
--                          UI and is also used to know when to stop honouring Pro after
--                          cancellation at period end.
-- cancel_at_period_end   — Stripe Subscription.cancel_at_period_end. When true, UI shows
--                          "Pro until <current_period_end>, then drops to Free".
--
-- All values are written by the Stripe webhook handler in flodok-router. No client should
-- write to these columns directly — RLS policies should be tightened later if needed.

alter table public.organizations
  add column if not exists plan_tier text not null default 'free'
    check (plan_tier in ('free', 'pro')),
  add column if not exists subscription_status text
    check (subscription_status in (
      'active', 'trialing', 'past_due', 'canceled',
      'incomplete', 'incomplete_expired', 'unpaid', 'paused'
    )),
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false;

-- Uniqueness on Stripe IDs prevents two orgs accidentally pointing at the same
-- customer/subscription. Allowed nulls (Free orgs).
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'organizations_stripe_customer_id_key'
  ) then
    create unique index organizations_stripe_customer_id_key
      on public.organizations (stripe_customer_id)
      where stripe_customer_id is not null;
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'organizations_stripe_subscription_id_key'
  ) then
    create unique index organizations_stripe_subscription_id_key
      on public.organizations (stripe_subscription_id)
      where stripe_subscription_id is not null;
  end if;
end $$;
