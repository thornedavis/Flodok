import { describe, it, expect } from 'vitest'
import { normalizeDoc, stripDefaultTextAlign, letterheadBlock, withLetterhead, type DocNode, type DocumentDoc, type SectionAttrs } from './documentDoc'
import { buildPkwtStarterDoc } from './pkwtStarterDoc'

// Inline legacy (section-nested) fixture. The real starters now emit
// flat docs (they run their authored sections through normalizeDoc), so
// the normalizer is tested against a hand-built section-nested doc that
// represents what older saved documents look like in the DB.
function legacyBlock(id: string, en: string, idText: string): DocNode {
  return {
    type: 'bilingualBlock',
    attrs: { id, needsReview: false },
    content: [
      { type: 'blockBody', attrs: { lang: 'en' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: en }] }] },
      { type: 'blockBody', attrs: { lang: 'id' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: idText }] }] },
    ],
  }
}

function legacySection(id: string, titleEn: string, titleId: string, numberingStyle: SectionAttrs['numberingStyle'], blocks: DocNode[]): DocNode {
  return {
    type: 'section',
    attrs: { id, titleEn, titleId, accentColor: null, numberingStyle, boxed: false },
    content: blocks,
  }
}

function buildLegacyDoc(): DocumentDoc {
  return {
    type: 'document',
    content: [
      legacySection('sec_a', 'Parties', 'Para Pihak', 'decimal', [
        legacyBlock('blk_a1', 'This agreement is between…', 'Perjanjian ini antara…'),
        legacyBlock('blk_a2', 'First party…', 'Pihak pertama…'),
      ]),
      legacySection('sec_b', 'Term', 'Jangka Waktu', 'roman', [
        legacyBlock('blk_b1', 'The term is…', 'Jangka waktunya…'),
      ]),
    ],
  }
}

function clauseHeadingTexts(doc: DocumentDoc, lang: 'en' | 'id'): string[] {
  const out: string[] = []
  for (const block of doc.content || []) {
    if (block.type !== 'bilingualBlock') continue
    const body = (block.content || []).find(b => b.type === 'blockBody' && b.attrs?.lang === lang)
    const first = body?.content?.[0]
    if (first?.type === 'heading' && first.attrs?.level === 2) {
      out.push((first.content || []).map(t => t.text || '').join('').trim())
    }
  }
  return out
}

function countType(doc: DocumentDoc, type: string): number {
  return (doc.content || []).filter(n => n.type === type).length
}

describe('normalizeDoc', () => {
  it('flattens a section-nested doc into a block stream with no section nodes', () => {
    const legacy = buildLegacyDoc()
    expect(countType(legacy, 'section')).toBeGreaterThan(0)

    const flat = normalizeDoc(legacy)
    expect(countType(flat, 'section')).toBe(0)
    expect((flat.content || []).every(n => n.type === 'bilingualBlock')).toBe(true)
  })

  it('preserves the running section count: one clause heading per section, same order', () => {
    const flat = normalizeDoc(buildLegacyDoc())
    // A clause-heading block is emitted for every section, so the count
    // the CSS counter sees is byte-identical to the section-based output.
    expect(clauseHeadingTexts(flat, 'en')).toEqual(['Parties', 'Term'])
    expect(clauseHeadingTexts(flat, 'id')).toEqual(['Para Pihak', 'Jangka Waktu'])
  })

  it('carries each section numberingStyle onto its clause-heading block', () => {
    const flat = normalizeDoc(buildLegacyDoc())
    const headingNumberings = (flat.content || [])
      .filter((b: DocNode) => (b.content || []).find(c => c.attrs?.lang === 'en')?.content?.[0]?.type === 'heading')
      .map((b: DocNode) => b.attrs?.numbering)
    expect(headingNumberings).toEqual(['decimal', 'roman'])
  })

  it('keeps every section child block, in order, after its heading', () => {
    const flat = normalizeDoc(buildLegacyDoc())
    const ids = (flat.content || []).map(b => b.attrs?.id)
    // heading(sec_a), blk_a1, blk_a2, heading(sec_b), blk_b1
    expect(ids).toEqual(['sec_a', 'blk_a1', 'blk_a2', 'sec_b', 'blk_b1'])
  })

  it('is idempotent: normalizing flat output again is a no-op', () => {
    const once = normalizeDoc(buildLegacyDoc())
    const twice = normalizeDoc(once)
    expect(twice).toEqual(once)
  })

  it('returns an empty document for non-document input', () => {
    expect(normalizeDoc(null)).toEqual({ type: 'document', content: [] })
    expect(normalizeDoc({ foo: 'bar' })).toEqual({ type: 'document', content: [] })
  })

  it('the PKWTT starter is already flat (no section nodes) and has numbered clause headings', () => {
    const starter = buildPkwtStarterDoc('pkwtt')
    expect(countType(starter, 'section')).toBe(0)
    // The starter now leads with a full-width letterhead; everything below it
    // is the flat bilingual body, closing with author-placed signature blocks.
    expect(starter.content?.[0]?.type).toBe('letterhead')
    expect((starter.content || []).slice(1).every(n => n.type === 'bilingualBlock' || n.type === 'signatureBlock')).toBe(true)
    expect(clauseHeadingTexts(starter, 'en').length).toBeGreaterThan(0)
  })
})

describe('letterhead', () => {
  it('letterheadBlock seeds a logo header with plain centered text (no merge-field pills / language tags)', () => {
    const lh = letterheadBlock()
    expect(lh.type).toBe('letterhead')
    expect(lh.attrs?.showLogo).toBe(true)
    // A heading line + a subtext line, both centered, both empty for the user
    // to write — and crucially NO merge fields (those resolve org fields and
    // carried the confusing country-code value).
    expect((lh.content || []).map(n => n.type)).toEqual(['heading', 'paragraph'])
    expect((lh.content || []).every(n => (n.attrs as { textAlign?: string })?.textAlign === 'center')).toBe(true)
    const hasMergeField = (lh.content || []).some(n => (n.content || []).some(c => c.type === 'mergeField'))
    expect(hasMergeField).toBe(false)
  })

  it('withLetterhead prepends a letterhead and is idempotent', () => {
    const doc: DocumentDoc = {
      type: 'document',
      content: [{
        type: 'bilingualBlock',
        attrs: { id: 'b', needsReview: false, numbering: null },
        content: [
          { type: 'blockBody', attrs: { lang: 'en' }, content: [{ type: 'paragraph' }] },
          { type: 'blockBody', attrs: { lang: 'id' }, content: [{ type: 'paragraph' }] },
        ],
      }],
    }
    const once = withLetterhead(doc)
    expect(once.content?.[0]?.type).toBe('letterhead')
    expect(once.content).toHaveLength(2)
    // Idempotent: a doc that already leads with a letterhead is returned as-is.
    expect(withLetterhead(once)).toBe(once)
  })
})

describe('stripDefaultTextAlign', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Any = any

  it('drops default/left/null textAlign and removes the emptied attrs object', () => {
    const input = {
      type: 'document',
      content: [
        { type: 'paragraph', attrs: { textAlign: 'left' }, content: [{ type: 'text', text: 'a' }] },
        { type: 'paragraph', attrs: { textAlign: null }, content: [{ type: 'text', text: 'b' }] },
        { type: 'heading', attrs: { level: 2, textAlign: 'left' }, content: [{ type: 'text', text: 'c' }] },
      ],
    }
    const out = stripDefaultTextAlign(input) as Any
    expect(out.content[0].attrs).toBeUndefined()
    expect(out.content[1].attrs).toBeUndefined()
    expect(out.content[2].attrs).toEqual({ level: 2 })
  })

  it('keeps an explicit center/right/justify alignment', () => {
    const input = { type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: 'x' }] }
    expect((stripDefaultTextAlign(input) as Any).attrs).toEqual({ textAlign: 'center' })
  })

  it('recurses through bilingual block bodies and leaves marks intact', () => {
    const input = {
      type: 'bilingualBlock',
      attrs: { id: 'b1', needsReview: false },
      content: [
        { type: 'blockBody', attrs: { lang: 'en' }, content: [
          { type: 'paragraph', attrs: { textAlign: 'left' }, content: [{ type: 'text', text: 'hi', marks: [{ type: 'bold' }] }] },
          { type: 'paragraph', attrs: { textAlign: 'right' }, content: [{ type: 'text', text: 'yo' }] },
        ] },
      ],
    }
    const out = stripDefaultTextAlign(input) as Any
    expect(out.content[0].attrs).toEqual({ lang: 'en' })
    expect(out.content[0].content[0].attrs).toBeUndefined()
    expect(out.content[0].content[0].content[0].marks).toEqual([{ type: 'bold' }])
    expect(out.content[0].content[1].attrs).toEqual({ textAlign: 'right' })
  })

  it('leaves a doc with no textAlign byte-for-byte identical (existing docs untouched)', () => {
    const input = {
      type: 'document',
      content: [{
        type: 'bilingualBlock',
        attrs: { id: 'b', needsReview: false, numbering: null },
        content: [
          { type: 'blockBody', attrs: { lang: 'en' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'p' }] }] },
          { type: 'blockBody', attrs: { lang: 'id' }, content: [{ type: 'paragraph' }] },
        ],
      }],
    }
    expect(stripDefaultTextAlign(input)).toEqual(input)
  })
})
