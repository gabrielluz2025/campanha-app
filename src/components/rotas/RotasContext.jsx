import { createContext, useContext } from 'react'

export const RotasContext = createContext(null)

export function useRotasCtx() {
  const ctx = useContext(RotasContext)
  if (!ctx) throw new Error('useRotasCtx must be used within RotasProvider')
  return ctx
}

export function RotasProvider({ value, children }) {
  return <RotasContext.Provider value={value}>{children}</RotasContext.Provider>
}
