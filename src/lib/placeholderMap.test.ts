import { describe, it, expect } from 'vitest'
import { mapPlaceholders, assignPlaceholder } from './placeholderMap'
import { clearOffSide, clearOffSideForMode } from './offSide'
import type { DocumentDoc, DocNode } from './documentDoc'

// One-block bilingual doc with the given inline nodes on the EN side.
function docWithEnInline(inline: DocNode[]): DocumentDoc {
  return {
    type: 'document',
    content: [{
      type: 'bilingualBlock',
      attrs: { id: 'b1', needsReview: false, numbering: null },
      content: [
        { type: 'blockBody', attrs: { lang: 'en' }, content: [{ type: 'paragraph', content: inline }] },
        { type: 'blockBody', attrs: { lang: 'id' }, content: [{ type: 'paragraph' }] },
      ],
    }],
  }
}

function mergeKeys(node: DocNode): string[] {
  if (node.type === 'mergeField') return [String(node.attrs?.key)]
  return (node.content ?? []).flatMap(mergeKeys)
}
function textOf(node: DocNode): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'mergeField') return `{{${node.attrs?.key}}}`
  return (node.content ?? []).map(textOf).join('')
}

describe('mapPlaceholders', () => {
  it('maps well-known EN placeholders to merge-field nodes', () => {
    const doc = docWithEnInline([{ type: 'text', text: 'Dear [Employee Name], dated [Date].' }])
    const { doc: out, mapped, unmapped } = mapPlaceholders(doc)
    expect(mergeKeys(out)).toEqual(['employee_name', 'today'])
    expect(unmapped).toEqual([])
    expect(mapped.map(m => m.key).sort()).toEqual(['employee_name', 'today'])
    expect(textOf(out)).toBe('Dear {{employee_name}}, dated {{today}}.')
  })

  it('maps Indonesian synonyms', () => {
    const doc = docWithEnInline([{ type: 'text', text: 'Kepada [Nama] di [Perusahaan], tanggal [Tanggal].' }])
    expect(mergeKeys(mapPlaceholders(doc).doc)).toEqual(['employee_name', 'org_name', 'today'])
  })

  it('leaves unknown placeholders as text and reports them (no [Position] token)', () => {
    const doc = docWithEnInline([{ type: 'text', text: 'Position: [Position] starting [Commencement Date].' }])
    const { doc: out, mapped, unmapped } = mapPlaceholders(doc)
    expect(mergeKeys(out)).toEqual([])
    expect(mapped).toEqual([])
    expect(unmapped).toContain('[Position]')
    expect(unmapped).toContain('[Commencement Date]')
    expect(textOf(out)).toBe('Position: [Position] starting [Commencement Date].')
  })

  it('preserves marks on the surrounding text when splitting', () => {
    const doc = docWithEnInline([{ type: 'text', text: 'Hi [Name] welcome', marks: [{ type: 'bold' }] }])
    const { doc: out } = mapPlaceholders(doc)
    const inline = out.content![0].content![0].content![0].content!
    expect(inline.map(n => n.type)).toEqual(['text', 'mergeField', 'text'])
    expect(inline[0].marks).toEqual([{ type: 'bold' }])
    expect(inline[2].marks).toEqual([{ type: 'bold' }])
    expect(inline[1].marks).toBeUndefined()
  })

  it('does not report numeric/footnote brackets', () => {
    const doc = docWithEnInline([{ type: 'text', text: 'See note [1] and [2].' }])
    const { mapped, unmapped } = mapPlaceholders(doc)
    expect(mapped).toEqual([])
    expect(unmapped).toEqual([])
  })
})

describe('assignPlaceholder', () => {
  it('converts every occurrence of one bracket to the chosen field', () => {
    const doc = docWithEnInline([{ type: 'text', text: 'Role: [Position] / [Position]' }])
    const out = assignPlaceholder(doc, '[Position]', 'employee_departments')
    expect(mergeKeys(out)).toEqual(['employee_departments', 'employee_departments'])
  })

  it('matches the exact bracket, not normalize-identical siblings', () => {
    // [Position] and [POSITION:] are distinct review rows but normalize alike;
    // assigning one must not silently rewrite the other.
    const doc = docWithEnInline([{ type: 'text', text: '[Position] vs [POSITION:]' }])
    const out = assignPlaceholder(doc, '[Position]', 'employee_departments')
    expect(mergeKeys(out)).toEqual(['employee_departments'])
    expect(textOf(out)).toBe('{{employee_departments}} vs [POSITION:]')
  })
})

describe('clearOffSide', () => {
  it('empties the off-language body and keeps the kept side', () => {
    const doc = docWithEnInline([{ type: 'text', text: 'Hello' }])
    doc.content![0].content![1] = {
      type: 'blockBody', attrs: { lang: 'id' },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Halo' }] }],
    }
    const out = clearOffSide(doc, 'en')
    expect(textOf(out.content![0].content![0])).toBe('Hello')
    expect(out.content![0].content![1].content).toEqual([{ type: 'paragraph' }])
  })

  it('clearOffSideForMode passes bilingual through untouched', () => {
    const doc = docWithEnInline([{ type: 'text', text: 'Hello' }])
    expect(clearOffSideForMode(doc, 'bilingual')).toBe(doc)
  })
})
