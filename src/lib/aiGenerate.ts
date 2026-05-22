// Frontend client for the generate-document edge function (Phase G.3).
//
// Asks the server to produce a bilingual `DocumentDoc` from a free-text
// prompt. The server handles the OpenRouter call and the JSON-to-doc
// conversion, so the client just shuttles the request and unwraps the
// result. Errors come back as thrown Error so callers can surface them.

import { supabase } from './supabase'
import type { DocumentDoc } from './documentDoc'

export type GenerateDocumentInput = {
  prompt: string
  docType: 'sop' | 'contract' | 'job_description'
  title?: string
}

export async function generateDocument({ prompt, docType, title }: GenerateDocumentInput): Promise<DocumentDoc> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-document`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, doc_type: docType, title: title ?? null }),
  })
  if (!response.ok) {
    let msg = `Generation failed (HTTP ${response.status})`
    try {
      const body = await response.json() as { error?: string }
      if (body.error) msg = body.error
    } catch { /* fall through */ }
    throw new Error(msg)
  }
  const body = await response.json() as { doc?: DocumentDoc; error?: string }
  if (!body.doc) throw new Error(body.error || 'Empty generation response')
  return body.doc
}
