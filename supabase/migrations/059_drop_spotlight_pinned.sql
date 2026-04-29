-- Drop the `pinned` column from spotlight_posts.
--
-- Pin overlaps with priority (urgency) + display_mode (forced attention) +
-- republish (re-fire to top of feed), and the combinations get confusing.
-- Posts now sort purely by published_at desc, with priority colour-coding
-- doing the visual prioritisation.

-- Re-create the portal RPC first (it currently references the column).
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
  image_url text,
  link_url text,
  link_label text,
  priority text,
  display_mode text,
  requires_acknowledgement boolean,
  effective_from timestamptz,
  effective_until timestamptz,
  published_at timestamptz,
  republish_count int,
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
    p.image_url,
    p.link_url,
    p.link_label,
    p.priority,
    p.display_mode,
    p.requires_acknowledgement,
    p.effective_from,
    p.effective_until,
    p.published_at,
    p.republish_count,
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
  order by p.published_at desc nulls last;
end;
$$;

grant execute on function public.portal_spotlight_posts(text, text) to anon, authenticated;

-- Now safe to drop the column.
alter table public.spotlight_posts drop column if exists pinned;
