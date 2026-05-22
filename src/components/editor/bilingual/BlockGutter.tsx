// Notion-style hover gutter for the bilingual editor.
//
// Renders a floating control rail (drag handle + "+") next to the
// bilingualBlock under the cursor, via TipTap's DragHandle portal.
// Dragging the handle reorders the whole EN/ID pair (the block is
// draggable + selectable; see nodes.ts). The "+" opens a block-type
// menu that inserts a fresh paired block after the current one — the
// chosen skeleton is seeded into BOTH language bodies, and the caret
// lands on the side matching the current cursor (EN by default).

import { useCallback, useRef, useState } from 'react'
import { DragHandle } from '@tiptap/extension-drag-handle-react'
import { TextSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { buildBlock, type InsertBlockType } from '../../../lib/documentDoc'

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
  const blockPosRef = useRef<number | null>(null)
  const blockSizeRef = useRef<number>(0)

  const onNodeChange = useCallback(
    ({ node, pos }: { node: PMNode | null; pos: number }) => {
      if (node && node.type.name === 'bilingualBlock') {
        blockPosRef.current = pos
        blockSizeRef.current = node.nodeSize
      }
      // Close the menu when the hovered block changes out from under it.
      setMenuOpen(false)
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

  return (
    <DragHandle editor={editor} onNodeChange={onNodeChange} className="block-gutter">
      <div className="block-gutter-rail">
        <button
          type="button"
          className="block-gutter-btn"
          title="Add block below"
          onClick={() => setMenuOpen(o => !o)}
          onMouseDown={e => e.preventDefault()}
        >
          <PlusIcon />
        </button>
        <span className="block-gutter-grip" title="Drag to move" aria-hidden>
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
