// Transient "saved" confirmation for the document editors.
//
// Saving keeps the user on the page (saving is decoupled from navigation), so
// there's no route change to signal success. After a successful save the editor
// calls `show(translated)`; the flag drives whether the confirmation reads
// "Saved" or "Saved & translated" (only SOP / Contract re-translate on save).
//
// It auto-clears after `ms` so it reads as a confirmation rather than a
// permanent status, and DocumentEditShell additionally hides it the moment the
// document goes dirty again.

import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveFlashState = { translated: boolean } | null

export function useSaveFlash(ms = 3500) {
  const [flash, setFlash] = useState<SaveFlashState>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const show = useCallback((translated: boolean) => {
    setFlash({ translated })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setFlash(null), ms)
  }, [ms])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return { flash, show }
}
