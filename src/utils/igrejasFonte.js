/** Mapa de visitas usa só o cadastro manual — sem catálogo fixo AD + externas. */
export const MAPA_VISITAS_SO_CUSTOM = true

/** Mapa começa vazio: só igrejas cadastradas manualmente pelo usuário. */
export const IGREJAS_MAPA_SOMENTE_MANUAL = true

/** Busca Google/OSM de igrejas desativada na interface. */
export const BUSCA_IGREJAS_DESATIVADA = true

/** Cadastro do usuário (importação/planilha/de-para ADBLU — não busca Google/OSM automática). */
export function eIgrejaCadastroManual(ig) {
  if (!ig) return false
  const fonte = String(ig.fonte || '').toLowerCase()
  if (fonte === 'manual' || fonte === 'cadastro') return true
  if (fonte === 'adblu' || ig.adbluOficial) return true
  if (fonte === 'lista-papel' || fonte === 'planilha' || fonte === 'import') return true
  if (ig.manter || ig.triagemOk) return true
  return false
}

/** Subir este número força uma limpeza única do cadastro antigo em todos os aparelhos. */
export const IGREJAS_MAPA_GERACAO = 5
export const IGREJAS_MAPA_GERACAO_ACK_KEY = 'igrejas_mapa_geracao_ack'

/** Marca zerar cadastro manual — nuvem vazia vence aparelhos com dados antigos. */
export const IGREJAS_CADASTRO_LIMPO_EM_KEY = 'igrejas_cadastro_limpo_em'

/** Cidades exibidas no Mapa de Visitas e Montar Rotas (região ADBLU). */
export const CIDADES_IGREJAS_MAPA = ['Blumenau', 'Gaspar', 'Indaial']
