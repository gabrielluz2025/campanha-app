/** Camada base Leaflet — OpenStreetMap (ruas detalhadas ao aproximar). */

export const CARTO_API_KEY = String(import.meta.env.VITE_CARTO_API_KEY || '').trim()

const OSM_PADRAO = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  subdomains: 'abc',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
  maxNativeZoom: 19,
}

/** Estilos do mapa Campo Visitas / torre de despacho (sem API key / marca d'água). */
export const CAMPO_MAP_LAYERS = {
  esri_street: {
    id: 'esri_street',
    label: 'Ruas (Esri)',
    emoji: '🏙️',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    subdomains: '',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  },
  osm: {
    id: 'osm',
    label: 'OpenStreetMap',
    emoji: '🗺️',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  satellite: {
    id: 'satellite',
    label: 'Satélite HD',
    emoji: '🛰️',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    subdomains: '',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  },
}

export function getCampoMapLayer(layerId = 'esri_street') {
  return { ...(CAMPO_MAP_LAYERS[layerId] || CAMPO_MAP_LAYERS.esri_street) }
}

export function leafletBasemapConfig() {
  return { ...OSM_PADRAO }
}
