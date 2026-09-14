/** Zera todos os dados da aba Materiais (local + nuvem). */

import { writeStorage, removeStorage, readStorage } from './persist'
import { CFG_DEFAULT, itensComSaldo } from './materiaisRetirada'
import { KEY_ENTRADAS, KEY_DIST_REMOVIDOS } from './materiaisMovimentos'
import { MATERIAIS_REMOVIDOS_KEY } from './materiaisCatalog'
import { KEY_CATEGORIAS } from './materiaisCategorias'
import {
  KEY_ESTOQUE,
  KEY_DIST,
  KEY_COORDS,
  KEY_RETIRADAS,
  KEY_RETIRADAS_REMOVIDOS,
  KEY_CFG,
} from './materiaisRetirada'
import {
  MATERIAIS_LIMPO_EM_KEY,
  MATERIAIS_HISTORICO_LIMPO_EM_KEY,
  MATERIAIS_HISTORICO_STORE_KEYS,
  getMateriaisLimpoEm,
  getMateriaisHistoricoLimpoEm,
  usuarioOptouPorMateriaisVazio,
} from './materiaisResetCore'

export {
  MATERIAIS_LIMPO_EM_KEY,
  MATERIAIS_HISTORICO_LIMPO_EM_KEY,
  MATERIAIS_HISTORICO_STORE_KEYS,
  getMateriaisLimpoEm,
  usuarioOptouPorMateriaisVazio,
} from './materiaisResetCore'

/** Chaves só do histórico (entradas, saídas, retiradas) — estoque/coordenadores permanecem. */
export const MATERIAIS_HISTORICO_KEYS = [
  KEY_ENTRADAS,
  KEY_DIST,
  KEY_DIST_REMOVIDOS,
  KEY_RETIRADAS,
  KEY_RETIRADAS_REMOVIDOS,
]

export const MATERIAIS_STORE_KEYS = [
  KEY_ESTOQUE,
  KEY_DIST,
  KEY_ENTRADAS,
  KEY_RETIRADAS,
  KEY_COORDS,
  KEY_CFG,
  MATERIAIS_REMOVIDOS_KEY,
  KEY_DIST_REMOVIDOS,
  KEY_RETIRADAS_REMOVIDOS,
  KEY_CATEGORIAS,
  MATERIAIS_LIMPO_EM_KEY,
  MATERIAIS_HISTORICO_LIMPO_EM_KEY,
]

const EMPTY_BY_KEY = {
  [KEY_CFG]: () => ({ ...CFG_DEFAULT }),
}

function emptyValue(key) {
  const fn = EMPTY_BY_KEY[key]
  return fn ? fn() : []
}

export function marcarMateriaisLimposPeloUsuario() {
  const ts = String(Date.now())
  try {
    writeStorage(MATERIAIS_LIMPO_EM_KEY, ts, { force: true })
    writeStorage(MATERIAIS_HISTORICO_LIMPO_EM_KEY, ts, { force: true })
  } catch { /* ignore */ }
  return ts
}

export function marcarHistoricoMateriaisLimpoPeloUsuario() {
  const ts = String(Date.now())
  try {
    writeStorage(MATERIAIS_HISTORICO_LIMPO_EM_KEY, ts, { force: true })
  } catch { /* ignore */ }
  return ts
}

export function desmarcarMateriaisLimposPeloUsuario() {
  try {
    removeStorage(MATERIAIS_LIMPO_EM_KEY)
    removeStorage(MATERIAIS_HISTORICO_LIMPO_EM_KEY)
  } catch { /* ignore */ }
}

/** Ao cadastrar/importar material — libera sync normal (remove flags de limpeza). */
export function reabrirMateriaisAposEdicao() {
  desmarcarMateriaisLimposPeloUsuario()
}

export async function reabrirMateriaisAposEdicaoAsync() {
  reabrirMateriaisAposEdicao()
  try {
    const { flushAfterSave } = await import('./persist')
    await flushAfterSave()
  } catch { /* ignore */ }
}

/**
 * Publica importação/cadastro na nuvem de forma atômica.
 * Remove flags de limpeza, grava estoque+entradas e bloqueia pull concorrente.
 */
export async function publicarMateriaisImportacao({ itens = [], entradas = [] } = {}) {
  if (typeof window !== 'undefined') window.__campanhaMateriaisImportAtivo = true
  try {
    await reabrirMateriaisAposEdicaoAsync()

    const removidos = readStorage(MATERIAIS_REMOVIDOS_KEY, [])
    const rows = [
      [KEY_ESTOQUE, Array.isArray(itens) ? itens : []],
      [KEY_ENTRADAS, Array.isArray(entradas) ? entradas : []],
      [MATERIAIS_REMOVIDOS_KEY, Array.isArray(removidos) ? removidos : []],
    ]

    for (const [key, value] of rows) {
      writeStorage(key, value, { force: true })
    }

    const { deleteCloudStoreKey } = await import('../lib/cloudSync')
    await deleteCloudStoreKey(MATERIAIS_LIMPO_EM_KEY)
    await deleteCloudStoreKey(MATERIAIS_HISTORICO_LIMPO_EM_KEY)

    const replaceKeys = [KEY_ESTOQUE, KEY_ENTRADAS, MATERIAIS_REMOVIDOS_KEY]
    const synced = await substituirChavesNaNuvem(rows, replaceKeys, { skipSyncNow: true })

    try {
      const { syncMateriaisFromServer } = await import('../lib/cloudSync')
      await syncMateriaisFromServer()
    } catch { /* ignore */ }

    return { ok: true, synced, itens: rows[0][1], entradas: rows[1][1] }
  } finally {
    if (typeof window !== 'undefined') window.__campanhaMateriaisImportAtivo = false
  }
}

/**
 * Repara estado quebrado: estoque vazio na nuvem/local mas histórico cheio.
 * Restaura cadastro a partir do histórico e publica na nuvem.
 */
export async function repararMateriaisEstoqueDoHistorico() {
  const entradas = readStorage(KEY_ENTRADAS, [])
  const distribuicoes = readStorage(KEY_DIST, [])
  const retiradas = readStorage(KEY_RETIRADAS, [])
  const estoque = readStorage(KEY_ESTOQUE, [])

  const temHistorico = (entradas?.length || 0) > 0
    || (distribuicoes?.length || 0) > 0
    || (retiradas?.length || 0) > 0
  const estoqueVazio = !Array.isArray(estoque) || estoque.length === 0
  if (getMateriaisHistoricoLimpoEm() > 0) return { ok: false, motivo: 'historico_limpo' }
  if (!temHistorico || !estoqueVazio) return { ok: false, motivo: 'nao_precisa' }

  const { limparRemovidosReferenciadosNoHistorico, recuperarEstoqueDeHistorico } = await import('./materiaisCatalog')
  limparRemovidosReferenciadosNoHistorico({ entradas, distribuicoes, retiradas })

  const rec = recuperarEstoqueDeHistorico({
    estoque,
    distribuicoes,
    entradas,
    retiradas,
  })
  if (!rec.lista?.length) return { ok: false, motivo: 'sem_recuperacao' }

  return publicarMateriaisImportacao({
    itens: rec.lista,
    entradas: Array.isArray(entradas) ? entradas : [],
  })
}

function limparChavesRetiradaDinamicas() {
  if (typeof window === 'undefined') return
  const remover = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && (k.startsWith('materiais_retirada_pub_') || k.startsWith('materiais_retirada_inbox_'))) {
      remover.push(k)
    }
  }
  remover.forEach(k => {
    try { localStorage.removeItem(k) } catch { /* ignore */ }
  })
}

async function substituirChavesNaNuvem(rows, replaceKeys, { tentativas = 4, skipSyncNow = false } = {}) {
  if (typeof window !== 'undefined') window.__campanhaMateriaisSnapshotAtivo = true
  try {
    const { phpReplaceStoreKeys, syncMateriaisFromServer, clearSyncPendingForKeys } = await import('../lib/cloudSync')
    for (let i = 0; i < tentativas; i++) {
      const ok = await phpReplaceStoreKeys(
        rows.map(([key, value]) => [key, JSON.stringify(value)]),
        replaceKeys,
      )
      if (ok) {
        clearSyncPendingForKeys(replaceKeys)
        if (!skipSyncNow) {
          try { await syncMateriaisFromServer() } catch { /* ignore */ }
        }
        return true
      }
      await new Promise(r => setTimeout(r, 400 * (i + 1)))
    }
    return false
  } catch {
    return false
  } finally {
    if (typeof window !== 'undefined') window.__campanhaMateriaisSnapshotAtivo = false
  }
}

/** Apaga localmente e substitui na nuvem (sem merge). */
export async function limparTodosDadosMateriais() {
  const ts = marcarMateriaisLimposPeloUsuario()
  limparChavesRetiradaDinamicas()

  const rows = [
    ...MATERIAIS_STORE_KEYS.filter(k => k !== MATERIAIS_LIMPO_EM_KEY).map(key => [key, emptyValue(key)]),
    [MATERIAIS_LIMPO_EM_KEY, ts],
  ]

  for (const [key, value] of rows) {
    writeStorage(key, value, { force: true })
  }

  const synced = await substituirChavesNaNuvem(rows, [...MATERIAIS_STORE_KEYS])

  try {
    const { flushAfterSave } = await import('./persist')
    await flushAfterSave()
  } catch { /* ignore */ }

  try {
    window.dispatchEvent(new CustomEvent('campanha:materiais-limpos'))
  } catch { /* ignore */ }

  return { ok: true, synced }
}

/**
 * Apaga entradas, saídas e retiradas; mantém materiais cadastrados.
 * Ajusta a quantidade de cada item para o saldo disponível atual.
 */
export async function limparHistoricoMateriais() {
  if (typeof window !== 'undefined') window.__campanhaMateriaisHistoricoLimpoAtivo = true
  try {
  const ts = marcarHistoricoMateriaisLimpoPeloUsuario()
  limparChavesRetiradaDinamicas()

  const itensRaw = readStorage(KEY_ESTOQUE, [])
  const itens = Array.isArray(itensRaw) ? itensRaw : []
  const distribuicoes = readStorage(KEY_DIST, [])
  const retiradas = readStorage(KEY_RETIRADAS, [])
  const comSaldo = itensComSaldo({ itens, distribuicoes, retiradas })
  const itensAjustados = comSaldo.map(({ saido, reservado, disponivel, restante, distribuido, status, ...item }) => ({
    ...item,
    quantidade: Math.max(0, Number(disponivel) || 0),
  }))

  const rows = [
    [MATERIAIS_HISTORICO_LIMPO_EM_KEY, ts],
    [KEY_ESTOQUE, itensAjustados],
    ...MATERIAIS_HISTORICO_KEYS.map(key => [key, emptyValue(key)]),
  ]

  for (const [key, value] of rows) {
    writeStorage(key, value, { force: true })
  }

  const replaceKeys = [...MATERIAIS_HISTORICO_KEYS, KEY_ESTOQUE, MATERIAIS_HISTORICO_LIMPO_EM_KEY]
  const synced = await substituirChavesNaNuvem(rows, replaceKeys)

  try {
    window.dispatchEvent(new CustomEvent('campanha:materiais-historico-limpo'))
  } catch { /* ignore */ }

  return { ok: true, synced, itens: itensAjustados }
  } finally {
    if (typeof window !== 'undefined') window.__campanhaMateriaisHistoricoLimpoAtivo = false
  }
}
