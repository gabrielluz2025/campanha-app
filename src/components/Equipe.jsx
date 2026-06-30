import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Users, Plus, X, Pencil, Trash2, Phone, Mail,
  MapPin, Briefcase, Search, UserCheck, CheckCircle,
  Clock, AlertCircle, ListTodo, History, Target,
  DollarSign, CalendarDays, FileText, SlidersHorizontal,
} from 'lucide-react'
import { confirmAction } from '../utils/confirm'
import { BAIRROS_BLUMENAU } from '../utils/constants'

const STORAGE_KEY = 'equipe_membros'
const STORAGE_KEY_TAREFAS = 'equipe_tarefas'
const STORAGE_KEY_LOG = 'equipe_log'

const STATUS_TAREFA = [
  { id: 'pendente', label: 'Pendente', cor: '#f59e0b' },
  { id: 'em_andamento', label: 'Em Andamento', cor: '#3b82f6' },
  { id: 'concluida', label: 'Concluída', cor: '#10b981' },
  { id: 'cancelada', label: 'Cancelada', cor: '#ef4444' },
]

const CARGOS = [
  'Coordenador', 'Cabo Eleitoral', 'Voluntário',
  'Assessor', 'Motorista', 'Secretária', 'Comunicação', 'Outro',
]

const CARGO_CORES = {
  'Coordenador':    '#1d4ed8',
  'Cabo Eleitoral': '#0891b2',
  'Voluntário':     '#059669',
  'Assessor':       '#d97706',
  'Motorista':      '#0891b2',
  'Secretária':     '#db2777',
  'Comunicação':    '#dc2626',
  'Outro':          'rgba(203,213,235,0.60)',
}

const PALETA_AVATAR = [
  '#3b82f6','#06b6d4','#ec4899','#f97316',
  '#10b981','#06b6d4','#f59e0b','#ef4444','#2563eb','#84cc16',
]

const FORM_VAZIO = {
  nome: '', cargo: 'Voluntário', telefone: '', email: '', bairros: [], observacoes: '', foto: '',
  fotoX: 50, fotoY: 50,
  vinculo: 'Voluntário', salario: '', dataInicio: '', contrato: '',
}

const TAREFA_VAZIA = {
  titulo: '', descricao: '', status: 'pendente', prioridade: 'media', prazo: '',
}

const VINCULOS = [
  'Voluntário', 'CLT', 'PJ', 'Autônomo', 'Estagiário', 'Comissionado', 'Outro',
]

const VINCULO_CORES = {
  'Voluntário':   '#6366f1',
  'CLT':          '#10b981',
  'PJ':           '#f59e0b',
  'Autônomo':     '#06b6d4',
  'Estagiário':   '#ec4899',
  'Comissionado': '#f97316',
  'Outro':        'rgba(203,213,235,0.55)',
}

const PRIORIDADES = [
  { id: 'baixa', label: 'Baixa', cor: 'rgba(203,213,235,0.60)' },
  { id: 'media', label: 'Média', cor: '#f59e0b' },
  { id: 'alta', label: 'Alta', cor: '#ef4444' },
]

const INPUT_CLS = 'input-dark w-full px-3 py-2'
const INPUT_STY = { fontSize: 13 }

function uid()         { return Date.now().toString(36) + Math.random().toString(36).slice(2) }
function initials(n)   { return n.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?' }
function avatarCor(id) { return PALETA_AVATAR[parseInt(id.slice(-4), 36) % PALETA_AVATAR.length] }
function toTitleCase(s){ return s.replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()) }
function formatTel(v)  {
  const d = (v||'').replace(/\D/g,'').slice(0,11)
  if (d.length <=  2) return d
  if (d.length <=  6) return `(${d.slice(0,2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`
}
function fmtSalario(v) {
  if (!v) return ''
  return `R$ ${parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 })}`
}

export default function Equipe() {
  const [membros, setMembros]   = useState(() => JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'))
  const [tarefas, setTarefas]   = useState(() => JSON.parse(localStorage.getItem(STORAGE_KEY_TAREFAS) || '[]'))
  const [log, setLog]           = useState(() => JSON.parse(localStorage.getItem(STORAGE_KEY_LOG) || '[]'))
  const [modal, setModal]       = useState(null)   // null | 'novo' | id | 'tarefa_novo' | 'tarefa_id'
  const [form, setForm]         = useState(FORM_VAZIO)
  const [tarefaForm, setTarefaForm] = useState(TAREFA_VAZIA)
  const [filtro, setFiltro]     = useState('Todos')
  const [busca, setBusca]       = useState('')
  const [aba, setAba]           = useState('membros') // 'membros' | 'tarefas' | 'log'
  const [bairroOpen,   setBairroOpen]   = useState(false)
  const [bairroBusca,  setBairroBusca]  = useState('')
  const fotoInputRef = useRef(null)
  const [fotoRaw,      setFotoRaw]      = useState('')
  const [ajusteX,      setAjusteX]      = useState(50)
  const [ajusteY,      setAjusteY]      = useState(50)
  const [modalAjuste,  setModalAjuste]  = useState(false)

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(membros)) }, [membros])
  useEffect(() => { localStorage.setItem(STORAGE_KEY_TAREFAS, JSON.stringify(tarefas)) }, [tarefas])
  useEffect(() => { localStorage.setItem(STORAGE_KEY_LOG, JSON.stringify(log)) }, [log])

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const updTarefa = (k, v) => setTarefaForm(p => ({ ...p, [k]: v }))

  function abrirNovo()  { setForm(FORM_VAZIO); setModal('novo') }
  function abrirEditar(m) {
    const bairros = Array.isArray(m.bairros) ? m.bairros
      : (m.bairro ? m.bairro.split(',').map(b => b.trim()).filter(Boolean) : [])
    setForm({ ...m, bairros })
    setModal(m.id)
  }
  function abrirNovaTarefa() { setTarefaForm(TAREFA_VAZIA); setModal('tarefa_novo') }
  function fechar()     { setModal(null); setBairroOpen(false); setBairroBusca('') }

  function adicionarLog(tipo, mensagem, dados = {}) {
    const entrada = {
      id: uid(),
      tipo,
      mensagem,
      dados,
      timestamp: new Date().toISOString(),
    }
    setLog(p => [entrada, ...p].slice(0, 100)) // manter últimas 100 entradas
  }

  function salvar() {
    if (!form.nome.trim()) return
    const nomeFinal = toTitleCase(form.nome.trim())
    const dados = { ...form, nome: nomeFinal }
    if (modal === 'novo') {
      const novo = { ...dados, id: uid() }
      setMembros(p => [...p, novo])
      adicionarLog('membro_criado', `Novo membro adicionado: ${nomeFinal}`, { nome: nomeFinal, cargo: form.cargo })
    } else {
      setMembros(p => p.map(m => m.id === modal ? { ...dados, id: m.id } : m))
      adicionarLog('membro_editado', `Membro editado: ${nomeFinal}`, { nome: nomeFinal, cargo: form.cargo })
    }
    fechar()
  }

  function handleFotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      setFotoRaw(ev.target.result)
      setAjusteX(50); setAjusteY(50)
      setModalAjuste(true)
    }
    reader.readAsDataURL(file)
  }

  function confirmarAjuste() {
    upd('foto',  fotoRaw)
    upd('fotoX', ajusteX)
    upd('fotoY', ajusteY)
    setModalAjuste(false)
  }

  function salvarTarefa() {
    if (!tarefaForm.titulo.trim()) return
    const taskId = modal.startsWith('tarefa_') ? modal.replace('tarefa_', '') : null
    if (modal === 'tarefa_novo') {
      const nova = { ...tarefaForm, id: uid() }
      setTarefas(p => [...p, nova])
      adicionarLog('tarefa_criada', `Nova tarefa criada: ${tarefaForm.titulo}`, { titulo: tarefaForm.titulo, prioridade: tarefaForm.prioridade })
    } else if (taskId) {
      setTarefas(p => p.map(t => t.id === taskId ? { ...tarefaForm, id: t.id } : t))
      adicionarLog('tarefa_editada', `Tarefa editada: ${tarefaForm.titulo}`, { titulo: tarefaForm.titulo, status: tarefaForm.status })
    }
    fechar()
  }

  async function excluirMembro(id) {
    const m = membros.find(x => x.id === id)
    if (!m) return
    const ok = await confirmAction({
      title: 'Remover membro',
      message: `Remover ${m.nome} da equipe? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Remover',
    })
    if (!ok) return
    setMembros(p => p.filter(x => x.id !== id))
    adicionarLog('membro_excluido', `Membro excluído: ${m.nome}`, { nome: m.nome })
  }

  async function excluirTarefa(id) {
    const t = tarefas.find(x => x.id === id)
    if (!t) return
    const ok = await confirmAction({
      title: 'Remover tarefa',
      message: `Remover a tarefa "${t.titulo}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Remover',
    })
    if (!ok) return
    setTarefas(p => p.filter(x => x.id !== id))
    adicionarLog('tarefa_excluida', `Tarefa excluída: ${t.titulo}`, { titulo: t.titulo })
  }

  const cargosAtivos = useMemo(() =>
    ['Todos', ...CARGOS.filter(c => membros.some(m => m.cargo === c))], [membros])

  const membrosFiltrados = useMemo(() => {
    return membros.filter(m => {
      if (filtro !== 'Todos' && m.cargo !== filtro) return false
      if (busca) {
        const q = busca.toLowerCase()
        return m.nome.toLowerCase().includes(q) ||
               (Array.isArray(m.bairros) ? m.bairros.join(', ') : (m.bairro || '')).toLowerCase().includes(q) ||
               (m.telefone || '').includes(q)
      }
      return true
    })
  }, [membros, filtro, busca])

  const tarefasFiltradas = useMemo(() => {
    return tarefas.filter(t => {
      if (busca) {
        const q = busca.toLowerCase()
        return t.titulo.toLowerCase().includes(q) ||
               (t.descricao || '').toLowerCase().includes(q)
      }
      return true
    }).sort((a, b) => {
      // Ordenar por prioridade (alta > media > baixa) e depois por prazo
      const priOrder = { alta: 0, media: 1, baixa: 2 }
      if (priOrder[a.prioridade] !== priOrder[b.prioridade]) {
        return priOrder[a.prioridade] - priOrder[b.prioridade]
      }
      if (a.prazo && b.prazo) return new Date(a.prazo) - new Date(b.prazo)
      return 0
    })
  }, [tarefas, busca])

  const statsPorCargo = useMemo(() =>
    CARGOS.reduce((acc, c) => {
      const qtd = membros.filter(m => m.cargo === c).length
      if (qtd > 0) acc[c] = qtd
      return acc
    }, {}), [membros])

  return (
    <div className="flex-1 overflow-auto" >

      {/* ── Modal Membro ──────────────────────────────────── */}
      {modal && (modal === 'novo' || (typeof modal === 'string' && !modal.startsWith('tarefa_'))) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-md rounded-3xl overflow-hidden"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-soft)', boxShadow: 'var(--shadow-lg)' }}>

            {/* Header do modal */}
            <div className="flex items-center justify-between px-6 py-4"
              style={{ background: 'linear-gradient(135deg,#1e3a8a,#1e40af)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.18)' }}>
                  <Users size={17} className="text-white" />
                </div>
                <h3 className="font-bold text-white" style={{ fontSize: 15 }}>
                  {modal === 'novo' ? 'Novo Membro' : 'Editar Membro'}
                </h3>
              </div>
              <button onClick={fechar} className="p-1.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                <X size={16} />
              </button>
            </div>

            {/* Corpo */}
            <div className="px-6 py-4 space-y-3.5 overflow-y-auto" style={{ maxHeight: '62vh' }}>

              {/* Foto do membro */}
              <div className="flex flex-col items-center gap-2 pt-1 pb-1">
                <input ref={fotoInputRef} type="file" accept="image/*" className="hidden"
                  onChange={handleFotoChange} />
                <div className="relative">
                  <button type="button" onClick={() => fotoInputRef.current?.click()}
                    className="relative group rounded-2xl overflow-hidden"
                    style={{ width: 88, height: 88, flexShrink: 0 }}>
                    {form.foto
                      ? <img src={form.foto} alt="foto" className="w-full h-full object-cover"
                          style={{ objectPosition: `${form.fotoX??50}% ${form.fotoY??50}%` }} />
                      : <div className="w-full h-full flex items-center justify-center font-black text-white"
                          style={{ background: 'var(--bg-hover)', fontSize: 24 }}>
                          {form.nome ? initials(form.nome) : '?'}
                        </div>
                    }
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'rgba(0,0,0,0.55)' }}>
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span style={{ fontSize: 9, color: '#fff', fontWeight: 600 }}>Trocar</span>
                    </div>
                  </button>
                  {form.foto && (
                    <button type="button" onClick={() => upd('foto', '')}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: '#ef4444', border: '2px solid var(--bg-surface)' }}>
                      <X size={9} className="text-white" />
                    </button>
                  )}
                </div>
                {form.foto && (
                  <button type="button" onClick={() => { setFotoRaw(form.foto); setAjusteX(form.fotoX??50); setAjusteY(form.fotoY??50); setModalAjuste(true) }}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition-all hov-srf"
                    style={{ fontSize: 11, color: 'var(--accent-bright)', border: '1px solid rgba(91,155,255,0.25)' }}>
                    <SlidersHorizontal size={10} /> Ajustar posição
                  </button>
                )}
              </div>

              <div>
                <label className="block font-semibold mb-1.5"
                  style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>Nome *</label>
                <input value={form.nome} onChange={e => upd('nome', e.target.value)}
                  onBlur={e => upd('nome', toTitleCase(e.target.value.trim()))}
                  placeholder="Nome completo" className={INPUT_CLS}
                  style={{ ...INPUT_STY, textTransform: 'capitalize' }} />
              </div>

              <div>
                <label className="block font-semibold mb-1.5"
                  style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>Cargo</label>
                <select value={form.cargo} onChange={e => upd('cargo', e.target.value)}
                  className={INPUT_CLS} style={{ ...INPUT_STY, background: 'var(--bg-raised)' }}>
                  {CARGOS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1.5"
                    style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>Telefone</label>
                  <input value={form.telefone} onChange={e => upd('telefone', formatTel(e.target.value))}
                    placeholder="(47) 9xxxx-xxxx" className={INPUT_CLS} style={INPUT_STY} />
                </div>
                <div>
                  <label className="block font-semibold mb-1.5"
                    style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>E-mail</label>
                  <input value={form.email} onChange={e => upd('email', e.target.value.toLowerCase())}
                    placeholder="email@exemplo.com" className={INPUT_CLS} style={INPUT_STY} />
                </div>
              </div>

              <div className="relative">
                <label className="block font-semibold mb-1.5"
                  style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>Bairro / Setor de atuação</label>
                <button type="button" onClick={() => { setBairroOpen(v => !v); setBairroBusca('') }}
                  className="w-full text-left px-3 py-2 rounded-xl flex items-center justify-between gap-2"
                  style={{ ...INPUT_STY, background: 'var(--bg-raised)', border: '1.5px solid rgba(255,255,255,0.12)', minHeight: 38 }}>
                  <span className="flex flex-wrap gap-1 flex-1 min-w-0">
                    {form.bairros.length === 0
                      ? <span style={{ color: 'var(--text-faint)' }}>Selecione os bairros...</span>
                      : form.bairros.length <= 3
                        ? form.bairros.map(b => (
                            <span key={b} className="px-1.5 py-0.5 rounded-md font-medium"
                              style={{ fontSize: 10, background: 'rgba(37,99,235,0.18)', color: '#93c5fd' }}>{b}</span>
                          ))
                        : <>
                            {form.bairros.slice(0,2).map(b => (
                              <span key={b} className="px-1.5 py-0.5 rounded-md font-medium"
                                style={{ fontSize: 10, background: 'rgba(37,99,235,0.18)', color: '#93c5fd' }}>{b}</span>
                            ))}
                            <span className="px-1.5 py-0.5 rounded-md"
                              style={{ fontSize: 10, background: 'rgba(37,99,235,0.12)', color: '#60a5fa' }}>+{form.bairros.length - 2} mais</span>
                          </>
                    }
                  </span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                    style={{ flexShrink:0, color:'rgba(203,213,235,0.45)', transform: bairroOpen ? 'rotate(180deg)' : '', transition:'transform .15s' }}>
                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {bairroOpen && (
                  <div className="absolute z-50 left-0 right-0 mt-1 rounded-xl overflow-hidden"
                    style={{ background:'var(--bg-overlay)', border:'1px solid rgba(255,255,255,0.12)', boxShadow:'0 8px 32px rgba(0,0,0,0.55)', top:'100%' }}>
                    <div className="p-2" style={{ borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
                      <input autoFocus value={bairroBusca} onChange={e => setBairroBusca(e.target.value)}
                        placeholder="Buscar bairro..." className="w-full bg-transparent outline-none text-xs px-2 py-1"
                        style={{ color:'var(--text-primary)' }} />
                    </div>
                    <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
                      {form.bairros.length > 0 && (
                        <button type="button" onClick={() => upd('bairros', [])}
                          className="w-full text-left px-3 py-1.5 text-xs hov-srf transition-colors"
                          style={{ color:'#f87171', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
                          Limpar seleção
                        </button>
                      )}
                      {BAIRROS_BLUMENAU.filter(b => !bairroBusca || b.toLowerCase().includes(bairroBusca.toLowerCase())).map(b => {
                        const sel = form.bairros.includes(b)
                        return (
                          <button key={b} type="button"
                            onClick={() => upd('bairros', sel ? form.bairros.filter(x => x !== b) : [...form.bairros, b])}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-left hov-srf transition-colors">
                            <div className="w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center"
                              style={{ background: sel ? '#2563eb' : 'transparent', border: sel ? '1.5px solid #2563eb' : '1.5px solid rgba(255,255,255,0.25)' }}>
                              {sel && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                            </div>
                            <span className="text-xs" style={{ color: sel ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: sel ? 600 : 400 }}>{b}</span>
                          </button>
                        )
                      })}
                    </div>
                    <div className="px-3 py-2 flex justify-between items-center"
                      style={{ borderTop:'1px solid rgba(255,255,255,0.07)', fontSize:11, color:'var(--text-tertiary)' }}>
                      <span>{form.bairros.length} selecionado{form.bairros.length !== 1 ? 's' : ''}</span>
                      <button type="button" onClick={() => setBairroOpen(false)}
                        className="font-bold" style={{ color:'var(--accent-bright)', fontSize:11 }}>Fechar</button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Vínculo e contrato ── */}
              <div className="rounded-2xl p-3 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="font-bold" style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Vínculo &amp; Remuneração</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Tipo de vínculo</label>
                    <select value={form.vinculo||'Voluntário'} onChange={e => upd('vinculo', e.target.value)}
                      className={INPUT_CLS} style={{ ...INPUT_STY, background: 'var(--bg-raised)' }}>
                      {VINCULOS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Remuneração (R$)</label>
                    <input type="number" min="0" step="0.01" value={form.salario} onChange={e => upd('salario', e.target.value)}
                      placeholder="0,00" className={INPUT_CLS} style={INPUT_STY} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Data de início</label>
                    <input type="date" value={form.dataInicio||''} onChange={e => upd('dataInicio', e.target.value)}
                      className={INPUT_CLS} style={{ ...INPUT_STY, colorScheme: 'dark' }} />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Nº do contrato</label>
                    <input value={form.contrato||''} onChange={e => upd('contrato', e.target.value)}
                      placeholder="Ex: CTR-2024-001" className={INPUT_CLS} style={INPUT_STY} />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1.5"
                  style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>Observações</label>
                <textarea value={form.observacoes} onChange={e => upd('observacoes', e.target.value)}
                  placeholder="Notas adicionais..." rows={2}
                  className={`${INPUT_CLS} resize-none`}
                  style={{ ...INPUT_STY, fontSize: 12 }} />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 flex gap-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button onClick={fechar} className="px-5 py-2.5 rounded-2xl font-semibold text-sm"
                style={{ border: '1px solid var(--border-soft)', color: 'var(--text-secondary)' }}>
                Cancelar
              </button>
              <button onClick={salvar} disabled={!form.nome.trim()}
                className="flex-1 py-2.5 rounded-2xl font-bold text-white text-sm disabled:opacity-40 transition-all"
                style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)',
                         boxShadow: '0 4px 14px rgba(79,70,229,0.35)' }}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Tarefa ─────────────────────────────────── */}
      {modal && (modal === 'tarefa_novo' || (typeof modal === 'string' && modal.startsWith('tarefa_'))) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-md rounded-3xl overflow-hidden"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-soft)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="flex items-center justify-between px-6 py-4"
              style={{ background: 'linear-gradient(135deg,#1e3a8a,#1e40af)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.18)' }}>
                  <ListTodo size={17} className="text-white" />
                </div>
                <h3 className="font-bold text-white" style={{ fontSize: 15 }}>
                  {modal === 'tarefa_novo' ? 'Nova Tarefa' : 'Editar Tarefa'}
                </h3>
              </div>
              <button onClick={fechar} className="p-1.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                <X size={16} />
              </button>
            </div>
            <div className="px-6 py-4 space-y-3.5 overflow-y-auto" style={{ maxHeight: '62vh' }}>
              <div>
                <label className="block font-semibold mb-1.5"
                  style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>Título *</label>
                <input value={tarefaForm.titulo} onChange={e => updTarefa('titulo', e.target.value)}
                  placeholder="Título da tarefa" className={INPUT_CLS} style={INPUT_STY} />
              </div>
              <div>
                <label className="block font-semibold mb-1.5"
                  style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>Descrição</label>
                <textarea value={tarefaForm.descricao} onChange={e => updTarefa('descricao', e.target.value)}
                  placeholder="Detalhes da tarefa" className={INPUT_CLS} style={{ ...INPUT_STY, minHeight: 80 }} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold mb-1.5"
                    style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>Status</label>
                  <select value={tarefaForm.status} onChange={e => updTarefa('status', e.target.value)}
                    className={INPUT_CLS} style={{ ...INPUT_STY, background: 'var(--bg-raised)' }}>
                    {STATUS_TAREFA.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1.5"
                    style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>Prioridade</label>
                  <select value={tarefaForm.prioridade} onChange={e => updTarefa('prioridade', e.target.value)}
                    className={INPUT_CLS} style={{ ...INPUT_STY, background: 'var(--bg-raised)' }}>
                    {PRIORIDADES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-semibold mb-1.5"
                  style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>Prazo</label>
                <input type="date" value={tarefaForm.prazo} onChange={e => updTarefa('prazo', e.target.value)}
                  className={INPUT_CLS} style={{ ...INPUT_STY, fontSize: 12 }} />
              </div>
            </div>
            <div className="px-6 py-4 flex gap-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button onClick={fechar} className="px-5 py-2.5 rounded-2xl font-semibold text-sm"
                style={{ border: '1px solid var(--border-soft)', color: 'var(--text-secondary)' }}>
                Cancelar
              </button>
              <button onClick={salvarTarefa} disabled={!tarefaForm.titulo.trim()}
                className="flex-1 py-2.5 rounded-2xl font-bold text-white text-sm disabled:opacity-40 transition-all"
                style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)',
                         boxShadow: '0 4px 14px rgba(79,70,229,0.35)' }}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hero Header ──────────────────────────────────── */}
      <div className="px-4 md:px-6 pt-7 pb-16"
        style={{ background: 'linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 60%,#1e40af 100%)' }}>
        <div className="max-w-7xl mx-auto">

          <div className="flex items-center justify-between mb-7">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.18)', width: 52, height: 52 }}>
                {aba === 'membros' ? <Users size={26} className="text-white" /> :
                 aba === 'tarefas' ? <ListTodo size={26} className="text-white" /> :
                 <History size={26} className="text-white" />}
              </div>
              <div>
                <h1 className="font-black text-white" style={{ fontSize: 24 }}>
                  {aba === 'membros' ? 'Equipe' : aba === 'tarefas' ? 'Tarefas' : 'Log de Atividade'}
                </h1>
                <p className="text-blue-200 mt-0.5" style={{ fontSize: 12 }}>
                  {aba === 'membros' ? `${membros.length} membro${membros.length !== 1 ? 's' : ''} cadastrado${membros.length !== 1 ? 's' : ''}` :
                   aba === 'tarefas' ? `${tarefas.length} tarefa${tarefas.length !== 1 ? 's' : ''}` :
                   `${log.length} registro${log.length !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
            {aba === 'membros' ? (
              <button onClick={abrirNovo}
                className="flex items-center gap-2 font-bold text-white px-5 py-2.5 rounded-2xl transition-all"
                style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', fontSize: 13 }}>
                <Plus size={16} /> Adicionar Membro
              </button>
            ) : aba === 'tarefas' ? (
              <button onClick={abrirNovaTarefa}
                className="flex items-center gap-2 font-bold text-white px-5 py-2.5 rounded-2xl transition-all"
                style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', fontSize: 13 }}>
                <Plus size={16} /> Nova Tarefa
              </button>
            ) : null}
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAba('membros')}
              className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
                aba === 'membros' ? 'text-white' : 'text-blue-200 hover:text-white'
              }`}
              style={{ background: aba === 'membros' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              Membros
            </button>
            <button
              type="button"
              onClick={() => setAba('tarefas')}
              className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
                aba === 'tarefas' ? 'text-white' : 'text-blue-200 hover:text-white'
              }`}
              style={{ background: aba === 'tarefas' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              Tarefas
            </button>
            <button
              type="button"
              onClick={() => setAba('log')}
              className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
                aba === 'log' ? 'text-white' : 'text-blue-200 hover:text-white'
              }`}
              style={{ background: aba === 'log' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              Log
            </button>
          </div>

          {/* Stats por cargo — só na aba membros */}
          {aba === 'membros' && Object.keys(statsPorCargo).length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(statsPorCargo).slice(0, 4).map(([cargo, qtd]) => {
                const cor = CARGO_CORES[cargo] || 'rgba(203,213,235,0.60)'
                return (
                  <div key={cargo} className="rounded-2xl px-4 py-3"
                    style={{ background: 'rgba(255,255,255,0.11)', border: '1px solid rgba(255,255,255,0.14)' }}>
                    <div className="w-6 h-6 rounded-lg mb-2 flex items-center justify-center"
                      style={{ backgroundColor: cor + '44' }}>
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cor }} />
                    </div>
                    <p className="font-black text-white" style={{ fontSize: 26 }}>{qtd}</p>
                    <p className="text-blue-200" style={{ fontSize: 10 }}>{cargo}</p>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-2xl px-5 py-4 text-center"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.14)' }}>
              <p className="text-blue-200" style={{ fontSize: 13 }}>
                Nenhum membro ainda — clique em <strong className="text-white">Adicionar Membro</strong> para começar
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 pb-10 -mt-10 space-y-5">

        {/* ABA: MEMBROS */}
        {aba === 'membros' && (
          <>
            {/* Barra de busca + filtros de cargo */}
            <div className="rounded-3xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--text-tertiary)' }} />
                  <input value={busca} onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar por nome ou bairro…"
                    className="input-dark w-full pl-9 pr-3 py-2"
                    style={{ fontSize: 13 }} />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {cargosAtivos.map(c => (
                    <button key={c} onClick={() => setFiltro(c)}
                      className="px-3 py-2 rounded-xl font-semibold transition-all"
                      style={{
                        fontSize: 12,
                        background: filtro === c ? '#1d4ed8' : 'var(--bg-raised)',
                        color:      filtro === c ? '#fff'    : 'var(--text-secondary)',
                      }}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Grid de membros */}
            {membrosFiltrados.length === 0 ? (
              <div className="rounded-3xl p-14 text-center"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div className="w-20 h-20 rounded-3xl mx-auto mb-5 flex items-center justify-center"
              style={{ background: 'var(--bg-raised)' }}>
              <Users size={34} style={{ color: 'var(--text-faint)' }} />
            </div>
            <p className="font-bold text-white/70" style={{ fontSize: 16 }}>
              {membros.length === 0 ? 'Nenhum membro cadastrado' : 'Nenhum resultado'}
            </p>
            <p className="text-white/35 mt-2" style={{ fontSize: 13 }}>
              {membros.length === 0
                ? 'Clique em "Adicionar Membro" para cadastrar a equipe'
                : 'Tente ajustar os filtros de busca'}
            </p>
            {membros.length === 0 && (
              <button onClick={abrirNovo}
                className="mt-5 flex items-center gap-2 font-bold text-white px-6 py-3 rounded-2xl mx-auto"
                style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)',
                         boxShadow: '0 4px 14px rgba(79,70,229,0.35)', fontSize: 13 }}>
                <Plus size={16} /> Adicionar Primeiro Membro
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {membrosFiltrados.map(m => {
              const cor      = avatarCor(m.id)
              const cargoCor = CARGO_CORES[m.cargo] || 'rgba(203,213,235,0.60)'
              return (
                <div key={m.id} className="rounded-3xl overflow-hidden"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderTop: `4px solid ${cargoCor}` }}>
                  <div className="px-5 pt-5 pb-5">

                    {/* Avatar + ações */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0"
                        style={{ background: `linear-gradient(135deg,${cor},${cor}aa)`,
                                 boxShadow: `0 4px 14px ${cor}55` }}>
                        {m.foto
                          ? <img src={m.foto} alt={m.nome} className="w-full h-full object-cover"
                              style={{ objectPosition: `${m.fotoX??50}% ${m.fotoY??50}%` }} />
                          : <div className="w-full h-full flex items-center justify-center font-black text-white" style={{ fontSize: 18 }}>
                              {initials(m.nome)}
                            </div>
                        }
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => abrirEditar(m)}
                          className="p-1.5 rounded-xl hover:srf/5 transition-colors">
                          <Pencil size={13} style={{ color: 'var(--text-secondary)' }} />
                        </button>
                        <button onClick={() => excluirMembro(m.id)}
                          className="p-1.5 rounded-xl hover:bg-red-500/10 transition-colors">
                          <Trash2 size={13} style={{ color: '#f87171' }} />
                        </button>
                      </div>
                    </div>

                    {/* Nome + cargo + vínculo */}
                    <h3 className="font-black text-white leading-tight" style={{ fontSize: 15 }}>
                      {m.nome}
                    </h3>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <span className="inline-block px-2.5 py-0.5 rounded-full font-bold"
                        style={{ fontSize: 10, background: cargoCor + '18', color: cargoCor }}>
                        {m.cargo}
                      </span>
                      {(m.vinculo && m.vinculo !== 'Voluntário') || m.vinculo === 'Voluntário' ? (
                        <span className="inline-block px-2 py-0.5 rounded-full font-bold"
                          style={{ fontSize: 9, background: (VINCULO_CORES[m.vinculo||'Voluntário']||'#6366f1') + '18', color: VINCULO_CORES[m.vinculo||'Voluntário']||'#6366f1' }}>
                          {m.vinculo||'Voluntário'}
                        </span>
                      ) : null}
                    </div>

                    {/* Contatos */}
                    {(m.telefone || m.email || m.bairro || (Array.isArray(m.bairros) && m.bairros.length > 0)) && (
                      <div className="mt-3 space-y-1.5 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        {m.telefone && (
                          <div className="flex items-center gap-2">
                            <Phone size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                            <span className="truncate" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.telefone}</span>
                          </div>
                        )}
                        {m.email && (
                          <div className="flex items-center gap-2">
                            <Mail size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                            <span className="truncate lowercase" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.email}</span>
                          </div>
                        )}
                        {((Array.isArray(m.bairros) && m.bairros.length > 0) || m.bairro) && (
                          <div className="flex items-start gap-2">
                            <MapPin size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: 2 }} />
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                              {Array.isArray(m.bairros) && m.bairros.length > 0 ? m.bairros.join(', ') : m.bairro}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Vínculo / Remuneração / Contrato */}
                    {(m.salario || m.dataInicio || m.contrato) && (
                      <div className="mt-3 space-y-1.5 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        {m.salario && (
                          <div className="flex items-center gap-2">
                            <DollarSign size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtSalario(m.salario)}</span>
                          </div>
                        )}
                        {m.dataInicio && (
                          <div className="flex items-center gap-2">
                            <CalendarDays size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Desde {new Date(m.dataInicio + 'T12:00').toLocaleDateString('pt-BR')}</span>
                          </div>
                        )}
                        {m.contrato && (
                          <div className="flex items-center gap-2">
                            <FileText size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                            <span className="truncate" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.contrato}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {m.observacoes && (
                      <p className="mt-3 italic" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        "{m.observacoes}"
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
          </>
        )}

        {/* ABA: TAREFAS */}
        {aba === 'tarefas' && (
          <>
            <div className="rounded-3xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--text-tertiary)' }} />
                <input value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar tarefas…"
                  className="input-dark w-full pl-9 pr-3 py-2"
                  style={{ fontSize: 13 }} />
              </div>
            </div>

            {tarefasFiltradas.length === 0 ? (
              <div className="rounded-3xl p-14 text-center"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div className="w-20 h-20 rounded-3xl mx-auto mb-5 flex items-center justify-center"
                  style={{ background: 'var(--bg-raised)' }}>
                  <ListTodo size={34} style={{ color: 'var(--text-faint)' }} />
                </div>
                <p className="font-bold text-white/70" style={{ fontSize: 16 }}>
                  {tarefas.length === 0 ? 'Nenhuma tarefa cadastrada' : 'Nenhum resultado'}
                </p>
                <p className="text-white/35 mt-2" style={{ fontSize: 13 }}>
                  {tarefas.length === 0 ? 'Clique em "Nova Tarefa" para começar' : 'Tente ajustar a busca'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {tarefasFiltradas.map(t => {
                  const status = STATUS_TAREFA.find(s => s.id === t.status) || STATUS_TAREFA[0]
                  const prioridade = PRIORIDADES.find(p => p.id === t.prioridade) || PRIORIDADES[1]
                  return (
                    <div key={t.id} className="rounded-3xl p-5"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderLeft: `4px solid ${status.cor}` }}>
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-bold text-white" style={{ fontSize: 14 }}>{t.titulo}</h3>
                        <div className="flex gap-1">
                          <button onClick={() => { setTarefaForm({ ...t }); setModal('tarefa_' + t.id) }}
                            className="p-1.5 rounded-xl hover:srf/5 transition-colors">
                            <Pencil size={13} style={{ color: 'var(--text-secondary)' }} />
                          </button>
                          <button onClick={() => excluirTarefa(t.id)}
                            className="p-1.5 rounded-xl hover:bg-red-500/10 transition-colors">
                            <Trash2 size={13} style={{ color: '#f87171' }} />
                          </button>
                        </div>
                      </div>
                      {t.descricao && <p className="text-white/70 mb-3" style={{ fontSize: 12 }}>{t.descricao}</p>}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background: status.cor + '15', color: status.cor }}>
                          {status.label}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background: prioridade.cor + '15', color: prioridade.cor }}>
                          {prioridade.label}
                        </span>
                        {t.prazo && (
                          <span className="flex items-center gap-1 text-xs text-white/40">
                            <Clock size={11} />
                            {new Date(t.prazo + 'T12:00').toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ABA: LOG */}
        {aba === 'log' && (
          <div className="rounded-3xl p-6" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            {log.length === 0 ? (
              <div className="text-center py-12">
                <History size={32} style={{ color: 'var(--text-faint)', marginBottom: 8 }} />
                <p className="text-white/35" style={{ fontSize: 12 }}>Nenhuma atividade registrada</p>
              </div>
            ) : (
              <div className="space-y-3">
                {log.map(l => (
                  <div key={l.id} className="flex items-start gap-3 p-3 rounded-xl"
                    style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--bg-overlay)' }}>
                      {l.tipo.includes('membro') ? <Users size={14} style={{ color: 'var(--text-secondary)' }} /> :
                       l.tipo.includes('tarefa') ? <ListTodo size={14} style={{ color: 'var(--text-secondary)' }} /> :
                       <History size={14} style={{ color: 'var(--text-secondary)' }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white" style={{ fontSize: 12 }}>{l.mensagem}</p>
                      <p className="text-white/35" style={{ fontSize: 10 }}>
                        {new Date(l.timestamp).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modal: Ajustar posição da foto ─────────────────── */}
      {modalAjuste && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(7,10,18,0.85)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-sm rounded-3xl overflow-hidden"
            style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>

            <div className="flex items-center justify-between px-5 py-4"
              style={{ background: 'linear-gradient(135deg,#1e3a8a,#1e40af)' }}>
              <div className="flex items-center gap-2.5">
                <SlidersHorizontal size={16} className="text-white" />
                <h3 className="font-bold text-white" style={{ fontSize: 14 }}>Ajustar posição da foto</h3>
              </div>
              <button onClick={() => setModalAjuste(false)} className="p-1.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                <X size={15} />
              </button>
            </div>

            <div className="px-5 py-5 space-y-5">
              {/* Preview */}
              <div className="flex justify-center">
                <div className="rounded-2xl overflow-hidden" style={{ width: 120, height: 120, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
                  <img src={fotoRaw} alt="preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${ajusteX}% ${ajusteY}%` }} />
                </div>
              </div>

              {/* Slider X */}
              <div>
                <label className="flex items-center justify-between font-semibold mb-2"
                  style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  <span>Posição horizontal</span>
                  <span style={{ color: 'var(--accent-bright)' }}>{ajusteX}%</span>
                </label>
                <input type="range" min="0" max="100" value={ajusteX}
                  onChange={e => setAjusteX(Number(e.target.value))}
                  className="w-full" style={{ accentColor: 'var(--accent-bright)' }} />
                <div className="flex justify-between mt-1" style={{ fontSize: 10, color: 'rgba(203,213,235,0.35)' }}>
                  <span>Esquerda</span><span>Direita</span>
                </div>
              </div>

              {/* Slider Y */}
              <div>
                <label className="flex items-center justify-between font-semibold mb-2"
                  style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  <span>Posição vertical</span>
                  <span style={{ color: 'var(--accent-bright)' }}>{ajusteY}%</span>
                </label>
                <input type="range" min="0" max="100" value={ajusteY}
                  onChange={e => setAjusteY(Number(e.target.value))}
                  className="w-full" style={{ accentColor: 'var(--accent-bright)' }} />
                <div className="flex justify-between mt-1" style={{ fontSize: 10, color: 'rgba(203,213,235,0.35)' }}>
                  <span>Topo</span><span>Base</span>
                </div>
              </div>

              {/* Ações */}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setModalAjuste(false)}
                  className="px-4 py-2.5 rounded-2xl font-semibold text-sm"
                  style={{ border: '1px solid var(--border-soft)', color: 'var(--text-secondary)' }}>
                  Cancelar
                </button>
                <button onClick={confirmarAjuste}
                  className="flex-1 py-2.5 rounded-2xl font-bold text-white text-sm"
                  style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)', boxShadow: '0 4px 14px rgba(29,78,216,0.35)' }}>
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
