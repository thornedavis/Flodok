// MergeField TipTap node — renders {{key}} tokens as inline pills inside the
// bilingual editor. The pill resolves and displays the *value* via a
// context getter passed in via extension options. That way a contract
// template like
//
//   "Wage: {{base_wage_idr}}"
//
// renders as a pill showing "Rp 3,400,000" while editing, and serializes
// back to the same `{{base_wage_idr}}` token on save. The
// BilingualMergeField extension in `./bilingual` extends this with
// per-blockBody language resolution.
//
// (Pre-Phase-G this node also round-tripped through @tiptap/markdown.
// That path was removed alongside the legacy markdown SOPEditor — the
// bilingual editor stores content_doc directly, so no markdown
// serialisation is needed inside the editor extension.)

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import {
  MERGE_FIELDS,
  isMergeFieldKey,
  resolveMergeField,
  type MergeContext,
  type MergeFieldKey,
} from '../../lib/mergeFields'

export type MergeFieldOptions = {
  // Called by the node view to resolve the displayed value. Returning a fresh
  // object each call keeps the pill in sync with the latest form state.
  getContext: () => MergeContext
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mergeField: {
      insertMergeField: (key: MergeFieldKey) => ReturnType
    }
  }
}

export const MergeFieldExtension = Node.create<MergeFieldOptions>({
  name: 'mergeField',

  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return {
      getContext: () => ({}),
    }
  },

  addAttributes() {
    return {
      key: {
        default: '',
        parseHTML: el => el.getAttribute('data-merge-key') ?? '',
        renderHTML: attrs => {
          const key = attrs.key as string
          return key ? { 'data-merge-key': key } : {}
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-merge-field]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const key = node.attrs.key as string
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-merge-field': '',
        class: 'merge-field-pill',
      }),
      `{{${key}}}`,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MergeFieldView)
  },

  addCommands() {
    return {
      insertMergeField: (key: MergeFieldKey) => ({ commands }) => {
        if (!isMergeFieldKey(key)) return false
        return commands.insertContent({
          type: this.name,
          attrs: { key },
        })
      },
    }
  },

})

// ─── React node view ────────────────────────────────────────────────────────

function MergeFieldView({ node, extension, selected }: NodeViewProps) {
  const key = node.attrs.key as MergeFieldKey
  const opts = extension.options as MergeFieldOptions
  const ctx = opts.getContext()

  const def = isMergeFieldKey(key) ? MERGE_FIELDS[key] : null
  const lang = ctx.lang ?? 'en'

  const display = def
    ? (def.editorDisplay ? def.editorDisplay(ctx, lang) : resolveMergeField(key, ctx))
    : `[unknown: ${key}]`

  const label = def ? def.label[lang] : 'Unknown field'

  return (
    <NodeViewWrapper
      as="span"
      className="merge-field-pill"
      data-selected={selected ? '' : undefined}
      title={`${label} → ${display}`}
    >
      {display}
    </NodeViewWrapper>
  )
}

// ─── Stylesheet ────────────────────────────────────────────────────────────
//
// Exported so the host editor component can include it once. Inline pill
// styling that adapts to the editor's color tokens.

export const MERGE_FIELD_STYLES = `
  .merge-field-pill {
    display: inline-block;
    padding: 0.05em 0.45em;
    margin: 0 0.05em;
    border-radius: 0.35em;
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    color: var(--color-primary);
    border: 1px solid color-mix(in srgb, var(--color-primary) 35%, transparent);
    font-size: 0.92em;
    font-weight: 500;
    white-space: nowrap;
    cursor: default;
    user-select: all;
    line-height: 1.3;
  }
  .merge-field-pill[data-selected] {
    background: color-mix(in srgb, var(--color-primary) 25%, transparent);
    border-color: var(--color-primary);
  }
`
