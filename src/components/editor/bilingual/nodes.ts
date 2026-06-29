// ProseMirror/TipTap node definitions for the bilingual block editor.
//
// Document tree (Phase C onward):
//
//   document
//   └── section+                  // ordered list of titled sections
//       ├── titleEn, titleId       (plain string attrs)
//       └── bilingualBlock+        // ordered list of paired translation units
//           └── blockBody{2}       // EXACTLY two children: lang=en then lang=id
//               └── block+         // standard rich content
//
// The block-body slot accepts paragraphs, h3/h4, bullet/ordered lists,
// tables, code blocks, and callouts (callout schema lives here too).
// Section titles are plain strings stored as attrs — simpler than nested
// rich-text title nodes and enough for every example doc we've seen.
//
// Stable IDs are generated client-side on insert. They're load-bearing
// for per-block dirty tracking and translation caching in Phase E, so
// every section and bilingualBlock gets one.

import { Node, mergeAttributes } from '@tiptap/core'

// ─── Root document ──────────────────────────────────────────────────
//
// Replaces TipTap's default `doc` node. Disable StarterKit's `document`
// extension when wiring this in so there's only one top-level node.

export const DocumentNode = Node.create({
  name: 'document',
  topNode: true,
  // Flat block stream — sections retired (see normalizeDoc). Clause
  // headers are now ordinary bilingualBlocks whose bodies hold an h2.
  // An optional full-width `letterhead` may lead the document (the org
  // letterhead header); everything below it is the bilingual body.
  content: 'letterhead? bilingualBlock+',
})

// ─── Letterhead ─────────────────────────────────────────────────────
//
// A full-width, language-neutral header region pinned to the top of a
// document (schema: `letterhead? bilingualBlock+`). Unlike a bilingualBlock
// it is NOT split into EN/ID columns — it spans the full width in both
// stacked and side-by-side modes. It holds the org logo (resolved live from
// the merge context by the node-view / renderers, never stored) plus aligned
// paragraphs/headings (company name + address, seeded as merge-field pills).
//
// It is deliberately invisible to the snapshot/translation pipeline and to
// docToMarkdown: both iterate ONLY `bilingualBlock` top-level nodes, so the
// letterhead renders as presentation chrome and never enters the signed text
// or the translation cache.

export type LetterheadAttrs = {
  showLogo: boolean
}

export const LetterheadNode = Node.create({
  name: 'letterhead',
  content: '(paragraph | heading)+',
  defining: true,
  isolating: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      // Supplied by DocumentEditor (from mergeFields.getContext) so the
      // node-view can resolve the current org logo. Undefined → no logo.
      getContext: undefined as undefined | (() => { organization?: { logo_url?: string | null } | null }),
    }
  },

  addAttributes() {
    return {
      showLogo: {
        default: true,
        parseHTML: el => el.getAttribute('data-show-logo') !== 'false',
        renderHTML: attrs => (attrs.showLogo ? {} : { 'data-show-logo': 'false' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-letterhead]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-letterhead': 'true', class: 'letterhead' }), 0]
  },
})

// ─── Bilingual block ────────────────────────────────────────────────
//
// The paired translation unit. Exactly two `blockBody` children — EN
// first, ID second — enforced by content expression. Side-by-side
// layout is purely CSS on the wrapper (`display: flex`); stacked
// layout is the same wrapper with `flex-direction: column`. The view
// toggle in Phase D swaps the layout class.

export type BilingualBlockAttrs = {
  id: string
  // Per-clause translation status — populated by the snapshot helper
  // in Phase E. Held here so the editor can surface a "needs review"
  // indicator without a sidecar table.
  needsReview: boolean
  // Clause-heading numbering. Only meaningful when the block is a
  // clause heading (its bodies hold an h2); drives the CSS section
  // counter prefix. `null` for ordinary blocks. Inherited from the
  // old section `numberingStyle` by normalizeDoc.
  numbering: 'decimal' | 'roman' | 'alpha' | 'none' | null
}

export const BilingualBlockNode = Node.create({
  name: 'bilingualBlock',
  group: 'block',
  content: 'blockBody blockBody',
  // The block as a whole isn't directly editable — only its body
  // children are (isolating keeps the caret inside a blockBody). But
  // it IS selectable + draggable so the gutter drag handle can grab
  // the whole EN/ID pair and reorder it as one unit.
  isolating: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: el => el.getAttribute('data-id'),
        renderHTML: attrs => attrs.id ? { 'data-id': attrs.id } : {},
      },
      needsReview: {
        default: false,
        parseHTML: el => el.getAttribute('data-needs-review') === 'true',
        renderHTML: attrs => attrs.needsReview ? { 'data-needs-review': 'true' } : {},
      },
      numbering: {
        default: null,
        parseHTML: el => el.getAttribute('data-numbering'),
        renderHTML: attrs => attrs.numbering ? { 'data-numbering': attrs.numbering } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-bilingual-block]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-bilingual-block': 'true', class: 'bilingual-block' }), 0]
  },
})

// ─── Block body ─────────────────────────────────────────────────────
//
// One side of a bilingualBlock — either EN or ID. Carries a `lang`
// attr that drives renderer styling, merge-field resolution, and
// (Phase E) per-body hashing for dirty tracking. Accepts standard
// block content: paragraph, h3/h4, lists, table, code block, callout.
// H1/H2 are deliberately excluded — those would be sections.

export type BlockBodyAttrs = {
  lang: 'en' | 'id'
}

export const BlockBodyNode = Node.create({
  name: 'blockBody',
  // Allowed block-level content inside a body slot. The set is
  // deliberately narrower than StarterKit's default (no h1/h2, no
  // blockquote for now) to keep the bilingual editor's rendering
  // predictable.
  content: '(paragraph | heading | bulletList | orderedList | table | codeBlock | callout)+',
  // A block body isn't a draggable block in its own right — it lives
  // inside a bilingualBlock and can't be moved independently.
  selectable: false,
  isolating: true,

  addAttributes() {
    return {
      lang: {
        default: 'en',
        parseHTML: el => (el.getAttribute('data-lang') === 'id' ? 'id' : 'en'),
        renderHTML: attrs => ({ 'data-lang': attrs.lang }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-block-body]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-block-body': 'true', class: 'block-body' }), 0]
  },
})

// ─── Callout ────────────────────────────────────────────────────────
//
// An emphasis block — "Note", "Warning", "Important", etc. — that
// renders with a colored band and an icon. Variants are a small fixed
// set so the renderer (Phase D) can map them to predictable styles.

export type CalloutVariant = 'info' | 'warning' | 'success' | 'danger'
export const CALLOUT_VARIANTS: CalloutVariant[] = ['info', 'warning', 'success', 'danger']

export type CalloutAttrs = {
  variant: CalloutVariant
}

export const CalloutNode = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: 'info' as CalloutVariant,
        parseHTML: el => {
          const v = el.getAttribute('data-variant')
          return CALLOUT_VARIANTS.includes(v as CalloutVariant) ? v : 'info'
        },
        renderHTML: attrs => ({ 'data-variant': attrs.variant }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': 'true', class: 'callout' }), 0]
  },
})

// Re-export the doc builders from the shared library so editor users
// have one import surface for both schema and empty-state factories.
export { emptyDocumentDoc, emptyBlock, emptySection, newSectionId, newBlockId } from '../../../lib/documentDoc'
