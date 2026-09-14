/** Utilitários de ponto em polígono GeoJSON (WGS84). */

function isInRing(lng, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (((yi > lat) !== (yj > lat)) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

export function pointInFeature(lng, lat, feature) {
  if (!feature?.geometry || !Number.isFinite(lng) || !Number.isFinite(lat)) return false
  const g = feature.geometry
  if (g.type === 'Polygon') return isInRing(lng, lat, g.coordinates[0])
  if (g.type === 'MultiPolygon') return g.coordinates.some(p => isInRing(lng, lat, p[0]))
  return false
}

export function boundsFromGeo(data) {
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

export function boundsFromFeature(feature) {
  if (!feature) return null
  return boundsFromGeo({ type: 'FeatureCollection', features: [feature] })
}
