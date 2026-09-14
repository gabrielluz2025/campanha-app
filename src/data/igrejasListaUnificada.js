import { IGREJAS_LISTA_BNU } from './igrejasListaBnu'
import { IGREJAS_LISTA_XANDA } from './igrejasListaXanda'
import { IGREJAS_LISTA_ADBLU } from './igrejasListaAdblu'
import { unificarListasIgrejas } from '../utils/igrejasListaMerge'
import { enriquecerComAdblu, eAssembleiaDeDeus } from '../utils/igrejasAdbluNome'

const COM_FONTE = [
  ...IGREJAS_LISTA_BNU.map(i => ({ ...i, fonteLista: i.fonteLista || 'bnu' })),
  ...IGREJAS_LISTA_XANDA,
  ...IGREJAS_LISTA_ADBLU,
].map(enriquecerComAdblu)

/** BNU + levantamento Xanda + congregações oficiais ADBLU (sem duplicar). */
export const IGREJAS_LISTA_UNIFICADA = unificarListasIgrejas(COM_FONTE).map((item) => {
  if (item.nomeAdblu && eAssembleiaDeDeus(item.nome, item.denominacao)) {
    return { ...item, nome: item.nomeAdblu, congregacao: item.congregacao || item.nomeAdblu.replace(/^Assembleia de Deus ADBLU\s*/i, '') }
  }
  return item
})

export const TOTAL_LISTA_UNIFICADA = IGREJAS_LISTA_UNIFICADA.length

export const RESUMO_LISTAS = {
  bnu: IGREJAS_LISTA_BNU.length,
  xanda: IGREJAS_LISTA_XANDA.length,
  adblu: IGREJAS_LISTA_ADBLU.length,
  unificada: TOTAL_LISTA_UNIFICADA,
}
