import { useEffect, useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'

// API imperativa de confirmação com diálogo estilizado.
// Uso:  const ok = await confirmAction({ title, message, confirmLabel, danger })
// Requer que <ConfirmHost/> esteja montado uma vez na raiz do app.

let openFn = null

export function confirmAction(opts = {}) {
  return new Promise(resolve => {
    if (typeof openFn !== 'function') {
      // Fallback caso o host não esteja montado.
      resolve(window.confirm(opts.message || 'Confirmar ação?'))
      return
    }
    openFn(opts, resolve)
  })
}

export function ConfirmHost() {
  const [state, setState] = useState(null) // { opts, resolve }

  useEffect(() => {
    openFn = (opts, resolve) => setState({ opts, resolve })
    return () => { openFn = null }
  }, [])

  useEffect(() => {
    if (!state) return
    function onKey(e) {
      if (e.key === 'Escape') { state.resolve(false); setState(null) }
      else if (e.key === 'Enter') { state.resolve(true); setState(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state])

  if (!state) return null

  const { opts } = state
  const danger = opts.danger !== false
  const accent = danger ? '#ef4444' : 'var(--accent)'
  const Icon = danger ? Trash2 : AlertTriangle

  function done(v) { state.resolve(v); setState(null) }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={() => done(false)}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden anim-fade-up"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-soft)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}>
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: accent + '1e', border: `1px solid ${accent}33` }}>
              <Icon size={18} style={{ color: accent }} />
            </div>
            <h3 className="font-bold text-white" style={{ fontSize: 15 }}>
              {opts.title || 'Confirmar exclusão'}
            </h3>
          </div>
          <p className="font-medium" style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            {opts.message || 'Esta ação não pode ser desfeita. Deseja continuar?'}
          </p>
        </div>
        <div className="flex gap-2.5 px-5 pb-5">
          <button onClick={() => done(false)}
            className="flex-1 py-2.5 rounded-xl font-bold transition-all"
            style={{ fontSize: 13, background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
            {opts.cancelLabel || 'Cancelar'}
          </button>
          <button onClick={() => done(true)} autoFocus
            className="flex-1 py-2.5 rounded-xl font-bold text-white transition-all"
            style={{ fontSize: 13, background: accent, boxShadow: `0 6px 20px ${accent}55` }}>
            {opts.confirmLabel || 'Excluir'}
          </button>
        </div>
      </div>
    </div>
  )
}
