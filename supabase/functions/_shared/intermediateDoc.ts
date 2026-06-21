// Shared "intermediate doc" shape + converter.
//
// LLMs reliably emit a *simplified* bilingual shape — sections with EN/ID
// titles and an array of blocks, each block carrying parallel EN and ID
// paragraphs as plain strings — far more reliably than exact ProseMirror
// node JSON (attrs, ids, marks). We let the model produce that shape and
// own the structural correctness here, server-side.
//
// Both `generate-document` (free-text → doc) and `analyse-document`
// (uploaded file → doc) target this identical shape, so the conversion
// lives here once. Sections are emitted as `section` nodes; the editor
// normalises them into its flat block stream on load.

import type { DocNode, DocumentDoc } from './documentDoc.ts'

export type IntermediateBlock = {
  en: string[]
  id: string[]
}

export type IntermediateSection = {
  titleEn: string
  titleId: string
  blocks: IntermediateBlock[]
}

export type IntermediateDoc = {
  sections: IntermediateSection[]
}

function newId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10)
  const time = Date.now().toString(36).slice(-4)
  return `${prefix}_${time}${random}`
}

function paraNode(textValue: string): DocNode {
  const trimmed = textValue.trim()
  if (!trimmed) return { type: 'paragraph' }
  return { type: 'paragraph', content: [{ type: 'text', text: trimmed }] }
}

export function intermediateToDocumentDoc(input: IntermediateDoc): DocumentDoc {
  const sections: DocNode[] = []
  const rawSections = Array.isArray(input.sections) ? input.sections : []
  for (const s of rawSections) {
    if (!s || typeof s !== 'object') continue
    const titleEn = typeof s.titleEn === 'string' ? s.titleEn.trim() : ''
    const titleId = typeof s.titleId === 'string' ? s.titleId.trim() : ''
    const rawBlocks = Array.isArray(s.blocks) ? s.blocks : []
    const blocks: DocNode[] = []
    for (const b of rawBlocks) {
      if (!b || typeof b !== 'object') continue
      const enParas = Array.isArray(b.en) ? b.en.filter(p => typeof p === 'string') : []
      const idParas = Array.isArray(b.id) ? b.id.filter(p => typeof p === 'string') : []
      // Pad shorter side with empty paragraphs so the bilingual block
      // always has *some* content on both sides — the editor expects
      // both blockBody children to be present.
      const enContent = (enParas.length > 0 ? enParas : ['']).map(paraNode)
      const idContent = (idParas.length > 0 ? idParas : ['']).map(paraNode)
      blocks.push({
        type: 'bilingualBlock',
        attrs: { id: newId('blk'), needsReview: false },
        content: [
          { type: 'blockBody', attrs: { lang: 'en' }, content: enContent },
          { type: 'blockBody', attrs: { lang: 'id' }, content: idContent },
        ],
      })
    }
    // A section needs at least one block; skip empty sections so the
    // editor doesn't render placeholder rows.
    if (blocks.length === 0) continue
    sections.push({
      type: 'section',
      attrs: {
        id: newId('sec'),
        titleEn,
        titleId,
        accentColor: null,
        numberingStyle: 'decimal',
        boxed: false,
      },
      content: blocks,
    })
  }
  return { type: 'document', content: sections }
}
