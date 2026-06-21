// Shared itemised-allowance grid, used by the contract editor and the contract
// template editor. Each row is a named earning component (Meal, Transport, …)
// with a fixed/variable label. The sum becomes the contract/template allowance
// total; is_fixed is a Talenta/payslip label only, never a calculation input.
//
// The parent owns the `components` array and its persistence; this component is
// a controlled grid (state in, onChange out) plus the running total.

import { useLang } from '../contexts/LanguageContext'
import { formatIdrDigits } from '../lib/credits'

export type CompLine = { key: string; name: string; amount: string; isFixed: boolean }

// A fresh blank line. New lines default to Fixed (tunjangan tetap) — the common
// case for a named contract allowance; the user can toggle per line.
export function newCompLine(): CompLine {
  return { key: crypto.randomUUID(), name: '', amount: '', isFixed: true }
}

// Drops fully-blank lines. Used by callers before validating/persisting.
export function cleanCompLines(components: CompLine[]): { name: string; amount: string; isFixed: boolean }[] {
  return components
    .map(c => ({ name: c.name.trim(), amount: c.amount.trim(), isFixed: c.isFixed }))
    .filter(c => c.name !== '' || c.amount !== '')
}

// Sum of the non-blank component amounts (the derived allowance).
export function compLinesSum(components: CompLine[]): number {
  return components.reduce((s, c) => s + (c.amount.trim() === '' ? 0 : (Number(c.amount) || 0)), 0)
}

const inputStyle = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
} as React.CSSProperties

export function AllowanceComponentsEditor({
  components,
  onChange,
}: {
  components: CompLine[]
  onChange: (next: CompLine[]) => void
}) {
  const { t } = useLang()
  const total = compLinesSum(components)

  const update = (i: number, patch: Partial<CompLine>) =>
    onChange(components.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  const remove = (i: number) => onChange(components.filter((_, idx) => idx !== i))
  const add = () => onChange([...components, newCompLine()])

  return (
    <div className="space-y-2">
      {components.map((c, i) => (
        <div key={c.key} className="rounded-lg border p-2" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={c.name}
              onChange={e => update(i, { name: e.target.value })}
              placeholder={t.allowanceNamePlaceholder}
              className="min-w-0 flex-1 rounded-md border px-2 py-1 text-sm"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={t.delete}
              className="shrink-0 rounded-md p-1"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <input
                type="text"
                inputMode="numeric"
                value={formatIdrDigits(c.amount)}
                onChange={e => update(i, { amount: e.target.value.replace(/\D/g, '') })}
                placeholder={t.amountIdrPlaceholder}
                className="w-full rounded-md border px-2 py-1 pr-8 text-sm"
                style={inputStyle}
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{t.idr}</span>
            </div>
            <button
              type="button"
              onClick={() => update(i, { isFixed: !c.isFixed })}
              title={c.isFixed ? t.allowanceFixedHelp : t.allowanceVariableHelp}
              className="shrink-0 rounded-md border px-2 py-1 text-[10px] font-medium"
              style={{
                borderColor: 'var(--color-border)',
                color: c.isFixed ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                backgroundColor: c.isFixed ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
              }}
            >
              {c.isFixed ? t.allowanceFixed : t.allowanceVariable}
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed px-2 py-1.5 text-xs font-medium"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        {t.addAllowance}
      </button>
      {components.length > 0 && (
        <div className="flex items-center justify-between px-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <span>{t.allowanceTotal}</span>
          <span className="font-medium tabular-nums" style={{ color: 'var(--color-text)' }}>{t.idr} {formatIdrDigits(String(total))}</span>
        </div>
      )}
    </div>
  )
}
