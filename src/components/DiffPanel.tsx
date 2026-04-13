import { useState, type ReactElement } from 'react'
import { diffLines, diffWords } from 'diff'

interface DiffPanelProps {
  oldContent: string
  newContent: string
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  content: string
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const parts = diffLines(oldText, newText)
  const lines: DiffLine[] = []

  for (const part of parts) {
    const type = part.added ? 'added' : part.removed ? 'removed' : 'unchanged'
    // Split multi-line parts into individual lines
    const partLines = part.value.replace(/\n$/, '').split('\n')
    for (const line of partLines) {
      lines.push({ type, content: line })
    }
  }

  return lines
}

/** Renders inline word-level diff for a pair of removed+added lines */
function InlineWordDiff({ oldLine, newLine }: { oldLine: string; newLine: string }) {
  const parts = diffWords(oldLine, newLine)
  return (
    <>
      {/* Removed version */}
      <div
        className="px-3 py-0.5 font-mono text-xs leading-relaxed"
        style={{ backgroundColor: 'var(--color-diff-remove)' }}
      >
        <span className="mr-2 select-none opacity-40">-</span>
        {parts.map((part, i) =>
          part.added ? null : (
            <span
              key={i}
              style={{
                textDecoration: part.removed ? 'line-through' : 'none',
                opacity: part.removed ? 0.7 : 1,
                fontWeight: part.removed ? 600 : 400,
              }}
            >
              {part.value}
            </span>
          ),
        )}
      </div>
      {/* Added version */}
      <div
        className="px-3 py-0.5 font-mono text-xs leading-relaxed"
        style={{ backgroundColor: 'var(--color-diff-add)' }}
      >
        <span className="mr-2 select-none opacity-40">+</span>
        {parts.map((part, i) =>
          part.removed ? null : (
            <span
              key={i}
              style={{
                fontWeight: part.added ? 600 : 400,
                textDecoration: part.added ? 'underline' : 'none',
                textDecorationColor: part.added ? 'var(--color-success, #22c55e)' : undefined,
              }}
            >
              {part.value}
            </span>
          ),
        )}
      </div>
    </>
  )
}

export function DiffPanel({ oldContent, newContent }: DiffPanelProps) {
  if (!oldContent && !newContent) return null
  if (oldContent === newContent) {
    return (
      <div
        className="rounded-lg border px-4 py-3 text-sm"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}
      >
        No changes detected.
      </div>
    )
  }

  const lines = computeDiff(oldContent || '', newContent || '')

  // Group consecutive removed+added lines to enable word-level diff
  const elements: ReactElement[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    if (line.type === 'unchanged') {
      // Show unchanged lines in collapsed form if there are many
      elements.push(
        <div
          key={`u-${i}`}
          className="px-3 py-0.5 font-mono text-xs leading-relaxed"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          <span className="mr-2 select-none opacity-40"> </span>
          {line.content}
        </div>,
      )
      i++
    } else if (line.type === 'removed') {
      // Check if the next line is an added line — if so, do word-level diff
      const nextLine = lines[i + 1]
      if (nextLine?.type === 'added') {
        elements.push(
          <InlineWordDiff key={`wd-${i}`} oldLine={line.content} newLine={nextLine.content} />,
        )
        i += 2
      } else {
        elements.push(
          <div
            key={`r-${i}`}
            className="px-3 py-0.5 font-mono text-xs leading-relaxed"
            style={{ backgroundColor: 'var(--color-diff-remove)', textDecoration: 'line-through', opacity: 0.8 }}
          >
            <span className="mr-2 select-none opacity-40">-</span>
            {line.content}
          </div>,
        )
        i++
      }
    } else {
      // Added line without a preceding removal
      elements.push(
        <div
          key={`a-${i}`}
          className="px-3 py-0.5 font-mono text-xs leading-relaxed"
          style={{ backgroundColor: 'var(--color-diff-add)' }}
        >
          <span className="mr-2 select-none opacity-40">+</span>
          {line.content}
        </div>,
      )
      i++
    }
  }

  // Count changes for summary
  const added = lines.filter(l => l.type === 'added').length
  const removed = lines.filter(l => l.type === 'removed').length

  const [open, setOpen] = useState(true)

  return (
    <div className="rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-2"
        style={{ backgroundColor: 'var(--color-bg-secondary)' }}
      >
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
          Changes
        </span>
        <div className="flex items-center gap-3 text-xs">
          {added > 0 && (
            <span style={{ color: 'var(--color-success, #22c55e)' }}>+{added} added</span>
          )}
          {removed > 0 && (
            <span style={{ color: 'var(--color-danger, #ef4444)' }}>-{removed} removed</span>
          )}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform"
            style={{
              color: 'var(--color-text-tertiary)',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>
      {open && (
        <div
          className="max-h-64 overflow-y-auto border-t py-1"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
        >
          {elements}
        </div>
      )}
    </div>
  )
}
