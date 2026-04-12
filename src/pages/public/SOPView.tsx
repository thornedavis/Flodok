import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { supabase } from '../../lib/supabase'
import type { Employee, Sop, SopSignature, Organization } from '../../types/database'

export function SOPView() {
  const { slugToken } = useParams<{ slugToken: string }>()
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [sop, setSOP] = useState<Sop | null>(null)
  const [org, setOrg] = useState<Organization | null>(null)
  const [signature, setSignature] = useState<SopSignature | null>(null)
  const [typedName, setTypedName] = useState('')
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      if (!slugToken) { setNotFound(true); return }

      // Parse slug and token from the combined param (e.g. sarah-chen-x7k9m2)
      const lastDash = slugToken.lastIndexOf('-')
      if (lastDash === -1) { setNotFound(true); return }

      const slug = slugToken.slice(0, lastDash)
      const token = slugToken.slice(lastDash + 1)

      // Find employee by slug + token
      const { data: emp } = await supabase
        .from('employees')
        .select('*')
        .eq('slug', slug)
        .eq('access_token', token)
        .single()

      if (!emp) { setNotFound(true); return }
      setEmployee(emp)

      // Load SOP, org, and existing signature
      const [sopResult, orgResult] = await Promise.all([
        supabase.from('sops').select('*').eq('employee_id', emp.id).eq('status', 'active').single(),
        supabase.from('organizations').select('*').eq('id', emp.org_id).single(),
      ])

      setOrg(orgResult.data)

      if (!sopResult.data) {
        setError('No active SOP found.')
        return
      }

      setSOP(sopResult.data)

      // Check for existing signature on current version
      const { data: sig } = await supabase
        .from('sop_signatures')
        .select('*')
        .eq('sop_id', sopResult.data.id)
        .eq('version_number', sopResult.data.current_version)
        .eq('employee_id', emp.id)
        .single()

      setSignature(sig)
    }
    load()
  }, [slugToken])

  async function handleSign(e: React.FormEvent) {
    e.preventDefault()
    if (!sop || !employee) return
    setSigning(true)

    const { data, error: sigError } = await supabase
      .from('sop_signatures')
      .insert({
        sop_id: sop.id,
        version_number: sop.current_version,
        employee_id: employee.id,
        typed_name: typedName,
      })
      .select()
      .single()

    if (sigError) { setError(sigError.message); setSigning(false); return }
    setSignature(data)
    setSigning(false)
  }

  if (notFound) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>Not Found</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>This SOP link is invalid or has expired.</p>
      </div>
    )
  }

  if (!employee) return <div className="py-20 text-center" style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>

  return (
    <div>
      {/* Print header */}
      <div className="print-only mb-8">
        {org?.logo_url && <img src={org.logo_url} alt={org.name} className="mb-4 h-10" />}
        <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{org?.name}</div>
      </div>

      {/* Employee header */}
      <div className="mb-8">
        <div className="flex items-center gap-4">
          {employee.photo_url && (
            <img src={employee.photo_url} alt={employee.name} className="h-16 w-16 rounded-full object-cover" />
          )}
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{sop?.title || `${employee.name}'s SOP`}</h1>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {employee.name}
              {sop && <span> &middot; Version {sop.current_version}</span>}
            </p>
          </div>
        </div>
      </div>

      {error && !sop && (
        <div className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      {/* SOP Content */}
      {sop && (
        <>
          <div className="sop-content prose prose-sm max-w-none" style={{ color: 'var(--color-text)' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {sop.content_markdown}
            </ReactMarkdown>
          </div>

          {/* Signature Section */}
          <div className="signature-section mt-12 border-t pt-8 no-print" style={{ borderColor: 'var(--color-border)' }}>
            {signature ? (
              <div className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-success)' }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                    Signed by {signature.typed_name}
                  </span>
                </div>
                <p className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  {new Date(signature.signed_at).toLocaleString()} &middot; Version {signature.version_number}
                </p>
              </div>
            ) : (
              <div>
                <h3 className="mb-2 text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
                  Acknowledge & Sign
                </h3>
                <p className="mb-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  By typing your name below, you acknowledge that you have read and understood this SOP.
                </p>
                <form onSubmit={handleSign} className="flex items-end gap-2">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={typedName}
                      onChange={e => setTypedName(e.target.value)}
                      required
                      placeholder="Type your full name"
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={signing || !typedName.trim()}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    {signing ? 'Signing...' : 'Sign'}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Print button */}
          <div className="mt-6 no-print">
            <button
              onClick={() => window.print()}
              className="rounded-lg border px-4 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              Print / Download PDF
            </button>
          </div>
        </>
      )}

      <div className="print-footer">Generated by Flodok</div>
    </div>
  )
}
