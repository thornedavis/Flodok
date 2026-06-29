// Deterministic DOCX → DocumentDoc import (P2 of Upload & Analyse).
//
// Unlike a PDF (visual, needs a vision model), a .docx is structured OOXML —
// real paragraphs, headings, lists, styles. So we recover its content with
// mammoth.js entirely client-side: no AI, no network, instant, and exact.
// mammoth gives semantic HTML; we walk it into the bilingual DocumentDoc
// shape, placing the content on the detected language side (the import is
// verbatim and a single-language source document is the norm — the created
// draft is monolingual so it renders full-width via P1).
//
// Fidelity ceiling (acceptable for V1, same loss class as Google Docs):
// letterhead images and exotic layout (text boxes, column merges) are
// dropped. Tables are preserved as native table nodes; line breaks, headings
// (incl. ones recovered heuristically from bold/caps/clause-label paragraphs),
// paragraphs, lists, and bold/italic/links survive.

import mammoth from 'mammoth'
import type { DocNode, DocumentDoc } from './documentDoc'

export type DocxImportLang = 'en' | 'id'

export type DocxImportResult = {
  doc: DocumentDoc
  title: string
  // Detected source language. The created draft is monolingual in this
  // language so it renders as one full-width column.
  language: DocxImportLang
}

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}

// Inline HTML → ProseMirror text nodes, carrying the active marks down the
// tree (bold/italic/underline/strike/code/link).
const MARK_TAGS: Record<string, string> = {
  STRONG: 'bold', B: 'bold', EM: 'italic', I: 'italic',
  U: 'underline', S: 'strike', STRIKE: 'strike', DEL: 'strike', CODE: 'code',
}

function inlineNodes(node: ChildNode, marks: DocNode['marks']): DocNode[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    if (!text) return []
    return [{ type: 'text', text, ...(marks && marks.length ? { marks } : {}) }]
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return []
  const el = node as Element
  const tag = el.tagName
  // Preserve soft line breaks (Shift+Enter) as hardBreaks — dropping them glued
  // adjacent lines together ("Becquelin" + "Jabatan"). The schema + both
  // renderers handle hardBreak.
  if (tag === 'BR') return [{ type: 'hardBreak' }]
  const base = marks ?? []
  if (tag === 'A') {
    const href = el.getAttribute('href') || ''
    const next = href ? [...base, { type: 'link', attrs: { href } }] : base
    return Array.from(el.childNodes).flatMap(c => inlineNodes(c, next))
  }
  const markType = MARK_TAGS[tag]
  const next = markType ? [...base, { type: markType }] : base
  return Array.from(el.childNodes).flatMap(c => inlineNodes(c, next))
}

function inlineContent(el: Element): DocNode[] {
  return Array.from(el.childNodes).flatMap(c => inlineNodes(c, []))
}

function paragraph(content: DocNode[]): DocNode {
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' }
}

function listItems(listEl: Element): DocNode[] {
  return Array.from(listEl.children)
    .filter(c => c.tagName === 'LI')
    .map(li => {
      // The editor schema is `listItem -> paragraph+` (no nested lists), so we
      // flatten: this item's text becomes a paragraph, and any nested list's
      // items are lifted in as further paragraphs (all text preserved; only
      // the nesting depth is lost — acceptable for V1).
      const paras: DocNode[] = []
      let inlineBuf: DocNode[] = []
      const flush = () => { if (inlineBuf.length) { paras.push(paragraph(inlineBuf)); inlineBuf = [] } }
      Array.from(li.childNodes).forEach(child => {
        const el = child.nodeType === Node.ELEMENT_NODE ? (child as Element) : null
        if (el && /^(UL|OL)$/.test(el.tagName)) {
          flush()
          for (const nested of listItems(el)) {
            for (const p of (nested.content || [])) paras.push(p)
          }
        } else if (el && el.tagName === 'P') {
          flush()
          paras.push(paragraph(inlineContent(el)))
        } else {
          inlineBuf.push(...inlineNodes(child, []))
        }
      })
      flush()
      if (!paras.length) paras.push({ type: 'paragraph' })
      return { type: 'listItem', content: paras }
    })
}

// Tables become native table nodes (the editor schema registers
// table/tableRow/tableCell/tableHeader). Each cell keeps its own block content,
// so a key/value party grid or a bilingual two-column layout survives instead
// of collapsing to one bulleted text line. Merged cells carry their spans.
function cellContent(cell: Element): DocNode[] {
  const out: DocNode[] = []
  for (const child of Array.from(cell.children)) {
    if (child.tagName === 'TABLE') {
      // The editor schema forbids a table inside a cell — flatten a nested
      // table to text rows rather than emit an invalid node.
      Array.from(child.querySelectorAll('tr')).forEach(tr => {
        const text = Array.from(tr.children)
          .map(td => (td.textContent ?? '').trim())
          .filter(Boolean)
          .join('   •   ')
        if (text) out.push(paragraph([{ type: 'text', text }]))
      })
    } else {
      out.push(...blocksFromElement(child))
    }
  }
  // A cell holding bare inline text (no block child) → a single paragraph.
  // Every cell must contain at least one block.
  if (!out.length) {
    const inline = inlineContent(cell)
    out.push(inline.length ? paragraph(inline) : { type: 'paragraph' })
  }
  return out
}

function cellNode(cell: Element): DocNode {
  const attrs: Record<string, number> = {}
  const colspan = Number(cell.getAttribute('colspan'))
  const rowspan = Number(cell.getAttribute('rowspan'))
  if (Number.isInteger(colspan) && colspan > 1) attrs.colspan = colspan
  if (Number.isInteger(rowspan) && rowspan > 1) attrs.rowspan = rowspan
  return {
    type: cell.tagName === 'TH' ? 'tableHeader' : 'tableCell',
    ...(Object.keys(attrs).length ? { attrs } : {}),
    content: cellContent(cell),
  }
}

function tableToBlocks(table: Element): DocNode[] {
  const rows: DocNode[] = []
  // Only this table's own rows — `closest('table')` excludes rows that belong
  // to a nested table (those are flattened by cellContent instead).
  Array.from(table.querySelectorAll('tr'))
    .filter(tr => tr.closest('table') === table)
    .forEach(tr => {
      const cells = Array.from(tr.children)
        .filter(c => c.tagName === 'TD' || c.tagName === 'TH')
        .map(cellNode)
      if (cells.length) rows.push({ type: 'tableRow', content: cells })
    })
  return rows.length ? [{ type: 'table', content: rows }] : []
}

function blocksFromElement(el: Element): DocNode[] {
  switch (el.tagName) {
    case 'P': return [paragraph(inlineContent(el))]
    case 'H1': case 'H2': return [{ type: 'heading', attrs: { level: 2 }, content: inlineContent(el) }]
    case 'H3': return [{ type: 'heading', attrs: { level: 3 }, content: inlineContent(el) }]
    case 'H4': case 'H5': case 'H6': return [{ type: 'heading', attrs: { level: 4 }, content: inlineContent(el) }]
    case 'UL': return [{ type: 'bulletList', content: listItems(el) }]
    case 'OL': return [{ type: 'orderedList', content: listItems(el) }]
    case 'TABLE': return tableToBlocks(el)
    case 'BLOCKQUOTE':
    case 'DIV':
    case 'SECTION':
      return Array.from(el.children).flatMap(blocksFromElement)
    default: {
      const content = inlineContent(el)
      return content.length ? [paragraph(content)] : []
    }
  }
}

// ── Heading recovery ────────────────────────────────────────────────
//
// mammoth only emits <h*> for Word's built-in Heading styles. Documents that
// style headings with direct bold/caps or a custom style arrive as <p>,
// leaving the import as one undifferentiated block stream ("big blocks of
// text"). We promote a paragraph to a heading when it unambiguously reads like
// one — short, single-line, and either a clause label ("Pasal 3", "Article 5",
// "BAB II"), all-caps, or fully bold. Conservative by design: a body sentence
// must never be promoted.

const CLAUSE_RE = /^(pasal|article|artikel|bab|section|bagian|clause|chapter)\b/i

function paragraphText(node: DocNode): string {
  return (node.content ?? []).map(c => (c.type === 'text' ? c.text ?? '' : '')).join('')
}

// True when every text run in the paragraph carries the bold mark — the
// typographic signal Word uses for an unstyled heading.
function isAllBold(node: DocNode): boolean {
  const texts = (node.content ?? []).filter(c => c.type === 'text')
  return texts.length > 0 && texts.every(c => (c.marks ?? []).some(m => m.type === 'bold'))
}

function headingLevelFor(node: DocNode): 2 | 3 | null {
  if (node.type !== 'paragraph') return null
  // A line break means a multi-line block (an address, a party list) — never a
  // heading. Bail before the text checks.
  if ((node.content ?? []).some(c => c.type === 'hardBreak')) return null
  const text = paragraphText(node).trim()
  if (!text) return null
  const words = text.split(/\s+/)
  if (CLAUSE_RE.test(text) && words.length <= 8) return 2
  if (text.length > 90 || words.length > 12) return null
  // Trailing sentence / lead-in punctuation disqualifies it.
  if (/[.;:,]$/.test(text)) return null
  const letters = text.replace(/[^A-Za-z]/g, '')
  if (letters.length >= 3 && letters === letters.toUpperCase()) return 2
  if (isAllBold(node)) return 3
  return null
}

// Heading levels are clamped to the editor's allowed set (2–4); recovery only
// emits 2 or 3. Marks are kept intact (harmless — heading styling wins).
function promoteHeadings(blocks: DocNode[]): DocNode[] {
  return blocks.map(node => {
    const level = headingLevelFor(node)
    return level ? { type: 'heading', attrs: { level }, content: node.content ?? [] } : node
  })
}

// Wrap a single source block into a bilingualBlock with the content on the
// detected-language side and an empty paragraph on the other.
function bilingualBlock(block: DocNode, lang: DocxImportLang): DocNode {
  const filled: DocNode = { type: 'blockBody', attrs: { lang }, content: [block] }
  const empty: DocNode = { type: 'blockBody', attrs: { lang: lang === 'en' ? 'id' : 'en' }, content: [{ type: 'paragraph' }] }
  return {
    type: 'bilingualBlock',
    attrs: { id: newId('blk'), needsReview: false, numbering: null },
    content: lang === 'en' ? [filled, empty] : [empty, filled],
  }
}

// Indonesian vs English by function-word frequency. The two languages share
// almost no stopwords, so this is reliable on real HR documents.
const ID_WORDS = ['yang', 'dan', 'dengan', 'untuk', 'ini', 'itu', 'adalah', 'pada', 'dari', 'akan', 'atau', 'tidak', 'dalam', 'oleh', 'sebagai', 'karyawan', 'perusahaan', 'pekerja', 'perjanjian', 'kerja', 'dapat', 'tanggal', 'gaji', 'pihak']
const EN_WORDS = ['the', 'and', 'of', 'to', 'in', 'is', 'that', 'for', 'with', 'as', 'this', 'employee', 'company', 'agreement', 'shall', 'hereby', 'date', 'salary', 'will', 'by', 'or', 'not', 'party']

function detectLanguage(text: string): DocxImportLang {
  const padded = ' ' + text.toLowerCase().replace(/[^a-z]+/g, ' ') + ' '
  const count = (words: string[]) => words.reduce((n, w) => n + (padded.split(' ' + w + ' ').length - 1), 0)
  return count(ID_WORDS) > count(EN_WORDS) ? 'id' : 'en'
}

// Low-level extraction: the .docx as flat block nodes + their plain texts, the
// whole-document detected language, and a title. `importDocx` wraps these
// monolingually; the P4 dual-language path feeds `blockTexts` to the pairing
// model and then calls `buildBilingualDocFromPairs`.
export type DocxBlocks = {
  blocks: DocNode[]
  blockTexts: string[]
  title: string
  language: DocxImportLang
}

// Word maps a few paragraph styles to headings, but the default map misses
// Title/Subtitle; the rest is recovered by promoteHeadings. (We deliberately
// don't remap the Heading 1–6 hierarchy — a well-styled doc keeps its levels.)
const HEADING_STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
]

// mammoth HTML → flat DocNode blocks, with heading recovery applied. Split out
// from `extractDocxBlocks` (which owns the mammoth call) so the DOM walk can be
// unit-tested directly from an HTML string.
export function htmlToBlocks(html: string): DocNode[] {
  const dom = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const raw = Array.from(dom.body.children).flatMap(blocksFromElement)
  return promoteHeadings(raw)
}

export async function extractDocxBlocks(file: File): Promise<DocxBlocks> {
  const arrayBuffer = await file.arrayBuffer()
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer }, { styleMap: HEADING_STYLE_MAP })
  const blocks = htmlToBlocks(html)
  const allText = blocks.map(blockPlainText).join(' ').trim()
  if (!blocks.length || !allText) {
    throw new Error('No readable content found in the document.')
  }

  const language = detectLanguage(allText)
  // Title from the first recovered heading; fall back to the file name.
  const firstHeading = blocks.find(b => b.type === 'heading')
  const headingText = firstHeading ? blockPlainText(firstHeading).trim() : ''
  const title = (headingText || file.name.replace(/\.docx$/i, '')).slice(0, 200)

  return { blocks, blockTexts: blocks.map(blockPlainText), title, language }
}

export async function importDocx(file: File): Promise<DocxImportResult> {
  const { blocks, title, language } = await extractDocxBlocks(file)
  const content = blocks.map(b => bilingualBlock(b, language))
  return { doc: { type: 'document', content }, title, language }
}

// Flattened plain text of one block node — for the pairing model and previews.
// List items keep a visible separator so the pairing model can still see item
// boundaries (and align a list against its translation).
function blockPlainText(node: DocNode): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return ' '
  const sep = node.type === 'paragraph' || node.type === 'heading' ? ''
    : node.type === 'bulletList' || node.type === 'orderedList' ? ' • '
    : ' '
  return (node.content ?? []).map(blockPlainText).join(sep).trim()
}

// P4: assemble a bilingual doc from the pairing model's output. Each pair links
// an EN block index to its ID translation index (either side may be null for an
// unpaired block). Any block no pair references is appended as a monolingual
// row, so nothing is dropped if the model misses one.
export function buildBilingualDocFromPairs(
  blocks: DocNode[],
  pairs: Array<{ en: number | null; id: number | null }>,
): DocumentDoc {
  const used = new Set<number>()
  const inRange = (i: number | null): number | null =>
    typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < blocks.length ? i : null
  // Claim an index at most once — so a pair naming the same block on both sides,
  // or two pairs naming the same index, can never duplicate a block.
  const claim = (i: number | null): number | null => {
    const v = inRange(i)
    if (v == null || used.has(v)) return null
    used.add(v)
    return v
  }
  const rowFrom = (enIdx: number | null, idIdx: number | null): DocNode => {
    const enBlock = enIdx != null ? blocks[enIdx] : null
    const idBlock = idIdx != null ? blocks[idIdx] : null
    return {
      type: 'bilingualBlock',
      attrs: { id: newId('blk'), needsReview: false, numbering: null },
      content: [
        { type: 'blockBody', attrs: { lang: 'en' }, content: enBlock ? [enBlock] : [{ type: 'paragraph' }] },
        { type: 'blockBody', attrs: { lang: 'id' }, content: idBlock ? [idBlock] : [{ type: 'paragraph' }] },
      ],
    }
  }
  const content: DocNode[] = []
  for (const p of pairs) {
    const en = claim(p.en)
    const id = claim(p.id)
    if (en == null && id == null) continue
    content.push(rowFrom(en, id))
  }
  // Any block the model didn't reference — omitted, beyond the server's block
  // cap, or a total pairing failure that returned no pairs — is appended on its
  // OWN detected language side (never assumed English), so nothing is dropped
  // or silently mis-filed into the wrong column.
  for (let i = 0; i < blocks.length; i++) {
    if (used.has(i)) continue
    used.add(i)
    const lang = detectLanguage(blockPlainText(blocks[i]))
    content.push(lang === 'id' ? rowFrom(null, i) : rowFrom(i, null))
  }
  if (!content.length) throw new Error('No readable content found in the document.')
  return { type: 'document', content }
}

// ── Bilingual table unzip ───────────────────────────────────────────
//
// The most common Indonesian bilingual contract layout is a single Word table
// with the two languages SIDE BY SIDE in two columns (Bahasa | English), one
// row per clause. After extraction that whole table is a single block, so the
// block-pairing model can't split it — the entire table lands on one language
// side with the other empty (the "imported into a single category" bug). Here
// we detect such a table and unzip it deterministically: each row's two cells
// become the two sides of a bilingual block. No model call, exact, instant.

function pairedBilingualBlock(enBlocks: DocNode[], idBlocks: DocNode[]): DocNode {
  return {
    type: 'bilingualBlock',
    attrs: { id: newId('blk'), needsReview: false, numbering: null },
    content: [
      { type: 'blockBody', attrs: { lang: 'en' }, content: enBlocks.length ? enBlocks : [{ type: 'paragraph' }] },
      { type: 'blockBody', attrs: { lang: 'id' }, content: idBlocks.length ? idBlocks : [{ type: 'paragraph' }] },
    ],
  }
}

// A table cell's block children, with heading recovery applied so a clause
// label inside a cell ("Pasal 3") still becomes a heading on that side.
function cellBlocks(cell: DocNode | undefined): DocNode[] {
  const blocks = (cell?.content ?? []).filter(n => n.type !== 'tableRow')
  return promoteHeadings(blocks)
}

// If `table` is a two-column layout whose columns are in DIFFERENT languages,
// return which column index holds English / Indonesian. null for an ordinary
// data table (both columns one language, or not two-column) — left untouched.
function bilingualTableColumns(table: DocNode): { enCol: number; idCol: number } | null {
  const rows = (table.content ?? []).filter(r => r.type === 'tableRow')
  if (!rows.length) return null
  const twoCol = rows.filter(r => (r.content ?? []).length === 2)
  // Most rows must be two-celled (tolerate the odd full-width / merged row).
  if (twoCol.length < Math.ceil(rows.length * 0.6)) return null
  let col0 = '', col1 = ''
  for (const r of twoCol) {
    const cells = r.content ?? []
    col0 += ' ' + blockPlainText(cells[0])
    col1 += ' ' + blockPlainText(cells[1])
  }
  const l0 = detectLanguage(col0)
  const l1 = detectLanguage(col1)
  if (l0 === l1) return null
  return l0 === 'en' ? { enCol: 0, idCol: 1 } : { enCol: 1, idCol: 0 }
}

function unzipBilingualTable(table: DocNode, cols: { enCol: number; idCol: number }): DocNode[] {
  const out: DocNode[] = []
  for (const row of (table.content ?? [])) {
    if (row.type !== 'tableRow') continue
    const cells = row.content ?? []
    if (cells.length >= 2) {
      out.push(pairedBilingualBlock(cellBlocks(cells[cols.enCol]), cellBlocks(cells[cols.idCol])))
    } else if (cells.length === 1) {
      // A merged full-width row (a shared heading) — place it on its own side.
      const blocks = cellBlocks(cells[0])
      const lang = detectLanguage(blockPlainText(cells[0]))
      out.push(lang === 'id' ? pairedBilingualBlock([], blocks) : pairedBilingualBlock(blocks, []))
    }
  }
  return out
}

const sameKind = (a: DocNode, b: DocNode): boolean => {
  const kind = (n: DocNode) => (n.type === 'heading' ? 'heading' : n.type)
  return kind(a) === kind(b)
}

// Assemble a bilingual document when the source uses the table-column layout.
// Bilingual tables are unzipped; a standalone block is placed on its detected
// side, pairing with an adjacent opposite-language block of the same kind (so
// the EN/ID title headings share a row). Returns null when there's no bilingual
// table at all — the caller then falls back to the AI block-pairing path.
export function buildBilingualDocFromDocxTables(blocks: DocNode[]): DocumentDoc | null {
  const cols = blocks.map(b => (b.type === 'table' ? bilingualTableColumns(b) : null))
  if (!cols.some(Boolean)) return null

  const content: DocNode[] = []
  for (let i = 0; i < blocks.length;) {
    const c = cols[i]
    if (c) {
      content.push(...unzipBilingualTable(blocks[i], c))
      i++
      continue
    }
    const b = blocks[i]
    const lang = detectLanguage(blockPlainText(b))
    const next = blocks[i + 1]
    if (next && !cols[i + 1] && b.type !== 'table' && next.type !== 'table' && sameKind(b, next)) {
      const lang2 = detectLanguage(blockPlainText(next))
      if (lang2 !== lang) {
        content.push(pairedBilingualBlock([lang === 'en' ? b : next], [lang === 'id' ? b : next]))
        i += 2
        continue
      }
    }
    content.push(lang === 'id' ? pairedBilingualBlock([], [b]) : pairedBilingualBlock([b], []))
    i++
  }
  return content.length ? { type: 'document', content } : null
}
