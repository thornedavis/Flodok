// Bilingual-aware variant of the MergeField pill.
//
// The base MergeFieldExtension takes a `lang` off the context returned
// by `getContext()` — fine when the host editor only renders one
// language at a time. The new DocumentEditor renders EN and ID block
// bodies side-by-side, so the same pill needs to display its EN value
// inside an EN body and its ID value inside an ID body. We override
// the NodeView to walk up the doc and read the parent `blockBody`
// node's `lang` attr, overriding whatever `ctx.lang` was set to.
//
// The serialization, schema, and insert command are inherited
// unchanged from MergeFieldExtension — only the rendered pill changes.

import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { MergeFieldExtension } from '../MergeField'
import {
  MERGE_FIELDS,
  isMergeFieldKey,
  resolveMergeField,
  type MergeContext,
  type Lang,
  type MergeFieldKey,
} from '../../../lib/mergeFields'

type MergeFieldOptions = {
  getContext: () => MergeContext
}

function BilingualMergeFieldView({ node, extension, editor, getPos, selected }: NodeViewProps) {
  const key = node.attrs.key as MergeFieldKey
  const opts = extension.options as MergeFieldOptions
  const baseCtx = opts.getContext()

  // Walk up the resolved position to find the enclosing blockBody and
  // its `lang` attr. Falls back to ctx.lang (then 'en') if the pill is
  // somehow outside a blockBody — shouldn't happen since blockBody is
  // the only editable region in the schema, but the guard keeps the
  // pill from crashing if the schema changes.
  let bodyLang: Lang | null = null
  if (editor && typeof getPos === 'function') {
    const pos = getPos()
    if (typeof pos === 'number') {
      const $pos = editor.state.doc.resolve(pos)
      for (let d = $pos.depth; d > 0; d--) {
        const ancestor = $pos.node(d)
        if (ancestor.type.name === 'blockBody') {
          const raw = ancestor.attrs.lang
          if (raw === 'en' || raw === 'id') bodyLang = raw
          break
        }
      }
    }
  }

  const lang: Lang = bodyLang ?? baseCtx.lang ?? 'en'
  const ctx: MergeContext = { ...baseCtx, lang }

  const def = isMergeFieldKey(key) ? MERGE_FIELDS[key] : null
  const display = def
    ? (def.editorDisplay ? def.editorDisplay(ctx, lang) : resolveMergeField(key, ctx))
    : `[unknown: ${key}]`
  const label = def ? def.label[lang] : 'Unknown field'

  return (
    <NodeViewWrapper
      as="span"
      className="merge-field-pill"
      data-selected={selected ? '' : undefined}
      data-lang={lang}
      title={`${label} → ${display}`}
    >
      {display}
    </NodeViewWrapper>
  )
}

// Extend the base extension with the bilingual-aware NodeView. Schema
// (atom, inline, attrs, parse/render HTML) and the
// `insertMergeField` command come along unchanged from the base.
export const BilingualMergeFieldExtension = MergeFieldExtension.extend({
  addNodeView() {
    return ReactNodeViewRenderer(BilingualMergeFieldView)
  },
})
