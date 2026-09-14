import { haversineKm } from './rotaUtils'
import coordsAdblu from '../data/igrejasCoordsAdblu.json'
import enderecosValidados from '../data/igrejasEnderecosValidados.json'
import { bairroCanon } from './bairroMapa'
import {
  chaveEnderecoIgreja,
  extrairLogradouro,
  extrairNumeroEndereco,
  nomesParecidosIgreja,
  ruaCompativel,
  ruasConflitam,
} from './igrejaMatch'
import {
  eProvavelAdblu,
  eIgrejaAdblu,
  extrairCongregacaoDoNome,
} from './igrejasAdbluNome'
import { IGREJAS_LISTA_ADBLU } from '../data/igrejasListaAdblu.js'
import {
  coordsVerificadosParaEndereco, refEnderecoIgreja, igrejaTemCoordenadaMapa,
} from './igrejasGeocodeFix'

export const MAX_ID_CATALOGO = 1999

const FONTES_GPS_CONFIAVEL = new Set(['verificado', 'endereco', 'endereco_aprox', 'manual', 'adblu'])

export function igrejaPinConfiavel(resolved = {}, co = {}, endRef = '') {
  if (FONTES_GPS_CONFIAVEL.has(resolved.fonte)) return true
  if (coordsVerificadosParaEndereco(co, endRef)) return true
  if (
    resolved.fonte === 'catalog'
    && Number.isFinite(resolved.lat)
    && Number.isFinite(resolved.lng)
  ) return true
  if (igrejaTemCoordenadaMapa(resolved) && endRef && co?._enderecoRef === endRef) return true
  return false
}

/** Grava coords oficiais ADBLU no cache (pins corretos por endereço). */
export function semearCoordsAdbluNoCache(coords = {}, lista = []) {
  const next = { ...coords }
  let changed = false
  for (const ig of lista) {
    if (!eIgrejaAdblu(ig) && !eIgrejaCatalogoFixo(ig)) continue
    const pin = coordsAdbluParaIgreja(ig)
    if (!pin) continue
    const endRef = refEnderecoIgreja(ig)
    const prev = next[ig.id] || next[String(ig.id)] || {}
    if (prev.gpsManual) continue
    if (prev._enderecoRef === endRef && prev._adbluGeo && prev.lat === pin.lat && prev.lng === pin.lng) continue
    next[ig.id] = {
      ...prev,
      lat: pin.lat,
      lng: pin.lng,
      _adbluGeo: true,
      _enderecoGeo: true,
      _enderecoRef: endRef,
      _ruaConfirmada: true,
    }
    changed = true
  }
  return { coords: next, changed }
}

function normCongLookup(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

let _coordsAdbluPorCong = null
function indiceCoordsAdbluPorCongregacao() {
  if (_coordsAdbluPorCong) return _coordsAdbluPorCong
  const map = new Map()
  IGREJAS_LISTA_ADBLU.forEach((item, idx) => {
    const catalogId = idx + 1
    const cong = normCongLookup(item.congregacao)
    if (cong) map.set(cong, catalogId)
  })
  _coordsAdbluPorCong = map
  return map
}

/** GPS oficial ADBLU — por id do catálogo (1–88) ou congregação (ex.: custom id 9001 = Betel). */
export function coordsAdbluParaIgreja(ig) {
  if (!ig) return null
  const direct = coordsVerificadosAdblu(ig.id)
  if (direct) {
    const meta = coordsAdblu[ig.id] || coordsAdblu[String(ig.id)]
    return { ...direct, enderecoOficial: meta?.endereco || '' }
  }
  if (!eIgrejaAdblu(ig) && !ig.adbluOficial) return null

  const idx = indiceCoordsAdbluPorCongregacao()
  const candidatos = [
    ig.congregacaoAdblu,
    extrairCongregacaoDoNome(ig.nome),
    ig.nome,
  ].map(normCongLookup).filter(Boolean)

  for (const c of candidatos) {
    let catalogId = idx.get(c)
    if (!catalogId) {
      for (const [k, id] of idx) {
        if (k.includes(c) || c.includes(k)) { catalogId = id; break }
      }
    }
    if (!catalogId) continue
    const pin = coordsVerificadosAdblu(catalogId)
    if (!pin) continue
    const meta = coordsAdblu[catalogId] || coordsAdblu[String(catalogId)]
    return { ...pin, enderecoOficial: meta?.endereco || '' }
  }
  return null
}

/**
 * Pins que a API do mapa (Google) colocou na rua errada.
 * Ex.: Renascer Blumenau é na João Pessoa 1641, não na Martin Luther.
 */
const CORRECOES_PIN_CONHECIDAS = [
  {
    nomeRe: /\bRENAS[CS]ER\b/i,
    ruaErradaRe: /MART[HI]N\s+LUTHER/i,
    endereco: 'Rua João Pessoa, 1641 - Velha, Blumenau - SC',
    setor: 'Velha',
    lat: -26.918902,
    lng: -49.08932,
  },
]

export function aplicarCorrecaoPinConhecida(ig) {
  if (!ig) return ig
  const nome = String(ig.nome || '')
  const end = String(ig.endereco || '')
  for (const c of CORRECOES_PIN_CONHECIDAS) {
    if (!c.nomeRe.test(nome)) continue
    if (!c.ruaErradaRe.test(end)) continue
    return {
      ...ig,
      endereco: c.endereco,
      setor: c.setor || ig.setor,
      lat: c.lat,
      lng: c.lng,
    }
  }
  return ig
}

/** Endereço validado por CEP (scripts/validar-enderecos-igrejas.cjs). */
export function aplicarEnderecoValidadoCep(ig) {
  if (!ig || ig.id == null) return ig
  const adblu = coordsAdblu[ig.id] || coordsAdblu[String(ig.id)]
  if (adblu?.endereco && eIgrejaCatalogoFixo(ig)) {
    const lat = Number(adblu.lat)
    const lng = Number(adblu.lng)
    const end = String(adblu.endereco || '').trim()
    return {
      ...ig,
      endereco: end,
      ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}),
    }
  }
  const v = enderecosValidados[ig.id] || enderecosValidados[String(ig.id)]
  if (!v || !v.endereco) return ig
  const lat = Number(v.lat)
  const lng = Number(v.lng)
  return {
    ...ig,
    cep: v.cep || ig.cep || '',
    logradouro: v.logradouro || ig.logradouro || '',
    numero: v.numero || ig.numero || '',
    bairro: v.bairro || ig.bairro || '',
    cidade: v.cidade || ig.cidade || '',
    uf: v.uf || ig.uf || '',
    endereco: v.endereco,
    setor: ig.setor || v.bairro || ig.setor,
    ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}),
  }
}

/** Coordenadas geocodificadas por endereço completo (Nominatim). */
export function coordsVerificadosAdblu(igId) {
  const v = coordsAdblu[igId] || coordsAdblu[String(igId)]
  if (!v) return null
  const lat = Number(v.lat)
  const lng = Number(v.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

export function eIgrejaCatalogoFixo(ig) {
  const id = Number(ig?.id ?? ig)
  return id > 0 && id <= MAX_ID_CATALOGO
}

/** Google gravou rua diferente da ficha oficial (ex.: Água Verde em Eça de Queiroz). */
export function enrichEnderecoConflitaComCatalogo(ig, enrich = {}) {
  if (!eIgrejaCatalogoFixo(ig)) return false
  const catalogEnd = String(ig.endereco || '').trim()
  if (!catalogEnd) return false
  const en = enrich[ig.id] || enrich[String(ig.id)] || {}
  const googleEnd = String(en.endereco || '').trim()
  if (!googleEnd) return false
  return !ruaCompativel(catalogEnd, googleEnd)
}

/** Distância máxima (km) entre geo salvo e catálogo antes de preferir o catálogo fixo. */
const MAX_KM_GEO_VS_CATALOGO = 0.35

function coordsEnderecoVerificados(ig, co, enderecoRef = null) {
  if (!co?.lat || !co?.lng) return false
  const ref = enderecoRef || refEnderecoIgreja(ig)
  return coordsVerificadosParaEndereco(co, ref)
}

/** Catálogo: coords oficiais geocodificadas por endereço ADBLU (sempre preferir). */
export function resolverCoordsIgreja(ig, coords = {}, enrich = {}, enderecoResolvido = null) {
  ig = aplicarCorrecaoPinConhecida(ig)
  const igEnd = enderecoResolvido
    ? { ...ig, endereco: enderecoResolvido }
    : ig
  const endRef = refEnderecoIgreja(igEnd)

  const adbluPin = coordsAdbluParaIgreja(ig)
  if (adbluPin && (eIgrejaAdblu(ig) || ig.adbluOficial || eIgrejaCatalogoFixo(ig))) {
    return { lat: adbluPin.lat, lng: adbluPin.lng, fonte: 'verificado' }
  }

  const verificado = coordsVerificadosAdblu(ig?.id)
  if (verificado && eIgrejaCatalogoFixo(ig)) {
    return { lat: verificado.lat, lng: verificado.lng, fonte: 'verificado' }
  }

  const en = enrich[ig.id] || enrich[String(ig.id)] || {}
  const co = coords[ig.id] || coords[String(ig.id)] || {}
  const catalogLat = Number(ig.lat)
  const catalogLng = Number(ig.lng)
  if (
    enrichEnderecoConflitaComCatalogo(ig, enrich)
    && Number.isFinite(catalogLat)
    && Number.isFinite(catalogLng)
  ) {
    return { lat: catalogLat, lng: catalogLng, fonte: 'catalog' }
  }

  let coLat = Number(co.lat)
  let coLng = Number(co.lng)

  // GPS validado pelo endereço cadastrado (rua conferida).
  if (coordsEnderecoVerificados(igEnd, co, endRef) && Number.isFinite(coLat) && Number.isFinite(coLng)) {
    const fonte = co.gpsManual ? 'manual' : (co._enderecoGeoAprox ? 'endereco_aprox' : 'endereco')
    return { lat: coLat, lng: coLng, fonte }
  }

  // Geocodificação ADBLU/Nominatim — só se bater com endereço atual.
  if (
    co._adbluGeo
    && coordsVerificadosParaEndereco(co, endRef)
    && Number.isFinite(coLat)
    && Number.isFinite(coLng)
  ) {
    return { lat: coLat, lng: coLng, fonte: 'adblu' }
  }

  // geo_coords antigo sem validação de rua — não confiar; cair para catálogo ou estimativa.
  if (
    Number.isFinite(coLat)
    && Number.isFinite(coLng)
    && !coordsEnderecoVerificados(igEnd, co, endRef)
    && !co._adbluGeo
  ) {
    if (eIgrejaCatalogoFixo(ig) && Number.isFinite(catalogLat) && Number.isFinite(catalogLng)) {
      return { lat: catalogLat, lng: catalogLng, fonte: 'catalog' }
    }
    // Descarta pin antigo errado — mapa usa centro do bairro até geocode terminar.
    coLat = NaN
    coLng = NaN
  }

  // geo_coords antigo pode ser centro do bairro — se diverge do catálogo, usa o catálogo.
  if (
    eIgrejaCatalogoFixo(ig)
    && Number.isFinite(catalogLat)
    && Number.isFinite(catalogLng)
    && Number.isFinite(coLat)
    && Number.isFinite(coLng)
  ) {
    const km = distKm({ lat: catalogLat, lng: catalogLng }, { lat: coLat, lng: coLng })
    if (Number.isFinite(km) && km > MAX_KM_GEO_VS_CATALOGO) {
      return { lat: catalogLat, lng: catalogLng, fonte: 'catalog' }
    }
  }

  const lat = Number(Number.isFinite(coLat) ? coLat : (en.lat ?? ig.lat))
  const lng = Number(Number.isFinite(coLng) ? coLng : (en.lng ?? ig.lng))
  const fonte = Number.isFinite(coLat) ? 'geo' : Number.isFinite(Number(en.lat)) ? 'enrich' : 'base'
  return { lat, lng, fonte }
}

/** Endereço oficial do catálogo não cede para o Google. */
export function resolverEnderecoIgreja(ig, enrich = {}, override = null) {
  ig = aplicarCorrecaoPinConhecida(ig)
  if (override != null && String(override).trim() !== '') return String(override).trim()
  const adblu = coordsAdblu[ig.id] || coordsAdblu[String(ig.id)]
  if (adblu?.endereco && eIgrejaCatalogoFixo(ig)) {
    return String(adblu.endereco).trim()
  }
  const en = enrich[ig.id] || enrich[String(ig.id)] || {}
  const catalogEnd = String(ig.endereco || '').trim()
  if (eIgrejaCatalogoFixo(ig) && catalogEnd) return catalogEnd
  if (catalogEnd && ruasConflitam(catalogEnd, en.endereco)) return catalogEnd
  return String(en.endereco || catalogEnd || '')
}

function limpo(v) {
  const s = String(v || '').trim()
  if (!s || s === '—' || s === '-' || s === '–') return ''
  return s
}

function googleId(ig) {
  return String(ig?.googlePlaceId || '').trim()
}

function numEnd(ig) {
  return extrairNumeroEndereco(ig?.endereco)
}

function mesmoEndereco(a, b) {
  const na = numEnd(a)
  const nb = numEnd(b)
  if (!na || !nb || na === 'SN' || nb === 'SN') return false
  if (na !== nb) return false
  return ruaCompativel(a.endereco, b.endereco)
}

function numeroProximoMesmaRua(a, b) {
  const na = Number(numEnd(a))
  const nb = Number(numEnd(b))
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false
  if (!ruaCompativel(a.endereco, b.endereco)) return false
  return Math.abs(na - nb) <= 12
}

function distKm(a, b) {
  return haversineKm(
    { lat: Number(a?.lat), lng: Number(a?.lng) },
    { lat: Number(b?.lat), lng: Number(b?.lng) },
  )
}

function normCong(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

/** Mesmo templo ADBLU com nomes diferentes (Google vs de-para). */
export function adbluSaoDuplicatas(a, b) {
  if (!a || !b || a === b) return false
  const adA = eProvavelAdblu(a)
  const adB = eProvavelAdblu(b)
  if (!adA && !adB) return false
  if (mesmoEndereco(a, b)) return true

  const ca = normCong(extrairCongregacaoDoNome(a.nome, a.setor))
  const cb = normCong(extrairCongregacaoDoNome(b.nome, b.setor))
  const d = distKm(a, b)
  const nomeOk = nomesParecidosIgreja(a.nome, b.nome)

  if (ca && cb && ca === cb && d <= 0.35) return true
  if (nomeOk && numeroProximoMesmaRua(a, b)) return true

  if (/IEADBLU/i.test(a.nome) || /IEADBLU/i.test(b.nome)) {
    const setorA = normCong(a.setor)
    const setorB = normCong(b.setor)
    if (setorA && setorA === setorB && d <= 0.4) return true
    if (ca && setorB && ca === setorB && d <= 0.4) return true
    if (cb && setorA && cb === setorA && d <= 0.4) return true
  }

  const na = normCong(a.nome)
  const nb = normCong(b.nome)
  if (na && na === nb && adA && adB && d <= 0.4) return true

  return false
}

function chaveAdbluCluster(ig) {
  if (!eProvavelAdblu(ig)) return ''
  const end = chaveEnderecoIgreja(ig.endereco)
  if (end) return `ad:${end}`
  const cong = normCong(extrairCongregacaoDoNome(ig.nome, ig.setor))
  if (cong) return `ad:${cong}`
  return ''
}

function chaveNomeLocalIgreja(ig) {
  const nome = normCong(ig?.nome)
  if (!nome || nome.length < 10) return ''
  const setor = normCong(bairroCanon(ig?.setor) || ig?.setor || '')
  const rua = normCong(extrairLogradouro(ig?.endereco))
  if (!setor || !rua || rua.length < 4) return ''
  return `${nome}|${setor}|${rua}`
}

/** Duas fichas são o mesmo templo (não duas igrejas distintas). */
export function igrejasSaoDuplicatas(a, b) {
  if (adbluSaoDuplicatas(a, b)) return true
  if (!a || !b || a === b) return false
  if (a.id != null && b.id != null && Number(a.id) === Number(b.id)) return true
  const gpa = googleId(a)
  const gpb = googleId(b)
  if (gpa && gpb && gpa === gpb) return true

  const nomeOk = nomesParecidosIgreja(a.nome, b.nome)
  const endOk = mesmoEndereco(a, b)
  if (endOk) return true
  if (nomeOk && numeroProximoMesmaRua(a, b)) return true

  const d = distKm(a, b)
  const ruasDistintas = (() => {
    const ea = String(a.endereco || '')
    const eb = String(b.endereco || '')
    if (!ea || !eb) return false
    return !ruaCompativel(ea, eb)
  })()

  const setorA = normCong(bairroCanon(a.setor) || a.setor)
  const setorB = normCong(bairroCanon(b.setor) || b.setor)
  const nomeIgual = normCong(a.nome) === normCong(b.nome) && normCong(a.nome).length >= 10
  if (nomeIgual && setorA && setorA === setorB && ruaCompativel(a.endereco, b.endereco)) return true
  if (nomeIgual && setorA && setorA === setorB && d <= 0.35 && !ruasDistintas) return true

  if (nomeOk && d <= 0.08 && !ruasDistintas) return true
  const na = String(a.nome || '').trim().toUpperCase()
  const nb = String(b.nome || '').trim().toUpperCase()
  if (na && na === nb && d <= 0.15 && !ruasDistintas) return true
  return false
}

function scoreFicha(ig) {
  const campos = [
    ig.endereco, ig.telefone, ig.whatsapp, ig.pastor1, ig.pastor2, ig.culto,
    ig.website, ig.instagram, ig.facebook, ig.setor, ig.cep,
  ].filter(v => limpo(v)).length
  let s = campos * 10
  const id = Number(ig.id) || 0
  if (ig.adbluOficial) s += 1200          // Oficial ADBLU sempre ganha (id 1-88 ou 8800+)
  else if (id > 0 && id <= 88) s += 1000  // Base legada (ids fixos 1-88)
  else if (id > 0 && id <= MAX_ID_CATALOGO) s += 500
  const fonte = String(ig.fonte || '').toLowerCase()
  if (fonte === 'manual' || fonte === 'cadastro') s += 1600 // cadastro manual pelo usuário
  if (googleId(ig)) s += 8
  if (eProvavelAdblu(ig) && /ASSEMBLEIA DE DEUS ADBLU/i.test(String(ig.nome || ''))) s += 6
  if (ig.triagemOk || ig.manter) s += 3
  s -= id * 0.0001
  return s
}

const MERGE_FIELDS = [
  'telefone', 'whatsapp', 'website', 'instagram', 'facebook', 'cep',
  'pastor1', 'esposa1', 'pastor2', 'esposa2', 'googlePlaceId', 'setor',
  'denominacao', 'culto', 'endereco',
]

export function mesclarFichaIgreja(keeper, extra) {
  if (!keeper) return extra
  if (!extra) return keeper
  const out = { ...keeper }
  const fonteExtra = String(extra.fonte || '').toLowerCase()
  if ((fonteExtra === 'manual' || fonteExtra === 'cadastro' || extra.manter) && limpo(extra.nome)) {
    out.nome = extra.nome
  }
  for (const f of MERGE_FIELDS) {
    if (!limpo(out[f]) && limpo(extra[f])) out[f] = extra[f]
  }
  if (!googleId(out) && googleId(extra)) out.googlePlaceId = extra.googlePlaceId
  if (limpo(extra.pastor1) && limpo(out.pastor1) && extra.pastor1 !== out.pastor1 && !limpo(out.pastor2)) {
    out.pastor2 = extra.pastor1
  }
  if (!out.visita && extra.visita?.historico?.length) out.visita = extra.visita
  if (out.visita?.historico?.length) {
    out.visitado = Boolean(out.visita.visitado ?? !out.visita.pendente)
  } else {
    out.visitado = false
  }
  // Preserva flags ADBLU oficiais independente de qual seja o keeper
  if (extra.adbluOficial || keeper.adbluOficial) {
    out.adbluOficial = true
    if (!out.congregacaoAdblu && extra.congregacaoAdblu) out.congregacaoAdblu = extra.congregacaoAdblu
    if (!out.triagemOk) out.triagemOk = true
  }
  return out
}

function escolherKeeper(cluster) {
  return [...cluster].sort((a, b) => scoreFicha(b) - scoreFicha(a))[0]
}

/**
 * Uma ficha por templo. Prefere catálogo (id ≤ 1999) e a ficha mais completa.
 * Retorna { lista, removidos, mapaKeeper } — mapaKeeper[idRemovido] = idKept.
 */
export function colapsarIgrejasDuplicadas(lista = []) {
  const items = (lista || []).filter(Boolean)
  if (items.length < 2) return { lista: items, removidos: [], mapaKeeper: {} }

  const parent = new Map()
  const byId = new Map()
  for (const ig of items) {
    const id = ig.id
    if (id == null) continue
    if (!byId.has(id)) byId.set(id, ig)
    parent.set(id, id)
  }
  const unique = [...byId.values()]
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)))
      x = parent.get(x)
    }
    return x
  }
  const uni = (a, b) => {
    const pa = find(a)
    const pb = find(b)
    if (pa !== pb) parent.set(pa, pb)
  }

  const byPlace = new Map()
  const byEnd = new Map()
  const byAdblu = new Map()
  const byNomeLocal = new Map()
  for (const ig of unique) {
    const g = googleId(ig)
    if (g) {
      const prev = byPlace.get(g)
      if (prev != null) uni(ig.id, prev)
      else byPlace.set(g, ig.id)
    }
    const chave = chaveEnderecoIgreja(ig.endereco)
    if (chave) {
      const prev = byEnd.get(chave)
      if (prev != null) uni(ig.id, prev)
      else byEnd.set(chave, ig.id)
    }
    const chNome = chaveNomeLocalIgreja(ig)
    if (chNome) {
      const prev = byNomeLocal.get(chNome)
      if (prev != null) uni(ig.id, prev)
      else byNomeLocal.set(chNome, ig.id)
    }
    const chAd = chaveAdbluCluster(ig)
    if (chAd) {
      const prev = byAdblu.get(chAd)
      if (prev != null) uni(ig.id, prev)
      else byAdblu.set(chAd, ig.id)
    }
  }

  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      if (adbluSaoDuplicatas(unique[i], unique[j])) {
        uni(unique[i].id, unique[j].id)
      }
    }
  }

  const groups = new Map()
  for (const ig of unique) {
    const r = find(ig.id)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r).push(ig)
  }

  const out = []
  const removidos = []
  const mapaKeeper = {}
  for (const g of groups.values()) {
    if (g.length === 1) {
      out.push(g[0])
      continue
    }
    const keeper = escolherKeeper(g)
    let merged = keeper
    for (const extra of g) {
      if (extra.id === keeper.id) continue
      merged = mesclarFichaIgreja(merged, extra)
      removidos.push({ id: extra.id, nome: extra.nome, keeperId: keeper.id, keeperNome: keeper.nome })
      mapaKeeper[extra.id] = keeper.id
    }
    out.push(merged)
  }

  out.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
  return { lista: out, removidos, mapaKeeper }
}

/** Tira de igrejas_custom as que repetem o catálogo fixo ou outra custom. */
export function filtrarCustomUnicas(custom = [], catalogoFixo = []) {
  const { lista } = colapsarIgrejasDuplicadas([...(catalogoFixo || []), ...(custom || [])])
  const keepIds = new Set(lista.map(i => i.id))
  const catalogIds = new Set((catalogoFixo || []).map(i => i.id))
  return (custom || []).filter(c => keepIds.has(c.id) && !catalogIds.has(c.id)).map((c) => {
    const kept = lista.find(i => i.id === c.id)
    return kept ? { ...c, ...pickMerge(kept) } : c
  })
}

function pickMerge(ig) {
  const o = {}
  for (const f of MERGE_FIELDS) {
    if (limpo(ig[f])) o[f] = ig[f]
  }
  if (googleId(ig)) o.googlePlaceId = ig.googlePlaceId
  return o
}

/** Patches de enrich para o keeper quando a custom duplicata some. */
export function patchesEnrichDeDuplicatas(custom = [], catalogoFixo = [], enrich = {}) {
  const { removidos, lista } = colapsarIgrejasDuplicadas([...(catalogoFixo || []), ...(custom || [])])
  const byId = new Map(lista.map(i => [i.id, i]))
  const next = { ...enrich }
  for (const r of removidos) {
    const keeper = byId.get(r.keeperId)
    if (!keeper) continue
    const prev = next[keeper.id] || next[String(keeper.id)] || {}
    const extra = (custom || []).find(c => c.id === r.id) || {}
    const merged = mesclarFichaIgreja({ ...keeper, ...prev }, extra)
    next[keeper.id] = {
      ...prev,
      ...(limpo(merged.telefone) ? { telefone: merged.telefone } : {}),
      ...(limpo(merged.whatsapp) ? { whatsapp: merged.whatsapp } : {}),
      ...(limpo(merged.website) ? { website: merged.website } : {}),
      ...(limpo(merged.instagram) ? { instagram: merged.instagram } : {}),
      ...(limpo(merged.facebook) ? { facebook: merged.facebook } : {}),
      ...(limpo(merged.cep) ? { cep: merged.cep } : {}),
      ...(googleId(merged) ? { googlePlaceId: merged.googlePlaceId } : {}),
    }
  }
  for (const r of removidos) {
    delete next[r.id]
    delete next[String(r.id)]
  }
  return { enrich: next, removidos }
}
