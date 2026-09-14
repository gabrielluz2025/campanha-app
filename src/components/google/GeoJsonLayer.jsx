import { GeoJSON } from 'react-leaflet'

function leafletStyle(styleFn, feature) {
  const s = styleFn?.(feature) || {}
  return {
    fillColor: s.fillColor || '#333',
    fillOpacity: s.fillOpacity ?? 0.5,
    color: s.color || s.strokeColor || '#fff',
    weight: s.weight ?? s.strokeWeight ?? 1,
  }
}

/**
 * Camada GeoJSON no Leaflet (choropleth de bairros, etc.).
 */
export default function GeoJsonLayer({
  data,
  styleFn,
  onFeatureClick,
  onFeatureMouseover,
  onFeatureMouseout,
  layerKey = 'default',
}) {
  if (!data?.features?.length) return null

  return (
    <GeoJSON
      key={layerKey}
      data={data}
      style={(feature) => leafletStyle(styleFn, feature)}
      onEachFeature={(feature, layer) => {
        if (onFeatureClick) {
          layer.on('click', (e) => {
            e.originalEvent?.stopPropagation?.()
            onFeatureClick(feature, e)
          })
        }
        if (onFeatureMouseover) {
          layer.on('mouseover', (e) => {
            layer.setStyle({ weight: 2.5, fillOpacity: 0.92 })
            onFeatureMouseover(feature, e)
          })
        }
        if (onFeatureMouseout) {
          layer.on('mouseout', (e) => {
            layer.setStyle(leafletStyle(styleFn, feature))
            onFeatureMouseout(feature, e)
          })
        } else if (onFeatureMouseover) {
          layer.on('mouseout', () => {
            layer.setStyle(leafletStyle(styleFn, feature))
          })
        }
      }}
    />
  )
}

GeoJsonLayer.leafletNative = true
