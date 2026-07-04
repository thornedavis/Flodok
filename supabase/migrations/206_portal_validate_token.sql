-- portal_validate_token — lets the flodok-router `/pdf` worker authorize an
-- employee-portal caller by (slug, access_token), the same credential every
-- portal_* RPC already validates (see 028_portal_home_rpc, 140_portal_onboarding_rpcs).
--
-- Why: the employee portal's signed-PDF download is moving off client-side
-- html2pdf onto the SAME Cloudflare Browser Rendering worker the dashboard uses,
-- so the employee's PDF is byte-identical to the admin export (letterhead,
-- signature fonts, margins). The worker has no Supabase JWT for a portal
-- visitor — only the slug+token from the portal link — so it needs a way to
-- confirm that credential before spending Browser Rendering quota.
--
-- Deliberately minimal: returns ONLY a boolean ("is this a live employee's
-- token?"), leaks nothing else, and is safe to expose to anon. SECURITY DEFINER
-- so it can read employees past RLS; the boolean-only surface is the guard.
-- Mirrors the portal pattern of matching deleted_at IS NULL.

create or replace function portal_validate_token(emp_slug text, emp_token text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from employees
    where slug = emp_slug
      and access_token = emp_token
      and deleted_at is null
  );
$$;

revoke all on function portal_validate_token(text, text) from public;
grant execute on function portal_validate_token(text, text) to anon, authenticated;
