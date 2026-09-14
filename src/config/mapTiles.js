/** Camada base Leaflet — OpenStreetMap (ruas detalhadas ao aproximar). */

export const CARTO_API_KEY = String(import.meta.env.VITE_CARTO_API_KEY || '').trim()

const OSM_PADRAO = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  subdomains: 'abc',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
  maxNativeZoom: 19,
}

export function leafletBasemapConfig() {
  if (CARTO_API_KEY) {
    return {
      url: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CARTO_API_KEY)}`,
      subdomains: 'abcd',
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 20,
      maxNativeZoom: 20,
    }
  }
  return OSM_PADRAO
}
