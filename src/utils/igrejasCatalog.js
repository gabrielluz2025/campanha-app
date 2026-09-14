import { readStorage, writeStorage } from './persist'
import { persistLocalOnly, ensureChurchCatalogSynced } from '../lib/cloudSync'
import { geocodeEndereco, sleep } from './geocode'
import { IGREJAS_BASE, IGREJAS_EXTERNAS } from '../data/igrejasBase'
import { DENOMINACAO_PADRAO } from '../constants/igrejasTheme'
import { MAPA_VISITAS_SO_CUSTOM, IGREJAS_MAPA_SOMENTE_MANUAL, eIgrejaCadastroManual } from './igrejasFonte'
import { filtrarIgrejasMapaCampanha } from './igrejaCidade'
import { readIgrejasEnrich } from './igrejasOverpass'
import { eIgrejaCrista, filtrarIgrejasCristas, purgarIgrejasNaocristasSalvas } from './igrejaCrista'
import { eIgrejaFichaUtil, eIgrejaImportadaAutomaticamente } from './igrejaTriagem'
import { resetIgrejasMapaSePreciso } from './igrejasReset'
import { gerarIdIgrejaCustom } from './igrejaCustomId'
import { isIgrejaVisitada, loadMapaVisitasIgrejas, normalizarRegistroVisita, removerIgrejasDeTodasRotas } from './rotaUtils'
import {
  colapsarIgrejasDuplicadas,
  filtrarCustomUnicas,
  patchesEnrichDeDuplicatas,
  resolverCoordsIgreja,
  resolverEnderecoIgreja,
  aplicarCorrecaoPinConhecida,
  aplicarEnderecoValidadoCep,
} from './igrejaDedupe'
import { colapsarIgrejasDuplicadasAsync } from './igrejasDedupeWorker'
import {
  corrigirListaNomesAdblu,
  corrigirNomeAdbluIndevido,
  formatarNomeAdblu,
  igrejaMatchItemAdblu,
  eProvavelAdblu,
  eAssembleiaDeDeus,
  enderecoEhRegiaoAdblu,
  chaveEnderecoIgreja,
} from './igrejasAdbluNome'
import { IGREJAS_LISTA_ADBLU, TOTAL_LISTA_ADBLU } from '../data/igrejasListaAdblu'
import { SYNC_EVENT, SYNC_STORAGE_EVENT } from '../lib/cloudSync'
import { isUiQuiet } from './syncUiGate'

export { TOTAL_LISTA_ADBLU }

/** Disparado após cadastrar/editar igreja no mapa de visitas. */
export const IGREJAS_ATUALIZADAS_EVENT = 'campanha:igrejas-atualizadas'

const CHURCH_STORAGE_KEYS = new Set([
  'igrejas_custom', 'igrejas_enrich', 'geo_coords_igrejas',
  'igrejas_overrides', 'igrejas_visitas', 'pastores_igrejas', 'igrejas_ocultas',
])

export function readIgrejasOcultas() {
  try {
    const raw = readStorage('igrejas_ocultas', [])
    return new Set((Array.isArray(raw) ? raw : []).map(String).filter(Boolean))
  } catch {
    return new Set()
  }
}

export function marcarIgrejaOculta(id) {
  const set = readIgrejasOcultas()
  set.add(String(id))
  writeStorage('igrejas_ocultas', [...set])
}

let _catalogCache = null
let _hidratadasCache = null

/** Limpa cache em memória após sync ou gravação de igrejas. */
export function invalidateIgrejasCatalogCache() {
  _catalogCache = null
  _hidratadasCache = null
}

/** Recarrega igrejas ignorando cache (Montar Rotas / após cadastro no mapa). */
export function reloadIgrejasHidratadas() {
  invalidateIgrejasCatalogCache()
  return loadIgrejasHidratadas()
}

/** Recarrega igrejas via Worker quando a lista é grande. */
export async function reloadIgrejasHidratadasAsync() {
  invalidateIgrejasCatalogCache()
  return loadIgrejasHidratadasAsync()
}

function installCatalogCacheInvalidation() {
  if (typeof window === 'undefined' || installCatalogCacheInvalidation._done) return
  installCatalogCacheInvalidation._done = true
  const onInvalidate = () => invalidateIgrejasCatalogCache()
  window.addEventListener(SYNC_EVENT, (e) => {
    if (isUiQuiet()) return
    const d = e.detail || {}
    if (d.materiaisPartial) return
    const key = d.approvedKey
    if (key) {
      if (!CHURCH_STORAGE_KEYS.has(key)) return
    } else if (d.fromServer && !d.igrejasCadastroLimpo && !d.igrejasVisitasPartial) {
      return
    }
    onInvalidate()
  })
  window.addEventListener(SYNC_STORAGE_EVENT, (e) => {
    if (CHURCH_STORAGE_KEYS.has(e.detail?.key)) onInvalidate()
  })
  window.addEventListener('storage', (e) => {
    if (CHURCH_STORAGE_KEYS.has(e.key)) onInvalidate()
  })
}
installCatalogCacheInvalidation()

let _indiceBaseAdblu = null

function normCongAdblu(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function indiceBaseAdblu() {
  if (_indiceBaseAdblu) return _indiceBaseAdblu
  const porChave = new Map()
  const porCong = new Map()
  for (const ig of IGREJAS_BASE) {
    const ch = chaveEnderecoIgreja(ig.endereco)
    if (ch) porChave.set(ch, ig)
    const cong = normCongAdblu(ig.nome)
    if (cong) porCong.set(cong, ig)
  }
  _indiceBaseAdblu = { porChave, porCong }
  return _indiceBaseAdblu
}

/** Casa congregação oficial (adblu.org) com ficha+GPS do catálogo fixo. */
export function resolverBaseCatalogoAdblu(item) {
  if (!item) return null
  const { porChave, porCong } = indiceBaseAdblu()
  const ch = chaveEnderecoIgreja(item.endereco)
  if (ch && porChave.has(ch)) return porChave.get(ch)
  const cong = normCongAdblu(item.congregacao)
  if (cong && porCong.has(cong)) return porCong.get(cong)
  for (const [k, ig] of porCong) {
    if (k === cong || k.includes(cong) || cong.includes(k)) return ig
  }
  return null
}

/**
 * As 88 congregações oficiais ADBLU — sempre no mapa/rotas (mesmo em modo só-custom).
 * Usa ids e GPS do IGREJAS_BASE (inseridos manualmente) como fonte de verdade.
 */
export function listaAdbluOficialParaMapa() {
  return IGREJAS_LISTA_ADBLU.map((item, idx) => {
    const base = resolverBaseCatalogoAdblu(item)
    const setor = String(item.bairro || item.congregacao || '—').trim() || '—'
    return {
      id: base?.id ?? (8800 + idx),
      nome: formatarNomeAdblu(item.congregacao),
      setor,
      denominacao: DENOMINACAO_PADRAO,
      endereco: String(item.endereco || '').trim().replace(/,\s*$/, ''),
      culto: item.culto || '',
      lat: base?.lat ?? null,
      lng: base?.lng ?? null,
      foto: base?.foto || '/fotos/sem-foto.jpg',
      pastor1: base?.pastor1 || '',
      pastor2: base?.pastor2 || '',
      esposa1: base?.esposa1 || '',
      esposa2: base?.esposa2 || '',
      fonte: 'adblu',
      adbluOficial: true,
      congregacaoAdblu: item.congregacao,
      triagemOk: true,
    }
  })
}

/** AD + externas do código; em modo só-manual retorna vazio (cadastro do zero). */
export function catalogoFixoIgrejas() {
  if (IGREJAS_MAPA_SOMENTE_MANUAL) return []
  if (MAPA_VISITAS_SO_CUSTOM) return listaAdbluOficialParaMapa()
  return [...IGREJAS_BASE, ...IGREJAS_EXTERNAS]
}

/** Overrides de ficha (culto, nome, setor…) para igrejas do catálogo fixo (AD + externas). */
export const IGREJAS_OVERRIDES_KEY = 'igrejas_overrides'

export function readIgrejasCustom() {
  return readStorage('igrejas_custom', [])
}

export function readIgrejasOverrides() {
  const raw = readStorage(IGREJAS_OVERRIDES_KEY, {})
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
}

/** Salva/atualiza override de uma igreja do catálogo (ids ≤ 1999). */
export function upsertIgrejaOverride(id, patch = {}) {
  const key = String(id)
  const all = readIgrejasOverrides()
  const prev = all[key] && typeof all[key] === 'object' ? all[key] : {}
  const next = {
    ...prev,
    ...patch,
    atualizadoEm: new Date().toISOString(),
  }
  // Remove campos vazios opcionais? manter culto '' para limpar horário
  all[key] = next
  writeStorage(IGREJAS_OVERRIDES_KEY, all)
  return next
}

/** Aplica override de ficha sobre um registro do catálogo. */
export function aplicarOverrideIgreja(ig, overrides = null) {
  if (!ig) return ig
  const map = overrides || readIgrejasOverrides()
  const ov = map[ig.id] || map[String(ig.id)]
  if (!ov || typeof ov !== 'object') return ig
  return {
    ...ig,
    ...(ov.nome != null && String(ov.nome).trim() ? { nome: String(ov.nome).trim() } : {}),
    ...(ov.setor != null && String(ov.setor).trim() ? { setor: String(ov.setor).trim() } : {}),
    ...(ov.endereco != null ? { endereco: String(ov.endereco).trim() } : {}),
    ...(ov.culto != null ? { culto: String(ov.culto).trim() } : {}),
    ...(ov.denominacao != null && String(ov.denominacao).trim()
      ? { denominacao: String(ov.denominacao).trim() }
      : {}),
    ...(ov.cep != null && String(ov.cep).trim()
      ? { cep: String(ov.cep).trim() }
      : {}),
  }
}

/** Cadastra igreja manual na base (igrejas_custom) e retorna o registro. */
export function adicionarIgrejaNaBase({
  nome = '',
  setor = '',
  denominacao = DENOMINACAO_PADRAO,
  endereco = '',
  culto = '',
  lat = null,
  lng = null,
  cep = '',
  logradouro = '',
  numero = '',
  bairro = '',
  cidade = 'Blumenau',
  uf = 'SC',
} = {}) {
  const nomeOk = String(nome || '').trim()
  if (!nomeOk) throw new Error('Informe o nome da igreja.')
  const bairroOk = String(bairro || setor || '').trim()
  const enderecoOk = String(endereco || '').trim()
  if (!enderecoOk || enderecoOk.length < 8) {
    throw new Error('Informe o CEP ou endereço completo.')
  }
  const novaBase = {
    nome: nomeOk,
    setor: String(setor || '').trim() || bairroOk || '—',
    denominacao: String(denominacao || DENOMINACAO_PADRAO).trim() || DENOMINACAO_PADRAO,
  }
  if (!eIgrejaCrista(novaBase)) {
    throw new Error('Só entram igrejas cristãs.')
  }

  const custom = readIgrejasCustom()
  const nova = {
    id: gerarIdIgrejaCustom(),
    nome: nomeOk,
    setor: String(setor || '').trim() || bairroOk || '—',
    denominacao: String(denominacao || DENOMINACAO_PADRAO).trim() || DENOMINACAO_PADRAO,
    endereco: enderecoOk,
    cep: String(cep || '').replace(/\D/g, ''),
    logradouro: String(logradouro || '').trim(),
    numero: String(numero || '').trim(),
    bairro: bairroOk,
    cidade: String(cidade || 'Blumenau').trim(),
    uf: String(uf || 'SC').trim(),
    culto: String(culto || '').trim() || 'Dom 18:30',
    foto: '/fotos/sem-foto.jpg',
    lat: lat ?? -26.9194,
    lng: lng ?? -49.0661,
    pastor1: '', esposa1: '', pastor2: '', esposa2: '',
    fonte: 'manual', manter: true,
    atualizadoEm: new Date().toISOString(),
  }
  writeStorage('igrejas_custom', [...custom, nova])
  invalidateIgrejasCatalogCache()
  return nova
}

/** Lista completa de igrejas com dados salvos (pastores, coords, visitas, culto). */
export function loadIgrejasCatalog() {
  const saved    = readStorage('pastores_igrejas', {})
  const coords   = readStorage('geo_coords_igrejas', {})
  const visitas  = readStorage('igrejas_visitas', {})
  const overrides = readIgrejasOverrides()
  const enrich = readIgrejasEnrich()
  const customRaw = readStorage('igrejas_custom', [])
  const fixo = catalogoFixoIgrejas()
  const base = fixo.filter(i => Number(i.id) <= 88).map(i => {
    const { lat, lng } = resolverCoordsIgreja(i, coords, enrich)
    return aplicarOverrideIgreja({
      ...i, lat, lng,
      endereco: resolverEnderecoIgreja(i, enrich),
      status: 'ok', denominacao: i.denominacao || DENOMINACAO_PADRAO,
      pastor1: saved[i.id]?.pastor1 || '', pastor2: saved[i.id]?.pastor2 || '',
      visitado: isIgrejaVisitada(visitas[i.id] ?? visitas[String(i.id)]),
    }, overrides)
  })
  const externas = fixo.filter(i => Number(i.id) > 88).map(i => {
    const { lat, lng } = resolverCoordsIgreja(i, coords, enrich)
    return aplicarOverrideIgreja({
      ...i, lat, lng,
      endereco: resolverEnderecoIgreja(i, enrich),
      status: 'ok', denominacao: i.denominacao || 'Outra',
      pastor1: saved[i.id]?.pastor1 ?? i.pastor1 ?? '',
      pastor2: saved[i.id]?.pastor2 ?? i.pastor2 ?? '',
      visitado: isIgrejaVisitada(visitas[i.id] ?? visitas[String(i.id)]),
    }, overrides)
  })
  const custom = customRaw.map(i => ({
    ...i, lat: coords[i.id]?.lat ?? i.lat, lng: coords[i.id]?.lng ?? i.lng,
    status: 'ok', denominacao: i.denominacao || DENOMINACAO_PADRAO,
    pastor1: saved[i.id]?.pastor1 || '', pastor2: saved[i.id]?.pastor2 || '',
    visitado: isIgrejaVisitada(visitas[i.id] ?? visitas[String(i.id)]),
    cep: i.cep || '',
  }))
  const ocultas = readIgrejasOcultas()
  return filtrarIgrejasCristas(colapsarIgrejasDuplicadas([...base, ...externas, ...custom]).lista)
    .filter(i => !ocultas.has(String(i.id)))
}

/** Igrejas com enrich, overrides, coords e visitas — igual ao mapa de visitas. */
function buildIgrejasHidratadasRaw() {
  resetIgrejasMapaSePreciso()
  purgarIgrejasNaocristasSalvas()
  const saved = readStorage('pastores_igrejas', {})
  const coords = readStorage('geo_coords_igrejas', {})
  const visitas = loadMapaVisitasIgrejas()
  const enrich = readIgrejasEnrich()
  const overrides = readIgrejasOverrides()
  const customRaw = readIgrejasCustom()

  const hydrate = (i, defaults = {}) => {
    i = aplicarCorrecaoPinConhecida(i)
    i = aplicarEnderecoValidadoCep(i)
    const en = enrich[i.id] || enrich[String(i.id)] || {}
    const ov = overrides[i.id] || overrides[String(i.id)] || {}
    const regVisita = visitas[i.id] ?? visitas[String(i.id)]
    const visita = normalizarRegistroVisita(regVisita)
    const adbluGeoOk = MAPA_VISITAS_SO_CUSTOM && i.adbluOficial
      ? (coords[i.id]?._adbluGeo || coords[String(i.id)]?._adbluGeo)
      : false
    const { lat, lng, fonte } = (i.adbluOficial && MAPA_VISITAS_SO_CUSTOM && !adbluGeoOk && i.lat != null && i.lng != null)
      ? { lat: Number(i.lat), lng: Number(i.lng), fonte: 'base' }
      : resolverCoordsIgreja(i, coords, enrich)
    const enderecoOv = ov.endereco != null ? String(ov.endereco).trim() : null
    const cultoOv = ov.culto != null ? String(ov.culto).trim() : null
    return {
      ...i,
      ...defaults,
      lat,
      lng,
      geoFonte: fonte || null,
      status: 'ok',
      denominacao: ov.denominacao || i.denominacao || defaults.denominacao || DENOMINACAO_PADRAO,
      nome: (ov.nome != null && String(ov.nome).trim()) ? String(ov.nome).trim() : i.nome,
      setor: ov.setor || i.setor || '',
      endereco: resolverEnderecoIgreja(i, enrich, enderecoOv),
      culto: cultoOv ?? (i.culto || en.culto || ''),
      cep: ov.cep || en.cep || i.cep || '',
      telefone: ov.telefone || en.telefone || i.telefone || '',
      website: en.website || i.website || '',
      instagram: en.instagram || i.instagram || '',
      facebook: en.facebook || i.facebook || '',
      whatsapp: en.whatsapp || i.whatsapp || '',
      pastor1: saved[i.id]?.pastor1 ?? i.pastor1 ?? '',
      esposa1: saved[i.id]?.esposa1 ?? i.esposa1 ?? '',
      pastor2: saved[i.id]?.pastor2 ?? i.pastor2 ?? '',
      esposa2: saved[i.id]?.esposa2 ?? i.esposa2 ?? '',
      visitado: isIgrejaVisitada(regVisita),
      visita: visita || null,
      osmId: en.osmId || i.osmId || null,
      foto: i.foto || '/fotos/sem-foto.jpg',
    }
  }

  const fixo = catalogoFixoIgrejas()
  /** Modo manual: só igrejas_custom — catálogo fixo no dedupe apagava cadastros novos. */
  const incluirFixoNoMapa = !IGREJAS_MAPA_SOMENTE_MANUAL
  const base = (!incluirFixoNoMapa
    ? []
    : MAPA_VISITAS_SO_CUSTOM
      ? fixo
      : fixo.filter(i => Number(i.id) <= 88)
  ).map(i => hydrate(i, { denominacao: DENOMINACAO_PADRAO }))
  const externas = (!incluirFixoNoMapa || MAPA_VISITAS_SO_CUSTOM)
    ? []
    : fixo.filter(i => Number(i.id) > 88).map(i => hydrate(i, { denominacao: i.denominacao || 'Outra' }))
  const custom = customRaw
    .filter(i => !IGREJAS_MAPA_SOMENTE_MANUAL || eIgrejaCadastroManual(i))
    .filter(i => IGREJAS_MAPA_SOMENTE_MANUAL || !MAPA_VISITAS_SO_CUSTOM || !eIgrejaImportadaAutomaticamente(i))
    .map(i => {
    const fonte = String(i.fonte || '').toLowerCase()
    const buscaAuto = ['google', 'osm', 'nominatim'].includes(fonte) || i.googlePlaceId || i.osmId
    const prep = !buscaAuto && !i.manter
      ? { ...i, manter: true, fonte: i.fonte || 'manual' }
      : i
    return hydrate(prep, { denominacao: prep.denominacao || 'Outra' })
  })
  const ocultas = readIgrejasOcultas()
  const visiveis = [...base, ...externas, ...custom].filter(i => !ocultas.has(String(i.id)))
  return filtrarIgrejasMapaCampanha(visiveis)
}

export function loadIgrejasHidratadas() {
  if (_hidratadasCache) return _hidratadasCache
  const raw = buildIgrejasHidratadasRaw()
  _hidratadasCache = filtrarIgrejasCristas(colapsarIgrejasDuplicadas(raw).lista)
  return _hidratadasCache
}

/** Hidrata + deduplica em Web Worker (mapa / rotas). */
export async function loadIgrejasHidratadasAsync() {
  if (_hidratadasCache) return _hidratadasCache
  const raw = buildIgrejasHidratadasRaw()
  const skipDedupe = IGREJAS_MAPA_SOMENTE_MANUAL && raw.length <= 120
  const lista = skipDedupe
    ? raw
    : IGREJAS_MAPA_SOMENTE_MANUAL
      ? colapsarIgrejasDuplicadas(raw).lista
      : (await colapsarIgrejasDuplicadasAsync(raw)).lista
  _hidratadasCache = filtrarIgrejasCristas(lista)
  return _hidratadasCache
}

/** Remove do local (e envia à nuvem) custom/enrich/coords que repetem o mesmo templo. */
export function purgarIgrejasDuplicadasSalvas() {
  purgarIgrejasNaocristasSalvas()
  const catalogo = catalogoFixoIgrejas().map(i => ({ ...i }))
  const custom = readIgrejasCustom()
  const enrich = readIgrejasEnrich()
  const coords = readStorage('geo_coords_igrejas', {})
  const visitas = readStorage('igrejas_visitas', {})
  const pastores = readStorage('pastores_igrejas', {})

  const attach = (i) => {
    const en = enrich[i.id] || enrich[String(i.id)] || {}
    const co = coords[i.id] || coords[String(i.id)] || {}
    return {
      ...i,
      ...en,
      lat: co.lat ?? en.lat ?? i.lat,
      lng: co.lng ?? en.lng ?? i.lng,
      googlePlaceId: i.googlePlaceId || en.googlePlaceId || '',
    }
  }

  const { removidos } = colapsarIgrejasDuplicadas([
    ...catalogo.map(attach),
    ...custom.map(attach),
  ])
  if (!removidos.length) return 0

  const nextCustom = filtrarCustomUnicas(custom.map(attach), catalogo.map(attach))
    .map((c) => {
      const raw = custom.find(x => x.id === c.id) || c
      return { ...raw, ...c, id: raw.id }
    })

  const { enrich: nextEnrich } = patchesEnrichDeDuplicatas(custom.map(attach), catalogo.map(attach), enrich)
  const nextCoords = { ...coords }
  const nextVisitas = { ...visitas }
  const nextPastores = { ...pastores }
  for (const r of removidos) {
    delete nextCoords[r.id]
    delete nextCoords[String(r.id)]
    if (nextVisitas[r.id] && !nextVisitas[r.keeperId]) nextVisitas[r.keeperId] = nextVisitas[r.id]
    delete nextVisitas[r.id]
    delete nextVisitas[String(r.id)]
    if (nextPastores[r.id] && !nextPastores[r.keeperId]) nextPastores[r.keeperId] = nextPastores[r.id]
    delete nextPastores[r.id]
    delete nextPastores[String(r.id)]
  }

  writeStorage('igrejas_custom', nextCustom)
  writeStorage('igrejas_enrich', nextEnrich)
  writeStorage('geo_coords_igrejas', nextCoords)
  writeStorage('igrejas_visitas', nextVisitas)
  writeStorage('pastores_igrejas', nextPastores)
  return removidos.length
}

/** Anexa enrich/coords ao item para detectar duplicatas (mesmo critério do mapa). */
function attachIgrejaParaDedupe(i, enrich, coords) {
  const en = enrich[i.id] || enrich[String(i.id)] || {}
  const co = coords[i.id] || coords[String(i.id)] || {}
  return {
    ...i,
    ...en,
    lat: co.lat ?? en.lat ?? i.lat,
    lng: co.lng ?? en.lng ?? i.lng,
    googlePlaceId: i.googlePlaceId || en.googlePlaceId || '',
  }
}

/** Lista duplicatas no cadastro salvo (sem alterar dados). */
export function analisarDuplicatasIgrejasSalvas() {
  const custom = readIgrejasCustom()
  if (custom.length < 2) {
    return { removidos: [], duplicateCount: 0, total: custom.length, after: custom.length }
  }
  const enrich = readIgrejasEnrich()
  const coords = readStorage('geo_coords_igrejas', {})
  const { removidos } = colapsarIgrejasDuplicadas(custom.map(i => attachIgrejaParaDedupe(i, enrich, coords)))
  return {
    removidos,
    duplicateCount: removidos.length,
    total: custom.length,
    after: custom.length - removidos.length,
  }
}

function migrarChaveIgrejaObj(obj, fromId, toId) {
  const next = { ...(obj && typeof obj === 'object' ? obj : {}) }
  const from = String(fromId)
  const to = String(toId)
  if (next[from] != null) {
    if (next[to] == null) next[to] = next[from]
    delete next[from]
  }
  return next
}

/** Funde duplicatas no local: remove fichas repetidas e migra visitas/coords (de-para id → keeper). */
export function aplicarDeparaDuplicatasIgrejasLocal() {
  const custom = readIgrejasCustom()
  if (custom.length < 2) {
    return { removidos: [], removidas: 0, mantidas: custom.length, changed: false }
  }

  const enrich = readIgrejasEnrich()
  const coords = readStorage('geo_coords_igrejas', {})
  const visitas = readStorage('igrejas_visitas', {})
  const pastores = readStorage('pastores_igrejas', {})
  const overrides = readStorage('igrejas_overrides', {})
  const notas = readStorage('igrejas_notas', {})
  const prioridades = readStorage('igrejas_prioridades', {})

  const attached = custom.map(i => attachIgrejaParaDedupe(i, enrich, coords))
  const { lista, removidos, mapaKeeper } = colapsarIgrejasDuplicadas(attached)
  if (!removidos.length) {
    return { removidos: [], removidas: 0, mantidas: custom.length, changed: false, mapaKeeper: {} }
  }

  const customIds = new Set(custom.map(c => String(c.id)))
  const nextCustom = lista
    .filter(i => customIds.has(String(i.id)))
    .map((merged) => {
      const raw = custom.find(x => String(x.id) === String(merged.id)) || {}
      return { ...raw, ...merged, id: raw.id ?? merged.id }
    })

  const catalogoFixo = catalogoFixoIgrejas().map(i => ({ ...i }))
  let { enrich: nextEnrich } = patchesEnrichDeDuplicatas(attached, catalogoFixo, enrich)

  let nextCoords = { ...coords }
  let nextVisitas = { ...visitas }
  let nextPastores = { ...pastores }
  let nextOverrides = { ...overrides }
  let nextNotas = { ...notas }
  let nextPrioridades = { ...prioridades }

  for (const r of removidos) {
    const keeperId = r.keeperId ?? mapaKeeper[r.id]
    delete nextCoords[r.id]
    delete nextCoords[String(r.id)]
    delete nextEnrich[r.id]
    delete nextEnrich[String(r.id)]
    nextVisitas = migrarChaveIgrejaObj(nextVisitas, r.id, keeperId)
    nextPastores = migrarChaveIgrejaObj(nextPastores, r.id, keeperId)
    nextOverrides = migrarChaveIgrejaObj(nextOverrides, r.id, keeperId)
    nextNotas = migrarChaveIgrejaObj(nextNotas, r.id, keeperId)
    nextPrioridades = migrarChaveIgrejaObj(nextPrioridades, r.id, keeperId)
  }

  const idsRemovidos = removidos.map(r => String(r.id))
  removerIgrejasDeTodasRotas(idsRemovidos)

  writeStorage('igrejas_custom', nextCustom)
  writeStorage('igrejas_enrich', nextEnrich)
  writeStorage('geo_coords_igrejas', nextCoords)
  writeStorage('igrejas_visitas', nextVisitas)
  writeStorage('pastores_igrejas', nextPastores)
  writeStorage('igrejas_overrides', nextOverrides)
  writeStorage('igrejas_notas', nextNotas)
  writeStorage('igrejas_prioridades', nextPrioridades)

  invalidateIgrejasCatalogCache()
  return {
    removidos,
    removidas: removidos.length,
    mantidas: nextCustom.length,
    changed: true,
    mapaKeeper,
  }
}

/** Mapa só Google: funde duplicatas ADBLU/Assembleia (sem renomear automaticamente). */
export function purgarCustomDuplicadasSalvas() {
  const result = aplicarDeparaDuplicatasIgrejasLocal()
  if (result.changed) {
    writeStorage('igrejas_custom', readIgrejasCustom(), { force: true })
  }
  return result.removidas
}

/** Remove duplicatas do cadastro custom (modo manual) e migra visitas/pastores/coords. */
export function deduplicarIgrejasCustomSalvas() {
  const result = aplicarDeparaDuplicatasIgrejasLocal()
  if (result.changed) {
    writeStorage('igrejas_custom', readIgrejasCustom(), { force: true })
  }
  return result.removidas
}

/** Reverte nomes ADBLU colocados sem match de endereço na lista oficial (custom + overrides). */
export function corrigirNomesAdbluIndevidosSalvos() {
  const enrich = readIgrejasEnrich()
  const overrides = readIgrejasOverrides()
  let total = 0

  const custom = readIgrejasCustom()
  const customCtx = custom.map((ig) => {
    const en = enrich[ig.id] || enrich[String(ig.id)] || {}
    return {
      ...ig,
      endereco: ig.endereco || en.endereco || '',
      nomeGoogle: ig.nomeGoogle || en.nomeGoogle || '',
    }
  })
  const { lista: customNext, mudou: customMudou } = corrigirListaNomesAdblu(customCtx)
  if (customMudou) {
    total += customNext.filter((ig, i) => ig.nome !== custom[i]?.nome).length
    writeStorage('igrejas_custom', customNext, { force: true })
    invalidateIgrejasCatalogCache()
  }

  const overridesNext = { ...overrides }
  let overridesMudou = false
  for (const [id, ov] of Object.entries(overrides)) {
    if (!ov || typeof ov !== 'object' || !String(ov.nome || '').trim()) continue
    const en = enrich[id] || {}
    const customIg = customNext.find((c) => String(c.id) === String(id))
    const r = corrigirNomeAdbluIndevido({
      nome: ov.nome,
      endereco: ov.endereco || customIg?.endereco || en.endereco || '',
      nomeGoogle: en.nomeGoogle || customIg?.nomeGoogle || customIg?.nome || '',
      denominacao: ov.denominacao || customIg?.denominacao || '',
      setor: ov.setor || customIg?.setor || '',
    })
    if (r.mudou) {
      overridesNext[id] = { ...ov, nome: r.ig.nome }
      overridesMudou = true
      total++
    }
  }
  if (overridesMudou) {
    writeStorage(IGREJAS_OVERRIDES_KEY, overridesNext, { force: true })
    invalidateIgrejasCatalogCache()
  }

  return total
}

function igrejaElegivelDeParaAdblu(ig, enrich, deParaManual) {
  const fonte = String(ig.fonte || '').toLowerCase()
  if (fonte !== 'manual' && fonte !== 'cadastro') return true
  if (!deParaManual) return false
  if (ig.adbluOficial || ig.congregacaoAdblu) return true
  if (eProvavelAdblu(ig)) return true
  if (!eAssembleiaDeDeus(ig.nome, ig.denominacao)) return false
  const en = enrich[ig.id] || enrich[String(ig.id)] || {}
  const end = String(ig.endereco || en.endereco || '').trim()
  return !end || enderecoEhRegiaoAdblu(end)
}

function patchOficialAdblu(cur, item, base, forcarOficial) {
  const nomeOficial = formatarNomeAdblu(item.congregacao)
  const endOficial = String(item.endereco || '').trim().replace(/,\s*$/, '')
  const setor = String(item.bairro || item.congregacao || '—').trim() || '—'
  const fontePrev = String(cur.fonte || '').toLowerCase()
  const fonte = (fontePrev === 'manual' || fontePrev === 'cadastro' || fontePrev === 'planilha' || fontePrev === 'lista-papel')
    ? fontePrev
    : 'adblu'
  const patch = {
    nome: nomeOficial,
    endereco: endOficial,
    setor,
    setorNum: item.setorNum || cur.setorNum || '',
    regiao: item.regiao || cur.regiao || '',
    denominacao: 'Assembleia de Deus',
    culto: forcarOficial ? (item.culto || '') : (cur.culto || item.culto || ''),
    fonte,
    adbluOficial: true,
    triagemOk: true,
    congregacaoAdblu: item.congregacao,
    atualizadoEm: new Date().toISOString(),
  }
  if (base?.lat != null && base?.lng != null) {
    patch.lat = base.lat
    patch.lng = base.lng
  }
  return patch
}

function fichaAdbluMudou(cur, patch) {
  return cur.nome !== patch.nome
    || cur.endereco !== patch.endereco
    || cur.setor !== patch.setor
    || String(cur.culto || '') !== String(patch.culto || '')
    || cur.fonte !== 'adblu'
    || !cur.adbluOficial
    || String(cur.congregacaoAdblu || '') !== String(patch.congregacaoAdblu || '')
    || (patch.lat != null && (cur.lat !== patch.lat || cur.lng !== patch.lng))
}

/**
 * Garante as 88 congregações oficiais (adblu.org) no cadastro do mapa.
 * Atualiza igrejas já existentes (incl. importadas manualmente) e adiciona as que faltam.
 */
export function sincronizarCatalogoAdbluOficial(opts = {}) {
  const deParaManual = opts.deParaManual !== false
  const forcarOficial = opts.forcarOficial !== false
  const adicionarFaltantes = opts.adicionarFaltantes ?? !IGREJAS_MAPA_SOMENTE_MANUAL

  let custom = readIgrejasCustom()
  const enrich = readIgrejasEnrich()
  const coords = readStorage('geo_coords_igrejas', {})
  const coordsNext = { ...coords }
  let maxId = Math.max(2000, ...custom.map((c) => Number(c.id) || 0))
  const matchedIds = new Set()
  let adicionadas = 0
  let atualizadas = 0

  const customNext = [...custom]

  for (const item of IGREJAS_LISTA_ADBLU) {
    const base = resolverBaseCatalogoAdblu(item)
    const nomeOficial = formatarNomeAdblu(item.congregacao)
    const endOficial = String(item.endereco || '').trim().replace(/,\s*$/, '')
    const setor = String(item.bairro || item.congregacao || '—').trim() || '—'

    const idx = customNext.findIndex((ig) => {
      if (matchedIds.has(ig.id)) return false
      if (!igrejaElegivelDeParaAdblu(ig, enrich, deParaManual)) return false
      return igrejaMatchItemAdblu(ig, item, enrich)
    })

    const patchCoords = {}
    if (base?.lat != null && base?.lng != null) {
      patchCoords.lat = base.lat
      patchCoords.lng = base.lng
      const idCoord = base.id ?? (idx >= 0 ? customNext[idx].id : null)
      if (idCoord != null) {
        coordsNext[idCoord] = { lat: base.lat, lng: base.lng }
        coordsNext[String(idCoord)] = { lat: base.lat, lng: base.lng }
      }
    }

    if (idx >= 0) {
      const cur = customNext[idx]
      matchedIds.add(cur.id)
      const patch = {
        ...patchOficialAdblu(cur, item, base, forcarOficial),
        ...patchCoords,
      }
      if (cur.endereco !== patch.endereco && patchCoords.lat == null) {
        delete coordsNext[cur.id]
        delete coordsNext[String(cur.id)]
        patch.lat = null
        patch.lng = null
      }
      if (fichaAdbluMudou(cur, patch)) atualizadas++
      customNext[idx] = { ...cur, ...patch }
      continue
    }

    if (!adicionarFaltantes) continue

    const novoId = base?.id ?? (++maxId)
    customNext.push({
      id: novoId,
      nome: nomeOficial,
      setor,
      setorNum: item.setorNum || '',
      regiao: item.regiao || '',
      denominacao: 'Assembleia de Deus',
      endereco: endOficial,
      culto: item.culto || '',
      fonte: 'adblu',
      adbluOficial: true,
      congregacaoAdblu: item.congregacao,
      triagemOk: true,
      foto: base?.foto || '/fotos/sem-foto.jpg',
      pastor1: base?.pastor1 || '',
      pastor2: base?.pastor2 || '',
      esposa1: base?.esposa1 || '',
      esposa2: base?.esposa2 || '',
      ...patchCoords,
    })
    if (patchCoords.lat != null && patchCoords.lng != null) {
      coordsNext[novoId] = { lat: patchCoords.lat, lng: patchCoords.lng }
      coordsNext[String(novoId)] = { lat: patchCoords.lat, lng: patchCoords.lng }
    }
    adicionadas++
  }

  const coordsMudou = JSON.stringify(coordsNext) !== JSON.stringify(coords)
  if (adicionadas || atualizadas || coordsMudou) {
    writeStorage('igrejas_custom', customNext, { force: true })
    if (coordsMudou) writeStorage('geo_coords_igrejas', coordsNext, { force: true })
    invalidateIgrejasCatalogCache()
  }

  return {
    adicionadas,
    atualizadas,
    casadas: matchedIds.size,
    total: IGREJAS_LISTA_ADBLU.length,
    mudou: adicionadas + atualizadas > 0 || coordsMudou,
  }
}

/** De-para: atualiza fichas ADBLU existentes com dados oficiais de adblu.org. */
export function aplicarDeParaAdbluOficial(opts = {}) {
  return sincronizarCatalogoAdbluOficial({
    deParaManual: true,
    forcarOficial: true,
    adicionarFaltantes: opts.adicionarFaltantes ?? !IGREJAS_MAPA_SOMENTE_MANUAL,
    ...opts,
  })
}

/** Catálogo completo: AD base + outras denominações + cadastros manuais (+ culto salvo) */
function buildAllIgrejasCatalog() {
  const overrides = readIgrejasOverrides()
  const enrich = readIgrejasEnrich()
  const coords = readStorage('geo_coords_igrejas', {})
  const attach = (i) => {
    const en = enrich[i.id] || {}
    const { lat, lng } = resolverCoordsIgreja(i, coords, enrich)
    return {
      ...i,
      googlePlaceId: i.googlePlaceId || en.googlePlaceId || '',
      lat,
      lng,
      endereco: resolverEnderecoIgreja(i, enrich),
    }
  }
  const customOnly = readIgrejasCustom()
  const lista = (IGREJAS_MAPA_SOMENTE_MANUAL
    ? customOnly
    : [
      ...catalogoFixoIgrejas().map(i => aplicarOverrideIgreja({
        ...i,
        denominacao: i.denominacao || (Number(i.id) <= 88 ? DENOMINACAO_PADRAO : 'Outra'),
      }, overrides)),
      ...customOnly,
    ]
  ).map(attach)
  const deduped = colapsarIgrejasDuplicadas(lista).lista
  return deduped.filter(ig => eIgrejaCrista(ig) && eIgrejaFichaUtil(ig))
}

export function getMapaBadgeCountFast() {
  if (!_catalogCache) return null
  const visitas = readIgrejasVisitas()
  const visitadas = countIgrejasVisitadas(visitas, _catalogCache)
  return Math.max(0, _catalogCache.length - visitadas)
}

export function getAllIgrejasCatalog() {
  if (!_catalogCache) _catalogCache = buildAllIgrejasCatalog()
  return _catalogCache
}

export function readIgrejasVisitas() {
  return readStorage('igrejas_visitas', {})
}

export function countIgrejasVisitadas(visitas = readIgrejasVisitas(), catalog = null) {
  const ids = new Set((catalog || getAllIgrejasCatalog()).map(i => i.id))
  let n = 0
  for (const id of ids) {
    if (isIgrejaVisitada(visitas[id] ?? visitas[String(id)])) n++
  }
  return n
}

export function igrejasPorSetor(catalog = getAllIgrejasCatalog(), visitas = readIgrejasVisitas()) {
  const map = {}
  catalog.forEach(ig => {
    const setor = ig.setor || '—'
    if (!map[setor]) map[setor] = { nome: setor, qtd: 0, visitadas: 0 }
    map[setor].qtd += 1
    if (visitas[ig.id]) map[setor].visitadas += 1
  })
  return Object.values(map).sort((a, b) => b.qtd - a.qtd)
}

// ── Geocodificação ADBLU (Nominatim) ──────────────────────────────────────────

/** Bounds válidos da região: Blumenau + municípios da ADBLU (Gaspar, Indaial…) */
const BOUNDS_ADBLU = { latMin: -27.15, latMax: -26.50, lngMin: -49.40, lngMax: -48.75 }

function dentroDosBounds({ lat, lng }) {
  return lat > BOUNDS_ADBLU.latMin && lat < BOUNDS_ADBLU.latMax
    && lng > BOUNDS_ADBLU.lngMin && lng < BOUNDS_ADBLU.lngMax
}

const GEO_COORDS_KEY   = 'geo_coords_igrejas'
const ADBLU_GEO_FLAG   = 'adblu_geo_v1_done'
const ADBLU_GEO_PARTIAL = 'adblu_geo_v1_progress'

/** Retorna true se a geocodificação das 88 ADBLU já foi concluída neste dispositivo. */
export function adbluGeocodificacaoCompleta() {
  try { return Boolean(localStorage.getItem(ADBLU_GEO_FLAG)) } catch { return false }
}

/**
 * Geocodifica todas as igrejas ADBLU oficiais via Nominatim em background.
 * Salva em geo_coords_igrejas com _adbluGeo:true para distinguir coords frescas
 * das antigas (Google Places / estimativas manuais incorretas).
 * Chame sem await — roda em background e não bloqueia a UI.
 *
 * @param {(done:number,total:number)=>void} [onProgress] callback de progresso
 * @returns {Promise<number>} quantidade geocodificada com sucesso
 */
export async function geocodificarTodasIgrejasAdblu(onProgress) {
  if (typeof window !== 'undefined') window.__campanhaGeocodificacaoAtiva = true
  const CACHE_KEY = GEO_COORDS_KEY
  let coords = {}
  let progress = {}
  try {
    coords   = JSON.parse(localStorage.getItem(CACHE_KEY)   || '{}')
    progress = JSON.parse(localStorage.getItem(ADBLU_GEO_PARTIAL) || '{}')
  } catch { /* ignore */ }

  const lista = IGREJAS_LISTA_ADBLU
  let ok = 0

  try {
    for (let i = 0; i < lista.length; i++) {
      const item = lista[i]
      const base = resolverBaseCatalogoAdblu(item)
      const id   = base?.id ?? (8800 + i)

      if (progress[id]) { ok++; onProgress?.(ok, lista.length); continue }

      await sleep(1300)

      let result = null
      if (item.endereco?.trim()) {
        result = await geocodeEndereco(item.endereco)
        if (result && !dentroDosBounds(result)) result = null
      }
      if (!result && item.endereco) {
        const semNumero = item.endereco.replace(/,\s*\d+/, '').trim()
        if (semNumero !== item.endereco) {
          result = await geocodeEndereco(semNumero)
          if (result && !dentroDosBounds(result)) result = null
        }
      }
      if (!result) {
        const fallback = `Assembleia de Deus ${item.congregacao}, ${item.bairro}, Blumenau, SC`
        result = await geocodeEndereco(fallback)
        if (result && !dentroDosBounds(result)) result = null
      }

      if (result) {
        coords[id]         = { lat: result.lat, lng: result.lng, _adbluGeo: true }
        coords[String(id)] = { lat: result.lat, lng: result.lng, _adbluGeo: true }
        progress[id] = true
        persistLocalOnly(CACHE_KEY, JSON.stringify(coords))
        persistLocalOnly(ADBLU_GEO_PARTIAL, JSON.stringify(progress))
        ok++
        invalidateIgrejasCatalogCache()
      }

      onProgress?.(ok, lista.length)
    }

    if (ok >= Math.ceil(lista.length * 0.7)) {
      persistLocalOnly(ADBLU_GEO_FLAG, '1')
    }
    try {
      await ensureChurchCatalogSynced({ force: true })
    } catch { /* ignore */ }
    return ok
  } finally {
    if (typeof window !== 'undefined') window.__campanhaGeocodificacaoAtiva = false
  }
}
