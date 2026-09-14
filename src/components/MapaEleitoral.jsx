import { MapaEleitoralProvider } from './mapaEleitoral/context/MapaEleitoralContext'
import MapaEleitoralLayout from './mapaEleitoral/MapaEleitoralLayout'

/** Mapa Eleitoral v2 — Radar Territorial + plano de ação */
export default function MapaEleitoral() {
  return (
    <MapaEleitoralProvider>
      <MapaEleitoralLayout />
    </MapaEleitoralProvider>
  )
}
