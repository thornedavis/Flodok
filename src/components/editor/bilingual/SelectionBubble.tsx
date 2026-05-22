// Notion-style selection bubble for the bilingual editor.
//
// Shown over a text selection (rendered inside TipTap's BubbleMenu).
// Offers: block-type conversion (Text / Heading 2-4), inline marks,
// link, the existing one-way Translate action, and AI actions
// (Improve writing / Proofread / Explain) wired to the rewrite-text
// edge function.
//
// improve/proofread REPLACE the selection with the result. explain is
// read-only — its result drops into a panel under the toolbar with the
// source left untouched (you never want "Explain" to overwrite a
// clause).

import { useCallback, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { rewriteText, type RewriteAction } from '../../../lib/rewriteText'

export function SelectionBubble({
  editor,
  onSetLink,
  onTranslate,
  translating,
}: {
  editor: Editor
  onSetLink: () => void
  onTranslate: () => void
  translating: boolean
}) {
  const [busy, setBusy] = useState<RewriteAction | null>(null)
  const [explain, setExplain] = useState<string | null>(null)
  const [error, setError] = useState('')

  const runAI = useCallback(
    async (action: RewriteAction) => {
      if (busy) return
      const { from, to } = editor.state.selection
      if (from === to) return
      const text = editor.state.doc.textBetween(from, to, '\n').trim()
      if (!text) return
      setBusy(action)
      setError('')
      try {
        const result = await rewriteText(text, action)
        if (!result) return
        if (action === 'explain') {
          setExplain(result)
        } else {
          editor.chain().focus().insertContentAt({ from, to }, result).run()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'AI action failed')
      } finally {
        setBusy(null)
      }
    },
    [editor, busy],
  )

  const blockValue = editor.isActive('heading', { level: 2 }) ? 'h2'
    : editor.isActive('heading', { level: 3 }) ? 'h3'
    : editor.isActive('heading', { level: 4 }) ? 'h4'
    : 'p'

  const setBlock = useCallback((val: string) => {
    const chain = editor.chain().focus()
    if (val === 'p') chain.setParagraph().run()
    else chain.setHeading({ level: Number(val.slice(1)) as 2 | 3 | 4 }).run()
  }, [editor])

  return (
    <div className="sel-bubble">
      <div className="sel-bubble-row">
        <select
          className="sel-bubble-select"
          value={blockValue}
          onChange={e => setBlock(e.target.value)}
          title="Block type"
        >
          <option value="p">Text</option>
          <option value="h2">Heading</option>
          <option value="h3">Subheading</option>
          <option value="h4">Small heading</option>
        </select>
        <Sep />
        <Btn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} label="B" title="Bold" bold />
        <Btn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} label="I" title="Italic" italic />
        <Btn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} label="U" title="Underline" underline />
        <Btn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} label="S" title="Strikethrough" strike />
        <Btn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} label="</>" title="Inline code" />
        <Btn active={editor.isActive('link')} onClick={onSetLink} label="🔗" title="Link" />
        <Sep />
        <button
          type="button"
          className="sel-bubble-text-btn"
          onClick={onTranslate}
          disabled={translating}
          title="Translate selection into the paired language side"
        >
          {translating ? 'Translating…' : 'Translate'}
        </button>
      </div>
      <div className="sel-bubble-row sel-bubble-ai">
        <span className="sel-bubble-ai-label">AI</span>
        <button type="button" className="sel-bubble-text-btn" disabled={!!busy} onClick={() => runAI('improve')}>
          {busy === 'improve' ? 'Improving…' : 'Improve writing'}
        </button>
        <button type="button" className="sel-bubble-text-btn" disabled={!!busy} onClick={() => runAI('proofread')}>
          {busy === 'proofread' ? 'Proofreading…' : 'Proofread'}
        </button>
        <button type="button" className="sel-bubble-text-btn" disabled={!!busy} onClick={() => runAI('explain')}>
          {busy === 'explain' ? 'Explaining…' : 'Explain'}
        </button>
      </div>
      {error && <div className="sel-bubble-error">{error}</div>}
      {explain && (
        <div className="sel-bubble-explain">
          <p>{explain}</p>
          <button type="button" className="sel-bubble-text-btn" onClick={() => setExplain(null)}>Dismiss</button>
        </div>
      )}
    </div>
  )
}

function Sep() {
  return <span className="sel-bubble-sep" />
}

function Btn({ active, onClick, label, title, bold, italic, underline, strike }: {
  active: boolean
  onClick: () => void
  label: string
  title: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
}) {
  return (
    <button
      type="button"
      className="sel-bubble-btn"
      data-active={active ? 'true' : undefined}
      onClick={onClick}
      title={title}
      style={{
        fontWeight: bold ? 700 : 600,
        fontStyle: italic ? 'italic' : undefined,
        textDecoration: underline ? 'underline' : strike ? 'line-through' : undefined,
      }}
    >
      {label}
    </button>
  )
}
