import { createContext, useContext } from 'react'

const TabActiveContext = createContext(true)

export function TabActiveProvider({ active, children }) {
  return (
    <TabActiveContext.Provider value={Boolean(active)}>
      {children}
    </TabActiveContext.Provider>
  )
}

/** False quando a aba está montada mas escondida (keep-alive). */
export function useTabActive() {
  return useContext(TabActiveContext)
}
