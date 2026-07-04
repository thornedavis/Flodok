// React NodeView for the `signatureBlock` node.
//
// An atom leaf — no editable content. It paints a live preview of the signature
// area by resolving the merge context (injected via extension.options.getContext,
// same as the letterhead node-view). In the editors getContext omits the actual
// signatures, so the block correctly previews its blank authoring state; on the
// portal the context carries the live/persisted signature so it previews signed.

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import type { MergeContext } from '../../../lib/mergeFields'
import { SignatureBlockContent, signatureAttrsFrom } from './SignatureBlockContent'

type SignatureBlockOptions = { getContext?: () => MergeContext }

const EMPTY_CTX: MergeContext = {}

export function SignatureBlockView({ node, extension, selected }: NodeViewProps) {
  const attrs = signatureAttrsFrom(node.attrs)
  const opts = extension.options as SignatureBlockOptions
  const ctx = opts.getContext?.() ?? EMPTY_CTX
  const lang = ctx.lang === 'id' ? 'id' : 'en'

  return (
    <NodeViewWrapper
      className="signature-block-wrap"
      data-signature-block="true"
      data-selected={selected ? '' : undefined}
      contentEditable={false}
    >
      <SignatureBlockContent attrs={attrs} ctx={ctx} lang={lang} />
    </NodeViewWrapper>
  )
}
