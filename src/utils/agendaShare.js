import { writeStorage, flushAfterSave } from './persist'

export const KEY_COMPARTILHAMENTOS = 'agenda_compartilhamentos'

const PHP_API = typeof window !== 'undefined'
  ? `${window.location.origin}/api.php`
  : '/api.php'

export function shareUid() {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 8)
  return (t + r).slice(0, 32)
}

export function colaboracaoKey(shareId) {
  return `agenda_colaboracao_${shareId}`
}

export function normNome(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

export function decodeShareToken(token) {
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(token))))
    if (!data?.eventos) return null
    return data
  } catch {
    return null
  }
}

export function encodeShareToken(payload) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
}

export function loadCompartilhamentos() {
  try {
    return JSON.parse(localStorage.getItem(KEY_COMPARTILHAMENTOS) || '[]')
  } catch {
    return []
  }
}

export function registrarCompartilhamento(share) {
  const lista = loadCompartilhamentos()
  const idx = share.membroId
    ? lista.findIndex(s => s.membroId === share.membroId)
    : -1
  const entrada = { ...share, atualizadoEm: new Date().toISOString() }
  if (idx >= 0) lista[idx] = { ...lista[idx], ...entrada }
  else lista.push(entrada)
  writeStorage(KEY_COMPARTILHAMENTOS, lista)
  return lista
}

async function phpAuthParts() {
  try {
    const { getPhpAuthContext } = await import('../lib/cloudSync')
    const { accessToken, tenantId } = getPhpAuthContext()
    const headers = { 'Content-Type': 'application/json' }
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`
    if (tenantId) headers['X-Tenant-Id'] = tenantId
    return { headers, query: '' }
  } catch {
    return { headers: { 'Content-Type': 'application/json' }, query: '' }
  }
}

export async function fetchApiKey(key) {
  try {
    const { headers, query } = await phpAuthParts()
    const res = await fetch(`${PHP_API}?key=${encodeURIComponent(key)}${query}`, { headers })
    if (!res.ok) return null
    const text = await res.text()
    if (!text || text === 'null') return null
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function postApiKey(key, value) {
  try {
    const { headers, query } = await phpAuthParts()
    const res = await fetch(`${PHP_API}?key=${encodeURIComponent(key)}${query}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(value),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function loadColaboracao(shareId) {
  const key = colaboracaoKey(shareId)
  const local = (() => {
    try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
  })()
  const remoto = await fetchApiKey(key)
  if (!remoto && !local) return null
  if (!remoto) return local
  if (!local) {
    localStorage.setItem(key, JSON.stringify(remoto))
    return remoto
  }
  const tRem = new Date(remoto.atualizadoEm || 0).getTime()
  const tLoc = new Date(local.atualizadoEm || 0).getTime()
  const melhor = tRem >= tLoc ? remoto : local
  localStorage.setItem(key, JSON.stringify(melhor))
  return melhor
}

export async function saveColaboracao(shareId, data) {
  const key = colaboracaoKey(shareId)
  const payload = { ...data, shareId, atualizadoEm: new Date().toISOString() }
  localStorage.setItem(key, JSON.stringify(payload))
  await postApiKey(key, payload)
  return payload
}

export async function persistirCompartilhamento(share) {
  const lista = registrarCompartilhamento(share)
  await flushAfterSave()
  return lista
}

export function eventoEhDoMembro(ev, nomeMembro) {
  if (!nomeMembro) return false
  const alvo = normNome(nomeMembro)
  if (normNome(ev.criadoPor) === alvo) return true
  return (ev.representantes || []).some(r => normNome(r.nome) === alvo)
}

/** Eventos visíveis para o integrante no link compartilhado. */
export function eventosParaMembro({ eventos, eventosAdicionados, membro, filtro }) {
  const adicionados = (eventosAdicionados || []).map(ev => ({ ...ev, _local: true }))
  const base = [...(eventos || []), ...adicionados]
  if (!membro || filtro === 'permitidos') return base
  return base.filter(ev => ev._local || eventoEhDoMembro(ev, membro))
}

export function carregarColaboracaoLocal({ shareId, token, membroId, membroNome }) {
  if (shareId) return null
  try {
    const key = `agenda_publica_v2_${token}`
    const cached = JSON.parse(localStorage.getItem(key) || 'null')
    if (cached && typeof cached === 'object') return cached
  } catch { /* ignore */ }
  return criarColaboracaoVazia({ shareId: '', membroId, membroNome })
}

export function criarColaboracaoVazia({ shareId, membroId, membroNome }) {
  return {
    shareId,
    membroId: membroId || '',
    membroNome: membroNome || '',
    eventosAdicionados: [],
    marcacoes: {},
    atualizadoEm: new Date().toISOString(),
  }
}
