import { pointInFeature } from './geoPoint'

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function centroidOfBairroFeature(feature) {
  if (!feature?.geometry) return null
  const g = feature.geometry
  const ring = g.type === 'MultiPolygon' ? g.coordinates[0][0] : g.coordinates?.[0]
  if (!ring?.length) return null
  const lngs = ring.map(p => p[0])
  const lats = ring.map(p => p[1])
  return {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  }
}

function featuresOrdenados(bairrosGeo) {
  return [...(bairrosGeo?.features || [])].sort(
    (a, b) => String(b.properties?.name || '').length - String(a.properties?.name || '').length,
  )
}

/** Casa igreja ao polígono do bairro (GPS ou endereço/setor). */
export function acharBairroFeatureIgreja(ig, bairrosGeo) {
  if (!ig || !bairrosGeo?.features?.length) return null
  const featuresSorted = featuresOrdenados(bairrosGeo)
  const lat = Number(ig.lat)
  const lng = Number(ig.lng)
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    for (const feat of featuresSorted) {
      if (pointInFeature(lng, lat, feat)) return feat
    }
  }
  const endNorm = norm(ig.endereco)
  const setorNorm = norm(ig.setor || ig.bairro || '')
  const addrBairro1 = (endNorm.match(/-\s*([^,\-]+),\s*(blumenau|gaspar|indaial|timbo|pomerode)/) || [])[1]?.trim() || ''
  const addrBairro2 = (endNorm.match(/([a-z0-9\s]+)\s*-\s*(blumenau|gaspar|indaial|timbo|pomerode)/i) || [])[1]?.trim() || ''
  for (const feat of featuresSorted) {
    const nomN = norm(feat.properties?.name)
    if (!nomN) continue
    const m1 = addrBairro1 && (addrBairro1 === nomN || addrBairro1.includes(nomN) || nomN.includes(addrBairro1))
    const m2 = addrBairro2 && (addrBairro2 === nomN || addrBairro2.includes(nomN) || nomN.includes(addrBairro2))
    const mS = setorNorm && (setorNorm === nomN || setorNorm.includes(nomN) || nomN.includes(setorNorm))
    if (m1 || m2 || mS) return feat
  }
  return null
}

/** Pin aproximado no centro do bairro quando ainda não há GPS. */
export function estimarCoordsIgreja(ig, bairrosGeo) {
  if (!ig || !bairrosGeo?.features?.length) return null
  if (Number(ig.lat) && Number(ig.lng)) return null
  const feat = acharBairroFeatureIgreja(ig, bairrosGeo)
  if (!feat) return null
  const c = centroidOfBairroFeature(feat)
  if (!c) return null
  const seed = Number(ig.id) || 0
  const dLat = ((seed % 19) - 9) * 0.00022
  const dLng = (((seed * 5) % 19) - 9) * 0.00022
  return {
    lat: c.lat + dLat,
    lng: c.lng + dLng,
    bairroMapa: feat.properties?.name || '',
    geoEstimado: true,
  }
}

/** Agrupa igrejas com coordenadas por bairro oficial. */
export function agruparIgrejasPorBairro(igrejas = [], bairrosGeo) {
  const mapa = {}
  if (!bairrosGeo?.features?.length) return mapa
  bairrosGeo.features.forEach((f) => {
    const nome = f.properties?.name
    if (nome) mapa[nome] = []
  })
  const featuresSorted = featuresOrdenados(bairrosGeo)
  for (const ig of igrejas || []) {
    if (!ig?.lat || !ig?.lng) continue
    let assigned = false
    for (const feat of featuresSorted) {
      if (pointInFeature(ig.lng, ig.lat, feat)) {
        mapa[feat.properties.name].push(ig)
        assigned = true
        break
      }
    }
    if (assigned) continue
    const feat = acharBairroFeatureIgreja(ig, bairrosGeo)
    if (feat?.properties?.name) mapa[feat.properties.name].push(ig)
  }
  return mapa
}
