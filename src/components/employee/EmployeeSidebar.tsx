import { useState } from 'react'
import { useLang } from '../../contexts/LanguageContext'
import { getAvatarGradient } from '../../lib/avatar'
import type { DerivedStatus } from '../../lib/employeeStatus'
import type { Translations } from '../../lib/translations'

export type EmployeeSectionKey =
  | 'personal'
  | 'employment'
  | 'education'
  | 'experience'
  | 'additional'
  | 'documents'
  | 'linked_documents'
  | 'compensation'

interface EmployeeSidebarProps {
  employeeId: string
  name: string
  photoUrl: string | null
  status: DerivedStatus
  portalUrl?: string
  uploading: boolean
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemove: () => void
  active: EmployeeSectionKey
  onSelect: (key: EmployeeSectionKey) => void
  onResign: () => void
  onTerminate: () => void
  onDelete: () => void
  canWrite: boolean
  writeDisabledTitle?: string
}

const statusColors: Record<DerivedStatus, { dot: string; bg: string; text: string }> = {
  prospective: {
    dot: 'var(--color-text-tertiary)',
    bg: 'color-mix(in srgb, var(--color-text-tertiary) 14%, transparent)',
    text: 'var(--color-text-secondary)',
  },
  offered: {
    dot: 'var(--color-primary)',
    bg: 'color-mix(in srgb, var(--color-primary) 14%, transparent)',
    text: 'var(--color-primary)',
  },
  onboarding: {
    dot: 'var(--color-primary)',
    bg: 'color-mix(in srgb, var(--color-primary) 14%, transparent)',
    text: 'var(--color-primary)',
  },
  probation: {
    dot: 'var(--color-warning)',
    bg: 'color-mix(in srgb, var(--color-warning) 14%, transparent)',
    text: 'var(--color-warning)',
  },
  active: {
    dot: 'var(--color-success)',
    bg: 'color-mix(in srgb, var(--color-success) 14%, transparent)',
    text: 'var(--color-success)',
  },
  separated: {
    dot: 'var(--color-danger)',
    bg: 'color-mix(in srgb, var(--color-danger) 14%, transparent)',
    text: 'var(--color-danger)',
  },
  talent_pool: {
    dot: 'var(--color-text-tertiary)',
    bg: 'color-mix(in srgb, var(--color-text-tertiary) 10%, transparent)',
    text: 'var(--color-text-tertiary)',
  },
  no_show: {
    dot: 'var(--color-danger)',
    bg: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
    text: 'var(--color-danger)',
  },
}

function statusLabel(s: DerivedStatus, t: Translations): string {
  switch (s) {
    case 'prospective': return t.derivedStatusProspective
    case 'offered': return t.derivedStatusOffered
    case 'onboarding': return t.derivedStatusOnboarding
    case 'probation': return t.derivedStatusProbation
    case 'active': return t.derivedStatusActive
    case 'separated': return t.derivedStatusSeparated
    case 'talent_pool': return t.derivedStatusTalentPool
    case 'no_show': return t.derivedStatusNoShow
  }
}

function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

export function EmployeeSidebar({
  employeeId,
  name,
  photoUrl,
  status,
  portalUrl,
  uploading,
  onUpload,
  onRemove,
  active,
  onSelect,
  onResign,
  onTerminate,
  onDelete,
  canWrite,
  writeDisabledTitle,
}: EmployeeSidebarProps) {
  const { t } = useLang()
  const [copied, setCopied] = useState(false)

  async function copyPortalUrl() {
    if (!portalUrl) return
    try {
      await navigator.clipboard.writeText(portalUrl)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = portalUrl
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const colors = statusColors[status]
  const isSeparated = status === 'separated'
  const canSeparate = canWrite && !isSeparated && status !== 'prospective' && status !== 'offered' && status !== 'talent_pool' && status !== 'no_show'

  const groups: { label: string; items: { key: EmployeeSectionKey; label: string }[] }[] = [
    {
      label: t.empNavGeneral,
      items: [
        { key: 'personal', label: t.empNavPersonal },
        { key: 'employment', label: t.empNavEmployment },
        { key: 'education', label: t.empNavEducation },
        { key: 'experience', label: t.empNavExperience },
        { key: 'additional', label: t.empNavAdditional },
        { key: 'documents', label: t.empNavDocuments },
        { key: 'linked_documents', label: t.empNavLinkedDocs },
      ],
    },
    {
      label: '',
      items: [
        { key: 'compensation', label: t.empNavCompensation },
      ],
    },
  ]

  return (
    <aside className="w-full shrink-0 md:w-64">
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
      >
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <div
              className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full"
              style={{ background: photoUrl ? 'var(--color-bg-tertiary)' : getAvatarGradient(employeeId) }}
            >
              {photoUrl && <img src={photoUrl} alt={name} className="h-full w-full object-cover" />}
            </div>
            <label
              className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border text-white shadow-sm"
              style={{ backgroundColor: 'var(--color-text)', borderColor: 'var(--color-bg)' }}
              title={uploading ? t.uploading : t.upload}
            >
              <CameraIcon />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </div>
          <h2 className="mt-3 max-w-full truncate text-base font-semibold" style={{ color: 'var(--color-text)' }}>{name}</h2>
          {photoUrl && (
            <button
              type="button"
              onClick={onRemove}
              disabled={uploading}
              className="mt-1 text-xs"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {t.remove}
            </button>
          )}
        </div>

        <div className="mt-3 flex w-full justify-center" title={t.derivedStatusHelp}>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
            style={{ backgroundColor: colors.bg, color: colors.text }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.dot }} />
            {statusLabel(status, t)}
          </span>
        </div>

        {portalUrl && (
          <div className="mt-5 flex gap-1.5">
            <button
              type="button"
              onClick={copyPortalUrl}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-bg-tertiary)]"
              style={{ borderColor: 'var(--color-border)', color: copied ? 'var(--color-success)' : 'var(--color-text-secondary)' }}
              title={portalUrl}
            >
              {copied ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
              {copied ? t.copied : t.empSidebarCopyPortal}
            </button>
            <a
              href={portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t.openPortalAria}
              title={t.openPortalAria}
              className="inline-flex shrink-0 items-center justify-center rounded-lg border px-2.5 transition-colors hover:bg-[var(--color-bg-tertiary)]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6" />
                <path d="M10 14 21 3" />
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              </svg>
            </a>
          </div>
        )}

        <nav className="mt-6 space-y-5">
          {groups.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <div
                  className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {group.label}
                </div>
              )}
              <ul className="space-y-1">
                {group.items.map(item => {
                  const isActive = active === item.key
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        onClick={() => onSelect(item.key)}
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors"
                        style={{
                          backgroundColor: isActive ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
                          color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                        }}
                      >
                        {item.label}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div
          className="mt-6 space-y-1 border-t pt-4"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {canSeparate && (
            <>
              <button
                type="button"
                onClick={onResign}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-[var(--color-bg-tertiary)]"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {t.empSidebarResign}
              </button>
              <button
                type="button"
                onClick={onTerminate}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-[color-mix(in_srgb,var(--color-warning)_8%,transparent)]"
                style={{ color: 'var(--color-warning)' }}
              >
                {t.empSidebarTerminate}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={!canWrite}
            title={!canWrite ? writeDisabledTitle : undefined}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: 'var(--color-danger)' }}
          >
            {t.deleteEmployee}
          </button>
        </div>
      </div>
    </aside>
  )
}
