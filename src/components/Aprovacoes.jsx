import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Check, Ban, ClipboardCheck, RefreshCw } from 'lucide-react'
import { listPendingChanges, reviewPendingChange, rejectAllPending } from '../lib/tenant'
import { applyApprovedChange, pullAll } from '../lib/cloudSync'
import { confirmAction } from '../utils/confirm'

function itemTone(text) {
  if (String(text).startsWith('Quer adicionar')) return '#34d399'
  if (String(text).startsWith('Quer remover')) return '#f87171'
  if (String(text).startsWith('Quer alterar')) return '#fbbf24'
  return 'var(--text-secondary)'
}

export default function Aprovacoes({ open, onClose, accessToken, tenant }) {
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)
  const [acting, setActing] = useState(null)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')

  const reload = useCallback(async () => {
    if (!accessToken || !tenant?.id) return
    setBusy(true)
    setErro('')
    try {
      const res = await listPendingChanges(accessToken, tenant.id)
      setItems(res.pending || [])
    } catch (e) {
      setErro(e.message || 'Falha ao carregar pendências.')
      setItems([])
    } finally {
      setBusy(false)
    }
  }, [accessToken, tenant?.id])

  useEffect(() => {
    if (!open) return
    reload()
    const t = setInterval(reload, 20000)
    return () => clearInterval(t)
  }, [open, reload])

  async function decidir(id, decision) {
    setActing(id + decision)
    setErro(''); setOk('')
    try {
      const res = await reviewPendingChange(accessToken, tenant.id, id, decision)
      setItems(list => list.filter(x => x.id !== id))
      setOk(decision === 'approve' ? 'Aprovado — já vale no sistema.' : 'Recusado.')
      if (decision === 'approve') {
        const key = res?.key
        const action = res?.action === 'delete' ? 'delete' : 'set'
        if (key) {
          try { applyApprovedChange(key, res?.value, action) } catch { /* ignore */ }
        }
        try {
          await pullAll(tenant.id, { preferServerKeys: key ? [key] : [] })
        } catch { /* ignore */ }
      }
    } catch (e) {
      setErro(e.message || 'Falha ao revisar.')
    } finally {
      setActing(null)
    }
  }

  async function recusarTodas() {
    if (!items.length) return
    const okCut = await confirmAction({
      title: 'Recusar todas?',
      message: `Vai recusar ${items.length} alteração(ões) pendente(s).`,
      confirmLabel: 'Recusar todas',
      danger: true,
    })
    if (!okCut) return
    setBusy(true)
    setErro(''); setOk('')
    try {
      const res = await rejectAllPending(accessToken, tenant.id)
      setItems([])
      setOk(`${res.rejected ?? 0} recusada(s).`)
    } catch (e) {
      setErro(e.message || 'Falha ao recusar.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Aprovações"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(0,0,0,0.65)',
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
        style={{
          background: 'var(--bg-surface, #141420)',
          border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
          boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={18} style={{ color: '#fbbf24' }} />
            <div>
              <p className="font-bold text-white text-sm">Aprovações</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Veja a aba e o que a pessoa quer incluir ou mudar
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {items.length > 0 && (
              <button type="button" disabled={busy} onClick={recusarTodas}
                className="text-[10px] font-bold px-2 py-1 rounded-lg mr-1"
                style={{ color: '#fca5a5', background: 'rgba(239,68,68,0.12)' }}>
                Recusar todas
              </button>
            )}
            <button type="button" disabled={busy} onClick={reload} className="p-1.5 rounded-lg" style={{ color: 'var(--text-tertiary)' }}>
              <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
            </button>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-tertiary)' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {busy && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Loader2 size={22} className="animate-spin" style={{ color: '#93c5fd' }} />
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Carregando…</p>
          </div>
        )}

        {!busy && items.length === 0 && !erro && (
          <p className="text-sm py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>
            Nenhuma alteração aguardando.
          </p>
        )}

        <ul className="space-y-3">
          {items.map(item => {
            const aba = item.aba || item.label || 'Sistema'
            const detalhes = Array.isArray(item.items) ? item.items : []
            const acao = item.action === 'delete' ? 'remover dados' : 'alterar dados'
            return (
              <li key={item.id} className="rounded-xl px-3 py-3" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                        style={{ background: 'rgba(59,130,246,0.18)', color: '#93c5fd' }}
                      >
                        Aba: {aba}
                      </span>
                      {item.label && item.label !== aba && (
                        <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                          {item.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-white leading-snug">
                      {item.summary || `Quer ${acao} em ${aba}`}
                    </p>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                      {item.author_email}
                      {item.created_at ? ` · ${new Date(item.created_at.replace(' ', 'T')).toLocaleString('pt-BR')}` : ''}
                    </p>
                    {detalhes.length > 0 && (
                      <ul className="mt-2 space-y-1 rounded-lg px-2.5 py-2"
                        style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        {detalhes.map((linha, i) => (
                          <li key={i} style={{ fontSize: 11, color: itemTone(linha), lineHeight: 1.35 }}>
                            {linha}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      type="button"
                      disabled={!!acting}
                      onClick={() => decidir(item.id, 'approve')}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-white disabled:opacity-50"
                      style={{ background: '#059669' }}
                    >
                      {acting === item.id + 'approve' ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                      Aprovar
                    </button>
                    <button
                      type="button"
                      disabled={!!acting}
                      onClick={() => decidir(item.id, 'reject')}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold disabled:opacity-50"
                      style={{ color: '#fca5a5', background: 'rgba(239,68,68,0.12)' }}
                    >
                      {acting === item.id + 'reject' ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />}
                      Recusar
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        {erro && <p className="text-xs mt-3" style={{ color: '#f87171' }}>{erro}</p>}
        {ok && <p className="text-xs mt-3" style={{ color: '#34d399' }}>{ok}</p>}
      </div>
    </div>,
    document.body,
  )
}
