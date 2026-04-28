-- Platform admin flag.
--
-- Distinguishes the SaaS operators (us) from org admins (customers). Platform
-- admins can override per-org guardrails — e.g. edit names / illustrations /
-- descriptions on the seeded auto-badges, where regular org admins are
-- locked to toggling is_active and is_featured. Default false; we flip
-- specific accounts to true here.

alter table public.users
  add column if not exists is_platform_admin boolean not null default false;

update public.users
  set is_platform_admin = true
  where lower(email) = 'hello@thornedavis.com';
