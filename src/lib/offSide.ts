// Client-side off-side clear for monolingual documents (P1/P3).
//
// The bilingual schema always keeps BOTH blockBody slots (en + id). When a
// document is monolingual, the off-language side must be emptied so nothing
// stale or fabricated lingers there — otherwise the bilingual renderer
// (PDF/portal) prints a blank or out-of-date second column, and a later
// edit could repopulate it.
//
// This mirrors the server-side `clearOffSide` in
// `supabase/functions/_shared/snapshot.ts` (Deno) so the two stay byte-
// compatible. We keep a separate copy rather than importing across the
// Deno/Vite boundary — the snapshot writer can't import from `src/`, and a
// 15-line walker isn't worth a shared-package indirection. Editors that save
// via a plain `.update()` (letters, JDs, document templates) — i.e. anything
// NOT going through writeSnapshot — call this before persisting.

import { normalizeDoc, type DocumentDoc, type DocNode, type LanguageMode } from './documentDoc'

// Empties the off-language blockBody of every bilingualBlock, replacing its
// content with the schema's empty-body state (a single empty paragraph). The
// kept side is untouched. Earlier translations are NOT lost — they remain in
// prior version rows.
export function clearOffSide(doc: DocumentDoc, keepLang: 'en' | 'id'): DocumentDoc {
  const offLang = keepLang === 'en' ? 'id' : 'en'
  const walk = (node: DocNode): DocNode => {
    if (node.type === 'bilingualBlock' && Array.isArray(node.content)) {
      const content = node.content.map(child =>
        child.type === 'blockBody' && child.attrs?.lang === offLang
          ? { ...child, content: [{ type: 'paragraph' }] }
          : child,
      )
      return { ...node, content }
    }
    if (Array.isArray(node.content)) {
      return { ...node, content: node.content.map(walk) }
    }
    return node
  }
  return { ...doc, content: (doc.content || []).map(walk) } as DocumentDoc
}

// Convenience: normalize (flatten any legacy sections) + clear, gated on the
// mode. Bilingual docs pass through untouched. Use this at every plain-update
// save site so a monolingual doc is self-consistent before it's stored.
export function clearOffSideForMode(doc: DocumentDoc, mode: LanguageMode): DocumentDoc {
  if (mode === 'bilingual') return doc
  return clearOffSide(normalizeDoc(doc), mode)
}
