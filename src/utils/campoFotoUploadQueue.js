import { readStorage, writeStorage } from './persist'
import { isDataUrl, isRemoteMediaUrl, uploadMediaDataUrl } from './mediaUpload'
import { patchFotoEntradaVisita } from './igrejasVisitas'

const QUEUE_KEY = 'campo_foto_upload_queue'
const MAX_QUEUE = 40

let processing = false
let listenersOn = false

function readQueue() {
  const arr = readStorage(QUEUE_KEY, [])
  return Array.isArray(arr) ? arr : []
}

function writeQueue(list) {
  writeStorage(QUEUE_KEY, (list || []).slice(0, MAX_QUEUE))
}

export function enqueueCampoFotoUpload(item) {
  if (item?.igrejaId == null || !item?.entradaId || !isDataUrl(item?.fotoDataUrl)) return
  const q = readQueue()
  const key = `${item.igrejaId}|${item.entradaId}`
  const filtered = q.filter(x => `${x.igrejaId}|${x.entradaId}` !== key)
  filtered.unshift({
    igrejaId: item.igrejaId,
    entradaId: String(item.entradaId),
    entityId: String(item.entityId || `campo-${item.igrejaId}-${item.entradaId}`).slice(0, 64),
    fotoDataUrl: item.fotoDataUrl,
    tentativas: Number(item.tentativas) || 0,
    enqueuedAt: Date.now(),
  })
  writeQueue(filtered)
}

async function processOne(entry) {
  const up = await uploadMediaDataUrl({
    scope: 'equipe',
    entityId: entry.entityId,
    dataUrl: entry.fotoDataUrl,
  })
  if (!up.ok || !up.url) return { ok: false, error: up.error || 'upload_fail' }
  const reg = patchFotoEntradaVisita(entry.igrejaId, entry.entradaId, up.url)
  if (!reg) return { ok: false, error: 'patch_fail' }
  const { flushAfterSave } = await import('./persist.js')
  await flushAfterSave().catch(() => {})
  return { ok: true, url: up.url }
}

/** Processa fila de fotos de check-in que ficaram em data URL. */
export async function processCampoFotoUploadQueue({ limit = 5 } = {}) {
  if (processing || typeof window === 'undefined') return { processed: 0, remaining: 0 }
  processing = true
  let processed = 0
  try {
    let q = readQueue()
    while (processed < limit && q.length) {
      const entry = q[0]
      if (!entry || !isDataUrl(entry.fotoDataUrl)) {
        q = q.slice(1)
        writeQueue(q)
        continue
      }
      const result = await processOne(entry)
      if (result.ok) {
        q = q.slice(1)
        writeQueue(q)
        processed += 1
        continue
      }
      entry.tentativas = (Number(entry.tentativas) || 0) + 1
      if (entry.tentativas >= 8) {
        q = q.slice(1)
      } else {
        q[0] = entry
        q = [...q.slice(1), entry]
      }
      writeQueue(q)
      processed += 1
      if (result.error === 'no_auth') break
    }
    return { processed, remaining: readQueue().length }
  } finally {
    processing = false
  }
}

export function installCampoFotoRetryListeners() {
  if (listenersOn || typeof window === 'undefined') return
  listenersOn = true
  const run = () => {
    processCampoFotoUploadQueue({ limit: 3 }).catch(() => {})
  }
  window.addEventListener('online', run)
  setTimeout(run, 2500)
}

/** Escaneia visitas com foto ainda em data URL e enfileira (boot). */
export function repararFilaCampoFotosPendentes() {
  const visitas = readStorage('igrejas_visitas', {})
  if (!visitas || typeof visitas !== 'object') return 0
  let n = 0
  for (const [id, raw] of Object.entries(visitas)) {
    const hist = raw?.historico
    if (!Array.isArray(hist)) continue
    for (const h of hist) {
      if (!isDataUrl(h?.foto) || isRemoteMediaUrl(h?.foto)) continue
      if (String(h.origem || '') !== 'campo') continue
      enqueueCampoFotoUpload({
        igrejaId: id,
        entradaId: h.id,
        entityId: `campo-retry-${id}-${h.id}`,
        fotoDataUrl: h.foto,
      })
      n += 1
    }
  }
  return n
}
