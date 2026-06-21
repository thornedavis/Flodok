-- Templates pre-seed components — Phase 4 (additive).
--
-- document_templates can now carry an itemised allowance breakdown so a new
-- hire's contract starts pre-filled (Meal/Transport/Service/...) instead of one
-- lumped number. Stored as a jsonb array directly on the template row (templates
-- are seed data, not the live pay model — no child table / trigger needed). The
-- existing document_templates.allowance_idr stays as the total for back-compat
-- and for templates that don't itemise.
--
-- Shape (mirrors contract_compensation_components / CompensationComponentInput):
--   [{ "name": "...", "kind": "earning", "is_fixed": false,
--      "amount_idr": 0, "display_order": 0 }, ...]
-- When a contract is created from the template, these seed
-- contract_compensation_components rows and the trigger derives allowance_idr.

alter table public.document_templates
  add column if not exists compensation_components jsonb;

comment on column public.document_templates.compensation_components is
  'Itemised allowance breakdown for contract templates (jsonb array of earning '
  'components). NULL = not itemised; falls back to allowance_idr on use.';
