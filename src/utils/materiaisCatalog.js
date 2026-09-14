/** Materiais padrão de campanha (sem preço; nomes do material). */

import { writeStorage, readStorage } from './persist'

export const MATERIAIS_PADRAO = [
  { nome: 'PARACHOQUE', categoria: 'Parachoque', quantidade: 3000, estoqueMinimo: 0 },
  { nome: 'BOTTON', categoria: 'Botton', quantidade: 5000, estoqueMinimo: 0 },
  { nome: 'PERFURADO REDONDO', categoria: 'Perfurado', quantidade: 3000, estoqueMinimo: 0 },
  { nome: 'PERFURADO REDONDO COMBINADO', categoria: 'Perfurado', quantidade: 0, estoqueMinimo: 0 },
  { nome: 'PARABRISA', categoria: 'Parabrisa', quantidade: 400, estoqueMinimo: 0 },
  { nome: 'PARABRISA COMBINADO', categoria: 'Parabrisa', quantidade: 0, estoqueMinimo: 0 },
  { nome: 'WIND BANNER', categoria: 'Wind banner', quantidade: 0, estoqueMinimo: 0 },
  { nome: 'BANDEIRA', categoria: 'Bandeira', quantidade: 0, estoqueMinimo: 0 },
  { nome: 'CARTA BLUMENAU', categoria: 'Carta', quantidade: 0, estoqueMinimo: 0 },
  { nome: 'CARTA SANTA CATARINA', categoria: 'Carta', quantidade: 0, estoqueMinimo: 0 },
]

export const MATERIAIS_REMOVIDOS_KEY = 'materiais_removidos'

export function normNomeMaterial(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Aliases antigos → nome atual (migração). */
const ALIASES = {
  'parachoque': 'PARACHOQUE',
  'botton': 'BOTTON',
  'perfurado redondo': 'PERFURADO REDONDO',
  'perfurado redondo combinado': 'PERFURADO REDONDO COMBINADO',
  'parabrisa': 'PARABRISA',
  'parabrisa combinado': 'PARABRISA COMBINADO',
  'wind banner': 'WIND BANNER',
  'bandeira': 'BANDEIRA',
  'carta blumenau': 'CARTA BLUMENAU',
  'carta santa catarina': 'CARTA SANTA CATARINA',
}

function chaveNome(nome) {
  const n = normNomeMaterial(nome)
  return normNomeMaterial(ALIASES[n] || nome)
}

export function loadMateriaisRemovidos() {
  const raw = readStorage(MATERIAIS_REMOVIDOS_KEY, [])
  return Array.isArray(raw) ? raw.map(String).filter(Boolean) : []
}

function gravarRemovidos(lista) {
  const uniq = [...new Set((lista || []).map(String).filter(Boolean))]
  writeStorage(MATERIAIS_REMOVIDOS_KEY, uniq, { force: true })
  return uniq
}

export function marcarMaterialRemovido(item) {
  const atual = loadMateriaisRemovidos()
  if (item?.id != null && item.id !== '') atual.push(String(item.id))
  const nome = chaveNome(item?.nome)
  if (nome) atual.push(nome)
  return gravarRemovidos(atual)
}

export function desmarcarMaterialRemovido(item) {
  const nome = chaveNome(item?.nome)
  const id = item?.id != null ? String(item.id) : ''
  return gravarRemovidos(loadMateriaisRemovidos().filter(x => x !== nome && x !== id))
}

export function materialFoiRemovido(item, removidos = null) {
  const set = new Set((removidos || loadMateriaisRemovidos()).map(String))
  if (item?.id != null && set.has(String(item.id))) return true
  const nome = chaveNome(item?.nome)
  return Boolean(nome && set.has(nome))
}

export function filtrarEstoqueRemovido(estoque = [], removidos = null) {
  const lista = removidos || loadMateriaisRemovidos()
  return (estoque || []).filter(i => !materialFoiRemovido(i, lista))
}

/** Tira da lista de removidos tudo que ainda aparece no histórico (estado quebrado pós-sync). */
export function limparRemovidosReferenciadosNoHistorico({
  entradas = [],
  distribuicoes = [],
  retiradas = [],
} = {}) {
  const removidos = loadMateriaisRemovidos()
  if (!removidos.length) return removidos

  const refs = new Set()
  function ref(id, nome) {
    if (id != null && id !== '') refs.add(String(id))
    const n = chaveNome(nome)
    if (n) refs.add(n)
  }
  for (const e of entradas) ref(e?.itemId, e?.itemNome)
  for (const d of distribuicoes) ref(d?.itemId, d?.itemNome)
  for (const r of retiradas) {
    for (const lin of r?.itens || []) ref(lin?.itemId, lin?.itemNome)
  }
  if (!refs.size) return removidos

  const next = removidos.filter(x => !refs.has(String(x)))
  if (next.length !== removidos.length) gravarRemovidos(next)
  return next
}

export function materiaisPadraoFaltantes(estoque = [], removidos = null) {
  const listaRem = removidos || loadMateriaisRemovidos()
  const existentes = new Set(
    (estoque || []).map(i => chaveNome(i.nome)).filter(Boolean),
  )
  return MATERIAIS_PADRAO.filter(m => {
    const n = chaveNome(m.nome)
    if (existentes.has(n)) return false
    if (materialFoiRemovido(m, listaRem)) return false
    return true
  })
}

export function criarItensPadrao(gerarId) {
  const agora = new Date().toISOString()
  return MATERIAIS_PADRAO.map(m => ({
    id: typeof gerarId === 'function' ? gerarId() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    nome: m.nome,
    categoria: m.categoria,
    quantidade: Number(m.quantidade) || 0,
    estoqueMinimo: m.estoqueMinimo ?? 0,
    noFormulario: true,
    criadoEm: agora,
  }))
}

/**
 * Reconstrói itens de estoque a partir de saídas/entradas/retiradas
 * quando o sync apagou materiais_estoque mas o histórico ficou.
 */
export function recuperarEstoqueDeHistorico({
  estoque = [],
  distribuicoes = [],
  entradas = [],
  retiradas = [],
} = {}) {
  limparRemovidosReferenciadosNoHistorico({ entradas, distribuicoes, retiradas })
  const removidos = loadMateriaisRemovidos()
  const removidosSet = new Set(removidos.map(String))

  function foiRemovido(id, nomeHint = '') {
    if (id != null && id !== '' && removidosSet.has(String(id))) return true
    const nome = chaveNome(nomeHint)
    return Boolean(nome && removidosSet.has(nome))
  }

  const map = new Map()
  const saido = Object.create(null)
  const entrMap = Object.create(null)
  const agora = new Date().toISOString()
  let adicionados = 0

  for (const it of Array.isArray(estoque) ? estoque : []) {
    if (!it || it.id == null || it.id === '') continue
    if (materialFoiRemovido(it, removidos)) continue
    map.set(String(it.id), { ...it })
  }

  function ensure(id, nomeHint = '') {
    if (id == null || id === '') return
    if (foiRemovido(id, nomeHint)) return
    const k = String(id)
    const nome = String(nomeHint || '').trim()
    if (map.has(k)) {
      const prev = map.get(k)
      if ((!prev.nome || /^item removido$/i.test(prev.nome) || /^material recuperado$/i.test(prev.nome)) && nome) {
        prev.nome = nome
      }
      return
    }
    const padrao = MATERIAIS_PADRAO.find(m => chaveNome(m.nome) === chaveNome(nome))
    if (padrao && materialFoiRemovido(padrao, removidos)) return
    map.set(k, {
      id: k,
      nome: nome || padrao?.nome || 'Material recuperado',
      categoria: padrao?.categoria || 'Recuperado',
      quantidade: 0,
      estoqueMinimo: padrao?.estoqueMinimo ?? 0,
      noFormulario: true,
      recuperadoDoHistorico: true,
      criadoEm: agora,
      atualizadoEm: agora,
    })
    adicionados++
  }

  for (const d of Array.isArray(distribuicoes) ? distribuicoes : []) {
    if (!d?.itemId || foiRemovido(d.itemId, d.itemNome)) continue
    ensure(d.itemId, d.itemNome)
    saido[String(d.itemId)] = (saido[String(d.itemId)] || 0) + (Number(d.quantidade) || 0)
  }
  for (const e of Array.isArray(entradas) ? entradas : []) {
    if (!e?.itemId || foiRemovido(e.itemId, e.itemNome)) continue
    ensure(e.itemId, e.itemNome)
    if (e.tipo === 'ajuste') continue
    entrMap[String(e.itemId)] = (entrMap[String(e.itemId)] || 0) + (Number(e.quantidade) || 0)
  }
  for (const r of Array.isArray(retiradas) ? retiradas : []) {
    for (const lin of r?.itens || []) {
      if (!lin?.itemId || foiRemovido(lin.itemId, lin.itemNome)) continue
      ensure(lin.itemId, lin.itemNome)
    }
  }

  if (!adicionados && map.size === filtrarEstoqueRemovido(Array.isArray(estoque) ? estoque : [], removidos).length) {
    return { lista: filtrarEstoqueRemovido([...map.values()], removidos), recuperados: 0 }
  }

  const lista = [...map.values()]
    .filter(it => !materialFoiRemovido(it, removidos))
    .map((it) => {
      const id = String(it.id)
      const qtdEntradas = entrMap[id] || 0
      const qtdSaido = saido[id] || 0
      const qtdAtual = Number(it.quantidade) || 0
      const qtdMin = Math.max(qtdAtual, qtdEntradas, qtdSaido)
      if (qtdMin !== qtdAtual) {
        return { ...it, quantidade: qtdMin, atualizadoEm: agora }
      }
      return it
    })

  return { lista, recuperados: adicionados }
}
