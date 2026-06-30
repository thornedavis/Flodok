-- Founder Console — per-org drill-in (Phase 3).
--
-- admin_org_detail(org_id) backs the row-click drawer: org + billing, content
-- counts, the member list with each user's last_sign_in_at (auth schema, hence
-- SECURITY DEFINER), 30-day AI spend for the org, and any pending owner-claim.
-- Gated on is_platform_admin like the other admin_* RPCs.

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
               o.subscription_quantity, o.current_period_end, o.cancel_at_period_end,
               o.past_due_since, o.created_at, o.onboarding_completed_at,
               o.stripe_customer_id, o.company_email
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
