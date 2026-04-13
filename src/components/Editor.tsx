import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { StarterKit } from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Link } from '@tiptap/extension-link'
import { Underline } from '@tiptap/extension-underline'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import { Markdown } from '@tiptap/markdown'
import { useEffect, useCallback } from 'react'
import type { Editor } from '@tiptap/core'

interface EditorProps {
  content: string
  onChange: (markdown: string) => void
}

export function SOPEditor({ content, onChange }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: 'Start writing your SOP... Use # for headings, - for lists, **bold**, etc.',
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
      Markdown,
    ],
    content,
    contentType: 'markdown',
    onUpdate: ({ editor }) => {
      const md = editor.getMarkdown()
      onChange(md)
    },
  })

  useEffect(() => {
    if (editor && content && editor.isEmpty) {
      editor.commands.setContent(content, { emitUpdate: false, contentType: 'markdown' })
    }
  }, [editor, content])

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
    <div className="sop-editor">
      {/* Fixed toolbar */}
      <Toolbar editor={editor} onSetLink={setLink} />

      {/* Floating toolbar on text selection */}
      <BubbleMenu editor={editor}>
        <div
          className="flex items-center gap-0.5 rounded-lg border p-1 shadow-lg"
          style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
        >
          <ToolbarButton
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <BoldIcon />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <ItalicIcon />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Underline"
          >
            <UnderlineIcon />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('link')}
            onClick={setLink}
            title="Link"
          >
            <LinkIcon />
          </ToolbarButton>
        </div>
      </BubbleMenu>

      {/* Editor content area */}
      <EditorContent editor={editor} />

      <style>{`
        .sop-editor .tiptap {
          outline: none;
          min-height: 400px;
          padding: 1.5rem;
          border: 1px solid var(--color-border);
          border-top: none;
          border-radius: 0 0 0.75rem 0.75rem;
          background: var(--color-bg);
          color: var(--color-text);
          font-size: 0.9375rem;
          line-height: 1.7;
        }

        .sop-editor .tiptap:focus {
          border-color: var(--color-border-strong);
        }

        .sop-editor .tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: var(--color-text-tertiary);
          pointer-events: none;
          height: 0;
        }

        .sop-editor .tiptap h1 {
          font-size: 1.75rem;
          font-weight: 700;
          margin: 1.5rem 0 0.75rem;
          line-height: 1.3;
        }

        .sop-editor .tiptap h2 {
          font-size: 1.35rem;
          font-weight: 600;
          margin: 1.25rem 0 0.5rem;
          line-height: 1.3;
        }

        .sop-editor .tiptap h3 {
          font-size: 1.1rem;
          font-weight: 600;
          margin: 1rem 0 0.5rem;
          line-height: 1.3;
        }

        .sop-editor .tiptap p {
          margin: 0.5rem 0;
        }

        .sop-editor .tiptap ul,
        .sop-editor .tiptap ol {
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }

        .sop-editor .tiptap li {
          margin: 0.25rem 0;
        }

        .sop-editor .tiptap blockquote {
          border-left: 3px solid var(--color-border-strong);
          padding-left: 1rem;
          margin: 0.75rem 0;
          color: var(--color-text-secondary);
        }

        .sop-editor .tiptap code {
          background: var(--color-bg-tertiary);
          border-radius: 0.25rem;
          padding: 0.15rem 0.35rem;
          font-size: 0.85em;
          font-family: ui-monospace, monospace;
        }

        .sop-editor .tiptap pre {
          background: var(--color-bg-tertiary);
          border-radius: 0.5rem;
          padding: 0.75rem 1rem;
          margin: 0.75rem 0;
          overflow-x: auto;
        }

        .sop-editor .tiptap pre code {
          background: none;
          padding: 0;
        }

        .sop-editor .tiptap hr {
          border: none;
          border-top: 1px solid var(--color-border);
          margin: 1.5rem 0;
        }

        .sop-editor .tiptap a,
        .sop-editor .tiptap .editor-link {
          color: var(--color-primary);
          text-decoration: underline;
          cursor: pointer;
        }

        .sop-editor .tiptap table {
          border-collapse: collapse;
          width: 100%;
          margin: 0.75rem 0;
        }

        .sop-editor .tiptap th,
        .sop-editor .tiptap td {
          border: 1px solid var(--color-border);
          padding: 0.5rem 0.75rem;
          text-align: left;
          font-size: 0.875rem;
        }

        .sop-editor .tiptap th {
          background: var(--color-bg-secondary);
          font-weight: 600;
        }

        .sop-editor .tiptap strong {
          font-weight: 600;
        }
      `}</style>
    </div>
  )
}

export function SOPViewer({ content }: { content: string }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: { class: 'editor-link' },
      }),
      Underline,
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Markdown,
    ],
    content,
    contentType: 'markdown',
    editable: false,
  })

  useEffect(() => {
    if (editor) {
      editor.commands.setContent(content, { emitUpdate: false, contentType: 'markdown' })
    }
  }, [editor, content])

  if (!editor) return null

  return (
    <div className="sop-viewer">
      <EditorContent editor={editor} />
      <style>{`
        .sop-viewer .tiptap {
          outline: none;
          color: var(--color-text);
          font-size: 0.9375rem;
          line-height: 1.7;
        }

        .sop-viewer .tiptap h1 {
          font-size: 1.75rem;
          font-weight: 700;
          margin: 1rem 0 0.5rem;
          line-height: 1.3;
        }

        .sop-viewer .tiptap h2 {
          font-size: 1.35rem;
          font-weight: 600;
          margin: 0.75rem 0 0.5rem;
          line-height: 1.3;
        }

        .sop-viewer .tiptap h3 {
          font-size: 1.1rem;
          font-weight: 600;
          margin: 0.75rem 0 0.5rem;
          line-height: 1.3;
        }

        .sop-viewer .tiptap p {
          margin: 0.5rem 0;
        }

        .sop-viewer .tiptap ul,
        .sop-viewer .tiptap ol {
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }

        .sop-viewer .tiptap li {
          margin: 0.25rem 0;
        }

        .sop-viewer .tiptap blockquote {
          border-left: 3px solid var(--color-border-strong);
          padding-left: 1rem;
          margin: 0.75rem 0;
          color: var(--color-text-secondary);
        }

        .sop-viewer .tiptap code {
          background: var(--color-bg-tertiary);
          border-radius: 0.25rem;
          padding: 0.15rem 0.35rem;
          font-size: 0.85em;
          font-family: ui-monospace, monospace;
        }

        .sop-viewer .tiptap pre {
          background: var(--color-bg-tertiary);
          border-radius: 0.5rem;
          padding: 0.75rem 1rem;
          margin: 0.75rem 0;
          overflow-x: auto;
        }

        .sop-viewer .tiptap pre code {
          background: none;
          padding: 0;
        }

        .sop-viewer .tiptap a,
        .sop-viewer .tiptap .editor-link {
          color: var(--color-primary);
          text-decoration: underline;
          cursor: pointer;
        }

        .sop-viewer .tiptap table {
          border-collapse: collapse;
          width: 100%;
          margin: 0.75rem 0;
        }

        .sop-viewer .tiptap th,
        .sop-viewer .tiptap td {
          border: 1px solid var(--color-border);
          padding: 0.5rem 0.75rem;
          text-align: left;
          font-size: 0.875rem;
        }

        .sop-viewer .tiptap th {
          background: var(--color-bg-secondary);
          font-weight: 600;
        }

        .sop-viewer .tiptap strong {
          font-weight: 600;
        }
      `}</style>
    </div>
  )
}

/* ---- Fixed Toolbar ---- */

function Toolbar({ editor, onSetLink }: { editor: Editor; onSetLink: () => void }) {
  return (
    <div
      className="flex flex-wrap items-center gap-0.5 rounded-t-xl border px-2 py-1.5"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
    >
      {/* Text style */}
      <ToolbarSelect
        value={
          editor.isActive('heading', { level: 1 }) ? 'h1' :
          editor.isActive('heading', { level: 2 }) ? 'h2' :
          editor.isActive('heading', { level: 3 }) ? 'h3' : 'p'
        }
        onChange={(val) => {
          if (val === 'p') editor.chain().focus().setParagraph().run()
          else editor.chain().focus().toggleHeading({ level: Number(val[1]) as 1 | 2 | 3 }).run()
        }}
        options={[
          { value: 'p', label: 'Paragraph' },
          { value: 'h1', label: 'Heading 1' },
          { value: 'h2', label: 'Heading 2' },
          { value: 'h3', label: 'Heading 3' },
        ]}
      />

      <Divider />

      {/* Inline formatting */}
      <ToolbarButton
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold (Ctrl+B)"
      >
        <BoldIcon />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic (Ctrl+I)"
      >
        <ItalicIcon />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline (Ctrl+U)"
      >
        <UnderlineIcon />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="Strikethrough"
      >
        <StrikeIcon />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
        title="Inline code"
      >
        <CodeIcon />
      </ToolbarButton>

      <Divider />

      {/* Lists */}
      <ToolbarButton
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet list"
      >
        <BulletListIcon />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Numbered list"
      >
        <OrderedListIcon />
      </ToolbarButton>

      <Divider />

      {/* Block elements */}
      <ToolbarButton
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="Quote"
      >
        <QuoteIcon />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        title="Code block"
      >
        <CodeBlockIcon />
      </ToolbarButton>
      <ToolbarButton
        active={false}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal rule"
      >
        <HrIcon />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('link')}
        onClick={onSetLink}
        title="Link"
      >
        <LinkIcon />
      </ToolbarButton>
    </div>
  )
}

/* ---- Toolbar sub-components ---- */

function ToolbarButton({ active, onClick, title, children }: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
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
      onMouseOver={e => { if (!active) (e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)') }}
      onMouseOut={e => { if (!active) (e.currentTarget.style.backgroundColor = 'transparent') }}
    >
      {children}
    </button>
  )
}

function ToolbarSelect({ value, onChange, options }: {
  value: string
  onChange: (val: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="h-8 rounded-md border-none px-2 text-xs font-medium outline-none"
      style={{ backgroundColor: 'transparent', color: 'var(--color-text-secondary)' }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function Divider() {
  return <div className="mx-1 h-5 w-px" style={{ backgroundColor: 'var(--color-border)' }} />
}

/* ---- Icons (16x16 SVGs) ---- */

const s = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

function BoldIcon() { return <svg {...s}><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg> }
function ItalicIcon() { return <svg {...s}><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg> }
function UnderlineIcon() { return <svg {...s}><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg> }
function StrikeIcon() { return <svg {...s}><path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" y1="12" x2="20" y2="12"/></svg> }
function CodeIcon() { return <svg {...s}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> }
function BulletListIcon() { return <svg {...s}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="3" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="3" cy="18" r="1" fill="currentColor" stroke="none"/></svg> }
function OrderedListIcon() { return <svg {...s}><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="1" y="8" fontSize="7" fill="currentColor" stroke="none" fontFamily="system-ui">1</text><text x="1" y="14" fontSize="7" fill="currentColor" stroke="none" fontFamily="system-ui">2</text><text x="1" y="20" fontSize="7" fill="currentColor" stroke="none" fontFamily="system-ui">3</text></svg> }
function QuoteIcon() { return <svg {...s}><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg> }
function CodeBlockIcon() { return <svg {...s}><rect x="2" y="3" width="20" height="18" rx="2"/><polyline points="10 8 6 12 10 16"/><polyline points="14 8 18 12 14 16"/></svg> }
function HrIcon() { return <svg {...s}><line x1="3" y1="12" x2="21" y2="12"/></svg> }
function LinkIcon() { return <svg {...s}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> }
