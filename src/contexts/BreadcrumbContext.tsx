import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type BreadcrumbContextValue = {
  trailing: string | null
  setTrailing: (label: string | null) => void
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null)

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [trailing, setTrailing] = useState<string | null>(null)
  return (
    <BreadcrumbContext.Provider value={{ trailing, setTrailing }}>
      {children}
    </BreadcrumbContext.Provider>
  )
}

export function useBreadcrumb() {
  const ctx = useContext(BreadcrumbContext)
  if (!ctx) throw new Error('useBreadcrumb must be used within BreadcrumbProvider')
  return ctx
}

export function useBreadcrumbTrailing(label: string | null) {
  const { setTrailing } = useBreadcrumb()
  useEffect(() => {
    setTrailing(label)
    return () => setTrailing(null)
  }, [label, setTrailing])
}
