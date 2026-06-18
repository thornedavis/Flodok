// Shared chrome for the Google Docs–style document edit pages
// (ContractEdit, DocumentTemplateEdit, and — as they migrate — SOPEdit /
// JobDescriptionEdit).
//
// The shell owns the *frame*, not the *content*: the full-height layout,
// the two layout hooks that focus the canvas, the sticky page top bar, the
// collapsible left sidebar mechanics (+ localStorage persistence), the
// document Outline, and the editor canvas column. Each page composes its
// own pieces into the slots:
//
//   icon / title / badge / headerHint / actions  → the sticky top bar
//   sidebar                                       → the Details section's body
//   children                                      → the editor canvas (a
//                                                    <DocumentEditor> plus any
//                                                    page-specific panels)
//
// This keeps every edit page visually consistent while letting each carry
// the structured fields that only make sense for its document type.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../../contexts/LanguageContext'
import { useAutoCollapseSidebar, useFullWidthLayout } from '../Layout'
import { SectionOutline } from './SectionOutline'
import type { DocumentDoc } from '../../lib/documentDoc'

// Stacked sticky-positioning offsets. The DashboardLayout header sits at
// top-0 (h-14 = 56px); our page top bar sits below it. Anything inside the
// editor pane that wants to stick below both uses APP_HEADER + PAGE_TOP_BAR.
export const PAGE_TOP_BAR_HEIGHT = 56
export const APP_HEADER_HEIGHT = 56
export const EDITOR_STICKY_TOP_PX = APP_HEADER_HEIGHT + PAGE_TOP_BAR_HEIGHT

function readLocalBool(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  const v = window.localStorage.getItem(key)
  if (v === '1') return true
  if (v === '0') return false
  return fallback
}
function writeLocalBool(key: string, value: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, value ? '1' : '0')
}

interface DocumentEditShellProps {
  // localStorage namespace for the sidebar open/section states, e.g.
  // 'contractEdit' or 'templateEdit'. Keeps each page's preference distinct.
  storageKey: string
  // Glanceable document-type glyph shown left of the title.
  icon: ReactNode
  // Accent colour for the icon chip + the type-label eyebrow. Defaults to primary.
  accent?: string
  // Document-type eyebrow shown above the title (e.g. "SOP", "Contract").
  // Anchors the user to *what kind of thing* they're editing.
  typeLabel: string
  // Inline-editable document title. The shell renders the click-to-rename
  // affordance; the page owns the value + persistence.
  title: string
  onTitleChange: (next: string) => void
  titlePlaceholder?: string
  canEditTitle?: boolean
  // Status / template pill rendered next to the title.
  badge?: ReactNode
  // Optional hint text after the badge (e.g. "editing active bumps version").
  headerHint?: ReactNode
  // Route to return to when the user clicks Cancel (e.g. the docs
  // dashboard). When set, the shell renders a Cancel button to the left of
  // the page actions. Cancel just navigates here — leaving with unsaved
  // edits trips the page's useUnsavedChangesWarning guard, which prompts a
  // discard confirm. Omit to hide the Cancel button.
  backTo?: string
  // Whether the document has unsaved edits. Drives the exit button's label:
  // "Cancel" while dirty (leaving discards — trips the unsaved-changes guard)
  // vs. "Back to documents" once clean (a calm, safe exit after saving).
  dirty?: boolean
  // Transient post-save confirmation pill (auto-clears); hidden once dirty.
  savedFlash?: { translated: boolean } | null
  // Right-aligned action buttons (Save / Publish / Delete …).
  actions: ReactNode
  error?: string | null
  // The structured fields for this document type — rendered inside the
  // collapsible "Details" section of the sidebar.
  sidebar: ReactNode
  // Optional count badge on the Details header (shown when collapsed), e.g.
  // a missing-required-fields tally.
  detailsBadge?: ReactNode
  // Source doc for the Outline section's heading list.
  outlineDoc: DocumentDoc
  // The editor canvas — typically a <DocumentEditor>, optionally followed by
  // page-specific panels (e.g. the contract sign panel).
  children: ReactNode
}

export function DocumentEditShell({
  storageKey,
  icon,
  accent = 'var(--color-text-secondary)',
  typeLabel,
  title,
  onTitleChange,
  titlePlaceholder,
  canEditTitle = true,
  badge,
  headerHint,
  backTo,
  dirty = true,
  savedFlash,
  actions,
  error,
  sidebar,
  detailsBadge,
  outlineDoc,
  children,
}: DocumentEditShellProps) {
  const { t } = useLang()
  const navigate = useNavigate()
  // Focus-the-canvas: collapse the main nav and break out of the max-w-6xl
  // page container so the editor + sidebar get full width. Both hooks
  // auto-restore on unmount.
  useAutoCollapseSidebar()
  useFullWidthLayout()

  const placeholder = titlePlaceholder ?? t.titleEmptyPlaceholder

  const [editingTitle, setEditingTitle] = useState(false)
  const titleSnapshotRef = useRef(title)

  const sidebarKey = `flodok:${storageKey}:sidebarOpen`
  const detailsKey = `flodok:${storageKey}:detailsOpen`
  const outlineKey = `flodok:${storageKey}:outlineOpen`
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => readLocalBool(sidebarKey, true))
  const [detailsOpen, setDetailsOpen] = useState<boolean>(() => readLocalBool(detailsKey, true))
  const [outlineOpen, setOutlineOpen] = useState<boolean>(() => readLocalBool(outlineKey, true))
  useEffect(() => writeLocalBool(sidebarKey, sidebarOpen), [sidebarKey, sidebarOpen])
  useEffect(() => writeLocalBool(detailsKey, detailsOpen), [detailsKey, detailsOpen])
  useEffect(() => writeLocalBool(outlineKey, outlineOpen), [outlineKey, outlineOpen])

  function startEditingTitle() {
    if (!canEditTitle) return
    titleSnapshotRef.current = title
    setEditingTitle(true)
  }
  function commitTitle() {
    setEditingTitle(false)
  }
  function revertTitle() {
    onTitleChange(titleSnapshotRef.current)
    setEditingTitle(false)
  }

  return (
    <div className="flex flex-col" style={{ minHeight: `calc(100vh - ${APP_HEADER_HEIGHT}px)` }}>
      {/* ── Page top bar — sticky beneath the app header ────────────── */}
      <div
        className="sticky z-20 flex flex-wrap items-center justify-between gap-3 border-b px-6 md:px-8"
        style={{
          top: `${APP_HEADER_HEIGHT}px`,
          minHeight: `${PAGE_TOP_BAR_HEIGHT}px`,
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg)',
        }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
            style={{
              backgroundColor: `color-mix(in srgb, ${accent} 16%, transparent)`,
              color: accent,
            }}
          >
            {icon}
          </span>
          <div className="flex min-w-0 flex-col items-start">
            <span
              className="px-2 text-[10px] font-semibold uppercase leading-none tracking-[0.08em]"
              style={{ color: accent }}
            >
              {typeLabel}
            </span>
            {editingTitle ? (
              <input
                type="text"
                value={title}
                onChange={e => onTitleChange(e.target.value)}
                onBlur={commitTitle}
                onFocus={e => e.currentTarget.select()}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitTitle() }
                  if (e.key === 'Escape') { e.preventDefault(); revertTitle() }
                }}
                placeholder={placeholder}
                autoFocus
                className="mt-0.5 min-w-0 max-w-[40vw] rounded-md border px-2 py-0.5 text-lg font-semibold leading-tight outline-none"
                style={{
                  borderColor: 'var(--color-primary)',
                  backgroundColor: 'var(--color-bg)',
                  color: 'var(--color-text)',
                }}
              />
            ) : (
              // Inline-editable title — hover shows a subtle border + "Rename"
              // tooltip as a click affordance. Click switches to the input.
              <button
                type="button"
                onClick={startEditingTitle}
                disabled={!canEditTitle}
                title={canEditTitle ? t.renameTitle : undefined}
                className="group/title relative mt-0.5 inline-flex min-w-0 cursor-text items-center rounded-md border px-2 py-0.5 text-lg font-semibold leading-tight transition-colors disabled:cursor-not-allowed"
                style={{
                  borderColor: 'transparent',
                  color: title.trim() ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                }}
                onMouseOver={e => { if (canEditTitle) e.currentTarget.style.borderColor = 'var(--color-border)' }}
                onMouseOut={e => { e.currentTarget.style.borderColor = 'transparent' }}
              >
                <span className="truncate">{title.trim() || placeholder}</span>
                {canEditTitle && (
                  <span
                    className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-medium opacity-0 transition-opacity group-hover/title:opacity-100"
                    style={{ backgroundColor: 'var(--color-text)', color: 'var(--color-bg)' }}
                  >
                    {t.renameTitle}
                  </span>
                )}
              </button>
            )}
          </div>
          {badge}
          {headerHint && (
            <span className="hidden text-xs md:inline" style={{ color: 'var(--color-text-tertiary)' }}>
              {headerHint}
            </span>
          )}
          {savedFlash && !dirty && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-success) 16%, transparent)', color: 'var(--color-success)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {savedFlash.translated ? t.savedAndTranslated : t.savedConfirmation}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {backTo && (
            <button
              type="button"
              onClick={() => navigate(backTo)}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
              onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              {dirty ? t.cancel : t.exitToDocuments}
            </button>
          )}
          {actions}
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 rounded-md px-3 py-2 text-sm md:mx-8" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      {/* ── Two-pane area: structured-fields sidebar + editor canvas ── */}
      <div className="flex min-h-0 flex-1">
        <aside
          className={`${sidebarOpen ? 'w-80' : 'w-12'} shrink-0 overflow-y-auto border-r transition-[width]`}
          style={{
            position: 'sticky',
            top: `${EDITOR_STICKY_TOP_PX}px`,
            height: `calc(100vh - ${EDITOR_STICKY_TOP_PX}px)`,
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg-secondary, var(--color-bg))',
          }}
        >
          {!sidebarOpen ? (
            <div className="flex justify-center pt-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                title={t.sidebarShow}
                aria-label={t.sidebarShow}
                className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                style={{ color: 'var(--color-text-secondary)' }}
                onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center px-3 pt-3">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  title={t.sidebarHide}
                  aria-label={t.sidebarHide}
                  className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
                  style={{
                    color: 'var(--color-text-secondary)',
                    borderColor: 'var(--color-border)',
                    backgroundColor: 'var(--color-bg)',
                  }}
                  onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                  onMouseOut={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              </div>

              {/* ── Details section (collapsible) ── */}
              <div className="px-4 pt-3">
                <button
                  type="button"
                  onClick={() => setDetailsOpen(o => !o)}
                  aria-expanded={detailsOpen}
                  className="flex w-full items-center gap-1.5 rounded-md py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider transition-colors"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  onMouseOver={e => { e.currentTarget.style.color = 'var(--color-text-secondary)' }}
                  onMouseOut={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
                >
                  <svg
                    width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: detailsOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <span>{t.sidebarDetails}</span>
                  {detailsBadge && !detailsOpen && <span className="ml-auto">{detailsBadge}</span>}
                </button>
              </div>

              {detailsOpen && (
                <div className="mx-4 mt-2 border-t px-0 pb-2 pt-4" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="space-y-5">{sidebar}</div>
                </div>
              )}

              {/* ── Outline section (collapsible) ── */}
              <div className="px-4 pt-3">
                <button
                  type="button"
                  onClick={() => setOutlineOpen(o => !o)}
                  aria-expanded={outlineOpen}
                  className="flex w-full items-center gap-1.5 rounded-md py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider transition-colors"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  onMouseOver={e => { e.currentTarget.style.color = 'var(--color-text-secondary)' }}
                  onMouseOut={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
                >
                  <svg
                    width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: outlineOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <span>{t.documentOutlineLabel}</span>
                </button>
              </div>
              {outlineOpen && (
                <div className="mx-4 mt-2 border-t pb-5 pt-3" style={{ borderColor: 'var(--color-border)' }}>
                  <SectionOutline doc={outlineDoc} topOffsetPx={EDITOR_STICKY_TOP_PX} />
                </div>
              )}
            </>
          )}
        </aside>

        {/* Editor canvas — fills the rest of the row, edge-to-edge. */}
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  )
}
