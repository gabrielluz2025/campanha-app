/**
 * Módulos de campo (igrejas/rotas) — desligados para reconstrução do zero.
 * Código legado permanece no repo; reative quando o novo fluxo estiver pronto.
 */
export const MODULO_MAPA_VISITAS_ATIVO = false
export const MODULO_MONTAR_ROTAS_ATIVO = false
/** Nova experiência de campo (check-in GPS + foto). */
export const MODULO_CAMPO_VISITAS_ATIVO = true

export const TAB_IDS_MODULOS_DESATIVADOS = [
  ...(MODULO_MAPA_VISITAS_ATIVO ? [] : ['mapa']),
  ...(MODULO_MONTAR_ROTAS_ATIVO ? [] : ['rotas']),
]

export function abaModuloCampoAtiva(tabId) {
  if (tabId === 'mapa') return MODULO_MAPA_VISITAS_ATIVO
  if (tabId === 'rotas') return MODULO_MONTAR_ROTAS_ATIVO
  return true
}

export function filtrarTabsModulosCampo(tabs = []) {
  const off = new Set(TAB_IDS_MODULOS_DESATIVADOS)
  return tabs.filter(t => !off.has(t.id))
}
