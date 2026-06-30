import { useState, useEffect, useMemo } from 'react'
import {
  UserPlus, Users, Search, Trash2, Edit3, X, Phone, MapPin,
  Star, MessageSquare, ChevronDown, ChevronUp, Filter,
  Heart, Shield, Award, Clock, Plus, UserCheck,
} from 'lucide-react'
import { confirmAction } from '../utils/confirm'

const NIVEIS = {
  simpatizante: { label: 'Simpatizante', cor: '#3b82f6', icon: Heart },
  apoiador: { label: 'Apoiador', cor: '#10b981', icon: UserCheck },
  cabo_eleitoral: { label: 'Cabo Eleitoral', cor: '#f59e0b', icon: Shield },
  lider: { label: 'Líder Comunitário', cor: '#06b6d4', icon: Award },
}

const BAIRROS = [
  'Centro', 'Garcia', 'Velha', 'Ponta Aguda', 'Vorstadt', 'Victor Konder',
  'Itoupava Norte', 'Itoupava Central', 'Badenfurt', 'Fortaleza',
  'Progresso', 'Escola Agrícola', 'Água Verde', 'Ribeirão Fresco',
  'Salto Norte', 'Itoupavazinha', 'Vila Nova', 'Fidélis', 'Testo Salto',
]

const STORAGE_KEY = 'apoiadores_lista'
const INTERACOES_KEY = 'apoiadores_interacoes'

function gerarId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }

export default function Apoiadores() {
  const [apoiadores, setApoiadores] = useState(() => JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'))
  const [interacoes, setInteracoes] = useState(() => JSON.parse(localStorage.getItem(INTERACOES_KEY) || '{}'))
  const [modal, setModal] = useState(null)
  const [interModal, setInterModal] = useState(null)
  const [detalheId, setDetalheId] = useState(null)
  const [busca, setBusca] = useState('')
  const [filtroNivel, setFiltroNivel] = useState('Todos')
  const [filtroBairro, setFiltroBairro] = useState('Todos')
  const [form, setForm] = useState({ nome: '', telefone: '', bairro: '', nivel: 'simpatizante', observacao: '' })
  const [interForm, setInterForm] = useState({ tipo: 'contato', descricao: '' })

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(apoiadores)) }, [apoiadores])
  useEffect(() => { localStorage.setItem(INTERACOES_KEY, JSON.stringify(interacoes)) }, [interacoes])

  const stats = useMemo(() => {
    const total = apoiadores.length
    const porNivel = {}
    Object.keys(NIVEIS).forEach(n => { porNivel[n] = apoiadores.filter(a => a.nivel === n).length })
    const bairrosAtivos = new Set(apoiadores.map(a => a.bairro)).size
    return { total, porNivel, bairrosAtivos }
  }, [apoiadores])

  const filtered = useMemo(() => {
    let lista = [...apoiadores]
    if (busca) {
      const q = busca.toLowerCase()
      lista = lista.filter(a => a.nome.toLowerCase().includes(q) || a.telefone.includes(q) || a.bairro.toLowerCase().includes(q))
    }
    if (filtroNivel !== 'Todos') lista = lista.filter(a => a.nivel === filtroNivel)
    if (filtroBairro !== 'Todos') lista = lista.filter(a => a.bairro === filtroBairro)
    return lista
  }, [apoiadores, busca, filtroNivel, filtroBairro])

  function novoApoiador() {
    setForm({ nome: '', telefone: '', bairro: '', nivel: 'simpatizante', observacao: '' })
    setModal('novo')
  }

  function editarApoiador(ap) {
    setForm({ nome: ap.nome, telefone: ap.telefone, bairro: ap.bairro, nivel: ap.nivel, observacao: ap.observacao })
    setModal(ap.id)
  }

  function salvarApoiador() {
    if (!form.nome.trim() || !form.bairro) return
    if (modal === 'novo') {
      setApoiadores(prev => [{ id: gerarId(), ...form, criadoEm: new Date().toISOString() }, ...prev])
    } else {
      setApoiadores(prev => prev.map(a => a.id === modal ? { ...a, ...form } : a))
    }
    setModal(null)
  }

  async function excluirApoiador(id) {
    const ap = apoiadores.find(a => a.id === id)
    const ok = await confirmAction({
      title: 'Excluir apoiador',
      message: `Excluir ${ap?.nome || 'este apoiador'} e todo o histórico de interações? Esta ação não pode ser desfeita.`,
    })
    if (!ok) return
    setApoiadores(prev => prev.filter(a => a.id !== id))
    setInteracoes(prev => { const copy = { ...prev }; delete copy[id]; return copy })
  }

  function abrirInteracao(id) {
    setInterForm({ tipo: 'contato', descricao: '' })
    setInterModal(id)
  }

  function salvarInteracao() {
    if (!interForm.descricao.trim()) return
    const nova = { id: gerarId(), ...interForm, data: new Date().toISOString() }
    setInteracoes(prev => ({
      ...prev,
      [interModal]: [...(prev[interModal] || []), nova]
    }))
    setInterModal(null)
  }

  const detalheAp = apoiadores.find(a => a.id === detalheId)
  const detalheInter = interacoes[detalheId] || []

  return (
    <div className="flex-1 overflow-auto" style={{ background: '#08080d' }}>
      {/* Hero */}
      <div className="px-4 md:px-6 pt-7 pb-16"
        style={{ background: 'linear-gradient(135deg,#1e3a8a 0%,#0891b2 60%,#22d3ee 100%)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 mb-7">
            <div className="flex items-center gap-4">
              <div className="w-13 h-13 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.18)', width: 52, height: 52 }}>
                <Users size={26} className="text-white" />
              </div>
              <div>
                <h1 className="font-black text-white" style={{ fontSize: 24 }}>Rede de Apoiadores</h1>
                <p className="text-purple-200 mt-0.5" style={{ fontSize: 12 }}>
                  CRM Eleitoral — cadastro, engajamento e histórico de interações
                </p>
              </div>
            </div>
            <button onClick={novoApoiador}
              className="flex items-center gap-2 font-bold text-white px-5 py-3 rounded-2xl transition-all"
              style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', fontSize: 13 }}>
              <UserPlus size={16} /> Novo Apoiador
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="rounded-2xl px-4 py-3"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.14)' }}>
              <p className="text-purple-200" style={{ fontSize: 10 }}>Total</p>
              <p className="font-black text-white mt-1" style={{ fontSize: 22 }}>{stats.total}</p>
            </div>
            {Object.entries(NIVEIS).map(([key, val]) => (
              <div key={key} className="rounded-2xl px-4 py-3"
                style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.14)' }}>
                <p className="text-purple-200" style={{ fontSize: 10 }}>{val.label}</p>
                <p className="font-black text-white mt-1" style={{ fontSize: 22 }}>{stats.porNivel[key]}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 pb-10 -mt-10 space-y-5">
        {/* Search & Filters */}
        <div className="srf rounded-3xl p-5 flex flex-col sm:flex-row gap-3" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 txt-3" />
            <input value={busca} onChange={e => setBusca(e.target.value)}
              className="input-dark w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
              placeholder="Buscar por nome, telefone ou bairro..." />
          </div>
          <select value={filtroNivel} onChange={e => setFiltroNivel(e.target.value)}
            className="px-3 py-2.5 rounded-xl text-sm font-semibold">
            <option value="Todos">Todos os níveis</option>
            {Object.entries(NIVEIS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filtroBairro} onChange={e => setFiltroBairro(e.target.value)}
            className="px-3 py-2.5 rounded-xl text-sm font-semibold">
            <option value="Todos">Todos os bairros</option>
            {BAIRROS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="srf rounded-3xl p-10 text-center" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
            <Users size={48} className="mx-auto txt-4 mb-4" />
            <p className="font-bold txt-3 text-lg">
              {apoiadores.length === 0 ? 'Nenhum apoiador cadastrado' : 'Nenhum resultado encontrado'}
            </p>
            <p className="txt-3 text-sm mt-1">
              {apoiadores.length === 0 ? 'Clique em "Novo Apoiador" para começar' : 'Tente ajustar os filtros'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-bold txt-3 px-1">{filtered.length} apoiador{filtered.length !== 1 ? 'es' : ''}</p>
            {filtered.map(ap => {
              const nivel = NIVEIS[ap.nivel] || NIVEIS.simpatizante
              const NivelIcon = nivel.icon
              const inters = (interacoes[ap.id] || []).length
              return (
                <div key={ap.id} className="srf rounded-2xl p-4 flex items-center gap-4" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
                  {/* Avatar */}
                  <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-sm"
                    style={{ backgroundColor: nivel.cor }}>
                    {ap.nome.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold txt-1 text-sm truncate">{ap.nome}</p>
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: nivel.cor + '18', color: nivel.cor }}>
                        <NivelIcon size={10} /> {nivel.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs txt-3">
                      {ap.telefone && <span className="flex items-center gap-1"><Phone size={9} /> {ap.telefone}</span>}
                      <span className="flex items-center gap-1"><MapPin size={9} /> {ap.bairro}</span>
                      {inters > 0 && <span className="flex items-center gap-1"><MessageSquare size={9} /> {inters} interações</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setDetalheId(ap.id)}
                      className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-colors"
                      style={{ background:'rgba(167,139,250,0.12)', color:'#c4b5fd' }}>
                      <MessageSquare size={11} /> Histórico
                    </button>
                    <button onClick={() => abrirInteracao(ap.id)}
                      className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-colors"
                      style={{ background:'rgba(37,99,235,0.12)', color:'#93c5fd' }}>
                      <Plus size={11} /> Interação
                    </button>
                    <button onClick={() => editarApoiador(ap)} className="p-2 rounded-xl hov-srf">
                      <Edit3 size={13} className="txt-3" />
                    </button>
                    <button onClick={() => excluirApoiador(ap.id)} className="p-2 rounded-xl hov-srf">
                      <Trash2 size={13} className="text-red-400" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal novo/editar apoiador */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="srf rounded-3xl w-full max-w-md" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div className="px-6 py-4 border-b brd-soft flex items-center justify-between">
              <h2 className="font-bold txt-1" style={{ fontSize: 18 }}>{modal === 'novo' ? 'Novo Apoiador' : 'Editar Apoiador'}</h2>
              <button onClick={() => setModal(null)} className="p-2 rounded-xl hov-srf"><X size={18} className="txt-3" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-bold txt-3 block mb-1.5">Nome Completo *</label>
                <input value={form.nome} onChange={e => setForm(prev => ({ ...prev, nome: e.target.value }))}
                  className="w-full p-3 rounded-xl border brd-soft text-sm font-semibold"
                  placeholder="Nome do apoiador" />
              </div>
              <div>
                <label className="text-xs font-bold txt-3 block mb-1.5">Telefone</label>
                <input value={form.telefone} onChange={e => setForm(prev => ({ ...prev, telefone: e.target.value }))}
                  className="w-full p-3 rounded-xl border brd-soft text-sm font-semibold"
                  placeholder="(47) 99999-9999" />
              </div>
              <div>
                <label className="text-xs font-bold txt-3 block mb-1.5">Bairro *</label>
                <select value={form.bairro} onChange={e => setForm(prev => ({ ...prev, bairro: e.target.value }))}
                  className="w-full p-3 rounded-xl border brd-soft text-sm font-semibold">
                  <option value="">Selecione...</option>
                  {BAIRROS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold txt-3 block mb-1.5">Nível de Engajamento</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(NIVEIS).map(([key, val]) => {
                    const Icon = val.icon
                    return (
                      <button key={key} onClick={() => setForm(prev => ({ ...prev, nivel: key }))}
                        className={'flex items-center gap-2 p-3 rounded-xl border text-sm font-bold transition-all ' +
                          (form.nivel === key ? 'border-2' : 'brd-soft hover:brd-soft')}
                        style={form.nivel === key ? { borderColor: val.cor, backgroundColor: val.cor + '10', color: val.cor } : { color: 'rgba(203,213,235,0.55)' }}>
                        <Icon size={14} /> {val.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold txt-3 block mb-1.5">Observação</label>
                <textarea value={form.observacao} onChange={e => setForm(prev => ({ ...prev, observacao: e.target.value }))}
                  className="w-full p-3 rounded-xl border brd-soft text-sm resize-none" rows={2}
                  placeholder="Observações sobre o apoiador..." />
              </div>
            </div>
            <div className="px-6 py-4 border-t brd-soft flex justify-end gap-3">
              <button onClick={() => setModal(null)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold txt-3 hov-srf">Cancelar</button>
              <button onClick={salvarApoiador}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#0891b2,#22d3ee)' }}>
                {modal === 'novo' ? 'Cadastrar' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nova interação */}
      {interModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="srf rounded-3xl w-full max-w-md" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div className="px-6 py-4 border-b brd-soft flex items-center justify-between">
              <h2 className="font-bold txt-1" style={{ fontSize: 18 }}>Nova Interação</h2>
              <button onClick={() => setInterModal(null)} className="p-2 rounded-xl hov-srf"><X size={18} className="txt-3" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-bold txt-3 block mb-1.5">Tipo</label>
                <select value={interForm.tipo} onChange={e => setInterForm(prev => ({ ...prev, tipo: e.target.value }))}
                  className="w-full p-3 rounded-xl border brd-soft text-sm font-semibold">
                  <option value="contato">Contato Telefônico</option>
                  <option value="visita">Visita Presencial</option>
                  <option value="evento">Participou de Evento</option>
                  <option value="material">Recebeu Material</option>
                  <option value="indicacao">Fez Indicação</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold txt-3 block mb-1.5">Descrição *</label>
                <textarea value={interForm.descricao} onChange={e => setInterForm(prev => ({ ...prev, descricao: e.target.value }))}
                  className="w-full p-3 rounded-xl border brd-soft text-sm resize-none" rows={3}
                  placeholder="Descreva a interação..." />
              </div>
            </div>
            <div className="px-6 py-4 border-t brd-soft flex justify-end gap-3">
              <button onClick={() => setInterModal(null)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold txt-3 hov-srf">Cancelar</button>
              <button onClick={salvarInteracao}
                disabled={!interForm.descricao.trim()}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#0891b2,#22d3ee)' }}>
                Salvar Interação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalhe/histórico */}
      {detalheId && detalheAp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="srf rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div className="sticky top-0 srf px-6 py-4 border-b brd-soft flex items-center justify-between rounded-t-3xl z-10">
              <h2 className="font-bold txt-1" style={{ fontSize: 18 }}>Histórico</h2>
              <button onClick={() => setDetalheId(null)} className="p-2 rounded-xl hov-srf"><X size={18} className="txt-3" /></button>
            </div>
            <div className="px-6 py-5">
              {/* Profile */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: NIVEIS[detalheAp.nivel]?.cor || 'rgba(203,213,235,0.55)' }}>
                  {detalheAp.nome.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div>
                  <p className="font-bold txt-1">{detalheAp.nome}</p>
                  <p className="text-xs txt-3">{NIVEIS[detalheAp.nivel]?.label} · {detalheAp.bairro}</p>
                </div>
              </div>
              {detalheAp.observacao && (
                <p className="text-sm txt-3 mb-4 p-3 rounded-xl srf-soft">{detalheAp.observacao}</p>
              )}

              {/* Timeline */}
              <h3 className="text-xs font-bold txt-3 mb-3">INTERAÇÕES ({detalheInter.length})</h3>
              {detalheInter.length === 0 ? (
                <p className="text-sm txt-3 text-center py-6">Nenhuma interação registrada</p>
              ) : (
                <div className="space-y-3">
                  {[...detalheInter].reverse().map(inter => {
                    const tipoLabels = { contato: 'Contato', visita: 'Visita', evento: 'Evento', material: 'Material', indicacao: 'Indicação', outro: 'Outro' }
                    const tipoCores = { contato: '#3b82f6', visita: '#10b981', evento: '#f59e0b', material: '#06b6d4', indicacao: '#ec4899', outro: 'rgba(203,213,235,0.55)' }
                    return (
                      <div key={inter.id} className="flex gap-3">
                        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: tipoCores[inter.tipo] || 'rgba(203,213,235,0.55)' }} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold" style={{ color: tipoCores[inter.tipo] || 'rgba(203,213,235,0.55)' }}>
                              {tipoLabels[inter.tipo] || inter.tipo}
                            </span>
                            <span className="text-xs txt-4">{new Date(inter.data).toLocaleDateString('pt-BR')}</span>
                          </div>
                          <p className="text-sm txt-2 mt-0.5">{inter.descricao}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
