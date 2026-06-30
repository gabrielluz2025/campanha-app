import { useState, useRef, useEffect } from 'react'
import { Plus, Trash2, Pencil, Check, X, Phone, MapPin, FileText, Clock, ChevronDown } from 'lucide-react'

const BAIRROS_BLUMENAU = [
  'Água Verde', 'Badenfurt', 'Boa Vista', 'Bom Retiro', 'Centro',
  'Escola Agrícola', 'Fidélis', 'Fortaleza', 'Fortaleza Alta', 'Garcia',
  'Glória', 'Itoupava Central', 'Itoupava Norte', 'Itoupava Seca', 'Itoupavazinha',
  'Jardim Blumenau', 'Nova Esperança', 'Passo Manso', 'Ponta Aguda', 'Progresso',
  'Ribeirão Fresco', 'Salto', 'Salto do Norte', 'Salto Weissbach', 'Testo Salto',
  'Tribess', 'Valparaíso', 'Velha', 'Velha Central', 'Velha Grande',
  'Victor Konder', 'Vila Formosa', 'Vila Itoupava', 'Vila Nova', 'Vorstadt',
]

const REGIOES = {
  'Centro': ['Centro', 'Vorstadt', 'Victor Konder', 'Ponta Aguda', 'Jardim Blumenau', 'Salto'],
  'Norte':  ['Itoupava Norte', 'Itoupava Central', 'Itoupava Seca', 'Itoupavazinha', 'Escola Agrícola', 'Badenfurt', 'Testo Salto', 'Vila Itoupava'],
  'Sul':    ['Garcia', 'Glória', 'Velha', 'Velha Central', 'Velha Grande', 'Boa Vista', 'Valparaíso', 'Bom Retiro', 'Vila Formosa', 'Vila Nova'],
  'Leste':  ['Fortaleza', 'Fortaleza Alta', 'Fidélis', 'Progresso', 'Salto do Norte', 'Salto Weissbach', 'Tribess'],
  'Oeste':  ['Água Verde', 'Passo Manso', 'Nova Esperança', 'Ribeirão Fresco'],
}

function parseArea(v) {
  if (Array.isArray(v)) return v
  if (typeof v === 'string' && v.trim()) return v.split(',').map(s => s.trim()).filter(Boolean)
  return []
}

const fmt = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const VAZIO = (valorPadrao) => ({
  nome: '', telefone: '', contrato: '',
  diasContratado: '', horasContratado: '',
  areaAtuacao: [], valor: valorPadrao,
})

const inp = 'w-full border brd-soft srf rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400'

function MultiSelectBairros({ value, onChange }) {
  const selecionados          = parseArea(value)
  const [aberto, setAberto]   = useState(false)
  const [busca, setBusca]     = useState('')
  const [modo, setModo]       = useState('bairro') // 'bairro' | 'regiao'
  const ref                   = useRef(null)

  useEffect(() => {
    function fora(e) { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  const filtrados = BAIRROS_BLUMENAU.filter(b => b.toLowerCase().includes(busca.toLowerCase()))

  function toggle(b) {
    onChange(selecionados.includes(b) ? selecionados.filter(x => x !== b) : [...selecionados, b])
  }

  function toggleRegiao(regiao) {
    const lista = REGIOES[regiao] || []
    const todosJaSel = lista.every(b => selecionados.includes(b))
    onChange(todosJaSel
      ? selecionados.filter(b => !lista.includes(b))
      : [...new Set([...selecionados, ...lista])]
    )
  }

  function statusRegiao(regiao) {
    const lista = REGIOES[regiao] || []
    const n = lista.filter(b => selecionados.includes(b)).length
    if (n === 0) return 'none'
    if (n === lista.length) return 'all'
    return 'partial'
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className={inp + ' text-left flex items-center justify-between gap-1 cursor-pointer'}
        style={{ minHeight: 32 }}
      >
        <span className="flex-1 flex flex-wrap gap-1 min-w-0 overflow-hidden">
          {selecionados.length === 0 ? (
            <span className="txt-3">Selecione os bairros...</span>
          ) : selecionados.length <= 3 ? (
            selecionados.map(b => (
              <span key={b} className="px-1.5 py-0.5 rounded font-medium"
                style={{ fontSize: 10, background:'rgba(37,99,235,0.18)', color:'#93c5fd' }}>{b}</span>
            ))
          ) : (
            <>
              {selecionados.slice(0, 2).map(b => (
                <span key={b} className="px-1.5 py-0.5 rounded font-medium"
                  style={{ fontSize: 10, background:'rgba(37,99,235,0.18)', color:'#93c5fd' }}>{b}</span>
              ))}
              <span className="px-1.5 py-0.5 rounded"
                style={{ fontSize: 10, background:'rgba(37,99,235,0.12)', color:'#60a5fa' }}>+{selecionados.length - 2} mais</span>
            </>
          )}
        </span>
        <ChevronDown size={12} className={`flex-shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`}
          style={{ color: 'rgba(203,213,235,0.45)' }} />
      </button>

      {aberto && (
        <div className="absolute z-50 left-0 right-0 mt-1 srf rounded-xl shadow-xl border brd-soft overflow-hidden"
          style={{ top: '100%' }}>

          {/* Mode toggle */}
          <div className="flex p-1.5 gap-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            {[['bairro', 'Por Bairro'], ['regiao', 'Por Região']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => { setModo(id); setBusca('') }}
                className="flex-1 py-1 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  background: modo === id ? '#3b82f6' : 'rgba(255,255,255,0.07)',
                  color:      modo === id ? '#fff'    : 'rgba(203,213,235,0.55)',
                }}>
                {label}
              </button>
            ))}
          </div>

          {/* ─── Por Bairro ─── */}
          {modo === 'bairro' && (
            <>
              <div className="p-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <input
                  value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar bairro..."
                  className="w-full border brd-soft rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                  autoFocus
                />
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: 200 }}>
                {filtrados.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs txt-3">Nenhum bairro encontrado</div>
                ) : filtrados.map(b => {
                  const sel = selecionados.includes(b)
                  return (
                    <button key={b} type="button" onClick={() => toggle(b)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 hov-srf transition-colors text-left">
                      <div className={`w-3.5 h-3.5 rounded flex-shrink-0 border flex items-center justify-center
                        ${sel ? 'bg-blue-500 border-blue-500' : 'brd-soft'}`}>
                        {sel && <Check size={9} className="text-white" />}
                      </div>
                      <span className={`text-xs ${sel ? 'font-semibold txt-1' : 'txt-2'}`}>{b}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* ─── Por Região ─── */}
          {modo === 'regiao' && (
            <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
              {Object.entries(REGIOES).map(([regiao, bairros]) => {
                const st = statusRegiao(regiao)
                const nSel = bairros.filter(b => selecionados.includes(b)).length
                return (
                  <div key={regiao}>
                    {/* Cabeçalho da região */}
                    <div className="flex items-center justify-between px-3 py-1.5"
                      style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold txt-2">{regiao}</span>
                        {nSel > 0 && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                            style={{ background: 'rgba(37,99,235,0.22)', color: '#1d4ed8', fontSize: 9 }}>
                            {nSel}/{bairros.length}
                          </span>
                        )}
                      </div>
                      <button type="button" onClick={() => toggleRegiao(regiao)}
                        className="text-xs px-2 py-0.5 rounded-full font-semibold transition-colors"
                        style={{
                          background: st === 'all' ? '#3b82f6' : st === 'partial' ? 'rgba(37,99,235,0.22)' : 'rgba(255,255,255,0.07)',
                          color:      st === 'all' ? '#fff'    : st === 'partial' ? '#1d4ed8' : 'rgba(203,213,235,0.55)',
                        }}>
                        {st === 'all' ? 'Remover todos' : 'Selecionar todos'}
                      </button>
                    </div>
                    {/* Bairros da região */}
                    {bairros.map(b => {
                      const sel = selecionados.includes(b)
                      return (
                        <button key={b} type="button" onClick={() => toggle(b)}
                          className="w-full flex items-center gap-2 px-4 py-1.5 hov-srf transition-colors text-left">
                          <div className={`w-3.5 h-3.5 rounded flex-shrink-0 border flex items-center justify-center
                            ${sel ? 'bg-blue-500 border-blue-500' : 'brd-soft'}`}>
                            {sel && <Check size={9} className="text-white" />}
                          </div>
                          <span className={`text-xs ${sel ? 'font-semibold txt-1' : 'txt-2'}`}>{b}</span>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}

          {/* Footer */}
          <div className="px-3 py-1.5 flex justify-between items-center"
            style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <span className="text-xs txt-3">
              {selecionados.length} bairro{selecionados.length !== 1 ? 's' : ''} selecionado{selecionados.length !== 1 ? 's' : ''}
            </span>
            {selecionados.length > 0 && (
              <button type="button" onClick={() => onChange([])}
                className="text-xs text-red-400 hover:text-red-600 transition-colors">
                Limpar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FormPessoa({ dados, onChange, labelValor }) {
  const f = (campo, val) => onChange({ ...dados, [campo]: val })
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="col-span-2">
        <label className="text-xs txt-3 mb-0.5 block">Nome completo *</label>
        <input value={dados.nome} onChange={e => f('nome', e.target.value)}
          className={inp} placeholder="Nome completo" />
      </div>
      <div>
        <label className="text-xs txt-3 mb-0.5 block">Telefone</label>
        <input value={dados.telefone} onChange={e => f('telefone', e.target.value)}
          className={inp} placeholder="(47) 99999-9999" />
      </div>
      <div>
        <label className="text-xs txt-3 mb-0.5 block">Nº do Contrato</label>
        <input value={dados.contrato} onChange={e => f('contrato', e.target.value)}
          className={inp} placeholder="001/2026" />
      </div>
      <div className="col-span-2">
        <label className="text-xs txt-3 mb-0.5 block">Área de Atuação</label>
        <MultiSelectBairros value={dados.areaAtuacao} onChange={v => f('areaAtuacao', v)} />
      </div>
      <div>
        <label className="text-xs txt-3 mb-0.5 block">Dias contratados</label>
        <input type="number" min="0" value={dados.diasContratado}
          onChange={e => f('diasContratado', e.target.value)}
          className={inp + ' text-right'} placeholder="0" />
      </div>
      <div>
        <label className="text-xs txt-3 mb-0.5 block">Horas por dia</label>
        <input type="number" min="0" value={dados.horasContratado}
          onChange={e => f('horasContratado', e.target.value)}
          className={inp + ' text-right'} placeholder="0" />
      </div>
      <div className="col-span-2">
        <label className="text-xs txt-3 mb-0.5 block">{labelValor} (R$)</label>
        <input type="number" min="0" step="any" value={dados.valor}
          onChange={e => f('valor', e.target.value)}
          className={inp + ' text-right font-semibold'} />
      </div>
    </div>
  )
}

export default function ListaPessoas({ pessoas, onAdd, onUpdate, onRemove, valorPadrao, disabled, tipo, cor }) {
  const [showForm, setShowForm] = useState(false)
  const [novoForm, setNovoForm] = useState(VAZIO(valorPadrao))
  const [editandoId, setEditandoId] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [errNome, setErrNome] = useState(false)

  const LABELS = {
    cabo:  ['cabo eleitoral', 'cabos eleitorais'],
    rua:   ['pessoa de rua', 'pessoas de rua'],
    admin: ['membro da equipe', 'membros da equipe'],
  }
  const [labelSing, labelPlur] = LABELS[tipo] || LABELS.rua
  const labelValor = 'Valor total do contrato'

  const totalLista = pessoas.reduce((s, p) => s + (Number(p.valor) || 0), 0)

  function salvarNovo() {
    if (!novoForm.nome.trim()) { setErrNome(true); return }
    setErrNome(false)
    onAdd({ ...novoForm, id: Date.now(), valor: Number(novoForm.valor) || valorPadrao })
    setNovoForm(VAZIO(valorPadrao))
    setShowForm(false)
  }

  function salvarEdicao() {
    if (!editForm.nome.trim()) return
    onUpdate(editandoId, { ...editForm, valor: Number(editForm.valor) || 0 })
    setEditandoId(null)
    setEditForm(null)
  }

  function iniciarEdicao(p) {
    setEditandoId(p.id)
    setEditForm({ ...p })
    setShowForm(false)
  }

  return (
    <div className="space-y-2 mt-1">

      {/* Barra de ação */}
      <div className="flex items-center justify-between">
        <span className="text-xs txt-3">
          {pessoas.length === 0
            ? `Nenhum ${labelSing} adicionado`
            : `${pessoas.length} ${pessoas.length === 1 ? labelSing : labelPlur}`}
        </span>
        {!disabled && (
          <button
            onClick={() => { setShowForm(v => !v); setEditandoId(null); setErrNome(false) }}
            className="flex items-center gap-1 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ backgroundColor: cor }}
          >
            <Plus size={12} /> Adicionar
          </button>
        )}
      </div>

      {/* Formulário de adição */}
      {showForm && !disabled && (
        <div className="srf-soft border brd-soft rounded-xl p-3 space-y-3">
          <p className="text-xs font-semibold txt-2 uppercase tracking-wide">Novo {labelSing}</p>
          <FormPessoa dados={novoForm} onChange={setNovoForm} labelValor={labelValor} />
          {errNome && <p className="text-xs text-red-500">Nome é obrigatório.</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={salvarNovo}
              className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium">
              <Check size={11} /> Salvar
            </button>
            <button onClick={() => { setShowForm(false); setNovoForm(VAZIO(valorPadrao)); setErrNome(false) }}
              className="flex items-center gap-1 txt-3 border brd-soft srf text-xs px-3 py-1.5 rounded-lg">
              <X size={11} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Estado vazio */}
      {pessoas.length === 0 && !showForm && (
        <div className="border border-dashed brd-soft rounded-xl py-5 text-center text-xs txt-3">
          Clique em "Adicionar" para cadastrar o primeiro {labelSing}
        </div>
      )}

      {/* Lista */}
      <div className="space-y-1.5">
        {pessoas.map(p => (
          <div key={p.id}>
            {editandoId === p.id ? (
              <div className="rounded-xl p-3 space-y-3" style={{ background:'rgba(245,158,11,0.10)', border:'1px solid rgba(245,158,11,0.25)' }}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color:'#fbbf24' }}>Editando: {p.nome}</p>
                <FormPessoa dados={editForm} onChange={setEditForm} labelValor={labelValor} />
                <div className="flex gap-2">
                  <button onClick={salvarEdicao}
                    className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium">
                    <Check size={11} /> Salvar
                  </button>
                  <button onClick={() => { setEditandoId(null); setEditForm(null) }}
                    className="flex items-center gap-1 txt-3 border brd-soft srf text-xs px-3 py-1.5 rounded-lg">
                    <X size={11} /> Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="srf border brd-soft hover:brd-soft rounded-xl px-3 py-2.5 flex items-start gap-3 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-semibold txt-1 truncate">{p.nome || '(sem nome)'}</p>
                    {p.contrato && (
                      <span className="flex items-center gap-0.5 text-xs txt-3 srf-soft border brd-soft px-1.5 py-0.5 rounded-md flex-shrink-0">
                        <FileText size={9} /> {p.contrato}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {p.telefone && (
                      <span className="flex items-center gap-0.5 text-xs txt-3">
                        <Phone size={9} /> {p.telefone}
                      </span>
                    )}
                    {parseArea(p.areaAtuacao).length > 0 && (
                      <span className="flex items-center gap-0.5 text-xs txt-3">
                        <MapPin size={9} /> {parseArea(p.areaAtuacao).join(', ')}
                      </span>
                    )}
                    {(p.diasContratado || p.horasContratado) && (
                      <span className="flex items-center gap-0.5 text-xs txt-3">
                        <Clock size={9} />
                        {p.diasContratado ? `${p.diasContratado} dias` : ''}
                        {p.diasContratado && p.horasContratado ? ' · ' : ''}
                        {p.horasContratado ? `${p.horasContratado}h/dia` : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-xs font-bold txt-2">{fmt(p.valor)}</span>
                  {!disabled && (
                    <>
                      <button onClick={() => iniciarEdicao(p)}
                        className="p-1 hov-srf txt-4 rounded-lg transition-colors">
                        <Pencil size={11} />
                      </button>
                      <button onClick={() => onRemove(p.id)}
                        className="p-1 hov-srf txt-4 rounded-lg transition-colors">
                        <Trash2 size={11} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Rodapé com total */}
      {pessoas.length > 0 && (
        <div className="flex justify-between items-center text-xs font-semibold txt-2 pt-1.5 border-t brd-soft">
          <span>{pessoas.length} {pessoas.length === 1 ? labelSing : labelPlur}</span>
          <span style={{ color: cor }}>{fmt(totalLista)}</span>
        </div>
      )}
    </div>
  )
}
