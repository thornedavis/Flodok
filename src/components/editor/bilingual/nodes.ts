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
  content: 'section+',
})

// ─── Section ────────────────────────────────────────────────────────
//
// A titled run of bilingual blocks. Titles are plain strings (one per
// language) carried as attrs; the section header renders editable
// `<input>` fields wired to those attrs in the NodeView.

export type SectionAttrs = {
  id: string
  titleEn: string
  titleId: string
  // Visual style — all optional; renderer applies defaults when omitted.
  // Wired into the schema now so future authoring UI can flip these
  // attrs without a schema migration.
  accentColor: string | null
  numberingStyle: 'decimal' | 'roman' | 'alpha' | 'none'
  boxed: boolean
}

export const SectionNode = Node.create({
  name: 'section',
  group: 'block',
  content: 'bilingualBlock+',
  // Sections aren't selectable as a block — the title fields and child
  // blocks own the cursor. This prevents the user from accidentally
  // backspacing a whole section away when navigating between titles.
  selectable: false,
  // But they ARE draggable (Phase D will add reorder handles).
  draggable: false,

  addAttributes() {
    return {
      id: {
        default: null,
        // Auto-fill when a section is inserted without an id.
        parseHTML: el => el.getAttribute('data-id'),
        renderHTML: attrs => attrs.id ? { 'data-id': attrs.id } : {},
      },
      titleEn: {
        default: '',
        parseHTML: el => el.getAttribute('data-title-en') || '',
        renderHTML: attrs => ({ 'data-title-en': attrs.titleEn }),
      },
      titleId: {
        default: '',
        parseHTML: el => el.getAttribute('data-title-id') || '',
        renderHTML: attrs => ({ 'data-title-id': attrs.titleId }),
      },
      accentColor: {
        default: null,
        parseHTML: el => el.getAttribute('data-accent-color'),
        renderHTML: attrs => attrs.accentColor ? { 'data-accent-color': attrs.accentColor } : {},
      },
      numberingStyle: {
        default: 'decimal',
        parseHTML: el => el.getAttribute('data-numbering') || 'decimal',
        renderHTML: attrs => ({ 'data-numbering': attrs.numberingStyle }),
      },
      boxed: {
        default: false,
        parseHTML: el => el.getAttribute('data-boxed') === 'true',
        renderHTML: attrs => attrs.boxed ? { 'data-boxed': 'true' } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'section[data-bilingual-section]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['section', mergeAttributes(HTMLAttributes, { 'data-bilingual-section': 'true' }), 0]
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
}

export const BilingualBlockNode = Node.create({
  name: 'bilingualBlock',
  group: 'block',
  content: 'blockBody blockBody',
  // The block as a whole isn't directly editable — only its body
  // children are. Treating it as a "node selection" prevents the
  // caret from landing on the wrapper itself.
  isolating: true,
  selectable: false,

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
