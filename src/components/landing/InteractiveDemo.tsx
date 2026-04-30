import { useEffect, useState } from 'react'
import { getAvatarGradient, getInitials } from '../../lib/avatar'

// Lazy-loads the four cursive Google Fonts used by the typed-signature picker
// in the contract preview. Idempotent — safe to call repeatedly.
function ensureSignatureFontsLoaded(): void {
  if (typeof document === 'undefined') return
  const families = ['Dancing+Script', 'Great+Vibes', 'Caveat', 'Homemade+Apple']
  const href = `https://fonts.googleapis.com/css2?family=${families.join('&family=')}&display=swap`
  if (document.head.querySelector(`link[href="${href}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

// ─── Types & demo data ──────────────────────────────────

type DemoPage =
  | 'overview'
  | 'employees'
  | 'sops'
  | 'contracts'
  | 'performance'
  | 'spotlight'
  | 'pending'
  | 'settings'

type DemoEmployee = {
  id: string
  name: string
  role: string
  departments: string[]
  phone: string
  email: string
  joined: string
  status: 'active' | 'trial'
  baseWage: number
  allowance: number
  credits: number
  badgeCount: number
}

const ORG_NAME = 'Acme Indonesia'

const EMPLOYEES: DemoEmployee[] = [
  { id: 'e1', name: 'Sari Wijaya',     role: 'COO',                 departments: ['Operations', 'Leadership'], phone: '+62 812-3456-7890', email: 'sari@acme.id',     joined: 'Apr 2023', status: 'active', baseWage: 25_000_000, allowance: 4_000_000, credits: 1240, badgeCount: 9 },
  { id: 'e2', name: 'Rian Pratama',    role: 'Senior Engineer',     departments: ['Engineering'],              phone: '+62 813-2233-4455', email: 'rian@acme.id',     joined: 'Jul 2023', status: 'active', baseWage: 18_000_000, allowance: 2_500_000, credits: 980,  badgeCount: 7 },
  { id: 'e3', name: 'Dewi Kusuma',     role: 'Operations Lead',     departments: ['Operations'],               phone: '+62 811-9988-7766', email: 'dewi@acme.id',     joined: 'Jan 2024', status: 'active', baseWage: 12_500_000, allowance: 1_800_000, credits: 870,  badgeCount: 6 },
  { id: 'e4', name: 'Ahmad Surya',     role: 'Marketing Manager',   departments: ['Marketing'],                phone: '+62 821-7766-5544', email: 'ahmad@acme.id',    joined: 'Sep 2023', status: 'active', baseWage: 14_000_000, allowance: 2_000_000, credits: 720,  badgeCount: 5 },
  { id: 'e5', name: 'Putri Lestari',   role: 'Customer Success Lead', departments: ['Customer Success'],       phone: '+62 822-1122-3344', email: 'putri@acme.id',    joined: 'Feb 2024', status: 'active', baseWage: 11_000_000, allowance: 1_500_000, credits: 640,  badgeCount: 4 },
  { id: 'e6', name: 'Budi Santoso',    role: 'Warehouse Supervisor', departments: ['Operations'],              phone: '+62 815-4433-2211', email: 'budi@acme.id',     joined: 'Aug 2024', status: 'active', baseWage: 8_500_000,  allowance: 1_200_000, credits: 520,  badgeCount: 3 },
  { id: 'e7', name: 'Maya Indrawati',  role: 'People & Culture',    departments: ['People'],                   phone: '+62 819-5566-7788', email: 'maya@acme.id',     joined: 'Mar 2024', status: 'active', baseWage: 13_000_000, allowance: 1_700_000, credits: 480,  badgeCount: 4 },
  { id: 'e8', name: 'Reza Maulana',    role: 'Software Engineer',   departments: ['Engineering'],              phone: '+62 838-9900-1122', email: 'reza@acme.id',     joined: 'Nov 2024', status: 'trial',  baseWage: 12_000_000, allowance: 1_500_000, credits: 210,  badgeCount: 2 },
]

const HEADCOUNT = EMPLOYEES.length

const SOPS = [
  { id: 's1', title: 'Customer onboarding playbook', dept: 'Sales',             empId: 'e1', version: '2.3', status: 'active' as const, updated: '2 hari yang lalu' },
  { id: 's2', title: 'Cash handling — daily close',  dept: 'Operations',        empId: 'e3', version: '1.4', status: 'active' as const, updated: '5 hari yang lalu' },
  { id: 's3', title: 'Refund & dispute handling',    dept: 'Customer Success',  empId: 'e5', version: '1.2', status: 'active' as const, updated: '1 minggu yang lalu' },
  { id: 's4', title: 'New hire — week one checklist', dept: 'People',           empId: 'e7', version: '3.0', status: 'draft' as const,  updated: '2 minggu yang lalu' },
  { id: 's5', title: 'Inventory reconciliation',     dept: 'Operations',        empId: 'e6', version: '2.0', status: 'active' as const, updated: '3 minggu yang lalu' },
  { id: 's6', title: 'Production deploy checklist',  dept: 'Engineering',       empId: 'e2', version: '4.1', status: 'active' as const, updated: '1 bulan yang lalu' },
]

const CONTRACTS = [
  { id: 'c1', title: 'Employment agreement',  empId: 'e1', version: '1.0', wage: 25_000_000, status: 'active' as const, signed: true,  updated: '12 Jan 2025' },
  { id: 'c2', title: 'Employment agreement',  empId: 'e2', version: '1.1', wage: 18_000_000, status: 'active' as const, signed: true,  updated: '03 Mar 2025' },
  { id: 'c3', title: 'Employment agreement',  empId: 'e3', version: '1.0', wage: 12_500_000, status: 'active' as const, signed: true,  updated: '18 Jan 2026' },
  { id: 'c4', title: 'Employment agreement',  empId: 'e4', version: '1.0', wage: 14_000_000, status: 'active' as const, signed: true,  updated: '22 Sep 2024' },
  { id: 'c5', title: 'Employment agreement',  empId: 'e5', version: '1.0', wage: 11_000_000, status: 'active' as const, signed: false, updated: '04 Feb 2026' },
  { id: 'c6', title: 'NDA — Engineering',     empId: 'e8', version: '1.0', wage: 0,          status: 'draft' as const,  signed: false, updated: '28 Apr 2026' },
]

const SPOTLIGHT = [
  { id: 'sp1', title: 'Q1 2026 town hall recap',          status: 'live' as const, priority: 'normal', views: 24, total: HEADCOUNT, posted: '3 hari yang lalu' },
  { id: 'sp2', title: 'New office opening in Bandung',    status: 'live' as const, priority: 'normal', views: 28, total: HEADCOUNT, posted: '1 minggu yang lalu' },
  { id: 'sp3', title: 'Updated leave policy — read by Friday', status: 'live' as const, priority: 'high', views: 18, total: HEADCOUNT, posted: '2 hari yang lalu' },
  { id: 'sp4', title: 'Welcome — Reza, Software Engineer', status: 'live' as const, priority: 'normal', views: HEADCOUNT, total: HEADCOUNT, posted: '2 minggu yang lalu' },
]

const PENDING = [
  { id: 'p1', empId: 'e5', sopTitle: 'Refund & dispute handling', summary: 'Add escalation flow for high-value disputes (>Rp 5M)', when: '3 jam yang lalu' },
  { id: 'p2', empId: 'e3', sopTitle: 'Cash handling — daily close', summary: 'Update denomination chart for new IDR 75K notes', when: '1 hari yang lalu' },
  { id: 'p3', empId: 'e6', sopTitle: 'Inventory reconciliation', summary: 'Clarify procedure for damaged inbound stock', when: '2 hari yang lalu' },
]

const RECENT_ACTIVITY = [
  { type: 'sop_signed',       empId: 'e5', title: 'Refund & dispute handling', when: '12m ago' },
  { type: 'contract_signed',  empId: 'e8', title: 'NDA — Engineering',         when: '2h ago' },
  { type: 'sop_updated',      empId: 'e3', title: 'Cash handling — daily close', when: '5h ago' },
  { type: 'welcome',          empId: 'e8', title: 'Reza Maulana joined',       when: '1d ago' },
  { type: 'sop_signed',       empId: 'e2', title: 'Production deploy checklist', when: '1d ago' },
  { type: 'contract_assigned',empId: 'e5', title: 'Employment agreement',      when: '2d ago' },
] as const

// ─── Helpers ────────────────────────────────────────────

function empById(id: string): DemoEmployee | undefined {
  return EMPLOYEES.find(e => e.id === id)
}

function formatIdr(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID')
}

function detailLabelFor(page: DemoPage, id: string | null): string | null {
  if (!id) return null
  if (page === 'employees') return empById(id)?.name ?? null
  if (page === 'sops')      return SOPS.find(s => s.id === id)?.title ?? null
  if (page === 'contracts') {
    const c = CONTRACTS.find(x => x.id === id)
    if (!c) return null
    const emp = empById(c.empId)
    return emp ? `${c.title} — ${emp.name}` : c.title
  }
  return null
}

// ─── Detail content (preview only) ──────────────────────

type EditorBlock =
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'p';  text: string }
  | { kind: 'ol' | 'ul'; items: string[] }

const SOP_CONTENT: Record<string, EditorBlock[]> = {
  s1: [
    { kind: 'h2', text: 'Customer onboarding playbook' },
    { kind: 'p',  text: 'How {{employee.name}} (Sales) onboards a new account from signed contract to first successful workflow.' },
    { kind: 'h3', text: 'Day 0 — Welcome' },
    { kind: 'ol', items: [
      'Send welcome email within 2 hours of contract signature.',
      'Schedule kickoff call for the following business day (WIB).',
      'Add the customer to {{organization.name}}\'s shared CRM workspace.',
    ]},
    { kind: 'h3', text: 'Day 1 — Kickoff call' },
    { kind: 'p',  text: 'Run the standard 45-minute kickoff. Confirm primary contact, escalation path, and the success metric.' },
    { kind: 'ul', items: [
      'Walk through the implementation plan',
      'Capture three measurable outcomes',
      'Hand over to the assigned CSM',
    ]},
    { kind: 'h3', text: 'Week 1 — Activation' },
    { kind: 'p',  text: 'Confirm the customer has completed at least one end-to-end workflow before {{today}} + 7.' },
  ],
  s2: [
    { kind: 'h2', text: 'Cash handling — daily close' },
    { kind: 'p',  text: 'Owner: {{employee.name}}. Time: end of every operational day, before {{organization.name}}\'s 21:00 WIB cutoff.' },
    { kind: 'h3', text: 'Steps' },
    { kind: 'ol', items: [
      'Count the float and reconcile against opening balance.',
      'Stamp and file Z-report with day\'s reference number.',
      'Photograph the safe count alongside the dated cover sheet.',
      'Upload the photo to the operations channel before clocking out.',
    ]},
    { kind: 'h3', text: 'Variance handling' },
    { kind: 'p',  text: 'Any variance over Rp 50.000 — call the on-duty manager immediately. Document in the variance log with cause and remediation.' },
  ],
  s3: [
    { kind: 'h2', text: 'Refund & dispute handling' },
    { kind: 'p',  text: 'How {{employee.name}} (CS) processes refund requests, with escalation thresholds.' },
    { kind: 'h3', text: 'Standard refund' },
    { kind: 'ol', items: [
      'Confirm the customer\'s order ID and ownership.',
      'Verify the refund window (≤ 14 days for change-of-mind).',
      'Issue refund through the original payment method.',
    ]},
    { kind: 'h3', text: 'Escalation' },
    { kind: 'p',  text: 'Disputes above Rp 5.000.000 must be escalated to the CS Lead before issuing. Tag the case in {{organization.name}} ticketing as `priority:high`.' },
  ],
  s4: [
    { kind: 'h2', text: 'New hire — week one checklist' },
    { kind: 'p',  text: 'Owner: {{employee.name}}, People & Culture. Goal: every new hire is shipping work by Friday.' },
    { kind: 'ol', items: [
      'Day 1: laptop, accounts, swag, lunch with team.',
      'Day 2: read the relevant SOPs in the portal.',
      'Day 3: shadow a senior teammate end-to-end.',
      'Day 4: pair with manager on first owned task.',
      'Day 5: deliver something small and visible.',
    ]},
  ],
  s5: [
    { kind: 'h2', text: 'Inventory reconciliation' },
    { kind: 'p',  text: 'Run weekly. Variance threshold: 0.5% of unit count or Rp 1.000.000, whichever is lower.' },
    { kind: 'ol', items: [
      'Pull the system count from the WMS.',
      'Cycle-count three high-velocity SKUs.',
      'Investigate any unit-level mismatch >2.',
      'File the reconciliation report by Friday 17:00 WIB.',
    ]},
  ],
  s6: [
    { kind: 'h2', text: 'Production deploy checklist' },
    { kind: 'p',  text: 'Owner: {{employee.name}}, Engineering. Use this checklist for every deploy that touches a customer-facing surface.' },
    { kind: 'h3', text: 'Pre-deploy' },
    { kind: 'ol', items: [
      'CI green on main and on the release branch.',
      'Migrations dry-run against staging copy.',
      'Feature flag default reviewed.',
      'Rollback plan documented in the PR description.',
    ]},
    { kind: 'h3', text: 'Deploy' },
    { kind: 'ul', items: [
      'Announce in #deploys 5 minutes before',
      'Run migrations',
      'Promote to canary; soak 10 minutes',
      'Promote to 100%; watch error rate for 30 minutes',
    ]},
  ],
}

const SOP_VERSIONS: Record<string, { v: string; when: string; author: string }[]> = {
  s1: [
    { v: '2.3', when: '2 hari yang lalu',  author: 'Sari Wijaya' },
    { v: '2.2', when: '3 minggu yang lalu', author: 'Sari Wijaya' },
    { v: '2.1', when: '2 bulan yang lalu',  author: 'Ahmad Surya' },
    { v: '2.0', when: '4 bulan yang lalu',  author: 'Sari Wijaya' },
  ],
  s2: [{ v: '1.4', when: '5 hari yang lalu', author: 'Dewi Kusuma' }, { v: '1.3', when: '1 bulan yang lalu', author: 'Dewi Kusuma' }],
  s3: [{ v: '1.2', when: '1 minggu yang lalu', author: 'Putri Lestari' }, { v: '1.1', when: '6 minggu yang lalu', author: 'Putri Lestari' }],
  s4: [{ v: '3.0', when: '2 minggu yang lalu', author: 'Maya Indrawati' }, { v: '2.4', when: '3 bulan yang lalu', author: 'Maya Indrawati' }],
  s5: [{ v: '2.0', when: '3 minggu yang lalu', author: 'Budi Santoso' }],
  s6: [{ v: '4.1', when: '1 bulan yang lalu', author: 'Rian Pratama' }, { v: '4.0', when: '3 bulan yang lalu', author: 'Rian Pratama' }],
}

const CONTRACT_CONTENT: Record<string, EditorBlock[]> = {
  c1: [
    { kind: 'h2', text: 'Employment agreement' },
    { kind: 'p',  text: 'This agreement is between {{organization.name}} (the Company) and {{employee.name}}, holder of KTP {{employee.ktp}}, residing at {{employee.address}}, effective {{contract.start_date}}.' },
    { kind: 'h3', text: '1. Position' },
    { kind: 'p',  text: 'The Employee is engaged as {{employee.position}} reporting to the Chief Executive Officer.' },
    { kind: 'h3', text: '2. Compensation' },
    { kind: 'p',  text: 'Base wage: {{contract.base_wage}} per month, paid on the 28th. Allowance: {{contract.allowance}} per month, subject to attendance.' },
    { kind: 'h3', text: '3. Working hours' },
    { kind: 'p',  text: '{{contract.hours_per_day}} hours per day, {{contract.days_per_week}} days per week, with statutory holidays observed.' },
  ],
  c2: [
    { kind: 'h2', text: 'Employment agreement' },
    { kind: 'p',  text: 'Between {{organization.name}} and {{employee.name}}, effective {{contract.start_date}}, on the terms below.' },
    { kind: 'h3', text: '1. Role' },
    { kind: 'p',  text: 'Senior Engineer, Engineering team. Reports to the CTO.' },
    { kind: 'h3', text: '2. Compensation' },
    { kind: 'p',  text: 'Base wage: {{contract.base_wage}} / month. Allowance: {{contract.allowance}} / month.' },
  ],
  c3: [
    { kind: 'h2', text: 'Employment agreement' },
    { kind: 'p',  text: '{{organization.name}} engages {{employee.name}} as Operations Lead, effective {{contract.start_date}}.' },
    { kind: 'h3', text: 'Compensation' },
    { kind: 'p',  text: '{{contract.base_wage}} base + {{contract.allowance}} allowance, paid monthly on the 28th.' },
  ],
  c4: [
    { kind: 'h2', text: 'Employment agreement' },
    { kind: 'p',  text: 'Marketing Manager engagement between {{organization.name}} and {{employee.name}}.' },
    { kind: 'p',  text: 'Base: {{contract.base_wage}}. Allowance: {{contract.allowance}}. Standard hours apply.' },
  ],
  c5: [
    { kind: 'h2', text: 'Employment agreement' },
    { kind: 'p',  text: 'CS Lead role for {{employee.name}}, effective {{contract.start_date}}.' },
    { kind: 'p',  text: 'Compensation: {{contract.base_wage}} + {{contract.allowance}} allowance.' },
  ],
  c6: [
    { kind: 'h2', text: 'Non-disclosure agreement' },
    { kind: 'p',  text: 'Between {{organization.name}} and {{employee.name}}, effective on signature.' },
    { kind: 'p',  text: 'The Recipient agrees to maintain in confidence all proprietary information of {{organization.name}}, including but not limited to source code, customer data, and unreleased product plans.' },
  ],
}

const EMPLOYEE_ACTIVITY: Record<string, { type: string; title: string; when: string }[]> = {
  e1: [
    { type: 'sop_signed',     title: 'Customer onboarding playbook v2.3', when: '2 hari lalu' },
    { type: 'reward',         title: '+200 credits — Q1 2026 contributor', when: '1 minggu lalu' },
    { type: 'achievement',    title: 'Top contributor — Q1 2026',         when: '1 minggu lalu' },
    { type: 'contract_signed',title: 'Employment agreement v1.0',         when: '1 tahun lalu' },
  ],
  e2: [
    { type: 'sop_signed',     title: 'Production deploy checklist v4.1',  when: '1 hari lalu' },
    { type: 'achievement',    title: 'Production deploy hero',            when: '2h lalu' },
    { type: 'contract_signed',title: 'Employment agreement v1.1',         when: '13 bulan lalu' },
  ],
  e3: [
    { type: 'sop_updated',    title: 'Cash handling — daily close v1.4',  when: '5 hari lalu' },
    { type: 'reward',         title: '+50 credits — clean cycle close',   when: '2 minggu lalu' },
  ],
  e4: [
    { type: 'sop_signed',     title: 'Customer onboarding playbook v2.3', when: '2 hari lalu' },
    { type: 'contract_signed',title: 'Employment agreement v1.0',         when: '7 bulan lalu' },
  ],
  e5: [
    { type: 'achievement',    title: 'Customer save of the week',         when: '5h lalu' },
    { type: 'sop_signed',     title: 'Refund & dispute handling v1.2',    when: '12m lalu' },
  ],
  e6: [
    { type: 'sop_signed',     title: 'Inventory reconciliation v2.0',     when: '3 minggu lalu' },
  ],
  e7: [
    { type: 'sop_updated',    title: 'New hire — week one checklist v3.0', when: '2 minggu lalu' },
  ],
  e8: [
    { type: 'welcome',        title: 'Reza Maulana joined the team',      when: '1d lalu' },
    { type: 'contract_signed',title: 'NDA — Engineering v1.0',            when: '2h lalu' },
  ],
}

const NAV_ITEMS: { key: DemoPage; label: string; icon: React.ReactNode }[] = [
  { key: 'overview',    label: 'Overview',    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg> },
  { key: 'employees',   label: 'Employees',   icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg> },
  { key: 'sops',        label: 'SOPs',        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /><line x1="8" y1="9" x2="10" y2="9" /></svg> },
  { key: 'contracts',   label: 'Contracts',   icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="12" y2="16" /></svg> },
  { key: 'performance', label: 'Performance', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg> },
  { key: 'spotlight',   label: 'Spotlight',   icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg> },
  { key: 'pending',     label: 'Pending',     icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg> },
  { key: 'settings',    label: 'Settings',    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg> },
]

// ─── Main demo shell ────────────────────────────────────

export function InteractiveDemo() {
  const [page, setPage] = useState<DemoPage>('overview')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)

  // Lazy-load signature fonts the first time someone opens a contract detail,
  // matching what the real app does in mergeFields/signing flows.
  useEffect(() => {
    if (page === 'contracts' && detailId) ensureSignatureFontsLoaded()
  }, [page, detailId])

  // Lock body scroll + handle ESC while in fullscreen.
  useEffect(() => {
    if (!fullscreen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [fullscreen])

  function navigate(p: DemoPage) {
    setPage(p)
    setDetailId(null)
  }

  const shellClass = fullscreen
    ? 'fixed inset-3 z-50 flex flex-col overflow-hidden rounded-2xl border text-left shadow-2xl md:inset-6'
    : 'mx-auto flex max-w-5xl flex-col overflow-hidden rounded-2xl border text-left shadow-2xl'

  const gridClass = fullscreen
    ? 'grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[180px_1fr]'
    : 'grid grid-cols-1 md:grid-cols-[180px_1fr]'

  const mainClass = fullscreen
    ? 'min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-7 md:py-7'
    : 'h-[480px] overflow-y-auto px-5 py-5 md:h-[540px] md:px-7 md:py-7'

  return (
    <>
      {fullscreen && (
        <div
          className="fixed inset-0 z-40 backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setFullscreen(false)}
          aria-hidden
        />
      )}
      <div
        className={shellClass}
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-secondary)',
        }}
      >
        {/* Browser chrome */}
        <BrowserBar
          page={page}
          detailId={detailId}
          fullscreen={fullscreen}
          onToggleFullscreen={() => setFullscreen(f => !f)}
        />

        <div className={gridClass}>
          <DemoSidebar page={page} setPage={navigate} />

          <div className="flex min-w-0 flex-col" style={{ backgroundColor: 'var(--color-bg)' }}>
            <DemoHeader page={page} detailId={detailId} onClearDetail={() => setDetailId(null)} />
            {/* Mobile-only nav pills */}
            <MobileNavPills page={page} setPage={navigate} />
            <main className={mainClass}>
              {page === 'overview'    && <OverviewView />}
              {page === 'employees'   && (detailId ? <EmployeeDetailView id={detailId} /> : <EmployeesView onOpen={setDetailId} />)}
              {page === 'sops'        && (detailId ? <SopDetailView id={detailId} /> : <SopsView onOpen={setDetailId} />)}
              {page === 'contracts'   && (detailId ? <ContractDetailView id={detailId} /> : <ContractsView onOpen={setDetailId} />)}
              {page === 'performance' && <PerformanceView />}
              {page === 'spotlight'   && <SpotlightView />}
              {page === 'pending'     && <PendingView />}
              {page === 'settings'    && <SettingsView />}
            </main>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Chrome ─────────────────────────────────────────────

function BrowserBar({ page, detailId, fullscreen, onToggleFullscreen }: {
  page: DemoPage
  detailId: string | null
  fullscreen: boolean
  onToggleFullscreen: () => void
}) {
  const url = detailId
    ? `app.flodok.com/dashboard/${page}/${detailId}/edit`
    : page === 'overview'
      ? 'app.flodok.com/dashboard'
      : `app.flodok.com/dashboard/${page}`
  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#ef4444' }} />
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#eab308' }} />
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#22c55e' }} />
      <div
        className="ml-3 hidden min-w-0 truncate rounded-md px-3 py-0.5 text-xs sm:block"
        style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text-tertiary)' }}
      >
        {url}
      </div>
      <button
        type="button"
        onClick={onToggleFullscreen}
        className="ml-auto rounded p-1 transition-colors"
        style={{ color: 'var(--color-text-tertiary)' }}
        onMouseOver={e => {
          e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)'
          e.currentTarget.style.color = 'var(--color-text)'
        }}
        onMouseOut={e => {
          e.currentTarget.style.backgroundColor = 'transparent'
          e.currentTarget.style.color = 'var(--color-text-tertiary)'
        }}
        aria-label={fullscreen ? 'Exit fullscreen' : 'View fullscreen'}
        title={fullscreen ? 'Exit fullscreen (Esc)' : 'View fullscreen'}
      >
        {fullscreen ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        )}
      </button>
    </div>
  )
}

function DemoSidebar({ page, setPage }: { page: DemoPage; setPage: (p: DemoPage) => void }) {
  return (
    <aside
      className="hidden border-r p-3 md:flex md:flex-col"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
    >
      <div className="mb-4 px-2 pt-1 text-sm font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
        Flodok
      </div>
      <nav className="flex-1 space-y-0.5">
        {NAV_ITEMS.map(item => {
          const active = page === item.key
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setPage(item.key)}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: active ? 'var(--color-bg-tertiary)' : 'transparent',
                color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
              }}
              onMouseOver={e => { if (!active) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)' }}
              onMouseOut={e => { if (!active) e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              <span style={{ color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}>{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </nav>
      <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-2 px-2 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-success)' }} />
          All systems normal
        </div>
      </div>
    </aside>
  )
}

function DemoHeader({ page, detailId, onClearDetail }: { page: DemoPage; detailId: string | null; onClearDetail: () => void }) {
  const label = NAV_ITEMS.find(i => i.key === page)?.label ?? 'Overview'
  const detailLabel = detailLabelFor(page, detailId)
  return (
    <div
      className="flex h-12 items-center justify-between border-b px-5 md:px-7"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'color-mix(in srgb, var(--color-bg) 90%, transparent)' }}
    >
      <nav className="flex min-w-0 items-center gap-2 text-xs">
        <span className="shrink-0 truncate" style={{ color: 'var(--color-text-tertiary)' }}>{ORG_NAME}</span>
        {page === 'overview' ? null : (
          <>
            <span style={{ color: 'var(--color-text-tertiary)' }}>/</span>
            {detailId ? (
              <button
                type="button"
                onClick={onClearDetail}
                className="shrink-0 truncate transition-colors hover:opacity-70"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {label}
              </button>
            ) : (
              <span className="truncate font-medium" style={{ color: 'var(--color-text)' }}>{label}</span>
            )}
          </>
        )}
        {detailId && detailLabel && (
          <>
            <span style={{ color: 'var(--color-text-tertiary)' }}>/</span>
            <span className="truncate font-medium" style={{ color: 'var(--color-text)' }}>{detailLabel}</span>
          </>
        )}
        {page === 'overview' && (
          <span className="truncate font-medium" style={{ color: 'var(--color-text)' }}>{ORG_NAME}</span>
        )}
      </nav>
      <div className="flex items-center gap-1.5">
        <span className="hidden rounded-md border px-1.5 py-0.5 text-[10px] font-semibold sm:inline" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>EN</span>
        <div
          className="h-6 w-6 rounded-full"
          style={{ background: getAvatarGradient('demo-user-sari') }}
          aria-hidden
        />
      </div>
    </div>
  )
}

function MobileNavPills({ page, setPage }: { page: DemoPage; setPage: (p: DemoPage) => void }) {
  return (
    <div
      className="flex gap-1.5 overflow-x-auto border-b px-4 py-2 md:hidden"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {NAV_ITEMS.map(item => {
        const active = page === item.key
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => setPage(item.key)}
            className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium"
            style={{
              borderColor: active ? 'var(--color-text)' : 'var(--color-border)',
              backgroundColor: active ? 'var(--color-bg-tertiary)' : 'transparent',
              color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
            }}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Shared bits ────────────────────────────────────────

function PageTitle({ children, subtitle, action }: { children: React.ReactNode; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl" style={{ color: 'var(--color-text)' }}>
          {children}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  )
}

function ActionButton({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium text-white md:text-sm"
      style={{ backgroundColor: 'var(--color-primary)' }}
    >
      {children}
    </span>
  )
}

function FilterPill({ active, count, children }: { active?: boolean; count?: number; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
      style={{
        borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
        color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
        backgroundColor: active ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent',
      }}
    >
      <span>{children}</span>
      {count !== undefined && (
        <span
          className="rounded-full px-1.5 text-[9px] font-semibold tabular-nums"
          style={{
            backgroundColor: active
              ? 'color-mix(in srgb, var(--color-primary) 16%, transparent)'
              : 'var(--color-bg-tertiary)',
            color: active ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
          }}
        >
          {count}
        </span>
      )}
    </span>
  )
}

function SearchInput({ placeholder, className = '' }: { placeholder: string; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <svg
        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className="absolute left-2.5 top-1/2 -translate-y-1/2"
        style={{ color: 'var(--color-text-tertiary)' }}
      >
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <div
        className="rounded-full border py-1 pl-7 pr-3 text-[11px]"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg)',
          color: 'var(--color-text-tertiary)',
        }}
      >
        {placeholder}
      </div>
    </div>
  )
}

function FilterButton({ count }: { count?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
      style={{
        borderColor: count ? 'var(--color-primary)' : 'var(--color-border)',
        color: count ? 'var(--color-primary)' : 'var(--color-text-secondary)',
        backgroundColor: count ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent',
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </svg>
      Filter
      {count ? (
        <span
          className="rounded-full px-1.5 text-[9px] font-semibold tabular-nums"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 16%, transparent)', color: 'var(--color-primary)' }}
        >
          {count}
        </span>
      ) : null}
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </span>
  )
}

function ListPageFilterBar({
  pills, searchPlaceholder, filterCount,
}: {
  pills: { label: string; count: number; active: boolean }[]
  searchPlaceholder: string
  filterCount?: number
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {pills.map(p => (
        <FilterPill key={p.label} active={p.active} count={p.count}>{p.label}</FilterPill>
      ))}
      <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
        <div className="flex-1 sm:w-56 sm:flex-none">
          <SearchInput placeholder={searchPlaceholder} />
        </div>
        <FilterButton count={filterCount} />
      </div>
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border p-4 ${className}`}
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
    >
      {children}
    </div>
  )
}

function Avatar({ id, name, size = 28 }: { id: string; name: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
      style={{
        width: size,
        height: size,
        background: getAvatarGradient(id),
        color: 'var(--color-text)',
      }}
    >
      {getInitials(name)}
    </div>
  )
}

function StatusPill({ kind, children }: { kind: 'success' | 'neutral' | 'warning' | 'info'; children: React.ReactNode }) {
  const styles: Record<string, React.CSSProperties> = {
    success: { backgroundColor: 'var(--color-diff-add)',   color: 'var(--color-success)' },
    neutral: { backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' },
    warning: { backgroundColor: 'color-mix(in srgb, var(--color-warning) 15%, transparent)', color: 'var(--color-warning)' },
    info:    { backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', color: 'var(--color-primary)' },
  }
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={styles[kind]}>
      {children}
    </span>
  )
}

// ─── Overview ───────────────────────────────────────────

function OverviewView() {
  const stats = [
    { label: 'Employees',           value: HEADCOUNT },
    { label: 'Active SOPs',         value: SOPS.filter(s => s.status === 'active').length },
    { label: 'Active contracts',    value: CONTRACTS.filter(c => c.status === 'active').length },
    { label: 'Awaiting signature',  value: 1 },
    { label: 'Pending updates',     value: PENDING.length },
  ]

  return (
    <div className="space-y-5">
      <PageTitle>Overview</PageTitle>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        {['Add employee', 'New SOP', 'New contract'].map(label => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text)' }}
          >
            <span style={{ color: 'var(--color-text-secondary)' }}>+</span>
            {label}
          </span>
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stats.map(s => (
          <div
            key={s.label}
            className="rounded-xl border p-3.5"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
          >
            <div className="truncate text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>{s.label}</div>
            <div className="mt-0.5 text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Activity + coverage */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <div className="mb-3 flex items-baseline justify-between">
              <div>
                <div className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>Activity pulse</div>
                <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>Last 30 days</div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                <Legend color="#3b82f6" label="SOPs" />
                <Legend color="#10b981" label="Signatures" />
                <Legend color="#f59e0b" label="People" />
                <Legend color="#8b5cf6" label="Contracts" />
              </div>
            </div>
            <ActivityChart />
          </Card>
        </div>

        <Card>
          <div className="mb-2">
            <div className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>Signature coverage</div>
            <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>Active SOPs & contracts</div>
          </div>
          <CoverageGauge percent={87} signed={13} total={15} />
        </Card>
      </div>

      {/* Recognition + compensation */}
      <div className="grid gap-4 lg:grid-cols-2">
        <RecognitionMoments />
        <CompensationTotal />
      </div>

      {/* Recent activity + team comp */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <div className="mb-3 text-xs font-semibold" style={{ color: 'var(--color-text)' }}>Recent activity</div>
            <ul>
              {RECENT_ACTIVITY.map((evt, i) => {
                const emp = empById(evt.empId)
                if (!emp) return null
                const visual = activityVisual(evt.type)
                const isLast = i === RECENT_ACTIVITY.length - 1
                return (
                  <li key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `color-mix(in srgb, ${visual.color} 15%, transparent)`, color: visual.color }}
                      >
                        {visual.icon}
                      </div>
                      {!isLast && <div className="min-h-3 w-px flex-1" style={{ backgroundColor: 'var(--color-border)' }} />}
                    </div>
                    <div className="min-w-0 flex-1 pb-3 pt-0.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="min-w-0 text-xs" style={{ color: 'var(--color-text)' }}>
                          <span className="font-medium">{emp.name}</span>{' '}
                          <span style={{ color: 'var(--color-text-secondary)' }}>{activityLabel(evt.type)}</span>
                        </div>
                        <span className="shrink-0 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{evt.when}</span>
                      </div>
                      <div className="truncate text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{evt.title}</div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        </div>

        <Card>
          <div className="mb-3">
            <div className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>Team composition</div>
            <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>By department</div>
          </div>
          <DeptDonut />
        </Card>
      </div>
    </div>
  )
}

type RecognitionTab = 'today' | '7d' | '30d'

const RECOGNITION_DATA: Record<RecognitionTab, { empId: string; badge: string; glyph: string; tone: string; when: string }[]> = {
  today: [
    { empId: 'e2', badge: 'Production deploy hero',  glyph: '🚀', tone: '#bfdbfe', when: '2h ago' },
    { empId: 'e5', badge: 'Customer save of the week', glyph: '💎', tone: '#fbcfe8', when: '5h ago' },
    { empId: 'e1', badge: 'Top contributor — Q1 2026', glyph: '★',  tone: '#fde68a', when: '8h ago' },
  ],
  '7d': [
    { empId: 'e8', badge: 'First SOP sign-off',      glyph: '✓', tone: '#bbf7d0', when: 'Tomorrow' },
    { empId: 'e3', badge: '1 year anniversary',      glyph: '🎉', tone: '#fde68a', when: 'in 3 days' },
    { empId: 'e6', badge: '6 month milestone',       glyph: '◆', tone: '#bfdbfe', when: 'in 5 days' },
  ],
  '30d': [
    { empId: 'e4', badge: '2 year anniversary',      glyph: '🎉', tone: '#fde68a', when: 'in 12 days' },
    { empId: 'e7', badge: '1 year anniversary',      glyph: '🎉', tone: '#fde68a', when: 'in 18 days' },
    { empId: 'e2', badge: '3 year anniversary',      glyph: '🏆', tone: '#fbcfe8', when: 'in 24 days' },
  ],
}

function RecognitionMoments() {
  const [tab, setTab] = useState<RecognitionTab>('today')
  const tabs: { key: RecognitionTab; label: string; count: number }[] = [
    { key: 'today', label: 'Today',         count: RECOGNITION_DATA.today.length },
    { key: '7d',    label: 'Upcoming 7d',   count: RECOGNITION_DATA['7d'].length },
    { key: '30d',   label: 'Upcoming 30d',  count: RECOGNITION_DATA['30d'].length },
  ]
  const items = RECOGNITION_DATA[tab]

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>Recognition moments</div>
        <div className="flex flex-wrap gap-1">
          {tabs.map(p => {
            const active = tab === p.key
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setTab(p.key)}
                className="rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors"
                style={{
                  borderColor: active ? 'var(--color-text)' : 'var(--color-border)',
                  backgroundColor: active ? 'var(--color-bg-tertiary)' : 'transparent',
                  color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
                }}
              >
                {p.label}
                {p.count > 0 && <span className="ml-1 opacity-70">{p.count}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <ul className="space-y-2">
        {items.map((item, i) => {
          const emp = empById(item.empId)
          if (!emp) return null
          return (
            <li key={i} className="flex items-center gap-2.5">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
                style={{ backgroundColor: item.tone, color: '#374151' }}
                aria-hidden
              >
                {item.glyph}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium" style={{ color: 'var(--color-text)' }}>{emp.name}</p>
                <p className="truncate text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{item.badge}</p>
              </div>
              <span className="shrink-0 text-[10px]" style={{ color: tab === 'today' ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)' }}>
                {item.when}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function CompensationTotal() {
  const eligible = EMPLOYEES.filter(e => e.status === 'active')
  const wages = eligible.reduce((s, e) => s + e.baseWage, 0)
  const allowances = eligible.reduce((s, e) => s + e.allowance, 0)
  const total = wages + allowances
  const wagesPct = (wages / total) * 100
  const allowancesPct = (allowances / total) * 100

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>Compensation total</div>
        <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
          {eligible.length} active contracts
        </span>
      </div>

      <div className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
        {formatIdr(total)}
      </div>
      <p className="mb-3 mt-0.5 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
        Monthly base wage + allowance, across active contracts
      </p>

      <div
        className="mb-3 flex h-2 overflow-hidden rounded-full"
        style={{ backgroundColor: 'var(--color-border)' }}
      >
        <div style={{ width: `${wagesPct}%`,      backgroundColor: 'var(--color-primary)' }} />
        <div style={{ width: `${allowancesPct}%`, backgroundColor: '#10b981' }} />
      </div>

      <ul className="space-y-1.5 text-[11px]">
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
            Base wages
          </span>
          <span style={{ color: 'var(--color-text)' }}>{formatIdr(wages)}</span>
        </li>
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#10b981' }} />
            Allowances
          </span>
          <span style={{ color: 'var(--color-text)' }}>{formatIdr(allowances)}</span>
        </li>
      </ul>
    </Card>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

function ActivityChart() {
  // Hand-tuned 30-day stacked bars
  const heights = [
    { sop: 1, sig: 0, ppl: 0, ctr: 0 },
    { sop: 0, sig: 1, ppl: 0, ctr: 0 },
    { sop: 2, sig: 1, ppl: 0, ctr: 1 },
    { sop: 0, sig: 0, ppl: 0, ctr: 0 },
    { sop: 1, sig: 2, ppl: 0, ctr: 0 },
    { sop: 1, sig: 1, ppl: 1, ctr: 0 },
    { sop: 0, sig: 0, ppl: 0, ctr: 0 },
    { sop: 2, sig: 3, ppl: 0, ctr: 1 },
    { sop: 1, sig: 2, ppl: 0, ctr: 0 },
    { sop: 0, sig: 1, ppl: 1, ctr: 0 },
    { sop: 3, sig: 2, ppl: 0, ctr: 0 },
    { sop: 1, sig: 1, ppl: 0, ctr: 1 },
    { sop: 0, sig: 0, ppl: 0, ctr: 0 },
    { sop: 2, sig: 4, ppl: 1, ctr: 0 },
    { sop: 1, sig: 2, ppl: 0, ctr: 1 },
    { sop: 0, sig: 1, ppl: 0, ctr: 0 },
    { sop: 3, sig: 3, ppl: 0, ctr: 0 },
    { sop: 1, sig: 0, ppl: 0, ctr: 1 },
    { sop: 0, sig: 1, ppl: 1, ctr: 0 },
    { sop: 2, sig: 2, ppl: 0, ctr: 0 },
    { sop: 1, sig: 1, ppl: 0, ctr: 0 },
    { sop: 0, sig: 0, ppl: 0, ctr: 0 },
    { sop: 1, sig: 3, ppl: 0, ctr: 1 },
    { sop: 2, sig: 2, ppl: 1, ctr: 0 },
    { sop: 1, sig: 1, ppl: 0, ctr: 0 },
    { sop: 3, sig: 4, ppl: 0, ctr: 1 },
    { sop: 1, sig: 2, ppl: 0, ctr: 0 },
    { sop: 2, sig: 3, ppl: 1, ctr: 0 },
    { sop: 1, sig: 5, ppl: 0, ctr: 1 },
    { sop: 2, sig: 3, ppl: 0, ctr: 0 },
  ]
  const max = Math.max(...heights.map(h => h.sop + h.sig + h.ppl + h.ctr))
  return (
    <div className="flex h-32 items-end gap-[3px]">
      {heights.map((h, i) => {
        const total = h.sop + h.sig + h.ppl + h.ctr
        const pct = (n: number) => (max === 0 ? 0 : (n / max) * 100)
        return (
          <div key={i} className="flex flex-1 flex-col-reverse" style={{ height: `${pct(total)}%`, minHeight: total > 0 ? 2 : 0 }}>
            {h.sop > 0 && <div style={{ height: `${(h.sop / total) * 100}%`, backgroundColor: '#3b82f6' }} />}
            {h.sig > 0 && <div style={{ height: `${(h.sig / total) * 100}%`, backgroundColor: '#10b981' }} />}
            {h.ppl > 0 && <div style={{ height: `${(h.ppl / total) * 100}%`, backgroundColor: '#f59e0b' }} />}
            {h.ctr > 0 && <div style={{ height: `${(h.ctr / total) * 100}%`, backgroundColor: '#8b5cf6' }} />}
          </div>
        )
      })}
    </div>
  )
}

function CoverageGauge({ percent, signed, total }: { percent: number; signed: number; total: number }) {
  const size = 110
  const stroke = 10
  const r = (size - stroke) / 2
  const c = size / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - percent / 100)
  const color = percent >= 90 ? '#10b981' : percent >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <div>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--color-bg-tertiary)" strokeWidth={stroke} />
          <circle
            cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
            transform={`rotate(-90 ${c} ${c})`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{percent}%</span>
          <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{signed} / {total}</span>
        </div>
      </div>
      <ul className="mt-3 w-full space-y-1 text-[11px]">
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#3b82f6' }} /> SOPs
          </span>
          <span style={{ color: 'var(--color-text)' }}>9 / 10</span>
        </li>
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#8b5cf6' }} /> Contracts
          </span>
          <span style={{ color: 'var(--color-text)' }}>4 / 5</span>
        </li>
      </ul>
    </div>
  )
}

function DeptDonut() {
  const slices = [
    { name: 'Operations',       value: 3, color: '#3b82f6' },
    { name: 'Engineering',      value: 2, color: '#8b5cf6' },
    { name: 'Customer Success', value: 1, color: '#06b6d4' },
    { name: 'Marketing',        value: 1, color: '#10b981' },
    { name: 'People',           value: 1, color: '#f59e0b' },
    { name: 'Leadership',       value: 1, color: '#ec4899' },
  ]
  const total = slices.reduce((a, b) => a + b.value, 0)
  const size = 110
  const stroke = 14
  const r = (size - stroke) / 2
  const c = size / 2
  const circumference = 2 * Math.PI * r

  let acc = 0
  return (
    <div>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--color-bg-tertiary)" strokeWidth={stroke} />
          {slices.map((s, i) => {
            const len = (s.value / total) * circumference
            const dash = `${len} ${circumference - len}`
            const dashOffset = -acc
            acc += len
            return (
              <circle
                key={i}
                cx={c} cy={c} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
                strokeDasharray={dash} strokeDashoffset={dashOffset}
                transform={`rotate(-90 ${c} ${c})`}
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{HEADCOUNT}</span>
          <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Total</span>
        </div>
      </div>
      <ul className="mt-3 w-full space-y-1 text-[11px]">
        {slices.map(s => (
          <li key={s.name} className="flex items-center justify-between">
            <span className="flex min-w-0 items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="truncate">{s.name}</span>
            </span>
            <span style={{ color: 'var(--color-text)' }}>{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function activityVisual(type: string): { color: string; icon: React.ReactNode } {
  switch (type) {
    case 'sop_signed':
    case 'contract_signed':
      return { color: '#10b981', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> }
    case 'sop_updated':
      return { color: '#3b82f6', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg> }
    case 'contract_assigned':
      return { color: '#8b5cf6', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /></svg> }
    case 'welcome':
      return { color: '#f59e0b', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg> }
    default:
      return { color: '#6b7280', icon: null }
  }
}

function activityLabel(type: string): string {
  switch (type) {
    case 'sop_signed':       return 'signed an SOP'
    case 'contract_signed':  return 'signed a contract'
    case 'sop_updated':      return 'updated an SOP'
    case 'contract_assigned':return 'was assigned a contract'
    case 'welcome':          return 'joined the team'
    default: return type
  }
}

// ─── Employees ──────────────────────────────────────────

function EmployeesView({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <div>
      <PageTitle action={<ActionButton>Add employee</ActionButton>}>Employees</PageTitle>

      <ListPageFilterBar
        pills={[
          { label: 'All', count: HEADCOUNT, active: true },
          { label: 'Active', count: EMPLOYEES.filter(e => e.status === 'active').length, active: false },
          { label: 'Trial', count: EMPLOYEES.filter(e => e.status === 'trial').length, active: false },
        ]}
        searchPlaceholder="Search employees…"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {EMPLOYEES.map(emp => (
          <button
            key={emp.id}
            type="button"
            onClick={() => onOpen(emp.id)}
            className="rounded-xl border p-4 text-left transition-all"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
            onMouseOver={e => {
              e.currentTarget.style.borderColor = 'var(--color-border-strong)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseOut={e => {
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.transform = 'none'
            }}
          >
            <div className="flex items-center gap-3">
              <Avatar id={emp.id} name={emp.name} size={56} />
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap gap-1">
                  {emp.departments.slice(0, 2).map(d => (
                    <span
                      key={d}
                      className="inline-flex rounded-full px-2 py-0.5 text-[9px] font-medium"
                      style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
                    >
                      {d}
                    </span>
                  ))}
                </div>
                <div className="truncate text-xs font-semibold" style={{ color: 'var(--color-text)' }}>{emp.name}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                  <span className="truncate">{emp.phone}</span>
                  <CopyGlyph />
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  <span className="truncate">flodok.com/portal/{emp.name.toLowerCase().split(' ')[0]}-…</span>
                  <CopyGlyph />
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function CopyGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

// ─── SOPs ───────────────────────────────────────────────

function SopsView({ onOpen }: { onOpen: (id: string) => void }) {
  const activeCount  = SOPS.filter(s => s.status === 'active').length
  const draftCount   = SOPS.filter(s => s.status === 'draft').length
  return (
    <div>
      <PageTitle action={<ActionButton>New SOP</ActionButton>}>SOPs</PageTitle>

      <ListPageFilterBar
        pills={[
          { label: 'All',      count: SOPS.length,  active: true },
          { label: 'Active',   count: activeCount,  active: false },
          { label: 'Draft',    count: draftCount,   active: false },
          { label: 'Archived', count: 0,            active: false },
        ]}
        searchPlaceholder="Search SOPs…"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SOPS.map(sop => {
          const emp = empById(sop.empId)
          return <DocCard
            key={sop.id}
            onClick={() => onOpen(sop.id)}
            title={sop.title}
            depts={[sop.dept]}
            empName={emp?.name}
            status={sop.status}
            version={sop.version}
            updated={sop.updated}
          />
        })}
      </div>
    </div>
  )
}

// ─── Contracts ──────────────────────────────────────────

function ContractsView({ onOpen }: { onOpen: (id: string) => void }) {
  const activeCount = CONTRACTS.filter(c => c.status === 'active').length
  const draftCount  = CONTRACTS.filter(c => c.status === 'draft').length
  return (
    <div>
      <PageTitle action={<ActionButton>New contract</ActionButton>}>Contracts</PageTitle>

      <ListPageFilterBar
        pills={[
          { label: 'All',      count: CONTRACTS.length, active: true },
          { label: 'Active',   count: activeCount,      active: false },
          { label: 'Draft',    count: draftCount,       active: false },
          { label: 'Archived', count: 0,                active: false },
        ]}
        searchPlaceholder="Search contracts…"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {CONTRACTS.map(c => {
          const emp = empById(c.empId)
          return <DocCard
            key={c.id}
            onClick={() => onOpen(c.id)}
            title={c.title}
            depts={emp?.departments.slice(0, 2) ?? []}
            empName={emp?.name}
            status={c.status}
            version={c.version}
            updated={c.updated}
            extra={c.wage > 0 ? formatIdr(c.wage) + ' / mo' : undefined}
          />
        })}
      </div>
    </div>
  )
}

function DocCard({
  title, depts, empName, status, version, updated, extra, onClick,
}: {
  title: string
  depts: string[]
  empName?: string
  status: 'active' | 'draft'
  version: string
  updated: string
  extra?: string
  onClick: () => void
}) {
  const statusColor =
    status === 'active' ? 'var(--color-success)' :
    'var(--color-text-tertiary)'
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative rounded-xl border p-4 text-left transition-all"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
      onMouseOver={e => {
        e.currentTarget.style.borderColor = 'var(--color-border-strong)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseOut={e => {
        e.currentTarget.style.borderColor = 'var(--color-border)'
        e.currentTarget.style.transform = 'none'
      }}
    >
      {depts.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {depts.map(d => (
            <span
              key={d}
              className="inline-flex rounded-full px-2 py-0.5 text-[9px] font-medium"
              style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
            >
              {d}
            </span>
          ))}
        </div>
      )}
      <h3 className="text-xs font-semibold leading-snug" style={{ color: 'var(--color-text)' }}>{title}</h3>
      {empName && (
        <p className="mt-1 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{empName}</p>
      )}
      {extra && (
        <p className="mt-0.5 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{extra}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
        <span className="inline-flex items-center gap-1" style={{ color: statusColor }}>
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
          {status === 'active' ? 'Live' : 'Draft'}
        </span>
        <span>·</span>
        <span>v{version}</span>
        <span>·</span>
        <span>{updated}</span>
      </div>
    </button>
  )
}

// ─── Performance ────────────────────────────────────────

function PerformanceView() {
  const [tab, setTab] = useState<'credits' | 'achievements'>('credits')
  const sorted = [...EMPLOYEES].sort((a, b) => b.credits - a.credits)

  return (
    <div className="max-w-2xl">
      <PageTitle subtitle="Award credits and achievements that pay out as monthly allowance.">
        Performance
      </PageTitle>

      {/* Segmented toggle */}
      <div className="mb-3 flex rounded-lg p-0.5" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
        {(['credits', 'achievements'] as const).map(k => {
          const active = tab === k
          return (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors"
              style={{
                backgroundColor: active ? 'var(--color-bg)' : 'transparent',
                color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {k}
            </button>
          )
        })}
      </div>

      <div className="mb-4">
        <SearchInput placeholder="Search team members…" />
      </div>

      <ul className="space-y-2">
        {sorted.map(row => (
          <li
            key={row.id}
            className="rounded-xl border p-3"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center gap-3">
              <Avatar id={row.id} name={row.name} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium" style={{ color: 'var(--color-text)' }}>{row.name}</p>
                <p className="truncate text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {row.departments[0] || '—'}
                  {tab === 'credits' && (
                    <>
                      {' · '}
                      <span style={{ color: 'var(--color-success)' }}>+{row.credits} cr this month</span>
                    </>
                  )}
                  {tab === 'achievements' && row.badgeCount > 0 && ` · ${row.badgeCount} badges`}
                </p>
                {tab === 'achievements' && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Array.from({ length: Math.min(row.badgeCount, 5) }).map((_, i) => (
                      <span
                        key={i}
                        className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px]"
                        style={{ backgroundColor: ['#fde68a', '#fbcfe8', '#bfdbfe', '#bbf7d0', '#ddd6fe'][i % 5], color: '#374151' }}
                      >
                        {['★', '◆', '✦', '●', '▲'][i % 5]}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {tab === 'credits' ? (
                  <>
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-md text-white"
                      style={{ backgroundColor: 'var(--color-success)' }}
                      aria-label="Award credits"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </span>
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-md border"
                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-danger)' }}
                      aria-label="Deduct credits"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </span>
                  </>
                ) : (
                  <span
                    className="flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium text-white"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    🏅 Award
                  </span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Spotlight ──────────────────────────────────────────

const SPOTLIGHT_BLURBS: Record<string, string> = {
  sp1: "Recap of our quarterly all-hands. We hit revenue targets, opened Bandung, and shipped the new portal. Click in for the deck.",
  sp2: "We're opening a second office in Bandung next month. Three roles open already; perks and onboarding details inside.",
  sp3: "Updated leave policy effective next month. Annual leave bumps from 12 → 14 days. Please acknowledge by Friday.",
  sp4: "Reza joins us this week as Software Engineer. Coffee chat slots open in Calendly — say hi!",
}

function SpotlightView() {
  return (
    <div>
      <PageTitle subtitle="Announcements your team sees in their portal." action={<ActionButton>New post</ActionButton>}>
        Spotlight
      </PageTitle>

      <ListPageFilterBar
        pills={[
          { label: 'All',         count: SPOTLIGHT.length, active: true },
          { label: 'Drafts',      count: 0, active: false },
          { label: 'Scheduled',   count: 0, active: false },
          { label: 'Published',   count: SPOTLIGHT.length, active: false },
          { label: 'Archived',    count: 0, active: false },
        ]}
        searchPlaceholder="Search posts…"
      />

      <div className="space-y-3">
        {SPOTLIGHT.map(post => (
          <div
            key={post.id}
            className="rounded-xl border p-4"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  {post.priority === 'high' ? (
                    <StatusPill kind="warning">High priority</StatusPill>
                  ) : (
                    <StatusPill kind="neutral">Normal</StatusPill>
                  )}
                  <StatusPill kind="info">Published</StatusPill>
                </div>
                <h3 className="truncate text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{post.title}</h3>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  {SPOTLIGHT_BLURBS[post.id]}
                </p>
                <p className="mt-2 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  Published {post.posted}
                </p>
              </div>
              <div className="flex shrink-0 items-start gap-2">
                <span className="whitespace-nowrap pt-1 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {post.views} / {post.total} read
                </span>
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-md border"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}
                  aria-label="Republish"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="17 1 21 5 17 9" />
                    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                    <polyline points="7 23 3 19 7 15" />
                    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                  </svg>
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Pending ────────────────────────────────────────────

function PendingView() {
  const [expandedId, setExpandedId] = useState<string | null>('p1')
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl" style={{ color: 'var(--color-text)' }}>
          Pending updates
        </h1>
        <span
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text)' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          Check for updates
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span
          className="rounded-md border px-2.5 py-1 text-[11px]"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
        >
          All employees
        </span>
        <span
          className="rounded-md border px-2.5 py-1 text-[11px]"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
        >
          Newest first
        </span>
        <span className="ml-auto text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{PENDING.length} items</span>
      </div>

      <div className="space-y-3">
        {PENDING.map(p => {
          const emp = empById(p.empId)
          const isExpanded = expandedId === p.id
          return (
            <div
              key={p.id}
              className="rounded-xl border"
              style={{ borderColor: isExpanded ? 'var(--color-primary)' : 'var(--color-border)' }}
            >
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : p.id)}
                className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left"
              >
                <div className="flex min-w-0 items-start gap-3">
                  {emp && <Avatar id={emp.id} name={emp.name} size={32} />}
                  <div className="min-w-0">
                    <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                      {emp?.name}'s SOP
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      <span>{p.when}</span>
                      <span style={{ color: 'var(--color-border)' }}>|</span>
                      <span>WhatsApp transcript</span>
                    </div>
                    {!isExpanded && (
                      <div className="mt-1 line-clamp-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        {p.summary}
                      </div>
                    )}
                  </div>
                </div>
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className="mt-1 shrink-0 transition-transform"
                  style={{
                    color: 'var(--color-text-tertiary)',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {isExpanded && (
                <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="mb-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{p.summary}</div>
                  <div
                    className="mb-3 rounded-lg border p-3 font-mono text-[11px] leading-relaxed"
                    style={{
                      borderColor: 'var(--color-border)',
                      backgroundColor: 'var(--color-bg)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    <span style={{ backgroundColor: 'var(--color-diff-add)', color: 'var(--color-success)' }}>
                      + {p.sopTitle}: {p.summary.toLowerCase()}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-white"
                      style={{ backgroundColor: 'var(--color-success)' }}
                    >
                      Approve
                    </span>
                    <span
                      className="rounded-lg px-3 py-1.5 text-xs font-medium"
                      style={{ color: 'var(--color-danger)' }}
                    >
                      Reject
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Settings ───────────────────────────────────────────

function SettingsView() {
  const [tab, setTab] = useState<'account' | 'organization' | 'team' | 'integrations' | 'billing'>('organization')

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'account', label: 'Account' },
    { key: 'organization', label: 'Organization' },
    { key: 'team', label: 'Team' },
    { key: 'integrations', label: 'Integrations' },
    { key: 'billing', label: 'Billing' },
  ]

  return (
    <div>
      <h1 className="mb-5 text-xl font-semibold tracking-tight md:text-2xl" style={{ color: 'var(--color-text)' }}>
        Settings
      </h1>

      <div className="mb-5 flex gap-1 overflow-x-auto border-b" style={{ borderColor: 'var(--color-border)' }}>
        {tabs.map(t => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="relative shrink-0 px-3 py-2 text-xs font-medium transition-colors"
              style={{ color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}
            >
              {t.label}
              {active && (
                <span className="absolute -bottom-px left-0 right-0 h-0.5" style={{ backgroundColor: 'var(--color-primary)' }} />
              )}
            </button>
          )
        })}
      </div>

      {tab === 'organization' && <OrgSettingsPanel />}
      {tab === 'account' && <AccountSettingsPanel />}
      {tab === 'team' && <TeamSettingsPanel />}
      {tab === 'integrations' && <IntegrationsPanel />}
      {tab === 'billing' && <BillingPanel />}
    </div>
  )
}

function SettingRow({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-3 last:border-b-0" style={{ borderColor: 'var(--color-border)' }}>
      <div>
        <div className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>{label}</div>
        {hint && <div className="mt-0.5 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{hint}</div>}
      </div>
      <div className="text-right text-xs" style={{ color: 'var(--color-text-secondary)' }}>{value}</div>
    </div>
  )
}

function OrgSettingsPanel() {
  return (
    <Card>
      <div className="mb-3">
        <div className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>Organization</div>
        <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>How your company shows up across Flodok.</div>
      </div>
      <SettingRow label="Display name" value="Acme Indonesia" />
      <SettingRow label="Time zone" value="Asia/Jakarta · WIB" />
      <SettingRow label="Default language" value="Bahasa · English" />
      <SettingRow label="Pay period" value="Closes 25th · pays 28th" hint="Used for credit & allowance payouts." />
      <SettingRow label="Public portal" value="flodok.com/portal/acme" />
    </Card>
  )
}

function AccountSettingsPanel() {
  return (
    <Card>
      <div className="mb-3">
        <div className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>Your account</div>
      </div>
      <div className="mb-4 flex items-center gap-3">
        <Avatar id="demo-user-sari" name="Sari Wijaya" size={48} />
        <div>
          <div className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>Sari Wijaya</div>
          <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>sari@acme.id · Owner</div>
        </div>
      </div>
      <SettingRow label="Phone" value="+62 812-3456-7890" />
      <SettingRow label="Two-factor auth" value={<StatusPill kind="success">Enabled</StatusPill>} />
      <SettingRow label="Sessions" value="2 active devices" />
    </Card>
  )
}

function TeamSettingsPanel() {
  const admins = EMPLOYEES.slice(0, 3)
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>Team admins</div>
          <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>People who can edit SOPs, contracts, and settings.</div>
        </div>
        <ActionButton>Invite</ActionButton>
      </div>
      <ul className="space-y-2">
        {admins.map((emp, i) => (
          <li key={emp.id} className="flex items-center gap-3">
            <Avatar id={emp.id} name={emp.name} size={28} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium" style={{ color: 'var(--color-text)' }}>{emp.name}</div>
              <div className="truncate text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{emp.email}</div>
            </div>
            <StatusPill kind={i === 0 ? 'info' : 'neutral'}>{i === 0 ? 'Owner' : 'Admin'}</StatusPill>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function IntegrationsPanel() {
  const integrations = [
    { name: 'Fireflies',    desc: 'Pull meeting transcripts into SOP suggestions', connected: true },
    { name: 'Slack',        desc: 'Post Spotlight announcements to channels',      connected: true },
    { name: 'Asana',        desc: 'Mirror SOP tasks as Asana projects',            connected: false },
    { name: 'Mekari Talenta', desc: 'Sync employees & payroll',                    connected: false },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {integrations.map(i => (
        <div
          key={i.name}
          className="rounded-xl border p-4"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>{i.name}</div>
            {i.connected ? <StatusPill kind="success">Connected</StatusPill> : <StatusPill kind="neutral">Not connected</StatusPill>}
          </div>
          <div className="text-[10px] leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>{i.desc}</div>
        </div>
      ))}
    </div>
  )
}

function BillingPanel() {
  return (
    <Card>
      <div className="mb-3">
        <div className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>Plan</div>
      </div>
      <div className="mb-4 flex items-end justify-between rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
        <div>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Current plan</div>
          <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>Pro · monthly</div>
          <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>Up to 50 employees · {HEADCOUNT} used</div>
        </div>
        <div className="text-right">
          <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>{formatIdr(290_000)}</div>
          <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>per month</div>
        </div>
      </div>
      <SettingRow label="Next invoice"   value="28 Apr 2026" />
      <SettingRow label="Payment method" value="VISA •••• 4242" />
      <SettingRow label="Billing email"  value="finance@acme.id" />
    </Card>
  )
}

// ─── Detail views (preview only) ────────────────────────

function EditorRender({ blocks }: { blocks: EditorBlock[] }) {
  return (
    <div
      className="rounded-lg border p-5"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
    >
      <div className="space-y-3">
        {blocks.map((b, i) => {
          if (b.kind === 'h2') return <h2 key={i} className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>{renderTokens(b.text)}</h2>
          if (b.kind === 'h3') return <h3 key={i} className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{renderTokens(b.text)}</h3>
          if (b.kind === 'p')  return <p key={i} className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{renderTokens(b.text)}</p>
          if (b.kind === 'ol') return (
            <ol key={i} className="ml-4 list-decimal space-y-1 text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              {b.items.map((it, j) => <li key={j}>{renderTokens(it)}</li>)}
            </ol>
          )
          return (
            <ul key={i} className="ml-4 list-disc space-y-1 text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              {b.items.map((it, j) => <li key={j}>{renderTokens(it)}</li>)}
            </ul>
          )
        })}
      </div>
    </div>
  )
}

// Highlights {{merge.field}} tokens inside text the way the real editor does.
function renderTokens(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const re = /\{\{([^}]+)\}\}/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push(
      <span
        key={key++}
        className="rounded px-1 py-0.5 font-mono text-[10px]"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
          color: 'var(--color-primary)',
        }}
      >
        {match[1]}
      </span>,
    )
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function DetailHeader({
  title, status, version, signed, actions,
}: {
  title: string
  status: 'active' | 'draft'
  version?: string
  signed?: boolean
  actions: React.ReactNode
}) {
  const statusKind: 'success' | 'neutral' | 'warning' =
    signed ? 'success' :
    status === 'draft' ? 'neutral' :
    'warning'
  const statusLabel =
    signed ? 'Signed' :
    status === 'draft' ? 'Draft' :
    'Active'
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold tracking-tight md:text-xl" style={{ color: 'var(--color-text)' }}>
          {title}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
          <StatusPill kind={statusKind}>{statusLabel}</StatusPill>
          {version && <span>v{version}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </div>
  )
}

function GhostButton({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
    >
      {children}
    </span>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
      {children}
    </label>
  )
}

function FauxField({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
    >
      {children}
    </div>
  )
}

// ─── SOP detail ─────────────────────────────────────────

function SopDetailView({ id }: { id: string }) {
  const sop = SOPS.find(s => s.id === id)
  if (!sop) return null
  const emp = empById(sop.empId)
  const content = SOP_CONTENT[id] ?? []
  const versions = SOP_VERSIONS[id] ?? []

  return (
    <div>
      <DetailHeader
        title={sop.title}
        status={sop.status}
        version={sop.version}
        actions={<>
          <GhostButton>History</GhostButton>
          <GhostButton>Cancel</GhostButton>
          <ActionButton>Save</ActionButton>
        </>}
      />

      {/* Metadata row */}
      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <div>
          <FieldLabel>Title</FieldLabel>
          <FauxField>{sop.title}</FauxField>
        </div>
        <div>
          <FieldLabel>Assigned employee</FieldLabel>
          <FauxField>
            {emp ? (
              <span className="flex items-center gap-2">
                <Avatar id={emp.id} name={emp.name} size={18} />
                <span className="truncate">{emp.name}</span>
                <span className="ml-auto shrink-0 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{emp.departments[0]}</span>
              </span>
            ) : '—'}
          </FauxField>
        </div>
        <div>
          <FieldLabel>Tags</FieldLabel>
          <FauxField>
            <span className="flex flex-wrap gap-1">
              <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>{sop.dept}</span>
              <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>onboarding</span>
            </span>
          </FauxField>
        </div>
      </div>

      {/* Content + sidebar */}
      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <div>
          {/* Language tabs */}
          <div className="mb-2 flex items-center gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <span className="-mb-px border-b-2 px-3 py-1.5 text-[11px] font-medium" style={{ borderColor: 'var(--color-primary)', color: 'var(--color-text)' }}>English</span>
            <span className="px-3 py-1.5 text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>Bahasa Indonesia</span>
            <span className="ml-auto text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>auto-translate</span>
          </div>
          <EditorRender blocks={content} />
          <div
            className="mt-3 rounded-lg border-l-2 p-3 text-[11px]"
            style={{ borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)' }}
          >
            <span className="font-medium" style={{ color: 'var(--color-text)' }}>✨ AI assist —</span>{' '}
            tell Flodok what changed and it'll suggest an edit.
          </div>
        </div>

        {/* Right sidebar — version history */}
        <aside className="space-y-3">
          <Card>
            <div className="mb-2 text-[11px] font-semibold" style={{ color: 'var(--color-text)' }}>Version history</div>
            <ul className="space-y-2">
              {versions.map((v, i) => (
                <li key={i} className="flex items-baseline justify-between gap-2 text-[10px]">
                  <span className="font-mono" style={{ color: i === 0 ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>v{v.v}</span>
                  <span className="text-right" style={{ color: 'var(--color-text-tertiary)' }}>
                    {v.author}<br />{v.when}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <div className="mb-2 text-[11px] font-semibold" style={{ color: 'var(--color-text)' }}>Signatures</div>
            {emp ? (
              <div className="flex items-center gap-2">
                <Avatar id={emp.id} name={emp.name} size={20} />
                <div className="min-w-0 text-[10px]">
                  <div className="truncate font-medium" style={{ color: 'var(--color-text)' }}>{emp.name}</div>
                  <div style={{ color: 'var(--color-success)' }}>Signed v{sop.version}</div>
                </div>
              </div>
            ) : (
              <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>No signatures yet</div>
            )}
          </Card>
        </aside>
      </div>
    </div>
  )
}

// ─── Contract detail ────────────────────────────────────

const SIGNATURE_FONT_OPTIONS: { name: string; label: string }[] = [
  { name: 'Dancing Script', label: 'Classic' },
  { name: 'Great Vibes',    label: 'Elegant' },
  { name: 'Caveat',         label: 'Casual' },
  { name: 'Homemade Apple', label: 'Handwritten' },
]

function ContractDetailView({ id }: { id: string }) {
  const contract = CONTRACTS.find(c => c.id === id)
  if (!contract) return null
  const emp = empById(contract.empId)
  const content = CONTRACT_CONTENT[id] ?? []

  return (
    <div>
      <DetailHeader
        title={contract.title}
        status={contract.status}
        version={contract.version}
        signed={contract.signed}
        actions={<>
          <GhostButton>History</GhostButton>
          <GhostButton>Save draft</GhostButton>
          <ActionButton>{contract.signed ? 'View signature' : 'Activate & sign'}</ActionButton>
        </>}
      />

      {/* Metadata row */}
      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <div>
          <FieldLabel>Title</FieldLabel>
          <FauxField>{contract.title}</FauxField>
        </div>
        <div>
          <FieldLabel>Employee</FieldLabel>
          <FauxField>
            {emp ? (
              <span className="flex items-center gap-2">
                <Avatar id={emp.id} name={emp.name} size={18} />
                <span className="truncate">{emp.name}</span>
              </span>
            ) : '—'}
          </FauxField>
        </div>
        <div>
          <FieldLabel>Tags</FieldLabel>
          <FauxField>
            <span className="flex flex-wrap gap-1">
              {emp?.departments.slice(0, 2).map(d => (
                <span key={d} className="rounded-full px-2 py-0.5 text-[10px]" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>{d}</span>
              ))}
            </span>
          </FauxField>
        </div>
      </div>

      {/* Employment terms */}
      <div className="mb-5">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Employment terms</div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <FieldLabel>Start date</FieldLabel>
            <FauxField>{contract.updated}</FauxField>
          </div>
          <div>
            <FieldLabel>End date</FieldLabel>
            <FauxField><span style={{ color: 'var(--color-text-tertiary)' }}>Open-ended (PKWTT)</span></FauxField>
          </div>
          <div>
            <FieldLabel>Base wage / month</FieldLabel>
            <FauxField>{contract.wage > 0 ? formatIdr(contract.wage) : '—'}</FauxField>
          </div>
          <div>
            <FieldLabel>Allowance / month</FieldLabel>
            <FauxField>{emp ? formatIdr(emp.allowance) : '—'}</FauxField>
          </div>
          <div>
            <FieldLabel>Hours / day</FieldLabel>
            <FauxField>8</FauxField>
          </div>
          <div>
            <FieldLabel>Days / week</FieldLabel>
            <FauxField>5</FauxField>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mb-5">
        <div className="mb-2 flex items-center gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <span className="-mb-px border-b-2 px-3 py-1.5 text-[11px] font-medium" style={{ borderColor: 'var(--color-primary)', color: 'var(--color-text)' }}>English</span>
          <span className="px-3 py-1.5 text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>Bahasa Indonesia</span>
        </div>
        <EditorRender blocks={content} />
      </div>

      {/* Signature block */}
      <div
        className="rounded-xl border p-4"
        style={{ borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-bg-secondary)' }}
      >
        <div className="mb-3 text-[11px] font-semibold" style={{ color: 'var(--color-text)' }}>
          {contract.signed ? 'Signature' : 'Choose signature font'}
        </div>
        {contract.signed && emp ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <div
                className="text-2xl leading-none"
                style={{ fontFamily: '"Caveat", cursive', color: 'var(--color-text)' }}
              >
                {emp.name}
              </div>
              <div className="mt-1.5 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                Signed by {emp.name} · {contract.updated}
              </div>
            </div>
            <StatusPill kind="success">Verified</StatusPill>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {SIGNATURE_FONT_OPTIONS.map((f, i) => (
              <div
                key={f.name}
                className="rounded-lg border p-2.5"
                style={{
                  borderColor: i === 0 ? 'var(--color-primary)' : 'var(--color-border)',
                  backgroundColor: 'var(--color-bg)',
                }}
              >
                <div
                  className="truncate text-lg leading-none"
                  style={{ fontFamily: `"${f.name}", cursive`, color: 'var(--color-text)' }}
                >
                  {emp?.name ?? 'Your name'}
                </div>
                <div className="mt-1.5 text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>{f.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Employee detail ────────────────────────────────────

function EmployeeDetailView({ id }: { id: string }) {
  const emp = empById(id)
  const [tab, setTab] = useState<'profile' | 'documents' | 'compensation' | 'achievements'>('profile')
  if (!emp) return null
  const activity = EMPLOYEE_ACTIVITY[id] ?? []
  const empSops = SOPS.filter(s => s.empId === id)
  const empContracts = CONTRACTS.filter(c => c.empId === id)

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar id={emp.id} name={emp.name} size={48} />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight md:text-xl" style={{ color: 'var(--color-text)' }}>
              {emp.name}
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              <StatusPill kind={emp.status === 'active' ? 'success' : 'info'}>{emp.status === 'active' ? 'Active' : 'Trial'}</StatusPill>
              <span>{emp.role}</span>
              <span>·</span>
              <span>Joined {emp.joined}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <GhostButton>Duplicate</GhostButton>
          <GhostButton>Cancel</GhostButton>
          <ActionButton>Save</ActionButton>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 overflow-x-auto border-b" style={{ borderColor: 'var(--color-border)' }}>
        {(['profile', 'documents', 'compensation', 'achievements'] as const).map(t => {
          const active = tab === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="relative shrink-0 px-3 py-2 text-xs font-medium capitalize transition-colors"
              style={{ color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}
            >
              {t}
              {active && (
                <span className="absolute -bottom-px left-0 right-0 h-0.5" style={{ backgroundColor: 'var(--color-primary)' }} />
              )}
            </button>
          )
        })}
      </div>

      {tab === 'profile' && (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <FieldLabel>Full name</FieldLabel>
            <FauxField>{emp.name}</FauxField>
          </div>
          <div>
            <FieldLabel>Phone (WhatsApp)</FieldLabel>
            <FauxField>{emp.phone}</FauxField>
          </div>
          <div>
            <FieldLabel>Email</FieldLabel>
            <FauxField>{emp.email}</FauxField>
          </div>
          <div>
            <FieldLabel>Departments</FieldLabel>
            <FauxField>
              <span className="flex flex-wrap gap-1">
                {emp.departments.map(d => (
                  <span key={d} className="rounded-full px-2 py-0.5 text-[10px]" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>{d}</span>
                ))}
              </span>
            </FauxField>
          </div>
          <div className="md:col-span-2">
            <FieldLabel>Employee portal link</FieldLabel>
            <FauxField>
              <span className="flex items-center gap-2">
                <span className="truncate" style={{ color: 'var(--color-text-secondary)' }}>
                  flodok.com/portal/{emp.name.toLowerCase().split(' ')[0]}-{emp.id}-{Math.abs(emp.id.charCodeAt(0) * 7919).toString(36)}
                </span>
                <CopyGlyph />
              </span>
            </FauxField>
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <FieldLabel>KTP NIK</FieldLabel>
            <FauxField>3201{Math.abs(emp.id.charCodeAt(0) * 9301).toString().slice(0, 12)}</FauxField>
          </div>
          <div>
            <FieldLabel>Date of birth</FieldLabel>
            <FauxField>14 Mar 1992</FauxField>
          </div>
          <div className="md:col-span-2">
            <FieldLabel>Address</FieldLabel>
            <FauxField>Jl. Sudirman No. 42, RT 03/RW 05, Menteng, Jakarta Pusat 10310</FauxField>
          </div>
          <div>
            <FieldLabel>KTP photo</FieldLabel>
            <div className="flex h-20 items-center justify-center rounded-lg border border-dashed text-[10px]" style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text-tertiary)' }}>
              Upload KTP photo
            </div>
          </div>
          <div>
            <FieldLabel>Family card (KK)</FieldLabel>
            <div className="flex h-20 items-center justify-center rounded-lg border border-dashed text-[10px]" style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text-tertiary)' }}>
              Upload KK photo
            </div>
          </div>
        </div>
      )}

      {tab === 'compensation' && (
        <div className="space-y-4">
          <Card>
            <div className="mb-3 text-[11px] font-semibold" style={{ color: 'var(--color-text)' }}>Active contract</div>
            {empContracts.filter(c => c.status === 'active')[0] ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Base wage</div>
                  <div className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{formatIdr(emp.baseWage)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Allowance</div>
                  <div className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{formatIdr(emp.allowance)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Total / month</div>
                  <div className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{formatIdr(emp.baseWage + emp.allowance)}</div>
                </div>
              </div>
            ) : (
              <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>No active contract</div>
            )}
          </Card>

          <Card>
            <div className="mb-3 flex items-baseline justify-between">
              <div className="text-[11px] font-semibold" style={{ color: 'var(--color-text)' }}>Credits this period</div>
              <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>April 2026</div>
            </div>
            <div className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
              +{emp.credits} <span className="text-xs font-normal" style={{ color: 'var(--color-text-tertiary)' }}>cr</span>
            </div>
            <div className="mt-1 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              ≈ {formatIdr(Math.round((emp.credits / 1000) * emp.allowance / 1000) * 1000)} added to allowance payout
            </div>
          </Card>

          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Recent activity</div>
            <ul className="space-y-2">
              {activity.map((evt, i) => (
                <li key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
                  <span className="flex-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>{evt.title}</span>
                  <span className="shrink-0 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{evt.when}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'achievements' && (
        <div className="space-y-3">
          <Card>
            <div className="mb-3 flex items-baseline justify-between">
              <div className="text-[11px] font-semibold" style={{ color: 'var(--color-text)' }}>Earned</div>
              <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{emp.badgeCount} total</div>
            </div>
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
              {Array.from({ length: emp.badgeCount }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-base"
                    style={{
                      backgroundColor: ['#fde68a', '#fbcfe8', '#bfdbfe', '#bbf7d0', '#ddd6fe'][i % 5],
                      color: '#374151',
                    }}
                  >
                    {['★', '◆', '✦', '●', '▲', '■', '♥', '☀'][i % 8]}
                  </span>
                  <span className="truncate text-[9px] text-center" style={{ color: 'var(--color-text-tertiary)' }}>
                    {['Onboarder', 'Reliable', 'Trailblazer', 'Top of class', 'Mentor', 'Streak 30', 'Helper', 'Celebrant'][i % 8]}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {empSops.length > 0 && (
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Assigned SOPs</div>
              <ul className="space-y-1.5">
                {empSops.map(s => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-[11px]"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                  >
                    <span style={{ color: 'var(--color-text)' }}>{s.title}</span>
                    <StatusPill kind={s.status === 'active' ? 'success' : 'neutral'}>{s.status === 'active' ? `Live · v${s.version}` : 'Draft'}</StatusPill>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
