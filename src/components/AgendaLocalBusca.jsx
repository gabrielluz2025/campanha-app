import { useState, useEffect } from 'react'
import { Search, X, Church, MapPin } from 'lucide-react'
import { IGREJAS_BASE, IGREJAS_EXTERNAS } from '../data/igrejasBase'
import { eIgrejaCrista } from '../utils/igrejaCrista'

const TODAS_IGREJAS = [...IGREJAS_BASE, ...IGREJAS_EXTERNAS].filter(eIgrejaCrista)

function normStr(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function sugestoesLocalIgreja(query, igrejas = TODAS_IGREJAS) {
  if (!query || query.length < 1) return []
  const q = normStr(query)
  return igrejas
    .filter(ig =>
      normStr(ig.nome).includes(q)
      || normStr(ig.endereco).includes(q)
      || normStr(ig.setor).includes(q)
    )
    .slice(0, 8)
}

/** Monta texto de local a partir de uma igreja do catálogo. */
export function dadosLocalIgreja(ig) {
  if (!ig) return { local: '', endereco: '', cep: '' }
  const nome = String(ig.nome || '').trim()
  const endereco = String(ig.endereco || '').trim()
  const cep = String(ig.cep || '').trim()
  const local = nome && endereco ? `${nome} — ${endereco}` : (nome || endereco)
  return { local, endereco, cep, igrejaId: ig.id || null }
}

/**
 * Autocomplete de local (igrejas + texto livre).
 * @param {{ value?: string, onChange: (v: string) => void, onSelectIgreja?: (d: object) => void, placeholder?: string, compact?: boolean }} props
 */
export default function AgendaLocalBusca({
  value = '',
  onChange,
  onSelectIgreja,
  placeholder = 'Busque pelo nome da igreja ou endereço…',
  compact = false,
}) {
  const [query, setQuery] = useState(value)
  const [focus, setFocus] = useState(false)

  useEffect(() => {
    setQuery(value || '')
  }, [value])

  const sugestoes = focus ? sugestoesLocalIgreja(query) : []

  function selecionar(ig) {
    const d = dadosLocalIgreja(ig)
    setQuery(d.local)
    onChange?.(d.local)
    onSelectIgreja?.(d)
    setFocus(false)
  }

  function usarPersonalizado() {
    onChange?.(query)
    setFocus(false)
  }

  const compactStyle = compact
    ? {
        width: '100%',
        boxSizing: 'border-box',
        background: 'var(--bg-raised)',
        border: '1.5px solid var(--border-subtle)',
        borderRadius: 12,
        padding: '9px 12px 9px 36px',
        fontSize: 13,
        color: 'var(--text-primary)',
        outline: 'none',
      }
    : undefined

  const className = compact ? undefined : 'w-full rounded-xl px-3 py-2 pl-9 focus:outline-none input-dark'
  const normalStyle = compact ? undefined : { fontSize: 13, border: '1.5px solid var(--border-subtle)' }

  const dropdownStyle = {
    position: 'absolute',
    zIndex: 60,
    left: 0,
    right: 0,
    marginTop: 4,
    background: 'var(--bg-surface)',
    border: '1.5px solid var(--border-subtle)',
    borderRadius: 14,
    boxShadow: 'var(--shadow-md)',
    maxHeight: 220,
    overflowY: 'auto',
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--text-tertiary)' }} />
        <input
          value={query}
          onChange={e => {
            setQuery(e.target.value)
            onChange?.(e.target.value)
            setFocus(true)
          }}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 160)}
          placeholder={placeholder}
          className={className}
          style={compact ? compactStyle : normalStyle}
        />
        {query && (
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault()
              setQuery('')
              onChange?.('')
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {focus && sugestoes.length > 0 && (
        <div style={dropdownStyle}>
          {sugestoes.map(ig => (
            <button
              key={ig.id}
              type="button"
              onMouseDown={() => selecionar(ig)}
              className="w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors hov-srf"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)' }}>
                <Church size={13} style={{ color: 'var(--accent-bright)' }} />
              </div>
              <div className="min-w-0 text-left">
                <p className="font-bold truncate" style={{ fontSize: 12, color: 'var(--text-primary)' }}>{ig.nome}</p>
                <p className="truncate" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{ig.endereco || ig.setor}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {focus && query.length >= 1 && sugestoes.length === 0 && (
        <div style={dropdownStyle}>
          <button
            type="button"
            onMouseDown={usarPersonalizado}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hov-srf"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(16,185,129,0.12)' }}>
              <MapPin size={13} style={{ color: '#059669' }} />
            </div>
            <div className="min-w-0 text-left">
              <p className="font-bold truncate" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Usar como local personalizado
              </p>
              <p className="truncate" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{query}</p>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}
