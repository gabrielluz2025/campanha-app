import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { eIgrejaCrista } from '../utils/igrejaCrista'
import {
  Search, X, CornerDownLeft, Heart, Users, CalendarDays,
  Building2, Package, MapPin,
} from 'lucide-react'
import { readStorage, readEleitoresData } from '../utils/persist'
import { MODULO_MAPA_VISITAS_ATIVO, MODULO_CAMPO_VISITAS_ATIVO } from '../constants/campanhaModulos'

const NIVEL_LABEL = {
  simpatizante: 'Simpatizante', apoiador: 'Apoiador',
  cabo_eleitoral: 'Cabo Eleitoral', lider: 'Líder Comunitário',
}

function norm(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function asArray(key, fallback = []) {
  const v = readStorage(key, fallback)
  return Array.isArray(v) ? v : fallback
}

function asObject(key, fallback = {}) {
  const v = readStorage(key, fallback)
  return v && typeof v === 'object' && !Array.isArray(v) ? v : fallback
}

/** Índice de busca — nunca lança (evita tela preta no ErrorBoundary). */
function buildIndex() {
  const itens = []
  try {
    asArray('apoiadores_lista').forEach(a => {
      if (!a) return
      itens.push({
        tab: 'apoiadores', icon: Heart, cor: '#ec4899',
        tipo: 'Apoiador', titulo: a.nome || 'Sem nome',
        sub: [NIVEL_LABEL[a.nivel] || '', a.bairro, a.telefone].filter(Boolean).join(' · '),
        blob: norm([a.nome, a.bairro, a.telefone, NIVEL_LABEL[a.nivel]].join(' ')),
      })
    })

    asArray('equipe_membros').forEach(m => {
      if (!m) return
      itens.push({
        tab: 'equipe', icon: Users, cor: '#10b981',
        tipo: 'Equipe', titulo: m.nome || 'Sem nome',
        sub: [m.cargo, m.bairro, m.telefone].filter(Boolean).join(' · '),
        blob: norm([m.nome, m.cargo, m.bairro, m.telefone, m.email].join(' ')),
      })
    })

    asArray('agenda_eventos').forEach(e => {
      if (!e) return
      const data = e.dataInicio || e.data || ''
      const dataFmt = data ? new Date(data + 'T12:00').toLocaleDateString('pt-BR') : ''
      itens.push({
        tab: 'agenda', icon: CalendarDays, cor: '#3b82f6',
        tipo: 'Evento', titulo: e.titulo || 'Evento',
        sub: [dataFmt, e.local].filter(Boolean).join(' · '),
        blob: norm([e.titulo, e.local, e.categoria].join(' ')),
      })
    })

    const pastores = asObject('pastores_igrejas')
    const custom = asArray('igrejas_custom')
    if (MODULO_MAPA_VISITAS_ATIVO || MODULO_CAMPO_VISITAS_ATIVO) {
      const tabIgreja = MODULO_MAPA_VISITAS_ATIVO ? 'mapa' : 'campovisitas'
      custom.filter(eIgrejaCrista).forEach(ig => {
        if (!ig) return
        const p = pastores[ig.id] || {}
        const nomesPastores = [p.pastor1, p.esposa1, p.pastor2, p.esposa2].filter(Boolean).join(' ')
        itens.push({
          tab: tabIgreja, icon: Building2, cor: '#14b8a6',
          tipo: 'Igreja', titulo: ig.nome || 'Igreja',
          sub: [ig.setor, ig.endereco].filter(Boolean).join(' · '),
          blob: norm([ig.nome, ig.setor, ig.endereco, ig.denominacao, nomesPastores].join(' ')),
        })
      })
    }

    asArray('materiais_estoque').forEach(it => {
      if (!it) return
      itens.push({
        tab: 'materiais', icon: Package, cor: '#84cc16',
        tipo: 'Material', titulo: it.nome || 'Material',
        sub: [it.categoria, `${it.quantidade ?? 0} un.`].filter(Boolean).join(' · '),
        blob: norm([it.nome, it.categoria].join(' ')),
      })
    })

    asArray('empresas_lista').forEach(e => {
      if (!e) return
      const titulo = e.nomeFantasia || e.razaoSocial || 'Empresa'
      itens.push({
        tab: 'empresas', icon: Building2, cor: '#0ea5e9',
        tipo: 'Empresa', titulo,
        sub: [e.cnpj, e.cidade, e.telefone].filter(Boolean).join(' · '),
        blob: norm([e.razaoSocial, e.nomeFantasia, e.cnpj, e.telefone, e.email, e.contatoNome, e.cidade].join(' ')),
      })
    })

    const eleitores = readEleitoresData({})
    ;(eleitores?.zonas || []).forEach(z => {
      ;(z.locais || []).forEach(l => {
        if (!l) return
        itens.push({
          tab: 'eleitores', icon: MapPin, cor: '#ec4899',
          tipo: 'Local de Voto', titulo: l.nome || 'Local',
          sub: `Zona ${z.zona}`,
          blob: norm([l.nome, 'zona ' + z.zona].join(' ')),
        })
      })
    })
  } catch (err) {
    console.error('Busca global: falha ao indexar', err)
  }
  return itens
}

export default function GlobalSearch({ open, onClose, onNavigate }) {
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const [index, setIndex] = useState([])
  const [ready, setReady] = useState(false)
  const inputRef = useRef(null)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) {
      setReady(false)
      return undefined
    }
    setQuery('')
    setSel(0)
    setReady(false)
    // Monta índice fora do paint crítico; evita crash + click-through no backdrop
    const t = window.setTimeout(() => {
      setIndex(buildIndex())
      setReady(true)
      inputRef.current?.focus()
    }, 30)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const resultados = useMemo(() => {
    const q = norm(query.trim())
    if (!q) return []
    const termos = q.split(/\s+/)
    return index
      .filter(it => termos.every(t => it.blob.includes(t)))
      .slice(0, 40)
  }, [query, index])

  useEffect(() => { setSel(0) }, [query])

  function escolher(item) {
    if (!item) return
    onNavigate(item.tab)
    onClose()
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { onClose(); return }
    if (!resultados.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, resultados.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); escolher(resultados[sel]) }
  }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9990] flex items-start justify-center px-4 pt-[10vh] sm:pt-[14vh]"
      style={{ background: 'rgba(6, 8, 14, 0.55)', backdropFilter: 'blur(8px)' }}
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Busca global"
    >
      <div
        ref={panelRef}
        className="w-full max-w-xl overflow-hidden"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-soft)',
          borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.45), 0 0 0 1px color-mix(in srgb, var(--gold) 12%, transparent)',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-3 px-4 py-3.5"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <Search size={18} strokeWidth={1.75} style={{ color: 'var(--gold)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar apoiadores, igrejas, eventos, equipe…"
            className="flex-1 bg-transparent outline-none"
            style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}
            autoComplete="off"
          />
          <kbd
            className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded"
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-faint)',
              border: '1px solid var(--border-subtle)',
              fontFamily: 'inherit',
            }}
          >
            Esc
          </kbd>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg flex-shrink-0"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[min(55vh,420px)] overflow-y-auto py-1.5" style={{ scrollbarWidth: 'thin' }}>
          {!ready ? (
            <div className="px-4 py-8 text-center" style={{ fontSize: 13, color: 'var(--text-faint)' }}>
              Preparando busca…
            </div>
          ) : !query.trim() ? (
            <div className="px-4 py-9 text-center">
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
                Digite para buscar em todo o sistema
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>
                Apoiadores · Igrejas · Eventos · Equipe · Materiais · Locais
              </p>
            </div>
          ) : resultados.length === 0 ? (
            <div className="px-4 py-9 text-center">
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                Nenhum resultado para “{query}”
              </p>
            </div>
          ) : (
            resultados.map((it, i) => {
              const Icon = it.icon
              const active = i === sel
              return (
                <button
                  key={`${it.tab}-${it.tipo}-${it.titulo}-${i}`}
                  type="button"
                  onClick={() => escolher(it)}
                  onMouseEnter={() => setSel(i)}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left mx-0"
                  style={{
                    background: active ? 'var(--bg-raised)' : 'transparent',
                    borderLeft: active ? '2px solid var(--gold)' : '2px solid transparent',
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      background: `color-mix(in srgb, ${it.cor} 14%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${it.cor} 22%, transparent)`,
                    }}
                  >
                    <Icon size={14} style={{ color: it.cor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {it.titulo || '(sem nome)'}
                    </p>
                    {it.sub && (
                      <p className="truncate" style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>
                        {it.sub}
                      </p>
                    )}
                  </div>
                  <span
                    className="flex-shrink-0 px-2 py-0.5 rounded-md font-semibold"
                    style={{
                      fontSize: 9,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: it.cor,
                      background: `color-mix(in srgb, ${it.cor} 12%, transparent)`,
                    }}
                  >
                    {it.tipo}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div
          className="flex items-center justify-between px-4 py-2"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
            <span className="inline-flex items-center gap-1"><CornerDownLeft size={11} /> abrir</span>
            <span>↑↓ navegar</span>
          </div>
          {resultados.length > 0 && (
            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
              {resultados.length} resultado{resultados.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
