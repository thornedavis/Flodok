// Client-side payslip PDF. Builds a clean A4 payslip from a frozen settlement
// (admin_payslip RPC) and renders it with html2pdf — the same client-side path
// the portal uses for documents. Bilingual via a small self-contained label
// map. Flodok issues this as an internal/record payslip; statutory tax (PPh 21)
// and BPJS are handled by the company's payroll provider, so the disclaimer
// says so rather than implying Flodok computed them.

import html2pdf from 'html2pdf.js'
import { formatIdr } from './credits'

export type PayslipLine = {
  line_type: 'base' | 'allowance' | 'adjustment' | string
  name: string
  kind: string
  is_fixed: boolean
  amount_idr: number
}

export type PayslipData = {
  period: string
  settled_at: string | null
  org: { name: string | null }
  employee: {
    name: string | null
    job_position: string | null
    ktp_nik: string | null
    npwp: string | null
    bank_name: string | null
    bank_account_number: string | null
    bank_account_holder: string | null
  }
  totals: { base_idr: number; allowance_idr: number; adjustment_net_idr: number; payout_idr: number }
  lines: PayslipLine[]
}

const L = {
  en: {
    payslip: 'PAYSLIP', period: 'Period', employee: 'Employee', position: 'Position',
    nik: 'KTP / NIK', npwp: 'NPWP', earnings: 'Earnings', deductions: 'Deductions',
    gross: 'Gross earnings', totalDed: 'Total deductions', net: 'Net pay (take-home)',
    bank: 'Bank account', generated: 'Generated',
    disclaimer: 'System-generated payslip. Income tax (PPh 21) and BPJS are administered by the company’s payroll provider.',
  },
  id: {
    payslip: 'SLIP GAJI', period: 'Periode', employee: 'Karyawan', position: 'Jabatan',
    nik: 'KTP / NIK', npwp: 'NPWP', earnings: 'Penghasilan', deductions: 'Potongan',
    gross: 'Total Penghasilan', totalDed: 'Total Potongan', net: 'Gaji Bersih (Take-home)',
    bank: 'Rekening', generated: 'Dibuat',
    disclaimer: 'Slip gaji dibuat oleh sistem. Pajak penghasilan (PPh 21) dan BPJS dikelola oleh penyedia payroll perusahaan.',
  },
}

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function monthLabel(period: string, lang: 'en' | 'id'): string {
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { month: 'long', year: 'numeric' })
    .format(new Date(period + 'T00:00:00'))
}

function row(label: string, amount: number, lang: 'en' | 'id'): string {
  return `<tr>
    <td style="padding:5px 0;color:#222;">${esc(label)}</td>
    <td style="padding:5px 0;text-align:right;color:#222;font-variant-numeric:tabular-nums;">${formatIdr(amount, lang)}</td>
  </tr>`
}

export async function downloadPayslipPdf(data: PayslipData, lang: 'en' | 'id'): Promise<void> {
  const t = L[lang]
  const earnings = data.lines.filter(l => l.amount_idr >= 0)
  const deductions = data.lines.filter(l => l.amount_idr < 0)
  const grossEarnings = earnings.reduce((s, l) => s + l.amount_idr, 0)
  const totalDeductions = deductions.reduce((s, l) => s + Math.abs(l.amount_idr), 0)
  const net = data.totals.payout_idr
  const period = monthLabel(data.period, lang)
  const empName = data.employee.name || '—'
  const bankLine = data.employee.bank_name || data.employee.bank_account_number
    ? `${esc(data.employee.bank_name)} ${esc(data.employee.bank_account_number)}`.trim()
    : ''

  const subRow = (label: string, amount: number, bold = false) => `<tr>
    <td style="padding:6px 0;border-top:1px solid #ddd;color:#222;${bold ? 'font-weight:600;' : ''}">${esc(label)}</td>
    <td style="padding:6px 0;border-top:1px solid #ddd;text-align:right;color:#222;font-variant-numeric:tabular-nums;${bold ? 'font-weight:600;' : ''}">${formatIdr(amount, lang)}</td>
  </tr>`

  const html = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#222; font-size:11pt; line-height:1.45; padding:4px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #222;padding-bottom:10px;margin-bottom:14px;">
      <div style="font-size:15pt;font-weight:700;">${esc(data.org.name) || 'Company'}</div>
      <div style="text-align:right;">
        <div style="font-size:13pt;font-weight:700;letter-spacing:0.5px;">${t.payslip}</div>
        <div style="font-size:10pt;color:#555;">${t.period}: ${esc(period)}</div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:14px;font-size:10pt;">
      <tr>
        <td style="padding:2px 0;color:#777;width:90px;">${t.employee}</td>
        <td style="padding:2px 0;font-weight:600;">${esc(empName)}</td>
        <td style="padding:2px 0;color:#777;width:70px;">${t.position}</td>
        <td style="padding:2px 0;">${esc(data.employee.job_position) || '—'}</td>
      </tr>
      <tr>
        <td style="padding:2px 0;color:#777;">${t.nik}</td>
        <td style="padding:2px 0;">${esc(data.employee.ktp_nik) || '—'}</td>
        <td style="padding:2px 0;color:#777;">${t.npwp}</td>
        <td style="padding:2px 0;">${esc(data.employee.npwp) || '—'}</td>
      </tr>
      ${bankLine ? `<tr>
        <td style="padding:2px 0;color:#777;">${t.bank}</td>
        <td style="padding:2px 0;" colspan="3">${bankLine}</td>
      </tr>` : ''}
    </table>

    <div style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#555;margin-bottom:2px;">${t.earnings}</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:10.5pt;">
      ${earnings.map(l => row(l.name, l.amount_idr, lang)).join('')}
      ${subRow(t.gross, grossEarnings, true)}
    </table>

    ${deductions.length > 0 ? `
    <div style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#555;margin-bottom:2px;">${t.deductions}</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:10.5pt;">
      ${deductions.map(l => row(l.name, Math.abs(l.amount_idr), lang)).join('')}
      ${subRow(t.totalDed, totalDeductions, true)}
    </table>` : ''}

    <table style="width:100%;border-collapse:collapse;margin-top:4px;">
      <tr>
        <td style="padding:10px 0;border-top:2px solid #222;font-weight:700;font-size:12pt;">${t.net}</td>
        <td style="padding:10px 0;border-top:2px solid #222;text-align:right;font-weight:700;font-size:13pt;font-variant-numeric:tabular-nums;">${formatIdr(net, lang)}</td>
      </tr>
    </table>

    <div style="margin-top:22px;font-size:8pt;color:#999;border-top:1px solid #eee;padding-top:8px;">
      ${t.disclaimer}
    </div>
  </div>`

  const wrapper = document.createElement('div')
  wrapper.style.position = 'fixed'
  wrapper.style.top = '0'
  wrapper.style.left = '0'
  wrapper.style.width = '210mm'
  wrapper.style.zIndex = '-9999'
  wrapper.style.overflow = 'hidden'
  wrapper.style.pointerEvents = 'none'
  wrapper.style.background = '#fff'
  wrapper.innerHTML = html
  document.body.appendChild(wrapper)

  const safeName = empName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
  try {
    await html2pdf()
      .set({
        margin: [12, 12, 12, 12],
        filename: `Payslip-${safeName}-${data.period.slice(0, 7)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(wrapper)
      .save()
  } finally {
    document.body.removeChild(wrapper)
  }
}
