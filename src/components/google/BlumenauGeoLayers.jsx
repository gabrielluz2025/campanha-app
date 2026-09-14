import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import { blumenauArcGisTileUrl } from '../../utils/blumenauGeoApi'

/** Camadas raster GEO Blumenau — Leaflet/OSM. */
export function BlumenauLeafletGeoLayers({ tileLayers = [] }) {
  const map = useMap()
  const key = useMemo(
    () => tileLayers.map(l => `${l.servicePath}:${l.layerId}:${l.opacity}`).join('|'),
    [tileLayers],
  )

  useEffect(() => {
    if (!map || !tileLayers.length) return undefined
    const layers = []

    tileLayers.forEach((spec, i) => {
      const Grid = L.GridLayer.extend({
        createTile(coords, done) {
          const tile = document.createElement('img')
          tile.alt = ''
          tile.setAttribute('role', 'presentation')
          tile.onload = () => done(null, tile)
          tile.onerror = () => done(null, tile)
          tile.src = blumenauArcGisTileUrl(
            spec.servicePath,
            spec.layerId ?? 0,
            coords.x,
            coords.y,
            coords.z,
          )
          return tile
        },
      })
      const layer = new Grid({
        opacity: spec.opacity ?? 0.75,
        zIndex: spec.zIndex ?? (350 + i),
        pane: 'overlayPane',
      })
      layer.addTo(map)
      layers.push(layer)
    })

    return () => layers.forEach(l => map.removeLayer(l))
  }, [map, key, tileLayers])

  return null
}
