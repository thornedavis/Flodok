import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { DashboardLayout, PublicLayout } from './components/Layout'
import { Login } from './pages/auth/Login'
import { Signup } from './pages/auth/Signup'
import { Overview } from './pages/dashboard/Overview'
import { Employees } from './pages/dashboard/Employees'
import { SOPs } from './pages/dashboard/SOPs'
import { SOPEdit } from './pages/dashboard/SOPEdit'
import { SOPHistory } from './pages/dashboard/SOPHistory'
import { Contracts } from './pages/dashboard/Contracts'
import { ContractEdit } from './pages/dashboard/ContractEdit'
import { Pending } from './pages/dashboard/Pending'
import { Settings } from './pages/dashboard/Settings'
import { SOPView } from './pages/public/SOPView'

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
      {/* Public SOP view */}
      <Route element={<PublicLayout />}>
        <Route path="/sop/:slugToken" element={<SOPView />} />
      </Route>

      {/* Auth routes */}
      {!session ? (
        <>
          <Route path="/login" element={<Login onSignIn={signIn} />} />
          <Route path="/signup" element={<Signup onSignUp={signUp} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
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

            <Route path="/dashboard/sops" element={<SOPs user={user} />} />
            <Route path="/dashboard/sops/:id/edit" element={<SOPEdit user={user} />} />
            <Route path="/dashboard/sops/:id/history" element={<SOPHistory />} />
            <Route path="/dashboard/contracts" element={<Contracts user={user} />} />
            <Route path="/dashboard/contracts/:id/edit" element={<ContractEdit user={user} />} />
            <Route path="/dashboard/pending" element={<Pending user={user} />} />
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

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
