import { useEffect, useRef, useState } from 'react'
import { COUNTRIES, findCountryByCode } from './PhoneInput'
import { useLang } from '../contexts/LanguageContext'

interface CountrySelectProps {
  /** Country dial code, e.g. '+62'. */
  value: string
  onChange: (code: string) => void
  disabled?: boolean
}

export function CountrySelect({ value, onChange, disabled }: CountrySelectProps) {
  const { t } = useLang()
  const selected = findCountryByCode(value)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

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
        c.code.includes(search) ||
        c.iso.toLowerCase().includes(search.toLowerCase()),
      )
    : COUNTRIES

  function handleSelect(code: string) {
    onChange(code)
    setOpen(false)
    setSearch('')
  }

  return (
    <div ref={containerRef} className="relative" style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-60"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: disabled ? 'var(--color-bg-tertiary)' : 'var(--color-bg)',
          color: 'var(--color-text)',
        }}
      >
        <span className="text-base">{selected.flag}</span>
        <span className="font-medium">{selected.code}</span>
        <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>{selected.name}</span>
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
          className="absolute left-0 top-full z-50 mt-1 max-h-60 w-72 overflow-hidden rounded-lg border shadow-lg"
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
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)',
              }}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map(country => (
              <button
                key={country.iso}
                type="button"
                onClick={() => handleSelect(country.code)}
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
                <span style={{ color: 'var(--color-text-tertiary)' }}>{country.code}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
