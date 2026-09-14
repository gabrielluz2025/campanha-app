import { useState, useRef, useEffect, useMemo } from 'react'
import { Plus, Trash2, Pencil, Check, X, Phone, MapPin, FileText, Clock, ChevronDown } from 'lucide-react'
import { flushAfterSave } from '../utils/persist'
import {
  uid, defaultCargoPorTipo, cargosAdmin, normalizarCargo,
  upsertPessoaNaEquipe, removerPessoaDaEquipe, removerMembroDaPrevisao, loadEquipe,
  membroParaPessoaPrevisao, CARGOS, pessoaId,
} from '../utils/equipeSync'
import {
  loadBairrosSc, listarCidadesSc, bairrosDaCidadeSc, inferirCidadeAtuacao,
} from '../utils/bairrosSc'
import { REGIOES } from '../utils/constants'
import CargoBalao from './CargoBalao'

function parseArea(v) {
  if (Array.isArray(v)) return v
  if (typeof v === 'string' && v.trim()) return v.split(',').map(s => s.trim()).filter(Boolean)
  return []
}

const fmt = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const VINCULOS = ['Voluntário', 'CLT', 'PJ', 'Autônomo', 'Estagiário', 'Comissionado', 'Outro']

const VAZIO = (valorPadrao, tipo, cargoFixo) => ({
  nome: '', telefone: '', email: '', cpf: '', contrato: '',
  vinculo: 'Voluntário', dataInicio: '',
  diasContratado: '', horasContratado: '',
  cidadeAtuacao: 'Blumenau',
  areaAtuacao: [], valor: valorPadrao,
  cargo: cargoFixo || defaultCargoPorTipo(tipo),
})

const inp = 'w-full border brd-soft srf rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400'

function MultiSelectBairros({ value, onChange, cidade, bairrosOpts = [] }) {
  const selecionados          = parseArea(value)
  const [aberto, setAberto]   = useState(false)
  const [busca, setBusca]     = useState('')
  const [modo, setModo]       = useState('bairro') // 'bairro' | 'regiao'
  const ref                   = useRef(null)
  const ehBlumenau = (cidade || '').toLowerCase() === 'blumenau'
  const lista = bairrosOpts.length ? bairrosOpts : []

  useEffect(() => {
    function fora(e) { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  useEffect(() => {
    if (!ehBlumenau && modo === 'regiao') setModo('bairro')
  }, [ehBlumenau, modo])

  const filtrados = lista.filter(b => b.toLowerCase().includes(busca.toLowerCase()))

  function toggle(b) {
    onChange(selecionados.includes(b) ? selecionados.filter(x => x !== b) : [...selecionados, b])
  }

  function toggleRegiao(regiao) {
    const reg = REGIOES[regiao] || []
    const todosJaSel = reg.every(b => selecionados.includes(b))
    onChange(todosJaSel
      ? selecionados.filter(b => !reg.includes(b))
      : [...new Set([...selecionados, ...reg])]
    )
  }

  function statusRegiao(regiao) {
    const reg = REGIOES[regiao] || []
    const n = reg.filter(b => selecionados.includes(b)).length
    if (n === 0) return 'none'
    if (n === reg.length) return 'all'
    return 'partial'
  }

  if (!cidade) {
    return (
      <div className={inp + ' flex items-center'} style={{ minHeight: 32, opacity: 0.7 }}>
        <span className="txt-3">Selecione a cidade primeiro...</span>
      </div>
    )
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className={inp + ' text-left flex items-center justify-between gap-1 cursor-pointer'}
        style={{ minHeight: 32 }}
      >
        <span className="flex-1 flex flex-wrap gap-1 min-w-0 overflow-hidden">
          {selecionados.length === 0 ? (
            <span className="txt-3">Selecione os bairros de {cidade}...</span>
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

          {ehBlumenau && (
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
          )}

          {modo === 'bairro' && (
            <>
              <div className="p-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <input
                  value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder={`Buscar bairro em ${cidade}...`}
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

          {modo === 'regiao' && ehBlumenau && (
            <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
              {Object.entries(REGIOES).map(([regiao, bairros]) => {
                const st = statusRegiao(regiao)
                const nSel = bairros.filter(b => selecionados.includes(b)).length
                return (
                  <div key={regiao}>
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

          <div className="px-3 py-1.5 flex justify-between items-center"
            style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <span className="text-xs txt-3">
              {selecionados.length} bairro{selecionados.length !== 1 ? 's' : ''} · {cidade}
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

function AreaAtuacaoCampos({ dados, onChange }) {
  const [mapa, setMapa] = useState(null)

  useEffect(() => {
    loadBairrosSc().then(setMapa).catch(() => {})
  }, [])

  const cidades = useMemo(() => listarCidadesSc(mapa), [mapa])
  const cidade = dados.cidadeAtuacao
    || inferirCidadeAtuacao(mapa, parseArea(dados.areaAtuacao))
    || 'Blumenau'
  const bairrosOpts = useMemo(() => bairrosDaCidadeSc(mapa, cidade), [mapa, cidade])

  function setCidade(nova) {
    const mesma = (cidade || '').toLowerCase() === (nova || '').toLowerCase()
    onChange({
      ...dados,
      cidadeAtuacao: nova,
      areaAtuacao: mesma ? parseArea(dados.areaAtuacao) : [],
    })
  }

  return (
    <div className="col-span-2 space-y-2">
      <div>
        <label className="text-xs txt-3 mb-0.5 block">Cidade de atuação *</label>
        <select
          value={cidades.includes(cidade) ? cidade : (cidade || '')}
          onChange={e => setCidade(e.target.value)}
          className={inp}
        >
          <option value="">Selecione a cidade...</option>
          {!cidades.includes(cidade) && cidade ? (
            <option value={cidade}>{cidade}</option>
          ) : null}
          {cidades.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs txt-3 mb-0.5 block">Bairro / Setor de atuação</label>
        <MultiSelectBairros
          value={dados.areaAtuacao}
          onChange={v => onChange({ ...dados, areaAtuacao: v, cidadeAtuacao: cidade })}
          cidade={cidade}
          bairrosOpts={bairrosOpts}
        />
      </div>
    </div>
  )
}

function FormPessoa({ dados, onChange, labelValor, tipo, cargoFixo: cargoFixoProp }) {
  const f = (campo, val) => onChange({ ...dados, [campo]: val })
  const cargoFixo = cargoFixoProp
    || (tipo === 'cabo'
      ? 'Cabo Eleitoral'
      : tipo === 'rua'
        ? 'Pessoal de Rua'
        : tipo === 'voluntario'
          ? 'Apoiador'
          : tipo === 'multiplicador'
            ? 'Multiplicador'
            : null)
  // Admin: cargo sempre editável (mesmo dentro do card Coordenador / Comunicação)
  const cargoEditavel = tipo === 'admin'
  const cargosOpts = tipo === 'admin'
    ? [...new Set([...cargosAdmin(), ...(CARGOS || [])])]
    : []
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="col-span-2">
        <label className="text-xs txt-3 mb-0.5 block">Nome completo *</label>
        <input value={dados.nome || ''} onChange={e => f('nome', e.target.value)}
          className={inp} placeholder="Nome completo" />
      </div>
      {cargoEditavel ? (
        <div className="col-span-2">
          <label className="text-xs txt-3 mb-0.5 block">Função / Cargo</label>
          <div className="flex items-center gap-2">
            <select value={dados.cargo || cargoFixo || 'Coordenador'}
              onChange={e => f('cargo', e.target.value)} className={inp}>
              {cargosOpts.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <CargoBalao cargo={dados.cargo || cargoFixo || 'Coordenador'} size="lg" />
          </div>
        </div>
      ) : cargoFixo ? (
        <div className="col-span-2">
          <label className="text-xs txt-3 mb-0.5 block">Função</label>
          <div className="pt-0.5"><CargoBalao cargo={cargoFixo} size="lg" /></div>
        </div>
      ) : null}
      <div>
        <label className="text-xs txt-3 mb-0.5 block">Telefone</label>
        <input value={dados.telefone || ''} onChange={e => f('telefone', e.target.value)}
          className={inp} placeholder="(47) 99999-9999" />
      </div>
      <div>
        <label className="text-xs txt-3 mb-0.5 block">E-mail</label>
        <input value={dados.email || ''} onChange={e => f('email', e.target.value)}
          className={inp} placeholder="email@exemplo.com" />
      </div>
      <div>
        <label className="text-xs txt-3 mb-0.5 block">CPF</label>
        <input value={dados.cpf || ''} onChange={e => f('cpf', e.target.value)}
          className={inp} placeholder="000.000.000-00" />
      </div>
      <div>
        <label className="text-xs txt-3 mb-0.5 block">Nº do Contrato</label>
        <input value={dados.contrato || ''} onChange={e => f('contrato', e.target.value)}
          className={inp} placeholder="001/2026" />
      </div>
      <div>
        <label className="text-xs txt-3 mb-0.5 block">Tipo de vínculo</label>
        <select value={dados.vinculo || 'Voluntário'} onChange={e => f('vinculo', e.target.value)} className={inp}>
          {VINCULOS.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs txt-3 mb-0.5 block">Data de início</label>
        <input type="date" value={(dados.dataInicio || '').slice(0, 10)}
          onChange={e => f('dataInicio', e.target.value)}
          className={inp} style={{ colorScheme: 'dark' }} />
      </div>
      <AreaAtuacaoCampos dados={dados} onChange={onChange} />
      <div>
        <label className="text-xs txt-3 mb-0.5 block">Dias contratados</label>
        <input type="number" min="0" value={dados.diasContratado ?? ''}
          onChange={e => f('diasContratado', e.target.value)}
          className={inp + ' text-right'} placeholder="0" />
      </div>
      <div>
        <label className="text-xs txt-3 mb-0.5 block">Horas por dia</label>
        <input type="number" min="0" value={dados.horasContratado ?? ''}
          onChange={e => f('horasContratado', e.target.value)}
          className={inp + ' text-right'} placeholder="0" />
      </div>
      <div className="col-span-2">
        <label className="text-xs txt-3 mb-0.5 block">
          {tipo === 'voluntario' ? 'Remuneração' : `${labelValor} (R$)`}
        </label>
        {tipo === 'voluntario' ? (
          <p className="text-xs txt-3 py-1.5 px-2 rounded-lg border brd-soft srf">
            Sem remuneração (R$ 0)
          </p>
        ) : (
          <input type="number" min="0" step="any" value={dados.valor ?? ''}
            onChange={e => f('valor', e.target.value)}
            className={inp + ' text-right font-semibold'} />
        )}
      </div>
    </div>
  )
}

export default function ListaPessoas({ pessoas, onAdd, onUpdate, onRemove, valorPadrao, disabled, tipo, cor, cargoFixo }) {
  const [showForm, setShowForm] = useState(false)
  const [novoForm, setNovoForm] = useState(VAZIO(valorPadrao, tipo, cargoFixo))
  const [editandoId, setEditandoId] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [errNome, setErrNome] = useState(false)

  const LABELS = {
    cabo:          ['cabo eleitoral', 'cabos eleitorais'],
    rua:           ['pessoal de rua', 'pessoas de rua'],
    voluntario:    ['voluntário', 'voluntários'],
    multiplicador: ['multiplicador', 'multiplicadores'],
    admin:         ['membro da equipe', 'membros da equipe'],
  }
  const labelCargo = cargoFixo
    ? [cargoFixo.toLowerCase(), `${cargoFixo.toLowerCase()}s`]
    : null
  const [labelSing, labelPlur] = labelCargo || LABELS[tipo] || LABELS.rua
  const labelValor = 'Valor total do contrato'

  const totalLista = pessoas.reduce((s, p) => s + (Number(p.valor) || 0), 0)

  function prepararPessoa(p) {
    const equipeId = p.equipeId || p.id || uid()
    const cargoPadrao = cargoFixo || defaultCargoPorTipo(tipo)
    // Em admin o cargo do formulário manda; nos outros tipos o card fixa o cargo
    const forcarCargo = tipo === 'rua' || tipo === 'voluntario'
      || tipo === 'multiplicador' || tipo === 'cabo'
    const bruto = p.valor
    let valor
    if (bruto === '' || bruto == null) {
      valor = valorPadrao
    } else {
      const n = Number(String(bruto).replace(',', '.'))
      valor = Number.isFinite(n) ? n : valorPadrao
    }
    const area = parseArea(p.areaAtuacao)
    return {
      ...p,
      id: equipeId,
      equipeId,
      cidadeAtuacao: p.cidadeAtuacao || 'Blumenau',
      areaAtuacao: area,
      bairros: area,
      cargo: forcarCargo
        ? cargoPadrao
        : normalizarCargo(p.cargo || cargoPadrao),
      valor,
      email: p.email || '',
      cpf: p.cpf || '',
      vinculo: p.vinculo || 'Voluntário',
      dataInicio: p.dataInicio || '',
    }
  }

  function salvarNovo() {
    if (!novoForm.nome.trim()) { setErrNome(true); return }
    setErrNome(false)
    const pessoa = prepararPessoa(novoForm)
    onAdd(pessoa)
    upsertPessoaNaEquipe(pessoa, tipo)
    setNovoForm(VAZIO(valorPadrao, tipo, cargoFixo))
    setShowForm(false)
    flushAfterSave()
  }

  function salvarEdicao() {
    if (!editForm.nome.trim()) return
    const pessoa = prepararPessoa(editForm)
    onUpdate(editandoId, pessoa)
    upsertPessoaNaEquipe(pessoa, tipo)
    setEditandoId(null)
    setEditForm(null)
    flushAfterSave()
  }

  function iniciarEdicao(p) {
    // Hidrata com o cadastro completo da Equipe (evita abrir só metade dos dados)
    const membro = loadEquipe().find(m => String(m.id) === String(p.equipeId || p.id))
    const daEquipe = membro ? membroParaPessoaPrevisao(membro) : null
    const areaPrev = parseArea(p.areaAtuacao)
    const areaEq = daEquipe ? parseArea(daEquipe.areaAtuacao) : []
    const area = areaPrev.length ? areaPrev : areaEq
    setEditandoId(p.id)
    setEditForm({
      ...(daEquipe || {}),
      ...p,
      nome: p.nome || daEquipe?.nome || '',
      telefone: p.telefone || daEquipe?.telefone || '',
      email: p.email || daEquipe?.email || membro?.email || '',
      cpf: p.cpf || daEquipe?.cpf || membro?.cpf || '',
      contrato: p.contrato || daEquipe?.contrato || '',
      vinculo: p.vinculo || daEquipe?.vinculo || membro?.vinculo || 'Voluntário',
      dataInicio: p.dataInicio || daEquipe?.dataInicio || membro?.dataInicio || '',
      diasContratado: p.diasContratado || daEquipe?.diasContratado || '',
      horasContratado: p.horasContratado || daEquipe?.horasContratado || '',
      valor: (p.valor !== '' && p.valor != null) ? p.valor : (daEquipe?.valor ?? valorPadrao),
      cargo: p.cargo || daEquipe?.cargo || cargoFixo || defaultCargoPorTipo(tipo),
      cidadeAtuacao: p.cidadeAtuacao || daEquipe?.cidadeAtuacao
        || inferirCidadeAtuacao(null, area) || 'Blumenau',
      areaAtuacao: area,
    })
  }

  function cancelar() {
    setShowForm(false)
    setEditandoId(null)
    setEditForm(null)
    setErrNome(false)
    setNovoForm(VAZIO(valorPadrao, tipo, cargoFixo))
  }

  return (
    <div className="space-y-3">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold txt-1 capitalize">{labelPlur}</p>
          <p className="text-xs txt-3">{pessoas.length} cadastrado{pessoas.length !== 1 ? 's' : ''} · {fmt(totalLista)}</p>
        </div>
        {!disabled && !showForm && !editandoId && (
          <button type="button" onClick={() => setShowForm(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white"
            style={{ background: cor || '#2563eb' }}>
            <Plus size={13} /> Adicionar
          </button>
        )}
      </div>

      {showForm && (
        <div className="rounded-xl border brd-soft p-3 space-y-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <FormPessoa dados={novoForm} onChange={setNovoForm} labelValor={labelValor} tipo={tipo} cargoFixo={cargoFixo} />
          {errNome && <p className="text-xs text-red-400">Informe o nome.</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={cancelar} className="px-3 py-1.5 rounded-lg text-xs font-semibold txt-2 border brd-soft">Cancelar</button>
            <button type="button" onClick={salvarNovo}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: cor || '#2563eb' }}>
              Salvar
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {pessoas.map(p => (
          <div key={p.id} className="rounded-xl border brd-soft p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
            {editandoId === p.id && editForm ? (
              <div className="space-y-3">
                <FormPessoa dados={editForm} onChange={setEditForm} labelValor={labelValor} tipo={tipo} cargoFixo={cargoFixo} />
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={cancelar} className="px-3 py-1.5 rounded-lg text-xs font-semibold txt-2 border brd-soft">
                    <X size={12} className="inline mr-1" />Cancelar
                  </button>
                  <button type="button" onClick={salvarEdicao}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1" style={{ background: '#059669' }}>
                    <Check size={12} /> Salvar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold txt-1 truncate">{p.nome}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {p.telefone && (
                      <span className="text-xs txt-3 flex items-center gap-1"><Phone size={10} />{p.telefone}</span>
                    )}
                    {p.contrato && (
                      <span className="text-xs txt-3 flex items-center gap-1"><FileText size={10} />{p.contrato}</span>
                    )}
                    {(p.diasContratado || p.horasContratado) && (
                      <span className="text-xs txt-3 flex items-center gap-1">
                        <Clock size={10} />
                        {p.diasContratado ? `${p.diasContratado}d` : ''}
                        {p.diasContratado && p.horasContratado ? ' · ' : ''}
                        {p.horasContratado ? `${p.horasContratado}h/dia` : ''}
                      </span>
                    )}
                    {(p.cidadeAtuacao || parseArea(p.areaAtuacao).length > 0) && (
                      <span className="text-xs txt-3 flex items-center gap-1">
                        <MapPin size={10} />
                        {[p.cidadeAtuacao, parseArea(p.areaAtuacao).join(', ')].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-bold mt-1" style={{ color: cor || '#60a5fa' }}>{fmt(p.valor || 0)}</p>
                </div>
                {!disabled && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button type="button" onClick={() => iniciarEdicao(p)} className="p-1.5 rounded-lg hov-srf txt-2">
                      <Pencil size={13} />
                    </button>
                    <button type="button" onClick={() => {
                      const eid = pessoaId(p) || p.equipeId || p.id
                      onRemove(p.id)
                      if (eid) {
                        removerPessoaDaEquipe(eid)
                        removerMembroDaPrevisao(eid)
                      }
                      flushAfterSave()
                    }}
                      className="p-1.5 rounded-lg hov-srf text-red-400">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {pessoas.length === 0 && !showForm && (
          <p className="text-xs txt-3 text-center py-4">Nenhum {labelSing} cadastrado.</p>
        )}
      </div>
    </div>
  )
}
