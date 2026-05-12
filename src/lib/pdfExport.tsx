// Client-side PDF export — Cloudflare Browser Rendering path.
//
// The browser renders the structured document to a complete HTML
// string (DocumentRenderer + styles + merge-field resolution all done
// here, where the React tree and the merge context live), POSTs it to
// the flodok-router `/pdf` endpoint, and downloads the returned PDF.
// The worker is a generic "HTML → PDF" service backed by Cloudflare
// Browser Rendering's headless Chromium.
//
// Configuration:
//   - VITE_FLODOK_ROUTER_URL — base URL of the flodok-router Worker
//     (e.g. https://flodok-router.<account>.workers.dev). The /pdf
//     path is appended automatically.
//   - The Worker side needs `SUPABASE_JWT_SECRET` configured via
//     `wrangler secret put` so it can validate the user's session.

import { renderToStaticMarkup } from 'react-dom/server'
import { supabase } from './supabase'
import { BilingualDocumentRenderer, BILINGUAL_DOCUMENT_RENDERER_STYLES } from '../components/editor/bilingual/BilingualDocumentRenderer'
import { MERGE_FIELD_STYLES } from '../components/editor/MergeField'
import type { DocumentDoc, ViewMode } from './documentDoc'
import type { MergeContext } from './mergeFields'

// Light-theme overrides + page chrome that ride along with every PDF.
// Mirrors the production light theme tokens so the PDF looks like what
// you'd see on screen in light mode, regardless of the user's current
// dark/light setting.
const PDF_DOCUMENT_STYLES = `
:root {
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
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: var(--color-text);
  background: #ffffff;
  font-size: 11pt;
  line-height: 1.5;
}

.pdf-page {
  max-width: 178mm;
  margin: 0 auto;
}

.pdf-title {
  font-size: 18pt;
  font-weight: 700;
  margin: 0 0 16pt;
  color: var(--color-text);
}
`

export type ExportDocumentPdfOptions = {
  doc: DocumentDoc | Record<string, unknown>
  title: string
  // Layout mode for the PDF — matches the user's editor view
  // preference so the downloaded file looks like what they were
  // looking at. Stacked = EN above ID per block; side_by_side =
  // EN and ID in two columns per block.
  view: ViewMode
  // Per-language merge contexts. Hosts that don't localize anything
  // beyond the EN side can pass the same context for both — fields
  // that have language-specific resolution (signatures, dates) will
  // still pick up the lang override the renderer applies.
  contextEn?: MergeContext
  contextId?: MergeContext
}

export async function exportDocumentPdf({ doc, title, view, contextEn, contextId }: ExportDocumentPdfOptions): Promise<void> {
  const workerUrl = import.meta.env.VITE_FLODOK_ROUTER_URL
  if (!workerUrl) {
    throw new Error('PDF export not configured — VITE_FLODOK_ROUTER_URL is missing')
  }

  // Auth: forward the user's Supabase access token. The Worker
  // verifies the HS256 signature against the project's JWT secret so
  // only authenticated users can burn Browser Rendering quota.
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  // Render the full bilingual doc to a self-contained HTML string.
  // The renderer emits both EN and ID slots per block; the layout
  // (stacked vs side-by-side) is driven by the `view` prop and
  // matches the user's editor preference for visual continuity.
  const body = renderToStaticMarkup(
    <>
      {title && <h1 className="pdf-title">{title}</h1>}
      <BilingualDocumentRenderer
        doc={doc as DocumentDoc}
        view={view}
        contextEn={contextEn}
        contextId={contextId ?? contextEn}
      />
    </>,
  )
  const html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    '<style>',
    PDF_DOCUMENT_STYLES,
    BILINGUAL_DOCUMENT_RENDERER_STYLES,
    MERGE_FIELD_STYLES,
    '</style>',
    '</head>',
    '<body><div class="pdf-page">',
    body,
    '</div></body>',
    '</html>',
  ].join('')

  const filename = `${sanitizeFilename(title)}`

  const url = workerUrl.replace(/\/+$/, '') + '/pdf'
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ html, filename }),
  })

  if (!response.ok) {
    let message = `PDF render failed (HTTP ${response.status})`
    try {
      const err = await response.json() as { error?: string }
      if (err.error) message = err.error
    } catch { /* keep generic */ }
    throw new Error(message)
  }

  // Trigger a browser download from the returned blob. No need to
  // route through a hidden anchor; just create a temporary object
  // URL and click it.
  const blob = await response.blob()
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = `${filename}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke after a short delay so the click handler doesn't race.
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
}

function sanitizeFilename(input: string): string {
  const cleaned = input.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 80)
  return cleaned || 'document'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
