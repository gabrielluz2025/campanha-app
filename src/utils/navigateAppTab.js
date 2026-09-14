/** Navegação entre abas do App (Sidebar) via evento global. */
export const NAV_TAB_EVENT = 'campanha:navigate-tab'

export function navigateAppTab(tab, detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent(NAV_TAB_EVENT, { detail: { tab, ...detail } }))
  } catch { /* ignore */ }
}
