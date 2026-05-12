// Read-only renderer for the bilingual document model.
//
// Walks a `DocumentDoc` and emits HTML directly via React elements,
// no TipTap mount needed. Used by:
//   - Portal (employee-facing read view) — one language at a time,
//     selected by the host's language toggle
//   - SOPHistory / ContractHistory — replays a stored snapshot for
//     diffing and review
//   - PDF export pipeline (Phase D) — same DOM cloned and dehydrated
//
// Merge-field pills resolve through the shared `resolveMergeField`
// helper. Some field resolvers (signatures, dates) return raw HTML so
// signature fonts and the `.signature-name` / `.signature-date` hooks
// the PDF exporter relies on continue to work; those values are
// injected via `dangerouslySetInnerHTML`.

import { Fragment } from 'react'
import {
  resolveMergeField,
  isMergeFieldKey,
  type Lang,
  type MergeContext,
} from '../../../lib/mergeFields'
import type { DocNode, DocumentDoc, SectionAttrs } from '../../../lib/documentDoc'

export type DocumentRendererProps = {
  doc: DocumentDoc | DocNode | null | undefined
  // Which language slot to project. Stacked / side-by-side bilingual
  // rendering is a Phase D concern; for now the host picks one.
  lang: Lang
  // Merge-field resolution context. Passed unchanged into the
  // resolver; the `lang` field on the context is overridden by the
  // `lang` prop above for consistency.
  mergeContext?: MergeContext
  // Optional class on the outer wrapper; lets the host style the
  // surface (e.g. Portal's reading column vs. PDF export).
  className?: string
}

export function DocumentRenderer({ doc, lang, mergeContext, className }: DocumentRendererProps) {
  if (!doc || typeof doc !== 'object') return null
  const root = doc as DocumentDoc
  if (root.type !== 'document' || !Array.isArray(root.content)) return null

  const ctx: MergeContext = mergeContext ? { ...mergeContext, lang } : { lang }

  return (
    <div className={`doc-renderer ${className ?? ''}`}>
      {root.content.map((section, i) => (
        <SectionRender key={(section.attrs?.id as string) ?? i} section={section} lang={lang} ctx={ctx} />
      ))}
    </div>
  )
}

function SectionRender({ section, lang, ctx }: { section: DocNode; lang: Lang; ctx: MergeContext }) {
  if (section.type !== 'section') return null
  const attrs = (section.attrs || {}) as Partial<SectionAttrs>
  const title = lang === 'en' ? attrs.titleEn : attrs.titleId
  // Mirror the editor's accent-color channel — same `--section-accent`
  // CSS custom property so the rendered surface picks up the same hue
  // as the authoring surface without duplicating per-section CSS rules.
  const style: React.CSSProperties = attrs.accentColor
    ? ({ ['--section-accent' as 'color']: attrs.accentColor } as React.CSSProperties)
    : {}
  return (
    <section
      className="doc-section"
      data-numbering={attrs.numberingStyle || 'decimal'}
      data-boxed={attrs.boxed ? 'true' : undefined}
      data-has-accent={attrs.accentColor ? 'true' : undefined}
      style={style}
    >
      {title && title.trim() && (
        <h2 className="doc-section-title">
          <span className="doc-section-number" />
          {title}
        </h2>
      )}
      <div className="doc-section-body">
        {(section.content || []).map((block, i) => (
          <BlockRender key={(block.attrs?.id as string) ?? i} block={block} lang={lang} ctx={ctx} />
        ))}
      </div>
    </section>
  )
}

function BlockRender({ block, lang, ctx }: { block: DocNode; lang: Lang; ctx: MergeContext }) {
  if (block.type !== 'bilingualBlock') return null
  const body = (block.content || []).find(b => b.type === 'blockBody' && b.attrs?.lang === lang)
  if (!body || !Array.isArray(body.content)) return null
  return (
    <div className="doc-block">
      {body.content.map((node, i) => <BlockNodeRender key={i} node={node} ctx={ctx} />)}
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
  return (
    <>
      {content.map((n, i) => <InlineNode key={i} node={n} ctx={ctx} />)}
    </>
  )
}

function InlineNode({ node, ctx }: { node: DocNode; ctx: MergeContext }) {
  if (node.type === 'hardBreak') return <br />
  if (node.type === 'mergeField') {
    const key = (node.attrs?.key as string) || ''
    if (!isMergeFieldKey(key)) return <Fragment>{`{{${key}}}`}</Fragment>
    const html = resolveMergeField(key, ctx)
    // Resolvers for signature/date fields emit raw HTML with classes
    // the PDF exporter hooks into. Inject as HTML rather than text so
    // those classes survive into the rendered DOM.
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
      el = <a href={href} className="editor-link" target="_blank" rel="noreferrer">{el}</a>
    }
    return <>{el}</>
  }
  return null
}

// Inline stylesheet so consumers (Portal, history) don't need to ship
// their own CSS. Mirrors the editor's styling enough for the read
// surface to feel like a faithful preview of what was authored. Phase
// D will swap this for layout-aware styles (stacked vs side-by-side).

export const DOCUMENT_RENDERER_STYLES = `
.doc-renderer {
  color: var(--color-text);
  font-size: 0.9375rem;
  line-height: 1.7;
  counter-reset: doc-section;
}

.doc-section {
  margin: 0 0 1.5rem;
  counter-increment: doc-section;
}

.doc-section-title {
  font-size: 1.35rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
  line-height: 1.3;
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.doc-section[data-has-accent="true"] .doc-section-title {
  color: var(--section-accent);
}

.doc-section-number { color: var(--color-text-tertiary); font-weight: 600; }
.doc-section[data-has-accent="true"] .doc-section-number { color: var(--section-accent); }
.doc-section[data-numbering="decimal"] .doc-section-number::before {
  content: counter(doc-section) ".";
}
.doc-section[data-numbering="roman"] .doc-section-number::before {
  content: counter(doc-section, upper-roman) ".";
}
.doc-section[data-numbering="alpha"] .doc-section-number::before {
  content: counter(doc-section, upper-alpha) ".";
}
.doc-section[data-numbering="none"] .doc-section-number { display: none; }

.doc-section[data-boxed="true"] {
  border: 1px solid var(--color-primary);
  border-radius: 0.75rem;
  padding: 1rem;
}

.doc-section[data-boxed="true"][data-has-accent="true"] {
  border-color: var(--section-accent);
}

.doc-section[data-boxed="true"] .doc-section-title {
  margin-bottom: 0.75rem;
}

.doc-block {
  margin: 0.75rem 0;
}

.doc-block p {
  margin: 0.4rem 0;
}

.doc-block h3 {
  font-size: 1.05rem;
  font-weight: 600;
  margin: 0.75rem 0 0.4rem;
}

.doc-block h4 {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0.6rem 0 0.3rem;
}

.doc-block ul,
.doc-block ol {
  padding-left: 1.4rem;
  margin: 0.4rem 0;
}

.doc-block li {
  margin: 0.2rem 0;
}

.doc-block code {
  background: var(--color-bg-tertiary);
  border-radius: 0.25rem;
  padding: 0.1rem 0.3rem;
  font-size: 0.85em;
  font-family: ui-monospace, monospace;
}

.doc-block pre {
  background: var(--color-bg-tertiary);
  border-radius: 0.5rem;
  padding: 0.6rem 0.8rem;
  margin: 0.5rem 0;
  overflow-x: auto;
}

.doc-block pre code {
  background: none;
  padding: 0;
}

.doc-block table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5rem 0;
  font-size: 0.875rem;
}

.doc-block th,
.doc-block td {
  border: 1px solid var(--color-border);
  padding: 0.4rem 0.6rem;
  text-align: left;
}

.doc-block th {
  background: var(--color-bg-secondary);
  font-weight: 600;
}

.doc-block a,
.doc-block .editor-link {
  color: var(--color-primary);
  text-decoration: underline;
}

.doc-block strong {
  font-weight: 600;
}

.doc-block .callout {
  border-left: 3px solid var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 6%, transparent);
  padding: 0.6rem 0.9rem;
  border-radius: 0.375rem;
  margin: 0.5rem 0;
}

.doc-block .callout[data-variant="warning"] {
  border-left-color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 6%, transparent);
}

.doc-block .callout[data-variant="success"] {
  border-left-color: var(--color-success);
  background: color-mix(in srgb, var(--color-success) 6%, transparent);
}

.doc-block .callout[data-variant="danger"] {
  border-left-color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 6%, transparent);
}
`
