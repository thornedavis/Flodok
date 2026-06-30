// Notion-style hover gutter for the bilingual editor.
//
// Renders a floating control rail (drag handle + "+") next to the
// bilingualBlock under the cursor, via TipTap's DragHandle portal.
// Dragging the handle reorders the whole EN/ID pair (the block is
// draggable + selectable; see nodes.ts). The "+" opens a block-type
// menu that inserts a fresh paired block after the current one — the
// chosen skeleton is seeded into BOTH language bodies, and the caret
// lands on the side matching the current cursor (EN by default).
//
// Clicking the grip selects the whole pair (a ProseMirror NodeSelection,
// styled via .ProseMirror-selectednode on the NodeView wrapper) and opens
// a block-actions menu — Duplicate / Move up / Move down / Delete. Delete
// is the only way to remove a block; the last remaining bilingualBlock is
// replaced with a fresh empty one rather than left as an invalid empty
// document (the schema is `letterhead? bilingualBlock+`). The optional leading
// `letterhead` gets a trimmed menu (Remove only) — it can't be duplicated or
// moved off the top, and nothing else may move above it.

import { useCallback, useRef, useState } from 'react'
import { DragHandle } from '@tiptap/extension-drag-handle-react'
import { TextSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { buildBlock, emptyBlock, newBlockId, type InsertBlockType } from '../../../lib/documentDoc'

const MENU_ITEMS: { type: InsertBlockType; label: string; hint: string }[] = [
  { type: 'text', label: 'Text', hint: 'Plain paragraph' },
  { type: 'h2', label: 'Heading', hint: 'Numbered clause' },
  { type: 'h3', label: 'Subheading', hint: 'Section sub-title' },
  { type: 'h4', label: 'Small heading', hint: '' },
  { type: 'bulletList', label: 'Bulleted list', hint: '' },
  { type: 'orderedList', label: 'Numbered list', hint: '' },
  { type: 'table', label: 'Table', hint: 'Key/value or grid' },
  { type: 'callout', label: 'Callout', hint: 'Highlighted note' },
]

function currentLang(editor: Editor): 'en' | 'id' {
  const { $from } = editor.state.selection
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d)
    if (n.type.name === 'blockBody') return n.attrs?.lang === 'id' ? 'id' : 'en'
  }
  return 'en'
}

// Text position inside the chosen language body of the bilingualBlock
// that starts at `blockStart`. Walks the two blockBody children by
// node size; the caller snaps to the nearest valid text position.
function langBodyPos(blockNode: PMNode, blockStart: number, lang: 'en' | 'id'): number {
  let cursor = blockStart + 1 // step inside the bilingualBlock
  for (let i = 0; i < blockNode.childCount; i++) {
    const child = blockNode.child(i)
    if (child.attrs?.lang === lang) return cursor + 1 // inside this body
    cursor += child.nodeSize
  }
  return blockStart + 1
}

export function BlockGutter({ editor }: { editor: Editor }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  // The full-width letterhead gets a trimmed actions menu (Remove only) — it
  // can't be duplicated or moved off the top of the document.
  const [actionsLetterhead, setActionsLetterhead] = useState(false)
  const blockPosRef = useRef<number | null>(null)
  const blockSizeRef = useRef<number>(0)

  const onNodeChange = useCallback(
    ({ node, pos }: { node: PMNode | null; pos: number }) => {
      if (node && (node.type.name === 'bilingualBlock' || node.type.name === 'letterhead')) {
        blockPosRef.current = pos
        blockSizeRef.current = node.nodeSize
      }
      // Close any open menu when the hovered block changes out from under it.
      setMenuOpen(false)
      setActionsOpen(false)
    },
    [],
  )

  const insert = useCallback(
    (type: InsertBlockType) => {
      const pos = blockPosRef.current
      if (pos == null) return
      const lang = currentLang(editor)
      const insertAt = pos + blockSizeRef.current // right after the hovered pair
      const block = buildBlock(type)

      editor.chain().insertContentAt(insertAt, block).run()

      // Move the caret into the matching language body of the new block.
      const newNode = editor.state.doc.nodeAt(insertAt)
      if (newNode) {
        const target = langBodyPos(newNode, insertAt, lang)
        const sel = TextSelection.near(editor.state.doc.resolve(target))
        editor.view.dispatch(editor.state.tr.setSelection(sel).scrollIntoView())
      }
      editor.view.focus()
      setMenuOpen(false)
    },
    [editor],
  )

  // Re-read the hovered block fresh at action time — the cached pos can
  // go stale after edits, so every action validates the node type first.
  const blockAt = useCallback((): { pos: number; node: PMNode } | null => {
    const pos = blockPosRef.current
    if (pos == null) return null
    const node = editor.state.doc.nodeAt(pos)
    if (!node || (node.type.name !== 'bilingualBlock' && node.type.name !== 'letterhead')) return null
    return { pos, node }
  }, [editor])

  // Grip click: select the whole EN/ID pair (drives the .selectednode
  // outline) and toggle the actions menu. We deliberately do NOT
  // preventDefault on the grip's mousedown (unlike the "+"), so the
  // DragHandle can still start a drag; a plain click falls through here.
  const openActions = useCallback(() => {
    const pos = blockPosRef.current
    if (pos == null) return
    setActionsLetterhead(editor.state.doc.nodeAt(pos)?.type.name === 'letterhead')
    editor.chain().setNodeSelection(pos).run()
    setMenuOpen(false)
    setActionsOpen(o => !o)
  }, [editor])

  const duplicate = useCallback(() => {
    const found = blockAt()
    if (!found || found.node.type.name === 'letterhead') return // only one letterhead
    const { pos, node } = found
    // Clone the pair but regenerate the id — it's load-bearing for
    // per-block dirty tracking / translation caching, so duplicates must
    // not share it.
    const json = node.toJSON()
    const copy = { ...json, attrs: { ...json.attrs, id: newBlockId() } }
    const insertAt = pos + node.nodeSize
    editor.chain().insertContentAt(insertAt, copy).setNodeSelection(insertAt).run()
    setActionsOpen(false)
  }, [editor, blockAt])

  const moveUp = useCallback(() => {
    const pos = blockPosRef.current
    if (pos == null) return
    const $pos = editor.state.doc.resolve(pos)
    const node = $pos.nodeAfter
    const prev = $pos.nodeBefore
    if (!node || !prev) return // already first
    // The letterhead can't move, and nothing may move above it.
    if (node.type.name === 'letterhead' || prev.type.name === 'letterhead') return
    const prevStart = pos - prev.nodeSize
    // Delete self, re-insert above the previous sibling. The insert point
    // (prevStart) sits before the deleted range, so it isn't remapped.
    editor.chain()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .insertContentAt(prevStart, node.toJSON())
      .setNodeSelection(prevStart)
      .run()
    setActionsOpen(false)
  }, [editor])

  const moveDown = useCallback(() => {
    const pos = blockPosRef.current
    if (pos == null) return
    const $pos = editor.state.doc.resolve(pos)
    const node = $pos.nodeAfter
    if (!node || node.type.name === 'letterhead') return // the letterhead stays at the top
    const nextStart = pos + node.nodeSize
    const next = editor.state.doc.nodeAt(nextStart)
    if (!next) return // already last
    // Pull the next sibling up above self (equivalent to moving self down).
    // The insert point (pos) is before the deleted next-range, so stable.
    editor.chain()
      .deleteRange({ from: nextStart, to: nextStart + next.nodeSize })
      .insertContentAt(pos, next.toJSON())
      .setNodeSelection(pos + next.nodeSize)
      .run()
    setActionsOpen(false)
  }, [editor])

  const remove = useCallback(() => {
    const found = blockAt()
    if (!found) return
    const { pos, node } = found
    const range = { from: pos, to: pos + node.nodeSize }
    // The letterhead is optional, so it's just removed. A bilingualBlock can't
    // be deleted into an empty (schema-invalid) doc, so the last one is swapped
    // for a fresh empty block instead.
    if (node.type.name === 'bilingualBlock' && editor.state.doc.childCount <= 1) {
      editor.chain().insertContentAt(range, emptyBlock()).run()
    } else {
      editor.chain().deleteRange(range).run()
    }
    setActionsOpen(false)
  }, [editor, blockAt])

  return (
    <DragHandle editor={editor} onNodeChange={onNodeChange} className="block-gutter">
      <div className="block-gutter-rail">
        <button
          type="button"
          className="block-gutter-btn"
          title="Add block below"
          onClick={() => { setActionsOpen(false); setMenuOpen(o => !o) }}
          onMouseDown={e => e.preventDefault()}
        >
          <PlusIcon />
        </button>
        {/* Span (not button) so the DragHandle's native drag still
            starts from here — a plain click (no drag) opens the menu. */}
        <span
          className="block-gutter-grip"
          role="button"
          aria-label="Block actions"
          title="Click for actions · drag to move"
          onClick={openActions}
        >
          <GripIcon />
        </span>
      </div>
      {menuOpen && (
        <div className="block-gutter-menu" role="menu">
          <div className="block-gutter-menu-label">Add block</div>
          {MENU_ITEMS.map(item => (
            <button
              key={item.type}
              type="button"
              role="menuitem"
              className="block-gutter-menu-item"
              onMouseDown={e => e.preventDefault()}
              onClick={() => insert(item.type)}
            >
              <span className="block-gutter-menu-item-label">{item.label}</span>
              {item.hint && <span className="block-gutter-menu-item-hint">{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
      {actionsOpen && (
        <div className="block-gutter-menu" role="menu">
          <div className="block-gutter-menu-label">{actionsLetterhead ? 'Letterhead' : 'Block'}</div>
          {!actionsLetterhead && (
            <>
              <button
                type="button"
                role="menuitem"
                className="block-gutter-menu-action"
                onMouseDown={e => e.preventDefault()}
                onClick={duplicate}
              >
                <DuplicateIcon /><span>Duplicate</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="block-gutter-menu-action"
                onMouseDown={e => e.preventDefault()}
                onClick={moveUp}
              >
                <MoveUpIcon /><span>Move up</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="block-gutter-menu-action"
                onMouseDown={e => e.preventDefault()}
                onClick={moveDown}
              >
                <MoveDownIcon /><span>Move down</span>
              </button>
              <div className="block-gutter-menu-sep" />
            </>
          )}
          <button
            type="button"
            role="menuitem"
            className="block-gutter-menu-action is-danger"
            onMouseDown={e => e.preventDefault()}
            onClick={remove}
          >
            <TrashIcon /><span>{actionsLetterhead ? 'Remove letterhead' : 'Delete'}</span>
          </button>
        </div>
      )}
    </DragHandle>
  )
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" />
    </svg>
  )
}

function DuplicateIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function MoveUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  )
}

function MoveDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}
