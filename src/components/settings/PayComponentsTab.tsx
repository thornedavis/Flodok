// Settings → Pay components. The per-org catalog that drives the Talenta
// export. Each component is a free-text line item (mirroring Talenta's model);
// the org names it, marks whether it's been set up in Talenta ("In Talenta"),
// and the export only emits confirmed components. This screen doubles as the
// "set these up in Talenta" checklist.

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Translations } from '../../lib/translations'
import type { User } from '../../types/aliases'

type Kind = 'earning' | 'deduction' | 'benefit'
type Category = 'base' | 'allowance' | 'bonus' | 'overtime' | 'penalty' | 'unpaid_leave' | 'other'

type PayComponent = {
  id: string
  name: string
  kind: Kind
  category: Category
  talenta_name: string | null
  talenta_confirmed: boolean
  is_fixed_default: boolean
  taxable_hint: boolean
  sort_order: number
  active: boolean
}

const KINDS: Kind[] = ['earning', 'deduction', 'benefit']
const CATEGORIES: Category[] = ['base', 'allowance', 'bonus', 'overtime', 'penalty', 'unpaid_leave', 'other']

function kindLabel(k: Kind, t: Translations): string {
  return k === 'earning' ? t.payCompKindEarning : k === 'deduction' ? t.payCompKindDeduction : t.payCompKindBenefit
}
function categoryLabel(c: Category, t: Translations): string {
  switch (c) {
    case 'base': return t.payCompCatBase
    case 'allowance': return t.payCompCatAllowance
    case 'bonus': return t.payCompCatBonus
    case 'overtime': return t.payCompCatOvertime
    case 'penalty': return t.payCompCatPenalty
    case 'unpaid_leave': return t.payCompCatUnpaidLeave
    default: return t.payCompCatOther
  }
}

const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)',
}

export function PayComponentsTab({ user, t }: { user: User; t: Translations }) {
  const [rows, setRows] = useState<PayComponent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    let res = await supabase.from('org_pay_components').select('*').eq('org_id', user.org_id).order('sort_order')
    if (!res.error && (!res.data || res.data.length === 0)) {
      await supabase.rpc('seed_default_pay_components')
      res = await supabase.from('org_pay_components').select('*').eq('org_id', user.org_id).order('sort_order')
    }
    if (res.error) setError(res.error.message)
    setRows((res.data ?? []) as PayComponent[])
    setLoading(false)
  }
  useEffect(() => { load() }, [user.org_id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function patchRow(id: string, patch: Partial<PayComponent>) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
    const { error: e } = await supabase.from('org_pay_components').update(patch).eq('id', id)
    if (e) { setError(e.message); load() } else setError('')
  }

  async function addRow() {
    const base = t.payCompNewName
    const taken = new Set(rows.map(r => r.name))
    let name = base
    let n = 2
    while (taken.has(name)) name = `${base} ${n++}`
    const maxOrder = rows.reduce((m, r) => Math.max(m, r.sort_order), 0)
    const { data, error: e } = await supabase.from('org_pay_components').insert({
      org_id: user.org_id, name, kind: 'earning', category: 'allowance',
      is_fixed_default: false, taxable_hint: true, sort_order: maxOrder + 10,
    }).select('*').single()
    if (e) { setError(e.message); return }
    if (data) setRows(prev => [...prev, data as PayComponent])
  }

  async function deleteRow(id: string) {
    if (!confirm(t.payCompDeleteConfirm)) return
    setRows(prev => prev.filter(r => r.id !== id))
    const { error: e } = await supabase.from('org_pay_components').delete().eq('id', id)
    if (e) { setError(e.message); load() }
  }

  const confirmedCount = rows.filter(r => r.talenta_confirmed).length

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{t.payCompTitle}</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t.payCompIntro}</p>
      </div>

      <div className="rounded-lg border p-3 text-sm" style={{ borderColor: 'color-mix(in srgb, var(--color-primary) 30%, var(--color-border))', backgroundColor: 'color-mix(in srgb, var(--color-primary) 6%, transparent)', color: 'var(--color-text-secondary)' }}>
        {t.payCompChecklistNote}
        {rows.length > 0 && (
          <span className="ml-1 font-medium" style={{ color: 'var(--color-text)' }}>{t.payCompConfirmedProgress(confirmedCount, rows.length)}</span>
        )}
      </div>

      {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.loading}</p>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <ComponentCard key={r.id} row={r} t={t} onPatch={patchRow} onDelete={deleteRow} />
          ))}
          <button
            type="button"
            onClick={addRow}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm font-medium"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            {t.payCompAdd}
          </button>
        </div>
      )}
    </section>
  )
}

function Pill({ on, onClick, children, title, tone = 'primary' }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string; tone?: 'primary' | 'success' }) {
  const color = tone === 'success' ? 'var(--color-success)' : 'var(--color-primary)'
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium"
      style={{
        borderColor: on ? color : 'var(--color-border)',
        color: on ? color : 'var(--color-text-secondary)',
        backgroundColor: on ? `color-mix(in srgb, ${color} 10%, transparent)` : 'transparent',
      }}
    >
      {children}
    </button>
  )
}

function ComponentCard({ row, t, onPatch, onDelete }: {
  row: PayComponent
  t: Translations
  onPatch: (id: string, patch: Partial<PayComponent>) => void
  onDelete: (id: string) => void
}) {
  // Local text state so typing doesn't re-render the whole list; commit on blur.
  const [name, setName] = useState(row.name)
  const [talentaName, setTalentaName] = useState(row.talenta_name ?? '')

  return (
    <div
      className="rounded-lg border p-3"
      style={{ borderColor: row.talenta_confirmed ? 'color-mix(in srgb, var(--color-success) 35%, var(--color-border))' : 'var(--color-border)' }}
    >
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={() => { const v = name.trim(); if (v && v !== row.name) onPatch(row.id, { name: v }); else setName(row.name) }}
          className="min-w-0 flex-1 rounded-md border px-2.5 py-1.5 text-sm font-medium"
          style={inputStyle}
        />
        <Pill on={row.talenta_confirmed} tone="success" title={t.payCompConfirmedHelp} onClick={() => onPatch(row.id, { talenta_confirmed: !row.talenta_confirmed })}>
          {row.talenta_confirmed ? `✓ ${t.payCompInTalenta}` : t.payCompInTalenta}
        </Pill>
        <button type="button" onClick={() => onDelete(row.id)} aria-label={t.delete} className="shrink-0 rounded-md p-1" style={{ color: 'var(--color-text-tertiary)' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select value={row.kind} onChange={e => onPatch(row.id, { kind: e.target.value as Kind })} className="rounded-md border px-2 py-1 text-xs" style={inputStyle}>
          {KINDS.map(k => <option key={k} value={k}>{kindLabel(k, t)}</option>)}
        </select>
        <select value={row.category} onChange={e => onPatch(row.id, { category: e.target.value as Category })} className="rounded-md border px-2 py-1 text-xs" style={inputStyle}>
          {CATEGORIES.map(c => <option key={c} value={c}>{categoryLabel(c, t)}</option>)}
        </select>
        <Pill on={row.is_fixed_default} title={t.payCompFixedHelp} onClick={() => onPatch(row.id, { is_fixed_default: !row.is_fixed_default })}>
          {row.is_fixed_default ? t.payCompFixed : t.payCompVariable}
        </Pill>
        <Pill on={row.taxable_hint} title={t.payCompTaxableHelp} onClick={() => onPatch(row.id, { taxable_hint: !row.taxable_hint })}>
          {t.payCompTaxable}
        </Pill>
      </div>

      <div className="mt-2">
        <input
          value={talentaName}
          onChange={e => setTalentaName(e.target.value)}
          onBlur={() => { const v = talentaName.trim(); if (v !== (row.talenta_name ?? '')) onPatch(row.id, { talenta_name: v || null }) }}
          placeholder={t.payCompTalentaNamePlaceholder(name)}
          className="w-full rounded-md border px-2.5 py-1.5 text-xs"
          style={inputStyle}
        />
      </div>
    </div>
  )
}
