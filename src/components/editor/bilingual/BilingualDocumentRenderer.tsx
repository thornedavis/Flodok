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
import { normalizeDoc, type DocNode, type DocumentDoc, type LanguageMode, type ViewMode } from '../../../lib/documentDoc'

export type BilingualDocumentRendererProps = {
  doc: DocumentDoc | DocNode | null | undefined
  view: ViewMode
  // Two contexts — one per language — so merge fields resolve to the
  // correct localized values on each side. Hosts that don't care about
  // localization can pass the same context for both.
  contextEn?: MergeContext
  contextId?: MergeContext
  // Per-document language mode. 'en'/'id' render a single full-width column
  // (the other side has been cleared by the snapshot writer); 'bilingual'
  // (default) renders both. Without this, a monolingual doc would render a
  // stray empty second column + an EN/ID badge.
  languageMode?: LanguageMode
  className?: string
}

export function BilingualDocumentRenderer({ doc, view, contextEn, contextId, languageMode = 'bilingual', className }: BilingualDocumentRendererProps) {
  if (!doc || typeof doc !== 'object') return null
  const root = doc as DocumentDoc
  if (root.type !== 'document' || !Array.isArray(root.content)) return null

  const ctxEn: MergeContext = contextEn ? { ...contextEn, lang: 'en' } : { lang: 'en' }
  const ctxId: MergeContext = contextId ? { ...contextId, lang: 'id' } : { lang: 'id' }

  // Flatten legacy section-nested docs so the renderer only has to walk
  // a flat block stream. Clause-heading blocks carry a `numbering` attr
  // that drives the rehomed section counter.
  const flat = normalizeDoc(root)

  const monoClass = languageMode === 'en' ? 'bidoc-monolingual bidoc-monolingual-en'
    : languageMode === 'id' ? 'bidoc-monolingual bidoc-monolingual-id'
    : ''

  return (
    <div className={`bidoc-renderer bidoc-${view} ${monoClass} ${className ?? ''}`}>
      {(flat.content || []).map((block, i) => (
        <BlockRender key={(block.attrs?.id as string) ?? i} block={block} ctxEn={ctxEn} ctxId={ctxId} languageMode={languageMode} />
      ))}
    </div>
  )
}

function BlockRender({ block, ctxEn, ctxId, languageMode }: { block: DocNode; ctxEn: MergeContext; ctxId: MergeContext; languageMode: LanguageMode }) {
  if (block.type !== 'bilingualBlock') return null
  const enBody = (block.content || []).find(b => b.type === 'blockBody' && b.attrs?.lang === 'en')
  const idBody = (block.content || []).find(b => b.type === 'blockBody' && b.attrs?.lang === 'id')
  const numbering = (block.attrs?.numbering as string | null) ?? null
  const enCell = (
    <div className="bidoc-cell bidoc-lang-en">
      {enBody && (enBody.content || []).map((node, i) => <BlockNodeRender key={i} node={node} ctx={ctxEn} />)}
    </div>
  )
  const idCell = (
    <div className="bidoc-cell bidoc-lang-id">
      {idBody && (idBody.content || []).map((node, i) => <BlockNodeRender key={i} node={node} ctx={ctxId} />)}
    </div>
  )
  return (
    <div className="bidoc-block" data-numbering={numbering ?? undefined}>
      {languageMode === 'en' ? enCell
        : languageMode === 'id' ? idCell
        : <>{enCell}{idCell}</>}
    </div>
  )
}

function BlockNodeRender({ node, ctx }: { node: DocNode; ctx: MergeContext }) {
  switch (node.type) {
    case 'paragraph':
      return <p><InlineRender content={node.content} ctx={ctx} /></p>
    case 'heading': {
      const level = (node.attrs?.level as number) || 3
      const Tag = (level === 2 ? 'h2' : level === 4 ? 'h4' : 'h3') as 'h2' | 'h3' | 'h4'
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
  counter-reset: bidoc-clause;
}

/* ─── Block layout: side-by-side vs stacked ───────────── */

.bidoc-block {
  display: grid;
  gap: 0.6rem 1rem;
  margin: 0 0 0.5rem;
  break-inside: avoid;
}

.bidoc-renderer.bidoc-side_by_side .bidoc-block {
  grid-template-columns: 1fr 1fr;
}

.bidoc-renderer.bidoc-stacked .bidoc-block {
  grid-template-columns: 1fr;
}

.bidoc-cell {
  min-width: 0;
}

/* ─── Clause headings (rehomed section counter) ───────── */

/* Every clause-heading block carries data-numbering; the counter
 * increments per block so the rendered numbers match the old
 * per-section counter exactly. The prefix renders on the h2 in BOTH
 * language cells. "none" still increments but shows no prefix. */
.bidoc-block[data-numbering] {
  counter-increment: bidoc-clause;
  margin-top: 1rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--color-border);
}

.bidoc-block[data-numbering] .bidoc-cell h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
  line-height: 1.3;
}

.bidoc-block[data-numbering="decimal"] .bidoc-cell h2::before {
  content: counter(bidoc-clause) ". ";
  color: var(--color-text-tertiary);
}
.bidoc-block[data-numbering="roman"] .bidoc-cell h2::before {
  content: counter(bidoc-clause, upper-roman) ". ";
  color: var(--color-text-tertiary);
}
.bidoc-block[data-numbering="alpha"] .bidoc-cell h2::before {
  content: counter(bidoc-clause, upper-alpha) ". ";
  color: var(--color-text-tertiary);
}

.bidoc-renderer.bidoc-stacked .bidoc-block[data-numbering] .bidoc-cell.bidoc-lang-id h2 {
  font-weight: 500;
  font-size: 1.1rem;
  color: var(--color-text-secondary);
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

/* Clause-heading blocks render a numbered title — no EN/ID badge over
 * the heading, matching the old section-header treatment. */
.bidoc-block[data-numbering] .bidoc-cell::before {
  display: none;
}

/* ─── Monolingual (P1): one full-width column, no EN/ID badge.
 * The renderer emits only the active cell, so 1fr stretches it full
 * width and the badge is redundant. Declared after the grid + badge
 * rules so it wins on source order. */
.bidoc-renderer.bidoc-monolingual .bidoc-block {
  grid-template-columns: 1fr;
}
.bidoc-renderer.bidoc-monolingual .bidoc-cell::before {
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
