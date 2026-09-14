/**
 * Persistência assíncrona (IndexedDB) para payloads grandes.
 * Mantém memCache sincronizado para leituras sync após initHeavyStore().
 */

const DB_NAME = 'campanha-app-v1'
const STORE_NAME = 'kv'
const DB_VERSION = 1

/** Chaves/prefixos que não devem ficar no localStorage (bloqueio síncrono / cota 5MB). */
const HEAVY_EXACT = new Set([
  'eleitores_data',
  'igrejas_custom',
  'igrejas_enrich',
  'geo_coords_igrejas',
  'igrejas_overrides',
  'igrejas_visitas',
  'pastores_igrejas',
  'previsao_data',
  'apoiadores_lista',
  'igrejas_google_places_cache',
  'igrejas_overpass_cache',
  'igrejas_google_details_cache',
  'igrejas_osm_cache',
  'geo_bairro_cache',
])

const memCache = new Map()
let dbPromise = null
let initPromise = null
let initDone = false
/** Evita recursão quando cloudSync intercepta localStorage.removeItem. */
let nativeLocalStorageRemove = null

export function registerNativeLocalStorageRemove(fn) {
  nativeLocalStorageRemove = typeof fn === 'function' ? fn : null
}

function removeLegacyLocalStorageKey(key) {
  if (typeof window === 'undefined') return
  try {
    if (nativeLocalStorageRemove) nativeLocalStorageRemove(key)
    else window.localStorage.removeItem(key)
  } catch { /* ignore */ }
}

export function isHeavyStorageKey(key) {
  if (!key || typeof key !== 'string') return false
  if (HEAVY_EXACT.has(key)) return true
  if (/^igrejas_(google|osm|overpass)_/.test(key) && key.endsWith('_cache')) return true
  return false
}

export function isHeavyStoreReady() {
  return initDone
}

function supportsIdb() {
  return typeof indexedDB !== 'undefined'
}

function openDb() {
  if (!supportsIdb()) return Promise.resolve(null)
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function idbTx(mode) {
  return openDb().then((db) => {
    if (!db) return null
    return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)
  })
}

async function idbGetRaw(key) {
  const store = await idbTx('readonly')
  if (!store) return null
  return new Promise((resolve, reject) => {
    const req = store.get(key)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
}

async function idbSetRaw(key, value) {
  const store = await idbTx('readwrite')
  if (!store) {
    memCache.set(key, value)
    return
  }
  return new Promise((resolve, reject) => {
    const req = store.put(value, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function idbDeleteRaw(key) {
  const store = await idbTx('readwrite')
  if (!store) {
    memCache.delete(key)
    return
  }
  return new Promise((resolve, reject) => {
    const req = store.delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function idbGetAllEntries() {
  const store = await idbTx('readonly')
  if (!store) return []
  return new Promise((resolve, reject) => {
    const req = store.openCursor()
    const out = []
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor) {
        resolve(out)
        return
      }
      out.push([cursor.key, cursor.value])
      cursor.continue()
    }
    req.onerror = () => reject(req.error)
  })
}

async function migrateHeavyFromLocalStorage() {
  if (typeof window === 'undefined') return 0
  let moved = 0
  const keys = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i)
    if (k && isHeavyStorageKey(k)) keys.push(k)
  }
  for (const key of keys) {
    const raw = window.localStorage.getItem(key)
    if (raw == null) continue
    const prev = memCache.get(key)
    if (prev == null || raw.length >= String(prev).length) {
      memCache.set(key, raw)
      try { await idbSetRaw(key, raw) } catch { /* ignore */ }
    }
    try { removeLegacyLocalStorageKey(key) } catch { /* ignore */ }
    moved++
  }
  return moved
}

async function hydrateFromIdb() {
  if (!supportsIdb()) return
  const entries = await idbGetAllEntries()
  for (const [key, value] of entries) {
    if (!isHeavyStorageKey(key) || value == null) continue
    memCache.set(String(key), String(value))
  }
}

/** Deve rodar antes de ensureSyncInstalled() — migra localStorage → IndexedDB. */
export async function initHeavyStore() {
  if (initPromise) return initPromise
  initPromise = (async () => {
    if (typeof window === 'undefined') {
      initDone = true
      return { ok: true, migrated: 0, idb: false }
    }
    try {
      await hydrateFromIdb()
      const migrated = await migrateHeavyFromLocalStorage()
      initDone = true
      return { ok: true, migrated, idb: supportsIdb() }
    } catch {
      await migrateHeavyFromLocalStorage()
      initDone = true
      return { ok: true, migrated: 0, idb: false, fallback: true }
    }
  })()
  return initPromise
}

export function readStorageRawSync(key) {
  if (!isHeavyStorageKey(key)) {
    try {
      return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
    } catch {
      return null
    }
  }
  if (memCache.has(key)) return memCache.get(key)
  try {
    const legacy = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
    if (legacy != null) memCache.set(key, legacy)
    return legacy
  } catch {
    return null
  }
}

export async function readStorageRawAsync(key) {
  if (!isHeavyStorageKey(key)) return readStorageRawSync(key)
  if (memCache.has(key)) return memCache.get(key)
  const fromIdb = await idbGetRaw(key).catch(() => null)
  if (fromIdb != null) {
    memCache.set(key, fromIdb)
    return fromIdb
  }
  return readStorageRawSync(key)
}

export function writeHeavyRawSync(key, str) {
  if (!isHeavyStorageKey(key)) return false
  memCache.set(key, String(str))
  void idbSetRaw(key, String(str)).catch(() => {})
  if (typeof window !== 'undefined') {
    try { removeLegacyLocalStorageKey(key) } catch { /* ignore */ }
  }
  return true
}

export function removeHeavyRawSync(key) {
  if (!isHeavyStorageKey(key)) return false
  memCache.delete(key)
  void idbDeleteRaw(key).catch(() => {})
  if (typeof window !== 'undefined') {
    try { removeLegacyLocalStorageKey(key) } catch { /* ignore */ }
  }
  return true
}

/** Pares [key, rawString] para sync/cloud. */
export function readHeavyStoreRows(filterFn = () => true) {
  const rows = []
  for (const [key, value] of memCache.entries()) {
    if (value == null || !filterFn(key)) continue
    rows.push([key, value])
  }
  return rows
}

export async function wipeHeavyStore() {
  memCache.clear()
  if (!supportsIdb()) return
  try {
    const entries = await idbGetAllEntries()
    await Promise.all(entries.map(([key]) => idbDeleteRaw(String(key)).catch(() => {})))
  } catch { /* ignore */ }
}

export function purgeHeavyCacheKeys(keys) {
  for (const key of keys || []) {
    if (!isHeavyStorageKey(key)) continue
    removeHeavyRawSync(key)
  }
}
