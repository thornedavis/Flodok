-- Letters: 1:1 employee communication artefact (Phase 1).
--
-- Letters are a new document type alongside SOPs, contracts, and job
-- descriptions. They mirror the contracts shape — same bilingual
-- editor, same versioning, same in-table template pattern via
-- is_template — with these letter-specific additions:
--
--   * category   — human label sourced from a template ("Offering
--                  Letter", "Warning Letter"). Used for filtering.
--   * type_code  — short code substituted into reference_number
--                  templates ("OL", "WL", "PR"). Set on the template
--                  row and inherited by letters created from it.
--   * reference_number      — auto-generated using the org-wide
--                             prefix template; editable per-letter.
--   * sender_user_id        — the user who issues / signs the letter.
--   * requires_acknowledgement — opt-in "I read this" flow.
--   * response_by_date      — optional deadline shown in the portal.
--   * issued_at             — stamped when status moves draft → issued.
--
-- Status machine: draft → issued → archived. Drafts can exist without
-- an employee tagged; tagging *enables* the Issue action but does not
-- auto-fire it. The explicit issue call (Phase 2 RPC) writes issued_at
-- and flips status.
--
-- letter_versions snapshots content per issue / edit so the audit
-- trail of what an employee saw is preserved. letter_acknowledgements
-- records per-version reads when requires_acknowledgement is on.
-- letter_tags is a junction to the existing tags table for org-wide
-- categorisation (same pattern as sop_tags / contract_tags).
--
-- Phase 2 will add: issue_letter / acknowledge_letter / next_letter_reference_number
-- RPCs plus the portal_documents extension. No anon policies in this
-- migration — portal access goes through SECURITY DEFINER RPCs.

-- ─── letters ─────────────────────────────────────────────────

create table if not exists public.letters (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete cascade,
  -- Nullable: drafts can be authored before being addressed.
  employee_id              uuid null references public.employees(id) on delete set null,
  sender_user_id           uuid null references public.users(id)     on delete set null,
  -- Display category (free text so custom templates can name their own).
  category                 text null,
  -- Short code for reference-number substitution (e.g. 'OL', 'WL').
  type_code                text null,
  reference_number         text null,
  subject                  text null,
  title                    text not null,
  content_doc              jsonb null,
  content_markdown         text not null default '',
  content_markdown_id      text null,
  current_version          int  not null default 1,
  requires_acknowledgement boolean not null default false,
  response_by_date         date null,
  issued_at                timestamptz null,
  status                   text not null default 'draft'
                             check (status in ('draft', 'issued', 'archived')),
  is_template              boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz null,
  deleted_by               uuid null,
  trashed_with_parent_id   uuid null
);

create index if not exists letters_org_status_idx
  on public.letters (org_id, status) where deleted_at is null;

create index if not exists letters_employee_idx
  on public.letters (employee_id) where employee_id is not null and deleted_at is null;

create index if not exists letters_sender_idx
  on public.letters (sender_user_id) where sender_user_id is not null;

create index if not exists letters_template_idx
  on public.letters (org_id, category) where is_template = true and deleted_at is null;

-- ─── letter_versions ────────────────────────────────────────

create table if not exists public.letter_versions (
  id                  uuid primary key default gen_random_uuid(),
  letter_id           uuid not null references public.letters(id) on delete cascade,
  version_number      int  not null,
  content_doc         jsonb null,
  content_markdown    text not null default '',
  content_markdown_id text null,
  change_summary      text null,
  changed_by          uuid null references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (letter_id, version_number)
);

create index if not exists letter_versions_letter_idx
  on public.letter_versions (letter_id, version_number desc);

-- ─── letter_acknowledgements ────────────────────────────────

create table if not exists public.letter_acknowledgements (
  id              uuid primary key default gen_random_uuid(),
  letter_id       uuid not null references public.letters(id)   on delete cascade,
  employee_id     uuid not null references public.employees(id) on delete cascade,
  version_number  int  not null,
  acknowledged_at timestamptz not null default now(),
  -- Optional signed-name details for letters that opt into the "I read
  -- and accept" flow rather than the lighter "I read this" click.
  typed_name      text null,
  signature_font  text null,
  signature_meta  jsonb null,
  unique (letter_id, employee_id, version_number)
);

create index if not exists letter_acks_letter_version_idx
  on public.letter_acknowledgements (letter_id, version_number);

-- ─── letter_tags (junction to existing tags table) ──────────

create table if not exists public.letter_tags (
  letter_id uuid not null references public.letters(id) on delete cascade,
  tag_id    uuid not null references public.tags(id)    on delete cascade,
  primary key (letter_id, tag_id)
);

-- ─── organizations.letter_reference_prefix ──────────────────

-- Org-wide format template for auto-generating reference numbers.
-- Placeholders the Phase 2 RPC will substitute:
--   {type_code} — letter.type_code (e.g. 'OL')
--   {YYYY}      — issued_at year (or current year for drafts)
--   {seq}       — zero-padded sequence per (org, type_code, year)
-- The default mirrors the convention in the supplied offering letter
-- example minus the company code, which orgs add by editing the field
-- in Company settings (e.g. "BCA/HR-{type_code}/{YYYY}/{seq}").
alter table public.organizations
  add column if not exists letter_reference_prefix text
  default 'HR-{type_code}/{YYYY}/{seq}';

-- ─── RLS ────────────────────────────────────────────────────

alter table public.letters                 enable row level security;
alter table public.letter_versions         enable row level security;
alter table public.letter_acknowledgements enable row level security;
alter table public.letter_tags             enable row level security;

create policy "Managers can manage their org letters" on public.letters
  for all to authenticated
  using (org_id = public.get_user_org_id())
  with check (org_id = public.get_user_org_id());

create policy "Managers can manage their org letter versions" on public.letter_versions
  for all to authenticated
  using (letter_id in (select id from public.letters where org_id = public.get_user_org_id()))
  with check (letter_id in (select id from public.letters where org_id = public.get_user_org_id()));

create policy "Managers can manage their org letter acknowledgements" on public.letter_acknowledgements
  for all to authenticated
  using (letter_id in (select id from public.letters where org_id = public.get_user_org_id()))
  with check (letter_id in (select id from public.letters where org_id = public.get_user_org_id()));

create policy "Managers can manage their org letter tags" on public.letter_tags
  for all to authenticated
  using (letter_id in (select id from public.letters where org_id = public.get_user_org_id()))
  with check (letter_id in (select id from public.letters where org_id = public.get_user_org_id()));
