import { Marker } from 'react-leaflet'
import L from 'leaflet'
import { centroidOfBairroFeature } from '../../utils/bairroIgrejaMapa'

function bairroLabelIcon(nome, count) {
  const nomeOk = String(nome || '').trim()
  const qtd = Number(count) || 0
  const html = qtd > 0
    ? `<span class="bairro-map-label">${nomeOk} · <strong>${qtd}</strong></span>`
    : `<span class="bairro-map-label bairro-map-label--vazio">${nomeOk}</span>`
  return L.divIcon({
    html,
    className: 'bairro-map-label-wrap',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

/** Nomes dos bairros + quantidade de igrejas — discreto, sempre legível. */
export default function BairrosLabelsLeaflet({ data, igrejasPorBairro = {}, visible = true, minCount = 1 }) {
  if (!visible || !data?.features?.length) return null
  return data.features.map((feature) => {
    const nome = feature.properties?.name
    if (!nome) return null
    const lista = igrejasPorBairro[nome] || []
    const count = lista.length
    if (count < minCount) return null
    const pos = centroidOfBairroFeature(feature)
    if (!pos) return null
    return (
      <Marker
        key={`bairro-label-${nome}`}
        position={[pos.lat, pos.lng]}
        icon={bairroLabelIcon(nome, count)}
        interactive={false}
        zIndexOffset={400}
      />
    )
  })
}
