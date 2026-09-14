const PM_GEO = '/bairros_pm.geojson'
const OSM_GEO = '/bairros.geojson'

const _geoCache = new Map()

/** Nome da cidade → arquivo em /bairros_geojson/ (ex.: GASPAR → GASPAR.geojson) */
export function slugCidadeGeo(cidade) {
  return String(cidade || '')
    .trim()
    .normalize('NFC')
    .toUpperCase()
    .replace(/\s+/g, '_')
}

export function urlBairrosGeoCidade(cidade) {
  const slug = slugCidadeGeo(cidade)
  if (!slug) return null
  return `/bairros_geojson/${encodeURIComponent(slug)}.geojson`
}

function boundsFromGeo(data) {
  if (!data?.features?.length) return null
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  const walk = (coords) => {
    if (!Array.isArray(coords)) return
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [lng, lat] = coords
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      return
    }
    coords.forEach(walk)
  }
  data.features.forEach(f => walk(f.geometry?.coordinates))
  if (!Number.isFinite(minLat)) return null
  return [[minLat, minLng], [maxLat, maxLng]]
}

async function fetchGeo(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const data = await r.json()
  if (!data?.features?.length) throw new Error('GeoJSON vazio')
  return data
}

/**
 * Carrega polígonos de bairros da cidade.
 * Blumenau: arquivo PM local → OSM → voronoi (sem API externa).
 * Outras: /bairros_geojson/{CIDADE}.geojson quando existir.
 */
export async function carregarBairrosGeo(cidade = 'BLUMENAU') {
  const key = String(cidade || 'BLUMENAU').trim().toUpperCase() || 'BLUMENAU'
  if (_geoCache.has(key)) return _geoCache.get(key)

  const isBlu = key === 'BLUMENAU'

  if (isBlu) {
    try {
      const data = await fetchGeo(PM_GEO)
      const pack = { data, source: 'pm', label: 'Bairros Blumenau (local)', bounds: boundsFromGeo(data), cidade: 'BLUMENAU' }
      _geoCache.set(key, pack)
      return pack
    } catch {
      try {
        const data = await fetchGeo(OSM_GEO)
        const pack = { data, source: 'osm', label: 'OpenStreetMap', bounds: boundsFromGeo(data), cidade: 'BLUMENAU' }
        _geoCache.set(key, pack)
        return pack
      } catch {
        const data = await fetchGeo(urlBairrosGeoCidade('BLUMENAU'))
        const pack = { data, source: 'voronoi', label: 'Bairros Blumenau', bounds: boundsFromGeo(data), cidade: 'BLUMENAU' }
        _geoCache.set(key, pack)
        return pack
      }
    }
  }

  const nome = String(cidade).trim()
  const url = urlBairrosGeoCidade(nome)
  try {
    const data = await fetchGeo(url)
    const pack = {
      data,
      source: 'cidade',
      label: nome,
      bounds: boundsFromGeo(data),
      cidade: nome,
    }
    _geoCache.set(key, pack)
    return pack
  } catch (err) {
    const err2 = new Error(`Sem mapa de bairros para ${nome}`)
    err2.cause = err
    err2.code = 'NO_GEO'
    throw err2
  }
}
