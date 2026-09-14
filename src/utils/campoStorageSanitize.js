import { readStorage, writeStorage } from './persist'
import { ROTAS_DIARIAS_KEY, ROTAS_DIARIAS_REMOVIDOS_KEY } from './rotasDiarias'

/** Chaves que devem ser sempre arrays no módulo campo / rotas. */
export const CAMPO_STORAGE_ARRAY_KEYS = [
  ROTAS_DIARIAS_KEY,
  ROTAS_DIARIAS_REMOVIDOS_KEY,
  'equipe_membros',
  'igrejas_custom',
]

/**
 * Repara arrays corrompidos (null, objeto, string) no storage local.
 * @returns {{ fixedKeys: string[], details: Record<string, string> }}
 */
export function sanitizeCampoArrayStorage({ write = true } = {}) {
  const fixedKeys = []
  const details = {}

  for (const key of CAMPO_STORAGE_ARRAY_KEYS) {
    const v = readStorage(key, [])
    if (Array.isArray(v)) continue
    details[key] = v == null ? 'null/undefined' : typeof v
    if (write) {
      try {
        writeStorage(key, [])
      } catch (e) {
        console.warn(`sanitizeCampoArrayStorage: falha ao gravar ${key}`, e)
        continue
      }
    }
    fixedKeys.push(key)
  }

  return { fixedKeys, details }
}

/** Erros típicos de dados corrompidos no campo. */
export function isCampoLengthCrashError(error) {
  const msg = String(error?.message || error || '').toLowerCase()
  return msg.includes("reading 'length'") || msg.includes('reading "length"')
}

/** Tenta recuperação leve antes de recarregar a página. */
export function recoverFromCampoStorageCrash() {
  const { fixedKeys } = sanitizeCampoArrayStorage({ write: true })
  try {
    window.dispatchEvent(new CustomEvent('campanha-storage-recovered', { detail: { fixedKeys } }))
  } catch { /* ignore */ }
  return fixedKeys
}
