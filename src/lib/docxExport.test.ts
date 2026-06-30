import { describe, it, expect } from 'vitest'
import { Packer } from 'docx'
import { assembleDocxDocument } from './docxExport'
import type { DocumentDoc, DocNode } from './documentDoc'
import type { MergeContext } from './mergeFields'

// Smoke test: build the Document and actually pack it. `docx` validates
// structure at pack time (cells must end in a paragraph, numbering refs must
// exist, etc.), so a non-empty buffer with no throw means the serializer
// produced a well-formed .docx. No letterhead/logo here so it stays Node-safe
// (no canvas/Image), and the merge field resolves to plain text (no DOMParser).

function body(lang: 'en' | 'id', content: DocNode[]): DocNode {
  return { type: 'blockBody', attrs: { lang }, content }
}

const doc: DocumentDoc = {
  type: 'document',
  content: [
    {
      type: 'bilingualBlock',
      attrs: { id: 'b1', needsReview: false, numbering: null },
      content: [
        body('en', [
          { type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [{ type: 'text', text: 'Article 1' }] },
          { type: 'paragraph', attrs: { textAlign: 'justify' }, content: [
            { type: 'text', text: 'Bold ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'and italic ', marks: [{ type: 'italic' }] },
            { type: 'mergeField', attrs: { key: 'org_name' } },
            { type: 'hardBreak' },
            { type: 'text', text: 'second line' },
          ] },
          { type: 'orderedList', content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }] },
          ] },
          { type: 'table', content: [
            { type: 'tableRow', content: [
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Key' }] }] },
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Value' }] }] },
            ] },
          ] },
          { type: 'callout', attrs: { variant: 'info' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'note' }] }] },
        ]),
        body('id', [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Pasal 1' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'isi pasal' }] },
        ]),
      ],
    },
  ],
}

const ctx = { organization: { name: 'Test Co' } } as unknown as MergeContext

async function packLength(view: 'stacked' | 'side_by_side', mode: 'bilingual' | 'en' | 'id'): Promise<number> {
  const document = await assembleDocxDocument({
    doc,
    title: 'Test Contract',
    view,
    contextEn: { ...ctx, lang: 'en' },
    contextId: { ...ctx, lang: 'id' },
    languageMode: mode,
  })
  const buf = await Packer.toBuffer(document)
  return buf.length
}

describe('docx export', () => {
  it('packs a valid side-by-side bilingual document', async () => {
    expect(await packLength('side_by_side', 'bilingual')).toBeGreaterThan(1000)
  })

  it('packs a valid stacked bilingual document', async () => {
    expect(await packLength('stacked', 'bilingual')).toBeGreaterThan(1000)
  })

  it('packs a valid single-language document', async () => {
    expect(await packLength('side_by_side', 'en')).toBeGreaterThan(1000)
  })

  it('packs an ordered list interrupted by a bullet sub-list (shared numbering)', async () => {
    const interrupted: DocumentDoc = {
      type: 'document',
      content: [{
        type: 'bilingualBlock',
        attrs: { id: 'b', needsReview: false, numbering: null },
        content: [
          body('en', [
            { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'wage of:' }] }] }] },
            { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Basic salary' }] }] }] },
            { type: 'orderedList', content: [
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'tax' }] }] },
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'payment' }] }] },
            ] },
          ]),
          body('id', [{ type: 'paragraph', content: [{ type: 'text', text: 'isi' }] }]),
        ],
      }],
    }
    const document = await assembleDocxDocument({ doc: interrupted, title: 'T', view: 'stacked', contextEn: { ...ctx, lang: 'en' }, languageMode: 'en' })
    expect((await Packer.toBuffer(document)).length).toBeGreaterThan(1000)
  })
})
