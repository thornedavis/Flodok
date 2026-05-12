// Per-user, per-document view-mode preference.
//
// Backed by the `document_view_prefs` table (Phase A migration). When
// no row exists for a given (user, document_type, document_id) tuple,
// returns the default `stacked` mode. Writes upsert through Supabase
// so a flipped toggle survives reloads, browser changes, and logouts.
//
// Used by SOPEdit / ContractEdit to drive the `view` prop on
// `DocumentEditor`, and by Portal in the future for the read view's
// stacked-vs-side-by-side toggle on desktop.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DEFAULT_VIEW_MODE, type ViewMode } from '../lib/documentDoc'
import type { DocumentType } from '../lib/documentTypes'

type State = {
  view: ViewMode
  loaded: boolean
}

export function useDocumentViewPref(documentType: DocumentType, documentId: string | null | undefined) {
  const [state, setState] = useState<State>({ view: DEFAULT_VIEW_MODE, loaded: false })

  useEffect(() => {
    if (!documentId) {
      setState({ view: DEFAULT_VIEW_MODE, loaded: true })
      return
    }
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('document_view_prefs')
        .select('view_mode')
        .eq('document_type', documentType)
        .eq('document_id', documentId!)
        .maybeSingle()
      if (cancelled) return
      const view: ViewMode = data?.view_mode === 'side_by_side' ? 'side_by_side' : DEFAULT_VIEW_MODE
      setState({ view, loaded: true })
    }
    load()
    return () => { cancelled = true }
  }, [documentType, documentId])

  async function setView(next: ViewMode) {
    setState(s => ({ ...s, view: next }))
    if (!documentId) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await supabase
      .from('document_view_prefs')
      .upsert(
        {
          user_id: session.user.id,
          document_type: documentType,
          document_id: documentId,
          view_mode: next,
        },
        { onConflict: 'user_id,document_type,document_id' },
      )
  }

  return { view: state.view, setView, loaded: state.loaded }
}
