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
    attrs: { id: newBlockId(), needsReview: false },
    content: [
      { type: 'blockBody', attrs: { lang: 'en' }, content: [{ type: 'paragraph' }] },
      { type: 'blockBody', attrs: { lang: 'id' }, content: [{ type: 'paragraph' }] },
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
  return { type: 'document', content: [emptySection()] }
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
  const lines: string[] = []
  for (const section of doc.content || []) {
    if (section.type !== 'section') continue
    const attrs = (section.attrs || {}) as Partial<SectionAttrs>
    const title = lang === 'en' ? attrs.titleEn : attrs.titleId
    if (typeof title === 'string' && title.trim()) {
      lines.push(`## ${title.trim()}`)
      lines.push('')
    }
    for (const block of section.content || []) {
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
  const lines: string[] = []
  const push = (s: string) => {
    const trimmed = s.replace(/\s+/g, ' ').trim()
    if (trimmed) lines.push(trimmed)
  }
  for (const section of doc.content || []) {
    if (section.type !== 'section') continue
    if (lines.length >= maxLines) break
    const attrs = (section.attrs || {}) as Partial<SectionAttrs>
    const title = lang === 'en' ? attrs.titleEn : attrs.titleId
    if (typeof title === 'string') push(title)
    for (const block of section.content || []) {
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
