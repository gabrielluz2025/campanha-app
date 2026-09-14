import { readStorage, writeStorage } from './persist'
import { IGREJAS_MAPA_SOMENTE_MANUAL } from './igrejasFonte'
import {
  VISITAS_STORAGE_KEY,
  IGREJAS_VISITAS_GERACAO,
  IGREJAS_VISITAS_GERACAO_ACK_KEY,
  IGREJAS_VISITAS_CLEARED_AT_KEY,
  normalizarRegistroVisita,
  normalizarVisitantes,
  labelVisitantes,
  compactRegistroForStorage,
  compactVisitasMap,
} from './igrejasVisitasCore'

export {
  VISITAS_STORAGE_KEY,
  IGREJAS_VISITAS_GERACAO,
  IGREJAS_VISITAS_GERACAO_ACK_KEY,
  IGREJAS_VISITAS_CLEARED_AT_KEY,
  normalizarRegistroVisita,
  isIgrejaVisitada,
  normalizarVisitantes,
  labelVisitantes,
  compactVisitasJson,
  mergeVisitasCanon,
  visitasStoreEmpty,
  fingerprintEntradaHistorico,
} from './igrejasVisitasCore'

function dataLocalHoje(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function uidVisita() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function agoraHoraLocal() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function labelUsuarioCurto(email = '', nome = '') {
  const n = String(nome || '').trim()
  if (n) return n
  const e = String(email || '').trim()
  if (!e) return ''
  return (e.split('@')[0] || e).replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function readVisitasRaw() {
  return readStorage(VISITAS_STORAGE_KEY, {}) || {}
}

/** Modo manual: visitas só para igrejas em igrejas_custom (ignora catálogo fixo id ≤ 1999). */
export function idsIgrejasComVisitasPermitidas() {
  if (!IGREJAS_MAPA_SOMENTE_MANUAL) return null
  const custom = readStorage('igrejas_custom', [])
  const arr = Array.isArray(custom) ? custom : []
  return new Set(arr.map(c => String(c.id)))
}

function filtrarMapaVisitasPorCadastro(map = {}) {
  const allow = idsIgrejasComVisitasPermitidas()
  if (!allow) return map
  const out = {}
  for (const [id, v] of Object.entries(map || {})) {
    if (allow.has(String(id))) out[id] = v
  }
  return out
}

/** Remove visitas de ids que não existem no cadastro manual (ex.: Emaús catálogo antigo id 7). */
export function podarVisitasForaCadastroManual({ write = true } = {}) {
  if (!IGREJAS_MAPA_SOMENTE_MANUAL) return { removidas: 0, changed: false }
  const raw = readVisitasRaw()
  const next = filtrarMapaVisitasPorCadastro(raw)
  const removidas = Object.keys(raw).length - Object.keys(next).length
  if (removidas > 0 && write) writeVisitasRaw(next, { force: true })
  return { removidas, changed: removidas > 0 }
}

/** Filtra JSON/string de visitas antes de merge na nuvem (modo manual). */
export function filtrarVisitasJsonAoCadastroManual(val) {
  if (!IGREJAS_MAPA_SOMENTE_MANUAL) return val
  const map = typeof val === 'string'
    ? (() => { try { return JSON.parse(val) } catch { return null } })()
    : val
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    return typeof val === 'string' ? val : JSON.stringify(val ?? {})
  }
  const next = filtrarMapaVisitasPorCadastro(map)
  return typeof val === 'string' ? JSON.stringify(next) : next
}

function readVisitasLimpoEm() {
  let local = 0
  try {
    if (typeof window !== 'undefined') {
      local = Number(JSON.parse(window.localStorage.getItem(IGREJAS_VISITAS_CLEARED_AT_KEY) || '0')) || 0
    }
  } catch { local = 0 }
  let stored = 0
  try {
    const v = readStorage(IGREJAS_VISITAS_CLEARED_AT_KEY)
    stored = Number(typeof v === 'number' ? v : String(v ?? '').replace(/^"|"$/g, '')) || 0
  } catch { stored = 0 }
  return Math.max(local, stored)
}

/** Compacta storage legado sempre que divergir (auto-cura local). */
export function compactarVisitasStorageSeDivergir() {
  try {
    const limpoEm = readVisitasLimpoEm()
    const raw = readVisitasRaw()
    const compact = compactVisitasMap(raw, { limpoEm })
    if (JSON.stringify(raw) !== JSON.stringify(compact)) {
      writeVisitasRaw(compact, { force: true })
      return true
    }
  } catch { /* ignore */ }
  return false
}

function writeVisitasRaw(visitas, opts) {
  writeStorage(VISITAS_STORAGE_KEY, visitas, opts)
}

export function loadMapaVisitasIgrejas() {
  try {
    const raw = filtrarMapaVisitasPorCadastro(readVisitasRaw())
    if (!raw || typeof raw !== 'object') return {}
    const out = {}
    for (const [id, v] of Object.entries(raw)) {
      const n = normalizarRegistroVisita(v)
      if (n?.historico?.length) out[id] = n
    }
    return out
  } catch {
    return {}
  }
}

/** Remove entradas repetidas (mesma rota/dia gravada várias vezes pelo sync). */
export function sanitizarHistoricosVisitasArmazenadas({ write = true } = {}) {
  const limpoEm = readVisitasLimpoEm()
  const raw = readVisitasRaw()
  const compact = compactVisitasMap(raw, { limpoEm })
  let removidasEntradas = 0
  for (const id of new Set([...Object.keys(raw), ...Object.keys(compact)])) {
    const antes = normalizarRegistroVisita(raw[id])?.historico?.length || 0
    const depois = normalizarRegistroVisita(compact[id])?.historico?.length || 0
    removidasEntradas += Math.max(0, antes - depois)
  }
  const changed = JSON.stringify(raw) !== JSON.stringify(compact)
  if (changed && write) writeVisitasRaw(compact, { force: true })
  return { changed, removidasEntradas }
}

export function marcarIgrejaVisitada(igrejaId, meta = {}) {
  if (igrejaId == null || igrejaId === '') return null
  try {
    const visitas = readVisitasRaw()
    const prev = normalizarRegistroVisita(visitas[igrejaId])
    const agora = new Date()
    const data = String(meta.data || '').trim() || dataLocalHoje(agora)
    const horaInicio = String(meta.horaInicio || '').trim() || agoraHoraLocal()
    let horaFim = String(meta.horaFim || '').trim()
    if (!horaFim && horaInicio && Number(meta.duracaoMin) > 0) {
      const [h, m] = horaInicio.split(':').map(Number)
      if (Number.isFinite(h) && Number.isFinite(m)) {
        const end = h * 60 + m + Number(meta.duracaoMin)
        horaFim = `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
      }
    }
    if (!horaFim) horaFim = agoraHoraLocal()
    const email = String(meta.visitadoPorEmail || '').trim()
    const visitantes = normalizarVisitantes(
      meta.visitantes,
      String(meta.visitadoPor || '').trim() || labelUsuarioCurto(email),
    )
    const quem = labelVisitantes(visitantes, String(meta.visitadoPor || '').trim() || labelUsuarioCurto(email))
    const rotaId = meta.rotaId != null ? String(meta.rotaId).trim() : ''
    const obs = String(meta.obs || '').trim()
    const checkInLat = meta.checkInLat != null && meta.checkInLat !== '' ? Number(meta.checkInLat) : undefined
    const checkInLng = meta.checkInLng != null && meta.checkInLng !== '' ? Number(meta.checkInLng) : undefined
    const origem = String(meta.origem || '').trim()
    const distanciaMetros = Number.isFinite(Number(meta.distanciaMetros))
      ? Math.round(Number(meta.distanciaMetros))
      : undefined
    const justificativaDistancia = String(meta.justificativaDistancia || '').trim()
    const entrada = {
      id: uidVisita(),
      rotaId: rotaId || undefined,
      data,
      horaInicio,
      horaFim,
      visitadoPor: quem,
      visitantes,
      visitadoPorEmail: email,
      concluidoEm: meta.concluidoEm || agora.toISOString(),
      obs,
      foto: String(meta.foto || '').trim(),
      ...(Number.isFinite(checkInLat) ? { checkInLat } : {}),
      ...(Number.isFinite(checkInLng) ? { checkInLng } : {}),
      ...(origem ? { origem } : {}),
      ...(distanciaMetros != null ? { distanciaMetros } : {}),
      ...(justificativaDistancia ? { justificativaDistancia } : {}),
    }
    const fpNova = fingerprintEntradaHistorico(entrada)
    if (prev?.historico?.some(h => fingerprintEntradaHistorico(h) === fpNova)) {
      return prev
    }
    const historico = [entrada, ...(prev?.historico || [])]
    const enriched = normalizarRegistroVisita({ historico })
    const stored = compactRegistroForStorage(enriched)
    if (!stored) return null
    visitas[String(igrejaId)] = stored
    writeVisitasRaw(visitas)
    return enriched
  } catch {
    return null
  }
}

export function desmarcarIgrejaVisitada(igrejaId) {
  if (igrejaId == null || igrejaId === '') return null
  try {
    const visitas = readVisitasRaw()
    const prev = normalizarRegistroVisita(visitas[igrejaId])
    if (!prev?.historico?.length) {
      delete visitas[igrejaId]
      delete visitas[String(igrejaId)]
      writeVisitasRaw(visitas)
      return null
    }
    const stored = { historico: prev.historico, pendente: true }
    visitas[String(igrejaId)] = stored
    writeVisitasRaw(visitas)
    return normalizarRegistroVisita(stored)
  } catch {
    return null
  }
}

/** Atualiza URL da foto após upload em background (check-in otimista). */
export function patchFotoEntradaVisita(igrejaId, entradaId, fotoUrl) {
  if (igrejaId == null || !entradaId || !fotoUrl) return null
  try {
    const visitas = readVisitasRaw()
    const prev = normalizarRegistroVisita(visitas[igrejaId])
    if (!prev?.historico?.length) return null
    const historico = prev.historico.map(h =>
      String(h.id) === String(entradaId) ? { ...h, foto: String(fotoUrl).trim() } : h,
    )
    const raw = prev.pendente ? { historico, pendente: true } : { historico }
    visitas[String(igrejaId)] = raw
    writeVisitasRaw(visitas)
    return normalizarRegistroVisita(raw)
  } catch {
    return null
  }
}

export function removerEntradaHistoricoVisita(igrejaId, entradaId) {
  if (igrejaId == null || !entradaId) return null
  try {
    const visitas = readVisitasRaw()
    const prev = normalizarRegistroVisita(visitas[igrejaId])
    if (!prev) return null
    const historico = (prev.historico || []).filter(h => String(h.id) !== String(entradaId))
    if (!historico.length) {
      delete visitas[igrejaId]
      delete visitas[String(igrejaId)]
      writeVisitasRaw(visitas)
      return null
    }
    const raw = prev.pendente ? { historico, pendente: true } : { historico }
    visitas[String(igrejaId)] = raw
    writeVisitasRaw(visitas)
    return normalizarRegistroVisita(raw)
  } catch {
    return null
  }
}

/** Compacta storage e remove fantasmas (visitado sem histórico). */
export function migrarVisitasStorageSePreciso() {
  if (typeof window === 'undefined') return false
  let ack = 0
  try { ack = Number(JSON.parse(localStorage.getItem(IGREJAS_VISITAS_GERACAO_ACK_KEY) || '0')) || 0 } catch { ack = 0 }

  const mudou = compactarVisitasStorageSeDivergir()
  if (ack >= IGREJAS_VISITAS_GERACAO && !mudou) return false

  try {
    localStorage.setItem(IGREJAS_VISITAS_GERACAO_ACK_KEY, String(IGREJAS_VISITAS_GERACAO))
    return mudou || ack < IGREJAS_VISITAS_GERACAO
  } catch {
    return mudou
  }
}

/** @deprecated use migrarVisitasStorageSePreciso */
export function sanitizarVisitasIgrejasSalvas() {
  try {
    const raw = readVisitasRaw()
    const compact = compactVisitasMap(raw)
    const mudou = JSON.stringify(raw) !== JSON.stringify(compact)
    if (mudou) writeVisitasRaw(compact)
    return mudou ? Object.keys(compact).length : 0
  } catch {
    return 0
  }
}

export async function limparTodasVisitasIgrejas() {
  const ts = Date.now()
  writeVisitasRaw({}, { force: true })
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(IGREJAS_VISITAS_CLEARED_AT_KEY, String(ts))
    }
  } catch { /* ignore */ }
  try {
    writeStorage(IGREJAS_VISITAS_CLEARED_AT_KEY, String(ts), { force: true })
  } catch { /* ignore */ }
  try {
    const { phpReplaceStoreKeys } = await import('../lib/cloudSync')
    await phpReplaceStoreKeys(
      [
        [VISITAS_STORAGE_KEY, '{}'],
        [IGREJAS_VISITAS_CLEARED_AT_KEY, String(ts)],
      ],
      [VISITAS_STORAGE_KEY, IGREJAS_VISITAS_CLEARED_AT_KEY],
    )
  } catch { /* ignore */ }
  try {
    const { flushAfterSave } = await import('./persist')
    await flushAfterSave()
  } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent('campanha:igrejas-atualizadas')) } catch { /* ignore */ }
  return { ok: true }
}
