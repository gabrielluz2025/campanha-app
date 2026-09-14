/** Banner para colocar o sistema na tela inicial do iPhone. */
import { useEffect, useState } from 'react'
import { Smartphone, Share, X, PlusSquare } from 'lucide-react'

const DISMISS_KEY = 'ios_install_dismissed_v1'

function isIos() {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone() {
  if (typeof window === 'undefined') return true
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator?.standalone === true,
  )
}

function wasDismissed() {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY) || '')
    if (!Number.isFinite(ts) || ts <= 0) return false
    return Date.now() - ts < 14 * 24 * 60 * 60 * 1000
  } catch {
    return false
  }
}

export default function InstallIos() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!isIos() || isStandalone() || wasDismissed()) return
    setVisible(true)
  }, [])

  if (!visible) return null

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* */ }
    setVisible(false)
  }

  return (
    <div
      className="fixed left-3 right-3 z-[80] rounded-2xl px-3.5 py-3"
      style={{
        bottom: 'max(12px, env(safe-area-inset-bottom))',
        background: 'var(--bg-overlay)',
        border: '1px solid rgba(212,175,95,0.35)',
        boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
      }}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(212,175,95,0.16)', color: 'var(--gold)' }}
        >
          <Smartphone size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold" style={{ fontSize: 13, color: 'var(--text-primary)' }}>
            Colocar no iPhone
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4, marginTop: 2 }}>
            Safari → <Share size={11} className="inline" /> Compartilhar → Adicionar à Tela de Início
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <a
              href="/iphone.html"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
              style={{ background: 'var(--gold)', color: 'var(--ink-on-gold)' }}
            >
              <PlusSquare size={12} /> Ver passo a passo
            </a>
            <a
              href="/atalho.php"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}
            >
              1 toque
            </a>
          </div>
        </div>
        <button type="button" onClick={dismiss} className="p-1 rounded-lg" aria-label="Fechar"
          style={{ color: 'var(--text-faint)' }}>
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
