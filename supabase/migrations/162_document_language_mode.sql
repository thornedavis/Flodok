-- Per-document language mode (monolingual support).
--
-- `language_mode` declares whether a document is authored bilingually
-- (the default, both EN + ID sides) or in a single language. When it is
-- 'en' or 'id' the editor renders one full-width column and — critically
-- — the server-side snapshot writer (supabase/functions/_shared/snapshot.ts)
-- stops auto-translating the empty side, so a monolingual document never
-- gets a machine-fabricated translation on save.
--
-- Added to every document table, every version table (so history records
-- the mode in force at each save), and document_templates (so an imported
-- monolingual letter template instantiates monolingual). Defaults to
-- 'bilingual', so every existing row keeps today's exact behaviour and
-- nothing regresses.

-- Live document tables.
alter table public.sops
  add column if not exists language_mode text not null default 'bilingual'
  check (language_mode in ('bilingual', 'en', 'id'));
alter table public.contracts
  add column if not exists language_mode text not null default 'bilingual'
  check (language_mode in ('bilingual', 'en', 'id'));
alter table public.ndas
  add column if not exists language_mode text not null default 'bilingual'
  check (language_mode in ('bilingual', 'en', 'id'));
alter table public.letters
  add column if not exists language_mode text not null default 'bilingual'
  check (language_mode in ('bilingual', 'en', 'id'));
alter table public.job_descriptions
  add column if not exists language_mode text not null default 'bilingual'
  check (language_mode in ('bilingual', 'en', 'id'));

-- Version / history tables — snapshot the mode per save so the audit trail
-- is honest across mode switches.
alter table public.sop_versions
  add column if not exists language_mode text not null default 'bilingual'
  check (language_mode in ('bilingual', 'en', 'id'));
alter table public.contract_versions
  add column if not exists language_mode text not null default 'bilingual'
  check (language_mode in ('bilingual', 'en', 'id'));
alter table public.nda_versions
  add column if not exists language_mode text not null default 'bilingual'
  check (language_mode in ('bilingual', 'en', 'id'));
alter table public.letter_versions
  add column if not exists language_mode text not null default 'bilingual'
  check (language_mode in ('bilingual', 'en', 'id'));
alter table public.job_description_versions
  add column if not exists language_mode text not null default 'bilingual'
  check (language_mode in ('bilingual', 'en', 'id'));

-- Templates — a monolingual letter template stays monolingual when
-- instantiated into a document (createFromTemplate copies content_doc;
-- the language_mode is copied alongside it in the app layer).
alter table public.document_templates
  add column if not exists language_mode text not null default 'bilingual'
  check (language_mode in ('bilingual', 'en', 'id'));
