import { useEffect, useState } from 'react'
import { createBrowserRouter, RouterProvider, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { DashboardLayout, PublicLayout } from './components/Layout'
import { Login } from './pages/auth/Login'
import { Signup } from './pages/auth/Signup'
import { AcceptInvite } from './pages/auth/AcceptInvite'
import { ResetPassword } from './pages/auth/ResetPassword'
import { ClaimOwner } from './pages/auth/ClaimOwner'
import { Onboarding } from './pages/onboarding/Onboarding'
import { Overview } from './pages/dashboard/Overview'
import { Employees } from './pages/dashboard/Employees'
import { EmployeeEdit } from './pages/dashboard/EmployeeEdit'
import { Hiring } from './pages/dashboard/Hiring'
import { HiringRequestEdit } from './pages/dashboard/HiringRequestEdit'
import { HiringRequestDetail } from './pages/dashboard/HiringRequestDetail'
import { Forms } from './pages/dashboard/Forms'
import { FormDetail } from './pages/dashboard/FormDetail'
import { FormConfig } from './pages/dashboard/FormConfig'
import { JobDescriptionEdit } from './pages/dashboard/JobDescriptionEdit'
import { Recruitment } from './pages/dashboard/Recruitment'
import { CandidateEdit } from './pages/dashboard/CandidateEdit'
import { Company } from './pages/dashboard/Company'
import { Documents } from './pages/dashboard/Documents'
import { SOPEdit } from './pages/dashboard/SOPEdit'
import { SOPHistory } from './pages/dashboard/SOPHistory'
import { ContractEdit } from './pages/dashboard/ContractEdit'
import { ContractHistory } from './pages/dashboard/ContractHistory'
import { NDAEdit } from './pages/dashboard/NDAEdit'
import { NDAHistory } from './pages/dashboard/NDAHistory'
import { LetterEdit } from './pages/dashboard/LetterEdit'
import { LetterHistory } from './pages/dashboard/LetterHistory'
import { JobDescriptionHistory } from './pages/dashboard/JobDescriptionHistory'
import { DocumentTemplateEdit } from './pages/dashboard/DocumentTemplateEdit'
import { Templates } from './pages/dashboard/Templates'
import { Performance } from './pages/dashboard/Performance'
import { PerformanceDetail } from './pages/dashboard/PerformanceDetail'
import { Payroll } from './pages/dashboard/Payroll'
import { Spotlight } from './pages/dashboard/Spotlight'
import { SpotlightEdit } from './pages/dashboard/SpotlightEdit'
import { Pending } from './pages/dashboard/Pending'
import { Inbox } from './pages/dashboard/Inbox'
import { Settings } from './pages/dashboard/Settings'
import { Trash } from './pages/dashboard/Trash'
import { Admin } from './pages/dashboard/Admin'
import { Portal } from './pages/public/Portal'
import { Landing } from './pages/public/Landing'
import { PublicSiteLayout } from './components/PublicSiteLayout'
import { Pricing } from './pages/public/Pricing'
import { About } from './pages/public/About'
import { Security } from './pages/public/Security'
import { Terms } from './pages/public/Terms'
import { Privacy } from './pages/public/Privacy'
import { Dpa } from './pages/public/Dpa'
import { HelpCenterLayout } from './components/HelpCenterLayout'
import { DocsIndex } from './pages/help/DocsIndex'
import { Doc } from './pages/help/Doc'
import { HelpContact } from './pages/help/HelpContact'
import { HelpFAQ } from './pages/help/FAQ'

function AppRoutes() {
  const { session, user, org, loading, recovering, signIn, signUp, signOut, recover } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <Routes>
      {/* Password recovery — matches before session check so the recovery
          session doesn't get bounced to /dashboard. */}
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Owner-claim acceptance — always accessible (arrives with an invite session) */}
      <Route path="/claim/:token" element={<ClaimOwner />} />

      {/* Public SOP view */}
      <Route element={<PublicLayout />}>
        <Route path="/portal/:slugToken" element={<Portal />} />
      </Route>

      {/* Marketing & legal pages — always accessible (signed in or out) */}
      <Route element={<PublicSiteLayout />}>
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/about" element={<About />} />
        {/* /contact is unified with /help/contact — same component, one
            destination for everyone. The redirect keeps the marketing URL
            working from links/SEO without duplicating the page. */}
        <Route path="/contact" element={<Navigate to="/help/contact" replace />} />
        <Route path="/security" element={<Security />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/dpa" element={<Dpa />} />
      </Route>

      {/* Help Center — always accessible (signed in or out) */}
      <Route element={<HelpCenterLayout />}>
        <Route path="/help" element={<DocsIndex />} />
        <Route path="/help/docs" element={<DocsIndex />} />
        <Route path="/help/docs/:slug" element={<Doc />} />
        <Route path="/help/contact" element={<HelpContact />} />
        <Route path="/help/faq" element={<HelpFAQ />} />
      </Route>

      {/* Invite acceptance — always accessible */}
      <Route path="/invite/:token" element={<AcceptInvite onSignUp={signUp} />} />

      {/* Auth routes */}
      {!session ? (
        <>
          <Route element={<PublicSiteLayout />}>
            <Route path="/" element={<Landing />} />
          </Route>
          <Route path="/login" element={<Login onSignIn={signIn} />} />
          <Route path="/signup" element={<Signup onSignUp={signUp} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      ) : !user ? (
        <Route path="*" element={
          <AccountSetup recover={recover} recovering={recovering} onSignOut={signOut} />
        } />
      ) : org && !org.onboarding_completed_at ? (
        <>
          {/* First-run setup wizard — gated on organizations.onboarding_completed_at.
              The always-accessible routes above (claim/invite/reset) still win by
              specificity, so an invited owner can still reach /claim mid-setup. */}
          <Route path="/onboarding" element={<Onboarding user={user} org={org} />} />
          <Route path="*" element={<Navigate to="/onboarding" replace />} />
        </>
      ) : (
        <>
          {/* Dashboard routes */}
          <Route element={<DashboardLayout user={user} onSignOut={signOut} />}>
            <Route path="/dashboard" element={<Overview user={user} />} />
            <Route path="/dashboard/employees" element={<Employees user={user} />} />
            <Route path="/dashboard/employees/:id/edit" element={<EmployeeEdit user={user} />} />
            <Route path="/dashboard/hiring" element={<Hiring user={user} />} />
            <Route path="/dashboard/hiring/new" element={<HiringRequestEdit user={user} />} />
            <Route path="/dashboard/hiring/jds/new" element={<JobDescriptionEdit user={user} />} />
            <Route path="/dashboard/hiring/jds/:id/edit" element={<JobDescriptionEdit user={user} />} />
            <Route path="/dashboard/hiring/:id" element={<HiringRequestDetail user={user} />} />
            <Route path="/dashboard/hiring/:id/edit" element={<HiringRequestEdit user={user} />} />
            <Route path="/dashboard/forms" element={<Forms user={user} />} />
            <Route path="/dashboard/forms/config/:formType" element={<FormConfig user={user} />} />
            <Route path="/dashboard/forms/:id" element={<FormDetail user={user} />} />
            <Route path="/dashboard/recruitment" element={<Recruitment user={user} />} />
            <Route path="/dashboard/recruitment/:id/edit" element={<CandidateEdit user={user} />} />
            <Route path="/dashboard/company" element={<Company user={user} />} />

            <Route path="/dashboard/documents" element={<Documents user={user} />} />
            <Route path="/dashboard/documents/sop/:id/edit" element={<SOPEdit user={user} />} />
            <Route path="/dashboard/documents/sop/:id/history" element={<SOPHistory />} />
            <Route path="/dashboard/documents/contract/:id/edit" element={<ContractEdit user={user} />} />
            <Route path="/dashboard/documents/contract/:id/history" element={<ContractHistory />} />
            <Route path="/dashboard/documents/nda/:id/edit" element={<NDAEdit user={user} />} />
            <Route path="/dashboard/documents/nda/:id/history" element={<NDAHistory />} />
            <Route path="/dashboard/documents/letter/:id/edit" element={<LetterEdit user={user} />} />
            <Route path="/dashboard/documents/letter/:id/history" element={<LetterHistory />} />
            <Route path="/dashboard/documents/job_description/:id/history" element={<JobDescriptionHistory />} />
            <Route path="/dashboard/document-templates/:id/edit" element={<DocumentTemplateEdit user={user} />} />
            <Route path="/dashboard/templates" element={<Templates user={user} />} />

            {/* Legacy redirects — preserve inbound links from before the
                Documents IA consolidation. Safe to remove once external
                bookmarks have aged out. */}
            <Route path="/dashboard/sops" element={<Navigate to="/dashboard/documents?type=sop" replace />} />
            <Route path="/dashboard/sops/:id/edit" element={<LegacyDocRedirect type="sop" action="edit" />} />
            <Route path="/dashboard/sops/:id/history" element={<LegacyDocRedirect type="sop" action="history" />} />
            <Route path="/dashboard/contracts" element={<Navigate to="/dashboard/documents?type=contract" replace />} />
            <Route path="/dashboard/contracts/:id/edit" element={<LegacyDocRedirect type="contract" action="edit" />} />
            <Route path="/dashboard/contracts/:id/history" element={<LegacyDocRedirect type="contract" action="history" />} />
            <Route path="/dashboard/performance" element={<Performance user={user} />} />
            <Route path="/dashboard/performance/:id" element={<PerformanceDetail user={user} />} />
            <Route path="/dashboard/payroll" element={<Payroll user={user} />} />
            <Route path="/dashboard/spotlight" element={<Spotlight user={user} />} />
            <Route path="/dashboard/spotlight/new" element={<SpotlightEdit user={user} />} />
            <Route path="/dashboard/spotlight/:id/edit" element={<SpotlightEdit user={user} />} />
            <Route path="/dashboard/pending" element={<Pending user={user} />} />
            <Route path="/dashboard/inbox" element={<Inbox user={user} />} />
            <Route path="/dashboard/trash" element={<Trash user={user} />} />
            <Route path="/dashboard/settings" element={<Settings user={user} />} />
            {/* Founder console — platform-wide admin. The component itself gates
                on user.is_platform_admin (redirects others); the admin_* RPCs
                re-check the bit server-side. */}
            <Route path="/dashboard/admin" element={<Admin user={user} />} />
          </Route>

          {/* Redirects */}
          <Route path="/login" element={<Navigate to="/dashboard" replace />} />
          <Route path="/signup" element={<Navigate to="/dashboard" replace />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </>
      )}
    </Routes>
  )
}

// Shown when a session exists but no users row does — a profile that wasn't
// provisioned (a pre-trigger orphan, or the signup trigger's exception
// fallback fired). Instead of an indefinite spinner, attempt a one-shot
// idempotent recovery on mount; if it still fails, offer an explicit retry and
// a sign-out escape. A successful recover() makes useAuth.user non-null, which
// re-renders AppRoutes straight into the dashboard.
function AccountSetup({
  recover,
  recovering,
  onSignOut,
}: {
  recover: () => Promise<{ error: unknown }>
  recovering: boolean
  onSignOut: () => void
}) {
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    recover().then(({ error }) => {
      if (!active) return
      setAttempted(true)
      if (error) setError((error as Error).message)
    })
    return () => { active = false }
  // run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function retry() {
    setError('')
    recover().then(({ error }) => {
      if (error) setError((error as Error).message)
    })
  }

  const settingUp = recovering || !attempted

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center"
      style={{ backgroundColor: 'var(--color-bg)' }}
    >
      <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        {settingUp ? 'Setting up your account…' : 'We couldn’t finish setting up your account.'}
      </div>
      {error && !settingUp && (
        <div className="max-w-sm text-xs" style={{ color: 'var(--color-danger)' }}>{error}</div>
      )}
      {!settingUp && (
        <div className="flex items-center gap-3">
          <button
            onClick={retry}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            Retry setup
          </button>
          <button
            onClick={onSignOut}
            className="rounded-lg border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

// Forwarder for legacy /dashboard/sops/:id/{edit,history} and
// /dashboard/contracts/:id/{edit,history} URLs. <Navigate> doesn't
// interpolate path params, so we read :id off the matched route and
// preserve the query string for completeness.
function LegacyDocRedirect({ type, action }: { type: 'sop' | 'contract'; action: 'edit' | 'history' }) {
  const { id } = useParams<{ id: string }>()
  const { search } = useLocation()
  if (!id) return <Navigate to="/dashboard/documents" replace />
  return <Navigate to={`/dashboard/documents/${type}/${id}/${action}${search}`} replace />
}

// Data router is required for `useBlocker` (used by the unsaved-changes
// warning). The single catch-all route lets the existing nested <Routes>
// inside <AppRoutes> keep working without restructuring the auth-conditional
// route tree.
const router = createBrowserRouter([{ path: '*', element: <AppRoutes /> }])

export default function App() {
  return <RouterProvider router={router} />
}
