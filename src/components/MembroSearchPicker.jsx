import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Search, Star, UserPlus, X } from 'lucide-react'
import { corCargo, normalizarCargo } from '../utils/equipeSync'
import MembroAvatar from './MembroAvatar'

function normStr(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function filtrarMembros(membros, q, cargo) {
  const query = normStr(q.trim())
  return membros.filter(m => {
    if (cargo && cargo !== 'Todos' && normalizarCargo(m.cargo) !== cargo) return false
    if (!query) return true
    const bairros = Array.isArray(m.bairros) ? m.bairros.join(' ') : (m.bairro || '')
    return (
      normStr(m.nome).includes(query)
      || normStr(m.cargo).includes(query)
      || normStr(bairros).includes(query)
      || String(m.telefone || '').includes(query)
    )
  })
}

export default function MembroSearchPicker({
  membros = [],
  value = '',
  onChange,
  placeholder = 'Pesquisar nome do responsável…',
  compact = false,
  allowEmpty = true,
  emptyLabel = 'Sem responsável',
  equipeIds = [],
  onToggleEquipe,
  autoFocus = false,
  showCargoFilter = false,
}) {
  const [q, setQ] = useState('')
  const [aberto, setAberto] = useState(!compact)
  const [cargo, setCargo] = useState('Todos')
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const equipeSet = useMemo(() => new Set((equipeIds || []).map(String)), [equipeIds])
  const selecionado = useMemo(
    () => membros.find(m => String(m.id) === String(value)) || null,
    [membros, value],
  )

  const cargosDisp = useMemo(() => {
    const set = new Set()
    membros.forEach(m => {
      const c = normalizarCargo(m.cargo)
      if (c) set.add(c)
    })
    return ['Todos', ...[...set].sort()]
  }, [membros])

  const lista = useMemo(() => {
    const filtered = filtrarMembros(membros, q, cargo)
    return [...filtered].sort((a, b) => {
      const aSel = String(a.id) === String(value) ? 0 : 1
      const bSel = String(b.id) === String(value) ? 0 : 1
      if (aSel !== bSel) return aSel - bSel
      const aEq = equipeSet.has(String(a.id)) ? 0 : 1
      const bEq = equipeSet.has(String(b.id)) ? 0 : 1
      if (aEq !== bEq) return aEq - bEq
      return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
    })
  }, [membros, q, cargo, value, equipeSet])

  useEffect(() => {
    if (!compact) return undefined
    function onDoc(e) {
      if (!wrapRef.current?.contains(e.target)) setAberto(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [compact])

  useEffect(() => {
    if ((aberto || autoFocus) && inputRef.current) {
      const t = setTimeout(() => inputRef.current?.focus(), 40)
      return () => clearTimeout(t)
    }
    return undefined
  }, [aberto, autoFocus])

  function escolher(id) {
    onChange?.(id)
    if (compact) {
      setAberto(false)
      setQ('')
    }
  }

  const searchBox = (
    <div className="membro-search-field">
      <Search size={13} className="membro-search-icon" />
      <input
        ref={inputRef}
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={placeholder}
        className="membro-search-input"
      />
      {q ? (
        <button type="button" className="membro-search-clear" onClick={() => setQ('')} title="Limpar">
          <X size={12} />
        </button>
      ) : null}
    </div>
  )

  const cargoChips = showCargoFilter && cargosDisp.length > 2 ? (
    <div className="membro-search-cargos">
      {cargosDisp.slice(0, 8).map(c => (
        <button
          key={c}
          type="button"
          onClick={() => setCargo(c)}
          className={`membro-search-cargo ${cargo === c ? 'active' : ''}`}
        >
          {c === 'Todos' ? 'Todos' : c.split(' ')[0]}
        </button>
      ))}
    </div>
  ) : null

  const list = (
    <div className={`membro-search-list ${compact ? 'is-compact' : ''}`}>
      {allowEmpty && compact && (
        <button
          type="button"
          className={`membro-search-row ${!value ? 'is-selected' : ''}`}
          onClick={() => escolher('')}
        >
          <span className="membro-search-empty-dot" />
          <span className="membro-search-meta">
            <span className="membro-search-name">{emptyLabel}</span>
          </span>
        </button>
      )}
      {lista.length === 0 ? (
        <p className="membro-search-empty">
          {membros.length === 0 ? 'Cadastre pessoas na aba Equipe' : 'Nenhum nome encontrado'}
        </p>
      ) : lista.map(m => {
        const sel = String(m.id) === String(value)
        const naEq = equipeSet.has(String(m.id))
        const cor = corCargo(m.cargo)
        return (
          <div key={m.id} className={`membro-search-row ${sel ? 'is-selected' : ''}`}>
            <button type="button" className="membro-search-main" onClick={() => escolher(m.id)}>
              <MembroAvatar membro={m} size={compact ? 32 : 40} ring={sel} />
              <span className="membro-search-meta">
                <span className="membro-search-name">
                  {m.nome || 'Sem nome'}
                  {sel && <Star size={10} style={{ color: 'var(--gold-bright)', flexShrink: 0 }} />}
                </span>
                <span className="membro-search-sub">
                  <em style={{ color: cor }}>{normalizarCargo(m.cargo) || 'Sem cargo'}</em>
                  {naEq ? ' · na rota' : ''}
                </span>
              </span>
              {sel ? <Check size={14} style={{ color: 'var(--gold-bright)', flexShrink: 0 }} /> : null}
            </button>
            {onToggleEquipe && !compact && (
              <button
                type="button"
                className={`membro-search-eq ${naEq ? 'on' : ''}`}
                title={naEq ? 'Tirar da equipe da rota' : 'Incluir na equipe da rota'}
                onClick={() => onToggleEquipe(m.id, !naEq)}
              >
                {naEq ? <Check size={13} /> : <UserPlus size={13} />}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )

  if (!compact) {
    return (
      <div className="membro-search" ref={wrapRef}>
        {searchBox}
        {cargoChips}
        <p className="membro-search-count">
          {lista.length} de {membros.length}
          {q.trim() ? ' no nome' : ''}
        </p>
        {list}
      </div>
    )
  }

  return (
    <div className="membro-search is-dropdown" ref={wrapRef}>
      <button
        type="button"
        className="membro-search-trigger"
        onClick={() => setAberto(v => !v)}
        title="Pesquisar responsável"
      >
        {selecionado
          ? <MembroAvatar membro={selecionado} size={28} ring />
          : (
            <span className="membro-search-placeholder-av">
              <Search size={12} />
            </span>
          )}
        <span className="membro-search-trigger-txt">
          <span>{selecionado?.nome || 'Pesquisar responsável…'}</span>
          {selecionado?.cargo
            ? <em>{normalizarCargo(selecionado.cargo)}</em>
            : <em>Digite o nome para achar</em>}
        </span>
      </button>
      {aberto && (
        <div className="membro-search-pop">
          {searchBox}
          {list}
        </div>
      )}
    </div>
  )
}
