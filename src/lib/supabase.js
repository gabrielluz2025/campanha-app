import { createClient } from '@supabase/supabase-js'

const url  = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Login via Supabase (quando credenciais existem). */
export const isAuthConfigured = Boolean(url && anon)

/** Salvar dados na API PHP/MySQL do Hostinger em vez do Supabase. */
export function usePhpSync() {
  if (import.meta.env.VITE_SYNC_BACKEND === 'php') return true
  if (import.meta.env.VITE_SYNC_BACKEND === 'supabase') return false
  if (typeof window !== 'undefined') {
    const h = window.location.hostname
    if (h === 'campanha.space' || h === 'www.campanha.space') return true
  }
  return !isAuthConfigured
}

/** @deprecated Use isAuthConfigured — mantido para compatibilidade. */
export const isCloudConfigured = isAuthConfigured

export const supabase = isAuthConfigured
  ? createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null

/** Remove tokens Supabase do navegador (fallback se signOut falhar). */
export function clearSupabaseAuthStorage() {
  if (typeof window === 'undefined') return
  try {
    const drop = (store) => {
      const keys = []
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i)
        if (k && (k.startsWith('sb-') || k.includes('supabase.auth'))) keys.push(k)
      }
      keys.forEach(k => store.removeItem(k))
    }
    drop(localStorage)
    drop(sessionStorage)
  } catch { /* ignore */ }
}
