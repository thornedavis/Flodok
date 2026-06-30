-- Founder Console — AI usage ledger (Phase 2).
--
-- Per-call token + cost capture for every AI (OpenRouter) request. Written by
-- the edge functions via the service-role client (see _shared/logUsage.ts);
-- read only by platform admins through admin_ai_usage(). cost_usd comes
-- straight from OpenRouter's usage accounting — we don't price models ourselves.
--
-- History note: rows accrue from deploy-time forward. Account-wide spend before
-- instrumentation (and the un-instrumented Fireflies worker) is visible via the
-- OpenRouter account totals surfaced by the admin-metrics edge function.

create table if not exists public.ai_usage (
  id                uuid primary key default gen_random_uuid(),
  -- Nullable + ON DELETE SET NULL: keep the cost record even if the org is
  -- deleted. called_by is the auth user id; intentionally no FK to auth.users
  -- so this table stays decoupled from the auth schema.
  org_id            uuid references public.organizations(id) on delete set null,
  called_by         uuid,
  function_name     text not null,
  model             text not null,
  provider          text not null default 'openrouter',
  prompt_tokens     integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens      integer not null default 0,
  cost_usd          numeric(12, 6),
  created_at        timestamptz not null default now()
);

create index if not exists ai_usage_created_at_idx on public.ai_usage (created_at desc);
create index if not exists ai_usage_org_idx on public.ai_usage (org_id);

alter table public.ai_usage enable row level security;

-- Platform-admin read only. No INSERT/UPDATE/DELETE policy exists, so
-- authenticated/anon clients can't write — only the service-role client
-- (logUsage.ts), which bypasses RLS entirely, ever writes here.
drop policy if exists ai_usage_admin_read on public.ai_usage;
create policy ai_usage_admin_read on public.ai_usage
  for select to authenticated
  using (coalesce((select is_platform_admin from public.users where id = auth.uid()), false));

-- ── admin_ai_usage(since, until) — aggregated breakdowns for the AI panel ────
-- One round-trip returns total + by_function + by_model + by_org + by_day as
-- jsonb. Gated on is_platform_admin. The table's RLS already restricts reads,
-- but this also shapes the data so the client never sees raw rows.
create or replace function public.admin_ai_usage(
  p_since timestamptz default (now() - interval '30 days'),
  p_until timestamptz default now()
)
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
    'since', p_since,
    'until', p_until,
    'total', (
      select jsonb_build_object(
        'calls', count(*),
        'prompt_tokens', coalesce(sum(prompt_tokens), 0),
        'completion_tokens', coalesce(sum(completion_tokens), 0),
        'total_tokens', coalesce(sum(total_tokens), 0),
        'cost_usd', coalesce(sum(cost_usd), 0)
      )
      from public.ai_usage
      where created_at >= p_since and created_at < p_until
    ),
    'by_function', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.cost_usd desc), '[]'::jsonb)
      from (
        select function_name,
               count(*) as calls,
               coalesce(sum(total_tokens), 0) as total_tokens,
               coalesce(sum(cost_usd), 0) as cost_usd
        from public.ai_usage
        where created_at >= p_since and created_at < p_until
        group by function_name
      ) x
    ),
    'by_model', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.cost_usd desc), '[]'::jsonb)
      from (
        select model,
               count(*) as calls,
               coalesce(sum(total_tokens), 0) as total_tokens,
               coalesce(sum(cost_usd), 0) as cost_usd
        from public.ai_usage
        where created_at >= p_since and created_at < p_until
        group by model
      ) x
    ),
    'by_org', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.cost_usd desc), '[]'::jsonb)
      from (
        select a.org_id,
               o.name as org_name,
               count(*) as calls,
               coalesce(sum(a.total_tokens), 0) as total_tokens,
               coalesce(sum(a.cost_usd), 0) as cost_usd
        from public.ai_usage a
        left join public.organizations o on o.id = a.org_id
        where a.created_at >= p_since and a.created_at < p_until
        group by a.org_id, o.name
        order by cost_usd desc
        limit 20
      ) x
    ),
    'by_day', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.day), '[]'::jsonb)
      from (
        select date_trunc('day', created_at)::date as day,
               coalesce(sum(cost_usd), 0) as cost_usd,
               coalesce(sum(total_tokens), 0) as total_tokens
        from public.ai_usage
        where created_at >= p_since and created_at < p_until
        group by 1
      ) x
    )
  ) into result;

  return result;
end;
$$;

revoke execute on function public.admin_ai_usage(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_ai_usage(timestamptz, timestamptz) to authenticated;
