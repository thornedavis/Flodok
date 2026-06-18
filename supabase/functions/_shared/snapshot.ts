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
import { docToMarkdown, isDocumentDoc, normalizeDoc, type DocNode, type DocumentDoc } from './documentDoc.ts';

export type SnapshotTable = 'sops' | 'contracts' | 'ndas';
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

// ── Per-section / per-block translation (Phase E) ───────────────────
//
// Translation strategy:
//   1. Diff the new doc against the existing one by section / block id.
//      Only sides that meaningfully changed are eligible for translation;
//      unchanged blocks are skipped entirely.
//   2. For changed blocks where one side has content and the other is
//      empty (or untouched since last save), translate the populated
//      side over. Walk the source body and translate per top-level
//      block element so paragraphs stay paragraphs, headings stay
//      headings, list items stay list items. Inline marks (bold/etc.)
//      are dropped on this path — Phase F's BubbleMenu adds
//      selection-level translation that preserves them.
//   3. Every translation goes through `translation_cache` first.
//      Identical text + direction across docs hits the cache; only
//      misses go to OpenRouter.
//
// Both-sides-changed blocks are flagged `needsReview` instead of
// being silently overwritten — surfaces in the editor via the
// `needs_review` indicator added in Phase F.

async function translateMissingSides(
  newDoc: DocumentDoc,
  existingDoc: DocumentDoc | null,
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ doc: DocumentDoc; error: string | null }> {
  // Normalize both sides to the flat schema so legacy section-nested
  // docs (older saves, or an existing doc not yet backfilled) align with
  // the flat docs the editor now produces. Block ids are stable across
  // normalization (a former section's id becomes its clause-heading
  // block id), so the diff-by-id below still matches.
  const out = normalizeDoc(newDoc);
  const flatExisting = existingDoc ? normalizeDoc(existingDoc) : null;
  let firstError: string | null = null;

  // Map existing blocks by id so we can detect changes per block. The
  // tree is flat now — clause headings are just bilingualBlocks whose
  // body is an h2, so the per-block translation path below handles
  // section titles and body content uniformly.
  const existingBlocks = new Map<string, DocNode>();
  for (const b of flatExisting?.content || []) {
    const bid = b.attrs?.id as string | undefined;
    if (b.type === 'bilingualBlock' && bid) existingBlocks.set(bid, b);
  }

  for (const block of out.content || []) {
    if (block.type !== 'bilingualBlock' || !Array.isArray(block.content)) continue;
    const bid = block.attrs?.id as string | undefined;
    const prevBlock = bid ? existingBlocks.get(bid) : undefined;
    const enBody = block.content.find(b => b.type === 'blockBody' && b.attrs?.lang === 'en');
    const idBody = block.content.find(b => b.type === 'blockBody' && b.attrs?.lang === 'id');
    if (!enBody || !idBody) continue;
    const prevContent = prevBlock?.content as DocNode[] | undefined;
    const prevEnBody = prevContent?.find(b => b.type === 'blockBody' && b.attrs?.lang === 'en');
    const prevIdBody = prevContent?.find(b => b.type === 'blockBody' && b.attrs?.lang === 'id');

    const enEmpty = isBodyEmpty(enBody.content || []);
    const idEmpty = isBodyEmpty(idBody.content || []);
    const enChangedBlock = !sameBodyContent(enBody, prevEnBody);
    const idChangedBlock = !sameBodyContent(idBody, prevIdBody);

    const blockAttrs: Record<string, unknown> = (block.attrs && typeof block.attrs === 'object'
      ? (block.attrs as Record<string, unknown>)
      : {});

    // Both sides edited in the same save — user is intentionally
    // authoring both languages; leave both as written and flag for
    // review so they can confirm consistency in the editor.
    if (enChangedBlock && idChangedBlock && !enEmpty && !idEmpty) {
      blockAttrs.needsReview = true;
      continue;
    }

    // EN edited → re-translate ID from the new EN (overwriting any
    // prior auto-translation). The previous behavior preserved ID
    // whenever it had any content, which meant edits on EN never
    // reflected on the ID side once an initial translation had run.
    // Surgical preservation of manual ID edits is a Phase F concern
    // (per-selection translate via BubbleMenu); the default model
    // here is "EN is source, ID mirrors it".
    if (enChangedBlock && !enEmpty) {
      try {
        idBody.content = await translateBodyContent(enBody.content || [], 'en-to-id', supabase, orgId);
        // The block is no longer in a "both edited / needs review"
        // state — clear any stale flag so the editor's orange
        // indicator doesn't linger past the resolution.
        blockAttrs.needsReview = false;
      } catch (err) {
        if (!firstError) firstError = (err instanceof Error ? err.message : 'translation failed');
      }
    } else if (idChangedBlock && !idEmpty && enEmpty) {
      // ID edited from-scratch with no EN content yet → seed EN.
      // We don't auto-flip ID-edits-to-EN when EN already exists
      // because typical authoring is EN-first; surfacing an
      // intentional ID-only edit shouldn't clobber the EN body.
      try {
        enBody.content = await translateBodyContent(idBody.content || [], 'id-to-en', supabase, orgId);
        blockAttrs.needsReview = false;
      } catch (err) {
        if (!firstError) firstError = (err instanceof Error ? err.message : 'translation failed');
      }
    } else if (!enChangedBlock && !idChangedBlock) {
      // Genuinely unchanged block — clear any stale needsReview flag
      // a previous save may have set incorrectly (e.g. before the
      // diff comparison was hardened against TipTap's attr-order
      // shuffling).
      blockAttrs.needsReview = false;
    }
  }

  return { doc: out, error: firstError };
}

// True when a body has no rendered text (every text node is empty
// after trim). Empty paragraphs are the schema's "empty body" state,
// so we treat both `[]` and `[{paragraph}]` as empty.
function isBodyEmpty(nodes: DocNode[]): boolean {
  return extractInlineText(nodes).trim() === '';
}

// Walks a node tree and returns concatenated text content, mirrors
// the inline text extraction used by the per-block translator.
function extractInlineText(nodes: DocNode[]): string {
  const parts: string[] = [];
  for (const n of nodes) {
    if (n.type === 'text') parts.push(n.text || '');
    else if (Array.isArray(n.content)) parts.push(extractInlineText(n.content));
  }
  return parts.join('');
}

// Structural equality on two blockBody nodes. Used to detect "this
// side hasn't changed since last save" so we know whether translation
// should fire. Key order is normalized via deepEqualNodes — TipTap
// can re-serialize identical content with different attr key order
// (e.g. orderedList's `start` and `type` attrs added on load), which
// would otherwise falsely look like a content change and cause
// spurious needsReview flags.
function sameBodyContent(a: DocNode | undefined, b: DocNode | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return deepEqualNodes(a.content || [], b.content || []);
}

// Recursive deep-equal that treats object keys as a set rather than a
// sequence. Plain `JSON.stringify(a) === JSON.stringify(b)` would
// flag `{type, attrs, content}` and `{type, content, attrs}` as
// different even though the content is identical.
function deepEqualNodes(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqualNodes(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a as Record<string, unknown>).sort();
  const bKeys = Object.keys(b as Record<string, unknown>).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) return false;
  }
  for (const k of aKeys) {
    if (!deepEqualNodes((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

// Translates the content of a blockBody while preserving block-level
// structure. Each top-level block (paragraph, heading, list, table
// cell, callout) is translated independently; the returned tree has
// the same shape as the input with text content swapped.

async function translateBodyContent(
  content: DocNode[],
  direction: 'en-to-id' | 'id-to-en',
  supabase: SupabaseClient,
  orgId: string,
): Promise<DocNode[]> {
  const out: DocNode[] = [];
  for (const node of content) {
    out.push(await translateBlockNode(node, direction, supabase, orgId));
  }
  return out;
}

async function translateBlockNode(
  node: DocNode,
  direction: 'en-to-id' | 'id-to-en',
  supabase: SupabaseClient,
  orgId: string,
): Promise<DocNode> {
  switch (node.type) {
    case 'paragraph':
    case 'heading': {
      const text = extractInlineText(node.content || []).trim();
      if (!text) return { ...node };
      const translated = await translateWithCache(text, direction, supabase, orgId);
      return { ...node, content: [{ type: 'text', text: translated }] };
    }
    case 'bulletList':
    case 'orderedList': {
      const items: DocNode[] = [];
      for (const li of node.content || []) {
        items.push(await translateBlockNode(li, direction, supabase, orgId));
      }
      return { ...node, content: items };
    }
    case 'listItem': {
      const children: DocNode[] = [];
      for (const c of node.content || []) {
        children.push(await translateBlockNode(c, direction, supabase, orgId));
      }
      return { ...node, content: children };
    }
    case 'callout': {
      const children: DocNode[] = [];
      for (const c of node.content || []) {
        children.push(await translateBlockNode(c, direction, supabase, orgId));
      }
      return { ...node, content: children };
    }
    case 'table': {
      const rows: DocNode[] = [];
      for (const row of node.content || []) {
        const cells: DocNode[] = [];
        for (const cell of row.content || []) {
          const cellChildren: DocNode[] = [];
          for (const c of cell.content || []) {
            cellChildren.push(await translateBlockNode(c, direction, supabase, orgId));
          }
          cells.push({ ...cell, content: cellChildren });
        }
        rows.push({ ...row, content: cells });
      }
      return { ...node, content: rows };
    }
    case 'codeBlock':
      // Code blocks aren't translated — copy verbatim.
      return { ...node };
    default:
      return { ...node };
  }
}

// SHA-256 hash of the trimmed source string, hex-encoded. Used as
// the `translation_cache.source_hash` column.
async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function translateWithCache(
  text: string,
  direction: 'en-to-id' | 'id-to-en',
  supabase: SupabaseClient,
  orgId: string,
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const hash = await sha256Hex(trimmed);

  const { data: cached } = await supabase
    .from('translation_cache')
    .select('translated_content')
    .eq('source_hash', hash)
    .eq('direction', direction)
    .eq('org_id', orgId)
    .maybeSingle();
  if (cached?.translated_content) {
    return cached.translated_content as string;
  }

  const r = await translateSOP(trimmed, direction);
  if (!r.text) {
    throw new Error(r.error || 'translation failed');
  }
  const translated = r.text.trim();

  // Best-effort cache write. A failure here shouldn't abort the save
  // — the model already produced a translation; missing the cache
  // just costs us a re-translation next time.
  await supabase
    .from('translation_cache')
    .insert({
      source_hash: hash,
      direction,
      org_id: orgId,
      source_excerpt: trimmed.slice(0, 500),
      translated_content: translated,
      model: Deno.env.get('OPENROUTER_TRANSLATION_MODEL') || null,
    })
    .then(({ error }) => {
      if (error && error.code !== '23505') {
        // 23505 = unique_violation — fine, another concurrent save
        // wrote the same entry first.
        console.warn('translation_cache insert failed:', error.message);
      }
    });

  return translated;
}

export async function writeSnapshot(
  supabase: SupabaseClient,
  input: SnapshotInput,
): Promise<SnapshotResult> {
  const versionsTable = input.table === 'contracts' ? 'contract_versions'
    : input.table === 'ndas' ? 'nda_versions'
    : 'sop_versions';
  const docFk = input.table === 'contracts' ? 'contract_id'
    : input.table === 'ndas' ? 'nda_id'
    : 'sop_id';

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
      const existingDoc = (doc as { content_doc?: DocumentDoc | null }).content_doc ?? null;
      const orgId = (doc as { org_id: string }).org_id;
      const r = await translateMissingSides(newDoc, existingDoc, supabase, orgId);
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

  // NDAs carry their structural fields on the live row (the editor writes them
  // directly before snapshotting), so we read them straight off `doc`.
  const ndaCtx = input.table === 'ndas'
    ? {
      effective_date: (doc as { effective_date?: string | null }).effective_date ?? null,
      survival_years: (doc as { survival_years?: number | null }).survival_years ?? null,
      penalty_idr: (doc as { penalty_idr?: number | null }).penalty_idr ?? null,
    }
    : undefined;

  const ctxBase = { employee, organization, contract: contractCtx, nda: ndaCtx, today: new Date() };
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
  } else if (input.table === 'ndas') {
    versionRow.employee_id = employeeId;
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
