import {
  readIgrejasVisitas,
  loadIgrejasHidratadas,
  reloadIgrejasHidratadasAsync,
  IGREJAS_ATUALIZADAS_EVENT,
} from '../../../utils/igrejasCatalog'
import { normalizarRegistroVisita } from '../../../utils/igrejasVisitasCore'
import { igrejaSemPinMapa } from '../../../utils/igrejasGeocodeFix'
import { igrejaCorrespondeBairroFiltro } from '../../../utils/igrejaMatch'
import { bairroBlumenauValido } from '../../../utils/forcaPorBairro'
import { resolveBairroVotacao } from '../../../utils/eleitoresHelpers'

/** Anexa visita ao registro da igreja */
export function hidratarIgrejaComVisita(ig, visitas = readIgrejasVisitas()) {
  const reg = visitas[ig.id] || visitas[String(ig.id)]
  const visita = reg ? normalizarRegistroVisita(reg) : null
  return {
    ...ig,
    visitado: Boolean(visita?.visitado),
    visita: visita || null,
  }
}

export function bairroEleitoralIgreja(ig, setorIgrejaMap = {}) {
  const b = bairroBlumenauValido(ig?.bairro)
  if (b) return b
  return resolveBairroVotacao(
    { setor: ig?.setor, nome: ig?.nome || '' },
    {},
    null,
    null,
    { setorIgrejaMap },
  ) || null
}

export function filtrarIgrejasMapa(list, {
  filtroBairros = [],
  modo = 'todas',
  setorIgrejaMap = {},
} = {}) {
  return (list || []).filter(ig => {
    if (igrejaSemPinMapa(ig)) return false
    if (modo === 'visitadas' && !ig.visitado) return false
    if (modo === 'pendentes' && ig.visitado) return false
    if (filtroBairros.length) {
      const bairro = bairroEleitoralIgreja(ig, setorIgrejaMap)
      if (!bairro || !filtroBairros.includes(bairro)) {
        const match = filtroBairros.some(fb =>
          igrejaCorrespondeBairroFiltro(ig, fb),
        )
        if (!match) return false
      }
    }
    return true
  })
}

export async function carregarIgrejasEleitoral() {
  try {
    const list = await reloadIgrejasHidratadasAsync()
    const visitas = readIgrejasVisitas()
    return (list || []).map(ig => hidratarIgrejaComVisita(ig, visitas))
  } catch {
    const visitas = readIgrejasVisitas()
    return loadIgrejasHidratadas().map(ig => hidratarIgrejaComVisita(ig, visitas))
  }
}

export { IGREJAS_ATUALIZADAS_EVENT }
