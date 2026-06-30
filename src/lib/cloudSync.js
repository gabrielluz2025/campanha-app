import { supabase } from './supabase'

// ─── Backend MySQL via API PHP (Hostinger) ────────────────────
const PHP_API = 'https://api.campanha.space/api.php'

async function phpGet(key) {
  try {
    const r = await fetch(`${PHP_API}?key=${encodeURIComponent(key)}`)
    const t = await r.text()
    return t === 'null' ? null : JSON.parse(t)
  } catch { return null }
}

async function phpGetAll() {
  try {
    const r = await fetch(PHP_API)
    return await r.json()
  } catch { return {} }
}

async function phpSet(key, value) {
  try {
    await fetch(`${PHP_API}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof value === 'string' ? value : JSON.stringify(value),
    })
  } catch {}
}

// ─── Sincronização via localStorage intercept ─────────────────
let currentUserId   = null
let originalSetItem = null
let suppress        = false
const pending       = new Map()
let flushTimer      = null
let listenersOn     = false

function isAppKey(key) {
  return /^(previsao|agenda|equipe|eleitores|metas|meta|pastores|geo|igrejas|pesquisas|materiais|apoiadores)/.test(key)
}

// Baixa todos os dados do banco MySQL e grava no localStorage
export async function pullAll(userId) {
  currentUserId = userId

  // Tenta via Supabase primeiro (se configurado)
  if (supabase) {
    const { data, error } = await supabase
      .from('app_state').select('key,value').eq('user_id', userId)
    if (!error) {
      suppress = true
      try {
        ;(data || []).forEach(row => {
          if (row.value != null) window.localStorage.setItem(row.key, row.value)
        })
      } finally { suppress = false }
      return (data || []).length
    }
  }

  // Fallback: MySQL via PHP
  const all = await phpGetAll()
  suppress = true
  try {
    Object.entries(all).forEach(([key, val]) => {
      if (val != null) {
        try { window.localStorage.setItem(key, JSON.stringify(val)) } catch {}
      }
    })
  } finally { suppress = false }
  return Object.keys(all).length
}

// Envia dados locais para o banco (1ª vez)
export async function pushAllLocal(userId) {
  currentUserId = userId
  const rows = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i)
    if (!isAppKey(key)) continue
    const value = window.localStorage.getItem(key)
    rows.push({ key, value })
  }

  if (supabase) {
    const supaRows = rows.map(r => ({ user_id: userId, key: r.key, value: r.value, updated_at: new Date().toISOString() }))
    if (supaRows.length) {
      const { error } = await supabase.from('app_state').upsert(supaRows, { onConflict: 'user_id,key' })
      if (!error) return supaRows.length
    }
  }

  // Fallback: MySQL
  await Promise.all(rows.map(r => phpSet(r.key, r.value)))
  return rows.length
}

export function installSyncHook(userId) {
  currentUserId = userId
  if (!originalSetItem) {
    originalSetItem = window.localStorage.setItem.bind(window.localStorage)
    window.localStorage.setItem = (key, value) => {
      originalSetItem(key, value)
      if (suppress || !isAppKey(key)) return
      pending.set(key, String(value))
      scheduleFlush()
    }
  }
  if (!listenersOn) {
    window.addEventListener('beforeunload', flushNow)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
    listenersOn = true
  }
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(flush, 1200)
}

export async function flush() {
  if (pending.size === 0) return
  const rows = [...pending.entries()].map(([key, value]) => ({ key, value }))
  pending.clear()

  if (supabase && currentUserId) {
    const supaRows = rows.map(r => ({ user_id: currentUserId, key: r.key, value: r.value, updated_at: new Date().toISOString() }))
    const { error } = await supabase.from('app_state').upsert(supaRows, { onConflict: 'user_id,key' })
    if (!error) return
    rows.forEach(r => pending.set(r.key, r.value))
    scheduleFlush()
    return
  }

  // MySQL via PHP
  await Promise.all(rows.map(r => phpSet(r.key, r.value)))
}

function flushNow() { try { flush() } catch {} }

export function teardownSync() {
  if (originalSetItem) {
    window.localStorage.setItem = originalSetItem
    originalSetItem = null
  }
  currentUserId = null
  pending.clear()
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
}
