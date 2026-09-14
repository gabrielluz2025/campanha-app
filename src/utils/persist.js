import { useState, useEffect, useRef } from 'react'
import {
  flush, flushMemberApprovals, isMemberApprovalMode,
  persistToStorage, persistLocalOnly, ensureSyncInstalled, liberarCachePesadoLocal,
  getSyncStatus, SYNC_STORAGE_EVENT, withSyncSuppress, removeAppStorageKey,
} from '../lib/cloudSync'
import {
  isHeavyStorageKey,
  readStorageRawSync,
  readStorageRawAsync,
  initHeavyStore,
  isHeavyStoreReady,
  removeHeavyRawSync,
} from './idbStore'

export { liberarCachePesadoLocal, persistLocalOnly, getSyncStatus, initHeavyStore, isHeavyStoreReady }

/** Parse JSON do storage — trata ausência e valor literal `null`. */
export function parseStorage(raw, fallback) {
  if (raw == null || raw === '') return fallback
  try {
    const v = JSON.parse(raw)
    return v == null ? fallback : v
  } catch {
    return fallback
  }
}

/** Garante array a partir de JSON bruto ou valor já parseado. */
export function safeParseArray(raw, fallback = []) {
  const fb = Array.isArray(fallback) ? fallback : []
  try {
    if (raw == null || raw === '') return fb
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? parsed : fb
  } catch (e) {
    console.warn('safeParseArray:', e)
    return fb
  }
}

/** Coerce qualquer valor para array (UI / `.length` seguro). */
export function asArray(value, fallback = []) {
  return Array.isArray(value) ? value : (Array.isArray(fallback) ? fallback : [])
}

/** Lê chave do storage — fallback deve ser array; corrige valor corrompido. */
export function readStorageArray(key, fallback = []) {
  const fb = Array.isArray(fallback) ? fallback : []
  try {
    const v = readStorage(key, fb)
    return Array.isArray(v) ? v : fb
  } catch {
    return fb
  }
}

/** Lê chave (localStorage leve ou IndexedDB pesado via memCache). */
export function readStorage(key, fallback) {
  try {
    return parseStorage(readStorageRawSync(key), fallback)
  } catch {
    return fallback
  }
}

/** Leitura assíncrona — garante hidratação do IndexedDB para chaves pesadas. */
export async function readStorageAsync(key, fallback) {
  try {
    const raw = await readStorageRawAsync(key)
    return parseStorage(raw, fallback)
  } catch {
    return fallback
  }
}

/** Dados eleitorais — nunca retorna objeto inválido sem `zonas` array. */
export function readEleitoresData(fallback = null) {
  const d = readStorage('eleitores_data', fallback)
  if (d == null) return fallback
  if (!Array.isArray(d.zonas)) return { ...d, zonas: [] }
  return d
}

export async function readEleitoresDataAsync(fallback = null) {
  const d = await readStorageAsync('eleitores_data', fallback)
  if (d == null) return fallback
  if (!Array.isArray(d.zonas)) return { ...d, zonas: [] }
  return d
}

/** Remove valor `null` corrompido do storage (sync antigo). */
export function sanitizeCorruptedStorage() {
  withSyncSuppress(() => {
    try {
      const raw = readStorageRawSync('eleitores_data')
      if (raw == null || raw === '' || raw === 'null') {
        if (isHeavyStorageKey('eleitores_data')) removeHeavyRawSync('eleitores_data')
        else localStorage.removeItem('eleitores_data')
      } else {
        const d = JSON.parse(raw)
        if (d == null) {
          if (isHeavyStorageKey('eleitores_data')) removeHeavyRawSync('eleitores_data')
          else localStorage.removeItem('eleitores_data')
        }
      }
    } catch { /* ignore */ }
  })
}

const CHURCH_WRITE_KEYS = new Set([
  'igrejas_custom', 'igrejas_enrich', 'geo_coords_igrejas',
  'igrejas_overrides', 'igrejas_visitas', 'pastores_igrejas', 'igrejas_ocultas',
  'rotas_compartilhamentos',
])

/** Grava no navegador e enfileira envio ao servidor MySQL (api.php). */
export function writeStorage(key, value, opts) {
  const out = persistToStorage(key, value, opts)
  if (typeof window !== 'undefined' && CHURCH_WRITE_KEYS.has(key)) {
    window.dispatchEvent(new CustomEvent(SYNC_STORAGE_EVENT, { detail: { key, external: false } }))
  }
  return out
}

/** Remove do navegador e enfileira remoção na nuvem. */
export function removeStorage(key) {
  removeAppStorageKey(key)
}

/** Estado React com persistência local + auto-salvamento na nuvem. */
export function usePersistedState(key, defaultValue) {
  const heavy = isHeavyStorageKey(key)
  const [state, setState] = useState(() => (heavy ? defaultValue : readStorage(key, defaultValue)))
  const skipFirst = useRef(true)
  const hydrated = useRef(!heavy)

  useEffect(() => {
    if (!heavy || hydrated.current) return
    let cancelled = false
    readStorageAsync(key, defaultValue).then((val) => {
      if (cancelled) return
      hydrated.current = true
      setState(val)
    })
    return () => { cancelled = true }
  }, [key, defaultValue, heavy])

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false
      return
    }
    if (heavy && !hydrated.current) return
    writeStorage(key, state)
  }, [key, state, heavy])

  return [state, setState]
}

async function flushSmart() {
  if (isMemberApprovalMode()) await flushMemberApprovals()
  else await flush()
}

/** Envia fila pendente para a nuvem (api.php). */
export async function pushToCloud() {
  ensureSyncInstalled('local')
  await flushSmart()
}

/** Grava chaves no localStorage e envia para a nuvem. */
export async function saveToCloud(data) {
  ensureSyncInstalled('local')
  if (Array.isArray(data)) {
    for (const [k, v] of data) writeStorage(k, v)
  } else {
    for (const [k, v] of Object.entries(data)) writeStorage(k, v)
  }
  await flushSmart()
}

/** Dados já no localStorage — só força envio à nuvem. */
export async function saveKeysToCloud() {
  ensureSyncInstalled('local')
  await flushSmart()
}

/** Após salvar em modal/formulário — envia à nuvem imediatamente. */
export async function flushAfterSave() {
  ensureSyncInstalled('local')
  const wait = (ms) => new Promise(r => setTimeout(r, ms))
  await wait(0)
  await flushSmart()
  await wait(80)
  await flushSmart()
  const { getSyncStatus, isMemberApprovalMode, getMemberPendingEditCount } = await import('../lib/cloudSync')
  if (isMemberApprovalMode() && getMemberPendingEditCount() > 0) {
    await wait(160)
    await flushSmart()
  } else if (getSyncStatus().pending > 0) {
    await wait(400)
    await flushSmart()
  }
}
