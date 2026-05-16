// React NodeView for the `section` node.
//
// Renders a header strip with two editable title inputs (EN / ID) and
// a settings affordance (gear icon → popover) that exposes the
// section's style attrs: accent color, numbering style, boxed mode.
// All three attrs are stored on the section node itself; CSS reads
// `data-numbering` and `data-boxed`, and `style.--section-accent` for
// the accent color so the same authoring UI works for the editor and
// the read-side renderer.
//
// Numbering is purely a render concern (CSS counters); reordering
// sections updates the displayed numbers automatically without any
// attr changes.

import { useEffect, useRef, useState } from 'react'
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import type { SectionAttrs } from '../../../lib/documentDoc'

type NumberingStyle = NonNullable<SectionAttrs['numberingStyle']>

const NUMBERING_OPTIONS: { value: NumberingStyle; label: string }[] = [
  { value: 'decimal', label: '1. 2. 3.' },
  { value: 'roman', label: 'I. II. III.' },
  { value: 'alpha', label: 'A. B. C.' },
  { value: 'none', label: 'No number' },
]

// A small fixed palette — keeps the choice simple and predictable.
// The 'null' value clears the accent (no colored band).
const ACCENT_PRESETS: { value: string | null; label: string; swatch: string }[] = [
  { value: null, label: 'None', swatch: 'transparent' },
  { value: '#3b82f6', label: 'Blue', swatch: '#3b82f6' },
  { value: '#10b981', label: 'Green', swatch: '#10b981' },
  { value: '#f59e0b', label: 'Amber', swatch: '#f59e0b' },
  { value: '#ef4444', label: 'Red', swatch: '#ef4444' },
  { value: '#8b5cf6', label: 'Purple', swatch: '#8b5cf6' },
]

export function SectionView({ node, updateAttributes }: NodeViewProps) {
  const attrs = node.attrs as SectionAttrs
  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Inline style channel for the accent color — keeps CSS simple by
  // letting rule selectors read `var(--section-accent)` instead of
  // generating per-section rule blocks.
  const wrapperStyle: React.CSSProperties = attrs.accentColor
    ? ({ ['--section-accent' as 'color']: attrs.accentColor } as React.CSSProperties)
    : {}

  return (
    <NodeViewWrapper
      className="bilingual-section"
      data-id={attrs.id}
      data-numbering={attrs.numberingStyle || 'decimal'}
      data-boxed={attrs.boxed ? 'true' : undefined}
      data-has-accent={attrs.accentColor ? 'true' : undefined}
      style={wrapperStyle}
    >
      <div className="bilingual-section-meta">
        <span className="bilingual-section-number-badge" contentEditable={false} />
        <span className="bilingual-section-meta-spacer" />
        <div className="bilingual-section-settings" contentEditable={false}>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="bilingual-section-settings-trigger"
            title="Section settings"
            aria-haspopup="dialog"
            aria-expanded={open}
          >
            <GearIcon />
          </button>
          {open && (
            <div ref={popoverRef} className="bilingual-section-settings-popover" role="dialog">
              <div className="bilingual-section-settings-row">
                <span className="bilingual-section-settings-label">Accent</span>
                <div className="bilingual-section-accents">
                  {ACCENT_PRESETS.map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => updateAttributes({ accentColor: p.value })}
                      title={p.label}
                      className="bilingual-section-accent-swatch"
                      data-active={(attrs.accentColor ?? null) === p.value ? 'true' : undefined}
                      style={{ background: p.swatch }}
                    >
                      {p.value === null && <span className="bilingual-section-accent-none">∅</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bilingual-section-settings-row">
                <span className="bilingual-section-settings-label">Numbering</span>
                <select
                  value={attrs.numberingStyle || 'decimal'}
                  onChange={e => updateAttributes({ numberingStyle: e.target.value as NumberingStyle })}
                  className="bilingual-section-settings-select"
                >
                  {NUMBERING_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="bilingual-section-settings-row">
                <span className="bilingual-section-settings-label">Boxed</span>
                <label className="bilingual-section-settings-switch">
                  <input
                    type="checkbox"
                    checked={!!attrs.boxed}
                    onChange={e => updateAttributes({ boxed: e.target.checked })}
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="bilingual-section-header">
        <input
          type="text"
          value={attrs.titleEn || ''}
          placeholder="Section title (EN)"
          onChange={e => updateAttributes({ titleEn: e.target.value })}
          className="bilingual-section-title"
          data-lang="en"
        />
        <input
          type="text"
          value={attrs.titleId || ''}
          placeholder="Judul bagian (ID)"
          onChange={e => updateAttributes({ titleId: e.target.value })}
          className="bilingual-section-title"
          data-lang="id"
        />
      </div>
      <NodeViewContent className="bilingual-section-body" />
    </NodeViewWrapper>
  )
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
