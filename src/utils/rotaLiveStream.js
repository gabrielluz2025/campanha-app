import { getPhpAuthContext } from '../lib/cloudSync'

const PHP_API = typeof window !== 'undefined'
  ? `${window.location.origin}/api.php`
  : '/api.php'

function phpAuthHeaders() {
  const { accessToken, tenantId } = getPhpAuthContext()
  const h = {}
  if (accessToken) h.Authorization = `Bearer ${accessToken}`
  if (tenantId) h['X-Tenant-Id'] = tenantId
  return h
}

const sseHandles = new Map()
const posEtagCache = new Map()

/** Lista sessões ao vivo no servidor (shares não encerrados) — requer login. */
export async function fetchLiveSessions() {
  const { accessToken, tenantId } = getPhpAuthContext()
  if (!accessToken || !tenantId) return []
  try {
    const res = await fetch(`${PHP_API}?action=rota_live_sessions&_=${Date.now()}`, {
      headers: phpAuthHeaders(),
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data?.sessions) ? data.sessions : []
  } catch {
    return []
  }
}

/** Append ponto à trilha persistida no servidor. */
export async function appendTrilhaPonto(shareId, ponto) {
  if (!shareId || !ponto?.lat) return false
  try {
    const res = await fetch(`${PHP_API}?action=rota_trilha&shareId=${encodeURIComponent(shareId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shareId, ponto }),
      keepalive: true,
    })
    return res.ok
  } catch {
    return false
  }
}

/** Carrega trilha persistida (replay). */
export async function fetchTrilha(shareId) {
  if (!shareId) return []
  try {
    const res = await fetch(`${PHP_API}?action=rota_trilha&shareId=${encodeURIComponent(shareId)}&_=${Date.now()}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data?.pontos) ? data.pontos : []
  } catch {
    return []
  }
}

function notifyPosicaoListeners(handle, pos) {
  if (!pos?.lat) return
  for (const fn of handle.listeners) {
    try { fn(pos) } catch { /* ignore */ }
  }
}

function openSseConnection(shareId, handle) {
  if (handle.closed) return
  try {
    handle.es?.close()
  } catch { /* ignore */ }

  let es
  try {
    es = new EventSource(`${PHP_API}?action=rota_stream&shareId=${encodeURIComponent(shareId)}`)
  } catch {
    handle.mode = 'poll'
    startPollLoop(shareId, handle)
    return
  }

  handle.es = es
  handle.mode = 'sse'
  handle.backoffMs = 2000

  es.addEventListener('posicao', (ev) => {
    try {
      const pos = JSON.parse(ev.data)
      if (pos?.etag) posEtagCache.set(String(shareId), pos.etag)
      notifyPosicaoListeners(handle, pos)
    } catch { /* ignore */ }
  })

  es.addEventListener('keepalive', () => {
    handle.lastAlive = Date.now()
  })

  es.onerror = () => {
    try { es.close() } catch { /* ignore */ }
    handle.es = null
    if (handle.closed || handle.listeners.size === 0) return
    const wait = Math.min(handle.backoffMs || 2000, 8000)
    handle.backoffMs = Math.min((handle.backoffMs || 2000) + 1000, 8000)
    handle.reconnectTimer = setTimeout(() => {
      handle.reconnectTimer = null
      if (!handle.closed && handle.listeners.size > 0) openSseConnection(shareId, handle)
    }, wait)
  }
}

function startPollLoop(shareId, handle) {
  if (handle.closed) return
  handle.mode = handle.mode || 'longpoll'
  let cancelled = false
  handle.cancelPoll = () => { cancelled = true }

  async function loop() {
    while (!cancelled && !handle.closed && handle.listeners.size > 0) {
      try {
        const since = posEtagCache.get(String(shareId)) || ''
        const url = `${PHP_API}?action=rota_posicao_wait&shareId=${encodeURIComponent(shareId)}${since ? `&since=${encodeURIComponent(since)}` : ''}`
        const res = await fetch(url, { signal: AbortSignal.timeout(28000) })
        if (res.status === 304) continue
        if (res.ok) {
          const text = await res.text()
          if (text && text !== 'null') {
            const pos = JSON.parse(text)
            const etag = res.headers.get('ETag')
            if (etag) posEtagCache.set(String(shareId), etag.replace(/"/g, ''))
            notifyPosicaoListeners(handle, pos)
          }
        }
      } catch { /* ignore */ }
      if (!cancelled && handle.mode === 'poll') {
        await new Promise(r => setTimeout(r, 500))
      }
    }
  }
  loop()
}

/**
 * SSE com reconexão automática — fallback long-poll se EventSource falhar.
 * @returns {() => void} unsubscribe
 */
export function subscribePosicaoAoVivo(shareId, onUpdate) {
  if (!shareId || typeof onUpdate !== 'function') return () => {}

  const key = String(shareId)
  if (sseHandles.has(key)) {
    const h = sseHandles.get(key)
    h.listeners.add(onUpdate)
    return () => {
      h.listeners.delete(onUpdate)
      if (h.listeners.size === 0) teardownHandle(key, h)
    }
  }

  const handle = {
    listeners: new Set([onUpdate]),
    es: null,
    closed: false,
    backoffMs: 2000,
    reconnectTimer: null,
    cancelPoll: null,
    mode: null,
  }
  sseHandles.set(key, handle)

  if (typeof EventSource === 'undefined') {
    handle.mode = 'poll'
    startPollLoop(shareId, handle)
  } else {
    openSseConnection(shareId, handle)
  }

  return () => {
    handle.listeners.delete(onUpdate)
    if (handle.listeners.size === 0) teardownHandle(key, handle)
  }
}

function teardownHandle(key, handle) {
  handle.closed = true
  if (handle.reconnectTimer) clearTimeout(handle.reconnectTimer)
  if (handle.cancelPoll) handle.cancelPoll()
  try { handle.es?.close() } catch { /* ignore */ }
  sseHandles.delete(key)
}

export function closeAllPosicaoStreams() {
  for (const [key, h] of sseHandles.entries()) teardownHandle(key, h)
}

/** Poll rápido com ETag (304 = sem mudança). */
export async function fetchPosicaoComEtag(shareId) {
  if (!shareId) return null
  const headers = {}
  const prev = posEtagCache.get(String(shareId))
  if (prev) headers['If-None-Match'] = `"${prev}"`
  try {
    const res = await fetch(
      `${PHP_API}?action=rota_posicao&shareId=${encodeURIComponent(shareId)}`,
      { headers, signal: AbortSignal.timeout(8000) },
    )
    if (res.status === 304) return { unchanged: true }
    if (!res.ok) return null
    const etag = res.headers.get('ETag')
    if (etag) posEtagCache.set(String(shareId), etag.replace(/"/g, ''))
    const text = await res.text()
    if (!text || text === 'null') return null
    const pos = JSON.parse(text)
    return pos?.lat ? pos : null
  } catch {
    return null
  }
}
