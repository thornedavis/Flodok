import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import { documentEditPath, type DocumentType } from '../../lib/documentTypes'
import type { Translations } from '../../lib/translations'

// Employee → Documents tab. Lists the Flodok-generated documents linked to this
// employee — contracts, NDAs, and letters (the doc types that carry an
// employee_id). Distinct from the "Files" tab, which holds uploaded
// attachments. Read-only list; each row opens the document editor.

type DocRow = { id: string; title: string; status: string; created_at: string; type: DocumentType }

export function EmployeeDocuments({ employeeId }: { employeeId: string }) {
  const { t, lang } = useLang()
  const [docs, setDocs] = useState<DocRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [c, n, l, aud] = await Promise.all([
        supabase.from('contracts').select('id, title, status, created_at').eq('employee_id', employeeId).is('deleted_at', null),
        supabase.from('ndas').select('id, title, status, created_at').eq('employee_id', employeeId).is('deleted_at', null),
        supabase.from('letters').select('id, title, status, created_at').eq('employee_id', employeeId).is('deleted_at', null),
        // SOPs assigned specifically to this employee (target_type 'employee').
        // Broader audience targeting (department / everyone) is deliberately
        // excluded — this list is documents that are theirs, not org-wide reading.
        supabase.from('sop_audience').select('sop_id').eq('employee_id', employeeId).eq('target_type', 'employee'),
      ])
      if (cancelled) return

      let sops: DocRow[] = []
      const sopIds = [...new Set((aud.data ?? []).map(r => r.sop_id))]
      if (sopIds.length) {
        const s = await supabase.from('sops').select('id, title, status, created_at').in('id', sopIds).is('deleted_at', null)
        if (cancelled) return
        sops = (s.data ?? []).map(r => ({ id: r.id, title: r.title, status: r.status, created_at: r.created_at, type: 'sop' as DocumentType }))
      }

      const rows: DocRow[] = [
        ...(c.data ?? []).map(r => ({ id: r.id, title: r.title, status: r.status, created_at: r.created_at, type: 'contract' as DocumentType })),
        ...(n.data ?? []).map(r => ({ id: r.id, title: r.title, status: r.status, created_at: r.created_at, type: 'nda' as DocumentType })),
        ...(l.data ?? []).map(r => ({ id: r.id, title: r.title, status: r.status, created_at: r.created_at, type: 'letter' as DocumentType })),
        ...sops,
      ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      setDocs(rows)
    }
    void load()
    return () => { cancelled = true }
  }, [employeeId])

  if (docs === null) {
    return <p className="py-2 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.empDocsLoading}</p>
  }
  if (docs.length === 0) {
    return (
      <div className="rounded-lg border px-3 py-8 text-center text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
        {t.empDocsEmpty}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
      {docs.map(d => (
        <Link
          key={`${d.type}-${d.id}`}
          to={documentEditPath(d.type, d.id)}
          className="flex items-center gap-3 border-b px-4 py-3 text-sm transition-colors last:border-b-0"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          <TypeBadge type={d.type} t={t} />
          <span className="min-w-0 flex-1 truncate font-medium">{d.title || '—'}</span>
          <StatusPill status={d.status} t={t} />
          <span className="shrink-0 text-xs tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>
            {new Date(d.created_at).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </Link>
      ))}
    </div>
  )
}

function TypeBadge({ type, t }: { type: DocumentType; t: Translations }) {
  const label = type === 'contract' ? t.trashTypeContract : type === 'nda' ? t.trashTypeNda : type === 'sop' ? t.trashTypeSop : t.trashTypeLetter
  return (
    <span
      className="inline-flex w-16 shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
    >
      {label}
    </span>
  )
}

function statusLabel(status: string, t: Translations): string {
  switch (status) {
    case 'draft': return t.statusDraft
    case 'active': return t.statusActive
    case 'signed': return t.statusSigned
    default: return status.charAt(0).toUpperCase() + status.slice(1)
  }
}

function StatusPill({ status, t }: { status: string; t: Translations }) {
  const positive = status === 'signed' || status === 'active'
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[11px]"
      style={{ backgroundColor: 'var(--color-bg-tertiary)', color: positive ? 'var(--color-success, #16a34a)' : 'var(--color-text-tertiary)' }}
    >
      {statusLabel(status, t)}
    </span>
  )
}
