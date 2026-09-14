import { bairroCanon, bairroGeoNome } from '../../../utils/bairroMapa'

export function getCentroid(feature) {
  const coords = feature.geometry.coordinates
  const isMulti = feature.geometry.type === 'MultiPolygon'
  const ring = isMulti ? coords[0][0] : coords[0]
  const lngs = ring.map(p => p[0])
  const lats = ring.map(p => p[1])
  return { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 }
}

export function findFeatureByBairro(geoData, bairro) {
  if (!geoData?.features || !bairro) return null
  const geoNome = bairroGeoNome(bairro)
  return geoData.features.find(f =>
    f.properties.name === geoNome
    || f.properties.name === bairro
    || bairroCanon(f.properties.name) === bairro,
  ) || null
}

export function boundsFromFeature(feat) {
  if (!feat) return null
  const ring = feat.geometry.type === 'MultiPolygon' ? feat.geometry.coordinates[0][0] : feat.geometry.coordinates[0]
  const lats = ring.map(p => p[1])
  const lngs = ring.map(p => p[0])
  return [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]]
}
