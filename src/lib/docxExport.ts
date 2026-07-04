// Client-side DOCX export — a high-fidelity DocumentDoc → Word serializer.
//
// Unlike PDF (which round-trips through the Browser Rendering worker), DOCX is
// generated entirely in the browser with the `docx` library so the result is a
// NATIVE, editable Word file — real headings, tables, lists, and a two-column
// table for the side-by-side bilingual layout. It mirrors the node handling in
// BilingualDocumentRenderer: same tree, same merge-field resolution, same
// letterhead (org logo + centered text). Merge fields resolve to plain text
// (signature fields emit HTML, which we strip).
//
// This module statically imports `docx`; callers should lazy-import THIS module
// (await import('../../lib/docxExport')) so docx stays out of the main bundle.

import {
  Document, Packer, Paragraph, TextRun, ExternalHyperlink, ImageRun,
  Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType,
  BorderStyle, LevelFormat, ShadingType, type ILevelsOptions,
} from 'docx'
import { normalizeDoc, type DocumentDoc, type DocNode, type LanguageMode, type ViewMode } from './documentDoc'
import { resolveMergeField, isMergeFieldKey, type MergeContext } from './mergeFields'

export type ExportDocumentDocxOptions = {
  doc: DocumentDoc | Record<string, unknown>
  title: string
  view: ViewMode
  contextEn?: MergeContext
  contextId?: MergeContext
  languageMode?: LanguageMode
}

type OrderedCfg = { reference: string; levels: ILevelsOptions[] }

const NONE = { style: BorderStyle.NONE, size: 0, color: 'auto' }
const CELL_NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE }
const TABLE_NO_BORDERS = { ...CELL_NO_BORDERS, insideHorizontal: NONE, insideVertical: NONE }

function alignFor(node: DocNode) {
  const a = node.attrs?.textAlign
  return a === 'center' ? AlignmentType.CENTER
    : a === 'right' ? AlignmentType.RIGHT
    : a === 'justify' ? AlignmentType.JUSTIFIED
    : undefined
}

function stripHtml(s: string): string {
  if (!s.includes('<')) return s
  return new DOMParser().parseFromString(s, 'text/html').body.textContent ?? ''
}

// Load an image URL → PNG bytes + sized dimensions via a canvas (normalizes
// any browser-decodable format, incl. webp, to png). Returns null on failure
// (CORS-tainted canvas, network) so the letterhead just drops the logo.
async function loadLogoImage(url: string): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('logo load failed'))
      img.src = url
    })
    const natW = img.naturalWidth || 1
    const natH = img.naturalHeight || 1
    const maxW = 200
    const scale = Math.min(1, maxW / natW)
    const canvas = document.createElement('canvas')
    canvas.width = natW
    canvas.height = natH
    const cx = canvas.getContext('2d')
    if (!cx) return null
    cx.drawImage(img, 0, 0)
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'))
    if (!blob) return null
    return {
      data: new Uint8Array(await blob.arrayBuffer()),
      width: Math.round(natW * scale),
      height: Math.round(natH * scale),
    }
  } catch {
    return null
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function sanitizeFilename(input: string): string {
  const cleaned = input.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 80)
  return cleaned || 'document'
}

// Build the `docx` Document (no packing / download). Split out so it can be
// smoke-tested in Node — pass a logo-less, plain-text doc and Packer.toBuffer it.
export async function assembleDocxDocument({ doc, title, view, contextEn, contextId, languageMode = 'bilingual' }: ExportDocumentDocxOptions): Promise<Document> {
  const numbering: OrderedCfg[] = []
  // Ordered lists within ONE clause body share a numbering instance so an
  // interrupting bullet sub-list doesn't restart a/b/c; reset to null at each
  // body boundary so the next clause starts fresh.
  let currentOrderedRef: string | null = null

  function inlineRun(node: DocNode, ctx?: MergeContext): TextRun | ExternalHyperlink {
    if (node.type === 'hardBreak') return new TextRun({ break: 1 })
    if (node.type === 'mergeField') {
      const key = (node.attrs?.key as string) || ''
      const raw = ctx && isMergeFieldKey(key) ? (resolveMergeField(key, ctx) ?? '') : (key ? `{{${key}}}` : '')
      return new TextRun({ text: stripHtml(raw) })
    }
    const marks = node.marks ?? []
    const has = (t: string) => marks.some(m => m.type === t)
    const opts = {
      text: node.text ?? '',
      bold: has('bold'),
      italics: has('italic'),
      strike: has('strike'),
      underline: has('underline') ? {} : undefined,
      ...(has('code') ? { font: 'Courier New' } : {}),
    }
    const link = marks.find(m => m.type === 'link')
    if (link) {
      const href = (link.attrs?.href as string) || ''
      return new ExternalHyperlink({ link: href, children: [new TextRun({ ...opts, style: 'Hyperlink' })] })
    }
    return new TextRun(opts)
  }

  const inlineRuns = (content: DocNode[] | undefined, ctx?: MergeContext) => (content ?? []).map(n => inlineRun(n, ctx))

  function listItemParas(li: DocNode, listOpts: Record<string, unknown>, ctx?: MergeContext): Paragraph[] {
    return (li.content ?? [])
      .filter(p => p.type === 'paragraph' || p.type === 'heading')
      .map(p => new Paragraph({ ...listOpts, alignment: alignFor(p), children: inlineRuns(p.content, ctx) }))
  }

  function blockToDocx(node: DocNode, ctx?: MergeContext): (Paragraph | Table)[] {
    switch (node.type) {
      case 'paragraph':
        return [new Paragraph({ alignment: alignFor(node), children: inlineRuns(node.content, ctx) })]
      case 'heading': {
        const level = (node.attrs?.level as number) || 3
        const heading = level === 1 ? HeadingLevel.HEADING_1
          : level === 2 ? HeadingLevel.HEADING_2
          : level === 4 ? HeadingLevel.HEADING_4
          : HeadingLevel.HEADING_3
        return [new Paragraph({ heading, alignment: alignFor(node), children: inlineRuns(node.content, ctx) })]
      }
      case 'bulletList':
        return (node.content ?? []).flatMap(li => listItemParas(li, { bullet: { level: 0 } }, ctx))
      case 'orderedList': {
        if (!currentOrderedRef) {
          currentOrderedRef = `ol-${numbering.length}`
          numbering.push({
            reference: currentOrderedRef,
            levels: [{ level: 0, format: LevelFormat.LOWER_LETTER, text: '%1.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 480, hanging: 280 } } } }],
          })
        }
        const reference = currentOrderedRef
        return (node.content ?? []).flatMap(li => listItemParas(li, { numbering: { reference, level: 0 } }, ctx))
      }
      case 'codeBlock':
        return [new Paragraph({ shading: { type: ShadingType.SOLID, color: 'auto', fill: 'F3F4F6' }, children: [new TextRun({ font: 'Courier New', text: (node.content ?? []).map(n => n.text ?? '').join('') })] })]
      case 'callout': {
        const variant = (node.attrs?.variant as string) || 'info'
        const fill = variant === 'warning' ? 'FEF3C7' : variant === 'success' ? 'DCFCE7' : variant === 'danger' ? 'FEE2E2' : 'EFF6FF'
        const accent = variant === 'warning' ? 'D97706' : variant === 'success' ? '16A34A' : variant === 'danger' ? 'DC2626' : '2563EB'
        const inner = (node.content ?? []).flatMap(p => blockToDocx(p, ctx))
        return [new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: TABLE_NO_BORDERS,
          rows: [new TableRow({ children: [new TableCell({
            shading: { type: ShadingType.SOLID, color: 'auto', fill },
            borders: { ...CELL_NO_BORDERS, left: { style: BorderStyle.SINGLE, size: 18, color: accent } },
            margins: { top: 80, bottom: 80, left: 160, right: 160 },
            children: ensureBlocks(inner),
          })] })],
        })]
      }
      case 'table':
        return [tableToDocx(node, ctx)]
      default:
        return []
    }
  }

  function tableToDocx(node: DocNode, ctx?: MergeContext): Table {
    const rows = (node.content ?? [])
      .filter(r => r.type === 'tableRow')
      .map(r => new TableRow({
        children: (r.content ?? [])
          .filter(c => c.type === 'tableCell' || c.type === 'tableHeader')
          .map(c => new TableCell({
            shading: c.type === 'tableHeader' ? { type: ShadingType.SOLID, color: 'auto', fill: 'F3F4F6' } : undefined,
            margins: { top: 40, bottom: 40, left: 80, right: 80 },
            children: ensureBlocks((c.content ?? []).flatMap(b => blockToDocx(b, ctx))),
          })),
      }))
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: rows.length ? rows : [new TableRow({ children: [new TableCell({ children: [new Paragraph({})] })] })],
    })
  }

  // A Word table cell must contain ≥1 block and must end with a paragraph.
  function ensureBlocks(blocks: (Paragraph | Table)[]): (Paragraph | Table)[] {
    if (!blocks.length) return [new Paragraph({})]
    return blocks[blocks.length - 1] instanceof Table ? [...blocks, new Paragraph({})] : blocks
  }

  function bodyToDocx(block: DocNode, lang: 'en' | 'id', ctx?: MergeContext): (Paragraph | Table)[] {
    currentOrderedRef = null // each clause body restarts a/b/c
    const body = (block.content ?? []).find(b => b.type === 'blockBody' && b.attrs?.lang === lang)
    return (body?.content ?? []).flatMap(n => blockToDocx(n, ctx))
  }

  function bilingualTable(blocks: DocNode[], ctxEn?: MergeContext, ctxId?: MergeContext): Table {
    const rows = blocks
      .filter(b => b.type === 'bilingualBlock')
      .map(b => new TableRow({
        children: [
          new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: CELL_NO_BORDERS, margins: { right: 160, bottom: 80 }, children: ensureBlocks(bodyToDocx(b, 'en', ctxEn)) }),
          new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: CELL_NO_BORDERS, margins: { left: 160, bottom: 80 }, children: ensureBlocks(bodyToDocx(b, 'id', ctxId)) }),
        ],
      }))
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: TABLE_NO_BORDERS,
      rows: rows.length ? rows : [new TableRow({ children: [new TableCell({ children: [new Paragraph({})] }), new TableCell({ children: [new Paragraph({})] })] })],
    })
  }

  async function letterheadToDocx(node: DocNode, ctx?: MergeContext): Promise<(Paragraph | Table)[]> {
    currentOrderedRef = null
    const out: (Paragraph | Table)[] = []
    const logoUrl = node.attrs?.showLogo !== false ? (ctx?.organization?.logo_url ?? null) : null
    if (logoUrl) {
      const img = await loadLogoImage(logoUrl)
      if (img) {
        out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new ImageRun({ type: 'png', data: img.data, transformation: { width: img.width, height: img.height } })] }))
      }
    }
    for (const child of (node.content ?? [])) out.push(...blockToDocx(child, ctx))
    // Divider under the letterhead (mirrors the on-screen bottom border).
    out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D1D5DB', space: 1 } }, spacing: { after: 160 }, children: [] }))
    return out
  }

  // A top-level signatureBlock → plain-text signature area (caption, a blank
  // signature underline, then printed name / title / date). Signature IMAGES
  // are deferred (see plan): DOCX is the editable draft, the signed PDF is the
  // rendered artifact. Rendered once, full-width, in document order.
  const SIG_ROLE_LABEL: Record<string, { en: string; id: string }> = {
    employee: { en: 'Employee', id: 'Karyawan' },
    employer: { en: 'Employer', id: 'Pemberi Kerja' },
    blank: { en: 'Signature', id: 'Tanda tangan' },
  }
  const SIG_UNDERLINE = '________________________'
  function signatureBlockToDocx(node: DocNode, lang: 'en' | 'id' | 'both', ctx?: MergeContext): Paragraph[] {
    currentOrderedRef = null
    const rawRole = node.attrs?.role
    const role = rawRole === 'employer' || rawRole === 'blank' ? rawRole : 'employee'
    const showDate = node.attrs?.showDate !== false
    const showTitle = node.attrs?.showTitle !== false
    const override = typeof node.attrs?.label === 'string' ? (node.attrs.label as string).trim() : ''
    const rl = SIG_ROLE_LABEL[role]
    const caption = override || (lang === 'both' ? `${rl.en} / ${rl.id}` : rl[lang])
    const dateLabel = lang === 'id' ? 'Tanggal' : 'Date'
    const resolve = (key: 'employee_name' | 'employer_name' | 'employer_title' | 'employee_sign_date' | 'employer_sign_date') =>
      ctx ? stripHtml(resolveMergeField(key, ctx) ?? '').trim() : ''

    const out: Paragraph[] = [
      new Paragraph({ spacing: { before: 280 }, children: [new TextRun({ text: caption, bold: true })] }),
      new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: SIG_UNDERLINE })] }),
    ]
    if (role !== 'blank') {
      const name = resolve(role === 'employer' ? 'employer_name' : 'employee_name')
      if (name) out.push(new Paragraph({ children: [new TextRun({ text: name, bold: true })] }))
      if (showTitle && role === 'employer') {
        const title = resolve('employer_title')
        if (title) out.push(new Paragraph({ children: [new TextRun({ text: title })] }))
      }
      if (showDate) {
        const date = resolve(role === 'employer' ? 'employer_sign_date' : 'employee_sign_date')
        out.push(new Paragraph({ children: [new TextRun({ text: `${dateLabel}: ${date || SIG_UNDERLINE}` })] }))
      }
    } else if (showDate) {
      out.push(new Paragraph({ children: [new TextRun({ text: `${dateLabel}: ${SIG_UNDERLINE}` })] }))
    }
    return out
  }

  // ── Assemble ──────────────────────────────────────────────────────
  const flat = normalizeDoc(doc)
  const blocks = flat.content ?? []
  const children: (Paragraph | Table)[] = []

  if (title.trim()) {
    children.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: title.trim(), bold: true, size: 36 })] }))
  }

  let body = blocks
  if (blocks[0]?.type === 'letterhead') {
    children.push(...await letterheadToDocx(blocks[0], contextEn))
    body = blocks.slice(1)
  }

  if (languageMode === 'en' || languageMode === 'id') {
    const ctx = languageMode === 'id' ? (contextId ?? contextEn) : contextEn
    for (const b of body) {
      if (b.type === 'bilingualBlock') children.push(...bodyToDocx(b, languageMode, ctx))
      else if (b.type === 'signatureBlock') children.push(...signatureBlockToDocx(b, languageMode, ctx))
    }
  } else if (view === 'side_by_side') {
    // Bilingual bodies group into a two-column table; signature blocks are
    // full-width, so flush the pending table before each one to keep order.
    let group: DocNode[] = []
    const flush = () => { if (group.length) { children.push(bilingualTable(group, contextEn, contextId ?? contextEn)); group = [] } }
    for (const b of body) {
      if (b.type === 'bilingualBlock') { group.push(b); continue }
      if (b.type === 'signatureBlock') { flush(); children.push(...signatureBlockToDocx(b, 'both', contextEn)) }
    }
    flush()
  } else {
    for (const b of body) {
      if (b.type === 'bilingualBlock') {
        children.push(...bodyToDocx(b, 'en', contextEn))
        children.push(...bodyToDocx(b, 'id', contextId ?? contextEn))
      } else if (b.type === 'signatureBlock') {
        children.push(...signatureBlockToDocx(b, 'both', contextEn))
      }
    }
  }

  return new Document({
    ...(numbering.length ? { numbering: { config: numbering } } : {}),
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children }],
  })
}

export async function exportDocumentDocx(opts: ExportDocumentDocxOptions): Promise<void> {
  const document = await assembleDocxDocument(opts)
  const blob = await Packer.toBlob(document)
  triggerDownload(blob, `${sanitizeFilename(opts.title)}.docx`)
}
