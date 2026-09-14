/** Evita fan-out de SYNC_EVENT / recálculos pesados durante troca de aba. */
let quietUntil = 0
let syncPausedUntil = 0
let deferTimer = null
const deferQueue = new Set()
let deferRunning = false

const SYNC_PAUSE_STORAGE_KEY = 'campanha_sync_paused_until'
let syncBroadcast = null

function initSyncBroadcast() {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return
  try {
    syncBroadcast = new BroadcastChannel('campanha-sync-coord')
    syncBroadcast.onmessage = (ev) => {
      const until = Number(ev?.data?.until || 0)
      if (ev?.data?.type === 'sync_pause' && until > syncPausedUntil) {
        syncPausedUntil = until
      }
    }
  } catch { /* ignore */ }
}

initSyncBroadcast()

function readStoredPauseUntil() {
  try {
    return Number(sessionStorage.getItem(SYNC_PAUSE_STORAGE_KEY) || 0) || 0
  } catch {
    return 0
  }
}

export function markUiQuiet(ms = 12000) {
  quietUntil = Date.now() + ms
}

export function markSyncPaused(ms = 10000) {
  syncPausedUntil = Date.now() + ms
  try {
    sessionStorage.setItem(SYNC_PAUSE_STORAGE_KEY, String(syncPausedUntil))
    syncBroadcast?.postMessage({ type: 'sync_pause', until: syncPausedUntil })
  } catch { /* ignore */ }
}

export function isUiQuiet() {
  return Date.now() < quietUntil
}

export function isSyncPaused() {
  const stored = readStoredPauseUntil()
  if (stored > syncPausedUntil) syncPausedUntil = stored
  return Date.now() < syncPausedUntil
}

export function deferHeavyUiWork(fn, { minDelay = 400 } = {}) {
  if (typeof fn !== 'function') return
  deferQueue.add(fn)
  if (deferTimer) clearTimeout(deferTimer)
  const storedPause = readStoredPauseUntil()
  const pauseUntil = Math.max(syncPausedUntil, storedPause)
  const wait = Math.max(
    minDelay,
    quietUntil - Date.now() + 120,
    pauseUntil - Date.now() + 120,
  )
  deferTimer = setTimeout(() => {
    deferTimer = null
    pumpDeferQueue()
  }, Math.max(0, wait))
}

function pumpDeferQueue() {
  if (deferRunning) return
  if (isUiQuiet() || isSyncPaused()) {
    deferTimer = setTimeout(pumpDeferQueue, 500)
    return
  }
  if (deferQueue.size === 0) return

  deferRunning = true
  const batch = [...deferQueue]
  deferQueue.clear()
  let i = 0

  const runNext = () => {
    if (i >= batch.length) {
      deferRunning = false
      if (deferQueue.size > 0) pumpDeferQueue()
      return
    }
    const job = batch[i]
    i += 1
    try { job() } catch { /* ignore */ }
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(runNext, { timeout: 900 })
    } else {
      setTimeout(runNext, 24)
    }
  }
  runNext()
}

export function msUntilSyncAllowed() {
  const stored = readStoredPauseUntil()
  const pauseUntil = Math.max(syncPausedUntil, stored)
  return Math.max(0, quietUntil - Date.now(), pauseUntil - Date.now())
}

export function shouldDeferSyncUi() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return true
  return isUiQuiet() || isSyncPaused()
}
