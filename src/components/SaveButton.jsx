import { useState } from 'react'
import { Save, Check, Loader2, AlertCircle } from 'lucide-react'
import { pushToCloud, saveToCloud } from '../utils/persist'

const VARIANTS = {
  header: {
    background: 'rgba(34,197,94,0.28)',
    border: '1px solid rgba(34,197,94,0.55)',
    color: '#fff',
  },
  accent: {
    background: 'linear-gradient(135deg,#059669,#10b981)',
    color: '#fff',
    boxShadow: '0 4px 14px rgba(16,185,129,0.35)',
  },
  ghost: {
    background: 'rgba(255,255,255,0.18)',
    border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff',
  },
  inline: {
    background: 'var(--accent)',
    color: '#fff',
  },
  compact: {
    background: 'rgba(34,197,94,0.2)',
    border: '1px solid rgba(34,197,94,0.4)',
    color: '#86efac',
    fontSize: 11,
    padding: '6px 10px',
  },
  quiet: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-secondary)',
    fontSize: 12,
    padding: '8px 10px',
  },
}

export default function SaveButton({
  onSave,
  data,
  label = 'Salvar agora',
  variant = 'header',
  className = '',
  compact = false,
}) {
  const [status, setStatus] = useState('idle')

  async function handleClick() {
    if (status === 'saving') return
    setStatus('saving')
    try {
      if (onSave) await onSave()
      else if (data) await saveToCloud(data)
      else await pushToCloud()
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2500)
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3500)
    }
  }

  const v = compact ? VARIANTS.compact : (VARIANTS[variant] || VARIANTS.header)
  const Icon = status === 'saving' ? Loader2 : status === 'saved' ? Check : status === 'error' ? AlertCircle : Save
  const text = {
    idle: label,
    saving: 'Salvando…',
    saved: 'Salvo!',
    error: 'Erro',
  }[status]

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === 'saving'}
      className={`flex items-center gap-2 font-bold rounded-2xl transition-all flex-shrink-0 ${status === 'saving' ? 'opacity-70' : 'hover:brightness-110'} ${className}`}
      style={{
        ...v,
        fontSize: v.fontSize || 13,
        padding: v.padding || '10px 16px',
      }}
      title="Força o envio imediato à nuvem (os dados também salvam automaticamente)"
    >
      <Icon size={compact ? 13 : 16} className={status === 'saving' ? 'animate-spin' : ''} />
      <span>{text}</span>
    </button>
  )
}
