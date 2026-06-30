import { createClient } from '@supabase/supabase-js'

// As credenciais vêm do arquivo .env (na raiz de campanha-app):
//   VITE_SUPABASE_URL=...
//   VITE_SUPABASE_ANON_KEY=...
const url  = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

// Se as credenciais não estiverem configuradas, o app continua funcionando
// 100% local (como antes), sem nuvem nem login.
export const isCloudConfigured = Boolean(url && anon)

export const supabase = isCloudConfigured
  ? createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null
