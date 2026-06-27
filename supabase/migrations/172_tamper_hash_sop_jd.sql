-- Extend tamper-evidence to SOP and job-description signatures.
--
-- Migration 168 gave contracts + NDAs a server-recomputed document_hash and the
-- version-freeze / live-lock triggers, but:
--   * sop_signatures + job_description_signatures had NO document_hash column;
--   * job_description_versions / job_descriptions got no freeze/lock at all.
--
-- This adds a server-computed hash to both, and the version-freeze to JDs, so
-- every signed document type is tamper-evident: the signed version snapshot is
-- immutable AND the signature carries a hash of exactly what was signed, so any
-- later edit is detectable by re-hashing.
--
-- NOTE on the JD live-lock: JD draft saves update job_descriptions.content_doc
-- IN PLACE without bumping current_version (unlike contracts/SOPs, whose
-- snapshot writer bumps the version). A live-lock would therefore block editing
-- a signed JD, so JDs get freeze + hash only — tamper-evidence via detection +
-- a frozen snapshot, not in-place-edit prevention. Existing signature rows keep
-- a NULL hash (we don't fabricate evidence retroactively); new ones are hashed.
--
-- Hash input (sha256 hex), matching the contract/nda format:
--   contracts/ndas/sops : 'v'||version||'|'||content_markdown
--   job descriptions     : 'v'||version||'|'||content_doc::text  (JDs have no
--                          markdown projection; JSONB text is canonical/stable)

alter table public.sop_signatures
  add column if not exists document_hash text;
alter table public.job_description_signatures
  add column if not exists document_hash text;

-- ── SOP hash: reuse 168's generic hasher (sops has content_markdown) ─────────
create trigger trg_hash_sop_signature
  before insert on public.sop_signatures
  for each row execute function public.tg_server_document_hash('sop_id', 'sops');

-- ── JD hash: dedicated, since job_descriptions stores content_doc (no markdown) ─
create or replace function public.tg_server_document_hash_jd()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_content text;
begin
  select content_doc::text into v_content
    from public.job_descriptions where id = new.job_description_id;
  new.document_hash := encode(
    digest('v' || new.version_number::text || '|' || coalesce(v_content, ''), 'sha256'),
    'hex'
  );
  return new;
end;
$$;

create trigger trg_hash_jd_signature
  before insert on public.job_description_signatures
  for each row execute function public.tg_server_document_hash_jd();

-- ── JD version freeze: reuse 168's generic freeze (168 missed JDs) ───────────
create trigger trg_freeze_jd_version
  before update or delete on public.job_description_versions
  for each row execute function public.tg_freeze_signed_version('job_description_signatures', 'job_description_id');
