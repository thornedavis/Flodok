// Toolbar button that opens the merge-field picker. Glues the picker UI to
// the editor's `insertMergeField` command.

import { useState } from 'react'
import type { Editor } from '@tiptap/core'
import { MergeFieldPicker } from './MergeFieldPicker'
import type { MergeFieldKey, Lang } from '../../lib/mergeFields'

export function MergeFieldButton({
  editor,
  scope,
  lang = 'en',
}: {
  editor: Editor
  scope: 'sop' | 'contract'
  lang?: Lang
}) {
  const [open, setOpen] = useState(false)

  function handleSelect(key: MergeFieldKey) {
    editor.chain().focus().insertMergeField(key).run()
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={lang === 'id' ? 'Sisipkan field' : 'Insert merge field'}
        className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors"
        style={{ color: 'var(--color-text-secondary)' }}
        onMouseOver={e => (e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)')}
        onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1" />
          <path d="M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1" />
        </svg>
        {lang === 'id' ? 'Field' : 'Field'}
      </button>

      <MergeFieldPicker
        open={open}
        onClose={() => setOpen(false)}
        onSelect={handleSelect}
        scope={scope}
        lang={lang}
      />
    </>
  )
}
