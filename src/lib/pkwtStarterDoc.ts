// Structured-document starter for Indonesian employment contracts
// (Phase G.2). Builds a `DocumentDoc` populated with the standard
// PKWT (fixed-term, PP 35/2021) or PKWTT (permanent, UU 13/2003 +
// UU Cipta Kerja) contract structure, authored bilingually on both
// the EN and ID sides so the resulting contract is usable on day
// one without waiting for translation.
//
// Customisation is expected: this is a starting point, not legal
// advice. Orgs should edit clauses to match their actual policies
// (probation length, overtime rules, leave entitlements, etc.).
//
// Used by:
//   - CreateContractModal — populates content_doc when a contract
//     is created from scratch (replaces the old markdown generator
//     that was retired with the markdown editor).
//   - NewTemplateModal — populates content_doc when a template is
//     created from a PKWT / PKWTT starter (instead of blank).

import {
  newSectionId,
  newBlockId,
  normalizeDoc,
  type DocNode,
  type DocumentDoc,
} from './documentDoc'

export type PkwtType = 'pkwt' | 'pkwtt'

// ─── Internal builders ──────────────────────────────────────────────

function text(value: string): DocNode {
  return { type: 'text', text: value }
}

function bold(value: string): DocNode {
  return { type: 'text', text: value, marks: [{ type: 'bold' }] }
}

function mergeField(key: string): DocNode {
  return { type: 'mergeField', attrs: { key } }
}

// Paragraph with arbitrary inline content (text / bold / mergeField).
function para(...inline: DocNode[]): DocNode {
  return { type: 'paragraph', content: inline }
}

function bullets(items: DocNode[][]): DocNode {
  return {
    type: 'bulletList',
    content: items.map(inline => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: inline }],
    })),
  }
}

// One bilingual block — paired EN/ID bodies, each a flow of
// block-level nodes (paragraphs, lists).
function block(en: DocNode[], id: DocNode[]): DocNode {
  return {
    type: 'bilingualBlock',
    attrs: { id: newBlockId(), needsReview: false },
    content: [
      { type: 'blockBody', attrs: { lang: 'en' }, content: en },
      { type: 'blockBody', attrs: { lang: 'id' }, content: id },
    ],
  }
}

function section(titleEn: string, titleId: string, blocks: DocNode[]): DocNode {
  return {
    type: 'section',
    attrs: {
      id: newSectionId(),
      titleEn,
      titleId,
      accentColor: null,
      numberingStyle: 'decimal',
      boxed: false,
    },
    content: blocks,
  }
}

// ─── Public builder ─────────────────────────────────────────────────

export function buildPkwtStarterDoc(type: PkwtType): DocumentDoc {
  const isPKWT = type === 'pkwt'

  const preamble = section('Parties', 'Para Pihak', [
    block(
      [
        para(
          text('This Employment Contract (the "Agreement") is entered into on '),
          bold('this '), mergeField('contract_start_date'), text(','),
        ),
        para(bold('BETWEEN:')),
        para(
          bold('the Employer'), text(': '),
          mergeField('org_name'), text(', a company organised under the laws of the Republic of Indonesia, with its principal office located at '),
          mergeField('org_address'), text('.'),
        ),
        para(bold('AND:')),
        para(
          bold('the Employee'), text(': '),
          mergeField('employee_name'), text(', holder of KTP No. '),
          mergeField('employee_ktp_nik'), text(', residing at '),
          mergeField('employee_address'), text('.'),
        ),
        para(text('The parties agree to the following terms and conditions.')),
      ],
      [
        para(
          text('Perjanjian Kerja ini ("Perjanjian") dibuat pada tanggal '),
          bold('tanggal '), mergeField('contract_start_date'), text(','),
        ),
        para(bold('ANTARA:')),
        para(
          bold('Pemberi Kerja'), text(': '),
          mergeField('org_name'), text(', sebuah perusahaan yang didirikan berdasarkan hukum Republik Indonesia, berkedudukan di '),
          mergeField('org_address'), text('.'),
        ),
        para(bold('DAN:')),
        para(
          bold('Pekerja'), text(': '),
          mergeField('employee_name'), text(', pemegang KTP No. '),
          mergeField('employee_ktp_nik'), text(', beralamat di '),
          mergeField('employee_address'), text('.'),
        ),
        para(text('Para pihak menyepakati syarat dan ketentuan sebagai berikut.')),
      ],
    ),
  ])

  const positionDuties = section('Position and Duties', 'Jabatan dan Tugas', [
    block(
      [
        para(
          bold('Title. '),
          text('The Employee is hired in the '), mergeField('employee_departments'), text(' team.'),
        ),
        para(bold('Reporting. '), text('The Employee shall report to their designated supervisor or such other person as the Employer may designate.')),
        para(bold('Responsibilities. '), text('The Employee agrees to perform the duties customary to this position, including those outlined by the Employer from time to time.')),
      ],
      [
        para(
          bold('Jabatan. '),
          text('Pekerja dipekerjakan dalam tim '), mergeField('employee_departments'), text('.'),
        ),
        para(bold('Pelaporan. '), text('Pekerja melapor kepada atasan yang ditunjuk atau pihak lain yang ditentukan oleh Pemberi Kerja.')),
        para(bold('Tanggung jawab. '), text('Pekerja sepakat melaksanakan tugas yang lazim bagi jabatan ini, termasuk hal-hal yang ditetapkan oleh Pemberi Kerja dari waktu ke waktu.')),
      ],
    ),
  ])

  const duration = isPKWT
    ? section('Contract Duration', 'Durasi Kontrak', [
        block(
          [
            para(
              text('This Agreement commences on '), mergeField('contract_start_date'),
              text(' and terminates on '), mergeField('contract_end_date'),
              text(', unless terminated earlier in accordance with the terms herein.'),
            ),
            para(text('This Agreement may be extended by mutual written consent of both parties, subject to the maximum duration permitted under Government Regulation No. 35 of 2021 (PP 35/2021).')),
            para(text('Upon expiration, the Employee shall be entitled to compensation pay as stipulated under PP 35/2021.')),
          ],
          [
            para(
              text('Perjanjian ini berlaku mulai '), mergeField('contract_start_date'),
              text(' dan berakhir pada '), mergeField('contract_end_date'),
              text(', kecuali diakhiri lebih awal sesuai ketentuan Perjanjian ini.'),
            ),
            para(text('Perjanjian ini dapat diperpanjang berdasarkan kesepakatan tertulis para pihak, dengan tunduk pada batas maksimum yang diatur dalam Peraturan Pemerintah No. 35 Tahun 2021 (PP 35/2021).')),
            para(text('Pada saat berakhirnya Perjanjian, Pekerja berhak atas uang kompensasi sebagaimana diatur dalam PP 35/2021.')),
          ],
        ),
      ])
    : section('Contract Duration & Probation', 'Durasi Kontrak & Masa Percobaan', [
        block(
          [
            para(text('This Agreement commences on '), mergeField('contract_start_date'), text(' and continues indefinitely until terminated by either party in accordance with the terms herein.')),
            para(
              bold('Probation. '),
              text('The Employee is subject to a probation period of '),
              mergeField('probation_months'),
              text(' months from the commencement date. During probation, either party may terminate this Agreement with seven (7) days\' written notice.'),
            ),
          ],
          [
            para(text('Perjanjian ini berlaku mulai '), mergeField('contract_start_date'), text(' dan berlangsung untuk waktu yang tidak ditentukan, sampai diakhiri oleh salah satu pihak sesuai ketentuan Perjanjian ini.')),
            para(
              bold('Masa percobaan. '),
              text('Pekerja menjalani masa percobaan selama '),
              mergeField('probation_months'),
              text(' bulan terhitung sejak tanggal mulai. Selama masa percobaan, salah satu pihak dapat mengakhiri Perjanjian ini dengan pemberitahuan tertulis 7 (tujuh) hari sebelumnya.'),
            ),
          ],
        ),
      ])

  const compensation = section('Compensation', 'Kompensasi', [
    block(
      [
        para(bold('Base salary. '), text('The Employee shall receive a monthly base salary of '), mergeField('base_wage_idr'), text(' (gross), payable on the last working day of each month.')),
        para(bold('Allowances. '), mergeField('allowance_idr'), text(' per month, covering transport, meals, and other elastic components of compensation.')),
        para(bold('THR. '), text('The Employee is entitled to a religious holiday allowance (Tunjangan Hari Raya) equivalent to one month\'s salary after twelve (12) months of continuous service, or pro-rated for service less than twelve (12) months.')),
        para(bold('Tax. '), text('Income tax (PPh 21) shall be calculated and withheld in accordance with applicable tax regulations.')),
      ],
      [
        para(bold('Gaji pokok. '), text('Pekerja menerima gaji pokok bulanan sebesar '), mergeField('base_wage_idr'), text(' (bruto), yang dibayarkan pada hari kerja terakhir setiap bulan.')),
        para(bold('Tunjangan. '), mergeField('allowance_idr'), text(' per bulan, mencakup tunjangan transportasi, makan, dan komponen kompensasi tidak tetap lainnya.')),
        para(bold('THR. '), text('Pekerja berhak atas Tunjangan Hari Raya (THR) sebesar satu kali gaji setelah dua belas (12) bulan masa kerja, atau secara proporsional untuk masa kerja kurang dari dua belas (12) bulan.')),
        para(bold('Pajak. '), text('Pajak penghasilan (PPh 21) dihitung dan dipotong sesuai dengan peraturan perpajakan yang berlaku.')),
      ],
    ),
  ])

  const workingHours = section('Working Hours', 'Jam Kerja', [
    block(
      [
        para(
          text('The Employee shall work '), mergeField('hours_per_day'),
          text(' hours per day, '), mergeField('days_per_week'),
          text(' days per week.'),
        ),
        para(text('The specific work schedule shall be determined by the Employer and communicated to the Employee.')),
      ],
      [
        para(
          text('Pekerja bekerja '), mergeField('hours_per_day'),
          text(' jam per hari, '), mergeField('days_per_week'),
          text(' hari per minggu.'),
        ),
        para(text('Jadwal kerja yang lebih rinci akan ditetapkan oleh Pemberi Kerja dan dikomunikasikan kepada Pekerja.')),
      ],
    ),
  ])

  const overtime = section('Overtime', 'Lembur', [
    block(
      [
        para(text('Overtime work shall be compensated in accordance with Indonesian labour law:')),
        bullets([
          [bold('First hour: '), text('1.5x the hourly wage.')],
          [bold('Subsequent hours: '), text('2x the hourly wage.')],
        ]),
        para(text('Overtime must be authorised in advance by the Employee\'s supervisor.')),
      ],
      [
        para(text('Lembur diberikan kompensasi sesuai dengan peraturan ketenagakerjaan Indonesia:')),
        bullets([
          [bold('Jam pertama: '), text('1,5x upah per jam.')],
          [bold('Jam berikutnya: '), text('2x upah per jam.')],
        ]),
        para(text('Lembur wajib mendapat persetujuan terlebih dahulu dari atasan Pekerja.')),
      ],
    ),
  ])

  const leave = section('Leave', 'Cuti', [
    block(
      [
        para(
          bold('Annual leave. '),
          mergeField('annual_leave_days'),
          text(' working days of paid annual leave per year, after completing twelve (12) months of continuous service.'),
        ),
        para(bold('Sick leave. '), text('As per applicable law, with a valid medical certificate.')),
        para(bold('Maternity leave. '), text('Three (3) months total (1.5 months before and 1.5 months after delivery) with full pay, as per UU 13/2003.')),
        para(bold('Other leave. '), text('As stipulated under applicable Indonesian labour law.')),
      ],
      [
        para(
          bold('Cuti tahunan. '),
          mergeField('annual_leave_days'),
          text(' hari kerja cuti tahunan berbayar setelah dua belas (12) bulan masa kerja terus-menerus.'),
        ),
        para(bold('Cuti sakit. '), text('Sesuai peraturan yang berlaku, dengan surat keterangan dokter yang sah.')),
        para(bold('Cuti melahirkan. '), text('Total tiga (3) bulan (1,5 bulan sebelum dan 1,5 bulan setelah melahirkan) dengan upah penuh, sesuai UU 13/2003.')),
        para(bold('Cuti lain. '), text('Sebagaimana diatur dalam peraturan ketenagakerjaan Indonesia yang berlaku.')),
      ],
    ),
  ])

  const bpjs = section('Social Security (BPJS)', 'Jaminan Sosial (BPJS)', [
    block(
      [
        para(text('The Employer shall register the Employee in BPJS Kesehatan (health insurance) and BPJS Ketenagakerjaan (employment social security) in accordance with applicable law.')),
        para(text('Contributions shall be shared between the Employer and Employee as prescribed by regulation.')),
      ],
      [
        para(text('Pemberi Kerja mendaftarkan Pekerja pada BPJS Kesehatan dan BPJS Ketenagakerjaan sesuai dengan peraturan yang berlaku.')),
        para(text('Iuran ditanggung bersama oleh Pemberi Kerja dan Pekerja sesuai dengan ketentuan yang berlaku.')),
      ],
    ),
  ])

  const termination = section('Termination', 'Pemutusan Hubungan Kerja', [
    block(
      [
        para(text('Either party may terminate this Agreement in accordance with the provisions of UU 13/2003 on Manpower and its amendments under UU 11/2020 (Cipta Kerja).')),
        para(text('The Employee shall be entitled to severance pay, service pay, and compensation rights as applicable under law.')),
        para(text('Grounds for termination by the Employer include, but are not limited to: serious misconduct, repeated violation of company rules, or prolonged absence without notice.')),
      ],
      [
        para(text('Para pihak dapat mengakhiri Perjanjian ini sesuai dengan ketentuan UU 13/2003 tentang Ketenagakerjaan dan perubahannya melalui UU 11/2020 (Cipta Kerja).')),
        para(text('Pekerja berhak atas uang pesangon, uang penghargaan masa kerja, dan uang penggantian hak yang berlaku sesuai dengan peraturan.')),
        para(text('Alasan pemutusan oleh Pemberi Kerja meliputi, namun tidak terbatas pada: pelanggaran berat, pelanggaran berulang terhadap peraturan perusahaan, atau ketidakhadiran berkepanjangan tanpa pemberitahuan.')),
      ],
    ),
  ])

  const confidentiality = section('Confidentiality', 'Kerahasiaan', [
    block(
      [para(text('The Employee shall maintain the confidentiality of all proprietary information, trade secrets, and business operations of the Employer during and after the term of employment.'))],
      [para(text('Pekerja wajib menjaga kerahasiaan seluruh informasi milik perusahaan, rahasia dagang, dan operasi bisnis Pemberi Kerja selama dan setelah masa kerja berakhir.'))],
    ),
  ])

  const general = section('General Provisions', 'Ketentuan Umum', [
    block(
      [
        para(text('This Agreement is governed by the laws of the Republic of Indonesia.')),
        para(text('Any disputes arising from this Agreement shall be resolved through deliberation (musyawarah) and, failing that, through the Industrial Relations Court.')),
        para(text('This Agreement is made in duplicate, each copy having equal legal force, one for each party.')),
      ],
      [
        para(text('Perjanjian ini tunduk pada hukum Republik Indonesia.')),
        para(text('Sengketa yang timbul dari Perjanjian ini diselesaikan melalui musyawarah, dan apabila tidak tercapai kesepakatan, melalui Pengadilan Hubungan Industrial.')),
        para(text('Perjanjian ini dibuat dalam rangkap dua, masing-masing mempunyai kekuatan hukum yang sama, satu untuk setiap pihak.')),
      ],
    ),
  ])

  // Authored as sections for readability, then flattened to the live
  // schema so the starter matches what the editor produces.
  return normalizeDoc({
    type: 'document',
    content: [
      preamble,
      positionDuties,
      duration,
      compensation,
      workingHours,
      overtime,
      leave,
      bpjs,
      termination,
      confidentiality,
      general,
    ],
  })
}
