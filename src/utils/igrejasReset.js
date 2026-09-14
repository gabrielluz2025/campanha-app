import { persistLocalOnly, writeStorage } from './persist'
import {
  IGREJAS_MAPA_GERACAO,
  IGREJAS_MAPA_GERACAO_ACK_KEY,
  IGREJAS_MAPA_SOMENTE_MANUAL,
  IGREJAS_CADASTRO_LIMPO_EM_KEY,
} from './igrejasFonte'
import { pararBuscaIgrejasJob } from './igrejasBuscaJob'
import { markSyncPaused } from './syncUiGate'

const CHAVES_CACHE_LOCAL = [
  'igrejas_google_places_cache',
  'igrejas_overpass_cache',
  'igrejas_google_details_cache',
]

const CHAVES_CADASTRO_ZERAR = [
  'igrejas_custom',
  'igrejas_enrich',
  'geo_coords_igrejas',
  'igrejas_overrides',
  'igrejas_ocultas',
  'igrejas_visitas',
  'pastores_igrejas',
  'igrejas_notas',
  'igrejas_prioridades',
]

const CATALOG_VAZIO_SERVIDOR = {
  custom: [],
  enrich: {},
  coords: {},
  pastores: {},
  overrides: {},
  ocultas: [],
  replace: [
    'igrejas_custom', 'igrejas_enrich', 'geo_coords_igrejas',
    'pastores_igrejas', 'igrejas_overrides', 'igrejas_ocultas',
  ],
}

function limparCadastroIgrejasCompleto() {
  for (const key of CHAVES_CADASTRO_ZERAR) {
    if (key === 'igrejas_custom' || key === 'igrejas_ocultas') {
      writeStorage(key, [])
    } else {
      writeStorage(key, {})
    }
  }
  return CHAVES_CADASTRO_ZERAR.length
}

/** Envia cadastro vazio ao MySQL e zera visitas na nuvem (evita sync trazer visitas antigas). */
async function pushCatalogoVazioServidor() {
  if (typeof window === 'undefined') return { ok: false }
  const ts = Date.now()
  try {
    const { pushChurchCatalogToServer, phpReplaceStoreKeys } = await import('../lib/cloudSync')
    const { flushAfterSave, saveToCloud } = await import('./persist')
    writeStorage('igrejas_visitas', {}, { force: true })
    writeStorage('igrejas_ocultas', [], { force: true })
    writeStorage(IGREJAS_CADASTRO_LIMPO_EM_KEY, ts, { force: true })
    await phpReplaceStoreKeys(
      [
        ['igrejas_visitas', '{}'],
        [IGREJAS_CADASTRO_LIMPO_EM_KEY, String(ts)],
      ],
      ['igrejas_visitas', IGREJAS_CADASTRO_LIMPO_EM_KEY],
    )
    await saveToCloud({
      igrejas_visitas: {},
      [IGREJAS_CADASTRO_LIMPO_EM_KEY]: ts,
    })
    await flushAfterSave()
    let nuvem = null
    for (let tent = 0; tent < 3; tent++) {
      nuvem = await pushChurchCatalogToServer(CATALOG_VAZIO_SERVIDOR)
      if (nuvem?.ok) break
      await new Promise(r => setTimeout(r, 800 * (tent + 1)))
    }
    return { ok: Boolean(nuvem?.ok), ts, error: nuvem?.error || '' }
  } catch (e) {
    return { ok: false, error: e?.message || 'Erro ao gravar na nuvem' }
  }
}

/** Zera todas as marcações de visita (local + nuvem). Rotas não marcam visita sozinhas. */
export { limparTodasVisitasIgrejas } from './igrejasVisitas'

/**
 * Uma vez por geração: zera todo o cadastro de igrejas, limpa cache Google/OSM e para buscas em andamento.
 */
export function resetIgrejasMapaSePreciso() {
  let ack = 0
  try { ack = Number(JSON.parse(localStorage.getItem(IGREJAS_MAPA_GERACAO_ACK_KEY) || '0')) || 0 } catch { ack = 0 }
  if (ack >= IGREJAS_MAPA_GERACAO) return false

  try { pararBuscaIgrejasJob() } catch { /* ignore */ }

  for (const key of CHAVES_CACHE_LOCAL) {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
  }
  try { persistLocalOnly('igrejas_google_auto_novas', '0') } catch { /* ignore */ }

  if (IGREJAS_MAPA_SOMENTE_MANUAL) {
    limparCadastroIgrejasCompleto()
    pushCatalogoVazioServidor()
    try { window.dispatchEvent(new CustomEvent('campanha:igrejas-atualizadas')) } catch { /* ignore */ }
  }

  persistLocalOnly(IGREJAS_MAPA_GERACAO_ACK_KEY, IGREJAS_MAPA_GERACAO)
  return true
}

/** Limpeza manual (Mapa de Visitas ou suporte). */
export async function zerarCadastroIgrejasManualmente() {
  try { pararBuscaIgrejasJob() } catch { /* ignore */ }

  for (const key of CHAVES_CACHE_LOCAL) {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
  }

  const { cancelChurchCatalogPush, applyCadastroLimpoEmLocal } = await import('../lib/cloudSync')

  if (typeof window !== 'undefined') window.__campanhaIgrejasClearing = true
  markSyncPaused(30000)
  cancelChurchCatalogPush()

  const ts = Date.now()
  applyCadastroLimpoEmLocal(ts)

  try {
    limparCadastroIgrejasCompleto()
    persistLocalOnly(IGREJAS_MAPA_GERACAO_ACK_KEY, IGREJAS_MAPA_GERACAO)
    const nuvem = await pushCatalogoVazioServidor()
    try { window.dispatchEvent(new CustomEvent('campanha:igrejas-atualizadas')) } catch { /* ignore */ }
    return { ok: true, nuvemOk: Boolean(nuvem?.ok), nuvemError: nuvem?.error || '' }
  } finally {
    if (typeof window !== 'undefined') window.__campanhaIgrejasClearing = false
  }
}
