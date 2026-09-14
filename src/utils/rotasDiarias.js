import { readStorage, writeStorage, flushAfterSave } from './persist'
import { buscarRotaTripOsrm } from './osrmRoute'
import { coordValida } from './rotaUtils'

export const ROTAS_DIARIAS_KEY = 'rotas_diarias'
export const ROTAS_DIARIAS_REMOVIDOS_KEY = 'rotas_diarias_removidos'
export const ROTAS_DIARIAS_EVENT = 'campanha-rotas-diarias-changed'

export const STATUS_PARADA = {
  PENDENTE: 'pendente',
  EM_TRANSITO: 'em_transito',
  CONCLUIDO: 'concluido',
}

function normEmail(e) {
  return String(e || '').trim().toLowerCase()
}

function stamp(r) {
  const t = Date.parse(r?.atualizadoEm || r?.criadoEm || '')
  return Number.isFinite(t) ? t : 0
}

function uidRota() {
  return `rd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function dispatchChanged(detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent(ROTAS_DIARIAS_EVENT, { detail }))
  } catch { /* ignore */ }
}

export function readRotasDiariasRaw() {
  const arr = readStorage(ROTAS_DIARIAS_KEY, [])
  return Array.isArray(arr) ? arr : []
}

export function writeRotasDiarias(list, { flush = true } = {}) {
  writeStorage(ROTAS_DIARIAS_KEY, Array.isArray(list) ? list : [])
  dispatchChanged()
  if (flush) flushAfterSave().catch(() => {})
}

function normalizarParadas(igrejas = []) {
  return (igrejas || [])
    .map((p, idx) => ({
      igrejaId: p?.igrejaId != null ? p.igrejaId : p?.id,
      ordem: Number(p?.ordem) || idx + 1,
      status: [STATUS_PARADA.PENDENTE, STATUS_PARADA.EM_TRANSITO, STATUS_PARADA.CONCLUIDO].includes(p?.status)
        ? p.status
        : STATUS_PARADA.PENDENTE,
    }))
    .filter(p => p.igrejaId != null && p.igrejaId !== '')
    .sort((a, b) => a.ordem - b.ordem)
    .map((p, i) => ({ ...p, ordem: i + 1 }))
}

export function normalizarRotaDiaria(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = String(raw.id || '').trim() || uidRota()
  const data = String(raw.data || '').trim()
  const membroEmail = normEmail(raw.membroEmail)
  if (!data || !membroEmail) return null
  const agora = new Date().toISOString()
  return {
    id,
    data,
    membroEmail,
    membroNome: String(raw.membroNome || '').trim(),
    igrejas: normalizarParadas(raw.igrejas),
    criadoEm: raw.criadoEm || agora,
    atualizadoEm: agora,
  }
}

/** Rota atribuída ao membro na data (preferência: mais recente). */
export function rotaDiariaDoMembro({ data, membroEmail, rotas = null } = {}) {
  const alvoData = String(data || '').trim()
  const email = normEmail(membroEmail)
  if (!alvoData || !email) return null
  const list = rotas || readRotasDiariasRaw()
  const matches = list
    .filter(r => String(r?.data || '').trim() === alvoData && normEmail(r?.membroEmail) === email)
    .sort((a, b) => stamp(b) - stamp(a))
  const top = matches[0]
  if (!top) return null
  return {
    ...top,
    igrejas: normalizarParadas(top.igrejas),
  }
}

export function rotasDiariasNaData(data, rotas = null) {
  const alvo = String(data || '').trim()
  return (rotas || readRotasDiariasRaw()).filter(r => String(r?.data || '').trim() === alvo)
}

export function upsertRotaDiaria(rotaInput) {
  const next = normalizarRotaDiaria(rotaInput)
  if (!next) throw new Error('Informe data e membro da rota.')
  const list = readRotasDiariasRaw()
  const idx = list.findIndex(r => String(r.id) === String(next.id))
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...next, criadoEm: list[idx].criadoEm || next.criadoEm }
  } else {
    const dup = list.findIndex(r =>
      String(r.data) === next.data && normEmail(r.membroEmail) === next.membroEmail,
    )
    if (dup >= 0) {
      list[dup] = { ...list[dup], ...next, id: list[dup].id, criadoEm: list[dup].criadoEm || next.criadoEm }
    } else {
      list.push(next)
    }
  }
  writeRotasDiarias(list)
  return next
}

/** Insere igreja na rota do membro na data (mapa / despacho rápido). */
export function adicionarParadaRotaDiaria({
  data,
  membroEmail,
  membroNome = '',
  igrejaId,
  rotas = null,
} = {}) {
  const email = normEmail(membroEmail)
  if (!email || igrejaId == null) return null
  const rota = rotaDiariaDoMembro({ data, membroEmail: email, rotas: rotas || readRotasDiariasRaw() })
  const igrejas = [...(rota?.igrejas || [])]
  if (igrejas.some(p => String(p.igrejaId) === String(igrejaId))) {
    return rota
  }
  igrejas.push({
    igrejaId,
    ordem: igrejas.length + 1,
    status: STATUS_PARADA.PENDENTE,
  })
  return upsertRotaDiaria({
    id: rota?.id,
    data,
    membroEmail: email,
    membroNome: membroNome || rota?.membroNome || '',
    igrejas,
  })
}

export function atualizarStatusParadaRota(rotaId, igrejaId, status) {
  const list = readRotasDiariasRaw()
  const idx = list.findIndex(r => String(r.id) === String(rotaId))
  if (idx < 0) return null
  const rota = { ...list[idx] }
  const st = status
  rota.igrejas = normalizarParadas(rota.igrejas).map(p =>
    String(p.igrejaId) === String(igrejaId) ? { ...p, status: st } : p,
  )
  rota.atualizadoEm = new Date().toISOString()
  list[idx] = rota
  writeRotasDiarias(list)
  return rota
}

export function marcarParadaConcluidaRota({ data, membroEmail, igrejaId }) {
  const rota = rotaDiariaDoMembro({ data, membroEmail })
  if (!rota) return null
  return atualizarStatusParadaRota(rota.id, igrejaId, STATUS_PARADA.CONCLUIDO)
}

export function marcarParadaEmTransitoRota({ data, membroEmail, igrejaId }) {
  const rota = rotaDiariaDoMembro({ data, membroEmail })
  if (!rota) return null
  const parada = rota.igrejas.find(p => String(p.igrejaId) === String(igrejaId))
  if (parada?.status === STATUS_PARADA.CONCLUIDO) return rota
  return atualizarStatusParadaRota(rota.id, igrejaId, STATUS_PARADA.EM_TRANSITO)
}

/** Progresso por membro na data. */
export function progressoRotasEquipe({ data, rotas = null, membros = null } = {}) {
  const alvo = String(data || '').trim()
  const rotasDia = rotasDiariasNaData(alvo, rotas)
  const equipe = Array.isArray(membros) ? membros : readStorage('equipe_membros', [])
  const byEmail = new Map()
  for (const r of rotasDia) {
    const email = normEmail(r.membroEmail)
    if (!email) continue
    const igrejas = normalizarParadas(r.igrejas)
    const total = igrejas.length
    const concluidas = igrejas.filter(p => p.status === STATUS_PARADA.CONCLUIDO).length
    const emTransito = igrejas.filter(p => p.status === STATUS_PARADA.EM_TRANSITO).length
    const nome = r.membroNome
      || equipe.find(m => normEmail(m.email) === email)?.nome
      || email.split('@')[0]
    byEmail.set(email, {
      email,
      nome,
      rotaId: r.id,
      total,
      concluidas,
      emTransito,
      pendentes: Math.max(0, total - concluidas - emTransito),
      igrejas,
    })
  }
  return [...byEmail.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export function resumoProgressoGeral(progressoList = []) {
  let total = 0
  let concluidas = 0
  for (const p of progressoList) {
    total += p.total || 0
    concluidas += p.concluidas || 0
  }
  return { total, concluidas, pct: total ? Math.round((concluidas / total) * 100) : 0 }
}

/** Reordena / substitui paradas de uma rota existente (normaliza ordem). */
export function atualizarParadasRotaDiaria(rotaId, igrejas) {
  const list = readRotasDiariasRaw()
  const idx = list.findIndex(r => String(r.id) === String(rotaId))
  if (idx < 0) return null
  const rota = { ...list[idx] }
  rota.igrejas = normalizarParadas(igrejas)
  rota.atualizadoEm = new Date().toISOString()
  list[idx] = rota
  writeRotasDiarias(list)
  return rota
}

/**
 * Reordena paradas via OSRM Trip (menor tempo/distância viária).
 * Paradas sem GPS válido permanecem ao final, na ordem original.
 */
export async function otimizarSequenciaParadasOsrm(paradas = [], igById) {
  const list = Array.isArray(paradas) ? paradas : []
  if (list.length < 2) {
    throw new Error('Adicione pelo menos 2 paradas para otimizar a sequência.')
  }
  const getIg = id => (typeof igById?.get === 'function'
    ? igById.get(String(id))
    : igById?.[String(id)])

  const comGps = []
  const semGps = []
  for (const p of list) {
    const ig = getIg(p.igrejaId)
    const lat = Number(ig?.lat)
    const lng = Number(ig?.lng)
    if (coordValida(lat, lng)) comGps.push(p)
    else semGps.push(p)
  }
  if (comGps.length < 2) {
    throw new Error('É necessário GPS válido em pelo menos 2 paradas para otimizar.')
  }

  const waypoints = comGps.map(p => {
    const ig = getIg(p.igrejaId)
    return { lat: Number(ig.lat), lng: Number(ig.lng) }
  })
  const trip = await buscarRotaTripOsrm(waypoints)
  if (!trip?.ordemIndices?.length) {
    throw new Error('Serviço de rota indisponível. Tente novamente em instantes.')
  }

  const reordenadas = trip.ordemIndices.map(i => comGps[i]).filter(Boolean)
  const next = normalizarParadas([...reordenadas, ...semGps])
  return { paradas: next, distancia: trip.distancia, duracao: trip.duracao }
}

/** Remove rota do dia e registra id em removidos (sync nuvem). */
export function excluirRotaDiaria(rotaId) {
  const id = String(rotaId || '').trim()
  if (!id) return false
  const list = readRotasDiariasRaw()
  const idx = list.findIndex(r => String(r.id) === id)
  if (idx < 0) return false
  list.splice(idx, 1)
  writeRotasDiarias(list)
  const removidos = readStorage(ROTAS_DIARIAS_REMOVIDOS_KEY, [])
  const arr = Array.isArray(removidos) ? removidos : []
  if (!arr.includes(id)) {
    writeStorage(ROTAS_DIARIAS_REMOVIDOS_KEY, [...arr, id])
  }
  return true
}

const RAIO_CONFORMIDADE_M = 200

/** Métricas do painel Equipe hoje (progresso, ritmo, conformidade, tabela agentes). */
export function metricasDesempenhoEquipe({
  progresso = [],
  checkIns = [],
  raioMetros = RAIO_CONFORMIDADE_M,
} = {}) {
  const prog = Array.isArray(progresso) ? progresso : []
  const checks = Array.isArray(checkIns) ? checkIns : []
  const resumo = resumoProgressoGeral(prog)
  const membrosEmTransito = prog.filter(p => (p.emTransito || 0) > 0).length
  const membrosParados = Math.max(0, prog.length - membrosEmTransito)
  const totalEmTransito = prog.reduce((s, p) => s + (p.emTransito || 0), 0)

  const comDist = checks.filter(c => c.distanciaMetros != null && Number.isFinite(Number(c.distanciaMetros)))
  const dentroRaio = comDist.filter(c =>
    Number(c.distanciaMetros) <= raioMetros && !String(c.justificativaDistancia || '').trim(),
  )
  const conformidadePct = comDist.length
    ? Math.round((dentroRaio.length / comDist.length) * 100)
    : null

  const ultimoPorEmail = new Map()
  for (const c of checks) {
    const email = String(c.email || c.visitadoPorEmail || '').trim().toLowerCase()
    if (!email) continue
    const t = Date.parse(c.concluidoEm || '') || 0
    const prev = ultimoPorEmail.get(email)
    if (!prev || t > prev.t) {
      ultimoPorEmail.set(email, { t, hora: c.hora || '', igrejaNome: c.igrejaNome || '' })
    }
  }

  const agentes = prog.map(p => {
    const email = normEmail(p.email)
    const ult = ultimoPorEmail.get(email)
    let status = 'Aguardando'
    if (p.total > 0 && p.concluidas >= p.total) status = 'Rota concluída'
    else if ((p.emTransito || 0) > 0) status = 'Em trânsito'
    else if (p.concluidas > 0) status = 'Em campo'
    return {
      ...p,
      ultimoCheckIn: ult?.hora ? `${ult.hora}${ult.igrejaNome ? ` · ${ult.igrejaNome}` : ''}` : '—',
      status,
    }
  })

  return {
    resumo,
    membrosEmTransito,
    membrosParados,
    totalEmTransito,
    conformidadePct,
    checkInsComDistancia: comDist.length,
    checkInsDentroRaio: dentroRaio.length,
    agentes,
  }
}

/** Texto formatado para WhatsApp (rota do dia). */
export function montarMensagemWhatsAppRota({
  data,
  membroNome,
  paradas = [],
  igById = new Map(),
  linkApp = '',
}) {
  const nome = String(membroNome || 'equipe').trim()
  const dataFmt = String(data || '').trim()
  const linhasParadas = paradas.map((p, i) => {
    const ig = igById.get(String(p.igrejaId))
    const titulo = ig?.nome || `Igreja #${p.igrejaId}`
    const bairro = ig?.setor || ig?.bairro || '—'
    return `${i + 1}. ${titulo} - ${bairro}`
  })
  const link = linkApp || (typeof window !== 'undefined' ? window.location.origin : '')
  return [
    `📍 *Sua Rota de Hoje (${dataFmt})*`,
    `Olá ${nome}, sua rota com ${paradas.length} paradas foi criada:`,
    ...linhasParadas,
    `Acesse o app para iniciar: ${link}`,
  ].join('\n')
}

export function urlWhatsAppRota({ telefone, mensagem }) {
  const text = encodeURIComponent(String(mensagem || ''))
  const digits = String(telefone || '').replace(/\D/g, '')
  if (digits.length >= 10) {
    const num = digits.startsWith('55') ? digits : `55${digits}`
    return `https://wa.me/${num}?text=${text}`
  }
  return `https://wa.me/?text=${text}`
}

