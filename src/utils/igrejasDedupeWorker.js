/**
 * Cliente do Web Worker de deduplicação de igrejas.
 * Fallback síncrono quando Worker indisponível ou lista pequena.
 */
import {
  colapsarIgrejasDuplicadas,
  filtrarCustomUnicas,
  patchesEnrichDeDuplicatas,
} from './igrejaDedupe'

const WORKER_MIN_LIST_SIZE = 50
const DEFAULT_TIMEOUT_MS = 20000

let worker = null
let workerFailed = false
let nextRequestId = 1
const pending = new Map()

function supportsWorker() {
  return typeof Worker !== 'undefined' && typeof window !== 'undefined'
}

function terminateWorker() {
  if (worker) {
    try { worker.terminate() } catch { /* ignore */ }
    worker = null
  }
  for (const [, entry] of pending) {
    clearTimeout(entry.timer)
    entry.reject(new Error('Worker encerrado'))
  }
  pending.clear()
}

function getWorker() {
  if (workerFailed || !supportsWorker()) return null
  if (worker) return worker
  try {
    worker = new Worker(
      new URL('../workers/igrejasWorker.js', import.meta.url),
      { type: 'module' },
    )
    worker.onmessage = (event) => {
      const { requestId, type, payload, error } = event.data || {}
      const entry = pending.get(requestId)
      if (!entry) return
      pending.delete(requestId)
      clearTimeout(entry.timer)
      if (type === 'WORKER_ERROR') {
        entry.reject(new Error(error || 'Erro no worker de igrejas'))
        return
      }
      if (type !== entry.expectType) {
        entry.reject(new Error(`Resposta inesperada: ${type}`))
        return
      }
      entry.resolve(payload)
    }
    worker.onerror = () => {
      workerFailed = true
      terminateWorker()
    }
    return worker
  } catch {
    workerFailed = true
    worker = null
    return null
  }
}

function runWorker(type, payload, expectType, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const w = getWorker()
  if (!w) return Promise.reject(new Error('Worker indisponível'))
  const requestId = nextRequestId++
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error('Timeout no worker de igrejas'))
    }, timeoutMs)
    pending.set(requestId, { resolve, reject, timer, expectType })
    w.postMessage({ type, payload, requestId })
  })
}

function shouldUseWorker(lista, minSize = WORKER_MIN_LIST_SIZE) {
  return Array.isArray(lista) && lista.length >= minSize && !workerFailed && supportsWorker()
}

/**
 * Deduplica igrejas em background quando a lista é grande.
 * @returns {Promise<{ lista, removidos, mapaKeeper }>}
 */
export async function colapsarIgrejasDuplicadasAsync(lista = [], opts = {}) {
  const items = (lista || []).filter(Boolean)
  const minSize = opts.minSize ?? WORKER_MIN_LIST_SIZE
  if (!shouldUseWorker(items, minSize)) {
    return colapsarIgrejasDuplicadas(items)
  }
  try {
    return await runWorker(
      'DEDUPLICATE_CHURCHES',
      { lista: items },
      'DEDUPLICATED_RESULT',
      opts.timeoutMs,
    )
  } catch {
    return colapsarIgrejasDuplicadas(items)
  }
}

/** Atalho com payload { custom, catalogo } conforme spec da Fase 6B. */
export async function deduplicateChurchesPayloadAsync(payload = {}, opts = {}) {
  const merged = [
    ...(Array.isArray(payload.catalogo) ? payload.catalogo : []),
    ...(Array.isArray(payload.custom) ? payload.custom : []),
  ].filter(Boolean)
  if (Array.isArray(payload.lista) && payload.lista.length) {
    return colapsarIgrejasDuplicadasAsync(payload.lista, opts)
  }
  return colapsarIgrejasDuplicadasAsync(merged, opts)
}

export async function filtrarCustomUnicasAsync(custom = [], catalogo = [], opts = {}) {
  const merged = [...(catalogo || []), ...(custom || [])]
  if (!shouldUseWorker(merged, opts.minSize ?? WORKER_MIN_LIST_SIZE)) {
    return filtrarCustomUnicas(custom, catalogo)
  }
  try {
    return await runWorker(
      'FILTER_CUSTOM_UNIQUES',
      { custom, catalogo },
      'FILTERED_CUSTOM_RESULT',
      opts.timeoutMs,
    )
  } catch {
    return filtrarCustomUnicas(custom, catalogo)
  }
}

export async function patchesEnrichDeDuplicatasAsync(custom = [], catalogo = [], enrich = {}, opts = {}) {
  const merged = [...(catalogo || []), ...(custom || [])]
  if (!shouldUseWorker(merged, opts.minSize ?? WORKER_MIN_LIST_SIZE)) {
    return patchesEnrichDeDuplicatas(custom, catalogo, enrich)
  }
  try {
    return await runWorker(
      'PATCHES_ENRICH_DEDUP',
      { custom, catalogo, enrich },
      'PATCHES_ENRICH_RESULT',
      opts.timeoutMs,
    )
  } catch {
    return patchesEnrichDeDuplicatas(custom, catalogo, enrich)
  }
}

export function isIgrejasDedupeWorkerEnabled() {
  return supportsWorker() && !workerFailed
}

export function resetIgrejasDedupeWorkerForTests() {
  terminateWorker()
  workerFailed = false
}
