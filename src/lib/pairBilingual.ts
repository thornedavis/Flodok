// P4 client for the pair-bilingual edge function (opt-in dual-language import).
//
// When an imported .docx contains BOTH English and Indonesian (a single file
// holding both languages, the less-common case), the deterministic importer
// can't know which block is which language or which blocks are translations of
// each other. This asks a cheap text model (gemini-2.5-flash-lite) to label and
// pair the blocks so we can assemble a true bilingual document instead of a
// monolingual one. The server owns the OpenRouter call; the client just sends
// the block texts and gets back an ordered list of pairs.
//
// This is opt-in (a checkbox in the import modal) — the default monolingual
// path stays deterministic and offline.

import { supabase } from './supabase'

// One bilingual row: the index of the English block and of its Indonesian
// translation in the input array. Either side may be null (an unpaired block —
// a shared heading, a dateline, a signature line).
export type BilingualPair = { en: number | null; id: number | null }

export async function pairBilingualBlocks(blocks: string[]): Promise<BilingualPair[]> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pair-bilingual`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ blocks }),
  })
  if (!response.ok) {
    let msg = `Language pairing failed (HTTP ${response.status})`
    try {
      const errBody = await response.json() as { error?: string }
      if (errBody.error) msg = errBody.error
    } catch { /* fall through */ }
    throw new Error(msg)
  }
  const result = await response.json() as { pairs?: BilingualPair[]; error?: string }
  if (!Array.isArray(result.pairs)) throw new Error(result.error || 'Empty pairing response')
  return result.pairs
}
