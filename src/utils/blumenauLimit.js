import { BAIRROS_BLUMENAU } from './constants'
import { boundsFromGeo, pointInFeature } from './geoPoint'

const PM_GEO = '/bairros_pm.geojson'

/** Retângulo WGS84 aproximado — usado antes de carregar o limite oficial. */
export const BLUMENAU_BBOX_APROX = {
  south: -27.06,
  north: -26.76,
  west: -49.22,
  east: -48.80,
}

/** Bounds Leaflet/Google: [[south, west], [north, east]] */
export const BLUMENAU_MAP_MAX_BOUNDS = [
  [BLUMENAU_BBOX_APROX.south, BLUMENAU_BBOX_APROX.west],
  [BLUMENAU_BBOX_APROX.north, BLUMENAU_BBOX_APROX.east],
]

let boundaryCache = null
let boundaryPromise = null

const LIMITE_CACHE_KEY = 'blumenau_limite_geo_v2_local'

function readLimiteCache() {
  try {
    const raw = sessionStorage.getItem(LIMITE_CACHE_KEY)
    if (!raw) return null
    const pack = JSON.parse(raw)
    return pack?.data || null
  } catch {
    return null
  }
}

function writeLimiteCache(data) {
  try {
    sessionStorage.setItem(LIMITE_CACHE_KEY, JSON.stringify({ at: Date.now(), data }))
  } catch { /* ignore quota */ }
}

/** Une limite municipal + polígonos de bairros (prioriza limite oficial). */
export function mergeBoundary(limiteBlu, bairrosGeo) {
  if (limiteBlu?.limit) return limiteBlu
  const cached = readLimiteCache()
  if (cached?.limit) return cached
  if (bairrosGeo?.features?.length) {
    return {
      limit: null,
      bairros: bairrosGeo,
      bounds: boundsFromGeo(bairrosGeo) || BLUMENAU_MAP_MAX_BOUNDS,
      source: 'bairros_ui',
    }
  }
  if (cached?.bairros?.features?.length) return cached
  return limiteBlu || cached || null
}

/** Lista ordenada dos 35 bairros oficiais de Blumenau (fonte: constants). */
export function listarBairrosOficiais(_bairrosGeo) {
  return [...BAIRROS_BLUMENAU].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** Opções do select/chip de filtro por bairro. */
export function bairrosFiltroOpcoes() {
  return ['Todos', ...listarBairrosOficiais()]
}

async function fetchLocalBairrosPm() {
  const res = await fetch(PM_GEO)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (!data?.features?.length) throw new Error('GeoJSON vazio')
  return data
}

/** Contorno municipal para o mapa (limite oficial ou fallback pelos bairros locais). */
export function contornoParaMapa(limiteBlu, bairrosGeo = null) {
  if (limiteBlu?.limit) return limiteBlu.limit
  const fc = bairrosGeo?.features?.length ? bairrosGeo : limiteBlu?.bairros
  if (fc?.features?.length) return fc
  return null
}

export async function carregarLimiteBlumenau() {
  if (boundaryCache) return boundaryCache
  const cached = readLimiteCache()
  if (cached?.bairros?.features?.length) {
    boundaryCache = cached
    return boundaryCache
  }
  if (boundaryPromise) return boundaryPromise

  boundaryPromise = (async () => {
    try {
      const bairros = await fetchLocalBairrosPm()
      boundaryCache = {
        limit: null,
        bairros,
        bounds: boundsFromGeo(bairros) || BLUMENAU_MAP_MAX_BOUNDS,
        source: 'bairros_local',
      }
      writeLimiteCache(boundaryCache)
      return boundaryCache
    } catch {
      boundaryCache = { limit: null, bairros: null, bounds: BLUMENAU_MAP_MAX_BOUNDS, source: 'bbox' }
      return boundaryCache
    } finally {
      boundaryPromise = null
    }
  })()

  return boundaryPromise
}

export function getLimiteBlumenauCache() {
  return boundaryCache || readLimiteCache()
}

export function coordDentroBlumenau(lat, lng, boundary = boundaryCache || readLimiteCache()) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return false
  const la = Number(lat)
  const ln = Number(lng)

  if (boundary?.limit && pointInFeature(ln, la, boundary.limit)) return true

  if (boundary?.bairros?.features?.length) {
    return boundary.bairros.features.some(f => pointInFeature(ln, la, f))
  }

  return false
}

export function filtrarIgrejasBlumenau(igrejas = [], boundary = boundaryCache || readLimiteCache()) {
  const b = boundary
  if (!b?.limit && !b?.bairros?.features?.length) return []
  return (igrejas || []).filter(ig => {
    if (!ig?.lat || !ig?.lng) return false
    return coordDentroBlumenau(ig.lat, ig.lng, b)
  })
}

export function coresBairrosMapa(features = []) {
  const cores = {}
  const total = Math.max(features.length, 1)
  ;[...features]
    .sort((a, b) => String(a.properties?.name || '').localeCompare(String(b.properties?.name || ''), 'pt-BR'))
    .forEach((f, i) => {
      const nome = f.properties?.name
      if (!nome) return
      const h = Math.round((i * 360) / total)
      cores[nome] = `hsla(${h}, 55%, 42%, 0.38)`
    })
  return cores
}

export function estiloBairroGoogle(feature, bairroCores = {}, { visitas = 0 } = {}) {
  const nome = feature.getProperty?.('name') || feature.properties?.name
  const base = bairroCores[nome] || 'hsla(45, 70%, 48%, 0.28)'
  const fill = visitas > 0 ? base : 'hsla(220, 18%, 28%, 0.22)'
  return {
    fillColor: fill,
    fillOpacity: 0.82,
    color: 'rgba(212, 175, 95, 0.72)',
    weight: 2,
  }
}

export function estiloBairroLeaflet(feature, bairroCores = {}) {
  const nome = feature?.properties?.name
  return {
    fillColor: bairroCores[nome] || 'hsla(45, 70%, 48%, 0.28)',
    fillOpacity: 0.78,
    color: 'rgba(212, 175, 95, 0.85)',
    weight: 2,
  }
}

/** Linha externa do município — Leaflet. */
export function estiloContornoMunicipalLeaflet() {
  return {
    fill: false,
    fillOpacity: 0,
    color: 'rgba(96, 200, 255, 0.92)',
    weight: 3,
    opacity: 0.95,
    dashArray: '10 8',
  }
}
