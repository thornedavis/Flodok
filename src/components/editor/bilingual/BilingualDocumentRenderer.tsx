// Bilingual read-only renderer.
//
// Same source data as DocumentRenderer — walks a DocumentDoc — but
// emits BOTH language slots per block instead of projecting one.
// Used by the PDF export so the downloaded file matches what the
// user sees in the bilingual editor (stacked or side-by-side per
// their saved view preference).
//
// Layout matrix:
//   stacked      → per block: EN body on top, ID body below
//   side_by_side → per block: EN body and ID body in two columns
// Section headers always render both titles regardless of view mode
// (the bilingual title pair is the structural cue for "this is one
// section, two languages"), with the layout matching the body.

import { Fragment } from 'react'
import {
  resolveMergeField,
  isMergeFieldKey,
  type Lang,
  type MergeContext,
} from '../../../lib/mergeFields'
import type { DocNode, DocumentDoc, SectionAttrs, ViewMode } from '../../../lib/documentDoc'

export type BilingualDocumentRendererProps = {
  doc: DocumentDoc | DocNode | null | undefined
  view: ViewMode
  // Two contexts — one per language — so merge fields resolve to the
  // correct localized values on each side. Hosts that don't care about
  // localization can pass the same context for both.
  contextEn?: MergeContext
  contextId?: MergeContext
  className?: string
}

export function BilingualDocumentRenderer({ doc, view, contextEn, contextId, className }: BilingualDocumentRendererProps) {
  if (!doc || typeof doc !== 'object') return null
  const root = doc as DocumentDoc
  if (root.type !== 'document' || !Array.isArray(root.content)) return null

  const ctxEn: MergeContext = contextEn ? { ...contextEn, lang: 'en' } : { lang: 'en' }
  const ctxId: MergeContext = contextId ? { ...contextId, lang: 'id' } : { lang: 'id' }

  return (
    <div className={`bidoc-renderer bidoc-${view} ${className ?? ''}`}>
      {root.content.map((section, i) => (
        <SectionRender
          key={(section.attrs?.id as string) ?? i}
          section={section}
          view={view}
          ctxEn={ctxEn}
          ctxId={ctxId}
        />
      ))}
    </div>
  )
}

function SectionRender({ section, ctxEn, ctxId }: { section: DocNode; view: ViewMode; ctxEn: MergeContext; ctxId: MergeContext }) {
  if (section.type !== 'section') return null
  const attrs = (section.attrs || {}) as Partial<SectionAttrs>
  const style: React.CSSProperties = attrs.accentColor
    ? ({ ['--section-accent' as 'color']: attrs.accentColor } as React.CSSProperties)
    : {}
  const titleEn = attrs.titleEn?.trim() || ''
  const titleId = attrs.titleId?.trim() || ''
  const hasTitles = !!(titleEn || titleId)

  return (
    <section
      className="bidoc-section"
      data-numbering={attrs.numberingStyle || 'decimal'}
      data-boxed={attrs.boxed ? 'true' : undefined}
      data-has-accent={attrs.accentColor ? 'true' : undefined}
      style={style}
    >
      {hasTitles && (
        <header className="bidoc-section-header">
          <div className="bidoc-cell bidoc-lang-en">
            <span className="bidoc-number" />
            <h2>{titleEn}</h2>
          </div>
          <div className="bidoc-cell bidoc-lang-id">
            <h2>{titleId}</h2>
          </div>
        </header>
      )}
      <div className="bidoc-section-body">
        {(section.content || []).map((block, i) => (
          <BlockRender key={(block.attrs?.id as string) ?? i} block={block} ctxEn={ctxEn} ctxId={ctxId} />
        ))}
      </div>
    </section>
  )
}

function BlockRender({ block, ctxEn, ctxId }: { block: DocNode; ctxEn: MergeContext; ctxId: MergeContext }) {
  if (block.type !== 'bilingualBlock') return null
  const enBody = (block.content || []).find(b => b.type === 'blockBody' && b.attrs?.lang === 'en')
  const idBody = (block.content || []).find(b => b.type === 'blockBody' && b.attrs?.lang === 'id')
  return (
    <div className="bidoc-block">
      <div className="bidoc-cell bidoc-lang-en">
        {enBody && (enBody.content || []).map((node, i) => <BlockNodeRender key={i} node={node} ctx={ctxEn} />)}
      </div>
      <div className="bidoc-cell bidoc-lang-id">
        {idBody && (idBody.content || []).map((node, i) => <BlockNodeRender key={i} node={node} ctx={ctxId} />)}
      </div>
    </div>
  )
}

function BlockNodeRender({ node, ctx }: { node: DocNode; ctx: MergeContext }) {
  switch (node.type) {
    case 'paragraph':
      return <p><InlineRender content={node.content} ctx={ctx} /></p>
    case 'heading': {
      const level = (node.attrs?.level as number) || 3
      const Tag = (level === 4 ? 'h4' : 'h3') as 'h3' | 'h4'
      return <Tag><InlineRender content={node.content} ctx={ctx} /></Tag>
    }
    case 'bulletList':
      return (
        <ul>
          {(node.content || []).map((li, i) => (
            <li key={i}>{(li.content || []).map((p, j) => <BlockNodeRender key={j} node={p} ctx={ctx} />)}</li>
          ))}
        </ul>
      )
    case 'orderedList':
      return (
        <ol>
          {(node.content || []).map((li, i) => (
            <li key={i}>{(li.content || []).map((p, j) => <BlockNodeRender key={j} node={p} ctx={ctx} />)}</li>
          ))}
        </ol>
      )
    case 'codeBlock':
      return <pre><code><InlineRender content={node.content} ctx={ctx} /></code></pre>
    case 'callout': {
      const variant = (node.attrs?.variant as string) || 'info'
      return (
        <div className="callout" data-variant={variant}>
          {(node.content || []).map((p, i) => <BlockNodeRender key={i} node={p} ctx={ctx} />)}
        </div>
      )
    }
    case 'table':
      return (
        <table>
          <tbody>
            {(node.content || []).map((row, ri) => (
              <tr key={ri}>
                {(row.content || []).map((cell, ci) => {
                  const Tag = (cell.type === 'tableHeader' ? 'th' : 'td') as 'th' | 'td'
                  return (
                    <Tag key={ci}>
                      {(cell.content || []).map((p, pi) => <BlockNodeRender key={pi} node={p} ctx={ctx} />)}
                    </Tag>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )
    default:
      return null
  }
}

function InlineRender({ content, ctx }: { content?: DocNode[]; ctx: MergeContext }) {
  if (!content) return null
  return <>{content.map((n, i) => <InlineNode key={i} node={n} ctx={ctx} />)}</>
}

function InlineNode({ node, ctx }: { node: DocNode; ctx: MergeContext }) {
  if (node.type === 'hardBreak') return <br />
  if (node.type === 'mergeField') {
    const key = (node.attrs?.key as string) || ''
    if (!isMergeFieldKey(key)) return <Fragment>{`{{${key}}}`}</Fragment>
    const html = resolveMergeField(key, ctx)
    return <span className="merge-field-pill" data-key={key} dangerouslySetInnerHTML={{ __html: html }} />
  }
  if (node.type === 'text') {
    const marks = node.marks || []
    const linkMark = marks.find(m => m.type === 'link')
    let el: React.ReactNode = node.text ?? ''
    if (marks.some(m => m.type === 'code')) el = <code>{el}</code>
    if (marks.some(m => m.type === 'bold')) el = <strong>{el}</strong>
    if (marks.some(m => m.type === 'italic')) el = <em>{el}</em>
    if (marks.some(m => m.type === 'underline')) el = <u>{el}</u>
    if (linkMark) {
      const href = (linkMark.attrs?.href as string) || '#'
      el = <a href={href}>{el}</a>
    }
    return <>{el}</>
  }
  // Suppress unused-var lint when this module is consumed without the Lang type below.
  void (null as unknown as Lang)
  return null
}

// Inline stylesheet — mirrors DocumentRenderer's vocabulary so the
// bilingual surface feels like the single-language one, just doubled.
// CSS grid drives the side-by-side vs stacked switch; everything else
// is shared between the two modes.

export const BILINGUAL_DOCUMENT_RENDERER_STYLES = `
.bidoc-renderer {
  color: var(--color-text);
  font-size: 0.9375rem;
  line-height: 1.6;
  counter-reset: bidoc-section;
}

.bidoc-section {
  margin: 0 0 1.5rem;
  counter-increment: bidoc-section;
  break-inside: avoid;
}

.bidoc-section-header {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin: 0 0 0.5rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--color-border);
}

.bidoc-section[data-has-accent="true"] .bidoc-section-header {
  border-bottom-color: var(--section-accent);
}

.bidoc-section-header h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
  line-height: 1.3;
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.bidoc-section[data-has-accent="true"] .bidoc-section-header h2 {
  color: var(--section-accent);
}

.bidoc-number {
  font-weight: 600;
  color: var(--color-text-tertiary);
}

.bidoc-section[data-has-accent="true"] .bidoc-number {
  color: var(--section-accent);
}

.bidoc-section[data-numbering="decimal"] .bidoc-number::before {
  content: counter(bidoc-section) ".";
}
.bidoc-section[data-numbering="roman"] .bidoc-number::before {
  content: counter(bidoc-section, upper-roman) ".";
}
.bidoc-section[data-numbering="alpha"] .bidoc-number::before {
  content: counter(bidoc-section, upper-alpha) ".";
}
.bidoc-section[data-numbering="none"] .bidoc-number { display: none; }

.bidoc-section[data-boxed="true"] {
  border: 1px solid var(--color-primary);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
}
.bidoc-section[data-boxed="true"][data-has-accent="true"] {
  border-color: var(--section-accent);
}

.bidoc-section-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* ─── Block layout: side-by-side vs stacked ───────────── */

.bidoc-block {
  display: grid;
  gap: 0.6rem 1rem;
  break-inside: avoid;
}

.bidoc-renderer.bidoc-side_by_side .bidoc-block {
  grid-template-columns: 1fr 1fr;
}

.bidoc-renderer.bidoc-stacked .bidoc-block {
  grid-template-columns: 1fr;
}

.bidoc-renderer.bidoc-stacked .bidoc-section-header {
  grid-template-columns: 1fr;
  gap: 0.1rem;
}

.bidoc-renderer.bidoc-stacked .bidoc-cell.bidoc-lang-id h2 {
  font-weight: 500;
  font-size: 1.1rem;
  color: var(--color-text-secondary);
}

.bidoc-cell {
  min-width: 0;
}

/* Small EN/ID badge on each cell so readers can tell the languages
 * apart in a side-by-side PDF without color-coding. */
.bidoc-cell::before {
  content: "";
  display: block;
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
  margin-bottom: 0.15rem;
}
.bidoc-cell.bidoc-lang-en::before { content: "EN"; }
.bidoc-cell.bidoc-lang-id::before { content: "ID"; }

.bidoc-renderer.bidoc-stacked .bidoc-section-header .bidoc-cell::before {
  display: none;
}

/* ─── Block content shared styles ───────────────────── */

.bidoc-cell p { margin: 0.3rem 0; }
.bidoc-cell h3 { font-size: 1.05rem; font-weight: 600; margin: 0.6rem 0 0.3rem; }
.bidoc-cell h4 { font-size: 0.95rem; font-weight: 600; margin: 0.5rem 0 0.25rem; }
.bidoc-cell ul, .bidoc-cell ol { padding-left: 1.4rem; margin: 0.3rem 0; }
.bidoc-cell li { margin: 0.15rem 0; }
.bidoc-cell code { background: var(--color-bg-tertiary); border-radius: 0.25rem; padding: 0.1rem 0.3rem; font-size: 0.85em; font-family: ui-monospace, monospace; }
.bidoc-cell pre { background: var(--color-bg-tertiary); border-radius: 0.4rem; padding: 0.5rem 0.7rem; margin: 0.4rem 0; overflow-x: auto; }
.bidoc-cell pre code { background: none; padding: 0; }
.bidoc-cell table { border-collapse: collapse; width: 100%; margin: 0.4rem 0; font-size: 0.85rem; }
.bidoc-cell th, .bidoc-cell td { border: 1px solid var(--color-border); padding: 0.3rem 0.5rem; text-align: left; }
.bidoc-cell th { background: var(--color-bg-secondary); font-weight: 600; }
.bidoc-cell a { color: var(--color-primary); text-decoration: underline; }
.bidoc-cell strong { font-weight: 600; }
.bidoc-cell .callout {
  border-left: 3px solid var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 6%, transparent);
  padding: 0.5rem 0.8rem;
  border-radius: 0.3rem;
  margin: 0.4rem 0;
}
.bidoc-cell .callout[data-variant="warning"] {
  border-left-color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 6%, transparent);
}
.bidoc-cell .callout[data-variant="success"] {
  border-left-color: var(--color-success);
  background: color-mix(in srgb, var(--color-success) 6%, transparent);
}
.bidoc-cell .callout[data-variant="danger"] {
  border-left-color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 6%, transparent);
}
`
