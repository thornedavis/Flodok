-- Enforce the documented "PKWT ⟹ no probation" invariant.
--
-- probation_months is a PKWTT-only field — see migration 096's column comment:
-- "PKWTT-only probation period in months. Legal max is 3. Ignored for PKWT
-- contracts." But the column DEFAULTs to 3, and several create paths copy it
-- verbatim (createFromTemplate, duplicate, PDF import) or rely on the default
-- (seed / manual / service-role inserts). That left PKWT contracts physically
-- carrying probation_months = 3.
--
-- The contract editor force-nulls probation for PKWT and then compares that null
-- against the stored value to decide "unsaved changes" — so a stored 3 made
-- every PKWT contract read as dirty the instant it opened, firing a bogus "you
-- have unsaved changes" prompt on exit with no edit made. The editor's
-- dirty-check was corrected alongside this migration (ContractEdit.tsx); this
-- migration removes the underlying data inconsistency and stops it recurring.
--
--   1. Backfill — null probation on existing PKWT contracts + templates.
--   2. Trigger — null it on every future insert/update of a PKWT contract, so
--      all create paths converge on the invariant without each remembering to.
--      Mirrors the allowance-sync trigger (156) and supersede trigger (169).

-- ─── 1. Backfill existing rows ───────────────────────────────────────────────
-- Touches no content column, so the signed-document live-lock (168) passes it
-- (that trigger only blocks content_markdown / content_markdown_id / content_doc
-- changes on a signed live row — probation is metadata).
update public.contracts
set probation_months = null
where contract_type = 'pkwt' and probation_months is not null;

-- Contract templates seed new contracts; clean them so they can't re-seed a
-- phantom probation. (Only explicit 'pkwt' — a NULL-typed template is "unset";
-- createFromTemplate resolves NULL→pkwt and nulls probation at instantiation.)
update public.document_templates
set probation_months = null
where contract_type = 'pkwt' and probation_months is not null;

-- ─── 2. Invariant trigger on contracts ───────────────────────────────────────
-- BEFORE row trigger: no cross-table access, so it needs no SECURITY DEFINER
-- (unlike the allowance-sync trigger, which writes another table). A plain
-- NEW-mutation is invisible to the signed-live-lock (168), which only inspects
-- content columns.
create or replace function public.tg_contract_probation_pkwt_null()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Probation applies only to PKWTT. For PKWT force it null so the stored row
  -- matches what the editor computes and a phantom "unsaved change" can never be
  -- re-introduced. No-op for PKWTT rows and for already-null PKWT rows.
  if new.contract_type = 'pkwt' then
    new.probation_months := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_contract_probation_pkwt_null on public.contracts;
create trigger trg_contract_probation_pkwt_null
  before insert or update on public.contracts
  for each row execute function public.tg_contract_probation_pkwt_null();

-- ─── 3. Invariant assertion ──────────────────────────────────────────────────
-- Self-contained check: after the backfill, no PKWT contract may carry a
-- probation. Any residual row aborts the migration.
do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from public.contracts
  where contract_type = 'pkwt' and probation_months is not null;

  if v_bad <> 0 then
    raise exception
      'PKWT probation invariant violated: % contract(s) still carry probation_months', v_bad;
  end if;

  raise notice 'PKWT probation invariant OK: no PKWT contract carries probation_months.';
end;
$$;
