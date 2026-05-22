// Frontend client for the rewrite-text edge function.
//
// Powers the editor selection bubble's AI actions. Stateless: send the
// highlighted text + an action, get the result back. improve/proofread
// produce a replacement for the selection; explain produces commentary
// the UI shows without touching the source.

import { supabase } from './supabase'

export type RewriteAction = 'improve' | 'proofread' | 'explain'

export async function rewriteText(text: string, action: RewriteAction): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rewrite-text`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, action }),
  })
  if (!response.ok) {
    let msg = `AI action failed (HTTP ${response.status})`
    try {
      const body = await response.json() as { error?: string }
      if (body.error) msg = body.error
    } catch { /* fall through */ }
    throw new Error(msg)
  }
  const body = await response.json() as { result?: string }
  return body.result ?? ''
}
