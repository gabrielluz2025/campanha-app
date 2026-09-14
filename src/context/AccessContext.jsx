import { createContext, useContext, useMemo } from 'react'
import { canAccessContratos, isSomenteContratos } from '../utils/acessoAbas'

const AccessContext = createContext({
  canViewFinance: true,
  canViewContratos: true,
  somenteContratos: false,
  role: null,
  allowedTabs: null,
})

export function AccessProvider({
  canViewFinance = true,
  role = null,
  allowedTabs = null,
  children,
}) {
  const value = useMemo(() => {
    const access = { role, allowedTabs, canViewFinance: !!canViewFinance }
    return {
      canViewFinance: !!canViewFinance,
      canViewContratos: canAccessContratos(access),
      somenteContratos: isSomenteContratos(access),
      role,
      allowedTabs: allowedTabs ?? null,
    }
  }, [canViewFinance, role, allowedTabs])

  return (
    <AccessContext.Provider value={value}>
      {children}
    </AccessContext.Provider>
  )
}

export function useAccess() {
  return useContext(AccessContext)
}

export function useCanViewFinance() {
  return useContext(AccessContext).canViewFinance
}

export function useCanViewContratos() {
  return useContext(AccessContext).canViewContratos
}

export function useSomenteContratos() {
  return useContext(AccessContext).somenteContratos
}
