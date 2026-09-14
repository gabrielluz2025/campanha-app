/**
 * Cadastro do mapa = 88 congregações adblu.org/congregacoes/print.
 * Casa por ENDEREÇO (não por nome solto), migra visitas, descarta o resto.
 */

import { IGREJAS_LISTA_ADBLU, TOTAL_LISTA_ADBLU } from '../data/igrejasListaAdblu'
import {
  formatarNomeAdblu,
  enderecosCorrespondemAdblu,
  igrejaCorrespondeAdblu,
} from './igrejasAdbluNome'
import { eFichaIrrelevanteCampanha } from './igrejaCrista'
import { chaveEnderecoIgreja } from './igrejaMatch'
import { gerarIdIgrejaCustom } from './igrejaCustomId'
import {
  readIgrejasCustom,
  resolverBaseCatalogoAdblu,
  invalidateIgrejasCatalogCache,
} from './igrejasCatalog'
import { readStorage, writeStorage, persistLocalOnly } from './persist'
import { removerIgrejasDeTodasRotas } from './rotaUtils'
import {
  normalizarRegistroVisita,
  mergeHistoricoEntries,
  compactRegistroForStorage,
} from './igrejasVisitasCore'

export const IGREJAS_PURIFICAR_ADBLU_ACK_KEY = 'igrejas_purificar_adblu_v2'
export const IGREJAS_CATALOGO_ADBLU_VERSAO_KEY = 'igrejas_catalogo_adblu_v'
export const IGREJAS_CATALOGO_ADBLU_VERSAO = 2

function limparChavesIgrejas(obj, ids) {
  const next = { ...(obj && typeof obj === 'object' ? obj : {}) }
  for (const id of ids) {
    delete next[id]
    delete next[String(id)]
  }
  return next
}

function enderecoIgreja(ig, enrich = {}) {
  const en = enrich[ig?.id] || enrich[String(ig?.id)] || {}
  return String(ig?.endereco || en.endereco || '').trim()
}

function mesclarVisitasArmazenadas(visitas, fromId, toId) {
  if (fromId == null || toId == null || String(fromId) === String(toId)) return
  const from = visitas[fromId] ?? visitas[String(fromId)]
  if (!from) return
  const to = visitas[toId] ?? visitas[String(toId)]
  const na = normalizarRegistroVisita(from)
  const nb = normalizarRegistroVisita(to)
  const historico = mergeHistoricoEntries(na?.historico || [], nb?.historico || [])
  if (!historico.length) {
    delete visitas[fromId]
    delete visitas[String(fromId)]
    return
  }
  const raw = nb?.pendente ? { historico, pendente: true } : { historico }
  const stored = compactRegistroForStorage(normalizarRegistroVisita(raw))
  if (stored) {
    visitas[toId] = stored
    visitas[String(toId)] = stored
  }
  delete visitas[fromId]
  delete visitas[String(fromId)]
}

function scoreKeeper(ig, enrich) {
  const en = enrich[ig.id] || enrich[String(ig.id)] || {}
  let s = 0
  if (ig.adbluOficial) s += 20
  if (String(ig.fonte || '').toLowerCase() === 'adblu') s += 10
  if (enderecoIgreja(ig, enrich).length > 15) s += 5
  if (ig.pastor1 || ig.telefone) s += 3
  if (ig.lat != null) s += 2
  if (eFichaIrrelevanteCampanha(ig, en.endereco)) s -= 50
  return s
}

function fichaOficialFromItem(item, keeper, base) {
  const nomeOficial = formatarNomeAdblu(item.congregacao)
  const endOficial = String(item.endereco || '').trim().replace(/,\s*$/, '')
  const setor = String(item.bairro || item.congregacao || '—').trim() || '—'
  const id = keeper?.id ?? base?.id ?? gerarIdIgrejaCustom()
  return {
    ...(keeper || {}),
    id,
    nome: nomeOficial,
    endereco: endOficial,
    setor,
    setorNum: item.setorNum || keeper?.setorNum || '',
    regiao: item.regiao || keeper?.regiao || '',
    denominacao: 'Assembleia de Deus',
    culto: item.culto || keeper?.culto || '',
    fonte: 'adblu',
    adbluOficial: true,
    congregacaoAdblu: item.congregacao,
    triagemOk: true,
    foto: keeper?.foto || base?.foto || '/fotos/sem-foto.jpg',
    pastor1: keeper?.pastor1 || base?.pastor1 || '',
    pastor2: keeper?.pastor2 || base?.pastor2 || '',
    esposa1: keeper?.esposa1 || base?.esposa1 || '',
    esposa2: keeper?.esposa2 || base?.esposa2 || '',
    telefone: keeper?.telefone || '',
    whatsapp: keeper?.whatsapp || '',
    lat: base?.lat ?? keeper?.lat ?? null,
    lng: base?.lng ?? keeper?.lng ?? null,
    atualizadoEm: new Date().toISOString(),
  }
}

/** Rebuild: exatamente uma ficha por congregação oficial (endereço canônico). */
export function reconstruirCadastroOficialAdbluLocal() {
  const antes = readIgrejasCustom().length
  const custom = readIgrejasCustom()
  const enrich0 = readStorage('igrejas_enrich', {})
  let visitas = { ...readStorage('igrejas_visitas', {}) }
  let coords = { ...readStorage('geo_coords_igrejas', {}) }
  let pastores = { ...readStorage('pastores_igrejas', {}) }
  let overrides = { ...readStorage('igrejas_overrides', {}) }
  let notas = { ...readStorage('igrejas_notas', {}) }
  let prioridades = { ...readStorage('igrejas_prioridades', {}) }
  let enrich = { ...enrich0 }

  const usados = new Set()
  const nextCustom = []
  const idsRemovidos = []

  for (const item of IGREJAS_LISTA_ADBLU) {
    const base = resolverBaseCatalogoAdblu(item)
    const candidatos = custom.filter((ig) => {
      if (usados.has(String(ig.id))) return false
      if (eFichaIrrelevanteCampanha(ig, enderecoIgreja(ig, enrich))) return false
      return igrejaCorrespondeAdblu(ig, item)
    })

    candidatos.sort((a, b) => scoreKeeper(b, enrich) - scoreKeeper(a, enrich))
    const keeper = candidatos[0] || null
    const ficha = fichaOficialFromItem(item, keeper, base)
    const keeperId = ficha.id

    for (const c of candidatos) {
      usados.add(String(c.id))
      if (String(c.id) !== String(keeperId)) {
        mesclarVisitasArmazenadas(visitas, c.id, keeperId)
      }
    }

    if (base?.lat != null && base?.lng != null) {
      coords[keeperId] = {
        ...(coords[keeperId] || {}),
        lat: base.lat,
        lng: base.lng,
        _adbluGeo: true,
      }
      coords[String(keeperId)] = coords[keeperId]
    } else if (keeper && coords[keeper.id]) {
      const co = coords[keeper.id] || coords[String(keeper.id)]
      coords[keeperId] = co
      coords[String(keeperId)] = co
    }

    nextCustom.push(ficha)
  }

  for (const ig of custom) {
    if (!usados.has(String(ig.id))) {
      idsRemovidos.push(String(ig.id))
    }
  }

  enrich = limparChavesIgrejas(enrich, idsRemovidos)
  coords = limparChavesIgrejas(coords, idsRemovidos)
  pastores = limparChavesIgrejas(pastores, idsRemovidos)
  overrides = limparChavesIgrejas(overrides, idsRemovidos)
  visitas = limparChavesIgrejas(visitas, idsRemovidos)
  notas = limparChavesIgrejas(notas, idsRemovidos)
  prioridades = limparChavesIgrejas(prioridades, idsRemovidos)

  if (idsRemovidos.length) removerIgrejasDeTodasRotas(idsRemovidos)

  writeStorage('igrejas_custom', nextCustom, { force: true })
  writeStorage('igrejas_enrich', enrich, { force: true })
  writeStorage('geo_coords_igrejas', coords, { force: true })
  writeStorage('pastores_igrejas', pastores, { force: true })
  writeStorage('igrejas_overrides', overrides, { force: true })
  writeStorage('igrejas_visitas', visitas, { force: true })
  writeStorage('igrejas_notas', notas, { force: true })
  writeStorage('igrejas_prioridades', prioridades, { force: true })

  persistLocalOnly(IGREJAS_CATALOGO_ADBLU_VERSAO_KEY, IGREJAS_CATALOGO_ADBLU_VERSAO)
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(IGREJAS_PURIFICAR_ADBLU_ACK_KEY, '2')
    }
  } catch { /* ignore */ }

  invalidateIgrejasCatalogCache()

  return {
    antes,
    depois: nextCustom.length,
    removidas: idsRemovidos.length,
    totalOficial: TOTAL_LISTA_ADBLU,
    mudou: antes !== nextCustom.length || idsRemovidos.length > 0,
  }
}

/** @deprecated alias */
export function purificarCadastroAdbluLocal(opts = {}) {
  if (opts.somenteOficial === false) {
    return reconstruirCadastroOficialAdbluLocal()
  }
  return reconstruirCadastroOficialAdbluLocal()
}

export function catalogoLocalMarcadoAdbluOficial() {
  try {
    if (typeof window === 'undefined') return false
    return Number(localStorage.getItem(IGREJAS_CATALOGO_ADBLU_VERSAO_KEY) || '0') >= IGREJAS_CATALOGO_ADBLU_VERSAO
  } catch {
    return false
  }
}

export function purificarCadastroAdbluSePreciso(opts = {}) {
  if (typeof window === 'undefined') return { skipped: true }
  const n = readIgrejasCustom().length
  const ack = (() => {
    try { return localStorage.getItem(IGREJAS_PURIFICAR_ADBLU_ACK_KEY) } catch { return '' }
  })()

  if (!opts.force && ack === '2' && n <= TOTAL_LISTA_ADBLU + 5) {
    return { skipped: true, total: n }
  }
  if (!opts.force && n < TOTAL_LISTA_ADBLU + 10) {
    return { skipped: true, motivo: 'cadastro-pequeno', total: n }
  }

  return { ...reconstruirCadastroOficialAdbluLocal(), auto: true }
}

export function igrejaNaListaOficialAdblu(ig, enrich = {}) {
  if (!ig?.adbluOficial) return false
  const end = enderecoIgreja(ig, enrich)
  if (!end) return false
  const ch = chaveEnderecoIgreja(end)
  if (!ch) return false
  for (const item of IGREJAS_LISTA_ADBLU) {
    if (enderecosCorrespondemAdblu(end, item.endereco)) return true
  }
  return false
}
