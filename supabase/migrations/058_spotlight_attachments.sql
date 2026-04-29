-- Spotlight attachments: image (snapped from the workplace) and link
-- (relevant SOP, KB article, video, etc).
--
-- Schema is intentionally narrow for v1: one image, one link, one label.
-- Can be widened to arrays later without breaking the column shape.
--
-- Storage: a new public bucket `spotlight` mirrors the `avatars` /
-- `employee_docs` pattern. 5 MB cap (phones tend to produce 3–4 MB shots).
-- Images are publicly readable so the portal can render them via plain
-- <img src=...> without signed-URL plumbing — this matches how org logos
-- and employee avatars already work.

alter table public.spotlight_posts
  add column if not exists image_url text,
  add column if not exists link_url text,
  add column if not exists link_label text;

-- Bucket. `on conflict do nothing` so re-running this migration is safe.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'spotlight',
  'spotlight',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy "Authenticated users can upload spotlight attachments"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'spotlight');

create policy "Authenticated users can update spotlight attachments"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'spotlight');

create policy "Authenticated users can delete spotlight attachments"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'spotlight');

create policy "Public can view spotlight attachments"
  on storage.objects for select
  to public
  using (bucket_id = 'spotlight');

-- Re-create the portal RPC to return the new columns.
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
  pinned boolean,
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
    p.pinned,
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
  order by p.pinned desc, p.published_at desc nulls last;
end;
$$;

grant execute on function public.portal_spotlight_posts(text, text) to anon, authenticated;
