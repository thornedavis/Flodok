-- Privatize employee_docs (KTP / KK national-ID images).
--
-- 021 created this bucket public=true with a `to public` read policy, so anyone
-- with an object URL (paths are <employee_id>/<kind>.<ext> — guessable once an
-- employee id is known) could fetch KTP/KK national-ID scans. This locks it to
-- authenticated members of the owning employee's org, served via signed URLs.
--
-- Writes were already authenticated + org-scoped (021), so only the read side
-- and the bucket's public flag change here. The front end (DocumentUpload) now
-- stores the object PATH instead of a baked-in public URL and signs it on
-- render, so existing rows are migrated URL -> path below.

-- 1. Flip the bucket private (kills the public CDN URL path).
update storage.buckets set public = false where id = 'employee_docs';

-- 2. Replace the public read with an authenticated, org-scoped read. Managers
--    can generate signed URLs for their own org's employee docs; nobody else.
drop policy if exists "Public can view employee docs" on storage.objects;

create policy "Org members can view employee docs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'employee_docs'
    and exists (
      select 1 from public.employees e
      where e.id::text = split_part(name, '/', 1)
        and e.org_id = public.get_user_org_id()
    )
  );

-- 3. Migrate stored full public URLs to bare object paths. The render path now
--    signs these on demand.
--    e.g.  https://<proj>.supabase.co/storage/v1/object/public/employee_docs/<id>/ktp.jpg?t=1
--          ->  <id>/ktp.jpg
update public.employees
set ktp_photo_url = regexp_replace(ktp_photo_url, '^.*/employee_docs/([^?]+).*$', '\1')
where ktp_photo_url like '%/employee_docs/%';

update public.employees
set kk_photo_url = regexp_replace(kk_photo_url, '^.*/employee_docs/([^?]+).*$', '\1')
where kk_photo_url like '%/employee_docs/%';
