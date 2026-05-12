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
import { StarterKit } from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Link } from '@tiptap/extension-link'
import { Underline } from '@tiptap/extension-underline'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import { useCallback, useEffect } from 'react'
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
import { BilingualMergeFieldExtension } from './BilingualMergeField'
import { MergeFieldButton } from '../MergeFieldButton'
import { MERGE_FIELD_STYLES } from '../MergeField'
import { DOCUMENT_EDITOR_STYLES } from './styles'
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
}

export function DocumentEditor({ initialDoc, onChange, view = 'stacked', onViewChange, mergeFields }: DocumentEditorProps) {
  // Bind the React NodeView to the section node at editor-creation
  // time (rather than baking JSX into nodes.ts, which would force that
  // file to be .tsx and pull React into the schema definitions).
  const SectionWithView = SectionNode.extend({
    addNodeView() {
      return ReactNodeViewRenderer(SectionView)
    },
  })

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
      BilingualBlockNode,
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
      />
      <EditorContent editor={editor} />
      <style>{DOCUMENT_EDITOR_STYLES}{MERGE_FIELD_STYLES}</style>
    </div>
  )
}

// ─── Toolbar ──────────────────────────────────────────────────────

function Toolbar({ editor, onSetLink, onAddBlock, onAddSection, mergeFields, view, onViewChange }: {
  editor: Editor
  onSetLink: () => void
  onAddBlock: () => void
  onAddSection: () => void
  mergeFields?: DocumentEditorMergeFields
  view: DocumentEditorView
  onViewChange?: (next: DocumentEditorView) => void
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-0.5 rounded-t-xl border px-2 py-1.5"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
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
