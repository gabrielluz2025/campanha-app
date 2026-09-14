/** Catálogo de abas liberáveis no acesso da equipe / candidatos */
import { filtrarTabsModulosCampo } from '../constants/campanhaModulos'

const ABAS_ACESSO_RAW = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'previsao', label: 'Previsão de Gasto' },
  { id: 'tesouraria', label: 'Tesouraria' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'equipe', label: 'Equipe' },
  { id: 'campovisitas', label: 'Visitas de Campo' },
  { id: 'contratos', label: 'Contratos' },
  { id: 'eleitores', label: 'Eleitores' },
  { id: 'mapa', label: 'Mapa de Visitas' },
  { id: 'rotas', label: 'Montar Rotas' },
  { id: 'mapaeleitoral', label: 'Mapa Eleitoral' },
  { id: 'mapasc', label: 'Análise SC' },
  { id: 'pesquisas', label: 'Pesquisa de Rua' },
  { id: 'materiais', label: 'Materiais' },
  { id: 'apoiadores', label: 'Apoiadores' },
  { id: 'empresas', label: 'Empresas' },
  { id: 'relatorio', label: 'Relatório' },
  { id: 'configuracoes', label: 'Configurações' },
]

export const ABAS_ACESSO = filtrarTabsModulosCampo(ABAS_ACESSO_RAW)

export const ABAS_ACESSO_IDS = ABAS_ACESSO.map(a => a.id)

/** Abas / módulos onde valores em R$ aparecem (além da aba Previsão) */
export const ABAS_COM_FINANCEIRO = ['previsao', 'tesouraria', 'equipe', 'empresas', 'dashboard', 'relatorio']

export const MSG_FINANCEIRO =
  'Dados financeiros aparecem em várias áreas: Previsão de Gasto, Tesouraria (caixa), Equipe (salários e pagamentos), Empresas (valores de contrato), Dashboard e Relatórios. Liberar visualização financeira para esta pessoa?'

/** Relatórios do hub que expõem valores monetários */
export const RELATORIOS_FINANCEIROS = ['contratos', 'empresas', 'previsao', 'cargos-gastos']

/** Pacote sugerido ao liberar ferramenta para outro candidato */
export const ABAS_PADRAO_CANDIDATO = ABAS_ACESSO_IDS.filter(id => id !== 'configuracoes')

/** null/undefined = todas; array = só as listadas */
export function parseAllowedTabs(raw) {
  if (raw == null || raw === '') return null
  if (Array.isArray(raw)) {
    const set = new Set(ABAS_ACESSO_IDS)
    return raw.map(String).filter(id => set.has(id))
  }
  if (typeof raw === 'string') {
    try {
      return parseAllowedTabs(JSON.parse(raw))
    } catch {
      return null
    }
  }
  return null
}

/**
 * Financeiro:
 * - dono sem restrição de abas → sempre true
 * - demais → usa o flag gravado (legado vazio = true)
 */
export function parseCanViewFinance(raw, role, allowedTabs = undefined) {
  if (role === 'owner' && (allowedTabs === undefined || allowedTabs == null)) return true
  if (raw == null || raw === '') return true // legado
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw !== 0
  const s = String(raw).toLowerCase().trim()
  if (['0', 'false', 'no', 'nao', 'não', 'off'].includes(s)) return false
  if (['1', 'true', 'yes', 'sim', 'on'].includes(s)) return true
  return true
}

/** Dono sem lista = tudo; se allowedTabs é array, mesmo dono fica limitado. */
export function memberSeesAllTabs(role, allowedTabs) {
  if (allowedTabs != null) return false
  return role === 'owner' || allowedTabs == null
}

/** Pode ver a sub-aba Contratos (independente do financeiro). */
export function canAccessContratos({ role, allowedTabs, canViewFinance } = {}) {
  if (memberSeesAllTabs(role, allowedTabs)) return true
  if (allowedTabs == null) return !!canViewFinance
  if (allowedTabs.includes('contratos')) return true
  if (canViewFinance && allowedTabs.includes('equipe')) return true
  return false
}

/** Liberou só Contratos (sem Equipe completa). */
export function isSomenteContratos({ role, allowedTabs } = {}) {
  if (memberSeesAllTabs(role, allowedTabs)) return false
  if (allowedTabs == null) return false
  return allowedTabs.includes('contratos') && !allowedTabs.includes('equipe')
}

export function filterTabsByAccess(allTabs, { role, allowedTabs, canViewFinance } = {}) {
  let list = allTabs
  if (!memberSeesAllTabs(role, allowedTabs)) {
    const set = new Set(allowedTabs || [])
    list = allTabs.filter(t => set.has(t.id))
    // Contratos é sub-aba de Equipe: se liberou só Contratos, mostra Equipe no menu
    if (set.has('contratos') && !set.has('equipe') && !list.some(t => t.id === 'equipe')) {
      const equipeTab = allTabs.find(t => t.id === 'equipe')
      if (equipeTab) list = [...list, equipeTab]
    }
  }
  // Sem permissão financeira: esconde abas 100% financeiras
  if (canViewFinance === false) {
    list = list.filter(t => t.id !== 'previsao' && t.id !== 'tesouraria')
  }
  return list
}

export function tabsNeedFinancePrompt(selectedTabs) {
  return (selectedTabs || []).some(id => ABAS_COM_FINANCEIRO.includes(id))
}

/** Se marcou todas as abas, grava null (= acesso total). */
export function compactAllowedTabs(selected) {
  const list = parseAllowedTabs(selected)
  if (list == null) return null
  if (list.length === 0) return []
  if (list.length >= ABAS_ACESSO_IDS.length) return null
  return list
}
