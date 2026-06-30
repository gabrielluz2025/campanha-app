import { useState, useEffect, useMemo, useRef } from 'react'
import { IGREJAS_BASE } from './MapaIgrejas'
import {
  Search, X, CornerDownLeft, Heart, Users, CalendarDays,
  Building2, Package, MapPin,
} from 'lucide-react'

const NIVEL_LABEL = {
  simpatizante: 'Simpatizante', apoiador: 'Apoiador',
  cabo_eleitoral: 'Cabo Eleitoral', lider: 'Líder Comunitário',
}

function norm(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function parse(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || fallback) } catch { return JSON.parse(fallback) }
}

// Monta o índice de busca a partir de todos os módulos (localStorage).
function buildIndex() {
  const itens = []

  // Apoiadores
  parse('apoiadores_lista', '[]').forEach(a => {
    itens.push({
      tab: 'apoiadores', icon: Heart, cor: '#ec4899',
      tipo: 'Apoiador', titulo: a.nome,
      sub: [NIVEL_LABEL[a.nivel] || '', a.bairro, a.telefone].filter(Boolean).join(' · '),
      blob: norm([a.nome, a.bairro, a.telefone, NIVEL_LABEL[a.nivel]].join(' ')),
    })
  })

  // Equipe
  parse('equipe_membros', '[]').forEach(m => {
    itens.push({
      tab: 'equipe', icon: Users, cor: '#10b981',
      tipo: 'Equipe', titulo: m.nome,
      sub: [m.cargo, m.bairro, m.telefone].filter(Boolean).join(' · '),
      blob: norm([m.nome, m.cargo, m.bairro, m.telefone, m.email].join(' ')),
    })
  })

  // Agenda
  parse('agenda_eventos', '[]').forEach(e => {
    const data = e.dataInicio || e.data || ''
    const dataFmt = data ? new Date(data + 'T12:00').toLocaleDateString('pt-BR') : ''
    itens.push({
      tab: 'agenda', icon: CalendarDays, cor: '#3b82f6',
      tipo: 'Evento', titulo: e.titulo,
      sub: [dataFmt, e.local].filter(Boolean).join(' · '),
      blob: norm([e.titulo, e.local, e.categoria].join(' ')),
    })
  })

  // Igrejas (base + customizadas + pastores)
  const pastores = parse('pastores_igrejas', '{}')
  const custom   = parse('igrejas_custom', '[]')
  ;[...IGREJAS_BASE, ...custom].forEach(ig => {
    const p = pastores[ig.id] || {}
    const nomesPastores = [p.pastor1, p.esposa1, p.pastor2, p.esposa2].filter(Boolean).join(' ')
    itens.push({
      tab: 'mapa', icon: Building2, cor: '#14b8a6',
      tipo: 'Igreja', titulo: ig.nome,
      sub: [ig.setor, ig.endereco].filter(Boolean).join(' · '),
      blob: norm([ig.nome, ig.setor, ig.endereco, ig.denominacao, nomesPastores].join(' ')),
    })
  })

  // Materiais
  parse('materiais_estoque', '[]').forEach(it => {
    itens.push({
      tab: 'materiais', icon: Package, cor: '#84cc16',
      tipo: 'Material', titulo: it.nome,
      sub: [it.categoria, `${it.quantidade} un.`].filter(Boolean).join(' · '),
      blob: norm([it.nome, it.categoria].join(' ')),
    })
  })

  // Eleitores (locais de votação)
  const eleitores = parse('eleitores_data', 'null')
  if (eleitores?.zonas) {
    eleitores.zonas.forEach(z => (z.locais || []).forEach(l => {
      itens.push({
        tab: 'eleitores', icon: MapPin, cor: '#ec4899',
        tipo: 'Local de Voto', titulo: l.nome,
        sub: `Zona ${z.zona}`,
        blob: norm([l.nome, 'zona ' + z.zona].join(' ')),
      })
    }))
  }

  return itens
}

export default function GlobalSearch({ open, onClose, onNavigate }) {
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef(null)
  const [index, setIndex] = useState([])

  useEffect(() => {
    if (open) {
      setIndex(buildIndex())
      setQuery('')
      setSel(0)
      setTimeout(() => inputRef.current?.focus(), 40)
    }
  }, [open])

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
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, resultados.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); escolher(resultados[sel]) }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-soft)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}>

        {/* Campo de busca */}
        <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <Search size={18} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Buscar apoiadores, igrejas, eventos, equipe, materiais..."
            className="flex-1 bg-transparent outline-none text-white"
            style={{ fontSize: 15 }} />
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 flex-shrink-0">
            <X size={16} style={{ color: 'var(--text-tertiary)' }} />
          </button>
        </div>

        {/* Resultados */}
        <div className="max-h-[55vh] overflow-y-auto py-2">
          {!query.trim() ? (
            <div className="px-4 py-10 text-center">
              <Search size={26} style={{ color: 'var(--text-faint)', margin: '0 auto 10px' }} />
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Digite para buscar em todo o sistema</p>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>Apoiadores · Igrejas · Eventos · Equipe · Materiais · Locais de voto</p>
            </div>
          ) : resultados.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Nenhum resultado para "{query}"</p>
            </div>
          ) : (
            resultados.map((it, i) => (
              <button key={i} onClick={() => escolher(it)} onMouseEnter={() => setSel(i)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                style={{ background: i === sel ? 'var(--bg-raised)' : 'transparent' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: it.cor + '1e', border: `1px solid ${it.cor}33` }}>
                  <it.icon size={15} style={{ color: it.cor }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white truncate" style={{ fontSize: 13 }}>{it.titulo || '(sem nome)'}</p>
                  {it.sub && <p className="truncate" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{it.sub}</p>}
                </div>
                <span className="flex-shrink-0 px-2 py-0.5 rounded-md font-bold"
                  style={{ fontSize: 9, color: it.cor, background: it.cor + '14', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  {it.tipo}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-3" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
            <span className="flex items-center gap-1"><CornerDownLeft size={11} /> abrir</span>
            <span>↑↓ navegar</span>
            <span>Esc fechar</span>
          </div>
          {resultados.length > 0 && (
            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
              {resultados.length} resultado{resultados.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
