import { GeoJSON } from 'react-leaflet'
import { estiloContornoMunicipalLeaflet } from '../../utils/blumenauLimit'

/** Contorno vetorial do município — Leaflet/OSM. */
export function ContornoMunicipalLeaflet({ limitFeature }) {
  if (!limitFeature) return null
  const data = limitFeature.type === 'FeatureCollection'
    ? limitFeature
    : { type: 'FeatureCollection', features: [limitFeature] }
  return (
    <GeoJSON
      data={data}
      style={() => estiloContornoMunicipalLeaflet()}
      interactive={false}
    />
  )
}
