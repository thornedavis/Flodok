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
// letterhead images and exotic layout are dropped; tables are flattened to
// text lines. Headings, paragraphs, lists, and bold/italic/links survive.

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
  if (tag === 'BR') return []
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

// Tables are flattened to one line per row for V1 (our DocumentDoc renders a
// flat bilingual stream; bilingual table parity is a later concern).
function tableToBlocks(table: Element): DocNode[] {
  const out: DocNode[] = []
  Array.from(table.querySelectorAll('tr')).forEach(tr => {
    const cells = Array.from(tr.querySelectorAll('td,th'))
      .map(td => (td.textContent ?? '').trim())
      .filter(Boolean)
    if (cells.length) out.push(paragraph([{ type: 'text', text: cells.join('   •   ') }]))
  })
  return out
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

export async function extractDocxBlocks(file: File): Promise<DocxBlocks> {
  const arrayBuffer = await file.arrayBuffer()
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer })
  const dom = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const body = dom.body

  const blocks: DocNode[] = Array.from(body.children).flatMap(blocksFromElement)
  const allText = (body.textContent ?? '').trim()
  if (!blocks.length || !allText) {
    throw new Error('No readable content found in the document.')
  }

  const language = detectLanguage(allText)
  const firstHeading = body.querySelector('h1, h2')?.textContent?.trim()
  const title = (firstHeading || file.name.replace(/\.docx$/i, '')).slice(0, 200)

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
