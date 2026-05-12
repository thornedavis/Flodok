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
import { docToMarkdown, isDocumentDoc, type DocNode, type DocumentDoc } from './documentDoc.ts';

export type SnapshotTable = 'sops' | 'contracts';
export type TranslationStatus = 'complete' | 'failed';

export type SnapshotInput = {
  table: SnapshotTable;
  doc_id: string;
  // Structured-document input — the source of truth in Phase C onward.
  // When provided, the helper derives content_markdown_en/id from it via
  // docToMarkdown and writes both alongside content_doc itself. Auto-
  // translation is skipped on this path (per-block translation lives in
  // Phase E); callers manage EN/ID parity themselves.
  new_content_doc?: DocumentDoc | Record<string, unknown> | null;
  // Legacy flat-markdown input. Still accepted for callers that haven't
  // been migrated (sop-updates webhook). When new_content_doc is also
  // passed, these are ignored.
  new_content_en?: string | null;
  new_content_id?: string | null;
  // When true (default), translate the missing side. Only consulted on
  // the legacy markdown path; structured-doc saves skip translation.
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
  content_doc: DocumentDoc | Record<string, unknown> | null;
};

// ── Per-section / per-block translation ─────────────────────────────
//
// Walks the doc and, for each section title or bilingual block body
// where one language has content and the other is empty, translates
// the populated side over to the empty side. Plain-text result for
// block bodies in C.2 — formatting is intentionally flattened to a
// single paragraph since we don't have a markdown-to-ProseMirror
// parser available on the Deno side. Phase E will preserve formatting
// by doing per-block translation in the editor where TipTap is loaded.

async function translateMissingSides(doc: DocumentDoc): Promise<{ doc: DocumentDoc; error: string | null }> {
  // Deep clone — we don't want to mutate the caller's input. JSON
  // round-trip is fine for these doc shapes (no Dates, functions, etc.).
  const out = JSON.parse(JSON.stringify(doc)) as DocumentDoc;
  let firstError: string | null = null;

  for (const section of out.content || []) {
    if (section.type !== 'section' || !section.attrs) continue;
    const attrs = section.attrs as Record<string, unknown>;
    const titleEn = typeof attrs.titleEn === 'string' ? attrs.titleEn.trim() : '';
    const titleId = typeof attrs.titleId === 'string' ? attrs.titleId.trim() : '';

    if (titleEn && !titleId) {
      const r = await translateSOP(titleEn, 'en-to-id');
      if (r.text) attrs.titleId = r.text.trim();
      else if (!firstError) firstError = r.error;
    } else if (titleId && !titleEn) {
      const r = await translateSOP(titleId, 'id-to-en');
      if (r.text) attrs.titleEn = r.text.trim();
      else if (!firstError) firstError = r.error;
    }

    for (const block of section.content || []) {
      if (block.type !== 'bilingualBlock' || !Array.isArray(block.content)) continue;
      const enBody = block.content.find(b => b.type === 'blockBody' && b.attrs?.lang === 'en');
      const idBody = block.content.find(b => b.type === 'blockBody' && b.attrs?.lang === 'id');
      if (!enBody || !idBody) continue;

      const enText = extractBodyText(enBody.content || []);
      const idText = extractBodyText(idBody.content || []);

      if (enText && !idText) {
        const r = await translateSOP(enText, 'en-to-id');
        if (r.text) idBody.content = textToParagraphs(r.text);
        else if (!firstError) firstError = r.error;
      } else if (idText && !enText) {
        const r = await translateSOP(idText, 'id-to-en');
        if (r.text) enBody.content = textToParagraphs(r.text);
        else if (!firstError) firstError = r.error;
      }
    }
  }

  return { doc: out, error: firstError };
}

// Flattens a block body's content tree to its text content, joining
// runs with spaces and paragraphs with double newlines so the
// translator sees structure-meaningful breaks without being confused
// by ProseMirror's nesting.
function extractBodyText(nodes: DocNode[]): string {
  const lines: string[] = [];
  for (const n of nodes) {
    if (n.type === 'paragraph' || n.type === 'heading') {
      lines.push(extractInline(n.content || []));
    } else if (n.type === 'bulletList' || n.type === 'orderedList') {
      for (const li of n.content || []) {
        lines.push('- ' + extractInline((li.content || []).flatMap(p => p.content || [])));
      }
    } else if (n.type === 'codeBlock') {
      lines.push(extractInline(n.content || []));
    } else if (n.type === 'callout') {
      lines.push(extractInline((n.content || []).flatMap(p => p.content || [])));
    }
  }
  return lines.join('\n\n').trim();
}

function extractInline(nodes: DocNode[]): string {
  return nodes.map(n => n.type === 'text' ? (n.text || '') : '').join('');
}

// Splits translated text on double-newlines so multi-paragraph
// translations land as multiple paragraphs in the ID body. Inline
// formatting (bold, lists) is lost on this path — accepted trade-off
// for C.2 until Phase E can preserve structure.
function textToParagraphs(text: string): DocNode[] {
  const paras = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  if (paras.length === 0) return [{ type: 'paragraph' }];
  return paras.map(p => ({
    type: 'paragraph',
    content: [{ type: 'text', text: p }],
  }));
}

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

  let translationStatus: TranslationStatus = 'complete';
  let translationError: string | null = null;

  // ── Structured-doc path ──
  //
  // When the caller passes a content_doc, treat it as the source of
  // truth. Before deriving markdown, walk the doc and fill in any
  // sections / blocks where one language is set and the other is
  // empty — translating EN→ID or ID→EN per slot. This is the
  // Phase C.2 stopgap; Phase E will move translation to the editor
  // (per-block dirty tracking + BubbleMenu) so it doesn't block save.
  if (input.new_content_doc !== undefined && input.new_content_doc !== null) {
    let newDoc = input.new_content_doc as DocumentDoc;
    if (!isDocumentDoc(newDoc)) {
      throw new Error('new_content_doc is not a valid DocumentDoc');
    }
    if (input.auto_translate !== false) {
      const r = await translateMissingSides(newDoc);
      newDoc = r.doc;
      if (r.error) {
        translationStatus = 'failed';
        translationError = r.error;
      }
    }
    const finalEn = docToMarkdown(newDoc, 'en');
    const finalId = docToMarkdown(newDoc, 'id');
    return renderAndInsert({
      supabase,
      doc,
      input,
      versionsTable,
      docFk,
      finalEn,
      finalId,
      finalDoc: newDoc,
      translationStatus,
      translationError,
    });
  }

  // ── Legacy markdown path ──
  //
  // Used by the sop-updates webhook and any callers still passing flat
  // markdown. Preserves the existing auto-translation behavior so we
  // don't regress those paths during the C.2 transition.

  const baseEn: string = input.new_content_en ?? doc.content_markdown ?? '';
  let baseId: string | null = input.new_content_id !== undefined
    ? input.new_content_id
    : (doc.content_markdown_id ?? null);

  const enIsNew = input.new_content_en !== undefined && input.new_content_en !== doc.content_markdown;
  const idIsNew = input.new_content_id !== undefined && input.new_content_id !== doc.content_markdown_id;
  const autoTranslate = input.auto_translate !== false;

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
        finalDoc: (doc as { content_doc?: DocumentDoc | null }).content_doc ?? null,
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
    finalDoc: (doc as { content_doc?: DocumentDoc | null }).content_doc ?? null,
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
  finalDoc: DocumentDoc | Record<string, unknown> | null;
  translationStatus: TranslationStatus;
  translationError: string | null;
}): Promise<SnapshotResult> {
  const { supabase, doc, input, versionsTable, docFk, finalEn, finalId, finalDoc, translationStatus, translationError } = args;

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
    content_doc: finalDoc,
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
    content_doc: finalDoc,
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
    content_doc: finalDoc,
  };
}
