import { getPhpAuthContext } from '../lib/cloudSync'

const PHP_API = typeof window !== 'undefined'
  ? `${window.location.origin}/api.php`
  : '/api.php'

let running = false
let abortCtrl = null
let lastToken = ''
let loopPromise = null

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function authHeaders() {
  const { accessToken, tenantId } = getPhpAuthContext()
  const h = {}
  if (accessToken) h.Authorization = `Bearer ${accessToken}`
  if (tenantId) h['X-Tenant-Id'] = tenantId
  return h
}

async function fetchSyncToken(signal) {
  const res = await fetch(`${PHP_API}?action=store_sync_token&_=${Date.now()}`, {
    headers: authHeaders(),
    signal,
  })
  if (!res.ok) return ''
  const data = await res.json().catch(() => ({}))
  return String(data?.token || '')
}

/**
 * Long-poll autenticado por tenant — avisa quando outro aparelho grava no store.
 * @param {(detail?: object) => void} onRemoteChange
 */
export function startTenantSyncWatch(onRemoteChange) {
  stopTenantSyncWatch()
  if (typeof window === 'undefined') return
  running = true
  abortCtrl = new AbortController()

  loopPromise = (async () => {
    try {
      lastToken = await fetchSyncToken(abortCtrl.signal).catch(() => '')
    } catch { /* ignore */ }

    while (running && !abortCtrl?.signal.aborted) {
      const { accessToken, tenantId } = getPhpAuthContext()
      if (!accessToken || !tenantId) {
        await sleep(2500)
        continue
      }
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        await sleep(2000)
        continue
      }
      try {
        const q = new URLSearchParams({
          since: lastToken || '',
          timeout: '25',
          _: String(Date.now()),
        })
        const res = await fetch(`${PHP_API}?action=store_sync_wait&${q}`, {
          headers: authHeaders(),
          signal: abortCtrl.signal,
        })
        if (res.status === 304) continue
        if (res.ok) {
          const data = await res.json().catch(() => ({}))
          if (data?.token) lastToken = String(data.token)
          if (data?.changed) {
            try { onRemoteChange?.(data) } catch { /* ignore */ }
          }
        }
      } catch (e) {
        if (e?.name === 'AbortError') break
        await sleep(2000)
      }
    }
  })()
}

export function stopTenantSyncWatch() {
  running = false
  if (abortCtrl) {
    try { abortCtrl.abort() } catch { /* ignore */ }
    abortCtrl = null
  }
  loopPromise = null
}

export function isTenantSyncWatchRunning() {
  return running
}
