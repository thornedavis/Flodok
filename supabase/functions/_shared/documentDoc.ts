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
