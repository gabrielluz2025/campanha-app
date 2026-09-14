import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Save, Loader2, MessageCircle, ChevronUp, ChevronDown, GripVertical, CalendarDays, Zap, MapPin, Search } from 'lucide-react'
import { loadEquipeMembros } from '../utils/rotaUtils'
import { buscarIgrejasMaisProximas, dataLocalHoje, dataLocalOffsetDias } from '../utils/campoCheckIn'
import {
  upsertRotaDiaria,
  rotaDiariaDoMembro,
  readRotasDiariasRaw,
  ROTAS_DIARIAS_EVENT,
  excluirRotaDiaria,
  montarMensagemWhatsAppRota,
  urlWhatsAppRota,
  otimizarSequenciaParadasOsrm,
} from '../utils/rotasDiarias'

function normEmail(e) {
  return String(e || '').trim().toLowerCase()
}

const CampoDespachoPanel = forwardRef(function CampoDespachoPanel(
  { churches, dataRota, onDataRotaChange, compact = false, membroEmail: membroControlled, onMembroEmailChange },
  ref,
) {
  const hoje = dataLocalHoje()
  const dataAlvo = dataRota || hoje
  const membros = useMemo(() => loadEquipeMembros(), [])
  const paradasList = Array.isArray(paradas) ? paradas : []
  const [tick, setTick] = useState(0)
  const [membroLocal, setMembroLocal] = useState('')
  const membroEmail = membroControlled != null ? membroControlled : membroLocal
  const setMembroEmail = onMembroEmailChange || setMembroLocal
  const [rotaId, setRotaId] = useState('')
  const [paradas, setParadas] = useState([])
  const [busca, setBusca] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')
  const persistTimer = useRef(null)
  const [draggedIndex, setDraggedIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [modalOtimizar, setModalOtimizar] = useState(false)
  const [otimizando, setOtimizando] = useState(false)

  useEffect(() => {
    const on = () => setTick(t => t + 1)
    window.addEventListener(ROTAS_DIARIAS_EVENT, on)
    return () => window.removeEventListener(ROTAS_DIARIAS_EVENT, on)
  }, [])

  useEffect(() => {
    if (!membroEmail) {
      setParadas([])
      setRotaId('')
      return
    }
    const rota = rotaDiariaDoMembro({ data: dataAlvo, membroEmail, rotas: readRotasDiariasRaw() })
    setRotaId(rota?.id || '')
    setParadas(rota?.igrejas?.map(p => ({ ...p })) || [])
  }, [membroEmail, dataAlvo, tick])

  const igById = useMemo(() => new Map((churches || []).map(ig => [String(ig.id), ig])), [churches])

  const membroAtual = useMemo(
    () => membros.find(x => normEmail(x.email) === normEmail(membroEmail)),
    [membros, membroEmail],
  )

  const persistOptimistic = useCallback((nextParadas, opts = {}) => {
    if (!membroEmail) return
    if (!nextParadas.length && !opts.allowEmpty) return
    const m = membroAtual
    try {
      const saved = upsertRotaDiaria({
        id: rotaId || undefined,
        data: dataAlvo,
        membroEmail,
        membroNome: m?.nome || '',
        igrejas: nextParadas,
      })
      if (saved?.id) setRotaId(saved.id)
      setMsg('Rota atualizada.')
      setTick(t => t + 1)
    } catch (e) {
      setMsg(e?.message || 'Erro ao salvar.')
    }
  }, [membroEmail, membroAtual, rotaId, dataAlvo])

  const schedulePersist = useCallback((nextParadas) => {
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      persistOptimistic(nextParadas)
    }, 280)
  }, [persistOptimistic])

  useEffect(() => () => {
    if (persistTimer.current) clearTimeout(persistTimer.current)
  }, [])

  const sugestoes = useMemo(() => {
    const q = busca.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    let arr = churches || []
    if (q) {
      arr = arr.filter(ig =>
        String(ig.nome || '').toLowerCase().includes(q)
        || String(ig.setor || '').toLowerCase().includes(q),
      )
    }
    const ids = new Set(paradas.map(p => String(p.igrejaId)))
    return arr.filter(ig => !ids.has(String(ig.id))).slice(0, 12)
  }, [churches, busca, paradas])

  const idsNaRota = useMemo(() => new Set(paradas.map(p => String(p.igrejaId))), [paradas])

  const origemProximidade = useMemo(() => {
    if (!paradas.length) return null
    const ultima = paradas[paradas.length - 1]
    const ig = igById.get(String(ultima.igrejaId))
    const lat = Number(ig?.lat)
    const lng = Number(ig?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng, nome: ig?.nome || '' }
  }, [paradas, igById])

  const igrejasProximasPainel = useMemo(() => {
    if (!origemProximidade) return []
    return buscarIgrejasMaisProximas(origemProximidade, churches || [], {
      limite: 5,
      excluirIds: [...idsNaRota],
    })
  }, [origemProximidade, churches, idsNaRota])

  function applyParadas(updater) {
    setParadas(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      schedulePersist(next)
      return next
    })
  }

  function addIgreja(ig) {
    if (!ig) return
    if (!membroEmail) {
      setMsg('Escolha um membro antes de adicionar paradas.')
      return
    }
    applyParadas(prev => [...prev, {
      igrejaId: ig.id,
      ordem: prev.length + 1,
      status: 'pendente',
    }])
    setBusca('')
  }

  useImperativeHandle(ref, () => ({
    addIgrejaById(igrejaId) {
      const ig = igById.get(String(igrejaId))
      if (ig) addIgreja(ig)
    },
  }), [igById, membroEmail]) // eslint-disable-line react-hooks/exhaustive-deps

  function remover(idx) {
    applyParadas(prev =>
      prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, ordem: i + 1 })),
    )
  }

  function mover(idx, dir) {
    applyParadas(prev => {
      const j = idx + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next.map((p, i) => ({ ...p, ordem: i + 1 }))
    })
  }

  function reordenarParadas(fromIndex, toIndex) {
    if (fromIndex == null || toIndex == null || fromIndex === toIndex) return
    applyParadas(prev => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) {
        return prev
      }
      const next = [...prev]
      const [item] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, item)
      return next.map((p, i) => ({ ...p, ordem: i + 1 }))
    })
  }

  function handleDragStart(e, index) {
    setDraggedIndex(index)
    setDragOverIndex(null)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
    try {
      e.dataTransfer.setDragImage(e.currentTarget, 24, 20)
    } catch { /* ignore */ }
  }

  function handleDragOver(e, index) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedIndex != null && index !== draggedIndex) {
      setDragOverIndex(index)
    }
  }

  function handleDrop(e, targetIndex) {
    e.preventDefault()
    const from = draggedIndex ?? parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (!Number.isFinite(from)) return
    reordenarParadas(from, targetIndex)
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  function handleDragEnd() {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  async function salvar() {
    setMsg('')
    if (!membroEmail) {
      setMsg('Escolha um membro da equipe.')
      return
    }
    if (!paradas.length) {
      setMsg('Adicione ao menos uma igreja à rota.')
      return
    }
    setSalvando(true)
    try {
      persistOptimistic(paradas)
      setMsg('Rota salva e sincronizada.')
    } catch (e) {
      setMsg(e?.message || 'Erro ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  function cancelarRotaAgente() {
    if (!membroEmail) return
    if (!rotaId && !paradas.length) {
      setMsg('Nenhuma rota ativa para este membro.')
      return
    }
    if (!window.confirm(
      `Cancelar a rota de ${membroAtual?.nome || membroEmail} para ${dataAlvo}? O agente deixará de ver paradas nesta data.`,
    )) return
    if (rotaId) excluirRotaDiaria(rotaId)
    setParadas([])
    setRotaId('')
    setMsg('Rota cancelada — sync enviado.')
    setTick(t => t + 1)
  }

  function enviarWhatsApp() {
    if (!paradas.length) {
      setMsg('Monte a rota antes de enviar.')
      return
    }
    const membroId = membroAtual?.id != null ? String(membroAtual.id) : ''
    const linkApp = membroId
      ? `${window.location.origin}${window.location.pathname}?view=minhas&membroId=${encodeURIComponent(membroId)}&data=${encodeURIComponent(dataAlvo)}`
      : `${window.location.origin}${window.location.pathname}`
    const mensagem = montarMensagemWhatsAppRota({
      data: dataAlvo,
      membroNome: membroAtual?.nome || membroEmail.split('@')[0],
      paradas,
      igById,
      linkApp,
    })
    const tel = membroAtual?.whatsapp || membroAtual?.telefone || ''
    const url = urlWhatsAppRota({ telefone: tel, mensagem })
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function confirmarOtimizacaoRota() {
    setModalOtimizar(false)
    setOtimizando(true)
    setMsg('')
    try {
      const { paradas: next, duracao } = await otimizarSequenciaParadasOsrm(paradas, igById)
      setParadas(next)
      persistOptimistic(next)
      const min = duracao != null ? Math.round(duracao / 60) : null
      setMsg(min != null
        ? `Sequência otimizada (~${min} min de trajeto OSRM).`
        : 'Sequência otimizada para rota mais rápida.')
    } catch (e) {
      setMsg(e?.message || 'Falha ao otimizar.')
    } finally {
      setOtimizando(false)
    }
  }

  const amanha = dataLocalOffsetDias(1)

  return (
    <>
      {modalOtimizar && (
        <div className="fixed inset-0 z-[8000] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
          <div
            className="max-w-md w-full rounded-2xl p-5 space-y-4 shadow-2xl border border-white/10"
            style={{ background: 'linear-gradient(145deg, rgba(30,27,75,0.95), rgba(15,23,42,0.98))' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="campo-opt-title"
          >
            <h2 id="campo-opt-title" className="text-base font-black text-white">
              Otimizar sequência da rota?
            </h2>
            <p className="text-sm text-white/80 leading-relaxed">
              Deseja reordenar as paradas para o trajeto geograficamente mais rápido?
            </p>
            <p className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-400/30 rounded-xl px-3 py-2">
              Aviso: isso recalculará a ordem exata para economizar tempo e combustível.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                onClick={confirmarOtimizacaoRota}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white"
                style={{ background: 'linear-gradient(135deg, #eab308, #f59e0b)' }}
              >
                <Zap size={16} />
                Sim, Otimizar para Rota Mais Rápida
              </button>
              <button
                type="button"
                onClick={() => setModalOtimizar(false)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white/90 bg-white/10 hover:bg-white/15 border border-white/15"
              >
                <MapPin size={16} />
                Não, Manter Sequência Manual
              </button>
            </div>
          </div>
        </div>
      )}

    <div className={`space-y-3 ${compact ? '' : 'px-4 py-3 border-b border-[var(--border-subtle)]'}`}
      style={compact ? undefined : { background: 'rgba(99,102,241,0.06)' }}
    >
      {!compact && (
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-indigo-300/90">Torre de controle — despacho</p>
          <p className="text-xs text-[var(--text-muted)]">
            CRUD de rotas · arraste para reordenar · WhatsApp.
          </p>
        </div>
      )}

      <div className="rounded-xl p-2.5 space-y-2 border border-white/10 bg-black/20">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-white/45">
          <CalendarDays size={12} />
          Data da rota
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="date"
            value={dataAlvo}
            onChange={e => onDataRotaChange?.(e.target.value || hoje)}
            className="rounded-lg px-2 py-1.5 text-xs bg-black/30 border border-white/10"
          />
          <button type="button" onClick={() => onDataRotaChange?.(hoje)} className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white/10 hover:bg-white/15">
            Hoje
          </button>
          <button type="button" onClick={() => onDataRotaChange?.(amanha)} className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white/10 hover:bg-white/15">
            Amanhã
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={membroEmail}
          onChange={e => setMembroEmail(e.target.value)}
          className="flex-1 rounded-xl px-3 py-2 text-sm min-w-0 bg-black/25 border border-white/10"
        >
          <option value="">Membro da equipe…</option>
          {membros.filter(m => m.email).map(m => (
            <option key={m.id || m.email} value={m.email}>{m.nome || m.email}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={salvando}
          onClick={salvar}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-black text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)' }}
        >
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Salvar
        </button>
      </div>

      {membroEmail && (
        <div className="flex flex-wrap gap-2">
          {paradasList.length >= 2 && (
            <button
              type="button"
              disabled={otimizando}
              onClick={() => setModalOtimizar(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-slate-900 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #fde047, #facc15)' }}
            >
              {otimizando ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
              Otimizar Sequência (Mais Rápida)
            </button>
          )}
          {paradasList.length > 0 && (
            <button
              type="button"
              onClick={enviarWhatsApp}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-white"
              style={{ background: 'linear-gradient(135deg, #16a34a, #22c55e)' }}
            >
              <MessageCircle size={15} />
              WhatsApp
            </button>
          )}
          <button
            type="button"
            onClick={cancelarRotaAgente}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-white border border-red-500/50"
            style={{ background: 'linear-gradient(135deg, rgba(220,38,38,0.35), rgba(185,28,28,0.5))' }}
          >
            <Trash2 size={14} />
            Cancelar rota do agente
          </button>
        </div>
      )}

      {msg && <p className="text-xs font-semibold text-indigo-200">{msg}</p>}

      {membroEmail && (
        <>
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar igreja para adicionar…"
            className="w-full rounded-xl px-3 py-2 text-sm bg-black/25 border border-white/10"
          />
          {busca && sugestoes.length > 0 && (
            <ul className="rounded-xl overflow-hidden border border-white/10 max-h-40 overflow-y-auto">
              {sugestoes.map(ig => (
                <li key={ig.id}>
                  <button
                    type="button"
                    onClick={() => addIgreja(ig)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-white/10 flex items-center gap-2"
                  >
                    <Plus size={14} className="text-emerald-400 flex-shrink-0" />
                    <span className="truncate">{ig.nome} · {ig.setor}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {igrejasProximasPainel.length > 0 && (
            <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/10 p-2.5 space-y-2">
              <p className="text-[10px] font-black uppercase text-indigo-200/90 flex items-center gap-1">
                <Search size={12} />
                Próximas{origemProximidade?.nome ? ` de ${origemProximidade.nome}` : ''}
              </p>
              <ul className="space-y-1">
                {igrejasProximasPainel.map(({ igreja: prox, labelDistancia }) => (
                  <li key={prox.id}>
                    <button
                      type="button"
                      onClick={() => addIgreja(prox)}
                      className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-white/10 flex items-center gap-2"
                    >
                      <Plus size={13} className="text-emerald-400 shrink-0" />
                      <span className="truncate flex-1 font-semibold">{prox.nome}</span>
                      <span className="text-[10px] font-bold text-indigo-300 shrink-0">a {labelDistancia}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ol className="space-y-1 max-h-[40vh] overflow-y-auto">
            {paradasList.map((p, idx) => {
              const ig = igById.get(String(p.igrejaId))
              return (
                <li
                  key={`${p.igrejaId}-${idx}`}
                  draggable
                  onDragStart={e => handleDragStart(e, idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  onDrop={e => handleDrop(e, idx)}
                  onDragEnd={handleDragEnd}
                  onDragLeave={() => {
                    if (dragOverIndex === idx) setDragOverIndex(null)
                  }}
                  className={`flex items-center gap-2 rounded-xl px-2 py-2 text-sm transition-opacity ${
                    draggedIndex === idx ? 'opacity-40' : ''
                  } ${dragOverIndex === idx ? 'border-t-2 border-indigo-500' : ''}`}
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)' }}
                >
                  <span
                    className="flex-shrink-0 p-0.5 rounded cursor-grab active:cursor-grabbing text-white/35 hover:text-white/60"
                    aria-hidden
                  >
                    <GripVertical size={16} />
                  </span>
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black bg-indigo-500/25 text-indigo-200">
                    {idx + 1}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{ig?.nome || `Igreja #${p.igrejaId}`}</span>
                  <button type="button" aria-label="Subir" className="p-1 rounded bg-white/10" onClick={() => mover(idx, -1)}>
                    <ChevronUp size={14} />
                  </button>
                  <button type="button" aria-label="Descer" className="p-1 rounded bg-white/10" onClick={() => mover(idx, 1)}>
                    <ChevronDown size={14} />
                  </button>
                  <button type="button" onClick={() => remover(idx)} className="p-1 text-red-300 hover:bg-white/10 rounded">
                    <Trash2 size={14} />
                  </button>
                </li>
              )
            })}
            {!paradasList.length && (
              <li className="text-xs text-[var(--text-muted)] py-2">Nenhuma parada — busque ou clique no mapa.</li>
            )}
          </ol>
        </>
      )}
    </div>
    </>
  )
})

export default CampoDespachoPanel
