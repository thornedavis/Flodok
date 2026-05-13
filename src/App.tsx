import { createBrowserRouter, RouterProvider, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { DashboardLayout, PublicLayout } from './components/Layout'
import { Login } from './pages/auth/Login'
import { Signup } from './pages/auth/Signup'
import { AcceptInvite } from './pages/auth/AcceptInvite'
import { ResetPassword } from './pages/auth/ResetPassword'
import { Overview } from './pages/dashboard/Overview'
import { Employees } from './pages/dashboard/Employees'
import { EmployeeEdit } from './pages/dashboard/EmployeeEdit'
import { Hiring } from './pages/dashboard/Hiring'
import { HiringRequestEdit } from './pages/dashboard/HiringRequestEdit'
import { HiringRequestDetail } from './pages/dashboard/HiringRequestDetail'
import { JobDescriptionEdit } from './pages/dashboard/JobDescriptionEdit'
import { Recruitment } from './pages/dashboard/Recruitment'
import { Company } from './pages/dashboard/Company'
import { Documents } from './pages/dashboard/Documents'
import { SOPEdit } from './pages/dashboard/SOPEdit'
import { SOPHistory } from './pages/dashboard/SOPHistory'
import { ContractEdit } from './pages/dashboard/ContractEdit'
import { ContractHistory } from './pages/dashboard/ContractHistory'
import { DocumentTemplateEdit } from './pages/dashboard/DocumentTemplateEdit'
import { Performance } from './pages/dashboard/Performance'
import { Spotlight } from './pages/dashboard/Spotlight'
import { SpotlightEdit } from './pages/dashboard/SpotlightEdit'
import { Pending } from './pages/dashboard/Pending'
import { Inbox } from './pages/dashboard/Inbox'
import { Settings } from './pages/dashboard/Settings'
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
  const { session, user, loading, signIn, signUp, signOut } = useAuth()

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
          <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: 'var(--color-bg)' }}>
            <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Setting up your account...</div>
          </div>
        } />
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
            <Route path="/dashboard/recruitment" element={<Recruitment user={user} />} />
            <Route path="/dashboard/company" element={<Company user={user} />} />

            <Route path="/dashboard/documents" element={<Documents user={user} />} />
            <Route path="/dashboard/documents/sop/:id/edit" element={<SOPEdit user={user} />} />
            <Route path="/dashboard/documents/sop/:id/history" element={<SOPHistory />} />
            <Route path="/dashboard/documents/contract/:id/edit" element={<ContractEdit user={user} />} />
            <Route path="/dashboard/documents/contract/:id/history" element={<ContractHistory />} />
            <Route path="/dashboard/document-templates/:id/edit" element={<DocumentTemplateEdit user={user} />} />

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
            <Route path="/dashboard/spotlight" element={<Spotlight user={user} />} />
            <Route path="/dashboard/spotlight/new" element={<SpotlightEdit user={user} />} />
            <Route path="/dashboard/spotlight/:id/edit" element={<SpotlightEdit user={user} />} />
            <Route path="/dashboard/pending" element={<Pending user={user} />} />
            <Route path="/dashboard/inbox" element={<Inbox user={user} />} />
            <Route path="/dashboard/settings" element={<Settings user={user} />} />
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
