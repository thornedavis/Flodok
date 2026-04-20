import { useEffect, useRef, useState } from 'react'
import { COUNTRIES } from './PhoneInput'
import { ID_PROVINCES } from '../lib/address'
import { useLang } from '../contexts/LanguageContext'

export interface AddressValue {
  street: string
  city: string
  province: string
  postal_code: string
  country: string // ISO alpha-2
}

interface AddressFieldsProps {
  value: AddressValue
  onChange: (next: AddressValue) => void
  disabled?: boolean
}

const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
}

const readOnlyStyle: React.CSSProperties = {
  ...inputStyle,
  backgroundColor: 'var(--color-bg-tertiary)',
  color: 'var(--color-text-secondary)',
}

export function AddressFields({ value, onChange, disabled }: AddressFieldsProps) {
  const { t } = useLang()
  const update = (patch: Partial<AddressValue>) => onChange({ ...value, ...patch })
  const style = disabled ? readOnlyStyle : inputStyle

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          {t.addressStreetLabel}
        </label>
        <input
          type="text"
          value={value.street}
          onChange={e => update({ street: e.target.value })}
          readOnly={disabled}
          placeholder={t.addressStreetPlaceholder}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={style}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {t.addressCityLabel}
          </label>
          <input
            type="text"
            value={value.city}
            onChange={e => update({ city: e.target.value })}
            readOnly={disabled}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={style}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {t.addressPostalCodeLabel}
          </label>
          <input
            type="text"
            value={value.postal_code}
            onChange={e => update({ postal_code: e.target.value })}
            readOnly={disabled}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={style}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {value.country === 'ID' ? t.addressProvinceLabel : t.addressRegionLabel}
          </label>
          {value.country === 'ID' ? (
            <select
              value={value.province}
              onChange={e => update({ province: e.target.value })}
              disabled={disabled}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={style}
            >
              <option value="">{t.addressProvincePlaceholder}</option>
              {ID_PROVINCES.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={value.province}
              onChange={e => update({ province: e.target.value })}
              readOnly={disabled}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={style}
            />
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            {t.addressCountryLabel}
          </label>
          <CountryDropdown
            value={value.country}
            onChange={iso => update({ country: iso, province: iso === value.country ? value.province : '' })}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Country dropdown (picks by ISO, reuses COUNTRIES list from PhoneInput) ──

function CountryDropdown({ value, onChange, disabled }: {
  value: string
  onChange: (iso: string) => void
  disabled?: boolean
}) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const selected = COUNTRIES.find(c => c.iso === value) || COUNTRIES[0]

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus()
  }, [open])

  const filtered = search.trim()
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.iso.toLowerCase().includes(search.toLowerCase()),
      )
    : COUNTRIES

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-60"
        style={disabled ? readOnlyStyle : inputStyle}
      >
        <span className="text-base">{selected.flag}</span>
        <span className="truncate" style={{ color: 'var(--color-text)' }}>{selected.name}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="ml-auto"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full min-w-[14rem] overflow-hidden rounded-lg border shadow-lg"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-elevated, var(--color-bg))' }}
        >
          <div className="border-b p-2" style={{ borderColor: 'var(--color-border)' }}>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t.searchCountriesPlaceholder}
              className="w-full rounded-md border px-2.5 py-1.5 text-sm"
              style={inputStyle}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map(country => (
              <button
                key={country.iso}
                type="button"
                onClick={() => { onChange(country.iso); setOpen(false); setSearch('') }}
                className="flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors"
                style={{
                  color: 'var(--color-text)',
                  backgroundColor: country.iso === selected.iso ? 'var(--color-bg-tertiary)' : 'transparent',
                }}
                onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                onMouseOut={e => {
                  e.currentTarget.style.backgroundColor = country.iso === selected.iso ? 'var(--color-bg-tertiary)' : 'transparent'
                }}
              >
                <span className="text-base">{country.flag}</span>
                <span className="flex-1 text-left">{country.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
