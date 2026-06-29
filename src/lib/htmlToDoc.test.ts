/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest'
import { htmlToBlocks, buildBilingualDocFromDocxTables } from './htmlToDoc'
import type { DocNode } from './documentDoc'

// Flatten a node's text, rendering a hardBreak as "\n" so we can assert that
// line breaks survived (the regression that glued "Becquelin" + "Jabatan").
function textOf(node: DocNode): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  return (node.content ?? []).map(textOf).join('')
}

function hasMark(node: DocNode, mark: string): boolean {
  if (node.type === 'text') return (node.marks ?? []).some(m => m.type === mark)
  return (node.content ?? []).some(c => hasMark(c, mark))
}

describe('htmlToBlocks — line breaks', () => {
  it('preserves <br> as a hardBreak instead of gluing the lines', () => {
    const [p] = htmlToBlocks('<p>Nama : Marie-Laure Becquelin<br>Jabatan : Direktur</p>')
    expect(p.type).toBe('paragraph')
    expect((p.content ?? []).some(c => c.type === 'hardBreak')).toBe(true)
    // The text reads across the break — no "BecquelinJabatan" run-on.
    expect(textOf(p)).toBe('Nama : Marie-Laure Becquelin\nJabatan : Direktur')
  })
})

describe('htmlToBlocks — tables', () => {
  it('emits a native table/row/cell tree, not bulleted text', () => {
    const [table] = htmlToBlocks(
      '<table><tr><td><p>Nama</p></td><td><p>Marie</p></td></tr>' +
      '<tr><td><p>Jabatan</p></td><td><p>Direktur</p></td></tr></table>',
    )
    expect(table.type).toBe('table')
    expect(table.content).toHaveLength(2)
    const firstRow = table.content![0]
    expect(firstRow.type).toBe('tableRow')
    expect(firstRow.content).toHaveLength(2)
    const firstCell = firstRow.content![0]
    expect(firstCell.type).toBe('tableCell')
    // Cell holds block content (a paragraph), not a flattened string.
    expect(firstCell.content![0].type).toBe('paragraph')
    expect(textOf(firstCell)).toBe('Nama')
  })

  it('maps <th> to tableHeader and carries colspan/rowspan on merged cells', () => {
    const [table] = htmlToBlocks(
      '<table><tr><th>Header</th></tr><tr><td colspan="2" rowspan="3">Span</td></tr></table>',
    )
    expect(table.content![0].content![0].type).toBe('tableHeader')
    const merged = table.content![1].content![0]
    expect(merged.type).toBe('tableCell')
    expect(merged.attrs).toEqual({ colspan: 2, rowspan: 3 })
  })

  it('keeps a cell with bare inline text as a single paragraph', () => {
    const [table] = htmlToBlocks('<table><tr><td>plain</td></tr></table>')
    const cell = table.content![0].content![0]
    expect(cell.content).toHaveLength(1)
    expect(cell.content![0].type).toBe('paragraph')
    expect(textOf(cell)).toBe('plain')
  })
})

describe('htmlToBlocks — heading recovery', () => {
  const headingLevel = (html: string): number | null => {
    const [node] = htmlToBlocks(html)
    return node.type === 'heading' ? (node.attrs?.level as number) : null
  }

  it('promotes clause labels to level-2 headings', () => {
    expect(headingLevel('<p>Pasal 1</p>')).toBe(2)
    expect(headingLevel('<p>Article 5</p>')).toBe(2)
    expect(headingLevel('<p>BAB II</p>')).toBe(2)
  })

  it('promotes an all-caps title line to a level-2 heading', () => {
    expect(headingLevel('<p>INDEFINITE-TERM EMPLOYMENT AGREEMENT</p>')).toBe(2)
  })

  it('promotes a short, fully-bold line to a level-3 heading', () => {
    expect(headingLevel('<p><strong>Confidentiality</strong></p>')).toBe(3)
  })

  it('does NOT promote a body sentence', () => {
    expect(headingLevel('<p>The employee shall keep all information confidential at all times.</p>')).toBeNull()
  })

  it('does NOT promote a lead-in ending in a colon', () => {
    expect(headingLevel('<p>PERJANJIAN KERJA ini dibuat antara:</p>')).toBeNull()
  })

  it('does NOT promote a multi-line (line-broken) block', () => {
    expect(headingLevel('<p>Nama : Marie<br>Jabatan : Direktur</p>')).toBeNull()
  })

  it('does NOT promote a partially-bold paragraph (keeps its marks)', () => {
    const [node] = htmlToBlocks('<p>please read <strong>this clause</strong> carefully</p>')
    expect(node.type).toBe('paragraph')
    expect(hasMark(node, 'bold')).toBe(true)
  })

  it('leaves a real <h2> as a heading and lists untouched', () => {
    expect(headingLevel('<h2>Already A Heading</h2>')).toBe(2)
    const [list] = htmlToBlocks('<ul><li>one</li><li>two</li></ul>')
    expect(list.type).toBe('bulletList')
    expect(list.content).toHaveLength(2)
  })
})

describe('buildBilingualDocFromDocxTables', () => {
  const sideText = (row: DocNode, lang: 'en' | 'id'): string =>
    textOf(row.content!.find(b => b.attrs?.lang === lang)!)

  it('unzips a two-language two-column table into EN/ID sides', () => {
    const blocks = htmlToBlocks(
      '<table>' +
      '<tr><td><p>Pasal 1</p><p>Pihak Pertama dan Pihak Kedua sepakat untuk bekerja sama.</p></td>' +
      '<td><p>Article 1</p><p>The First Party and the Second Party agree to work together.</p></td></tr>' +
      '<tr><td><p>Gaji pokok adalah lima juta rupiah per bulan untuk pekerjaan ini.</p></td>' +
      '<td><p>The base salary is five million rupiah per month for this work.</p></td></tr>' +
      '</table>',
    )
    const doc = buildBilingualDocFromDocxTables(blocks)
    expect(doc).not.toBeNull()
    expect(doc!.content).toHaveLength(2)

    const [row1] = doc!.content!
    expect(row1.type).toBe('bilingualBlock')
    expect(sideText(row1, 'en')).toContain('Article 1')
    expect(sideText(row1, 'en')).toContain('First Party')
    expect(sideText(row1, 'id')).toContain('Pasal 1')
    expect(sideText(row1, 'id')).toContain('Pihak Pertama')
    // No cross-contamination between the columns.
    expect(sideText(row1, 'en')).not.toContain('Pihak')
    expect(sideText(row1, 'id')).not.toContain('Article')
  })

  it('recovers a clause-label heading inside a cell', () => {
    const blocks = htmlToBlocks(
      '<table><tr><td><p>Pasal 1</p><p>Pihak Pertama dan Pihak Kedua sepakat untuk bekerja.</p></td>' +
      '<td><p>Article 1</p><p>The First Party and the Second Party agree to work.</p></td></tr></table>',
    )
    const doc = buildBilingualDocFromDocxTables(blocks)!
    const en = doc.content![0].content!.find(b => b.attrs?.lang === 'en')!
    expect(en.content![0].type).toBe('heading')
  })

  it('returns null for an ordinary same-language table (caller falls back to AI pairing)', () => {
    const blocks = htmlToBlocks(
      '<table><tr><td>Hari</td><td>Senin</td></tr><tr><td>Jam</td><td>Delapan</td></tr></table>',
    )
    expect(buildBilingualDocFromDocxTables(blocks)).toBeNull()
  })

  it('returns null when there is no table at all', () => {
    expect(buildBilingualDocFromDocxTables(htmlToBlocks('<p>Just a paragraph.</p>'))).toBeNull()
  })
})
