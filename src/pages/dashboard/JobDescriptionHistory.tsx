// Version history viewer for Job Descriptions.
//
// JD versions snapshot the structured `content_doc` (no markdown columns),
// and JDs carry no merge fields — so we derive the display text with
// docToMarkdown and the rendered/template toggle is effectively a no-op.
// The shared VersionRail/VersionPane (from SOPHistory) expect a non-null
// `changed_by` plus `translation_status` / `translation_error`, none of
// which JD versions carry, so we synthesize them.

import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { diffLines } from 'diff'
import { supabase } from '../../lib/supabase'
import { documentEditPath } from '../../lib/documentTypes'
import { useLang } from '../../contexts/LanguageContext'
import { docToMarkdown } from '../../lib/documentDoc'
import { VersionRail, VersionPane } from './SOPHistory'
import type { JobDescription, JobDescriptionVersion } from '../../types/aliases'

type VersionLang = 'en' | 'id'
type ViewMode = 'rendered' | 'template'
type AuthorLite = { id: string; name: string }
type HistVersion = JobDescriptionVersion & {
  changed_by: string
  translation_status: string
  translation_error: string | null
}

export function JobDescriptionHistory() {
  const { t, lang } = useLang()
  const { id } = useParams<{ id: string }>()
  const [jd, setJd] = useState<JobDescription | null>(null)
  const [versions, setVersions] = useState<HistVersion[]>([])
  const [selected, setSelected] = useState<HistVersion | null>(null)
  const [authors, setAuthors] = useState<Record<string, AuthorLite>>({})

  const [activeLang, setActiveLang] = useState<VersionLang>('en')
  const [viewMode, setViewMode] = useState<ViewMode>('rendered')
  const [showDiff, setShowDiff] = useState(false)

  useEffect(() => {
    async function load() {
      const [jdRes, versionsRes] = await Promise.all([
        supabase.from('job_descriptions').select('*').eq('id', id!).single(),
        supabase.from('job_description_versions').select('*').eq('job_description_id', id!).order('version_number', { ascending: false }),
      ])
      setJd(jdRes.data)
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
    }
    load()
  }, [id])

  // JDs have no merge fields, so the version body is just its content_doc
  // projected to markdown for the active language.
  const displayBody = useMemo(
    () => (selected ? docToMarkdown(selected.content_doc, activeLang) : ''),
    [selected, activeLang],
  )
  const currentBody = useMemo(
    () => (jd ? docToMarkdown(jd.content_doc, activeLang) : ''),
    [jd, activeLang],
  )
  const diffResult = useMemo(
    () => (selected && showDiff ? diffLines(displayBody, currentBody) : null),
    [selected, showDiff, displayBody, currentBody],
  )

  if (!jd) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{jd.title}</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t.versionHistory} · {t.currentVersionLabel(jd.current_version)}
          </p>
        </div>
        <Link
          to={documentEditPath('job_description', jd.id)}
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
              idUnavailableReason={null}
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
