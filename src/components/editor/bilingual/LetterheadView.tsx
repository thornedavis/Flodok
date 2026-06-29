// React NodeView for the `letterhead` node.
//
// Renders the org logo (resolved live from the merge context — never stored
// in the doc, so it always reflects the current Company-settings logo) above
// the editable content. The logo region is contentEditable=false so the caret
// can't land in it; the company name / address paragraphs live in the
// editable <NodeViewContent />. Full-width is automatic — the letterhead is a
// top-level block, not one of the two bilingual columns.

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import type { MergeContext } from '../../../lib/mergeFields'

type LetterheadOptions = { getContext?: () => MergeContext }

export function LetterheadView({ node, extension }: NodeViewProps) {
  const showLogo = node.attrs.showLogo !== false
  const opts = extension.options as LetterheadOptions
  const logoUrl = showLogo ? (opts.getContext?.().organization?.logo_url ?? null) : null

  return (
    <NodeViewWrapper className="letterhead-wrap" data-letterhead="true">
      {logoUrl && (
        <div className="letterhead-logo" contentEditable={false}>
          <img src={logoUrl} alt="" />
        </div>
      )}
      <NodeViewContent className="letterhead-content" />
    </NodeViewWrapper>
  )
}
