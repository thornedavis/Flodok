-- Job description templates.
--
-- Extends document_templates so JDs can have reusable starters the same
-- way SOPs and contracts do. The only schema change is loosening the
-- type CHECK constraint — all other columns already work for JDs:
--   - title, content_doc, content_markdown* — same role as elsewhere
--   - template_for_position — useful for JD templates too (e.g. a
--      "Senior Backend Engineer" template auto-suggested when HR
--      drafts a JD for that position)
--   - base_wage_idr / allowance_idr / hours_per_day / days_per_week —
--      remain null for JD templates (the document template editor
--      gates these behind the type discriminator in the UI)
--
-- No backfill needed; this is a forward-compatible relax of a single
-- check constraint.

alter table public.document_templates
  drop constraint document_templates_type_check;

alter table public.document_templates
  add constraint document_templates_type_check
    check (type in ('sop', 'contract', 'job_description'));

comment on column public.document_templates.type is
  'Discriminator across reusable document starters. ''contract''/''sop''/''job_description''.';
