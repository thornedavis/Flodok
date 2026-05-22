// Structured-document data model shared across the app.
//
// The on-the-wire format is TipTap's ProseMirror JSON output — what
// `editor.getJSON()` returns — stored as JSONB in `sops.content_doc` /
// `contracts.content_doc`. Storing it raw means zero serialization
// overhead and the editor reads/writes the column shape directly.
//
// Tree shape:
//
//   document        type='document', content: section[]
//   └── section     attrs: { id, titleEn, titleId, accentColor, numberingStyle, boxed }
//       └── bilingualBlock   attrs: { id, needsReview }, content: [bodyEn, bodyId]
//           └── blockBody    attrs: { lang: 'en'|'id' }, content: standard blocks
//               └── paragraph | heading | bulletList | orderedList | table | codeBlock | callout
//
// The same shapes are re-declared (kept in sync by hand) for Deno edge
// functions in supabase/functions/_shared/documentDoc.ts.

// ─── Generic ProseMirror node shape ─────────────────────────────────
//
// Permissive on purpose — the editor schema enforces the actual node
// types, while consumers walk this tree by node name. Treat everything
// as either a node with `content` children or a leaf with `text`.

export type DocNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: DocNode[]
  text?: string
  marks?: DocMark[]
}

export type DocMark = {
  type: string
  attrs?: Record<string, unknown>
}

// ─── Specific node-attrs shapes ─────────────────────────────────────

export type SectionAttrs = {
  id: string
  titleEn: string
  titleId: string
  accentColor: string | null
  numberingStyle: 'decimal' | 'roman' | 'alpha' | 'none'
  boxed: boolean
}

export type BilingualBlockAttrs = {
  id: string
  needsReview: boolean
  // Clause-heading numbering style; null for ordinary blocks. Drives
  // the CSS clause counter. Set by normalizeDoc from the old section
  // numberingStyle.
  numbering: 'decimal' | 'roman' | 'alpha' | 'none' | null
}

export type BlockBodyAttrs = {
  lang: 'en' | 'id'
}

// Top-level alias for callers that want to be explicit about the
// document type. The editor's output is `{ type: 'document', content: [...] }`
// — this matches the TipTap node name we declared.
export type DocumentDoc = DocNode & { type: 'document' }

export type ViewMode = 'stacked' | 'side_by_side'

export const DEFAULT_VIEW_MODE: ViewMode = 'stacked'

// ─── Builders for empty content ─────────────────────────────────────

function newId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10)
  const time = Date.now().toString(36).slice(-4)
  return `${prefix}_${time}${random}`
}

export function newSectionId() { return newId('sec') }
export function newBlockId() { return newId('blk') }

export function emptyBlock(): DocNode {
  return {
    type: 'bilingualBlock',
    attrs: { id: newBlockId(), needsReview: false, numbering: null },
    content: [
      { type: 'blockBody', attrs: { lang: 'en' }, content: [{ type: 'paragraph' }] },
      { type: 'blockBody', attrs: { lang: 'id' }, content: [{ type: 'paragraph' }] },
    ],
  }
}

// ─── buildBlock ─────────────────────────────────────────────────────
//
// Factory for the inline "+" / slash block menu. Returns a fresh
// bilingualBlock whose EN and ID bodies are seeded with the SAME empty
// skeleton — so structure mirrors across languages at creation time
// (text stays per-language). The clause-heading type ('h2') also sets
// the `numbering` attr so it joins the decimal counter.

export type InsertBlockType =
  | 'text' | 'h2' | 'h3' | 'h4'
  | 'bulletList' | 'orderedList' | 'table' | 'callout'

function blockSkeleton(type: InsertBlockType): DocNode[] {
  switch (type) {
    case 'h2':
      return [{ type: 'heading', attrs: { level: 2 } }]
    case 'h3':
      return [{ type: 'heading', attrs: { level: 3 } }]
    case 'h4':
      return [{ type: 'heading', attrs: { level: 4 } }]
    case 'bulletList':
      return [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }]
    case 'orderedList':
      return [{ type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }]
    case 'callout':
      return [{ type: 'callout', attrs: { variant: 'info' }, content: [{ type: 'paragraph' }] }]
    case 'table':
      return [emptyTable(3, 3)]
    case 'text':
    default:
      return [{ type: 'paragraph' }]
  }
}

function emptyTable(rows: number, cols: number): DocNode {
  const makeRow = (header: boolean): DocNode => ({
    type: 'tableRow',
    content: Array.from({ length: cols }, () => ({
      type: header ? 'tableHeader' : 'tableCell',
      content: [{ type: 'paragraph' }],
    })),
  })
  return {
    type: 'table',
    content: [makeRow(true), ...Array.from({ length: Math.max(0, rows - 1) }, () => makeRow(false))],
  }
}

export function buildBlock(type: InsertBlockType): DocNode {
  const skeleton = blockSkeleton(type)
  return {
    type: 'bilingualBlock',
    attrs: {
      id: newBlockId(),
      needsReview: false,
      numbering: type === 'h2' ? 'decimal' : null,
    },
    content: [
      { type: 'blockBody', attrs: { lang: 'en' }, content: structuredClone(skeleton) },
      { type: 'blockBody', attrs: { lang: 'id' }, content: structuredClone(skeleton) },
    ],
  }
}

export function emptySection(): DocNode {
  return {
    type: 'section',
    attrs: {
      id: newSectionId(),
      titleEn: '',
      titleId: '',
      accentColor: null,
      numberingStyle: 'decimal',
      boxed: false,
    },
    content: [emptyBlock()],
  }
}

export function emptyDocumentDoc(): DocumentDoc {
  return { type: 'document', content: [emptyBlock()] }
}

// ─── normalizeDoc ───────────────────────────────────────────────────
//
// Migrates a legacy section-nested document into the flat block stream
// the editor now uses. Idempotent: a doc with no `section` nodes is
// returned unchanged (structurally — same object identity is NOT
// guaranteed, callers should treat the result as the canonical doc).
//
// Transform: each `section` is unwrapped into
//   [ clause-heading bilingualBlock, ...the section's existing blocks ]
// where the clause-heading block carries the section's two titles as
// level-2 headings (EN / ID) and inherits its `numberingStyle` as a
// `numbering` attr. The CSS section counter that produced "1." "2." …
// is rehomed onto these heading blocks (see styles), so a heading block
// is emitted for EVERY section — even an untitled one — to keep the
// running count byte-identical to the section-based output.
//
// `accentColor` and `boxed` are intentionally dropped: per-section
// theming retires with the flat model.

export type BlockNumbering = NonNullable<SectionAttrs['numberingStyle']>

// Marks a bilingualBlock as a numbered clause heading. Read by the
// renderer/editor CSS to drive the section-counter prefix. Normal
// blocks omit it.
export type ClauseHeadingAttrs = {
  numbering: BlockNumbering
}

function headingBody(lang: 'en' | 'id', title: string): DocNode {
  const heading: DocNode = {
    type: 'heading',
    attrs: { level: 2 },
    content: title.trim() ? [{ type: 'text', text: title.trim() }] : [],
  }
  return { type: 'blockBody', attrs: { lang }, content: [heading] }
}

function clauseHeadingBlock(section: DocNode): DocNode {
  const attrs = (section.attrs || {}) as Partial<SectionAttrs>
  return {
    type: 'bilingualBlock',
    attrs: {
      id: typeof attrs.id === 'string' ? attrs.id : newBlockId(),
      needsReview: false,
      numbering: (attrs.numberingStyle as BlockNumbering) || 'decimal',
    },
    content: [
      headingBody('en', attrs.titleEn || ''),
      headingBody('id', attrs.titleId || ''),
    ],
  }
}

export function normalizeDoc(doc: DocNode | unknown): DocumentDoc {
  if (!isDocumentDoc(doc)) return { type: 'document', content: [] }
  const content = doc.content || []
  const hasSections = content.some(node => node.type === 'section')
  if (!hasSections) return { type: 'document', content }

  const flat: DocNode[] = []
  for (const node of content) {
    if (node.type !== 'section') {
      // Already-flat block sitting alongside legacy sections — keep it.
      flat.push(node)
      continue
    }
    flat.push(clauseHeadingBlock(node))
    for (const block of node.content || []) {
      if (block.type === 'bilingualBlock') flat.push(block)
    }
  }
  return { type: 'document', content: flat }
}

// Supabase-typed insert/update helper. The auto-generated database
// types use the strict `Json` shape for JSONB columns, which doesn't
// accept our `DocNode.attrs: Record<string, unknown>` directly even
// though every doc is json-serializable in practice. This cast is the
// boundary that lets call sites pass real DocumentDocs through.
export function docAsJson<T extends DocNode | unknown>(value: T): import('../types/database').Json {
  return value as unknown as import('../types/database').Json
}

// ─── Schema-shape detection ─────────────────────────────────────────

export function isDocumentDoc(value: unknown): value is DocumentDoc {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<DocumentDoc>
  return v.type === 'document' && Array.isArray(v.content)
}

// ─── docToMarkdown ──────────────────────────────────────────────────
//
// Derives a markdown projection of one language from a structured doc.
// Used on save by the snapshot helper so `content_markdown_en` /
// `content_markdown_id` columns stay populated for Portal, history,
// and signature-hash consumers that haven't migrated to reading
// content_doc directly. Phase C.3 introduces a native DocumentRenderer
// for those consumers; until then, the derivation is the integration
// seam that keeps everything working.
//
// Coverage:
//   - paragraph (with inline marks: bold, italic, underline, code, link)
//   - heading (h3 / h4)
//   - bulletList, orderedList (one level; nested-list support deferred)
//   - codeBlock
//   - table (GFM pipe style)
//   - callout (rendered as blockquote with emoji marker so plaintext
//     readers still see the emphasis)
//
// Anything else collapses to empty — the editor's content schema
// prevents it from showing up, so this isn't load-bearing.

export function docToMarkdown(doc: DocNode | unknown, lang: 'en' | 'id'): string {
  if (!isDocumentDoc(doc)) return ''
  // Normalize first so both legacy section-nested docs and flat docs
  // project identically — clause headings (former section titles) are
  // level-2 headings, which renderBlockNode emits as "## title".
  const flat = normalizeDoc(doc)
  const lines: string[] = []
  for (const block of flat.content || []) {
    if (block.type !== 'bilingualBlock') continue
    const body = (block.content || []).find(
      b => b.type === 'blockBody' && (b.attrs?.lang === lang),
    )
    if (!body) continue
    for (const node of body.content || []) {
      const rendered = renderBlockNode(node)
      if (rendered) lines.push(rendered)
    }
  }
  return lines.join('\n').trim() + (lines.length ? '\n' : '')
}

// ─── docPreviewLines ────────────────────────────────────────────────
//
// Plain-text projection for thumbnails — one string per block-level node
// (section titles + paragraph/heading/list/etc. text), with markdown
// syntax stripped so the snippet reads like the rendered page rather than
// source. Stops once `maxLines` non-empty lines are collected so we never
// walk a whole long document just to fill a card.

export function docPreviewLines(doc: DocNode | unknown, lang: 'en' | 'id', maxLines = 6): string[] {
  if (!isDocumentDoc(doc)) return []
  const flat = normalizeDoc(doc)
  const lines: string[] = []
  const push = (s: string) => {
    const trimmed = s.replace(/\s+/g, ' ').trim()
    if (trimmed) lines.push(trimmed)
  }
  for (const block of flat.content || []) {
    if (lines.length >= maxLines) break
    if (block.type !== 'bilingualBlock') continue
    const body = (block.content || []).find(
      b => b.type === 'blockBody' && b.attrs?.lang === lang,
    )
    if (!body) continue
    for (const node of body.content || []) {
      if (lines.length >= maxLines) break
      push(collectPlainText(node))
    }
  }
  return lines.slice(0, maxLines)
}

function collectPlainText(node: DocNode): string {
  if (node.type === 'text') return node.text || ''
  if (node.type === 'hardBreak') return ' '
  if (node.type === 'mergeField') {
    const key = (node.attrs?.key as string) || ''
    return key ? `{{${key}}}` : ''
  }
  return (node.content || []).map(collectPlainText).join(node.type === 'paragraph' ? '' : ' ')
}

function renderBlockNode(node: DocNode): string {
  switch (node.type) {
    case 'paragraph':
      return renderInline(node.content) + '\n'
    case 'heading': {
      const level = (node.attrs?.level as number) || 3
      const prefix = '#'.repeat(Math.max(1, Math.min(6, level)))
      return `${prefix} ${renderInline(node.content)}\n`
    }
    case 'bulletList':
      return (node.content || []).map(li => `- ${renderListItemInline(li)}`).join('\n') + '\n'
    case 'orderedList':
      return (node.content || []).map((li, i) => `${i + 1}. ${renderListItemInline(li)}`).join('\n') + '\n'
    case 'codeBlock':
      return '```\n' + renderInline(node.content) + '\n```\n'
    case 'table':
      return renderTable(node)
    case 'callout': {
      const variant = (node.attrs?.variant as string) || 'info'
      const marker = variant === 'warning' ? '⚠️'
        : variant === 'success' ? '✅'
        : variant === 'danger' ? '🚫'
        : 'ℹ️'
      const inner = (node.content || [])
        .map(child => child.type === 'paragraph' ? renderInline(child.content) : renderBlockNode(child))
        .join(' ')
        .trim()
      return `> ${marker} ${inner}\n`
    }
    default:
      return ''
  }
}

function renderListItemInline(node: DocNode): string {
  // A listItem holds one or more paragraph (or block) children. Flatten
  // their inline content with a leading-newline join so consumers see
  // a single readable line per item.
  return (node.content || [])
    .map(child => child.type === 'paragraph' ? renderInline(child.content) : renderBlockNode(child).trim())
    .join('\n  ')
}

function renderInline(content?: DocNode[]): string {
  if (!content) return ''
  return content.map(n => {
    if (n.type === 'text') {
      let text = n.text || ''
      // Apply marks in a stable order so the output is deterministic.
      const marks = n.marks || []
      const has = (t: string) => marks.some(m => m.type === t)
      const linkMark = marks.find(m => m.type === 'link')
      if (has('code')) text = '`' + text + '`'
      if (has('bold')) text = `**${text}**`
      if (has('italic')) text = `*${text}*`
      if (has('underline')) text = `<u>${text}</u>`
      if (linkMark) {
        const href = (linkMark.attrs?.href as string) || ''
        text = `[${text}](${href})`
      }
      return text
    }
    if (n.type === 'hardBreak') return '\n'
    if (n.type === 'mergeField') {
      // Merge-field pills serialize as their token form so downstream
      // resolvers (snapshot helper, portal renderer) substitute them.
      const key = (n.attrs?.key as string) || ''
      return key ? `{{${key}}}` : ''
    }
    return ''
  }).join('')
}

function renderTable(node: DocNode): string {
  const rows = node.content || []
  if (rows.length === 0) return ''
  const lines: string[] = []
  rows.forEach((row, ri) => {
    const cells = (row.content || []).map(cell => {
      const inner = (cell.content || [])
        .map(child => child.type === 'paragraph' ? renderInline(child.content) : '')
        .join(' ')
      return inner.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()
    })
    lines.push(`| ${cells.join(' | ')} |`)
    if (ri === 0) {
      lines.push(`|${cells.map(() => ' --- ').join('|')}|`)
    }
  })
  return lines.join('\n') + '\n'
}
