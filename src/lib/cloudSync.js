import { supabase, usePhpSync } from './supabase'
import { sanitizarIgrejasCustomJson } from '../utils/igrejaCrista'
import { mergeVisitasCanon, visitasStoreEmpty, compactVisitasJson } from '../utils/igrejasVisitasCore'
import { sanitizeSyncPayload } from '../utils/mediaUpload'
import {
  isHeavyStorageKey,
  readStorageRawSync,
  writeHeavyRawSync,
  removeHeavyRawSync,
  readHeavyStoreRows,
  wipeHeavyStore,
  purgeHeavyCacheKeys,
  registerNativeLocalStorageRemove,
} from '../utils/idbStore'
import { deferHeavyUiWork, shouldDeferSyncUi, msUntilSyncAllowed } from '../utils/syncUiGate.js'
import { IGREJAS_MAPA_SOMENTE_MANUAL, IGREJAS_CADASTRO_LIMPO_EM_KEY } from '../utils/igrejasFonte'
import {
  filtrarListaIgrejasCidadesCampanha,
  podarObjetoChavesIgrejas,
  separarIgrejasPorCidadeCampanha,
} from '../utils/igrejaCidade'
import { materiaisLimpoEmEfetivo, materiaisHistoricoLimpoEmEfetivo, isMateriaisHistoricoStoreKey, materiaisClearTsEfetivo, materiaisLimpoVenceSobreLocal, materiaisTemDadosAtivos, getMateriaisHistoricoLimpoEm } from '../utils/materiaisResetCore'

const PHP_API = typeof window !== 'undefined'
  ? `${window.location.origin}/api.php`
  : '/api.php'

export const SYNC_EVENT = 'campanha-data-synced'
export const SYNC_OK_EVENT = 'campanha-sync-ok'
export const SYNC_ERR_EVENT = 'campanha-sync-err'
export const SYNC_PENDING_EVENT = 'campanha-sync-pending'
export const SYNC_DETAIL_EVENT = 'campanha-sync-detail'
export const SYNC_STORAGE_EVENT = 'campanha-storage-changed'

/** Chaves críticas exibidas no painel de diagnóstico. */
export const CRITICAL_SYNC_KEYS = ['rotas_logistica', 'rotas_diarias', 'igrejas_visitas', 'equipe_membros']

export const CRITICAL_SYNC_LABELS = {
  rotas_logistica: 'Rotas de Campo',
  rotas_diarias: 'Rotas diárias (despacho)',
  igrejas_visitas: 'Visitas',
  equipe_membros: 'Equipe',
}

/** Marca de edição local por chave (não enviada à nuvem como dado de app). */
const LOCAL_AT_KEY = 'campanha_sync_local_at'
const SERVER_META_PREFIX = 'campanha_sync_server_meta_'
/** Pull completo periódico — complementa o meta incremental. */
const FULL_PULL_EVERY_MS = 15 * 60 * 1000
let lastFullPullAt = 0

export function isAppKey(key) {
  if (!key || key === LOCAL_AT_KEY) return false
  // Metadados locais / sessão — nunca sincronizam nem vão para aprovação
  if (
    key === 'campanha_active_tenant'
    || key === 'campanha_active_tenant_meta'
    || key === 'campanha_theme'
    || key === 'igrejas_google_places_cache'
    || key === 'igrejas_mapa_geracao_ack'
    || key === 'igrejas_google_auto_novas'
    || key.startsWith('campanha_active_')
    || key.startsWith('campanha_sync_')
  ) return false
  return /^(previsao|agenda|equipe|eleitores|metas|meta|pastores|geo|igrejas|pesquisas|materiais|apoiadores|empresas|mapa|rotas|tesouraria|contrato)/.test(key)
}

function isQuotaError(e) {
  const name = String(e?.name || '')
  const code = e?.code
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014
}

const CHAVES_CACHE_PESADO = [
  'igrejas_google_places_cache',
  'igrejas_overpass_cache',
  'igrejas_google_details_cache',
  'igrejas_osm_cache',
  'geo_bairro_cache',
]

/** Apaga caches grandes (busca Google) para caber foto / de-para no navegador. */
export function liberarCachePesadoLocal() {
  purgeHeavyCacheKeys(CHAVES_CACHE_PESADO)
  const rmFn = originalRemoveItem || (typeof window !== 'undefined'
    ? window.localStorage.removeItem.bind(window.localStorage)
    : null)
  if (!rmFn) return
  for (const k of CHAVES_CACHE_PESADO) {
    try { rmFn(k) } catch { /* ignore */ }
  }
}

function isChurchSystemKey(key) {
  return key === 'igrejas_custom'
    || key === 'igrejas_enrich'
    || key === 'geo_coords_igrejas'
    || key === 'pastores_igrejas'
    || key === 'igrejas_overrides'
    || key === 'igrejas_ocultas'
}

function isMateriaisStoreKey(key) {
  return String(key || '').startsWith('materiais_')
}

/** Movimentos de materiais usam merge por id; snapshot LWW desativado (ressuscitação evitada via removidos). */
function isMateriaisHistoricoPullKey(_key) {
  return false
}

const MATERIAIS_PARTIAL_PULL_KEYS = [
  'materiais_estoque',
  'materiais_entradas',
  'materiais_distribuicao',
  'materiais_retiradas',
  'materiais_removidos',
  'materiais_coordenadores',
  'materiais_categorias',
  'materiais_retirada_cfg',
  'materiais_distribuicao_removidos',
  'materiais_retiradas_removidos',
  'materiais_limpo_em',
  'materiais_historico_limpo_em',
]

/** Visitas + flags de limpeza — pull parcial do mapa de visitas. */
const IGREJAS_VISITAS_PARTIAL_PULL_KEYS = [
  'igrejas_visitas',
  'igrejas_visitas_cleared_at',
  IGREJAS_CADASTRO_LIMPO_EM_KEY,
]

function materiaisSnapshotBlocked() {
  if (typeof window === 'undefined') return false
  return Boolean(
    window.__campanhaMateriaisImportAtivo
    || window.__campanhaMateriaisHistoricoLimpoAtivo
    || window.__campanhaMateriaisSnapshotAtivo,
  )
}

/**
 * Histórico: última escrita vence (LWW). Limpeza explícita mantém vazio.
 * Substitui união/merge que ressuscitava entradas/saídas apagadas.
 */
function pickMateriaisHistoricoLww(key, localVal, serverVal, serverUpdatedAt = null, ctx = null) {
  const localAt = getLocalAtMap()[key] || 0
  const serverAt = parseServerAt(serverUpdatedAt)
  const histLimpo = materiaisHistoricoLimpoEmEfetivo(ctx?.localMap, ctx?.serverMap)
  const localEmpty = storeValueEmpty(localVal)
  const emptyOut = emptyJsonForMateriaisKey(key)

  if (histLimpo > 0 && localEmpty) {
    const histKeysAt = Math.max(
      getLocalAtMap()['materiais_entradas'] || 0,
      getLocalAtMap()['materiais_distribuicao'] || 0,
      getLocalAtMap()['materiais_retiradas'] || 0,
      getLocalAtMap()[key] || 0,
    )
    if (histKeysAt <= histLimpo + 8000) return emptyOut
  }

  if (localVal == null && serverVal == null) return emptyOut
  if (localVal == null && serverVal != null) {
    if (histLimpo > 0 && localEmpty) return emptyOut
    return typeof serverVal === 'string' ? serverVal : JSON.stringify(serverVal)
  }
  if (localVal != null && serverVal == null) {
    return typeof localVal === 'string' ? localVal : JSON.stringify(localVal)
  }

  if (localAt > serverAt + 800) return typeof localVal === 'string' ? localVal : JSON.stringify(localVal)
  if (serverAt > localAt + 800) return typeof serverVal === 'string' ? serverVal : JSON.stringify(serverVal)
  return localAt >= serverAt
    ? (typeof localVal === 'string' ? localVal : JSON.stringify(localVal))
    : (typeof serverVal === 'string' ? serverVal : JSON.stringify(serverVal))
}

/** Chaves em que membro recebe cópia da nuvem sem merge (estoque/config/histórico). */
const MATERIAIS_MEMBER_SERVER_KEYS = new Set([
  'materiais_estoque',
  'materiais_coordenadores',
  'materiais_categorias',
  'materiais_retirada_cfg',
  'materiais_removidos',
  'materiais_distribuicao_removidos',
  'materiais_retiradas_removidos',
  'materiais_distribuicao',
  'materiais_entradas',
  'materiais_retiradas',
  'materiais_historico_limpo_em',
  'materiais_limpo_em',
])

/** Membro sem edição pendente: nuvem manda no estoque (evita cache local desatualizado). */
function memberShouldTrustServerMateriais(key, localMap = null, serverMap = null) {
  if (phpTenantRole !== 'member') return false
  if (!MATERIAIS_MEMBER_SERVER_KEYS.has(key)) return false
  if (pending.has(key) || pendingDeletes.has(key)) return false
  if (key === 'materiais_limpo_em' || key === 'materiais_historico_limpo_em') return false
  if (isMateriaisHistoricoPullKey(key)) return false
  if (key === 'materiais_removidos' && materiaisTemDadosAtivos(localMap, serverMap)) return false
  if (key === 'materiais_estoque') {
    const serverEmpty = storeValueEmpty(serverMap?.materiais_estoque)
    const hasHist = materiaisTemDadosAtivos(null, serverMap)
      || materiaisTemDadosAtivos(localMap, null)
    if (serverEmpty && hasHist) return false
  }
  return true
}

function parseIgrejasOcultasIds(ocultasVal) {
  const raw = typeof ocultasVal === 'string' ? parseJsonSafe(ocultasVal) : ocultasVal
  if (Array.isArray(raw)) return new Set(raw.map(String).filter(Boolean))
  if (raw && typeof raw === 'object') return new Set(Object.keys(raw).map(String).filter(Boolean))
  return new Set()
}

function mergedIgrejasOcultasJson(localMap, serverMap) {
  return mergeIdSetLists(
    localMap?.igrejas_ocultas ?? (typeof window !== 'undefined' ? window.localStorage.getItem('igrejas_ocultas') : null),
    serverMap?.igrejas_ocultas ?? null,
  )
}

function storeValueEmpty(val) {
  const v = parseJsonSafe(val)
  if (v == null) return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v).length === 0
  return false
}

function nativeSetSafe(key, str) {
  if (isHeavyStorageKey(key)) {
    writeHeavyRawSync(key, str)
    return true
  }
  try {
    if (originalSetItem) originalSetItem(key, str)
    else window.localStorage.setItem(key, str)
    return true
  } catch (e) {
    if (!isQuotaError(e)) throw e
    liberarCachePesadoLocal()
    try {
      if (originalSetItem) originalSetItem(key, str)
      else window.localStorage.setItem(key, str)
      return true
    } catch (e2) {
      if (!isQuotaError(e2)) throw e2
      return false
    }
  }
}

let currentUserId = null
let phpAccessToken = null
let phpTenantId = null
let phpTenantRole = null // 'owner' | 'member'
let originalSetItem = null
let originalRemoveItem = null
let suppress = false
const pending = new Map()
const pendingDeletes = new Set()
let flushTimer = null
let periodicTimer = null
let listenersOn = false
let flushing = false
let pulling = false
let lastSyncError = null
let lastSyncAt = null
let flushBackoff = 0
const keySyncState = Object.create(null)
const lastFailedKeys = new Set()

function ensureKeyState(key) {
  if (!keySyncState[key]) {
    keySyncState[key] = { status: 'synced', error: null, lastSuccessAt: null }
  }
}

function setKeyStatus(key, status, error = null) {
  if (!CRITICAL_SYNC_KEYS.includes(key)) return
  ensureKeyState(key)
  const prev = keySyncState[key]
  keySyncState[key] = {
    status,
    error: error || null,
    lastSuccessAt: status === 'synced' ? Date.now() : prev.lastSuccessAt,
  }
  if (status === 'error') lastFailedKeys.add(key)
  else if (status === 'synced') lastFailedKeys.delete(key)
  emitSyncDetail()
}

function deriveKeyStatus(key) {
  if (flushing && (pending.has(key) || pendingDeletes.has(key))) return 'syncing'
  if (pending.has(key) || pendingDeletes.has(key)) return 'pending'
  if (lastFailedKeys.has(key) || keySyncState[key]?.status === 'error') return 'error'
  return 'synced'
}

function emitSyncDetail() {
  try {
    window.dispatchEvent(new CustomEvent(SYNC_DETAIL_EVENT, { detail: getDetailedSyncStatus() }))
  } catch { /* ignore */ }
}

export function getDetailedSyncStatus() {
  const keys = CRITICAL_SYNC_KEYS.map((key) => {
    const derived = deriveKeyStatus(key)
    const stored = keySyncState[key]
    const error = derived === 'error'
      ? (stored?.error || lastSyncError || 'Falha na sincronização')
      : null
    return {
      key,
      label: CRITICAL_SYNC_LABELS[key] || key,
      status: derived,
      error,
      lastSuccessAt: stored?.lastSuccessAt || null,
    }
  })
  return {
    pending: pending.size + pendingDeletes.size,
    userId: currentUserId,
    lastSyncAt,
    lastSyncError,
    flushing,
    teamSyncActive,
    teamSyncLastAt,
    keys,
  }
}
let broadcastChannel = null
let lastApprovalNoticeAt = 0
let memberQuietUntil = 0
let memberBaseline = Object.create(null)
let memberDirty = new Map()
let memberDeleteDirty = new Set()
/** Chaves enviadas à fila e ainda aguardando approve/reject do dono. */
let memberAwaiting = new Set()
let memberFlushAllowed = false
let baselineTimer = null
let serverUpdatedSnapshot = {}

function rememberServerUpdated(meta = {}) {
  if (!meta || typeof meta !== 'object') return
  for (const [k, ts] of Object.entries(meta)) {
    if (ts != null && ts !== '') serverUpdatedSnapshot[k] = String(ts)
  }
}

function onTenantRemoteChange() {
  teamSyncActive = true
  teamSyncLastAt = Date.now()
  emitSyncDetail()
  if (shouldDeferSyncUi()) {
    scheduleLivePull(Math.max(msUntilSyncAllowed(), 700))
    return
  }
  scheduleLivePull(120)
}

function startTenantSyncWatchSafe() {
  if (!usePhpSync() || !phpAuthReady()) return
  import('../utils/tenantSyncWatch.js')
    .then((m) => { m.startTenantSyncWatch(onTenantRemoteChange) })
    .catch(() => {})
}

function stopTenantSyncWatchSafe() {
  import('../utils/tenantSyncWatch.js')
    .then((m) => { m.stopTenantSyncWatch() })
    .catch(() => {})
}

export const APPROVAL_EVENT = 'campanha-awaiting-approval'

function snapshotMemberBaseline() {
  memberBaseline = Object.create(null)
  for (const [k, v] of readLocalAppRows()) {
    memberBaseline[k] = normJson(v)
  }
  memberDirty.clear()
  memberDeleteDirty.clear()
}

function beginMemberQuietPeriod(ms = 6000) {
  // Mantém quiet até o baseline ser tirado (evita janela suja entre quiet e snapshot)
  memberQuietUntil = Date.now() + ms + 60000
  if (baselineTimer) clearTimeout(baselineTimer)
  baselineTimer = setTimeout(() => {
    snapshotMemberBaseline()
    memberQuietUntil = 0
  }, ms)
}

function inMemberQuietPeriod() {
  return Date.now() < memberQuietUntil
}

/** true quando o usuário logado é membro (alterações precisam de aprovação) */
export function isMemberApprovalMode() {
  return isMemberNeedsApproval()
}

/** Edições locais do membro ainda não enviadas à fila de aprovação. */
export function getMemberPendingEditCount() {
  return memberDirty.size + memberDeleteDirty.size
}

/** Contexto de auth/tenant para sync PHP multi-campanha. */
export function setPhpAuthContext({ accessToken = null, tenantId = null, role = null } = {}) {
  const prevRole = phpTenantRole
  const hadAuth = phpAuthReady()
  phpAccessToken = accessToken || null
  phpTenantId = tenantId || null
  if (role != null) phpTenantRole = role
  if (!phpAccessToken || !phpTenantId) {
    stopTenantSyncWatchSafe()
  }
  if (isMemberNeedsApproval() && phpTenantRole !== prevRole) {
    beginMemberQuietPeriod(6000)
  }
  if (!hadAuth && phpAuthReady()) {
    scheduleFlush()
    scheduleLivePull(200)
    startTenantSyncWatchSafe()
  }
}

export function getPhpAuthContext() {
  return { accessToken: phpAccessToken, tenantId: phpTenantId, role: phpTenantRole }
}

function isMemberNeedsApproval() {
  // Dono pediu: membro liberado na aba grava na hora (sem fila de aprovação).
  return false
}

function notifyApprovalQueued() {
  const now = Date.now()
  if (now - lastApprovalNoticeAt < 2500) return
  lastApprovalNoticeAt = now
  window.dispatchEvent(new CustomEvent(APPROVAL_EVENT, {
    detail: { message: 'Alteração salva para você. Aguardando aprovação do dono para valer no sistema.' },
  }))
}

function phpHeaders(extra = {}) {
  const h = { ...extra }
  if (phpAccessToken) h.Authorization = `Bearer ${phpAccessToken}`
  if (phpTenantId) h['X-Tenant-Id'] = phpTenantId
  return h
}

function phpAuthReady() {
  if (!usePhpSync()) return true
  return Boolean(phpAccessToken && phpTenantId)
}

function assertPhpAuth() {
  return phpAuthReady()
}

const FLUSH_MS = 200
const PERIODIC_MS = 20000
/** Pull da nuvem — intervalo maior para não travar troca de abas no desktop. */
const LIVE_PULL_MS = 120000
const LARGE_BYTES = 180000
const BULK_CHUNK = 6
const FLUSH_STUCK_MS = 55000

let livePullTimer = null
let livePullDebounceTimer = null
let pullAgainRequested = false
let lastLivePullAt = 0
let teamSyncActive = false
let teamSyncLastAt = 0
let churchCidadesPurgeInFlight = false
const LIVE_PULL_MIN_GAP_MS = 25000
let flushStartedAt = 0

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

let reloadDebounceTimer = null
let reloadDetail = {}

function dispatchSyncReload(extra = {}) {
  reloadDetail = { forceReload: true, fromServer: true, ...reloadDetail, ...extra }
  if (reloadDebounceTimer) clearTimeout(reloadDebounceTimer)
  const delay = shouldDeferSyncUi() ? 2800 : 550
  reloadDebounceTimer = setTimeout(() => {
    reloadDebounceTimer = null
    const detail = { ...reloadDetail }
    reloadDetail = {}
    const fire = () => {
      try {
        window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail }))
      } catch { /* ignore */ }
    }
    if (shouldDeferSyncUi()) deferHeavyUiWork(fire, { minDelay: 1200 })
    else fire()
  }, delay)
}

function normJson(str) {
  if (str == null) return ''
  try { return JSON.stringify(JSON.parse(str)) } catch { return String(str) }
}

function readLocalAppRows() {
  const rows = []
  const seen = new Set()
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i)
    if (!key || !isAppKey(key) || isHeavyStorageKey(key)) continue
    const value = window.localStorage.getItem(key)
    if (value != null) {
      rows.push([key, value])
      seen.add(key)
    }
  }
  for (const [key, value] of readHeavyStoreRows(isAppKey)) {
    if (seen.has(key) || value == null) continue
    rows.push([key, value])
  }
  return rows
}

function parseJsonSafe(str) {
  if (str == null) return null
  try { return JSON.parse(str) } catch { return str }
}

function getLocalAtMap() {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_AT_KEY) || '{}')
  } catch {
    return {}
  }
}

function seedLocalAtFromExisting() {
  const map = getLocalAtMap()
  let changed = false
  // Timestamp antigo (não Date.now): dados sem marca não podem “parecer novos”
  // e sobrescrever a nuvem após uma exclusão em outro dispositivo/aba.
  for (const [key] of readLocalAppRows()) {
    if (!map[key]) { map[key] = 1; changed = true }
  }
  if (!changed) return
  suppress = true
  try {
    if (originalSetItem) originalSetItem(LOCAL_AT_KEY, JSON.stringify(map))
    else window.localStorage.setItem(LOCAL_AT_KEY, JSON.stringify(map))
  } finally {
    suppress = false
  }
}

function touchLocalAt(key, ts = Date.now()) {
  if (!isAppKey(key)) return
  const map = getLocalAtMap()
  map[key] = ts
  suppress = true
  try {
    if (originalSetItem) originalSetItem(LOCAL_AT_KEY, JSON.stringify(map))
    else window.localStorage.setItem(LOCAL_AT_KEY, JSON.stringify(map))
  } finally {
    suppress = false
  }
}

function countVotosEleitores(raw) {
  const data = typeof raw === 'string' ? parseJsonSafe(raw) : raw
  if (!data?.zonas) return 0
  let total = 0
  data.zonas.forEach(z => (z.locais || []).forEach(l => (l.secoes || []).forEach(s => { total += Number(s.votos) || 0 })))
  return total
}

function mergeVisitas(aStr, bStr) {
  return mergeVisitasCanon(aStr, bStr)
}

function phoneDigitsSync(t) {
  return String(t || '').replace(/\D/g, '')
}

function phonesMatchSync(a, b) {
  const da = phoneDigitsSync(a)
  const db = phoneDigitsSync(b)
  if (da.length < 8 || db.length < 8) return false
  if (da === db) return true
  return da.length >= 9 && db.length >= 9 && da.slice(-9) === db.slice(-9)
}

function apoiadorTime(item) {
  const t = Date.parse(item?.atualizadoEm || item?.criadoEm || '')
  return Number.isFinite(t) ? t : 0
}

function mergeIdSetLists(aStr, bStr) {
  const a = parseJsonSafe(aStr)
  const b = parseJsonSafe(bStr)
  const set = new Set()
  for (const x of Array.isArray(a) ? a : []) if (x != null && x !== '') set.add(String(x))
  for (const x of Array.isArray(b) ? b : []) if (x != null && x !== '') set.add(String(x))
  return JSON.stringify([...set])
}

/** Une rotas por id; respeita rotas_logistica_removidos. */
function mergeRotasLogistica(localVal, serverVal, removedVal = null) {
  const removedRaw = removedVal != null
    ? parseJsonSafe(removedVal)
    : parseJsonSafe(typeof window !== 'undefined' ? window.localStorage.getItem('rotas_logistica_removidos') : null)
  const removed = new Set((Array.isArray(removedRaw) ? removedRaw : []).map(String))

  const localArr = parseJsonSafe(localVal)
  const serverArr = parseJsonSafe(serverVal)
  const local = Array.isArray(localArr) ? localArr : []
  const server = Array.isArray(serverArr) ? serverArr : []
  const map = new Map()

  function stamp(r) {
    const t = Date.parse(r?.atualizadoEm || r?.criadoEm || '')
    return Number.isFinite(t) ? t : 0
  }

  function paradasLen(r) {
    return Array.isArray(r?.paradas) ? r.paradas.length : 0
  }

  /** Não deixa sync apagar paradas montadas em outro aparelho, mas respeita remoções explícitas. */
  function mergeRotaItem(prev, item) {
    const newerFirst = stamp(item) >= stamp(prev)
    const base = newerFirst ? { ...prev, ...item } : { ...item, ...prev }
    const pPrev = paradasLen(prev)
    const pItem = paradasLen(item)
    // Só prefere a lista maior se o item mais recente NÃO reduziu as paradas.
    // Se o mais recente tem menos paradas, é porque o usuário as removeu — respeitar.
    if (newerFirst) {
      // item é mais novo: usa paradas do item. Se item tem menos, é remoção intencional.
      if (pPrev > pItem && stamp(item) - stamp(prev) < 2000) {
        // Diferença < 2s: possível race; preserva a maior lista por segurança
        base.paradas = prev.paradas
      } else {
        base.paradas = Array.isArray(item.paradas) ? item.paradas : prev.paradas
      }
    } else {
      // prev é mais novo: usa paradas do prev
      base.paradas = Array.isArray(prev.paradas) ? prev.paradas : item.paradas
    }
    return { ...base, id: prev.id || item.id }
  }

  function add(item) {
    if (!item || typeof item !== 'object') return
    const id = String(item.id || '')
    if (!id || removed.has(id)) return
    const prev = map.get(id)
    if (!prev) {
      map.set(id, item)
      return
    }
    map.set(id, mergeRotaItem(prev, item))
  }

  server.forEach(add)
  local.forEach(add)
  return JSON.stringify([...map.values()].sort((a, b) => stamp(b) - stamp(a)))
}

function mergeRotasDiarias(localVal, serverVal, removedVal = null) {
  const removedRaw = removedVal != null
    ? parseJsonSafe(removedVal)
    : parseJsonSafe(typeof window !== 'undefined' ? window.localStorage.getItem('rotas_diarias_removidos') : null)
  const removed = new Set((Array.isArray(removedRaw) ? removedRaw : []).map(String))

  const local = Array.isArray(parseJsonSafe(localVal)) ? parseJsonSafe(localVal) : []
  const server = Array.isArray(parseJsonSafe(serverVal)) ? parseJsonSafe(serverVal) : []
  const map = new Map()

  function stampR(r) {
    const t = Date.parse(r?.atualizadoEm || r?.criadoEm || '')
    return Number.isFinite(t) ? t : 0
  }

  function mergeIgrejas(prev = [], item = []) {
    const pArr = Array.isArray(prev) ? prev : []
    const iArr = Array.isArray(item) ? item : []
    const byId = new Map()
    for (const p of pArr) {
      const id = String(p?.igrejaId ?? '')
      if (id) byId.set(id, p)
    }
    for (const p of iArr) {
      const id = String(p?.igrejaId ?? '')
      if (!id) continue
      const old = byId.get(id)
      if (!old) {
        byId.set(id, p)
        continue
      }
      const stRank = (s) => (s === 'concluido' ? 3 : s === 'em_transito' ? 2 : 1)
      byId.set(id, stRank(p.status) >= stRank(old.status) ? { ...old, ...p } : { ...p, ...old })
    }
    return [...byId.values()].sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0))
  }

  function mergeItem(prev, item) {
    const newerFirst = stampR(item) >= stampR(prev)
    const base = newerFirst ? { ...prev, ...item } : { ...item, ...prev }
    base.igrejas = mergeIgrejas(prev.igrejas, item.igrejas)
    base.id = prev.id || item.id
    return base
  }

  function add(item) {
    if (!item || typeof item !== 'object') return
    const id = String(item.id || '')
    if (!id || removed.has(id)) return
    const prev = map.get(id)
    if (!prev) map.set(id, item)
    else map.set(id, mergeItem(prev, item))
  }

  server.forEach(add)
  local.forEach(add)
  return JSON.stringify([...map.values()].sort((a, b) => stampR(b) - stampR(a)))
}

/** Une compartilhamentos de rota ao vivo por shareId/rotaId (multi-coordenador). */
function mergeRotasCompartilhamentos(localVal, serverVal) {
  const localArr = parseJsonSafe(localVal)
  const serverArr = parseJsonSafe(serverVal)
  const local = Array.isArray(localArr) ? localArr : []
  const server = Array.isArray(serverArr) ? serverArr : []
  const map = new Map()
  const ts = (s) => {
    const t = Date.parse(s?.atualizadoEm || s?.criadoEm || '')
    return Number.isFinite(t) ? t : 0
  }
  for (const item of [...server, ...local]) {
    if (!item || typeof item !== 'object') continue
    const key = String(item.shareId || item.rotaId || '')
    if (!key) continue
    const prev = map.get(key)
    if (!prev || ts(item) >= ts(prev)) map.set(key, item)
  }
  return JSON.stringify([...map.values()])
}

/**
 * Une listas de apoiadores por id/telefone.
 * Respeita `apoiadores_removidos` para não ressuscitar exclusões.
 * Garante que leads do formulário público não sumam no sync.
 */
function preferObservacao(a, b) {
  const sa = String(a || '').trim()
  const sb = String(b || '').trim()
  const dump = (s) => /Origem:\s*cadastro público/i.test(s) || /^Cidade:/i.test(s)
  if (sa && !dump(sa)) return sa
  if (sb && !dump(sb)) return sb
  if (sa && !dump(sa)) return sa
  return ''
}

export function mergeApoiadoresLista(localVal, serverVal, removedVal = null) {
  const removedRaw = removedVal != null
    ? parseJsonSafe(removedVal)
    : parseJsonSafe(typeof window !== 'undefined' ? window.localStorage.getItem('apoiadores_removidos') : null)
  const removed = new Set((Array.isArray(removedRaw) ? removedRaw : []).map(String))

  const localArr = parseJsonSafe(localVal)
  const serverArr = parseJsonSafe(serverVal)
  const local = Array.isArray(localArr) ? localArr : []
  const server = Array.isArray(serverArr) ? serverArr : []
  const map = new Map()

  function findKey(item) {
    if (!item || typeof item !== 'object') return null
    if (item.id != null && item.id !== '') {
      for (const [k, v] of map) {
        if (String(v.id) === String(item.id)) return k
        if (phonesMatchSync(v.telefone, item.telefone)) return k
      }
      return `id:${item.id}`
    }
    const dig = phoneDigitsSync(item.telefone)
    if (dig.length >= 8) {
      for (const [k, v] of map) {
        if (phonesMatchSync(v.telefone, item.telefone)) return k
      }
      return `tel:${dig.slice(-9)}`
    }
    return null
  }

  function prefer(a, b) {
    const ta = apoiadorTime(a)
    const tb = apoiadorTime(b)
    const newer = ta >= tb ? a : b
    const older = newer === a ? b : a
    const origem = newer.origem || older.origem
      || (a.origem === 'cadastro_publico' || b.origem === 'cadastro_publico' ? 'cadastro_publico' : undefined)
    return {
      ...older,
      ...newer,
      id: older.id || newer.id,
      origem: origem || newer.origem || older.origem,
      cidade: newer.cidade || older.cidade || '',
      email: newer.email || older.email || '',
      profissao: newer.profissao || older.profissao || '',
      dataNascimento: newer.dataNascimento || older.dataNascimento || '',
      cep: newer.cep || older.cep || '',
      logradouro: newer.logradouro || older.logradouro || '',
      numero: newer.numero || older.numero || '',
      complemento: newer.complemento || older.complemento || '',
      cpf: newer.cpf || older.cpf || '',
      interesses: (Array.isArray(newer.interesses) && newer.interesses.length)
        ? newer.interesses
        : (older.interesses || []),
      extras: (newer.extras && typeof newer.extras === 'object' && !Array.isArray(newer.extras) && Object.keys(newer.extras).length)
        ? newer.extras
        : (older.extras || {}),
      votosEstimados: newer.votosEstimados || older.votosEstimados || 5,
      observacao: preferObservacao(newer.observacao, older.observacao),
      criadoEm: older.criadoEm || newer.criadoEm,
      atualizadoEm: newer.atualizadoEm || older.atualizadoEm,
    }
  }

  function add(item) {
    if (!item || typeof item !== 'object') return
    if (item.id != null && removed.has(String(item.id))) return
    const dig = phoneDigitsSync(item.telefone)
    if (dig.length >= 8 && removed.has(`tel:${dig.slice(-9)}`)) return
    const k = findKey(item)
    if (!k) return
    if (map.has(k)) map.set(k, prefer(map.get(k), item))
    else map.set(k, item)
  }

  local.forEach(add)
  server.forEach(add)

  const out = [...map.values()].sort((a, b) => apoiadorTime(b) - apoiadorTime(a))
  return JSON.stringify(out)
}

function membroEquipeTime(item) {
  const t = Date.parse(item?.atualizadoEm || item?.criadoEm || item?.dataInicio || '')
  return Number.isFinite(t) ? t : 0
}

function preferCampoEquipe(newerVal, olderVal) {
  if (newerVal === '' || newerVal == null) return olderVal
  if (Array.isArray(newerVal) && newerVal.length === 0 && Array.isArray(olderVal) && olderVal.length) {
    return olderVal
  }
  return newerVal
}

/** Une membros da equipe por id — não deixa sumir no sync LWW. */
export function mergeEquipeMembros(localVal, serverVal, removedVal = null) {
  const removedRaw = removedVal != null
    ? parseJsonSafe(removedVal)
    : parseJsonSafe(typeof window !== 'undefined' ? window.localStorage.getItem('equipe_removidos') : null)
  const removed = new Set((Array.isArray(removedRaw) ? removedRaw : []).map(String))

  const localArr = parseJsonSafe(localVal)
  const serverArr = parseJsonSafe(serverVal)
  const local = Array.isArray(localArr) ? localArr : []
  const server = Array.isArray(serverArr) ? serverArr : []
  const map = new Map()

  function prefer(a, b) {
    const ta = membroEquipeTime(a)
    const tb = membroEquipeTime(b)
    const newer = ta >= tb ? a : b
    const older = newer === a ? b : a
    const out = { ...older, ...newer, id: older.id || newer.id }
    for (const k of Object.keys(older)) {
      out[k] = preferCampoEquipe(out[k], older[k])
    }
    // Cadastro rico: não perder indicação / dados bancários / endereço
    const richKeys = [
      'indicacaoPor', 'indicadoPor', 'indicacao', 'telefone', 'email', 'cpf',
      'dataNascimento', 'cep', 'logradouro', 'numero', 'complemento',
      'bairroResidencia', 'cidade', 'estado', 'banco', 'agencia', 'conta', 'pix',
      'observacoes', 'salario', 'contrato', 'vinculo', 'foto',
      'igrejaId', 'igrejaNome', 'cargoIgreja', 'cidadeAtuacao', 'bairros',
      'contratoDoc', 'dataFimContrato', 'horasContratado',
    ]
    for (const k of richKeys) {
      out[k] = preferCampoEquipe(out[k], older[k])
      out[k] = preferCampoEquipe(out[k], newer[k] === undefined ? older[k] : out[k])
      if ((out[k] === '' || out[k] == null) && older[k]) out[k] = older[k]
      if ((out[k] === '' || out[k] == null) && newer[k]) out[k] = newer[k]
    }
    out.criadoEm = older.criadoEm || newer.criadoEm
    out.atualizadoEm = newer.atualizadoEm || older.atualizadoEm
    return out
  }

  function add(item) {
    if (!item || typeof item !== 'object') return
    const id = item.id != null && item.id !== '' ? String(item.id) : null
    if (!id || removed.has(id)) return
    if (map.has(id)) map.set(id, prefer(map.get(id), item))
    else map.set(id, item)
  }

  local.forEach(add)
  server.forEach(add)

  const out = [...map.values()].sort((a, b) => {
    const na = String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
    return na || membroEquipeTime(b) - membroEquipeTime(a)
  })
  return JSON.stringify(out)
}

const CHURCH_RICH_KEYS = [
  'nome', 'endereco', 'setor', 'culto', 'telefone', 'whatsapp', 'pastor1', 'pastor2',
  'denominacao', 'googlePlaceId', 'placeId', 'cep', 'bairro', 'cidade',
  'instagram', 'facebook', 'website', 'mapsUrl', 'esposa1', 'esposa2', 'origem', 'foto',
]

function igrejaStampMs(ig) {
  return Math.max(
    Date.parse(ig?.atualizadoEm || '') || 0,
    Date.parse(ig?.criadoEm || '') || 0,
  )
}

function igrejaCatalogScore(ig) {
  if (!ig || typeof ig !== 'object') return 0
  let s = 0
  const fonte = String(ig.fonte || '').toLowerCase()
  if (fonte === 'manual' || fonte === 'cadastro' || ig.manter) s += 20
  if (String(ig.endereco || '').trim()) s += 3
  if (String(ig.nome || '').trim()) s += 1
  if (String(ig.googlePlaceId || ig.placeId || '').trim()) s += 2
  if (String(ig.culto || '').trim()) s += 1
  return s
}

function preferCampoIgreja(newerVal, olderVal) {
  if (newerVal === '' || newerVal == null) return olderVal
  if (Array.isArray(newerVal) && newerVal.length === 0 && Array.isArray(olderVal) && olderVal.length) {
    return olderVal
  }
  return newerVal
}

function preferIgrejaCatalogo(a, b) {
  const ta = igrejaStampMs(a)
  const tb = igrejaStampMs(b)
  let newer = a
  let older = b
  if (ta && tb && ta !== tb) {
    newer = ta >= tb ? a : b
    older = newer === a ? b : a
  } else {
    const sa = igrejaCatalogScore(a)
    const sb = igrejaCatalogScore(b)
    newer = sa >= sb ? a : b
    older = newer === a ? b : a
  }
  const out = { ...older, ...newer, id: older.id ?? newer.id }
  for (const k of CHURCH_RICH_KEYS) {
    out[k] = preferCampoIgreja(out[k], older[k])
    if ((out[k] === '' || out[k] == null) && newer[k]) out[k] = newer[k]
  }
  return out
}

/** Remove igrejas fora de Blumenau/Gaspar/Indaial do pacote antes de merge/push. */
function restringirPacoteIgrejasCidadesCampanha(merged) {
  if (!merged || typeof merged !== 'object') return { merged, removed: 0 }
  const raw = parseJsonSafe(merged.igrejas_custom || '[]')
  const arr = Array.isArray(raw) ? raw : []
  const manter = filtrarListaIgrejasCidadesCampanha(arr)
  const removed = arr.length - manter.length
  if (!removed) return { merged, removed: 0 }
  const allowed = new Set(manter.map(i => String(i.id)))
  const next = { ...merged, igrejas_custom: JSON.stringify(manter) }
  for (const key of CHURCH_OBJECT_KEYS) {
    if (!next[key]) continue
    const o = parseJsonSafe(next[key])
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      next[key] = JSON.stringify(podarObjetoChavesIgrejas(o, allowed))
    }
  }
  const visitas = parseJsonSafe(next.igrejas_visitas || readStorageRawSync('igrejas_visitas'))
  if (visitas && typeof visitas === 'object' && !Array.isArray(visitas)) {
    next.igrejas_visitas = JSON.stringify(podarObjetoChavesIgrejas(visitas, allowed))
  }
  return { merged: next, removed }
}

async function purgeIgrejasForaCidadesSeNecessario() {
  if (churchCidadesPurgeInFlight) return { removidas: 0 }
  if (typeof window !== 'undefined' && window.__campanhaIgrejasClearing) return { removidas: 0 }
  const custom = parseJsonSafe(readStorageRawSync('igrejas_custom'))
  const arr = Array.isArray(custom) ? custom : []
  const { fora } = separarIgrejasPorCidadeCampanha(arr)
  if (!fora.length) return { removidas: 0 }
  churchCidadesPurgeInFlight = true
  try {
    const { purgarIgrejasForaCidadesCampanha } = await import('../utils/churchVisitMutations.js')
    return await purgarIgrejasForaCidadesCampanha()
  } finally {
    churchCidadesPurgeInFlight = false
  }
}

async function aplicarDeparaDuplicatasSeNecessario() {
  if (typeof window !== 'undefined' && window.__campanhaIgrejasClearing) return { removidas: 0 }
  try {
    const { listarDuplicatasIgrejasCadastro, aplicarDeparaDuplicatasIgrejasCadastro } = await import('../utils/churchVisitMutations.js')
    const analise = listarDuplicatasIgrejasCadastro()
    if (!analise.duplicateCount) return { removidas: 0 }
    return await aplicarDeparaDuplicatasIgrejasCadastro()
  } catch {
    return { removidas: 0 }
  }
}

/** União do cadastro de igrejas por id — respeita igrejas_ocultas (exclusões explícitas). */
export function mergeIgrejasCustom(localVal, serverVal, ocultasVal = null, limpoServer = 0) {
  const ocultas = parseIgrejasOcultasIds(ocultasVal)
  const localArr = parseJsonSafe(localVal)
  const serverArr = parseJsonSafe(serverVal)
  let local = Array.isArray(localArr) ? localArr : []
  let server = Array.isArray(serverArr) ? serverArr : []
  local = filtrarListaIgrejasCidadesCampanha(local)
  server = filtrarListaIgrejasCidadesCampanha(server)
  const limpoLocal = readCadastroLimpoEmLocal()
  const limpoSrv = Number(limpoServer) || 0

  if (!local.length && !server.length) return '[]'

  const catalogoPurificado = (() => {
    try {
      return Number(typeof window !== 'undefined' ? window.localStorage.getItem('igrejas_catalogo_adblu_v') : 0) >= 2
    } catch { return false }
  })()

  /** Cadastro já alinhado às 88 ADBLU — nuvem inflada (Google) não repõe centenas de fichas. */
  if (
    IGREJAS_MAPA_SOMENTE_MANUAL
    && catalogoPurificado
    && local.length > 0
    && server.length > local.length + 20
  ) {
    const map = new Map()
    const addLocal = (ig) => {
      if (!ig || ig.id == null || ig.id === '') return
      const id = String(ig.id)
      if (ocultas.has(id)) return
      map.set(id, ig)
    }
    local.forEach(addLocal)
    for (const id of ocultas) map.delete(id)
    return JSON.stringify([...map.values()])
  }

  if (localCadastroIgrejasEscolheuVazio(limpoSrv) && !local.length) return '[]'

  if (IGREJAS_MAPA_SOMENTE_MANUAL && limpoSrv > limpoLocal && limpoSrv > 0 && !local.length) return '[]'

  const map = new Map()
  const add = (ig) => {
    if (!ig || ig.id == null || ig.id === '') return
    const id = String(ig.id)
    if (ocultas.has(id)) return
    if (map.has(id)) map.set(id, preferIgrejaCatalogo(map.get(id), ig))
    else map.set(id, ig)
  }
  if (!local.length) {
    if (IGREJAS_MAPA_SOMENTE_MANUAL) {
      if (localCadastroIgrejasEscolheuVazio(limpoSrv)) return '[]'
      if (limpoLocal > 0) return '[]'
      if (typeof window !== 'undefined' && window.__campanhaIgrejasClearing) return '[]'
      if (server.length) {
        server.forEach(add)
        return JSON.stringify([...map.values()])
      }
      return '[]'
    }
    server.forEach(add)
    return JSON.stringify([...map.values()])
  }
  if (!server.length) {
    if (IGREJAS_MAPA_SOMENTE_MANUAL && limpoLocal > 0 && limpoLocal >= limpoSrv && !local.length) return '[]'
    local.forEach(add)
    return JSON.stringify([...map.values()])
  }
  server.forEach(add)
  local.forEach(add)
  for (const id of ocultas) map.delete(id)
  return JSON.stringify([...map.values()])
}

/** União de enrich/coords/pastores/overrides por id de igreja. */
export function mergeIgrejasObjects(localVal, serverVal, limpoServer = 0) {
  const local = parseJsonSafe(localVal)
  const server = parseJsonSafe(serverVal)
  const lo = (local && typeof local === 'object' && !Array.isArray(local)) ? local : {}
  const so = (server && typeof server === 'object' && !Array.isArray(server)) ? server : {}
  const limpoLocal = readCadastroLimpoEmLocal()
  const limpoSrv = Number(limpoServer) || 0

  if (!Object.keys(lo).length && !Object.keys(so).length) return '{}'

  if (localCadastroIgrejasEscolheuVazio(limpoSrv) && !Object.keys(lo).length) return '{}'

  if (IGREJAS_MAPA_SOMENTE_MANUAL && limpoSrv > limpoLocal && limpoSrv > 0 && !Object.keys(lo).length) return '{}'

  if (!Object.keys(lo).length) return typeof serverVal === 'string' ? serverVal : JSON.stringify(so)
  if (!Object.keys(so).length) {
    if (IGREJAS_MAPA_SOMENTE_MANUAL && limpoLocal > 0 && limpoLocal >= limpoSrv && !Object.keys(lo).length) return '{}'
    return typeof localVal === 'string' ? localVal : JSON.stringify(lo)
  }

  const out = { ...so }
  for (const [id, val] of Object.entries(lo)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const prev = out[id] && typeof out[id] === 'object' ? out[id] : {}
      out[id] = { ...prev, ...val }
      for (const k of Object.keys(out[id])) {
        if ((val[k] === '' || val[k] == null) && prev[k] != null && prev[k] !== '') {
          out[id][k] = prev[k]
        }
      }
    } else if (val != null && val !== '') {
      out[id] = val
    }
  }
  return JSON.stringify(out)
}

/** União de saídas de material por id — lista vazia de um device não apaga o histórico. */
/** Une estoque de materiais por id — array vazio não apaga cadastro no sync. */
export function mergeMateriaisEstoque(localVal, serverVal, removedVal = null) {
  const removedRaw = removedVal != null
    ? parseJsonSafe(removedVal)
    : parseJsonSafe(typeof window !== 'undefined' ? window.localStorage.getItem('materiais_removidos') : null)
  const removed = new Set((Array.isArray(removedRaw) ? removedRaw : []).map(String))

  const localArr = parseJsonSafe(localVal)
  const serverArr = parseJsonSafe(serverVal)
  const local = Array.isArray(localArr) ? localArr : []
  const server = Array.isArray(serverArr) ? serverArr : []

  if (!local.length && server.length) {
    const localAt = getLocalAtMap()['materiais_estoque'] || 0
    if (materiaisLimpoVenceSobreLocal(localAt, 'materiais_estoque')) return '[]'
    return typeof serverVal === 'string' ? serverVal : JSON.stringify(server)
  }
  if (!server.length && local.length) {
    const localAt = getLocalAtMap()['materiais_estoque'] || 0
    if (materiaisLimpoVenceSobreLocal(localAt, 'materiais_estoque')) return '[]'
    return typeof localVal === 'string' ? localVal : JSON.stringify(local)
  }
  if (!local.length && !server.length) return localVal ?? serverVal ?? '[]'

  const map = new Map()

  function stamp(item) {
    return Math.max(
      Date.parse(item?.atualizadoEm || '') || 0,
      Date.parse(item?.criadoEm || '') || 0,
    )
  }

  function prefer(a, b) {
    const ta = stamp(a)
    const tb = stamp(b)
    const newer = ta >= tb ? a : b
    const older = newer === a ? b : a
    const out = { ...older, ...newer, id: older.id || newer.id }
    // Não perder foto / categoria / nome rico
    for (const k of ['nome', 'categoria', 'fotoX', 'fotoY', 'fotoZoom', 'estoqueMinimo']) {
      if ((out[k] === '' || out[k] == null) && older[k] != null && older[k] !== '') out[k] = older[k]
    }
    // Preferir URL remota sobre Base64 (payload leve após migração)
    {
      const fa = String(newer.foto || '')
      const fb = String(older.foto || '')
      const remoteA = fa.startsWith('/uploads/') || /^https?:\/\//i.test(fa)
      const remoteB = fb.startsWith('/uploads/') || /^https?:\/\//i.test(fb)
      if (remoteA) out.foto = fa
      else if (remoteB) out.foto = fb
      else if ((out.foto === '' || out.foto == null) && fb) out.foto = fb
      else if (!out.foto && fa) out.foto = fa
    }
    // Quantidade: item mais recente vence (admin reduz estoque → membro recebe)
    if (ta !== tb) {
      out.quantidade = Number((ta >= tb ? a : b).quantidade) || 0
    } else {
      out.quantidade = Math.max(Number(a.quantidade) || 0, Number(b.quantidade) || 0)
    }
    out.criadoEm = older.criadoEm || newer.criadoEm
    out.atualizadoEm = newer.atualizadoEm || older.atualizadoEm
    return out
  }

  function add(item) {
    if (!item || typeof item !== 'object') return
    const id = item.id != null && item.id !== '' ? String(item.id) : null
    if (!id) return
    if (removed.has(id)) return
    const nomeKey = String(item.nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
    if (nomeKey && removed.has(nomeKey)) return
    if (map.has(id)) map.set(id, prefer(map.get(id), item))
    else map.set(id, item)
  }

  server.forEach(add)
  local.forEach(add)
  return JSON.stringify([...map.values()].sort((a, b) => stamp(b) - stamp(a)))
}

function mergeMateriaisListaComLimpeza(localVal, serverVal, storeKey, removedVal, removedKey, ctx = null) {
  const localArr = parseJsonSafe(localVal)
  const serverArr = parseJsonSafe(serverVal)
  const local = Array.isArray(localArr) ? localArr : []
  const server = Array.isArray(serverArr) ? serverArr : []
  const localAt = getLocalAtMap()[storeKey] || 0
  const limpoVence = materiaisLimpoVenceSobreLocal(localAt, storeKey, ctx?.localMap, ctx?.serverMap)

  if (!local.length && server.length) {
    if (limpoVence) return '[]'
  }
  if (!server.length && local.length) {
    if (limpoVence) return '[]'
    return typeof localVal === 'string' ? localVal : JSON.stringify(local)
  }

  return mergeMateriaisDistribuicaoCore(localVal, serverVal, removedVal, removedKey)
}

function mergeMateriaisDistribuicaoCore(localVal, serverVal, removedVal = null, removedKey = 'materiais_distribuicao_removidos') {
  const localArr = parseJsonSafe(localVal)
  const serverArr = parseJsonSafe(serverVal)
  const local = Array.isArray(localArr) ? localArr : []
  const server = Array.isArray(serverArr) ? serverArr : []

  const removedRaw = removedVal != null
    ? parseJsonSafe(removedVal)
    : parseJsonSafe(
      typeof window !== 'undefined' ? window.localStorage.getItem(removedKey) : null,
    )
  const removed = new Set((Array.isArray(removedRaw) ? removedRaw : []).map(String))
  const map = new Map()

  function stamp(item) {
    return Math.max(
      Date.parse(item?.atualizadoEm || '') || 0,
      Date.parse(item?.data || '') || 0,
      Date.parse(item?.criadoEm || '') || 0,
    )
  }

  function add(item) {
    if (!item || typeof item !== 'object') return
    const id = item.id != null && item.id !== '' ? String(item.id) : null
    if (!id || removed.has(id)) return
    if (!map.has(id)) {
      map.set(id, item)
      return
    }
    const prev = map.get(id)
    const tPrev = stamp(prev)
    const tNew = stamp(item)
    map.set(id, tNew >= tPrev ? { ...prev, ...item } : { ...item, ...prev })
  }

  server.forEach(add)
  local.forEach(add)

  const out = [...map.values()].sort((a, b) => stamp(b) - stamp(a))
  return JSON.stringify(out)
}

export function mergeMateriaisDistribuicao(localVal, serverVal, removedVal = null, ctx = null) {
  return mergeMateriaisListaComLimpeza(
    localVal,
    serverVal,
    'materiais_distribuicao',
    removedVal,
    'materiais_distribuicao_removidos',
    ctx,
  )
}

/** Entradas de estoque — união por id (não LWW de array inteiro). */
export function mergeMateriaisEntradas(localVal, serverVal, ctx = null) {
  return mergeMateriaisListaComLimpeza(
    localVal,
    serverVal,
    'materiais_entradas',
    null,
    'materiais_entradas_removidos',
    ctx,
  )
}

/**
 * Une retiradas por id com LWW em atualizadoEm (cancelar/validar/recusar persistem).
 * Respeita materiais_retiradas_removidos para não ressuscitar exclusões.
 */
export function mergeMateriaisRetiradas(localVal, serverVal, removedVal = null, ctx = null) {
  const localArr = parseJsonSafe(localVal)
  const serverArr = parseJsonSafe(serverVal)
  const local = Array.isArray(localArr) ? localArr : []
  const server = Array.isArray(serverArr) ? serverArr : []
  const localAt = getLocalAtMap()['materiais_retiradas'] || 0

  if (!local.length && server.length) {
    if (materiaisLimpoVenceSobreLocal(localAt, 'materiais_retiradas', ctx?.localMap, ctx?.serverMap)) return '[]'
  }
  if (!server.length && local.length) {
    if (materiaisLimpoVenceSobreLocal(localAt, 'materiais_retiradas', ctx?.localMap, ctx?.serverMap)) return '[]'
    return typeof localVal === 'string' ? localVal : JSON.stringify(local)
  }

  const removedRaw = removedVal != null
    ? parseJsonSafe(removedVal)
    : parseJsonSafe(
      typeof window !== 'undefined' ? window.localStorage.getItem('materiais_retiradas_removidos') : null,
    )
  const removed = new Set((Array.isArray(removedRaw) ? removedRaw : []).map(String))
  const map = new Map()

  function stamp(item) {
    return Math.max(
      Date.parse(item?.atualizadoEm || '') || 0,
      Date.parse(item?.dataValidacao || '') || 0,
      Date.parse(item?.dataPedido || '') || 0,
      Date.parse(item?.data || '') || 0,
      Date.parse(item?.criadoEm || '') || 0,
    )
  }

  function add(item) {
    if (!item || typeof item !== 'object') return
    const id = item.id != null && item.id !== '' ? String(item.id) : null
    if (!id || removed.has(id)) return
    if (!map.has(id)) {
      map.set(id, item)
      return
    }
    const prev = map.get(id)
    const tPrev = stamp(prev)
    const tNew = stamp(item)
    if (tNew > tPrev) {
      map.set(id, { ...prev, ...item })
      return
    }
    if (tPrev > tNew) {
      map.set(id, { ...item, ...prev })
      return
    }
    const rank = (s) => ({ validado: 3, recusado: 2, cancelado: 2, pendente: 1 }[s] || 0)
    map.set(id, rank(item.status) >= rank(prev.status) ? { ...prev, ...item } : { ...item, ...prev })
  }

  server.forEach(add)
  local.forEach(add)

  const out = [...map.values()].sort((a, b) => stamp(b) - stamp(a))
  return JSON.stringify(out)
}

function parseServerAt(raw) {
  if (!raw) return 0
  const t = Date.parse(String(raw).replace(' ', 'T'))
  return Number.isFinite(t) ? t : 0
}

function emptyJsonForMateriaisKey(key) {
  if (key === 'materiais_retirada_cfg') return '{}'
  return '[]'
}

/** Limpeza total ou só histórico — local vazio não pode perder para nuvem cheia. */
function pickMateriaisClearGuard(key, localVal, serverVal, serverUpdatedAt, ctx) {
  if (!String(key || '').startsWith('materiais_')
    || key === 'materiais_limpo_em'
    || key === 'materiais_historico_limpo_em') return null

  const localEmpty = storeValueEmpty(localVal)
  const serverEmpty = storeValueEmpty(serverVal)
  const localAt = getLocalAtMap()[key] || 0
  const limpoVence = materiaisLimpoVenceSobreLocal(localAt, key, ctx?.localMap, ctx?.serverMap)

  if (!limpoVence) return null
  if (pending.has(key)) return null
  // Import/cadastro mais novo que a limpeza — nunca apaga
  if (!localEmpty && localAt > materiaisClearTsEfetivo(key, ctx?.localMap, ctx?.serverMap)) return null

  if (localEmpty && serverEmpty) return emptyJsonForMateriaisKey(key)
  if (localEmpty && !serverEmpty) return emptyJsonForMateriaisKey(key)
  if (!localEmpty && serverEmpty) return emptyJsonForMateriaisKey(key)

  return null
}

/** Se um lado está vazio e o outro não, nunca deixa o vazio ganhar. */
function preferNonEmptyCollection(localVal, serverVal) {
  if ((materiaisLimpoEmEfetivo() > 0 || materiaisHistoricoLimpoEmEfetivo() > 0) && storeValueEmpty(localVal)) return null
  const localEmpty = storeValueEmpty(localVal)
  const serverEmpty = storeValueEmpty(serverVal)
  if (localEmpty && !serverEmpty) return serverVal
  if (serverEmpty && !localEmpty) return localVal
  return null
}

/** Visitas no modo manual: só ids presentes em igrejas_custom. */
function filtrarVisitasJsonAoCadastroManual(val) {
  if (!IGREJAS_MAPA_SOMENTE_MANUAL) return val
  const map = parseJsonSafe(typeof val === 'string' ? val : JSON.stringify(val ?? {}))
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    return typeof val === 'string' ? val : JSON.stringify(val ?? {})
  }
  const custom = parseJsonSafe(readStorageRawSync('igrejas_custom'))
  const allow = new Set((Array.isArray(custom) ? custom : []).map(c => String(c.id)))
  const out = {}
  for (const [k, v] of Object.entries(map)) {
    if (allow.has(String(k))) out[k] = v
  }
  return typeof val === 'string' ? JSON.stringify(out) : out
}

function readVisitasLimpoEmFromStorage(serverMap) {
  let local = 0
  try {
    if (typeof window !== 'undefined') {
      local = Number(JSON.parse(window.localStorage.getItem('igrejas_visitas_cleared_at') || '0')) || 0
    }
  } catch { local = 0 }
  let stored = 0
  try {
    const raw = serverMap?.igrejas_visitas_cleared_at ?? readStorageRawSync('igrejas_visitas_cleared_at')
    stored = Number(parseJsonSafe(raw)) || 0
  } catch { stored = 0 }
  return Math.max(local, stored)
}

function pickVisitasValue(localVal, serverVal, serverUpdatedAt, serverMap) {
  localVal = filtrarVisitasJsonAoCadastroManual(localVal)
  serverVal = filtrarVisitasJsonAoCadastroManual(serverVal)
  const localAt = getLocalAtMap().igrejas_visitas || 0
  const serverAt = parseServerAt(serverUpdatedAt)
  const limpoEm = readVisitasLimpoEmFromStorage(serverMap)

  const localEmpty = visitasStoreEmpty(localVal)
  const serverEmpty = visitasStoreEmpty(serverVal)

  if (localEmpty && serverEmpty) return '{}'

  // Limpeza explícita pelo usuário — local vazio sempre vence sobre nuvem cheia
  if (localEmpty && !serverEmpty) {
    if (limpoEm > 0 || pending.has('igrejas_visitas') || localAt >= serverAt) {
      return compactVisitasJson('{}', { limpoEm })
    }
    return typeof serverVal === 'string' ? serverVal : JSON.stringify(serverVal ?? {})
  }

  if (localVal == null && serverVal != null) {
    if (limpoEm > 0) return compactVisitasJson(parseJsonSafe(serverVal) || {}, { limpoEm })
    return typeof serverVal === 'string' ? serverVal : JSON.stringify(serverVal ?? {})
  }

  if (localVal != null && serverVal == null) {
    return compactVisitasJson(parseJsonSafe(localVal) || {}, { limpoEm })
  }

  if (!localEmpty && serverEmpty && serverAt > localAt && limpoEm === 0) {
    return typeof serverVal === 'string' ? serverVal : JSON.stringify(serverVal ?? {})
  }

  return mergeVisitasCanon(localVal, serverVal, limpoEm)
}

function pickBetterValue(key, localVal, serverVal, serverUpdatedAt = null, ctx = null) {
  if (pending.has(key) || pendingDeletes.has(key)) return localVal ?? serverVal

  if (key === 'materiais_limpo_em') {
    const localMap = ctx?.localMap
    const serverMap = ctx?.serverMap
    const dataAt = Math.max(
      getLocalAtMap()['materiais_estoque'] || 0,
      getLocalAtMap()['materiais_entradas'] || 0,
    )
    let serverTs = 0
    try {
      serverTs = Number(parseJsonSafe(serverVal)) || 0
    } catch { serverTs = 0 }
    const hasEstoque = !storeValueEmpty(localMap?.materiais_estoque)
      || !storeValueEmpty(serverMap?.materiais_estoque)
    const hasEntradas = !storeValueEmpty(localMap?.materiais_entradas)
      || !storeValueEmpty(serverMap?.materiais_entradas)
    // Reimport/cadastro anula flag de limpar tudo
    if (hasEstoque || hasEntradas) {
      if (localVal == null && serverVal != null) return null
      return null
    }
    if (localVal == null && serverVal != null && dataAt > serverTs) return null
    if (pendingDeletes.has(key)) return localVal ?? null
  }

  if (key === 'materiais_historico_limpo_em') {
    if (pendingDeletes.has(key)) return localVal ?? null
    let localTs = 0
    let serverTs = 0
    try { localTs = Number(parseJsonSafe(localVal)) || 0 } catch { localTs = 0 }
    try { serverTs = Number(parseJsonSafe(serverVal)) || 0 } catch { serverTs = 0 }
    if (localVal != null && serverVal == null) return localVal
    if (localVal == null && serverVal != null) return serverVal
    if (localVal != null && serverVal != null) {
      return localTs >= serverTs ? localVal : serverVal
    }
    return localVal ?? serverVal
  }

  if (key === 'igrejas_visitas') {
    return pickVisitasValue(localVal, serverVal, serverUpdatedAt, ctx?.serverMap)
  }

  if (key === 'igrejas_visitas_cleared_at') {
    let localTs = 0
    let serverTs = 0
    try { localTs = Number(parseJsonSafe(localVal)) || 0 } catch { localTs = 0 }
    try { serverTs = Number(parseJsonSafe(serverVal)) || 0 } catch { serverTs = 0 }
    if (localVal != null && serverVal == null) return localVal
    if (localVal == null && serverVal != null) return serverVal
    if (localVal != null && serverVal != null) {
      const maxTs = Math.max(localTs, serverTs)
      return String(maxTs)
    }
    return localVal ?? serverVal
  }

  if (key === IGREJAS_CADASTRO_LIMPO_EM_KEY) {
    let localTs = 0
    let serverTs = 0
    try { localTs = Number(parseJsonSafe(localVal)) || 0 } catch { localTs = 0 }
    try { serverTs = Number(parseJsonSafe(serverVal)) || 0 } catch { serverTs = 0 }
    if (localVal != null && serverVal == null) return localVal
    if (localVal == null && serverVal != null) return serverVal
    if (localVal != null && serverVal != null) return localTs >= serverTs ? localVal : serverVal
    return localVal ?? serverVal
  }

  const materiaisGuard = pickMateriaisClearGuard(key, localVal, serverVal, serverUpdatedAt, ctx)
  if (materiaisGuard != null) return materiaisGuard

  const localAt = getLocalAtMap()[key] || 0
  const serverAt = parseServerAt(serverUpdatedAt)
  const localMap = ctx?.localMap || null
  const serverMap = ctx?.serverMap || null

  if (localVal != null && serverVal == null) return localVal
  if (localVal == null && serverVal != null) return serverVal

  // Apoiadores: união por pessoa — leads do formulário não podem sumir no LWW
  if (key === 'apoiadores_lista') return mergeApoiadoresLista(localVal, serverVal)
  if (key === 'apoiadores_removidos') return mergeIdSetLists(localVal, serverVal)

  // Equipe: união por id — membro não pode sumir no LWW de array inteiro
  if (key === 'equipe_membros') return mergeEquipeMembros(localVal, serverVal)
  if (key === 'equipe_removidos') return mergeIdSetLists(localVal, serverVal)
  // Removidos: união permanente — alinhado ao servidor (tombstone de exclusão)
  if (key === 'materiais_removidos') {
    return mergeIdSetLists(localVal, serverVal)
  }
  if (key === 'materiais_retiradas_removidos') return mergeIdSetLists(localVal, serverVal)
  if (key === 'materiais_distribuicao_removidos') return mergeIdSetLists(localVal, serverVal)
  if (key === 'materiais_entradas') {
    return mergeMateriaisEntradas(localVal, serverVal, ctx)
  }
  if (key === 'materiais_distribuicao') {
    const rem = mergeIdSetLists(
      localMap?.materiais_distribuicao_removidos ?? (typeof window !== 'undefined' ? window.localStorage.getItem('materiais_distribuicao_removidos') : null),
      serverMap?.materiais_distribuicao_removidos ?? null,
    )
    return mergeMateriaisDistribuicao(localVal, serverVal, rem, ctx)
  }
  if (key === 'materiais_retiradas') {
    const rem = mergeIdSetLists(
      localMap?.materiais_retiradas_removidos ?? (typeof window !== 'undefined' ? window.localStorage.getItem('materiais_retiradas_removidos') : null),
      serverMap?.materiais_retiradas_removidos ?? null,
    )
    return mergeMateriaisRetiradas(localVal, serverVal, rem, ctx)
  }
  if (key === 'rotas_logistica_removidos') return mergeIdSetLists(localVal, serverVal)
  if (key === 'rotas_diarias_removidos') return mergeIdSetLists(localVal, serverVal)
  if (key === 'rotas_diarias') {
    const rem = mergeIdSetLists(
      localMap?.rotas_diarias_removidos ?? (typeof window !== 'undefined' ? window.localStorage.getItem('rotas_diarias_removidos') : null),
      serverMap?.rotas_diarias_removidos ?? null,
    )
    return mergeRotasDiarias(localVal, serverVal, rem)
  }
  if (key === 'rotas_logistica') {
    const rem = mergeIdSetLists(
      localMap?.rotas_logistica_removidos ?? (typeof window !== 'undefined' ? window.localStorage.getItem('rotas_logistica_removidos') : null),
      serverMap?.rotas_logistica_removidos ?? null,
    )
    return mergeRotasLogistica(localVal, serverVal, rem)
  }
  if (key === 'rotas_compartilhamentos') {
    return mergeRotasCompartilhamentos(localVal, serverVal)
  }
  if (isMateriaisHistoricoPullKey(key)) {
    return pickMateriaisHistoricoLww(key, localVal, serverVal, serverUpdatedAt, ctx)
  }
  if (key === 'materiais_categorias') {
    const localArr = parseJsonSafe(localVal)
    const serverArr = parseJsonSafe(serverVal)
    const merged = (() => {
      try {
        const map = new Map()
        const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
        for (const list of [localArr, serverArr]) {
          for (const c of Array.isArray(list) ? list : []) {
            const nome = typeof c === 'string' ? c.trim() : String(c?.nome || '').trim()
            if (!nome) continue
            const k = norm(nome)
            if (map.has(k)) continue
            map.set(k, typeof c === 'string' ? { nome, cor: '#94a3b8' } : { nome, cor: c.cor || '#94a3b8' })
          }
        }
        return [...map.values()]
      } catch {
        return Array.isArray(localArr) ? localArr : (Array.isArray(serverArr) ? serverArr : [])
      }
    })()
    return JSON.stringify(merged)
  }

  if (key === 'igrejas_ocultas') return mergeIdSetLists(localVal, serverVal)

  // Igrejas: união por id — exclusões em igrejas_ocultas não voltam no sync
  if (key === 'igrejas_custom') {
    const ocultas = mergedIgrejasOcultasJson(localMap, serverMap)
    return mergeIgrejasCustom(localVal, serverVal, ocultas)
  }
  if (key === 'igrejas_enrich' || key === 'geo_coords_igrejas'
    || key === 'pastores_igrejas' || key === 'igrejas_overrides') {
    const localEmpty = storeValueEmpty(localVal)
    const serverEmpty = storeValueEmpty(serverVal)
    if (localEmpty && !serverEmpty) return serverVal
    if (serverEmpty && !localEmpty) return localVal
    return mergeIgrejasObjects(localVal, serverVal)
  }

  // Estoque: união por id — array vazio / LWW nunca apaga o cadastro
  if (key === 'materiais_estoque') {
    const rem = mergeIdSetLists(
      localMap?.materiais_removidos ?? (typeof window !== 'undefined' ? window.localStorage.getItem('materiais_removidos') : null),
      serverMap?.materiais_removidos ?? null,
    )
    return mergeMateriaisEstoque(localVal, serverVal, rem)
  }
  if (key === 'materiais_coordenadores') {
    const guard = preferNonEmptyCollection(localVal, serverVal)
    if (guard != null) return guard
    return mergeMateriaisDistribuicao(localVal, serverVal)
  }
  if (key === 'agenda_eventos' || key === 'empresas_lista' || key === 'equipe_tarefas'
    || key === 'pesquisas_enquetes' || key === 'pesquisas_respostas') {
    const guard = preferNonEmptyCollection(localVal, serverVal)
    if (guard != null) return guard
  }
  if (key === 'previsao_data' || key === 'eleitores_data' || key === 'tesouraria_movimentos'
    || key === 'tesouraria_conta') {
    const localEmpty = storeValueEmpty(localVal)
    const serverEmpty = storeValueEmpty(serverVal)
    if (localEmpty && !serverEmpty) return serverVal
    if (serverEmpty && !localEmpty) return localVal
  }

  // Decisão por tempo — NÃO preferir lista/objeto “maior”
  // (isso restaurava apoiadores/materiais apagados após o sync)
  if (localAt || serverAt) {
    if (localAt > serverAt + 1500) return localVal
    if (serverAt > localAt + 1500) return serverVal
    // Empate / diferença pequena: se o local foi editado, mantém o local
    if (localAt >= serverAt) return localVal
    return serverVal
  }

  if (key === 'eleitores_data') {
    const lv = countVotosEleitores(localVal)
    const sv = countVotosEleitores(serverVal)
    if (lv !== sv) return lv >= sv ? localVal : serverVal
  }

  // Sem timestamps: preferir o que está neste dispositivo (última ação do usuário)
  return localVal ?? serverVal
}

/** Converte chaves legadas u:uuid:appKey → appKey */
function normalizeServerMap(raw) {
  const out = {}
  const updated = {}
  if (!raw || typeof raw !== 'object') return { data: out, updated }

  if (raw.data && typeof raw.data === 'object') {
    for (const [key, val] of Object.entries(raw.data)) {
      if (!isAppKey(key)) continue
      const str = typeof val === 'string' ? val : JSON.stringify(val)
      pickNormalizedServerValue(out, updated, key, str)
    }
    if (raw.updated && typeof raw.updated === 'object') {
      for (const [key, ts] of Object.entries(raw.updated)) {
        if (isAppKey(key)) updated[key] = ts
      }
    }
    return { data: out, updated }
  }

  for (const [key, val] of Object.entries(raw)) {
    const str = typeof val === 'string' ? val : JSON.stringify(val)
    const scoped = key.match(/^u:(?:local|[0-9a-f-]{36}):(.+)$/i)
    const appKey = scoped ? scoped[1] : key
    if (!isAppKey(appKey)) continue
    pickNormalizedServerValue(out, updated, appKey, str, scoped ? key : appKey)
  }
  return { data: out, updated }
}

/** Escolhe valor do servidor — timestamp primeiro; empate prefere menor (exclusões). */
function pickNormalizedServerValue(out, updated, appKey, str, updatedKey = appKey) {
  if (!out[appKey]) {
    out[appKey] = str
    return
  }
  const prevTs = parseServerAt(updated[appKey])
  const curTs = parseServerAt(updated[updatedKey])
  if (curTs > prevTs + 500) {
    out[appKey] = str
  } else if (Math.abs(curTs - prevTs) <= 500 && str.length < out[appKey].length) {
    out[appKey] = str
  }
}

function nativeSet(key, value) {
  nativeSetSafe(key, value)
}

function applyMergedToLocal(merged, serverWins = {}, removeKeys = []) {
  suppress = true
  try {
    for (const key of removeKeys) {
      if (!isAppKey(key) || pending.has(key)) continue
      if (isHeavyStorageKey(key)) removeHeavyRawSync(key)
      else if (originalRemoveItem) originalRemoveItem(key)
      else window.localStorage.removeItem(key)
      const map = getLocalAtMap()
      if (map[key]) {
        delete map[key]
        if (originalSetItem) originalSetItem(LOCAL_AT_KEY, JSON.stringify(map))
        else window.localStorage.setItem(LOCAL_AT_KEY, JSON.stringify(map))
      }
    }
    for (const [key, value] of Object.entries(merged)) {
      if (value == null || !isAppKey(key)) continue
      if (pending.has(key)) continue
      let str = typeof value === 'string' ? value : JSON.stringify(value)
      if (key === 'igrejas_custom') {
        str = sanitizarIgrejasCustomJson(str)
        merged[key] = str
      }
      if (key === 'igrejas_visitas') {
        str = compactVisitasJson(str)
        merged[key] = str
      }
      if (key === 'eleitores_data' && (str === 'null' || parseJsonSafe(str) == null)) continue
      const prev = readStorageRawSync(key)
      const prevEmpty = storeValueEmpty(prev)
      const nextEmpty = storeValueEmpty(str)
      const localAt = getLocalAtMap()[key] || 0
      // Não sobrescrever dado local recente com vazio vindo do merge
      if (!prevEmpty && nextEmpty && localAt > Date.now() - 120000) continue
      if (!prevEmpty && nextEmpty && !materiaisLimpoVenceSobreLocal(localAt, key)) continue
      nativeSet(key, str)
      if (serverWins[key]) {
        touchLocalAt(key, parseServerAt(serverWins[key]) || Date.now())
      } else if (normJson(prev) !== normJson(str)) {
        touchLocalAt(key)
      }
    }
  } finally { suppress = false }
}

/** Pendências ainda abertas do membro logado (null = falha de rede). */
async function phpFetchMyPendingKeys() {
  if (!assertPhpAuth()) return null
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 12000)
    const r = await fetch(`${PHP_API}?action=pending_list`, {
      signal: ctrl.signal,
      headers: phpHeaders(),
    })
    clearTimeout(t)
    if (!r.ok) return null
    const data = await r.json().catch(() => ({}))
    const keys = new Set()
    for (const row of data.pending || []) {
      if (row?.app_key) keys.add(row.app_key)
    }
    return keys
  } catch {
    return null
  }
}

async function phpGetAll() {
  if (!assertPhpAuth()) return { data: {}, updated: {} }
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 55000)
    const r = await fetch(PHP_API, { signal: ctrl.signal, headers: phpHeaders() })
    clearTimeout(t)
    if (!r.ok) {
      console.warn(`[sync] HTTP ${r.status} ao carregar nuvem`)
      return null
    }
    const raw = await r.json()
    if (raw?.updated && typeof raw.updated === 'object') {
      cacheServerMetaFromRemote({
        keys: raw.keys || Object.keys(raw.updated),
        updated: raw.updated,
      })
    }
    lastFullPullAt = Date.now()
    return normalizeServerMap(raw)
  } catch {
    return null
  }
}

function serverMetaStorageKey() {
  return `${SERVER_META_PREFIX}${phpTenantId || 'none'}`
}

function getCachedServerMeta() {
  if (!phpTenantId) return null
  try {
    const raw = window.localStorage.getItem(serverMetaStorageKey())
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function fingerprintServerMeta(meta) {
  if (!meta?.updated) return ''
  const keys = Array.isArray(meta.keys) ? [...meta.keys].sort() : Object.keys(meta.updated).sort()
  const parts = keys.map(k => `${k}:${meta.updated[k] || ''}`)
  return parts.join('|')
}

function cacheServerMetaFromRemote(meta) {
  if (!phpTenantId || !meta?.updated) return
  const keys = Array.isArray(meta.keys) ? meta.keys : Object.keys(meta.updated)
  const payload = {
    keys,
    updated: meta.updated,
    fingerprint: fingerprintServerMeta({ keys, updated: meta.updated }),
    cachedAt: Date.now(),
  }
  try {
    nativeSet(serverMetaStorageKey(), JSON.stringify(payload))
  } catch { /* ignore quota */ }
}

async function phpGetStoreMeta() {
  if (!assertPhpAuth()) return null
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 15000)
    const r = await fetch(`${PHP_API}?action=store_meta`, {
      signal: ctrl.signal,
      headers: phpHeaders(),
    })
    clearTimeout(t)
    if (!r.ok) return null
    const raw = await r.json().catch(() => null)
    if (!raw?.ok || !raw.updated) return null
    return { keys: raw.keys || Object.keys(raw.updated), updated: raw.updated }
  } catch {
    return null
  }
}

async function phpGetPartialKeys(keys) {
  if (!assertPhpAuth() || !keys?.length) return { data: {}, updated: {} }
  const uniq = [...new Set(keys.filter(k => isAppKey(k)))]
  if (!uniq.length) return { data: {}, updated: {} }
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 45000)
    const r = await fetch(
      `${PHP_API}?keys=${encodeURIComponent(uniq.join(','))}`,
      { signal: ctrl.signal, headers: phpHeaders() },
    )
    clearTimeout(t)
    if (!r.ok) return null
    const raw = await r.json()
    return normalizeServerMap(raw)
  } catch {
    return null
  }
}

/**
 * Pull leve: meta → só baixa chaves alteradas (live pull ~8s).
 * Retorna { unchanged: true } quando nada mudou na nuvem.
 */
async function phpGetSmart({ forceFull = false } = {}) {
  if (forceFull || Date.now() - lastFullPullAt > FULL_PULL_EVERY_MS) {
    return phpGetAll()
  }
  const meta = await phpGetStoreMeta()
  if (!meta) return phpGetAll()

  const cached = getCachedServerMeta()
  const fp = fingerprintServerMeta(meta)
  if (cached?.fingerprint === fp) {
    return { data: {}, updated: {}, unchanged: true }
  }

  if (!cached?.updated) {
    cacheServerMetaFromRemote(meta)
    return phpGetAll()
  }

  const changedKeys = []
  const keySet = new Set(meta.keys || [])
  for (const k of keySet) {
    if (!isAppKey(k)) continue
    if (cached.updated[k] !== meta.updated[k]) changedKeys.push(k)
  }
  const removedKeys = (cached.keys || []).filter(k => isAppKey(k) && !keySet.has(k))

  if (!changedKeys.length && !removedKeys.length) {
    cacheServerMetaFromRemote(meta)
    return { data: {}, updated: {}, unchanged: true }
  }

  // Muitas mudanças → pull completo costuma ser mais barato
  if (changedKeys.length > 18 || changedKeys.length > (keySet.size * 0.45)) {
    return phpGetAll()
  }

  const partial = await phpGetPartialKeys(changedKeys)
  if (!partial) return phpGetAll()
  cacheServerMetaFromRemote(meta)
  return { ...partial, removedKeys }
}

async function phpDelete(key) {
  if (!assertPhpAuth()) return false

  if (isMemberNeedsApproval()) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 15000)
      const r = await fetch(`${PHP_API}?action=submit_pending`, {
        method: 'POST',
        headers: phpHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ key, change_action: 'delete' }),
        signal: ctrl.signal,
      })
      clearTimeout(t)
      const data = await r.json().catch(() => ({}))
      if (!r.ok || data.ok === false) {
        lastSyncError = data.error || `HTTP ${r.status}`
        setKeyStatus(key, 'error', lastSyncError)
        return false
      }
      if (!data.skipped) notifyApprovalQueued()
      return true
    } catch (e) {
      lastSyncError = e.message || `Erro ao remover ${key}`
      return false
    }
  }

  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 15000)
    const r = await fetch(`${PHP_API}?key=${encodeURIComponent(key)}`, {
      method: 'DELETE',
      signal: ctrl.signal,
      headers: phpHeaders(),
    })
    clearTimeout(t)
    if (!r.ok) {
      lastSyncError = `HTTP ${r.status} ao remover ${key}`
      return false
    }
    const data = await r.json().catch(() => ({}))
    if (data.ok === false) {
      lastSyncError = data.error || `Falha ao remover ${key}`
      return false
    }
    return true
  } catch (e) {
    lastSyncError = e.message || `Erro ao remover ${key}`
    return false
  }
}

async function phpSet(key, value) {
  if (!phpAuthReady()) return 'auth_pending'
  const raw = typeof value === 'string' ? value : JSON.stringify(value)
  const body = sanitizeSyncPayload(key, raw)

  if (isMemberNeedsApproval()) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 30000)
      const r = await fetch(`${PHP_API}?action=submit_pending`, {
        method: 'POST',
        headers: phpHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ key, value: body, change_action: 'set' }),
        signal: ctrl.signal,
      })
      clearTimeout(t)
      const data = await r.json().catch(() => ({}))
      if (!r.ok || data.ok === false) {
        lastSyncError = data.error || `HTTP ${r.status}`
        setKeyStatus(key, 'error', lastSyncError)
        return false
      }
      if (!data.skipped) notifyApprovalQueued()
      return true
    } catch (e) {
      lastSyncError = e.message || `Erro ao enviar ${key}`
      setKeyStatus(key, 'error', lastSyncError)
      return false
    }
  }

  try {
    const ctrl = new AbortController()
    const ms = body.length > LARGE_BYTES ? 120000 : 30000
    const t = setTimeout(() => ctrl.abort(), ms)
    const headers = phpHeaders({ 'Content-Type': 'application/json' })
    if (serverUpdatedSnapshot[key]) {
      headers['X-Expected-Updated-At'] = serverUpdatedSnapshot[key]
    }
    const r = await fetch(`${PHP_API}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers,
      body,
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (r.status === 409) {
      lastSyncError = 'Outro aparelho atualizou — sincronizando…'
      setKeyStatus(key, 'error', lastSyncError)
      pullAll(currentUserId || phpTenantId || 'local', { preferServerKeys: [key] }).catch(() => {})
      return false
    }
    if (!r.ok) {
      lastSyncError = `HTTP ${r.status} ao salvar ${key}`
      setKeyStatus(key, 'error', lastSyncError)
      return false
    }
    const data = await r.json().catch(() => ({}))
    if (data.ok === false) {
      lastSyncError = data.error || `Falha ao salvar ${key}`
      setKeyStatus(key, 'error', lastSyncError)
      return false
    }
    setKeyStatus(key, 'synced')
    return true
  } catch (e) {
    lastSyncError = e?.name === 'AbortError' ? 'Timeout de rede' : (e.message || `Erro ao salvar ${key}`)
    setKeyStatus(key, 'error', lastSyncError)
    return false
  }
}

async function phpBulkChunk(entries, replaceKeys = []) {
  if (!entries.length && !replaceKeys.length) return true
  if (!phpAuthReady()) return 'auth_pending'
  try {
    const body = {}
    for (const [key, value] of entries) {
      const sanitized = sanitizeSyncPayload(key, value)
      body[key] = parseJsonSafe(sanitized)
    }
    if (replaceKeys.length) body._replace = replaceKeys
    const expectedUpdated = {}
    for (const [key] of entries) {
      if (serverUpdatedSnapshot[key]) expectedUpdated[key] = serverUpdatedSnapshot[key]
    }
    if (Object.keys(expectedUpdated).length) body._expectedUpdated = expectedUpdated
    const payload = JSON.stringify(body)
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 45000)
    const r = await fetch(`${PHP_API}?bulk=1`, {
      method: 'POST',
      headers: phpHeaders({ 'Content-Type': 'application/json' }),
      body: payload,
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (r.status === 409) {
      const data = await r.json().catch(() => ({}))
      const keys = Array.isArray(data.keys) ? data.keys : []
      lastSyncError = 'Outro aparelho atualizou estes dados — baixando de novo…'
      for (const [k] of entries) setKeyStatus(k, 'error', lastSyncError)
      if (keys.length) {
        pullAll(currentUserId || phpTenantId || 'local', { preferServerKeys: keys }).catch(() => {})
      } else {
        scheduleLivePull(400)
      }
      return false
    }
    if (!r.ok) {
      lastSyncError = `bulk HTTP ${r.status}`
      for (const [k] of entries) setKeyStatus(k, 'error', lastSyncError)
      return false
    }
    const data = await r.json().catch(() => ({}))
    if (data.ok !== true) {
      lastSyncError = data.error || 'bulk rejeitado'
      for (const [k] of entries) setKeyStatus(k, 'error', lastSyncError)
      return false
    }
    const partialErrors = Array.isArray(data.errors) ? data.errors : []
    if (partialErrors.length) {
      const failedKeys = new Set()
      for (const err of partialErrors) {
        const key = String(err).split(':')[0]?.trim()
        if (key) failedKeys.add(key)
      }
      for (const [k] of entries) {
        if (failedKeys.has(k)) setKeyStatus(k, 'error', 'bulk parcial')
        else setKeyStatus(k, 'synced')
      }
      for (const k of failedKeys) {
        const row = entries.find(([key]) => key === k)
        if (!row) continue
        const r = await phpSet(k, row[1])
        if (isAuthPending(r)) return 'auth_pending'
        if (!r) return false
        setKeyStatus(k, 'synced')
      }
      return true
    }
    for (const [k] of entries) setKeyStatus(k, 'synced')
    return true
  } catch (e) {
    lastSyncError = e?.name === 'AbortError' ? 'Timeout de rede' : (e.message || 'bulk falhou')
    for (const [k] of entries) setKeyStatus(k, 'error', lastSyncError)
    return false
  }
}

function isAuthPending(result) {
  return result === 'auth_pending'
}

function scheduleAuthRetryFlush() {
  flushBackoff = Math.min(flushBackoff + 1, 4)
  scheduleFlush()
}

async function phpSaveRows(rows) {
  if (!phpAuthReady()) return 'auth_pending'
  if (isMemberNeedsApproval()) {
    // Removidos primeiro também no modo aprovação
    const ordered = [...rows].sort((a, b) => {
      const rank = (k) => (k === 'apoiadores_removidos' || k === 'equipe_removidos' || k === 'materiais_removidos' || k === 'materiais_retiradas_removidos' || k === 'materiais_distribuicao_removidos' || k === 'rotas_logistica_removidos' || k === 'rotas_diarias_removidos' ? 0 : k === 'apoiadores_lista' ? 1 : k === 'equipe_membros' ? 2 : k === 'rotas_logistica' || k === 'rotas_diarias' ? 2 : 3)
      return rank(a[0]) - rank(b[0])
    })
    for (const [k, v] of ordered) {
      const r = await phpSet(k, v)
      if (isAuthPending(r)) return 'auth_pending'
      if (!r) return false
    }
    return true
  }
  const small = []
  const large = []
  const sorted = [...rows].sort((a, b) => {
    const rank = (k) => (k === 'apoiadores_removidos' || k === 'equipe_removidos' || k === 'materiais_removidos' || k === 'materiais_retiradas_removidos' || k === 'materiais_distribuicao_removidos' || k === 'rotas_logistica_removidos' || k === 'rotas_diarias_removidos' ? 0 : k === 'apoiadores_lista' ? 1 : k === 'equipe_membros' ? 2 : k === 'rotas_logistica' || k === 'rotas_diarias' ? 2 : 3)
    return rank(a[0]) - rank(b[0])
  })
  for (const row of sorted) {
    if (String(row[1]).length > LARGE_BYTES) large.push(row)
    else small.push(row)
  }

  for (let i = 0; i < small.length; i += BULK_CHUNK) {
    const chunk = small.slice(i, i + BULK_CHUNK)
    let ok = await phpBulkChunk(chunk)
    if (isAuthPending(ok)) return 'auth_pending'
    if (!ok) {
      for (const [k, v] of chunk) {
        const r = await phpSet(k, v)
        if (isAuthPending(r)) return 'auth_pending'
        if (!r) return false
      }
    }
  }

  for (const [k, v] of large) {
    const r = await phpSet(k, v)
    if (isAuthPending(r)) return 'auth_pending'
    if (!r) return false
  }
  return true
}

function beaconSaveAll() {
  if (!usePhpSync() || typeof fetch !== 'function') return
  if (!phpAccessToken || !phpTenantId) return
  if (isMemberNeedsApproval()) return
  // Só envia o que está na fila — nunca snapshot completo (evita truncar/ressuscitar)
  if (pending.size === 0) return

  const body = {}
  for (const [k, v] of pending.entries()) {
    if (isChurchSystemKey(k)) continue
    body[k] = parseJsonSafe(v)
  }
  if (!Object.keys(body).length) return
  try {
    fetch(`${PHP_API}?bulk=1`, {
      method: 'POST',
      headers: phpHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {})
  } catch { /* ignore */ }
}

async function supaPull(userId) {
  if (!supabase) return null
  const { data, error } = await supabase.from('app_state').select('key,value,updated_at').eq('user_id', userId)
  if (error) return null
  const out = {}
  const updated = {}
  ;(data || []).forEach(row => {
    if (row.value != null) {
      out[row.key] = row.value
      if (row.updated_at) updated[row.key] = row.updated_at
    }
  })
  return { data: out, updated }
}

async function supaPush(rows, userId) {
  if (!supabase || !rows.length) return true
  const supaRows = rows.map(([key, value]) => ({
    user_id: userId, key, value, updated_at: new Date().toISOString(),
  }))
  const { error } = await supabase.from('app_state').upsert(supaRows, { onConflict: 'user_id,key' })
  if (error) { lastSyncError = error.message; return false }
  return true
}

function notifyStorageChange(key) {
  // Avisa só outras abas — não remonta o app na mesma aba a cada salvamento
  try {
    broadcastChannel?.postMessage({ type: 'storage', key })
  } catch { /* ignore */ }
}

/**
 * Aplica no localStorage o valor já aprovado no servidor e força remount da UI.
 * Evita o LWW/merge do dono sobrescrever a aprovação com dados locais antigos.
 */
export function applyApprovedChange(key, value, action = 'set') {
  if (!key || !isAppKey(key)) return
  suppress = true
  try {
    if (action === 'delete') {
      if (isHeavyStorageKey(key)) removeHeavyRawSync(key)
      else if (originalRemoveItem) originalRemoveItem(key)
      else window.localStorage.removeItem(key)
      const map = getLocalAtMap()
      if (map[key]) {
        delete map[key]
        if (originalSetItem) originalSetItem(LOCAL_AT_KEY, JSON.stringify(map))
        else window.localStorage.setItem(LOCAL_AT_KEY, JSON.stringify(map))
      }
    } else {
      const str = value == null
        ? 'null'
        : (typeof value === 'string' ? value : JSON.stringify(value))
      nativeSet(key, str)
      touchLocalAt(key, Date.now())
    }
  } finally {
    suppress = false
  }
  try {
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, {
      detail: { forceReload: true, fromServer: true, approvedKey: key },
    }))
  } catch { /* ignore */ }
  notifyStorageChange(key)
}

export async function pullAll(userId, { pushFirst = false, preferServerKeys = [], forceFull = false } = {}) {
  if (materiaisSnapshotBlocked()) return 0
  if (shouldDeferSyncUi()) {
    pullAgainRequested = true
    scheduleLivePull(Math.max(msUntilSyncAllowed(), 3500))
    return 0
  }
  if (pulling) {
    pullAgainRequested = true
    return 0
  }
  pulling = true
  currentUserId = userId
  const preferSet = new Set((preferServerKeys || []).filter(Boolean))

  try {
  if (pushFirst && pending.size === 0 && pendingDeletes.size === 0) {
    const localRows = readLocalAppRows().filter(([k]) => !isChurchSystemKey(k))
    if (localRows.length) {
      const ok = usePhpSync()
        ? await phpSaveRows(localRows)
        : await supaPush(localRows, userId)
      if (ok) {
        const now = Date.now()
        localRows.forEach(([k]) => touchLocalAt(k, now))
      }
    }
  }

  if (pending.size > 0 || pendingDeletes.size > 0) {
    await flush()
  }

  const localRows = readLocalAppRows()
  const localMap = Object.fromEntries(localRows)

  let serverPack = usePhpSync() ? null : await supaPull(userId)
  if (serverPack == null) {
    serverPack = await phpGetSmart({ forceFull: forceFull || preferSet.size > 0 })
    if (serverPack == null) {
      console.warn('[sync] pull abortado — servidor indisponível')
      return 0
    }
    if (serverPack?.unchanged) return 0
  } else if (serverPack.data) {
    const norm = {}
    for (const [k, v] of Object.entries(serverPack.data)) {
      norm[k] = typeof v === 'string' ? v : JSON.stringify(v)
    }
    serverPack = { data: norm, updated: serverPack.updated || {} }
  }

  const serverMap = serverPack.data || {}
  const serverUpdated = serverPack.updated || {}
  const serverRemovedKeys = Array.isArray(serverPack.removedKeys) ? serverPack.removedKeys : []

  const allKeys = new Set([...Object.keys(localMap), ...Object.keys(serverMap), ...serverRemovedKeys])
  const merged = {}
  const serverWins = {}
  const removeKeys = []
  let serverChangedLocal = 0
  let rejectedSomething = false

  const memberMode = isMemberNeedsApproval()
  const stillPending = memberMode ? await phpFetchMyPendingKeys() : null

  for (const key of allKeys) {
    if (!isAppKey(key)) continue

    if (serverRemovedKeys.includes(key) && serverMap[key] == null && !memberMode) {
      if (localMap[key] != null && !pending.has(key)) {
        removeKeys.push(key)
        serverChangedLocal++
      }
      continue
    }

    // Busca Google em andamento: não deixar o pull da nuvem apagar o que acabou de imputar
    if (typeof window !== 'undefined' && window.__campanhaBuscaIgrejasAtiva && isChurchSystemKey(key)) {
      if (localMap[key] != null) merged[key] = localMap[key]
      continue
    }
    if (typeof window !== 'undefined' && window.__campanhaGeocodificacaoAtiva && isChurchSystemKey(key)) {
      if (localMap[key] != null) merged[key] = localMap[key]
      continue
    }

    // Cadastro de igrejas: pull geral não restaura o que foi apagado — só church_catalog
    if (isChurchSystemKey(key)) {
      if (localMap[key] != null) merged[key] = localMap[key]
      continue
    }

    // Após aprovar: servidor é a fonte da verdade — não misturar com local antigo
    if (preferSet.has(key) && !memberMode) {
      if (serverMap[key] != null) {
        merged[key] = serverMap[key]
        serverWins[key] = serverUpdated[key] || new Date().toISOString()
        serverChangedLocal++
      } else if (localMap[key] != null) {
        removeKeys.push(key)
        serverChangedLocal++
      }
      continue
    }

    if (memberMode && stillPending != null) {
      // Edição local ainda não enviada
      if (memberDirty.has(key)) {
        merged[key] = memberDirty.get(key)
        continue
      }
      if (memberDeleteDirty.has(key)) {
        // Exclusão local pendente de envio — não restaura do servidor ainda
        removeKeys.push(key)
        continue
      }
      // Já enviado, ainda aguardando o dono — mantém o que o membro vê
      if (stillPending.has(key)) {
        memberAwaiting.add(key)
        if (localMap[key] != null) merged[key] = localMap[key]
        // se deletou localmente e está na fila, não recoloca do servidor
        continue
      }

      // Recusado ou aprovado: verdade oficial do servidor
      if (memberAwaiting.has(key)) {
        memberAwaiting.delete(key)
        if (normJson(localMap[key]) !== normJson(serverMap[key])) rejectedSomething = true
      }
      if (serverMap[key] != null) {
        merged[key] = serverMap[key]
        if (normJson(localMap[key]) !== normJson(serverMap[key])) {
          serverWins[key] = serverUpdated[key] || new Date().toISOString()
          serverChangedLocal++
        }
      } else if (localMap[key] != null) {
        // Chave só existia na alteração do membro → some da tela
        removeKeys.push(key)
        serverChangedLocal++
        rejectedSomething = true
      }
      continue
    }

    // Funcionário: materiais vêm da nuvem (dono atualizou; merge local antigo não pode ganhar)
    if (memberShouldTrustServerMateriais(key, localMap, serverMap)) {
      if (serverMap[key] != null) {
        merged[key] = serverMap[key]
        if (normJson(localMap[key]) !== normJson(serverMap[key])) {
          serverWins[key] = serverUpdated[key] || new Date().toISOString()
          serverChangedLocal++
        }
      } else if (localMap[key] != null) {
        removeKeys.push(key)
        serverChangedLocal++
      }
      continue
    }

    const picked = pickBetterValue(key, localMap[key], serverMap[key], serverUpdated[key], { localMap, serverMap })
    if (picked != null) {
      merged[key] = picked
      const fromServer = normJson(picked) === normJson(serverMap[key])
        && normJson(localMap[key]) !== normJson(serverMap[key])
      if (fromServer) {
        serverWins[key] = serverUpdated[key]
        if (normJson(localMap[key]) !== normJson(picked)) serverChangedLocal++
      }
    }
  }

  applyMergedToLocal(merged, serverWins, removeKeys)
  rememberServerUpdated(serverUpdated)
  rememberServerUpdated(serverWins)

  // Membros NÃO fazem upload automático no pull — senão cada login vira dezenas de
  // "aprovações" fantasmas. Só edição explícita (queueChange → flush) vai para a fila.
  // Também não reenviar chaves acabadas de aprovar (evita apagar a aprovação com local antigo).
  const toUpload = memberMode
    ? []
    : Object.entries(merged).filter(([k, v]) => {
      if (preferSet.has(k)) return false
      if (pending.has(k)) return false
      // Histórico de materiais: nunca reenviar merge automático (evita ressuscitar após limpar)
      if (isMateriaisHistoricoPullKey(k)) return false
      // Não reenviar merge local desatualizado quando a nuvem já é mais nova
      if (isMateriaisStoreKey(k)) {
        const localAt = getLocalAtMap()[k] || 0
        const serverAt = parseServerAt(serverUpdated[k])
        const mergedEmpty = storeValueEmpty(v)
        const histLimpo = materiaisHistoricoLimpoEmEfetivo(localMap, serverMap)
        const totalLimpo = materiaisLimpoEmEfetivo(localMap, serverMap)
        const intentionalClear = mergedEmpty && (
          totalLimpo > 0 || (isMateriaisHistoricoStoreKey(k) && histLimpo > 0)
        )
        if (!intentionalClear && serverAt > localAt + 1500 && normJson(serverMap[k]) !== normJson(v)) return false
      }
      return normJson(serverMap[k]) !== normJson(v)
    })

  if (toUpload.length) {
    const churchDiff = toUpload.filter(([k]) => isChurchSystemKey(k))
    const regularDiff = toUpload.filter(([k]) => !isChurchSystemKey(k))
    if (regularDiff.length) {
      const saveResult = usePhpSync()
        ? await phpSaveRows(regularDiff)
        : await supaPush(regularDiff, userId)
      if (isAuthPending(saveResult)) {
        regularDiff.forEach(([k, v]) => pending.set(k, v))
      } else if (!saveResult) {
        regularDiff.forEach(([k, v]) => pending.set(k, v))
      } else {
        const now = Date.now()
        regularDiff.forEach(([k]) => {
          touchLocalAt(k, now)
          setKeyStatus(k, 'synced')
        })
        lastSyncError = null
      }
    }
    if (churchDiff.length) scheduleChurchCatalogPush()
  }

  if (memberMode) {
    pending.clear()
    pendingDeletes.clear()
    // Preserva memberDirty / memberDeleteDirty (edições ainda não enviadas)
    for (const [k, v] of Object.entries(merged)) {
      if (!memberDirty.has(k) && !memberDeleteDirty.has(k)) {
        memberBaseline[k] = normJson(v)
      }
    }
    for (const k of removeKeys) {
      if (!memberDirty.has(k) && !memberDeleteDirty.has(k)) {
        delete memberBaseline[k]
      }
    }
    notifyPending()
    if (rejectedSomething) {
      window.dispatchEvent(new CustomEvent(APPROVAL_EVENT, {
        detail: { message: 'Uma alteração sua foi recusada e sumiu da sua tela.', rejected: true },
      }))
    }
  }

  if (!memberMode && usePhpSync()) {
    const limpoLocal = readCadastroLimpoEmLocal()
    const forceChurch = limpoLocal > 0
    ensureChurchCatalogSynced({ force: forceChurch })
      .then(async (church) => {
        if (church?.changed) dispatchSyncReload()
        else if (forceChurch) {
          const limpoServer = await readCadastroLimpoEmServer()
          if (limpoLocal !== limpoServer) {
            const retry = await ensureChurchCatalogSynced({ force: true }).catch(() => null)
            if (retry?.changed) dispatchSyncReload()
          }
        }
      })
      .catch(() => {})
  }

  if (serverChangedLocal > 0) {
    dispatchSyncReload()
  }

  return Object.keys(serverMap).length
  } finally {
    pulling = false
    lastLivePullAt = Date.now()
    teamSyncActive = false
    emitSyncDetail()
    if (pullAgainRequested) {
      pullAgainRequested = false
      const uid = currentUserId || userId
      setTimeout(() => { pullAll(uid).catch(() => {}) }, 400)
    }
  }
}

export async function pushAllLocal(userId) {
  currentUserId = userId
  // Membro nunca faz push em massa (evita flood de aprovações)
  if (isMemberNeedsApproval()) return 0
  // Catálogo de igrejas usa church_catalog com _replace — nunca phpSaveRows genérico
  const rows = readLocalAppRows().filter(([k]) => !isChurchSystemKey(k))
  if (!rows.length) return 0
  const ok = usePhpSync() ? await phpSaveRows(rows) : await supaPush(rows, userId)
  if (ok) {
    const now = Date.now()
    rows.forEach(([k]) => touchLocalAt(k, now))
  }
  return ok ? rows.length : 0
}

/** Grava chave(s) no MySQL com _replace — sobrescreve sem merge (ex.: zerar visitas). */
export async function phpReplaceStoreKeys(rows, replaceKeys = []) {
  if (!phpAuthReady()) return false
  const list = Array.isArray(rows) ? rows : Object.entries(rows || {})
  const keys = (replaceKeys || []).filter(Boolean)
  if (!list.length && !keys.length) return true
  const ok = await phpBulkChunk(list, keys)
  if (ok === true) {
    const now = Date.now()
    for (const [k] of list) touchLocalAt(k, now)
    for (const k of keys) touchLocalAt(k, now)
    lastSyncAt = now
    lastSyncError = null
    window.dispatchEvent(new Event(SYNC_OK_EVENT))
  }
  return ok === true
}

/** Remove chave do MySQL (ex.: flags materiais_limpo_em após importação). */
export async function deleteCloudStoreKey(key) {
  if (!isAppKey(key)) return false
  return phpDelete(key)
}

/** Remove chaves da fila de flush — evita reenvio com merge após snapshot _replace. */
export function clearSyncPendingForKeys(keys = []) {
  for (const k of keys) {
    if (!k) continue
    pending.delete(k)
    pendingDeletes.delete(k)
  }
  notifyPending()
}

function notifyPending() {
  window.dispatchEvent(new CustomEvent(SYNC_PENDING_EVENT, {
    detail: { pending: pending.size + pendingDeletes.size },
  }))
  emitSyncDetail()
}

function queueChange(key, value) {
  if (suppress || !isAppKey(key)) return
  touchLocalAt(key)
  notifyStorageChange(key)

  if (isMemberNeedsApproval()) {
    // Hidratação pós-login: ignora
    if (inMemberQuietPeriod()) return
    const str = String(value)
    const n = normJson(str)
    // Igual ao baseline = ruído de sync, não é edição
    if (n === (memberBaseline[key] ?? '')) {
      memberDirty.delete(key)
      return
    }
    memberDirty.set(key, str)
    memberDeleteDirty.delete(key)
    // NÃO envia sozinho — só no Salvar / flushAfterSave
    return
  }

  if (isChurchSystemKey(key)) {
    queueChurchChange(key)
    return
  }

  pendingDeletes.delete(key)
  pending.set(key, String(value))
  notifyPending()
  scheduleFlush()
}

function queueChurchChange(key) {
  pendingDeletes.delete(key)
  pending.delete(key)
  notifyPending()
  scheduleChurchCatalogPush()
}

/** Instala o hook de sync o mais cedo possível (antes do React montar). */
export function ensureSyncInstalled(userId = 'local') {
  installSyncHook(userId)
}

/**
 * Grava no localStorage e enfileira envio ao servidor (api.php / MySQL).
 * Usar em vez de localStorage.setItem direto quando possível.
 */
export function persistToStorage(key, value, { force = false } = {}) {
  ensureSyncInstalled(currentUserId || 'local')
  let str = typeof value === 'string' ? value : JSON.stringify(value)
  if (key === 'igrejas_custom') str = sanitizarIgrejasCustomJson(str)
  const prev = typeof window !== 'undefined' ? readStorageRawSync(key) : null
  suppress = true
  let ok = false
  try {
    ok = nativeSetSafe(key, str)
  } finally {
    suppress = false
  }
  const same = !force && normJson(prev) === normJson(str)
  if (!ok) {
    if (isAppKey(key) && !same) queueChange(key, str)
    if (isChurchSystemKey(key)) return str
    throw new Error('Armazenamento do navegador cheio. Liberando cache e tente de novo.')
  }
  // Mesmo conteúdo: não enfileira (evita sobrescrever leads do formulário só por remontar a tela)
  if (same) return str
  queueChange(key, str)
  return str
}

/** Grava só neste aparelho — não envia à nuvem (flags locais / limpeza de cache). */
export function persistLocalOnly(key, value) {
  ensureSyncInstalled(currentUserId || 'local')
  const str = typeof value === 'string' ? value : JSON.stringify(value)
  suppress = true
  try {
    nativeSetSafe(key, str)
  } finally {
    suppress = false
  }
}

/** Remove do navegador e enfileira remoção na nuvem (ignora withSyncSuppress pai). */
export function removeAppStorageKey(key) {
  ensureSyncInstalled(currentUserId || 'local')
  if (isHeavyStorageKey(key)) removeHeavyRawSync(key)
  const prev = suppress
  suppress = false
  try {
    if (originalRemoveItem) originalRemoveItem(key)
    else if (typeof window !== 'undefined') window.localStorage.removeItem(key)
  } finally {
    suppress = prev
  }
}

function queueDelete(key) {
  if (suppress || !isAppKey(key)) return
  touchLocalAt(key)
  notifyStorageChange(key)

  if (isMemberNeedsApproval()) {
    if (inMemberQuietPeriod()) return
    memberDirty.delete(key)
    if (memberBaseline[key] != null && memberBaseline[key] !== '') memberDeleteDirty.add(key)
    else memberDeleteDirty.delete(key)
    return
  }

  pending.delete(key)
  pendingDeletes.add(key)
  notifyPending()
  scheduleFlush()
}

export function installSyncHook(userId) {
  currentUserId = userId
  seedLocalAtFromExisting()

  if (typeof BroadcastChannel !== 'undefined' && !broadcastChannel) {
    broadcastChannel = new BroadcastChannel('campanha-sync-v1')
    broadcastChannel.onmessage = (ev) => {
      if (ev.data?.type === 'storage' && ev.data.key) {
        window.dispatchEvent(new CustomEvent(SYNC_STORAGE_EVENT, {
          detail: { key: ev.data.key, external: true },
        }))
      }
    }
  }

  if (!originalSetItem) {
    originalSetItem = window.localStorage.setItem.bind(window.localStorage)
    window.localStorage.setItem = (key, value) => {
      const v = key === 'igrejas_custom' ? sanitizarIgrejasCustomJson(String(value)) : value
      if (!nativeSetSafe(key, String(v))) {
        throw new Error('Armazenamento do navegador cheio.')
      }
      if (!suppress) queueChange(key, v)
    }
  }
  if (!originalRemoveItem) {
    originalRemoveItem = window.localStorage.removeItem.bind(window.localStorage)
    registerNativeLocalStorageRemove(originalRemoveItem)
    window.localStorage.removeItem = (key) => {
      if (isHeavyStorageKey(key)) removeHeavyRawSync(key)
      else originalRemoveItem(key)
      if (!suppress) queueDelete(key)
    }
  }
  if (!listenersOn) {
    window.addEventListener('beforeunload', () => {
      beaconSaveAll()
      flushNow()
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        beaconSaveAll()
        flush()
      } else {
        scheduleLivePull(2500)
      }
    })
    window.addEventListener('focus', () => scheduleLivePull(2000))
    window.addEventListener('online', () => scheduleLivePull(200))
    window.addEventListener('storage', (e) => {
      if (!e.key || !isAppKey(e.key)) return
      window.dispatchEvent(new CustomEvent(SYNC_STORAGE_EVENT, { detail: { key: e.key, external: true } }))
    })
    listenersOn = true
  }
  if (!periodicTimer) {
    periodicTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      if (shouldDeferSyncUi()) return
      if (pending.size > 0 || pendingDeletes.size > 0) flush().catch(() => {})
    }, PERIODIC_MS)
  }
  if (!livePullTimer) {
    livePullTimer = setInterval(() => {
      scheduleLivePull(0)
    }, LIVE_PULL_MS)
  }
  if (phpAuthReady()) startTenantSyncWatchSafe()
}

function canLivePull() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false
  if (usePhpSync()) {
    if (!phpAccessToken || !phpTenantId) return false
  }
  if (Date.now() - lastLivePullAt < LIVE_PULL_MIN_GAP_MS) return false
  if (shouldDeferSyncUi()) return false
  if (typeof window !== 'undefined' && window.__campanhaBuscaIgrejasAtiva) return false
  if (typeof window !== 'undefined' && window.__campanhaGeocodificacaoAtiva) return false
  return true
}

function scheduleLivePull(delayMs = 0) {
  if (shouldDeferSyncUi()) {
    delayMs = Math.max(delayMs, msUntilSyncAllowed() + 800)
  }
  if (livePullDebounceTimer) clearTimeout(livePullDebounceTimer)
  const wait = Math.max(delayMs, 2000)
  livePullDebounceTimer = setTimeout(() => {
    livePullDebounceTimer = null
    if (!canLivePull()) return
    const uid = currentUserId || phpTenantId || 'local'
    pullAll(uid)
      .then(() => ensureChurchCatalogSynced().catch(() => {}))
      .catch(() => {})
  }, wait)
}

/** Pull parcial só de materiais — não dispara merge global nem re-upload de histórico. */
async function pullMateriaisPartial(userId) {
  if (materiaisSnapshotBlocked()) return 0
  if (!usePhpSync() || !phpAuthReady()) {
    return pullAll(userId, { forceFull: false })
  }

  const partial = await phpGetPartialKeys(MATERIAIS_PARTIAL_PULL_KEYS)
  if (!partial?.data) return 0

  const localRows = readLocalAppRows()
  const localMap = Object.fromEntries(localRows)
  const serverMap = partial.data || {}
  const serverUpdated = partial.updated || {}
  const merged = {}
  const serverWins = {}
  let changed = 0

  for (const key of MATERIAIS_PARTIAL_PULL_KEYS) {
    const picked = pickBetterValue(
      key,
      localMap[key],
      serverMap[key],
      serverUpdated[key],
      { localMap, serverMap },
    )
    if (picked == null) continue
    merged[key] = picked
    if (normJson(localMap[key]) !== normJson(picked)) {
      changed++
      if (normJson(picked) === normJson(serverMap[key])
        && normJson(localMap[key]) !== normJson(serverMap[key])) {
        serverWins[key] = serverUpdated[key]
      }
    }
  }

  if (!changed) return 0
  applyMergedToLocal(merged, serverWins, [])
  try {
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, {
      detail: { fromServer: true, materiaisPartial: true },
    }))
  } catch { /* ignore */ }
  return changed
}

/** Força pull de materiais (aba Materiais) — parcial, sem merge global agressivo. */
export async function syncMateriaisFromServer(userId) {
  const uid = userId || currentUserId || phpTenantId || 'local'
  if (!uid) return 0
  return pullMateriaisPartial(uid)
}

/** Pull parcial só de visitas — não dispara merge global nem re-upload agressivo. */
async function pullIgrejasVisitasPartial(userId) {
  if (!usePhpSync() || !phpAuthReady()) {
    return pullAll(userId, { forceFull: false })
  }

  const partial = await phpGetPartialKeys(IGREJAS_VISITAS_PARTIAL_PULL_KEYS)
  if (!partial?.data) return 0

  const localRows = readLocalAppRows()
  const localMap = Object.fromEntries(localRows)
  const serverMap = partial.data || {}
  const serverUpdated = partial.updated || {}
  const merged = {}
  const serverWins = {}
  let changed = 0

  for (const key of IGREJAS_VISITAS_PARTIAL_PULL_KEYS) {
    const picked = pickBetterValue(
      key,
      localMap[key],
      serverMap[key],
      serverUpdated[key],
      { localMap, serverMap },
    )
    if (picked == null) continue
    merged[key] = picked
    if (normJson(localMap[key]) !== normJson(picked)) {
      changed++
      if (normJson(picked) === normJson(serverMap[key])
        && normJson(localMap[key]) !== normJson(serverMap[key])) {
        serverWins[key] = serverUpdated[key]
      }
    }
  }

  if (!changed) return 0
  applyMergedToLocal(merged, serverWins, [])
  try {
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, {
      detail: { fromServer: true, igrejasVisitasPartial: true },
    }))
  } catch { /* ignore */ }
  return changed
}

/** Força pull de visitas (Mapa de Visitas / Montar Rotas) — parcial. */
export async function syncIgrejasVisitasFromServer(userId) {
  const uid = userId || currentUserId || phpTenantId || 'local'
  if (!uid) return 0
  return pullIgrejasVisitasPartial(uid)
}

export async function syncNow(userId) {
  currentUserId = userId || currentUserId || phpTenantId || 'local'
  emitSyncDetail()
  const work = (async () => {
    await flush()
    await pushAllLocal(currentUserId)
    await pullAll(currentUserId, { forceFull: true })
    lastLivePullAt = Date.now()
    const status = getSyncStatus()
    emitSyncDetail()
    try {
      window.dispatchEvent(new CustomEvent(SYNC_EVENT, {
        detail: { forceReload: true, fromServer: true, syncNow: true },
      }))
    } catch { /* ignore */ }
    return status
  })()
  return Promise.race([
    work,
    sleep(90000).then(() => {
      if (flushing && Date.now() - flushStartedAt > FLUSH_STUCK_MS) flushing = false
      throw new Error('Sincronização demorou demais — tente de novo em instantes')
    }),
  ])
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer)
  const delay = FLUSH_MS + flushBackoff * 400
  flushTimer = setTimeout(() => { flush().catch(() => scheduleFlush()) }, delay)
}

/** Envia à fila de aprovação só o que o membro alterou de verdade ( Salvar ). */
export async function flushMemberApprovals() {
  if (!isMemberNeedsApproval()) {
    await flush()
    return
  }
  const dirty = [...memberDirty.entries()]
  const dels = [...memberDeleteDirty]
  if (!dirty.length && !dels.length) return

  pending.clear()
  pendingDeletes.clear()
  for (const [k, v] of dirty) pending.set(k, v)
  for (const k of dels) pendingDeletes.add(k)

  memberFlushAllowed = true
  try {
    await flush()
    if (pending.size === 0 && pendingDeletes.size === 0) {
      for (const [k, v] of dirty) {
        memberBaseline[k] = normJson(v)
        memberAwaiting.add(k)
      }
      for (const k of dels) {
        delete memberBaseline[k]
        memberAwaiting.add(k)
      }
      memberDirty.clear()
      memberDeleteDirty.clear()
    }
  } finally {
    memberFlushAllowed = false
  }
}

export async function flush() {
  // Membro: flush automático (timer/aba) NÃO manda aprovação
  if (isMemberNeedsApproval() && !memberFlushAllowed) {
    pending.clear()
    pendingDeletes.clear()
    notifyPending()
    return
  }
  if (flushing && flushStartedAt && Date.now() - flushStartedAt > FLUSH_STUCK_MS) {
    console.warn('[sync] Recuperando flush travado')
    flushing = false
  }
  const t0 = Date.now()
  while (flushing && Date.now() - t0 < 120000) await sleep(40)
  if (pending.size === 0 && pendingDeletes.size === 0) return
  flushing = true
  flushStartedAt = Date.now()
  emitSyncDetail()
  try {
    const hadChurch = [...pending.keys()].some(isChurchSystemKey)
    const rows = [...pending.entries()].filter(([k]) => !isChurchSystemKey(k))
    const deletes = [...pendingDeletes].filter(k => !isChurchSystemKey(k))
    const touchedCritical = [
      ...rows.map(([k]) => k),
      ...deletes,
    ].filter(k => CRITICAL_SYNC_KEYS.includes(k))
    pending.clear()
    pendingDeletes.clear()
    if (hadChurch) scheduleChurchCatalogPush()

    let ok = true
    if (rows.length) {
      const saveResult = usePhpSync()
        ? await phpSaveRows(rows)
        : (currentUserId ? await supaPush(rows, currentUserId) : await phpSaveRows(rows))
      if (isAuthPending(saveResult)) {
        rows.forEach(([k, v]) => pending.set(k, v))
        deletes.forEach(k => pendingDeletes.add(k))
        for (const k of touchedCritical) lastFailedKeys.delete(k)
        scheduleAuthRetryFlush()
        notifyPending()
        emitSyncDetail()
        return
      }
      ok = Boolean(saveResult)
    }

    if (ok && deletes.length && usePhpSync()) {
      for (const key of deletes) {
        if (!await phpDelete(key)) {
          ok = false
          setKeyStatus(key, 'error', lastSyncError)
          break
        }
        setKeyStatus(key, 'synced')
      }
    }

    if (!ok) {
      rows.forEach(([k, v]) => pending.set(k, v))
      deletes.forEach(k => pendingDeletes.add(k))
      for (const k of touchedCritical) {
        if (pending.has(k) || pendingDeletes.has(k)) {
          setKeyStatus(k, 'error', lastSyncError || 'Falha na sincronização')
        }
      }
      flushBackoff = Math.min(flushBackoff + 1, 12)
      notifyPending()
      scheduleFlush()
      window.dispatchEvent(new CustomEvent(SYNC_ERR_EVENT, {
        detail: { message: lastSyncError, keys: [...lastFailedKeys] },
      }))
      emitSyncDetail()
      return
    }

    flushBackoff = 0
    lastSyncError = null
    lastSyncAt = Date.now()
    const now = Date.now()
    rows.forEach(([k]) => {
      touchLocalAt(k, now)
      setKeyStatus(k, 'synced')
    })
    lastFailedKeys.clear()
    window.dispatchEvent(new Event(SYNC_OK_EVENT))
    emitSyncDetail()

    if (pending.size > 0 || pendingDeletes.size > 0) {
      notifyPending()
      scheduleFlush()
    }
  } finally {
    flushing = false
    flushStartedAt = 0
    emitSyncDetail()
  }
}

function flushNow() { try { flush() } catch {} }

export function teardownSync() {
  if (originalSetItem) {
    window.localStorage.setItem = originalSetItem
    originalSetItem = null
  }
  if (originalRemoveItem) {
    window.localStorage.removeItem = originalRemoveItem
    originalRemoveItem = null
  }
  if (periodicTimer) { clearInterval(periodicTimer); periodicTimer = null }
  if (livePullTimer) { clearInterval(livePullTimer); livePullTimer = null }
  if (livePullDebounceTimer) { clearTimeout(livePullDebounceTimer); livePullDebounceTimer = null }
  stopTenantSyncWatchSafe()
  if (broadcastChannel) { broadcastChannel.close(); broadcastChannel = null }
  currentUserId = null
  phpAccessToken = null
  phpTenantId = null
  phpTenantRole = null
  memberQuietUntil = 0
  memberBaseline = Object.create(null)
  memberDirty.clear()
  memberDeleteDirty.clear()
  memberAwaiting.clear()
  memberFlushAllowed = false
  if (baselineTimer) { clearTimeout(baselineTimer); baselineTimer = null }
  pending.clear()
  pendingDeletes.clear()
  lastFailedKeys.clear()
  for (const k of Object.keys(keySyncState)) delete keySyncState[k]
  flushBackoff = 0
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
}

/** Executa fn sem enfileirar alterações na fila de sync (limpeza local, sanitize, etc.). */
export function withSyncSuppress(fn) {
  const prev = suppress
  suppress = true
  try {
    return fn()
  } finally {
    suppress = prev
  }
}

/** Limpa chaves de app sem enfileirar delete na nuvem (troca de campanha/logout). */
export function wipeLocalAppKeys() {
  const keys = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && (isAppKey(k) || k === LOCAL_AT_KEY)) keys.push(k)
  }
  const prev = suppress
  suppress = true
  try {
    for (const k of keys) {
      if (isHeavyStorageKey(k)) removeHeavyRawSync(k)
      else if (originalRemoveItem) originalRemoveItem(k)
      else localStorage.removeItem(k)
    }
    wipeHeavyStore()
  } finally {
    suppress = prev
  }
  pending.clear()
  pendingDeletes.clear()
}

export function getSyncStatus() {
  const detailed = getDetailedSyncStatus()
  const hasKeyError = detailed.keys.some(k => k.status === 'error')
  const churchErr = getChurchSyncError()
  if (!hasKeyError && !churchErr && detailed.pending === 0 && !detailed.flushing) {
    lastSyncError = null
  }
  const effectiveError = hasKeyError
    ? (lastSyncError || detailed.keys.find(k => k.status === 'error')?.error || 'Falha na sincronização')
    : (churchErr || null)
  return {
    pending: detailed.pending,
    userId: currentUserId,
    lastSyncAt,
    lastSyncError: effectiveError,
    churchSyncError: churchErr,
    autoSaveActive: Boolean(originalSetItem),
    flushing: detailed.flushing,
    keys: detailed.keys,
    failedKeys: [...lastFailedKeys],
  }
}

const CHURCH_PUSH_KEYS = [
  'igrejas_custom', 'igrejas_enrich', 'geo_coords_igrejas', 'pastores_igrejas', 'igrejas_overrides', 'igrejas_ocultas',
]

export const CHURCH_CATALOG_KEYS = [...CHURCH_PUSH_KEYS]

function churchIdSet(arr) {
  const s = new Set()
  if (!Array.isArray(arr)) return s
  for (const ig of arr) {
    if (ig?.id != null && ig.id !== '') s.add(String(ig.id))
  }
  return s
}

function readChurchCatalogBodyFromLocal() {
  const body = {}
  for (const key of CHURCH_PUSH_KEYS) {
    const raw = readStorageRawSync(key)
    body[key] = parseJsonSafe(raw ?? (key === 'igrejas_custom' || key === 'igrejas_ocultas' ? '[]' : '{}'))
  }
  return body
}

export function readChurchCatalogPayloadFromLocal({ replace = true } = {}) {
  const body = readChurchCatalogBodyFromLocal()
  const payload = {
    custom: body.igrejas_custom,
    enrich: body.igrejas_enrich,
    coords: body.geo_coords_igrejas,
    pastores: body.pastores_igrejas,
    overrides: body.igrejas_overrides,
    ocultas: body.igrejas_ocultas,
  }
  if (replace) payload.replace = [...CHURCH_PUSH_KEYS]
  return payload
}

function applyServerChurchCatalogWithoutMerge(serverData) {
  const merged = {}
  for (const key of CHURCH_PUSH_KEYS) {
    const v = serverData?.[key]
    if (v == null) {
      merged[key] = key === 'igrejas_custom' || key === 'igrejas_ocultas' ? '[]' : '{}'
    } else {
      merged[key] = typeof v === 'string' ? v : JSON.stringify(v)
    }
  }
  return applyChurchMergeToLocal(merged)
}

export function cancelChurchCatalogPush() {
  if (churchPushTimer) {
    clearTimeout(churchPushTimer)
    churchPushTimer = null
  }
}

const CHURCH_OBJECT_KEYS = new Set(['igrejas_enrich', 'geo_coords_igrejas', 'pastores_igrejas', 'igrejas_overrides'])

const CHURCH_SYNC_COOLDOWN_MS = 45_000
const CHURCH_PUSH_DEBOUNCE_MS = 2500
/** Erro isolado das igrejas — não contamina o status do sync principal. */
let churchSyncError = null
export function getChurchSyncError() { return churchSyncError }
let churchSyncLastAt = 0
let churchSyncInFlight = null
let churchPushTimer = null

function scheduleChurchCatalogPush() {
  if (!usePhpSync() || isMemberNeedsApproval()) return
  if (shouldDeferSyncUi()) {
    const wait = Math.max(msUntilSyncAllowed(), 1200)
    if (churchPushTimer) clearTimeout(churchPushTimer)
    churchPushTimer = setTimeout(() => {
      churchPushTimer = null
      scheduleChurchCatalogPush()
    }, wait)
    return
  }
  if (churchPushTimer) clearTimeout(churchPushTimer)
  churchPushTimer = setTimeout(() => {
    churchPushTimer = null
    ensureChurchCatalogSynced({ force: true })
      .then((r) => {
        if (r?.ok) {
          if (!r.skipped) {
            // igrejas ok — não tocar lastSyncError principal
            lastSyncAt = Date.now()
            for (const k of CHURCH_PUSH_KEYS) pending.delete(k)
            window.dispatchEvent(new Event(SYNC_OK_EVENT))
          }
        }
        // falha de igrejas é silenciosa no banner principal
        notifyPending()
      })
      .catch(() => {})
  }, CHURCH_PUSH_DEBOUNCE_MS)
}

async function phpFetchChurchMeta() {
  if (!assertPhpAuth()) return null
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 15000)
    const r = await fetch(`${PHP_API}?action=church_meta`, {
      headers: phpHeaders(),
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (!r.ok) return null
    return await r.json().catch(() => null)
  } catch {
    return null
  }
}

async function phpFetchChurchCatalog() {
  if (!assertPhpAuth()) return null
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 120000)
    const r = await fetch(`${PHP_API}?action=church_catalog`, {
      headers: phpHeaders(),
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (!r.ok) return null
    return await r.json().catch(() => null)
  } catch {
    return null
  }
}

async function phpPushChurchCatalog(body) {
  if (!assertPhpAuth()) return null

  const CHUNK_LIMIT = 1_400_000 // 1.4 MB por chunk

  // Serializa para verificar tamanho total
  const fullStr = JSON.stringify(body)
  const totalSize = fullStr.length

  // Se payload pequeno → envio único (caminho rápido)
  if (totalSize <= CHUNK_LIMIT) {
    return _phpPushChurchSingle(body, fullStr)
  }

  // Payload grande → envia cada chave separadamente
  let lastResult = null
  const combinedCounts = {}
  for (const [key, val] of Object.entries(body)) {
    const chunkBody = { [key]: val }
    const res = await _phpPushChurchSingle(chunkBody)
    if (!res) return null
    lastResult = res
    Object.assign(combinedCounts, res.counts || {})
  }
  if (lastResult) lastResult = { ...lastResult, counts: combinedCounts }
  return lastResult
}

async function _phpPushChurchSingle(body, preStr) {
  try {
    const str = preStr ?? JSON.stringify(body)
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 180000)
    const r = await fetch(`${PHP_API}?action=church_catalog`, {
      method: 'POST',
      headers: phpHeaders({ 'Content-Type': 'application/json' }),
      body: str,
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (!r.ok) {
      const errBody = await r.json().catch(() => ({}))
      churchSyncError = errBody?.error || `HTTP ${r.status} ao gravar igrejas`
      return null
    }
    churchSyncError = null
    return await r.json().catch(() => null)
  } catch (e) {
    churchSyncError = e?.name === 'AbortError' ? 'Timeout ao gravar igrejas' : (e.message || 'Erro ao gravar igrejas')
    return null
  }
}

function applyChurchMergeToLocal(merged) {
  if (typeof window === 'undefined') return false
  suppress = true
  let changed = false
  try {
    for (const [key, str] of Object.entries(merged)) {
      if (!str) continue
      const cur = readStorageRawSync(key)
      if (normJson(cur) === normJson(str)) continue
      if (!nativeSetSafe(key, str)) continue
      touchLocalAt(key, Date.now())
      changed = true
    }
  } finally {
    suppress = false
  }
  return changed
}

function readCadastroLimpoEmLocal() {
  try {
    return Number(parseJsonSafe(readStorageRawSync(IGREJAS_CADASTRO_LIMPO_EM_KEY))) || 0
  } catch {
    return 0
  }
}

/** Cadastro zerado manualmente neste aparelho — nuvem antiga não deve ressuscitar. */
function localCadastroIgrejasEscolheuVazio(limpoServer = 0) {
  const limpoLocal = readCadastroLimpoEmLocal()
  return IGREJAS_MAPA_SOMENTE_MANUAL
    && limpoLocal > 0
    && limpoLocal >= (Number(limpoServer) || 0)
}

const CHURCH_CATALOG_VAZIO_PAYLOAD = {
  custom: [],
  enrich: {},
  coords: {},
  pastores: {},
  overrides: {},
  ocultas: [],
  replace: [...CHURCH_PUSH_KEYS],
}

async function readCadastroLimpoEmServer() {
  const v = await phpGetKey(IGREJAS_CADASTRO_LIMPO_EM_KEY)
  if (v == null) return 0
  try {
    return Number(parseJsonSafe(typeof v === 'string' ? v : JSON.stringify(v))) || 0
  } catch {
    return 0
  }
}

function emptyChurchCatalogMerged() {
  const merged = { igrejas_ocultas: '[]' }
  for (const key of CHURCH_PUSH_KEYS) {
    if (key === 'igrejas_ocultas') continue
    merged[key] = key === 'igrejas_custom' ? '[]' : '{}'
  }
  return merged
}

export function applyCadastroLimpoEmLocal(ts) {
  if (typeof window === 'undefined') return
  suppress = true
  try {
    const val = Number(ts) > 0 ? String(ts) : '0'
    nativeSetSafe(IGREJAS_CADASTRO_LIMPO_EM_KEY, val)
    touchLocalAt(IGREJAS_CADASTRO_LIMPO_EM_KEY, Number(ts) > 0 ? ts : Date.now())
  } finally {
    suppress = false
  }
}

/** Após importação/cadastro novo — cancela flag de “zerar” local e na nuvem. */
export function revogarCadastroLimpoEmLocal() {
  applyCadastroLimpoEmLocal(0)
}

export async function marcarCadastroIgrejasAtivoNoServidor() {
  revogarCadastroLimpoEmLocal()
  if (!usePhpSync() || !phpAuthReady()) return { ok: true, skipped: true }
  const ok = await phpReplaceStoreKeys(
    [[IGREJAS_CADASTRO_LIMPO_EM_KEY, '0']],
    [IGREJAS_CADASTRO_LIMPO_EM_KEY],
  )
  return { ok: Boolean(ok) }
}

/**
 * Garante que o cadastro de igrejas no MySQL tenha a união de todos os aparelhos.
 * Uma requisição para baixar e uma para enviar (rápido). Não bloqueia o login.
 */
export function ensureChurchCatalogSynced({ force = false } = {}) {
  if (!assertPhpAuth() || isMemberNeedsApproval()) {
    return Promise.resolve({ ok: true, skipped: true, changed: false })
  }
  if (typeof window === 'undefined') return Promise.resolve({ ok: false, changed: false })

  if (shouldDeferSyncUi()) {
    return new Promise((resolve) => {
      const wait = Math.max(msUntilSyncAllowed(), 800)
      setTimeout(() => {
        ensureChurchCatalogSynced({ force }).then(resolve).catch(() => {
          resolve({ ok: false, deferred: true })
        })
      }, wait)
    })
  }

  if (!force && churchSyncInFlight) return churchSyncInFlight
  if (!force && Date.now() - churchSyncLastAt < CHURCH_SYNC_COOLDOWN_MS) {
    return Promise.resolve({ ok: true, skipped: true, changed: false, cached: true })
  }

  churchSyncInFlight = _ensureChurchCatalogSynced(force)
    .finally(() => {
      churchSyncLastAt = Date.now()
      churchSyncInFlight = null
    })
  return churchSyncInFlight
}

async function _ensureChurchCatalogSynced(force = false) {
  const localCustom = parseJsonSafe(readStorageRawSync('igrejas_custom'))
  const localN = Array.isArray(localCustom) ? localCustom.length : 0
  const localEnrich = parseJsonSafe(readStorageRawSync('igrejas_enrich'))
  const localEnrichN = localEnrich && typeof localEnrich === 'object' ? Object.keys(localEnrich).length : 0
  const localCoords = parseJsonSafe(readStorageRawSync('geo_coords_igrejas'))
  const localCoordsN = localCoords && typeof localCoords === 'object' ? Object.keys(localCoords).length : 0

  const meta = await phpFetchChurchMeta()
  const serverN = meta?.count ?? 0
  const serverEnrichN = meta?.enrich ?? 0
  const serverCoordsN = meta?.coords ?? 0
  const limpoLocal = readCadastroLimpoEmLocal()
  const limpoServer = meta?.clearedAt ?? await readCadastroLimpoEmServer()

  const serverClearedWins = IGREJAS_MAPA_SOMENTE_MANUAL
    && serverN === 0
    && limpoServer > 0
    && limpoServer > limpoLocal
    && (localN > 0 || localEnrichN > 0 || localCoordsN > 0)

  if (serverClearedWins) {
    const merged = emptyChurchCatalogMerged()
    const changed = applyChurchMergeToLocal(merged)
    applyCadastroLimpoEmLocal(limpoServer)
    if (changed) {
      try { window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { fromServer: true, igrejasCadastroLimpo: true } })) } catch { /* ignore */ }
      dispatchSyncReload()
    }
    return { ok: true, changed, local: 0, server: 0, pulledEmpty: true }
  }

  const localChoseEmpty = localCadastroIgrejasEscolheuVazio(limpoServer)

  if (localChoseEmpty && localN === 0 && localEnrichN === 0 && localCoordsN === 0) {
    if (serverN > 0 || serverEnrichN > 0 || serverCoordsN > 0) {
      const ts = limpoLocal || Date.now()
      await pushChurchCatalogToServer(CHURCH_CATALOG_VAZIO_PAYLOAD)
      await phpReplaceStoreKeys(
        [[IGREJAS_CADASTRO_LIMPO_EM_KEY, String(ts)]],
        [IGREJAS_CADASTRO_LIMPO_EM_KEY],
      )
    }
    return { ok: true, changed: false, local: 0, server: 0, enforcedEmpty: true }
  }

  const needPull = !IGREJAS_MAPA_SOMENTE_MANUAL
    && (localN === 0 || serverN > localN || serverEnrichN > localEnrichN || serverCoordsN > localCoordsN)
    || (IGREJAS_MAPA_SOMENTE_MANUAL && serverN > localN && !localChoseEmpty && localN === 0)
    || (IGREJAS_MAPA_SOMENTE_MANUAL && limpoServer > limpoLocal && limpoServer > 0)
  const needPush = !serverClearedWins && localN !== serverN && !(
    IGREJAS_MAPA_SOMENTE_MANUAL && serverN > localN && !localChoseEmpty && localN === 0
  )
  const needCompare = IGREJAS_MAPA_SOMENTE_MANUAL
    && !localChoseEmpty
    && localN > 0
    && serverN > 0
    && localN !== serverN

  if (!force && !needPull && !needPush && !needCompare) {
    return { ok: true, skipped: true, changed: false, local: localN, server: serverN }
  }

  let serverPack = null
  if (needPull || needPush || needCompare || force) {
    serverPack = await phpFetchChurchCatalog()
  }

  const serverData = serverPack?.data || {}
  const serverFetchedN = contarItensStore(serverData.igrejas_custom)
  const localIds = churchIdSet(localCustom)
  const serverIds = churchIdSet(serverData.igrejas_custom)

  const isPureLocalDeletion = IGREJAS_MAPA_SOMENTE_MANUAL
    && !localChoseEmpty
    && localN > 0
    && serverFetchedN > localN
    && [...localIds].every((id) => serverIds.has(id))

  if (isPureLocalDeletion) {
    const body = readChurchCatalogBodyFromLocal()
    body._replace = [...CHURCH_PUSH_KEYS]
    const push = await phpPushChurchCatalog(body)
    if (!push?.ok) {
      return { ok: false, error: churchSyncError || 'Não gravou igrejas no site.', local: localN, server: serverFetchedN }
    }
    const now = Date.now()
    for (const key of CHURCH_PUSH_KEYS) {
      pending.delete(key)
      touchLocalAt(key, now)
    }
    churchSyncError = null
    lastSyncAt = now
    window.dispatchEvent(new Event(SYNC_OK_EVENT))
    return { ok: true, changed: false, local: localN, server: push.counts?.igrejas_custom ?? localN, pushed: true, localDeletion: true }
  }

  const merged = {}
  merged.igrejas_ocultas = mergeIdSetLists(
    readStorageRawSync('igrejas_ocultas'),
    serverData.igrejas_ocultas == null ? null : JSON.stringify(serverData.igrejas_ocultas),
  )
  for (const key of CHURCH_PUSH_KEYS) {
    if (key === 'igrejas_ocultas') continue
    const localVal = readStorageRawSync(key)
    const serverStr = serverData[key] == null ? null : JSON.stringify(serverData[key])
    if (key === 'igrejas_custom') {
      merged[key] = mergeIgrejasCustom(localVal, serverStr, merged.igrejas_ocultas, limpoServer)
    } else if (CHURCH_OBJECT_KEYS.has(key)) {
      merged[key] = mergeIgrejasObjects(localVal, serverStr, limpoServer)
    }
  }

  const restr = restringirPacoteIgrejasCidadesCampanha(merged)
  Object.assign(merged, restr.merged)

  const changed = applyChurchMergeToLocal(merged)
  const mergedN = contarItensStore(parseJsonSafe(merged.igrejas_custom || '[]'))

  let churchContentChanged = restr.removed > 0
  for (const key of CHURCH_PUSH_KEYS) {
    if (!merged[key]) continue
    const serverStr = serverData[key] == null ? null : JSON.stringify(serverData[key])
    if (normJson(merged[key]) !== normJson(serverStr)) {
      churchContentChanged = true
      break
    }
  }

  if (mergedN > serverFetchedN || churchContentChanged) {
    const body = {}
    for (const key of CHURCH_PUSH_KEYS) {
      if (!merged[key]) continue
      body[key] = parseJsonSafe(merged[key])
    }
    if (mergedN === 0 && limpoLocal > 0 && limpoLocal >= limpoServer) {
      body._replace = [...CHURCH_PUSH_KEYS]
    } else if (IGREJAS_MAPA_SOMENTE_MANUAL && mergedN < serverFetchedN && !localChoseEmpty) {
      body._replace = [...CHURCH_PUSH_KEYS]
    } else if (restr.removed > 0) {
      body._replace = [...CHURCH_PUSH_KEYS]
    }
    const push = await phpPushChurchCatalog(body)
    if (!push?.ok) {
      // Falha de igrejas não contamina o sync principal
      return { ok: false, error: churchSyncError || 'Não gravou igrejas no site.', local: mergedN, server: serverFetchedN }
    }
    const newServerN = push.counts?.igrejas_custom ?? mergedN
    churchSyncError = null
    lastSyncAt = Date.now()
    const now = Date.now()
    for (const key of CHURCH_PUSH_KEYS) {
      pending.delete(key)
      touchLocalAt(key, now)
    }
    window.dispatchEvent(new Event(SYNC_OK_EVENT))
    return { ok: true, changed: changed || mergedN !== localN, local: mergedN, server: newServerN, pushed: true }
  }

  return { ok: true, changed, local: mergedN, server: Math.max(serverFetchedN, serverN) }
}

async function phpGetKey(key) {
  if (!assertPhpAuth()) return null
  try {
    const ctrl = new AbortController()
    const ms = key === 'igrejas_custom' ? 120000 : 45000
    const t = setTimeout(() => ctrl.abort(), ms)
    const r = await fetch(`${PHP_API}?key=${encodeURIComponent(key)}`, {
      headers: phpHeaders(),
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (!r.ok) return null
    const text = await r.text()
    if (!text || text === 'null') return null
    try { return JSON.parse(text) } catch { return null }
  } catch {
    return null
  }
}

function contarItensStore(val) {
  if (Array.isArray(val)) return val.length
  if (val && typeof val === 'object') return Object.keys(val).length
  return 0
}

/**
 * Grava o cadastro de igrejas no MySQL do site e confere se chegou.
 * Aceita os dados na memória — não depende do navegador estar cheio.
 */
export async function pushChurchCatalogToServer(payload = null) {
  if (!usePhpSync() || !phpAccessToken || !phpTenantId) {
    return { ok: false, error: 'Entre na campanha (login) para gravar no site.' }
  }
  const replaceKeys = payload?.replace === true
    ? [...CHURCH_PUSH_KEYS]
    : (Array.isArray(payload?.replace) ? payload.replace.filter(Boolean) : [])

  const toStr = (key, val) => {
    const raw = typeof val === 'string' ? val : JSON.stringify(val ?? (key === 'igrejas_custom' || key === 'igrejas_ocultas' ? [] : {}))
    return key === 'igrejas_custom' ? sanitizarIgrejasCustomJson(raw) : raw
  }
  let rows = []
  const hasPayload = payload && (
    payload.custom != null || payload.enrich != null || payload.coords != null
    || payload.pastores != null || payload.overrides != null || payload.ocultas != null
  )
  if (hasPayload) {
    if (payload.custom != null) rows.push(['igrejas_custom', toStr('igrejas_custom', payload.custom)])
    if (payload.enrich != null) rows.push(['igrejas_enrich', toStr('igrejas_enrich', payload.enrich)])
    if (payload.coords != null) rows.push(['geo_coords_igrejas', toStr('geo_coords_igrejas', payload.coords)])
    if (payload.pastores != null) rows.push(['pastores_igrejas', toStr('pastores_igrejas', payload.pastores)])
    if (payload.overrides != null) rows.push(['igrejas_overrides', toStr('igrejas_overrides', payload.overrides)])
    if (payload.ocultas != null) rows.push(['igrejas_ocultas', toStr('igrejas_ocultas', payload.ocultas)])
  } else {
    for (const key of CHURCH_PUSH_KEYS) {
      const v = typeof window !== 'undefined' ? readStorageRawSync(key) : null
      if (v != null && v !== '' && v !== 'null') rows.push([key, v])
    }
  }
  if (!rows.length && !replaceKeys.length) {
    return { ok: false, error: 'Não há igrejas para enviar ao site.' }
  }

  const body = {}
  for (const [key, val] of rows) {
    body[key] = parseJsonSafe(val)
  }
  if (replaceKeys.length) body._replace = replaceKeys
  const push = await phpPushChurchCatalog(body)
  if (!push?.ok) {
    return { ok: false, error: churchSyncError || 'Não deu para gravar as igrejas no site.' }
  }

  const esperado = payload?.custom != null
    ? contarItensStore(payload.custom)
    : contarItensStore(parseJsonSafe(typeof window !== 'undefined' ? readStorageRawSync('igrejas_custom') : '[]'))
  const serverN = push.counts?.igrejas_custom ?? esperado

  if (esperado > 0 && serverN < esperado) {
    churchSyncError = `O site ficou com ${serverN} igreja(s); o cadastro tem ${esperado}.`
    return { ok: false, error: churchSyncError, local: esperado, server: serverN }
  }
  if (replaceKeys.includes('igrejas_custom') && serverN !== esperado) {
    churchSyncError = `O site ficou com ${serverN} igreja(s); esperado ${esperado}.`
    return { ok: false, error: churchSyncError, local: esperado, server: serverN }
  }

  churchSyncError = null
  lastSyncAt = Date.now()
  const now = Date.now()
  for (const [k] of rows) {
    pending.delete(k)
    touchLocalAt(k, now)
  }
  try { window.dispatchEvent(new Event(SYNC_OK_EVENT)) } catch { /* ignore */ }
  return { ok: true, local: esperado, server: serverN }
}
