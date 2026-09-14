/**
 * Rotas viárias OSRM — proxy api.php (CORS) + fallback direto.
 * waypoints: [[lat, lng], ...] ou [{ lat, lng }, ...]
 */

function toLatLng(w) {
  if (Array.isArray(w)) return { lat: Number(w[0]), lng: Number(w[1]) }
  return { lat: Number(w.lat), lng: Number(w.lng) }
}

function waypointsToCoordsString(waypoints = []) {
  return waypoints
    .map(toLatLng)
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map(p => `${p.lng},${p.lat}`)
    .join(';')
}

function geoJsonToLinha(geometry) {
  if (!geometry?.coordinates?.length) return []
  return geometry.coordinates.map(([lng, lat]) => [lat, lng])
}

async function fetchOsrmApi(action, coordsString, extraQuery = '') {
  if (!coordsString || !coordsString.includes(',')) return null
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const url = `${origin}/api.php?action=${action}&coords=${encodeURIComponent(coordsString)}${extraQuery}`
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function fetchOsrmDirectRoute(coordsString) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function fetchOsrmDirectTrip(coordsString) {
  const extra = 'source=any&destination=any&roundtrip=false&overview=full&geometries=geojson'
  const url =
    `https://router.project-osrm.org/trip/v1/driving/${coordsString}?${extra}`
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * @returns {Promise<{ linha: number[][], distancia: number|null, duracao: number|null } | null>}
 */
export async function buscarRotaOsrm(waypoints = []) {
  const pts = (waypoints || []).map(toLatLng).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  if (pts.length < 2) return null
  const coordsString = pts.map(p => `${p.lng},${p.lat}`).join(';')

  let data = await fetchOsrmApi('osrm_route', coordsString)
  if (!data?.routes?.[0]) data = await fetchOsrmDirectRoute(coordsString)
  const route = data?.routes?.[0]
  if (!route) return null

  const linha = route.geometry?.coordinates?.length
    ? geoJsonToLinha(route.geometry)
    : pts.map(p => [p.lat, p.lng])

  return {
    linha,
    distancia: route.distance ?? null,
    duracao: route.duration ?? null,
  }
}

/**
 * TSP — reordena paradas (OSRM trip).
 * @returns {Promise<{ linha, distancia, duracao, ordemIndices: number[] } | null>}
 */
export async function buscarRotaTripOsrm(waypoints = []) {
  const pts = (waypoints || []).map(toLatLng).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  if (pts.length < 2) return null
  const coordsString = pts.map(p => `${p.lng},${p.lat}`).join(';')
  const extra = '&source=any&destination=any&roundtrip=false&overview=full&geometries=geojson'
  let data = await fetchOsrmApi('osrm_trip', coordsString, extra)
  if (!data?.trips?.[0]) data = await fetchOsrmDirectTrip(coordsString)
  const trip = data?.trips?.[0]
  if (!trip) return null

  const ordemIndices = Array.isArray(data.waypoints)
    ? data.waypoints
      .map((wp, inputIndex) => ({ inputIndex, order: Number(wp.waypoint_index) }))
      .sort((a, b) => a.order - b.order)
      .map(x => x.inputIndex)
    : pts.map((_, i) => i)

  const linha = trip.geometry?.coordinates?.length
    ? geoJsonToLinha(trip.geometry)
    : pts.map(p => [p.lat, p.lng])

  return {
    linha,
    distancia: trip.distance ?? null,
    duracao: trip.duration ?? null,
    ordemIndices,
  }
}

/**
 * GeoJSON LineString para Leaflet GeoJSON (campo / torre).
 * @param {{ lat: number, lng: number }[]} points
 */
export async function fetchOsrmDrivingGeometry(points = []) {
  const pts = (points || []).map(toLatLng).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  if (pts.length < 2) return null
  const coordsString = pts.map(p => `${p.lng},${p.lat}`).join(';')

  let data = await fetchOsrmApi('osrm_route', coordsString)
  if (!data?.routes?.[0]) data = await fetchOsrmDirectRoute(coordsString)
  const geom = data?.routes?.[0]?.geometry
  if (geom?.type === 'LineString' && Array.isArray(geom.coordinates)) return geom
  return null
}
