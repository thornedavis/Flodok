-- Job descriptions: the structured artifact between an approved hiring
-- request and a hired employee.
--
-- An approved hiring_request becomes a draft job_description (or HR can
-- start one standalone — the hiring_request_id FK is nullable). The JD
-- captures the role's positional context (reporting line, level, etc.)
-- and a structured prose body broken into the six paper-form sections:
-- overview, responsibilities, competencies, KPIs, coordination, and
-- general requirements.
--
-- Body content lives in a single `content_doc` JSONB blob (the same
-- bilingual document shape contracts and SOPs now use post-085) rather
-- than six discrete markdown columns. This deviates from the original
-- spec's per-section columns; the unified shape lets us reuse the
-- DocumentEditor and exportDocumentPdf pipelines unchanged. The six
-- sections are seeded as headings inside the doc when a new JD is
-- created, so the structure is still load-bearing — just expressed
-- inside the doc rather than in DDL.
--
-- Versions mirror contract_versions: every save bumps current_version
-- and inserts an immutable snapshot row. Signatures mirror
-- contract_signatures; only employees sign (signer_role is hard-coded
-- in the v1 portal flow, no enum needed yet).

-- ─── Table: job_descriptions ─────────────────────────────────────────────

create table if not exists public.job_descriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,

  -- Provenance link: when present, ties the JD back to the approved
  -- hiring request it was drafted from. Nullable so HR can also create
  -- standalone JDs (e.g. importing an existing role description).
  hiring_request_id uuid references public.hiring_requests(id) on delete set null,

  -- Positional context
  title text not null check (length(trim(title)) > 0),
  department_id uuid references public.company_departments(id) on delete set null,
  reporting_line text,
  job_level text,
  supervised_team text,
  work_location text,
  effective_date date,

  -- Doc-number convention is org-specific (e.g. "ORG/HR-JD/DEPT/YYYY/Ver01");
  -- treat as free text and let the UI auto-suggest a default at create time.
  doc_version text,

  -- Body content. Structured document JSON (Document → Section →
  -- BilingualBlock) seeded with the six standard JD sections. Nullable
  -- while the JD is being shaped — required-section validation lives in
  -- the UI, not as a DB constraint (a half-filled JD is still saveable
  -- as a draft).
  content_doc jsonb,

  -- Lifecycle
  current_version integer not null default 1,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  archived_at timestamptz,

  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_job_descriptions_org_status
  on public.job_descriptions (org_id, status, updated_at desc);

create index if not exists idx_job_descriptions_request
  on public.job_descriptions (hiring_request_id)
  where hiring_request_id is not null;

create index if not exists idx_job_descriptions_department
  on public.job_descriptions (department_id)
  where department_id is not null;

-- updated_at touch trigger
create or replace function public.tg_job_descriptions_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_job_descriptions_touch on public.job_descriptions;
create trigger trg_job_descriptions_touch
  before update on public.job_descriptions
  for each row execute function public.tg_job_descriptions_touch();

-- ─── Table: job_description_versions ─────────────────────────────────────

-- Immutable snapshot per save. Mirrors contract_versions shape so the
-- snapshot edge function (snapshot-sop, despite the name) can later be
-- extended to write here too without invention.
create table if not exists public.job_description_versions (
  id uuid primary key default gen_random_uuid(),
  job_description_id uuid not null references public.job_descriptions(id) on delete cascade,
  version_number integer not null,

  -- Snapshot of structural metadata at save time. Useful for the history
  -- view; lets reviewers see what changed in the header, not just the body.
  title text not null,
  department_id uuid references public.company_departments(id) on delete set null,
  reporting_line text,
  job_level text,
  supervised_team text,
  work_location text,
  effective_date date,
  doc_version text,

  -- Body snapshot. Single source of truth for v1; no derived markdown
  -- columns yet (the editor reads/writes content_doc directly and the
  -- PDF export operates on content_doc — no markdown projection needed
  -- for the JD surface).
  content_doc jsonb,

  change_summary text,
  changed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (job_description_id, version_number)
);

create index if not exists idx_job_description_versions_doc
  on public.job_description_versions (job_description_id, version_number desc);

-- ─── Table: job_description_signatures ───────────────────────────────────

-- Employees sign their JD during onboarding (Phase E). The schema mirrors
-- contract_signatures: signed against a specific version_number so an
-- amended JD requires a fresh signature.
--
-- No signer_role column — JDs are signed by exactly one party (the
-- employee). If we ever add manager countersigning, that's a column add
-- (signer_role text default 'employee' check (...)) rather than a model
-- redesign.
create table if not exists public.job_description_signatures (
  id uuid primary key default gen_random_uuid(),
  job_description_id uuid not null references public.job_descriptions(id) on delete cascade,
  version_number integer not null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  typed_name text not null,
  signature_font text,
  signed_at timestamptz not null default now()
);

create index if not exists idx_jd_signatures_doc on public.job_description_signatures(job_description_id);
create index if not exists idx_jd_signatures_employee on public.job_description_signatures(employee_id);

-- ─── RLS: job_descriptions ───────────────────────────────────────────────

alter table public.job_descriptions enable row level security;

-- Visibility: anyone in the org sees published/archived JDs (they're
-- effectively role docs that everyone can reference). Drafts are
-- restricted to owner/admin/hr — there's no point letting members peek
-- at half-written role descriptions.
create policy "Authorised viewers see JDs"
  on public.job_descriptions for select to authenticated
  using (
    org_id = public.get_user_org_id()
    and (
      status in ('published', 'archived')
      or public.get_user_role() in ('owner', 'admin', 'hr')
    )
  );

-- Write access is HR + admin + owner only. Department managers don't get
-- to edit JDs — they request the role via a hiring_request, and HR is
-- responsible for codifying it. Keeps editorial control in one place.
create policy "HR can manage JDs"
  on public.job_descriptions for all to authenticated
  using (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin', 'hr')
  )
  with check (
    org_id = public.get_user_org_id()
    and public.get_user_role() in ('owner', 'admin', 'hr')
  );

-- ─── RLS: job_description_versions ──────────────────────────────────────

alter table public.job_description_versions enable row level security;

-- Versions inherit visibility from the parent JD — anyone who can see the
-- JD can see its history. Inserts/updates/deletes are HR-only (the live
-- JD's write policy already gates this at the parent level, but we belt-
-- and-brace it here so direct INSERTs from RPCs/edge functions still go
-- through the auth check).
create policy "Authorised viewers see JD versions"
  on public.job_description_versions for select to authenticated
  using (
    job_description_id in (
      select id from public.job_descriptions
      where org_id = public.get_user_org_id()
        and (
          status in ('published', 'archived')
          or public.get_user_role() in ('owner', 'admin', 'hr')
        )
    )
  );

create policy "HR can write JD versions"
  on public.job_description_versions for all to authenticated
  using (
    job_description_id in (
      select id from public.job_descriptions
      where org_id = public.get_user_org_id()
        and public.get_user_role() in ('owner', 'admin', 'hr')
    )
  )
  with check (
    job_description_id in (
      select id from public.job_descriptions
      where org_id = public.get_user_org_id()
        and public.get_user_role() in ('owner', 'admin', 'hr')
    )
  );

-- ─── RLS: job_description_signatures ────────────────────────────────────

alter table public.job_description_signatures enable row level security;

-- Same shape as contract_signatures: managers see signatures in their org,
-- portal (anon + authenticated employee tokens) can insert their own.
create policy "Managers can view JD signatures in own org"
  on public.job_description_signatures for select
  using (
    job_description_id in (select id from public.job_descriptions where org_id = public.get_user_org_id())
  );

create policy "Public can insert JD signatures"
  on public.job_description_signatures for insert
  to anon
  with check (true);

create policy "Public can view own JD signatures"
  on public.job_description_signatures for select
  to anon
  using (true);

create policy "Authenticated can insert JD signatures"
  on public.job_description_signatures for insert
  to authenticated
  with check (true);

-- ─── Status transitions ─────────────────────────────────────────────────
--
-- The status flow is draft → published → archived (one-way). Republishing
-- an archived JD requires a new draft; the historical archive row stays
-- intact so anyone signed against an earlier version still has a stable
-- target. These tiny RPCs centralise the published_at / archived_at
-- stamping so the UI can't forget to set them.

create or replace function public.publish_job_description(p_id uuid)
returns public.job_descriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  jd public.job_descriptions%rowtype;
  caller_role text;
  caller_org uuid;
begin
  select role, org_id into caller_role, caller_org
  from public.users where id = auth.uid();

  if caller_role not in ('owner', 'admin', 'hr') then
    raise exception 'Not authorized to publish job descriptions';
  end if;

  select * into jd from public.job_descriptions where id = p_id;
  if jd.id is null then
    raise exception 'Job description not found';
  end if;
  if jd.org_id <> caller_org then
    raise exception 'Job description belongs to another organisation';
  end if;
  if jd.status <> 'draft' then
    raise exception 'Only drafts can be published (current status: %)', jd.status;
  end if;

  update public.job_descriptions
  set status = 'published',
      published_at = now()
  where id = p_id
  returning * into jd;

  return jd;
end;
$$;

grant execute on function public.publish_job_description(uuid) to authenticated;

create or replace function public.archive_job_description(p_id uuid)
returns public.job_descriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  jd public.job_descriptions%rowtype;
  caller_role text;
  caller_org uuid;
begin
  select role, org_id into caller_role, caller_org
  from public.users where id = auth.uid();

  if caller_role not in ('owner', 'admin', 'hr') then
    raise exception 'Not authorized to archive job descriptions';
  end if;

  select * into jd from public.job_descriptions where id = p_id;
  if jd.id is null then
    raise exception 'Job description not found';
  end if;
  if jd.org_id <> caller_org then
    raise exception 'Job description belongs to another organisation';
  end if;
  if jd.status = 'archived' then
    raise exception 'Job description is already archived';
  end if;

  update public.job_descriptions
  set status = 'archived',
      archived_at = now()
  where id = p_id
  returning * into jd;

  return jd;
end;
$$;

grant execute on function public.archive_job_description(uuid) to authenticated;
