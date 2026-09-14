/** Compartilhamento de relatório de contratos via link + PIN */

import { writeStorage, flushAfterSave, readStorage } from './persist'
import {
  encodeShareToken, decodeShareToken, shareUid, fetchApiKey, postApiKey,
} from './agendaShare'
import { gerarPin, hashPin, salvarPinAcesso } from './agendaPin'
import { membroParaRelatorio } from './equipeContratoReport'

export const KEY_COMPARTILHAMENTOS = 'equipe_contratos_compartilhamentos'

export function snapshotKey(shareId) {
  return `equipe_contrato_snapshot_${shareId}`
}

export function pinContratoKey(shareId) {
  return `equipe_contrato_pin_${shareId}`
}

export function decodeContratoToken(token) {
  const data = decodeShareToken(token)
  if (!data?.shareId || data.tipo !== 'equipe-contratos') return null
  return data
}

export function encodeContratoToken(payload) {
  return encodeShareToken({ ...payload, tipo: 'equipe-contratos' })
}

export function loadCompartilhamentosContratos() {
  return readStorage(KEY_COMPARTILHAMENTOS, [])
}

export function registrarCompartilhamentoContrato(share) {
  const lista = loadCompartilhamentosContratos()
  const idx = lista.findIndex(s => s.shareId === share.shareId)
  const entrada = { ...share, atualizadoEm: new Date().toISOString() }
  if (idx >= 0) lista[idx] = { ...lista[idx], ...entrada }
  else lista.push(entrada)
  writeStorage(KEY_COMPARTILHAMENTOS, lista)
  return lista
}

export async function salvarSnapshotContrato(shareId, snapshot) {
  const key = snapshotKey(shareId)
  const payload = { ...snapshot, shareId, atualizadoEm: new Date().toISOString() }
  localStorage.setItem(key, JSON.stringify(payload))
  await postApiKey(key, payload)
  return payload
}

export async function carregarSnapshotContrato(shareId) {
  if (!shareId) return null
  const key = snapshotKey(shareId)
  let local = null
  try { local = JSON.parse(localStorage.getItem(key) || 'null') } catch { /* ignore */ }
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

/** Salva PIN específico de contratos (chave própria + reusa hash do agendaPin) */
export async function salvarPinContrato(shareId, pin) {
  if (!shareId || !pin) return null
  const pinHash = await hashPin(pin)
  const payload = {
    pinHash,
    atualizadoEm: new Date().toISOString(),
  }
  const key = pinContratoKey(shareId)
  localStorage.setItem(key, JSON.stringify(payload))
  await postApiKey(key, payload)
  // Também grava na chave padrão do agendaPin para reutilizar AgendaPinGate / verificarPin
  await salvarPinAcesso(shareId, pin, {})
  return payload
}

/**
 * Cria compartilhamento com snapshot dos membros selecionados.
 * @returns {{ shareId, token, pin, link, geradoEm, qtd }}
 */
export async function criarCompartilhamentoContratos(membrosSelecionados = []) {
  const shareId = shareUid()
  const pin = gerarPin()
  const geradoEm = new Date().toISOString()
  const membros = membrosSelecionados.map(membroParaRelatorio).filter(Boolean)

  const snapshot = {
    shareId,
    geradoEm,
    qtd: membros.length,
    membros,
  }

  await salvarSnapshotContrato(shareId, snapshot)
  await salvarPinContrato(shareId, pin)

  const token = encodeContratoToken({
    shareId,
    tipo: 'equipe-contratos',
    geradoEm,
    qtd: membros.length,
  })

  const base = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname || '/'}`
    : 'https://campanha.space/'
  const link = `${base}#/equipe-contratos/${token}`

  const meta = {
    shareId,
    geradoEm,
    qtd: membros.length,
    pin,
    nomes: membros.map(m => m.nome).filter(Boolean).slice(0, 8),
  }
  registrarCompartilhamentoContrato(meta)
  await flushAfterSave()

  return { shareId, token, pin, link, geradoEm, qtd: membros.length }
}
