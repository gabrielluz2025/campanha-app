import { bairrosFiltroOpcoes } from './blumenauLimit'
import { parseCulto } from './cultoParse'
import { igrejaSemPinMapa } from './igrejasGeocodeFix'
import { igrejaCorrespondeBairroFiltro } from './igrejaMatch'

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

const DIA_FILTRO_MAP = {
  Dom: 'dom', Seg: 'seg', Ter: 'ter', Qua: 'qua', Qui: 'qui', Sex: 'sex', Sáb: 'sab', Sab: 'sab',
}

export function filterChurches(list, filters = {}) {
  const {
    busca = '',
    filtroVisita = 'todas',
    filtroDenom = 'todas',
    filtroBairro = '',
    filtroDiaCulto = 'Todos',
    semGps = false,
  } = filters

  const q = norm(busca)
  const diaId = DIA_FILTRO_MAP[filtroDiaCulto] || null

  return (Array.isArray(list) ? list : []).filter(ig => {
    if (filtroVisita === 'visitadas' && !ig.visitado) return false
    if (filtroVisita === 'pendentes' && ig.visitado) return false

    if (filtroDenom === 'ad') {
      const d = norm(ig.denominacao)
      if (!d.includes('assembleia') && d !== 'ad') return false
    }
    if (filtroDenom === 'outras') {
      const d = norm(ig.denominacao)
      if (d.includes('assembleia') || d === 'ad') return false
    }

    if (filtroBairro && filtroBairro !== 'Todos') {
      if (!igrejaCorrespondeBairroFiltro(ig, filtroBairro)) return false
    }

    if (semGps && !igrejaSemPinMapa(ig)) return false

    if (diaId && filtroDiaCulto !== 'Todos') {
      const slots = parseCulto(ig.culto)
      if (!slots.some(s => s.dia === diaId)) return false
    }

    if (!q) return true
    const blob = [ig.nome, ig.setor, ig.bairro, ig.endereco, ig.pastor1, ig.pastor2, ig.denominacao].join(' ')
    return norm(blob).includes(q)
  })
}

/** Lista fixa dos 35 bairros oficiais (ignora setores AD no cadastro). */
export function bairrosFromChurches(_list) {
  return bairrosFiltroOpcoes()
}
