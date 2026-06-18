// Structured-document starter for the one-way employee NDA.
//
// Builds a bilingual (EN/ID) `DocumentDoc` with the standard confidentiality
// clauses, authored on both language sides so it's usable immediately. Merge
// tokens plug in the structured fields (effective date, survival period,
// penalty) and the signature blocks. This is a starting point, not legal
// advice — orgs should refine clauses and have counsel review (notably the
// liquidated-damages clause's enforceability under Indonesian law).
//
// Used by the "New NDA" flow (Documents.tsx) and the NDA template starter.

import {
  newSectionId,
  newBlockId,
  normalizeDoc,
  type DocNode,
  type DocumentDoc,
} from './documentDoc'

function text(value: string): DocNode {
  return { type: 'text', text: value }
}
function bold(value: string): DocNode {
  return { type: 'text', text: value, marks: [{ type: 'bold' }] }
}
function mergeField(key: string): DocNode {
  return { type: 'mergeField', attrs: { key } }
}
function para(...inline: DocNode[]): DocNode {
  return { type: 'paragraph', content: inline }
}
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

export function buildNdaStarterDoc(): DocumentDoc {
  const parties = section('Parties', 'Para Pihak', [
    block(
      [
        para(
          text('This Non-Disclosure Agreement (the "Agreement") is effective as of '),
          mergeField('nda_effective_date'), text(','),
        ),
        para(bold('BETWEEN:')),
        para(
          bold('the Disclosing Party'), text(': '),
          mergeField('org_name'), text(', a company organised under the laws of the Republic of Indonesia, with its registered office at '),
          mergeField('org_address'), text('.'),
        ),
        para(bold('AND:')),
        para(
          bold('the Receiving Party'), text(': '),
          mergeField('employee_name'), text(', holder of KTP/NIK No. '),
          mergeField('employee_ktp_nik'), text(', residing at '),
          mergeField('employee_address'), text('.'),
        ),
        para(text('The parties agree as follows.')),
      ],
      [
        para(
          text('Perjanjian Kerahasiaan ini ("Perjanjian") berlaku efektif sejak '),
          mergeField('nda_effective_date'), text(','),
        ),
        para(bold('ANTARA:')),
        para(
          bold('Pihak yang Mengungkapkan'), text(': '),
          mergeField('org_name'), text(', sebuah perusahaan yang didirikan berdasarkan hukum Republik Indonesia, berkedudukan di '),
          mergeField('org_address'), text('.'),
        ),
        para(bold('DAN:')),
        para(
          bold('Pihak Penerima'), text(': '),
          mergeField('employee_name'), text(', pemegang KTP/NIK No. '),
          mergeField('employee_ktp_nik'), text(', beralamat di '),
          mergeField('employee_address'), text('.'),
        ),
        para(text('Para pihak menyepakati hal-hal sebagai berikut.')),
      ],
    ),
  ])

  const confidentialInfo = section('Confidential Information', 'Informasi Rahasia', [
    block(
      [para(text('"Confidential Information" means all non-public information disclosed by the Disclosing Party to the Receiving Party, in any form, including business plans, financial data, customer and employee data, trade secrets, know-how, software, and any other information that a reasonable person would understand to be confidential.'))],
      [para(text('"Informasi Rahasia" berarti seluruh informasi non-publik yang diungkapkan oleh Pihak yang Mengungkapkan kepada Pihak Penerima, dalam bentuk apa pun, termasuk rencana bisnis, data keuangan, data pelanggan dan karyawan, rahasia dagang, pengetahuan teknis (know-how), perangkat lunak, dan informasi lain yang secara wajar dipahami bersifat rahasia.'))],
    ),
  ])

  const obligations = section('Obligations of the Receiving Party', 'Kewajiban Pihak Penerima', [
    block(
      [para(text('The Receiving Party shall (a) keep the Confidential Information strictly confidential; (b) use it solely for the purpose of performing their duties for the Disclosing Party; and (c) not disclose it to any third party without the Disclosing Party’s prior written consent.'))],
      [para(text('Pihak Penerima wajib (a) menjaga kerahasiaan Informasi Rahasia secara ketat; (b) menggunakannya semata-mata untuk pelaksanaan tugasnya bagi Pihak yang Mengungkapkan; dan (c) tidak mengungkapkannya kepada pihak ketiga mana pun tanpa persetujuan tertulis sebelumnya dari Pihak yang Mengungkapkan.'))],
    ),
  ])

  const exclusions = section('Exclusions', 'Pengecualian', [
    block(
      [para(text('These obligations do not apply to information that (a) is or becomes publicly available through no fault of the Receiving Party; (b) was lawfully known to the Receiving Party before disclosure; (c) is independently developed without use of the Confidential Information; or (d) is required to be disclosed by law or court order, provided the Receiving Party gives prompt notice to the Disclosing Party.'))],
      [para(text('Kewajiban ini tidak berlaku terhadap informasi yang (a) telah atau menjadi tersedia untuk umum bukan karena kesalahan Pihak Penerima; (b) telah diketahui secara sah oleh Pihak Penerima sebelum pengungkapan; (c) dikembangkan secara independen tanpa menggunakan Informasi Rahasia; atau (d) wajib diungkapkan berdasarkan hukum atau putusan pengadilan, dengan ketentuan Pihak Penerima segera memberitahukan Pihak yang Mengungkapkan.'))],
    ),
  ])

  const term = section('Term and Survival', 'Jangka Waktu dan Keberlangsungan', [
    block(
      [para(
        text('This Agreement applies throughout the Receiving Party’s employment and shall continue for '),
        mergeField('nda_survival_period'),
        text(' after the end of employment, regardless of the reason for termination.'),
      )],
      [para(
        text('Perjanjian ini berlaku selama masa kerja Pihak Penerima dan tetap berlanjut selama '),
        mergeField('nda_survival_period'),
        text(' setelah berakhirnya hubungan kerja, terlepas dari alasan pengakhiran.'),
      )],
    ),
  ])

  const returnMaterials = section('Return of Materials', 'Pengembalian Materi', [
    block(
      [para(text('Upon termination of employment or upon request, the Receiving Party shall promptly return or destroy all materials containing Confidential Information, in any form.'))],
      [para(text('Pada saat berakhirnya hubungan kerja atau atas permintaan, Pihak Penerima wajib segera mengembalikan atau memusnahkan seluruh materi yang memuat Informasi Rahasia, dalam bentuk apa pun.'))],
    ),
  ])

  const penalty = section('Liquidated Damages', 'Ganti Rugi (Denda)', [
    block(
      [para(
        text('In the event of a breach of this Agreement, the Receiving Party shall be liable to pay liquidated damages of '),
        mergeField('nda_penalty_idr'),
        text(' to the Disclosing Party, without prejudice to any other remedies available at law. (Remove this clause if no penalty applies.)'),
      )],
      [para(
        text('Dalam hal terjadi pelanggaran terhadap Perjanjian ini, Pihak Penerima wajib membayar ganti rugi sebesar '),
        mergeField('nda_penalty_idr'),
        text(' kepada Pihak yang Mengungkapkan, tanpa mengurangi upaya hukum lainnya yang tersedia. (Hapus klausul ini jika tidak ada denda.)'),
      )],
    ),
  ])

  const remedies = section('Remedies', 'Upaya Hukum', [
    block(
      [para(text('The Receiving Party acknowledges that a breach may cause irreparable harm for which monetary damages alone are insufficient, and the Disclosing Party shall be entitled to seek injunctive relief in addition to any other remedies.'))],
      [para(text('Pihak Penerima mengakui bahwa pelanggaran dapat menimbulkan kerugian yang tidak dapat dipulihkan yang tidak cukup diganti dengan ganti rugi uang semata, dan Pihak yang Mengungkapkan berhak mengajukan upaya pencegahan (injunctive relief) selain upaya hukum lainnya.'))],
    ),
  ])

  const governingLaw = section('Governing Law and Jurisdiction', 'Hukum yang Berlaku dan Yurisdiksi', [
    block(
      [para(text('This Agreement is governed by the laws of the Republic of Indonesia. Any dispute shall be submitted to the competent District Court (Pengadilan Negeri) in the jurisdiction of the Disclosing Party’s domicile.'))],
      [para(text('Perjanjian ini diatur oleh hukum Republik Indonesia. Setiap sengketa akan diajukan ke Pengadilan Negeri yang berwenang di wilayah hukum tempat kedudukan Pihak yang Mengungkapkan.'))],
    ),
  ])

  const signatures = section('Signatures', 'Tanda Tangan', [
    block(
      [
        para(bold('Disclosing Party')),
        para(mergeField('employer_signature')),
        para(mergeField('employer_name'), text(', '), mergeField('employer_title')),
        para(text('Date: '), mergeField('employer_sign_date')),
        para(text(' ')),
        para(bold('Receiving Party')),
        para(mergeField('employee_signature')),
        para(mergeField('employee_name')),
        para(text('Date: '), mergeField('employee_sign_date')),
      ],
      [
        para(bold('Pihak yang Mengungkapkan')),
        para(mergeField('employer_signature')),
        para(mergeField('employer_name'), text(', '), mergeField('employer_title')),
        para(text('Tanggal: '), mergeField('employer_sign_date')),
        para(text(' ')),
        para(bold('Pihak Penerima')),
        para(mergeField('employee_signature')),
        para(mergeField('employee_name')),
        para(text('Tanggal: '), mergeField('employee_sign_date')),
      ],
    ),
  ])

  return normalizeDoc({
    type: 'document',
    content: [
      parties,
      confidentialInfo,
      obligations,
      exclusions,
      term,
      returnMaterials,
      penalty,
      remedies,
      governingLaw,
      signatures,
    ],
  })
}
