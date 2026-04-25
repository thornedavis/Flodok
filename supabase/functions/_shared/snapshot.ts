// Centralized snapshot writer for SOPs and contracts.
//
// One place that knows how to:
//   1. Compute the final EN/ID content (translating the missing side when
//      auto_translate is enabled).
//   2. Render merge fields against the live employee/org context so the
//      `resolved_markdown_*` columns are an honest record of what the user
//      actually saw.
//   3. Bump current_version on the live row, write its content columns, and
//      insert the snapshot into *_versions.
//
// All snapshot-producing paths funnel through here:
//   - SOPEdit/ContractEdit (browser)  → snapshot-sop edge function → here
//   - Pending.tsx approval (browser)  → snapshot-sop edge function → here
//   - sop-updates webhook (Deno)      → directly imports this module
//
// Three call sites means three chances to forget a column. Putting the
// insert in one place is the only way to keep the version table honest.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { translateSOP } from './translate.ts';
import { renderMergeFields } from './mergeFields.ts';

export type SnapshotTable = 'sops' | 'contracts';
export type TranslationStatus = 'complete' | 'failed';

export type SnapshotInput = {
  table: SnapshotTable;
  doc_id: string;
  // Caller passes the user's intended new state. Either side may be omitted
  // when only the other side changed; the helper translates the missing one.
  new_content_en?: string | null;
  new_content_id?: string | null;
  // When true (default), translate the missing side. When false, leave the
  // missing side as whatever was already on the live row (used for callers
  // that explicitly only want one language updated).
  auto_translate?: boolean;
  change_summary?: string | null;
  changed_by: string;
  // Contract-only structural snapshot fields. Ignored for sops.
  base_wage_idr?: number | null;
  allowance_idr?: number | null;
  hours_per_day?: number | null;
  days_per_week?: number | null;
  employee_id?: string | null;
};

export type SnapshotResult = {
  version_number: number;
  translation_status: TranslationStatus;
  translation_error: string | null;
  content_markdown: string;
  content_markdown_id: string | null;
};

export async function writeSnapshot(
  supabase: SupabaseClient,
  input: SnapshotInput,
): Promise<SnapshotResult> {
  const versionsTable = input.table === 'contracts' ? 'contract_versions' : 'sop_versions';
  const docFk = input.table === 'contracts' ? 'contract_id' : 'sop_id';

  // Load the live row so we know the current state (current_version, the
  // existing language pair, and structural fields for contracts).
  const { data: doc, error: docErr } = await supabase
    .from(input.table)
    .select('*')
    .eq('id', input.doc_id)
    .single();
  if (docErr || !doc) {
    throw new Error(`${input.table} ${input.doc_id} not found`);
  }

  const baseEn: string = input.new_content_en ?? doc.content_markdown ?? '';
  let baseId: string | null = input.new_content_id !== undefined
    ? input.new_content_id
    : (doc.content_markdown_id ?? null);

  const enIsNew = input.new_content_en !== undefined && input.new_content_en !== doc.content_markdown;
  const idIsNew = input.new_content_id !== undefined && input.new_content_id !== doc.content_markdown_id;
  const autoTranslate = input.auto_translate !== false;

  let translationStatus: TranslationStatus = 'complete';
  let translationError: string | null = null;

  // Translate the missing side when exactly one side changed. If both sides
  // changed, treat both as user-authoritative; if neither changed, we're
  // snapshotting structural-only changes (contracts) and leave the existing
  // pair alone.
  if (autoTranslate && enIsNew && !idIsNew && baseEn) {
    const r = await translateSOP(baseEn, 'en-to-id');
    if (r.text) baseId = r.text;
    else { translationStatus = 'failed'; translationError = r.error; }
  } else if (autoTranslate && idIsNew && !enIsNew && baseId) {
    const r = await translateSOP(baseId, 'id-to-en');
    if (r.text) {
      // EN side becomes whatever we just translated back from ID.
      const newEn = r.text;
      const result = await renderAndInsert({
        supabase,
        doc,
        input,
        versionsTable,
        docFk,
        finalEn: newEn,
        finalId: baseId,
        translationStatus,
        translationError,
      });
      return result;
    } else {
      translationStatus = 'failed';
      translationError = r.error;
    }
  }

  return renderAndInsert({
    supabase,
    doc,
    input,
    versionsTable,
    docFk,
    finalEn: baseEn,
    finalId: baseId,
    translationStatus,
    translationError,
  });
}

async function renderAndInsert(args: {
  supabase: SupabaseClient;
  doc: Record<string, unknown> & { id: string; current_version: number; org_id: string };
  input: SnapshotInput;
  versionsTable: string;
  docFk: string;
  finalEn: string;
  finalId: string | null;
  translationStatus: TranslationStatus;
  translationError: string | null;
}): Promise<SnapshotResult> {
  const { supabase, doc, input, versionsTable, docFk, finalEn, finalId, translationStatus, translationError } = args;

  // Render merge fields against the *current* world. This freezes the
  // resolved markdown into the snapshot so later edits to the employee or
  // contract structural fields don't retroactively rewrite history.
  const employeeId = input.table === 'contracts'
    ? (input.employee_id !== undefined ? input.employee_id : (doc as { employee_id?: string | null }).employee_id ?? null)
    : (doc as { employee_id?: string | null }).employee_id ?? null;

  const [{ data: employee }, { data: organization }] = await Promise.all([
    employeeId
      ? supabase.from('employees').select('*').eq('id', employeeId).single()
      : Promise.resolve({ data: null }),
    supabase.from('organizations').select('*').eq('id', doc.org_id).single(),
  ]);

  // For contracts, the merge-field context uses the about-to-be-saved
  // structural fields (so {{base_wage_idr}} resolves to the new value, not
  // the old one).
  const contractCtx = input.table === 'contracts'
    ? {
      created_at: (doc as { created_at?: string }).created_at,
      base_wage_idr: input.base_wage_idr !== undefined ? input.base_wage_idr : (doc as { base_wage_idr?: number | null }).base_wage_idr,
      allowance_idr: input.allowance_idr !== undefined ? input.allowance_idr : (doc as { allowance_idr?: number | null }).allowance_idr,
      hours_per_day: input.hours_per_day !== undefined ? input.hours_per_day : (doc as { hours_per_day?: number | null }).hours_per_day,
      days_per_week: input.days_per_week !== undefined ? input.days_per_week : (doc as { days_per_week?: number | null }).days_per_week,
    }
    : undefined;

  const ctxBase = { employee, organization, contract: contractCtx, today: new Date() };
  const resolvedEn = renderMergeFields(finalEn, { ...ctxBase, lang: 'en' });
  const resolvedId = finalId ? renderMergeFields(finalId, { ...ctxBase, lang: 'id' }) : null;

  const newVersion = doc.current_version + 1;

  // Update the live row first — its content_markdown_id is what the live
  // editor and portal read. The snapshot row mirrors it. If either write
  // fails we surface the error rather than partially applying.
  const liveUpdate: Record<string, unknown> = {
    content_markdown: finalEn,
    content_markdown_id: finalId,
    current_version: newVersion,
    updated_at: new Date().toISOString(),
  };
  if (input.table === 'contracts') {
    if (input.base_wage_idr !== undefined) liveUpdate.base_wage_idr = input.base_wage_idr;
    if (input.allowance_idr !== undefined) liveUpdate.allowance_idr = input.allowance_idr;
    if (input.hours_per_day !== undefined) liveUpdate.hours_per_day = input.hours_per_day;
    if (input.days_per_week !== undefined) liveUpdate.days_per_week = input.days_per_week;
    if (input.employee_id !== undefined) liveUpdate.employee_id = input.employee_id;
  }

  const { error: updateErr } = await supabase
    .from(input.table)
    .update(liveUpdate)
    .eq('id', doc.id);
  if (updateErr) throw new Error(updateErr.message);

  const versionRow: Record<string, unknown> = {
    [docFk]: doc.id,
    version_number: newVersion,
    content_markdown: finalEn,
    content_markdown_id: finalId,
    resolved_markdown_en: resolvedEn,
    resolved_markdown_id: resolvedId,
    translation_status: translationStatus,
    translation_error: translationError,
    change_summary: input.change_summary ?? null,
    changed_by: input.changed_by,
  };
  if (input.table === 'contracts') {
    versionRow.employee_id = employeeId;
    versionRow.base_wage_idr = contractCtx?.base_wage_idr ?? null;
    versionRow.allowance_idr = contractCtx?.allowance_idr ?? null;
    versionRow.hours_per_day = contractCtx?.hours_per_day ?? null;
    versionRow.days_per_week = contractCtx?.days_per_week ?? null;
  }

  const { error: insertErr } = await supabase
    .from(versionsTable)
    .insert(versionRow);
  if (insertErr) throw new Error(insertErr.message);

  return {
    version_number: newVersion,
    translation_status: translationStatus,
    translation_error: translationError,
    content_markdown: finalEn,
    content_markdown_id: finalId,
  };
}
