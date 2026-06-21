// CSS-in-JS styles for the bilingual editor. Inlined via a <style> tag
// inside DocumentEditor.tsx so they ship together and stay encapsulated
// to .doc-editor. The Phase D renderer will share a subset of these for
// PDF / portal output, but for now they live with the editor.

export const DOCUMENT_EDITOR_STYLES = `
.doc-editor {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.doc-editor .tiptap {
  outline: none;
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 0.9375rem;
  line-height: 1.7;
  /* Wide left/right gutters give the hover rail (drag handle + "+",
   * ~46px) a home inside the canvas. The rail is floated to the left of
   * each block by TipTap's DragHandle portal; with only the old 1.5rem
   * pad it spilled past the canvas edge over the sidebar divider. The
   * padding is part of .tiptap's painted background, so the rail now
   * lands in the margin, on-canvas. Keep this >= ~48px or the rail
   * clips again. */
  padding: 1.5rem 3.5rem;
  min-height: 400px;
}

/* ─── Placeholder ───────────────────────────────────── */

/* The Placeholder extension tags the current empty text block with
 * .is-empty + a data-placeholder attr, but renders nothing without this
 * rule. float:left + height:0 overlays the hint with zero layout impact,
 * so the caret never shifts when it appears or disappears. */
.doc-editor .tiptap .is-empty::before {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
  color: var(--color-text-tertiary);
}

/* ─── Clause numbering ──────────────────────────────── */

/* CSS counter scoped to the editor — increments on every clause-heading
 * block (a bilingualBlock carrying a numbering attr) in document
 * order, so reordering reflows the numbers without touching attrs. This
 * is the flat-schema heir to the old per-section counter; a heading
 * block is emitted for every former section, so the running count is
 * identical to the section-based output. "none" still increments (to
 * preserve the count) but shows no prefix.
 */
.doc-editor .tiptap { counter-reset: doc-clause; }
.bilingual-block-wrap[data-numbering] { counter-increment: doc-clause; }

.bilingual-block-wrap[data-numbering="decimal"] .block-body h2::before {
  content: counter(doc-clause) ". ";
  color: var(--color-text-tertiary);
  font-weight: 700;
}
.bilingual-block-wrap[data-numbering="roman"] .block-body h2::before {
  content: counter(doc-clause, upper-roman) ". ";
  color: var(--color-text-tertiary);
  font-weight: 700;
}
.bilingual-block-wrap[data-numbering="alpha"] .block-body h2::before {
  content: counter(doc-clause, upper-alpha) ". ";
  color: var(--color-text-tertiary);
  font-weight: 700;
}

/* ─── Hover gutter (drag handle + add) ──────────────── */

/* DragHandle renders this rail in a portal positioned to the left of
 * the hovered bilingualBlock. It only shows on hover (the portal is
 * removed when the cursor leaves the block area). */
/* The DragHandle portal top-aligns the rail to the block wrapper, which
 * sits above the first line of text (block padding + the EN/ID label
 * line + heading margin), so the controls float above the content. The
 * plugin positions the rail via inline top/left and never touches
 * transform, so we use translateY to drop the whole handle (rail + its
 * menu, which is anchored to this element) down onto the first line.
 * Single tunable knob — nudge if the alignment drifts. */
.block-gutter {
  position: relative;
  transform: translateY(1.9rem);
}

.block-gutter-rail {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  padding-right: 0.25rem;
  color: var(--color-text-tertiary);
}

.block-gutter-btn,
.block-gutter-grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.5rem;
  border: none;
  background: transparent;
  border-radius: 0.25rem;
  color: var(--color-text-tertiary);
  cursor: grab;
  transition: background-color 120ms ease, color 120ms ease;
}

.block-gutter-btn { cursor: pointer; }

.block-gutter-btn:hover,
.block-gutter-grip:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.block-gutter-menu {
  position: absolute;
  left: 0;
  top: 1.75rem;
  z-index: 40;
  min-width: 220px;
  padding: 0.35rem;
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated, var(--color-bg));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
}

.block-gutter-menu-label {
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
  padding: 0.25rem 0.5rem;
}

.block-gutter-menu-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.4rem 0.5rem;
  border: none;
  background: transparent;
  border-radius: 0.375rem;
  text-align: left;
  cursor: pointer;
  color: var(--color-text);
  font-size: 0.8125rem;
}

.block-gutter-menu-item:hover {
  background: var(--color-bg-tertiary);
}

.block-gutter-menu-item-hint {
  font-size: 0.7rem;
  color: var(--color-text-tertiary);
}

/* Block-actions menu (grip click): icon + label rows, with a danger
 * variant for Delete. Shares the .block-gutter-menu shell above. */
.block-gutter-menu-action {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.4rem 0.5rem;
  border: none;
  background: transparent;
  border-radius: 0.375rem;
  text-align: left;
  cursor: pointer;
  color: var(--color-text);
  font-size: 0.8125rem;
}

.block-gutter-menu-action:hover { background: var(--color-bg-tertiary); }
.block-gutter-menu-action svg { flex: none; color: var(--color-text-tertiary); }
.block-gutter-menu-action.is-danger { color: var(--color-danger); }
.block-gutter-menu-action.is-danger svg { color: var(--color-danger); }
.block-gutter-menu-action.is-danger:hover {
  background: color-mix(in srgb, var(--color-danger) 10%, transparent);
}

.block-gutter-menu-sep {
  height: 1px;
  margin: 0.3rem 0.15rem;
  background: var(--color-border);
}

/* ─── Trailing add-block affordance ─────────────────── */

.doc-editor-add-trailing {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  margin: 0;
  /* Match .tiptap's horizontal padding so the trailing affordance lines
   * up with the block column above it. */
  padding: 0.6rem 3.5rem;
  border: none;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 0.8125rem;
  cursor: text;
  transition: color 120ms ease;
}

.doc-editor-add-trailing:hover { color: var(--color-text-secondary); }
.doc-editor-add-trailing span { font-size: 1rem; line-height: 1; }

/* ─── Bilingual block ───────────────────────────────── */
/*
 * Side-by-side layout is the editor default — translators authoring a
 * doc benefit from seeing both languages aligned per block. Stacked
 * layout is just a class swap; Phase D adds the per-user toggle that
 * flips the modifier on .doc-editor.
 */

/* Grid lives on the outer NodeViewWrapper (.bilingual-block-wrap) so
 * we control the layout root directly. Everything between that and
 * the .block-body cells (the NodeViewContent itself, plus any
 * wrapper TipTap injects inside it for content reconciliation) uses
 * display:contents so its children participate in the wrap's grid.
 * Without this, the inserted wrapper becomes a single grid cell
 * containing both blockBody divs, collapsing side-by-side to a
 * stack. The review banner sits in the wrap as the first grid item
 * and spans both columns via grid-column 1/-1. */
.bilingual-block-wrap {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin: 0.75rem 0;
  border-left: 2px solid transparent;
  padding-left: 0.5rem;
  transition: border-color 120ms ease;
}

.doc-editor.is-stacked .bilingual-block-wrap {
  grid-template-columns: 1fr;
}

/* ─── Monolingual mode (P1) ───────────────────────────────
 * One full-width column; the off-language blockBody is hidden, and the
 * EN/ID hover badge is suppressed (there's only one language on screen). */
.doc-editor.is-monolingual .bilingual-block-wrap {
  grid-template-columns: 1fr;
}
.doc-editor.is-monolingual-en .bilingual-block-wrap .block-body[data-lang="id"],
.doc-editor.is-monolingual-id .bilingual-block-wrap .block-body[data-lang="en"] {
  display: none;
}
.doc-editor.is-monolingual .block-body[data-lang="en"]::before,
.doc-editor.is-monolingual .block-body[data-lang="id"]::before {
  display: none;
}

.bilingual-block-wrap[data-needs-review="true"] {
  border-left-color: var(--color-warning);
}

/* Selected block (gutter grip click, or keyboard NodeSelection).
 * ProseMirror tags the NodeView wrapper with .ProseMirror-selectednode.
 * Outline rather than border so selection never shifts layout, and a
 * faint fill to read as "this whole pair is selected". */
.bilingual-block-wrap.ProseMirror-selectednode {
  outline: 2px solid color-mix(in srgb, var(--color-primary) 50%, transparent);
  outline-offset: 4px;
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--color-primary) 4%, transparent);
}

/* The NodeViewContent and any TipTap-internal wrapper become layout
 * pass-throughs so the blockBody children land directly in the
 * wrap's grid. Excluding .block-body itself keeps the cells
 * rendering as normal flow containers for their own content. */
.bilingual-block,
.bilingual-block > *:not(.block-body) {
  display: contents;
}

.bilingual-block-review-banner {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  margin: 0 0 0.25rem;
  border: 1px solid var(--color-warning);
  border-radius: 0.375rem;
  background: color-mix(in srgb, var(--color-warning) 8%, transparent);
  font-size: 0.8125rem;
}

.bilingual-block-review-message {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-warning);
  font-weight: 500;
}

.bilingual-block-review-resolve {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--color-warning);
  border-radius: 0.25rem;
  background: transparent;
  color: var(--color-warning);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 120ms ease;
}

.bilingual-block-review-resolve:hover {
  background: color-mix(in srgb, var(--color-warning) 15%, transparent);
}

/* Borderless, Notion-style cells — no outline, no hover box. A faint
 * focus background is the only chrome, so the writing surface stays
 * clean and minimal. */
.block-body {
  min-height: 1.75rem;
  padding: 0.15rem 0.25rem;
  border-radius: 0.375rem;
  transition: background-color 120ms ease;
}

.block-body:focus-within {
  background: color-mix(in srgb, var(--color-primary) 4%, transparent);
}

/* EN/ID tag is hidden until the block is hovered or focused — keeps the
 * page uncluttered while still letting authors confirm which side they
 * are editing. */
.block-body[data-lang="en"]::before,
.block-body[data-lang="id"]::before {
  content: attr(data-lang);
  display: inline-block;
  text-transform: uppercase;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--color-text-tertiary);
  margin-bottom: 0.2rem;
  opacity: 0;
  transition: opacity 120ms ease;
  pointer-events: none;
}

.bilingual-block-wrap:hover .block-body::before,
.block-body:focus-within::before {
  opacity: 1;
}

/* ─── Standard block content inside a body slot ─────── */

.block-body p {
  margin: 0.4rem 0;
}

.block-body h2 {
  font-size: 1.2rem;
  font-weight: 700;
  margin: 0.25rem 0 0.5rem;
  line-height: 1.3;
}

.block-body h3 {
  font-size: 1.05rem;
  font-weight: 600;
  margin: 0.75rem 0 0.4rem;
  line-height: 1.35;
}

.block-body h4 {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0.6rem 0 0.3rem;
  line-height: 1.35;
}

.block-body ul,
.block-body ol {
  padding-left: 1.4rem;
  margin: 0.4rem 0;
}

.block-body li {
  margin: 0.2rem 0;
}

.block-body code {
  background: var(--color-bg-tertiary);
  border-radius: 0.25rem;
  padding: 0.1rem 0.3rem;
  font-size: 0.85em;
  font-family: ui-monospace, monospace;
}

.block-body pre {
  background: var(--color-bg-tertiary);
  border-radius: 0.5rem;
  padding: 0.6rem 0.8rem;
  margin: 0.5rem 0;
  overflow-x: auto;
}

.block-body pre code {
  background: none;
  padding: 0;
}

.block-body table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5rem 0;
  font-size: 0.875rem;
}

.block-body th,
.block-body td {
  border: 1px solid var(--color-border);
  padding: 0.4rem 0.6rem;
  text-align: left;
}

.block-body th {
  background: var(--color-bg-secondary);
  font-weight: 600;
}

.block-body a {
  color: var(--color-primary);
  text-decoration: underline;
  cursor: pointer;
}

.block-body strong {
  font-weight: 600;
}

/* ─── Callout ────────────────────────────────────────── */

.callout {
  border-left: 3px solid var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 6%, transparent);
  padding: 0.6rem 0.9rem;
  border-radius: 0.375rem;
  margin: 0.5rem 0;
}

.callout[data-variant="warning"] {
  border-left-color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 6%, transparent);
}

.callout[data-variant="success"] {
  border-left-color: var(--color-success);
  background: color-mix(in srgb, var(--color-success) 6%, transparent);
}

.callout[data-variant="danger"] {
  border-left-color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 6%, transparent);
}

.callout p {
  margin: 0.25rem 0;
}

/* ─── Selection bubble ──────────────────────────────── */

.sel-bubble {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-width: 360px;
  padding: 0.3rem;
  border-radius: 0.625rem;
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated, var(--color-bg));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.sel-bubble-row {
  display: flex;
  align-items: center;
  gap: 0.15rem;
}

.sel-bubble-sep {
  width: 1px;
  height: 1.25rem;
  margin: 0 0.2rem;
  background: var(--color-border);
}

.sel-bubble-select {
  height: 1.75rem;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
  outline: none;
  cursor: pointer;
  border-radius: 0.375rem;
}

.sel-bubble-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.75rem;
  height: 1.75rem;
  padding: 0 0.35rem;
  border: none;
  background: transparent;
  border-radius: 0.375rem;
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}

.sel-bubble-btn:hover { background: var(--color-bg-tertiary); }
.sel-bubble-btn[data-active="true"] {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.sel-bubble-text-btn {
  display: inline-flex;
  align-items: center;
  height: 1.75rem;
  padding: 0 0.5rem;
  border: none;
  background: transparent;
  border-radius: 0.375rem;
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 120ms ease;
}

.sel-bubble-text-btn:hover { background: var(--color-bg-tertiary); }
.sel-bubble-text-btn:disabled { opacity: 0.5; cursor: default; }

.sel-bubble-ai {
  border-top: 1px solid var(--color-border);
  padding-top: 0.25rem;
}

.sel-bubble-ai-label {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--color-text-tertiary);
  padding: 0 0.35rem;
}

.sel-bubble-error {
  font-size: 0.72rem;
  color: var(--color-danger);
  padding: 0.1rem 0.35rem;
}

.sel-bubble-explain {
  border-top: 1px solid var(--color-border);
  padding: 0.4rem 0.35rem 0.2rem;
  font-size: 0.78rem;
  color: var(--color-text);
}

.sel-bubble-explain p { margin: 0 0 0.35rem; line-height: 1.5; }
`
