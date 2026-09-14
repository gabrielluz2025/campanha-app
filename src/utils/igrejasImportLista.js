/** De-para da planilha BNU → catálogo Google já imputado */

import { IGREJAS_LISTA_BNU, TOTAL_LISTA_BNU } from '../data/igrejasListaBnu'
import { IGREJAS_LISTA_UNIFICADA, TOTAL_LISTA_UNIFICADA, RESUMO_LISTAS } from '../data/igrejasListaUnificada'
import { IGREJAS_LISTA_PAPEL } from '../data/igrejasListaPapel'
import { congregacoesAdCompat, extrairCongregacaoAd } from './igrejasListaMerge'
import {
  resolverNomeDepara,
  eAssembleiaDeDeus,
  formatarNomeAdblu,
  enriquecerComAdblu,
  buscarAdbluPorLocal,
} from './igrejasAdbluNome'
import {
  matchPorEndereco,
  extrairNumeroEndereco,
  ruaCompativel,
  chaveEnderecoIgreja,
} from './igrejaMatch'
import { igrejasSaoDuplicatas } from './igrejaDedupe'
import {
  getAllIgrejasCatalog,
  loadIgrejasCatalog,
  readIgrejasCustom,
  upsertIgrejaOverride,
  purgarCustomDuplicadasSalvas,
  IGREJAS_OVERRIDES_KEY,
} from './igrejasCatalog'
import { readStorage, writeStorage, flushAfterSave } from './persist'
import { formatarCep } from './agendaLocal'
import { eIgrejaCrista } from './igrejaCrista'
import { gerarIdIgrejaCustom } from './igrejaCustomId'
import { readIgrejasEnrich } from './igrejasOverpass'
import { pushChurchCatalogToServer } from '../lib/cloudSync'
import { setCatalogoIgrejasMemoria } from './igrejasGooglePlaces'

const IMPORT_FLAG = 'igrejas_lista_bnu_depara_v1'
const IMPORT_FLAG_PAPEL = 'igrejas_lista_papel_depara_v2'

/** Planilha oficial (275 igrejas). */
export const LISTA_PLANILHA_BNU = IGREJAS_LISTA_BNU
export const LISTA_PLANILHA_UNIFICADA = IGREJAS_LISTA_UNIFICADA
export const TOTAL_LISTA_PLANILHA = TOTAL_LISTA_UNIFICADA
export { TOTAL_LISTA_BNU, TOTAL_LISTA_UNIFICADA, RESUMO_LISTAS }

function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

function extrairNumero(end) {
  return extrairNumeroEndereco(end) || ''
}

function extrairLogradouro(end) {
  let s = String(end || '').split('-')[0].trim()
  s = s.replace(/\bS\s*\/\s*N\b/i, '').replace(/,?\s*\d{1,6}\s*$/, '').trim()
  s = s.replace(/^(RUA|R\.|AVENIDA|AV\.|TRAVESSA|TV\.)\s+/i, '').trim()
  return s
}

function tokensRua(end) {
  return norm(extrairLogradouro(end)).split(/\s+/).filter(t => t.length > 2)
}

function matchPorEnderecoLista(item, catalog) {
  const hit = {
    nome: item.nome,
    endereco: enderecoCompleto(item) || item.endereco,
    lat: item.lat,
    lng: item.lng,
  }
  const m = matchPorEndereco(hit, catalog)
  if (m) return m

  const ch = chaveEnderecoIgreja(hit.endereco)
  if (ch) {
    const porChave = catalog.filter(ig => chaveEnderecoIgreja(ig.endereco) === ch)
    if (porChave.length === 1) return { igreja: porChave[0], motivo: 'endereço-chave' }
  }

  const num = extrairNumero(item.endereco)
  if (!num) {
    const mesmaRua = catalog.filter(ig => ruaCompativel(item.endereco, ig.endereco))
    if (mesmaRua.length === 1) return { igreja: mesmaRua[0], motivo: 'rua-única' }
  }
  return null
}

function nomesParecidos(a, b) {
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  const adA = /ASSEMBLEIA|ADBLU|\bAD\b/.test(na)
  const adB = /ASSEMBLEIA|ADBLU|\bAD\b/.test(nb)
  if (adA && adB) return congregacoesAdCompat(a, b)
  const stop = new Set(['IGREJA', 'TEMPLO', 'COMUNIDADE', 'MINISTERIO', 'DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'A', 'O'])
  const ta = na.split(/\s+/).filter(t => t.length > 2 && !stop.has(t))
  const tb = new Set(nb.split(/\s+/).filter(t => t.length > 2 && !stop.has(t)))
  if (!ta.length) return false
  const hit = ta.filter(t => tb.has(t)).length
  if (ta.length === 1) return hit === 1 && ta[0].length >= 4
  return hit >= 2 && hit / ta.length >= 0.5
}

function enderecoCompleto(item) {
  const end = String(item.endereco || '').trim()
  const bairro = String(item.bairro || '').trim()
  if (!end) return ''
  if (/blumenau/i.test(end)) return end
  return `${end}${bairro ? ` - ${bairro}` : ''}, Blumenau - SC`
}

function vazio(v) {
  return v == null || String(v).trim() === '' || String(v).trim() === '—'
}

function fmtTel(v) {
  const d = String(v || '').replace(/\D/g, '')
  if (d.length < 8) return ''
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return d
}

/**
 * Encontra igreja Google já imputada — prioridade absoluta: endereço.
 */
export function matchListaComCatalogo(item, catalog = []) {
  const preferidos = catalog.filter(ig => ig && (
    ig.adbluOficial
    || ig.fonte === 'google'
    || ig.googlePlaceId
    || Number(ig.id) <= 88
    || Number(ig.id) > 1999
    || ig.fonte === 'adblu'
    || ig.fonte === 'lista-papel'
    || ig.fonte === 'lista-bnu'
  ))
  const base = preferidos.length ? preferidos : catalog

  const porEnd = matchPorEnderecoLista(item, base)
  if (porEnd) return porEnd

  const num = extrairNumero(item.endereco)
  const candidatosEnd = []
  for (const ig of base) {
    const numIg = extrairNumero(ig.endereco)
    if (num && numIg && num === numIg && ruaCompativel(item.endereco, ig.endereco)) {
      candidatosEnd.push(ig)
    }
  }
  if (candidatosEnd.length === 1) {
    return { igreja: candidatosEnd[0], motivo: 'endereço' }
  }
  if (candidatosEnd.length > 1) {
    const porNome = candidatosEnd.filter(ig => nomesParecidos(ig.nome, item.nome))
    if (porNome.length === 1) return { igreja: porNome[0], motivo: 'endereço+nome' }
    return { igreja: candidatosEnd[0], motivo: 'endereço' }
  }

  const mesmoBairro = base.filter(ig => {
    if (!ruaCompativel(item.endereco, ig.endereco)) return false
    const b = norm(item.bairro)
    const setor = norm(ig.setor)
    const end = norm(ig.endereco)
    return !b || setor.includes(b) || end.includes(b) || b.includes(setor)
  })
  if (mesmoBairro.length === 1) return { igreja: mesmoBairro[0], motivo: 'rua+bairro' }

  const congLista = item.congregacao || extrairCongregacaoAd(item.nome)
  if (congLista && congLista.length >= 3) {
    const hitsAd = base.filter((ig) => {
      if (!/ASSEMBLEIA|ADBLU|\bAD\b/i.test(ig.nome || '')) return false
      const cIg = extrairCongregacaoAd(ig.nome) || norm(ig.setor)
      return congregacoesAdCompat(congLista, cIg) || congregacoesAdCompat(congLista, ig.nome)
    })
    if (hitsAd.length === 1) return { igreja: hitsAd[0], motivo: 'congregação ADBLU' }
    if (hitsAd.length > 1 && item.bairro) {
      const b = norm(item.bairro)
      const porSetor = hitsAd.filter(ig => {
        const s = norm(ig.setor)
        return s.includes(b) || b.includes(s) || congregacoesAdCompat(item.bairro, ig.nome)
      })
      if (porSetor.length === 1) return { igreja: porSetor[0], motivo: 'congregação+setor' }
    }
  }

  const porNome = base.filter(ig => nomesParecidos(ig.nome, item.nome))
  const nomeGenAd = /ASSEMBLEIA DE DEUS|ADBLU|MISSOES ADBLU/.test(norm(item.nome))
  if (!nomeGenAd && porNome.length === 1) {
    return { igreja: porNome[0], motivo: 'nome' }
  }

  return null
}

function classificarFonte(lista, catalog) {
  return lista.map((item, idx) => {
    const match = matchListaComCatalogo(item, catalog)
    const ig = match?.igreja
    const nomeDepara = resolverNomeDepara(item, ig)
    const nomeMudou = Boolean(ig && nomeDepara && norm(nomeDepara) !== norm(ig.nome))
    const porEndereco = /endereço|rua-única|endereço-chave/i.test(match?.motivo || '')
    const faltando = []
    if (ig) {
      if (vazio(ig.culto) && item.culto) faltando.push('culto')
      if (vazio(ig.endereco) && item.endereco) faltando.push('endereço')
      if (vazio(ig.cep)) faltando.push('cep')
      if (nomeMudou) faltando.push('nome')
      if (item.pastor && vazio(ig.pastor1)) faltando.push('pastor')
      if (item.telefone && vazio(ig.telefone)) faltando.push('telefone')
      if (porEndereco && item.culto) faltando.push('culto')
      if (porEndereco && item.pastor) faltando.push('pastor')
      if (porEndereco && item.telefone) faltando.push('telefone')
      if (!vazio(item.culto) && !vazio(ig.culto) && norm(item.culto) !== norm(ig.culto)) {
        faltando.push('culto*')
      }
    }
    return {
      key: `${idx}-${norm(item.endereco)}-${norm(item.nome)}`,
      idx,
      ...item,
      nomeDepara,
      enderecoCompleto: enderecoCompleto(item),
      status: match ? 'existe' : 'nova',
      matchId: ig?.id ?? null,
      matchNome: ig?.nome ?? null,
      matchMotivo: match?.motivo ?? null,
      matchEndereco: ig?.endereco ?? null,
      matchCulto: ig?.culto ?? null,
      matchCep: ig?.cep ?? '',
      porEndereco,
      nomeMudou,
      faltando,
      selecionada: true,
      cep: '',
    }
  })
}

export function classificarListaBnu(catalog = null) {
  return classificarFonte(IGREJAS_LISTA_UNIFICADA, catalog || loadIgrejasCatalog())
}

/** Alias — lista unificada (BNU + Xanda + ADBLU). */
export function classificarListaUnificada(catalog = null) {
  return classificarListaBnu(catalog)
}

export function classificarListaPapel(catalog = null) {
  return classificarFonte(IGREJAS_LISTA_PAPEL, catalog || loadIgrejasCatalog())
}

/** Busca CEP pelo logradouro em Blumenau via ViaCEP. */
export async function buscarCepPorEndereco(endereco, { signal } = {}) {
  const logradouro = extrairLogradouro(endereco)
  if (!logradouro || logradouro.length < 3) return ''
  const q = encodeURIComponent(logradouro)
  try {
    const res = await fetch(`https://viacep.com.br/ws/SC/Blumenau/${q}/json/`, { signal })
    const data = await res.json()
    if (Array.isArray(data) && data.length) {
      const num = extrairNumero(endereco)
      const hit = num
        ? data.find(d => String(d.complemento || '').includes(num)) || data[0]
        : data[0]
      return formatarCep(hit?.cep || '')
    }
  } catch { /* ignore */ }
  return ''
}

export async function enriquecerCeps(linhas, { onProgress, signal } = {}) {
  const out = []
  for (let i = 0; i < linhas.length; i++) {
    if (signal?.aborted) break
    const row = { ...linhas[i] }
    if (!row.cep) {
      const cep = await buscarCepPorEndereco(row.enderecoCompleto || row.endereco, { signal })
      row.cep = cep
      if (onProgress) onProgress(i + 1, linhas.length, row)
      await new Promise(r => setTimeout(r, 350))
    }
    out.push(row)
  }
  return out
}

/**
 * Aplica de-para: nome da planilha, pastor, telefone, culto, bairro.
 * Grava no site (MySQL), não só no navegador.
 */
export async function aplicarImportLista(selecionados, {
  atualizarCulto = true,
  atualizarNome = true,
  atualizarSetor = true,
  catalog = null,
  enviarSite = true,
} = {}) {
  const cat = catalog || loadIgrejasCatalog()
  const byId = new Map(cat.map(i => [i.id, i]))
  let custom = readIgrejasCustom()
  let enrich = readIgrejasEnrich()
  let pastores = readStorage('pastores_igrejas', {})
  let coords = readStorage('geo_coords_igrejas', {})
  let maxId = Math.max(2000, ...cat.map(i => Number(i.id) || 0), ...custom.map(i => Number(i.id) || 0))

  let atualizadas = 0
  let nomesCorrigidos = 0
  let novas = 0
  const runtime = []

  for (const row of selecionados) {
    if (!row?.selecionada) continue
    const endOk = enderecoCompleto(row)
    const cepOk = formatarCep(row.cep || '')
    const nomePlanilha = String(row.nomeDepara || resolverNomeDepara(row, byId.get(row.matchId)) || row.nome || '').trim()
    const tel = fmtTel(row.telefone)
    const zap = fmtTel(row.whatsapp)
    const forcarDados = Boolean(row.porEndereco || /endereço|rua-única|endereço-chave/i.test(row.matchMotivo || ''))
    const adbluInfo = buscarAdbluPorLocal({
      endereco: endOk || row.endereco,
      bairro: row.bairro,
      nomeGoogle: byId.get(row.matchId)?.nome,
      nomePlanilha: row.nome,
    })

    if (row.status === 'existe' && row.matchId != null) {
      const ig = byId.get(row.matchId)
      if (!ig) continue
      const patch = {}
      const enrichPatch = {}
      const pastorPatch = {}

      if (atualizarNome && nomePlanilha) {
        patch.nome = nomePlanilha
        if (norm(nomePlanilha) !== norm(ig.nome)) nomesCorrigidos++
      }
      if (eAssembleiaDeDeus(nomePlanilha, row.denominacao) || adbluInfo) {
        patch.denominacao = 'Assembleia de Deus'
      }
      if (endOk && (forcarDados || vazio(ig.endereco) || norm(endOk) !== norm(ig.endereco))) {
        patch.endereco = endOk
      }
      if (cepOk && (forcarDados || vazio(ig.cep))) patch.cep = cepOk
      const setor = String(row.bairro || adbluInfo?.bairro || '').trim()
      if (atualizarSetor && setor) patch.setor = setor
      const cultoFinal = String(row.culto || adbluInfo?.culto || '').trim()
      if (cultoFinal) {
        if (forcarDados || vazio(ig.culto)) patch.culto = cultoFinal
        else if (atualizarCulto && norm(cultoFinal) !== norm(ig.culto || '')) patch.culto = cultoFinal
      }
      if (row.pastor && (forcarDados || vazio(ig.pastor1))) pastorPatch.pastor1 = String(row.pastor).trim()
      if (tel && (forcarDados || vazio(ig.telefone))) enrichPatch.telefone = tel
      if (zap && (forcarDados || vazio(ig.whatsapp))) enrichPatch.whatsapp = zap
      enrichPatch.fonte = row.fonteLista === 'adblu' ? 'adblu'
        : row.fonteLista === 'lista-papel' ? 'lista-papel' : 'lista-bnu'

      const id = ig.id
      if (Object.keys(patch).length) {
        if (Number(id) <= 1999) upsertIgrejaOverride(id, patch)
        else {
          const idx = custom.findIndex(c => c.id === id)
          if (idx >= 0) custom[idx] = { ...custom[idx], ...patch, fonte: custom[idx].fonte || 'google' }
        }
      }
      if (Object.keys(pastorPatch).length) {
        pastores = { ...pastores, [id]: { ...(pastores[id] || {}), ...pastorPatch } }
      }
      if (Object.keys(enrichPatch).length) {
        enrich = { ...enrich, [id]: { ...(enrich[id] || {}), ...enrichPatch } }
      }

      if (Object.keys(patch).length || Object.keys(pastorPatch).length || Object.keys(enrichPatch).length) {
        atualizadas++
        runtime.push({ id, patch: { ...patch, ...enrichPatch, ...pastorPatch } })
      }
      continue
    }

    if (!eIgrejaCrista({ nome: row.nome, denominacao: row.denominacao })) continue

    const candidato = {
      nome: nomePlanilha,
      setor: String(row.bairro || '').trim(),
      endereco: endOk || row.endereco,
    }
    const dupCustom = custom.find(c => igrejasSaoDuplicatas(
      { ...c, endereco: c.endereco || enrich[c.id]?.endereco || '' },
      candidato,
    ))
    if (dupCustom) {
      const patch = {}
      if (endOk && vazio(dupCustom.endereco)) patch.endereco = endOk
      if (nomePlanilha && vazio(dupCustom.nome)) patch.nome = nomePlanilha
      const setor = String(row.bairro || '').trim()
      if (setor && vazio(dupCustom.setor)) patch.setor = setor
      if (Object.keys(patch).length) {
        const idx = custom.findIndex(c => c.id === dupCustom.id)
        if (idx >= 0) custom[idx] = { ...custom[idx], ...patch }
        atualizadas++
      }
      continue
    }

    maxId += 1
    const nova = {
      id: gerarIdIgrejaCustom(),
      nome: nomePlanilha,
      setor: String(row.bairro || '').trim() || '—',
      denominacao: String(row.denominacao || 'Outra').trim() || 'Outra',
      endereco: endOk,
      culto: String(row.culto || '').trim(),
      cep: cepOk,
      telefone: tel,
      whatsapp: zap,
      foto: '/fotos/sem-foto.jpg',
      lat: -26.9194,
      lng: -49.0661,
      pastor1: String(row.pastor || '').trim(),
      esposa1: '', pastor2: '', esposa2: '',
      fonte: row.fonteLista === 'lista-papel' ? 'lista-papel' : 'lista-bnu',
      manter: true,
      triagemOk: true,
    }
    custom = [...custom, nova]
    if (tel || zap) {
      const fonteEnrich = row.fonteLista === 'lista-papel' ? 'lista-papel' : 'lista-bnu'
      enrich = { ...enrich, [maxId]: { telefone: tel, whatsapp: zap, fonte: fonteEnrich } }
    }
    if (row.pastor) {
      pastores = { ...pastores, [maxId]: { pastor1: String(row.pastor).trim() } }
    }
    novas++
    runtime.push({ id: nova.id, patch: nova, nova: true })
  }

  writeStorage('igrejas_custom', custom, { force: true })
  writeStorage('igrejas_enrich', enrich, { force: true })
  writeStorage('pastores_igrejas', pastores, { force: true })
  writeStorage('geo_coords_igrejas', coords, { force: true })
  setCatalogoIgrejasMemoria({ custom, enrich, coords })

  const dupRemovidas = purgarCustomDuplicadasSalvas()
  if (dupRemovidas > 0) {
    custom = readIgrejasCustom()
    enrich = readIgrejasEnrich()
    coords = readStorage('geo_coords_igrejas', {})
    setCatalogoIgrejasMemoria({ custom, enrich, coords })
  }

  let nuvem = { ok: true }
  if (enviarSite) {
    await flushAfterSave()
    nuvem = await pushChurchCatalogToServer({ custom, enrich, coords })
    if (!nuvem?.ok) {
      throw new Error(nuvem.error || 'De-para aplicado localmente, mas não confirmou no site.')
    }
  }

  return {
    atualizadas,
    nomesCorrigidos,
    novas,
    dupRemovidas,
    runtime,
    custom,
    enrich,
    totalCustom: custom.length,
    nuvemOk: Boolean(nuvem?.ok),
    totalSite: nuvem?.server ?? custom.length,
  }
}

export function resumoClassificacao(linhas = []) {
  const existe = linhas.filter(l => l.status === 'existe').length
  const nova = linhas.filter(l => l.status === 'nova').length
  const comCep = linhas.filter(l => l.cep).length
  const nomesMudam = linhas.filter(l => l.nomeMudou).length
  return { total: linhas.length, existe, nova, comCep, nomesMudam }
}

/** Importa fichas de papel (Central + Sul + ADBLU 25–36) com de-para por endereço. */
export async function autoImportarListaPapel({ force = false, catalog = null } = {}) {
  try {
    if (!force && typeof localStorage !== 'undefined' && localStorage.getItem(IMPORT_FLAG_PAPEL) === '1') {
      return { ok: true, skipped: true, atualizadas: 0, novas: 0 }
    }
    const cat = catalog || loadIgrejasCatalog()
    const linhas = classificarListaPapel(cat)
    const selecionados = linhas.filter(l => l.selecionada)
    const res = await aplicarImportLista(selecionados, {
      atualizarCulto: true,
      atualizarNome: true,
      enviarSite: true,
    })
    try { localStorage.setItem(IMPORT_FLAG_PAPEL, '1') } catch { /* ignore */ }
    return {
      ok: true,
      skipped: false,
      ...res,
      total: linhas.length,
      existe: linhas.filter(l => l.status === 'existe').length,
      nova: linhas.filter(l => l.status === 'nova').length,
    }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}

export async function autoImportarListaBnu({ force = false, catalog = null } = {}) {
  try {
    if (!force && typeof localStorage !== 'undefined' && localStorage.getItem(IMPORT_FLAG) === '1') {
      return { ok: true, skipped: true, atualizadas: 0, novas: 0 }
    }
    const linhas = classificarListaBnu(catalog)
    const selecionados = linhas.filter(l => l.status === 'existe' || l.selecionada)
    const res = await aplicarImportLista(selecionados, { atualizarCulto: true, atualizarNome: true })
    try { localStorage.setItem(IMPORT_FLAG, '1') } catch { /* ignore */ }
    return {
      ok: true,
      skipped: false,
      ...res,
      total: linhas.length,
      existe: linhas.filter(l => l.status === 'existe').length,
    }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}

export function jaImportouListaBnu() {
  try { return localStorage.getItem(IMPORT_FLAG) === '1' } catch { return false }
}

export { IGREJAS_OVERRIDES_KEY, getAllIgrejasCatalog } from './igrejasCatalog'
export { IGREJAS_LISTA_PAPEL, TOTAL_LISTA_PAPEL } from '../data/igrejasListaPapel'
