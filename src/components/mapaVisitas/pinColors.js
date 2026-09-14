import { DENOMINACAO_PADRAO, COR_DENOMINACAO, COR_PIN_OUTRAS, COR_PIN_OUTRAS_MAP, SETORES } from '../../constants/igrejasTheme'
import { eIgrejaAdblu } from '../../utils/igrejasAdbluNome'

export function corPinIgreja(ig) {
  if (!ig) return '#6b7c99'
  if (ig.visitado) return '#d4af5f'
  if (eIgrejaAdblu(ig)) return SETORES[ig.setor] || COR_DENOMINACAO[DENOMINACAO_PADRAO] || '#2563eb'
  return COR_PIN_OUTRAS_MAP[ig.denominacao] || COR_PIN_OUTRAS
}
