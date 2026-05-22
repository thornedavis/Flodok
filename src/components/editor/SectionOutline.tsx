// Document outline (TOC) for the bilingual structured editor.
//
// Walks the flat block stream and renders one entry per clause-heading
// block (a bilingualBlock carrying a `numbering` attr — the flat-schema
// successor to section titles), using the user's current language for
// the title. Clicking jumps to the matching `.bilingual-block-wrap
// [data-id="..."]` in the editor DOM (BilingualBlockView sets data-id).
//
// Designed for the left-sidebar of full-height edit-page layouts
// (ContractEdit first, SOPEdit / JDEdit later). Renders nothing when
// the doc has no clause headings.

import { useLang } from '../../contexts/LanguageContext'
import { normalizeDoc, type DocNode, type DocumentDoc } from '../../lib/documentDoc'

// Plain text of the first heading node in the given language body.
function clauseTitle(block: DocNode, lang: 'en' | 'id'): string {
  const body = (block.content ?? []).find(b => b.type === 'blockBody' && b.attrs?.lang === lang)
  const heading = (body?.content ?? []).find(n => n.type === 'heading')
  if (!heading) return ''
  return (heading.content ?? []).map(n => n.text ?? '').join('').trim()
}

export function SectionOutline({
  doc,
  topOffsetPx = 0,
}: {
  doc: DocumentDoc
  /** Sticky chrome height in px (app header + page bar + editor toolbar).
   *  Without this, scrollIntoView lands the heading behind the sticky
   *  bars and the user sees nothing happen. */
  topOffsetPx?: number
}) {
  const { lang } = useLang()

  const flat = normalizeDoc(doc)
  const sections = (flat.content ?? [])
    .filter((node: DocNode) => node.type === 'bilingualBlock' && node.attrs?.numbering)
    .map((node, idx) => {
      const id = (node.attrs?.id as string) ?? `clause-${idx}`
      const title = clauseTitle(node, lang === 'id' ? 'id' : 'en')
        || clauseTitle(node, lang === 'id' ? 'en' : 'id')
      return { id, title, idx }
    })

  function jumpTo(id: string) {
    if (typeof document === 'undefined' || typeof window === 'undefined') return
    // Blocks render via a React NodeView (NodeViewWrapper → div) carrying
    // data-id — match on that attribute, not a tag selector.
    const target = document.querySelector(`.bilingual-block-wrap[data-id="${id}"]`) as HTMLElement | null
    if (!target) return
    // Measure the toolbar (first child of the editor) at click time so
    // we don't rely on a hard-coded height that drifts as the toolbar
    // wraps to two rows on narrower viewports.
    const toolbar = document.querySelector('.doc-editor > div:first-child') as HTMLElement | null
    const toolbarHeight = toolbar ? toolbar.offsetHeight : 0
    const rect = target.getBoundingClientRect()
    const absoluteY = window.scrollY + rect.top
    // Extra 12px of breathing room above the section heading.
    const offset = topOffsetPx + toolbarHeight + 12
    window.scrollTo({ top: absoluteY - offset, behavior: 'smooth' })
  }

  if (sections.length === 0) return null

  return (
    <nav aria-label="Document outline" className="space-y-0.5">
      {sections.map(({ id, title, idx }) => (
        <button
          key={id}
          type="button"
          onClick={() => jumpTo(id)}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          <span className="w-5 shrink-0 text-right tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>
            {idx + 1}.
          </span>
          <span className="truncate">{title || <span style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>Untitled</span>}</span>
        </button>
      ))}
    </nav>
  )
}
