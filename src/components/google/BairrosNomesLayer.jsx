import { Marker } from '../map/MapChildren'
import { googleBairroLabelIcon } from '../../utils/googleMapIcons'

function centroidOfFeature(feature) {
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

/** Rótulos com nome dos bairros oficiais. */
export function BairrosNomesMarkers({ data, visible = true }) {
  if (!visible || !data?.features?.length) return null
  return data.features.map((feature) => {
    const nome = feature.properties?.name
    if (!nome) return null
    const pos = centroidOfFeature(feature)
    if (!pos) return null
    return (
      <Marker
        key={`bairro-nome-${nome}`}
        position={pos}
        icon={googleBairroLabelIcon(nome)}
        clickable={false}
        zIndex={480}
      />
    )
  })
}
