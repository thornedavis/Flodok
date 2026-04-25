// Searchable modal picker for merge fields. Used by the editor toolbar
// button (and later, the {{ keyboard trigger). Owns its own search and
// keyboard navigation; emits a key string via onSelect.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '../Modal'
import { fieldsForScope, type MergeFieldKey, type Lang } from '../../lib/mergeFields'

export function MergeFieldPicker({
  open,
  onClose,
  onSelect,
  scope,
  lang = 'en',
}: {
  open: boolean
  onClose: () => void
  onSelect: (key: MergeFieldKey) => void
  scope: 'sop' | 'contract'
  lang?: Lang
}) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const allFields = useMemo(() => fieldsForScope(scope), [scope])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allFields
    return allFields.filter(f => {
      const label = f.label[lang].toLowerCase()
      const desc = f.description[lang].toLowerCase()
      return label.includes(q) || desc.includes(q) || f.key.includes(q)
    })
  }, [allFields, query, lang])

  // Reset state on open and focus the search input.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    // microtask delay so the input exists when we focus
    queueMicrotask(() => inputRef.current?.focus())
  }, [open])

  // Clamp active index whenever the filtered list shrinks under it.
  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(Math.max(0, filtered.length - 1))
  }, [filtered.length, activeIndex])

  // Scroll the active item into view as the user navigates.
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const f = filtered[activeIndex]
      if (f) onSelect(f.key)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={lang === 'id' ? 'Sisipkan field' : 'Insert merge field'}>
      <div className="space-y-3">
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={lang === 'id' ? 'Cari field…' : 'Search fields…'}
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg)',
            color: 'var(--color-text)',
          }}
        />

        <div
          ref={listRef}
          className="max-h-72 overflow-y-auto rounded-lg border"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
              {lang === 'id' ? 'Tidak ada field yang cocok' : 'No fields match'}
            </div>
          ) : (
            filtered.map((f, i) => (
              <button
                key={f.key}
                type="button"
                data-index={i}
                onClick={() => onSelect(f.key)}
                onMouseEnter={() => setActiveIndex(i)}
                className="flex w-full flex-col gap-0.5 border-b px-3 py-2 text-left text-sm last:border-b-0"
                style={{
                  backgroundColor: i === activeIndex ? 'var(--color-bg-tertiary)' : 'transparent',
                  borderColor: 'var(--color-border)',
                }}
              >
                <span style={{ color: 'var(--color-text)' }}>{f.label[lang]}</span>
                <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  {f.description[lang]} · <code style={{ fontFamily: 'ui-monospace, monospace' }}>{`{{${f.key}}}`}</code>
                </span>
              </button>
            ))
          )}
        </div>

        <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          {lang === 'id'
            ? '↑↓ untuk navigasi, Enter untuk pilih, Esc untuk batal'
            : '↑↓ to navigate, Enter to select, Esc to cancel'}
        </p>
      </div>
    </Modal>
  )
}
