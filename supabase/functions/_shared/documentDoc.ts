// Deno-side twin of src/lib/documentDoc.ts.
//
// Same shapes + docToMarkdown — kept in sync by hand because the
// snapshot helper, the translate-sop edge function, and the PDF
// exporter all need to read and write the structured document inside
// Deno without reaching into the Vite-built browser bundle.
//
// If you change one, change the other. The shapes are stable enough
// that duplication is cheaper than wiring up a shared package.

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

export type SectionAttrs = {
  id: string
  titleEn: string
  titleId: string
  accentColor: string | null
  numberingStyle: 'decimal' | 'roman' | 'alpha' | 'none'
  boxed: boolean
}

export type DocumentDoc = DocNode & { type: 'document' }

export type ViewMode = 'stacked' | 'side_by_side'

export function isDocumentDoc(value: unknown): value is DocumentDoc {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<DocumentDoc>
  return v.type === 'document' && Array.isArray(v.content)
}

// ─── normalizeDoc ───────────────────────────────────────────────────
//
// Deno twin of src/lib/documentDoc.ts:normalizeDoc. Migrates legacy
// section-nested docs to the flat block stream. See the browser copy
// for the full rationale. Idempotent on already-flat docs.

export type BlockNumbering = NonNullable<SectionAttrs['numberingStyle']>

function newBlockId(): string {
  const random = Math.random().toString(36).slice(2, 10)
  const time = Date.now().toString(36).slice(-4)
  return `blk_${time}${random}`
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

export function docToMarkdown(doc: DocNode | unknown, lang: 'en' | 'id'): string {
  if (!isDocumentDoc(doc)) return ''
  // Normalize first so legacy section-nested and flat docs project
  // identically (clause headings become "## title").
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
  return (node.content || [])
    .map(child => child.type === 'paragraph' ? renderInline(child.content) : renderBlockNode(child).trim())
    .join('\n  ')
}

function renderInline(content?: DocNode[]): string {
  if (!content) return ''
  return content.map(n => {
    if (n.type === 'text') {
      let text = n.text || ''
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
