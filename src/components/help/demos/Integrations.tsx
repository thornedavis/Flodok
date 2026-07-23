// Self-playing Help Center demos for the Integrations settings tab.
// Each demo is a single Settings → Integrations surface; modal dialogs live in
// the DOM at all times (visibility flips via state) so every step’s target is
// always resolvable.

import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { DesktopStage, useGuidedTour, ringStyle, Btn, type TourStep } from '../GuidedDemo'

// ─── Shared bits ───────────────────────────────────────

function StatusDot({ on }: { on: boolean }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: on ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}
    />
  )
}

function SecBtn({ children, demoId, active, onClick, danger }: { children: ReactNode; demoId?: string; active?: boolean; onClick?: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      data-demo-id={demoId}
      onClick={onClick}
      className="rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
      style={{
        borderColor: danger ? 'var(--color-danger)' : 'var(--color-border)',
        color: danger ? 'var(--color-danger)' : 'var(--color-text-secondary)',
        backgroundColor: 'var(--color-bg)',
        ...ringStyle(!!active),
      }}
    >
      {children}
    </button>
  )
}

function IntroBlock() {
  return (
    <div className="mb-6">
      <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        Connect external services so Flodok can act on meetings and tasks on your behalf.
      </div>
    </div>
  )
}

function DialogShell({ title, subtitle, open, children }: { title: string; subtitle: string; open: boolean; children: ReactNode }) {
  return (
    <div
      className="absolute inset-0 z-20 flex items-start justify-center"
      style={{
        backgroundColor: open ? 'color-mix(in srgb, var(--color-text) 22%, transparent)' : 'transparent',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity 200ms ease',
      }}
    >
      <div
        className="mt-6 w-[320px] rounded-xl border p-4 shadow-xl"
        style={{
          borderColor: 'var(--color-border-strong)',
          backgroundColor: 'var(--color-bg)',
          transform: open ? 'translateY(0)' : 'translateY(-8px)',
          transition: 'transform 200ms ease',
        }}
      >
        <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{title}</div>
        <div className="mb-3 mt-0.5 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>{subtitle}</div>
        {children}
      </div>
    </div>
  )
}

function DlgField({ label, value, placeholder, mask, demoId, active }: { label: string; value?: string; placeholder: string; mask?: boolean; demoId?: string; active?: boolean }) {
  const shown = value ? (mask ? '•'.repeat(Math.min(value.length, 14)) : value) : placeholder
  return (
    <div className="mb-2.5">
      <div className="mb-1 text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{label}</div>
      <div
        data-demo-id={demoId}
        className="rounded-lg border px-2.5 py-1.5 text-xs"
        style={{
          borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
          backgroundColor: 'var(--color-bg)',
          color: value ? 'var(--color-text)' : 'var(--color-text-tertiary)',
          ...ringStyle(!!active),
        }}
      >
        {shown}
      </div>
    </div>
  )
}

function SuccessMsg({ show }: { show: boolean }) {
  return (
    <div
      className="flex items-center gap-1.5 text-[11px]"
      style={{ color: 'var(--color-success)', opacity: show ? 1 : 0, transition: 'opacity 160ms ease' }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      Connection looks good.
    </div>
  )
}

// ─── Fireflies ─────────────────────────────────────────

const FIREFLIES_STEPS: TourStep[] = [
  { target: 'ff-card', caption: 'Fireflies is already connected — green dot, saved key' },
  { target: 'ff-test', caption: 'Test the connection without re-entering the key' },
  { target: 'ff-reconnect', caption: 'Reconnect to update credentials' },
  { target: 'ff-key', caption: 'Paste a new API key' },
  { target: 'ff-dialog-test', caption: 'Test inside the dialog before saving' },
]

export function FirefliesDemo() {
  const [tested, setTested] = useState(false)
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [dlgTested, setDlgTested] = useState(false)

  const apply = useCallback((i: number) => {
    if (i === 1) setTested(true)
    else if (i === 2) setOpen(true)
    else if (i === 3) setKey('ff_live_92ab7c')
    else if (i === 4) setDlgTested(true)
  }, [])
  const reset = useCallback(() => {
    setTested(false)
    setOpen(false)
    setKey('')
    setDlgTested(false)
  }, [])

  const tour = useGuidedTour(FIREFLIES_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage tour={tour} label="Reconnecting Fireflies — test and update credentials in place." steps={FIREFLIES_STEPS} activeNav="Settings" url="app.flodok.com/dashboard/settings?tab=integrations">
      <div className="relative p-4">
        <IntroBlock />

        <div className="mb-4 rounded-xl border p-5" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div
                data-demo-id="ff-card"
                className="flex items-center gap-2"
                style={ringStyle(at === 'ff-card')}
              >
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Fireflies</span>
                <StatusDot on />
                <span className="text-xs" style={{ color: 'var(--color-success)' }}>Connected</span>
              </div>
              <div className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Import meeting transcripts and extract action items automatically.
              </div>
              <div className="mt-2 font-mono text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Saved key ending in •••• abc1
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <SecBtn demoId="ff-test" active={at === 'ff-test'}>{tested ? 'Testing…' : 'Test connection'}</SecBtn>
              <SecBtn demoId="ff-reconnect" active={at === 'ff-reconnect'}>Reconnect</SecBtn>
            </div>
          </div>
          <div className="mt-2">
            <SuccessMsg show={tested} />
          </div>
        </div>

        <DialogShell title="Fireflies" subtitle="Update your API key." open={open}>
          <DlgField label="Fireflies API key" value={key} placeholder="Paste the API key from your Fireflies account settings" mask demoId="ff-key" active={at === 'ff-key'} />
          <div className="mb-2 mt-1">
            <SuccessMsg show={dlgTested} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <SecBtn demoId="ff-dialog-test" active={at === 'ff-dialog-test'}>Test</SecBtn>
            <div className="flex gap-2">
              <SecBtn>Cancel</SecBtn>
              <div style={{ width: 64 }}><Btn>Save</Btn></div>
            </div>
          </div>
        </DialogShell>
      </div>
    </DesktopStage>
  )
}

