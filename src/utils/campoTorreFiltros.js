import { foraDoRaioCheckin } from './campoCheckIn'
import { STATUS_PARADA } from './rotasDiarias'

export function setoresUnicosCatalogo(churches = []) {
  const s = new Set()
  for (const ig of churches) {
    const v = String(ig?.setor || '').trim()
    if (v && v !== '—') s.add(v)
  }
  return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export function igrejaPassaFiltroSetor(ig, setorFiltro) {
  if (!setorFiltro || setorFiltro === 'todos') return true
  return String(ig?.setor || '').trim() === setorFiltro
}

export function paradaPassaFiltroStatus(parada, statusFiltro, checkInsByIgreja = {}) {
  if (!statusFiltro || statusFiltro === 'todos') return true
  if (statusFiltro === 'fora_raio') {
    const ci = checkInsByIgreja[String(parada?.igrejaId)]
    if (!ci) return false
    return foraDoRaioCheckin(ci.distanciaMetros) || Boolean(String(ci.justificativaDistancia || '').trim())
  }
  return (parada?.status || STATUS_PARADA.PENDENTE) === statusFiltro
}

export function checkInPassaFiltroStatus(item, statusFiltro) {
  if (!statusFiltro || statusFiltro === 'todos') return true
  if (statusFiltro === 'fora_raio') {
    return foraDoRaioCheckin(item?.distanciaMetros) || Boolean(String(item?.justificativaDistancia || '').trim())
  }
  if (statusFiltro === 'concluido') return true
  return false
}

/** Recalcula progresso da equipe com paradas filtradas por setor/status. */
export function filtrarProgressoTorre(progresso = [], { statusFiltro, setorFiltro, igById, checkInsByIgreja }) {
  const map = igById instanceof Map ? igById : new Map()
  return progresso.map(p => {
    const igrejas = (p.igrejas || []).filter(par => {
      const ig = map.get(String(par.igrejaId))
      if (!igrejaPassaFiltroSetor(ig, setorFiltro)) return false
      return paradaPassaFiltroStatus(par, statusFiltro, checkInsByIgreja)
    })
    const total = igrejas.length
    const concluidas = igrejas.filter(x => x.status === STATUS_PARADA.CONCLUIDO).length
    const emTransito = igrejas.filter(x => x.status === STATUS_PARADA.EM_TRANSITO).length
    return {
      ...p,
      igrejas,
      total,
      concluidas,
      emTransito,
      pendentes: Math.max(0, total - concluidas - emTransito),
    }
  })
}

export function filtrarCheckInsTorre(checkIns = [], { statusFiltro, setorFiltro, igById }) {
  const map = igById instanceof Map ? igById : new Map()
  return checkIns.filter(item => {
    const ig = map.get(String(item.igrejaId))
    if (!igrejaPassaFiltroSetor(ig, setorFiltro)) return false
    return checkInPassaFiltroStatus(item, statusFiltro)
  })
}

export function torreFiltrosAtivos({ dataFiltro, hoje, statusFiltro, setorFiltro }) {
  return dataFiltro !== hoje || statusFiltro !== 'todos' || setorFiltro !== 'todos'
}

export function formatarDataBadgeBR(ymd) {
  const s = String(ymd || '').trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return s
  return `${m[3]}/${m[2]}/${m[1]}`
}
