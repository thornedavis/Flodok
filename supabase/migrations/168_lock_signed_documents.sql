-- Make legally-signed artifacts tamper-evident (H4).
--
-- Three guarantees, all enforced by TRIGGERS (not RLS) so they hold even for
-- SECURITY DEFINER / service-role writes:
--
--   A1. A *_versions snapshot row becomes immutable once a *_signatures row
--       references its (doc, version_number) — no UPDATE, no DELETE. The
--       signed text can never be silently rewritten or removed.
--   A2. The LIVE document body cannot be edited in place once its current
--       version is signed. Bumping current_version (the supersede path) IS
--       allowed: it creates a new unsigned version and leaves the signed
--       snapshot frozen by A1.
--   B.  On signing, document_hash is RECOMPUTED server-side from the live
--       document content, so the stored tamper-hash attests to what the
--       server saw — not to whatever the client claimed. (contract/nda only;
--       sop_signatures has no document_hash column.)
--
-- All functions are SECURITY DEFINER so the signature-existence checks are
-- authoritative regardless of the caller's RLS view, and read fields generically
-- via to_jsonb(row) so one function serves all three document families.

-- ── A1: freeze a signed version snapshot ─────────────────────────────────────
create or replace function public.tg_freeze_signed_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sig_table text    := tg_argv[0];          -- e.g. 'contract_signatures'
  v_fk        text    := tg_argv[1];          -- e.g. 'contract_id'
  v_doc_id    uuid    := (to_jsonb(old) ->> v_fk)::uuid;
  v_version   integer := (to_jsonb(old) ->> 'version_number')::integer;
  v_signed    boolean;
begin
  execute format(
    'select exists (select 1 from public.%I where %I = $1 and version_number = $2)',
    v_sig_table, v_fk
  ) into v_signed using v_doc_id, v_version;

  if v_signed then
    raise exception 'Signed document version is immutable (% v%)', v_doc_id, v_version
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger trg_freeze_contract_version
  before update or delete on public.contract_versions
  for each row execute function public.tg_freeze_signed_version('contract_signatures', 'contract_id');

create trigger trg_freeze_nda_version
  before update or delete on public.nda_versions
  for each row execute function public.tg_freeze_signed_version('nda_signatures', 'nda_id');

create trigger trg_freeze_sop_version
  before update or delete on public.sop_versions
  for each row execute function public.tg_freeze_signed_version('sop_signatures', 'sop_id');

-- ── A2: lock the live body once the current version is signed ────────────────
create or replace function public.tg_lock_signed_live()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sig_table text := tg_argv[0];
  v_fk        text := tg_argv[1];
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_signed boolean;
begin
  -- A version bump (supersede) is always allowed: it writes a new unsigned
  -- version and the prior signature keeps pointing at the frozen snapshot.
  if new.current_version is distinct from old.current_version then
    return new;
  end if;

  -- Only guard actual CONTENT changes; status/timestamp/other updates pass.
  -- (->> on an absent key yields NULL, so this is safe across families whose
  --  content column set differs.)
  if (v_new ->> 'content_markdown')    is not distinct from (v_old ->> 'content_markdown')
     and (v_new ->> 'content_markdown_id') is not distinct from (v_old ->> 'content_markdown_id')
     and (v_new ->> 'content_doc')      is not distinct from (v_old ->> 'content_doc')
  then
    return new;
  end if;

  execute format(
    'select exists (select 1 from public.%I where %I = $1 and version_number = $2)',
    v_sig_table, v_fk
  ) into v_signed using new.id, old.current_version;

  if v_signed then
    raise exception 'Cannot edit a signed document in place; save creates a new version (supersede)'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_lock_signed_contract
  before update on public.contracts
  for each row execute function public.tg_lock_signed_live('contract_signatures', 'contract_id');

create trigger trg_lock_signed_nda
  before update on public.ndas
  for each row execute function public.tg_lock_signed_live('nda_signatures', 'nda_id');

create trigger trg_lock_signed_sop
  before update on public.sops
  for each row execute function public.tg_lock_signed_live('sop_signatures', 'sop_id');

-- ── B: recompute document_hash server-side on signing ────────────────────────
-- Reproduces the client string exactly: sha256('v' || version || '|' || markdown).
-- search_path includes extensions so digest() resolves whether pgcrypto lives
-- in public or extensions.
create or replace function public.tg_server_document_hash()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_fk      text := tg_argv[0];   -- 'contract_id' / 'nda_id'
  v_table   text := tg_argv[1];   -- 'contracts'   / 'ndas'
  v_doc_id  uuid := (to_jsonb(new) ->> v_fk)::uuid;
  v_content text;
begin
  execute format('select content_markdown from public.%I where id = $1', v_table)
    into v_content using v_doc_id;

  new.document_hash := encode(
    digest('v' || new.version_number::text || '|' || coalesce(v_content, ''), 'sha256'),
    'hex'
  );
  return new;
end;
$$;

create trigger trg_hash_contract_signature
  before insert on public.contract_signatures
  for each row execute function public.tg_server_document_hash('contract_id', 'contracts');

create trigger trg_hash_nda_signature
  before insert on public.nda_signatures
  for each row execute function public.tg_server_document_hash('nda_id', 'ndas');
