// Shared "paper" styling for the print-faithful Page view.
//
// An on-screen A4 sheet with real margins, a page shadow, and a FORCED light
// theme — the CSS variables are overridden WITHIN `.doc-paper` only, so the
// sheet stays light even in dark mode while the surrounding app keeps its
// theme. The token values mirror the light theme used by the PDF export
// (pdfExport.tsx PDF_DOCUMENT_STYLES) so Page view previews what the PDF prints.
//
// Used by the editor read-preview toggle (DocumentEditor) and the employee
// portal document view.

export const PAGE_VIEW_STYLES = `
.doc-paper-scroll { overflow-x: auto; padding: 0.5rem 0 2rem; }
.doc-paper {
  --color-text: #111827;
  --color-text-secondary: #4b5563;
  --color-text-tertiary: #6b7280;
  --color-bg: #ffffff;
  --color-bg-secondary: #f9fafb;
  --color-bg-tertiary: #f3f4f6;
  --color-bg-elevated: #ffffff;
  --color-border: #e5e7eb;
  --color-border-strong: #d1d5db;
  --color-primary: #2563eb;
  --color-success: #059669;
  --color-warning: #d97706;
  --color-danger: #dc2626;
  box-sizing: border-box;
  width: 210mm;
  max-width: 100%;
  margin: 1.5rem auto;
  padding: 20mm 16mm;
  background: #ffffff;
  color: var(--color-text);
  box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 10px 30px rgba(0,0,0,0.08);
  border-radius: 2px;
}
@media (max-width: 820px) {
  .doc-paper { width: 100%; padding: 12mm 10mm; margin: 1rem auto; }
}
`
