import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { diffLines } from 'diff'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../contexts/LanguageContext'
import type { Sop, SopVersion } from '../../types/database'

export function SOPHistory() {
  const { t } = useLang()
  const { id } = useParams<{ id: string }>()
  const [sop, setSOP] = useState<Sop | null>(null)
  const [versions, setVersions] = useState<SopVersion[]>([])
  const [selectedVersion, setSelectedVersion] = useState<SopVersion | null>(null)
  const [showDiff, setShowDiff] = useState(false)

  useEffect(() => {
    async function load() {
      const [sopResult, versionsResult] = await Promise.all([
        supabase.from('sops').select('*').eq('id', id!).single(),
        supabase.from('sop_versions').select('*').eq('sop_id', id!).order('version_number', { ascending: false }),
      ])
      setSOP(sopResult.data)
      setVersions(versionsResult.data || [])
    }
    load()
  }, [id])

  if (!sop) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  const diffResult = selectedVersion && showDiff
    ? diffLines(selectedVersion.content_markdown, sop.content_markdown)
    : null

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{sop.title} — {t.historySuffix}</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.currentVersionLabel(sop.current_version)}</p>
        </div>
        <Link
          to={`/dashboard/sops/${sop.id}/edit`}
          className="rounded-lg border px-4 py-2 text-sm"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          {t.editSopButton}
        </Link>
      </div>

      {versions.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t.noVersionHistory}
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <div className="divide-y rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
            {versions.map(v => (
              <button
                key={v.id}
                onClick={() => { setSelectedVersion(v); setShowDiff(false) }}
                className="w-full px-4 py-3 text-left transition-colors"
                style={{
                  backgroundColor: selectedVersion?.id === v.id ? 'var(--color-bg-secondary)' : 'transparent',
                }}
              >
                <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{t.versionNumber(v.version_number)}</div>
                <div className="mt-0.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {new Date(v.created_at).toLocaleDateString()}
                  {v.change_summary && ` — ${v.change_summary}`}
                </div>
              </button>
            ))}
          </div>

          <div>
            {selectedVersion && (
              <div className="rounded-xl border p-5" style={{ borderColor: 'var(--color-border)' }}>
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                    {t.versionNumber(selectedVersion.version_number)}
                  </span>
                  <button
                    onClick={() => setShowDiff(!showDiff)}
                    className="rounded-md border px-2.5 py-1 text-xs"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                  >
                    {showDiff ? t.showContent : t.showDiffVsCurrent}
                  </button>
                </div>

                {showDiff && diffResult ? (
                  <pre className="overflow-x-auto rounded-lg p-4 text-sm leading-relaxed" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                    {diffResult.map((part, i) => (
                      <span
                        key={i}
                        style={{
                          backgroundColor: part.added ? 'var(--color-diff-add)' : part.removed ? 'var(--color-diff-remove)' : 'transparent',
                          color: 'var(--color-text)',
                        }}
                      >
                        {part.value}
                      </span>
                    ))}
                  </pre>
                ) : (
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg p-4 text-sm leading-relaxed" style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text)' }}>
                    {selectedVersion.content_markdown}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
