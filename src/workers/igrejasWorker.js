/**
 * Web Worker: deduplicação de igrejas (O(n²) fora da main thread).
 */
import {
  colapsarIgrejasDuplicadas,
  filtrarCustomUnicas,
  patchesEnrichDeDuplicatas,
} from '../utils/igrejaDedupe'

function mergeCatalogPayload(payload = {}) {
  const { lista, custom, catalogo } = payload
  if (Array.isArray(lista) && lista.length) return lista.filter(Boolean)
  const cat = Array.isArray(catalogo) ? catalogo : []
  const cus = Array.isArray(custom) ? custom : []
  return [...cat, ...cus].filter(Boolean)
}

self.onmessage = (event) => {
  const { type, payload, requestId } = event.data || {}
  try {
    if (type === 'DEDUPLICATE_CHURCHES') {
      const merged = mergeCatalogPayload(payload)
      const result = colapsarIgrejasDuplicadas(merged)
      self.postMessage({ type: 'DEDUPLICATED_RESULT', requestId, payload: result })
      return
    }
    if (type === 'FILTER_CUSTOM_UNIQUES') {
      const { custom, catalogo } = payload || {}
      const result = filtrarCustomUnicas(custom || [], catalogo || [])
      self.postMessage({ type: 'FILTERED_CUSTOM_RESULT', requestId, payload: result })
      return
    }
    if (type === 'PATCHES_ENRICH_DEDUP') {
      const { custom, catalogo, enrich } = payload || {}
      const result = patchesEnrichDeDuplicatas(custom || [], catalogo || [], enrich || {})
      self.postMessage({ type: 'PATCHES_ENRICH_RESULT', requestId, payload: result })
      return
    }
    self.postMessage({
      type: 'WORKER_ERROR',
      requestId,
      error: `Tipo desconhecido: ${String(type)}`,
    })
  } catch (err) {
    self.postMessage({
      type: 'WORKER_ERROR',
      requestId,
      error: err?.message || String(err),
    })
  }
}
