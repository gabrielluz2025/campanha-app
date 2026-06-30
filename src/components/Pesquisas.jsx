import { useState, useEffect, useMemo } from 'react'
import {
  ClipboardList, Plus, Trash2, BarChart3, Users, MapPin,
  CheckCircle, Clock, X, Edit3, Send, Eye,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { PageHeader, ModuleWrap, Card, Button, EmptyState, selectDark, Pill, StatGrid } from './ui'
import { BAIRROS_BLUMENAU } from '../utils/constants'
import { confirmAction } from '../utils/confirm'

const CORES = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#2563eb']
const INPUT_CLS = 'input-dark w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none'

const STORAGE_KEY = 'pesquisas_enquetes'
const RESPOSTAS_KEY = 'pesquisas_respostas'

function gerarId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }

export default function Pesquisas() {
  const [enquetes, setEnquetes] = useState(() => JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'))
  const [respostas, setRespostas] = useState(() => JSON.parse(localStorage.getItem(RESPOSTAS_KEY) || '{}'))
  const [aba, setAba] = useState('lista')
  const [modal, setModal] = useState(null)
  const [respModal, setRespModal] = useState(null)
  const [resultadoId, setResultadoId] = useState(null)

  // Form state for new/edit enquete
  const [form, setForm] = useState({ titulo: '', descricao: '', perguntas: [] })

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(enquetes)) }, [enquetes])
  useEffect(() => { localStorage.setItem(RESPOSTAS_KEY, JSON.stringify(respostas)) }, [respostas])

  const stats = useMemo(() => {
    const total = enquetes.length
    const ativas = enquetes.filter(e => e.status === 'ativa').length
    const totalResp = Object.values(respostas).reduce((s, arr) => s + arr.length, 0)
    const bairrosCobertura = new Set(Object.values(respostas).flat().map(r => r.bairro)).size
    return { total, ativas, totalResp, bairrosCobertura }
  }, [enquetes, respostas])

  function novaEnquete() {
    setForm({ titulo: '', descricao: '', perguntas: [{ id: gerarId(), texto: '', tipo: 'multipla', opcoes: ['', ''] }] })
    setModal('nova')
  }

  function editarEnquete(enq) {
    setForm({ titulo: enq.titulo, descricao: enq.descricao, perguntas: enq.perguntas })
    setModal(enq.id)
  }

  function salvarEnquete() {
    if (!form.titulo.trim()) return
    const perguntas = form.perguntas.filter(p => p.texto.trim())
    if (perguntas.length === 0) return

    if (modal === 'nova') {
      const nova = {
        id: gerarId(),
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim(),
        perguntas,
        status: 'ativa',
        criadoEm: new Date().toISOString(),
      }
      setEnquetes(prev => [nova, ...prev])
    } else {
      setEnquetes(prev => prev.map(e => e.id === modal ? { ...e, titulo: form.titulo.trim(), descricao: form.descricao.trim(), perguntas } : e))
    }
    setModal(null)
  }

  async function excluirEnquete(id) {
    const enq = enquetes.find(e => e.id === id)
    const ok = await confirmAction({
      title: 'Excluir enquete',
      message: `Excluir "${enq?.titulo || 'esta enquete'}" e todas as respostas coletadas? Esta ação não pode ser desfeita.`,
    })
    if (!ok) return
    setEnquetes(prev => prev.filter(e => e.id !== id))
    setRespostas(prev => { const copy = { ...prev }; delete copy[id]; return copy })
  }

  function toggleStatus(id) {
    setEnquetes(prev => prev.map(e => e.id === id ? { ...e, status: e.status === 'ativa' ? 'encerrada' : 'ativa' } : e))
  }

  function addPergunta() {
    setForm(prev => ({
      ...prev,
      perguntas: [...prev.perguntas, { id: gerarId(), texto: '', tipo: 'multipla', opcoes: ['', ''] }]
    }))
  }

  function removePergunta(idx) {
    setForm(prev => ({ ...prev, perguntas: prev.perguntas.filter((_, i) => i !== idx) }))
  }

  function updatePergunta(idx, field, value) {
    setForm(prev => ({
      ...prev,
      perguntas: prev.perguntas.map((p, i) => i === idx ? { ...p, [field]: value } : p)
    }))
  }

  function addOpcao(pIdx) {
    setForm(prev => ({
      ...prev,
      perguntas: prev.perguntas.map((p, i) => i === pIdx ? { ...p, opcoes: [...p.opcoes, ''] } : p)
    }))
  }

  function removeOpcao(pIdx, oIdx) {
    setForm(prev => ({
      ...prev,
      perguntas: prev.perguntas.map((p, i) => i === pIdx ? { ...p, opcoes: p.opcoes.filter((_, j) => j !== oIdx) } : p)
    }))
  }

  function updateOpcao(pIdx, oIdx, value) {
    setForm(prev => ({
      ...prev,
      perguntas: prev.perguntas.map((p, i) => i === pIdx ? { ...p, opcoes: p.opcoes.map((o, j) => j === oIdx ? value : o) } : p)
    }))
  }

  // Response modal
  function abrirResposta(enq) {
    const initialResp = enq.perguntas.map(p => ({ perguntaId: p.id, valor: p.tipo === 'multipla' ? '' : '' }))
    setRespModal({ enqueteId: enq.id, enquete: enq, respostasForm: initialResp, bairro: '', observacao: '' })
  }

  function salvarResposta() {
    if (!respModal || !respModal.bairro) return
    const novaResp = {
      id: gerarId(),
      respostas: respModal.respostasForm,
      bairro: respModal.bairro,
      observacao: respModal.observacao,
      data: new Date().toISOString(),
    }
    setRespostas(prev => ({
      ...prev,
      [respModal.enqueteId]: [...(prev[respModal.enqueteId] || []), novaResp]
    }))
    setRespModal(null)
  }

  function updateResposta(idx, valor) {
    setRespModal(prev => ({
      ...prev,
      respostasForm: prev.respostasForm.map((r, i) => i === idx ? { ...r, valor } : r)
    }))
  }

  // Results view
  const enqueteResultado = enquetes.find(e => e.id === resultadoId)
  const respostasResultado = respostas[resultadoId] || []

  const abas = [
    { id: 'lista', label: 'Enquetes', icon: ClipboardList },
    { id: 'resultados', label: 'Resultados', icon: BarChart3 },
  ]

  const kpiStats = useMemo(() => [
    { label: 'Total de Enquetes', valor: stats.total, icon: ClipboardList, cor: '#3b82f6' },
    { label: 'Enquetes Ativas', valor: stats.ativas, icon: CheckCircle, cor: '#10b981' },
    { label: 'Total de Respostas', valor: stats.totalResp, icon: Users, cor: '#f59e0b' },
    { label: 'Bairros Cobertos', valor: stats.bairrosCobertura, icon: MapPin, cor: '#06b6d4' },
  ], [stats])

  return (
    <ModuleWrap className="pb-10 flex-1 overflow-auto">
      <PageHeader
        eyebrow="Campo"
        title="Pesquisa de Rua"
        subtitle="Crie enquetes, colete respostas em campo e analise os resultados"
        icon={ClipboardList}
        iconFrom="#1d4ed8"
        iconTo="#0891b2"
        glow="rgba(29,78,216,0.12)"
        actions={
          <Button onClick={novaEnquete} icon={Plus} style={{ padding: '10px 18px', fontSize: 13 }}>
            Nova Enquete
          </Button>
        }
      />

      <StatGrid stats={kpiStats} />

      <div className="flex gap-2 mb-5">
        {abas.map(a => {
          const Icon = a.icon
          const active = aba === a.id
          return (
            <button key={a.id} onClick={() => setAba(a.id)}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm transition-all"
              style={{
                background: active ? 'var(--accent)' : 'var(--bg-surface)',
                color: active ? '#fff' : 'var(--text-secondary)',
                border: active ? 'none' : '1px solid var(--border-subtle)',
              }}>
              <Icon size={16} /> {a.label}
            </button>
          )
        })}
      </div>

        {/* Lista de enquetes */}
        {aba === 'lista' && (
          <div className="space-y-4">
            {enquetes.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="Nenhuma enquete criada"
                subtitle='Clique em "Nova Enquete" para começar'
                action={<Button onClick={novaEnquete} icon={Plus}>Nova Enquete</Button>}
              />
            ) : enquetes.map(enq => {
              const count = (respostas[enq.id] || []).length
              return (
                <Card key={enq.id} className="p-6 anim-fade-up">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold" style={{ fontSize: 16, color: 'var(--text-primary)' }}>{enq.titulo}</h3>
                        <Pill color={enq.status === 'ativa' ? '#10b981' : 'rgba(203,213,235,0.60)'}>
                          {enq.status === 'ativa' ? 'Ativa' : 'Encerrada'}
                        </Pill>
                      </div>
                      {enq.descricao && <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{enq.descricao}</p>}
                      <div className="flex items-center gap-4 mt-3 flex-wrap" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        <span className="flex items-center gap-1"><ClipboardList size={11} /> {enq.perguntas.length} perguntas</span>
                        <span className="flex items-center gap-1"><Users size={11} /> {count} respostas</span>
                        <span className="flex items-center gap-1"><Clock size={11} /> {new Date(enq.criadoEm).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {enq.status === 'ativa' && (
                        <button onClick={() => abrirResposta(enq)}
                          className="btn-ghost flex items-center gap-1.5" style={{ padding: '6px 12px', fontSize: 11 }}>
                          <Send size={12} /> Responder
                        </button>
                      )}
                      <button onClick={() => { setResultadoId(enq.id); setAba('resultados') }}
                        className="btn-ghost flex items-center gap-1.5" style={{ padding: '6px 12px', fontSize: 11 }}>
                        <Eye size={12} /> Ver Resultados
                      </button>
                      <button onClick={() => editarEnquete(enq)} className="p-2 rounded-xl btn-ghost">
                        <Edit3 size={14} style={{ color: 'var(--text-tertiary)' }} />
                      </button>
                      <button onClick={() => toggleStatus(enq.id)} className="p-2 rounded-xl btn-ghost">
                        {enq.status === 'ativa' ? <Clock size={14} style={{ color: 'var(--warning)' }} /> : <CheckCircle size={14} style={{ color: 'var(--success)' }} />}
                      </button>
                      <button onClick={() => excluirEnquete(enq.id)} className="p-2 rounded-xl btn-ghost">
                        <Trash2 size={14} style={{ color: 'var(--danger)' }} />
                      </button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {/* Resultados */}
        {aba === 'resultados' && (
          <div className="space-y-5">
            <Card className="p-5 anim-fade-up">
              <label className="eyebrow block mb-2">Selecione a enquete:</label>
              <select value={resultadoId || ''} onChange={e => setResultadoId(e.target.value)}
                className={selectDark + ' w-full'} style={{ color: 'var(--text-primary)' }}>
                <option value="">-- Escolha uma enquete --</option>
                {enquetes.map(e => (
                  <option key={e.id} value={e.id}>{e.titulo} ({(respostas[e.id] || []).length} respostas)</option>
                ))}
              </select>
            </Card>

            {enqueteResultado && respostasResultado.length > 0 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label: 'TOTAL RESPOSTAS', value: respostasResultado.length, large: true },
                    { label: 'BAIRROS RESPONDERAM', value: new Set(respostasResultado.map(r => r.bairro)).size, large: true },
                    { label: 'ÚLTIMA RESPOSTA', value: new Date(respostasResultado[respostasResultado.length - 1].data).toLocaleDateString('pt-BR'), large: false },
                  ].map(s => (
                    <Card key={s.label} hover className="p-5 anim-fade-up">
                      <p className="eyebrow">{s.label}</p>
                      <p className="font-black tnum mt-1" style={{ fontSize: s.large ? 28 : 18, color: 'var(--text-primary)' }}>{s.value}</p>
                    </Card>
                  ))}
                </div>

                {/* Charts per question */}
                {enqueteResultado.perguntas.map((perg, pIdx) => {
                  if (perg.tipo === 'texto') {
                    const textos = respostasResultado
                      .map(r => r.respostas.find(a => a.perguntaId === perg.id)?.valor)
                      .filter(Boolean)
                    return (
                      <Card key={perg.id} className="p-6 anim-fade-up">
                        <h3 className="font-bold mb-3" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                          {pIdx + 1}. {perg.texto}
                        </h3>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {textos.map((t, i) => (
                            <div key={i} className="px-3 py-2 rounded-xl surface text-sm" style={{ color: 'var(--text-secondary)' }}>"{t}"</div>
                          ))}
                        </div>
                      </Card>
                    )
                  }

                  // Multiple choice - count votes
                  const contagem = {}
                  perg.opcoes.forEach(o => { contagem[o] = 0 })
                  respostasResultado.forEach(r => {
                    const resp = r.respostas.find(a => a.perguntaId === perg.id)
                    if (resp && contagem[resp.valor] !== undefined) contagem[resp.valor]++
                  })
                  const dados = Object.entries(contagem).map(([name, value]) => ({ name, value }))
                  const totalVotos = dados.reduce((s, d) => s + d.value, 0)

                  return (
                    <Card key={perg.id} className="p-6 anim-fade-up">
                      <h3 className="font-bold mb-4" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                        {pIdx + 1}. {perg.texto}
                      </h3>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={dados} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} />
                            <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} />
                            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', fontSize: 11, color: 'var(--text-primary)' }} />
                            <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                              {dados.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>

                        <div className="relative">
                          <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                              <Pie data={dados} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                                paddingAngle={2} dataKey="value"
                                label={(entry) => entry.value > 0 ? Math.round(entry.value / totalVotos * 100) + '%' : ''}
                                labelLine={false}>
                                {dados.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                              </Pie>
                              <Tooltip formatter={(v) => [v + ' votos']}
                                contentStyle={{ borderRadius: 12, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', fontSize: 11, color: 'var(--text-primary)' }} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3 mt-3">
                        {dados.map((d, i) => (
                          <div key={d.name} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CORES[i % CORES.length] }} />
                            {d.name}: <span className="font-bold">{d.value}</span>
                            {totalVotos > 0 && <span style={{ color: 'var(--text-tertiary)' }}>({Math.round(d.value / totalVotos * 100)}%)</span>}
                          </div>
                        ))}
                      </div>
                    </Card>
                  )
                })}

                <Card className="p-6 anim-fade-up">
                  <h3 className="font-bold mb-4 flex items-center gap-2" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                    <MapPin size={16} style={{ color: 'var(--info)' }} /> Respostas por Bairro
                  </h3>
                  <div className="space-y-2">
                    {(() => {
                      const porBairro = {}
                      respostasResultado.forEach(r => { porBairro[r.bairro] = (porBairro[r.bairro] || 0) + 1 })
                      const sorted = Object.entries(porBairro).sort((a, b) => b[1] - a[1])
                      const max = sorted[0]?.[1] || 1
                      return sorted.map(([bairro, count]) => (
                        <div key={bairro} className="flex items-center gap-3">
                          <span className="text-xs font-semibold w-32 truncate" style={{ color: 'var(--text-secondary)' }}>{bairro}</span>
                          <div className="flex-1 h-6 rounded-full overflow-hidden" style={{ background: 'var(--bg-overlay)' }}>
                            <div className="h-full rounded-full transition-all"
                              style={{ width: (count / max * 100) + '%', background: 'linear-gradient(90deg,#3b82f6,#2563eb)' }} />
                          </div>
                          <span className="text-xs font-bold w-8 text-right tnum" style={{ color: 'var(--text-primary)' }}>{count}</span>
                        </div>
                      ))
                    })()}
                  </div>
                </Card>
              </>
            )}

            {enqueteResultado && respostasResultado.length === 0 && (
              <EmptyState
                icon={BarChart3}
                title="Nenhuma resposta ainda"
                subtitle='Use o botão "Responder" para coletar dados em campo'
              />
            )}
          </div>
        )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 px-6 py-4 flex items-center justify-between z-10 surface"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <h2 className="font-bold" style={{ fontSize: 18, color: 'var(--text-primary)' }}>
                {modal === 'nova' ? 'Nova Enquete' : 'Editar Enquete'}
              </h2>
              <button onClick={() => setModal(null)} className="p-2 rounded-xl btn-ghost"><X size={18} style={{ color: 'var(--text-tertiary)' }} /></button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div>
                <label className="eyebrow block mb-1.5">Título da Enquete *</label>
                <input value={form.titulo} onChange={e => setForm(prev => ({ ...prev, titulo: e.target.value }))}
                  className={INPUT_CLS} style={{ color: 'var(--text-primary)' }}
                  placeholder="Ex: Intenção de Voto - Junho 2026" />
              </div>
              <div>
                <label className="eyebrow block mb-1.5">Descrição</label>
                <textarea value={form.descricao} onChange={e => setForm(prev => ({ ...prev, descricao: e.target.value }))}
                  className={INPUT_CLS + ' resize-none'} style={{ color: 'var(--text-primary)' }} rows={2}
                  placeholder="Descrição opcional da enquete..." />
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="eyebrow">Perguntas</label>
                  <button onClick={addPergunta}
                    className="flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--info)' }}>
                    <Plus size={12} /> Adicionar Pergunta
                  </button>
                </div>
                <div className="space-y-4">
                  {form.perguntas.map((p, pIdx) => (
                    <div key={p.id} className="p-4 rounded-2xl surface" style={{ border: '1px solid var(--border-subtle)' }}>
                      <div className="flex items-start gap-2 mb-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--info)' }}>{pIdx + 1}</span>
                        <input value={p.texto} onChange={e => updatePergunta(pIdx, 'texto', e.target.value)}
                          className={INPUT_CLS} style={{ color: 'var(--text-primary)' }}
                          placeholder="Texto da pergunta..." />
                        <select value={p.tipo} onChange={e => updatePergunta(pIdx, 'tipo', e.target.value)}
                          className={selectDark} style={{ color: 'var(--text-primary)' }}>
                          <option value="multipla">Múltipla Escolha</option>
                          <option value="texto">Texto Livre</option>
                        </select>
                        {form.perguntas.length > 1 && (
                          <button onClick={() => removePergunta(pIdx)} className="p-1 rounded-lg btn-ghost">
                            <Trash2 size={14} style={{ color: 'var(--danger)' }} />
                          </button>
                        )}
                      </div>
                      {p.tipo === 'multipla' && (
                        <div className="ml-8 space-y-2">
                          {p.opcoes.map((o, oIdx) => (
                            <div key={oIdx} className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ border: '2px solid var(--border-soft)' }} />
                              <input value={o} onChange={e => updateOpcao(pIdx, oIdx, e.target.value)}
                                className={INPUT_CLS} style={{ color: 'var(--text-primary)' }}
                                placeholder={'Opção ' + (oIdx + 1)} />
                              {p.opcoes.length > 2 && (
                                <button onClick={() => removeOpcao(pIdx, oIdx)} className="p-1 rounded btn-ghost">
                                  <X size={12} style={{ color: 'var(--danger)' }} />
                                </button>
                              )}
                            </div>
                          ))}
                          <button onClick={() => addOpcao(pIdx)}
                            className="text-xs font-bold ml-5" style={{ color: 'var(--info)' }}>
                            + Adicionar opção
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 px-6 py-4 flex justify-end gap-3 surface"
              style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button>
              <Button onClick={salvarEnquete}>{modal === 'nova' ? 'Criar Enquete' : 'Salvar'}</Button>
            </div>
          </Card>
        </div>
      )}

      {respModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 px-6 py-4 flex items-center justify-between z-10 surface"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <h2 className="font-bold" style={{ fontSize: 16, color: 'var(--text-primary)' }}>Responder Enquete</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{respModal.enquete.titulo}</p>
              </div>
              <button onClick={() => setRespModal(null)} className="p-2 rounded-xl btn-ghost"><X size={18} style={{ color: 'var(--text-tertiary)' }} /></button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div>
                <label className="eyebrow block mb-1.5">Bairro *</label>
                <select value={respModal.bairro} onChange={e => setRespModal(prev => ({ ...prev, bairro: e.target.value }))}
                  className={INPUT_CLS} style={{ color: 'var(--text-primary)' }}>
                  <option value="">Selecione o bairro...</option>
                  {BAIRROS_BLUMENAU.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              {respModal.enquete.perguntas.map((perg, pIdx) => (
                <div key={perg.id}>
                  <label className="text-xs font-bold block mb-2" style={{ color: 'var(--text-secondary)' }}>
                    {pIdx + 1}. {perg.texto}
                  </label>
                  {perg.tipo === 'multipla' ? (
                    <div className="space-y-2">
                      {perg.opcoes.filter(o => o.trim()).map(opcao => (
                        <label key={opcao}
                          className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all surface"
                          style={{
                            border: respModal.respostasForm[pIdx]?.valor === opcao ? '2px solid var(--info)' : '1px solid var(--border-subtle)',
                            background: respModal.respostasForm[pIdx]?.valor === opcao ? 'rgba(59,130,246,0.08)' : undefined,
                          }}>
                          <input type="radio" name={'perg-' + perg.id}
                            checked={respModal.respostasForm[pIdx]?.valor === opcao}
                            onChange={() => updateResposta(pIdx, opcao)}
                            className="accent-blue-600" />
                          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{opcao}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <textarea value={respModal.respostasForm[pIdx]?.valor || ''}
                      onChange={e => updateResposta(pIdx, e.target.value)}
                      className={INPUT_CLS + ' resize-none'} style={{ color: 'var(--text-primary)' }} rows={2}
                      placeholder="Digite a resposta..." />
                  )}
                </div>
              ))}

              <div>
                <label className="eyebrow block mb-1.5">Observação (opcional)</label>
                <textarea value={respModal.observacao}
                  onChange={e => setRespModal(prev => ({ ...prev, observacao: e.target.value }))}
                  className={INPUT_CLS + ' resize-none'} style={{ color: 'var(--text-primary)' }} rows={2}
                  placeholder="Anotações do cabo eleitoral..." />
              </div>
            </div>
            <div className="sticky bottom-0 px-6 py-4 flex justify-end gap-3 surface"
              style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <Button variant="ghost" onClick={() => setRespModal(null)}>Cancelar</Button>
              <Button onClick={salvarResposta} disabled={!respModal.bairro} icon={Send}>
                Enviar Resposta
              </Button>
            </div>
          </Card>
        </div>
      )}
    </ModuleWrap>
  )
}
