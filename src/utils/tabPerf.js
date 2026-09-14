/** Medição leve de tempo até paint ao trocar de aba (dev / diagnóstico). */
const MAX_LOGS = 24

export function markTabSwitch(tabId) {
  if (typeof window === 'undefined' || !tabId) return
  const t0 = performance.now()
  window.__tabPerfPending = { tabId, t0 }
}

export function measureTabPaint(tabId) {
  if (typeof window === 'undefined' || !tabId) return
  const pending = window.__tabPerfPending
  if (!pending || pending.tabId !== tabId) return

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const ms = Math.round(performance.now() - pending.t0)
      window.__tabPerf = window.__tabPerf || {}
      window.__tabPerf[tabId] = ms
      const log = window.__tabPerfLog || []
      log.push({ tabId, ms, at: Date.now() })
      if (log.length > MAX_LOGS) log.shift()
      window.__tabPerfLog = log
      if (import.meta.env?.DEV) {
        console.info(`[perf] aba "${tabId}": ${ms}ms até paint`)
      }
      window.__tabPerfPending = null
    })
  })
}
