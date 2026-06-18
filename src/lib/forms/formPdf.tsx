// Form PDF export — faithful reproductions of the paper Indonesian HR forms
// (Formulir Permintaan Cuti / Formulir Pengajuan Lembur). Renders a
// self-contained HTML layout and posts it to the flodok-router /pdf service
// (Cloudflare Browser Rendering) for a one-click download — the same pipeline
// document PDF export uses. Labels are Indonesian to match the originals.

import { renderToStaticMarkup } from 'react-dom/server'
import { supabase } from '../supabase'
import type { FormIdentity } from './registry'

// ─── Data shapes ────────────────────────────────────────────────────────────

export interface PdfApproval { name: string | null; date: string | null }
export interface PdfApprovals { employee: PdfApproval; supervisor: PdfApproval; hr: PdfApproval }

export interface LeavePdfData {
  kind: 'leave'
  referenceNumber: string | null
  identity: FormIdentity
  supervisorName: string | null
  leaveTypeKey: string
  dateStart: string | null
  dateEnd: string | null
  totalDays: number | null
  shortFrom: string | null
  shortTo: string | null
  reason: string | null
  replacements: string[]
  approvals: PdfApprovals
}

export interface OvertimePdfData {
  kind: 'overtime'
  referenceNumber: string | null
  identity: FormIdentity
  supervisorName: string | null
  workStatusLabel: string
  lines: { date: string; isOtDay: boolean; start: string; end: string; hours: number; reason: string | null }[]
  totalDays: number
  totalHours: number
  approvals: PdfApprovals
}

export type FormPdfData = LeavePdfData | OvertimePdfData

const LEAVE_TYPES_ID: { key: string; label: string }[] = [
  { key: 'annual', label: 'Cuti Tahunan' },
  { key: 'sick_no_note', label: 'Cuti Sakit tanpa Surat Dokter' },
  { key: 'special', label: 'Cuti Khusus' },
  { key: 'unpaid', label: 'Cuti Tidak Dibayar / Izin' },
  { key: 'sick_with_note', label: 'Cuti Sakit dengan Surat Dokter' },
  { key: 'national_holiday', label: 'Libur Nasional / Penggantian Libur Nasional' },
  { key: 'short_time', label: 'Short Time (Datang Terlambat / Pulang Cepat)' },
]

// ─── Styles (self-contained; light theme, print-friendly) ───────────────────

const FORM_PAPER_STYLES = `
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: #111827; background: #fff; font-size: 10.5pt; }
.page { max-width: 190mm; margin: 0 auto; padding: 4mm; }
.title { color: #1f6fc4; font-size: 15pt; font-weight: 700; margin: 0 0 10px; letter-spacing: .02em; }
.ref { font-size: 8.5pt; color: #6b7280; margin: 0 0 10px; }
table { width: 100%; border-collapse: collapse; }
td, th { border: 1px solid #111827; padding: 4px 6px; vertical-align: top; font-size: 9.5pt; }
.lbl { font-weight: 600; white-space: nowrap; }
.hdr { background: #2f6fba; color: #fff; font-weight: 700; text-align: center; }
.hdr-light { background: #dbe7f5; font-weight: 700; text-align: center; }
.checks { width: 100%; margin: 10px 0; }
.checks td { border: none; padding: 3px 6px; font-size: 9.5pt; }
.box { display: inline-block; width: 12px; height: 12px; border: 1px solid #111827; margin-right: 6px; text-align: center; line-height: 12px; font-size: 10px; vertical-align: middle; }
.sign td { height: 70px; vertical-align: bottom; text-align: center; font-size: 9pt; }
.sign .who { vertical-align: top; font-weight: 600; }
.sign .name { font-size: 8.5pt; color: #374151; }
.muted { color: #6b7280; }
.center { text-align: center; }
.section-gap { height: 10px; }
`

// ─── Layout components ──────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

function SignatureFooter({ approvals, labels }: { approvals: PdfApprovals; labels: [string, string, string] }) {
  const cells: [string, PdfApproval][] = [
    [labels[0], approvals.employee],
    [labels[1], approvals.supervisor],
    [labels[2], approvals.hr],
  ]
  return (
    <table className="sign" style={{ marginTop: '14px' }}>
      <tbody>
        <tr>{cells.map(([who], i) => <td key={i} className="who hdr-light">{who}</td>)}</tr>
        <tr>{cells.map(([, a], i) => (
          <td key={i} className="name">
            {a.name ? <>{a.name}<br />{fmtDate(a.date)}</> : <span className="muted">&nbsp;</span>}
          </td>
        ))}</tr>
      </tbody>
    </table>
  )
}

function LeavePaper({ d }: { d: LeavePdfData }) {
  const id = d.identity
  return (
    <div className="page">
      <h1 className="title">FORMULIR PERMINTAAN CUTI</h1>
      {d.referenceNumber && <div className="ref">No. {d.referenceNumber}</div>}
      <table>
        <tbody>
          <tr>
            <td className="lbl">NAMA</td><td>{id.name ?? ''}</td>
            <td className="lbl">JABATAN</td><td>{id.job_position ?? ''}</td>
            <td className="lbl">NO TEL/WA</td><td>{id.phone ?? ''}</td>
          </tr>
          <tr>
            <td className="lbl">ATASAN</td><td>{d.supervisorName ?? ''}</td>
            <td className="lbl">JABATAN</td><td></td>
            <td className="lbl">DEPARTEMEN</td><td>{id.department ?? ''}</td>
          </tr>
        </tbody>
      </table>

      <table className="checks">
        <tbody>
          {[0, 1, 2, 3].map(rowIdx => (
            <tr key={rowIdx}>
              {[0, 1].map(colIdx => {
                const lt = LEAVE_TYPES_ID[rowIdx * 2 + colIdx]
                if (!lt) return <td key={colIdx} />
                return (
                  <td key={colIdx}>
                    <span className="box">{d.leaveTypeKey === lt.key ? '✓' : ''}</span>{lt.label}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <table>
        <tbody>
          <tr>
            <td className="lbl">Tanggal Pengambilan Cuti</td>
            <td>Dari: {fmtDate(d.dateStart)}</td>
            <td>Sampai: {fmtDate(d.dateEnd)}</td>
          </tr>
          <tr><td className="lbl">Total Hari Cuti</td><td colSpan={2}>{d.totalDays ?? ''}</td></tr>
          <tr>
            <td className="lbl">Short Time (Datang Terlambat / Pulang Cepat)</td>
            <td>Dari Jam: {d.shortFrom ?? ''}</td>
            <td>Sampai Jam: {d.shortTo ?? ''}</td>
          </tr>
          <tr><td className="lbl">Alasan</td><td colSpan={2} style={{ height: '46px' }}>{d.reason ?? ''}</td></tr>
          <tr>
            <td className="lbl">Nama Karyawan Pengganti selama cuti</td>
            <td>1) {d.replacements[0] ?? ''}</td>
            <td>2) {d.replacements[1] ?? ''}</td>
          </tr>
        </tbody>
      </table>

      <SignatureFooter approvals={d.approvals} labels={['Karyawan', 'Atasan Bersangkutan', 'HRD']} />
    </div>
  )
}

function OvertimePaper({ d }: { d: OvertimePdfData }) {
  const id = d.identity
  return (
    <div className="page">
      <h1 className="title">FORMULIR PENGAJUAN LEMBUR</h1>
      {d.referenceNumber && <div className="ref">No. {d.referenceNumber}</div>}
      <table>
        <tbody>
          <tr className="hdr"><td>NAMA KARYAWAN</td><td>JABATAN</td><td>DEPARTEMEN</td><td>STATUS KERJA</td></tr>
          <tr><td>{id.name ?? ''}</td><td>{id.job_position ?? ''}</td><td>{id.department ?? ''}</td><td>{d.workStatusLabel}</td></tr>
          <tr className="hdr"><td colSpan={2}>NAMA ATASAN</td><td colSpan={2}>JABATAN</td></tr>
          <tr><td colSpan={2}>{d.supervisorName ?? ''}</td><td colSpan={2}></td></tr>
        </tbody>
      </table>

      <div className="section-gap" />
      <table>
        <tbody>
          <tr className="hdr">
            <td>TANGGAL</td><td>TOTAL HARI LEMBUR<br /><span style={{ fontWeight: 400, fontSize: '8pt' }}>(Jika Jam Lembur mencapai 8 jam)</span></td>
            <td>JAM MULAI</td><td>JAM BERAKHIR</td><td>TOTAL JAM LEMBUR</td><td>ALASAN LEMBUR</td>
          </tr>
          {d.lines.map((l, i) => (
            <tr key={i}>
              <td>{fmtDate(l.date)}</td>
              <td className="center">{l.hours >= 8 ? '1' : ''}</td>
              <td className="center">{l.start}</td>
              <td className="center">{l.end}</td>
              <td className="center">{l.hours}</td>
              <td>{l.reason ?? ''}</td>
            </tr>
          ))}
          <tr>
            <td className="lbl hdr-light">TOTAL HARI LEMBUR</td><td className="center">{d.totalDays}</td>
            <td className="lbl hdr-light" colSpan={2}>TOTAL JAM LEMBUR</td><td className="center">{d.totalHours}</td><td></td>
          </tr>
        </tbody>
      </table>

      <SignatureFooter approvals={d.approvals} labels={['PEMOHON', 'ATASAN', 'HR']} />
    </div>
  )
}

// ─── Export ─────────────────────────────────────────────────────────────────

export async function exportFormPdf(data: FormPdfData): Promise<void> {
  const workerUrl = import.meta.env.VITE_FLODOK_ROUTER_URL
  if (!workerUrl) throw new Error('PDF export not configured — VITE_FLODOK_ROUTER_URL is missing')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const title = data.kind === 'leave' ? 'Formulir Permintaan Cuti' : 'Formulir Pengajuan Lembur'
  const body = renderToStaticMarkup(data.kind === 'leave' ? <LeavePaper d={data} /> : <OvertimePaper d={data} />)
  const filename = sanitizeFilename(`${title}${data.referenceNumber ? ' ' + data.referenceNumber : ''}`)
  const html = [
    '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title><style>`, FORM_PAPER_STYLES, '</style></head><body>',
    body, '</body></html>',
  ].join('')

  const res = await fetch(workerUrl.replace(/\/+$/, '') + '/pdf', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, filename }),
  })
  if (!res.ok) {
    let message = `PDF render failed (HTTP ${res.status})`
    try { const e = await res.json() as { error?: string }; if (e.error) message = e.error } catch { /* keep generic */ }
    throw new Error(message)
  }
  const blob = await res.blob()
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = `${filename}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
}

function sanitizeFilename(input: string): string {
  const cleaned = input.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 80)
  return cleaned || 'form'
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
