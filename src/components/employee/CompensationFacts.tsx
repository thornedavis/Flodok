import { Link } from 'react-router-dom'
import { useLang } from '../../contexts/LanguageContext'
import { StatRow } from '../portal/StatRow'
import { formatIdr } from '../../lib/credits'
import { documentEditPath } from '../../lib/documentTypes'
import type { Contract } from '../../types/aliases'

// Pay-facts view for the employee → Compensation tab. Deliberately read-only:
// just the contractual numbers (base wage, allowance, monthly pay) and links
// out to edit the contract or open the full Performance page. The dynamic
// recognition levers (credits/bonus, the payout ring, modals) live on the
// dedicated Performance page instead.

function ShieldIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
}
function WalletIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
}

export function CompensationFacts({ contract, employeeId }: {
  contract: Contract | null
  employeeId: string
}) {
  const { t, lang } = useLang()
  const baseWage = contract?.base_wage_idr ?? 0
  const allowance = contract?.allowance_idr ?? 0
  const hasContract = !!contract && baseWage > 0
  const monthlyPay = baseWage + allowance

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
          {t.contractSnapshotTitle}
        </h2>
        {contract && (
          <Link to={documentEditPath('contract', contract.id)} className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t.contractSnapshotEdit} →
          </Link>
        )}
      </div>

      {!hasContract ? (
        <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}>
          {t.contractSnapshotNoActive}
        </div>
      ) : (
        <>
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{t.compensationMonthlyPay}</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>
            {formatIdr(monthlyPay, lang)}
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <StatRow
              icon={<ShieldIcon />}
              label={t.portalBaseWage}
              info={t.portalBaseWageInfo}
              value={formatIdr(baseWage, lang)}
              accent="var(--color-text-secondary)"
            />
            <StatRow
              icon={<WalletIcon />}
              label={t.portalAllowance}
              info={t.portalAllowanceInfo}
              value={formatIdr(allowance, lang)}
              accent="var(--color-text-secondary)"
              actions={contract ? (
                <Link to={documentEditPath('contract', contract.id)} className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {t.adjust} →
                </Link>
              ) : undefined}
            />
          </div>

          <div className="mt-4">
            <Link to={`/dashboard/performance/${employeeId}`} className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
              {t.compensationViewPerformance} →
            </Link>
          </div>
        </>
      )}
    </section>
  )
}
