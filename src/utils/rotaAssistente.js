import { haversineKm } from './rotaUtils'
import { paradasNovasDeIgrejas } from './rotaPlanHelpers'

/**
 * Sugere paradas para "Rota do dia" — bairro, não visitadas, com GPS, ordem por proximidade.
 */
export function sugerirRotaDoDia({
  igrejas = [],
  bairro = 'Todos',
  maxParadas = 12,
  filtroVisita = 'pendentes',
  seedLat = null,
  seedLng = null,
} = {}) {
  let pool = (igrejas || []).filter(ig => ig?.id && ig.lat && ig.lng)
  if (bairro && bairro !== 'Todos') {
    pool = pool.filter(ig => String(ig.setor || ig.bairro || '') === String(bairro))
  }
  if (filtroVisita === 'pendentes') pool = pool.filter(ig => !ig.visitado)
  else if (filtroVisita === 'visitadas') pool = pool.filter(ig => ig.visitado)

  if (!pool.length) {
    return { ids: [], ordem: [], motivo: 'Nenhuma igreja encontrada com os filtros.' }
  }

  const start = seedLat != null && seedLng != null
    ? { lat: seedLat, lng: seedLng }
    : pool.reduce((best, ig) => {
      const d = haversineKm({ lat: -26.9194, lng: -49.0661 }, ig)
      return !best || d < best.d ? { ig, d } : best
    }, null)?.ig || pool[0]

  const rest = [...pool]
  const ordem = []
  let cur = start

  while (ordem.length < maxParadas && rest.length) {
    let bestIdx = 0
    let bestKm = Infinity
    for (let i = 0; i < rest.length; i++) {
      const km = haversineKm(cur, rest[i])
      if (km < bestKm) {
        bestKm = km
        bestIdx = i
      }
    }
    const pick = rest.splice(bestIdx, 1)[0]
    ordem.push(pick)
    cur = pick
  }

  const ids = ordem.map(ig => ig.id)
  return {
    ids,
    ordem,
    motivo: `${ids.length} igreja(s) em ${bairro === 'Todos' ? 'Blumenau' : bairro} · ordem por proximidade`,
  }
}

export function criarParadasSugeridas(ids, paradasAtuais = []) {
  return paradasNovasDeIgrejas(ids, paradasAtuais)
}
