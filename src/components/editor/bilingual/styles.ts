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
  padding: 1.5rem;
  min-height: 400px;
}

/* ─── Section ───────────────────────────────────────── */

/* CSS counter scoped to the editor — sections increment as they render
 * in the doc, so reordering reflows the numbers without touching attrs.
 */
.doc-editor .tiptap { counter-reset: bilingual-section; }
.bilingual-section { counter-increment: bilingual-section; }

.bilingual-section {
  margin: 0 0 1.5rem;
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
}

.bilingual-section[data-boxed="true"] {
  border-color: var(--color-primary);
}

.bilingual-section[data-has-accent="true"] {
  border-color: var(--section-accent);
}

.bilingual-section-meta {
  display: flex;
  align-items: center;
  padding: 0.5rem 1rem 0;
  gap: 0.5rem;
}

.bilingual-section-meta-spacer { flex: 1; }

.bilingual-section-number-badge {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--color-text-tertiary);
  user-select: none;
}

.bilingual-section[data-has-accent="true"] .bilingual-section-number-badge {
  color: var(--section-accent);
}

.bilingual-section[data-numbering="decimal"] .bilingual-section-number-badge::before {
  content: counter(bilingual-section) ".";
}
.bilingual-section[data-numbering="roman"] .bilingual-section-number-badge::before {
  content: counter(bilingual-section, upper-roman) ".";
}
.bilingual-section[data-numbering="alpha"] .bilingual-section-number-badge::before {
  content: counter(bilingual-section, upper-alpha) ".";
}
.bilingual-section[data-numbering="none"] .bilingual-section-number-badge { display: none; }

/* ─── Section settings popover ──────────────────────── */

.bilingual-section-settings {
  position: relative;
}

.bilingual-section-settings-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.375rem;
  border: none;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}

.bilingual-section-settings-trigger:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.bilingual-section-settings-popover {
  position: absolute;
  right: 0;
  top: 110%;
  z-index: 20;
  min-width: 240px;
  padding: 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated, var(--color-bg));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.bilingual-section-settings-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  justify-content: space-between;
}

.bilingual-section-settings-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.bilingual-section-accents {
  display: flex;
  gap: 0.25rem;
}

.bilingual-section-accent-swatch {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  border: 1px solid var(--color-border);
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.bilingual-section-accent-swatch[data-active="true"] {
  outline: 2px solid var(--color-text);
  outline-offset: 1px;
}

.bilingual-section-accent-none {
  font-size: 0.6rem;
  color: var(--color-text-tertiary);
}

.bilingual-section-settings-select {
  height: 1.75rem;
  padding: 0 0.4rem;
  border: 1px solid var(--color-border);
  border-radius: 0.25rem;
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 0.75rem;
}

.bilingual-section-settings-switch {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.bilingual-section-settings-switch input { cursor: pointer; }

/* ─── Section header (title row) ───────────────────── */

.bilingual-section-header {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  padding: 0.25rem 1rem 0.75rem;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.bilingual-section[data-has-accent="true"] .bilingual-section-header {
  background: color-mix(in srgb, var(--section-accent) 10%, var(--color-bg-secondary));
  border-bottom-color: var(--section-accent);
}

.bilingual-section-title {
  background: transparent;
  border: none;
  outline: none;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
  padding: 0.25rem 0;
  width: 100%;
}

.bilingual-section-title::placeholder {
  color: var(--color-text-tertiary);
  font-weight: 500;
}

.bilingual-section-body {
  padding: 1rem;
}

/* ─── Bilingual block ───────────────────────────────── */
/*
 * Side-by-side layout is the editor default — translators authoring a
 * doc benefit from seeing both languages aligned per block. Stacked
 * layout is just a class swap; Phase D adds the per-user toggle that
 * flips the modifier on .doc-editor.
 */

.bilingual-block {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin: 0.75rem 0;
  border-left: 2px solid transparent;
  padding-left: 0.5rem;
  transition: border-color 120ms ease;
}

.doc-editor.is-stacked .bilingual-block {
  grid-template-columns: 1fr;
}

.bilingual-block[data-needs-review="true"] {
  border-left-color: var(--color-warning);
}

.block-body {
  min-height: 2.25rem;
  padding: 0.5rem 0.75rem;
  border: 1px dashed transparent;
  border-radius: 0.375rem;
  transition: border-color 120ms ease, background-color 120ms ease;
}

.block-body:hover {
  border-color: var(--color-border);
}

.block-body:focus-within {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 4%, transparent);
}

.block-body[data-lang="en"]::before,
.block-body[data-lang="id"]::before {
  content: attr(data-lang);
  display: inline-block;
  text-transform: uppercase;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--color-text-tertiary);
  margin-bottom: 0.25rem;
  pointer-events: none;
}

/* ─── Standard block content inside a body slot ─────── */

.block-body p {
  margin: 0.4rem 0;
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
`
