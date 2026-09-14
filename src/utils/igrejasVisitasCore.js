/** Lógica pura de visitas — sem storage nem sync (evita dependência circular). */

export const VISITAS_STORAGE_KEY = 'igrejas_visitas'
export const IGREJAS_VISITAS_GERACAO = 5
export const IGREJAS_VISITAS_GERACAO_ACK_KEY = 'igrejas_visitas_geracao_ack'
export const IGREJAS_VISITAS_CLEARED_AT_KEY = 'igrejas_visitas_cleared_at'

function uidVisita() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function parseJsonSafe(val) {
  if (val == null || val === '') return null
  if (typeof val === 'object') return val
  try { return JSON.parse(val) } catch { return null }
}

export function normalizarVisitantes(rawNomes, fallbackStr = '') {
  const fromArr = Array.isArray(rawNomes)
    ? rawNomes.map(n => String(n || '').trim()).filter(Boolean)
    : []
  if (fromArr.length) {
    const seen = new Set()
    return fromArr.filter(n => {
      const k = n.toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }
  const s = String(fallbackStr || '').trim()
  if (!s) return []
  return s
    .split(/\s*(?:·|,|;|\be\b)\s*/i)
    .map(n => n.trim())
    .filter(Boolean)
}

export function labelVisitantes(visitantes = [], fallback = '') {
  const list = normalizarVisitantes(visitantes, fallback)
  if (!list.length) return String(fallback || '').trim() || ''
  if (list.length === 1) return list[0]
  if (list.length === 2) return `${list[0]} e ${list[1]}`
  return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`
}

function normTextoVisita(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function tsEntradaHistorico(h) {
  if (!h) return 0
  const t = Date.parse(String(h.concluidoEm || '').trim())
  if (Number.isFinite(t) && t > 0) return t
  const data = String(h.data || '').trim()
  const hora = String(h.horaInicio || h.hora || '12:00').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return Date.parse(`${data}T${hora}:00`) || 0
  }
  const m = String(h.obs || '').match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return Date.parse(`${m[3]}-${m[2]}-${m[1]}T${hora}:00`) || 0
  return 0
}

/** Data canônica YYYY-MM-DD (campo data ou data no texto da rota). */
function dataVisitaCanon(h) {
  const d = String(h?.data || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  const m = String(h?.obs || '').match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return d
}

function slugRotaObs(obs) {
  const o = normTextoVisita(obs)
  const m = o.match(/rota (concluid|parcial)[^:]*:\s*(.+)/)
  if (!m) return ''
  return m[2].replace(/\d{2}\/\d{2}\/\d{4}/g, '').replace(/\s+/g, ' ').trim()
}

/** Chave para não repetir a mesma visita (sync/rota marcando várias vezes). */
export function fingerprintEntradaHistorico(h) {
  if (!h) return ''
  const rotaId = String(h.rotaId || '').trim()
  if (rotaId) return `rota:${rotaId}`
  const obs = normTextoVisita(h.obs)
  const data = dataVisitaCanon(h)
  const slug = slugRotaObs(h.obs)
  if (slug && data) return `rota:${slug}|${data}`
  if (obs && (
    obs.includes('rota concluid')
    || obs.includes('rota parcial')
    || obs.includes('confirmado no campo')
  )) {
    return `evt:${obs}|${data}`
  }
  if (data && h.horaInicio) {
    return `manual:${data}|${String(h.horaInicio).trim()}|${normTextoVisita(h.visitadoPor)}|${obs}`
  }
  return `id:${String(h.id || '')}`
}

/** Descarta entradas anteriores à limpeza geral de visitas (recomeço do zero). */
export function filtrarHistoricoAposLimpeza(historico = [], limpoEm = 0) {
  if (!limpoEm || !Array.isArray(historico) || !historico.length) return historico
  const corte = limpoEm - 5000
  return historico.filter(h => tsEntradaHistorico(h) >= corte)
}

export function filtrarRegistroVisitaAposLimpeza(raw, limpoEm = 0) {
  if (!raw || typeof raw !== 'object' || !limpoEm) return raw
  if (!Array.isArray(raw.historico)) return raw
  const historico = filtrarHistoricoAposLimpeza(raw.historico, limpoEm)
  if (!historico.length) return null
  const next = { ...raw, historico }
  delete next.pendente
  return next
}

export function deduplicarHistoricoVisitas(historico = []) {
  const items = (historico || []).map(normalizarEntradaHistorico).filter(Boolean)
  const map = new Map()
  for (const h of items) {
    const fp = fingerprintEntradaHistorico(h)
    const prev = map.get(fp)
    if (!prev) {
      map.set(fp, h)
      continue
    }
    const tPrev = Date.parse(prev.concluidoEm || '') || 0
    const tNew = Date.parse(h.concluidoEm || '') || 0
    map.set(fp, tNew >= tPrev ? { ...prev, ...h } : { ...h, ...prev })
  }
  return ordenarHistorico([...map.values()])
}

function normalizarEntradaHistorico(h) {
  if (!h || typeof h !== 'object') return null
  const visitantes = normalizarVisitantes(h.visitantes, h.visitadoPor || h.usuario || '')
  const visitadoPor = labelVisitantes(visitantes, h.visitadoPor || h.usuario || '')
  const data = String(h.data || '').trim()
  const concluidoEm = String(h.concluidoEm || '').trim()
  const horaInicio = String(h.horaInicio || h.hora || '').trim()
  // Entrada vazia ({ id }) não conta como visita — evita pins dourados em massa
  if (!data && !concluidoEm && !visitadoPor && !horaInicio && !visitantes.length) return null
  return {
    id: String(h.id || uidVisita()),
    rotaId: String(h.rotaId || '').trim() || undefined,
    data,
    horaInicio,
    horaFim: String(h.horaFim || '').trim(),
    visitadoPor,
    visitantes,
    visitadoPorEmail: String(h.visitadoPorEmail || h.email || '').trim(),
    concluidoEm,
    obs: String(h.obs || '').trim(),
    foto: String(h.foto || '').trim(),
    checkInLat: h.checkInLat != null && h.checkInLat !== '' ? Number(h.checkInLat) : undefined,
    checkInLng: h.checkInLng != null && h.checkInLng !== '' ? Number(h.checkInLng) : undefined,
    origem: String(h.origem || '').trim() || undefined,
    distanciaMetros: Number.isFinite(Number(h.distanciaMetros)) ? Math.round(Number(h.distanciaMetros)) : undefined,
    justificativaDistancia: String(h.justificativaDistancia || '').trim() || undefined,
  }
}

function ordenarHistorico(historico = []) {
  return [...historico].sort((a, b) => {
    const ta = Date.parse(a.concluidoEm || `${a.data}T${a.horaInicio || '12:00'}:00`) || 0
    const tb = Date.parse(b.concluidoEm || `${b.data}T${b.horaInicio || '12:00'}:00`) || 0
    return tb - ta
  })
}

function registroPendente(raw) {
  if (!raw || typeof raw !== 'object') return false
  return raw.pendente === true || raw.visitado === false
}

/** Formato enriquecido para UI — visitado é derivado, nunca persistido. */
export function normalizarRegistroVisita(raw) {
  if (!raw) return null
  if (raw === true) return null

  if (typeof raw !== 'object') return null

  const historicoRaw = Array.isArray(raw.historico) ? raw.historico : null
  let historico = deduplicarHistoricoVisitas(historicoRaw ?? [])

  // Migra registro plano antigo só se nunca houve array historico
  if (historicoRaw === null && !historico.length
    && (raw.data || raw.horaInicio || raw.concluidoEm || raw.visitadoPor || raw.visitantes?.length)) {
    historico = deduplicarHistoricoVisitas([{
      id: uidVisita(),
      data: raw.data,
      horaInicio: raw.horaInicio || raw.hora,
      horaFim: raw.horaFim,
      visitadoPor: raw.visitadoPor,
      visitantes: raw.visitantes,
      visitadoPorEmail: raw.visitadoPorEmail,
      concluidoEm: raw.concluidoEm,
      obs: raw.obs || '',
    }])
  }

  if (!historico.length) return null

  const ultima = historico[0] || null
  const visitantesTop = normalizarVisitantes(raw.visitantes, raw.visitadoPor || ultima?.visitadoPor || '')
  const pendente = registroPendente(raw)
  const visitado = historico.length > 0 && !pendente

  return {
    visitado,
    pendente,
    data: String(raw.data || ultima?.data || '').trim(),
    horaInicio: String(raw.horaInicio || ultima?.horaInicio || '').trim(),
    horaFim: String(raw.horaFim || ultima?.horaFim || '').trim(),
    concluidoEm: String(raw.concluidoEm || ultima?.concluidoEm || '').trim(),
    visitadoPor: labelVisitantes(visitantesTop, raw.visitadoPor || ultima?.visitadoPor || ''),
    visitantes: visitantesTop.length ? visitantesTop : (ultima?.visitantes || []),
    visitadoPorEmail: String(raw.visitadoPorEmail || ultima?.visitadoPorEmail || '').trim(),
    historico,
    vezes: historico.length,
  }
}

export function isIgrejaVisitada(raw) {
  const n = normalizarRegistroVisita(raw)
  return Boolean(n?.visitado)
}

/** Formato persistido: só historico (+ pendente opcional). */
export function compactRegistroForStorage(n) {
  if (!n?.historico?.length) return null
  if (n.pendente) return { historico: n.historico, pendente: true }
  return { historico: n.historico }
}

export function compactVisitasMap(rawMap, { limpoEm = 0 } = {}) {
  const src = rawMap && typeof rawMap === 'object' ? rawMap : {}
  const out = {}
  for (const [id, v] of Object.entries(src)) {
    const filtrado = filtrarRegistroVisitaAposLimpeza(v, limpoEm)
    if (!filtrado) continue
    const n = normalizarRegistroVisita(filtrado)
    const compact = compactRegistroForStorage(n)
    if (compact) out[String(id)] = compact
  }
  return out
}

export function compactVisitasJson(val, opts = {}) {
  const map = typeof val === 'string' ? (parseJsonSafe(val) || {}) : (val || {})
  return JSON.stringify(compactVisitasMap(map, opts))
}

export function visitasStoreEmpty(val) {
  const v = parseJsonSafe(val)
  if (v == null) return true
  if (typeof v !== 'object' || Array.isArray(v)) return false
  return Object.keys(v).length === 0
}

export function mergeHistoricoEntries(ha = [], hb = []) {
  const map = new Map()
  for (const h of [...(Array.isArray(hb) ? hb : []), ...(Array.isArray(ha) ? ha : [])]) {
    const norm = normalizarEntradaHistorico(h)
    if (!norm) continue
    const id = norm.id
    if (!map.has(id)) map.set(id, norm)
    else {
      const prev = map.get(id)
      const tPrev = Date.parse(prev.concluidoEm || '') || 0
      const tNew = Date.parse(norm.concluidoEm || '') || 0
      map.set(id, tNew >= tPrev ? { ...prev, ...norm } : { ...norm, ...prev })
    }
  }
  return deduplicarHistoricoVisitas([...map.values()])
}

function asRegistroRaw(v) {
  if (!v || v === false) return null
  if (v === true) return null
  if (typeof v === 'object') return v
  return null
}

/** União de históricos; formato compacto na saída. */
export function mergeVisitasCanon(aStr, bStr, limpoEm = 0) {
  const a = parseJsonSafe(aStr) || {}
  const b = parseJsonSafe(bStr) || {}
  const ids = new Set([...Object.keys(a || {}), ...Object.keys(b || {})])
  const out = {}

  for (const k of ids) {
    const ra = asRegistroRaw(a[k])
    const rb = asRegistroRaw(b[k])
    if (!ra && !rb) continue
    if (ra && !rb) {
      const filtrado = filtrarRegistroVisitaAposLimpeza(ra, limpoEm)
      if (!filtrado) continue
      const n = normalizarRegistroVisita(filtrado)
      const c = compactRegistroForStorage(n)
      if (c) out[k] = c
      continue
    }
    if (rb && !ra) {
      const filtrado = filtrarRegistroVisitaAposLimpeza(rb, limpoEm)
      if (!filtrado) continue
      const n = normalizarRegistroVisita(filtrado)
      const c = compactRegistroForStorage(n)
      if (c) out[k] = c
      continue
    }

    const ha = filtrarHistoricoAposLimpeza(ra.historico, limpoEm)
    const hb = filtrarHistoricoAposLimpeza(rb.historico, limpoEm)
    const historico = mergeHistoricoEntries(ha, hb)
    if (!historico.length) continue

    const pendenteA = registroPendente(ra)
    const pendenteB = registroPendente(rb)
    const pendente = pendenteA && pendenteB
    out[k] = pendente ? { historico, pendente: true } : { historico }
  }

  return compactVisitasJson(out, { limpoEm })
}
