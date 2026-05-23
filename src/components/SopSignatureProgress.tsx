import { useState } from 'react'

// Shape of the JSON returned by the public.sop_signature_progress RPC
// (defined in migration 114_sop_audience_rpcs.sql). Mirrored here so
// callers don't have to import database.ts Json gymnastics.
export interface SignatureProgressData {
  sop_id: string
  current_version: number
  required_count: number
  signed_count: number
  employees: Array<{
    employee_id: string
    name: string
    job_position: string | null
    signed_at: string | null
    typed_name: string | null
    required_via: string | null
  }>
  extra_signatures: Array<{
    employee_id: string
    signed_at: string
    typed_name: string | null
    required_via: string | null
    version_number: number
  }>
}

const REQUIRED_VIA_LABEL: Record<string, string> = {
  everyone: 'Everyone',
  employee: 'Direct',
  department: 'Department',
  branch: 'Branch',
  job_position: 'Position',
  job_level: 'Level',
  employee_class: 'Class',
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return iso.slice(0, 10)
  }
}

export function SopSignatureProgress({
  data,
  loading,
  status,
}: {
  data: SignatureProgressData | null
  loading?: boolean
  // Drafts haven't been published yet, so the picture is "who will be
  // required once you publish" rather than "who has signed".
  status: 'draft' | 'active' | 'archived'
}) {
  const [extrasOpen, setExtrasOpen] = useState(false)

  if (loading) {
    return (
      <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
        Loading signatures…
      </div>
    )
  }
  if (!data) return null

  const { required_count, signed_count, employees, extra_signatures, current_version } = data
  const pct = required_count === 0 ? 0 : Math.round((signed_count / required_count) * 100)
  const isDraft = status === 'draft'

  if (required_count === 0 && extra_signatures.length === 0) {
    return (
      <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
        {isDraft
          ? 'Set an audience above; required signatures will appear here once you publish.'
          : 'No required signers — the audience is empty.'}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Headline counts + progress bar */}
      <div>
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            {isDraft ? `${required_count} required on publish` : `${signed_count} of ${required_count} signed`}
          </div>
          {!isDraft && required_count > 0 && (
            <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
              v{current_version} · {pct}%
            </div>
          )}
        </div>
        {!isDraft && required_count > 0 && (
          <div
            className="mt-1 h-1.5 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
            aria-hidden
          >
            <div
              className="h-full transition-[width]"
              style={{
                width: `${pct}%`,
                backgroundColor: 'var(--color-primary)',
              }}
            />
          </div>
        )}
      </div>

      {/* Per-employee list */}
      {employees.length > 0 && (
        <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
          {employees.map(emp => (
            <li key={emp.employee_id} className="flex items-center justify-between gap-2 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs" style={{ color: 'var(--color-text)' }}>
                  {emp.name}
                </div>
                <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {emp.required_via && (
                    <span
                      className="inline-flex rounded-full px-1.5 py-px text-[9px] font-medium uppercase tracking-wide"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
                        color: 'var(--color-primary)',
                      }}
                    >
                      {REQUIRED_VIA_LABEL[emp.required_via] ?? emp.required_via}
                    </span>
                  )}
                  {emp.job_position && <span>{emp.job_position}</span>}
                </div>
              </div>
              <div className="shrink-0 text-[10px]" style={{ color: emp.signed_at ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>
                {emp.signed_at ? formatDate(emp.signed_at) : isDraft ? 'pending' : 'unsigned'}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Extra signatures — past signers who are no longer in the audience.
          Kept for audit visibility but rolled up so they don't inflate the
          headline counts. */}
      {extra_signatures.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setExtrasOpen(o => !o)}
            className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <svg
              width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: extrasOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
            >
              <polyline points="9 6 15 12 9 18" />
            </svg>
            {extra_signatures.length} historical {extra_signatures.length === 1 ? 'signer' : 'signers'}
          </button>
          {extrasOpen && (
            <ul className="mt-1 space-y-1">
              {extra_signatures.map((sig, i) => (
                <li key={`${sig.employee_id}-${sig.version_number}-${i}`} className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {sig.typed_name ?? sig.employee_id.slice(0, 8)} · v{sig.version_number} · {formatDate(sig.signed_at)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
