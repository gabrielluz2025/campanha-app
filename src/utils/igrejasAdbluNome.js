/** Nome oficial ADBLU e resolução de congregação por endereço/setor. */

import { IGREJAS_LISTA_ADBLU } from '../data/igrejasListaAdblu'
import { extrairCongregacaoAd } from './igrejasListaMerge'
import {
  chaveEnderecoIgreja,
  extrairNumeroEndereco,
  ruaCompativel,
  matchPorEndereco,
} from './igrejaMatch'

function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

/** Cidades da lista oficial ADBLU (Blumenau e região). */
const CIDADES_ADBLU = new Set(['BLUMENAU', 'GASPAR', 'INDAIAL'])

/** ADBLU só existe em Santa Catarina (Blumenau, Gaspar, Indaial). Rejeita Fortaleza-CE etc. */
export function enderecoEhRegiaoAdblu(endereco = '') {
  const raw = String(endereco || '').trim()
  if (!raw) return false
  const e = norm(raw)
  const ufFinal = raw.match(/-\s*([A-Za-z]{2})\s*(?:,\s*\d{5}|$)/)
    || raw.match(/,\s*([A-Za-z]{2})\s*$/)
  if (ufFinal) {
    if (ufFinal[1].toUpperCase() !== 'SC') return false
  } else if (!/\bSC\b|SANTA CATARINA/.test(e)) {
    return false
  }
  for (const cidade of CIDADES_ADBLU) {
    if (e.includes(cidade)) return true
  }
  return false
}

/** Remove prefixo ADBLU indevido e reconstrói nome legível. */
export function reverterNomeSemAdblu(nome = '') {
  let n = String(nome || '').trim()
  if (!n) return ''
  n = n.replace(/^Assembleia de Deus\s+ADBLU\s+/i, 'Assembleia de Deus ')
  n = n.replace(/^(?:IE)?ADBLU\s*[-–]\s*/i, '')
  n = n.replace(/^ADBLU\s+/i, '')
  n = n.replace(/^Ad[Bb]lu\s+/i, '')
  n = n.replace(/\s+ADBLU\s+/gi, ' ')
  n = n.replace(/\bADBLU\b/gi, '')
  n = n.replace(/\s{2,}/g, ' ').trim()
  if (!n) return 'Assembleia de Deus'
  if (/^Assembleia de Deus\s*$/i.test(n)) return 'Assembleia de Deus'
  if (!/^Assembleia/i.test(n) && !/^Igreja/i.test(n)) {
    n = `Assembleia de Deus ${n}`
  }
  return n
}

export function formatarNomeAdblu(congregacao) {
  const c = String(congregacao || '').trim()
  if (!c) return ''
  if (/^ASSEMBLEIA DE DEUS ADBLU/i.test(c)) return c
  return `Assembleia de Deus ADBLU ${c}`
}

export function eAssembleiaDeDeus(nome = '', denominacao = '') {
  const blob = norm(`${nome} ${denominacao}`)
  return /ASSEMBLEIA|ADBLU|\bAD\b|MISSOES ADBLU/.test(blob)
}

export function jaTemNomeAdblu(nome = '') {
  return /ASSEMBLEIA DE DEUS ADBLU/i.test(String(nome || ''))
}

/** IEADBLU, ADBLU - X, Adblu X, Assembleia de Deus ADBLU X… */
export function eProvavelAdblu(ig) {
  const nome = String(ig?.nome || '')
  const blob = norm(`${nome} ${ig?.denominacao || ''}`)
  if (/IEADBLU|\bADBLU\b|ASSEMBLEIA DE DEUS ADBLU|MISSOES ADBLU/i.test(blob)) return true
  if (/^ADBLU\s*[-–]/i.test(nome.trim())) return true
  if (/^ADBLU\s+\S/i.test(nome.trim())) return true
  return false
}

export function extrairCongregacaoDoNome(nome = '', setor = '') {
  const n = String(nome || '').trim()
  let m = n.match(/ASSEMBLEIA DE DEUS ADBLU\s+(.+)/i)
  if (m) return m[1].trim()
  m = n.match(/^(?:IE)?ADBLU\s*[-–]\s*(.+)$/i)
  if (m) return m[1].trim()
  m = n.match(/^ADBLU\s+(.+)$/i)
  if (m) return m[1].trim()
  m = n.match(/^Adblu\s+(.+)$/i)
  if (m) return m[1].trim()
  if (/IEADBLU/i.test(n) && setor) return String(setor).trim()
  const c = extrairCongregacaoAd(nome)
  return c || ''
}

function nomeSemAdblu(nome = '') {
  const n = String(nome || '').trim()
  return n && !jaTemNomeAdblu(n) && !eProvavelAdblu({ nome: n })
}

export function corrigirNomeAdbluIndevido(ig) {
  if (!ig || nomeImpedeAdbluAuto(ig.nome)) return { ig, mudou: false }

  const endereco = String(ig.endereco || '').trim()
  const temAdbluNoNome = jaTemNomeAdblu(ig.nome) || eProvavelAdblu(ig)
  const naRegiao = enderecoEhRegiaoAdblu(endereco)

  if (temAdbluNoNome && (!endereco || !naRegiao)) {
    const nomeOrig = String(ig.nomeOriginal || ig.nomeGoogle || '').trim()
    const novoNome = nomeSemAdblu(nomeOrig) ? nomeOrig : reverterNomeSemAdblu(ig.nome)
    if (norm(novoNome) === norm(ig.nome)) return { ig, mudou: false }
    return {
      ig: { ...ig, nome: novoNome, denominacao: ig.denominacao || 'Assembleia de Deus' },
      mudou: true,
    }
  }

  const hit = naRegiao
    ? buscarAdbluPorLocal({
      endereco,
      bairro: ig.setor,
      nomeGoogle: ig.nomeGoogle,
      nomePlanilha: ig.nome,
    })
    : null
  if (hit?.congregacao) {
    const nome = formatarNomeAdblu(hit.congregacao)
    if (norm(nome) === norm(ig.nome)) {
      return { ig: { ...ig, denominacao: 'Assembleia de Deus' }, mudou: false }
    }
    return { ig: { ...ig, nome, denominacao: 'Assembleia de Deus' }, mudou: true }
  }

  if (!temAdbluNoNome) return { ig, mudou: false }

  const nomeOrig = String(ig.nomeOriginal || ig.nomeGoogle || '').trim()
  if (nomeSemAdblu(nomeOrig)) {
    return { ig: { ...ig, nome: nomeOrig, denominacao: ig.denominacao || 'Assembleia de Deus' }, mudou: true }
  }
  const revertido = reverterNomeSemAdblu(ig.nome)
  if (norm(revertido) !== norm(ig.nome)) {
    return { ig: { ...ig, nome: revertido, denominacao: ig.denominacao || 'Assembleia de Deus' }, mudou: true }
  }
  return { ig, mudou: false }
}

/** Só renomeia quando o endereço bate com a lista oficial ADBLU; senão reverte nome indevido. */
export function normalizarNomeIgrejaAdblu(ig) {
  return corrigirNomeAdbluIndevido(ig).ig
}

export function corrigirListaNomesAdblu(lista = []) {
  let mudou = false
  const out = (lista || []).map((ig) => {
    const r = corrigirNomeAdbluIndevido(ig)
    if (r.mudou) mudou = true
    return r.ig
  })
  return { lista: out, mudou }
}

export function normalizarListaIgrejasAdblu(lista = []) {
  return (lista || []).map(ig => (eProvavelAdblu(ig) ? normalizarNomeIgrejaAdblu(ig) : ig))
}

let _indice = null

function indiceAdblu() {
  if (_indice) return _indice
  const porCong = new Map()
  const porBairro = new Map()
  const porChaveEnd = new Map()
  for (const item of IGREJAS_LISTA_ADBLU) {
    const cong = String(item.congregacao || extrairCongregacaoAd(item.nome) || '').trim()
    if (cong) porCong.set(norm(cong), item)
    const b = norm(item.bairro)
    if (b) {
      if (!porBairro.has(b)) porBairro.set(b, [])
      porBairro.get(b).push(item)
    }
    const ch = chaveEnderecoIgreja(item.endereco)
    if (ch) porChaveEnd.set(ch, item)
  }
  _indice = { porCong, porBairro, porChaveEnd, lista: IGREJAS_LISTA_ADBLU }
  return _indice
}

const NAO_ADBLU_AUTO = /MADUREIRA|MINISTERIO MADUREIRA|PRIMITIVA|TRINDADE MISSION|INDEPENDENTE|MISSOES ADBLU/i

function nomeImpedeAdbluAuto(nome = '') {
  return NAO_ADBLU_AUTO.test(norm(nome))
}

export function buscarAdbluPorLocal({ endereco = '', bairro = '', nomeGoogle = '', nomePlanilha = '' } = {}) {
  if (nomeImpedeAdbluAuto(nomePlanilha) || nomeImpedeAdbluAuto(nomeGoogle)) return null

  const end = String(endereco || '').trim()
  if (!end || !enderecoEhRegiaoAdblu(end)) return null

  const idx = indiceAdblu()
  const ch = chaveEnderecoIgreja(end)

  if (ch && idx.porChaveEnd.has(ch)) return idx.porChaveEnd.get(ch)

  const num = extrairNumeroEndereco(end)
  const hits = idx.lista.filter((a) => {
    if (!a.endereco) return false
    const chA = chaveEnderecoIgreja(a.endereco)
    if (ch && chA && ch === chA) return true
    const numA = extrairNumeroEndereco(a.endereco)
    if ((num === 'SN' || numA === 'SN') && ruaCompativel(end, a.endereco)) {
      return num === 'SN' && numA === 'SN'
    }
    if (!num || num === 'SN' || !numA || numA === 'SN') return false
    return ruaCompativel(end, a.endereco) && numA === num
  })
  if (hits.length === 1) return hits[0]

  return null
}

/**
 * Nome final no de-para: planilha oficial ou ADBLU quando for congregação ADBLU no mesmo endereço.
 */
export function resolverNomeDepara(row, igCatalog = null) {
  const nomePlanilha = String(row?.nome || '').trim()
  const nomeGoogle = String(igCatalog?.nome || '').trim()
  const endRef = String(row?.endereco || igCatalog?.endereco || '').trim()

  if (row?.fonteLista === 'adblu' && row?.congregacao && enderecoEhRegiaoAdblu(endRef)) {
    const adblu = buscarAdbluPorLocal({ endereco: endRef, nomePlanilha: row.nome })
    if (adblu?.congregacao) return formatarNomeAdblu(adblu.congregacao)
  }

  const ehAd = eAssembleiaDeDeus(nomePlanilha, row?.denominacao)
    || eAssembleiaDeDeus(nomeGoogle, igCatalog?.denominacao)

  if (endRef && enderecoEhRegiaoAdblu(endRef)) {
    const adblu = buscarAdbluPorLocal({
      endereco: endRef,
      nomeGoogle,
      nomePlanilha,
    })
    if (adblu?.congregacao) return formatarNomeAdblu(adblu.congregacao)
  }

  if (ehAd && jaTemNomeAdblu(nomeGoogle) && enderecoEhRegiaoAdblu(endRef)) {
    return nomeGoogle
  }

  return nomePlanilha
}

/** Enriquece item da lista unificada com culto/setor ADBLU quando há endereço. */
export function enriquecerComAdblu(item) {
  if (!item || item.fonteLista === 'adblu') return item
  if (!eAssembleiaDeDeus(item.nome, item.denominacao) && item.fonteLista !== 'xanda') return item
  if (!enderecoEhRegiaoAdblu(item.endereco)) return item
  const adblu = buscarAdbluPorLocal({
    endereco: item.endereco,
    bairro: item.bairro,
    nomeGoogle: item.nome,
    nomePlanilha: item.nome,
  })
  if (!adblu) return item
  return {
    ...item,
    congregacao: adblu.congregacao,
    culto: item.culto || adblu.culto,
    bairro: item.bairro || adblu.bairro,
    denominacao: 'Assembleia de Deus',
    nomeAdblu: formatarNomeAdblu(adblu.congregacao),
    fontes: [...new Set([...(item.fontes || [item.fonteLista]), 'adblu'].filter(Boolean))],
  }
}

/** Igreja na lista oficial ADBLU (cadastro oficial ou match por endereço em SC). */
export function eIgrejaAdblu(ig) {
  if (!ig) return false
  if (ig.adbluOficial || String(ig.fonte || '').toLowerCase() === 'adblu') return true
  const endereco = String(ig.endereco || '').trim()
  if (!enderecoEhRegiaoAdblu(endereco)) return false
  return Boolean(buscarAdbluPorLocal({
    endereco,
    bairro: ig.setor,
    nomeGoogle: ig.nomeGoogle,
    nomePlanilha: ig.nome,
  }))
}

export function enderecosCorrespondemAdblu(a, b) {
  const ea = String(a || '').trim().replace(/,\s*$/, '')
  const eb = String(b || '').trim().replace(/,\s*$/, '')
  if (!ea || !eb) return false
  const chA = chaveEnderecoIgreja(ea)
  const chB = chaveEnderecoIgreja(eb)
  if (chA && chB && chA === chB) return true
  const na = extrairNumeroEndereco(ea)
  const nb = extrairNumeroEndereco(eb)
  if (na === 'SN' && nb === 'SN' && ruaCompativel(ea, eb)) return true
  if (!na || !nb || na === 'SN' || nb === 'SN') return false
  return na === nb && ruaCompativel(ea, eb)
}

export function igrejaCorrespondeAdblu(ig, item) {
  if (!ig || !item) return false
  const end = String(ig.endereco || '').trim()
  if (!end) return false
  const hit = buscarAdbluPorLocal({
    endereco: end,
    bairro: ig.setor,
    nomePlanilha: ig.nome,
  })
  if (hit && norm(hit.congregacao) === norm(item.congregacao)) return true
  return enderecosCorrespondemAdblu(end, item.endereco)
}

/** Busca congregação oficial pelo nome/setor (de-para quando o endereço importado está errado). */
export function buscarAdbluPorCongregacao(nome = '', setor = '', congregacaoAdblu = '') {
  const idx = indiceAdblu()
  const cong = norm(
    String(congregacaoAdblu || '').trim()
    || extrairCongregacaoDoNome(nome, setor)
    || String(setor || '').trim(),
  )
  if (!cong) return null
  if (idx.porCong.has(cong)) return idx.porCong.get(cong)
  for (const [k, item] of idx.porCong) {
    if (k === cong) return item
    if (k.length >= 4 && cong.length >= 4 && (k.includes(cong) || cong.includes(k))) return item
  }
  return null
}

/** Casa igreja salva (manual ou adblu) com item oficial adblu.org. */
export function igrejaMatchItemAdblu(ig, item, enrich = {}) {
  if (!ig || !item) return false
  const en = enrich[ig.id] || enrich[String(ig.id)] || {}
  const candidato = {
    ...ig,
    endereco: String(ig.endereco || en.endereco || '').trim(),
  }
  const congItem = norm(item.congregacao)
  const congIg = norm(
    String(candidato.congregacaoAdblu || '').trim()
    || extrairCongregacaoDoNome(candidato.nome, candidato.setor),
  )
  if (congIg && congItem) {
    if (congIg === congItem) return true
    if (congIg.length >= 4 && congItem.length >= 4 && (congIg.includes(congItem) || congItem.includes(congIg))) {
      return true
    }
  }
  const hitCong = buscarAdbluPorCongregacao(candidato.nome, candidato.setor, candidato.congregacaoAdblu)
  if (hitCong && norm(hitCong.congregacao) === congItem) return true
  if (candidato.endereco) {
    const hitEnd = buscarAdbluPorLocal({
      endereco: candidato.endereco,
      bairro: candidato.setor,
      nomePlanilha: candidato.nome,
    })
    if (hitEnd && norm(hitEnd.congregacao) === congItem) return true
  }
  return igrejaCorrespondeAdblu(candidato, item)
}

export function pinVariantIgreja(ig) {
  return eIgrejaAdblu(ig) ? 'adblu' : 'outras'
}

export function contarIgrejasAdbluOutras(igrejas = []) {
  let adblu = 0
  for (const ig of igrejas || []) {
    if (eIgrejaAdblu(ig)) adblu++
  }
  const total = (igrejas || []).length
  return { adblu, outras: Math.max(0, total - adblu), total }
}

export { matchPorEndereco, chaveEnderecoIgreja, extrairNumeroEndereco, ruaCompativel }
