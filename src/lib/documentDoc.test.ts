import { describe, it, expect } from 'vitest'
import { normalizeDoc, type DocNode, type DocumentDoc, type SectionAttrs } from './documentDoc'
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
    expect((starter.content || []).every(n => n.type === 'bilingualBlock')).toBe(true)
    expect(clauseHeadingTexts(starter, 'en').length).toBeGreaterThan(0)
  })
})
