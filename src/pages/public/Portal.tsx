import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import html2pdf from 'html2pdf.js'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../hooks/useTheme'
import { useLang } from '../../contexts/LanguageContext'
import { primaryDept } from '../../lib/employee'
import { formatIdr, allowanceGradientColor } from '../../lib/credits'
import { formatRelativeTime } from '../../lib/relativeTime'
import { renderMergeFields } from '../../lib/mergeFields'
import { CompensationRing, ShieldPath, WalletPath, CoinPath, GiftPath } from '../../components/portal/CompensationRing'
import { StatRow } from '../../components/portal/StatRow'
import { InfoTooltip } from '../../components/InfoTooltip'
import { AvatarWithBadge } from '../../components/portal/AvatarWithBadge'
import type { Employee, Sop, SopSignature, Organization, Contract, ContractSignature, FeedEvent } from '../../types/database'

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

type Tab = 'home' | 'sops' | 'contracts' | 'leaderboard' | 'badges'

type BadgeData = {
  definition_id: string
  name: string
  description: string | null
  icon: string | null
  is_featured: boolean
  trigger_type: string
  unlocked: boolean
  unlock_count: number
  unlock_id: string | null
  unlocked_at: string | null
  reason: string | null
}

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

// ─── Signature Fonts ─────────────────────────────────────
const SIGNATURE_FONTS = [
  { name: 'Dancing Script', label: 'Classic' },
  { name: 'Great Vibes', label: 'Elegant' },
  { name: 'Caveat', label: 'Casual' },
  { name: 'Homemade Apple', label: 'Handwritten' },
]

// Load Google Fonts for signatures
const fontLink = document.createElement('link')
fontLink.rel = 'stylesheet'
fontLink.href = `https://fonts.googleapis.com/css2?family=${SIGNATURE_FONTS.map(f => f.name.replace(/ /g, '+')).join('&family=')}&display=swap`
if (!document.head.querySelector(`link[href="${fontLink.href}"]`)) {
  document.head.appendChild(fontLink)
}

// ─── Icons (inline SVGs) ─────────────────────────────────
function HomeIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
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
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
}

function ActivityIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
}

function TrophyIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
}

function BadgeIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z"/><path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/></svg>
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
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([])
  const [portal, setPortal] = useState<PortalHomeData | null>(null)
  const [unreadInformational, setUnreadInformational] = useState(0)
  const [recentInformational, setRecentInformational] = useState<FeedEvent[]>([])
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementSummary | null>(null)

  // UI
  const [tab, setTab] = useState<Tab>('home')
  const [selectedFont, setSelectedFont] = useState(SIGNATURE_FONTS[0].name)
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState('')
  const [showNotifications, setShowNotifications] = useState(false)
  const [showDocMenu, setShowDocMenu] = useState(false)
  const [docContentLang, setDocContentLang] = useState<'en' | 'id'>('id')

  const signSectionRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const docMenuRef = useRef<HTMLDivElement>(null)
  const docContentRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifications(false)
      if (docMenuRef.current && !docMenuRef.current.contains(e.target as Node)) setShowDocMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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

      const [sopsResult, contractsResult, orgResult, portalResult, unreadResult, recentResult] = await Promise.all([
        supabase.from('sops').select('*').eq('employee_id', emp.id).eq('status', 'active').order('created_at'),
        supabase.from('contracts').select('*').eq('employee_id', emp.id).eq('status', 'active').order('created_at'),
        supabase.from('organizations').select('*').eq('id', emp.org_id).single(),
        supabase.rpc('portal_home', { emp_slug: slug, emp_token: token }),
        supabase.rpc('portal_unread_count', { emp_slug: slug, emp_token: token }),
        supabase
          .from('feed_events')
          .select('*')
          .eq('employee_id', emp.id)
          .in('event_type', ['achievement_unlocked', 'bonus_awarded'])
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      if (portalResult.data) setPortal(portalResult.data as unknown as PortalHomeData)
      if (typeof unreadResult.data === 'number') setUnreadInformational(unreadResult.data)
      if (recentResult.data) setRecentInformational(recentResult.data)

      setOrg(orgResult.data)

      const sopList = sopsResult.data || []
      setSops(sopList)
      if (sopList.length > 0) setActiveSop(sopList[0])

      const contractList = contractsResult.data || []
      setContracts(contractList)
      if (contractList.length > 0) setActiveContract(contractList[0])

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

      // Load signatures (contracts)
      if (contractList.length > 0) {
        const { data: csigs } = await supabase
          .from('contract_signatures')
          .select('*')
          .in('contract_id', contractList.map(c => c.id))
          .eq('employee_id', emp.id)

        if (csigs) {
          const sigMap: Record<string, ContractSignature> = {}
          for (const sig of csigs) {
            const contract = contractList.find(c => c.id === sig.contract_id)
            if (contract && sig.version_number === contract.current_version) {
              sigMap[sig.contract_id] = sig
            }
          }
          setContractSignatures(sigMap)
        }
      }
    }
    load()
  }, [slugToken])

  async function loadFeedEvents() {
    if (!employee) return
    const { data } = await supabase
      .from('feed_events')
      .select('*')
      .eq('employee_id', employee.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setFeedEvents(data)
  }

  // Load feed eagerly once the employee is resolved — the activity feed
  // now lives at the bottom of the home tab rather than its own tab.
  useEffect(() => {
    if (employee) loadFeedEvents()
  }, [employee])

  // Notifications: unsigned SOPs (actionable) + unread informational events.
  // Actionable items persist until acted on; informational items clear when
  // the user opens the bell dropdown.
  const unsignedSops = sops.filter(s => !sopSignatures[s.id])
  const notificationCount = unsignedSops.length + unreadInformational

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

  function goToNotification(sop: Sop) {
    setTab('sops')
    setActiveSop(sop)
    setShowNotifications(false)
    setTimeout(() => signSectionRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
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
  function getDocContent(doc: { content_markdown: string; content_markdown_id?: string | null }) {
    const raw = docContentLang === 'id' && doc.content_markdown_id
      ? doc.content_markdown_id
      : doc.content_markdown
    return renderMergeFields(raw, {
      employee,
      organization: org,
      contract: activeContract,
      today: new Date(),
      lang: docContentLang,
    })
  }

  async function handleDownloadPdf() {
    if (!docContentRef.current) return
    const title = tab === 'sops' ? activeSop?.title : activeContract?.title
    const filename = (title || 'document').replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase()

    setDownloading(true)
    setShowDocMenu(false)

    try {
      // Clone content and force light theme for PDF rendering
      const clone = docContentRef.current.cloneNode(true) as HTMLElement
      clone.style.color = '#111827'
      clone.style.backgroundColor = '#ffffff'
      clone.style.padding = '0'
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

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--color-bg)' }}>

      {/* ─── Top Bar ─── */}
      <div className="sticky top-0 z-30 border-b px-4 py-2 no-print" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
        <div className="relative mx-auto flex max-w-lg items-center justify-between">
          {/* Left: org identity */}
          <div className="flex min-w-0 items-center gap-2">
            {org?.logo_url && (
              <img
                src={org.logo_url}
                alt=""
                className="h-5 w-5 shrink-0 rounded object-contain"
              />
            )}
            <span className="truncate text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
              {org?.name || 'Flodok'}
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
              onClick={() => {
                const next = lang === 'en' ? 'id' : 'en'
                setLang(next)
                setDocContentLang(next)
              }}
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

                  {unsignedSops.length === 0 && recentInformational.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                      {s.noNotifications}
                    </div>
                  ) : (
                    <div className="max-h-96 overflow-y-auto">
                      {/* To Do — actionable, persistent */}
                      {unsignedSops.length > 0 && (
                        <div>
                          <div className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
                            {s.notificationsToDo}
                          </div>
                          {unsignedSops.map(sop => (
                            <button
                              key={sop.id}
                              onClick={() => goToNotification(sop)}
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

          {/* ─── Home Tab ─── */}
          {tab === 'home' && (
            <HomeTab
              employee={employee}
              portal={portal}
              s={s}
              lang={lang}
              unsignedSops={unsignedSops}
              feedEvents={feedEvents}
              onOpenSop={sop => {
                setTab('sops')
                setActiveSop(sop)
                setTimeout(() => signSectionRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
              }}
              onSelectAchievement={setSelectedAchievement}
            />
          )}

          {/* ─── SOP Tab Content ─── */}
          {tab === 'sops' && (
            <>
              {sops.length === 0 ? (
                <div className="rounded-xl border p-6 text-center" style={{ borderColor: 'var(--color-border)' }}>
                  <DocIcon />
                  <p className="mt-2 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{s.noActiveSops}</p>
                </div>
              ) : (
                <>
                  {/* SOP list if multiple */}
                  {sops.length > 1 && (
                    <div className="mb-4 space-y-2">
                      {sops.map(sop => (
                        <button
                          key={sop.id}
                          onClick={() => setActiveSop(sop)}
                          className="flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors"
                          style={{
                            borderColor: activeSop?.id === sop.id ? 'var(--color-primary)' : 'var(--color-border)',
                            backgroundColor: activeSop?.id === sop.id ? 'var(--color-bg-secondary)' : 'transparent',
                          }}
                        >
                          <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{sop.title}</p>
                            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{s.version} {sop.current_version}</p>
                          </div>
                          {sopSignatures[sop.id] ? <CheckCircle /> : (
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
                              {s.needsSignature}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Active SOP content */}
                  {activeSop && (
                    <div>
                      {/* Doc header */}
                      <div className="mb-4 flex items-start justify-between">
                        <div>
                          <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>{activeSop.title}</h2>
                          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{s.version} {activeSop.current_version}</p>
                        </div>
                        {/* Doc menu */}
                        <div className="relative" ref={docMenuRef}>
                          <button onClick={() => setShowDocMenu(!showDocMenu)} className="rounded-lg p-2" style={{ color: 'var(--color-text-tertiary)' }}>
                            <MoreIcon />
                          </button>
                          {showDocMenu && (
                            <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border py-1 shadow-lg" style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
                              {/* Content language */}
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
                              <div className="px-3 py-2">
                                <button
                                  onClick={handleDownloadPdf}
                                  disabled={downloading}
                                  className="w-full rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                                  style={{ backgroundColor: 'var(--color-primary)' }}
                                >
                                  {downloading ? s.downloadingPdf : s.downloadPdf}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Content */}
                      <div ref={docContentRef} className="sop-content max-w-none" style={{ color: 'var(--color-text)' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {getDocContent(activeSop)}
                        </ReactMarkdown>
                      </div>

                      {/* Signature */}
                      <div ref={signSectionRef} className="mt-8 border-t pt-6 no-print" style={{ borderColor: 'var(--color-border)' }}>
                        {sopSignatures[activeSop.id] ? (
                          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                            <div className="flex items-center gap-3">
                              <CheckCircle />
                              <div>
                                <p
                                  className="text-xl"
                                  style={{ fontFamily: `'${sopSignatures[activeSop.id].signature_font || 'Dancing Script'}', cursive`, color: 'var(--color-text)' }}
                                >
                                  {sopSignatures[activeSop.id].typed_name}
                                </p>
                                <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                                  {new Date(sopSignatures[activeSop.id].signed_at).toLocaleString()} &middot; {s.version} {sopSignatures[activeSop.id].version_number}
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <h3 className="mb-1 text-base font-semibold" style={{ color: 'var(--color-text)' }}>{s.acknowledgeTitle}</h3>
                            <p className="mb-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{s.acknowledgeDesc}</p>
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
                              onClick={handleSign}
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
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ─── Contracts Tab Content ─── */}
          {tab === 'contracts' && (
            <>
              {contracts.length === 0 ? (
                <div className="rounded-xl border p-6 text-center" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="mx-auto flex h-10 w-10 items-center justify-center" style={{ color: 'var(--color-text-tertiary)' }}><ContractIcon /></div>
                  <p className="mt-2 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{s.noActiveContracts}</p>
                </div>
              ) : (
                <>
                  {contracts.length > 1 && (
                    <div className="mb-4 space-y-2">
                      {contracts.map(c => (
                        <button
                          key={c.id}
                          onClick={() => setActiveContract(c)}
                          className="flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors"
                          style={{
                            borderColor: activeContract?.id === c.id ? 'var(--color-primary)' : 'var(--color-border)',
                            backgroundColor: activeContract?.id === c.id ? 'var(--color-bg-secondary)' : 'transparent',
                          }}
                        >
                          <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{c.title}</p>
                            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{s.version} {c.current_version}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {activeContract && (
                    <div>
                      <div className="mb-4 flex items-start justify-between">
                        <div>
                          <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>{activeContract.title}</h2>
                          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{s.version} {activeContract.current_version}</p>
                        </div>
                        {/* Doc menu (reuse same pattern) */}
                        <div className="relative" ref={docMenuRef}>
                          <button onClick={() => setShowDocMenu(!showDocMenu)} className="rounded-lg p-2" style={{ color: 'var(--color-text-tertiary)' }}>
                            <MoreIcon />
                          </button>
                          {showDocMenu && (
                            <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border py-1 shadow-lg" style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
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
                              <div className="px-3 py-2">
                                <button
                                  onClick={handleDownloadPdf}
                                  disabled={downloading}
                                  className="w-full rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                                  style={{ backgroundColor: 'var(--color-primary)' }}
                                >
                                  {downloading ? s.downloadingPdf : s.downloadPdf}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div ref={docContentRef} className="sop-content max-w-none" style={{ color: 'var(--color-text)' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {getDocContent(activeContract)}
                        </ReactMarkdown>
                      </div>

                      {/* Contract signature */}
                      <div className="mt-8 border-t pt-6 no-print" style={{ borderColor: 'var(--color-border)' }}>
                        {contractSignatures[activeContract.id] ? (
                          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                            <div className="flex items-center gap-3">
                              <CheckCircle />
                              <div>
                                <p
                                  className="text-xl"
                                  style={{ fontFamily: `'${contractSignatures[activeContract.id].signature_font || 'Dancing Script'}', cursive`, color: 'var(--color-text)' }}
                                >
                                  {contractSignatures[activeContract.id].typed_name}
                                </p>
                                <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                                  {new Date(contractSignatures[activeContract.id].signed_at).toLocaleString()} &middot; {s.version} {contractSignatures[activeContract.id].version_number}
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <h3 className="mb-1 text-base font-semibold" style={{ color: 'var(--color-text)' }}>{s.acknowledgeTitle}</h3>
                            <p className="mb-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{s.acknowledgeContractDesc}</p>
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
                              onClick={handleSignContract}
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
                    </div>
                  )}
                </>
              )}
            </>
          )}


          {/* ─── Leaderboard Tab Content ─── */}
          {tab === 'leaderboard' && employee && (
            <LeaderboardTab
              slugToken={slugToken!}
              s={s}
            />
          )}

          {tab === 'badges' && employee && (
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
            { key: 'sops' as Tab, label: s.sops, icon: <DocIcon />, badge: notificationCount },
            { key: 'contracts' as Tab, label: s.contracts, icon: <ContractIcon /> },
            { key: 'badges' as Tab, label: s.portalBadgesTabLabel, icon: <BadgeIcon /> },
            { key: 'leaderboard' as Tab, label: s.leaderboard, icon: <TrophyIcon /> },
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
        {org?.logo_url && <img src={org.logo_url} alt={org.name} className="mb-4 h-10" />}
        <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{org?.name}</div>
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
            className="mb-4 flex h-20 w-20 items-center justify-center rounded-full text-4xl"
            style={{ backgroundColor: 'var(--color-warning-subtle, rgba(234, 179, 8, 0.15))' }}
          >
            {achievement.icon && achievement.icon.length === 1 ? achievement.icon : '🏆'}
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
  onOpenSop,
  onSelectAchievement,
}: {
  employee: Employee
  portal: PortalHomeData | null
  s: ReturnType<typeof useLang>['t']
  lang: 'en' | 'id'
  unsignedSops: Sop[]
  feedEvents: FeedEvent[]
  onOpenSop: (sop: Sop) => void
  onSelectAchievement: (achievement: AchievementSummary) => void
}) {
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
                  <span className="text-lg">{a.icon || '🏅'}</span>
                  <span style={{ color: 'var(--color-text)' }}>{a.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{s.portalNoAchievements}</p>
          )}
        </StatRow>
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
      {unsignedSops.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{s.pendingActions}</h2>
          <div className="space-y-2">
            {unsignedSops.map(sop => (
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
      <ActivityFeed events={feedEvents} lang={lang} s={s} />
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{s.portalBadgesTabLabel}</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{s.portalBadgesProgress(earned, total)}</p>
      </div>

      {total === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{s.portalNoAchievements}</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {badges.map(b => {
            const showIcon = b.icon && b.icon.length === 1 ? b.icon : '🏆'
            const clickable = b.unlocked && b.unlock_id && b.unlocked_at
            return (
              <button
                key={b.definition_id}
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
                className="relative flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border p-2 text-center transition-transform"
                style={{
                  borderColor: 'var(--color-border)',
                  backgroundColor: b.unlocked ? 'var(--color-bg-secondary, var(--color-bg))' : 'transparent',
                  opacity: b.unlocked ? 1 : 0.45,
                  filter: b.unlocked ? 'none' : 'grayscale(0.8)',
                  cursor: clickable ? 'pointer' : 'default',
                }}
                title={b.description || (b.unlocked ? undefined : s.portalBadgeLocked)}
              >
                <span className="text-3xl leading-none">{showIcon}</span>
                <span className="line-clamp-2 text-xs font-medium leading-tight" style={{ color: 'var(--color-text)' }}>
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
          })}
        </div>
      )}
      {/* Suppress unused warning until Indonesian-specific formatting is needed here. */}
      <span className="hidden">{lang}</span>
    </div>
  )
}

function LeaderboardTab({
  slugToken,
  s,
}: {
  slugToken: string
  s: ReturnType<typeof useLang>['t']
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
                    {dept && row.achievements_count > 0 && ' · '}
                    {row.achievements_count > 0 && s.leaderboardAchievementsCount(row.achievements_count)}
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
