import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { translations, type Lang, type Translations } from '../lib/translations'

type LanguageContextValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  toggle: () => void
  t: Translations
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function getInitialLang(): Lang {
  const stored = localStorage.getItem('flodok-lang')
  if (stored === 'en' || stored === 'id') return stored
  const browser = navigator.language.toLowerCase()
  return browser.startsWith('id') ? 'id' : 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang)

  useEffect(() => {
    localStorage.setItem('flodok-lang', lang)
    document.documentElement.lang = lang
  }, [lang])

  const setLang = (next: Lang) => setLangState(next)
  const toggle = () => setLangState(l => (l === 'en' ? 'id' : 'en'))

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggle, t: translations[lang] }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLang() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLang must be used within LanguageProvider')
  return ctx
}
