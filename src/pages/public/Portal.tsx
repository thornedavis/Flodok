import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useSpotlight, SpotlightTab, SpotlightBanner, SpotlightModal } from '../../components/SpotlightPortal'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import html2pdf from 'html2pdf.js'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../hooks/useTheme'
import { useLang } from '../../contexts/LanguageContext'
import { primaryDept } from '../../lib/employee'
import { formatIdr, allowanceGradientColor } from '../../lib/credits'
import { formatRelativeTime } from '../../lib/relativeTime'
import { BadgeGlyph } from '../../components/BadgeGlyph'
import { renderMergeFields } from '../../lib/mergeFields'
import { CompensationRing, ShieldPath, WalletPath, CoinPath, GiftPath } from '../../components/portal/CompensationRing'
import { StatRow } from '../../components/portal/StatRow'
import { InfoTooltip } from '../../components/InfoTooltip'
import { AvatarWithBadge } from '../../components/portal/AvatarWithBadge'
import { MonthStrip } from '../../components/portal/MonthStrip'
import type { Employee, Sop, SopSignature, SopVersion, Organization, Contract, ContractSignature, ContractVersion, FeedEvent } from '../../types/aliases'

type AchievementSummary = {
  unlock_id: string
  unlocked_at: string
  reason: string | null
  name: string
  icon: string | null
  description: string | null
  is_featured: boolean
}

type PortalHomeData = {
  employee: { id: string; name: string; photo_url: string | null; department: string | null; departments: string[]; created_at: string }
  org: { id: string; name: string; logo_url: string | null; credits_divisor: number }
  contract: { base_wage_idr: number | null; allowance_idr: number | null; hours_per_day: number | null; days_per_week: number | null } | null
  period_month: string
  is_current_period?: boolean
  days_employed: number
  hours_per_week: number
  lifetime_xp: number
  credit_adjustments: Array<{ id: string; amount: number; reason: string; created_at: string; paid_out_at: string | null; payout_idr: number | null }>
  credit_net: number
  credit_frozen: boolean
  bonus_adjustments: Array<{ id: string; amount_idr: number; reason: string; created_at: string; paid_out_at: string | null; payout_idr: number | null }>
  bonus_sum: number
  achievements: AchievementSummary[]
}

type PortalDocumentsData = {
  org: Organization | null
  sops: Sop[]
  contracts: Contract[]
}

type PortalDocumentsRpc = (fn: 'portal_documents', args: { emp_slug: string; emp_token: string }) => Promise<{
  data: PortalDocumentsData | null
  error: { message: string } | null
}>

// Returns the first day of the current month in Asia/Jakarta TZ as YYYY-MM-01.
// Mirrors the SQL `current_period_month()` so client and server agree on which
// month is "current" regardless of the user's local timezone.
function currentJakartaMonth(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
  })
  const parts = fmt.formatToParts(new Date())
  const year = parts.find(p => p.type === 'year')?.value ?? '1970'
  const month = parts.find(p => p.type === 'month')?.value ?? '01'
  return `${year}-${month}-01`
}

function monthFromIsoDate(iso: string): string {
  return iso.slice(0, 7) + '-01'
}

type Tab = 'home' | 'documents' | 'spotlight' | 'leaderboard' | 'badges'
type DocFilter = 'all' | 'sops' | 'contracts'
type OpenDocType = 'sop' | 'contract' | null

type BadgeData = {
  definition_id: string
  name: string
  description: string | null
  icon: string | null
  is_featured: boolean
  trigger_type: string
  trigger_rule: Record<string, unknown> | null
  unlocked: boolean
  unlock_count: number
  unlock_id: string | null
  unlocked_at: string | null
  reason: string | null
}

type BadgeGroup = 'tenure' | 'compensation' | 'leaderboard' | 'manual'

function classifyBadge(b: BadgeData): { group: BadgeGroup; sortKey: number } {
  if (b.trigger_type === 'manual') return { group: 'manual', sortKey: 0 }
  const rule = b.trigger_rule || {}
  const ruleType = rule.type as string | undefined
  if (ruleType === 'tenure_calendar') {
    const unit = (rule.unit as string) || 'day'
    const amount = (rule.amount as number) || 0
    const unitRank = unit === 'day' ? 0 : unit === 'month' ? 1 : 2
    return { group: 'tenure', sortKey: unitRank * 1000 + amount }
  }
  if (ruleType === 'first_event') return { group: 'compensation', sortKey: 0 }
  if (ruleType === 'leaderboard_rank') {
    const maxRank = (rule.max_rank as number) || 0
    const consecutive = (rule.consecutive_periods as number) || 1
    return { group: 'leaderboard', sortKey: -maxRank * 100 + consecutive }
  }
  return { group: 'manual', sortKey: 999 }
}

const BADGE_GROUP_ORDER: BadgeGroup[] = ['tenure', 'compensation', 'leaderboard', 'manual']

type LeaderboardData = {
  period_kind: 'month' | 'quarter' | 'all-time'
  period_label: string
  viewer_employee_id: string
  org: { id: string; name: string; credits_divisor: number }
  rows: Array<{
    employee_id: string
    name: string
    photo_url: string | null
    departments: string[]
    net_credits: number
    achievements_count: number
    top_achievements: Array<{ name: string; icon: string | null; unlocked_at: string; is_featured?: boolean }>
  }>
}

import { SIGNATURE_FONTS, ensureSignatureFontsLoaded } from '../../lib/signatureFonts'

ensureSignatureFontsLoaded()

// ─── Icons (inline SVGs) ─────────────────────────────────
function HomeIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
}

function SpotlightIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
}

function BellIcon({ count }: { count: number }) {
  return (
    <div className="relative">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
          {count}
        </span>
      )}
    </div>
  )
}

function SunIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
}

function MoonIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
}

function DocIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
}

function ContractIcon() {
  // File shape mirroring DocIcon (so it stays in the "document" family) but
  // with a wavy signature line inside instead of horizontal text lines.
  // Reads as "signed document" → contract. Same outline as SOPs icon for
  // visual continuity, distinct content for separation.
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M7 16q2-3 4 0t4 0"/></svg>
}

function ActivityIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
}

function TrophyIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
}

function BadgeIcon() {
  // Lucide "badge-check" — wavy hexagonal seal with a checkmark, reads as
  // "earned credential" and is visually distinct from the shield (base wage)
  // and trophy (leaderboard).
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/></svg>
}

function MoreIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
}

function CheckCircle() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-success)' }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
}

// ─── Main Component ──────────────────────────────────────
export function Portal() {
  const { slugToken } = useParams<{ slugToken: string }>()
  const { theme, toggle: toggleTheme } = useTheme()
  const { lang, setLang, t: s } = useLang()
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [org, setOrg] = useState<Organization | null>(null)
  const [notFound, setNotFound] = useState(false)

  // Data
  const [sops, setSops] = useState<Sop[]>([])
  const [activeSop, setActiveSop] = useState<Sop | null>(null)
  const [sopSignatures, setSopSignatures] = useState<Record<string, SopSignature>>({})
  const [contracts, setContracts] = useState<Contract[]>([])
  const [activeContract, setActiveContract] = useState<Contract | null>(null)
  const [contractSignatures, setContractSignatures] = useState<Record<string, ContractSignature>>({})
  // Employer signatures keyed by contract id, for the current version. Lets
  // the rendered contract body show the manager's countersignature inline in
  // the EMPLOYER block (matching how employee sigs render in the EMPLOYEE
  // block).
  const [contractEmployerSignatures, setContractEmployerSignatures] = useState<Record<string, ContractSignature>>({})
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([])
  const [portal, setPortal] = useState<PortalHomeData | null>(null)
  const [unreadInformational, setUnreadInformational] = useState(0)
  const [recentInformational, setRecentInformational] = useState<FeedEvent[]>([])
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementSummary | null>(null)

  // UI
  const [tab, setTab] = useState<Tab>('home')
  const [docFilter, setDocFilter] = useState<DocFilter>('all')
  const [openDocType, setOpenDocType] = useState<OpenDocType>(null)
  const [selectedFont, setSelectedFont] = useState(SIGNATURE_FONTS[0].name)
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState('')
  const [showNotifications, setShowNotifications] = useState(false)
  const [showDocMenu, setShowDocMenu] = useState(false)
  // Doc content language follows the global UI language by default. The per-doc
  // override in the doc menu lets a user read one document in the opposite
  // language without flipping the whole UI; toggling the header language
  // resyncs every doc so "EN in the header" never silently means "this contract
  // is still in ID because that's what was sticky."
  const [docContentLang, setDocContentLang] = useState<'en' | 'id'>(() => lang)

  // Version history (lazy-loaded per opened document)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyVersions, setHistoryVersions] = useState<Array<SopVersion | ContractVersion>>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [previewVersion, setPreviewVersion] = useState<SopVersion | ContractVersion | null>(null)
  // Month-snapshot navigation: when the user picks a past month from the
  // strip at the top of the home tab, re-fetch portal_home with that period
  // so credits/bonuses/achievements reflect that month. Defaults to current.
  const [selectedMonth, setSelectedMonth] = useState<string>(() => currentJakartaMonth())
  const currentMonth = currentJakartaMonth()
  const isCurrentMonth = selectedMonth === currentMonth

  // Parse slug + access token once. Used by token-authed Spotlight RPCs.
  const { slug, token } = useMemo(() => {
    if (!slugToken) return { slug: null, token: null }
    const lastDash = slugToken.lastIndexOf('-')
    if (lastDash === -1) return { slug: null, token: null }
    return { slug: slugToken.slice(0, lastDash), token: slugToken.slice(lastDash + 1) }
  }, [slugToken])

  const spotlight = useSpotlight(slug, token)

  // Observe the signature section so the FAB can hide once the user has
  // scrolled it into view. Resets to false whenever a different doc opens
  // (so a brand-new doc that lands at the top still shows the FAB).
  useEffect(() => {
    if (!openDocType) { setSignSectionVisible(false); return }
    setSignSectionVisible(false)
    const target = signSectionRef.current
    if (!target) return
    const observer = new IntersectionObserver(entries => {
      const entry = entries[0]
      if (entry) setSignSectionVisible(entry.isIntersecting)
    }, { threshold: 0 })
    observer.observe(target)
    return () => observer.disconnect()
  }, [openDocType, activeSop?.id, activeContract?.id])

  const signSectionRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const docMenuRef = useRef<HTMLDivElement>(null)
  const docContentRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)
  // Tracks whether the signature section is currently in the viewport. The
  // floating "Jump to sign" button hides itself when true so it doesn't
  // overlap the section the user has already reached.
  const [signSectionVisible, setSignSectionVisible] = useState(false)

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifications(false)
      if (docMenuRef.current && !docMenuRef.current.contains(e.target as Node)) setShowDocMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Resync per-doc content language with the global UI language whenever the
  // header toggle fires. A user who changes the header expects every
  // document to follow — any prior per-doc override is intentionally cleared.
  useEffect(() => {
    setDocContentLang(lang)
  }, [lang])

  useEffect(() => {
    async function load() {
      if (!slugToken) { setNotFound(true); return }

      const lastDash = slugToken.lastIndexOf('-')
      if (lastDash === -1) { setNotFound(true); return }

      const slug = slugToken.slice(0, lastDash)
      const token = slugToken.slice(lastDash + 1)

      const { data: emp } = await supabase
        .from('employees')
        .select('*')
        .eq('slug', slug)
        .eq('access_token', token)
        .single()

      if (!emp) { setNotFound(true); return }
      setEmployee(emp)

      const [docsResult, unreadResult, recentResult] = await Promise.all([
        (supabase.rpc as unknown as PortalDocumentsRpc)('portal_documents', { emp_slug: slug, emp_token: token }),
        supabase.rpc('portal_unread_count', { emp_slug: slug, emp_token: token }),
        supabase
          .from('feed_events')
          .select('*')
          .eq('employee_id', emp.id)
          .in('event_type', ['achievement_unlocked', 'bonus_awarded', 'spotlight_published'])
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      if (typeof unreadResult.data === 'number') setUnreadInformational(unreadResult.data)
      if (recentResult.data) setRecentInformational(recentResult.data)

      const docs = docsResult.data as PortalDocumentsData | null
      setOrg(docs?.org ?? null)

      const sopList = docs?.sops ?? []
      setSops(sopList)

      const contractList = docs?.contracts ?? []
      setContracts(contractList)
      // Keep activeContract pre-selected so merge fields in any document
      // resolve against the employee's primary contract context. The grid
      // view never auto-opens — openDocType stays null until the user picks.
      setActiveContract(contractList[0] ?? null)

      // Load signatures (SOPs)
      if (sopList.length > 0) {
        const { data: sigs } = await supabase
          .from('sop_signatures')
          .select('*')
          .in('sop_id', sopList.map(s => s.id))
          .eq('employee_id', emp.id)

        if (sigs) {
          const sigMap: Record<string, SopSignature> = {}
          for (const sig of sigs) {
            const sop = sopList.find(s => s.id === sig.sop_id)
            if (sop && sig.version_number === sop.current_version) {
              sigMap[sig.sop_id] = sig
            }
          }
          setSopSignatures(sigMap)
        }
      }

      // Load signatures (contracts) — both employee's own signature and the
      // employer's countersignature for each contract, so the rendered body
      // can show both inline. Filtered to current-version sigs only;
      // historical sigs are version-pinned and not relevant for display here.
      if (contractList.length > 0) {
        const contractIds = contractList.map(c => c.id)
        const { data: csigs } = await supabase
          .from('contract_signatures')
          .select('*')
          .in('contract_id', contractIds)

        if (csigs) {
          const empSigs: Record<string, ContractSignature> = {}
          const erSigs: Record<string, ContractSignature> = {}
          for (const sig of csigs) {
            const contract = contractList.find(c => c.id === sig.contract_id)
            if (!contract || sig.version_number !== contract.current_version) continue
            if (sig.signer_role === 'employer') {
              erSigs[sig.contract_id] = sig
            } else if (sig.employee_id === emp.id) {
              empSigs[sig.contract_id] = sig
            }
          }
          setContractSignatures(empSigs)
          setContractEmployerSignatures(erSigs)
        }
      }
    }
    load()
  }, [slugToken])

  // portal_home is re-fetched whenever the user picks a different month from
  // the strip. Current month uses the legacy 2-arg call (target_month null);
  // past months pass the YYYY-MM-01 string and the RPC scopes credits,
  // bonuses, and achievements to that period.
  useEffect(() => {
    if (!slugToken) return
    const lastDash = slugToken.lastIndexOf('-')
    if (lastDash === -1) return
    const slug = slugToken.slice(0, lastDash)
    const token = slugToken.slice(lastDash + 1)
    const args = isCurrentMonth
      ? { emp_slug: slug, emp_token: token }
      : { emp_slug: slug, emp_token: token, target_month: selectedMonth }
    supabase.rpc('portal_home', args).then(({ data }) => {
      if (data) setPortal(data as unknown as PortalHomeData)
    })
  }, [slugToken, selectedMonth, isCurrentMonth])

  async function loadFeedEvents() {
    if (!employee) return
    // Bumped to 200 so the month strip has enough history to filter past
    // months client-side without a follow-up query each time the user swipes.
    const { data } = await supabase
      .from('feed_events')
      .select('*')
      .eq('employee_id', employee.id)
      .order('created_at', { ascending: false })
      .limit(200)
    if (data) setFeedEvents(data)
  }

  // Load feed eagerly once the employee is resolved — the activity feed
  // now lives at the bottom of the home tab rather than its own tab.
  useEffect(() => {
    if (!employee) return
    const employeeId = employee.id

    let cancelled = false

    async function loadInitialFeed() {
      const { data } = await supabase
        .from('feed_events')
        .select('*')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (!cancelled && data) setFeedEvents(data)
    }

    void loadInitialFeed()
    return () => { cancelled = true }
  }, [employee])

  // Notifications: unsigned documents (SOPs + contracts, actionable) +
  // unread informational events. Actionable items persist until acted on;
  // informational items clear when the user opens the bell dropdown.
  const unsignedSops = sops.filter(s => !sopSignatures[s.id])
  const unsignedContracts = contracts.filter(c => !contractSignatures[c.id])
  const pendingActionCount = unsignedSops.length + unsignedContracts.length
  const notificationCount = pendingActionCount + unreadInformational

  // Documents grid: combined, sorted by recency (updated_at desc).
  const allDocCards: DocCardItem[] = useMemo(() => {
    const sopCards: DocCardItem[] = sops.map(sop => ({
      type: 'sop' as const,
      doc: sop,
      needsAction: !sopSignatures[sop.id],
      updatedAt: sop.updated_at ?? sop.created_at ?? '',
      signedAt: sopSignatures[sop.id]?.signed_at ?? null,
    }))
    const contractCards: DocCardItem[] = contracts.map(c => ({
      type: 'contract' as const,
      doc: c,
      needsAction: !contractSignatures[c.id],
      updatedAt: c.updated_at ?? c.created_at ?? '',
      signedAt: contractSignatures[c.id]?.signed_at ?? null,
    }))
    return [...sopCards, ...contractCards].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    )
  }, [sops, contracts, sopSignatures, contractSignatures])
  const filteredDocCards = allDocCards.filter(c =>
    docFilter === 'all' ? true : docFilter === 'sops' ? c.type === 'sop' : c.type === 'contract'
  )
  const pendingDocCards = filteredDocCards.filter(c => c.needsAction)
  const archiveDocCards = filteredDocCards.filter(c => !c.needsAction)

  // Mark informational notifications as seen when the dropdown opens.
  useEffect(() => {
    if (!showNotifications || unreadInformational === 0 || !slugToken) return
    const lastDash = slugToken.lastIndexOf('-')
    if (lastDash === -1) return
    const slug = slugToken.slice(0, lastDash)
    const token = slugToken.slice(lastDash + 1)
    supabase
      .rpc('portal_mark_notifications_seen', { emp_slug: slug, emp_token: token })
      .then(({ error }) => { if (!error) setUnreadInformational(0) })
  }, [showNotifications, unreadInformational, slugToken])

  // Reset version-history view state when switching documents.
  function resetHistoryState() {
    setHistoryOpen(false)
    setHistoryVersions([])
    setPreviewVersion(null)
  }

  function openSopDoc(sop: Sop) {
    resetHistoryState()
    setActiveSop(sop)
    setOpenDocType('sop')
    setTab('documents')
  }

  function openContractDoc(c: Contract) {
    resetHistoryState()
    setActiveContract(c)
    setOpenDocType('contract')
    setTab('documents')
  }

  function closeOpenDoc() {
    resetHistoryState()
    setOpenDocType(null)
  }

  // Notification → doc handlers land at the top of the document, not at the
  // signature section, so employees actually read it first. A floating
  // "Jump to sign" button (rendered alongside the doc) lets them jump to
  // the bottom when they're ready.
  function goToSopNotification(sop: Sop) {
    openSopDoc(sop)
    setShowNotifications(false)
  }

  function goToContractNotification(c: Contract) {
    openContractDoc(c)
    setShowNotifications(false)
  }

  // Lazy-load version history for the currently open document.
  async function loadHistory() {
    if (historyVersions.length > 0) { setHistoryOpen(true); return }
    setHistoryLoading(true)
    setHistoryOpen(true)
    if (openDocType === 'sop' && activeSop) {
      const { data } = await supabase
        .from('sop_versions')
        .select('*')
        .eq('sop_id', activeSop.id)
        .order('version_number', { ascending: false })
      if (data) setHistoryVersions(data)
    } else if (openDocType === 'contract' && activeContract) {
      const { data } = await supabase
        .from('contract_versions')
        .select('*')
        .eq('contract_id', activeContract.id)
        .order('version_number', { ascending: false })
      if (data) setHistoryVersions(data)
    }
    setHistoryLoading(false)
  }

  async function handleSign() {
    if (!activeSop || !employee) return
    setSigning(true)

    const { data, error: sigError } = await supabase
      .from('sop_signatures')
      .insert({
        sop_id: activeSop.id,
        version_number: activeSop.current_version,
        employee_id: employee.id,
        typed_name: employee.name,
        signature_font: selectedFont,
      })
      .select()
      .single()

    if (sigError) { setError(sigError.message); setSigning(false); return }
    setSopSignatures(prev => ({ ...prev, [activeSop.id]: data }))

    // Create feed event
    await supabase.from('feed_events').insert({
      org_id: employee.org_id,
      employee_id: employee.id,
      event_type: 'sop_signed',
      title: activeSop.title,
      description: `Version ${activeSop.current_version}`,
      metadata: { sop_id: activeSop.id, version: activeSop.current_version, signature_font: selectedFont },
    })
    // Refresh feed so the new signature shows up at the bottom of home.
    loadFeedEvents()

    setSigning(false)
  }

  async function handleSignContract() {
    if (!activeContract || !employee) return
    setSigning(true)

    const { data, error: sigError } = await supabase
      .from('contract_signatures')
      .insert({
        contract_id: activeContract.id,
        version_number: activeContract.current_version,
        employee_id: employee.id,
        typed_name: employee.name,
        signature_font: selectedFont,
      })
      .select()
      .single()

    if (sigError) { setError(sigError.message); setSigning(false); return }
    setContractSignatures(prev => ({ ...prev, [activeContract.id]: data }))

    await supabase.from('feed_events').insert({
      org_id: employee.org_id,
      employee_id: employee.id,
      event_type: 'contract_signed',
      title: activeContract.title,
      description: `Version ${activeContract.current_version}`,
      metadata: { contract_id: activeContract.id, version: activeContract.current_version, signature_font: selectedFont },
    })
    loadFeedEvents()

    setSigning(false)
  }

  // Get document content based on content language toggle. Resolves any
  // {{merge_field}} tokens against the live employee/org/contract context so
  // employees see actual values like "Rp 3,400,000" rather than raw tokens.
  // For contracts, the persisted signature (if any) is passed in so the
  // {{employee_signature}}/{{employee_sign_date}} tokens render the signed
  // name in-place. While the user is picking a font but hasn't confirmed,
  // a preview signature is synthesized from the selected font so the body
  // updates live as they tab through the four options.
  function getDocContent(doc: { content_markdown: string; content_markdown_id?: string | null }) {
    const raw = docContentLang === 'id' && doc.content_markdown_id
      ? doc.content_markdown_id
      : doc.content_markdown
    // Pick the persisted employee signature matching whichever doc type is
    // open. For unsigned docs, synthesize a preview signature from the
    // currently-selected font so the body updates live as the user tabs
    // through font options before confirming.
    const persistedEmployeeSig = activeContract
      ? contractSignatures[activeContract.id]
      : activeSop
        ? sopSignatures[activeSop.id]
        : undefined
    const employeeSignature = persistedEmployeeSig
      ? { typed_name: persistedEmployeeSig.typed_name, signature_font: persistedEmployeeSig.signature_font, signed_at: persistedEmployeeSig.signed_at }
      : ((activeContract || activeSop) && employee
          ? { typed_name: employee.name, signature_font: selectedFont, signed_at: null }
          : null)
    const employerSig = activeContract ? contractEmployerSignatures[activeContract.id] : undefined
    const employerSignature = employerSig
      ? {
          typed_name: employerSig.typed_name,
          signature_font: employerSig.signature_font,
          signed_at: employerSig.signed_at,
          employer_name: employerSig.typed_name,
          employer_title: employerSig.signer_title,
        }
      : null
    return renderMergeFields(raw, {
      employee,
      organization: org,
      contract: activeContract,
      today: new Date(),
      lang: docContentLang,
      employeeSignature,
      employerSignature,
    })
  }

  async function handleDownloadPdf(includeSignature: boolean = true) {
    if (!docContentRef.current) return
    const title = openDocType === 'sop' ? activeSop?.title : activeContract?.title
    const filename = (title || 'document').replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase()
      + (includeSignature ? '' : '-blank')

    setDownloading(true)
    setShowDocMenu(false)

    try {
      // Clone content and force light theme for PDF rendering
      const clone = docContentRef.current.cloneNode(true) as HTMLElement
      clone.style.color = '#111827'
      clone.style.backgroundColor = '#ffffff'
      clone.style.padding = '0'
      // For a "blank for signing" copy: strip the signed-name spans so the
      // signature line becomes a blank underline. The merge resolver tags
      // these spans with class="signature-name" specifically for this use.
      // Sign-date spans carry the same class via the resolver path; for
      // dates we instead want the literal blank line so we substitute the
      // text rather than removing the element wholesale.
      if (!includeSignature) {
        clone.querySelectorAll('.signature-name').forEach(el => {
          const span = el as HTMLElement
          span.textContent = ' '
          span.style.fontFamily = 'inherit'
          span.style.fontSize = 'inherit'
        })
        clone.querySelectorAll('.signature-date').forEach(el => {
          const span = el as HTMLElement
          span.textContent = '____________________________'
        })
      }
      // Force all child elements to use dark text
      clone.querySelectorAll('*').forEach(el => {
        const htmlEl = el as HTMLElement
        htmlEl.style.color = '#111827'
      })
      // Lighter color for tertiary text
      clone.querySelectorAll('blockquote, code').forEach(el => {
        const htmlEl = el as HTMLElement
        htmlEl.style.backgroundColor = '#f3f4f6'
      })
      clone.querySelectorAll('th').forEach(el => {
        const htmlEl = el as HTMLElement
        htmlEl.style.backgroundColor = '#f9fafb'
      })
      clone.querySelectorAll('td, th').forEach(el => {
        const htmlEl = el as HTMLElement
        htmlEl.style.borderColor = '#e5e7eb'
      })
      clone.querySelectorAll('hr').forEach(el => {
        const htmlEl = el as HTMLElement
        htmlEl.style.borderColor = '#e5e7eb'
      })

      // Place in DOM but behind everything (html2canvas needs on-screen elements)
      const wrapper = document.createElement('div')
      wrapper.style.position = 'fixed'
      wrapper.style.top = '0'
      wrapper.style.left = '0'
      wrapper.style.width = '210mm' // A4 width
      wrapper.style.zIndex = '-9999'
      wrapper.style.overflow = 'hidden'
      wrapper.style.pointerEvents = 'none'
      wrapper.appendChild(clone)
      document.body.appendChild(wrapper)

      await html2pdf()
        .set({
          margin: [12, 12, 12, 12],
          filename: `${filename}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(clone)
        .save()

      document.body.removeChild(wrapper)
    } catch (err) {
      console.error('PDF generation failed:', err)
    }
    setDownloading(false)
  }

  // ─── Not Found ───
  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6" style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="text-center">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>{s.notFoundTitle}</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{s.notFoundDesc}</p>
        </div>
      </div>
    )
  }

  // ─── Loading ───
  if (!employee) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: 'var(--color-bg)' }}>
        <p style={{ color: 'var(--color-text-secondary)' }}>{s.loading}</p>
      </div>
    )
  }

  const orgLogoUrl = org?.logo_url || portal?.org.logo_url || null
  const orgDisplayName = org?.display_name || org?.name || portal?.org.name || 'Flodok'
  const orgLegalName = org?.name || portal?.org.name || 'Flodok'

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--color-bg)' }}>

      {/* ─── Top Bar ─── */}
      <div className="sticky top-0 z-30 border-b px-4 py-2 no-print" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
        <div className="relative mx-auto flex max-w-lg items-center justify-between">
          {/* Left: org identity */}
          <div className="flex min-w-0 items-center gap-2">
            {orgLogoUrl && (
              <img
                src={orgLogoUrl}
                alt=""
                className="h-5 w-5 shrink-0 rounded object-contain"
              />
            )}
            <span className="truncate text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
              {orgDisplayName}
            </span>
          </div>

          {/* Center: employee identity */}
          {employee && (
            <div className="pointer-events-none absolute left-1/2 flex min-w-0 max-w-[60%] -translate-x-1/2 items-baseline gap-1.5">
              <span className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {employee.name}
              </span>
              {primaryDept(employee) && (
                <span className="hidden shrink-0 text-xs sm:inline" style={{ color: 'var(--color-text-tertiary)' }}>
                  · {primaryDept(employee)}
                </span>
              )}
            </div>
          )}

          {/* Right: controls */}
          <div className="flex items-center gap-3">
            {/* Language toggle */}
            <button
              onClick={() => setLang(lang === 'en' ? 'id' : 'en')}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors hover:opacity-70"
              style={{ color: 'var(--color-text-secondary)' }}
              title={lang === 'en' ? s.switchToId : s.switchToEn}
              aria-label={lang === 'en' ? s.switchToId : s.switchToEn}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 8 6 6"/>
                <path d="m4 14 6-6 2-3"/>
                <path d="M2 5h12"/>
                <path d="M7 2h1"/>
                <path d="m22 22-5-10-5 10"/>
                <path d="M14 18h6"/>
              </svg>
              <span className="hidden text-xs font-semibold sm:inline">
                {lang === 'en' ? 'EN' : 'ID'}
              </span>
            </button>

            {/* Theme toggle */}
            <button onClick={toggleTheme} className="p-1" style={{ color: 'var(--color-text-tertiary)' }}>
              {theme === 'light' ? <MoonIcon /> : <SunIcon />}
            </button>

            {/* Notifications */}
            <div className="relative" ref={notifRef}>
              <button onClick={() => setShowNotifications(!showNotifications)} className="p-1" style={{ color: 'var(--color-text-tertiary)' }}>
                <BellIcon count={notificationCount} />
              </button>
              {showNotifications && (
                <div
                  className="absolute right-0 top-full mt-2 w-80 rounded-xl border shadow-lg"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                >
                  <div className="border-b px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
                    <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{s.notifications}</span>
                  </div>

                  {pendingActionCount === 0 && recentInformational.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                      {s.noNotifications}
                    </div>
                  ) : (
                    <div className="max-h-96 overflow-y-auto">
                      {/* To Do — actionable, persistent */}
                      {pendingActionCount > 0 && (
                        <div>
                          <div className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
                            {s.notificationsToDo}
                          </div>
                          {unsignedSops.map(sop => (
                            <button
                              key={`sop-${sop.id}`}
                              onClick={() => goToSopNotification(sop)}
                              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors"
                              onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)' }}
                              onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                            >
                              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--color-diff-remove)' }}>
                                <DocIcon />
                              </div>
                              <div>
                                <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{sop.title}</p>
                                <p className="text-xs" style={{ color: 'var(--color-warning)' }}>{s.needsSignature}</p>
                              </div>
                            </button>
                          ))}
                          {unsignedContracts.map(c => (
                            <button
                              key={`contract-${c.id}`}
                              onClick={() => goToContractNotification(c)}
                              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors"
                              onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)' }}
                              onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                            >
                              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--color-diff-remove)' }}>
                                <ContractIcon />
                              </div>
                              <div>
                                <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{c.title}</p>
                                <p className="text-xs" style={{ color: 'var(--color-warning)' }}>{s.needsSignature}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Recent — informational, clears on open */}
                      {recentInformational.length > 0 && (
                        <div>
                          <div className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
                            {s.notificationsRecent}
                          </div>
                          {recentInformational.map(ev => (
                            <div
                              key={ev.id}
                              className="flex items-start gap-3 px-4 py-3"
                            >
                              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--color-warning-subtle, rgba(234, 179, 8, 0.15))' }}>
                                <span className="text-base">{ev.event_type === 'achievement_unlocked' ? '🏆' : '💰'}</span>
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{ev.title}</p>
                                {ev.description && (
                                  <p className="truncate text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{ev.description}</p>
                                )}
                                <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{formatRelativeTime(ev.created_at, lang)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Content Area (scrollable, padded for bottom nav) ─── */}
      <div className="flex-1 px-4 pb-24">
        <div className="mx-auto max-w-lg">

          {/* ─── Spotlight banner (shown only on Home) ─── */}
          {tab === 'home' && (
            <SpotlightBanner
              posts={spotlight.posts}
              t={s}
              onDismiss={spotlight.dismiss}
              onOpen={() => setTab('spotlight')}
            />
          )}

          {/* ─── Home Tab ─── */}
          {tab === 'home' && (
            <HomeTab
              employee={employee}
              portal={portal}
              s={s}
              lang={lang}
              unsignedSops={unsignedSops}
              feedEvents={feedEvents}
              badgesEnabled={org?.badges_enabled !== false}
              creditsEnabled={org?.credits_enabled !== false}
              bonusesEnabled={org?.bonuses_enabled !== false}
              selectedMonth={selectedMonth}
              currentMonth={currentMonth}
              isCurrentMonth={isCurrentMonth}
              onSelectMonth={setSelectedMonth}
              onOpenSop={sop => openSopDoc(sop)}
              onSelectAchievement={setSelectedAchievement}
            />
          )}

          {/* ─── Documents Tab Content ─── */}
          {tab === 'documents' && openDocType === null && (
            <DocumentsGrid
              s={s}
              lang={lang}
              docFilter={docFilter}
              onSetFilter={setDocFilter}
              pendingCards={pendingDocCards}
              archiveCards={archiveDocCards}
              totalCount={allDocCards.length}
              onOpenSop={openSopDoc}
              onOpenContract={openContractDoc}
            />
          )}

          {tab === 'documents' && openDocType !== null && (() => {
            const isSop = openDocType === 'sop'
            const doc = isSop ? activeSop : activeContract
            if (!doc) return null
            const sig = isSop
              ? (activeSop ? sopSignatures[activeSop.id] : undefined)
              : (activeContract ? contractSignatures[activeContract.id] : undefined)
            const previewMd = previewVersion
              ? (docContentLang === 'id' && previewVersion.resolved_markdown_id
                  ? previewVersion.resolved_markdown_id
                  : previewVersion.resolved_markdown_en)
              : null

            return (
              <div>
                {/* Top action row: back + menu */}
                <div className="mb-3 flex items-center justify-between">
                  <button
                    onClick={closeOpenDoc}
                    className="flex items-center gap-1 text-sm font-medium"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    {s.backToDocuments}
                  </button>
                  <div className="relative" ref={docMenuRef}>
                    <button onClick={() => setShowDocMenu(!showDocMenu)} className="rounded-lg p-2" style={{ color: 'var(--color-text-tertiary)' }}>
                      <MoreIcon />
                    </button>
                    {showDocMenu && (
                      <div className="absolute right-0 top-full mt-1 w-56 rounded-xl border py-1 shadow-lg" style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
                        <div className="px-3 py-2">
                          <p className="mb-1.5 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{s.contentLang}</p>
                          <div className="flex gap-1 rounded-lg p-0.5" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
                            <button
                              onClick={() => setDocContentLang('en')}
                              className="flex-1 rounded-md px-2 py-1 text-xs font-medium"
                              style={{
                                backgroundColor: docContentLang === 'en' ? 'var(--color-bg)' : 'transparent',
                                color: docContentLang === 'en' ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                              }}
                            >
                              {s.english}
                            </button>
                            <button
                              onClick={() => setDocContentLang('id')}
                              className="flex-1 rounded-md px-2 py-1 text-xs font-medium"
                              style={{
                                backgroundColor: docContentLang === 'id' ? 'var(--color-bg)' : 'transparent',
                                color: docContentLang === 'id' ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                              }}
                            >
                              {s.indonesian}
                            </button>
                          </div>
                        </div>
                        <div className="my-1 border-t" style={{ borderColor: 'var(--color-border)' }} />
                        <button
                          onClick={() => { setShowDocMenu(false); loadHistory() }}
                          className="block w-full px-4 py-2 text-left text-sm font-medium transition-colors"
                          style={{ color: 'var(--color-text)' }}
                          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)' }}
                          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                        >
                          {s.versionHistory}
                        </button>
                        <div className="my-1 border-t" style={{ borderColor: 'var(--color-border)' }} />
                        <div className="px-3 py-2 space-y-1.5">
                          <button
                            onClick={() => handleDownloadPdf(true)}
                            disabled={downloading}
                            className="w-full rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                            style={{ backgroundColor: 'var(--color-primary)' }}
                          >
                            {downloading ? s.downloadingPdf : s.downloadPdf}
                          </button>
                          <button
                            onClick={() => handleDownloadPdf(false)}
                            disabled={downloading}
                            className="w-full rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50"
                            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                          >
                            {s.downloadBlankPdf}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Doc title */}
                <div className="mb-4">
                  <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>{doc.title}</h2>
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{s.version} {doc.current_version}</p>
                </div>

                {/* Viewing-older-version banner */}
                {previewVersion && (
                  <div
                    className="mb-4 flex items-center justify-between rounded-xl border px-4 py-3"
                    style={{ borderColor: 'var(--color-warning, #f59e0b)', backgroundColor: 'var(--color-warning-subtle, rgba(245, 158, 11, 0.1))' }}
                  >
                    <div>
                      <p className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                        {s.viewingVersion} · {s.version} {previewVersion.version_number}
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                        {new Date(previewVersion.created_at).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => setPreviewVersion(null)}
                      className="rounded-md px-2 py-1 text-xs font-medium"
                      style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                    >
                      {s.backToCurrent}
                    </button>
                  </div>
                )}

                {/* Content */}
                <div ref={docContentRef} className="sop-content max-w-none" style={{ color: 'var(--color-text)' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                    {previewMd ?? getDocContent(doc)}
                  </ReactMarkdown>
                </div>

                {/* Floating "Jump to sign" button. Shown only on the current
                    version when the doc is unsigned and the signature section
                    isn't already in view. The doc lands at the top of the
                    page on open so the employee reads it before signing —
                    this gives them a one-tap shortcut down once they're
                    ready, rather than slamming them straight to the bottom. */}
                {!previewVersion && !sig && !signSectionVisible && (
                  <button
                    type="button"
                    onClick={() => signSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                    className="fixed left-1/2 z-30 -translate-x-1/2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-lg no-print"
                    style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)', backgroundColor: 'var(--color-primary)' }}
                  >
                    {s.jumpToSign} ↓
                  </button>
                )}

                {/* Signature (only on current version) */}
                {!previewVersion && (
                  <div ref={signSectionRef} className="mt-8 border-t pt-6 no-print" style={{ borderColor: 'var(--color-border)' }}>
                    {sig ? (
                      <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                        <div className="flex items-center gap-3">
                          <CheckCircle />
                          <div>
                            <p
                              className="text-xl"
                              style={{ fontFamily: `'${sig.signature_font || 'Dancing Script'}', cursive`, color: 'var(--color-text)' }}
                            >
                              {sig.typed_name}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                              {new Date(sig.signed_at).toLocaleString()} &middot; {s.version} {sig.version_number}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <h3 className="mb-1 text-base font-semibold" style={{ color: 'var(--color-text)' }}>{s.acknowledgeTitle}</h3>
                        <p className="mb-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{isSop ? s.acknowledgeDesc : s.acknowledgeContractDesc}</p>
                        <p className="mb-2 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{s.chooseStyle}</p>
                        <div className="mb-4 grid grid-cols-2 gap-2">
                          {SIGNATURE_FONTS.map(font => (
                            <button
                              key={font.name}
                              type="button"
                              onClick={() => setSelectedFont(font.name)}
                              className="rounded-xl border px-4 py-3 text-left transition-colors"
                              style={{
                                borderColor: selectedFont === font.name ? 'var(--color-primary)' : 'var(--color-border)',
                                backgroundColor: selectedFont === font.name ? 'var(--color-bg-secondary)' : 'transparent',
                              }}
                            >
                              <span
                                className="block truncate text-xl"
                                style={{ fontFamily: `'${font.name}', cursive`, color: 'var(--color-text)' }}
                              >
                                {employee.name}
                              </span>
                              <span className="mt-0.5 block text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>{font.label}</span>
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={isSop ? handleSign : handleSignContract}
                          disabled={signing}
                          className="w-full rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                          style={{ backgroundColor: 'var(--color-primary)' }}
                        >
                          {signing ? s.signing : s.confirmSign}
                        </button>
                        {error && <p className="mt-2 text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
                      </div>
                    )}
                  </div>
                )}

                {/* Version history sheet */}
                {historyOpen && (
                  <div
                    className="fixed inset-0 z-40 flex items-end justify-center"
                    style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
                    onClick={() => setHistoryOpen(false)}
                  >
                    <div
                      className="w-full max-w-lg rounded-t-2xl border p-4"
                      style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', maxHeight: '80vh', overflowY: 'auto' }}
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>{s.versionHistory}</h3>
                        <button
                          onClick={() => setHistoryOpen(false)}
                          className="rounded-lg p-1"
                          style={{ color: 'var(--color-text-tertiary)' }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                      {historyLoading ? (
                        <p className="py-6 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{s.loading}</p>
                      ) : historyVersions.length === 0 ? (
                        <p className="py-6 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{s.noPriorVersions}</p>
                      ) : (
                        <div className="space-y-2">
                          {historyVersions.map(v => {
                            const isCurrent = v.version_number === doc.current_version
                            return (
                              <button
                                key={`${v.version_number}-${v.created_at}`}
                                onClick={() => {
                                  if (isCurrent) {
                                    setPreviewVersion(null)
                                  } else {
                                    setPreviewVersion(v)
                                  }
                                  setHistoryOpen(false)
                                }}
                                className="flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors"
                                style={{ borderColor: 'var(--color-border)' }}
                              >
                                <div>
                                  <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                                    {s.version} {v.version_number}
                                    {isCurrent && (
                                      <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
                                        {s.currentVersion}
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                                    {new Date(v.created_at).toLocaleString()}
                                  </p>
                                </div>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}><polyline points="9 18 15 12 9 6"/></svg>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}


          {/* ─── Spotlight Tab Content ─── */}
          {tab === 'spotlight' && (
            <SpotlightTab
              posts={spotlight.posts}
              t={s}
              onAcknowledge={spotlight.acknowledge}
            />
          )}

          {/* ─── Leaderboard Tab Content ─── */}
          {tab === 'leaderboard' && employee && (
            <LeaderboardTab
              slugToken={slugToken!}
              s={s}
              badgesEnabled={org?.badges_enabled !== false}
            />
          )}

          {tab === 'badges' && employee && org?.badges_enabled !== false && (
            <BadgesTab
              slugToken={slugToken!}
              lang={lang}
              s={s}
              onSelectAchievement={setSelectedAchievement}
            />
          )}

        </div>
      </div>

      {/* ─── Bottom Tab Bar ─── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t no-print" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
        <div className="mx-auto flex max-w-lg">
          {([
            { key: 'home' as Tab, label: s.home, icon: <HomeIcon /> },
            { key: 'documents' as Tab, label: s.documents, icon: <DocIcon />, badge: pendingActionCount },
            { key: 'spotlight' as Tab, label: s.spotlightTabLabel, icon: <SpotlightIcon /> },
            ...(org?.badges_enabled !== false
              ? [{ key: 'badges' as Tab, label: s.portalBadgesTabLabel, icon: <BadgeIcon /> }]
              : []),
            // Leaderboard is credits-based — hide when credits are disabled.
            ...(org?.credits_enabled !== false
              ? [{ key: 'leaderboard' as Tab, label: s.leaderboard, icon: <TrophyIcon /> }]
              : []),
          ]).map(item => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className="relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors"
              style={{ color: tab === item.key ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }}
            >
              <div className="relative">
                {item.icon}
                {item.badge ? (
                  <span className="absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
                    {item.badge}
                  </span>
                ) : null}
              </div>
              <span>{item.label}</span>
              {tab === item.key && (
                <div className="absolute top-0 h-0.5 w-10 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
              )}
            </button>
          ))}
        </div>
        {/* Safe area for phones with gesture bars */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>

      {/* Print elements */}
      <div className="print-only mb-8">
        {orgLogoUrl && <img src={orgLogoUrl} alt={orgLegalName} className="mb-4 h-10" />}
        <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{orgLegalName}</div>
      </div>
      <div className="print-footer">Generated by Flodok</div>

      {selectedAchievement && (
        <AchievementDetailModal
          achievement={selectedAchievement}
          lang={lang}
          s={s}
          onClose={() => setSelectedAchievement(null)}
        />
      )}

      {/* Spotlight modal interceptor — fires for posts with display_mode = 'modal'
          that the employee hasn't acknowledged or dismissed yet. */}
      <SpotlightModal
        posts={spotlight.posts}
        t={s}
        onSeen={spotlight.markSeen}
        onAcknowledge={spotlight.acknowledge}
        onDismiss={spotlight.dismiss}
      />
    </div>
  )
}

// ─── Documents Grid (combined SOPs + Contracts) ───────────
type DocCardItem =
  | { type: 'sop'; doc: Sop; needsAction: boolean; updatedAt: string; signedAt: string | null }
  | { type: 'contract'; doc: Contract; needsAction: boolean; updatedAt: string; signedAt: string | null }

function DocumentsGrid({
  s,
  lang,
  docFilter,
  onSetFilter,
  pendingCards,
  archiveCards,
  totalCount,
  onOpenSop,
  onOpenContract,
}: {
  s: ReturnType<typeof useLang>['t']
  lang: 'en' | 'id'
  docFilter: DocFilter
  onSetFilter: (f: DocFilter) => void
  pendingCards: DocCardItem[]
  archiveCards: DocCardItem[]
  totalCount: number
  onOpenSop: (sop: Sop) => void
  onOpenContract: (c: Contract) => void
}) {
  const chips: Array<{ key: DocFilter; label: string }> = [
    { key: 'all', label: s.documentsAll },
    { key: 'sops', label: s.sops },
    { key: 'contracts', label: s.contracts },
  ]

  function openCard(card: DocCardItem) {
    if (card.type === 'sop') onOpenSop(card.doc)
    else onOpenContract(card.doc)
  }

  function formatShortDate(iso: string): string {
    const d = new Date(iso)
    const now = new Date()
    const opts: Intl.DateTimeFormatOptions = d.getFullYear() === now.getFullYear()
      ? { day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' }
    return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', opts).format(d)
  }

  function renderCard(card: DocCardItem) {
    const Icon = card.type === 'sop' ? DocIcon : ContractIcon
    // Date line: signed docs anchor to the signature date (legal anchor —
    // absolute is more meaningful than "5 days ago"); unsigned/awaiting docs
    // show a relative "Updated" so freshness is obvious at a glance.
    const dateLine = card.signedAt
      ? `${s.statusSigned} ${formatShortDate(card.signedAt)}`
      : card.updatedAt
        ? `${s.metaUpdated} ${formatRelativeTime(card.updatedAt, lang)}`
        : ''
    return (
      <button
        key={`${card.type}-${card.doc.id}`}
        onClick={() => openCard(card)}
        className="relative flex flex-col rounded-xl border p-3 text-left transition-colors"
        style={{
          borderColor: card.needsAction ? 'var(--color-warning, #f59e0b)' : 'var(--color-border)',
          backgroundColor: 'var(--color-bg)',
        }}
      >
        {/* Status pill: top-right of card. Awaiting is amber-emphasized so it
            draws the eye; Signed recedes to a muted check so the resting state
            doesn't compete with documents that need action. */}
        <span
          className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={card.needsAction
            ? {
                backgroundColor: 'var(--color-warning-subtle, rgba(245, 158, 11, 0.15))',
                color: 'var(--color-warning, #f59e0b)',
              }
            : {
                backgroundColor: 'var(--color-success-subtle, rgba(34, 197, 94, 0.15))',
                color: 'var(--color-success, #22c55e)',
              }}
        >
          {card.needsAction ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
          {card.needsAction ? s.statusAwaiting : s.statusSigned}
        </span>
        <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)' }}>
          <Icon />
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
          {card.type === 'sop' ? s.sops : s.contracts}
        </p>
        <p className="mt-0.5 line-clamp-2 text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          {card.doc.title}
        </p>
        <p className="mt-1 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
          v{card.doc.current_version}
          {dateLine && ` · ${dateLine}`}
        </p>
      </button>
    )
  }

  return (
    <div className="pt-4">
      {/* Filter segmented control (matches Leaderboard period selector) */}
      <div
        className="mb-4 flex rounded-lg p-0.5"
        style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
      >
        {chips.map(c => {
          const active = docFilter === c.key
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onSetFilter(c.key)}
              className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: active ? 'var(--color-bg)' : 'transparent',
                color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                boxShadow: active ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      {totalCount === 0 ? (
        <div className="rounded-xl border p-6 text-center" style={{ borderColor: 'var(--color-border)' }}>
          <div className="mx-auto flex h-10 w-10 items-center justify-center" style={{ color: 'var(--color-text-tertiary)' }}>
            <DocIcon />
          </div>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{s.documentsEmpty}</p>
        </div>
      ) : (
        <>
          {pendingCards.length > 0 && (
            <div className="mb-5">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-warning, #f59e0b)' }}>
                {s.needsAction}
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {pendingCards.map(renderCard)}
              </div>
            </div>
          )}

          {archiveCards.length > 0 && (
            <div>
              {pendingCards.length > 0 && (
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
                  {s.yourDocuments}
                </h2>
              )}
              <div className="grid grid-cols-2 gap-2">
                {archiveCards.map(renderCard)}
              </div>
            </div>
          )}

          {pendingCards.length === 0 && archiveCards.length === 0 && (
            <p className="py-6 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{s.documentsEmpty}</p>
          )}
        </>
      )}
    </div>
  )
}

// ─── Achievement Detail Modal ─────────────────────────────
function AchievementDetailModal({
  achievement,
  lang,
  s,
  onClose,
}: {
  achievement: AchievementSummary
  lang: 'en' | 'id'
  s: ReturnType<typeof useLang>['t']
  onClose: () => void
}) {
  const earnedDate = new Date(achievement.unlocked_at)
  const absoluteDate = earnedDate.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const relative = formatRelativeTime(earnedDate, lang)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border p-6 shadow-xl"
        style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center">
          <div
            className="mb-4 flex h-20 w-20 items-center justify-center rounded-full"
            style={{ backgroundColor: 'var(--color-warning-subtle, rgba(234, 179, 8, 0.15))' }}
          >
            <BadgeGlyph icon={achievement.icon} size={56} />
          </div>
          <h3 className="mb-1 text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
            {achievement.name}
          </h3>
          {achievement.description && (
            <p className="mb-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {achievement.description}
            </p>
          )}
          <p className="mb-4 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            {s.achievementEarnedOn(absoluteDate)} · {relative}
          </p>
          {achievement.reason && (
            <div
              className="w-full rounded-lg border p-3 text-left text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary, transparent)' }}
            >
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
                {s.achievementReason}
              </p>
              <p style={{ color: 'var(--color-text)' }}>{achievement.reason}</p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg border py-2 text-sm font-medium transition-colors"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          onMouseOver={e => { e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)' }}
          onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          {s.close}
        </button>
      </div>
    </div>
  )
}

// ─── Home Tab ────────────────────────────────────────────

function HomeTab({
  employee,
  portal,
  s,
  lang,
  unsignedSops,
  feedEvents,
  badgesEnabled,
  creditsEnabled,
  bonusesEnabled,
  selectedMonth,
  currentMonth,
  isCurrentMonth,
  onSelectMonth,
  onOpenSop,
  onSelectAchievement,
}: {
  employee: Employee
  portal: PortalHomeData | null
  s: ReturnType<typeof useLang>['t']
  lang: 'en' | 'id'
  unsignedSops: Sop[]
  feedEvents: FeedEvent[]
  badgesEnabled: boolean
  creditsEnabled: boolean
  bonusesEnabled: boolean
  selectedMonth: string
  currentMonth: string
  isCurrentMonth: boolean
  onSelectMonth: (month: string) => void
  onOpenSop: (sop: Sop) => void
  onSelectAchievement: (achievement: AchievementSummary) => void
}) {
  const earliestMonth = monthFromIsoDate(employee.created_at)
  // Past months: pending SOPs and the activity feed are filtered to that
  // month so the page reads as a snapshot of what happened then.
  const visibleUnsignedSops = isCurrentMonth ? unsignedSops : []
  const visibleFeedEvents = isCurrentMonth
    ? feedEvents
    : feedEvents.filter(ev => monthFromIsoDate(ev.created_at) === selectedMonth)
  const divisor = portal?.org.credits_divisor ?? 1000
  const baseWage = portal?.contract?.base_wage_idr ?? null
  const baselineAllowance = portal?.contract?.allowance_idr ?? 0
  const creditsNet = portal?.credit_net ?? 0
  const creditIdr = divisor > 0 && baselineAllowance > 0
    ? Math.round((creditsNet * baselineAllowance) / divisor)
    : 0
  const allowanceShrink = Math.min(baselineAllowance, Math.max(0, -creditIdr))
  const effectiveAllowance = Math.max(0, baselineAllowance - allowanceShrink)
  const projectedCreditsIdr = Math.max(0, creditIdr)
  const allowancePct = baselineAllowance > 0
    ? Math.round((effectiveAllowance / baselineAllowance) * 100)
    : 0
  const hasContract = !!portal?.contract && baseWage !== null
  const allowanceColor = allowanceGradientColor(allowancePct / 100)
  const creditsColor = portal?.credit_frozen
    ? 'var(--color-text-tertiary)'
    : creditsNet < 0
      ? 'var(--color-danger)'
      : '#3b82f6'
  const bonusSum = portal?.bonus_sum ?? 0
  const bonusColor = '#a855f7'
  const ringSegments = [
    { key: 'base', valueIdr: baseWage ?? 0, color: 'var(--color-text-secondary)', icon: <ShieldPath /> },
    {
      key: 'allowance',
      valueIdr: effectiveAllowance,
      baselineIdr: baselineAllowance,
      color: allowanceColor,
      icon: <WalletPath />,
    },
    { key: 'credits', valueIdr: projectedCreditsIdr, color: creditsColor, icon: <CoinPath /> },
    { key: 'bonus', valueIdr: bonusSum, color: bonusColor, icon: <GiftPath /> },
  ]

  return (
    <div className="pt-6">
      {/* Month strip: swipe between past months for a snapshot view. The
          current month sits at the right edge; the user's hire month bounds
          the left edge. */}
      <MonthStrip
        selectedMonth={selectedMonth}
        earliestMonth={earliestMonth}
        currentMonth={currentMonth}
        onSelect={onSelectMonth}
        lang={lang}
      />

      {/* Hero: ring */}
      <div className="mb-6 flex flex-col items-center">
        <CompensationRing
          segments={ringSegments}
          photoUrl={employee.photo_url}
          employeeId={employee.id}
          size={300}
        />
      </div>

      {/* Wallet balance */}
      <WalletBalance
        hasContract={hasContract}
        baseWage={baseWage ?? 0}
        effectiveAllowance={effectiveAllowance}
        baselineAllowance={baselineAllowance}
        creditsNet={creditsNet}
        bonusSum={bonusSum}
        divisor={divisor}
        s={s}
        lang={lang}
      />

      {/* Stat rows */}
      <div className="mb-6 space-y-2">
        <StatRow
          icon={<ShieldIcon />}
          label={s.portalBaseWage}
          info={s.portalBaseWageInfo}
          value={hasContract ? formatIdr(baseWage ?? 0, lang) : '—'}
          accent="var(--color-text-secondary)"
        />
        <StatRow
          icon={<WalletIcon />}
          label={s.portalAllowance}
          info={s.portalAllowanceInfo}
          value={hasContract ? formatIdr(effectiveAllowance, lang) : '—'}
          accent={hasContract ? allowanceColor : undefined}
        />
        {creditsEnabled && (
          <StatRow
            icon={<CreditsIcon />}
            label={s.portalCredits}
            info={s.portalCreditsInfo}
            value={creditsNet}
            accent={creditsColor}
          >
            {portal && portal.credit_adjustments.length > 0 ? (
              <ul className="space-y-2">
                {portal.credit_adjustments.map(adj => (
                  <li key={adj.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm" style={{ color: 'var(--color-text)' }}>{adj.reason}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                        {new Date(adj.created_at).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short' })}
                        {adj.paid_out_at && adj.payout_idr != null && <> · {formatIdr(adj.payout_idr, lang)}</>}
                      </p>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{
                        backgroundColor: adj.amount > 0 ? 'var(--color-success-bg, #dcfce7)' : 'var(--color-diff-remove)',
                        color: adj.amount > 0 ? 'var(--color-success, #16a34a)' : 'var(--color-danger)',
                      }}
                    >
                      {adj.amount > 0 ? '+' : ''}{adj.amount}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{s.portalNoCreditsActivity}</p>
            )}
          </StatRow>
        )}
        {bonusesEnabled && (
          <StatRow
            icon={<GiftIcon />}
            label={s.portalBonus}
            info={s.portalBonusInfo}
            value={formatIdr(bonusSum, lang)}
            accent={bonusColor}
          >
            {portal && portal.bonus_adjustments.length > 0 ? (
              <ul className="space-y-2">
                {portal.bonus_adjustments.map(adj => (
                  <li key={adj.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm" style={{ color: 'var(--color-text)' }}>{adj.reason}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                        {new Date(adj.created_at).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <span
                      className="shrink-0 text-xs font-semibold"
                      style={{ color: bonusColor }}
                    >
                      +{formatIdr(adj.amount_idr, lang)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>—</p>
            )}
          </StatRow>
        )}
        {badgesEnabled && (
          <StatRow
            icon={<TrophyIcon />}
            label={s.portalAchievements}
            info={s.portalAchievementsInfo}
            value={portal?.achievements.length ?? 0}
            accent="var(--color-warning)"
          >
            {portal && portal.achievements.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {portal.achievements.map(a => (
                  <button
                    key={a.unlock_id}
                    type="button"
                    onClick={() => onSelectAchievement(a)}
                    className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-transform hover:scale-105"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary, var(--color-bg))' }}
                    title={a.description || a.reason || undefined}
                  >
                    <BadgeGlyph icon={a.icon} size={20} />
                    <span style={{ color: 'var(--color-text)' }}>{a.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{s.portalNoAchievements}</p>
            )}
          </StatRow>
        )}
        <StatRow
          icon={<SparkIcon />}
          label={s.portalExperience}
          info={s.portalExperienceInfo}
          value={s.portalExperienceXp(portal?.lifetime_xp ?? 0)}
          accent="#eab308"
        >
          {portal && (portal.days_employed > 0 || portal.hours_per_week > 0) ? (
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {s.portalExperienceBreakdown(portal.days_employed, Math.round(portal.hours_per_week))}
            </p>
          ) : (
            <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{s.portalNoContractYet}</p>
          )}
        </StatRow>
      </div>

      {/* Pending actions */}
      {visibleUnsignedSops.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{s.pendingActions}</h2>
          <div className="space-y-2">
            {visibleUnsignedSops.map(sop => (
              <button
                key={sop.id}
                onClick={() => onOpenSop(sop)}
                className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--color-diff-remove)' }}>
                  <DocIcon />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>{sop.title}</p>
                  <p className="text-xs" style={{ color: 'var(--color-warning)' }}>{s.needsSignature}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Activity feed — moved here from a dedicated tab so the home page
          provides a complete picture of what's happening with the employee. */}
      <ActivityFeed events={visibleFeedEvents} lang={lang} s={s} />
    </div>
  )
}

// ─── Activity Feed ───────────────────────────────────────
// Vertical timeline of feed_events for the employee. Lives at the bottom of
// the home tab now that activity is no longer its own surface.

function ActivityFeed({
  events,
  lang,
  s,
}: {
  events: FeedEvent[]
  lang: 'en' | 'id'
  s: ReturnType<typeof useLang>['t']
}) {
  if (events.length === 0) {
    return (
      <div className="mt-2 border-t pt-5" style={{ borderColor: 'var(--color-border)' }}>
        <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--color-text)' }}>{s.portalActivityTitle}</h2>
        <div className="rounded-xl border p-6 text-center" style={{ borderColor: 'var(--color-border)' }}>
          <div className="mx-auto flex h-10 w-10 items-center justify-center" style={{ color: 'var(--color-text-tertiary)' }}><ActivityIcon /></div>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{s.noActivity}</p>
        </div>
      </div>
    )
  }

  const eventLabels: Record<string, string> = {
    sop_signed: s.eventSopSigned,
    sop_updated: s.eventSopUpdated,
    sop_assigned: s.eventSopAssigned,
    contract_assigned: s.eventContractAssigned,
    contract_updated: s.eventContractUpdated,
    contract_signed: s.eventContractSigned,
    bonus_awarded: s.eventRewardGiven,
    achievement_unlocked: s.eventBadgeEarned,
    welcome: s.eventWelcome,
  }
  const eventIcons: Record<string, React.ReactNode> = {
    sop_signed: <CheckCircle />,
    sop_updated: <DocIcon />,
    sop_assigned: <DocIcon />,
    contract_assigned: <ContractIcon />,
    contract_updated: <ContractIcon />,
    contract_signed: <CheckCircle />,
    bonus_awarded: <TrophyIcon />,
    achievement_unlocked: <BadgeIcon />,
    welcome: <HomeIcon />,
  }
  const eventColors: Record<string, string> = {
    sop_signed: 'var(--color-success)',
    sop_updated: 'var(--color-primary)',
    sop_assigned: 'var(--color-primary)',
    contract_assigned: 'var(--color-primary)',
    contract_updated: 'var(--color-primary)',
    bonus_awarded: 'var(--color-warning)',
    achievement_unlocked: 'var(--color-warning)',
    welcome: 'var(--color-success)',
  }

  return (
    <div className="mt-2 border-t pt-5" style={{ borderColor: 'var(--color-border)' }}>
      <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--color-text)' }}>{s.portalActivityTitle}</h2>
      <div className="space-y-0">
        {events.map((event, i) => {
          const isLast = i === events.length - 1
          const date = new Date(event.created_at)
          const timeStr = date.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })

          return (
            <div key={event.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: 'var(--color-bg-secondary)', color: eventColors[event.event_type] || 'var(--color-text-tertiary)' }}
                >
                  {eventIcons[event.event_type] || <ActivityIcon />}
                </div>
                {!isLast && <div className="w-px flex-1 min-h-4" style={{ backgroundColor: 'var(--color-border)' }} />}
              </div>
              <div className="pb-5 pt-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                  {eventLabels[event.event_type] || event.event_type}
                </p>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{event.title}</p>
                {event.description && (
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{event.description}</p>
                )}
                {event.event_type === 'sop_signed' && (event.metadata as Record<string, string>)?.signature_font && (
                  <p
                    className="mt-1 text-lg"
                    style={{ fontFamily: `'${(event.metadata as Record<string, string>).signature_font}', cursive`, color: 'var(--color-text-secondary)' }}
                  >
                    {event.title}
                  </p>
                )}
                <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{timeStr}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WalletBalance({
  hasContract,
  baseWage,
  effectiveAllowance,
  baselineAllowance,
  creditsNet,
  bonusSum,
  divisor,
  s,
  lang,
}: {
  hasContract: boolean
  baseWage: number
  effectiveAllowance: number
  baselineAllowance: number
  creditsNet: number
  bonusSum: number
  divisor: number
  s: ReturnType<typeof useLang>['t']
  lang: 'en' | 'id'
}) {
  if (!hasContract) {
    return (
      <div className="mb-6 text-center">
        <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{s.portalMonthlyPayout}</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{s.portalSetupCompensation}</p>
      </div>
    )
  }

  // Positive credits add a credits segment on top; negative credits have
  // already been applied to effectiveAllowance by the caller.
  const creditIdr = divisor > 0 && baselineAllowance > 0
    ? Math.round((creditsNet * baselineAllowance) / divisor)
    : 0
  const projectedCreditsIdr = Math.max(0, creditIdr)
  const total = baseWage + effectiveAllowance + projectedCreditsIdr + bonusSum
  const baseline = baseWage + baselineAllowance
  const delta = total - baseline

  const trendColor = delta > 0
    ? 'var(--color-success, #16a34a)'
    : delta < 0
      ? 'var(--color-danger)'
      : 'var(--color-text-tertiary)'

  return (
    <div className="mb-6 text-center">
      <p className="inline-flex items-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        {s.portalMonthlyPayout}
        <InfoTooltip text={s.portalMonthlyPayoutInfo} />
      </p>
      <p className="mt-1 text-4xl font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>
        {formatIdr(total, lang)}
      </p>
      <div
        className="mt-1 inline-flex items-center gap-1 text-xs font-medium"
        style={{ color: trendColor }}
      >
        <TrendIcon direction={delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'} />
        {delta === 0
          ? s.portalSteady
          : <>{delta > 0 ? '+' : ''}{formatIdr(delta, lang)} {s.portalVsBaseline}</>}
      </div>
    </div>
  )
}

function TrendIcon({ direction }: { direction: 'up' | 'down' | 'flat' }) {
  if (direction === 'up') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    )
  }
  if (direction === 'down') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
        <polyline points="17 18 23 18 23 12" />
      </svg>
    )
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function ShieldIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
}

function WalletIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
}

function CreditsIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h6M9 15h6"/></svg>
}

function GiftIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
}

function SparkIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v6M12 16v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M2 12h6M16 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24"/></svg>
}

// ─── Leaderboard Tab ─────────────────────────────────────

// ─── Badges Tab ───────────────────────────────────────────
// Shows every active badge definition for the org with the employee's
// unlock status. Locked badges render greyed out so the employee sees
// what's still earnable (motivation lever).

function BadgesTab({
  slugToken,
  lang,
  s,
  onSelectAchievement,
}: {
  slugToken: string
  lang: 'en' | 'id'
  s: ReturnType<typeof useLang>['t']
  onSelectAchievement: (achievement: AchievementSummary) => void
}) {
  const [badges, setBadges] = useState<BadgeData[] | null>(null)

  useEffect(() => {
    async function load() {
      const lastDash = slugToken.lastIndexOf('-')
      if (lastDash === -1) return
      const slug = slugToken.slice(0, lastDash)
      const token = slugToken.slice(lastDash + 1)
      const { data } = await supabase.rpc('portal_badges', { emp_slug: slug, emp_token: token })
      setBadges((data as unknown as BadgeData[] | null) ?? [])
    }
    load()
  }, [slugToken])

  if (!badges) {
    return <div className="py-8 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{s.loading}</div>
  }

  const earned = badges.filter(b => b.unlocked).length
  const total = badges.length

  const grouped = new Map<BadgeGroup, BadgeData[]>()
  for (const b of badges) {
    const { group } = classifyBadge(b)
    if (!grouped.has(group)) grouped.set(group, [])
    grouped.get(group)!.push(b)
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => {
      const sa = classifyBadge(a).sortKey
      const sb = classifyBadge(b).sortKey
      if (sa !== sb) return sa - sb
      if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  const groupLabels: Record<BadgeGroup, string> = {
    tenure: s.badgeGroupTenure,
    compensation: s.badgeGroupCompensation,
    leaderboard: s.badgeGroupLeaderboard,
    manual: s.portalBadgeGroupRecognition,
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{s.portalBadgesTabLabel}</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{s.portalBadgesProgress(earned, total)}</p>
      </div>

      {total === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{s.portalNoAchievements}</p>
      ) : (
        <div className="space-y-6">
          {BADGE_GROUP_ORDER.filter(g => (grouped.get(g)?.length ?? 0) > 0).map(group => (
            <section key={group}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
                {groupLabels[group]}
              </h3>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {grouped.get(group)!.map(b => (
                  <BadgeTile
                    key={b.definition_id}
                    badge={b}
                    s={s}
                    onSelectAchievement={onSelectAchievement}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {/* Suppress unused warning until Indonesian-specific formatting is needed here. */}
      <span className="hidden">{lang}</span>
    </div>
  )
}

function BadgeTile({
  badge: b,
  s,
  onSelectAchievement,
}: {
  badge: BadgeData
  s: ReturnType<typeof useLang>['t']
  onSelectAchievement: (a: AchievementSummary) => void
}) {
  const clickable = b.unlocked && b.unlock_id && b.unlocked_at
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => {
        if (!clickable) return
        onSelectAchievement({
          unlock_id: b.unlock_id!,
          unlocked_at: b.unlocked_at!,
          reason: b.reason,
          name: b.name,
          icon: b.icon,
          description: b.description,
          is_featured: b.is_featured,
        })
      }}
      className="relative flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border p-2 text-center transition-transform"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: b.unlocked ? 'var(--color-bg-secondary, var(--color-bg))' : 'transparent',
        cursor: clickable ? 'pointer' : 'default',
      }}
      title={b.description || (b.unlocked ? undefined : s.portalBadgeLocked)}
    >
      <div
        style={{
          filter: b.unlocked ? 'none' : 'grayscale(1) brightness(0.85)',
          opacity: b.unlocked ? 1 : 0.4,
          lineHeight: 0,
        }}
      >
        <BadgeGlyph icon={b.icon} size={56} />
      </div>
      <span
        className="line-clamp-2 text-xs font-medium leading-tight"
        style={{ color: b.unlocked ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}
      >
        {b.name}
      </span>
      {b.unlocked && b.unlock_count > 1 && (
        <span
          className="absolute right-1 top-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
        >
          {s.portalBadgeRepeats(b.unlock_count)}
        </span>
      )}
    </button>
  )
}

function LeaderboardTab({
  slugToken,
  s,
  badgesEnabled,
}: {
  slugToken: string
  s: ReturnType<typeof useLang>['t']
  badgesEnabled: boolean
}) {
  const [period, setPeriod] = useState<'month' | 'quarter' | 'all-time'>('month')
  const [data, setData] = useState<LeaderboardData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const lastDash = slugToken.lastIndexOf('-')
      if (lastDash === -1) { setLoading(false); return }
      const slug = slugToken.slice(0, lastDash)
      const token = slugToken.slice(lastDash + 1)
      const { data: rpcData } = await supabase.rpc('portal_leaderboard', {
        emp_slug: slug,
        emp_token: token,
        period_kind: period,
      })
      setData(rpcData as unknown as LeaderboardData)
      setLoading(false)
    }
    load()
  }, [slugToken, period])

  const periodOptions: Array<{ key: 'month' | 'quarter' | 'all-time'; label: string }> = [
    { key: 'month', label: s.leaderboardPeriodMonth },
    { key: 'quarter', label: s.leaderboardPeriodQuarter },
    { key: 'all-time', label: s.leaderboardPeriodAllTime },
  ]

  const rows = data?.rows ?? []
  const viewerId = data?.viewer_employee_id

  return (
    <div className="pt-4">
      {/* Period selector */}
      <div
        className="mb-4 flex rounded-lg p-0.5"
        style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
      >
        {periodOptions.map(opt => {
          const active = period === opt.key
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setPeriod(opt.key)}
              className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: active ? 'var(--color-bg)' : 'transparent',
                color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                boxShadow: active ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {loading && rows.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{s.loading}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border p-6 text-center" style={{ borderColor: 'var(--color-border)' }}>
          <div className="mx-auto flex h-10 w-10 items-center justify-center" style={{ color: 'var(--color-text-tertiary)' }}><TrophyIcon /></div>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{s.leaderboardEmpty}</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row, i) => {
            const rank = i + 1
            const isViewer = row.employee_id === viewerId
            const dept = row.departments[0]
            return (
              <li
                key={row.employee_id}
                className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
                style={{
                  borderColor: isViewer ? 'var(--color-primary)' : 'var(--color-border)',
                  backgroundColor: isViewer ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'transparent',
                }}
              >
                <span
                  className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums"
                  style={{
                    color: rank <= 3 ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
                  }}
                >
                  {rank}
                </span>
                <AvatarWithBadge
                  employeeId={row.employee_id}
                  photoUrl={row.photo_url}
                  name={row.name}
                  size={36}
                  badges={row.top_achievements}
                  enabled={badgesEnabled}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                    {row.name}
                    {isViewer && (
                      <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}>
                        {s.leaderboardYou}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {dept}
                    {badgesEnabled && dept && row.achievements_count > 0 && ' · '}
                    {badgesEnabled && row.achievements_count > 0 && s.leaderboardAchievementsCount(row.achievements_count)}
                  </p>
                </div>
                <span
                  className="shrink-0 text-sm font-semibold tabular-nums"
                  style={{
                    color: row.net_credits > 0
                      ? 'var(--color-primary)'
                      : row.net_credits < 0
                        ? 'var(--color-danger)'
                        : 'var(--color-text-tertiary)',
                  }}
                >
                  {row.net_credits > 0 ? '+' : ''}{row.net_credits}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {data?.period_label && rows.length > 0 && (
        <p className="mt-3 text-center text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
          {data.period_label} · {s.leaderboardNetCreditsFooter}
        </p>
      )}
    </div>
  )
}
