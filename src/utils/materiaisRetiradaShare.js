/** Link público de retirada de material (shareId curto + API pública). */

import { shareUid } from './agendaShare'
import { writeStorage, flushAfterSave } from './persist'
import { getPhpAuthContext } from '../lib/cloudSync'
import {
  loadCfg, saveCfg, loadCoordenadores, loadEstoque, loadDistribuicoes, loadRetiradas,
  itensComSaldo, mergeRetiradasInbox, criarRetirada, validarPedido, adicionarRetiradaLocal,
  STATUS_PENDENTE, CFG_DEFAULT,
} from './materiaisRetirada'

const PHP_API = typeof window !== 'undefined'
  ? `${window.location.origin}/api.php`
  : '/api.php'

export function pubKey(shareId) {
  return `materiais_retirada_pub_${shareId}`
}

export function inboxKey(shareId) {
  return `materiais_retirada_inbox_${shareId}`
}

export function encodeRetiradaToken(payload) {
  return btoa(unescape(encodeURIComponent(JSON.stringify({ ...payload, tipo: 'retirada-material' }))))
}

export function decodeRetiradaToken(token) {
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(token))))
    if (!data?.shareId || data.tipo !== 'retirada-material') return null
    return data
  } catch {
    return null
  }
}

/** Aceita shareId curto ou token base64 antigo. */
export function resolveShareId(param) {
  const raw = decodeURIComponent(String(param || '').trim())
  if (!raw) return null
  if (/^[a-zA-Z0-9_-]{6,40}$/.test(raw) && !raw.includes('=')) return raw
  return decodeRetiradaToken(raw)?.shareId || null
}

export function getRetiradaPublicLink(shareIdOrToken) {
  if (typeof window === 'undefined') return ''
  const shareId = resolveShareId(shareIdOrToken) || String(shareIdOrToken || '').trim()
  if (!shareId) return ''
  const base = window.location.origin + window.location.pathname.replace(/\/$/, '')
  // Link estável (sem #) — atalho/app não perde o destino nem cai no login
  return `${base}/retirada.html?id=${encodeURIComponent(shareId)}`
}

/** Garante shareId fixo (+ token legado opcional). */
export function garantirLinkRetirada(cfgAtual = null) {
  const cfg = { ...CFG_DEFAULT, ...(cfgAtual || loadCfg()) }
  let changed = false
  const next = { ...cfg }
  if (!next.shareId) {
    next.shareId = shareUid()
    changed = true
  }
  // Mantém token só por compatibilidade; o link público usa shareId
  if (!next.token || decodeRetiradaToken(next.token)?.shareId !== next.shareId) {
    next.token = encodeRetiradaToken({ shareId: next.shareId, v: 1 })
    changed = true
  }
  if (changed) saveCfg(next)
  return next
}

export function regenerarLinkRetirada() {
  return garantirLinkRetirada()
}

export function montarBundlePublico() {
  const cfg = loadCfg()
  const itens = itensComSaldo({
    itens: loadEstoque(),
    distribuicoes: loadDistribuicoes(),
    retiradas: loadRetiradas(),
  })
  const coordenadores = loadCoordenadores()
    .filter(c => c.ativo !== false)
    .map(c => ({
      id: c.id,
      nome: c.nome,
      ativo: true,
      limites: Array.isArray(c.limites) ? {} : (c.limites || {}),
    }))
  return {
    v: 1,
    shareId: cfg.shareId,
    ativo: cfg.ativo !== false,
    titulo: cfg.titulo || 'Agendar retirada de material',
    outrosHabilitado: cfg.outrosHabilitado !== false,
    limiteOutrosPadrao: cfg.limiteOutrosPadrao || {},
    coordenadores,
    itens: itens
      .filter(i => i.noFormulario !== false)
      .map(i => ({
        id: i.id,
        nome: i.nome,
        categoria: i.categoria,
        disponivel: i.disponivel,
        reservado: i.reservado,
        saido: i.saido,
        quantidade: i.quantidade,
        estoqueMinimo: i.estoqueMinimo,
      })),
    retiradasResumo: loadRetiradas()
      .filter(r => r.status === STATUS_PENDENTE || r.status === 'validado')
      .map(r => ({
        id: r.id,
        status: r.status,
        coordenadorId: r.coordenadorId,
        coordenadorNome: r.coordenadorNome,
        isOutros: r.isOutros,
        itens: r.itens,
      })),
    atualizadoEm: new Date().toISOString(),
  }
}

function normalizarBundlePublico(data) {
  if (!data || typeof data !== 'object') return data
  const limPadrao = Array.isArray(data.limiteOutrosPadrao) ? {} : (data.limiteOutrosPadrao || {})
  const coordenadores = (data.coordenadores || []).map(c => ({
    ...c,
    limites: Array.isArray(c?.limites) ? {} : (c?.limites || {}),
  }))
  return { ...data, limiteOutrosPadrao: limPadrao, coordenadores }
}

export async function carregarBundlePublico(shareId, { tentativas = 3 } = {}) {
  if (!shareId) return null
  let lastErro = ''
  for (let i = 0; i < tentativas; i++) {
    try {
      const url = `${PHP_API}?action=retirada_info&shareId=${encodeURIComponent(shareId)}&_=${Date.now()}`
      const res = await fetch(url, { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (res.ok && data && !data.error && data.shareId) {
        return normalizarBundlePublico(data)
      }
      lastErro = data?.error || `HTTP ${res.status}`
    } catch (e) {
      lastErro = e?.message || 'Falha de rede'
    }
    if (i < tentativas - 1) await new Promise(r => setTimeout(r, 700 * (i + 1)))
  }
  return { __erro: lastErro || 'não publicado' }
}

let _pubTimer = null
let _pubLock = false
let _pubPending = false
let _silenciarAgenda = false

/**
 * Agenda republicação automática do formulário público (debounce).
 * Chamar após qualquer mudança de estoque, coordenadores, limites ou retiradas.
 */
export function agendarPublicacaoRetirada({ delay = 900 } = {}) {
  if (typeof window === 'undefined' || _silenciarAgenda) return
  if (_pubTimer) clearTimeout(_pubTimer)
  _pubTimer = setTimeout(() => {
    _pubTimer = null
    publicarBundleRetirada({ confirmar: false }).catch(() => {})
  }, delay)
}

/** Publica e confirma leitura pública. */
export async function publicarBundleRetirada({ confirmar = true } = {}) {
  if (_pubLock) {
    _pubPending = true
    return { ok: true, adiados: true }
  }
  _pubLock = true
  _silenciarAgenda = true
  try {
    const cfg = garantirLinkRetirada()
    if (!cfg.shareId) return { ok: false, erro: 'Sem shareId' }
    const bundle = montarBundlePublico()
    if (Array.isArray(bundle.limiteOutrosPadrao)) bundle.limiteOutrosPadrao = {}
    bundle.coordenadores = (bundle.coordenadores || []).map(c => ({
      ...c,
      limites: Array.isArray(c.limites) ? {} : (c.limites || {}),
    }))
    writeStorage(pubKey(cfg.shareId), bundle)
    saveCfg(cfg)
    await flushAfterSave()
    if (!confirmar) return { ok: true, cfg, bundle }
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 500))
      const check = await carregarBundlePublico(cfg.shareId, { tentativas: 1 })
      if (check && !check.__erro && check.shareId) {
        return { ok: true, cfg, bundle: check }
      }
    }
    return {
      ok: false,
      erro: 'Publicou localmente, mas o link público ainda não respondeu. Aguarde 10s e tente de novo.',
      cfg,
      bundle,
    }
  } finally {
    _silenciarAgenda = false
    _pubLock = false
    if (_pubPending) {
      _pubPending = false
      agendarPublicacaoRetirada({ delay: 300 })
    }
  }
}

async function fetchInboxAutenticado(shareId) {
  const { accessToken, tenantId } = getPhpAuthContext()
  if (!accessToken || !tenantId) {
    try {
      return JSON.parse(localStorage.getItem(inboxKey(shareId)) || 'null')
    } catch {
      return null
    }
  }
  try {
    const url = `${PHP_API}?key=${encodeURIComponent(inboxKey(shareId))}`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Tenant-Id': tenantId,
      },
    })
    if (!res.ok) return null
    const text = await res.text()
    if (!text || text === 'null') return null
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function carregarInbox(shareId) {
  if (!shareId) return []
  const data = await fetchInboxAutenticado(shareId)
  if (Array.isArray(data)) return data
  if (data?.pedidos && Array.isArray(data.pedidos)) return data.pedidos
  return []
}

export async function enviarPedidoPublico(shareId, pedido) {
  try {
    const res = await fetch(`${PHP_API}?action=retirada_submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shareId, pedido }),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok && data.ok !== false, pedidos: null, erro: data.error }
  } catch {
    return { ok: false, erro: 'Falha de conexão' }
  }
}

export async function sincronizarInboxRetiradas() {
  const cfg = loadCfg()
  if (!cfg.shareId) return { ok: true, adicionados: 0 }
  const inbox = await carregarInbox(cfg.shareId)
  const { adicionados } = mergeRetiradasInbox(inbox)
  if (adicionados > 0) {
    await publicarBundleRetirada({ confirmar: false })
  }
  return { ok: true, adicionados }
}

export async function submeterPedidoPublico({
  shareId,
  bundle,
  coordenadorId,
  coordenadorNome,
  isOutros,
  dataPrevista,
  itensPedido,
  obs,
}) {
  if (!bundle?.ativo) return { ok: false, erro: 'Formulário desativado pela campanha.' }

  const retiradas = [...(bundle.retiradasResumo || [])]
  const itensSaldo = (bundle.itens || []).map(i => ({ ...i }))

  const cfg = {
    outrosHabilitado: bundle.outrosHabilitado,
    limiteOutrosPadrao: bundle.limiteOutrosPadrao || {},
  }
  const check = validarPedido({
    coordenadorId,
    coordenadorNome,
    isOutros,
    dataPrevista,
    itensPedido,
    itensSaldo,
    coordenadores: bundle.coordenadores || [],
    cfg,
    retiradas,
  })
  if (!check.ok) return check

  const nomeFinal = isOutros
    ? String(coordenadorNome || '').trim()
    : (bundle.coordenadores || []).find(c => String(c.id) === String(coordenadorId))?.nome || ''

  const retirada = criarRetirada({
    coordenadorId,
    coordenadorNome: nomeFinal,
    isOutros,
    dataPrevista,
    itensPedido: itensPedido.map(i => ({
      ...i,
      itemNome: itensSaldo.find(s => String(s.id) === String(i.itemId))?.nome || i.itemNome || '',
    })),
    obs,
    origem: 'formulario',
  })

  const envio = await enviarPedidoPublico(shareId, retirada)
  if (!envio.ok) return { ok: false, erro: envio.erro || 'Não foi possível enviar. Tente de novo.' }
  return { ok: true, retirada }
}

export function submeterPedidoPainel(dados) {
  const itensSaldo = itensComSaldo()
  const coordenadores = loadCoordenadores()
  const cfg = loadCfg()
  const retiradas = loadRetiradas()
  const check = validarPedido({
    ...dados,
    itensSaldo,
    coordenadores,
    cfg,
    retiradas,
  })
  if (!check.ok) return check
  const nomeFinal = dados.isOutros
    ? String(dados.coordenadorNome || '').trim()
    : coordenadores.find(c => String(c.id) === String(dados.coordenadorId))?.nome || ''
  const retirada = criarRetirada({
    ...dados,
    coordenadorNome: nomeFinal,
    itensPedido: (dados.itensPedido || []).map(i => ({
      ...i,
      itemNome: itensSaldo.find(s => String(s.id) === String(i.itemId))?.nome || '',
    })),
    origem: 'painel',
  })
  adicionarRetiradaLocal(retirada)
  return { ok: true, retirada }
}
