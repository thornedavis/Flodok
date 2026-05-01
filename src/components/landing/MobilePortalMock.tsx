import { useState } from 'react'
import { getAvatarGradient, getInitials } from '../../lib/avatar'

// ─── Types & demo data ──────────────────────────────────

type MobileTab = 'home' | 'documents' | 'spotlight' | 'badges' | 'leaderboard'

const PORTAL_USER = {
  id: 'dewi-kusuma',
  name: 'Dewi Kusuma',
  firstName: 'Dewi',
  role: 'Operations Lead',
  org: 'Acme Indonesia',
  baseWage: 12_500_000,
  allowance: 1_800_000,
  credits: 870,
  bonus: 500_000,
  badgeCount: 6,
}

// IDR conversion via the same divisor model the real portal uses
const CREDITS_DIVISOR = 1_000
const CREDITS_IDR = Math.round((PORTAL_USER.credits * PORTAL_USER.allowance) / CREDITS_DIVISOR)
const TOTAL_IDR = PORTAL_USER.baseWage + PORTAL_USER.allowance + CREDITS_IDR + PORTAL_USER.bonus

const DOCS_PENDING = [
  { id: 'd1', kind: 'sop' as const, title: 'Cash handling — daily close', meta: 'v1.4 · 5 hari lalu' },
]

const DOCS_ARCHIVE = [
  { id: 'd2', kind: 'contract' as const, title: 'Employment agreement',         meta: 'v1.0 · ditandatangani 18 Jan' },
  { id: 'd3', kind: 'sop' as const,      title: 'Inventory reconciliation',     meta: 'v2.0 · 3 minggu lalu' },
  { id: 'd4', kind: 'sop' as const,      title: 'New hire — week one checklist', meta: 'v3.0 · 2 minggu lalu' },
  { id: 'd5', kind: 'sop' as const,      title: 'Refund & dispute handling',    meta: 'v1.2 · 1 minggu lalu' },
]

const SPOTLIGHT_POSTS = [
  { id: 'sp1', title: 'Q1 2026 town hall recap',          blurb: 'Hit our revenue target. New office in Bandung. Read the full deck inside.', priority: 'normal' as const, posted: '3d', read: true  },
  { id: 'sp2', title: 'Updated leave policy — by Friday', blurb: 'Annual leave now 14 days. Please acknowledge before Friday.',                priority: 'high'   as const, posted: '2d', read: false },
  { id: 'sp3', title: 'New office opening in Bandung',    blurb: "We're opening a second office next month. Three roles open already.",       priority: 'normal' as const, posted: '1w', read: true  },
]

const BADGES = [
  { name: 'Onboarder',     icon: '★', earned: true,  color: '#fde68a' },
  { name: 'Reliable',      icon: '◆', earned: true,  color: '#bfdbfe' },
  { name: 'Trailblazer',   icon: '✦', earned: true,  color: '#fbcfe8' },
  { name: '6-month',       icon: '●', earned: true,  color: '#bbf7d0' },
  { name: 'Mentor',        icon: '▲', earned: true,  color: '#ddd6fe' },
  { name: 'Hero week',     icon: '♥', earned: true,  color: '#fecaca' },
  { name: '1-year',        icon: '🎉', earned: false, color: '#e5e7eb' },
  { name: 'Streak 30',     icon: '☀', earned: false, color: '#e5e7eb' },
  { name: 'Top of class',  icon: '♛', earned: false, color: '#e5e7eb' },
]

const LEADERBOARD = [
  { rank: 1, id: 'e1', name: 'Sari Wijaya',    credits: 1240 },
  { rank: 2, id: 'e2', name: 'Rian Pratama',   credits: 980 },
  { rank: 3, id: 'dewi-kusuma', name: 'Dewi Kusuma', credits: 870, you: true },
  { rank: 4, id: 'e4', name: 'Ahmad Surya',    credits: 720 },
  { rank: 5, id: 'e5', name: 'Putri Lestari',  credits: 640 },
  { rank: 6, id: 'e6', name: 'Budi Santoso',   credits: 520 },
  { rank: 7, id: 'e7', name: 'Maya Indrawati', credits: 480 },
]

const RECENT = [
  { type: 'sop_signed',     title: 'Inventory reconciliation v2.0', when: '3 hari lalu', color: '#10b981' },
  { type: 'achievement',    title: '6-month milestone unlocked',     when: '1 minggu lalu', color: '#f59e0b' },
  { type: 'reward',         title: '+50 credits — clean cycle close', when: '2 minggu lalu', color: '#3b82f6' },
]

// ─── Helpers ────────────────────────────────────────────

function formatIdr(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID')
}

function formatCompactIdr(n: number): string {
  if (n >= 1_000_000) return 'Rp ' + (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000)     return 'Rp ' + Math.round(n / 1_000) + 'K'
  return 'Rp ' + n
}

// ─── Main component ─────────────────────────────────────

export function MobilePortalMock({ className = '' }: { className?: string }) {
  const [tab, setTab] = useState<MobileTab>('home')

  return (
    <div className={className} style={{ width: 280 }}>
      <PhoneFrame>
        <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--color-bg)' }}>
          {/* Top header bar (org + lang/theme toggles, mock) */}
          <PortalHeader />

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
            {tab === 'home'        && <HomeTab />}
            {tab === 'documents'   && <DocumentsTab />}
            {tab === 'spotlight'   && <SpotlightTab />}
            {tab === 'badges'      && <BadgesTab />}
            {tab === 'leaderboard' && <LeaderboardTab />}
          </div>

          {/* Bottom tab bar */}
          <BottomNav tab={tab} setTab={setTab} />
        </div>
      </PhoneFrame>
    </div>
  )
}

// ─── Phone chrome ───────────────────────────────────────

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="phone-bezel phone-bezel-edge relative rounded-[44px] p-[6px]">
      <div
        className="relative overflow-hidden rounded-[38px]"
        style={{ height: 568, backgroundColor: 'var(--color-bg)' }}
      >
        {/* Status bar */}
        <div
          className="absolute inset-x-0 top-0 z-20 flex h-7 items-center justify-between px-6 text-[10px] font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          <span>9:41</span>
          <div className="flex items-center gap-1" aria-hidden>
            {/* Cell signal */}
            <svg width="12" height="9" viewBox="0 0 14 10" fill="currentColor">
              <rect x="0"  y="6" width="2" height="4" rx="0.5" />
              <rect x="3"  y="4" width="2" height="6" rx="0.5" />
              <rect x="6"  y="2" width="2" height="8" rx="0.5" />
              <rect x="9"  y="0" width="2" height="10" rx="0.5" />
            </svg>
            {/* Wifi */}
            <svg width="12" height="9" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 4 C 4 1, 10 1, 13 4" />
              <path d="M3 6 C 5 4.5, 9 4.5, 11 6" />
              <circle cx="7" cy="8.5" r="0.8" fill="currentColor" />
            </svg>
            {/* Battery */}
            <svg width="20" height="10" viewBox="0 0 22 11" fill="none">
              <rect x="0.5" y="0.5" width="19" height="10" rx="2.5" stroke="currentColor" strokeOpacity="0.6" />
              <rect x="20.5" y="3.5" width="1.2" height="4" rx="0.5" fill="currentColor" fillOpacity="0.6" />
              <rect x="2" y="2" width="14" height="7" rx="1.5" fill="currentColor" />
            </svg>
          </div>
        </div>

        {/* Dynamic Island — sits inside the status bar, centred */}
        <div
          aria-hidden
          className="absolute left-1/2 top-1.5 z-30 h-[22px] w-[88px] -translate-x-1/2 rounded-full"
          style={{ backgroundColor: '#000' }}
        />

        {/* Content area — fills below the status bar */}
        <div className="absolute inset-x-0 bottom-0 top-7 z-10">
          {children}
        </div>
      </div>
    </div>
  )
}

function PortalHeader() {
  return (
    <div
      className="flex items-center justify-between border-b px-4 py-2"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'color-mix(in srgb, var(--color-bg) 80%, transparent)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="min-w-0">
        <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{PORTAL_USER.org}</div>
        <div className="truncate text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
          Hi, {PORTAL_USER.firstName} 👋
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="rounded-md border px-1.5 py-0.5 text-[9px] font-semibold" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>EN</span>
        <div className="relative">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-secondary)' }}>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--color-danger)' }} />
        </div>
      </div>
    </div>
  )
}

// ─── Bottom nav ─────────────────────────────────────────

const NAV_ITEMS: { key: MobileTab; label: string; icon: React.ReactNode }[] = [
  { key: 'home',        label: 'Home',     icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { key: 'documents',   label: 'Docs',     icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg> },
  { key: 'spotlight',   label: 'News',     icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg> },
  { key: 'badges',      label: 'Badges',   icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/></svg> },
  { key: 'leaderboard', label: 'Ranking',  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg> },
]

function BottomNav({ tab, setTab }: { tab: MobileTab; setTab: (t: MobileTab) => void }) {
  return (
    <nav
      className="border-t"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
    >
      <div className="flex">
        {NAV_ITEMS.map(item => {
          const active = tab === item.key
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className="relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[9px] font-medium transition-colors"
              style={{ color: active ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }}
            >
              {active && (
                <div className="absolute top-0 h-0.5 w-7 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
              )}
              {item.icon}
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>
      {/* Home indicator */}
      <div className="flex justify-center pb-1.5 pt-1">
        <div className="h-[3px] w-20 rounded-full" style={{ backgroundColor: 'var(--color-text)' , opacity: 0.4 }} />
      </div>
    </nav>
  )
}

// ─── Home tab ───────────────────────────────────────────

function HomeTab() {
  return (
    <div className="space-y-4 px-4 py-4">
      {/* Month strip */}
      <div className="flex items-center justify-between gap-1">
        <button type="button" className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }} aria-label="Previous month">‹</button>
        {['Feb', 'Mar', 'Apr', 'May'].map((m, i) => {
          const active = i === 3
          return (
            <span
              key={m}
              className="flex-1 rounded-md px-1 py-1 text-center text-[10px] font-medium"
              style={{
                backgroundColor: active ? 'var(--color-bg-tertiary)' : 'transparent',
                color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              }}
            >
              {m}
            </span>
          )
        })}
        <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>›</span>
      </div>

      {/* Compensation ring */}
      <CompensationRing />

      {/* Wallet card */}
      <div
        className="rounded-2xl p-3"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
        }}
      >
        <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>This month</div>
        <div className="mt-0.5 text-lg font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>{formatIdr(TOTAL_IDR)}</div>
        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--color-border)' }}>
          <div style={{ width: '76%', backgroundColor: 'var(--color-text-secondary)' }} />
          <div style={{ width: '11%', backgroundColor: '#10b981' }} />
          <div style={{ width: '10%', backgroundColor: '#3b82f6' }} />
          <div style={{ width:  '3%', backgroundColor: '#a855f7' }} />
        </div>
      </div>

      {/* Stat rows */}
      <div className="space-y-2">
        <StatRow color="var(--color-text-secondary)" label="Base wage"  value={formatIdr(PORTAL_USER.baseWage)} />
        <StatRow color="#10b981"                    label="Allowance"  value={formatIdr(PORTAL_USER.allowance)} />
        <StatRow color="#3b82f6"                    label="Credits"    value={`+${PORTAL_USER.credits} cr`} sub={`≈ ${formatCompactIdr(CREDITS_IDR)}`} />
        <StatRow color="#a855f7"                    label="Bonus"      value={formatIdr(PORTAL_USER.bonus)} />
      </div>

      {/* Recent activity */}
      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>Activity</div>
        <ul className="space-y-2">
          {RECENT.map((evt, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: evt.color }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[10px] font-medium" style={{ color: 'var(--color-text)' }}>{evt.title}</div>
                <div className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>{evt.when}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function StatRow({ color, label, value, sub }: { color: string; label: string; value: string | number; sub?: string }) {
  return (
    <div
      className="flex items-center justify-between rounded-xl border px-3 py-2"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      </div>
      <div className="text-right">
        <div className="text-[11px] font-semibold" style={{ color: 'var(--color-text)' }}>{value}</div>
        {sub && <div className="text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>{sub}</div>}
      </div>
    </div>
  )
}

function CompensationRing() {
  const size = 160
  const stroke = 14
  const r = (size - stroke) / 2
  const c = size / 2
  const circumference = 2 * Math.PI * r

  // Approximate proportions for the visual — exact IDR ratios feel cluttered
  // at this size, so we tune for legibility.
  const segments = [
    { value: 0.62, color: 'var(--color-text-secondary)' },  // base wage
    { value: 0.13, color: '#10b981' },                       // allowance
    { value: 0.18, color: '#3b82f6' },                       // credits
    { value: 0.07, color: '#a855f7' },                       // bonus
  ]

  let acc = 0
  const gap = 0.012 * circumference // small gaps between arcs

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--color-bg-tertiary)" strokeWidth={stroke} />
        {segments.map((s, i) => {
          const len = Math.max(s.value * circumference - gap, 0)
          const dash = `${len} ${circumference - len}`
          const offset = -acc
          acc += s.value * circumference
          return (
            <circle
              key={i}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={dash}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${c} ${c})`}
            />
          )
        })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="h-[110px] w-[110px] overflow-hidden rounded-full"
          style={{ background: getAvatarGradient(PORTAL_USER.id) }}
          aria-hidden
        />
      </div>
    </div>
  )
}

// ─── Documents tab ──────────────────────────────────────

function DocumentsTab() {
  return (
    <div className="px-4 py-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>Documents</h2>
        <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{DOCS_PENDING.length + DOCS_ARCHIVE.length} total</span>
      </div>

      {DOCS_PENDING.length > 0 && (
        <>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-warning)' }}>
            Action needed
          </div>
          <div className="mb-4 space-y-2">
            {DOCS_PENDING.map(d => <DocCard key={d.id} doc={d} pending />)}
          </div>
        </>
      )}

      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-tertiary)' }}>
        Archive
      </div>
      <div className="space-y-2">
        {DOCS_ARCHIVE.map(d => <DocCard key={d.id} doc={d} pending={false} />)}
      </div>
    </div>
  )
}

function DocCard({ doc, pending }: { doc: { id: string; kind: 'sop' | 'contract'; title: string; meta: string }; pending: boolean }) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border p-2.5"
      style={{
        borderColor: pending ? 'var(--color-warning)' : 'var(--color-border)',
        backgroundColor: pending ? 'color-mix(in srgb, var(--color-warning) 8%, transparent)' : 'var(--color-bg-secondary)',
      }}
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
      >
        {doc.kind === 'sop' ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-secondary)' }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-secondary)' }}>
            <rect x="4" y="3" width="16" height="18" rx="2" />
            <line x1="8" y1="8" x2="16" y2="8" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium" style={{ color: 'var(--color-text)' }}>{doc.title}</div>
        <div className="truncate text-[9px]" style={{ color: pending ? 'var(--color-warning)' : 'var(--color-text-tertiary)' }}>
          {pending ? 'Tap to sign' : doc.meta}
        </div>
      </div>
      {!pending && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-success)' }}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
  )
}

// ─── Spotlight tab ──────────────────────────────────────

function SpotlightTab() {
  return (
    <div className="px-4 py-4">
      <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--color-text)' }}>Announcements</h2>
      <div className="space-y-2.5">
        {SPOTLIGHT_POSTS.map(post => (
          <div
            key={post.id}
            className="rounded-xl border p-3"
            style={{
              borderColor: post.priority === 'high' && !post.read ? 'var(--color-warning)' : 'var(--color-border)',
              backgroundColor: 'var(--color-bg-secondary)',
            }}
          >
            <div className="mb-1 flex items-center gap-1.5">
              {post.priority === 'high' && (
                <span className="rounded-full px-1.5 py-0.5 text-[9px] font-medium" style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 15%, transparent)', color: 'var(--color-warning)' }}>
                  High
                </span>
              )}
              {!post.read && (
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
              )}
              <span className="ml-auto text-[9px]" style={{ color: 'var(--color-text-tertiary)' }}>{post.posted}</span>
            </div>
            <div className="text-[11px] font-semibold leading-snug" style={{ color: 'var(--color-text)' }}>{post.title}</div>
            <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{post.blurb}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Badges tab ─────────────────────────────────────────

function BadgesTab() {
  const earned = BADGES.filter(b => b.earned).length
  return (
    <div className="px-4 py-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>Badges</h2>
        <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{earned} / {BADGES.length}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {BADGES.map(b => (
          <div
            key={b.name}
            className="flex flex-col items-center gap-1 rounded-xl border p-2"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg-secondary)',
              opacity: b.earned ? 1 : 0.45,
            }}
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full text-base"
              style={{
                backgroundColor: b.color,
                color: '#1a1a1a',
                filter: b.earned ? 'none' : 'grayscale(0.8)',
              }}
            >
              {b.icon}
            </span>
            <span className="truncate text-center text-[9px] font-medium" style={{ color: b.earned ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}>
              {b.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Leaderboard tab ────────────────────────────────────

function LeaderboardTab() {
  return (
    <div className="px-4 py-4">
      <div className="mb-3">
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>Ranking</h2>
        <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>By credits this month</div>
      </div>
      <ul className="space-y-1.5">
        {LEADERBOARD.map(row => {
          const you = row.you === true
          const podium = row.rank <= 3
          return (
            <li
              key={row.id}
              className="flex items-center gap-2.5 rounded-xl border px-2.5 py-1.5"
              style={{
                borderColor: you ? 'var(--color-primary)' : 'var(--color-border)',
                backgroundColor: you ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'var(--color-bg-secondary)',
              }}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                style={{
                  backgroundColor: podium ? ['#fde68a', '#e5e7eb', '#fed7aa'][row.rank - 1] : 'var(--color-bg-tertiary)',
                  color: podium ? '#1a1a1a' : 'var(--color-text-secondary)',
                }}
              >
                {row.rank}
              </span>
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold"
                style={{ background: getAvatarGradient(row.id), color: '#1a1a1a' }}
              >
                {getInitials(row.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-medium" style={{ color: 'var(--color-text)' }}>
                  {row.name}{you && <span className="ml-1 text-[9px]" style={{ color: 'var(--color-primary)' }}>(you)</span>}
                </div>
              </div>
              <div className="shrink-0 text-[10px] font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>
                {row.credits}
                <span className="ml-0.5 text-[8px] font-normal" style={{ color: 'var(--color-text-tertiary)' }}>cr</span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
