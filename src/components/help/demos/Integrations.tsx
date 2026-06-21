// Self-playing Help Center demos for the Integrations settings tab.
// Each demo is a single Settings → Integrations surface; modal dialogs live in
// the DOM at all times (visibility flips via state) so every step's target is
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
      className="rounded-lg border px-2.5 py-1.5 text-xs font-medium"
      style={{
        borderColor: danger ? 'var(--color-danger)' : 'var(--color-border)',
        color: danger ? 'var(--color-danger)' : 'var(--color-text)',
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
    <div className="mb-4">
      <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>Integrations</div>
      <div className="mt-0.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
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
        className="mt-6 w-[300px] rounded-xl border p-4 shadow-xl"
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
  { target: 'ff-tab', caption: 'Open the Integrations tab in Settings' },
  { target: 'ff-card', caption: 'Fireflies is already connected — green dot, saved key' },
  { target: 'ff-test', caption: 'Test the connection without re-entering the key' },
  { target: 'ff-reconnect', caption: 'Reconnect to update credentials' },
  { target: 'ff-key', caption: 'Paste a new API key and enable webhooks' },
  { target: 'ff-dialog-test', caption: 'Test inside the dialog before saving' },
]

export function FirefliesDemo() {
  const [tested, setTested] = useState(false)
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [webhook, setWebhook] = useState(false)
  const [dlgTested, setDlgTested] = useState(false)

  const apply = useCallback((i: number) => {
    if (i === 2) setTested(true)
    else if (i === 3) setOpen(true)
    else if (i === 4) { setKey('ff_live_92ab7c'); setWebhook(true) }
    else if (i === 5) setDlgTested(true)
  }, [])
  const reset = useCallback(() => {
    setTested(false)
    setOpen(false)
    setKey('')
    setWebhook(false)
    setDlgTested(false)
  }, [])

  const tour = useGuidedTour(FIREFLIES_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage tour={tour} label="Reconnecting Fireflies — test and update credentials in place." steps={FIREFLIES_STEPS} activeNav="Settings" url="app.flodok.com/dashboard/settings?tab=integrations">
      <div className="relative p-4">
        <div className="mb-3 flex items-center gap-1.5">
          {['Account', 'Team', 'Integrations', 'Payroll', 'Billing'].map((t) => (
            <span
              key={t}
              data-demo-id={t === 'Integrations' ? 'ff-tab' : undefined}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={
                t === 'Integrations'
                  ? { backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', color: 'var(--color-primary)', ...ringStyle(at === 'ff-tab') }
                  : { color: 'var(--color-text-tertiary)' }
              }
            >
              {t}
            </span>
          ))}
        </div>

        <IntroBlock />

        <div className="mb-3 flex items-center justify-between rounded-lg border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
          <div className="min-w-0">
            <div className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>Review mode</div>
            <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Require approval for API-submitted updates</div>
          </div>
          <span className="relative inline-flex h-5 w-9 items-center rounded-full" style={{ backgroundColor: 'var(--color-primary)' }}>
            <span className="inline-block h-4 w-4 rounded-full bg-white" style={{ transform: 'translateX(18px)' }} />
          </span>
        </div>

        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Connected services</div>

        <div
          data-demo-id="ff-card"
          className="rounded-lg border p-3"
          style={{ borderColor: at === 'ff-card' ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(at === 'ff-card') }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Fireflies</span>
                <StatusDot on />
                <span className="text-[11px] font-medium" style={{ color: 'var(--color-success)' }}>Connected</span>
              </div>
              <div className="mt-0.5 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                Import meeting transcripts and extract action items automatically.
              </div>
              <div className="mt-1 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>Saved key ending in •••• abc1</div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <div className="flex gap-1.5">
                <SecBtn demoId="ff-test" active={at === 'ff-test'}>{tested ? 'Testing…' : 'Test connection'}</SecBtn>
                <SecBtn demoId="ff-reconnect" active={at === 'ff-reconnect'}>Reconnect</SecBtn>
              </div>
              <SecBtn danger>Disconnect</SecBtn>
            </div>
          </div>
          <div className="mt-2">
            <SuccessMsg show={tested} />
          </div>
        </div>

        <div className="mt-3 rounded-lg border p-3 opacity-60" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Asana</span>
            <StatusDot on={false} />
            <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Not connected</span>
          </div>
        </div>

        <DialogShell title="Fireflies" subtitle="Update your API key and webhook settings." open={open}>
          <DlgField label="API key" value={key} placeholder="Paste your Fireflies key" mask demoId="ff-key" active={at === 'ff-key'} />
          <div className="mb-2.5 flex items-center gap-2">
            <span className="flex h-4 w-4 items-center justify-center rounded" style={{ backgroundColor: webhook ? 'var(--color-primary)' : 'transparent', border: webhook ? 'none' : '1.5px solid var(--color-border-strong)' }}>
              {webhook && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>Business plan with webhooks</span>
          </div>
          {webhook && (
            <DlgField label="Webhook secret" value="whsec_••••" placeholder="Webhook secret" mask />
          )}
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

// ─── Slack ─────────────────────────────────────────────

const SLACK_STEPS: TourStep[] = [
  { target: 'sl-section', caption: 'Find the Connected services section' },
  { target: 'sl-card', caption: 'Slack is not connected yet — grey dot' },
  { target: 'sl-connect', caption: 'Open the Connect dialog' },
  { target: 'sl-workspace', caption: 'Enter your Slack workspace URL' },
  { target: 'sl-token', caption: 'Paste the API token — it masks as you type' },
  { target: 'sl-dialog-test', caption: 'Test the credentials before saving' },
]

export function SlackDemo() {
  const [open, setOpen] = useState(false)
  const [ws, setWs] = useState('')
  const [token, setToken] = useState('')
  const [tested, setTested] = useState(false)

  const apply = useCallback((i: number) => {
    if (i === 2) setOpen(true)
    else if (i === 3) setWs('myworkspace.slack.com')
    else if (i === 4) setToken('xoxb-2847-secret')
    else if (i === 5) setTested(true)
  }, [])
  const reset = useCallback(() => {
    setOpen(false)
    setWs('')
    setToken('')
    setTested(false)
  }, [])

  const tour = useGuidedTour(SLACK_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage tour={tour} label="Connecting Slack — post meeting action items to a channel." steps={SLACK_STEPS} activeNav="Settings" url="app.flodok.com/dashboard/settings?tab=integrations">
      <div className="relative p-4">
        <div className="mb-3 flex items-center gap-1.5">
          {['Account', 'Team', 'Integrations', 'Payroll', 'Billing'].map((t) => (
            <span
              key={t}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={
                t === 'Integrations'
                  ? { backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', color: 'var(--color-primary)' }
                  : { color: 'var(--color-text-tertiary)' }
              }
            >
              {t}
            </span>
          ))}
        </div>

        <IntroBlock />

        <div data-demo-id="sl-section" className="rounded-lg p-1" style={ringStyle(at === 'sl-section')}>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Connected services</div>

          <div className="mb-2 rounded-lg border p-3 opacity-60" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Fireflies</span>
              <StatusDot on />
              <span className="text-[11px]" style={{ color: 'var(--color-success)' }}>Connected</span>
            </div>
          </div>

          <div
            data-demo-id="sl-card"
            className="rounded-lg border p-3"
            style={{ borderColor: at === 'sl-card' ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(at === 'sl-card') }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Slack</span>
                  <StatusDot on={false} />
                  <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Not connected</span>
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                  Send action items from meetings directly to Slack channels.
                </div>
              </div>
              <div className="shrink-0" style={{ width: 80 }}>
                <Btn demoId="sl-connect" active={at === 'sl-connect'}>Connect</Btn>
              </div>
            </div>
          </div>
        </div>

        <DialogShell title="Slack" subtitle="Connect Slack to post action items." open={open}>
          <DlgField label="Workspace URL" value={ws} placeholder="myworkspace.slack.com" demoId="sl-workspace" active={at === 'sl-workspace'} />
          <DlgField label="API token" value={token} placeholder="xoxb-…" mask demoId="sl-token" active={at === 'sl-token'} />
          <DlgField label="Default channel" value="#action-items" placeholder="#channel" />
          <div className="mb-2 mt-1">
            <SuccessMsg show={tested} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <SecBtn demoId="sl-dialog-test" active={at === 'sl-dialog-test'}>Test</SecBtn>
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

// ─── SAML SSO ──────────────────────────────────────────

const SSO_STEPS: TourStep[] = [
  { target: 'sso-section', caption: 'Scroll to Authentication & access' },
  { target: 'sso-card', caption: 'SAML SSO is not configured yet' },
  { target: 'sso-configure', caption: 'Open the SSO configuration dialog' },
  { target: 'sso-provider', caption: 'Pick your identity provider — Okta' },
  { target: 'sso-entity', caption: 'Copy the Entity ID into your IdP' },
  { target: 'sso-metadata', caption: 'Paste the IdP metadata URL, then test' },
]

export function SsoDemo() {
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState('Select provider…')
  const [copied, setCopied] = useState(false)
  const [metadata, setMetadata] = useState('')

  const apply = useCallback((i: number) => {
    if (i === 2) setOpen(true)
    else if (i === 3) setProvider('Okta')
    else if (i === 4) setCopied(true)
    else if (i === 5) setMetadata('https://acme.okta.com/app/metadata')
  }, [])
  const reset = useCallback(() => {
    setOpen(false)
    setProvider('Select provider…')
    setCopied(false)
    setMetadata('')
  }, [])

  const tour = useGuidedTour(SSO_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage tour={tour} label="Setting up SAML single sign-on for your organization." steps={SSO_STEPS} activeNav="Settings" url="app.flodok.com/dashboard/settings?tab=integrations">
      <div className="relative p-4">
        <div className="mb-3 flex items-center gap-1.5">
          {['Account', 'Team', 'Integrations', 'Payroll', 'Billing'].map((t) => (
            <span
              key={t}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={
                t === 'Integrations'
                  ? { backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', color: 'var(--color-primary)' }
                  : { color: 'var(--color-text-tertiary)' }
              }
            >
              {t}
            </span>
          ))}
        </div>

        <IntroBlock />

        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Connected services</div>
        <div className="mb-4 rounded-lg border p-3 opacity-60" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Fireflies</span>
            <StatusDot on />
            <span className="text-[11px]" style={{ color: 'var(--color-success)' }}>Connected</span>
          </div>
        </div>

        <div data-demo-id="sso-section" className="rounded-lg p-1" style={ringStyle(at === 'sso-section')}>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Authentication &amp; access</div>
          <div
            data-demo-id="sso-card"
            className="rounded-lg border p-3"
            style={{ borderColor: at === 'sso-card' ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(at === 'sso-card') }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>SAML SSO</span>
                  <StatusDot on={false} />
                  <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Not configured</span>
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                  Enable single sign-on for your organization using SAML 2.0.
                </div>
                <div className="mt-1 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>Contact support for SAML SSO setup.</div>
              </div>
              <div className="shrink-0" style={{ width: 86 }}>
                <Btn demoId="sso-configure" active={at === 'sso-configure'}>Configure</Btn>
              </div>
            </div>
          </div>
        </div>

        <DialogShell title="SAML SSO configuration" subtitle="Exchange metadata with your identity provider." open={open}>
          <DlgField label="Identity provider" value={provider === 'Select provider…' ? '' : provider} placeholder="Okta · Azure AD · Google Workspace" demoId="sso-provider" active={at === 'sso-provider'} />
          <div className="mb-2.5">
            <div className="mb-1 text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>Entity ID</div>
            <div
              data-demo-id="sso-entity"
              className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]"
              style={{ borderColor: at === 'sso-entity' ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', ...ringStyle(at === 'sso-entity') }}
            >
              <span className="truncate">https://flodok.com/sso/123abc</span>
              <span className="shrink-0 font-medium" style={{ color: copied ? 'var(--color-success)' : 'var(--color-primary)' }}>{copied ? 'Copied' : 'Copy'}</span>
            </div>
          </div>
          <DlgField label="Metadata URL" value={metadata} placeholder="Paste from your IdP" demoId="sso-metadata" active={at === 'sso-metadata'} />
          <div className="mt-1 flex items-center justify-between gap-2">
            <SecBtn>Test</SecBtn>
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
