// Self-playing guided demos for the Help Center — Billing section.
// Each demo is a single Settings > Billing surface; state booleans flip
// element text/style to show change. Every [data-demo-id] target is always
// present in the DOM. Built on the shared GuidedDemo kit.

import { useCallback, useState } from 'react'
import { DesktopStage, useGuidedTour, ringStyle, Btn, type TourStep } from '../GuidedDemo'

// ─── Shared bits ───────────────────────────────────────

function BillingTabs({ at }: { at: string | null }) {
  const tabs = ['Account', 'Team', 'Integrations', 'Payroll', 'Approvals', 'Billing']
  return (
    <div className="mb-6 flex flex-wrap items-center gap-1 border-b pb-2" style={{ borderColor: 'var(--color-border)' }}>
      {tabs.map((t) => {
        const isActive = t === 'Billing'
        return (
          <button
            key={t}
            className="relative px-4 py-2 text-sm font-medium transition-colors"
            style={{ color: isActive ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}
            data-demo-id={t === 'Billing' ? 'settings-billing-tab' : undefined}
          >
            {t}
            {isActive && (
              <span
                className="absolute -bottom-px left-0 right-0 h-0.5"
                style={{ backgroundColor: 'var(--color-primary)', ...ringStyle(at === 'settings-billing-tab') }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

function CardGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  )
}

function BillingSection({ title, at, demoId, children }: { title: string; at: string | null; demoId?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-tertiary)' }}>
        {title}
      </div>
      <div
        data-demo-id={demoId}
        className="rounded-xl border p-5"
        style={{
          borderColor: at === demoId ? 'var(--color-primary)' : 'var(--color-border)',
          backgroundColor: 'var(--color-bg)',
          ...ringStyle(at === demoId),
        }}
      >
        {children}
      </div>
    </div>
  )
}

// ─── billing-manage ────────────────────────────────────

const MANAGE_STEPS: TourStep[] = [
  { target: 'settings-billing-tab', caption: 'Open the Billing tab in Settings' },
  { target: 'plan-section', caption: 'Current plan and employee count at a glance' },
  { target: 'adjust-plan-button', caption: 'Adjust plan opens the seat picker' },
  { target: 'billing-info-section', caption: 'Billing information with company details' },
  { target: 'change-info-button', caption: 'Change billing information edits the company name and email' },
  { target: 'payment-section', caption: 'Your saved payment method' },
]

export function BillingManageDemo() {
  const [adjusting, setAdjusting] = useState(false)
  const apply = useCallback((i: number) => {
    if (i === 2) setAdjusting(true)
    else if (i >= 3) setAdjusting(false)
  }, [])
  const reset = useCallback(() => {
    setAdjusting(false)
  }, [])
  const tour = useGuidedTour(MANAGE_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage
      tour={tour}
      label="Managing your subscription — plan, seat count, billing details, and payment in one place."
      steps={MANAGE_STEPS}
      activeNav="Settings"
      url="app.flodok.com/dashboard/settings?tab=billing"
    >
      <div className="space-y-6 p-4">
        <div>
          <div className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>Settings</div>
        </div>
        <BillingTabs at={at} />

        {/* Plan Section */}
        <BillingSection title="Plan" at={at} demoId="plan-section">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
                  Pro · Rp 5,250,000 / month
                </span>
              </div>
              <div className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                You have 18 employees on Pro · billed for 18 this cycle.
              </div>
              {/* Employee usage bar */}
              <div className="mt-4 max-w-md">
                <div className="mb-1 flex justify-between text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  <span>Employees</span>
                  <span>18 / 18</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
                  <div className="h-full rounded-full" style={{ width: '100%', backgroundColor: 'var(--color-primary)' }} />
                </div>
              </div>
            </div>
            <div style={{ width: 120 }}>
              <Btn demoId="adjust-plan-button" active={at === 'adjust-plan-button'} variant="ghost">
                {adjusting ? 'Opening…' : 'Adjust plan'}
              </Btn>
            </div>
          </div>
        </BillingSection>

        {/* Billing Information */}
        <BillingSection title="Billing information" at={at} demoId="billing-info-section">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
                PT Acme Indonesia
              </div>
              <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                admin@acme.id
              </div>
              <div className="mt-0.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>NPWP 01.234.567.8-901.000</div>
            </div>
            <div style={{ width: 200 }}>
              <Btn demoId="change-info-button" active={at === 'change-info-button'} variant="ghost">
                Change billing information
              </Btn>
            </div>
          </div>
        </BillingSection>

        {/* Payment Details */}
        <BillingSection title="Payment details" at={at} demoId="payment-section">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-12 items-center justify-center rounded-md"
                style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
              >
                <CardGlyph />
              </div>
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  Mastercard
                  <span className="ml-2 font-mono tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>
                    •••• 4242
                  </span>
                </div>
                <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  Expires 12/26
                </div>
              </div>
            </div>
            <div style={{ width: 170 }}>
              <Btn variant="ghost">Update payment details</Btn>
            </div>
          </div>
        </BillingSection>
      </div>
    </DesktopStage>
  )
}

// ─── billing-payment ───────────────────────────────────

const PAYMENT_STEPS: TourStep[] = [
  { target: 'settings-billing-tab', caption: 'Open the Billing tab in Settings' },
  { target: 'payment-section', caption: 'Find the Payment details section' },
  { target: 'payment-card-display', caption: 'Your saved card — Mastercard •••• 4242' },
  { target: 'update-payment-button', caption: 'Update payment details opens Stripe’s secure portal' },
  { target: 'payment-section', caption: 'Back from Stripe — your updated card shows here' },
]

export function BillingPaymentDemo() {
  const [redirecting, setRedirecting] = useState(false)
  const apply = useCallback((i: number) => {
    if (i === 3) setRedirecting(true)
    else if (i === 4) setRedirecting(false)
  }, [])
  const reset = useCallback(() => setRedirecting(false), [])
  const tour = useGuidedTour(PAYMENT_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage
      tour={tour}
      label="Updating your card — payment changes happen in Stripe’s secure portal."
      steps={PAYMENT_STEPS}
      activeNav="Settings"
      url="app.flodok.com/dashboard/settings?tab=billing"
    >
      <div className="space-y-6 p-4">
        <div>
          <div className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>Settings</div>
        </div>
        <BillingTabs at={at} />

        {/* Plan Section (faded) */}
        <BillingSection title="Plan" at={at}>
          <div className="flex items-start justify-between gap-4" style={{ opacity: 0.5 }}>
            <div className="min-w-0 flex-1">
              <span className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
                Pro · Rp 5,250,000 / month
              </span>
              <div className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                You have 18 employees on Pro · billed for 18 this cycle.
              </div>
              <div className="mt-4 max-w-md">
                <div className="mb-1 flex justify-between text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  <span>Employees</span>
                  <span>18 / 18</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
                  <div className="h-full rounded-full" style={{ width: '100%', backgroundColor: 'var(--color-primary)' }} />
                </div>
              </div>
            </div>
            <div style={{ width: 120 }}>
              <Btn variant="ghost">Adjust plan</Btn>
            </div>
          </div>
        </BillingSection>

        {/* Payment Details */}
        <BillingSection title="Payment details" at={at} demoId="payment-section">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-12 items-center justify-center rounded-md"
                style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
              >
                <CardGlyph />
              </div>
              <div
                data-demo-id="payment-card-display"
                style={ringStyle(at === 'payment-card-display')}
              >
                <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  Mastercard
                  <span className="ml-2 font-mono tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>
                    •••• 4242
                  </span>
                </div>
                <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  Expires 12/26
                </div>
              </div>
            </div>
            <div style={{ width: 170 }}>
              <Btn demoId="update-payment-button" active={at === 'update-payment-button'} variant="ghost">
                {redirecting ? 'Opening Stripe…' : 'Update payment details'}
              </Btn>
            </div>
          </div>
        </BillingSection>

        {/* Danger Zone */}
        <div className="overflow-hidden rounded-xl border transition-opacity" style={{ borderColor: 'var(--color-danger)', opacity: 0.5 }}>
          <div className="flex cursor-pointer items-center justify-between px-5 py-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.04)' }}>
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--color-danger)' }}>
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span className="text-xs font-semibold" style={{ color: 'var(--color-danger)' }}>
                Danger zone · Cancel a subscription
              </span>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </div>
    </DesktopStage>
  )
}

// ─── billing-invoices ──────────────────────────────────

const INVOICE_STEPS: TourStep[] = [
  { target: 'settings-billing-tab', caption: 'Open the Billing tab in Settings' },
  { target: 'billing-info-section', caption: 'Find the Billing information section' },
  { target: 'billing-history-button', caption: 'Billing history opens the Stripe portal' },
  { target: 'stripe-invoices-list', caption: 'Your invoices are listed with dates and amounts' },
  { target: 'invoice-download-row', caption: 'Download each PDF for your records' },
  { target: 'faktur-note', caption: 'A Faktur Pajak tax invoice is issued from your NPWP' },
]

function InvoiceRow({ date, amount, demoId, active }: { date: string; amount: string; demoId?: string; active?: boolean }) {
  return (
    <div
      data-demo-id={demoId}
      className="flex items-center justify-between gap-2 border-t px-4 py-2.5 text-xs first:border-t-0"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: active ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent',
        boxShadow: active ? 'inset 0 0 0 2px color-mix(in srgb, var(--color-primary) 35%, transparent)' : 'none',
      }}
    >
      <span style={{ color: 'var(--color-text-secondary)' }}>{date}</span>
      <span className="font-medium" style={{ color: 'var(--color-text)' }}>{amount}</span>
      <span className="inline-flex items-center gap-1 font-medium" style={{ color: 'var(--color-primary)' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        PDF
      </span>
    </div>
  )
}

export function BillingInvoicesDemo() {
  const [showStripe, setShowStripe] = useState(false)
  const apply = useCallback((i: number) => {
    if (i === 2) setShowStripe(true)
  }, [])
  const reset = useCallback(() => setShowStripe(false), [])
  const tour = useGuidedTour(INVOICE_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage
      tour={tour}
      label="Finding invoices — billing history and PDF receipts live in the Stripe portal."
      steps={INVOICE_STEPS}
      activeNav="Settings"
      url="app.flodok.com/dashboard/settings?tab=billing"
    >
      <div className="space-y-6 p-4">
        <div>
          <div className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>Settings</div>
        </div>
        <BillingTabs at={at} />

        {/* Billing Information */}
        <BillingSection title="Billing information" at={at} demoId="billing-info-section">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
                PT Acme Indonesia
              </div>
              <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                admin@acme.id
              </div>
              <div className="mt-0.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>NPWP 01.234.567.8-901.000</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <div style={{ width: 180 }}>
                <Btn variant="ghost">Change billing information</Btn>
              </div>
              <div style={{ width: 130 }}>
                <Btn demoId="billing-history-button" active={at === 'billing-history-button'} variant="ghost">
                  {showStripe ? 'Opening…' : 'Billing history'}
                </Btn>
              </div>
            </div>
          </div>
        </BillingSection>

        {/* Stripe Portal Invoices */}
        <div
          className="overflow-hidden rounded-xl border transition-opacity"
          style={{ borderColor: 'var(--color-border)', opacity: showStripe ? 1 : 0.45 }}
        >
          <div className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest" style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-tertiary)' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: showStripe ? 'var(--color-success)' : 'var(--color-text-tertiary)' }} />
            Stripe portal · Invoices
          </div>
          <div data-demo-id="stripe-invoices-list" style={ringStyle(at === 'stripe-invoices-list')}>
            <InvoiceRow date="1 Jun 2026" amount="Rp 5.250.000" demoId="invoice-download-row" active={at === 'invoice-download-row'} />
            <InvoiceRow date="1 May 2026" amount="Rp 5.250.000" />
            <InvoiceRow date="1 Apr 2026" amount="Rp 5.250.000" />
          </div>
        </div>

        <div data-demo-id="faktur-note" className="flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(at === 'faktur-note') }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M8 7h8" /><path d="M8 11h8" /></svg>
          <div>
            <span className="font-medium" style={{ color: 'var(--color-text)' }}>Faktur Pajak</span>
            <span style={{ color: 'var(--color-text-tertiary)' }}> — add your NPWP above and we issue a Faktur Pajak (Indonesian tax invoice) for each payment.</span>
          </div>
        </div>
      </div>
    </DesktopStage>
  )
}
