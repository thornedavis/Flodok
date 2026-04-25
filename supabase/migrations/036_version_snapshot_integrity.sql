-- Phase 2: Extend version tables so snapshots are honest, bilingual records.
--
-- Current state (the gap this fixes):
--   * sop_versions / contract_versions store only `content_markdown` — a
--     single language, no record of the translated counterpart.
--   * contract_versions has no record of structured wage / hours / employee
--     state. Editing only those fields silently overwrites the live row
--     without bumping a version.
--   * No way to tell, from a version row, whether the translated copy was
--     missing (translation never ran), failed, or simply hadn't been saved.
--
-- After this migration:
--   * Both `*_versions` tables hold both languages: `content_markdown` (EN)
--     + `content_markdown_id` (ID).
--   * Both store post-merge-field rendered output (`resolved_markdown_en` /
--     `resolved_markdown_id`) — the canonical record of what the user
--     actually saw at save time. Important once contracts/SOPs use merge
--     fields ({{employee_name}}, {{base_wage_idr}}, etc.) — we want the
--     historical view to show the values in force then, not now.
--   * Translation state (`complete` | `failed`) + optional error message.
--   * `contract_versions` snapshots structured numerics (base_wage_idr,
--     allowance_idr, hours_per_day, days_per_week) and the assigned
--     employee at the time.
--
-- Backfill notes:
--   * Existing rows have no captured ID translation — `content_markdown_id`
--     stays NULL. Viewers must show "translation not captured" empty state
--     for these rows when the user toggles to ID. Marking them as
--     translation_status = 'complete' would be a lie; leaving them at the
--     default and letting the viewer detect missing language is honest.
--   * `resolved_markdown_en` is set equal to `content_markdown` — at the
--     time these snapshots were taken there were no merge fields, so the
--     raw markdown WAS the resolved markdown.
--   * Structured wage columns are left NULL on existing contract_versions:
--     we never recorded them, and the current contracts.* values are not a
--     reliable proxy (could have been edited mid-version-cycle without a
--     version bump under the old rules).

-- ─── sop_versions ───────────────────────────────────────────────────────

alter table sop_versions
  add column if not exists content_markdown_id text,
  add column if not exists resolved_markdown_en text,
  add column if not exists resolved_markdown_id text,
  add column if not exists translation_status text not null default 'complete'
    check (translation_status in ('complete', 'failed')),
  add column if not exists translation_error text;

-- Backfill: at save time of these rows, no merge fields existed, so the
-- "rendered" output was identical to the source markdown.
update sop_versions
set resolved_markdown_en = content_markdown
where resolved_markdown_en is null;

-- ─── contract_versions ──────────────────────────────────────────────────

alter table contract_versions
  add column if not exists content_markdown_id text,
  add column if not exists resolved_markdown_en text,
  add column if not exists resolved_markdown_id text,
  add column if not exists translation_status text not null default 'complete'
    check (translation_status in ('complete', 'failed')),
  add column if not exists translation_error text,
  add column if not exists employee_id uuid references employees on delete set null,
  add column if not exists base_wage_idr integer,
  add column if not exists allowance_idr integer,
  add column if not exists hours_per_day integer,
  add column if not exists days_per_week integer;

alter table contract_versions
  drop constraint if exists contract_versions_base_wage_nonneg,
  add constraint contract_versions_base_wage_nonneg
    check (base_wage_idr is null or base_wage_idr >= 0);

alter table contract_versions
  drop constraint if exists contract_versions_allowance_nonneg,
  add constraint contract_versions_allowance_nonneg
    check (allowance_idr is null or allowance_idr >= 0);

update contract_versions
set resolved_markdown_en = content_markdown
where resolved_markdown_en is null;

comment on column contract_versions.base_wage_idr is
  'Snapshot of the contract''s base wage at the time of this version. NULL for rows backfilled before structured wage history existed.';
comment on column contract_versions.translation_status is
  'Whether the translated counterpart for this snapshot was successfully captured. ''failed'' rows surface an empty-state retry UI in the history viewer.';
