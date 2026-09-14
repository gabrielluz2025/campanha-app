import { filterChurches } from './churchVisitFilters'
import { eIgrejaAdblu } from './igrejasAdbluNome'
import { igrejaCorrespondeBairroFiltro } from './igrejaMatch'
import { temCultoFiltro } from './cultoParse'

const OUTRAS_DENOM = '— Outras Denominações'

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Filtro unificado para Montar Rotas (compatível com Mapa de Visitas + extras de rota).
 */
export function filterChurchesForRota(list, filters = {}) {
  const {
    busca = '',
    filtroVisita = 'todas',
    filtroDenom = 'todas',
    filtroBairro = 'Todos',
    filtroSetor = 'Todos',
    filtroDiaCulto = 'Todos',
    filtroPeriodoCulto = 'todos',
    filtroSomenteVerificadas = false,
    semGps = false,
    bairrosGeoData = null,
  } = filters

  const base = filterChurches(list, {
    busca,
    filtroVisita,
    filtroDenom,
    filtroBairro: filtroSetor !== 'Todos' && filtroSetor !== OUTRAS_DENOM ? filtroSetor : filtroBairro,
    filtroDiaCulto,
    semGps,
  })

  return base.filter(ig => {
    if (filtroSomenteVerificadas && !eIgrejaAdblu(ig)) return false

    if (filtroSetor === OUTRAS_DENOM && eIgrejaAdblu(ig)) return false

    if (filtroSetor !== 'Todos' && filtroSetor !== OUTRAS_DENOM) {
      if (!igrejaCorrespondeBairroFiltro(ig, filtroSetor, bairrosGeoData)) return false
    }

    if (filtroDiaCulto !== 'Todos' || filtroPeriodoCulto !== 'todos') {
      if (!temCultoFiltro(ig.culto, {
        dia: filtroDiaCulto === 'Todos' ? '' : filtroDiaCulto,
        periodo: filtroPeriodoCulto,
      })) return false
    }

    const q = norm(busca.trim())
    if (!q) return true
    return norm(ig.congregacaoAdblu).includes(q) || norm(ig.culto).includes(q)
  }).sort((a, b) => {
    if (a.visitado !== b.visitado) return a.visitado ? 1 : -1
    return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
  })
}

export { OUTRAS_DENOM }

export const PERIODOS_CULTO = [
  { id: 'todos', label: 'Período — todos' },
  { id: 'manha', label: 'Manhã' },
  { id: 'tarde', label: 'Tarde' },
  { id: 'noite', label: 'Noite' },
]
