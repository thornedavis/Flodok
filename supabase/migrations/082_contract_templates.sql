-- Contract templates: reusable contract drafts that can be instantiated
-- per candidate when extending an offer. A template is a normal contract
-- row with `is_template = true` and no employee_id. When a template is
-- "used", we copy its content + structured fields into a fresh contract
-- linked to the candidate.
--
-- Why piggyback on the existing contracts table instead of a separate
-- contract_templates table:
--   - The existing editor (markdown, AI generation, merge fields,
--     structured fields, versioning) works for templates with zero changes.
--   - Templates stay query-friendly: one place to look for org_id-scoped
--     contract content.
--   - The `is_template` flag + a couple of UI affordances are all we need.

alter table public.contracts
  add column is_template boolean not null default false,
  add column template_for_position text;

-- A template can't be linked to an employee; that distinction is the whole
-- point. Enforce it at the DB layer so a template can never accidentally
-- carry an employee reference.
alter table public.contracts
  add constraint contracts_template_no_employee
    check (not is_template or employee_id is null);

-- Fast lookup of the template for a given position when extending an offer.
-- Partial index keeps it tiny (most contract rows are not templates).
create index contracts_template_position_idx
  on public.contracts (org_id, template_for_position)
  where is_template = true;
