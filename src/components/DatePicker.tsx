// Thin adapter that delegates to DateTimePicker (mode="date") so the whole
// app uses one calendar UX. Keeping this export means the dozen-or-so
// employee-section call sites continue to work without per-site edits.
//
// minYear / maxYear are accepted for backwards compatibility but no longer
// enforced — the new picker exposes year-nav chevrons so navigating to any
// year is one click, making a hard year range advisory at best.

import { DateTimePicker } from './DateTimePicker'

interface DatePickerProps {
  /** ISO date string YYYY-MM-DD, or '' for empty. */
  value: string
  onChange: (next: string) => void
  /** @deprecated No longer enforced. Year-nav chevrons make a range cap unnecessary. */
  minYear?: number
  /** @deprecated No longer enforced. Year-nav chevrons make a range cap unnecessary. */
  maxYear?: number
  placeholder?: string
  disabled?: boolean
}

export function DatePicker({ value, onChange, placeholder, disabled }: DatePickerProps) {
  return (
    <DateTimePicker
      mode="date"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
    />
  )
}
