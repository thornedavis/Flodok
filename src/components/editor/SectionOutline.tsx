// Document outline (TOC) for the bilingual structured editor.
//
// Walks the top-level `content` array of a DocumentDoc and renders one
// entry per section node, using the user's current language for the
// title. Clicking jumps to the matching `<section data-id="...">` in
// the editor DOM (sections render with that data attribute via
// nodes.ts:renderHTML).
//
// Designed for the left-sidebar of full-height edit-page layouts
// (ContractEdit first, SOPEdit / JDEdit later). Renders nothing when
// the doc has no sections.

import { useLang } from '../../contexts/LanguageContext'
import type { DocNode, DocumentDoc, SectionAttrs } from '../../lib/documentDoc'

export function SectionOutline({
  doc,
  topOffsetPx = 0,
}: {
  doc: DocumentDoc
  /** Sticky chrome height in px (app header + page bar + editor toolbar).
   *  Without this, scrollIntoView lands the section behind the sticky
   *  bars and the user sees nothing happen. */
  topOffsetPx?: number
}) {
  const { lang } = useLang()

  const sections = (doc.content ?? [])
    .filter((node: DocNode) => node.type === 'section')
    .map((node, idx) => {
      const attrs = (node.attrs ?? {}) as Partial<SectionAttrs>
      return {
        id: attrs.id ?? `section-${idx}`,
        title: (lang === 'id' ? attrs.titleId : attrs.titleEn) || (attrs.titleEn || attrs.titleId || ''),
        idx,
      }
    })

  function jumpTo(id: string) {
    if (typeof document === 'undefined' || typeof window === 'undefined') return
    // Section nodes render via a React NodeView (NodeViewWrapper → div),
    // not a raw <section> element — so we match on the data-id attribute
    // that SectionView.tsx puts on the wrapper, not a tag selector.
    const target = document.querySelector(`.bilingual-section[data-id="${id}"]`) as HTMLElement | null
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
