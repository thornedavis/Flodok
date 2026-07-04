// Shared renderer for the `signatureBlock` node.
//
// One source of truth used by the editor NodeView (SignatureBlockView) AND the
// two read-path renderers (DocumentRenderer, BilingualDocumentRenderer), so a
// signature looks identical on screen, in the portal download, and in every
// export. It resolves the party's signature / name / title / date live from the
// MergeContext using the SAME resolvers the {{employee_signature}} tokens use —
// so the portal's live font-preview (as the employee tabs through fonts) and the
// persisted signed state both flow through here for free.
//
// The block is language-neutral (authored once). `lang` only controls the
// caption + the "Date" label; `'both'` renders a bilingual caption for the
// side-by-side PDF where the block spans both columns.

import { resolveMergeField, type MergeContext, type MergeFieldKey } from '../../../lib/mergeFields'
import type { SignatureBlockAttrs, SignatureRole } from '../../../lib/documentDoc'

export type SignatureCaptionLang = 'en' | 'id' | 'both'

// Blank wet-signature line — matches the width feel of renderSignatureHtml's
// underline so a blank line and a signed line sit at the same length.
const BLANK_LINE = '________________________'

const ROLE_LABEL: Record<SignatureRole, { en: string; id: string }> = {
  employee: { en: 'Employee', id: 'Karyawan' },
  employer: { en: 'Employer', id: 'Pemberi Kerja' },
  blank: { en: 'Signature', id: 'Tanda tangan' },
}

const DATE_LABEL = { en: 'Date', id: 'Tanggal' } as const

const SIG_KEY: Record<'employee' | 'employer', MergeFieldKey> = {
  employee: 'employee_signature',
  employer: 'employer_signature',
}
const NAME_KEY: Record<'employee' | 'employer', MergeFieldKey> = {
  employee: 'employee_name',
  employer: 'employer_name',
}
const DATE_KEY: Record<'employee' | 'employer', MergeFieldKey> = {
  employee: 'employee_sign_date',
  employer: 'employer_sign_date',
}

// Coerce raw stored attrs (read straight from content_doc JSON on the read
// paths, where TipTap hasn't filled schema defaults) into a complete attrs
// object. The editor NodeView can also use it for uniformity.
export function signatureAttrsFrom(raw: Record<string, unknown> | undefined): SignatureBlockAttrs {
  const role = raw?.role
  return {
    role: role === 'employer' || role === 'blank' ? role : 'employee',
    showDate: raw?.showDate !== false,
    showTitle: raw?.showTitle !== false,
    label: typeof raw?.label === 'string' ? raw.label : null,
  }
}

function caption(attrs: SignatureBlockAttrs, lang: SignatureCaptionLang): string {
  const override = attrs.label?.trim()
  if (override) return override
  const l = ROLE_LABEL[attrs.role]
  return lang === 'both' ? `${l.en} / ${l.id}` : l[lang]
}

export function SignatureBlockContent({ attrs, ctx, lang }: {
  attrs: SignatureBlockAttrs
  ctx: MergeContext
  lang: SignatureCaptionLang
}) {
  const dateLabel = lang === 'id' ? DATE_LABEL.id : DATE_LABEL.en
  const cap = caption(attrs, lang)

  // Blank line — a printed wet-signature slot, no merge resolution.
  if (attrs.role === 'blank') {
    return (
      <div className="signature-block" data-signature-block="true" data-role="blank">
        <div className="signature-caption">{cap}</div>
        <div className="signature-line">{BLANK_LINE}</div>
        {attrs.showDate && <div className="signature-date-line">{dateLabel}: {BLANK_LINE}</div>}
      </div>
    )
  }

  const role = attrs.role
  return (
    <div className="signature-block" data-signature-block="true" data-role={role}>
      <div className="signature-caption">{cap}</div>
      {/* resolveMergeField emits an HTML <span> (cursive signature + underline,
          or the blank underscores) — inject as HTML like the merge-field pills. */}
      <div className="signature-line" dangerouslySetInnerHTML={{ __html: resolveMergeField(SIG_KEY[role], ctx) }} />
      <div className="signature-name-line">{resolveMergeField(NAME_KEY[role], ctx)}</div>
      {attrs.showTitle && role === 'employer' && (
        <div className="signature-title-line">{resolveMergeField('employer_title', ctx)}</div>
      )}
      {attrs.showDate && (
        <div className="signature-date-line">
          {dateLabel}: <span dangerouslySetInnerHTML={{ __html: resolveMergeField(DATE_KEY[role], ctx) }} />
        </div>
      )}
    </div>
  )
}

// Styles for the signature block — imported by the editor styles and appended to
// both renderer stylesheets so the block looks the same everywhere. The cursive
// signature span itself carries inline styles from renderSignatureHtml (font +
// underline), so these rules only govern the surrounding chrome.
export const SIGNATURE_BLOCK_STYLES = `
.signature-block { margin: 1.75rem 0 0.5rem; max-width: 22rem; break-inside: avoid; page-break-inside: avoid; }
.signature-block .signature-caption { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--color-text-tertiary); margin-bottom: 1.4rem; }
.signature-block .signature-line { min-height: 1.6em; line-height: 1; }
.signature-block .signature-name-line { font-weight: 600; font-size: 0.9rem; margin-top: 0.35rem; }
.signature-block .signature-title-line { font-size: 0.8rem; color: var(--color-text-secondary); }
.signature-block .signature-date-line { font-size: 0.8rem; color: var(--color-text-secondary); margin-top: 0.35rem; }
`
