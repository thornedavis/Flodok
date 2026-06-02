// Version history viewer for Letters.
//
// letter_versions snapshots markdown (content_markdown / _id) but not the
// resolved output, so the "rendered" view resolves merge fields at view
// time against the live recipient / sender / org (mirroring how the editor
// resolves them). The shared VersionRail/VersionPane (from SOPHistory)
// expect a non-null `changed_by` plus `translation_status` /
// `translation_error`, none of which letter versions carry, so we
// synthesize them.

import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { diffLines } from 'diff'
import { supabase } from '../../lib/supabase'
import { documentEditPath } from '../../lib/documentTypes'
import { useLang } from '../../contexts/LanguageContext'
import { renderMergeFields } from '../../lib/mergeFields'
import { VersionRail, VersionPane } from './SOPHistory'
import type { Letter, LetterVersion, Employee, Organization } from '../../types/aliases'

type VersionLang = 'en' | 'id'
type ViewMode = 'rendered' | 'template'
type AuthorLite = { id: string; name: string }
type HistVersion = LetterVersion & {
  changed_by: string
  translation_status: string
  translation_error: string | null
}

export function LetterHistory() {
  const { t, lang } = useLang()
  const { id } = useParams<{ id: string }>()
  const [letter, setLetter] = useState<Letter | null>(null)
  const [versions, setVersions] = useState<HistVersion[]>([])
  const [selected, setSelected] = useState<HistVersion | null>(null)
  const [authors, setAuthors] = useState<Record<string, AuthorLite>>({})
  const [recipient, setRecipient] = useState<Employee | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)

  const [activeLang, setActiveLang] = useState<VersionLang>('en')
  const [viewMode, setViewMode] = useState<ViewMode>('rendered')
  const [showDiff, setShowDiff] = useState(false)

  useEffect(() => {
    async function load() {
      const [letterRes, versionsRes] = await Promise.all([
        supabase.from('letters').select('*').eq('id', id!).single(),
        supabase.from('letter_versions').select('*').eq('letter_id', id!).order('version_number', { ascending: false }),
      ])
      const ltr = letterRes.data
      setLetter(ltr)
      const rows: HistVersion[] = (versionsRes.data || []).map(v => ({
        ...v,
        changed_by: v.changed_by ?? '',
        translation_status: 'complete',
        translation_error: null,
      }))
      setVersions(rows)
      if (rows.length > 0) setSelected(rows[0])

      const authorIds = Array.from(new Set(rows.map(v => v.changed_by).filter(Boolean)))
      if (authorIds.length > 0) {
        const { data: userRows } = await supabase.from('users').select('id, name').in('id', authorIds)
        setAuthors(Object.fromEntries((userRows || []).map(u => [u.id, u])))
      }
      if (ltr?.employee_id) {
        const { data: emp } = await supabase.from('employees').select('*').eq('id', ltr.employee_id).single()
        setRecipient(emp)
      }
      if (ltr?.org_id) {
        const { data: org } = await supabase.from('organizations').select('*').eq('id', ltr.org_id).single()
        setOrganization(org)
      }
    }
    load()
  }, [id])

  const displayBody = useMemo(() => {
    if (!selected) return ''
    const raw = activeLang === 'en' ? selected.content_markdown : selected.content_markdown_id
    if (!raw) return ''
    if (viewMode === 'template') return raw
    return renderMergeFields(raw, { employee: recipient, organization, today: new Date(), lang: activeLang })
  }, [selected, activeLang, viewMode, recipient, organization])

  const currentBody = useMemo(() => {
    if (!letter) return ''
    const raw = activeLang === 'en' ? letter.content_markdown : letter.content_markdown_id
    if (!raw) return ''
    if (viewMode === 'template') return raw
    return renderMergeFields(raw, { employee: recipient, organization, today: new Date(), lang: activeLang })
  }, [letter, activeLang, viewMode, recipient, organization])

  const idUnavailableReason = useMemo((): 'not-captured' | 'failed' | null => {
    if (!selected || activeLang !== 'id') return null
    return selected.content_markdown_id ? null : 'not-captured'
  }, [selected, activeLang])

  const diffResult = useMemo(() => {
    if (!selected || !showDiff || idUnavailableReason) return null
    return diffLines(displayBody, currentBody)
  }, [selected, showDiff, displayBody, currentBody, idUnavailableReason])

  if (!letter) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{letter.title}</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t.versionHistory} · {t.currentVersionLabel(letter.current_version)}
          </p>
        </div>
        <Link
          to={documentEditPath('letter', letter.id)}
          className="rounded-lg border px-4 py-2 text-sm"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {t.edit}
        </Link>
      </div>

      {versions.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t.noVersionHistory}
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <VersionRail
            versions={versions}
            selectedId={selected?.id ?? null}
            authors={authors}
            lang={lang}
            onSelect={v => { setSelected(v as HistVersion); setShowDiff(false) }}
          />
          {selected && (
            <VersionPane
              version={selected}
              author={authors[selected.changed_by]}
              activeLang={activeLang}
              viewMode={viewMode}
              showDiff={showDiff}
              displayBody={displayBody}
              diffResult={diffResult}
              idUnavailableReason={idUnavailableReason}
              onLangChange={setActiveLang}
              onViewModeChange={setViewMode}
              onToggleDiff={() => setShowDiff(d => !d)}
              lang={lang}
              t={t}
            />
          )}
        </div>
      )}
    </div>
  )
}
