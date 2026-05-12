-- Documents overhaul groundwork (Phase A).
--
-- Lays the schema for the upcoming bilingual-block editor and unified
-- /dashboard/documents experience without touching any current write paths.
-- Everything added here is nullable / has a default, so existing INSERTs in
-- SOPEdit, ContractEdit, snapshot-sop, and the sop-updates webhook keep
-- working unchanged. The new columns and table will only become load-bearing
-- when Phase C (the new editor) and Phase D (the view toggle / renderer) land.
--
-- What this migration introduces:
--   1. `content_doc` on sops/contracts and their *_versions tables — a JSONB
--      structured document (Document → Section → BilingualBlock) that will
--      replace flat markdown as the source of truth. Nullable for now;
--      tightened to NOT NULL once Phase C ships.
--   2. Document-header metadata on sops/contracts: `document_number`,
--      `owner_department`, `approved_by`. Free-text by design — different
--      orgs use different numbering schemes and approver labels (a person,
--      a role like "Management", or a department).
--   3. `document_view_prefs` — per-user, per-document choice between stacked
--      and side-by-side view. Default behavior when no row exists is
--      stacked; Phase D's editor will upsert on toggle.

------------------------------------------------------------
-- 1. Structured document storage (forward-compatible)
------------------------------------------------------------

alter table public.sops
  add column content_doc jsonb;

alter table public.sop_versions
  add column content_doc jsonb;

alter table public.contracts
  add column content_doc jsonb;

alter table public.contract_versions
  add column content_doc jsonb;

comment on column public.sops.content_doc is
  'Structured document JSON (Document → Section → BilingualBlock). Null until Phase C migrates this doc to the new editor. When non-null, this is the source of truth and content_markdown* is a derived projection.';

comment on column public.contracts.content_doc is
  'Structured document JSON (Document → Section → BilingualBlock). Null until Phase C migrates this doc to the new editor. When non-null, this is the source of truth and content_markdown* is a derived projection.';

------------------------------------------------------------
-- 2. Document-header metadata
------------------------------------------------------------

alter table public.sops
  add column document_number text,
  add column owner_department text,
  add column approved_by text;

alter table public.contracts
  add column document_number text,
  add column owner_department text,
  add column approved_by text;

comment on column public.sops.document_number is
  'Free-text document number (e.g. "BCAI-HR/SOP-RECRUIT/2026/001"). Different orgs use different numbering schemes; no enforced format.';

comment on column public.sops.approved_by is
  'Free-text label for who approved the document — may be a person, a role ("Management"), or a department. Not a user reference; renders verbatim in the document header.';

------------------------------------------------------------
-- 3. Per-user, per-document view preference
------------------------------------------------------------

create table public.document_view_prefs (
  user_id uuid not null references public.users on delete cascade,
  document_type text not null,
  document_id uuid not null,
  view_mode text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, document_type, document_id),
  constraint document_view_prefs_type_check
    check (document_type in ('sop', 'contract')),
  constraint document_view_prefs_mode_check
    check (view_mode in ('stacked', 'side_by_side'))
);

comment on table public.document_view_prefs is
  'Per-user choice of stacked vs side-by-side view for each document. Absence of a row implies the default (stacked).';

alter table public.document_view_prefs enable row level security;

create policy "users read own view prefs"
  on public.document_view_prefs
  for select
  using (user_id = auth.uid());

create policy "users upsert own view prefs"
  on public.document_view_prefs
  for insert
  with check (user_id = auth.uid());

create policy "users update own view prefs"
  on public.document_view_prefs
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users delete own view prefs"
  on public.document_view_prefs
  for delete
  using (user_id = auth.uid());
