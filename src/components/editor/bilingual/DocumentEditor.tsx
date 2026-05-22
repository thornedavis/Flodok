// Bilingual document editor — Phase C.1 scaffold.
//
// What this component owns:
//   - TipTap editor instance wired to the custom document/section/
//     bilingualBlock/blockBody/callout nodes from `./nodes`.
//   - The editor canvas (side-by-side or stacked layout via `view`).
//   - The fixed toolbar above the canvas.
//   - "Add block" and "Add section" insertion commands.
//
// What this component does NOT own (yet):
//   - Persistence — emits doc JSON via `onChange`; saving lives in
//     SOPEdit / ContractEdit (Phase C.2).
//   - Per-user view-mode preference — receives `view` as a prop;
//     persistence ships in Phase D.
//   - Per-block dirty tracking / translation cache — Phase E.
//   - Selection-translate bubble menu — Phase F.

import { useEditor, EditorContent, ReactNodeViewRenderer } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { StarterKit } from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Link } from '@tiptap/extension-link'
import { Underline } from '@tiptap/extension-underline'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import { useCallback, useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import {
  DocumentNode,
  SectionNode,
  BilingualBlockNode,
  BlockBodyNode,
  CalloutNode,
  emptyBlock,
  emptySection,
} from './nodes'
import { SectionView } from './SectionView'
import { BilingualBlockView } from './BilingualBlockView'
import { BilingualMergeFieldExtension } from './BilingualMergeField'
import { MergeFieldButton } from '../MergeFieldButton'
import { MERGE_FIELD_STYLES } from '../MergeField'
import { DOCUMENT_EDITOR_STYLES } from './styles'
import { supabase } from '../../../lib/supabase'
import { generateDocument } from '../../../lib/aiGenerate'
import type { DocumentDoc } from '../../../lib/documentDoc'
import type { MergeContext } from '../../../lib/mergeFields'

export type DocumentEditorView = 'side_by_side' | 'stacked'

// Optional merge-fields integration. When provided, the editor enables
// the bilingual MergeField pill node and exposes the picker button in
// the toolbar. The pill resolves its displayed value via getContext()
// — but uses the parent blockBody's `lang` attr, not ctx.lang, so the
// same pill shows "Rp 5,000,000" on the EN side and the localized
// numeral on the ID side without the host having to render two editors.
export type DocumentEditorMergeFields = {
  scope: 'sop' | 'contract'
  getContext: () => MergeContext
}

interface DocumentEditorProps {
  // Initial document. Pass the result of `buildEmptyDoc()` for a new
  // doc, or the saved `content_doc` JSON for an existing one.
  initialDoc: DocumentDoc | Record<string, unknown>
  // Fires on every keystroke with the latest ProseMirror JSON. Callers
  // should debounce before persisting.
  onChange?: (doc: DocumentDoc) => void
  // Layout mode for the editor canvas. Defaults to stacked (matches
  // the documented per-user preference default). When `onViewChange`
  // is also provided, the toolbar renders a toggle that flips between
  // stacked and side-by-side and notifies the host so it can persist
  // the choice (see `useDocumentViewPref`).
  view?: DocumentEditorView
  onViewChange?: (next: DocumentEditorView) => void
  // Merge-fields integration. Omit for the sandbox / when not wiring
  // to a real document.
  mergeFields?: DocumentEditorMergeFields
  // AI Generate integration (Phase G.3). When provided, the toolbar
  // renders an "AI Generate" button that opens a prompt modal and
  // replaces the editor's content with the generated structured doc.
  // Omit to hide the button (e.g. on read-only surfaces).
  aiGenerate?: {
    docType: 'sop' | 'contract' | 'job_description'
    title?: string
  }
  // When true the toolbar pins to the top of the nearest scroll container.
  // Used by the full-height edit-page layouts (ContractEdit) so the toolbar
  // stays visible as the user scrolls through a long contract body.
  // `stickyToolbarOffset` is the CSS `top` value (e.g. "0", "56px") —
  // useful when there's a page header above the editor.
  stickyToolbar?: boolean
  stickyToolbarOffset?: string
}

export function DocumentEditor({
  initialDoc,
  onChange,
  view = 'stacked',
  onViewChange,
  mergeFields,
  aiGenerate,
  stickyToolbar = false,
  stickyToolbarOffset = '0px',
}: DocumentEditorProps) {
  // Bind React NodeViews at editor-creation time rather than baking
  // JSX into nodes.ts — keeps the schema file framework-agnostic.
  const SectionWithView = SectionNode.extend({
    addNodeView() {
      return ReactNodeViewRenderer(SectionView)
    },
  })
  const BilingualBlockWithView = BilingualBlockNode.extend({
    addNodeView() {
      return ReactNodeViewRenderer(BilingualBlockView)
    },
  })

  // State for the per-selection translate action. Tracks the in-flight
  // request so we can show a spinner on the BubbleMenu button.
  const [translating, setTranslating] = useState(false)

  // AI Generate modal state. `generateOpen` toggles the prompt dialog;
  // `generating` blocks the submit button while the model request is
  // in flight. The dialog is only mounted when `aiGenerate` is set.
  const [generateOpen, setGenerateOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Replace StarterKit's default top node with our `document`.
        document: false,
        // Block content schema constraints: no h1/h2 (those are
        // sections), no blockquote, no horizontal rule. Anything not
        // in our allowed set is disabled here so paste/parse can't
        // sneak it in.
        heading: { levels: [3, 4] },
        blockquote: false,
        horizontalRule: false,
      }),
      DocumentNode,
      SectionWithView,
      BilingualBlockWithView,
      BlockBodyNode,
      CalloutNode,
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'paragraph') return 'Type here…'
          return ''
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'editor-link' },
      }),
      Underline,
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      ...(mergeFields
        ? [BilingualMergeFieldExtension.configure({ getContext: mergeFields.getContext })]
        : []),
    ],
    content: initialDoc as Record<string, unknown>,
    onUpdate: ({ editor }) => {
      if (!onChange) return
      onChange(editor.getJSON() as unknown as DocumentDoc)
    },
  })

  // `useEditor` only reads `content` at mount time, so when the parent
  // hands us a freshly-loaded doc (after an async fetch resolves) we
  // need to push it into the editor imperatively. Without this, the
  // editor stays stuck on whatever was passed at mount (typically an
  // empty doc from useState's initializer) while the parent's state
  // holds the real content — silently dropping every edit the user
  // makes when the page re-renders. `emitUpdate: false` keeps this from
  // ping-ponging back through onChange.
  useEffect(() => {
    if (!editor) return
    const current = editor.getJSON()
    if (JSON.stringify(current) === JSON.stringify(initialDoc)) return
    editor.commands.setContent(initialDoc as Record<string, unknown>, { emitUpdate: false })
  }, [editor, initialDoc])

  const addBlock = useCallback(() => {
    if (!editor) return
    // Insert a new bilingualBlock at the end of the section the cursor
    // is currently inside. Walk up the resolved position looking for a
    // `section` ancestor, then insert at the position right after the
    // current bilingualBlock (or at the section's end if not in one).
    const { state } = editor
    const { $from } = state.selection
    let sectionPos: number | null = null
    let sectionEnd: number | null = null
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'section') {
        sectionPos = $from.before(d)
        sectionEnd = $from.after(d)
        break
      }
    }
    if (sectionPos === null || sectionEnd === null) return
    // Insert just before the section's closing token so the new block
    // appends to the end of that section.
    editor.chain().focus().insertContentAt(sectionEnd - 1, emptyBlock()).run()
  }, [editor])

  const addSection = useCallback(() => {
    if (!editor) return
    // Append a new section at the very end of the document.
    const docSize = editor.state.doc.content.size
    editor.chain().focus().insertContentAt(docSize, emptySection()).run()
  }, [editor])

  const setLink = useCallback(() => {
    if (!editor) return
    const url = window.prompt('URL:', editor.getAttributes('link').href || 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }, [editor])

  // Selection-translate. Reads the highlighted text from the current
  // blockBody, sends it through the translate-text edge function,
  // and appends the translation as a new paragraph at the end of the
  // paired blockBody on the other side. Keeps the source content
  // intact — the user explicitly opted into one-way translation by
  // hitting this button on a selection.
  const translateSelection = useCallback(async () => {
    if (!editor || translating) return
    const { state } = editor
    const { from, to } = state.selection
    if (from === to) return
    const text = state.doc.textBetween(from, to, '\n').trim()
    if (!text) return

    // Walk up from the selection to find which blockBody it's in and
    // the parent bilingualBlock that owns the pair.
    const $from = state.doc.resolve(from)
    let sourceLang: 'en' | 'id' | null = null
    let bilingualBlockDepth = -1
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d)
      if (node.type.name === 'blockBody' && sourceLang === null) {
        const lang = node.attrs?.lang
        sourceLang = lang === 'id' ? 'id' : 'en'
      }
      if (node.type.name === 'bilingualBlock') {
        bilingualBlockDepth = d
        break
      }
    }
    if (!sourceLang || bilingualBlockDepth < 0) return

    const targetLang = sourceLang === 'en' ? 'id' : 'en'
    const direction = sourceLang === 'en' ? 'en-to-id' : 'id-to-en'

    // Find the paired blockBody's end-of-content position by walking
    // the bilingualBlock node's children. ProseMirror positions: the
    // bilingualBlock opens at $from.before(d); its first child starts
    // at +1; each child takes `nodeSize` slots; the position one
    // before a child's closing tag is its end-of-content.
    const blockNode = $from.node(bilingualBlockDepth)
    const blockStart = $from.before(bilingualBlockDepth)
    let cursor = blockStart + 1
    let insertAt: number | null = null
    for (let i = 0; i < blockNode.childCount; i++) {
      const child = blockNode.child(i)
      if (child.type.name === 'blockBody' && child.attrs?.lang === targetLang) {
        insertAt = cursor + child.nodeSize - 1
        break
      }
      cursor += child.nodeSize
    }
    if (insertAt === null) return

    setTranslating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-text`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, direction }),
      })
      if (!response.ok) {
        let msg = `Translate failed (HTTP ${response.status})`
        try {
          const body = await response.json() as { error?: string }
          if (body.error) msg = body.error
        } catch { /* fall through */ }
        throw new Error(msg)
      }
      const result = await response.json() as { translated: string }
      if (!result.translated) return
      editor
        .chain()
        .focus()
        .insertContentAt(insertAt, {
          type: 'paragraph',
          content: [{ type: 'text', text: result.translated }],
        })
        .run()
    } catch (err) {
      // Surface as a window.alert for now — Phase F polish can add an
      // inline error toast inside the BubbleMenu surface.
      window.alert(err instanceof Error ? err.message : 'Translation failed')
    } finally {
      setTranslating(false)
    }
  }, [editor, translating])

  // AI Generate submit. Calls the edge function with the user's prompt
  // and replaces the editor's content with the returned DocumentDoc.
  // Replace (not insert) because most prompts produce a complete doc;
  // users wanting to augment can paste from the modal output later if
  // we add that mode.
  const runGenerate = useCallback(async (prompt: string) => {
    if (!editor || !aiGenerate || generating) return
    setGenerating(true)
    setGenerateError('')
    try {
      const doc = await generateDocument({ prompt, docType: aiGenerate.docType, title: aiGenerate.title })
      editor.commands.setContent(doc as unknown as Record<string, unknown>)
      // setContent doesn't fire onUpdate, so push the change explicitly
      // so the parent's saved-state tracker sees the new doc.
      if (onChange) onChange(editor.getJSON() as unknown as DocumentDoc)
      setGenerateOpen(false)
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }, [editor, aiGenerate, generating, onChange])

  if (!editor) return null

  return (
    <div className={`doc-editor ${view === 'stacked' ? 'is-stacked' : ''}`}>
      <Toolbar
        editor={editor}
        onSetLink={setLink}
        onAddBlock={addBlock}
        onAddSection={addSection}
        mergeFields={mergeFields}
        view={view}
        onViewChange={onViewChange}
        onGenerate={aiGenerate ? () => setGenerateOpen(true) : undefined}
        sticky={stickyToolbar}
        stickyOffset={stickyToolbarOffset}
      />
      {aiGenerate && generateOpen && (
        <GenerateModal
          docType={aiGenerate.docType}
          generating={generating}
          error={generateError}
          onClose={() => { if (!generating) setGenerateOpen(false) }}
          onSubmit={runGenerate}
        />
      )}
      <BubbleMenu editor={editor}>
        <div
          className="flex items-center gap-0.5 rounded-lg border p-1 shadow-lg"
          style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
        >
          <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
            <BoldIcon />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
            <ItalicIcon />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
            <UnderlineIcon />
          </ToolbarButton>
          <Divider />
          <button
            type="button"
            onClick={translateSelection}
            disabled={translating}
            title="Translate selection and insert into the paired language side"
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors disabled:opacity-50"
            style={{ color: 'var(--color-text-secondary)' }}
            onMouseOver={e => { if (!translating) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
            onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            {translating ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            ) : (
              <TranslateIcon />
            )}
            <span>{translating ? 'Translating…' : 'Translate'}</span>
          </button>
        </div>
      </BubbleMenu>
      <EditorContent editor={editor} />
      <style>{DOCUMENT_EDITOR_STYLES}{MERGE_FIELD_STYLES}</style>
    </div>
  )
}

// ─── Toolbar ──────────────────────────────────────────────────────

function Toolbar({ editor, onSetLink, onAddBlock, onAddSection, mergeFields, view, onViewChange, onGenerate, sticky = false, stickyOffset = '0px' }: {
  editor: Editor
  onSetLink: () => void
  onAddBlock: () => void
  onAddSection: () => void
  mergeFields?: DocumentEditorMergeFields
  view: DocumentEditorView
  sticky?: boolean
  stickyOffset?: string
  onViewChange?: (next: DocumentEditorView) => void
  onGenerate?: () => void
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-0.5 border px-2 py-1.5 ${sticky ? 'z-30' : 'rounded-t-xl'}`}
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)',
        ...(sticky ? { position: 'sticky', top: stickyOffset } : null),
      }}
    >
      <BlockTypeSelect editor={editor} />
      <Divider />
      <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
        <BoldIcon />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
        <ItalicIcon />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
        <UnderlineIcon />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
        <StrikeIcon />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code">
        <CodeIcon />
      </ToolbarButton>
      <Divider />
      <ToolbarButton active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
        <BulletListIcon />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
        <OrderedListIcon />
      </ToolbarButton>
      <Divider />
      <ToolbarButton active={editor.isActive('link')} onClick={onSetLink} title="Link">
        <LinkIcon />
      </ToolbarButton>
      <ToolbarButton active={false} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Insert table">
        <TableIcon />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code block">
        <CodeBlockIcon />
      </ToolbarButton>
      <Divider />
      <button
        type="button"
        onClick={onAddBlock}
        className="rounded-md px-2.5 h-8 text-xs font-medium transition-colors"
        style={{ color: 'var(--color-text-secondary)', backgroundColor: 'transparent' }}
        onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
        onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
        title="Add a new paragraph block to the current section"
      >
        + Block
      </button>
      <button
        type="button"
        onClick={onAddSection}
        className="rounded-md px-2.5 h-8 text-xs font-medium transition-colors"
        style={{ color: 'var(--color-text-secondary)', backgroundColor: 'transparent' }}
        onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
        onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
        title="Append a new section at the end of the document"
      >
        + Section
      </button>
      {mergeFields && (
        <>
          <Divider />
          {/* The picker labels itself in EN; the pill it inserts will
              auto-localize per blockBody. We pass lang='en' as the
              picker's own UI language since the editor chrome is EN. */}
          <MergeFieldButton editor={editor} scope={mergeFields.scope} lang="en" />
        </>
      )}
      {onGenerate && (
        <>
          <Divider />
          <button
            type="button"
            onClick={onGenerate}
            title="Generate a draft of this document from a prompt"
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors"
            style={{ color: 'var(--color-primary)' }}
            onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
            onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <SparklesIcon />
            <span>AI Generate</span>
          </button>
        </>
      )}
      {onViewChange && (
        <>
          <div className="ml-auto" />
          <Divider />
          <button
            type="button"
            onClick={() => onViewChange(view === 'stacked' ? 'side_by_side' : 'stacked')}
            title={view === 'stacked' ? 'Switch to side-by-side view' : 'Switch to stacked view'}
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors"
            style={{ color: 'var(--color-text-secondary)' }}
            onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
            onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            {view === 'stacked' ? <SideBySideIcon /> : <StackedIcon />}
            <span>{view === 'stacked' ? 'Side-by-side' : 'Stacked'}</span>
          </button>
        </>
      )}
    </div>
  )
}

function BlockTypeSelect({ editor }: { editor: Editor }) {
  const value = editor.isActive('heading', { level: 3 }) ? 'h3'
    : editor.isActive('heading', { level: 4 }) ? 'h4'
    : editor.isActive('callout') ? 'callout'
    : editor.isActive('codeBlock') ? 'code'
    : 'p'

  function onChange(val: string) {
    const chain = editor.chain().focus()
    if (val === 'p') chain.setParagraph().run()
    else if (val === 'h3') chain.toggleHeading({ level: 3 }).run()
    else if (val === 'h4') chain.toggleHeading({ level: 4 }).run()
    else if (val === 'code') chain.toggleCodeBlock().run()
    else if (val === 'callout') chain.insertContent({ type: 'callout', attrs: { variant: 'info' }, content: [{ type: 'paragraph' }] }).run()
  }

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="h-8 rounded-md border-none px-2 text-xs font-medium outline-none"
      style={{ backgroundColor: 'transparent', color: 'var(--color-text-secondary)' }}
    >
      <option value="p">Paragraph</option>
      <option value="h3">Heading 3</option>
      <option value="h4">Heading 4</option>
      <option value="callout">Callout</option>
      <option value="code">Code block</option>
    </select>
  )
}

function ToolbarButton({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      type="button"
      className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
      style={{
        color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
        backgroundColor: active ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
      }}
      onMouseOver={e => { if (!active) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
      onMouseOut={e => { if (!active) e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="mx-1 h-5 w-px" style={{ backgroundColor: 'var(--color-border)' }} />
}

const s = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

function BoldIcon() { return <svg {...s}><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg> }
function ItalicIcon() { return <svg {...s}><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg> }
function UnderlineIcon() { return <svg {...s}><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg> }
function StrikeIcon() { return <svg {...s}><path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" y1="12" x2="20" y2="12"/></svg> }
function CodeIcon() { return <svg {...s}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> }
function BulletListIcon() { return <svg {...s}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="3" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="3" cy="18" r="1" fill="currentColor" stroke="none"/></svg> }
function OrderedListIcon() { return <svg {...s}><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="1" y="8" fontSize="7" fill="currentColor" stroke="none" fontFamily="system-ui">1</text><text x="1" y="14" fontSize="7" fill="currentColor" stroke="none" fontFamily="system-ui">2</text><text x="1" y="20" fontSize="7" fill="currentColor" stroke="none" fontFamily="system-ui">3</text></svg> }
function LinkIcon() { return <svg {...s}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> }
function TableIcon() { return <svg {...s}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg> }
function CodeBlockIcon() { return <svg {...s}><rect x="2" y="3" width="20" height="18" rx="2"/><polyline points="10 8 6 12 10 16"/><polyline points="14 8 18 12 14 16"/></svg> }
function SideBySideIcon() { return <svg {...s}><rect x="3" y="4" width="8" height="16" rx="1"/><rect x="13" y="4" width="8" height="16" rx="1"/></svg> }
function StackedIcon() { return <svg {...s}><rect x="3" y="3" width="18" height="8" rx="1"/><rect x="3" y="13" width="18" height="8" rx="1"/></svg> }
function TranslateIcon() { return <svg {...s}><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg> }
function SparklesIcon() { return <svg {...s}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg> }

// ─── AI Generate modal ─────────────────────────────────────────────

function GenerateModal({ docType, generating, error, onClose, onSubmit }: {
  docType: 'sop' | 'contract' | 'job_description'
  generating: boolean
  error: string
  onClose: () => void
  onSubmit: (prompt: string) => void
}) {
  const [prompt, setPrompt] = useState('')
  const placeholder = docType === 'contract'
    ? 'e.g. PKWTT contract for a senior chef, 6-month probation, weekly off on Mondays'
    : docType === 'job_description'
      ? 'e.g. Job description for a Marketing Director — leads brand, demand-gen, and a team of 5'
      : 'e.g. SOP for opening checklist at a coffee shop — covers cleaning, prep, register float'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg border p-5 shadow-xl"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold" style={{ color: 'var(--color-text)' }}>AI Generate</h2>
        <p className="mb-4 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          Describe what you want. The result replaces the current draft — both English and Bahasa Indonesia sides come back filled in.
        </p>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={5}
          autoFocus
          disabled={generating}
          placeholder={placeholder}
          className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
        />
        {error && (
          <p className="mt-2 text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(prompt.trim())}
            disabled={generating || !prompt.trim()}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {generating ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Generating…
              </>
            ) : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  )
}
