-- Employee attachments — generic per-employee file uploads.
--
-- Built primarily for the recruitment flow: CVs, cover letters, portfolios,
-- certificates, scanned references, etc. Reused on the full Employee
-- editor too (an employee is just a candidate that signed).
--
-- Shape decisions:
--   * One row per file, so a candidate can have many docs of the same or
--     different kinds without column proliferation.
--   * `kind` is free-text (constrained client-side to a known set) so we
--     can add categories like 'reference' or 'tax_form' later without a
--     migration. Null = uncategorised.
--   * Files are stored in a new `employee_attachments` bucket — distinct
--     from `employee_docs` (KTP/KK, images only, 5 MB) because we accept
--     PDF/DOC and need a larger size cap.

create table public.employee_attachments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  file_url text not null,
  file_path text not null,
  file_name text not null,
  file_size bigint,
  mime_type text,
  kind text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.employee_attachments is
  'Per-employee file attachments (CV, cover letter, portfolio, certificates, etc). One row per file. Used on candidate + employee editors.';

create index employee_attachments_employee_idx
  on public.employee_attachments (employee_id, created_at desc);

alter table public.employee_attachments enable row level security;

create policy "members read own org attachments"
  on public.employee_attachments
  for select
  using (
    exists (
      select 1 from public.employees e
      where e.id = employee_attachments.employee_id
        and e.org_id = public.get_user_org_id()
    )
  );

create policy "members insert own org attachments"
  on public.employee_attachments
  for insert
  with check (
    exists (
      select 1 from public.employees e
      where e.id = employee_attachments.employee_id
        and e.org_id = public.get_user_org_id()
    )
  );

create policy "members update own org attachments"
  on public.employee_attachments
  for update
  using (
    exists (
      select 1 from public.employees e
      where e.id = employee_attachments.employee_id
        and e.org_id = public.get_user_org_id()
    )
  )
  with check (
    exists (
      select 1 from public.employees e
      where e.id = employee_attachments.employee_id
        and e.org_id = public.get_user_org_id()
    )
  );

create policy "members delete own org attachments"
  on public.employee_attachments
  for delete
  using (
    exists (
      select 1 from public.employees e
      where e.id = employee_attachments.employee_id
        and e.org_id = public.get_user_org_id()
    )
  );

-- Storage bucket. Path shape: <employee_id>/<random>.<ext>
--   * Public read so the file_url can be used directly without signed-URL plumbing
--     (mirrors how `employee_docs` and `avatars` work).
--   * 10 MB cap — PDFs run larger than the 5 MB KTP/KK images.
--   * Accept PDF + Word + common images. ZIP/PPT excluded for now.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee_attachments',
  'employee_attachments',
  true,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public can view employee attachments"
  on storage.objects for select
  to public
  using (bucket_id = 'employee_attachments');

create policy "Org members can insert employee attachments"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'employee_attachments'
    and exists (
      select 1 from public.employees e
      where e.id::text = split_part(name, '/', 1)
        and e.org_id = public.get_user_org_id()
    )
  );

create policy "Org members can update employee attachments"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'employee_attachments'
    and exists (
      select 1 from public.employees e
      where e.id::text = split_part(name, '/', 1)
        and e.org_id = public.get_user_org_id()
    )
  );

create policy "Org members can delete employee attachments"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'employee_attachments'
    and exists (
      select 1 from public.employees e
      where e.id::text = split_part(name, '/', 1)
        and e.org_id = public.get_user_org_id()
    )
  );
