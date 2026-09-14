import { fetchApiKey, postApiKey } from './agendaShare'

const PIN_SALT = 'campanha-agenda-pin-v1'

export function pinKey(shareId) {
  return `agenda_pin_${shareId}`
}

export function authSessionKey(shareId) {
  return `agenda_auth_${shareId}`
}

/** Gera PIN numérico de 6 dígitos */
export function gerarPin() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function hashPin(pin) {
  const texto = `${PIN_SALT}:${String(pin).trim()}`
  if (typeof crypto !== 'undefined' && crypto.subtle?.digest) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  }
  let h = 0
  for (let i = 0; i < texto.length; i++) h = ((h << 5) - h + texto.charCodeAt(i)) | 0
  return `f${Math.abs(h).toString(16)}`
}

export async function salvarPinAcesso(shareId, pin, { membroId } = {}) {
  if (!shareId || !pin) return null
  const pinHash = await hashPin(pin)
  const payload = {
    pinHash,
    membroId: membroId || '',
    atualizadoEm: new Date().toISOString(),
  }
  localStorage.setItem(pinKey(shareId), JSON.stringify(payload))
  await postApiKey(pinKey(shareId), payload)
  return payload
}

export async function carregarPinAcesso(shareId) {
  if (!shareId) return null
  let local = null
  try { local = JSON.parse(localStorage.getItem(pinKey(shareId)) || 'null') } catch { /* ignore */ }
  const remoto = await fetchApiKey(pinKey(shareId))
  if (!remoto && !local) return null
  if (!remoto) return local
  if (!local) {
    localStorage.setItem(pinKey(shareId), JSON.stringify(remoto))
    return remoto
  }
  const tRem = new Date(remoto.atualizadoEm || 0).getTime()
  const tLoc = new Date(local.atualizadoEm || 0).getTime()
  const melhor = tRem >= tLoc ? remoto : local
  localStorage.setItem(pinKey(shareId), JSON.stringify(melhor))
  return melhor
}

export async function pinConfigurado(shareId) {
  const data = await carregarPinAcesso(shareId)
  return Boolean(data?.pinHash)
}

export async function verificarPin(shareId, pin) {
  const data = await carregarPinAcesso(shareId)
  if (!data?.pinHash) return false
  const hash = await hashPin(pin)
  return hash === data.pinHash
}

const SESSAO_MS = 24 * 60 * 60 * 1000

export function salvarSessaoAuth(shareId) {
  try {
    sessionStorage.setItem(authSessionKey(shareId), JSON.stringify({
      ok: true,
      em: new Date().toISOString(),
      exp: Date.now() + SESSAO_MS,
    }))
  } catch { /* ignore */ }
}

export function sessaoAuthValida(shareId) {
  try {
    const raw = sessionStorage.getItem(authSessionKey(shareId))
    if (!raw) return false
    const d = JSON.parse(raw)
    return Boolean(d.ok && Date.now() < d.exp)
  } catch {
    return false
  }
}

export function limparSessaoAuth(shareId) {
  try { sessionStorage.removeItem(authSessionKey(shareId)) } catch { /* ignore */ }
}
