/** Camada base Leaflet — OpenStreetMap (ruas detalhadas ao aproximar). */

export const CARTO_API_KEY = String(import.meta.env.VITE_CARTO_API_KEY || '').trim()

const OSM_PADRAO = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  subdomains: 'abc',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
  maxNativeZoom: 19,
}

const CARTO_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'

/** Estilos do mapa Campo Visitas / torre de despacho. */
export const CAMPO_MAP_LAYERS = {
  voyager: {
    id: 'voyager',
    label: 'Ruas Limpas',
    emoji: '🏙️',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    attribution: CARTO_ATTR,
    maxZoom: 20,
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
  dark: {
    id: 'dark',
    label: 'Modo Escuro',
    emoji: '🌙',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    attribution: CARTO_ATTR,
    maxZoom: 20,
  },
}

export function getCampoMapLayer(layerId = 'voyager') {
  const base = CAMPO_MAP_LAYERS[layerId] || CAMPO_MAP_LAYERS.voyager
  if (base.id === 'voyager' && CARTO_API_KEY) {
    return {
      ...base,
      url: `${base.url}?key=${encodeURIComponent(CARTO_API_KEY)}`,
    }
  }
  return { ...base }
}

export function leafletBasemapConfig() {
  return getCampoMapLayer('voyager')
}
