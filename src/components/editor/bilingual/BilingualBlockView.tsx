// React NodeView for the `bilingualBlock` node.
//
// The block previously rendered as a plain styled `<div>` (CSS-only).
// We're upgrading to a React NodeView so we can surface the
// `needsReview` flag set by the snapshot helper when both EN and ID
// sides are edited in the same save — together with a "Mark resolved"
// action that clears the flag once the user has confirmed both
// translations are consistent.
//
// The two `blockBody` children render inside `<NodeViewContent />`;
// the side-by-side / stacked grid layout that was on the wrapper
// before now lives on the `.bilingual-block-bodies` inner div so the
// banner can sit above it without disturbing the grid.

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import type { BilingualBlockAttrs } from '../../../lib/documentDoc'

export function BilingualBlockView({ node, updateAttributes }: NodeViewProps) {
  const attrs = node.attrs as BilingualBlockAttrs
  // The optional review banner is a sibling of the grid (not a grid
  // item) so the two blockBody children stay direct children of the
  // grid element — keeps side-by-side layout simple and robust to
  // whatever wrapper TipTap inserts for content slots.
  return (
    <NodeViewWrapper
      className="bilingual-block-wrap"
      data-id={attrs.id}
      data-needs-review={attrs.needsReview ? 'true' : undefined}
      data-numbering={attrs.numbering ?? undefined}
    >
      {attrs.needsReview && (
        <div className="bilingual-block-review-banner" contentEditable={false}>
          <div className="bilingual-block-review-message">
            <ReviewIcon />
            <span>Both languages were edited in the same save — review and confirm.</span>
          </div>
          <button
            type="button"
            onClick={() => updateAttributes({ needsReview: false })}
            className="bilingual-block-review-resolve"
          >
            Mark resolved
          </button>
        </div>
      )}
      <NodeViewContent className="bilingual-block" />
    </NodeViewWrapper>
  )
}

function ReviewIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )
}
