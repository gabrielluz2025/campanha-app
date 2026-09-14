import { montarEnderecoIgreja } from './agendaLocal'
import { DENOMINACAO_PADRAO } from '../constants/igrejasTheme'
import {
  adicionarIgrejaNaBase,
  readIgrejasCustom,
  upsertIgrejaOverride,
  marcarIgrejaOculta,
  invalidateIgrejasCatalogCache,
  IGREJAS_ATUALIZADAS_EVENT,
  analisarDuplicatasIgrejasSalvas,
  aplicarDeparaDuplicatasIgrejasLocal,
} from './igrejasCatalog'
import { readStorage, writeStorage, flushAfterSave, persistLocalOnly } from './persist'
import {
  pushChurchCatalogToServer, withSyncSuppress, readChurchCatalogPayloadFromLocal, cancelChurchCatalogPush,
} from '../lib/cloudSync'
import { sleep } from './geocode'
import { geocodificarFormularioIgreja } from './geoServices'
import {
  geocodeIgrejaPorEndereco,
  igrejaSemPinMapa,
  patchCoordsFalha,
  patchCoordsVerificadas,
  refEnderecoIgreja,
} from './igrejasGeocodeFix'
import { removerIgrejasDeTodasRotas } from './rotaUtils'
import {
  limparTodasVisitasIgrejas,
  removerEntradaHistoricoVisita,
} from './igrejasVisitas'
import { zerarCadastroIgrejasManualmente } from './igrejasReset'
import { CIDADES_IGREJAS_MAPA } from './igrejasFonte'
import { separarIgrejasPorCidadeCampanha } from './igrejaCidade'

export function churchToEditForm(ig) {
  if (!ig) return {}
  return {
    nome: ig.nome || '',
    setor: ig.setor || '',
    denominacao: ig.denominacao || DENOMINACAO_PADRAO,
    endereco: ig.endereco || '',
    culto: ig.culto || '',
    pastor1: ig.pastor1 || '',
    esposa1: ig.esposa1 || '',
    pastor2: ig.pastor2 || '',
    esposa2: ig.esposa2 || '',
    telefone: ig.telefone || '',
    whatsapp: ig.whatsapp || '',
    instagram: ig.instagram || '',
    cep: ig.cep || '',
    logradouro: ig.logradouro || '',
    numero: ig.numero || '',
    bairro: ig.bairro || '',
    cidade: ig.cidade || 'Blumenau',
    uf: ig.uf || 'SC',
    lat: ig.lat != null ? String(ig.lat) : '',
    lng: ig.lng != null ? String(ig.lng) : '',
    gpsManual: false,
  }
}

/** Grava lat/lng em geo_coords_igrejas para o catálogo hidratado (campo + mapa). */
export function persistCoordsGeocodeForm(igId, form, geo, { gpsManual = false } = {}) {
  if (igId == null || !geo?.lat || !geo?.lng) return false
  const lat = Number(geo.lat)
  const lng = Number(geo.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  const igLike = {
    id: igId,
    ...form,
    endereco: montarEnderecoIgreja(form) || String(form.endereco || '').trim(),
  }
  const endRef = refEnderecoIgreja(igLike)
  const store = readStorage('geo_coords_igrejas', {})
  store[String(igId)] = patchCoordsVerificadas(igId, store[String(igId)] || {}, endRef, {
    lat,
    lng,
    gpsManual,
    _ruaConfirmada: gpsManual || !geo.aproximado,
    ...(geo.aproximado && !gpsManual ? { _enderecoGeoAprox: true } : {}),
  })
  withSyncSuppress(() => {
    writeStorage('geo_coords_igrejas', store)
  })
  deferChurchCatalogPush({ coords: store })
  dispatchUpdated({ localEdit: true })
  return true
}

function validarForm(form) {
  const nome = String(form.nome || '').trim()
  if (!nome || nome.length < 2) throw new Error('Informe o nome da igreja.')
  const endereco = montarEnderecoIgreja(form) || String(form.endereco || '').trim()
  if (!endereco || endereco.length < 8) throw new Error('Informe CEP ou endereço completo.')
  return { nome, endereco }
}

function isCustomChurch(id) {
  return readIgrejasCustom().some(c => String(c.id) === String(id))
}

function savePastores(id, form) {
  const map = readStorage('pastores_igrejas', {})
  map[String(id)] = {
    pastor1: String(form.pastor1 || '').trim(),
    esposa1: String(form.esposa1 || '').trim(),
    pastor2: String(form.pastor2 || '').trim(),
    esposa2: String(form.esposa2 || '').trim(),
  }
  writeStorage('pastores_igrejas', map)
}

function dispatchUpdated(detail = {}) {
  invalidateIgrejasCatalogCache()
  try {
    window.dispatchEvent(new CustomEvent(IGREJAS_ATUALIZADAS_EVENT, { detail }))
  } catch { /* ignore */ }
}

/** Atualiza só a igreja editada na memória — evita recarregar milhares de registros. */
export function mergeChurchFromForm(ig, form) {
  if (!ig) return ig
  const nome = String(form.nome || '').trim() || ig.nome
  const endereco = montarEnderecoIgreja(form) || String(form.endereco || '').trim() || ig.endereco
  return {
    ...ig,
    nome,
    setor: String(form.setor || form.bairro || '').trim() || ig.setor,
    denominacao: String(form.denominacao || DENOMINACAO_PADRAO).trim() || ig.denominacao,
    endereco,
    culto: String(form.culto ?? ig.culto ?? '').trim(),
    cep: String(form.cep || '').replace(/\D/g, ''),
    telefone: String(form.telefone || '').trim(),
    whatsapp: String(form.whatsapp || '').trim(),
    instagram: String(form.instagram || '').trim(),
    pastor1: String(form.pastor1 || '').trim(),
    esposa1: String(form.esposa1 || '').trim(),
    pastor2: String(form.pastor2 || '').trim(),
    esposa2: String(form.esposa2 || '').trim(),
    logradouro: String(form.logradouro || ig.logradouro || '').trim(),
    numero: String(form.numero || ig.numero || '').trim(),
    bairro: String(form.bairro || ig.bairro || '').trim(),
    cidade: String(form.cidade || ig.cidade || 'Blumenau').trim(),
    uf: String(form.uf || ig.uf || 'SC').trim(),
  }
}

function deferChurchCatalogPush(payload = null) {
  setTimeout(() => {
    pushChurchCatalogToServer(payload).catch(() => {})
  }, 900)
}

export async function saveChurchFromForm(ig, form) {
  if (!ig?.id) throw new Error('Igreja inválida.')
  const { nome, endereco } = validarForm(form)
  const id = ig.id
  const patch = {
    nome,
    setor: String(form.setor || form.bairro || '').trim() || '—',
    denominacao: String(form.denominacao || DENOMINACAO_PADRAO).trim() || DENOMINACAO_PADRAO,
    endereco,
    culto: String(form.culto || '').trim(),
    cep: String(form.cep || '').replace(/\D/g, ''),
    telefone: String(form.telefone || '').trim(),
    whatsapp: String(form.whatsapp || '').trim(),
    instagram: String(form.instagram || '').trim(),
  }

  let pushPayload = null
  withSyncSuppress(() => {
    savePastores(id, form)
    pushPayload = { pastores: readStorage('pastores_igrejas', {}) }
    if (isCustomChurch(id)) {
      const custom = readIgrejasCustom().map(c => {
        if (String(c.id) !== String(id)) return c
        return {
          ...c,
          ...patch,
          logradouro: String(form.logradouro || c.logradouro || '').trim(),
          numero: String(form.numero || c.numero || '').trim(),
          bairro: String(form.bairro || c.bairro || patch.setor || '').trim(),
          cidade: String(form.cidade || c.cidade || 'Blumenau').trim(),
          uf: String(form.uf || c.uf || 'SC').trim(),
          pastor1: String(form.pastor1 || '').trim(),
          esposa1: String(form.esposa1 || '').trim(),
          pastor2: String(form.pastor2 || '').trim(),
          esposa2: String(form.esposa2 || '').trim(),
          atualizadoEm: new Date().toISOString(),
        }
      })
      writeStorage('igrejas_custom', custom)
      pushPayload.custom = custom
    } else {
      upsertIgrejaOverride(id, patch)
      pushPayload.overrides = readStorage('igrejas_overrides', {})
    }
  })

  deferChurchCatalogPush(pushPayload)
  dispatchUpdated({ localEdit: true })

  if (form.gpsManual && form.lat !== '' && form.lng !== '') {
    persistCoordsGeocodeForm(
      id,
      { ...form, endereco },
      { lat: Number(form.lat), lng: Number(form.lng), aproximado: false },
      { gpsManual: true },
    )
  } else {
    const geo = await geocodificarFormularioIgreja({ ...form, endereco })
    if (geo) persistCoordsGeocodeForm(id, { ...form, endereco }, geo)
  }
  return true
}

export async function addChurchFromForm(form) {
  const endereco = montarEnderecoIgreja(form) || String(form.endereco || '').trim()
  let nova
  let pushPayload = null
  cancelChurchCatalogPush()
  nova = adicionarIgrejaNaBase({ ...form, endereco })
  withSyncSuppress(() => {
    savePastores(nova.id, form)
  })
  pushPayload = readChurchCatalogPayloadFromLocal()
  invalidateIgrejasCatalogCache()
  dispatchUpdated({ localEdit: true })
  if (typeof window !== 'undefined') window.__campanhaUltimoCadastroIgreja = Date.now()
  await flushAfterSave()
  const nuvem = await pushChurchCatalogToServer(pushPayload)
  if (!nuvem?.ok) {
    const err = nuvem?.error || 'Não sincronizou com o site. A igreja ficou salva neste aparelho — verifique login e internet.'
    try { window.dispatchEvent(new CustomEvent('campanha:sync-erro', { detail: { message: err } })) } catch { /* ignore */ }
  }
  const geo = await geocodificarFormularioIgreja({ ...form, endereco })
  if (geo) persistCoordsGeocodeForm(nova.id, { ...form, endereco }, geo)
  return nova
}

export async function geocodeAndSaveChurch(ig) {
  if (!ig?.id) return null
  const coords = await geocodeIgrejaPorEndereco(ig)
  if (!coords?.lat || !coords?.lng) throw new Error('Não foi possível localizar o endereço no mapa.')
  const geo = readStorage('geo_coords_igrejas', {})
  const endRef = refEnderecoIgreja(ig)
  geo[String(ig.id)] = patchCoordsVerificadas(ig.id, geo[String(ig.id)] || {}, endRef, {
    lat: coords.lat,
    lng: coords.lng,
    ...coords,
  })
  withSyncSuppress(() => {
    writeStorage('geo_coords_igrejas', geo)
  })
  deferChurchCatalogPush({ coords: geo })
  dispatchUpdated({ localEdit: true })
  return coords
}

const GEO_LOTE_DELAY_MS = 900
/** Grava local a cada N — sem eventos de UI até o fim do lote. */
const GEO_LOTE_PUSH_CADA = 25

/**
 * Geocodifica igrejas sem pin no mapa (Nominatim), uma por vez.
 * @param {object[]} igrejas
 * @param {{ onProgress?, signal? }} [opts]
 */
export async function geocodificarIgrejasSemPin(igrejas, { onProgress, signal } = {}) {
  const lista = (Array.isArray(igrejas) ? igrejas : []).filter(ig => ig?.id && igrejaSemPinMapa(ig))
  const total = lista.length
  let ok = 0
  let fail = 0
  let geo = readStorage('geo_coords_igrejas', {})
  let dirty = false
  let sincePush = 0

  const persistLocal = () => {
    if (!dirty) return
    persistLocalOnly('geo_coords_igrejas', geo)
    dirty = false
  }

  const persistFinal = async () => {
    if (dirty) {
      writeStorage('geo_coords_igrejas', geo)
      dirty = false
    }
    if (!ok && !fail) return
    invalidateIgrejasCatalogCache()
    await pushChurchCatalogToServer().catch(() => {})
    flushAfterSave()
    dispatchUpdated()
  }

  if (typeof window !== 'undefined') window.__campanhaGeocodificacaoAtiva = true
  try {
    for (let i = 0; i < lista.length; i++) {
      if (signal?.aborted) break
      const ig = lista[i]
      await sleep(GEO_LOTE_DELAY_MS)
      if (signal?.aborted) break

      const endRef = refEnderecoIgreja(ig)
      try {
        const coords = await geocodeIgrejaPorEndereco(ig)
        if (coords?.lat && coords?.lng) {
          geo[String(ig.id)] = patchCoordsVerificadas(ig.id, geo[String(ig.id)] || {}, endRef, {
            lat: coords.lat,
            lng: coords.lng,
            ...coords,
          })
          ok++
        } else {
          geo[String(ig.id)] = patchCoordsFalha(ig.id, endRef)
          fail++
        }
      } catch {
        geo[String(ig.id)] = patchCoordsFalha(ig.id, endRef)
        fail++
      }

      dirty = true
      sincePush++
      if (sincePush >= GEO_LOTE_PUSH_CADA) {
        persistLocal()
        sincePush = 0
      }
      onProgress?.({ done: i + 1, total, ok, fail, current: ig })
    }
  } finally {
    try {
      await persistFinal()
    } catch { /* ignore */ }
    if (typeof window !== 'undefined') window.__campanhaGeocodificacaoAtiva = false
  }

  return { ok, fail, total, cancelled: Boolean(signal?.aborted) }
}

export function setChurchNota(id, nota) {
  const notas = readStorage('igrejas_notas', {})
  const t = String(nota || '').trim()
  if (!t) delete notas[String(id)]
  else notas[String(id)] = t
  writeStorage('igrejas_notas', notas)
  flushAfterSave()
}

export function setChurchPrioridade(id, prioridade) {
  const prios = readStorage('igrejas_prioridades', {})
  const p = String(prioridade || '').trim()
  if (!p || p === 'media') delete prios[String(id)]
  else prios[String(id)] = p
  writeStorage('igrejas_prioridades', prios)
  flushAfterSave()
}

export async function removeChurchFromCatalog(ig) {
  if (!ig?.id) return
  const id = ig.id
  let pushPayload = null
  withSyncSuppress(() => {
    if (isCustomChurch(id)) {
      const custom = readIgrejasCustom().filter(c => String(c.id) !== String(id))
      writeStorage('igrejas_custom', custom)
      writeStorage('igrejas_enrich', limparChavesIgrejas(readStorage('igrejas_enrich', {}), [id]))
      writeStorage('geo_coords_igrejas', limparChavesIgrejas(readStorage('geo_coords_igrejas', {}), [id]))
      writeStorage('pastores_igrejas', limparChavesIgrejas(readStorage('pastores_igrejas', {}), [id]))
      writeStorage('igrejas_overrides', limparChavesIgrejas(readStorage('igrejas_overrides', {}), [id]))
    } else {
      marcarIgrejaOculta(id)
    }
    removerIgrejasDeTodasRotas([id])
  })
  pushPayload = isCustomChurch(id)
    ? readChurchCatalogPayloadFromLocal()
    : { ocultas: readStorage('igrejas_ocultas', []) }
  deferChurchCatalogPush(pushPayload)
  dispatchUpdated({ localEdit: true, removed: id })
}

export async function clearAllVisits() {
  await limparTodasVisitasIgrejas()
  dispatchUpdated()
}

export async function clearAllChurches() {
  const result = await zerarCadastroIgrejasManualmente()
  dispatchUpdated()
  return result
}

function limparChavesIgrejas(obj, ids) {
  const next = { ...(obj && typeof obj === 'object' ? obj : {}) }
  for (const id of ids) {
    delete next[id]
    delete next[String(id)]
  }
  return next
}

/** Apaga do cadastro (local + nuvem) igrejas fora de Blumenau, Gaspar e Indaial. */
export async function purgarIgrejasForaCidadesCampanha(cidades = CIDADES_IGREJAS_MAPA) {
  const custom = readIgrejasCustom()
  const { manter, fora } = separarIgrejasPorCidadeCampanha(custom, cidades)
  if (!fora.length) {
    return { removidas: 0, mantidas: manter.length, nuvemOk: true }
  }

  const ids = fora.map(i => String(i.id))
  let pushPayload = null

  const { cancelChurchCatalogPush } = await import('../lib/cloudSync')
  cancelChurchCatalogPush()
  if (typeof window !== 'undefined') window.__campanhaIgrejasClearing = true

  try {
    withSyncSuppress(() => {
      writeStorage('igrejas_custom', manter)
      writeStorage('igrejas_enrich', limparChavesIgrejas(readStorage('igrejas_enrich', {}), ids))
      writeStorage('geo_coords_igrejas', limparChavesIgrejas(readStorage('geo_coords_igrejas', {}), ids))
      writeStorage('pastores_igrejas', limparChavesIgrejas(readStorage('pastores_igrejas', {}), ids))
      writeStorage('igrejas_overrides', limparChavesIgrejas(readStorage('igrejas_overrides', {}), ids))
      writeStorage('igrejas_visitas', limparChavesIgrejas(readStorage('igrejas_visitas', {}), ids))
      writeStorage('igrejas_notas', limparChavesIgrejas(readStorage('igrejas_notas', {}), ids))
      writeStorage('igrejas_prioridades', limparChavesIgrejas(readStorage('igrejas_prioridades', {}), ids))
      removerIgrejasDeTodasRotas(ids)
    })
    pushPayload = readChurchCatalogPayloadFromLocal()

    await flushAfterSave()
    const nuvem = await pushChurchCatalogToServer(pushPayload)
    dispatchUpdated({ localEdit: true })
    return {
      removidas: fora.length,
      mantidas: manter.length,
      nuvemOk: Boolean(nuvem?.ok),
      nuvemError: nuvem?.error || '',
    }
  } finally {
    if (typeof window !== 'undefined') window.__campanhaIgrejasClearing = false
  }
}

/** Detecta duplicatas (mesmo endereço, Google Place, ADBLU, etc.) sem gravar. */
export function listarDuplicatasIgrejasCadastro() {
  return analisarDuplicatasIgrejasSalvas()
}

/** Alinha cadastro com adblu.org: de-para, remove lixo e duplicatas, grava na nuvem. */
export async function purificarCadastroAdbluOficial(opts = {}) {
  const { reconstruirCadastroOficialAdbluLocal } = await import('./igrejasPurificarAdblu')

  let pushPayload = null
  const { cancelChurchCatalogPush } = await import('../lib/cloudSync')
  cancelChurchCatalogPush()
  if (typeof window !== 'undefined') window.__campanhaIgrejasClearing = true

  try {
    let result = null
    withSyncSuppress(() => {
      result = reconstruirCadastroOficialAdbluLocal()
    })
    persistLocalOnly('igrejas_catalogo_adblu_v', 2)
    pushPayload = readChurchCatalogPayloadFromLocal()
    await flushAfterSave()
    const nuvem = await pushChurchCatalogToServer(pushPayload)
    dispatchUpdated({ localEdit: true })
    invalidateIgrejasCatalogCache()
    return {
      ...result,
      depara: { adicionadas: 0, atualizadas: result.depois, casadas: result.depois },
      removidasInvalidas: result.removidas,
      removidasForaLista: 0,
      dedupe: 0,
      nuvemOk: Boolean(nuvem?.ok),
      nuvemError: nuvem?.error || '',
    }
  } finally {
    if (typeof window !== 'undefined') window.__campanhaIgrejasClearing = false
  }
}

/** Aplica de-para: funde duplicatas, migra visitas e grava local + nuvem. */
export async function aplicarDeparaDuplicatasIgrejasCadastro() {
  const analise = analisarDuplicatasIgrejasSalvas()
  if (!analise.duplicateCount) {
    return { removidas: 0, mantidas: analise.total, depara: [], nuvemOk: true }
  }

  let pushPayload = null
  const { cancelChurchCatalogPush } = await import('../lib/cloudSync')
  cancelChurchCatalogPush()
  if (typeof window !== 'undefined') window.__campanhaIgrejasClearing = true

  try {
    let result = { removidos: [], removidas: 0, mantidas: analise.total }
    withSyncSuppress(() => {
      result = aplicarDeparaDuplicatasIgrejasLocal()
    })
    pushPayload = readChurchCatalogPayloadFromLocal()
    await flushAfterSave()
    const nuvem = await pushChurchCatalogToServer(pushPayload)
    dispatchUpdated({ localEdit: true })
    return {
      removidas: result.removidas,
      mantidas: result.mantidas,
      depara: (result.removidos || []).map(r => ({
        id: r.id,
        nome: r.nome,
        keeperId: r.keeperId,
        keeperNome: r.keeperNome,
      })),
      nuvemOk: Boolean(nuvem?.ok),
      nuvemError: nuvem?.error || '',
    }
  } finally {
    if (typeof window !== 'undefined') window.__campanhaIgrejasClearing = false
  }
}

export function removeVisitHistoryEntry(churchId, entryId) {
  const reg = removerEntradaHistoricoVisita(churchId, entryId)
  flushAfterSave()
  dispatchUpdated()
  return reg
}
