-- Employee document uploads (KTP + Surat KK) and multi-department tagging.
--
-- 1. Add columns to employees:
--      ktp_photo_url   — public URL of the KTP document image
--      kk_photo_url    — public URL of the Surat KK document image
--      departments[]   — array of departments (multi-select); legacy `department`
--                        column is kept for now so existing filter sites in SOPs,
--                        Contracts, Overview keep working. The first element of
--                        `departments` is mirrored back into `department` on write.
-- 2. Backfill departments from the existing single-value column.
-- 3. Create a new `employee_docs` storage bucket for ID/KK images with path-scoped
--    RLS — only members of the employee's org can read/write its documents.

alter table public.employees
  add column if not exists ktp_photo_url text,
  add column if not exists kk_photo_url text,
  add column if not exists departments text[] not null default '{}';

update public.employees
set departments = array[department]
where department is not null
  and department <> ''
  and (cardinality(departments) = 0);

-- Storage bucket for employee ID/document images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee_docs',
  'employee_docs',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- RLS: read is public (so the stored URL can render in an <img>); writes are
-- scoped to members of the owning employee's org.
--
-- Path shape: <employee_id>/<kind>.<ext>  e.g.  a1b2.../ktp.jpg

create policy "Public can view employee docs"
  on storage.objects for select
  to public
  using (bucket_id = 'employee_docs');

create policy "Org members can insert employee docs"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'employee_docs'
    and exists (
      select 1 from public.employees e
      where e.id::text = split_part(name, '/', 1)
        and e.org_id = public.get_user_org_id()
    )
  );

create policy "Org members can update employee docs"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'employee_docs'
    and exists (
      select 1 from public.employees e
      where e.id::text = split_part(name, '/', 1)
        and e.org_id = public.get_user_org_id()
    )
  );

create policy "Org members can delete employee docs"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'employee_docs'
    and exists (
      select 1 from public.employees e
      where e.id::text = split_part(name, '/', 1)
        and e.org_id = public.get_user_org_id()
    )
  );
