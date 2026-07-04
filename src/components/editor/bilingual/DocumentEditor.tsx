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
import { TextAlign } from '@tiptap/extension-text-align'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import {
  DocumentNode,
  BilingualBlockNode,
  BlockBodyNode,
  CalloutNode,
  LetterheadNode,
  SignatureBlockNode,
  emptyBlock,
} from './nodes'
import { BilingualBlockView } from './BilingualBlockView'
import { LetterheadView } from './LetterheadView'
import { SignatureBlockView } from './SignatureBlockView'
import { SIGNATURE_BLOCK_STYLES } from './SignatureBlockContent'
import { BilingualDocumentRenderer, BILINGUAL_DOCUMENT_RENDERER_STYLES } from './BilingualDocumentRenderer'
import { PAGE_VIEW_STYLES } from './pageView'
import { BlockGutter } from './BlockGutter'
import { SelectionBubble } from './SelectionBubble'
import { BilingualMergeFieldExtension } from './BilingualMergeField'
import { MergeFieldButton } from '../MergeFieldButton'
import { MERGE_FIELD_STYLES } from '../MergeField'
import { DOCUMENT_EDITOR_STYLES } from './styles'
import { supabase } from '../../../lib/supabase'
import { generateDocument } from '../../../lib/aiGenerate'
import { normalizeDoc, stripDefaultTextAlign, letterheadBlock, signatureBlock, type DocumentDoc, type LanguageMode, type SignatureRole } from '../../../lib/documentDoc'
import type { MergeContext } from '../../../lib/mergeFields'

export type DocumentEditorView = 'side_by_side' | 'stacked'

// Optional merge-fields integration. When provided, the editor enables
// the bilingual MergeField pill node and exposes the picker button in
// the toolbar. The pill resolves its displayed value via getContext()
// — but uses the parent blockBody's `lang` attr, not ctx.lang, so the
// same pill shows "Rp 5,000,000" on the EN side and the localized
// numeral on the ID side without the host having to render two editors.
export type DocumentEditorMergeFields = {
  scope: 'sop' | 'contract' | 'letter' | 'nda'
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
  // Per-document language mode (P1 monolingual). 'bilingual' (default)
  // shows both EN + ID sides; 'en'/'id' render a single full-width column.
  // When onLanguageModeChange is provided, the toolbar renders a
  // Bilingual / Single-language toggle + an EN/ID picker.
  languageMode?: LanguageMode
  onLanguageModeChange?: (next: LanguageMode) => void
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
  view = 'side_by_side',
  onViewChange,
  languageMode = 'bilingual',
  onLanguageModeChange,
  mergeFields,
  aiGenerate,
  stickyToolbar = false,
  stickyToolbarOffset = '0px',
}: DocumentEditorProps) {
  // Bind the React NodeView at editor-creation time rather than baking
  // JSX into nodes.ts — keeps the schema file framework-agnostic.
  const BilingualBlockWithView = BilingualBlockNode.extend({
    addNodeView() {
      return ReactNodeViewRenderer(BilingualBlockView)
    },
  })

  const LetterheadWithView = LetterheadNode.extend({
    addNodeView() {
      return ReactNodeViewRenderer(LetterheadView)
    },
  })

  const SignatureBlockWithView = SignatureBlockNode.extend({
    addNodeView() {
      return ReactNodeViewRenderer(SignatureBlockView)
    },
  })

  // Normalize once at mount so legacy section-nested docs render in the
  // flat schema. The effect below re-normalizes on every initialDoc
  // change for the async-load case.
  const normalizedInitial = normalizeDoc(initialDoc)

  // State for the per-selection translate action. Tracks the in-flight
  // request so we can show a spinner on the BubbleMenu button.
  const [translating, setTranslating] = useState(false)

  // AI Generate modal state. `generateOpen` toggles the prompt dialog;
  // `generating` blocks the submit button while the model request is
  // in flight. The dialog is only mounted when `aiGenerate` is set.
  const [generateOpen, setGenerateOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')

  // Print-faithful "Page view" — a read-only A4 preview of the current doc
  // (the same BilingualDocumentRenderer the PDF uses, in a `.doc-paper` sheet).
  // We snapshot the editor's JSON when toggling in so the preview reflects the
  // latest edits; the editable canvas is hidden (not unmounted) meanwhile.
  const [pageView, setPageView] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<DocumentDoc | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Replace StarterKit's default top node with our `document`.
        document: false,
        // Block content schema constraints. In the bilingual body, h2 is the
        // clause-heading level (auto-numbered, formerly section titles) and
        // h3/h4 are sub-headings — so the block-type dropdown offers only h3/h4
        // there. h1/h2 are enabled for the full-width letterhead header (a
        // free-form, non-numbered region) and the dropdown surfaces them only
        // when the caret is inside a letterhead. blockquote and horizontal rule
        // stay disabled so paste/parse can't sneak them in.
        heading: { levels: [1, 2, 3, 4] },
        blockquote: false,
        horizontalRule: false,
        // Link and Underline are configured explicitly below (custom
        // openOnClick / editor-link class), so disable StarterKit's bundled
        // copies to avoid duplicate-extension-name warnings.
        link: false,
        underline: false,
      }),
      DocumentNode,
      BilingualBlockWithView,
      LetterheadWithView.configure({ getContext: mergeFields?.getContext }),
      SignatureBlockWithView.configure({ getContext: mergeFields?.getContext }),
      BlockBodyNode,
      CalloutNode,
      Placeholder.configure({
        // Only advertise what works today — no "/" or AI hints until
        // those features actually land.
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') return 'Heading'
          if (node.type.name === 'paragraph') return 'Write here…'
          return ''
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'editor-link' },
      }),
      Underline,
      // Alignment for paragraphs + headings. The default 'left' it stamps on
      // every node is dropped from stored output by stripDefaultTextAlign so it
      // can't trip the snapshot freshness check.
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      ...(mergeFields
        ? [BilingualMergeFieldExtension.configure({ getContext: mergeFields.getContext })]
        : []),
    ],
    content: normalizedInitial as Record<string, unknown>,
    onUpdate: ({ editor }) => {
      if (!onChange) return
      // Drop default/left textAlign so unaligned blocks keep their pre-alignment
      // shape (else the snapshot freshness check flags every block as changed).
      onChange(stripDefaultTextAlign(editor.getJSON()) as unknown as DocumentDoc)
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
    const next = normalizeDoc(initialDoc)
    // Strip default textAlign from the live doc before comparing — TextAlign
    // stamps it on load, so a raw compare against the (clean) incoming doc would
    // always differ and needlessly reset content on every re-render.
    const current = stripDefaultTextAlign(editor.getJSON())
    if (JSON.stringify(current) === JSON.stringify(next)) return
    editor.commands.setContent(next as Record<string, unknown>, { emitUpdate: false })
  }, [editor, initialDoc])

  // Trailing "Add block" affordance — always appends at the very end of
  // the document and drops the caret into the new block's EN side.
  const addBlockAtEnd = useCallback(() => {
    if (!editor) return
    const end = editor.state.doc.content.size
    editor.chain().focus().insertContentAt(end, emptyBlock()).run()
  }, [editor])

  const togglePageView = useCallback(() => {
    setPageView(on => {
      const next = !on
      // Snapshot the live doc on entering preview (strip default textAlign to
      // match the stored shape). Leaving preview just re-shows the canvas.
      if (next && editor) setPreviewDoc(stripDefaultTextAlign(editor.getJSON()) as unknown as DocumentDoc)
      return next
    })
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
      editor.commands.setContent(normalizeDoc(doc) as unknown as Record<string, unknown>)
      // setContent doesn't fire onUpdate, so push the change explicitly so
      // the parent's saved-state tracker sees the new doc. Strip default
      // textAlign to match onUpdate — otherwise the generated doc reaches the
      // snapshot writer carrying textAlign the editor would have dropped,
      // seeding a stored-vs-emitted mismatch in the per-block diff.
      if (onChange) onChange(stripDefaultTextAlign(editor.getJSON()) as unknown as DocumentDoc)
      setGenerateOpen(false)
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }, [editor, aiGenerate, generating, onChange])

  if (!editor) return null

  return (
    <div className={`doc-editor ${view === 'stacked' ? 'is-stacked' : ''} ${
      languageMode === 'en' ? 'is-monolingual is-monolingual-en'
      : languageMode === 'id' ? 'is-monolingual is-monolingual-id'
      : ''
    }`}>
      <Toolbar
        editor={editor}
        onSetLink={setLink}
        mergeFields={mergeFields}
        view={view}
        onViewChange={onViewChange}
        languageMode={languageMode}
        onLanguageModeChange={onLanguageModeChange}
        onGenerate={aiGenerate ? () => setGenerateOpen(true) : undefined}
        pageView={pageView}
        onTogglePageView={togglePageView}
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
        <SelectionBubble
          editor={editor}
          onSetLink={setLink}
          onTranslate={translateSelection}
          translating={translating}
          languageMode={languageMode}
        />
      </BubbleMenu>
      {/* Editable canvas — hidden (not unmounted) while previewing so the
          TipTap view state survives the round-trip. */}
      <div style={{ display: pageView ? 'none' : undefined }}>
        <BlockGutter editor={editor} />
        <EditorContent editor={editor} />
        <button
          type="button"
          className="doc-editor-add-trailing"
          onClick={addBlockAtEnd}
          title="Add a block at the end of the document"
        >
          <span>+</span> Add block
        </button>
      </div>
      {pageView && (
        <div className="doc-paper-scroll">
          <div className="doc-paper">
            <BilingualDocumentRenderer
              doc={previewDoc ?? (editor.getJSON() as unknown as DocumentDoc)}
              view={view}
              languageMode={languageMode}
              contextEn={mergeFields?.getContext()}
              contextId={mergeFields?.getContext()}
            />
          </div>
        </div>
      )}
      <style>{DOCUMENT_EDITOR_STYLES}{MERGE_FIELD_STYLES}{SIGNATURE_BLOCK_STYLES}{BILINGUAL_DOCUMENT_RENDERER_STYLES}{PAGE_VIEW_STYLES}</style>
    </div>
  )
}

// ─── Toolbar ──────────────────────────────────────────────────────

function Toolbar({ editor, onSetLink, mergeFields, view, onViewChange, languageMode = 'bilingual', onLanguageModeChange, onGenerate, pageView = false, onTogglePageView, sticky = false, stickyOffset = '0px' }: {
  editor: Editor
  onSetLink: () => void
  mergeFields?: DocumentEditorMergeFields
  view: DocumentEditorView
  sticky?: boolean
  stickyOffset?: string
  onViewChange?: (next: DocumentEditorView) => void
  languageMode?: LanguageMode
  onLanguageModeChange?: (next: LanguageMode) => void
  onGenerate?: () => void
  pageView?: boolean
  onTogglePageView?: () => void
}) {
  // The schema pins at most one letterhead, at the very top — so the insert
  // button is disabled once a document already has one.
  const hasLetterhead = editor.state.doc.firstChild?.type.name === 'letterhead'
  const insertLetterhead = () => {
    if (hasLetterhead) return
    editor.chain().focus().insertContentAt(0, letterheadBlock()).run()
  }
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
      <ToolbarButton active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Align left">
        <AlignLeftIcon />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Align center">
        <AlignCenterIcon />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Align right">
        <AlignRightIcon />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()} title="Justify">
        <AlignJustifyIcon />
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
        onClick={insertLetterhead}
        disabled={hasLetterhead}
        title={hasLetterhead ? 'This document already has a letterhead' : 'Insert a letterhead (logo + header) at the top'}
        className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        style={{ color: 'var(--color-text-secondary)' }}
        onMouseOver={e => { if (!hasLetterhead) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
        onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
      >
        <LetterheadIcon />
        <span>Letterhead</span>
      </button>
      {mergeFields && (
        <>
          <Divider />
          {/* The picker labels itself in EN; the pill it inserts will
              auto-localize per blockBody. We pass lang='en' as the
              picker's own UI language since the editor chrome is EN. */}
          <MergeFieldButton editor={editor} scope={mergeFields.scope} lang="en" />
          <SignatureButton editor={editor} />
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
      {onTogglePageView && (
        <>
          <div className="ml-auto" />
          <Divider />
          <button
            type="button"
            onClick={onTogglePageView}
            title={pageView ? 'Back to editing' : 'Preview as a printed A4 page'}
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors"
            style={{
              color: pageView ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              backgroundColor: pageView ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
            }}
            onMouseOver={e => { if (!pageView) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
            onMouseOut={e => { if (!pageView) e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <PageViewIcon />
            <span>{pageView ? 'Edit' : 'Page view'}</span>
          </button>
        </>
      )}
      {onViewChange && (
        <>
          {!onTogglePageView && <div className="ml-auto" />}
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
      {onLanguageModeChange && (
        <>
          {!onTogglePageView && !onViewChange && <div className="ml-auto" />}
          <Divider />
          <button
            type="button"
            onClick={() => onLanguageModeChange(languageMode === 'bilingual' ? 'en' : 'bilingual')}
            title={languageMode === 'bilingual'
              ? 'Switch to a single language (the other side is cleared on save)'
              : 'Switch back to bilingual'}
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors"
            style={{ color: 'var(--color-text-secondary)' }}
            onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
            onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <LanguagesIcon />
            <span>{languageMode === 'bilingual' ? 'Bilingual' : 'Single language'}</span>
          </button>
          {languageMode !== 'bilingual' && (
            <select
              value={languageMode}
              onChange={e => onLanguageModeChange(e.target.value as 'en' | 'id')}
              title="Document language"
              className="h-8 rounded-md border px-1.5 text-xs font-medium"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            >
              <option value="en">EN</option>
              <option value="id">ID</option>
            </select>
          )}
        </>
      )}
    </div>
  )
}

// ─── Signature insert button ───────────────────────────────────────
//
// Drops a top-level signatureBlock at the end of the document. A small role
// submenu (mirrors the merge-field picker) picks employee / employer / a blank
// wet-signature line. Unlike the letterhead there's no "only one" constraint —
// a contract has two signers, an NDA two parties, etc.

function SignatureButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function insert(role: SignatureRole) {
    const end = editor.state.doc.content.size
    editor.chain().focus().insertContentAt(end, signatureBlock(role)).run()
    setOpen(false)
  }

  const items: Array<{ role: SignatureRole; label: string }> = [
    { role: 'employee', label: 'Employee signature' },
    { role: 'employer', label: 'Employer signature' },
    { role: 'blank', label: 'Blank signature line' },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Insert a signature block"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors"
        style={{ color: 'var(--color-text-secondary)' }}
        onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
        onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
      >
        <SignatureIcon />
        <span>Signature</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-40 mt-1 min-w-[190px] overflow-hidden rounded-lg border py-1 shadow-lg"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
        >
          {items.map(it => (
            <button
              key={it.role}
              type="button"
              role="menuitem"
              onClick={() => insert(it.role)}
              className="flex w-full items-center px-3 py-2 text-left text-xs transition-colors"
              style={{ color: 'var(--color-text)' }}
              onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
              onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BlockTypeSelect({ editor }: { editor: Editor }) {
  // The letterhead is a free-form header (not a clause-numbered region), so it
  // offers the full heading range incl. h1/h2 and hides Callout/Code (which its
  // schema doesn't allow). The body keeps h3/h4 + Callout/Code — h2 stays
  // reserved for auto-numbered clause headings and h1 for the document title.
  const $from = editor.state.selection.$from
  let inLetterhead = false
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'letterhead') { inLetterhead = true; break }
  }

  const value = editor.isActive('heading', { level: 1 }) ? 'h1'
    : editor.isActive('heading', { level: 2 }) ? 'h2'
    : editor.isActive('heading', { level: 3 }) ? 'h3'
    : editor.isActive('heading', { level: 4 }) ? 'h4'
    : editor.isActive('callout') ? 'callout'
    : editor.isActive('codeBlock') ? 'code'
    : 'p'

  function onChange(val: string) {
    const chain = editor.chain().focus()
    if (val === 'p') chain.setParagraph().run()
    else if (val === 'h1') chain.toggleHeading({ level: 1 }).run()
    else if (val === 'h2') chain.toggleHeading({ level: 2 }).run()
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
      {inLetterhead && <option value="h1">Heading 1</option>}
      {inLetterhead && <option value="h2">Heading 2</option>}
      <option value="h3">Heading 3</option>
      <option value="h4">Heading 4</option>
      {!inLetterhead && <option value="callout">Callout</option>}
      {!inLetterhead && <option value="code">Code block</option>}
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
function AlignLeftIcon() { return <svg {...s}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg> }
function AlignCenterIcon() { return <svg {...s}><line x1="3" y1="6" x2="21" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/></svg> }
function AlignRightIcon() { return <svg {...s}><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg> }
function AlignJustifyIcon() { return <svg {...s}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg> }
function LetterheadIcon() { return <svg {...s}><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="7" y1="14" x2="17" y2="14"/><line x1="7" y1="17" x2="13" y2="17"/></svg> }
function SignatureIcon() { return <svg {...s}><path d="M3 19c3 0 4-6 6-6s1 4 3 4 2.5-7 4.5-7"/><path d="M17 10l3 3"/><line x1="3" y1="21" x2="21" y2="21"/></svg> }
function PageViewIcon() { return <svg {...s}><rect x="5" y="3" width="14" height="18" rx="1"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="13" y2="15"/></svg> }
function BulletListIcon() { return <svg {...s}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="3" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="3" cy="18" r="1" fill="currentColor" stroke="none"/></svg> }
function OrderedListIcon() { return <svg {...s}><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="1" y="8" fontSize="7" fill="currentColor" stroke="none" fontFamily="system-ui">1</text><text x="1" y="14" fontSize="7" fill="currentColor" stroke="none" fontFamily="system-ui">2</text><text x="1" y="20" fontSize="7" fill="currentColor" stroke="none" fontFamily="system-ui">3</text></svg> }
function LinkIcon() { return <svg {...s}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> }
function TableIcon() { return <svg {...s}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg> }
function CodeBlockIcon() { return <svg {...s}><rect x="2" y="3" width="20" height="18" rx="2"/><polyline points="10 8 6 12 10 16"/><polyline points="14 8 18 12 14 16"/></svg> }
function SideBySideIcon() { return <svg {...s}><rect x="3" y="4" width="8" height="16" rx="1"/><rect x="13" y="4" width="8" height="16" rx="1"/></svg> }
function StackedIcon() { return <svg {...s}><rect x="3" y="3" width="18" height="8" rx="1"/><rect x="3" y="13" width="18" height="8" rx="1"/></svg> }
function LanguagesIcon() { return <svg {...s}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/></svg> }
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
