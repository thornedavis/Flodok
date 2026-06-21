// Guided demos for the Help Center "Settings" section.
// Three single-screen, self-playing walkthroughs built on the shared kit:
//   • SettingsOrgDemo       — edit organization details and save
//   • SettingsTimezonesDemo — pick the org timezone (WIB / WITA / WIT)
//   • SettingsLanguageDemo  — flip the content language live (ID ↔ EN)
//
// Each follows the golden-rule pattern: one screen, every [data-demo-id]
// target present at all times, state booleans flip text/style.

import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { DesktopStage, useGuidedTour, ringStyle, Field, type TourStep } from '../GuidedDemo'

// ─── Shared chrome: the Settings tab bar ────────────────

const TABS = ['Account', 'Team', 'Integrations', 'Payroll', 'Achievements', 'Approvals', 'Billing']

function TabBar({ activeTab = 'Account', flashId, active }: { activeTab?: string; flashId?: string; active?: string | null }) {
  return (
    <div className="mb-6 flex items-center gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
      {TABS.map((tab) => {
        const on = tab === activeTab
        const isTarget = flashId && tab === 'Account'
        return (
          <button
            key={tab}
            type="button"
            data-demo-id={isTarget ? flashId : undefined}
            className="relative px-4 py-2 text-sm font-medium transition-colors"
            style={{
              color: on ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              ...(isTarget && active === flashId ? ringStyle(true) : {}),
            }}
          >
            {tab}
            {on && (
              <span className="absolute -bottom-px left-0 right-0 h-0.5" style={{ backgroundColor: 'var(--color-primary)' }} />
            )}
          </button>
        )
      })}
    </div>
  )
}

function SectionHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <div className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{title}</div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

// ─── 1. Organization settings ───────────────────────────

const ORG_STEPS: TourStep[] = [
  { target: 'org-legal-name', caption: 'Click the Organization Legal Name field' },
  { target: 'org-legal-name', caption: 'Edit it — the Save button lights up' },
  { target: 'org-phone', caption: 'Organization Phone is also editable' },
  { target: 'org-save-btn', caption: 'Save your changes' },
  { target: 'org-logo-upload', caption: 'Upload a logo — it appears as a thumbnail' },
]

export function SettingsOrgDemo() {
  const [edited, setEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [hasLogo, setHasLogo] = useState(false)

  const apply = useCallback((i: number) => {
    if (i === 1) { setEdited(true); setSaved(false) }
    else if (i === 3) { setSaving(true); window.setTimeout(() => { setSaving(false); setSaved(true); setEdited(false) }, 600) }
    else if (i === 4) setHasLogo(true)
  }, [])
  const reset = useCallback(() => { setEdited(false); setSaving(false); setSaved(false); setHasLogo(false) }, [])

  const tour = useGuidedTour(ORG_STEPS, apply, reset)
  const at = tour.activeTarget
  const dirty = edited && !saving

  return (
    <DesktopStage tour={tour} label="Organization settings — legal name, logo and contact details." steps={ORG_STEPS} activeNav="Settings" url="app.flodok.com/dashboard/settings?tab=account">
      <div className="max-w-3xl p-6">
        <div className="mb-6 text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>Settings</div>
        <TabBar activeTab="Account" />

        <section className="space-y-5">
          <SectionHead title="Organization">
            <button type="button" className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>Cancel</button>
            <button type="button" data-demo-id="org-save-btn" className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-shadow" style={{ backgroundColor: 'var(--color-primary)', opacity: dirty ? 1 : 0.45, ...ringStyle(at === 'org-save-btn') }}>{saving ? 'Saving…' : 'Save'}</button>
          </SectionHead>

          <div>
            <div className="mb-2 text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Logo</div>
            <div className="flex items-center gap-4">
              <div data-demo-id="org-logo-upload" className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border text-[10px] font-medium" style={{ borderColor: at === 'org-logo-upload' ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: hasLogo ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'var(--color-bg-secondary)', color: hasLogo ? 'var(--color-primary)' : 'var(--color-text-tertiary)', ...ringStyle(at === 'org-logo-upload') }}>
                {hasLogo ? (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.5-3.5L9 20" /></svg>) : ('Upload')}
              </div>
              <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Square PNG or SVG · shown on the portal and printed documents</div>
            </div>
          </div>

          <Field label="Legal name" value={edited ? 'PT Acme Indonesia Sejahtera' : 'PT Acme Indonesia'} placeholder="Registered legal entity name" demoId="org-legal-name" active={at === 'org-legal-name'} caret={at === 'org-legal-name' ? <span className="ml-1 inline-block h-4 w-[2px]" style={{ backgroundColor: 'var(--color-primary)' }} /> : undefined} />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Display name (trading)" value="Acme Indonesia" placeholder="Trading name" />
            <Field label="Organization phone" value="+62 21 5555 1234" placeholder="Phone" demoId="org-phone" active={at === 'org-phone'} />
          </div>

          <Field label="Address" value="Jl. Jenderal Sudirman No. 1, Jakarta" placeholder="Used on Faktur Pajak and PDFs" />

          <div className="h-4 text-xs font-medium" style={{ color: saved ? 'var(--color-success)' : 'transparent' }}>✓ Saved</div>
        </section>
      </div>
    </DesktopStage>
  )
}


// ─── 2. Timezone settings ───────────────────────────────

type TzKey = 'WIB' | 'WITA' | 'WIT'

const TZ: Record<TzKey, { label: string; sub: string }> = {
  WIB: { label: 'WIB — Jakarta', sub: 'Sumatra, Java, W & C Kalimantan (UTC+7)' },
  WITA: { label: 'WITA — Makassar', sub: 'Bali, Sulawesi, NTB/NTT, S/E/N Kalimantan (UTC+8)' },
  WIT: { label: 'WIT — Jayapura', sub: 'Maluku, Papua (UTC+9)' },
}

const TZ_STEPS: TourStep[] = [
  { target: 'tz-select', caption: 'Click the Time Zone dropdown to see the options' },
  { target: 'tz-wita-option', caption: 'Choose WITA — the Save button enables' },
  { target: 'tz-save-btn', caption: 'Save the change' },
  { target: 'tz-cancel-btn', caption: 'Cancel discards an unsaved change' },
  { target: 'tz-wit-option', caption: 'Or pick WIT for eastern Indonesia' },
]

function TzOption({ tz, selected, demoId, active }: { tz: TzKey; selected: boolean; demoId?: string; active?: boolean }) {
  return (
    <div
      data-demo-id={demoId}
      className="flex items-start gap-2 rounded-md px-2.5 py-2"
      style={{
        backgroundColor: selected ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent',
        ...ringStyle(!!active),
      }}
    >
      <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full" style={{ border: `1.5px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
        {selected && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />}
      </span>
      <div className="min-w-0">
        <div className="text-xs font-medium" style={{ color: selected ? 'var(--color-primary)' : 'var(--color-text)' }}>{TZ[tz].label}</div>
        <div className="truncate text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>{TZ[tz].sub}</div>
      </div>
    </div>
  )
}

export function SettingsTimezonesDemo() {
  const [open, setOpen] = useState(false)
  const [zone, setZone] = useState<TzKey>('WIB')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const baseline: TzKey = 'WIB'
  const dirty = zone !== baseline && !saving

  const apply = useCallback((i: number) => {
    if (i === 0) setOpen(true)
    else if (i === 1) { setZone('WITA'); setOpen(false); setSaved(false) }
    else if (i === 2) {
      setSaving(true)
      window.setTimeout(() => { setSaving(false); setSaved(true) }, 600)
    } else if (i === 3) { setZone('WIB'); setSaved(false) }
    else if (i === 4) { setZone('WIT'); setOpen(true) }
  }, [])
  const reset = useCallback(() => {
    setOpen(false); setZone('WIB'); setSaving(false); setSaved(false)
  }, [])

  const tour = useGuidedTour(TZ_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage tour={tour} label="Timezone settings — set when 'today' rolls over for your team." steps={TZ_STEPS} activeNav="Settings" url="app.flodok.com/dashboard/settings?tab=account">
      <div className="max-w-3xl p-6">
        <div className="mb-6 text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>Settings</div>
        <TabBar activeTab="Account" />

        <section className="space-y-5">
          <SectionHead title="Organization">
            <button
              type="button"
              data-demo-id="tz-cancel-btn"
              className="rounded-lg border px-4 py-2 text-sm font-medium transition-shadow"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)', ...ringStyle(at === 'tz-cancel-btn') }}
            >
              Cancel
            </button>
            <button
              type="button"
              data-demo-id="tz-save-btn"
              className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-shadow"
              style={{ backgroundColor: 'var(--color-primary)', opacity: dirty ? 1 : 0.45, ...ringStyle(at === 'tz-save-btn') }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </SectionHead>

          <div className="max-w-md space-y-4">
            <div>
              <div className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Time Zone</div>
              <div
                data-demo-id="tz-select"
                className="flex items-center justify-between rounded-lg border px-3 py-2"
                style={{
                  borderColor: at === 'tz-select' || open ? 'var(--color-primary)' : 'var(--color-border)',
                  backgroundColor: 'var(--color-bg)',
                  ...ringStyle(at === 'tz-select'),
                }}
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{TZ[zone].label}</span>
                  <span className="ml-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>· {TZ[zone].sub}</span>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2.5" strokeLinecap="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms' }}><polyline points="6 9 12 15 18 9" /></svg>
              </div>
            </div>

            {/* Dropdown panel — always in the DOM (its options are step targets), collapsed when closed */}
            <div
              className="overflow-hidden rounded-lg border"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-bg)',
                maxHeight: open ? 200 : 0,
                opacity: open ? 1 : 0,
                boxShadow: open ? '0 12px 28px -12px rgba(0,0,0,0.4)' : 'none',
                transition: 'max-height 200ms ease, opacity 160ms ease',
              }}
            >
              <div className="space-y-0.5 p-1">
                <TzOption tz="WIB" selected={zone === 'WIB'} />
                <TzOption tz="WITA" selected={zone === 'WITA'} demoId="tz-wita-option" active={at === 'tz-wita-option'} />
                <TzOption tz="WIT" selected={zone === 'WIT'} demoId="tz-wit-option" active={at === 'tz-wit-option'} />
              </div>
            </div>

            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Used to decide when "today" rolls over for the manager dashboard and daily achievement evaluation.
            </div>
            <div className="h-4 text-xs font-medium" style={{ color: saved ? 'var(--color-success)' : 'transparent' }}>
              ✓ Saved
            </div>
          </div>
        </section>
      </div>
    </DesktopStage>
  )
}

// ─── 3. Language settings ───────────────────────────────

// Bilingual copy so the toggle visibly re-renders the page text. ID = Bahasa
// Indonesia, EN = English. The toggle applies immediately (no save button).
const COPY = {
  id: {
    title: 'Pengaturan',
    tabs: ['Akun', 'Tim', 'Integrasi', 'Penggajian', 'Lencana', 'Persetujuan', 'Tagihan'],
    section: 'Pengaturan Bahasa',
    fieldLabel: 'Bahasa Konten',
    helper: 'Semua dokumen, formulir, dan pesan sistem akan ditampilkan dalam bahasa yang Anda pilih.',
  },
  en: {
    title: 'Settings',
    tabs: ['Account', 'Team', 'Integrations', 'Payroll', 'Achievements', 'Approvals', 'Billing'],
    section: 'Language Settings',
    fieldLabel: 'Content Language',
    helper: 'All documents, forms, and system messages will be displayed in your selected language.',
  },
}

const LANG_STEPS: TourStep[] = [
  { target: 'lang-en-btn', caption: 'Click English — the whole page re-renders instantly' },
  { target: 'lang-content', caption: 'Tabs, labels and help text are now in English' },
  { target: 'lang-id-btn', caption: 'Switch back to Bahasa Indonesia' },
  { target: 'settings-title', caption: 'Your language choice is remembered for next time' },
  { target: 'lang-en-btn', caption: 'Switch to English once more — saved for next time' },
]

function LangPill({ label, selected, demoId, active }: { label: string; selected: boolean; demoId: string; active: boolean }) {
  return (
    <button
      type="button"
      data-demo-id={demoId}
      className="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-shadow"
      style={{
        backgroundColor: selected ? 'var(--color-primary)' : 'transparent',
        color: selected ? '#ffffff' : 'var(--color-text-secondary)',
        ...ringStyle(active),
      }}
    >
      {label}
    </button>
  )
}

export function SettingsLanguageDemo() {
  const [lang, setLang] = useState<'id' | 'en'>('id')
  const apply = useCallback((i: number) => {
    if (i === 0) setLang('en')
    else if (i === 2) setLang('id')
    else if (i === 4) setLang('en')
  }, [])
  const reset = useCallback(() => setLang('id'), [])

  const tour = useGuidedTour(LANG_STEPS, apply, reset)
  const at = tour.activeTarget
  const c = COPY[lang]

  return (
    <DesktopStage tour={tour} label="Language settings — switch the whole interface live." steps={LANG_STEPS} activeNav="Settings" url="app.flodok.com/dashboard/settings">
      <div className="max-w-3xl p-6">
        <div className="mb-6 text-2xl font-semibold" style={{ color: 'var(--color-text)', ...ringStyle(at === 'settings-title') }} data-demo-id="settings-title">{c.title}</div>

        {/* Localised tab bar */}
        <div className="mb-6 flex items-center gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
          {c.tabs.map((tab, idx) => {
            const on = idx === 0
            return (
              <button
                key={tab}
                type="button"
                className="relative px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  color: on ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                }}
              >
                {tab}
                {on && (
                  <span className="absolute -bottom-px left-0 right-0 h-0.5" style={{ backgroundColor: 'var(--color-primary)' }} />
                )}
              </button>
            )
          })}
        </div>

        <div data-demo-id="lang-content" className="space-y-5" style={{ borderRadius: 8, ...ringStyle(at === 'lang-content') }}>
          <div>
            <div className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{c.section}</div>
          </div>

          <div className="max-w-md space-y-4">
            <div>
              <div className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{c.fieldLabel}</div>
              <div className="flex gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                <LangPill label="Bahasa Indonesia" selected={lang === 'id'} demoId="lang-id-btn" active={at === 'lang-id-btn'} />
                <LangPill label="English" selected={lang === 'en'} demoId="lang-en-btn" active={at === 'lang-en-btn'} />
              </div>
            </div>

            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{c.helper}</div>

            <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              {lang === 'en' ? 'Applied instantly — no save needed' : 'Diterapkan langsung — tanpa perlu menyimpan'}
            </div>
          </div>
        </div>
      </div>
    </DesktopStage>
  )
}
