import { readStorage, readStorageArray } from './persist'
import { readIgrejasVisitas } from './igrejasCatalog'
import { normalizarRegistroVisita } from './igrejasVisitasCore'
import { coordValida, distanciaMetrosParada, haversineKm } from './rotaUtils'

export const RAIO_CHECKIN_CAMPO_M = 200

export function dataLocalHoje(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function dataLocalOffsetDias(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return dataLocalHoje(d)
}

export function obterGpsAtual({ timeoutMs = 18000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('GPS não disponível neste aparelho.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
      },
      (err) => {
        const code = err?.code
        if (code === 1) reject(new Error('Permita o acesso ao GPS nas configurações do navegador.'))
        else if (code === 3) reject(new Error('GPS demorou demais. Tente de novo ao ar livre.'))
        else reject(new Error('Não foi possível obter a localização.'))
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    )
  })
}

function normEmail(e) {
  return String(e || '').trim().toLowerCase()
}

/** Igreja vinculada ao membro da equipe (cadastro Equipe). */
export function igrejaIdDoMembroLogado(email) {
  const membros = readStorageArray('equipe_membros', [])
  const m = membros.find(x => normEmail(x.email) === normEmail(email))
  if (m?.igrejaId != null && m.igrejaId !== '') return m.igrejaId
  return null
}

function entradaHoje(h, hoje) {
  return String(h?.data || '').trim() === hoje
}

function emailEntrada(h) {
  return normEmail(h?.visitadoPorEmail || h?.email || '')
}

/**
 * Feed unificado de check-ins do dia (todas as igrejas).
 * @returns {{ id, igrejaId, igrejaNome, setor, hora, visitadoPor, email, obs, foto, checkInLat, checkInLng }[]}
 */
export function listarCheckInsDoDia({ dataRef, catalog = [], visitasMap = null, somenteEmail = '' } = {}) {
  const hoje = dataRef || dataLocalHoje()
  const map = visitasMap || readIgrejasVisitas()
  const cat = Array.isArray(catalog) ? catalog : []
  const byId = new Map(cat.map(ig => [String(ig.id), ig]))
  const filtroEmail = normEmail(somenteEmail)
  const out = []

  for (const [id, raw] of Object.entries(map || {})) {
    const reg = normalizarRegistroVisita(raw)
    if (!reg?.historico?.length) continue
    const ig = byId.get(String(id)) || { id, nome: `Igreja #${id}`, setor: '' }
    for (const h of reg.historico) {
      if (!entradaHoje(h, hoje)) continue
      if (filtroEmail && emailEntrada(h) !== filtroEmail) continue
      out.push({
        id: h.id,
        igrejaId: id,
        igrejaNome: ig.nome || '',
        setor: ig.setor || '',
        hora: h.horaInicio || '',
        visitadoPor: h.visitadoPor || '',
        email: h.visitadoPorEmail || '',
        obs: h.obs || '',
        foto: h.foto || '',
        checkInLat: h.checkInLat,
        checkInLng: h.checkInLng,
        distanciaMetros: h.distanciaMetros,
        justificativaDistancia: h.justificativaDistancia || '',
        concluidoEm: h.concluidoEm || '',
      })
    }
  }

  out.sort((a, b) => {
    const ta = Date.parse(a.concluidoEm || `${hoje}T${a.hora || '00:00'}:00`) || 0
    const tb = Date.parse(b.concluidoEm || `${hoje}T${b.hora || '00:00'}:00`) || 0
    return tb - ta
  })
  return out
}

export function distanciaCheckinMetros(gps, igreja) {
  if (!gps?.lat || !gps?.lng) return Infinity
  return distanciaMetrosParada(
    { lat: gps.lat, lng: gps.lng },
    { lat: igreja?.lat, lng: igreja?.lng },
  )
}

export function googleMapsDirUrl(igreja) {
  const lat = Number(igreja?.lat)
  const lng = Number(igreja?.lng)
  if (coordValida(lat, lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  }
  const q = encodeURIComponent(String(igreja?.endereco || igreja?.nome || '').trim())
  return `https://www.google.com/maps/search/?api=1&query=${q}`
}

export function labelDistanciaCheckin(distanciaMetros) {
  const d = Number(distanciaMetros)
  if (!Number.isFinite(d)) return 'Sem referência GPS da igreja'
  const m = Math.round(d)
  if (m <= RAIO_CHECKIN_CAMPO_M) return `Check-in feito a ${m}m da igreja`
  return `Check-in fora do raio: ${m}m`
}

export function foraDoRaioCheckin(distanciaMetros) {
  const d = Number(distanciaMetros)
  if (!Number.isFinite(d)) return false
  return d > RAIO_CHECKIN_CAMPO_M
}

/** Critério de alerta na torre: distância > raio ou justificativa preenchida. */
export function checkInAlertaForaRaio(item) {
  if (!item) return false
  if (foraDoRaioCheckin(item.distanciaMetros)) return true
  return Boolean(String(item.justificativaDistancia || '').trim())
}

export function chaveCheckInTorre(item) {
  if (!item) return ''
  const id = item.id != null ? String(item.id) : ''
  const ig = item.igrejaId != null ? String(item.igrejaId) : ''
  const em = String(item.concluidoEm || item.hora || '').trim()
  return `${ig}:${id}:${em}`
}

/** Pull leve de rotas + visitas para torre de controle (polling). */
export async function syncCampoTorreFromServer() {
  const { syncIgrejasVisitasFromServer, pullAll, getPhpAuthContext } = await import('../lib/cloudSync.js')
  const { tenantId } = getPhpAuthContext()
  const uid = tenantId || 'local'
  await syncIgrejasVisitasFromServer(uid).catch(() => {})
  await pullAll(uid, { preferServerKeys: ['rotas_diarias'] }).catch(() => {})
}

/** Texto curto de distância para listas de proximidade. */
export function formatarDistanciaProxima(metros) {
  const m = Number(metros)
  if (!Number.isFinite(m) || m < 0) return '—'
  if (m < 1000) return `${Math.round(m)}m`
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`
}

/**
 * Igrejas mais próximas de um ponto (Haversine), excluindo ids já na rota.
 * @returns {{ igreja, distanciaMetros, labelDistancia }[]}
 */
export function buscarIgrejasMaisProximas(coordenadaOrigem, catalog = [], opts = {}) {
  const limite = Math.max(1, Number(opts.limite) || 5)
  const excluir = new Set((opts.excluirIds || []).map(x => String(x)))
  const lat = Number(coordenadaOrigem?.lat)
  const lng = Number(coordenadaOrigem?.lng)
  if (!coordValida(lat, lng)) return []

  return (catalog || [])
    .filter(ig => {
      const id = String(ig?.id ?? '')
      if (!id || excluir.has(id)) return false
      return coordValida(Number(ig.lat), Number(ig.lng))
    })
    .map(ig => {
      const distanciaMetros = haversineKm(
        { lat, lng },
        { lat: Number(ig.lat), lng: Number(ig.lng) },
      ) * 1000
      return {
        igreja: ig,
        distanciaMetros,
        labelDistancia: formatarDistanciaProxima(distanciaMetros),
      }
    })
    .sort((a, b) => a.distanciaMetros - b.distanciaMetros)
    .slice(0, limite)
}
