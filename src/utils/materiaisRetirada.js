/** Retiradas de material por coordenadores — reserva + validação + limites. */

import { writeStorage, flushAfterSave, readStorage } from './persist'
import { marcarDistribuicoesRemovidas, filtrarDistribuicoesRemovidas } from './materiaisMovimentos'

export const KEY_ESTOQUE = 'materiais_estoque'
export const KEY_DIST = 'materiais_distribuicao'
export const KEY_COORDS = 'materiais_coordenadores'
export const KEY_RETIRADAS = 'materiais_retiradas'
export const KEY_RETIRADAS_REMOVIDOS = 'materiais_retiradas_removidos'
export const KEY_CFG = 'materiais_retirada_cfg'

export const STATUS_PENDENTE = 'pendente'
export const STATUS_VALIDADO = 'validado'
export const STATUS_RECUSADO = 'recusado'
export const STATUS_CANCELADO = 'cancelado'

export const CFG_DEFAULT = {
  shareId: '',
  token: '',
  ativo: true,
  outrosHabilitado: true,
  limiteOutrosPadrao: {}, // { [itemId]: number }
  titulo: 'Agendar retirada de material',
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function loadEstoque() {
  return readStorage(KEY_ESTOQUE, [])
}

export function loadDistribuicoes() {
  return filtrarDistribuicoesRemovidas(readStorage(KEY_DIST, []))
}

/**
 * Recupera saídas apagadas a partir de retiradas já validadas
 * (quando o sync zerou materiais_distribuicao).
 */
export function recuperarSaidasDeRetiradasValidadas(distribuicoes = null, retiradas = null, estoque = null) {
  const dists = Array.isArray(distribuicoes) ? distribuicoes : loadDistribuicoes()
  const lista = Array.isArray(retiradas) ? retiradas : loadRetiradas()
  const itens = Array.isArray(estoque) ? estoque : readStorage(KEY_ESTOQUE, [])
  const idsEstoque = new Set(
    (itens || []).map(i => String(i?.id)).filter(Boolean),
  )
  const paresExistentes = new Set(
    dists
      .filter(d => d?.retiradaId != null && d?.itemId != null)
      .map(d => `${String(d.retiradaId)}::${String(d.itemId)}`),
  )
  const extras = []
  for (const r of lista) {
    if (r?.status !== STATUS_VALIDADO) continue
    for (const lin of r.itens || []) {
      const itemId = lin?.itemId
      if (itemId == null || itemId === '') continue
      if (!idsEstoque.has(String(itemId))) continue
      const par = `${String(r.id)}::${String(itemId)}`
      if (paresExistentes.has(par)) continue
      paresExistentes.add(par)
      extras.push({
        id: uid(),
        itemId,
        itemNome: lin.itemNome || '',
        quantidade: Number(lin.quantidade) || 0,
        bairro: 'Retirada coordenador',
        evento: 'Retirada validada',
        responsavel: r.coordenadorNome || '',
        coordenadorId: r.coordenadorId || '',
        coordenadorNome: r.coordenadorNome || '',
        data: r.dataValidacao || r.dataPedido || r.data || new Date().toISOString(),
        retiradaId: r.id,
      })
    }
  }
  if (!extras.length) return { lista: dists, recuperados: 0 }
  return { lista: [...extras, ...dists], recuperados: extras.length }
}

export function loadCoordenadores() {
  return readStorage(KEY_COORDS, [])
}

export function saveCoordenadores(lista) {
  writeStorage(KEY_COORDS, lista || [])
  schedulePublicSync()
  return lista
}

export function loadRetiradasRemovidos() {
  const raw = readStorage(KEY_RETIRADAS_REMOVIDOS, [])
  return Array.isArray(raw) ? raw.map(String).filter(Boolean) : []
}

export function marcarRetiradaRemovida(id) {
  if (id == null || id === '') return loadRetiradasRemovidos()
  const set = new Set(loadRetiradasRemovidos())
  set.add(String(id))
  const out = [...set]
  writeStorage(KEY_RETIRADAS_REMOVIDOS, out)
  return out
}

export function filtrarRetiradasRemovidas(lista = [], removidos = null) {
  const set = new Set((removidos || loadRetiradasRemovidos()).map(String))
  if (!set.size) return Array.isArray(lista) ? lista : []
  return (Array.isArray(lista) ? lista : []).filter(r => !set.has(String(r?.id)))
}

export function loadRetiradas() {
  return filtrarRetiradasRemovidas(readStorage(KEY_RETIRADAS, []))
}

export function saveRetiradas(lista) {
  writeStorage(KEY_RETIRADAS, filtrarRetiradasRemovidas(lista || []))
  schedulePublicSync()
  return lista
}

export function loadCfg() {
  return { ...CFG_DEFAULT, ...readStorage(KEY_CFG, {}) }
}

export function saveCfg(cfg) {
  const next = { ...CFG_DEFAULT, ...cfg }
  writeStorage(KEY_CFG, next)
  schedulePublicSync()
  return next
}

function schedulePublicSync() {
  if (typeof window === 'undefined') return
  import('./materiaisRetiradaShare')
    .then(m => m.agendarPublicacaoRetirada())
    .catch(() => {})
}

/** Soma saídas confirmadas por item. */
export function mapaSaido(distribuicoes = null) {
  const dists = distribuicoes || loadDistribuicoes()
  const map = {}
  for (const d of dists) {
    const id = d.itemId
    if (!id) continue
    map[id] = (map[id] || 0) + (Number(d.quantidade) || 0)
  }
  return map
}

/** Soma reservas (retiradas pendentes) por item. */
export function mapaReservado(retiradas = null, ignoreId = null) {
  const lista = retiradas || loadRetiradas()
  const map = {}
  for (const r of lista) {
    if (r.status !== STATUS_PENDENTE) continue
    if (ignoreId && String(r.id) === String(ignoreId)) continue
    for (const it of r.itens || []) {
      const id = it.itemId
      if (!id) continue
      map[id] = (map[id] || 0) + (Number(it.quantidade) || 0)
    }
  }
  return map
}

/**
 * Itens com saido / reservado / disponivel / status.
 * disponivel = quantidade - saido - reservado
 */
export function itensComSaldo({
  itens = null,
  distribuicoes = null,
  retiradas = null,
  ignoreRetiradaId = null,
} = {}) {
  const estoque = itens || loadEstoque()
  const saidoMap = mapaSaido(distribuicoes)
  const resMap = mapaReservado(retiradas, ignoreRetiradaId)
  return estoque.map(item => {
    const qtd = Number(item.quantidade) || 0
    const saido = saidoMap[item.id] || 0
    const reservado = resMap[item.id] || 0
    const disponivel = Math.max(0, qtd - saido - reservado)
    const min = Number(item.estoqueMinimo) || 0
    const status = disponivel <= 0 ? 'esgotado' : disponivel <= min ? 'baixo' : 'ok'
    return {
      ...item,
      saido,
      reservado,
      disponivel,
      restante: disponivel, // alias compatível com UI antiga
      distribuido: saido,
      status,
    }
  })
}

/** Uso do coordenador (pendente + validado) por item na campanha. */
export function usoCoordenadorPorItem(coordenadorId, coordenadorNome, isOutros, retiradas = null) {
  const lista = retiradas || loadRetiradas()
  const map = {}
  for (const r of lista) {
    if (r.status !== STATUS_PENDENTE && r.status !== STATUS_VALIDADO) continue
    const match = isOutros
      ? r.isOutros && normNome(r.coordenadorNome) === normNome(coordenadorNome)
      : coordenadorId
        ? String(r.coordenadorId) === String(coordenadorId)
        : normNome(r.coordenadorNome) === normNome(coordenadorNome)
    if (!match) continue
    for (const it of r.itens || []) {
      const id = it.itemId
      if (!id) continue
      map[id] = (map[id] || 0) + (Number(it.quantidade) || 0)
    }
  }
  return map
}

export function normNome(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

/**
 * Limite restante por item para um coordenador.
 * Sem limite cadastrado → Infinity (só estoque).
 */
export function limitesRestantes({
  coordenador,
  isOutros,
  cfg = null,
  retiradas = null,
  coordenadorNomeOutros = '',
} = {}) {
  const conf = cfg || loadCfg()
  const uso = usoCoordenadorPorItem(
    coordenador?.id,
    isOutros ? coordenadorNomeOutros : coordenador?.nome,
    Boolean(isOutros),
    retiradas,
  )
  const result = {}
  const fonteLimites = isOutros
    ? (conf.limiteOutrosPadrao || {})
    : (coordenador?.limites || {})

  const itemIds = new Set([
    ...Object.keys(fonteLimites || {}),
    ...Object.keys(uso),
  ])
  for (const itemId of itemIds) {
    const limRaw = fonteLimites?.[itemId]
    const lim = limRaw === '' || limRaw == null ? null : Number(limRaw)
    const usado = uso[itemId] || 0
    if (lim == null || Number.isNaN(lim) || lim < 0) {
      result[itemId] = { limite: null, usado, restante: Infinity }
    } else {
      result[itemId] = { limite: lim, usado, restante: Math.max(0, lim - usado) }
    }
  }
  return result
}

export function maxPermitidoParaItem({
  itemId,
  disponivel,
  coordenador,
  isOutros,
  cfg,
  retiradas,
  coordenadorNomeOutros,
}) {
  const lims = limitesRestantes({
    coordenador, isOutros, cfg, retiradas, coordenadorNomeOutros,
  })
  const restLim = lims[itemId]?.restante
  const tetoLim = restLim == null || restLim === Infinity ? disponivel : restLim
  return Math.max(0, Math.min(Number(disponivel) || 0, tetoLim))
}

export function criarCoordenador({ nome, limites = {} }) {
  return {
    id: uid(),
    nome: String(nome || '').trim(),
    ativo: true,
    limites: { ...limites },
    criadoEm: new Date().toISOString(),
  }
}

/**
 * Valida um pedido antes de salvar.
 * Retorna { ok, erro, avisos }.
 */
export function validarPedido({
  coordenadorId,
  coordenadorNome,
  isOutros,
  dataPrevista,
  itensPedido,
  itensSaldo,
  coordenadores,
  cfg,
  retiradas,
}) {
  if (!dataPrevista) return { ok: false, erro: 'Informe a data prevista da retirada.' }
  const nome = String(coordenadorNome || '').trim()
  if (isOutros) {
    if (!cfg?.outrosHabilitado) return { ok: false, erro: 'Opção “Outros” desabilitada.' }
    if (!nome) return { ok: false, erro: 'Informe o nome do coordenador.' }
  } else {
    // Bundle público não envia `ativo` (só entra quem já está ativo). Tratar ausente como ativo.
    const c = (coordenadores || []).find(x => String(x.id) === String(coordenadorId) && x.ativo !== false)
    if (!c) return { ok: false, erro: 'Selecione um coordenador da lista.' }
  }
  const linhas = (itensPedido || []).filter(i => (Number(i.quantidade) || 0) > 0)
  if (!linhas.length) return { ok: false, erro: 'Escolha ao menos um material com quantidade.' }

  const coord = isOutros
    ? null
    : (coordenadores || []).find(x => String(x.id) === String(coordenadorId))

  for (const lin of linhas) {
    const saldo = (itensSaldo || []).find(i => String(i.id) === String(lin.itemId))
    if (!saldo) return { ok: false, erro: `Material não encontrado.` }
    const qtd = Number(lin.quantidade) || 0
    if (qtd > (saldo.disponivel ?? 0)) {
      return {
        ok: false,
        erro: `${saldo.nome}: só há ${saldo.disponivel} disponível(is) (já descontando reservas).`,
      }
    }
    const max = maxPermitidoParaItem({
      itemId: lin.itemId,
      disponivel: saldo.disponivel,
      coordenador: coord,
      isOutros,
      cfg,
      retiradas,
      coordenadorNomeOutros: nome,
    })
    if (qtd > max) {
      return {
        ok: false,
        erro: `${saldo.nome}: limite do coordenador permite no máximo ${max} nesta campanha.`,
      }
    }
  }
  return { ok: true }
}

export function criarRetirada({
  coordenadorId,
  coordenadorNome,
  isOutros,
  dataPrevista,
  itensPedido,
  obs = '',
  origem = 'painel',
}) {
  const agora = new Date().toISOString()
  return {
    id: uid(),
    status: STATUS_PENDENTE,
    coordenadorId: isOutros ? '' : (coordenadorId || ''),
    coordenadorNome: String(coordenadorNome || '').trim(),
    isOutros: Boolean(isOutros),
    dataPrevista: String(dataPrevista || '').slice(0, 10),
    dataValidacao: '',
    validadoPor: '',
    itens: (itensPedido || [])
      .filter(i => (Number(i.quantidade) || 0) > 0)
      .map(i => ({
        itemId: i.itemId,
        itemNome: i.itemNome || '',
        quantidade: Number(i.quantidade) || 0,
      })),
    obs: String(obs || '').trim(),
    origem,
    criadoEm: agora,
    atualizadoEm: agora,
  }
}

export function adicionarRetiradaLocal(retirada) {
  const lista = [retirada, ...loadRetiradas()]
  saveRetiradas(lista)
  return lista
}

export function atualizarRetiradaLocal(id, patch) {
  const lista = loadRetiradas().map(r =>
    String(r.id) === String(id)
      ? { ...r, ...patch, atualizadoEm: new Date().toISOString() }
      : r,
  )
  saveRetiradas(lista)
  return lista
}

export function mergeRetiradasInbox(inbox = []) {
  const atuais = loadRetiradas()
  const ids = new Set(atuais.map(r => String(r.id)))
  const removidos = new Set(loadRetiradasRemovidos())
  const novos = (inbox || []).filter(r => {
    if (!r?.id) return false
    const id = String(r.id)
    if (ids.has(id) || removidos.has(id)) return false
    return true
  })
  if (!novos.length) return { lista: atuais, adicionados: 0 }
  const lista = [...novos, ...atuais]
  saveRetiradas(lista)
  return { lista, adicionados: novos.length }
}

/** Valida retirada: cria saídas em materiais_distribuicao e marca validado. */
export function validarRetirada(id, {
  validadoPor = '',
  registradoPor = '',
  registradoPorEmail = '',
} = {}) {
  const retirada = loadRetiradas().find(r => String(r.id) === String(id))
  if (!retirada) return { ok: false, erro: 'Retirada não encontrada.' }
  if (retirada.status !== STATUS_PENDENTE) {
    return { ok: false, erro: 'Só é possível validar retiradas pendentes.' }
  }

  const saldo = itensComSaldo({ ignoreRetiradaId: id })
  for (const lin of retirada.itens || []) {
    const s = saldo.find(i => String(i.id) === String(lin.itemId))
    const qtd = Number(lin.quantidade) || 0
    // disponivel já ignora esta reserva; somamos a reserva dela de volta mentalmente:
    // na prática ignoreRetiradaId faz disponivel incluir o que ela reservou.
    if (!s || qtd > (s.disponivel ?? 0)) {
      return {
        ok: false,
        erro: `${lin.itemNome || 'Item'}: estoque insuficiente para validar (${s?.disponivel ?? 0} disp.).`,
      }
    }
  }

  const agora = new Date().toISOString()
  const quem = String(registradoPor || validadoPor || '').trim()
  const email = String(registradoPorEmail || '').trim()
  const dists = loadDistribuicoes()
  const novas = (retirada.itens || []).map(lin => ({
    id: uid(),
    itemId: lin.itemId,
    itemNome: lin.itemNome || '',
    quantidade: Number(lin.quantidade) || 0,
    bairro: 'Retirada coordenador',
    evento: 'Retirada validada',
    responsavel: retirada.coordenadorNome || '',
    coordenadorId: retirada.coordenadorId || '',
    coordenadorNome: retirada.coordenadorNome || '',
    data: agora,
    retiradaId: retirada.id,
    registradoPor: quem,
    registradoPorEmail: email,
  }))
  writeStorage(KEY_DIST, [...novas, ...dists])

  atualizarRetiradaLocal(id, {
    status: STATUS_VALIDADO,
    dataValidacao: agora,
    validadoPor: quem || email,
    registradoPor: quem,
    registradoPorEmail: email,
  })

  return { ok: true }
}

export function recusarRetirada(id, { motivo = '' } = {}) {
  const retirada = loadRetiradas().find(r => String(r.id) === String(id))
  if (!retirada) return { ok: false, erro: 'Retirada não encontrada.' }
  if (retirada.status !== STATUS_PENDENTE) {
    return { ok: false, erro: 'Só é possível recusar retiradas pendentes.' }
  }
  atualizarRetiradaLocal(id, {
    status: STATUS_RECUSADO,
    obs: [retirada.obs, motivo ? `Recusa: ${motivo}` : ''].filter(Boolean).join(' · '),
  })
  return { ok: true }
}

export function cancelarRetirada(id) {
  const retirada = loadRetiradas().find(r => String(r.id) === String(id))
  if (!retirada) return { ok: false, erro: 'Retirada não encontrada.' }
  if (retirada.status !== STATUS_PENDENTE) {
    return { ok: false, erro: 'Só é possível cancelar retiradas pendentes.' }
  }
  atualizarRetiradaLocal(id, { status: STATUS_CANCELADO })
  return { ok: true }
}

/**
 * Remove retirada de vez (útil para testes / correções).
 * Se estava validada, também remove as saídas vinculadas (retiradaId) para devolver o estoque.
 */
export function excluirRetirada(id) {
  const lista = loadRetiradas()
  const retirada = lista.find(r => String(r.id) === String(id))
  if (!retirada) return { ok: false, erro: 'Retirada não encontrada.' }

  marcarRetiradaRemovida(id)
  saveRetiradas(lista.filter(r => String(r.id) !== String(id)))

  if (retirada.status === STATUS_VALIDADO) {
    const todas = loadDistribuicoes()
    const remover = todas.filter(d => String(d.retiradaId) === String(id))
    marcarDistribuicoesRemovidas(remover.map(d => d.id))
    writeStorage(KEY_DIST, todas.filter(d => String(d.retiradaId) !== String(id)))
  }

  return { ok: true, statusAnterior: retirada.status }
}

export async function persistFlush() {
  await flushAfterSave()
}
