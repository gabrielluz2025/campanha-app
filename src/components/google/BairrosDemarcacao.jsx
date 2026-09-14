import { GeoJSON } from 'react-leaflet'
import { estiloBairroLeaflet } from '../../utils/blumenauLimit'

/** Demarcação de bairros — Leaflet/OSM. */
export function BairrosLeafletLayer({ data, bairroCores = {} }) {
  if (!data?.features?.length) return null
  return (
    <GeoJSON
      data={data}
      style={(feature) => ({
        ...estiloBairroLeaflet(feature, bairroCores),
        interactive: false,
      })}
    />
  )
}
