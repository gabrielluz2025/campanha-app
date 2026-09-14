/** Entradas de estoque (histórico de quem lançou material). */

import { writeStorage, readStorage } from './persist'

export const KEY_ENTRADAS = 'materiais_entradas'
export const KEY_DIST_REMOVIDOS = 'materiais_distribuicao_removidos'

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function loadEntradas() {
  const raw = readStorage(KEY_ENTRADAS, [])
  return Array.isArray(raw) ? raw : []
}

export function saveEntradas(lista) {
  writeStorage(KEY_ENTRADAS, Array.isArray(lista) ? lista : [])
  return lista
}

export function registrarEntrada({
  itemId,
  itemNome = '',
  quantidade,
  registradoPor = '',
  registradoPorEmail = '',
  tipo = 'entrada',
} = {}) {
  const qtd = Number(quantidade) || 0
  if (!itemId || qtd <= 0) return null
  const registro = {
    id: uid(),
    itemId,
    itemNome: String(itemNome || ''),
    quantidade: qtd,
    tipo: tipo === 'ajuste' ? 'ajuste' : 'entrada',
    data: new Date().toISOString(),
    registradoPor: String(registradoPor || '').trim(),
    registradoPorEmail: String(registradoPorEmail || '').trim(),
  }
  saveEntradas([registro, ...loadEntradas()])
  return registro
}

export function loadDistRemovidos() {
  const raw = readStorage(KEY_DIST_REMOVIDOS, [])
  return Array.isArray(raw) ? raw.map(String).filter(Boolean) : []
}

export function marcarDistribuicoesRemovidas(ids = []) {
  const set = new Set(loadDistRemovidos())
  for (const id of ids) {
    if (id != null && id !== '') set.add(String(id))
  }
  const out = [...set]
  writeStorage(KEY_DIST_REMOVIDOS, out)
  return out
}

export function filtrarDistribuicoesRemovidas(lista = [], removidos = null) {
  const set = new Set((removidos || loadDistRemovidos()).map(String))
  if (!set.size) return Array.isArray(lista) ? lista : []
  return (Array.isArray(lista) ? lista : []).filter(d => !set.has(String(d?.id)))
}

/** Rótulo amigável do usuário do sistema. */
export function labelUsuarioSistema(registro = {}) {
  const nome = String(registro.registradoPor || registro.validadoPor || '').trim()
  const email = String(registro.registradoPorEmail || '').trim()
  if (nome && email && !nome.includes('@')) return `${nome} (${email})`
  return nome || email || '—'
}

/** Quem retirou/recebeu o material (coordenador ou responsável informado). */
export function labelQuemRetirou(registro = {}, retirada = null) {
  const ret = retirada && typeof retirada === 'object' ? retirada : null
  const seen = new Set()
  const partes = []
  for (const raw of [
    registro.responsavel,
    registro.coordenadorNome,
    ret?.coordenadorNome,
  ]) {
    const nome = String(raw || '').trim()
    if (!nome) continue
    const k = nome.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    partes.push(nome)
  }
  return partes.join(' · ') || '—'
}

/** Enriquece saída com dados da retirada vinculada (registros legados). */
export function enriquecerSaidaComRetirada(dist, retirada = null) {
  const ret = retirada && typeof retirada === 'object' ? retirada : null
  if (!dist || dist._tipo === 'entrada') return dist
  return {
    ...dist,
    responsavel: String(dist.responsavel || ret?.coordenadorNome || '').trim(),
    coordenadorNome: String(dist.coordenadorNome || ret?.coordenadorNome || '').trim(),
    coordenadorId: dist.coordenadorId || ret?.coordenadorId || '',
  }
}
