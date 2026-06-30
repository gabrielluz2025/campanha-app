// ─── db.js — abstração localStorage ↔ MySQL via API PHP ────────
// Drop-in replacement: mesma interface do localStorage mas persiste no servidor.
// Em caso de falha de rede cai no localStorage como fallback.

const API = '/api.php'

// Cache em memória para leituras síncronas (hidratação inicial)
const _cache = {}

// Pré-carrega todas as chaves do servidor (chame 1x no boot)
export async function dbInit() {
  try {
    const r = await fetch(API)
    if (!r.ok) return
    const data = await r.json()
    Object.entries(data).forEach(([k, v]) => {
      _cache[k] = v
      // Sincroniza localStorage como cache local
      try { localStorage.setItem(k, JSON.stringify(v)) } catch {}
    })
  } catch {}
}

// Leitura síncrona (usa cache/localStorage como fallback imediato)
export function dbGetSync(key, fallback = null) {
  if (key in _cache) {
    const v = _cache[key]
    return v !== null && v !== undefined ? v : fallback
  }
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch { return fallback }
}

// Leitura assíncrona (busca do servidor)
export async function dbGet(key, fallback = null) {
  try {
    const r = await fetch(`${API}?key=${encodeURIComponent(key)}`)
    if (!r.ok) throw new Error()
    const text = await r.text()
    const val  = text === 'null' ? null : JSON.parse(text)
    _cache[key] = val
    if (val !== null) try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
    return val ?? fallback
  } catch {
    return dbGetSync(key, fallback)
  }
}

// Escrita (servidor + cache local)
export async function dbSet(key, value) {
  _cache[key] = value
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
  try {
    await fetch(`${API}?key=${encodeURIComponent(key)}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(value),
    })
  } catch {}
}

// Hook React: useState + persistência automática no banco
import { useState, useEffect, useRef } from 'react'

export function useDb(key, initialValue) {
  const [value, setValue] = useState(() => dbGetSync(key, initialValue))
  const ready = useRef(false)

  // Carrega do servidor na montagem
  useEffect(() => {
    dbGet(key, initialValue).then(v => {
      setValue(v)
      ready.current = true
    })
  }, [key])

  // Persiste toda vez que o valor muda (após hidratação)
  useEffect(() => {
    if (!ready.current) return
    dbSet(key, value)
  }, [key, value])

  return [value, setValue]
}
