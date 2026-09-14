import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export default function PwaReloadPrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisterError() { /* ignore */ },
  })

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined
    let registration = null
    const checar = () => {
      try { registration?.update() } catch { /* ignore */ }
    }
    navigator.serviceWorker.ready.then((reg) => {
      registration = reg
      checar()
    })
    const interval = setInterval(checar, 20_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') checar()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', checar)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', checar)
    }
  }, [])

  if (!needRefresh) return null

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 99999,
        maxWidth: 320,
        padding: '12px 14px',
        borderRadius: 12,
        background: 'rgba(18, 18, 22, 0.96)',
        border: '1px solid rgba(212, 175, 95, 0.45)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        color: '#f5f5f5',
        fontSize: 13,
        lineHeight: 1.4,
      }}
    >
      <p style={{ margin: 0, fontWeight: 600 }}>Nova versão do sistema disponível.</p>
      <button
        type="button"
        onClick={() => { updateServiceWorker(true) }}
        style={{
          marginTop: 10,
          width: '100%',
          padding: '8px 12px',
          borderRadius: 8,
          border: 'none',
          background: 'var(--mrx-gold, #d4af5f)',
          color: '#111',
          fontWeight: 700,
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        Atualizar agora
      </button>
    </div>
  )
}
