-- Replace free-text posted_as with a two-value enum so a manager cannot
-- impersonate another colleague by typing their name. The display author is
-- now always one of:
--   • 'self' — the creator's user.name (resolved at read time)
--   • 'org'  — the organisation's display_name (resolved at read time)
-- The portal RPC computes author_name from the kind, so the client never
-- sends a literal name string and there's no free-text surface to abuse.

alter table public.spotlight_posts
  add column if not exists posted_as_kind text not null default 'self'
    check (posted_as_kind in ('self', 'org'));

alter table public.spotlight_posts drop column if exists posted_as;

-- Re-create the portal RPC against the new shape. The return signature
-- changes (posted_as is gone) so we drop the old one first.
drop function if exists public.portal_spotlight_posts(text, text);

create or replace function public.portal_spotlight_posts(
  emp_slug text,
  emp_token text
)
returns table (
  id uuid,
  title text,
  author_name text,
  what_happened text,
  what_to_do_instead text,
  who_applies_note text,
  priority text,
  display_mode text,
  requires_acknowledgement boolean,
  effective_from timestamptz,
  effective_until timestamptz,
  pinned boolean,
  published_at timestamptz,
  first_seen_at timestamptz,
  acknowledged_at timestamptz,
  dismissed_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  emp public.employees%rowtype;
begin
  select * into emp from public.employees
  where slug = emp_slug and access_token = emp_token
  limit 1;

  if emp.id is null then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  return query
  select
    p.id,
    p.title,
    case
      when p.posted_as_kind = 'org' then coalesce(o.display_name, o.name, '')
      else coalesce(u.name, '')
    end as author_name,
    p.what_happened,
    p.what_to_do_instead,
    p.who_applies_note,
    p.priority,
    p.display_mode,
    p.requires_acknowledgement,
    p.effective_from,
    p.effective_until,
    p.pinned,
    p.published_at,
    v.first_seen_at,
    v.acknowledged_at,
    v.dismissed_at
  from public.spotlight_posts p
  left join public.users u on u.id = p.created_by
  left join public.organizations o on o.id = p.org_id
  left join public.spotlight_post_views v
    on v.post_id = p.id and v.employee_id = emp.id
  where p.org_id = emp.org_id
    and p.status = 'published'
    and (p.effective_from is null or p.effective_from <= now())
    and (p.effective_until is null or p.effective_until > now())
    and (
      p.visibility_scope = 'org_wide'
      or (
        p.visibility_scope = 'departments'
        and exists (
          select 1 from unnest(p.target_departments) d
          where d = any(coalesce(emp.departments, array[]::text[]))
            or d = emp.department
        )
      )
      or (
        p.visibility_scope = 'specific_employees'
        and emp.id = any(p.target_employee_ids)
      )
    )
  order by p.pinned desc, p.published_at desc nulls last;
end;
$$;

grant execute on function public.portal_spotlight_posts(text, text) to anon, authenticated;
