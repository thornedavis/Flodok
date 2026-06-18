// Thin browser wrapper around the snapshot-sop edge function.
//
// All snapshot writes (SOPEdit, ContractEdit, Pending approval) funnel through
// here so the version table is written from one place. The edge function
// handles translation, merge-field rendering, the live-row update and the
// version insert atomically — the browser just hands it the new content.

import { supabase } from './supabase'
import type { DocumentDoc } from './documentDoc'

export type SnapshotInput = {
  table: 'sops' | 'contracts' | 'ndas'
  doc_id: string
  changed_by: string
  // Structured-document path — Phase C onward. When provided, the snapshot
  // helper derives content_markdown_en/id from it via docToMarkdown and
  // skips auto-translation. Callers that have moved to the bilingual
  // editor pass this; legacy callers continue to use the flat fields below.
  new_content_doc?: DocumentDoc | Record<string, unknown> | null
  // Legacy markdown path. Pass new_content_en / new_content_id only for the
  // side(s) the user actually changed; the helper translates the missing
  // side when exactly one side changed. Ignored if new_content_doc is set.
  new_content_en?: string | null
  new_content_id?: string | null
  auto_translate?: boolean
  change_summary?: string | null
  // Contract-only structural snapshot fields. Ignored for sops.
  base_wage_idr?: number | null
  allowance_idr?: number | null
  hours_per_day?: number | null
  days_per_week?: number | null
  employee_id?: string | null
}

export type SnapshotResult = {
  version_number: number
  translation_status: 'complete' | 'failed'
  translation_error: string | null
  content_markdown: string
  content_markdown_id: string | null
  content_doc: DocumentDoc | Record<string, unknown> | null
}

export async function writeSnapshot(input: SnapshotInput): Promise<SnapshotResult> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('not authenticated')

  // Translation can take ~30s end-to-end; allow generous headroom but cap so a
  // wedged edge function eventually surfaces as an error rather than hanging.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000)
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/snapshot-sop`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      },
    )
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.error || `snapshot failed (HTTP ${response.status})`)
    }
    return await response.json() as SnapshotResult
  } finally {
    clearTimeout(timeout)
  }
}
