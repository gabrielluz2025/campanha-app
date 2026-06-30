import { useState, useEffect, useMemo } from 'react'
import {
  Package, Plus, Trash2, Minus, AlertTriangle, CheckCircle,
  X, Edit3, MapPin, Calendar, TrendingDown, Box, Printer,
} from 'lucide-react'
import { confirmAction } from '../utils/confirm'

const CORES_CAT = {
  'Santinhos': '#3b82f6',
  'Bandeiras': '#f59e0b',
  'Adesivos': '#10b981',
  'Camisetas': '#06b6d4',
  'Bonés': '#ec4899',
  'Panfletos': '#06b6d4',
  'Canetas': '#f97316',
  'Outros': 'rgba(203,213,235,0.55)',
}
const CATEGORIAS = Object.keys(CORES_CAT)

const STORAGE_KEY = 'materiais_estoque'
const DIST_KEY = 'materiais_distribuicao'

function gerarId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }

export default function Materiais() {
  const [itens, setItens] = useState(() => JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'))
  const [distribuicoes, setDistribuicoes] = useState(() => JSON.parse(localStorage.getItem(DIST_KEY) || '[]'))
  const [modal, setModal] = useState(null)
  const [distModal, setDistModal] = useState(null)
  const [form, setForm] = useState({ nome: '', categoria: 'Santinhos', quantidade: '', estoqueMinimo: '' })
  const [distForm, setDistForm] = useState({ itemId: '', quantidade: '', bairro: '', evento: '' })

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(itens)) }, [itens])
  useEffect(() => { localStorage.setItem(DIST_KEY, JSON.stringify(distribuicoes)) }, [distribuicoes])

  const stats = useMemo(() => {
    const totalItens = itens.length
    const totalEstoque = itens.reduce((s, i) => s + i.quantidade, 0)
    const alertas = itens.filter(i => i.quantidade <= i.estoqueMinimo).length
    const totalDist = distribuicoes.reduce((s, d) => s + d.quantidade, 0)
    return { totalItens, totalEstoque, alertas, totalDist }
  }, [itens, distribuicoes])

  const itensComStatus = useMemo(() => {
    return itens.map(item => {
      const distQtd = distribuicoes.filter(d => d.itemId === item.id).reduce((s, d) => s + d.quantidade, 0)
      const restante = item.quantidade - distQtd
      const status = restante <= 0 ? 'esgotado' : restante <= item.estoqueMinimo ? 'baixo' : 'ok'
      return { ...item, distribuido: distQtd, restante, status }
    })
  }, [itens, distribuicoes])

  function novoItem() {
    setForm({ nome: '', categoria: 'Santinhos', quantidade: '', estoqueMinimo: '' })
    setModal('novo')
  }

  function editarItem(item) {
    setForm({ nome: item.nome, categoria: item.categoria, quantidade: item.quantidade, estoqueMinimo: item.estoqueMinimo })
    setModal(item.id)
  }

  function salvarItem() {
    if (!form.nome.trim() || !form.quantidade) return
    const qtd = parseInt(form.quantidade) || 0
    const min = parseInt(form.estoqueMinimo) || 0
    if (modal === 'novo') {
      setItens(prev => [...prev, { id: gerarId(), nome: form.nome.trim(), categoria: form.categoria, quantidade: qtd, estoqueMinimo: min, criadoEm: new Date().toISOString() }])
    } else {
      setItens(prev => prev.map(i => i.id === modal ? { ...i, nome: form.nome.trim(), categoria: form.categoria, quantidade: qtd, estoqueMinimo: min } : i))
    }
    setModal(null)
  }

  async function excluirItem(id) {
    const item = itens.find(i => i.id === id)
    const ok = await confirmAction({
      title: 'Excluir material',
      message: `Excluir ${item?.nome || 'este item'} e todas as suas distribuições? Esta ação não pode ser desfeita.`,
    })
    if (!ok) return
    setItens(prev => prev.filter(i => i.id !== id))
    setDistribuicoes(prev => prev.filter(d => d.itemId !== id))
  }

  function novaDistribuicao() {
    setDistForm({ itemId: itens[0]?.id || '', quantidade: '', bairro: '', evento: '' })
    setDistModal(true)
  }

  function salvarDistribuicao() {
    if (!distForm.itemId || !distForm.quantidade || !distForm.bairro) return
    const qtd = parseInt(distForm.quantidade) || 0
    if (qtd <= 0) return
    setDistribuicoes(prev => [...prev, {
      id: gerarId(),
      itemId: distForm.itemId,
      quantidade: qtd,
      bairro: distForm.bairro,
      evento: distForm.evento,
      data: new Date().toISOString(),
    }])
    setDistModal(null)
  }

  const BAIRROS = [
    'Centro', 'Garcia', 'Velha', 'Ponta Aguda', 'Vorstadt', 'Victor Konder',
    'Itoupava Norte', 'Itoupava Central', 'Badenfurt', 'Fortaleza',
    'Progresso', 'Escola Agrícola', 'Água Verde', 'Ribeirão Fresco',
  ]

  return (
    <div className="flex-1 overflow-auto" style={{ background: '#08080d' }}>
      {/* Hero */}
      <div className="px-4 md:px-6 pt-7 pb-16"
        style={{ background: 'linear-gradient(135deg,#1e3a8a 0%,#059669 60%,#10b981 100%)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 mb-7">
            <div className="flex items-center gap-4">
              <div className="w-13 h-13 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.18)', width: 52, height: 52 }}>
                <Package size={26} className="text-white" />
              </div>
              <div>
                <h1 className="font-black text-white" style={{ fontSize: 24 }}>Materiais de Campanha</h1>
                <p className="text-green-200 mt-0.5" style={{ fontSize: 12 }}>
                  Controle de estoque e distribuição de materiais
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={novaDistribuicao}
                className="flex items-center gap-2 font-bold text-white px-4 py-2.5 rounded-2xl transition-all"
                style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', fontSize: 13 }}>
                <Minus size={16} /> Registrar Saída
              </button>
              <button onClick={novoItem}
                className="flex items-center gap-2 font-bold text-white px-4 py-2.5 rounded-2xl transition-all"
                style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', fontSize: 13 }}>
                <Plus size={16} /> Novo Material
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Tipos de Material', valor: stats.totalItens, cor: '#3b82f6' },
              { label: 'Total em Estoque', valor: stats.totalEstoque.toLocaleString(), cor: '#10b981' },
              { label: 'Alertas de Estoque', valor: stats.alertas, cor: stats.alertas > 0 ? '#ef4444' : '#10b981' },
              { label: 'Total Distribuído', valor: stats.totalDist.toLocaleString(), cor: '#06b6d4' },
            ].map(s => (
              <div key={s.label} className="rounded-2xl px-4 py-3"
                style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.14)' }}>
                <p className="text-green-200" style={{ fontSize: 10 }}>{s.label}</p>
                <p className="font-black text-white mt-1" style={{ fontSize: 22 }}>{s.valor}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 pb-10 -mt-10 space-y-5">
        {/* Alertas */}
        {itensComStatus.filter(i => i.status !== 'ok').length > 0 && (
          <div className="srf rounded-3xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
            <h3 className="font-bold txt-1 flex items-center gap-2 mb-3" style={{ fontSize: 14 }}>
              <AlertTriangle size={16} className="text-red-500" /> Alertas de Estoque
            </h3>
            <div className="space-y-2">
              {itensComStatus.filter(i => i.status !== 'ok').map(item => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                  style={item.status === 'esgotado'
                    ? { background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.22)' }
                    : { background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.22)' }}>
                  <AlertTriangle size={14} style={{ color: item.status === 'esgotado' ? '#f87171' : '#fbbf24', flexShrink: 0 }} />
                  <span className="text-sm font-semibold flex-1" style={{ color: 'var(--text-secondary)' }}>{item.nome}</span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                    style={item.status === 'esgotado'
                      ? { background: 'rgba(239,68,68,0.18)', color: '#f87171' }
                      : { background: 'rgba(245,158,11,0.18)', color: '#fbbf24' }}>
                    {item.status === 'esgotado' ? 'ESGOTADO' : 'Estoque baixo: ' + item.restante}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Grid de itens */}
        {itensComStatus.length === 0 ? (
          <div className="srf rounded-3xl p-10 text-center" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
            <Package size={48} className="mx-auto txt-4 mb-4" />
            <p className="font-bold txt-3 text-lg">Nenhum material cadastrado</p>
            <p className="txt-3 text-sm mt-1">Clique em "Novo Material" para começar</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {itensComStatus.map(item => {
              const cor = CORES_CAT[item.categoria] || 'rgba(203,213,235,0.55)'
              const pct = item.quantidade > 0 ? Math.min(100, Math.round(item.restante / item.quantidade * 100)) : 0
              return (
                <div key={item.id} className="srf rounded-3xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: cor + '22' }}>
                        <Box size={16} style={{ color: cor }} />
                      </div>
                      <div>
                        <p className="font-bold txt-1 text-sm">{item.nome}</p>
                        <p className="text-xs font-medium" style={{ color: cor }}>{item.categoria}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => editarItem(item)} className="p-1.5 rounded-lg hov-srf">
                        <Edit3 size={12} className="txt-3" />
                      </button>
                      <button onClick={() => excluirItem(item.id)} className="p-1.5 rounded-lg hov-srf">
                        <Trash2 size={12} className="text-red-400" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-baseline justify-between mb-2">
                    <p className="text-2xl font-black txt-1">{item.restante.toLocaleString()}</p>
                    <p className="text-xs txt-3">de {item.quantidade.toLocaleString()}</p>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 srf-soft rounded-full overflow-hidden mb-2">
                    <div className="h-full rounded-full transition-all"
                      style={{
                        width: pct + '%',
                        backgroundColor: item.status === 'esgotado' ? '#ef4444' : item.status === 'baixo' ? '#f59e0b' : cor,
                      }} />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className={'text-xs font-bold px-2 py-0.5 rounded-full ' +
                      (item.status === 'esgotado' ? 'bg-red-100 text-red-700'
                        : item.status === 'baixo' ? 'bg-amber-100 text-amber-700'
                          : 'bg-green-100 text-green-700')}>
                      {item.status === 'esgotado' ? 'Esgotado' : item.status === 'baixo' ? 'Estoque Baixo' : 'OK'}
                    </span>
                    <span className="text-xs txt-3">{item.distribuido.toLocaleString()} distribuídos</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Últimas distribuições */}
        {distribuicoes.length > 0 && (
          <div className="srf rounded-3xl p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
            <h3 className="font-bold txt-1 flex items-center gap-2 mb-4" style={{ fontSize: 14 }}>
              <TrendingDown size={16} className="text-blue-500" /> Últimas Distribuições
            </h3>
            <div className="space-y-2">
              {[...distribuicoes].reverse().slice(0, 10).map(dist => {
                const item = itens.find(i => i.id === dist.itemId)
                return (
                  <div key={dist.id} className="flex items-center gap-3 px-4 py-3 rounded-xl srf-soft">
                    <Minus size={14} className="txt-3 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold txt-2">
                        {item?.nome || 'Item removido'} — <span className="text-blue-600">{dist.quantidade} un.</span>
                      </p>
                      <p className="text-xs txt-3 flex items-center gap-2 mt-0.5">
                        <MapPin size={9} /> {dist.bairro}
                        {dist.evento && <span>· {dist.evento}</span>}
                      </p>
                    </div>
                    <span className="text-xs txt-3">{new Date(dist.data).toLocaleDateString('pt-BR')}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal novo/editar material */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="srf rounded-3xl w-full max-w-md" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div className="px-6 py-4 border-b brd-soft flex items-center justify-between">
              <h2 className="font-bold txt-1" style={{ fontSize: 18 }}>{modal === 'novo' ? 'Novo Material' : 'Editar Material'}</h2>
              <button onClick={() => setModal(null)} className="p-2 rounded-xl hov-srf"><X size={18} className="txt-3" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-bold txt-3 block mb-1.5">Nome *</label>
                <input value={form.nome} onChange={e => setForm(prev => ({ ...prev, nome: e.target.value }))}
                  className="w-full p-3 rounded-xl border brd-soft text-sm font-semibold"
                  placeholder="Ex: Santinhos 10x15" />
              </div>
              <div>
                <label className="text-xs font-bold txt-3 block mb-1.5">Categoria</label>
                <select value={form.categoria} onChange={e => setForm(prev => ({ ...prev, categoria: e.target.value }))}
                  className="w-full p-3 rounded-xl border brd-soft text-sm font-semibold">
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold txt-3 block mb-1.5">Quantidade *</label>
                  <input type="number" value={form.quantidade} onChange={e => setForm(prev => ({ ...prev, quantidade: e.target.value }))}
                    className="w-full p-3 rounded-xl border brd-soft text-sm font-semibold"
                    placeholder="0" min="0" />
                </div>
                <div>
                  <label className="text-xs font-bold txt-3 block mb-1.5">Estoque Mínimo</label>
                  <input type="number" value={form.estoqueMinimo} onChange={e => setForm(prev => ({ ...prev, estoqueMinimo: e.target.value }))}
                    className="w-full p-3 rounded-xl border brd-soft text-sm font-semibold"
                    placeholder="0" min="0" />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t brd-soft flex justify-end gap-3">
              <button onClick={() => setModal(null)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold txt-3 hov-srf">Cancelar</button>
              <button onClick={salvarItem}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
                {modal === 'novo' ? 'Cadastrar' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal distribuição */}
      {distModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="srf rounded-3xl w-full max-w-md" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div className="px-6 py-4 border-b brd-soft flex items-center justify-between">
              <h2 className="font-bold txt-1" style={{ fontSize: 18 }}>Registrar Saída</h2>
              <button onClick={() => setDistModal(null)} className="p-2 rounded-xl hov-srf"><X size={18} className="txt-3" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-bold txt-3 block mb-1.5">Material *</label>
                <select value={distForm.itemId} onChange={e => setDistForm(prev => ({ ...prev, itemId: e.target.value }))}
                  className="w-full p-3 rounded-xl border brd-soft text-sm font-semibold">
                  {itens.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.categoria})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold txt-3 block mb-1.5">Quantidade *</label>
                <input type="number" value={distForm.quantidade} onChange={e => setDistForm(prev => ({ ...prev, quantidade: e.target.value }))}
                  className="w-full p-3 rounded-xl border brd-soft text-sm font-semibold"
                  placeholder="0" min="1" />
              </div>
              <div>
                <label className="text-xs font-bold txt-3 block mb-1.5">Bairro *</label>
                <select value={distForm.bairro} onChange={e => setDistForm(prev => ({ ...prev, bairro: e.target.value }))}
                  className="w-full p-3 rounded-xl border brd-soft text-sm font-semibold">
                  <option value="">Selecione...</option>
                  {BAIRROS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold txt-3 block mb-1.5">Evento / Local</label>
                <input value={distForm.evento} onChange={e => setDistForm(prev => ({ ...prev, evento: e.target.value }))}
                  className="w-full p-3 rounded-xl border brd-soft text-sm font-semibold"
                  placeholder="Ex: Caminhada no Garcia" />
              </div>
            </div>
            <div className="px-6 py-4 border-t brd-soft flex justify-end gap-3">
              <button onClick={() => setDistModal(null)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold txt-3 hov-srf">Cancelar</button>
              <button onClick={salvarDistribuicao}
                disabled={!distForm.itemId || !distForm.quantidade || !distForm.bairro}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
                Registrar Saída
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
