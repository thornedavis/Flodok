import { useState, useRef, useEffect } from 'react'
import { useLang } from '../contexts/LanguageContext'
import type { Translations } from '../lib/translations'

export interface CountryOption {
  code: string   // e.g. '+62'
  iso: string    // e.g. 'ID'
  flag: string   // e.g. '🇮🇩'
  name: string   // e.g. 'Indonesia'
  minDigits: number  // min local digits (excluding country code)
  maxDigits: number  // max local digits
}

export const COUNTRIES: CountryOption[] = [
  { code: '+62', iso: 'ID', flag: '🇮🇩', name: 'Indonesia', minDigits: 9, maxDigits: 12 },
  { code: '+61', iso: 'AU', flag: '🇦🇺', name: 'Australia', minDigits: 9, maxDigits: 9 },
  { code: '+1', iso: 'US', flag: '🇺🇸', name: 'United States', minDigits: 10, maxDigits: 10 },
  { code: '+44', iso: 'GB', flag: '🇬🇧', name: 'United Kingdom', minDigits: 10, maxDigits: 10 },
  { code: '+65', iso: 'SG', flag: '🇸🇬', name: 'Singapore', minDigits: 8, maxDigits: 8 },
  { code: '+60', iso: 'MY', flag: '🇲🇾', name: 'Malaysia', minDigits: 9, maxDigits: 10 },
  { code: '+66', iso: 'TH', flag: '🇹🇭', name: 'Thailand', minDigits: 9, maxDigits: 9 },
  { code: '+84', iso: 'VN', flag: '🇻🇳', name: 'Vietnam', minDigits: 9, maxDigits: 10 },
  { code: '+63', iso: 'PH', flag: '🇵🇭', name: 'Philippines', minDigits: 10, maxDigits: 10 },
  { code: '+81', iso: 'JP', flag: '🇯🇵', name: 'Japan', minDigits: 9, maxDigits: 10 },
  { code: '+82', iso: 'KR', flag: '🇰🇷', name: 'South Korea', minDigits: 9, maxDigits: 10 },
  { code: '+86', iso: 'CN', flag: '🇨🇳', name: 'China', minDigits: 11, maxDigits: 11 },
  { code: '+91', iso: 'IN', flag: '🇮🇳', name: 'India', minDigits: 10, maxDigits: 10 },
  { code: '+49', iso: 'DE', flag: '🇩🇪', name: 'Germany', minDigits: 10, maxDigits: 11 },
  { code: '+33', iso: 'FR', flag: '🇫🇷', name: 'France', minDigits: 9, maxDigits: 9 },
  { code: '+971', iso: 'AE', flag: '🇦🇪', name: 'UAE', minDigits: 7, maxDigits: 9 },
  { code: '+64', iso: 'NZ', flag: '🇳🇿', name: 'New Zealand', minDigits: 8, maxDigits: 10 },
  { code: '+27', iso: 'ZA', flag: '🇿🇦', name: 'South Africa', minDigits: 9, maxDigits: 9 },
  { code: '+55', iso: 'BR', flag: '🇧🇷', name: 'Brazil', minDigits: 10, maxDigits: 11 },
  { code: '+34', iso: 'ES', flag: '🇪🇸', name: 'Spain', minDigits: 9, maxDigits: 9 },
]

export function findCountryByCode(countryCode: string): CountryOption {
  return COUNTRIES.find(c => c.code === countryCode) || COUNTRIES[0]
}

/**
 * Parse an existing E.164 phone number into country code + local number.
 * Tries longest match first (e.g. +971 before +9).
 */
export function parsePhone(e164: string): { country: CountryOption; localNumber: string } {
  if (!e164.startsWith('+')) {
    return { country: COUNTRIES[0], localNumber: e164 }
  }

  const sorted = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length)
  for (const c of sorted) {
    if (e164.startsWith(c.code)) {
      return { country: c, localNumber: e164.slice(c.code.length) }
    }
  }

  return { country: COUNTRIES[0], localNumber: e164.slice(1) }
}

function getValidationState(digits: string, country: CountryOption): 'empty' | 'short' | 'valid' | 'long' {
  if (digits.length === 0) return 'empty'
  if (digits.length < country.minDigits) return 'short'
  if (digits.length > country.maxDigits) return 'long'
  return 'valid'
}

function getValidationMessage(state: 'empty' | 'short' | 'valid' | 'long', country: CountryOption, t: Translations): string {
  const expected = country.minDigits === country.maxDigits
    ? t.digitsExact(country.minDigits)
    : t.digitsRange(country.minDigits, country.maxDigits)
  if (state === 'short') return t.phoneTooShort(country.name, expected)
  if (state === 'long') return t.phoneTooLong(country.name, expected)
  return ''
}

export function PhoneInput({ value, onChange, defaultCountryCode = '+62' }: {
  value: string
  onChange: (e164: string) => void
  defaultCountryCode?: string
}) {
  const { t } = useLang()
  const parsed = value.startsWith('+')
    ? parsePhone(value)
    : { country: findCountryByCode(defaultCountryCode), localNumber: value.replace(/^0/, '') }

  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(parsed.country)
  const [localNumber, setLocalNumber] = useState(parsed.localNumber)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [touched, setTouched] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Focus search when dropdown opens
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus()
    }
  }, [open])

  const digits = localNumber.replace(/\s/g, '')
  const validation = getValidationState(digits, selectedCountry)
  const showError = touched && (validation === 'short' || validation === 'long')
  const errorMessage = getValidationMessage(validation, selectedCountry, t)

  function handleLocalChange(e: React.ChangeEvent<HTMLInputElement>) {
    const cleaned = e.target.value.replace(/[^\d\s]/g, '')
    setLocalNumber(cleaned)
    setTouched(true)
    const d = cleaned.replace(/\s/g, '')
    onChange(d ? selectedCountry.code + d : '')
  }

  function handleCountrySelect(country: CountryOption) {
    setSelectedCountry(country)
    setOpen(false)
    setSearch('')
    const d = localNumber.replace(/\s/g, '')
    onChange(d ? country.code + d : '')
  }

  const filteredCountries = search
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.includes(search) ||
        c.iso.toLowerCase().includes(search.toLowerCase())
      )
    : COUNTRIES

  const borderColor = showError ? 'var(--color-danger)' : 'var(--color-border)'

  return (
    <div>
      <div className="relative flex items-stretch" ref={dropdownRef} style={{ position: 'relative' }}>
        {/* Country selector */}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex shrink-0 items-center gap-1.5 rounded-l-lg border border-r-0 px-2.5 text-sm transition-colors"
          style={{
            borderColor,
            backgroundColor: 'var(--color-bg-tertiary)',
            color: 'var(--color-text)',
          }}
        >
          <span className="text-base">{selectedCountry.flag}</span>
          <span>{selectedCountry.code}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Number input */}
        <input
          type="tel"
          value={localNumber}
          onChange={handleLocalChange}
          onBlur={() => setTouched(true)}
          placeholder="812 3456 7890"
          className="w-full rounded-r-lg border px-3 py-2 text-sm outline-none"
          style={{
            borderColor,
            backgroundColor: 'var(--color-bg)',
            color: showError ? 'var(--color-danger)' : 'var(--color-text)',
          }}
        />

        {/* Validation icon */}
        {touched && validation === 'valid' && (
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-success)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}
        {showError && (
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-danger)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
        )}

        {/* Dropdown */}
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
                className="w-full rounded-md border px-2.5 py-1.5 text-sm outline-none"
                style={{
                  borderColor: 'var(--color-border)',
                  backgroundColor: 'var(--color-bg)',
                  color: 'var(--color-text)',
                }}
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredCountries.map(country => (
                <button
                  key={country.iso}
                  type="button"
                  onClick={() => handleCountrySelect(country)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors"
                  style={{
                    color: 'var(--color-text)',
                    backgroundColor: country.iso === selectedCountry.iso ? 'var(--color-bg-tertiary)' : 'transparent',
                  }}
                  onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
                  onMouseOut={e => {
                    e.currentTarget.style.backgroundColor = country.iso === selectedCountry.iso ? 'var(--color-bg-tertiary)' : 'transparent'
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

      {/* Validation message — only show errors */}
      {showError && (
        <p className="mt-1 text-xs" style={{ color: 'var(--color-danger)' }}>
          {errorMessage}
        </p>
      )}
    </div>
  )
}
