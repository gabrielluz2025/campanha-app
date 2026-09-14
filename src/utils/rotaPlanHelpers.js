import { paradaKey, criarParadaBase, isParadaEquipe, haversineKm } from './rotaUtils'
import { igrejaSemPinMapa } from './igrejasGeocodeFix'

/** Métricas de saúde da rota ativa para a barra de comando. */
export function calcularSaudeRota({ igrejas = [], paradasDetalhes = [], rotaCalc = null } = {}) {
  const paradas = (paradasDetalhes || []).filter(p => p?.key && !String(p.key).startsWith('equipe:'))
  const total = paradas.length
  const comGps = paradas.filter(p => Number(p.lat) && Number(p.lng)).length
  const semGps = Math.max(0, total - comGps)
  const visitadas = paradas.filter(p => p.status === 'concluido' || p.visitado).length

  let distEstKm = null
  if (rotaCalc?.distancia != null) {
    distEstKm = Number(rotaCalc.distancia)
  } else if (total >= 2) {
    let km = 0
    for (let i = 1; i < paradas.length; i++) {
      const a = paradas[i - 1]
      const b = paradas[i]
      if (a.lat && a.lng && b.lat && b.lng) km += haversineKm(a, b)
    }
    if (km > 0) distEstKm = Math.round(km * 10) / 10
  }

  const minEst = rotaCalc?.duracao ?? (distEstKm != null ? Math.round(distEstKm * 2.5) : null)

  const igrejasCatalogo = igrejas.length
  const igrejasComPin = igrejas.filter(ig => !igrejaSemPinMapa(ig)).length

  return {
    total,
    comGps,
    semGps,
    visitadas,
    pendentes: Math.max(0, total - visitadas),
    distEstKm,
    minEst,
    otimizada: Boolean(rotaCalc?.linha?.length),
    igrejasCatalogo,
    igrejasComPin,
  }
}

/** Cria paradas novas a partir de ids de igreja (ignora duplicatas). */
export function paradasNovasDeIgrejas(ids, paradasAtuais = []) {
  const existentes = new Set((paradasAtuais || []).map(p => p.key))
  return (ids || [])
    .map(id => paradaKey('igreja', id))
    .filter(k => !existentes.has(k))
    .map(key => criarParadaBase({ key, tipoParada: 'visita' }))
}

/** Mescla paradas de igreja preservando equipe. */
export function mesclarParadasIgreja(paradasAtuais, novasParadas) {
  const equipe = (paradasAtuais || []).filter(isParadaEquipe)
  const igrejas = (paradasAtuais || []).filter(p => !isParadaEquipe(p))
  return [...equipe, ...igrejas, ...(novasParadas || [])]
}
