import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import html2pdf from 'html2pdf.js'
import { supabase } from '../../lib/supabase'
import { getAvatarGradient, getInitials } from '../../lib/avatar'
import { useTheme } from '../../hooks/useTheme'
import type { Employee, Sop, SopSignature, Organization, Contract } from '../../types/database'

// ─── i18n ────────────────────────────────────────────────
type Lang = 'en' | 'id'

const t = {
  en: {
    sops: 'SOPs',
    contracts: 'Contracts',
    bonuses: 'Bonuses',
    comingSoon: 'Coming soon',
    notFoundTitle: 'Not Found',
    notFoundDesc: 'This link is invalid or has expired.',
    loading: 'Loading...',
    noActiveSops: 'No active SOPs yet.',
    noActiveContracts: 'No active contracts yet.',
    version: 'Version',
    acknowledgeTitle: 'Acknowledge & Sign',
    acknowledgeDesc: 'By selecting a signature style below, you acknowledge that you have read and understood this SOP.',
    chooseStyle: 'Choose your signature style',
    confirmSign: 'Confirm & Sign',
    signing: 'Signing...',
    signedBy: 'Signed by',
    notifications: 'Notifications',
    noNotifications: 'All caught up!',
    needsSignature: 'Needs your signature',
    docOptions: 'Options',
    downloadPdf: 'Download PDF',
    downloadingPdf: 'Generating...',
    contentLang: 'Content language',
    english: 'English',
    indonesian: 'Bahasa',
  },
  id: {
    sops: 'SOP',
    contracts: 'Kontrak',
    bonuses: 'Bonus',
    comingSoon: 'Segera hadir',
    notFoundTitle: 'Tidak Ditemukan',
    notFoundDesc: 'Tautan ini tidak valid atau sudah kedaluwarsa.',
    loading: 'Memuat...',
    noActiveSops: 'Belum ada SOP aktif.',
    noActiveContracts: 'Belum ada kontrak aktif.',
    version: 'Versi',
    acknowledgeTitle: 'Konfirmasi & Tanda Tangan',
    acknowledgeDesc: 'Dengan memilih gaya tanda tangan di bawah, Anda mengonfirmasi bahwa Anda telah membaca dan memahami SOP ini.',
    chooseStyle: 'Pilih gaya tanda tangan Anda',
    confirmSign: 'Konfirmasi & Tanda Tangan',
    signing: 'Menandatangani...',
    signedBy: 'Ditandatangani oleh',
    notifications: 'Notifikasi',
    noNotifications: 'Semua sudah diperbarui!',
    needsSignature: 'Perlu tanda tangan Anda',
    docOptions: 'Opsi',
    downloadPdf: 'Unduh PDF',
    downloadingPdf: 'Membuat...',
    contentLang: 'Bahasa konten',
    english: 'English',
    indonesian: 'Bahasa',
  },
}

type Tab = 'sops' | 'contracts' | 'bonuses'

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

function StarIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
}

function MoreIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
}

function CheckCircle() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-success)' }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
}

// ─── Main Component ──────────────────────────────────────
export function SOPView() {
  const { slugToken } = useParams<{ slugToken: string }>()
  const { theme, toggle: toggleTheme } = useTheme()
  const [lang, setLang] = useState<Lang>('id')
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [org, setOrg] = useState<Organization | null>(null)
  const [notFound, setNotFound] = useState(false)

  // Data
  const [sops, setSops] = useState<Sop[]>([])
  const [activeSop, setActiveSop] = useState<Sop | null>(null)
  const [sopSignatures, setSopSignatures] = useState<Record<string, SopSignature>>({})
  const [contracts, setContracts] = useState<Contract[]>([])
  const [activeContract, setActiveContract] = useState<Contract | null>(null)

  // UI
  const [tab, setTab] = useState<Tab>('sops')
  const [selectedFont, setSelectedFont] = useState(SIGNATURE_FONTS[0].name)
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState('')
  const [showNotifications, setShowNotifications] = useState(false)
  const [showDocMenu, setShowDocMenu] = useState(false)
  const [docContentLang, setDocContentLang] = useState<'en' | 'id'>('en')

  const signSectionRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const docMenuRef = useRef<HTMLDivElement>(null)
  const docContentRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)

  const s = t[lang]

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

      const [sopsResult, contractsResult, orgResult] = await Promise.all([
        supabase.from('sops').select('*').eq('employee_id', emp.id).eq('status', 'active').order('created_at'),
        supabase.from('contracts').select('*').eq('employee_id', emp.id).eq('status', 'active').order('created_at'),
        supabase.from('organizations').select('*').eq('id', emp.org_id).single(),
      ])

      setOrg(orgResult.data)

      const sopList = sopsResult.data || []
      setSops(sopList)
      if (sopList.length > 0) setActiveSop(sopList[0])

      const contractList = contractsResult.data || []
      setContracts(contractList)
      if (contractList.length > 0) setActiveContract(contractList[0])

      // Load signatures
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
    }
    load()
  }, [slugToken])

  // Notifications: unsigned SOPs
  const unsignedSops = sops.filter(s => !sopSignatures[s.id])
  const notificationCount = unsignedSops.length

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
    setSigning(false)
  }

  // Get document content based on content language toggle
  function getDocContent(doc: { content_markdown: string; content_markdown_id?: string | null }) {
    if (docContentLang === 'id' && doc.content_markdown_id) return doc.content_markdown_id
    if (docContentLang === 'en') return doc.content_markdown
    return doc.content_markdown // fallback
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
        <div className="mx-auto flex max-w-lg items-center justify-between">
          {/* Left: org name */}
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{org?.name || 'Flodok'}</span>

          {/* Right: controls */}
          <div className="flex items-center gap-3">
            {/* Language toggle */}
            <button
              onClick={() => setLang(l => l === 'en' ? 'id' : 'en')}
              className="rounded-md px-2 py-1 text-xs font-semibold"
              style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
            >
              {lang === 'en' ? 'EN' : 'ID'}
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
                  className="absolute right-0 top-full mt-2 w-72 rounded-xl border shadow-lg"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                >
                  <div className="border-b px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
                    <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{s.notifications}</span>
                  </div>
                  {unsignedSops.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                      {s.noNotifications}
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto">
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
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Profile Card ─── */}
      <div className="px-4 pb-4 pt-6">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center gap-4">
            {employee.photo_url ? (
              <img src={employee.photo_url} alt={employee.name} className="h-14 w-14 rounded-full object-cover ring-2 ring-white/20" />
            ) : (
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white ring-2 ring-white/20"
                style={{ background: getAvatarGradient(employee.id) }}
              >
                {getInitials(employee.name)}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{employee.name}</h1>
              <p className="truncate text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {employee.department && <span>{employee.department}</span>}
                {employee.department && org?.name && <span> &middot; </span>}
                {org?.name}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Content Area (scrollable, padded for bottom nav) ─── */}
      <div className="flex-1 px-4 pb-24">
        <div className="mx-auto max-w-lg">

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
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ─── Bonuses Tab Content ─── */}
          {tab === 'bonuses' && (
            <div className="rounded-xl border p-6 text-center" style={{ borderColor: 'var(--color-border)' }}>
              <div className="mx-auto flex h-10 w-10 items-center justify-center" style={{ color: 'var(--color-text-tertiary)' }}><StarIcon /></div>
              <p className="mt-2 text-sm font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{s.comingSoon}</p>
            </div>
          )}

        </div>
      </div>

      {/* ─── Bottom Tab Bar ─── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t no-print" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
        <div className="mx-auto flex max-w-lg">
          {([
            { key: 'sops' as Tab, label: s.sops, icon: <DocIcon />, badge: notificationCount },
            { key: 'contracts' as Tab, label: s.contracts, icon: <ContractIcon /> },
            { key: 'bonuses' as Tab, label: s.bonuses, icon: <StarIcon /> },
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
    </div>
  )
}
