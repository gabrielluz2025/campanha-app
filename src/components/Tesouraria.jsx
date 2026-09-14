import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Wallet, Plus, ArrowDownLeft, ArrowUpRight, Search, Trash2, Pencil,
  Printer, Paperclip, X, Filter, CheckCircle2, Clock, Ban, Receipt,
  Building2, Landmark, ClipboardCheck, AlertTriangle, Link2, History, GitCompareArrows,
} from 'lucide-react'
import { confirmAction } from '../utils/confirm'
import SaveButton from './SaveButton'
import { flushAfterSave } from '../utils/persist'
import { PageHeader, ModuleWrap, KpiStrip, Button } from './ui'
import { useCanViewFinance } from '../context/AccessContext'
import {
  loadMovimentos, saveMovimentos, normalizarMovimento, movimentoVazio,
  filtrarMovimentos, resumirCaixa, totaisPorCategoria, periodoMesAtual,
  categoriasDoTipo, FORMAS_PAGAMENTO, STATUS_MOVIMENTO,
  parseValor, fmtMoeda, fmtData, fmtTamanho, lerArquivoBase64, uidFin,
  corTipo, corStatus, labelTipo, labelStatus,
  loadConta, saveConta, contaVazia, formatarCnpj, formatarCpfCnpj,
  BANCOS_SUGERIDOS, CARGOS_CAMPANHA, contaPreenchida,
  loadPrevisaoResumo, compararOrcadoRealizado, montarChecklist, loadOpcoesVinculo,
} from '../utils/tesouraria'
import { imprimirRelatorioTesouraria } from '../utils/tesourariaReport'
import TesourariaHistorico2022 from './TesourariaHistorico2022'
import TesourariaComparativo from './TesourariaComparativo'

const INPUT = 'input-dark w-full px-3 py-2'
const INPUT_STY = { fontSize: 13 }

const FONTES_RAPIDAS = [
  { id: 'Doação de pessoa física', short: 'Doação' },
  { id: 'Fundo Eleitoral / FEFC', short: 'FEFC' },
  { id: 'Transferência de comitê / partido', short: 'Partido' },
  { id: 'Recursos próprios do candidato', short: 'Próprio' },
  { id: 'Financiamento coletivo', short: 'Vaquinha' },
  { id: 'Outras receitas', short: 'Outro' },
]

const DESTINOS_RAPIDOS = [
  { id: 'Pessoal / equipe', short: 'Equipe' },
  { id: 'Propaganda / gráfica', short: 'Gráfica' },
  { id: 'Marketing digital / mídia', short: 'Mídia' },
  { id: 'Serviços / fornecedor', short: 'Serviço' },
  { id: 'Combustível / deslocamento', short: 'Combustível' },
  { id: 'Outros gastos eleitorais', short: 'Outro' },
]

function StatusPill({ status }) {
  const cor = corStatus(status)
  const Icon = status === 'confirmado' ? CheckCircle2 : status === 'previsto' ? Clock : Ban
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold"
      style={{ fontSize: 10, color: cor, background: `${cor}22`, border: `1px solid ${cor}55` }}>
      <Icon size={10} />{labelStatus(status)}
    </span>
  )
}

function TipoPill({ tipo }) {
  const cor = corTipo(tipo)
  const Icon = tipo === 'entrada' ? ArrowDownLeft : ArrowUpRight
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold"
      style={{ fontSize: 10, color: cor, background: `${cor}18`, border: `1px solid ${cor}44` }}>
      <Icon size={10} />{labelTipo(tipo)}
    </span>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[11px] font-semibold block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>{label}</label>
      {children}
    </div>
  )
}

export default function Tesouraria() {
  const canViewFinance = useCanViewFinance()
  const mes = useMemo(() => periodoMesAtual(), [])
  const [aba, setAba] = useState('painel')
  const [lista, setLista] = useState(() => loadMovimentos().map(normalizarMovimento).filter(Boolean))
  const [conta, setConta] = useState(() => loadConta())
  const [filtros, setFiltros] = useState({
    tipo: 'todos', status: 'todos', categoria: '', busca: '',
    de: mes.de, ate: mes.ate, soContaCampanha: false, semComprovante: false,
  })
  const [modal, setModal] = useState(null)
  const [erro, setErro] = useState('')
  const [salvandoArq, setSalvandoArq] = useState(false)
  const [printMsg, setPrintMsg] = useState('')
  const [contaMsg, setContaMsg] = useState('')
  const [rapidoOk, setRapidoOk] = useState('')
  const fileRef = useRef(null)
  const valorRapidoRef = useRef(null)
  const skipMov = useRef(true)
  const vinculos = useMemo(() => loadOpcoesVinculo(), [lista.length])

  useEffect(() => {
    if (skipMov.current) { skipMov.current = false; return }
    saveMovimentos(lista)
  }, [lista])

  useEffect(() => {
    if (modal?.rapido) {
      const t = setTimeout(() => valorRapidoRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [modal?.rapido, modal?.mode])

  const filtrada = useMemo(() => filtrarMovimentos(lista, filtros), [lista, filtros])
  const ordenada = useMemo(() =>
    [...filtrada].sort((a, b) => String(b.data).localeCompare(String(a.data))
      || String(b.criadoEm || '').localeCompare(String(a.criadoEm || ''))), [filtrada])

  const resumoPeriodo = useMemo(() => resumirCaixa(filtrada), [filtrada])
  const resumoGeral = useMemo(() => resumirCaixa(lista), [lista])
  const porCat = useMemo(() => totaisPorCategoria(filtrada).slice(0, 8), [filtrada])
  const previsao = useMemo(() => loadPrevisaoResumo(), [lista, aba])
  const orcado = useMemo(() => compararOrcadoRealizado(lista, previsao), [lista, previsao])
  const checklist = useMemo(() => montarChecklist(conta, lista), [conta, lista])
  const limite = parseValor(conta.limiteGastos)
  const pctLimite = limite > 0 ? Math.min(999, (resumoGeral.saidas / limite) * 100) : 0

  const categoriasFiltro = useMemo(() => {
    const set = new Set(lista.map(m => m.categoria).filter(Boolean))
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [lista])

  if (!canViewFinance) {
    return (
      <div className="flex-1 overflow-auto min-h-0">
        <ModuleWrap>
          <PageHeader icon={Wallet} title="Tesouraria" subtitle="Controle do recurso eleitoral" />
          <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="font-bold" style={{ color: 'var(--text-primary)' }}>Acesso restrito</p>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>Sem permissão para dados financeiros.</p>
          </div>
        </ModuleWrap>
      </div>
    )
  }

  function updFiltro(k, v) { setFiltros(f => ({ ...f, [k]: v })) }

  function abrirNovo(tipo = 'entrada') {
    setErro('')
    setModal({ mode: 'novo', rapido: false, form: movimentoVazio(tipo) })
  }

  function abrirRapido(tipo = 'entrada') {
    setErro('')
    const form = movimentoVazio(tipo)
    if (tipo === 'entrada') form.categoria = 'Doação de pessoa física'
    setModal({ mode: 'novo', rapido: true, form })
  }

  function abrirEditar(m) {
    setErro('')
    setModal({ mode: 'editar', rapido: false, form: { ...m } })
  }

  function updForm(patch) {
    setModal(m => {
      if (!m) return m
      const form = { ...m.form, ...patch }
      if (patch.tipo && patch.tipo !== m.form.tipo) {
        const cats = categoriasDoTipo(patch.tipo)
        if (!cats.includes(form.categoria)) form.categoria = cats[0]
      }
      return { ...m, form }
    })
  }

  function aplicarVinculo(tipo, id) {
    if (!tipo || !id) {
      updForm({ vinculoTipo: '', vinculoId: '', vinculoNome: '' })
      return
    }
    const pool = tipo === 'membro' ? vinculos.membros : vinculos.empresas
    const hit = pool.find(x => x.id === id)
    if (!hit) return
    updForm({
      vinculoTipo: tipo,
      vinculoId: hit.id,
      vinculoNome: hit.nome,
      contraparte: hit.nome,
      documentoContraparte: hit.doc ? formatarCpfCnpj(hit.doc) : '',
      ...(tipo === 'empresa' && hit.valor && !modal?.form?.valor
        ? { valor: String(hit.valor) }
        : {}),
    })
  }

  async function anexarComprovante(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !modal) return
    setSalvandoArq(true)
    setErro('')
    const res = await lerArquivoBase64(file)
    setSalvandoArq(false)
    if (res.erro) { setErro(res.erro); return }
    updForm({ comprovante: { id: uidFin(), ...res } })
  }

  function salvarModal({ eContinuar = false } = {}) {
    if (!modal) return
    if (parseValor(modal.form.valor) <= 0) { setErro('Informe um valor maior que zero.'); return }
    if (!modal.form.data) { setErro('Informe a data.'); return }
    const agora = new Date().toISOString()
    const salvo = normalizarMovimento({
      ...modal.form,
      id: modal.mode === 'novo' ? uidFin() : modal.form.id,
      criadoEm: modal.mode === 'novo' ? agora : modal.form.criadoEm,
      atualizadoEm: agora,
    })
    if (modal.mode === 'novo') {
      setLista(prev => [salvo, ...prev])
    } else {
      setLista(prev => prev.map(x => x.id === modal.form.id ? salvo : x))
    }

    if (eContinuar && modal.rapido && modal.mode === 'novo') {
      const prox = movimentoVazio(modal.form.tipo)
      prox.categoria = modal.form.categoria
      prox.forma = modal.form.forma
      setErro('')
      setModal({ mode: 'novo', rapido: true, form: prox })
      setRapidoOk(`${modal.form.tipo === 'entrada' ? 'Recebido' : 'Pago'}: ${fmtMoeda(salvo.valor)}`)
      setTimeout(() => setRapidoOk(''), 2500)
      return
    }

    setModal(null)
    if (modal.rapido) {
      setRapidoOk(`${modal.form.tipo === 'entrada' ? 'Recebido' : 'Pago'}: ${fmtMoeda(salvo.valor)}`)
      setTimeout(() => setRapidoOk(''), 2500)
    }
  }

  async function excluir(id) {
    const ok = await confirmAction({
      titulo: 'Excluir lançamento',
      mensagem: 'Remover este lançamento? Não pode ser desfeito.',
      confirmar: 'Excluir',
      perigo: true,
    })
    if (!ok) return
    setLista(prev => prev.filter(x => x.id !== id))
  }

  function salvarContaForm() {
    saveConta(conta)
    setContaMsg('Conta de campanha salva.')
    setTimeout(() => setContaMsg(''), 2500)
  }

  function imprimir() {
    const res = imprimirRelatorioTesouraria({
      movimentos: lista,
      filtros,
      conta,
      titulo: 'Relatório de Tesouraria — Caixa Eleitoral',
      subtitulo: [
        filtros.de && filtros.ate ? `${fmtData(filtros.de)} a ${fmtData(filtros.ate)}` : null,
        conta.razaoSocial || conta.cnpj || null,
      ].filter(Boolean).join(' · '),
    })
    if (!res.ok) {
      setPrintMsg('Permita pop-ups para imprimir.')
      setTimeout(() => setPrintMsg(''), 3500)
    }
  }

  const kpis = [
    { label: 'Saldo conta campanha', value: fmtMoeda(resumoPeriodo.saldoConta), gold: true },
    { label: 'Entradas', value: fmtMoeda(resumoPeriodo.entradas) },
    { label: 'Saídas', value: fmtMoeda(resumoPeriodo.saidas) },
    { label: 'Disponível', value: fmtMoeda(resumoPeriodo.disponivel) },
  ]

  const abas = [
    { id: 'painel', label: 'Painel', icon: Wallet },
    { id: 'movimentos', label: 'Movimentações', icon: Receipt },
    { id: 'conta', label: 'Conta de Campanha', icon: Landmark },
    { id: 'checklist', label: 'Checklist', icon: ClipboardCheck },
    { id: 'comparativo', label: 'Comparativo', icon: GitCompareArrows },
    { id: 'historico2022', label: 'Histórico 2022', icon: History },
  ]
  const isHistorico = aba === 'historico2022'
  const isComparativo = aba === 'comparativo'
  const isRefView = isHistorico || isComparativo

  return (
    <div className="flex-1 overflow-auto min-h-0">
    <ModuleWrap className="pb-10">
      <PageHeader
        icon={Wallet}
        title="Tesouraria"
        subtitle="Recurso eleitoral · conta de campanha · entradas e destinações"
        actions={!isRefView ? (
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" icon={Printer} onClick={imprimir}>Imprimir</Button>
            <SaveButton onSave={async () => {
              saveMovimentos(lista)
              saveConta(conta)
              await flushAfterSave()
            }} />
            <Button variant="ghost" icon={Plus} onClick={() => abrirNovo('entrada')}>Completo</Button>
            <Button icon={ArrowDownLeft} onClick={() => abrirRapido('entrada')}>Recebi</Button>
          </div>
        ) : null}
      />

      {printMsg && <p className="text-sm mb-3" style={{ color: '#fbbf24' }}>{printMsg}</p>}
      {rapidoOk && (
        <p className="text-sm mb-3 font-bold" style={{ color: '#34d399' }}>{rapidoOk}</p>
      )}

      {!isRefView && !contaPreenchida(conta) && (
        <div className="rounded-xl px-3 py-2.5 mb-4 flex items-start gap-2"
          style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.35)' }}>
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Cadastre o <strong style={{ color: 'var(--gold-bright)' }}>CNPJ e a conta de campanha</strong> na aba Conta de Campanha.
            <button type="button" className="ml-2 font-bold" style={{ color: 'var(--gold-bright)' }} onClick={() => setAba('conta')}>
              Abrir agora
            </button>
          </div>
        </div>
      )}

      {!isRefView && <KpiStrip items={kpis} columns={4} className="mb-4" />}

      <div className="flex gap-1 p-1 rounded-xl mb-4 overflow-x-auto"
        style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-subtle)' }}>
        {abas.map(t => {
          const Icon = t.icon
          const on = aba === t.id
          const especial = (t.id === 'historico2022' || t.id === 'comparativo') && on
          const especialCor = t.id === 'comparativo'
            ? { bg: 'rgba(251,191,36,0.18)', fg: 'var(--gold-bright)', bd: 'rgba(251,191,36,0.4)' }
            : { bg: 'rgba(96,165,250,0.18)', fg: '#93c5fd', bd: 'rgba(96,165,250,0.35)' }
          return (
            <button key={t.id} type="button" onClick={() => setAba(t.id)}
              className="px-3 py-2 rounded-lg text-[12px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
              style={{
                background: especial
                  ? especialCor.bg
                  : on ? 'rgba(212,175,95,0.2)' : 'transparent',
                color: especial
                  ? especialCor.fg
                  : on ? 'var(--gold-bright)' : 'var(--text-tertiary)',
                border: especial
                  ? `1px solid ${especialCor.bd}`
                  : on ? '1px solid rgba(212,175,95,0.35)' : '1px solid transparent',
              }}>
              <Icon size={13} />{t.label}
              {t.id === 'checklist' && checklist.pendencias.length > 0 && (
                <span className="tnum text-[10px] px-1.5 rounded-full" style={{ background: '#f87171', color: '#1a0a0a' }}>
                  {checklist.pendencias.length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {isComparativo && <TesourariaComparativo movimentos={lista} />}
      {isHistorico && <TesourariaHistorico2022 />}

      {/* Filtros (painel + movimentos) */}
      {!isRefView && (aba === 'painel' || aba === 'movimentos') && (
        <div className="rounded-2xl p-3 mb-4 space-y-2"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-2 mb-1" style={{ color: 'var(--text-faint)' }}>
            <Filter size={12} />
            <span className="text-[10px] font-bold uppercase tracking-wide">Filtros</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: 'var(--text-faint)' }}>De</label>
              <input type="date" className={INPUT} style={INPUT_STY} value={filtros.de} onChange={e => updFiltro('de', e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: 'var(--text-faint)' }}>Até</label>
              <input type="date" className={INPUT} style={INPUT_STY} value={filtros.ate} onChange={e => updFiltro('ate', e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: 'var(--text-faint)' }}>Tipo</label>
              <select className={INPUT} style={INPUT_STY} value={filtros.tipo} onChange={e => updFiltro('tipo', e.target.value)}>
                <option value="todos">Todos</option>
                <option value="entrada">Entradas</option>
                <option value="saida">Saídas</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: 'var(--text-faint)' }}>Status</label>
              <select className={INPUT} style={INPUT_STY} value={filtros.status} onChange={e => updFiltro('status', e.target.value)}>
                <option value="todos">Todos</option>
                {STATUS_MOVIMENTO.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: 'var(--text-faint)' }}>Fonte/destino</label>
              <select className={INPUT} style={INPUT_STY} value={filtros.categoria} onChange={e => updFiltro('categoria', e.target.value)}>
                <option value="">Todas</option>
                {categoriasFiltro.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-semibold block mb-1" style={{ color: 'var(--text-faint)' }}>Busca</label>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
                <input className={INPUT} style={{ ...INPUT_STY, paddingLeft: 32 }}
                  placeholder="Descrição, CPF/CNPJ, contraparte…"
                  value={filtros.busca} onChange={e => updFiltro('busca', e.target.value)} />
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap pt-1 items-center">
            <label className="text-[10px] font-semibold inline-flex items-center gap-1.5 cursor-pointer" style={{ color: 'var(--text-tertiary)' }}>
              <input type="checkbox" checked={filtros.soContaCampanha} onChange={e => updFiltro('soContaCampanha', e.target.checked)} />
              Só conta de campanha
            </label>
            <label className="text-[10px] font-semibold inline-flex items-center gap-1.5 cursor-pointer" style={{ color: 'var(--text-tertiary)' }}>
              <input type="checkbox" checked={filtros.semComprovante} onChange={e => updFiltro('semComprovante', e.target.checked)} />
              Sem comprovante
            </label>
            <button type="button" className="text-[10px] font-bold px-2 py-1 rounded-lg"
              style={{ color: 'var(--text-tertiary)', background: 'rgba(255,255,255,0.04)' }}
              onClick={() => setFiltros(f => ({ ...f, de: mes.de, ate: mes.ate }))}>Mês atual</button>
            <button type="button" className="text-[10px] font-bold px-2 py-1 rounded-lg"
              style={{ color: 'var(--text-tertiary)', background: 'rgba(255,255,255,0.04)' }}
              onClick={() => setFiltros({
                tipo: 'todos', status: 'todos', categoria: '', busca: '',
                de: '', ate: '', soContaCampanha: false, semComprovante: false,
              })}>Limpar</button>
            <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
              {ordenada.length} lanç. · saldo geral {fmtMoeda(resumoGeral.saldoConta)}
            </span>
          </div>
        </div>
      )}

      {/* PAINEL */}
      {aba === 'painel' && (
        <div className="space-y-4">
          <div className="rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
            style={{
              background: 'linear-gradient(135deg, rgba(52,211,153,0.12), rgba(212,175,95,0.08))',
              border: '1px solid rgba(52,211,153,0.35)',
            }}>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#6ee7b7' }}>Atalho rápido</p>
              <p className="font-extrabold text-lg" style={{ color: 'var(--text-primary)' }}>Recebeu dinheiro?</p>
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Valor + origem · 2 campos · pronto</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button icon={ArrowDownLeft} onClick={() => abrirRapido('entrada')}>Recebi</Button>
              <Button icon={ArrowUpRight} variant="ghost" onClick={() => abrirRapido('saida')}>Paguei</Button>
            </div>
          </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="eyebrow mb-3" style={{ color: 'var(--gold)' }}>Controle do período</p>
            <div className="space-y-2.5">
              {[
                { l: 'A receber (previsto)', v: fmtMoeda(resumoPeriodo.aReceber), c: '#34d399' },
                { l: 'A pagar (previsto)', v: fmtMoeda(resumoPeriodo.aPagar), c: '#fbbf24' },
                { l: 'Sem comprovante', v: String(resumoPeriodo.semComprovante), c: resumoPeriodo.semComprovante ? '#f87171' : '#34d399' },
                { l: 'Checklist prestação', v: `${checklist.okCount}/${checklist.total} (${checklist.pct}%)`, c: checklist.pct === 100 ? '#34d399' : '#fbbf24' },
              ].map(row => (
                <div key={row.l} className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{row.l}</span>
                  <span className="font-bold tnum" style={{ color: row.c }}>{row.v}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <Button icon={ArrowDownLeft} onClick={() => abrirRapido('entrada')} className="flex-1">Recebi</Button>
              <Button icon={ArrowUpRight} variant="ghost" onClick={() => abrirRapido('saida')} className="flex-1">Paguei</Button>
            </div>
          </div>

          <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="eyebrow mb-3" style={{ color: 'var(--gold)' }}>Orçado × realizado × limite</p>
            <div className="space-y-2.5">
              <RowFin label="Orçado (Previsão de Gasto)" value={fmtMoeda(orcado.orcado)} />
              <RowFin label="Realizado (saídas confirmadas)" value={fmtMoeda(orcado.realizado)} color="#f87171" />
              <RowFin label="Diferença orçado − realizado" value={fmtMoeda(orcado.diff)}
                color={orcado.diff >= 0 ? '#34d399' : '#f87171'} />
              {limite > 0 && (
                <>
                  <RowFin label="Limite de gastos (conta)" value={fmtMoeda(limite)} />
                  <RowFin label="% do limite usado" value={`${pctLimite.toFixed(1)}%`}
                    color={pctLimite >= 100 ? '#f87171' : pctLimite >= 80 ? '#fbbf24' : '#34d399'} />
                </>
              )}
              {!orcado.temOrcamento && limite <= 0 && (
                <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                  Defina orçamento na Previsão e/ou limite na Conta de Campanha.
                </p>
              )}
            </div>
            {contaPreenchida(conta) && (
              <div className="mt-4 rounded-xl px-3 py-2.5" style={{ background: 'rgba(0,0,0,0.22)' }}>
                <p className="text-[10px] font-bold uppercase mb-1" style={{ color: 'var(--text-faint)' }}>Conta ativa</p>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {conta.banco || 'Banco'} · {conta.conta || '—'}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  {conta.cnpj ? formatarCnpj(conta.cnpj) : 'Sem CNPJ'} · PIX {conta.pix || '—'}
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="eyebrow mb-3" style={{ color: 'var(--gold)' }}>Por fonte / destino</p>
            {porCat.length === 0 ? (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--text-faint)' }}>Sem lançamentos no filtro.</p>
            ) : (
              <div className="space-y-2">
                {porCat.map(c => {
                  const max = Math.max(1, ...porCat.map(x => x.total))
                  const pct = Math.round((c.total / max) * 100)
                  return (
                    <div key={`${c.tipo}-${c.categoria}`}>
                      <div className="flex justify-between gap-2 mb-1">
                        <span className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          <span style={{ color: corTipo(c.tipo) }}>{c.tipo === 'entrada' ? '↑' : '↓'}</span> {c.categoria}
                        </span>
                        <span className="tnum text-[12px] font-bold flex-shrink-0" style={{ color: corTipo(c.tipo) }}>{fmtMoeda(c.total)}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: corTipo(c.tipo) }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="eyebrow" style={{ color: 'var(--gold)' }}>Últimos lançamentos</p>
              <button type="button" onClick={() => setAba('movimentos')} className="text-[11px] font-bold" style={{ color: 'var(--gold-bright)' }}>Ver todos</button>
            </div>
            <ListaMovimentos itens={ordenada.slice(0, 6)} onEdit={abrirEditar} onDelete={excluir} compact />
          </div>
        </div>
        </div>
      )}

      {/* MOVIMENTOS */}
      {aba === 'movimentos' && (
        <div className="rounded-2xl p-3 sm:p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <p className="eyebrow" style={{ color: 'var(--gold)' }}>Extrato eleitoral</p>
            <div className="flex gap-2">
              <Button icon={ArrowDownLeft} onClick={() => abrirRapido('entrada')}>Recebi</Button>
              <Button icon={ArrowUpRight} variant="ghost" onClick={() => abrirRapido('saida')}>Paguei</Button>
            </div>
          </div>
          <ListaMovimentos itens={ordenada} onEdit={abrirEditar} onDelete={excluir} />
        </div>
      )}

      {/* CONTA */}
      {aba === 'conta' && (
        <div className="rounded-2xl p-4 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
          <div>
            <p className="eyebrow" style={{ color: 'var(--gold)' }}>Identidade financeira</p>
            <h3 className="font-extrabold text-lg" style={{ color: 'var(--text-primary)' }}>Conta de Campanha</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
              CNPJ, banco e dados oficiais do recurso eleitoral. Base para o checklist e relatórios.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="CNPJ da campanha">
              <input className={INPUT} style={INPUT_STY} placeholder="00.000.000/0000-00"
                value={conta.cnpj}
                onChange={e => setConta(c => ({ ...c, cnpj: formatarCnpj(e.target.value) }))} />
            </Field>
            <Field label="Razão social / nome">
              <input className={INPUT} style={INPUT_STY} value={conta.razaoSocial}
                onChange={e => setConta(c => ({ ...c, razaoSocial: e.target.value }))} />
            </Field>
            <Field label="Cargo em disputa">
              <select className={INPUT} style={INPUT_STY} value={conta.cargo}
                onChange={e => setConta(c => ({ ...c, cargo: e.target.value }))}>
                {CARGOS_CAMPANHA.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="UF">
                <input className={INPUT} style={INPUT_STY} maxLength={2} value={conta.uf}
                  onChange={e => setConta(c => ({ ...c, uf: e.target.value.toUpperCase() }))} />
              </Field>
              <Field label="Município">
                <input className={INPUT} style={INPUT_STY} value={conta.municipio}
                  onChange={e => setConta(c => ({ ...c, municipio: e.target.value }))} />
              </Field>
            </div>
          </div>

          <div className="pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <p className="text-[11px] font-bold uppercase mb-2" style={{ color: 'var(--text-faint)' }}>Dados bancários</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Banco">
                <input className={INPUT} style={INPUT_STY} list="bancos-tesouraria" value={conta.banco}
                  onChange={e => setConta(c => ({ ...c, banco: e.target.value }))} placeholder="Banco do Brasil…" />
                <datalist id="bancos-tesouraria">
                  {BANCOS_SUGERIDOS.map(b => <option key={b} value={b} />)}
                </datalist>
              </Field>
              <Field label="Tipo de conta">
                <select className={INPUT} style={INPUT_STY} value={conta.tipoConta}
                  onChange={e => setConta(c => ({ ...c, tipoConta: e.target.value }))}>
                  <option>Corrente</option>
                  <option>Poupança</option>
                  <option>Pagamento</option>
                </select>
              </Field>
              <Field label="Agência">
                <input className={INPUT} style={INPUT_STY} value={conta.agencia}
                  onChange={e => setConta(c => ({ ...c, agencia: e.target.value }))} />
              </Field>
              <Field label="Conta">
                <input className={INPUT} style={INPUT_STY} value={conta.conta}
                  onChange={e => setConta(c => ({ ...c, conta: e.target.value }))} />
              </Field>
              <Field label="PIX da campanha">
                <input className={INPUT} style={INPUT_STY} value={conta.pix}
                  onChange={e => setConta(c => ({ ...c, pix: e.target.value }))} />
              </Field>
              <Field label="Titular da conta">
                <input className={INPUT} style={INPUT_STY} value={conta.titular}
                  onChange={e => setConta(c => ({ ...c, titular: e.target.value }))} />
              </Field>
            </div>
          </div>

          <div className="pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <p className="text-[11px] font-bold uppercase mb-2" style={{ color: 'var(--text-faint)' }}>Responsável e limites</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Responsável financeiro">
                <input className={INPUT} style={INPUT_STY} value={conta.responsavelFinanceiro}
                  onChange={e => setConta(c => ({ ...c, responsavelFinanceiro: e.target.value }))} />
              </Field>
              <Field label="Telefone">
                <input className={INPUT} style={INPUT_STY} value={conta.telefoneResponsavel}
                  onChange={e => setConta(c => ({ ...c, telefoneResponsavel: e.target.value }))} />
              </Field>
              <Field label="E-mail">
                <input className={INPUT} style={INPUT_STY} type="email" value={conta.emailResponsavel}
                  onChange={e => setConta(c => ({ ...c, emailResponsavel: e.target.value }))} />
              </Field>
              <Field label="Limite de gastos (R$)">
                <input className={INPUT} style={INPUT_STY} inputMode="decimal" placeholder="0,00"
                  value={conta.limiteGastos}
                  onChange={e => setConta(c => ({ ...c, limiteGastos: e.target.value }))} />
              </Field>
              <Field label="Início da campanha">
                <input type="date" className={INPUT} style={INPUT_STY} value={conta.dataInicio}
                  onChange={e => setConta(c => ({ ...c, dataInicio: e.target.value }))} />
              </Field>
              <Field label="Fim da campanha">
                <input type="date" className={INPUT} style={INPUT_STY} value={conta.dataFim}
                  onChange={e => setConta(c => ({ ...c, dataFim: e.target.value }))} />
              </Field>
              <Field label="Protocolo / referência TSE">
                <input className={INPUT} style={INPUT_STY} value={conta.protocoloTse}
                  onChange={e => setConta(c => ({ ...c, protocoloTse: e.target.value }))} />
              </Field>
            </div>
            <Field label="Observações">
              <textarea className={INPUT} style={{ ...INPUT_STY, minHeight: 72, resize: 'vertical', marginTop: 8 }}
                value={conta.observacoes}
                onChange={e => setConta(c => ({ ...c, observacoes: e.target.value }))} />
            </Field>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            <Button icon={Landmark} onClick={salvarContaForm}>Salvar conta</Button>
            <Button variant="ghost" onClick={() => {
              setConta(contaVazia())
              saveConta(contaVazia())
            }}>Limpar</Button>
            {contaMsg && <span className="text-xs font-semibold" style={{ color: '#34d399' }}>{contaMsg}</span>}
          </div>
        </div>
      )}

      {/* CHECKLIST */}
      {aba === 'checklist' && (
        <div className="space-y-4">
          <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div>
                <p className="eyebrow" style={{ color: 'var(--gold)' }}>Pré-prestação</p>
                <h3 className="font-extrabold" style={{ color: 'var(--text-primary)' }}>
                  Checklist operacional · {checklist.pct}%
                </h3>
              </div>
              <div className="text-right">
                <p className="font-extrabold tnum text-xl" style={{ color: checklist.pct === 100 ? '#34d399' : 'var(--gold-bright)' }}>
                  {checklist.okCount}/{checklist.total}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>itens ok</p>
              </div>
            </div>
            <div className="h-2 rounded-full overflow-hidden mb-4" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full transition-all"
                style={{ width: `${checklist.pct}%`, background: checklist.pct === 100 ? '#34d399' : 'linear-gradient(90deg,#a8842e,#f0d48a)' }} />
            </div>
            <div className="space-y-2">
              {checklist.itens.map(item => (
                <div key={item.id} className="flex items-start gap-3 rounded-xl px-3 py-2.5"
                  style={{
                    background: item.ok ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
                    border: `1px solid ${item.ok ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.25)'}`,
                  }}>
                  {item.ok
                    ? <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#34d399' }} />
                    : <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#f87171' }} />}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{item.titulo}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{item.detalhe}</p>
                  </div>
                  {!item.ok && (item.id === 'cnpj' || item.id === 'banco' || item.id === 'pix' || item.id === 'responsavel' || item.id === 'periodo') && (
                    <button type="button" className="text-[10px] font-bold" style={{ color: 'var(--gold-bright)' }}
                      onClick={() => setAba('conta')}>Corrigir</button>
                  )}
                  {!item.ok && (item.id === 'comprovantes' || item.id === 'documentos' || item.id === 'conta_campanha' || item.id === 'previstos') && (
                    <button type="button" className="text-[10px] font-bold" style={{ color: 'var(--gold-bright)' }}
                      onClick={() => {
                        setAba('movimentos')
                        if (item.id === 'comprovantes') updFiltro('semComprovante', true)
                      }}>Ver</button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[10px] mt-4" style={{ color: 'var(--text-faint)' }}>
              Ferramenta operacional da campanha — não substitui a prestação de contas oficial junto ao TSE/contador.
            </p>
          </div>
        </div>
      )}

      {/* MODAL LANÇAMENTO */}
      {modal && (
        <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4 sm:p-5"
            style={{
              background: 'var(--bg-surface, #0e131c)',
              border: '1px solid var(--border-subtle)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.65)',
            }}>

            {modal.rapido ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="eyebrow" style={{ color: modal.form.tipo === 'entrada' ? '#34d399' : '#f87171' }}>
                      Lançamento rápido
                    </p>
                    <h3 className="font-extrabold text-xl" style={{ color: 'var(--text-primary)' }}>
                      {modal.form.tipo === 'entrada' ? 'Quanto você recebeu?' : 'Quanto você pagou?'}
                    </h3>
                  </div>
                  <button type="button" onClick={() => setModal(null)} className="p-2 rounded-lg" style={{ color: 'var(--text-faint)' }}>
                    <X size={18} />
                  </button>
                </div>

                {rapidoOk && (
                  <p className="text-sm mb-3 font-bold rounded-lg px-3 py-2" style={{ color: '#34d399', background: 'rgba(52,211,153,0.12)' }}>
                    {rapidoOk} · pode lançar outro
                  </p>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="text-[11px] font-semibold block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Valor (R$)</label>
                    <input
                      ref={valorRapidoRef}
                      className={INPUT}
                      style={{ fontSize: 28, fontWeight: 800, padding: '14px 16px', letterSpacing: '-0.02em' }}
                      inputMode="decimal"
                      placeholder="0,00"
                      value={modal.form.valor}
                      onChange={e => updForm({ valor: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          salvarModal({ eContinuar: true })
                        }
                      }}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold block mb-2" style={{ color: 'var(--text-tertiary)' }}>
                      {modal.form.tipo === 'entrada' ? 'De onde veio?' : 'Para que foi?'}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {(modal.form.tipo === 'entrada' ? FONTES_RAPIDAS : DESTINOS_RAPIDOS).map(f => {
                        const on = modal.form.categoria === f.id
                        return (
                          <button key={f.id} type="button" onClick={() => updForm({ categoria: f.id })}
                            className="px-3 py-2 rounded-xl text-[12px] font-bold"
                            style={{
                              background: on ? (modal.form.tipo === 'entrada' ? 'rgba(52,211,153,0.22)' : 'rgba(248,113,113,0.2)') : 'rgba(255,255,255,0.04)',
                              color: on ? (modal.form.tipo === 'entrada' ? '#6ee7b7' : '#fca5a5') : 'var(--text-tertiary)',
                              border: on
                                ? `1px solid ${modal.form.tipo === 'entrada' ? 'rgba(52,211,153,0.5)' : 'rgba(248,113,113,0.45)'}`
                                : '1px solid var(--border-subtle)',
                            }}>
                            {f.short}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <Field label={modal.form.tipo === 'entrada' ? 'De quem? (opcional)' : 'Para quem? (opcional)'}>
                    <input className={INPUT} style={INPUT_STY}
                      placeholder={modal.form.tipo === 'entrada' ? 'Nome do doador / origem' : 'Fornecedor / pessoa'}
                      value={modal.form.contraparte}
                      onChange={e => updForm({ contraparte: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          salvarModal({ eContinuar: true })
                        }
                      }}
                    />
                  </Field>

                  <Field label="Data">
                    <input type="date" className={INPUT} style={INPUT_STY}
                      value={modal.form.data} onChange={e => updForm({ data: e.target.value })} />
                  </Field>

                  {erro && <p className="text-xs font-semibold" style={{ color: '#f87171' }}>{erro}</p>}

                  <div className="flex flex-col gap-2 pt-1">
                    <Button className="w-full" icon={modal.form.tipo === 'entrada' ? ArrowDownLeft : ArrowUpRight}
                      onClick={() => salvarModal({ eContinuar: true })}>
                      {modal.form.tipo === 'entrada' ? 'Confirmar recebimento' : 'Confirmar pagamento'}
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="ghost" className="flex-1" onClick={() => setModal(null)}>Fechar</Button>
                      <Button variant="ghost" className="flex-1" onClick={() => setModal(m => m ? { ...m, rapido: false } : m)}>
                        Mais detalhes
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="eyebrow" style={{ color: 'var(--gold)' }}>
                  {modal.mode === 'novo' ? 'Novo lançamento' : 'Editar lançamento'}
                </p>
                <h3 className="font-extrabold text-lg" style={{ color: 'var(--text-primary)' }}>
                  {modal.form.tipo === 'entrada' ? 'Entrada de recurso' : 'Destinação de gasto'}
                </h3>
              </div>
              <button type="button" onClick={() => setModal(null)} className="p-2 rounded-lg" style={{ color: 'var(--text-faint)' }}>
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl mb-3" style={{ background: 'rgba(0,0,0,0.25)' }}>
              {['entrada', 'saida'].map(t => (
                <button key={t} type="button" onClick={() => updForm({ tipo: t })}
                  className="rounded-lg py-2 text-xs font-bold"
                  style={{
                    background: modal.form.tipo === t ? `${corTipo(t)}33` : 'transparent',
                    color: modal.form.tipo === t ? corTipo(t) : 'var(--text-tertiary)',
                    border: modal.form.tipo === t ? `1px solid ${corTipo(t)}66` : '1px solid transparent',
                  }}>
                  {labelTipo(t)}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Valor (R$) *">
                  <input className={INPUT} style={INPUT_STY} inputMode="decimal" placeholder="0,00"
                    value={modal.form.valor} onChange={e => updForm({ valor: e.target.value })} />
                </Field>
                <Field label="Data *">
                  <input type="date" className={INPUT} style={INPUT_STY}
                    value={modal.form.data} onChange={e => updForm({ data: e.target.value })} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label={modal.form.tipo === 'entrada' ? 'Fonte do recurso' : 'Destino do gasto'}>
                  <select className={INPUT} style={INPUT_STY} value={modal.form.categoria}
                    onChange={e => updForm({ categoria: e.target.value })}>
                    {categoriasDoTipo(modal.form.tipo).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Forma">
                  <select className={INPUT} style={INPUT_STY} value={modal.form.forma}
                    onChange={e => updForm({ forma: e.target.value })}>
                    {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Status">
                <select className={INPUT} style={INPUT_STY} value={modal.form.status}
                  onChange={e => updForm({ status: e.target.value })}>
                  {STATUS_MOVIMENTO.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </Field>

              <div className="rounded-xl p-2.5 space-y-2" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-subtle)' }}>
                <p className="text-[10px] font-bold uppercase inline-flex items-center gap-1" style={{ color: 'var(--text-faint)' }}>
                  <Link2 size={11} /> Vincular a Equipe / Empresa
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <select className={INPUT} style={INPUT_STY}
                    value={modal.form.vinculoTipo || ''}
                    onChange={e => {
                      const t = e.target.value
                      if (!t) aplicarVinculo('', '')
                      else updForm({ vinculoTipo: t, vinculoId: '', vinculoNome: '' })
                    }}>
                    <option value="">Sem vínculo</option>
                    <option value="membro">Membro da equipe</option>
                    <option value="empresa">Empresa / fornecedor</option>
                  </select>
                  <select className={INPUT} style={INPUT_STY}
                    disabled={!modal.form.vinculoTipo}
                    value={modal.form.vinculoId || ''}
                    onChange={e => aplicarVinculo(modal.form.vinculoTipo, e.target.value)}>
                    <option value="">Selecione…</option>
                    {(modal.form.vinculoTipo === 'membro' ? vinculos.membros : vinculos.empresas).map(o => (
                      <option key={o.id} value={o.id}>{o.nome}{o.extra ? ` (${o.extra})` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>

              <Field label="Contraparte (nome)">
                <input className={INPUT} style={INPUT_STY} placeholder="Doador, fornecedor, membro…"
                  value={modal.form.contraparte} onChange={e => updForm({ contraparte: e.target.value })} />
              </Field>

              <Field label="CPF / CNPJ da contraparte">
                <input className={INPUT} style={INPUT_STY} placeholder="000.000.000-00"
                  value={modal.form.documentoContraparte}
                  onChange={e => updForm({ documentoContraparte: formatarCpfCnpj(e.target.value) })} />
              </Field>

              <Field label="Descrição">
                <textarea className={INPUT} style={{ ...INPUT_STY, minHeight: 64, resize: 'vertical' }}
                  value={modal.form.descricao} onChange={e => updForm({ descricao: e.target.value })} />
              </Field>

              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={modal.form.naContaCampanha !== false}
                  onChange={e => updForm({ naContaCampanha: e.target.checked })} />
                Lançamento na conta de campanha
              </label>

              <div>
                <label className="text-[11px] font-semibold block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Comprovante</label>
                <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={anexarComprovante} />
                {modal.form.comprovante ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2"
                    style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-subtle)' }}>
                    <div className="min-w-0 flex items-center gap-2">
                      <Receipt size={14} style={{ color: 'var(--gold)' }} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{modal.form.comprovante.nome}</p>
                        <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{fmtTamanho(modal.form.comprovante.tamanho)}</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => updForm({ comprovante: null })} className="p-1.5" style={{ color: 'var(--text-faint)' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : (
                  <button type="button" disabled={salvandoArq} onClick={() => fileRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.15)', color: 'var(--text-tertiary)' }}>
                    <Paperclip size={14} />{salvandoArq ? 'Anexando…' : 'Anexar comprovante'}
                  </button>
                )}
              </div>

              {erro && <p className="text-xs font-semibold" style={{ color: '#f87171' }}>{erro}</p>}

              <div className="flex gap-2 pt-1">
                <Button variant="ghost" className="flex-1" onClick={() => setModal(null)}>Cancelar</Button>
                <Button className="flex-1" onClick={() => salvarModal()}>Salvar</Button>
              </div>
            </div>
              </>
            )}
          </div>
        </div>
      )}
    </ModuleWrap>
    </div>
  )
}

function RowFin({ label, value, color }) {
  return (
    <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className="font-bold tnum" style={{ color: color || 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

function ListaMovimentos({ itens, onEdit, onDelete, compact = false }) {
  if (!itens.length) {
    return (
      <div className="py-10 text-center">
        <Building2 size={28} className="mx-auto mb-2" style={{ color: 'var(--text-faint)' }} />
        <p className="font-bold text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum lançamento</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>Registre entradas e destinações do recurso eleitoral.</p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {itens.map(m => (
        <div key={m.id} className="flex items-start gap-3 rounded-xl px-3 py-2.5"
          style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: `${corTipo(m.tipo)}22`, color: corTipo(m.tipo) }}>
            {m.tipo === 'entrada' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <TipoPill tipo={m.tipo} />
              <StatusPill status={m.status} />
              {m.naContaCampanha === false && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: '#fbbf24', background: 'rgba(251,191,36,0.15)' }}>
                  fora da conta
                </span>
              )}
              <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{fmtData(m.data)}</span>
            </div>
            <p className="font-bold text-[13px] mt-1 truncate" style={{ color: 'var(--text-primary)' }}>
              {m.descricao || m.categoria}
            </p>
            <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>
              {m.categoria}
              {m.contraparte ? ` · ${m.contraparte}` : ''}
              {m.documentoContraparte ? ` · ${m.documentoContraparte}` : ''}
              {m.forma ? ` · ${m.forma}` : ''}
              {m.comprovante ? ' · comprovante' : ' · sem comprovante'}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-extrabold tnum text-[14px]" style={{ color: corTipo(m.tipo) }}>
              {m.tipo === 'saida' ? '−' : '+'}{fmtMoeda(parseValor(m.valor))}
            </p>
            {!compact && (
              <div className="flex gap-1 justify-end mt-1.5">
                <button type="button" onClick={() => onEdit(m)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-faint)' }}>
                  <Pencil size={13} />
                </button>
                <button type="button" onClick={() => onDelete(m.id)} className="p-1.5 rounded-lg" style={{ color: '#f87171' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
