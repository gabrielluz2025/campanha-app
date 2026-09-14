const QUEUE_KEY = 'campanha_rota_gps_queue'
const MAX_QUEUE = 120

function readQueue() {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function writeQueue(list) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-MAX_QUEUE)))
  } catch { /* ignore */ }
}

/** Enfileira posição GPS quando offline ou API falhou. */
export function enqueueGpsPosition(shareId, posicao) {
  if (!shareId || !posicao?.lat) return
  const q = readQueue()
  q.push({ shareId: String(shareId), posicao, at: Date.now() })
  writeQueue(q)
}

/** Envia fila pendente — chamar ao voltar online ou após falha. */
export async function flushGpsQueue(postFn) {
  if (typeof postFn !== 'function') return 0
  const q = readQueue()
  if (!q.length) return 0
  const rest = []
  let sent = 0
  for (const item of q) {
    try {
      const ok = await postFn(item.shareId, item.posicao)
      if (ok) sent += 1
      else rest.push(item)
    } catch {
      rest.push(item)
    }
  }
  writeQueue(rest)
  return sent
}

export function installGpsQueueAutoFlush(postFn) {
  if (typeof window === 'undefined') return () => {}
  const run = () => { flushGpsQueue(postFn).catch(() => {}) }
  window.addEventListener('online', run)
  run()
  return () => window.removeEventListener('online', run)
}
