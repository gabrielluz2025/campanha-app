/** Flags de limpeza de Materiais — sem dependências de sync/persist. */

export const MATERIAIS_LIMPO_EM_KEY = 'materiais_limpo_em'
export const MATERIAIS_HISTORICO_LIMPO_EM_KEY = 'materiais_historico_limpo_em'

/** Chaves de histórico (entradas, saídas, retiradas). */
export const MATERIAIS_HISTORICO_STORE_KEYS = [
  'materiais_entradas',
  'materiais_distribuicao',
  'materiais_retiradas',
  'materiais_distribuicao_removidos',
  'materiais_retiradas_removidos',
]

function parseTs(raw) {
  if (raw == null || raw === '') return 0
  try {
    const n = Number(typeof raw === 'string' ? raw.replace(/"/g, '') : raw)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

function tsFromMap(map, key) {
  if (!map || map[key] == null) return 0
  return parseTs(map[key])
}

export function getMateriaisLimpoEm() {
  if (typeof window === 'undefined') return 0
  try {
    return parseTs(window.localStorage.getItem(MATERIAIS_LIMPO_EM_KEY))
  } catch {
    return 0
  }
}

export function getMateriaisHistoricoLimpoEm() {
  if (typeof window === 'undefined') return 0
  try {
    return parseTs(window.localStorage.getItem(MATERIAIS_HISTORICO_LIMPO_EM_KEY))
  } catch {
    return 0
  }
}

function parseArray(raw) {
  if (raw == null || raw === '') return []
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function readLocalArray(key) {
  if (typeof window === 'undefined') return []
  return parseArray(window.localStorage.getItem(key))
}

/** Há estoque ou histórico ativo — flag de “limpar tudo” não deve bloquear a tela. */
export function materiaisTemDadosAtivos(localMap = null, serverMap = null) {
  const keys = ['materiais_estoque', 'materiais_entradas', 'materiais_distribuicao']
  for (const key of keys) {
    if (readLocalArray(key).length > 0) return true
    if (localMap && parseArray(localMap[key]).length > 0) return true
    if (serverMap && parseArray(serverMap[key]).length > 0) return true
  }
  return false
}

export function usuarioOptouPorMateriaisVazio() {
  if (getMateriaisLimpoEm() <= 0) return false
  return !materiaisTemDadosAtivos()
}

/** Maior timestamp entre local e mapa do servidor (sync). */
export function materiaisLimpoEmEfetivo(localMap = null, serverMap = null) {
  return Math.max(getMateriaisLimpoEm(), tsFromMap(localMap, MATERIAIS_LIMPO_EM_KEY), tsFromMap(serverMap, MATERIAIS_LIMPO_EM_KEY))
}

/** Limpeza só do histórico — entradas/saídas/retiradas. */
export function materiaisHistoricoLimpoEmEfetivo(localMap = null, serverMap = null) {
  return Math.max(
    getMateriaisHistoricoLimpoEm(),
    tsFromMap(localMap, MATERIAIS_HISTORICO_LIMPO_EM_KEY),
    tsFromMap(serverMap, MATERIAIS_HISTORICO_LIMPO_EM_KEY),
  )
}

export function isMateriaisHistoricoStoreKey(key) {
  return MATERIAIS_HISTORICO_STORE_KEYS.includes(String(key || ''))
}

/** Timestamp efetivo da limpeza que vale para esta chave. */
export function materiaisClearTsEfetivo(key, localMap = null, serverMap = null) {
  const total = materiaisLimpoEmEfetivo(localMap, serverMap)
  if (!isMateriaisHistoricoStoreKey(key)) return total
  return Math.max(total, materiaisHistoricoLimpoEmEfetivo(localMap, serverMap))
}

/**
 * Limpeza só vence se o dado local é mais antigo que a limpeza.
 * Import/cadastro com localAt > limpoEm nunca é apagado pelo merge.
 */
export function materiaisLimpoVenceSobreLocal(localAt, key, localMap = null, serverMap = null) {
  const limpoEm = materiaisClearTsEfetivo(key, localMap, serverMap)
  if (limpoEm <= 0) return false
  return (Number(localAt) || 0) <= limpoEm
}
