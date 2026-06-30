/* ─────────────────────────────────────────────────────────────
   Agenda.jsx — Gerenciamento de eventos e compromissos
   Padrões:
     • Constantes globais: SCREAMING_SNAKE_CASE
     • Estado do formulário: camelCase com prefixo descritivo
     • Funções utilitárias puras: camelCase fora do componente
     • Funções de UI: verbos em português (abrir*, fechar*, salvar*)
     • Estilos inline compartilhados: constantes INPUT_CLS / INPUT_STY
───────────────────────────────────────────────────────────── */
import { useState, useEffect, useRef } from 'react'
import {
  CalendarDays, Plus, X, Clock, MapPin, User, Phone,
  ChevronLeft, ChevronRight, AlertTriangle, Pencil,
  Trash2, Users, Search, Church, Share2, Copy, Check,
} from 'lucide-react'
import { IGREJAS_BASE } from './MapaIgrejas'
import { confirmAction } from '../utils/confirm'

/* ── Constantes de domínio ────────────────────────────────── */
const MESES        = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS_SEMANA  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const STORAGE_KEY  = 'agenda_eventos'
const CORES_EVENTO = [
  '#3b82f6','#06b6d4','#ec4899','#f97316','#10b981',
  '#06b6d4','#f59e0b','#ef4444','#2563eb','#84cc16',
]
const CATEGORIAS = [
  { id: 'visita', label: 'Visita', cor: '#3b82f6' },
  { id: 'reuniao', label: 'Reunião', cor: '#06b6d4' },
  { id: 'culto', label: 'Culto', cor: '#ec4899' },
  { id: 'palestra', label: 'Palestra', cor: '#f97316' },
  { id: 'entrevista', label: 'Entrevista', cor: '#10b981' },
  { id: 'outro', label: 'Outro', cor: 'rgba(203,213,235,0.60)' },
]

/* Formulário vazio — todos os campos padronizados */
const FORM_VAZIO = {
  titulo:         '',
  categoria:      'visita',
  dataInicio:     '',
  dataFim:        '',
  horaInicio:     '08:00',
  horaFim:        '09:00',
  local:          '',
  representantes: [{ data: '', nome: '' }],  // [{data: 'YYYY-MM-DD', nome: ''}]
  indicadoPor:    '',
  contato:        '',
  observacoes:    '',
  cor:            CORES_EVENTO[0],
}

/* ── Estilos compartilhados de input ──────────────────────── */
const INPUT_CLS = 'w-full rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300'
const INPUT_STY = { fontSize: 13, border: '1.5px solid rgba(255,255,255,0.12)', textTransform: 'capitalize' }

/* ── Funções utilitárias puras ────────────────────────────── */
function uid()       { return Date.now().toString(36) + Math.random().toString(36).slice(2) }
function toMin(h)    { const [hh, mm] = h.split(':').map(Number); return hh * 60 + mm }
function normStr(s)  { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') }

/** Retorna array de strings 'YYYY-MM-DD' para cada dia entre di e df (inclusive) */
function diasEntre(di, df) {
  if (!di || !df || di > df) return di ? [di] : []
  const result = []
  for (let d = new Date(di + 'T12:00'); d <= new Date(df + 'T12:00'); d.setDate(d.getDate() + 1)) {
    result.push(d.toISOString().slice(0, 10))
  }
  return result
}

/** Sincroniza array de representantes ao mudar o intervalo de datas */
function syncRepresentantes(dataInicio, dataFim, repsAtuais) {
  const dias = diasEntre(dataInicio, dataFim)
  if (!dias.length) return [{ data: dataInicio || '', nome: '' }]
  return dias.map(d => repsAtuais.find(r => r.data === d) || { data: d, nome: '' })
}

/** Normaliza eventos antigos (com campo .data) para o novo formato */
function normalizeEvento(ev) {
  if (ev.dataInicio) return ev
  const data = ev.data || ''
  return {
    ...ev,
    dataInicio:     data,
    dataFim:        data,
    representantes: ev.representante
      ? [{ data, nome: ev.representante }]
      : [{ data, nome: '' }],
  }
}

/** Verifica se dois eventos conflitam (intervalos de data E hora sobrepostos) */
function conflita(a, b) {
  if (a.id === b.id) return false
  const adi = a.dataInicio, adf = a.dataFim || a.dataInicio
  const bdi = b.dataInicio, bdf = b.dataFim || b.dataInicio
  if (adi > bdf || adf < bdi) return false                          // datas sem sobreposição
  return toMin(a.horaInicio) < toMin(b.horaFim) &&
         toMin(a.horaFim)    > toMin(b.horaInicio)
}

/* ── Sub-componentes reutilizáveis ────────────────────────── */
function Field({ label, children }) {
  return (
    <div>
      <label className="block font-semibold mb-1" style={{ fontSize: 11, color: 'rgba(203,213,235,0.60)', textTransform: 'capitalize' }}>{label}</label>
      {children}
    </div>
  )
}

function InfoRow({ icon, cor, text }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span style={{ color: cor, flexShrink: 0 }}>{icon}</span>
      <span className="truncate" style={{ fontSize: 12, color: 'rgba(203,213,235,0.62)' }}>{text}</span>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Componente principal
══════════════════════════════════════════════════════════ */
export default function Agenda() {
  const hoje    = new Date()
  const hojeStr = hoje.toISOString().slice(0, 10)

  /* ── Estado principal ────────────────────────────────── */
  const [eventos,    setEventos]    = useState(() =>
    JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').map(normalizeEvento)
  )
  const [mes,        setMes]        = useState(hoje.getMonth())
  const [ano,        setAno]        = useState(hoje.getFullYear())
  const [diaSel,     setDiaSel]     = useState(hojeStr)
  const [modal,      setModal]      = useState(null)   // null | 'novo' | eventId
  const [form,       setForm]       = useState(FORM_VAZIO)
  const [cfAviso,    setCfAviso]    = useState([])
  const [localQuery, setLocalQuery] = useState('')
  const [localFocus, setLocalFocus] = useState(false)
  const localRef = useRef(null)
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas')
  const [viewMode, setViewMode] = useState('dia') // 'dia' | 'mes'
  const [membrosEquipe, setMembrosEquipe] = useState(() =>
    JSON.parse(localStorage.getItem('equipe_membros') || '[]')
  )
  const [repFocusIdx, setRepFocusIdx] = useState(null)
  const [modalShare,  setModalShare]  = useState(false)
  const [shareMembro, setShareMembro] = useState('')
  const [shareCats,   setShareCats]   = useState(['todas'])
  const [sharePode,   setSharePode]   = useState(false)
  const [shareTitulo, setShareTitulo] = useState('Agenda da Equipe')
  const [linkGerado,  setLinkGerado]  = useState('')
  const [copiado,     setCopiado]     = useState(false)

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(eventos)) }, [eventos])

  /* ── Helpers de calendário ───────────────────────────── */
  const primeiroDia = new Date(ano, mes, 1).getDay()
  const diasNoMes   = new Date(ano, mes + 1, 0).getDate()
  const celulas     = [...Array(primeiroDia).fill(null),
                       ...Array.from({ length: diasNoMes }, (_, i) => i + 1)]

  function toDataStr(d) {
    return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  /** Retorna eventos que cobrem o dia informado (suporta multi-dia) */
  function eventosNoDia(data) {
    return eventos
      .filter(e => {
        if (categoriaFiltro !== 'todas' && e.categoria !== categoriaFiltro) return false
        return e.dataInicio <= data && (e.dataFim || e.dataInicio) >= data
      })
      .sort((a, b) => toMin(a.horaInicio) - toMin(b.horaInicio))
  }

  function navMes(delta) {
    const d = new Date(ano, mes + delta, 1)
    setMes(d.getMonth()); setAno(d.getFullYear())
  }

  /* ── Helpers do modal ────────────────────────────────── */
  const updForm = (k, v) => setForm(p => ({ ...p, [k]: v }))

  function abrirNovo() {
    const cor = CORES_EVENTO[eventos.length % CORES_EVENTO.length]
    setForm({ ...FORM_VAZIO, dataInicio: diaSel, dataFim: diaSel,
              representantes: [{ data: diaSel, nome: '' }], cor })
    setLocalQuery(''); setCfAviso([])
    setModal('novo')
  }

  function abrirEditar(ev) {
    setForm({ ...ev })
    setLocalQuery(ev.local || ''); setCfAviso([])
    setModal(ev.id)
  }

  function fechar() { setModal(null); setCfAviso([]); setLocalQuery('') }

  function getConflitos(ev) {
    return eventos.filter(e => conflita(ev, e))
  }

  function salvar() {
    const evParaVerificar = { ...form, id: modal === 'novo' ? '__novo__' : modal }
    const cf = getConflitos(evParaVerificar)
    if (cf.length > 0 && cfAviso.length === 0) { setCfAviso(cf); return }
    if (modal === 'novo') {
      setEventos(p => [...p, { ...form, id: uid() }])
    } else {
      setEventos(p => p.map(e => e.id === modal ? { ...form } : e))
    }
    setDiaSel(form.dataInicio)
    fechar()
  }

  function gerarLink() {
    const membro = membrosEquipe.find(m => m.id === shareMembro)
    const cats   = shareCats.includes('todas') ? null : shareCats
    const evsFiltrados = eventos.filter(ev => {
      if (cats && !cats.includes(ev.categoria)) return false
      const dataFim = ev.dataFim || ev.dataInicio
      return dataFim >= new Date().toISOString().slice(0, 10)
    }).slice(0, 150)
    const payload = {
      v: 1,
      titulo:     shareTitulo || 'Agenda da Equipe',
      membro:     membro?.nome || '',
      podeMarcar: sharePode,
      categorias: shareCats,
      eventos:    evsFiltrados,
      geradoEm:   new Date().toISOString(),
    }
    const token   = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    const baseUrl = import.meta.env.VITE_APP_URL || `${window.location.origin}${window.location.pathname}`
    const link    = `${baseUrl}#/agenda-equipe/${token}`
    setLinkGerado(link)
  }

  function copiarLink() {
    navigator.clipboard.writeText(linkGerado).then(() => {
      setCopiado(true); setTimeout(() => setCopiado(false), 2500)
    })
  }

  async function excluir(id) {
    const ev = eventos.find(e => e.id === id)
    const ok = await confirmAction({
      title: 'Excluir evento',
      message: `Excluir "${ev?.titulo || 'este evento'}" da agenda? Esta ação não pode ser desfeita.`,
    })
    if (ok) setEventos(p => p.filter(e => e.id !== id))
  }

  /* ── Autocomplete de local ───────────────────────────── */
  const localSugestoes = localQuery.length >= 1
    ? IGREJAS_BASE.filter(ig =>
        normStr(ig.nome).includes(normStr(localQuery)) ||
        normStr(ig.endereco).includes(normStr(localQuery))
      ).slice(0, 8)
    : []

  function selecionarLocal(ig) {
    const texto = `${ig.nome} — ${ig.endereco}`
    updForm('local', texto); setLocalQuery(texto); setLocalFocus(false)
  }

  /* ── Dados derivados ─────────────────────────────────── */
  const eventosDoDia = eventosNoDia(diaSel)
  const totalMes     = eventos.filter(e => {
    const [y, m] = e.dataInicio.split('-').map(Number)
    return y === ano && m - 1 === mes
  }).length

  /* ── Renderização de datas do evento no card ─────────── */
  function labelPeriodo(ev) {
    if (!ev.dataFim || ev.dataFim === ev.dataInicio) {
      return new Date(ev.dataInicio + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    }
    const di = new Date(ev.dataInicio + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    const df = new Date(ev.dataFim    + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    return `${di} → ${df}`
  }

  /** Representante do dia selecionado para eventos multi-dia */
  function repDoDia(ev, data) {
    const r = (ev.representantes || []).find(r => r.data === data)
    return r?.nome || ''
  }

  /* ════════════════════════════════════════════════════════
     JSX principal
  ════════════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col md:flex-row flex-1 overflow-hidden" >

      {/* ── Painel esquerdo: Calendário ──────────────────── */}
      <div className="w-full md:w-72 flex flex-col srf flex-shrink-0"
        style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>

        {/* Header gradient */}
        <div className="flex-shrink-0 px-5 py-5"
          style={{ background: 'linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 55%,#1e40af 100%)' }}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.18)' }}>
                <CalendarDays size={22} className="text-white" />
              </div>
              <div>
                <h2 className="font-bold text-white" style={{ fontSize: 14 }}>Agenda</h2>
                <p className="text-blue-200" style={{ fontSize: 11 }}>Eventos e compromissos</p>
              </div>
            </div>
            <button onClick={() => { setModalShare(true); setLinkGerado('') }}
              className="flex items-center gap-1.5 font-bold text-white rounded-xl px-3 py-1.5 transition-all"
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', fontSize: 12 }}
              title="Compartilhar agenda">
              <Share2 size={13} /> Compartilhar
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[{ label: 'Total', value: eventos.length }, { label: 'Este mês', value: totalMes }]
              .map(({ label, value }) => (
                <div key={label} className="rounded-xl px-3 py-2 text-center"
                  style={{ background: 'rgba(255,255,255,0.13)' }}>
                  <p className="text-white font-bold leading-none" style={{ fontSize: 20 }}>{value}</p>
                  <p className="text-blue-200 mt-0.5" style={{ fontSize: 10 }}>{label}</p>
                </div>
              ))}
          </div>
        </div>

        {/* Navegação de mês */}
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <button onClick={() => navMes(-1)} className="p-1.5 rounded-xl hov-srf transition-colors">
            <ChevronLeft size={16} style={{ color: 'rgba(203,213,235,0.60)' }} />
          </button>
          <span className="font-bold txt-1" style={{ fontSize: 13 }}>{MESES[mes]} {ano}</span>
          <button onClick={() => navMes(1)} className="p-1.5 rounded-xl hov-srf transition-colors">
            <ChevronRight size={16} style={{ color: 'rgba(203,213,235,0.60)' }} />
          </button>
        </div>

        {/* Filtros + View Toggle */}
        <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <select
            value={categoriaFiltro}
            onChange={e => setCategoriaFiltro(e.target.value)}
            className="text-xs rounded-lg px-2 py-1.5 focus:outline-none"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-soft)', color: 'var(--text-secondary)' }}
          >
            <option value="todas">Todas categorias</option>
            {CATEGORIAS.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <div className="flex-1" />
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
            <button
              type="button"
              onClick={() => setViewMode('dia')}
              className={`px-3 py-1 text-xs font-semibold transition-colors ${
                viewMode === 'dia' ? 'bg-blue-500 text-white' : 'srf txt-2 hov-srf'
              }`}
            >
              Dia
            </button>
            <button
              type="button"
              onClick={() => setViewMode('mes')}
              className={`px-3 py-1 text-xs font-semibold transition-colors ${
                viewMode === 'mes' ? 'bg-blue-500 text-white' : 'srf txt-2 hov-srf'
              }`}
            >
              Mês
            </button>
          </div>
        </div>

        {/* Header dias da semana + Grade de dias — só na visão de dia */}
        {viewMode === 'dia' && (
          <>
            <div className="grid grid-cols-7 px-3 pt-2 pb-1 flex-shrink-0">
              {DIAS_SEMANA.map(d => (
                <div key={d} className="text-center font-bold" style={{ fontSize: 9, color: 'rgba(203,213,235,0.45)' }}>{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 px-3 pb-3 gap-y-0.5 flex-shrink-0">
              {celulas.map((dia, i) => {
                if (!dia) return <div key={i} />
                const ds     = toDataStr(dia)
                const evsDia = eventosNoDia(ds)
                const isHoje = ds === hojeStr
                const isSel  = ds === diaSel
                const temCf  = evsDia.length > 1 && evsDia.some(a => evsDia.some(b => conflita(a, b)))
                return (
                  <button key={i} onClick={() => setDiaSel(ds)}
                    className="flex flex-col items-center py-1 rounded-xl transition-all"
                    style={{
                      background: isSel ? '#1d4ed8' : isHoje ? 'rgba(37,99,235,0.16)' : 'transparent',
                      color:      isSel ? '#fff'    : isHoje ? '#1d4ed8' : 'rgba(235,240,255,0.92)',
                    }}>
                    <span className="font-semibold" style={{ fontSize: 12 }}>{dia}</span>
                    <div className="flex gap-0.5 mt-0.5 min-h-[6px]">
                      {evsDia.slice(0, 3).map(e => (
                        <div key={e.id} className="w-1 h-1 rounded-full"
                          style={{ background: isSel ? 'rgba(255,255,255,0.8)' : e.cor }} />
                      ))}
                      {temCf && !isSel && <div className="w-1 h-1 rounded-full" style={{ background: '#f59e0b' }} />}
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* Month view — lista de todos os eventos do mês */}
        {viewMode === 'mes' && (
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {(() => {
              const eventosMes = eventos.filter(e => {
                if (categoriaFiltro !== 'todas' && e.categoria !== categoriaFiltro) return false
                return (e.dataInicio || '').startsWith(`${ano}-${String(mes + 1).padStart(2, '0')}`)
              }).sort((a, b) => a.dataInicio.localeCompare(b.dataInicio) || toMin(a.horaInicio) - toMin(b.horaInicio))

              if (eventosMes.length === 0) {
                return (
                  <div className="text-center py-12">
                    <CalendarDays size={32} style={{ color: 'rgba(203,213,235,0.40)', marginBottom: 8 }} />
                    <p className="txt-3" style={{ fontSize: 12 }}>Nenhum evento este mês</p>
                  </div>
                )
              }

              return eventosMes.map(ev => {
                const cat = CATEGORIAS.find(c => c.id === ev.categoria) || CATEGORIAS[5]
                return (
                  <div key={ev.id} className="rounded-xl p-3 flex items-center gap-3"
                    style={{ background: 'var(--bg-surface)', border: '1.5px solid rgba(255,255,255,0.07)' }}>
                    <div className="w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0"
                      style={{ background: cat.cor + '15', border: `1.5px solid ${cat.cor}30` }}>
                      <span className="font-bold" style={{ fontSize: 14, color: cat.cor }}>
                        {new Date(ev.dataInicio + 'T12:00').getDate()}
                      </span>
                      <span style={{ fontSize: 8, color: cat.cor + 'cc', textTransform: 'uppercase' }}>
                        {MESES[mes].slice(0, 3)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold txt-1 truncate" style={{ fontSize: 12 }}>{ev.titulo}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background: cat.cor + '15', color: cat.cor }}>
                          {cat.label}
                        </span>
                        <span className="txt-3" style={{ fontSize: 11 }}>{ev.horaInicio} – {ev.horaFim}</span>
                      </div>
                      {ev.local && <p className="txt-3 truncate mt-0.5" style={{ fontSize: 10 }}>📍 {ev.local}</p>}
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        )}

        {/* Botão "Hoje" — só na visão de dia */}
        {viewMode === 'dia' && (
          <div className="px-4 pb-4 mt-auto flex-shrink-0">
            <button onClick={() => { setDiaSel(hojeStr); setMes(hoje.getMonth()); setAno(hoje.getFullYear()) }}
              className="w-full py-2 rounded-2xl font-semibold transition-all"
              style={{ fontSize: 12, background: 'rgba(37,99,235,0.16)', color: '#1d4ed8', border: '1.5px solid #bfdbfe' }}>
              Ir para hoje
            </button>
          </div>
        )}
      </div>

      {/* ── Painel direito: Eventos do dia — só na visão de dia ───────────────── */}
      {viewMode === 'dia' && (
        <div className="flex-1 flex flex-col md:overflow-hidden">

        {/* Cabeçalho do dia */}
        <div className="flex-shrink-0 px-4 md:px-6 py-4 srf flex items-center justify-between gap-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="min-w-0">
            <h3 className="font-bold txt-1 capitalize truncate" style={{ fontSize: 16 }}>
              {new Date(diaSel + 'T12:00').toLocaleDateString('pt-BR', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </h3>
            <p style={{ fontSize: 12, color: 'rgba(203,213,235,0.45)', marginTop: 2 }}>
              {eventosDoDia.length === 0 ? 'Nenhum evento'
                : `${eventosDoDia.length} evento${eventosDoDia.length > 1 ? 's' : ''}`}
            </p>
          </div>
          <button onClick={abrirNovo}
            className="flex items-center gap-2 text-white font-bold px-3 sm:px-5 py-2.5 rounded-2xl transition-all flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)', fontSize: 13,
                     boxShadow: '0 4px 14px rgba(79,70,229,0.35)' }}>
            <Plus size={16} /> <span className="hidden sm:inline">Novo Evento</span>
          </button>
        </div>

        {/* Lista de eventos */}
        <div className="flex-1 overflow-y-auto px-3 md:px-6 py-5">
          {eventosDoDia.length === 0 ? (
            <div className="text-center py-24">
              <div className="w-20 h-20 rounded-3xl mx-auto mb-5 flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.07)' }}>
                <CalendarDays size={36} style={{ color: 'rgba(203,213,235,0.40)' }} />
              </div>
              <p className="font-bold txt-3" style={{ fontSize: 16 }}>Nenhum evento neste dia</p>
              <p style={{ fontSize: 13, color: 'rgba(203,213,235,0.45)', marginTop: 6 }}>Clique em "Novo Evento" para adicionar</p>
            </div>
          ) : (
            <div className="space-y-3 max-w-3xl mx-auto">
              {eventosDoDia.map(ev => {
                const cfs       = getConflitos(ev)
                const repHoje   = repDoDia(ev, diaSel)
                const multiDia  = ev.dataFim && ev.dataFim !== ev.dataInicio
                return (
                  <div key={ev.id} className="rounded-2xl overflow-hidden"
                    style={{ background: 'var(--bg-surface)', border: `1.5px solid ${ev.cor}30`,
                             borderLeft: `5px solid ${ev.cor}`, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

                    {/* Banner conflito */}
                    {cfs.length > 0 && (
                      <div className="flex items-center gap-2 px-4 py-2"
                        style={{ background: 'rgba(245,158,11,0.12)', borderBottom: '1px solid rgba(245,158,11,0.30)' }}>
                        <AlertTriangle size={13} style={{ color: '#d97706', flexShrink: 0 }} />
                        <p style={{ fontSize: 11, color: '#fcd34d' }}>
                          <strong>Conflito</strong> com:{' '}
                          {cfs.map(e => `${e.titulo} (${e.horaInicio}–${e.horaFim})`).join(', ')}
                        </p>
                      </div>
                    )}

                    <div className="px-4 py-3">
                      {/* Título + período + ações */}
                      <div className="flex items-start justify-between gap-2 mb-2.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: ev.cor, boxShadow: `0 1px 4px ${ev.cor}88` }} />
                            <h4 className="font-bold txt-1" style={{ fontSize: 15 }}>{ev.titulo}</h4>
                          </div>
                          {multiDia && (
                            <span className="ml-5 font-semibold rounded-full px-2 py-0.5 inline-block mt-1"
                              style={{ fontSize: 10, background: `${ev.cor}18`, color: ev.cor }}>
                              {labelPeriodo(ev)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => abrirEditar(ev)}
                            className="p-1.5 rounded-xl hov-srf transition-colors">
                            <Pencil size={13} style={{ color: 'rgba(203,213,235,0.60)' }} />
                          </button>
                          <button onClick={() => excluir(ev.id)}
                            className="p-1.5 rounded-xl hover:bg-red-50 transition-colors">
                            <Trash2 size={13} style={{ color: '#f87171' }} />
                          </button>
                        </div>
                      </div>

                      {/* Detalhes */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                        <InfoRow icon={<Clock size={12}/>}  cor={ev.cor} text={`${ev.horaInicio} – ${ev.horaFim}`} />
                        {ev.local       && <InfoRow icon={<MapPin size={12}/>} cor={ev.cor} text={ev.local} />}
                        {repHoje        && <InfoRow icon={<User size={12}/>}   cor={ev.cor} text={repHoje} />}
                        {ev.indicadoPor && <InfoRow icon={<Users size={12}/>}  cor={ev.cor} text={`Ind. por ${ev.indicadoPor}`} />}
                        {ev.contato     && <InfoRow icon={<Phone size={12}/>}  cor={ev.cor} text={ev.contato} />}
                      </div>

                      {/* Todos representantes (multi-dia) */}
                      {multiDia && ev.representantes?.some(r => r.nome) && (
                        <div className="mt-2.5 pt-2.5 space-y-1" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                          <p className="font-bold txt-3 mb-1" style={{ fontSize: 10 }}>REPRESENTANTES POR DIA</p>
                          {ev.representantes.filter(r => r.nome).map(r => (
                            <div key={r.data} className="flex items-center gap-2">
                              <span className="font-mono rounded-lg px-1.5 py-0.5 flex-shrink-0"
                                style={{ fontSize: 10, background: `${ev.cor}18`, color: ev.cor }}>
                                {new Date(r.data + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                              </span>
                              <span style={{ fontSize: 12, color: 'rgba(203,213,235,0.62)' }}>{r.nome}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {ev.observacoes && (
                        <p className="mt-2.5 italic"
                          style={{ fontSize: 11, color: 'rgba(203,213,235,0.45)', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 8 }}>
                          {ev.observacoes}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      )}

      {/* ── Modal Novo / Editar ────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-lg rounded-3xl overflow-hidden"
            style={{ background: 'var(--bg-surface)', boxShadow: '0 24px 80px rgba(0,0,0,0.28)' }}>

            {/* Cabeçalho do modal */}
            <div className="flex items-center justify-between px-6 py-4"
              style={{ background: 'linear-gradient(135deg,#1e3a8a,#1e40af)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.18)' }}>
                  <CalendarDays size={17} className="text-white" />
                </div>
                <h3 className="font-bold text-white" style={{ fontSize: 15 }}>
                  {modal === 'novo' ? 'Novo Evento' : 'Editar Evento'}
                </h3>
              </div>
              <button onClick={fechar} className="p-1.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                <X size={16} />
              </button>
            </div>

            {/* Aviso de conflito */}
            {cfAviso.length > 0 && (
              <div className="flex items-start gap-3 px-5 py-3"
                style={{ background: 'rgba(245,158,11,0.12)', borderBottom: '1.5px solid rgba(245,158,11,0.30)' }}>
                <AlertTriangle size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p className="font-bold" style={{ fontSize: 12, color: '#fcd34d' }}>Conflito de horário!</p>
                  <p style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>
                    Conflita com: <strong>{cfAviso.map(e => `${e.titulo} (${e.horaInicio}–${e.horaFim})`).join(', ')}</strong>.
                    Clique em "Salvar mesmo assim" para confirmar.
                  </p>
                </div>
              </div>
            )}

            {/* Corpo do formulário */}
            <div className="px-6 py-4 space-y-3.5 overflow-y-auto" style={{ maxHeight: '60vh' }}>

              {/* Título + cor */}
              <div className="flex gap-3 items-end">
                <Field label="Título *">
                  <input value={form.titulo}
                    onChange={e => { updForm('titulo', e.target.value); setCfAviso([]) }}
                    placeholder="Ex: Visita à AD Garcia"
                    className={INPUT_CLS} style={INPUT_STY} />
                </Field>
                <div>
                  <label className="block font-semibold mb-1" style={{ fontSize: 11, color: 'rgba(203,213,235,0.60)', textTransform: 'capitalize' }}>Cor</label>
                  <div className="flex flex-wrap gap-1" style={{ width: 88 }}>
                    {CORES_EVENTO.map(c => (
                      <button key={c} onClick={() => updForm('cor', c)} className="rounded-lg transition-all"
                        style={{ width: 22, height: 22, backgroundColor: c,
                                 transform: form.cor === c ? 'scale(1.35)' : 'scale(1)',
                                 outline: form.cor === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Categoria */}
              <Field label="Categoria">
                <select
                  value={form.categoria}
                  onChange={e => updForm('categoria', e.target.value)}
                  className={INPUT_CLS} style={INPUT_STY}
                >
                  {CATEGORIAS.map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </Field>

              {/* Datas de início e fim + horários */}
              <div className="grid grid-cols-2 gap-2">
                <Field label="Data de início *">
                  <input type="date" value={form.dataInicio}
                    onChange={e => {
                      const di = e.target.value
                      const df = form.dataFim && form.dataFim >= di ? form.dataFim : di
                      const reps = syncRepresentantes(di, df, form.representantes)
                      setForm(p => ({ ...p, dataInicio: di, dataFim: df, representantes: reps }))
                      setCfAviso([])
                    }}
                    className={INPUT_CLS} style={{ ...INPUT_STY, fontSize: 12 }} />
                </Field>
                <Field label="Data de fim *">
                  <input type="date" value={form.dataFim}
                    min={form.dataInicio}
                    onChange={e => {
                      const df = e.target.value
                      const reps = syncRepresentantes(form.dataInicio, df, form.representantes)
                      setForm(p => ({ ...p, dataFim: df, representantes: reps }))
                      setCfAviso([])
                    }}
                    className={INPUT_CLS} style={{ ...INPUT_STY, fontSize: 12 }} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Horário de início *">
                  <input type="time" value={form.horaInicio}
                    onChange={e => { updForm('horaInicio', e.target.value); setCfAviso([]) }}
                    className={INPUT_CLS} style={{ ...INPUT_STY, fontSize: 12 }} />
                </Field>
                <Field label="Horário de fim *">
                  <input type="time" value={form.horaFim}
                    onChange={e => { updForm('horaFim', e.target.value); setCfAviso([]) }}
                    className={INPUT_CLS} style={{ ...INPUT_STY, fontSize: 12 }} />
                </Field>
              </div>

              {/* Local — autocomplete */}
              <div>
                <label className="block font-semibold mb-1" style={{ fontSize: 11, color: 'rgba(203,213,235,0.60)' }}>Local</label>
                <div className="relative" ref={localRef}>
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: 'rgba(203,213,235,0.45)' }} />
                    <input value={localQuery}
                      onChange={e => { setLocalQuery(e.target.value); updForm('local', e.target.value); setLocalFocus(true) }}
                      onFocus={() => setLocalFocus(true)}
                      onBlur={() => setTimeout(() => setLocalFocus(false), 150)}
                      placeholder="Busque pelo nome da igreja ou endereço…"
                      className={INPUT_CLS} style={{ ...INPUT_STY, paddingLeft: 32 }} />
                    {localQuery && (
                      <button type="button" onClick={() => { setLocalQuery(''); updForm('local', '') }}
                        className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(203,213,235,0.45)' }}>
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  {localFocus && localSugestoes.length > 0 && (
                    <div className="absolute z-50 left-0 right-0 mt-1 rounded-2xl overflow-hidden"
                      style={{ background: 'var(--bg-surface)', border: '1.5px solid rgba(255,255,255,0.12)',
                               boxShadow: '0 8px 32px rgba(0,0,0,0.14)', maxHeight: 220, overflowY: 'auto' }}>
                      {localSugestoes.map(ig => (
                        <button key={ig.id} type="button" onMouseDown={() => selecionarLocal(ig)}
                          className="w-full flex items-start gap-3 px-4 py-2.5 text-left hov-srf transition-colors">
                          <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ background: 'rgba(37,99,235,0.16)' }}>
                            <Church size={13} style={{ color: '#1d4ed8' }} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold txt-1 truncate" style={{ fontSize: 12 }}>{ig.nome}</p>
                            <p className="txt-3 truncate" style={{ fontSize: 10 }}>{ig.endereco}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {localFocus && localQuery.length >= 1 && localSugestoes.length === 0 && (
                    <div className="absolute z-50 left-0 right-0 mt-1 rounded-2xl overflow-hidden"
                      style={{ background: 'var(--bg-surface)', border: '1.5px solid rgba(255,255,255,0.12)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
                      <button type="button" onMouseDown={() => { updForm('local', localQuery); setLocalFocus(false) }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hov-srf transition-colors">
                        <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: 'rgba(16,185,129,0.12)' }}>
                          <MapPin size={13} style={{ color: '#059669' }} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold txt-2 truncate" style={{ fontSize: 12 }}>Usar como local personalizado</p>
                          <p className="txt-3 truncate" style={{ fontSize: 10 }}>{localQuery}</p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Representantes por dia */}
              <div>
                <label className="block font-semibold mb-2" style={{ fontSize: 11, color: 'rgba(203,213,235,0.60)', textTransform: 'capitalize' }}>
                  {form.dataFim && form.dataFim !== form.dataInicio
                    ? 'Representantes por dia'
                    : 'Representante'}
                </label>
                <div className="space-y-1.5 rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.07)' }}>
                  {form.representantes.map((rep, idx) => {
                    const labelData = rep.data
                      ? new Date(rep.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
                      : '—'
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        {form.dataFim && form.dataFim !== form.dataInicio && (
                          <span className="font-mono font-bold rounded-xl px-2 py-1.5 flex-shrink-0 text-center"
                            style={{ fontSize: 10, background: `${form.cor}18`, color: form.cor, minWidth: 72 }}>
                            {labelData}
                          </span>
                        )}
                        <div className="relative flex-1">
                          <input
                            value={rep.nome}
                            onChange={e => {
                              const reps = form.representantes.map((r, i) =>
                                i === idx ? { ...r, nome: e.target.value } : r
                              )
                              updForm('representantes', reps)
                              setRepFocusIdx(idx)
                            }}
                            onFocus={() => setRepFocusIdx(idx)}
                            onBlur={() => setTimeout(() => setRepFocusIdx(null), 150)}
                            placeholder="Quem vai representar"
                            className={INPUT_CLS} style={{ ...INPUT_STY, fontSize: 12 }} />
                          {repFocusIdx === idx && membrosEquipe.length > 0 && (() => {
                            const q = rep.nome.toLowerCase()
                            const filtrados = membrosEquipe.filter(m =>
                              !q || m.nome.toLowerCase().includes(q)
                            )
                            if (!filtrados.length) return null
                            return (
                              <div className="absolute z-50 left-0 right-0 mt-1 rounded-xl overflow-hidden"
                                style={{ background:'var(--bg-overlay)', border:'1px solid rgba(255,255,255,0.12)', boxShadow:'0 8px 32px rgba(0,0,0,0.55)', top:'100%' }}>
                                {filtrados.slice(0, 8).map(m => (
                                  <button key={m.id} type="button"
                                    onMouseDown={() => {
                                      const reps = form.representantes.map((r, i) =>
                                        i === idx ? { ...r, nome: m.nome } : r
                                      )
                                      updForm('representantes', reps)
                                      setRepFocusIdx(null)
                                    }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hov-srf transition-colors">
                                    <div className="w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-white font-bold"
                                      style={{ fontSize: 9, background: `hsl(${(m.id.charCodeAt(0) * 37) % 360},55%,45%)` }}>
                                      {m.nome.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold txt-1 truncate">{m.nome}</p>
                                      <p className="txt-3 truncate" style={{fontSize:10}}>{m.cargo}</p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Indicado por + Contato */}
              <div className="grid grid-cols-2 gap-2">
                <Field label="Indicado por">
                  <input value={form.indicadoPor} onChange={e => updForm('indicadoPor', e.target.value)}
                    placeholder="Quem indicou"
                    className={INPUT_CLS} style={{ ...INPUT_STY, fontSize: 12 }} />
                </Field>
                <Field label="Contato">
                  <input value={form.contato} onChange={e => updForm('contato', e.target.value)}
                    placeholder="Telefone / WhatsApp"
                    className={INPUT_CLS} style={{ ...INPUT_STY, fontSize: 12 }} />
                </Field>
              </div>

              {/* Observações */}
              <Field label="Observações">
                <textarea value={form.observacoes} onChange={e => updForm('observacoes', e.target.value)}
                  placeholder="Notas adicionais…" rows={2}
                  className={`${INPUT_CLS} resize-none`} style={{ ...INPUT_STY, fontSize: 12 }} />
              </Field>
            </div>

            {/* Rodapé do modal */}
            <div className="px-6 py-4 flex gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <button onClick={fechar} className="px-5 py-2.5 rounded-2xl font-semibold transition-all"
                style={{ border: '1.5px solid rgba(255,255,255,0.12)', color: 'rgba(203,213,235,0.60)', fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={salvar}
                disabled={!form.titulo.trim() || !form.dataInicio || !form.horaInicio || !form.horaFim}
                className="flex-1 py-2.5 rounded-2xl font-bold text-white transition-all disabled:opacity-50"
                style={{
                  background: cfAviso.length > 0
                    ? 'linear-gradient(135deg,#d97706,#f59e0b)'
                    : 'linear-gradient(135deg,#1d4ed8,#1e4fd6)',
                  fontSize: 13,
                  boxShadow: cfAviso.length > 0
                    ? '0 4px 14px rgba(217,119,6,0.35)'
                    : '0 4px 14px rgba(79,70,229,0.35)',
                }}>
                {cfAviso.length > 0 ? '⚠ Salvar mesmo assim' : 'Salvar Evento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Compartilhar Agenda ─────────────────────── */}
      {modalShare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(7,10,18,0.75)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-md rounded-3xl overflow-hidden"
            style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4"
              style={{ background: 'linear-gradient(135deg,#1e3a8a,#1e40af)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.18)' }}>
                  <Share2 size={16} className="text-white" />
                </div>
                <h3 className="font-bold text-white" style={{ fontSize: 15 }}>Compartilhar Agenda</h3>
              </div>
              <button onClick={() => setModalShare(false)} className="p-1.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                <X size={16} />
              </button>
            </div>

            {/* Corpo */}
            <div className="px-6 py-5 space-y-4">

              {/* Título personalizado */}
              <div>
                <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Título da agenda</label>
                <input value={shareTitulo} onChange={e => setShareTitulo(e.target.value)}
                  placeholder="Ex: Agenda Semana — Equipe Norte"
                  className={INPUT_CLS} style={{ ...INPUT_STY }} />
              </div>

              {/* Membro */}
              <div>
                <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  Membro da equipe <span style={{ color: 'var(--text-faint)' }}>(opcional)</span>
                </label>
                <select value={shareMembro} onChange={e => setShareMembro(e.target.value)}
                  className={INPUT_CLS} style={{ ...INPUT_STY, background: 'var(--bg-raised)' }}>
                  <option value="">— Acesso geral (qualquer um com o link) —</option>
                  {membrosEquipe.map(m => (
                    <option key={m.id} value={m.id}>{m.nome} — {m.cargo}</option>
                  ))}
                </select>
              </div>

              {/* Categorias */}
              <div>
                <label className="block font-semibold mb-2" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Categorias visíveis</label>
                <div className="flex flex-wrap gap-1.5">
                  {[{ id: 'todas', label: 'Todas', cor: 'var(--accent-bright)' }, ...CATEGORIAS].map(cat => {
                    const sel = shareCats.includes(cat.id)
                    return (
                      <button key={cat.id} type="button"
                        onClick={() => {
                          if (cat.id === 'todas') { setShareCats(['todas']); return }
                          const sem = shareCats.filter(c => c !== 'todas')
                          setShareCats(sel ? (sem.filter(c => c !== cat.id) || ['todas']) : [...sem, cat.id])
                        }}
                        className="px-2.5 py-1 rounded-lg font-semibold transition-all"
                        style={{
                          fontSize: 11,
                          background: sel ? `${cat.cor}22` : 'rgba(255,255,255,0.06)',
                          color:      sel ? cat.cor        : 'rgba(203,213,235,0.50)',
                          border:     `1.5px solid ${sel ? cat.cor + '55' : 'rgba(255,255,255,0.08)'}`,
                        }}>
                        {cat.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Pode marcar */}
              <div className="flex items-center justify-between rounded-2xl px-4 py-3"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div>
                  <p className="font-semibold txt-1" style={{ fontSize: 13 }}>Pode adicionar eventos</p>
                  <p className="txt-3" style={{ fontSize: 11 }}>O membro poderá criar eventos na agenda dele</p>
                </div>
                <button onClick={() => setSharePode(p => !p)}
                  className="relative rounded-full flex-shrink-0 transition-all"
                  style={{ width: 42, height: 24, background: sharePode ? '#1d4ed8' : 'rgba(255,255,255,0.12)' }}>
                  <div className="absolute top-1 rounded-full transition-all"
                    style={{ width: 16, height: 16, background: '#fff', left: sharePode ? 22 : 4, boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
                </button>
              </div>

              {/* Info */}
              <p className="txt-3 rounded-xl px-3 py-2" style={{ fontSize: 11, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)', color: '#fbbf24' }}>
                O link inclui eventos futuros das categorias selecionadas. Gere um novo link sempre que a agenda mudar.
              </p>

              {/* Gerar link */}
              <button onClick={gerarLink}
                className="w-full py-3 rounded-2xl font-bold text-white transition-all"
                style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', fontSize: 14, boxShadow: '0 4px 16px rgba(29,78,216,0.4)' }}>
                Gerar Link
              </button>

              {/* Link gerado */}
              {linkGerado && (
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(16,185,129,0.25)', background: 'rgba(16,185,129,0.07)' }}>
                  <div className="px-3 pt-3 pb-2">
                    <p className="font-semibold mb-1.5" style={{ fontSize: 11, color: '#34d399' }}>✓ Link gerado com sucesso!</p>
                    <p className="break-all font-mono" style={{ fontSize: 10, color: 'rgba(203,213,235,0.55)', wordBreak:'break-all' }}>
                      {linkGerado.slice(0, 80)}…
                    </p>
                  </div>
                  <button onClick={copiarLink}
                    className="w-full flex items-center justify-center gap-2 py-2.5 font-bold transition-all"
                    style={{ fontSize: 13, background: copiado ? 'rgba(16,185,129,0.20)' : 'rgba(255,255,255,0.06)', color: copiado ? '#34d399' : 'rgba(203,213,235,0.80)', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                    {copiado ? <><Check size={13} /> Copiado!</> : <><Copy size={13} /> Copiar link</>}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
