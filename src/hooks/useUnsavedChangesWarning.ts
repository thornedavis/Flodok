// Warns the user before they navigate away from a page with unsaved edits.
// Covers two cases:
//   1. Browser-level navigation (close tab, refresh, type a new URL) via
//      the `beforeunload` event — the browser shows its native prompt.
//   2. In-app navigation (clicking a Link, programmatic navigate, browser
//      back) via React Router's `useBlocker` — surfaced as window.confirm
//      to match the codebase's existing confirm patterns. Requires the data
//      router (set up in App.tsx).
//
// Pass `false` to disable (e.g., right after a successful save, before the
// page navigates away on its own).
//
// Returns a `bypassNext` function. Call it right before an intentional
// navigation (e.g. inside handleSave after the DB write, before navigate())
// so the blocker doesn't prompt on a save the user asked for. The local
// `hasChanges` flag is still stale at that moment — form baseline hasn't
// caught up — so we need an imperative override rather than waiting for
// state to settle.

import { useCallback, useEffect, useRef } from 'react'
import { useBlocker, type BlockerFunction } from 'react-router-dom'

export function useUnsavedChangesWarning(hasChanges: boolean, message: string) {
  const bypassRef = useRef(false)

  // Browser-level: close tab, refresh, type new URL.
  useEffect(() => {
    if (!hasChanges) return
    function handler(e: BeforeUnloadEvent) {
      if (bypassRef.current) return
      e.preventDefault()
      // Modern browsers ignore the custom string and show their own prompt;
      // setting returnValue is still required for the prompt to appear.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasChanges])

  // useBlocker requires a stable function reference (per react-router docs);
  // passing a fresh inline arrow each render causes its internal state to
  // grow and trips React's hook-count check.
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) => {
      if (bypassRef.current) return false
      return hasChanges && currentLocation.pathname !== nextLocation.pathname
    },
    [hasChanges],
  )
  const blocker = useBlocker(shouldBlock)

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(message)) {
      blocker.proceed()
    } else {
      blocker.reset()
    }
  }, [blocker, message])

  return useCallback(() => {
    bypassRef.current = true
  }, [])
}
