/**
 * API GEO Blumenau — geo.blumenau.sc.gov.br (ArcGIS REST / Prefeitura Municipal)
 * Docs: https://geo.blumenau.sc.gov.br/
 */

import { bairroCanon, normalizarBairro } from './bairroMapa'

export const BLUMENAU_GEO_BASE = 'https://geo.blumenau.sc.gov.br/server/rest/services'

export const BLUMENAU_GEO_SERVICES = {
  bairros: 'Limites/Bairros/FeatureServer/0',
  limite: 'Limites/Limite_Municipal/MapServer',
  vias: 'Sistema_Viario/Vias/MapServer',
}

const BAIRROS_CACHE_KEY = 'blumenau_bairros_geo_api_v1'
const BAIRROS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

let bairrosMemCache = null

function pmNomeParaExibicao(pm) {
  const raw = String(pm || '').trim()
  if (!raw) return 'Sem nome'
  return normalizarBairro(raw) || raw
}

/** Normaliza GeoJSON da prefeitura (BAIRROS) para o formato usado no app (name, canon, namePm). */
export function normalizeBairrosGeoJson(data) {
  if (!data?.features?.length) return null
  const features = data.features.map((f) => {
    const pm = f.properties?.BAIRROS || f.properties?.namePm || f.properties?.name || ''
    const name = f.properties?.name || pmNomeParaExibicao(pm)
    const canon = f.properties?.canon || bairroCanon(name) || name
    return {
      ...f,
      properties: {
        ...f.properties,
        name,
        canon,
        namePm: String(pm || name).toUpperCase(),
        cdBairro: f.properties?.CD_BAIRRO || f.properties?.cdBairro || '',
        source: 'geo_blumenau',
      },
    }
  })
  return { type: 'FeatureCollection', features }
}

function readBairrosCache() {
  try {
    const raw = sessionStorage.getItem(BAIRROS_CACHE_KEY)
    if (!raw) return null
    const pack = JSON.parse(raw)
    if (!pack?.data?.features?.length || !pack?.at) return null
    if (Date.now() - pack.at > BAIRROS_CACHE_TTL_MS) return null
    return pack.data
  } catch {
    return null
  }
}

function writeBairrosCache(data) {
  try {
    sessionStorage.setItem(BAIRROS_CACHE_KEY, JSON.stringify({ at: Date.now(), data }))
  } catch { /* ignore quota */ }
}

/** Busca polígonos oficiais de bairros (35 feições) via FeatureServer. */
export async function fetchBairrosOficial() {
  if (bairrosMemCache?.features?.length) return bairrosMemCache

  const cached = readBairrosCache()
  if (cached?.features?.length) {
    bairrosMemCache = cached
    return cached
  }

  const url = `${BLUMENAU_GEO_BASE}/${BLUMENAU_GEO_SERVICES.bairros}/query`
    + '?where=1%3D1&outFields=BAIRROS,CD_BAIRRO&returnGeometry=true'
    + '&f=geojson&outSR=4326&resultRecordCount=2000'

  const res = await fetch(url)
  if (!res.ok) throw new Error(`GEO Blumenau HTTP ${res.status}`)
  const raw = await res.json()
  if (raw?.error) throw new Error(raw.error.message || 'GEO Blumenau query failed')

  const data = normalizeBairrosGeoJson(raw)
  if (!data?.features?.length) throw new Error('GEO Blumenau: bairros vazios')

  bairrosMemCache = data
  writeBairrosCache(data)
  return data
}

/** Converte tile web mercator → bbox WGS84 para export ArcGIS MapServer. */
export function tileBbox4326(x, y, z) {
  const n = 2 ** z
  const west = x / n * 360 - 180
  const east = (x + 1) / n * 360 - 180
  const northRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)))
  const southRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n)))
  const north = northRad * 180 / Math.PI
  const south = southRad * 180 / Math.PI
  return { west, south, east, north }
}

/** URL de tile PNG transparente (vias, limite municipal, etc.). */
export function blumenauArcGisTileUrl(servicePath, layerId, x, y, z, {
  size = 256,
  opacity = 1,
} = {}) {
  const { west, south, east, north } = tileBbox4326(x, y, z)
  const bbox = `${west},${south},${east},${north}`
  const params = new URLSearchParams({
    bbox,
    bboxSR: '4326',
    imageSR: '4326',
    size: `${size},${size}`,
    format: 'png32',
    transparent: 'true',
    layers: `show:${layerId}`,
    f: 'image',
  })
  if (opacity < 1) params.set('layerDefs', '')
  return `${BLUMENAU_GEO_BASE}/${servicePath}/export?${params.toString()}`
}

export const BLUMENAU_MAP_ATTRIBUTION = '© Prefeitura Municipal de Blumenau — GEO Blumenau'

/** Limite municipal oficial (polígono WGS84). */
export async function fetchLimiteMunicipal() {
  const url = `${BLUMENAU_GEO_BASE}/Limites/Limite_Municipal/FeatureServer/0/query`
    + '?where=1%3D1&outFields=&returnGeometry=true&f=geojson&outSR=4326'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Limite municipal HTTP ${res.status}`)
  const data = await res.json()
  if (data?.error) throw new Error(data.error.message || 'Limite municipal indisponível')
  if (!data?.features?.length) throw new Error('Limite municipal vazio')
  return data
}
