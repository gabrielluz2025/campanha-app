import { useState, useMemo, useEffect } from 'react'
import ListaPessoas from './ListaPessoas'
import {
  RadialBarChart, RadialBar, Cell, Tooltip, ResponsiveContainer,
  PieChart, Pie, Legend,
} from 'recharts'
import {
  TrendingUp, DollarSign, Users, UserCheck,
  Building2, Fuel, Briefcase, Info,
  Wallet, Lock, Unlock, CheckCircle2, AlertTriangle, Pencil,
  Plus, Trash2, Calendar, CalendarDays, Download, Printer,
} from 'lucide-react'

const fmt = (v) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const num = (v) => {
  const n = parseFloat(String(v).replace(',', '.'))
  return isNaN(n) || n < 0 ? 0 : n
}

const CORES = ['#3b82f6', '#f59e0b', '#10b981', '#06b6d4', '#ec4899']

function CardCategoria({ cor, icon: Icon, titulo, descricao, children, total }) {
  return (
    <div className="surface rounded-3xl overflow-hidden"
      style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08)', borderTop: `4px solid ${cor}` }}>
      <div className="flex items-center gap-3 px-5 py-4"
        style={{ background: `${cor}09`, borderBottom: `1px solid ${cor}22` }}>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${cor}1e` }}>
          <Icon size={18} style={{ color: cor }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold txt-1" style={{ fontSize: 13 }}>{titulo}</p>
          <p className="txt-3 truncate" style={{ fontSize: 11 }}>{descricao}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-semibold txt-3" style={{ fontSize: 10 }}>PREVISÃO</p>
          <p className="font-black" style={{ fontSize: 17, color: cor }}>{fmt(total)}</p>
        </div>
      </div>
      <div className="px-5 py-4 space-y-3" style={{ background: 'var(--bg-raised)' }}>
        {children}
      </div>
    </div>
  )
}

function Campo({ label, hint, value, onChange, type = 'number', prefix, suffix, disabled }) {
  return (
    <div>
      <label className="flex items-center gap-1 mb-1.5 font-semibold" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
        {label}
        {hint && (
          <span className="group relative cursor-help">
            <Info size={11} className="txt-3" />
            <span className="hidden group-hover:block absolute left-4 -top-1 z-10 w-48 bg-gray-800 text-white text-xs rounded-xl px-2.5 py-1.5 shadow-xl">
              {hint}
            </span>
          </span>
        )}
      </label>
      <div className="flex items-stretch rounded-xl overflow-hidden" style={{ border: '1.5px solid var(--border-soft)' }}>
        {prefix && (
          <span className={`text-xs txt-3 srf-soft px-3 flex items-center flex-shrink-0 ${disabled ? 'opacity-50' : ''}`}
            style={{ borderRight: '1.5px solid var(--border-soft)' }}>
            {prefix}
          </span>
        )}
        <input type={type} min="0" step="any" value={value} disabled={disabled}
          onChange={e => onChange(e.target.value)}
          className={`flex-1 srf px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-right ${disabled ? 'opacity-50 cursor-not-allowed srf-soft' : ''}`}
        />
        {suffix && (
          <span className={`text-xs txt-3 srf-soft px-3 flex items-center flex-shrink-0 ${disabled ? 'opacity-50' : ''}`}
            style={{ borderLeft: '1.5px solid var(--border-soft)' }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

function LinhaCalculo({ label, value, destaque }) {
  return (
    <div className="flex justify-between items-center"
      style={{ fontSize: destaque ? 12 : 11, fontWeight: destaque ? 700 : 400,
               color: destaque ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
      <span>{label}</span>
      <span style={{ color: destaque ? 'var(--accent-bright)' : undefined }}>{fmt(value)}</span>
    </div>
  )
}

const PREVISAO_KEY = 'previsao_data'
const SAVED_PREVISAO = (() => {
  try { return JSON.parse(localStorage.getItem(PREVISAO_KEY) || '{}') } catch { return {} }
})()

export default function PrevisaoGasto() {
  const [dataInicio, setDataInicio] = useState(SAVED_PREVISAO.dataInicio ?? '2026-08-16')
  const [dataFim, setDataFim]       = useState(SAVED_PREVISAO.dataFim ?? '2026-10-03')
  const [orcDisponivel, setOrcDisponivel] = useState(SAVED_PREVISAO.orcDisponivel ?? '')
  const [efetivada, setEfetivada] = useState(SAVED_PREVISAO.efetivada ?? null)
  const [confirmando, setConfirmando] = useState(false)

  const [cabosPessoas, setCabosPessoas] = useState(SAVED_PREVISAO.cabosPessoas ?? [])
  const [ruaPessoas, setRuaPessoas] = useState(SAVED_PREVISAO.ruaPessoas ?? [])
  const [comites, setComites] = useState(SAVED_PREVISAO.comites ?? [
    { id: 1, nome: 'Comitê Central', contrato: '', locador: '', dias: '', valorMensal: 12000 },
  ])
  const [combPreco, setCombPreco] = useState(SAVED_PREVISAO.combPreco ?? 6.20)
  const [carros, setCarros] = useState(SAVED_PREVISAO.carros ?? [
    { id: 1, nome: 'Carro 1', kmMes: 2000, autonomia: 10 },
  ])
  const [adminPessoas, setAdminPessoas] = useState(SAVED_PREVISAO.adminPessoas ?? [])

  useEffect(() => {
    localStorage.setItem(PREVISAO_KEY, JSON.stringify({
      dataInicio, dataFim, orcDisponivel, efetivada,
      cabosPessoas, ruaPessoas, comites, combPreco, carros, adminPessoas,
    }))
  }, [dataInicio, dataFim, orcDisponivel, efetivada, cabosPessoas, ruaPessoas, comites, combPreco, carros, adminPessoas])

  const diasCampanha = useMemo(() => {
    if (!dataInicio || !dataFim) return 0
    const diff = Math.round((new Date(dataFim) - new Date(dataInicio)) / 86400000) + 1
    return diff > 1 ? diff : 0
  }, [dataInicio, dataFim])
  const meses = useMemo(() => diasCampanha > 0 ? diasCampanha / 30.44 : 1, [diasCampanha])

  const fmtData = (iso) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : '—'

  const totalCabos  = useMemo(() => cabosPessoas.reduce((s, p) => s + (Number(p.valor) || 0), 0), [cabosPessoas])
  const totalRua    = useMemo(() => ruaPessoas.reduce((s, p) => s + (Number(p.valor) || 0), 0), [ruaPessoas])
  const comitesComCusto = useMemo(() => comites.map(c => {
    const dias = num(c.dias) > 0 ? num(c.dias) : diasCampanha
    const totalPeriodo = num(c.valorMensal)
    return { ...c, diasUsados: dias, totalPeriodo }
  }), [comites, diasCampanha])
  const totalComite = useMemo(() => comitesComCusto.reduce((s, c) => s + c.totalPeriodo, 0), [comitesComCusto])
  const carrosComCusto = useMemo(() => carros.map(c => {
    const custoPorKm = num(c.autonomia) > 0 ? num(combPreco) / num(c.autonomia) : 0
    const totalMes   = custoPorKm * num(c.kmMes)
    const totalPeriodo = totalMes * num(meses)
    return { ...c, custoPorKm, totalMes, totalPeriodo }
  }), [carros, combPreco, meses])
  const totalComb = useMemo(() => carrosComCusto.reduce((s, c) => s + c.totalPeriodo, 0), [carrosComCusto])
  const totalAdmin  = useMemo(() => adminPessoas.reduce((s, p) => s + (Number(p.valor) || 0), 0), [adminPessoas])

  const totalGeral     = totalCabos + totalRua + totalComite + totalComb + totalAdmin
  const orcDispNum     = num(orcDisponivel)
  const saldoFinal     = orcDispNum - totalGeral
  const pctUtilizado   = orcDispNum > 0 ? Math.min(100, (totalGeral / orcDispNum) * 100) : 0
  const temOrcamento   = orcDispNum > 0

  // Publica um resumo leve para o Dashboard consumir (sem duplicar a conta).
  useEffect(() => {
    localStorage.setItem('previsao_resumo', JSON.stringify({
      totalGeral, orcDisponivel: orcDispNum, saldoFinal, pctUtilizado,
      temOrcamento, efetivada: efetivada !== null,
      dataInicio, dataFim,
      atualizadoEm: new Date().toISOString(),
    }))
  }, [totalGeral, orcDispNum, saldoFinal, pctUtilizado, temOrcamento, efetivada, dataInicio, dataFim])

  // Budget alerts
  const alertaOrcamento = useMemo(() => {
    if (!temOrcamento) return null
    if (saldoFinal < 0) return { tipo: 'critico', msg: 'Orçamento excedido! Ajuste os valores.' }
    if (pctUtilizado > 90) return { tipo: 'alerta', msg: 'Orçamento quase esgotado (90%+)' }
    if (pctUtilizado > 75) return { tipo: 'aviso', msg: 'Orçamento em 75%+ da capacidade' }
    return null
  }, [temOrcamento, saldoFinal, pctUtilizado])

  // Budget stats colors
  const budgetStats = useMemo(() => [
    { label: 'Previsão de Gasto', value: fmt(totalGeral), cor: '#1d4ed8' },
    { label: 'Utilização', value: pctUtilizado.toFixed(1) + '%', cor: pctUtilizado >= 100 ? '#ef4444' : pctUtilizado >= 80 ? '#f59e0b' : '#10b981' },
    { label: saldoFinal >= 0 ? 'Saldo Livre' : 'Déficit', value: fmt(Math.abs(saldoFinal)), cor: saldoFinal >= 0 ? '#10b981' : '#ef4444' },
  ], [totalGeral, pctUtilizado, saldoFinal])

  // Export/Print functions
  function exportarDados() {
    const dados = {
      periodo: { inicio: dataInicio, fim: dataFim, dias: diasCampanha, meses: meses.toFixed(1) },
      orcamento: { disponivel: orcDispNum, totalGeral, saldoFinal, pctUtilizado },
      categorias: {
        cabos: totalCabos,
        rua: totalRua,
        comite: totalComite,
        combustivel: totalComb,
        administrativo: totalAdmin,
      },
      detalhes: {
        cabosPessoas,
        ruaPessoas,
        comites: comitesComCusto,
        carros: carrosComCusto,
        adminPessoas,
        combustivel: { preco: combPreco },
      },
    }
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `previsao-orcamento-${dataInicio}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function imprimirRelatorio() {
    window.print()
  }

  function addCabo(p)    { setCabosPessoas(prev => [...prev, p]) }
  function updateCabo(id, d) { setCabosPessoas(prev => prev.map(p => p.id === id ? { ...p, ...d } : p)) }
  function removeCabo(id)    { setCabosPessoas(prev => prev.filter(p => p.id !== id)) }

  function addRua(p)    { setRuaPessoas(prev => [...prev, p]) }
  function updateRua(id, d) { setRuaPessoas(prev => prev.map(p => p.id === id ? { ...p, ...d } : p)) }
  function removeRua(id)    { setRuaPessoas(prev => prev.filter(p => p.id !== id)) }

  function addAdmin(p)    { setAdminPessoas(prev => [...prev, p]) }
  function updateAdmin(id, d) { setAdminPessoas(prev => prev.map(p => p.id === id ? { ...p, ...d } : p)) }
  function removeAdmin(id)    { setAdminPessoas(prev => prev.filter(p => p.id !== id)) }

  function adicionarComite() {
    const novoId = comites.length === 0 ? 1 : Math.max(...comites.map(c => c.id)) + 1
    setComites(prev => [...prev, { id: novoId, nome: `Comitê ${prev.length + 1}`, contrato: '', locador: '', dias: '', valorMensal: 0 }])
  }
  function removerComite(id)    { setComites(prev => prev.filter(c => c.id !== id)) }
  function atualizarComite(id, campo, valor) { setComites(prev => prev.map(c => c.id === id ? { ...c, [campo]: valor } : c)) }

  function adicionarCarro() {
    const novoId = carros.length === 0 ? 1 : Math.max(...carros.map(c => c.id)) + 1
    const novoNum = carros.length + 1
    setCarros(prev => [...prev, { id: novoId, nome: `Carro ${novoNum}`, kmMes: 1000, autonomia: 10 }])
  }

  function removerCarro(id) {
    setCarros(prev => prev.filter(c => c.id !== id))
  }

  function atualizarCarro(id, campo, valor) {
    setCarros(prev => prev.map(c => c.id === id ? { ...c, [campo]: valor } : c))
  }

  function tornarEfetiva() {
    setEfetivada({
      data: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      totalGeral,
      orcDisponivel: orcDispNum,
      saldo: saldoFinal,
      meses,
      diasCampanha,
      dataInicio: fmtData(dataInicio),
      dataFim: fmtData(dataFim),
      categorias: [
        { nome: 'Cabos Eleitorais',  valor: totalCabos,  qtd: cabosPessoas.length },
        { nome: 'Pessoal de Rua',    valor: totalRua,    qtd: ruaPessoas.length   },
        { nome: 'Aluguel de Comitê', valor: totalComite },
        { nome: 'Combustível',       valor: totalComb   },
        { nome: 'Equipe Adm.',       valor: totalAdmin, qtd: adminPessoas.length },
      ],
    })
    setConfirmando(false)
  }

  const categorias = [
    { nome: 'Cabos Eleitorais',   valor: totalCabos,  cor: CORES[0] },
    { nome: 'Pessoal de Rua',     valor: totalRua,    cor: CORES[1] },
    { nome: 'Aluguel de Comitê',  valor: totalComite, cor: CORES[2] },
    { nome: 'Combustível',        valor: totalComb,   cor: CORES[3] },
    { nome: 'Equipe Adm.',        valor: totalAdmin,  cor: CORES[4] },
  ]

  const bloqueado = efetivada !== null

  return (
    <div className="flex-1 overflow-auto" >

      {/* ── Modal de confirmação ─────────────────────────────── */}
      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-md rounded-3xl overflow-hidden srf"
            style={{ boxShadow: '0 24px 80px rgba(0,0,0,0.28)' }}>
            <div className="px-6 py-6 text-center"
              style={{ background: 'linear-gradient(135deg,#1e3a8a,#1e40af)' }}>
              <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-4"
                style={{ background: 'rgba(255,255,255,0.18)' }}>
                <Lock size={26} className="text-white" />
              </div>
              <h3 className="font-black text-white" style={{ fontSize: 18 }}>Tornar Previsão Efetiva?</h3>
              <p className="text-blue-200 mt-1" style={{ fontSize: 12 }}>
                Confirma como o <strong className="text-white">orçamento oficial</strong> da campanha. Valores registrados com data e hora.
              </p>
            </div>
            <div className="px-6 py-5">
              <div className="rounded-2xl p-4 mb-5 space-y-2"
                style={{ background: 'var(--bg-raised)', border: '1.5px solid var(--border-soft)' }}>
                <div className="flex justify-between text-sm">
                  <span className="txt-3">Previsão total</span>
                  <span className="font-bold txt-1">{fmt(totalGeral)}</span>
                </div>
                {temOrcamento && (
                  <div className="flex justify-between text-sm">
                    <span className="txt-3">Orçamento disponível</span>
                    <span className="font-bold txt-1">{fmt(orcDispNum)}</span>
                  </div>
                )}
                {temOrcamento && (
                  <div className="flex justify-between text-sm pt-2 font-bold border-t brd-soft" style={{ color: saldoFinal >= 0 ? '#34d399' : '#f87171' }}>
                    <span>{saldoFinal >= 0 ? 'Sobra' : 'Déficit'}</span>
                    <span>{fmt(Math.abs(saldoFinal))}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setConfirmando(false)}
                  className="flex-1 py-2.5 rounded-2xl font-semibold text-sm transition-all"
                  style={{ border: '1.5px solid var(--border-soft)', color: 'var(--text-secondary)' }}>
                  Cancelar
                </button>
                <button onClick={tornarEfetiva}
                  className="flex-1 py-2.5 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all"
                  style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)', boxShadow: '0 4px 14px rgba(79,70,229,0.4)' }}>
                  <Lock size={14} /> Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Hero Header ─────────────────────────────────────── */}
      <div className="px-4 md:px-6 pt-7 pb-16"
        style={{ background: 'linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 60%,#1e40af 100%)' }}>
        <div className="max-w-7xl mx-auto">

          {/* Banner efetivado */}
          {efetivada && (
            <div className="mb-5 px-5 py-4 rounded-2xl flex items-center justify-between gap-4"
              style={{ background: 'rgba(255,255,255,0.13)', border: '1px solid rgba(255,255,255,0.2)' }}>
              <div className="flex items-center gap-3">
                <CheckCircle2 size={18} className="text-emerald-300 flex-shrink-0" />
                <div>
                  <p className="font-bold text-white" style={{ fontSize: 13 }}>
                    Previsão Efetivada · {efetivada.data}
                  </p>
                  {efetivada.dataInicio && (
                    <p className="text-blue-200 mt-0.5" style={{ fontSize: 11 }}>
                      Período: {efetivada.dataInicio} → {efetivada.dataFim} · {efetivada.diasCampanha} dias (≈ {efetivada.meses.toFixed(1)} meses)
                    </p>
                  )}
                </div>
              </div>
              <button onClick={() => setEfetivada(null)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-semibold text-white transition-all"
                style={{ background: 'rgba(255,255,255,0.18)', fontSize: 12 }}>
                <Pencil size={13} /> Editar
              </button>
            </div>
          )}

          {/* Título + seletor de período */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 mb-7">
            <div className="flex items-center gap-4">
              <div className="w-13 h-13 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.18)', width: 52, height: 52 }}>
                <TrendingUp size={26} className="text-white" />
              </div>
              <div>
                <h1 className="font-black text-white" style={{ fontSize: 24 }}>Previsão de Gasto</h1>
                <p className="text-blue-200 mt-0.5" style={{ fontSize: 12 }}>
                  Configure cada categoria e veja a previsão total da campanha
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={exportarDados}
                className="flex items-center gap-2 font-bold text-white px-4 py-2.5 rounded-2xl transition-all"
                  style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', fontSize: 13 }}>
                <Download size={16} /> Exportar
              </button>
              <button onClick={imprimirRelatorio}
                className="flex items-center gap-2 font-bold text-white px-4 py-2.5 rounded-2xl transition-all"
                  style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', fontSize: 13 }}>
                <Printer size={16} /> Imprimir
              </button>
            </div>
          </div>

          {/* Budget Alert */}
          {alertaOrcamento && (() => {
            const alertColor = alertaOrcamento.tipo === 'critico' ? 'text-red-300' : alertaOrcamento.tipo === 'alerta' ? 'text-amber-300' : 'text-blue-300'
            const bg = alertaOrcamento.tipo === 'critico' ? 'rgba(239,68,68,0.2)' : alertaOrcamento.tipo === 'alerta' ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)'
            const border = '1px solid ' + (alertaOrcamento.tipo === 'critico' ? 'rgba(239,68,68,0.4)' : alertaOrcamento.tipo === 'alerta' ? 'rgba(245,158,11,0.4)' : 'rgba(59,130,246,0.4)')
            return (
              <div className="px-5 py-3 rounded-2xl flex items-center gap-3"
                style={{ background: bg, border: border }}>
                <AlertTriangle size={18} className={`flex-shrink-0 ${alertColor}`} />
                <p className="font-semibold text-white" style={{ fontSize: 13 }}>{alertaOrcamento.msg}</p>
              </div>
            )
          })()}

          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl flex-wrap"
            style={{ background: 'rgba(255,255,255,0.13)', border: '1px solid rgba(255,255,255,0.18)' }}>
              <div className="flex items-center gap-1.5">
                <Calendar size={14} className="text-blue-200" />
                <span className="font-bold text-blue-200" style={{ fontSize: 11 }}>PERÍODO</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-blue-300" style={{ fontSize: 11 }}>Início</span>
                <input type="date" value={dataInicio} disabled={bloqueado} max={dataFim || undefined}
                  onChange={e => setDataInicio(e.target.value)}
                  className="bg-transparent text-white text-sm border-0 focus:outline-none disabled:opacity-50"
                  style={{ colorScheme: 'dark' }} />
              </div>
              <span className="text-blue-400">→</span>
              <div className="flex items-center gap-1.5">
                <span className="text-blue-300" style={{ fontSize: 11 }}>Fim</span>
                <input type="date" value={dataFim} disabled={bloqueado} min={dataInicio || undefined}
                  onChange={e => setDataFim(e.target.value)}
                  className="bg-transparent text-white text-sm border-0 focus:outline-none disabled:opacity-50"
                  style={{ colorScheme: 'dark' }} />
              </div>
              {diasCampanha > 0 ? (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.22)' }}>
                  <CalendarDays size={13} className="text-white" />
                  <span className="font-bold text-white" style={{ fontSize: 13 }}>{diasCampanha} dias</span>
                  <span className="text-blue-200" style={{ fontSize: 10 }}>≈ {meses.toFixed(1)}m</span>
                </div>
              ) : (
                <span className="text-red-300" style={{ fontSize: 11 }}>Selecione datas válidas</span>
              )}
            </div>

          {/* 5 mini-stats de categoria */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {categorias.map(c => (
              <div key={c.nome} className="rounded-2xl px-4 py-3"
                style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.14)' }}>
                <div className="w-6 h-6 rounded-lg mb-2 flex items-center justify-center"
                  style={{ backgroundColor: c.cor + '44' }}>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.cor }} />
                </div>
                <p className="text-blue-200 truncate" style={{ fontSize: 10 }}>{c.nome}</p>
                <p className="font-black text-white mt-0.5" style={{ fontSize: 14 }}>{fmt(c.valor)}</p>
                <p className="text-blue-300 mt-0.5" style={{ fontSize: 10 }}>
                  {totalGeral > 0 ? ((c.valor / totalGeral) * 100).toFixed(1) : '0.0'}%
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Conteúdo principal (sobrepõe o header) ──────────── */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 pb-10 -mt-10 space-y-5">

        {/* Total + Orçamento */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Card total */}
          <div className="rounded-3xl p-7 text-white flex flex-col justify-between"
            style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)',
                     boxShadow: '0 8px 32px rgba(79,70,229,0.45)', minHeight: 170 }}>
            <div>
              <p className="font-bold text-blue-200" style={{ fontSize: 11 }}>TOTAL PREVISTO DA CAMPANHA</p>
              <p className="font-black text-white mt-2" style={{ fontSize: 36, lineHeight: 1.1 }}>
                {fmt(totalGeral)}
              </p>
            </div>
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}>
              <p className="text-blue-200" style={{ fontSize: 11 }}>Média por mês</p>
              <p className="font-bold text-white" style={{ fontSize: 16 }}>
                {fmt(meses > 0 ? totalGeral / meses : 0)}
              </p>
            </div>
          </div>

          {/* Card orçamento */}
          <div className="lg:col-span-2 surface rounded-3xl p-6"
            style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(37,99,235,0.16)' }}>
                  <Wallet size={18} style={{ color: '#1d4ed8' }} />
                </div>
                <div>
                  <p className="font-bold txt-1" style={{ fontSize: 14 }}>Orçamento Disponível</p>
                  <p className="txt-3" style={{ fontSize: 11 }}>Quanto você tem para investir no total</p>
                </div>
              </div>
              <div className="flex items-stretch rounded-xl overflow-hidden"
                style={{ border: '1.5px solid rgba(255,255,255,0.12)' }}>
                <span className="text-sm txt-3 srf-soft px-3 flex items-center"
                  style={{ borderRight: '1.5px solid rgba(255,255,255,0.12)' }}>R$</span>
                <input type="number" min="0" step="any" placeholder="0,00"
                  value={orcDisponivel} disabled={bloqueado}
                  onChange={e => setOrcDisponivel(e.target.value)}
                  className="w-40 px-3 text-sm font-bold txt-1 focus:outline-none text-right disabled:opacity-50 srf" />
              </div>
            </div>

            {temOrcamento ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  {budgetStats.map(({ label, value, cor }) => {
                    const bg = cor + '0d'
                    const border = '1.5px solid ' + cor + '22'
                    return (
                      <div key={label} className="rounded-2xl p-3 text-center"
                        style={{ background: bg, border: border }}>
                        <p className="font-bold" style={{ fontSize: 10, color: cor }}>{label.toUpperCase()}</p>
                        <p className="font-black mt-1" style={{ fontSize: 16, color: cor }}>{value}</p>
                      </div>
                    )
                  })}
                </div>
                <div>
                  <div className="flex justify-between mb-1.5" style={{ fontSize: 11, color: 'rgba(203,213,235,0.45)' }}>
                    <span>R$ 0</span>
                    <span className={pctUtilizado >= 100 ? 'font-bold text-red-500' : ''}>
                      {pctUtilizado >= 100 ? '⚠ Acima do orçamento' : (100 - pctUtilizado).toFixed(1) + '% disponível'}
                    </span>
                    <span>{fmt(orcDispNum)}</span>
                  </div>
                  <div className="w-full rounded-full overflow-hidden" style={{ height: 10, background: 'rgba(255,255,255,0.07)' }}>
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: Math.min(100, pctUtilizado) + '%',
                        background: pctUtilizado >= 100
                          ? 'linear-gradient(90deg,#ef4444,#dc2626)'
                          : pctUtilizado >= 80
                          ? 'linear-gradient(90deg,#f59e0b,#d97706)'
                          : 'linear-gradient(90deg,#22c55e,#16a34a)',
                      }} />
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-6 txt-3" style={{ fontSize: 13 }}>
                Preencha o orçamento disponível para ver a análise de utilização
              </div>
            )}
          </div>
        </div>

        {/* ── Cards calculadoras ───────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* 1 - Cabos Eleitorais */}
          <CardCategoria cor={CORES[0]} icon={UserCheck} titulo="Cabos Eleitorais"
            descricao={`${cabosPessoas.length} cabo${cabosPessoas.length !== 1 ? 's' : ''} · pagamento único por contrato`}
            total={totalCabos}>
            <ListaPessoas pessoas={cabosPessoas} onAdd={addCabo} onUpdate={updateCabo}
              onRemove={removeCabo} valorPadrao={10000} disabled={bloqueado} tipo="cabo" cor={CORES[0]} />
          </CardCategoria>

          {/* 2 - Pessoal de Rua */}
          <CardCategoria cor={CORES[1]} icon={Users} titulo="Pessoal de Rua"
            descricao={`${ruaPessoas.length} pessoa${ruaPessoas.length !== 1 ? 's' : ''} · valor total por contrato`}
            total={totalRua}>
            <ListaPessoas pessoas={ruaPessoas} onAdd={addRua} onUpdate={updateRua}
              onRemove={removeRua} valorPadrao={2000} disabled={bloqueado} tipo="rua" cor={CORES[1]} />
          </CardCategoria>

          {/* 3 - Aluguel de Comitê */}
          <CardCategoria cor={CORES[2]} icon={Building2} titulo="Aluguel de Comitê"
            descricao={`${comites.length} ${comites.length === 1 ? 'comitê' : 'comitês'} · valor por contrato`}
            total={totalComite}>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'rgba(203,213,235,0.45)' }}>
                {comites.length === 0 ? 'Nenhum comitê adicionado' : `${comites.length} comitê${comites.length !== 1 ? 's' : ''}`}
              </span>
              {!bloqueado && (
                <button onClick={adicionarComite}
                  className="flex items-center gap-1.5 text-white font-bold px-3 py-2 rounded-xl whitespace-nowrap transition-all"
                  style={{ background: CORES[2], fontSize: 12, boxShadow: `0 4px 12px ${CORES[2]}55` }}>
                  <Plus size={13} /> Adicionar comitê
                </button>
              )}
            </div>
            <div className="space-y-2">
              {comites.length === 0 && (
                <div className="text-center py-4 rounded-xl"
                  style={{ fontSize: 12, color: 'rgba(203,213,235,0.45)', background: 'var(--bg-surface)', border: '1.5px dashed rgba(255,255,255,0.12)' }}>
                  Nenhum comitê adicionado
                </div>
              )}
              {comitesComCusto.map(c => (
                <div key={c.id} className="rounded-2xl p-3"
                  style={{ background: 'var(--bg-surface)', border: '1.5px solid rgba(255,255,255,0.12)' }}>
                  <div className="flex items-center justify-between mb-2.5">
                    <input value={c.nome} disabled={bloqueado}
                      onChange={e => atualizarComite(c.id, 'nome', e.target.value)}
                      placeholder="Nome do comitê"
                      className="text-xs font-bold txt-2 bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1 flex-1 min-w-0 disabled:cursor-not-allowed" />
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-bold" style={{ fontSize: 12, color: CORES[2] }}>
                        {fmt(c.totalPeriodo)}
                      </span>
                      {!bloqueado && (
                        <button onClick={() => removerComite(c.id)}
                          className="p-1 rounded-lg hov-srf transition-colors">
                          <Trash2 size={12} style={{ color: '#f87171' }} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Campo label="Nº do contrato" type="text" value={c.contrato} disabled={bloqueado}
                      onChange={v => atualizarComite(c.id, 'contrato', v)} />
                    <Campo label="Nº do locador" type="text" value={c.locador} disabled={bloqueado}
                      onChange={v => atualizarComite(c.id, 'locador', v)} />
                    <Campo label="Dias contratados" suffix="dias" value={c.dias} disabled={bloqueado}
                      onChange={v => atualizarComite(c.id, 'dias', v)} />
                    <Campo label="Valor do contrato (aluguel + água + luz)" prefix="R$" value={c.valorMensal} disabled={bloqueado}
                      onChange={v => atualizarComite(c.id, 'valorMensal', v)} />
                  </div>
                  <p className="mt-2" style={{ fontSize: 10, color: 'rgba(203,213,235,0.45)' }}>
                    {fmt(num(c.valorMensal))} · {c.diasUsados} dias contratados
                    {num(c.dias) <= 0 && <span> (dias da campanha)</span>}
                  </p>
                </div>
              ))}
            </div>
            <div className="pt-2 space-y-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
              {comitesComCusto.length > 1 && comitesComCusto.map(c => (
                <LinhaCalculo key={c.id} label={c.nome || 'Comitê'} value={c.totalPeriodo} />
              ))}
              <LinhaCalculo
                label={`Total ${comites.length} ${comites.length === 1 ? 'comitê' : 'comitês'}`}
                value={totalComite} destaque />
            </div>
          </CardCategoria>

          {/* 4 - Combustível */}
          <CardCategoria cor={CORES[3]} icon={Fuel}
            titulo="Combustível"
            descricao={`${carros.length} ${carros.length === 1 ? 'veículo' : 'veículos'} · R$ ${num(combPreco).toFixed(2)}/L`}
            total={totalComb}>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Campo label="Preço do combustível (R$/L)" prefix="R$" value={combPreco}
                  hint="Preço médio atual da gasolina em Blumenau/SC" disabled={bloqueado}
                  onChange={v => setCombPreco(v)} />
              </div>
              {!bloqueado && (
                <button onClick={adicionarCarro}
                  className="flex items-center gap-1.5 text-white font-bold px-3 py-2.5 rounded-xl whitespace-nowrap transition-all"
                  style={{ background: CORES[3], fontSize: 12, boxShadow: `0 4px 12px ${CORES[3]}55` }}>
                  <Plus size={13} /> Adicionar veículo
                </button>
              )}
            </div>
            <div className="space-y-2">
              {carros.length === 0 && (
                <div className="text-center py-4 rounded-xl"
                  style={{ fontSize: 12, color: 'rgba(203,213,235,0.45)', background: 'var(--bg-surface)', border: '1.5px dashed rgba(255,255,255,0.12)' }}>
                  Nenhum veículo adicionado
                </div>
              )}
              {carrosComCusto.map(carro => (
                <div key={carro.id} className="rounded-2xl p-3"
                  style={{ background: 'var(--bg-surface)', border: '1.5px solid rgba(255,255,255,0.12)' }}>
                  <div className="flex items-center justify-between mb-2.5">
                    <input value={carro.nome} disabled={bloqueado}
                      onChange={e => atualizarCarro(carro.id, 'nome', e.target.value)}
                      className="text-xs font-bold txt-2 bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-purple-400 rounded px-1 w-28 disabled:cursor-not-allowed" />
                    <div className="flex items-center gap-2">
                      <span className="font-bold" style={{ fontSize: 12, color: CORES[3] }}>
                        {fmt(carro.totalPeriodo)}
                      </span>
                      {!bloqueado && (
                        <button onClick={() => removerCarro(carro.id)}
                          className="p-1 rounded-lg hov-srf transition-colors">
                          <Trash2 size={12} style={{ color: '#f87171' }} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Campo label="Km por mês" suffix="km" value={carro.kmMes} disabled={bloqueado}
                      onChange={v => atualizarCarro(carro.id, 'kmMes', v)} />
                    <Campo label="Autonomia" suffix="km/L" value={carro.autonomia} disabled={bloqueado}
                      onChange={v => atualizarCarro(carro.id, 'autonomia', v)} />
                  </div>
                  <p className="mt-2" style={{ fontSize: 10, color: 'rgba(203,213,235,0.45)' }}>
                    R$ {num(combPreco).toFixed(2)}/L ÷ {num(carro.autonomia)} km/L = {fmt(carro.custoPorKm)}/km · {num(carro.kmMes).toLocaleString()} km/mês × {diasCampanha} dias
                  </p>
                </div>
              ))}
            </div>
            <div className="pt-2 space-y-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
              {carrosComCusto.length > 1 && carrosComCusto.map(c => (
                <LinhaCalculo key={c.id} label={c.nome} value={c.totalPeriodo} />
              ))}
              <LinhaCalculo
                label={`Total ${carros.length} ${carros.length === 1 ? 'veículo' : 'veículos'} × ${diasCampanha} dias`}
                value={totalComb} destaque />
            </div>
          </CardCategoria>

          {/* 5 - Equipe Administrativa */}
          <CardCategoria cor={CORES[4]} icon={Briefcase} titulo="Equipe Administrativa"
            descricao={`${adminPessoas.length} ${adminPessoas.length === 1 ? 'membro' : 'membros'} · valor por contrato`}
            total={totalAdmin}>
            <ListaPessoas pessoas={adminPessoas} onAdd={addAdmin} onUpdate={updateAdmin}
              onRemove={removeAdmin} valorPadrao={5000} disabled={bloqueado} tipo="admin" cor={CORES[4]} />
          </CardCategoria>
        </div>

        {/* ── Botão Tornar Efetiva ─────────────────────────── */}
        {!bloqueado && (
          <div className="flex justify-center py-2">
            <button onClick={() => setConfirmando(true)}
              className="flex items-center gap-3 text-white font-black px-12 py-4 rounded-3xl transition-all"
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)', fontSize: 15,
                       boxShadow: '0 8px 32px rgba(79,70,229,0.45)' }}>
              <Lock size={20} /> Tornar Previsão Efetiva
            </button>
          </div>
        )}

        {/* ── Gráficos ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Anéis radiais por categoria */}
          <div className="surface rounded-3xl p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.16)' }}>
                <DollarSign size={16} style={{ color: '#1d4ed8' }} />
              </div>
              <div>
                <h2 className="font-bold txt-1" style={{ fontSize: 14 }}>Anéis de Orçamento</h2>
                <p className="txt-3" style={{ fontSize: 11 }}>Cada anel = % do total</p>
              </div>
            </div>
            <div className="relative">
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie
                    data={[...categorias].sort((a, b) => b.valor - a.valor).map(c => ({
                      name: c.nome,
                      value: c.valor,
                      fill: c.cor,
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    label={(entry) => entry.percent > 0.05 ? (entry.percent * 100).toFixed(0) + '%' : ''}
                    labelLine={false}
                  >
                    {[...categorias].sort((a, b) => b.valor - a.valor).map((c, i) => (
                      <Cell key={c.nome} fill={c.cor} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, name) => [fmt(v), name]}
                    contentStyle={{ borderRadius: 12, border: 'none',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.15)', fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="font-bold txt-3" style={{ fontSize: 10 }}>TOTAL</p>
                <p className="font-black txt-1" style={{ fontSize: 16 }}>{fmt(totalGeral)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1">
              {[...categorias].sort((a, b) => b.valor - a.valor).map(c => (
                <div key={c.nome} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.cor }} />
                  <span style={{ fontSize: 11, color: 'rgba(203,213,235,0.60)' }}>{c.nome}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Detalhamento horizontal custom */}
          <div className="surface rounded-3xl p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
            <div className="flex items-center gap-2 mb-5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.16)' }}>
                <TrendingUp size={16} style={{ color: '#1d4ed8' }} />
              </div>
              <div>
                <h2 className="font-bold txt-1" style={{ fontSize: 14 }}>Detalhamento por Categoria</h2>
                <p className="txt-3" style={{ fontSize: 11 }}>Ordenado por valor</p>
              </div>
            </div>
            <div className="space-y-4">
              {[...categorias].sort((a, b) => b.valor - a.valor).map(c => {
                const pct = totalGeral > 0 ? (c.valor / totalGeral) * 100 : 0
                return (
                  <div key={c.nome}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: c.cor + '1c' }}>
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.cor }} />
                        </div>
                        <span className="font-semibold txt-2" style={{ fontSize: 12 }}>{c.nome}</span>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <span className="font-black" style={{ fontSize: 13, color: c.cor }}>{fmt(c.valor)}</span>
                        <span className="ml-1.5 font-bold" style={{ fontSize: 11, color: 'rgba(203,213,235,0.45)' }}>{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="w-full rounded-full overflow-hidden" style={{ height: 9, background: 'rgba(255,255,255,0.07)' }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: `linear-gradient(90deg,${c.cor},${c.cor}cc)` }} />
                    </div>
                  </div>
                )
              })}
            </div>
            {totalGeral > 0 && (
              <div className="mt-5 pt-4 flex items-center justify-between"
                style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                <span className="font-bold txt-3" style={{ fontSize: 11 }}>TOTAL GERAL</span>
                <span className="font-black txt-1" style={{ fontSize: 17 }}>{fmt(totalGeral)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
