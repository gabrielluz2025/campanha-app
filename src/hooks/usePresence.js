/**
 * Presença em tempo real — quem está ativo na mesma campanha.
 * Envia heartbeat a cada 30s; lê lista de volta na resposta.
 */
import { useState, useEffect, useRef } from 'react'
import { getPhpAuthContext } from '../lib/cloudSync'

const PHP_API = typeof window !== 'undefined'
  ? `${window.location.origin}/api.php`
  : '/api.php'

const HEARTBEAT_MS = 30_000
const ACTIVE_WINDOW_MS = 2 * 60 * 1000   // considera ativo quem bateu coração nos últimos 2 min

/** Gera/recupera ID único da aba (persiste em sessionStorage). */
function getTabId() {
  if (typeof sessionStorage === 'undefined') return 'srv'
  let id = sessionStorage.getItem('campanha_tab_id')
  if (!id) {
    id = Math.random().toString(36).slice(2, 10)
    sessionStorage.setItem('campanha_tab_id', id)
  }
  return id
}

function nomeFromEmail(email) {
  const local = String(email || '').split('@')[0] || email
  return local
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

async function sendHeartbeat(email, nome) {
  const { accessToken, tenantId } = getPhpAuthContext()
  if (!accessToken || !tenantId || !email) return null
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch(`${PHP_API}?action=presence_ping`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-Tenant-Id': tenantId,
      },
      body: JSON.stringify({ nome: nome || nomeFromEmail(email), tabId: getTabId() }),
    })
    clearTimeout(t)
    if (!r.ok) return null
    return await r.json().catch(() => null)
  } catch {
    return null
  }
}

/**
 * Hook de presença.
 * @returns {{ users: Array, count: number, selfEmail: string }}
 */
export function usePresence(userEmail) {
  const [users, setUsers] = useState([])
  const emailRef = useRef(userEmail)
  emailRef.current = userEmail

  useEffect(() => {
    if (!userEmail) return

    let cancelled = false

    async function ping() {
      if (document.visibilityState === 'hidden') return
      const nome = nomeFromEmail(emailRef.current)
      const res = await sendHeartbeat(emailRef.current, nome)
      if (cancelled) return
      if (res?.users) {
        setUsers(res.users)
      }
    }

    // Primeiro ping logo ao abrir
    ping()
    const interval = setInterval(ping, HEARTBEAT_MS)

    // Quando volta à aba, faz ping imediato
    function onVisible() {
      if (document.visibilityState === 'visible') ping()
    }
    document.addEventListener('visibilitychange', onVisible)

    // Ao fechar/sair: não podemos fazer fetch síncrono, mas o registro expira sozinho em 10 min
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userEmail])

  const now = Date.now()
  const activeUsers = users.filter(u => {
    const seen = new Date(u.last_seen + 'Z').getTime()   // last_seen vem sem timezone do MySQL
    return (now - seen) < ACTIVE_WINDOW_MS
  })

  return {
    users: activeUsers,
    count: activeUsers.length,
    selfEmail: userEmail,
  }
}

/** Formata o nome de exibição de um usuário de presença. */
export function presenceDisplayName(user, selfEmail) {
  const raw = String(user?.nome || user?.email || '').trim()
  if (!raw) return 'Usuário'
  const isSelf = String(user?.email || '') === String(selfEmail || '')
  return isSelf ? `${raw} (você)` : raw
}
