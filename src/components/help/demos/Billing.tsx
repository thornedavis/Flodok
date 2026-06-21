// Self-playing guided demos for the Help Center — Billing section.
// Each demo is a single Settings > Billing surface; state booleans flip
// element text/style to show change. Every [data-demo-id] target is always
// present in the DOM. Built on the shared GuidedDemo kit.

import { useCallback, useState } from 'react'
import { DesktopStage, useGuidedTour, ringStyle, Btn, DCard, KV, type TourStep } from '../GuidedDemo'

// ─── Shared bits ───────────────────────────────────────

function BillingTabs({ at }: { at: string | null }) {
  const tabs = ['Account', 'Team', 'Integrations', 'Payroll', 'Approvals']
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1 border-b pb-2" style={{ borderColor: 'var(--color-border)' }}>
      {tabs.map((t) => (
        <span key={t} className="rounded-md px-2.5 py-1 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{t}</span>
      ))}
      <span
        data-demo-id="settings-billing-tab"
        className="rounded-md px-2.5 py-1 text-xs font-semibold"
        style={{
          color: 'var(--color-primary)',
          backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
          ...ringStyle(at === 'settings-billing-tab'),
        }}
      >
        Billing
      </span>
    </div>
  )
}

function CardGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  )
}

function PaymentMethodCard({ at, demoId }: { at: string | null; demoId: string }) {
  return (
    <div
      data-demo-id={demoId}
      className="flex items-center gap-3 rounded-lg border p-3"
      style={{ borderColor: at === demoId ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: 'var(--color-bg)', ...ringStyle(at === demoId) }}
    >
      <CardGlyph />
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>Mastercard •••• 4242</div>
        <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Expires 12/26</div>
      </div>
    </div>
  )
}

// ─── billing-manage ────────────────────────────────────

const MANAGE_STEPS: TourStep[] = [
  { target: 'settings-billing-tab', caption: 'Open the Billing tab in Settings' },
  { target: 'plan-section', caption: 'Your plan and seat usage at a glance' },
  { target: 'adjust-plan-button', caption: 'Adjust plan opens the seat picker' },
  { target: 'payment-method-display', caption: 'Your saved card lives here' },
  { target: 'update-payment-button', caption: 'Update payment details opens the secure Stripe portal' },
  { target: 'change-info-button', caption: 'Change billing information edits the company name and email' },
]

export function BillingManageDemo() {
  const [adjusting, setAdjusting] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const apply = useCallback((i: number) => {
    if (i === 2) setAdjusting(true)
    else if (i === 4) setRedirecting(true)
  }, [])
  const reset = useCallback(() => {
    setAdjusting(false)
    setRedirecting(false)
  }, [])
  const tour = useGuidedTour(MANAGE_STEPS, apply, reset)
  const at = tour.activeTarget

  return (
    <DesktopStage
      tour={tour}
      label="Managing your subscription — plan, billing details, and payment in one place."
      steps={MANAGE_STEPS}
      activeNav="Settings"
      url="app.flodok.com/dashboard/settings?tab=billing"
    >
      <div className="p-4">
        <div className="mb-3 text-base font-semibold" style={{ color: 'var(--color-text)' }}>Billing</div>
        <BillingTabs at={at} />

        {/* Plan */}
        <div
          data-demo-id="plan-section"
          className="rounded-lg border p-3"
          style={{ borderColor: at === 'plan-section' ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(at === 'plan-section') }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Plan</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Pro · Rp 1.500.000 / month</div>
              <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>25 employees across 25 billable seats</div>
            </div>
            <div style={{ width: 132 }}>
              <Btn demoId="adjust-plan-button" active={at === 'adjust-plan-button'} variant="ghost">Adjust plan</Btn>
            </div>
          </div>
          <div className="mt-2.5">
            <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
              <div className="h-full rounded-full" style={{ width: '100%', backgroundColor: 'var(--color-primary)' }} />
            </div>
            <div className="mt-1 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              {adjusting ? 'Seat picker open — choose how many seats to bill' : '25 / 25 seats used'}
            </div>
          </div>
        </div>

        {/* Billing information */}
        <div className="mt-2">
          <DCard title="Billing information">
            <KV k="Company" v="PT Contoh Indonesia" />
            <KV k="Email" v="finance@contoh.id" />
            <div className="mt-2" style={{ width: 200 }}>
              <Btn demoId="change-info-button" active={at === 'change-info-button'} variant="ghost">Change billing information</Btn>
            </div>
          </DCard>
        </div>

        {/* Payment details */}
        <div className="mt-2">
          <DCard title="Payment details">
            <PaymentMethodCard at={at} demoId="payment-method-display" />
            <div className="mt-2" style={{ width: 200 }}>
              <Btn demoId="update-payment-button" active={at === 'update-payment-button'} variant="ghost">
                {redirecting ? 'Opening Stripe…' : 'Update payment details'}
              </Btn>
            </div>
          </DCard>
        </div>
      </div>
    </DesktopStage>
  )
}

// ─── billing-payment ───────────────────────────────────

const PAYMENT_STEPS: TourStep[] = [
  { target: 'settings-billing-tab', caption: 'Open the Billing tab in Settings' },
  { target: 'payment-section', caption: 'Scroll to the Payment details section' },
  { target: 'payment-method-display', caption: 'Your saved card — Mastercard •••• 4242' },
  { target: 'update-payment-button', caption: 'Update payment details redirects to the secure Stripe portal' },
  { target: 'payment-section', caption: 'Back from Stripe — your fresh card shows here' },
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
      label="Updating your card — payment changes happen in Stripe's secure portal."
      steps={PAYMENT_STEPS}
      activeNav="Settings"
      url="app.flodok.com/dashboard/settings?tab=billing"
    >
      <div className="p-4">
        <div className="mb-3 text-base font-semibold" style={{ color: 'var(--color-text)' }}>Billing</div>
        <BillingTabs at={at} />

        {/* Payment details */}
        <div
          data-demo-id="payment-section"
          className="rounded-lg border p-3"
          style={{ borderColor: at === 'payment-section' ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(at === 'payment-section') }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Payment details</div>
          <div className="mt-2">
            <PaymentMethodCard at={at} demoId="payment-method-display" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <div style={{ width: 200 }}>
              <Btn demoId="update-payment-button" active={at === 'update-payment-button'} variant="ghost">
                {redirecting ? 'Opening Stripe…' : 'Update payment details'}
              </Btn>
            </div>
            <div style={{ width: 200 }}>
              <Btn variant="ghost">Change billing information</Btn>
            </div>
          </div>
        </div>

        {/* Danger zone (collapsed) */}
        <div className="mt-3 flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--color-danger)' }}>
          <div className="min-w-0">
            <div className="text-xs font-semibold" style={{ color: 'var(--color-danger)' }}>Danger zone · Cancel a subscription</div>
            <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>Ends Pro at the next billing date</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
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
  { target: 'stripe-invoices-list', caption: 'Every invoice is listed with date and amount' },
  { target: 'invoice-pdf-download', caption: 'Download the PDF — a Faktur Pajak for PKP-registered orgs' },
]

function InvoiceRow({ date, amount, demoId, active }: { date: string; amount: string; demoId?: string; active?: boolean }) {
  return (
    <div
      data-demo-id={demoId}
      className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs first:border-t-0"
      style={{ borderColor: 'var(--color-border)', backgroundColor: active ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent', boxShadow: active ? 'inset 0 0 0 2px color-mix(in srgb, var(--color-primary) 35%, transparent)' : 'none' }}
    >
      <span className="flex-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>{date}</span>
      <span className="w-28 text-right font-medium" style={{ color: 'var(--color-text)' }}>{amount}</span>
      <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--color-primary)' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
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
      <div className="p-4">
        <div className="mb-3 text-base font-semibold" style={{ color: 'var(--color-text)' }}>Billing</div>
        <BillingTabs at={at} />

        {/* Billing information */}
        <div
          data-demo-id="billing-info-section"
          className="rounded-lg border p-3"
          style={{ borderColor: at === 'billing-info-section' ? 'var(--color-primary)' : 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', ...ringStyle(at === 'billing-info-section') }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Billing information</div>
          <div className="mt-1.5">
            <KV k="Company" v="PT Contoh Indonesia" />
            <KV k="Email" v="finance@contoh.id" />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <div style={{ width: 200 }}>
              <Btn variant="ghost">Change billing information</Btn>
            </div>
            <div style={{ width: 150 }}>
              <Btn demoId="billing-history-button" active={at === 'billing-history-button'} variant="ghost">
                {showStripe ? 'Opening…' : 'Billing history'}
              </Btn>
            </div>
          </div>
        </div>

        {/* Stripe portal invoices — always in DOM, dims until the portal "opens" */}
        <div
          className="mt-3 overflow-hidden rounded-lg border transition-opacity"
          style={{ borderColor: 'var(--color-border)', opacity: showStripe ? 1 : 0.45 }}
        >
          <div className="flex items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-tertiary)' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: showStripe ? 'var(--color-success)' : 'var(--color-text-tertiary)' }} />
            Stripe portal · Invoices
          </div>
          <div data-demo-id="stripe-invoices-list" style={ringStyle(at === 'stripe-invoices-list')}>
            <InvoiceRow date="1 Jun 2026" amount="Rp 1.500.000" demoId="invoice-pdf-download" active={at === 'invoice-pdf-download'} />
            <InvoiceRow date="1 May 2026" amount="Rp 1.500.000" />
            <InvoiceRow date="1 Apr 2026" amount="Rp 1.500.000" />
          </div>
        </div>
      </div>
    </DesktopStage>
  )
}
