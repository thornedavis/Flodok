-- Document templates (Phase G.1).
--
-- Generalises the "template" concept across document types. Before this
-- migration, templates lived as `contracts.is_template = true` rows —
-- which worked, but conflated two distinct ideas (a contract issued to
-- an employee vs. a reusable starter) inside one table, and gave us
-- no path for SOP templates. The new table is the single home for
-- reusable starters, typed via a discriminator column.
--
-- What this migration does:
--   1. Creates `public.document_templates` with the document_type
--      discriminator and all per-type fields nullable (contract-only
--      wage/hour fields apply when type='contract').
--   2. Backfills it from the existing `contracts where is_template = true`
--      rows, preserving content_doc + markdown + structured contract fields.
--   3. Leaves the existing contract rows in place for now — the cleanup
--      that drops `is_template` / `template_for_position` from contracts
--      ships later, after the new code path is in production and verified.
--   4. RLS: org members read/write their own org's templates.

create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- Discriminator. Determines which optional fields are meaningful.
  type text not null,
  title text not null,
  -- Structured-document source of truth (Phase A schema). Markdown
  -- columns below stay for back-compat with the older editor.
  content_doc jsonb,
  content_markdown text not null default '',
  content_markdown_id text,
  -- Position the template auto-applies for when extending an offer.
  -- contract-only — null for SOP templates.
  template_for_position text,
  -- Structured contract fields (contract-only). Null for SOP templates.
  base_wage_idr bigint,
  allowance_idr bigint,
  hours_per_day numeric,
  days_per_week numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_templates_type_check
    check (type in ('sop', 'contract'))
);

comment on table public.document_templates is
  'Reusable document starters, typed via `type`. Replaces the per-table is_template flag pattern. Contract-specific fields (wage/hours) are only populated when type=''contract''.';

create index document_templates_org_type_idx
  on public.document_templates (org_id, type);

create index document_templates_position_idx
  on public.document_templates (org_id, template_for_position)
  where type = 'contract' and template_for_position is not null;

alter table public.document_templates enable row level security;

create policy "members read own org templates"
  on public.document_templates
  for select
  using (
    org_id in (select org_id from public.users where id = auth.uid())
  );

create policy "members insert own org templates"
  on public.document_templates
  for insert
  with check (
    org_id in (select org_id from public.users where id = auth.uid())
  );

create policy "members update own org templates"
  on public.document_templates
  for update
  using (
    org_id in (select org_id from public.users where id = auth.uid())
  )
  with check (
    org_id in (select org_id from public.users where id = auth.uid())
  );

create policy "members delete own org templates"
  on public.document_templates
  for delete
  using (
    org_id in (select org_id from public.users where id = auth.uid())
  );

------------------------------------------------------------
-- Backfill from existing contract templates
------------------------------------------------------------

insert into public.document_templates (
  org_id,
  type,
  title,
  content_doc,
  content_markdown,
  content_markdown_id,
  template_for_position,
  base_wage_idr,
  allowance_idr,
  hours_per_day,
  days_per_week,
  created_at,
  updated_at
)
select
  org_id,
  'contract',
  title,
  content_doc,
  coalesce(content_markdown, ''),
  content_markdown_id,
  template_for_position,
  base_wage_idr,
  allowance_idr,
  hours_per_day,
  days_per_week,
  created_at,
  updated_at
from public.contracts
where is_template = true;
