import { writeStorage, flushAfterSave } from './persist'
import { encodeShareToken, decodeShareToken, shareUid, fetchApiKey, postApiKey } from './agendaShare'
import { cultoParaData, horaInicioCultoNaData } from './cultoParse'
import { formatEnderecoParada, enderecoLinhaParada, proximaParadaAberta, estaNoLocalParada, distanciaMetrosParada, coordValida } from './rotaUtils'

export const KEY_ROTAS_COMPARTILHAMENTOS = 'rotas_compartilhamentos'

export function execucaoKey(shareId) {
  return `rota_execucao_${shareId}`
}

export function posicaoAoVivoKey(shareId) {
  return `rota_posicao_${shareId}`
}

export function shareIdOk(id) {
  return /^[a-zA-Z0-9_-]{6,40}$/.test(String(id || ''))
}

export function shareIdOkForWrite(id) {
  return /^[a-zA-Z0-9_-]{12,40}$/.test(String(id || ''))
}

export function urlRotaEquipe(shareId) {
  const id = String(shareId || '').trim()
  if (!id) return ''
  const origin = typeof window !== 'undefined'
    ? window.location.origin
    : 'https://campanha.space'
  return `${origin}/#/rota-equipe/${id}`
}

export function decodeRotaToken(token) {
  const raw = String(token || '').trim()
  if (shareIdOk(raw) && !raw.includes('=')) {
    return { shareId: raw, rotaId: '', paradas: [], _idOnly: true }
  }
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(raw))))
    if (!data?.rotaId && !data?.shareId) return null
    return data
  } catch {
    const data = decodeShareToken(token)
    if (!data?.rotaId && !data?.shareId) return null
    return data
  }
}

export const MOTIVOS_NAO_VISITA = [
  { id: 'fechada', label: 'Igreja fechada' },
  { id: 'ausente', label: 'Pastor / responsável ausente' },
  { id: 'endereco', label: 'Endereço errado / não achei' },
  { id: 'reagendar', label: 'Precisa reagendar' },
  { id: 'chuva', label: 'Clima / impedimento' },
  { id: 'outro', label: 'Outro motivo' },
]

export function igrejaIdDaParadaKey(key = '') {
  const s = String(key || '')
  if (s.startsWith('igreja:')) return s.slice(7)
  return ''
}

export function detalheParada(exec, key) {
  const d = exec?.detalhes?.[key]
  if (d && typeof d === 'object') return d
  const st = exec?.statusParadas?.[key]
  return st ? { status: st } : { status: 'pendente' }
}

export function resumoExecucao(exec, paradas = []) {
  let visitadas = 0
  let justificadas = 0
  let andamento = 0
  let pendentes = 0
  for (const p of paradas) {
    const st = detalheParada(exec, p.key).status || 'pendente'
    if (st === 'concluido') visitadas += 1
    else if (st === 'nao_visitou' || st === 'reagendar' || st === 'cancelado') justificadas += 1
    else if (st === 'em_deslocamento' || st === 'no_local') andamento += 1
    else pendentes += 1
  }
  const total = paradas.length
  const resolvidas = visitadas + justificadas
  return {
    visitadas,
    justificadas,
    andamento,
    pendentes,
    total,
    resolvidas,
    pct: total ? Math.round((resolvidas / total) * 100) : 0,
  }
}

const APLICADO_KEY = 'rota_exec_aplicado'

export function jaAplicouExecucao(shareId, key, stamp) {
  try {
    const m = JSON.parse(localStorage.getItem(APLICADO_KEY) || '{}')
    return m[`${shareId}:${key}`] === stamp
  } catch {
    return false
  }
}

export function marcarAplicouExecucao(shareId, key, stamp) {
  try {
    const m = JSON.parse(localStorage.getItem(APLICADO_KEY) || '{}')
    m[`${shareId}:${key}`] = stamp
    localStorage.setItem(APLICADO_KEY, JSON.stringify(m))
  } catch { /* ignore */ }
}

export function encodeRotaToken(payload) {
  return encodeShareToken(payload)
}

export function loadCompartilhamentosRotas() {
  try {
    return JSON.parse(localStorage.getItem(KEY_ROTAS_COMPARTILHAMENTOS) || '[]')
  } catch {
    return []
  }
}

export const STATUS_ROTA_AO_VIVO_INATIVO = ['concluida', 'parcial', 'cancelada']

function paradasRotaResolvidas(rota) {
  const paradas = (rota?.paradas || []).filter(p => {
    const key = typeof p === 'string' ? p : p?.key
    return key && !String(key).startsWith('equipe:')
  })
  if (!paradas.length) return false
  return paradas.every(p => {
    const st = typeof p === 'string' ? 'pendente' : (p?.status || 'pendente')
    return ['concluido', 'cancelado', 'nao_visitou', 'reagendar'].includes(st)
  })
}

export function rotaSaiDoCampoAoVivo(rota, exec = null) {
  if (!rota) return false
  if (STATUS_ROTA_AO_VIVO_INATIVO.includes(String(rota.status || ''))) return true
  if (paradasRotaResolvidas(rota)) return true
  const execSt = String(exec?.rotaStatus || '')
  return execSt === 'encerrada' || execSt === 'concluida' || execSt === 'parcial'
}

export function registrarCompartilhamentoRota(share) {
  const lista = loadCompartilhamentosRotas()
  const idx = lista.findIndex(s => s.rotaId === share.rotaId)
  const prev = idx >= 0 ? lista[idx] : null
  const encerrada = typeof share.encerrada === 'boolean'
    ? share.encerrada
    : (prev?.encerrada ?? false)
  const entrada = { ...prev, ...share, encerrada, atualizadoEm: new Date().toISOString() }
  if (idx >= 0) lista[idx] = entrada
  else lista.push(entrada)
  writeStorage(KEY_ROTAS_COMPARTILHAMENTOS, lista)
  return lista
}

export function removerCompartilhamentoRota(rotaId) {
  const lista = loadCompartilhamentosRotas().filter(s => String(s.rotaId) !== String(rotaId))
  writeStorage(KEY_ROTAS_COMPARTILHAMENTOS, lista)
  return lista
}

export function compartilhamentoDaRota(rotaId) {
  return loadCompartilhamentosRotas().find(s => String(s.rotaId) === String(rotaId)) || null
}

export function listarCompartilhamentosAtivos() {
  return loadCompartilhamentosRotas().filter(s => s?.shareId && !s.encerrada)
}

export function execucaoEstaEncerrada(exec, share, rota = null) {
  if (share?.encerrada) return true
  if (rotaSaiDoCampoAoVivo(rota, exec)) return true
  return String(exec?.rotaStatus || '') === 'encerrada'
}

/** Fecha links ao vivo de rotas já concluídas/parciais/canceladas (limpeza de sessões antigas). */
export async function limparSharesRotasFinalizadas(rotas = []) {
  const mapRota = new Map((rotas || []).map(r => [String(r.id), r]))
  const shares = loadCompartilhamentosRotas().filter(s => s?.shareId && !s.encerrada)
  let fechados = 0
  for (const s of shares) {
    const rota = mapRota.get(String(s.rotaId))
    if (!rota) continue
    const exec = await loadExecucao(s.shareId).catch(() => null)
    if (!rotaSaiDoCampoAoVivo(rota, exec)) continue
    await encerrarAoVivoRota(s.shareId)
    fechados += 1
  }
  return fechados
}

const PHP_API = typeof window !== 'undefined'
  ? `${window.location.origin}/api.php`
  : '/api.php'

function tsDe(v) {
  const t = new Date(v?.atualizadoEm || 0).getTime()
  return Number.isFinite(t) ? t : 0
}

/** GPS conta como ao vivo se a posição foi atualizada recentemente. */
export const GPS_AO_VIVO_MS = 3 * 60 * 1000
/** Mostra o pin no mapa mesmo com GPS pausado (ex.: parado no local). */
export const GPS_VISIBILIDADE_MS = 20 * 60 * 1000
/** Intervalo de heartbeat quando parado (seg). */
export const GPS_ENVIO_INTERVALO_MS = 2500
/** Mínimo entre envios quando em movimento (ms). */
export const GPS_ENVIO_MOVIMENTO_MS = 800
/** Distância mínima (m) para considerar movimento e enviar imediato. */
export const GPS_MOVIMENTO_METROS = 3

export function gpsEstaAoVivo(posicao, agora = Date.now(), { encerrada = false } = {}) {
  if (encerrada) return false
  if (!coordValida(posicao?.lat, posicao?.lng)) return false
  const t = new Date(posicao?.atualizadoEm || 0).getTime()
  if (!Number.isFinite(t) || t <= 0) return false
  return agora - t < GPS_AO_VIVO_MS
}

function posicaoMaisRecente(a, b) {
  if (!a?.lat && !b?.lat) return a || b || null
  if (!a?.lat) return b
  if (!b?.lat) return a
  return tsDe(b) >= tsDe(a) ? b : a
}

let apiFailStreak = 0
let apiPausedUntil = 0

function noteApiFailure(status) {
  if (status >= 500) {
    apiFailStreak = Math.min(apiFailStreak + 1, 12)
    apiPausedUntil = Date.now() + Math.min(60_000, 2000 * apiFailStreak)
  }
}

function noteApiSuccess() {
  apiFailStreak = 0
  apiPausedUntil = 0
}

function apiPaused() {
  return Date.now() < apiPausedUntil
}

export async function fetchPosicaoAoVivo(shareId) {
  if (!shareIdOk(shareId) || apiPaused()) return null
  try {
    const { fetchPosicaoComEtag } = await import('./rotaLiveStream.js')
    const pos = await fetchPosicaoComEtag(shareId)
    if (pos?.unchanged) return { __unchanged: true }
    if (pos) noteApiSuccess()
    return pos
  } catch {
    return null
  }
}

export async function postPosicaoAoVivo(shareId, posicao) {
  if (!shareIdOk(shareId) || !posicao) return false
  try {
    const res = await fetch(`${PHP_API}?action=rota_posicao&shareId=${encodeURIComponent(shareId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shareId, posicao }),
      keepalive: true,
    })
    if (res.ok) noteApiSuccess()
    else noteApiFailure(res.status)
    return res.ok
  } catch {
    return false
  }
}

/** Envia só a posição (leve) — não reenvia fotos da execução. */
export function salvarPosicaoAoVivo(shareId, coords, execBase = null) {
  if (!shareIdOk(shareId) || !coords) return null
  const posicao = {
    lat: coords.latitude,
    lng: coords.longitude,
    acc: Math.round(coords.accuracy || 0),
    heading: Number.isFinite(coords.heading) && coords.heading >= 0 ? coords.heading : null,
    speed: Number.isFinite(coords.speed) && coords.speed >= 0 ? coords.speed : null,
    atualizadoEm: new Date().toISOString(),
  }
  const key = execucaoKey(shareId)
  try {
    const prev = execBase || JSON.parse(localStorage.getItem(key) || 'null')
    if (prev && typeof prev === 'object') {
      localStorage.setItem(key, JSON.stringify({
        ...prev,
        posicao,
        atualizadoEm: posicao.atualizadoEm,
      }))
    }
  } catch { /* ignore */ }
  postPosicaoAoVivo(shareId, posicao)
    .then((ok) => {
      if (!ok) {
        import('./rotaGpsQueue.js').then(({ enqueueGpsPosition }) => {
          enqueueGpsPosition(shareId, posicao)
        }).catch(() => {})
      }
    })
    .catch(() => {
      import('./rotaGpsQueue.js').then(({ enqueueGpsPosition }) => {
        enqueueGpsPosition(shareId, posicao)
      }).catch(() => {})
    })
  return posicao
}

/** Poll rápido para o painel — só API pública + posição leve. */
export async function pollExecucaoAoVivo(shareId, prevExec = null) {
  if (!shareIdOk(shareId)) return prevExec || null
  const [publico, posicao] = await Promise.all([
    fetchExecucaoPublica(shareId),
    fetchPosicaoAoVivo(shareId),
  ])
  let exec = mergeExecucao(publico, prevExec)
  const bestPos = posicaoMaisRecente(exec?.posicao, posicao)
  if (bestPos) {
    if (!exec) exec = criarExecucaoVazia({ shareId })
    exec = { ...exec, posicao: bestPos }
  }
  return exec
}

/** Só busca posição GPS (ultra-rápido para painel ao vivo). */
export async function pollPosicaoRapida(shareId, prevExec = null) {
  if (!shareIdOk(shareId)) return prevExec || null
  const posicao = await fetchPosicaoAoVivo(shareId)
  if (posicao?.__unchanged) return prevExec || null
  if (!posicao) return prevExec || null
  if (!prevExec) {
    return {
      ...criarExecucaoVazia({ shareId }),
      posicao,
      atualizadoEm: posicao.atualizadoEm || new Date().toISOString(),
    }
  }
  const bestPos = posicaoMaisRecente(prevExec.posicao, posicao)
  if (!bestPos) return prevExec
  const prevPos = prevExec.posicao
  const moved = prevPos
    && (Number(bestPos.lat) !== Number(prevPos.lat) || Number(bestPos.lng) !== Number(prevPos.lng))
  if (!moved && tsDe(bestPos) <= tsDe(prevPos)) return prevExec
  return {
    ...prevExec,
    posicao: bestPos,
    atualizadoEm: bestPos.atualizadoEm || prevExec.atualizadoEm,
  }
}
export function gpsPosicaoVisivel(posicao, agora = Date.now(), { encerrada = false } = {}) {
  if (encerrada) return false
  if (!coordValida(posicao?.lat, posicao?.lng)) return false
  const t = new Date(posicao?.atualizadoEm || 0).getTime()
  if (!Number.isFinite(t) || t <= 0) return false
  return agora - t < GPS_VISIBILIDADE_MS
}

/** Marca automaticamente "no_local" quando o GPS está dentro do raio da próxima parada. */
export function aplicarChegadaAutomaticaGps(exec, paradas, posicao, { geofenceConfirmado = false } = {}) {
  if (!exec || !posicao) return exec
  if (!coordValida(posicao.lat, posicao.lng)) return exec

  const proxima = proximaParadaAberta(exec, paradas, detalheParada)
  if (!proxima) return exec

  const st = detalheParada(exec, proxima.key).status || 'pendente'
  if (['concluido', 'nao_visitou', 'reagendar', 'cancelado', 'no_local'].includes(st)) return exec
  if (!geofenceConfirmado && !estaNoLocalParada(posicao, proxima)) return exec

  const agora = new Date().toISOString()
  const dist = Math.round(distanciaMetrosParada(posicao, proxima))
  const detalhes = { ...(exec.detalhes || {}) }
  detalhes[proxima.key] = {
    ...(detalhes[proxima.key] || {}),
    status: 'no_local',
    atualizadoEm: agora,
    chegadaAuto: true,
    distanciaMetros: dist,
  }
  return {
    ...exec,
    statusParadas: { ...(exec.statusParadas || {}), [proxima.key]: 'no_local' },
    detalhes,
    atualizadoEm: agora,
  }
}

function maisRecente(...cands) {
  return cands
    .filter(v => v && typeof v === 'object')
    .sort((a, b) => tsDe(b) - tsDe(a))[0] || null
}

function pesoStatusRota(st) {
  return ({ encerrada: 5, concluida: 4, parcial: 3, em_andamento: 1 }[String(st || '')] || 0)
}

function pesoDetalhe(d) {
  if (!d || typeof d !== 'object') return 0
  const st = String(d.status || '')
  let n = 0
  if (d.foto) n += 8
  if (d.confirmadoEm) n += 4
  if (st === 'concluido' || st === 'nao_visitou' || st === 'reagendar') n += 6
  else if (st === 'no_local') n += 2
  else if (st === 'em_deslocamento') n += 1
  return n
}

function mergeDetalheParada(a, b) {
  if (!a) return b
  if (!b) return a
  const pa = pesoDetalhe(a)
  const pb = pesoDetalhe(b)
  if (pa !== pb) return pa > pb ? a : b
  return tsDe(b) >= tsDe(a) ? b : a
}

export function mergeExecucao(...cands) {
  const validos = cands.filter(v => v && typeof v === 'object')
  if (!validos.length) return null
  const base = maisRecente(...validos)
  const pos = maisRecente(...validos.map(v => v.posicao).filter(Boolean))
  const detalhes = {}
  const statusParadas = {}
  for (const v of validos) {
    for (const [k, d] of Object.entries(v.detalhes || {})) {
      detalhes[k] = mergeDetalheParada(detalhes[k], d)
    }
    for (const [k, st] of Object.entries(v.statusParadas || {})) {
      const atual = statusParadas[k]
      const cand = { status: st }
      const winner = mergeDetalheParada(atual ? { status: atual } : null, cand)
      statusParadas[k] = winner?.status || st
    }
  }
  for (const [k, d] of Object.entries(detalhes)) {
    if (d?.status && pesoDetalhe(d) >= pesoDetalhe({ status: statusParadas[k] })) {
      statusParadas[k] = d.status
    }
  }
  const rotaStatus = validos
    .map(v => v.rotaStatus)
    .filter(Boolean)
    .sort((a, b) => pesoStatusRota(b) - pesoStatusRota(a))[0] || base.rotaStatus
  return {
    ...base,
    rotaStatus,
    posicao: pos || base.posicao || null,
    detalhes: Object.keys(detalhes).length ? detalhes : (base.detalhes || {}),
    statusParadas: Object.keys(statusParadas).length ? statusParadas : (base.statusParadas || {}),
  }
}

export async function fetchSharePublica(shareId) {
  if (!shareIdOk(shareId)) return null
  try {
    const res = await fetch(`${PHP_API}?action=rota_share&shareId=${encodeURIComponent(shareId)}&_=${Date.now()}`)
    if (!res.ok) return null
    const text = await res.text()
    if (!text || text === 'null') return null
    const data = JSON.parse(text)
    return data && typeof data === 'object' ? data : null
  } catch {
    return null
  }
}

export async function postSharePublica(shareId, share) {
  if (!shareIdOk(shareId) || !share) return false
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${PHP_API}?action=rota_share&shareId=${encodeURIComponent(shareId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareId, share }),
      })
      if (res.ok) return true
      if (res.status >= 500 && attempt < 2) {
        await new Promise(r => setTimeout(r, 600 * (attempt + 1)))
        continue
      }
      return false
    } catch {
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 600 * (attempt + 1)))
        continue
      }
      return false
    }
  }
  return false
}

export async function postRotaFoto(shareId, paradaKey, dataUrl) {
  if (!shareIdOk(shareId) || !String(dataUrl || '').startsWith('data:image')) return ''
  try {
    const res = await fetch(`${PHP_API}?action=rota_foto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shareId, paradaKey: String(paradaKey || 'foto').slice(0, 48), dataUrl }),
    })
    const j = await res.json().catch(() => ({}))
    return res.ok && j?.url ? String(j.url) : ''
  } catch {
    return ''
  }
}

export async function fetchExecucaoPublica(shareId) {
  if (!shareIdOk(shareId)) return null
  try {
    const res = await fetch(`${PHP_API}?action=rota_execucao&shareId=${encodeURIComponent(shareId)}&_=${Date.now()}`)
    if (!res.ok) return null
    const text = await res.text()
    if (!text || text === 'null') return null
    const data = JSON.parse(text)
    return data && typeof data === 'object' ? data : null
  } catch {
    return null
  }
}

export async function postExecucaoPublica(shareId, payload) {
  if (!shareIdOk(shareId)) return false
  try {
    const res = await fetch(`${PHP_API}?action=rota_execucao&shareId=${encodeURIComponent(shareId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shareId, execucao: payload }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function loadExecucao(shareId) {
  const key = execucaoKey(shareId)
  const local = (() => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
  })()
  const [publico, autenticado, posicao] = await Promise.all([
    fetchExecucaoPublica(shareId),
    fetchApiKey(key),
    fetchPosicaoAoVivo(shareId),
  ])
  const localAgora = (() => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
  })()
  let melhor = mergeExecucao(publico, autenticado, local, localAgora)
  if (!melhor) {
    const fallback = mergeExecucao(local, localAgora)
    if (fallback) melhor = fallback
    else return null
  }
  const bestPos = posicaoMaisRecente(melhor.posicao, posicao)
  if (bestPos) melhor = { ...melhor, posicao: bestPos }
  localStorage.setItem(key, JSON.stringify(melhor))
  return melhor
}

export async function saveExecucao(shareId, data) {
  const key = execucaoKey(shareId)
  const payload = { ...data, shareId, atualizadoEm: new Date().toISOString() }
  localStorage.setItem(key, JSON.stringify(payload))
  const okPub = await postExecucaoPublica(shareId, payload)
  if (!okPub) await postApiKey(key, payload)
  return payload
}

export async function publicarExecucaoRota(share) {
  if (!share?.shareId) return null
  const sharePub = { ...share, encerrada: false, encerradaEm: null }
  await postSharePublica(share.shareId, sharePub)
  await postApiKey(`rota_execucao_pub_${share.shareId}`, {
    shareId: share.shareId,
    rotaId: share.rotaId || '',
    criadoEm: new Date().toISOString(),
  })
  const existente = await loadExecucao(share.shareId)
  if (existente) {
    if (execucaoEstaEncerrada(existente, sharePub)) {
      return saveExecucao(share.shareId, {
        ...existente,
        rotaStatus: 'em_andamento',
        encerradaEm: null,
        posicao: null,
        atualizadoEm: new Date().toISOString(),
      })
    }
    return existente
  }
  return saveExecucao(share.shareId, criarExecucaoVazia({
    shareId: share.shareId,
    rotaId: share.rotaId,
    membroId: share.membroId,
    membroNome: share.membro,
  }))
}

/** Encerra o ao vivo: remove GPS, invalida o link no celular e some da sala ao vivo. */
export async function encerrarAoVivoRota(shareId) {
  if (!shareIdOk(shareId)) return false
  const agora = new Date().toISOString()
  const existente = await loadExecucao(shareId) || criarExecucaoVazia({ shareId })
  await saveExecucao(shareId, {
    ...existente,
    rotaStatus: 'encerrada',
    posicao: null,
    encerradaEm: agora,
    atualizadoEm: agora,
  })
  const share = await fetchSharePublica(shareId)
  if (share && typeof share === 'object') {
    await postSharePublica(shareId, { ...share, encerrada: true, encerradaEm: agora })
  }
  const lista = loadCompartilhamentosRotas().map(s => (
    s.shareId === shareId ? { ...s, encerrada: true, encerradaEm: agora } : s
  ))
  writeStorage(KEY_ROTAS_COMPARTILHAMENTOS, lista)
  try { localStorage.removeItem(execucaoKey(shareId)) } catch { /* ignore */ }
  return true
}

export function criarExecucaoVazia({ shareId, rotaId, membroId, membroNome }) {
  return {
    shareId,
    rotaId: rotaId || '',
    membroId: membroId || '',
    membroNome: membroNome || '',
    statusParadas: {},
    detalhes: {},
    posicao: null,
    rotaStatus: 'em_andamento',
    atualizadoEm: new Date().toISOString(),
  }
}

export async function persistirCompartilhamentoRota(share) {
  const lista = registrarCompartilhamentoRota(share)
  await flushAfterSave()
  return lista
}

export function criarShareRota({ rota, membro, membroId }) {
  const shareId = shareUid()
  const dataRota = rota.data || ''
  const paradas = (rota.paradas || []).map(p => {
    const culto = p.culto || ''
    const horaPrevista = p.horaPrevista
      || (culto ? horaInicioCultoNaData(culto, dataRota) : '')
      || ''
    const lat = coordValida(p.lat, p.lng) ? Number(p.lat) : null
    const lng = coordValida(p.lat, p.lng) ? Number(p.lng) : null
    const enderecoFmt = formatEnderecoParada(p)
    return {
      key: p.key,
      tipoParada: p.tipoParada,
      nome: p.nome || p.titulo || '',
      endereco: enderecoFmt || p.endereco || p.local || '',
      enderecoCurto: p.enderecoCurto || enderecoLinhaParada(p) || '',
      setor: p.setor || p.bairro || '',
      bairro: p.bairro || p.setor || '',
      logradouro: p.logradouro || p.rua || '',
      numero: p.numero || '',
      cidade: p.cidade || 'Blumenau',
      uf: p.uf || 'SC',
      lat,
      lng,
      horaPrevista,
      culto,
      cultoResumo: culto ? cultoParaData(culto, dataRota) : '',
      duracaoMin: p.duracaoMin || 15,
      material: p.material || null,
      obs: p.obs || '',
      igrejaId: p.id || igrejaIdDaParadaKey(p.key) || null,
    }
  })
  return {
    v: 2,
    shareId,
    rotaId: rota.id,
    nome: rota.nome,
    data: rota.data,
    membro: membro || '',
    membroId: membroId || '',
    paradas,
    podeExecutar: true,
    expiraEm: new Date(Date.now() + 14 * 86400000).toISOString(),
    criadoEm: new Date().toISOString(),
  }
}
