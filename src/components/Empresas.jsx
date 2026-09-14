import { useState, useEffect, useMemo } from 'react'
import {
  Building2, Plus, Search, Trash2, Edit3, X, Phone, Mail,
  MapPin, Briefcase, User, CreditCard, DollarSign,
} from 'lucide-react'
import { confirmAction } from '../utils/confirm'
import { useCanViewFinance } from '../context/AccessContext'
import SaveButton from './SaveButton'
import { flushAfterSave, writeStorage } from '../utils/persist'
import { SYNC_EVENT, SYNC_STORAGE_EVENT } from '../lib/cloudSync'
import { publicarPrevisaoResumo } from '../utils/previsaoCalculo'
import { PageHeader, ModuleWrap, KpiStrip, Button, EmptyState } from './ui'

const STORAGE_KEY = 'empresas_lista'

const CATEGORIAS = {
  grafica: { label: 'Gráfica / Material', cor: '#3b82f6' },
  comunicacao: { label: 'Comunicação / Mídia', cor: '#06b6d4' },
  transporte: { label: 'Transporte / Logística', cor: '#f59e0b' },
  alimentacao: { label: 'Alimentação', cor: '#10b981' },
  juridico: { label: 'Jurídico / Contábil', cor: '#a78bfa' },
  tecnologia: { label: 'Tecnologia', cor: '#ec4899' },
  evento: { label: 'Eventos / Estrutura', cor: '#f97316' },
  outro: { label: 'Outro', cor: '#94a3b8' },
}

const EMPTY_FORM = {
  razaoSocial: '',
  nomeFantasia: '',
  cnpj: '',
  telefone: '',
  email: '',
  dataFundacao: '',
  categoria: 'outro',
  contatoNome: '',
  cidade: '',
  endereco: '',
  valor: '',
  pix: '',
  banco: '',
  agencia: '',
  conta: '',
  observacao: '',
  status: 'ativa',
}

function numValor(v) {
  if (v === '' || v == null) return 0
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0
  const s = String(v).trim()
  if (!s) return 0
  // BR "1.500,50" ou "1500.5"
  if (s.includes(',') && s.includes('.')) {
    const n = Number(s.replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  if (s.includes(',')) {
    const n = Number(s.replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function fmtValor(v) {
  const n = numValor(v)
  if (!n) return ''
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Mantém o resumo da Previsão/Dashboard alinhado ao salvar empresas. */
function syncPrevisaoResumoEmpresas(lista) {
  publicarPrevisaoResumo(null, { empresas: lista })
}

function gerarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function formatTel(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`
}

function formatCnpj(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

function displayName(e) {
  return (e.nomeFantasia || e.razaoSocial || 'Empresa').trim()
}

export default function Empresas() {
  const canViewFinance = useCanViewFinance()
  const [empresas, setEmpresas] = useState(() => JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'))
  const [modal, setModal] = useState(null)
  const [detalheId, setDetalheId] = useState(null)
  const [busca, setBusca] = useState('')
  const [filtroCat, setFiltroCat] = useState('Todos')
  const [filtroStatus, setFiltroStatus] = useState('Todos')
  const [form, setForm] = useState(EMPTY_FORM)

  useEffect(() => {
    function recarregar(e) {
      if (modal) return
      if (e?.type === SYNC_STORAGE_EVENT && !e?.detail?.external) return
      if (e?.type === SYNC_STORAGE_EVENT && e.detail?.key && e.detail.key !== STORAGE_KEY) return
      try {
        const next = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
        setEmpresas(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
      } catch { /* ignore */ }
    }
    window.addEventListener(SYNC_EVENT, recarregar)
    window.addEventListener(SYNC_STORAGE_EVENT, recarregar)
    return () => {
      window.removeEventListener(SYNC_EVENT, recarregar)
      window.removeEventListener(SYNC_STORAGE_EVENT, recarregar)
    }
  }, [modal])

  useEffect(() => {
    writeStorage(STORAGE_KEY, empresas)
    syncPrevisaoResumoEmpresas(empresas)
  }, [empresas])

  const stats = useMemo(() => {
    const total = empresas.length
    const ativas = empresas.filter(e => e.status !== 'inativa').length
    const totalPagar = empresas
      .filter(e => e.status !== 'inativa')
      .reduce((s, e) => s + numValor(e.valor), 0)
    const porCat = {}
    Object.keys(CATEGORIAS).forEach(k => {
      porCat[k] = empresas.filter(e => e.categoria === k).length
    })
    return { total, ativas, totalPagar, porCat }
  }, [empresas])

  const filtered = useMemo(() => {
    let lista = [...empresas]
    if (busca) {
      const q = busca.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      lista = lista.filter(e => {
        const blob = [e.razaoSocial, e.nomeFantasia, e.cnpj, e.telefone, e.email, e.contatoNome, e.cidade]
          .join(' ')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
        return blob.includes(q)
      })
    }
    if (filtroCat !== 'Todos') lista = lista.filter(e => e.categoria === filtroCat)
    if (filtroStatus !== 'Todos') lista = lista.filter(e => (e.status || 'ativa') === filtroStatus)
    return lista.sort((a, b) => displayName(a).localeCompare(displayName(b), 'pt-BR'))
  }, [empresas, busca, filtroCat, filtroStatus])

  function upd(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function novaEmpresa() {
    setForm({ ...EMPTY_FORM })
    setModal('novo')
  }

  function editarEmpresa(emp) {
    setForm({ ...EMPTY_FORM, ...emp })
    setModal(emp.id)
  }

  function salvarEmpresa() {
    if (!form.razaoSocial.trim() && !form.nomeFantasia.trim()) return
    const payload = {
      ...form,
      razaoSocial: form.razaoSocial.trim(),
      nomeFantasia: form.nomeFantasia.trim(),
      email: form.email.trim(),
      contatoNome: form.contatoNome.trim(),
      valor: form.valor === '' || form.valor == null ? '' : numValor(form.valor) || '',
    }
    if (modal === 'novo') {
      setEmpresas(prev => [{ id: gerarId(), ...payload, criadoEm: new Date().toISOString() }, ...prev])
    } else {
      setEmpresas(prev => prev.map(e => (e.id === modal ? { ...e, ...payload } : e)))
    }
    setModal(null)
    flushAfterSave()
  }

  async function excluirEmpresa(id) {
    const emp = empresas.find(e => e.id === id)
    const ok = await confirmAction({
      title: 'Excluir empresa',
      message: `Excluir ${displayName(emp)}? Esta ação não pode ser desfeita.`,
    })
    if (!ok) return
    setEmpresas(prev => prev.filter(e => e.id !== id))
    if (detalheId === id) setDetalheId(null)
    flushAfterSave()
  }

  const detalhe = empresas.find(e => e.id === detalheId)
  const catDetalhe = detalhe ? (CATEGORIAS[detalhe.categoria] || CATEGORIAS.outro) : null

  return (
    <div className="flex-1 overflow-auto">
      <ModuleWrap className="pb-10">
        <PageHeader
          icon={Building2}
          title="Empresas Parceiras"
          subtitle="Fornecedores e empresas que trabalham com a campanha"
          actions={
            <>
              <SaveButton variant="ghost" />
              <Button icon={Plus} onClick={novaEmpresa}>Nova Empresa</Button>
            </>
          }
        />

        <KpiStrip
          columns={canViewFinance ? 4 : 3}
          items={[
            { label: 'Total', value: stats.total, gold: true },
            { label: 'Ativas', value: stats.ativas },
            ...(canViewFinance
              ? [{ label: 'A pagar', value: fmtValor(stats.totalPagar) || 'R$ 0', gold: true }]
              : []),
            { label: 'Categorias', value: Object.values(stats.porCat).filter(n => n > 0).length },
          ]}
        />

        <div className="list-panel p-4 mb-5 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 txt-3" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="input-dark w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
              placeholder="Buscar por nome, CNPJ, telefone, contato..."
            />
          </div>
          <select
            value={filtroCat}
            onChange={e => setFiltroCat(e.target.value)}
            className="input-dark px-3 py-2.5 rounded-xl text-sm font-semibold"
          >
            <option value="Todos">Todas as categorias</option>
            {Object.entries(CATEGORIAS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select
            value={filtroStatus}
            onChange={e => setFiltroStatus(e.target.value)}
            className="input-dark px-3 py-2.5 rounded-xl text-sm font-semibold"
          >
            <option value="Todos">Todos os status</option>
            <option value="ativa">Ativas</option>
            <option value="inativa">Inativas</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="list-panel">
            <EmptyState
              icon={Building2}
              title={empresas.length === 0 ? 'Nenhuma empresa cadastrada' : 'Nenhum resultado encontrado'}
              subtitle={empresas.length === 0
                ? 'Cadastre fornecedores e parceiros que trabalham com a campanha'
                : 'Tente ajustar os filtros'}
              action={empresas.length === 0 ? <Button icon={Plus} onClick={novaEmpresa}>Nova Empresa</Button> : null}
            />
          </div>
        ) : (
          <div className="list-panel">
            {filtered.map(emp => {
              const cat = CATEGORIAS[emp.categoria] || CATEGORIAS.outro
              const inativa = emp.status === 'inativa'
              return (
                <div key={emp.id} className="list-row" style={{ opacity: inativa ? 0.6 : 1 }}>
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${cat.cor}22`, color: cat.cor }}
                  >
                    <Building2 size={17} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold txt-1 text-sm truncate">{displayName(emp)}</p>
                      <span className="text-xs font-bold" style={{ color: cat.cor }}>{cat.label}</span>
                      {inativa && <span className="text-xs font-bold txt-3">Inativa</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs txt-3 flex-wrap">
                      {canViewFinance && numValor(emp.valor) > 0 && (
                        <span className="font-bold" style={{ color: 'var(--gold-bright)' }}>{fmtValor(emp.valor)}</span>
                      )}
                      {emp.razaoSocial && emp.nomeFantasia && <span className="truncate">{emp.razaoSocial}</span>}
                      {emp.cnpj && <span>{emp.cnpj}</span>}
                      {emp.telefone && <span className="flex items-center gap-1"><Phone size={9} /> {emp.telefone}</span>}
                      {emp.cidade && <span className="flex items-center gap-1"><MapPin size={9} /> {emp.cidade}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setDetalheId(emp.id)} className="btn-ghost px-3 py-1.5 text-xs font-bold">
                      Detalhes
                    </button>
                    <button onClick={() => editarEmpresa(emp)} className="p-2 rounded-xl hov-srf">
                      <Edit3 size={13} className="txt-3" />
                    </button>
                    <button onClick={() => excluirEmpresa(emp.id)} className="p-2 rounded-xl hov-srf">
                      <Trash2 size={13} className="text-red-400" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </ModuleWrap>

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="srf rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col"
            style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}
          >
            <div className="px-6 py-4 border-b brd-soft flex items-center justify-between flex-shrink-0">
              <h2 className="font-bold txt-1" style={{ fontSize: 18 }}>
                {modal === 'novo' ? 'Nova Empresa' : 'Editar Empresa'}
              </h2>
              <button onClick={() => setModal(null)} className="p-2 rounded-xl hov-srf">
                <X size={18} className="txt-3" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold txt-1 block mb-1.5">Razão Social *</label>
                  <input
                    value={form.razaoSocial}
                    onChange={e => upd('razaoSocial', e.target.value)}
                    className="input-dark w-full px-3 py-2.5 rounded-xl text-sm"
                    placeholder="Razão social da empresa"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold txt-1 block mb-1.5">Nome Fantasia</label>
                  <input
                    value={form.nomeFantasia}
                    onChange={e => upd('nomeFantasia', e.target.value)}
                    className="input-dark w-full px-3 py-2.5 rounded-xl text-sm"
                    placeholder="Nome comercial"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold txt-1 block mb-1.5">Telefone</label>
                  <input
                    value={form.telefone}
                    onChange={e => upd('telefone', formatTel(e.target.value))}
                    className="input-dark w-full px-3 py-2.5 rounded-xl text-sm"
                    placeholder="(47) 9xxxx-xxxx"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold txt-1 block mb-1.5">CNPJ</label>
                  <input
                    value={form.cnpj}
                    onChange={e => upd('cnpj', formatCnpj(e.target.value))}
                    className="input-dark w-full px-3 py-2.5 rounded-xl text-sm"
                    placeholder="00.000.000/0000-00"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold txt-1 block mb-1.5">E-Mail</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => upd('email', e.target.value)}
                    className="input-dark w-full px-3 py-2.5 rounded-xl text-sm"
                    placeholder="email@exemplo.com"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold txt-1 block mb-1.5">Data de Fundação</label>
                  <input
                    type="date"
                    value={form.dataFundacao}
                    onChange={e => upd('dataFundacao', e.target.value)}
                    className="input-dark w-full px-3 py-2.5 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold txt-1 block mb-1.5">Categoria</label>
                  <select
                    value={form.categoria}
                    onChange={e => upd('categoria', e.target.value)}
                    className="input-dark w-full px-3 py-2.5 rounded-xl text-sm font-semibold"
                  >
                    {Object.entries(CATEGORIAS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold txt-1 block mb-1.5">Status</label>
                  <select
                    value={form.status}
                    onChange={e => upd('status', e.target.value)}
                    className="input-dark w-full px-3 py-2.5 rounded-xl text-sm font-semibold"
                  >
                    <option value="ativa">Ativa</option>
                    <option value="inativa">Inativa</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold txt-1 block mb-1.5">Contato responsável</label>
                  <input
                    value={form.contatoNome}
                    onChange={e => upd('contatoNome', e.target.value)}
                    className="input-dark w-full px-3 py-2.5 rounded-xl text-sm"
                    placeholder="Nome de quem fala com a campanha"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold txt-1 block mb-1.5">Cidade</label>
                  <input
                    value={form.cidade}
                    onChange={e => upd('cidade', e.target.value)}
                    className="input-dark w-full px-3 py-2.5 rounded-xl text-sm"
                    placeholder="Cidade"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold txt-1 block mb-1.5">Endereço</label>
                <input
                  value={form.endereco}
                  onChange={e => upd('endereco', e.target.value)}
                  className="input-dark w-full px-3 py-2.5 rounded-xl text-sm"
                  placeholder="Rua, número, bairro"
                />
              </div>

              {canViewFinance && (
              <div className="pt-1">
                <p className="text-xs font-bold txt-3 mb-3 flex items-center gap-1.5">
                  <CreditCard size={12} /> Dados para pagamento
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold txt-1 block mb-1.5">Valor a pagar (contrato)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold txt-3">R$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.valor}
                        onChange={e => upd('valor', e.target.value)}
                        className="input-dark w-full pl-10 pr-3 py-2.5 rounded-xl text-sm"
                        placeholder="0,00"
                      />
                    </div>
                    <p className="text-xs txt-3 mt-1.5">Entra na Previsão de Gasto (só empresas ativas)</p>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-bold txt-1 block mb-1.5">Chave PIX</label>
                    <input
                      value={form.pix}
                      onChange={e => upd('pix', e.target.value)}
                      className="input-dark w-full px-3 py-2.5 rounded-xl text-sm"
                      placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold txt-1 block mb-1.5">Banco</label>
                    <input
                      value={form.banco}
                      onChange={e => upd('banco', e.target.value)}
                      className="input-dark w-full px-3 py-2.5 rounded-xl text-sm"
                      placeholder="Nome do banco"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold txt-1 block mb-1.5">Agência</label>
                      <input
                        value={form.agencia}
                        onChange={e => upd('agencia', e.target.value)}
                        className="input-dark w-full px-3 py-2.5 rounded-xl text-sm"
                        placeholder="0000"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold txt-1 block mb-1.5">Conta</label>
                      <input
                        value={form.conta}
                        onChange={e => upd('conta', e.target.value)}
                        className="input-dark w-full px-3 py-2.5 rounded-xl text-sm"
                        placeholder="00000-0"
                      />
                    </div>
                  </div>
                </div>
              </div>
              )}

              <div>
                <label className="text-xs font-bold txt-1 block mb-1.5">Observações</label>
                <textarea
                  value={form.observacao}
                  onChange={e => upd('observacao', e.target.value)}
                  className="input-dark w-full px-3 py-2.5 rounded-xl text-sm resize-none"
                  rows={2}
                  placeholder="Serviços, condições, combinações..."
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t brd-soft flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setModal(null)} className="px-5 py-2.5 rounded-xl text-sm font-bold txt-3 hov-srf">
                Cancelar
              </button>
              <button
                onClick={salvarEmpresa}
                disabled={!form.razaoSocial.trim() && !form.nomeFantasia.trim()}
                className="btn-primary px-5 py-2.5 rounded-xl text-sm disabled:opacity-40"
              >
                {modal === 'novo' ? 'Cadastrar' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detalhe && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => setDetalheId(null)}
        >
          <div
            className="srf rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b brd-soft flex items-center justify-between">
              <div>
                <h2 className="font-bold txt-1" style={{ fontSize: 18 }}>{displayName(detalhe)}</h2>
                {catDetalhe && (
                  <p className="text-xs font-bold mt-1" style={{ color: catDetalhe.cor }}>{catDetalhe.label}</p>
                )}
              </div>
              <button onClick={() => setDetalheId(null)} className="p-2 rounded-xl hov-srf">
                <X size={18} className="txt-3" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3 text-sm">
              {detalhe.razaoSocial && detalhe.nomeFantasia && (
                <DetailRow icon={Building2} label="Razão social" value={detalhe.razaoSocial} />
              )}
              {detalhe.cnpj && <DetailRow icon={Briefcase} label="CNPJ" value={detalhe.cnpj} />}
              {detalhe.telefone && (
                <DetailRow
                  icon={Phone}
                  label="Telefone"
                  value={detalhe.telefone}
                  href={`tel:${detalhe.telefone.replace(/\D/g, '')}`}
                />
              )}
              {detalhe.email && (
                <DetailRow icon={Mail} label="E-mail" value={detalhe.email} href={`mailto:${detalhe.email}`} />
              )}
              {detalhe.contatoNome && <DetailRow icon={User} label="Contato" value={detalhe.contatoNome} />}
              {(detalhe.cidade || detalhe.endereco) && (
                <DetailRow
                  icon={MapPin}
                  label="Endereço"
                  value={[detalhe.endereco, detalhe.cidade].filter(Boolean).join(' — ')}
                />
              )}
              {detalhe.dataFundacao && (
                <DetailRow
                  icon={Briefcase}
                  label="Fundação"
                  value={new Date(detalhe.dataFundacao + 'T12:00').toLocaleDateString('pt-BR')}
                />
              )}
              {(canViewFinance && (numValor(detalhe.valor) > 0 || detalhe.pix || detalhe.banco)) && (
                <div className="pt-2 mt-2 border-t brd-soft space-y-3">
                  <p className="text-xs font-bold txt-3">Pagamento</p>
                  {numValor(detalhe.valor) > 0 && (
                    <DetailRow icon={DollarSign} label="Valor a pagar" value={fmtValor(detalhe.valor)} highlight />
                  )}
                  {detalhe.pix && <DetailRow icon={CreditCard} label="PIX" value={detalhe.pix} />}
                  {detalhe.banco && (
                    <DetailRow
                      icon={CreditCard}
                      label="Conta"
                      value={[detalhe.banco, detalhe.agencia && `Ag ${detalhe.agencia}`, detalhe.conta && `Cc ${detalhe.conta}`]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  )}
                </div>
              )}
              {detalhe.observacao && (
                <div className="pt-2 mt-2 border-t brd-soft">
                  <p className="text-xs font-bold txt-3 mb-1">Observações</p>
                  <p className="txt-2 whitespace-pre-wrap">{detalhe.observacao}</p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t brd-soft flex justify-end gap-2">
              <button
                onClick={() => { setDetalheId(null); editarEmpresa(detalhe) }}
                className="px-4 py-2 rounded-xl text-sm font-bold"
                style={{ background: 'rgba(37,99,235,0.15)', color: '#93c5fd' }}
              >
                Editar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailRow({ icon: Icon, label, value, href, highlight }) {
  const color = highlight ? 'var(--gold-bright)' : undefined
  const content = href ? (
    <a href={href} className="txt-1 font-semibold hover:underline">{value}</a>
  ) : (
    <span className="txt-1 font-semibold" style={{ color }}>{value}</span>
  )
  return (
    <div className="flex items-start gap-3">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: highlight ? 'rgba(212,175,95,0.14)' : 'rgba(37,99,235,0.12)' }}
      >
        <Icon size={14} style={{ color: highlight ? 'var(--gold-bright)' : '#93c5fd' }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs txt-3">{label}</p>
        <div className="mt-0.5 break-words">{content}</div>
      </div>
    </div>
  )
}
