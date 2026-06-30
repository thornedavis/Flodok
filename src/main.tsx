import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LanguageProvider } from './contexts/LanguageContext'

// Apply the saved/system theme before React paints, so EVERY route matches the
// home page — including the auth pages and the standalone /onboarding wizard,
// which don't call useTheme() themselves and would otherwise fall back to light
// on a direct load. Mirrors useTheme's getInitialTheme(): stored choice, else
// the OS preference. The in-app theme toggle keeps writing 'flodok-theme', so a
// later load here reflects it.
try {
  const stored = localStorage.getItem('flodok-theme')
  const dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.classList.toggle('dark', dark)
} catch { /* no-DOM guard; not expected in this SPA */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
)
