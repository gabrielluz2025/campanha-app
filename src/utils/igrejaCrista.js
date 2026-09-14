import { eIgrejaFichaUtil } from './igrejaTriagem'
import { normStr } from './constants'

/** Trechos inequívocos (não usar ESPIRIT: pega "Espírito Santo", que é cristão). */
const BLOQUEIO_TRECHO = [
  'ESPIRITA', 'ESPIRITISMO', 'KARDECISTA', 'KARDECIST',
  'UMBANDA', 'CANDOMBLE', 'QUIMBANDA', 'NAGOA', 'NAGO ',
  'XINTO', 'SHINTO', 'JINJA', 'BUDISMO', 'BUDISTA', 'HINDU',
  'ISLAM', 'MUSULMAN', 'ISLAMICA', 'MESQUITA', 'SINAGOGA', 'JUDAIC', 'HEBRAIC',
  'WICCA', 'ESOTER', 'TERREIRO', 'ILE AXE', 'ILE ASE',
  'ORIXA', 'IEMANJA', 'OXALA', 'POMBAGIRA', 'POMBA GIRA',
  'SEICHO', 'MESSIANIC', 'TENRIKYO', 'HARE KRISHNA', 'KRISHNA',
  'TAOIS', 'SIKH', 'BAHAI', 'CASA DE CARIDADE',
  'SANTUARIO BUD', 'TEMPLO BUD', 'PAGODE', 'MOSQUE', 'SYNAGOGUE',
  'VOODOO', 'VODU', 'SANTERIA', 'VALE DO AMANHECER',
  'SANTO DAIME', ' DAIME', 'MAHIKARI', 'PERFECT LIBERTY',
  'ROSACRUZ', 'TEOSOF', 'CONFUCI',
  'CREMATORIO', 'HEKARA', 'ARVORE SAGRADA', 'AUTOCONHECIMENTO',
  'MORTUARIA', 'MORTUARIO', 'FUNERARIA', 'FUNERARIO', 'JAZIGO', 'CEMITERIO',
  'CAPELA MORT', 'SALA DE VELORIO', 'VELORIO', 'MEMORIAL', 'TANATOPRAXIA',
  'CLUBE DE AVENTUREIROS', 'MONUMENTO 500',
]

/** Palavras curtas: só valem isoladas (evita EXU em "exultar"). */
const BLOQUEIO_PALAVRA = [
  'EXU', 'OGUM', 'OXUM', 'OXOSSI', 'IANSA', 'NANA',
]

/**
 * Prefixos de negócio claramente não-religioso.
 * Só bloqueiam quando o nome NÃO começa com palavra religiosa.
 * Ex: "Mercado Sao Joao" → bloqueado | "Igreja do Comerciante" → permitido
 */
const PREFIXO_NEGOCIO_RE = /^(SUPERMERCADO|MERCADO |MINI MERCADO|MINIMERCADO|MERCEARIA|CONVENIENCIA|ARMAZEM|PADARIA |PANIFICADORA|FARMACIA|DROGARIA|LOJA |BOUTIQUE|SALAO DE |SALAO DO |BARBEARIA|ACADEMIA DE |ACADEMIA DO |RESTAURANTE|LANCHONETE|PIZZARIA|HAMBURGUERIA|CHURRASCARIA|SORVETERIA|ESCOLA |COLEGIO |CLINICA |CONSULTORIO|HOSPITAL |POSTO DE GASOL|AUTO POSTO|BORRACHARIA|OFICINA |IMOBILIARIA|CONSTRUTORA|DEPOSITO DE|LOCADORA|PETSHOP|PET SHOP|TERRENO |LOTE |SITIO |CHACARA |CONDOMINIO |RESIDENCIAL |APART )/

const PREFIXO_RELIGIOSO_RE = /^(IGREJA|IGREJ|TEMPLO|CAPEL|PAROQU|CATEDRAL|ASSEMBLEIA|CONGREGAC|MINISTERIO|COMUNIDADE|MISSAO|MISSOES|SANTUARIO|CENTRO EVANG|CENTRO CRIST|CASA DE ORACAO|CASA DE CULTO)/

const RELIGIAO_OSM_OK = new Set(['', 'CHRISTIAN', 'CHRISTIANITY', 'CATHOLIC', 'PROTESTANT', 'EVANGELICAL'])
const RELIGIAO_OSM_BLOQUEIO = new Set([
  'MUSLIM', 'ISLAM', 'JEWISH', 'BUDDHIST', 'HINDU', 'SIKH', 'SHINTO',
  'TAOIST', 'PAGAN', 'SPIRITIST', 'UMBANDA', 'CANDOMBLE', 'AFRICAN',
  'ANIMIST', 'BAHAI', 'JAIN', 'ZOROASTRIAN',
])

function textoParaFiltro(texto) {
  return normStr(texto)
    .replace(/\bDIVINO ESPIRITO SANTO\b/g, ' ')
    .replace(/\bESPIRITO SANTO\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function textoNaocristao(texto) {
  const n = textoParaFiltro(texto)
  if (!n) return false
  if (BLOQUEIO_TRECHO.some(k => n.includes(normStr(k)))) return true
  const palavras = new Set(n.split(' '))
  return BLOQUEIO_PALAVRA.some(p => palavras.has(normStr(p)))
}

/**
 * true = igreja crista (ou sem indicio contrario).
 * false = espirita, umbanda, xintoismo, isla, negocio nao-religioso, etc.
 */
export function eIgrejaCrista(item = {}) {
  const religion = normStr(item.religion || item.denominationRaw || '')
  if (RELIGIAO_OSM_BLOQUEIO.has(religion) || RELIGIAO_OSM_BLOQUEIO.has(religion.split(' ')[0])) {
    return false
  }
  if (religion && !RELIGIAO_OSM_OK.has(religion) && !religion.includes('CHRIST')) {
    if (RELIGIAO_OSM_BLOQUEIO.has(religion.replace(/_/g, ' '))) return false
  }
  // So nome/religiao — endereco "Rua Alan Kardec" ou bairro "Espirito Santo" nao devem cair.
  const blob = [
    item.nome, item.denominacao, item.religion, item.denominationRaw, item.alt_name,
  ].filter(Boolean).join(' ')
  if (textoNaocristao(blob)) return false

  // Bloqueia negocios claramente nao-religiosos (sem palavra religiosa no nome)
  const nomeNorm = normStr(item.nome || '')
  if (PREFIXO_NEGOCIO_RE.test(nomeNorm) && !PREFIXO_RELIGIOSO_RE.test(nomeNorm)) return false

  return true
}

/** Endereço mínimo para aparecer no mapa (evita pin vazio / POI errado). */
export function eEnderecoIgrejaUtil(ig = {}, enrichEndereco = '') {
  const end = String(ig.endereco || enrichEndereco || '').trim()
  if (end.length < 12) return false
  if (/^[\s\-—,.]+$/i.test(end)) return false
  const temNumero = /\d{1,6}/.test(end) || /\bS\s*\/\s*N\b/i.test(end)
  if (!temNumero) return false
  return true
}

/** Lixo de busca Google/OSM: mortuária, mercado, endereço vazio, etc. */
export function eFichaIrrelevanteCampanha(ig = {}, enrichEndereco = '') {
  if (!eIgrejaCrista(ig)) return true
  if (eEnderecoIgrejaUtil(ig, enrichEndereco)) return false
  if (ig.adbluOficial) return false
  const fonte = String(ig.fonte || '').toLowerCase()
  if (fonte === 'adblu' || fonte === 'lista-papel' || fonte === 'lista-bnu') return false
  if (Number.isFinite(Number(ig.lat)) && Number.isFinite(Number(ig.lng))) {
    const end = String(ig.endereco || enrichEndereco || '').trim()
    if (end.length >= 8) return false
  }
  return true
}

export function filtrarIgrejasCristas(lista = []) {
  return (lista || []).filter(ig => eIgrejaCrista(ig) && eIgrejaFichaUtil(ig))
}

/** Remove do JSON de igrejas_custom as que nao sao cristas ou estao em branco. */
export function sanitizarIgrejasCustomJson(str) {
  try {
    const raw = typeof str === 'string' ? JSON.parse(str) : str
    if (!Array.isArray(raw)) return typeof str === 'string' ? str : JSON.stringify(str ?? [])
    return JSON.stringify(raw.filter(ig => {
      if (eFichaIrrelevanteCampanha(ig)) return false
      if (!eIgrejaCrista(ig)) return false
      const fonte = String(ig.fonte || '').toLowerCase()
      if (ig.triagemOk || ig.manter || fonte === 'google' || fonte === 'manual' || fonte === 'cadastro') {
        return eEnderecoIgrejaUtil(ig) || ig.adbluOficial || fonte === 'adblu'
      }
      return eIgrejaFichaUtil(ig)
    }))
  } catch {
    return typeof str === 'string' ? str : '[]'
  }
}

/** Tira do cadastro salvo (igrejas_custom) as que nao prestam. */
export function purgarIgrejasNaocristasSalvas() {
  try {
    const raw = JSON.parse(localStorage.getItem('igrejas_custom') || '[]')
    if (!Array.isArray(raw) || !raw.length) return 0
    const next = raw.filter(ig => {
      if (!eIgrejaCrista(ig)) return false
      const fonte = String(ig.fonte || '').toLowerCase()
      if (ig.triagemOk || ig.manter || fonte === 'manual' || fonte === 'cadastro') return true
      return eIgrejaFichaUtil(ig)
    })
    const removidas = raw.length - next.length
    if (removidas > 0) {
      localStorage.setItem('igrejas_custom', JSON.stringify(next))
    }
    return removidas
  } catch {
    return 0
  }
}
