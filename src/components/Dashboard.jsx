import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import {
  getAllIgrejasCatalog, countIgrejasVisitadas, igrejasPorSetor,
} from '../utils/igrejasCatalog'
import {
  Users, Heart, Package, ClipboardList, Building2, BarChart3,
  Route, Briefcase, CalendarDays, TrendingUp, AlertTriangle, ArrowLeftRight,
} from 'lucide-react'
import { SYNC_EVENT, SYNC_STORAGE_EVENT } from '../lib/cloudSync'
import { saveToCloud, writeStorage, readStorage, readEleitoresData } from '../utils/persist'
import { cadastroCompleto } from '../utils/equipeCadastro'
import { loadFinanceiro, getFinanceiroMembro, saldoDevedorEfetivo } from '../utils/equipeFinanceiro'
import { dataLocalHoje, resumoRotasCampo } from '../utils/rotaUtils'
import { forcaEquipePorAtuacao, forcaEquipePorMoradia, coberturaEleitoradoPorBairro, quantidadePorBairro } from '../utils/forcaPorBairro'
import { sanitizarDadosEleitores } from '../utils/eleitoresHelpers'
import {
  DashboardHeader, AlertStrip, CommandKpis, WeeklyPulse, VoteCommandPanel,
  AgendaPanel, DualActivityChart, BudgetPanel, StockPanel, RetiradasAgendaPanel,
  FieldPanel, TeamPanel, ApoiadoresPanel, EmpresasPanel, SurveysPanel, TerritoryPanel,
  TopBairrosChart, ModuleGrid,
} from './DashboardUI'
import { useCanViewFinance } from '../context/AccessContext'
import { useTabActive } from '../context/TabActiveContext'
import { calcularPrevisaoCompleta } from '../utils/previsaoCalculo'
import { itensComSaldo, STATUS_PENDENTE, STATUS_VALIDADO } from '../utils/materiaisRetirada'
import { agruparAgendaRetiradas } from '../utils/materiaisRetiradaReport'
import { MODULO_MAPA_VISITAS_ATIVO, MODULO_MONTAR_ROTAS_ATIVO } from '../constants/campanhaModulos'

const STORAGE_KEY_EVENTOS = 'agenda_eventos'
const STORAGE_KEY_METAS = 'metas_campanha'
const DATA_ELEICAO = '2026-10-03'
const BLUMENAU_COORDS = { lat: -26.9194, lon: -49.0661 }

function normalizeEvento(ev) {
  if (ev.dataInicio) return ev
  return { ...ev, dataInicio: ev.data || '', dataFim: ev.data || '', representantes: [] }
}

function inicioSemanaIso(ref = new Date()) {
  const d = new Date(ref)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return dataLocalHoje(d)
}

function diasAtrasIso(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return dataLocalHoje(d)
}

export default function Dashboard({ onNavigate, tenants = [], onSwitchTenant }) {
  const canViewFinance = useCanViewFinance()
  const tabActive = useTabActive()
  const tabActiveRef = useRef(tabActive)
  tabActiveRef.current = tabActive
  const hoje = useMemo(() => new Date(), [])
  const hojeStr = useMemo(() => dataLocalHoje(hoje), [hoje])
  const semanaIni = useMemo(() => inicioSemanaIso(hoje), [hoje])
  const seteDias = useMemo(() => diasAtrasIso(7), [])

  const [tick, setTick] = useState(0)
  const [weather, setWeather] = useState(null)
  const [weatherLoading, setWeatherLoading] = useState(true)
  const [editMetas, setEditMetas] = useState(false)
  const [metas, setMetas] = useState(() => readStorage(STORAGE_KEY_METAS, { metaVotos: 50000, metaZonas: 100 }))

  const refresh = useCallback(() => setTick(n => n + 1), [])
  const nav = useCallback((tab) => onNavigate?.(tab), [onNavigate])

  useEffect(() => { writeStorage(STORAGE_KEY_METAS, metas) }, [metas])

  useEffect(() => {
    let debounce = null
    const onSync = () => {
      if (!tabActiveRef.current) return
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => refresh(), 800)
    }
    if (tabActiveRef.current) refresh()
    const onFocus = () => { if (tabActiveRef.current) refresh() }
    window.addEventListener('focus', onFocus)
    window.addEventListener(SYNC_EVENT, onSync)
    window.addEventListener(SYNC_STORAGE_EVENT, onSync)
    return () => {
      if (debounce) clearTimeout(debounce)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener(SYNC_EVENT, onSync)
      window.removeEventListener(SYNC_STORAGE_EVENT, onSync)
    }
  }, [refresh])

  useEffect(() => {
    const controller = new AbortController()
    async function fetchWeather() {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${BLUMENAU_COORDS.lat}&longitude=${BLUMENAU_COORDS.lon}&current=temperature_2m,weather_code&timezone=America%2FSao_Paulo`
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) throw new Error('weather fetch failed')
        const data = await res.json()
        setWeather({ current: data.current })
      } catch (e) {
        if (e.name !== 'AbortError') { /* ignore */ }
      } finally {
        setWeatherLoading(false)
      }
    }
    fetchWeather()
    return () => controller.abort()
  }, [])

  const eventos = useMemo(
    () => readStorage(STORAGE_KEY_EVENTOS, []).map(normalizeEvento),
    [tick],
  )

  const snapshot = useMemo(() => {
    const visitas = readStorage('igrejas_visitas', {})
    const apoiadores = readStorage('apoiadores_lista', [])
    const interacoes = readStorage('apoiadores_interacoes', {})
    const materiaisItens = readStorage('materiais_estoque', [])
    const distribuicoes = readStorage('materiais_distribuicao', [])
    const retiradasMat = readStorage('materiais_retiradas', [])
    const materiaisStatus = itensComSaldo({
      itens: materiaisItens,
      distribuicoes,
      retiradas: retiradasMat,
    })
    const estoqueAlertas = materiaisStatus.filter(i => i.status !== 'ok')
    const retiradasPendentes = retiradasMat.filter(r => r.status === STATUS_PENDENTE)
    const retiradasValidadas = retiradasMat.filter(r => r.status === STATUS_VALIDADO)
    const nomePorId = Object.fromEntries(materiaisStatus.map(i => [String(i.id), i.nome]))
    const enrichRet = (lista) => lista.map(r => ({
      ...r,
      itens: (r.itens || []).map(it => ({
        ...it,
        itemNome: it.itemNome || nomePorId[String(it.itemId)] || 'Material',
      })),
    }))
    // Agenda: próximas (hoje+) pendentes/validadas + pendentes sem data; limita lista
    const agendaRetiradas = agruparAgendaRetiradas(
      enrichRet(retiradasMat.filter(r => r.status === STATUS_PENDENTE || r.status === STATUS_VALIDADO)),
    )
      .map(([dia, lista]) => ({
        dia,
        itens: lista.filter(r => {
          if (dia === 'sem-data') return r.status === STATUS_PENDENTE
          return dia >= hojeStr || r.status === STATUS_PENDENTE
        }),
      }))
      .filter(g => g.itens.length > 0)
      .slice(0, 8)
    const agendaFlatCount = agendaRetiradas.reduce((s, g) => s + g.itens.length, 0)
    // Se filtro futuro ficou vazio mas há retiradas, mostra as mais próximas (todas pend/val)
    const agendaExibir = agendaFlatCount > 0
      ? agendaRetiradas
      : agruparAgendaRetiradas(
        enrichRet([...retiradasPendentes, ...retiradasValidadas].slice(0, 20)),
      ).map(([dia, itens]) => ({ dia, itens })).slice(0, 6)

    const enquetes = readStorage('pesquisas_enquetes', [])
    const respostas = readStorage('pesquisas_respostas', {})
    const tarefas = readStorage('equipe_tarefas', [])
    const membros = readStorage('equipe_membros', [])
    const empresas = readStorage('empresas_lista', [])
    const resumoRotas = resumoRotasCampo({ dataRef: hojeStr })
    const finMap = loadFinanceiro()
    let resumo = null
    try {
      const c = calcularPrevisaoCompleta()
      resumo = {
        totalGeral: c.totalGeral,
        orcDisponivel: c.orcDisponivel,
        saldoFinal: c.saldoFinal,
        pctUtilizado: c.pctUtilizado,
        temOrcamento: c.temOrcamento,
        categorias: c.categorias,
      }
    } catch {
      try { resumo = readStorage('previsao_resumo', null) } catch { resumo = null }
    }

    const porNivel = { simpatizante: 0, apoiador: 0, cabo_eleitoral: 0, lider: 0 }
    apoiadores.forEach(a => { if (porNivel[a.nivel] !== undefined) porNivel[a.nivel]++ })

    const distSemana = distribuicoes.filter(d => (d.data || '') >= seteDias)
    const distSemanaQtd = distSemana.reduce((s, d) => s + (Number(d.quantidade) || 0), 0)
    const bairroMap = new Map()
    distSemana.forEach(d => {
      const b = (d.bairro || 'Sem bairro').trim() || 'Sem bairro'
      bairroMap.set(b, (bairroMap.get(b) || 0) + (Number(d.quantidade) || 0))
    })
    const topBairrosAll = [...bairroMap.entries()]
      .map(([nome, qtd]) => ({ nome, qtd }))
      .sort((a, b) => b.qtd - a.qtd)
    const topBairros = topBairrosAll.slice(0, 15)
    const forcaAtuacao = forcaEquipePorAtuacao(membros)
    const forcaMoradia = forcaEquipePorMoradia(membros)
    const dadosEl = sanitizarDadosEleitores(readEleitoresData({}))
    const coberturaEleitorado = coberturaEleitoradoPorBairro(dadosEl)
    const forcaQuantidade = quantidadePorBairro({
      membros,
      materiais: topBairrosAll,
      dadosEleitores: dadosEl,
      metaVotos: metas.metaVotos || 0,
      apoiadores,
    })

    let interacoesSemana = 0
    Object.values(interacoes || {}).forEach(arr => {
      if (!Array.isArray(arr)) return
      arr.forEach(it => {
        const dt = (it.data || it.createdAt || '').slice(0, 10)
        if (dt >= seteDias) interacoesSemana++
      })
    })

    let respostasSemana = 0
    Object.values(respostas || {}).forEach(arr => {
      if (!Array.isArray(arr)) return
      arr.forEach(r => {
        const dt = (r.data || r.createdAt || r.timestamp || '').toString().slice(0, 10)
        if (dt >= seteDias) respostasSemana++
      })
    })

    const cadastroOk = membros.filter(m => cadastroCompleto(m, membros)).length
    const saldoEquipe = membros.reduce((s, m) => {
      const fin = getFinanceiroMembro(finMap, m.id)
      return s + Math.max(0, saldoDevedorEfetivo(fin, m))
    }, 0)

    const empresasAtivas = empresas.filter(e => e.status !== 'inativa')
    const valorEmpresas = empresasAtivas.reduce((s, e) => {
      const n = parseFloat(String(e.valor ?? '').replace(',', '.'))
      return s + (Number.isFinite(n) ? n : 0)
    }, 0)

    const paradasPendentes = resumoRotas.paradasPendentes

    const categorias = Array.isArray(resumo?.categorias)
      ? resumo.categorias.map((c, i) => ({
          name: c.nome || c.name || `Cat ${i + 1}`,
          value: Number(c.valor || c.total || c.value || 0),
          color: ['#d4af5f', '#22d3ee', '#34d399', '#5b9bff', '#f59e0b'][i % 5],
        }))
      : []

    return {
      igrejasVisitadas: countIgrejasVisitadas(visitas),
      apoiadores: apoiadores.length,
      porNivel,
      materiaisItens: materiaisItens.length,
      materiaisStatus,
      estoqueDisponivelTotal: materiaisStatus.reduce((s, i) => s + (Number(i.disponivel) || 0), 0),
      estoqueCadastroTotal: materiaisStatus.reduce((s, i) => s + (Number(i.quantidade) || 0), 0),
      totalDist: distribuicoes.reduce((s, d) => s + (Number(d.quantidade) || 0), 0),
      estoqueAlertas,
      retiradasPendentes: retiradasPendentes.length,
      retiradasValidadas: retiradasValidadas.length,
      // Total = só ativas (pendente + validada). Canceladas/recusadas não entram.
      retiradasTotal: retiradasPendentes.length + retiradasValidadas.length,
      agendaRetiradas: agendaExibir,
      distSemanaQtd,
      topBairros,
      forcaAtuacao,
      forcaMoradia,
      coberturaEleitorado,
      forcaQuantidade,
      enquetesAtivas: enquetes.filter(e => e.status === 'ativa').length,
      totalRespostas: Object.values(respostas).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0),
      respostasSemana,
      interacoesSemana,
      membros: membros.length,
      cadastroOk,
      pendenciasCadastro: membros.length - cadastroOk,
      tarefasConcluidas: tarefas.filter(t => t.status === 'concluida').length,
      tarefasPendentes: tarefas.filter(t => t.status === 'pendente' || t.status === 'em_andamento').length,
      totalTarefas: tarefas.length,
      saldoEquipe,
      empresasTotal: empresas.length,
      empresasAtivas: empresasAtivas.length,
      valorEmpresas,
      rotasCount: resumoRotas.rotasCount,
      paradasPendentes,
      resumo,
      categorias,
      distribuicoes,
    }
  }, [tick, seteDias, metas.metaVotos, hojeStr])

  const igrejasCatalog = useMemo(() => getAllIgrejasCatalog(), [tick])
  const totalIgrejas = igrejasCatalog.length
  const setores = useMemo(() => igrejasPorSetor(igrejasCatalog), [igrejasCatalog])

  const diasParaEleicao = useMemo(() => {
    const diff = new Date(DATA_ELEICAO + 'T12:00:00') - hoje
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }, [tick])

  const projecao = useMemo(() => {
    const dados = sanitizarDadosEleitores(readEleitoresData({}))
    let totalVotos = 0
    let totalAptos = 0
    const zonas = []
    if (dados?.zonas) {
      dados.zonas.forEach(z => {
        let zv = 0
        let za = 0
        ;(z.locais || []).forEach(l => (l.secoes || []).forEach(s => {
          zv += (s.votos || 0)
          za += (s.aptos || s.eleitores || 0)
        }))
        totalVotos += zv
        totalAptos += za
        zonas.push({ nome: z.nome || z.zona || `Zona ${z.numero || ''}`, votos: zv })
      })
    }
    // Total oficial do TSE quando disponível
    if (Number(dados?.votosTotal) > 0) totalVotos = Number(dados.votosTotal)
    if (!totalAptos && Number(dados?.eleitoresAptos) > 0) totalAptos = Number(dados.eleitoresAptos)
    const topZonas = zonas.sort((a, b) => b.votos - a.votos).slice(0, 5)
    const metaVotos = metas.metaVotos || 0
    const pctMeta = metaVotos > 0 ? Math.min(100, (totalVotos / metaVotos) * 100) : 0
    const faltam = Math.max(0, metaVotos - totalVotos)
    const votosPorDia = diasParaEleicao > 0 ? Math.ceil(faltam / diasParaEleicao) : faltam
    const penetração = totalAptos > 0 ? Math.round((totalVotos / totalAptos) * 1000) / 10 : 0
    return {
      totalVotos, metaVotos, pctMeta, faltam, votosPorDia, totalAptos, penetração, topZonas,
      resumo: snapshot.resumo,
    }
  }, [metas, diasParaEleicao, tick, snapshot.resumo])

  const eventosHoje = eventos.filter(e => e.dataInicio <= hojeStr && (e.dataFim || e.dataInicio) >= hojeStr)
  const eventosSemana = eventos.filter(e => {
    const ini = e.dataInicio || ''
    const fim = e.dataFim || ini
    return fim >= semanaIni && ini <= hojeStr
  })
  const proximosEvts = eventos
    .filter(e => e.dataInicio > hojeStr)
    .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio))
    .slice(0, 5)

  const eventsByMonth = useMemo(() => {
    const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    const result = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      result.push({ key, name: MESES[d.getMonth()], total: 0 })
    }
    eventos.forEach(ev => {
      const entry = result.find(r => r.key === (ev.dataInicio || '').slice(0, 7))
      if (entry) entry.total++
    })
    return result
  }, [eventos, tick])

  const distByMonth = useMemo(() => {
    return eventsByMonth.map(m => {
      const total = snapshot.distribuicoes
        .filter(d => (d.data || '').startsWith(m.key))
        .reduce((s, d) => s + (Number(d.quantidade) || 0), 0)
      return { ...m, total }
    })
  }, [eventsByMonth, snapshot.distribuicoes])

  const pctIgrejas = totalIgrejas > 0 ? Math.round(snapshot.igrejasVisitadas / totalIgrejas * 100) : 0
  const pctTarefas = snapshot.totalTarefas > 0
    ? Math.round(snapshot.tarefasConcluidas / snapshot.totalTarefas * 100)
    : 0

  const greeting = (() => {
    const hr = hoje.getHours()
    if (hr < 12) return 'Bom dia'
    if (hr < 18) return 'Boa tarde'
    return 'Boa noite'
  })()

  const dataEleicaoLabel = new Date(DATA_ELEICAO + 'T12:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short',
  })

  const alertas = (() => {
    const a = []
    if (snapshot.estoqueAlertas.length > 0) {
      a.push({
        m: `${snapshot.estoqueAlertas.length} material(is) com estoque crítico`,
        c: '#f87171', tab: 'materiais',
      })
    }
    if (snapshot.retiradasPendentes > 0) {
      a.push({
        m: `${snapshot.retiradasPendentes} retirada(s) de material aguardando validação`,
        c: '#fbbf24', tab: 'materiais',
      })
    }
    if (snapshot.tarefasPendentes > 0) {
      a.push({ m: `${snapshot.tarefasPendentes} tarefas da equipe em aberto`, c: '#fbbf24', tab: 'equipe' })
    }
    if (snapshot.pendenciasCadastro > 0) {
      a.push({
        m: `${snapshot.pendenciasCadastro} cadastros incompletos na equipe`,
        c: '#fbbf24', tab: 'equipe',
      })
    }
    if (MODULO_MAPA_VISITAS_ATIVO && pctIgrejas < 50) {
      a.push({ m: 'Cobertura de igrejas abaixo de 50%', c: '#f87171', tab: 'mapa' })
    }
    if (MODULO_MONTAR_ROTAS_ATIVO && snapshot.paradasPendentes > 0) {
      a.push({ m: `${snapshot.paradasPendentes} paradas de rota pendentes`, c: '#38bdf8', tab: 'rotas' })
    }
    if (projecao.metaVotos > 0 && projecao.pctMeta < 30 && diasParaEleicao < 180) {
      a.push({ m: 'Ritmo de votos abaixo do esperado para a meta', c: '#f87171', tab: 'eleitores' })
    }
    if (a.length === 0) a.push({ m: 'Operação em dia — avance nas frentes de campo', c: '#34d399' })
    return a.slice(0, 5)
  })()

  const commandKpis = [
    {
      label: 'Votos', value: projecao.totalVotos,
      sub: projecao.metaVotos ? `${Math.round(projecao.pctMeta)}% da meta` : 'importe em Eleitores',
      color: '#22d3ee', pct: projecao.pctMeta, onClick: () => nav('eleitores'),
    },
    {
      label: 'Dias p/ eleição', value: diasParaEleicao,
      sub: `meta ${dataEleicaoLabel}`, color: 'var(--gold-bright)',
    },
    {
      label: 'Equipe', value: snapshot.membros,
      sub: `${snapshot.cadastroOk} cadastros ok`, color: '#c4b5fd',
      pct: snapshot.membros ? (snapshot.cadastroOk / snapshot.membros) * 100 : 0,
      onClick: () => nav('equipe'),
    },
    ...(MODULO_MAPA_VISITAS_ATIVO ? [{
      label: 'Igrejas', value: pctIgrejas, suffix: '%',
      sub: `${snapshot.igrejasVisitadas}/${totalIgrejas} visitadas`,
      color: '#34d399', pct: pctIgrejas, onClick: () => nav('mapa'),
    }] : []),
    {
      label: 'Apoiadores', value: snapshot.apoiadores,
      sub: `${snapshot.porNivel.lider} líderes`, color: '#f472b6',
      onClick: () => nav('apoiadores'),
    },
    {
      label: 'Materiais disp.', value: snapshot.estoqueDisponivelTotal,
      sub: `${snapshot.retiradasPendentes} retiradas pend.`, color: '#fbbf24',
      onClick: () => nav('materiais'),
    },
    ...(canViewFinance ? [{
      label: 'Orçamento', value: Math.round(snapshot.resumo?.pctUtilizado || 0), suffix: '%',
      sub: snapshot.resumo?.temOrcamento ? 'utilizado' : 'sem previsão',
      color: '#fbbf24', pct: snapshot.resumo?.pctUtilizado || 0,
      onClick: () => nav('previsao'),
    }] : []),
  ]

  const weeklyItems = [
    { label: 'Eventos', value: eventosSemana.length, color: '#5b9bff', tab: 'agenda' },
    { label: 'Materiais dist.', value: snapshot.distSemanaQtd, color: '#d4af5f', tab: 'materiais' },
    { label: 'Retiradas pend.', value: snapshot.retiradasPendentes, color: '#fbbf24', tab: 'materiais' },
    { label: 'Contatos rede', value: snapshot.interacoesSemana, color: '#f472b6', tab: 'apoiadores' },
    { label: 'Respostas', value: snapshot.respostasSemana, color: '#38bdf8', tab: 'pesquisas' },
    { label: 'Tarefas ok (total)', value: snapshot.tarefasConcluidas, color: '#34d399', tab: 'equipe' },
  ]

  const modules = [
    { id: 'eleitores', icon: BarChart3, label: 'Eleitores', value: projecao.totalVotos, color: '#22d3ee', onClick: () => nav('eleitores') },
    { id: 'equipe', icon: Users, label: 'Equipe', value: snapshot.membros, color: '#c4b5fd', onClick: () => nav('equipe'), sub: `${pctTarefas}% tarefas` },
    { id: 'agenda', icon: CalendarDays, label: 'Agenda', value: eventosHoje.length, color: '#5b9bff', onClick: () => nav('agenda') },
    ...(MODULO_MAPA_VISITAS_ATIVO ? [{ id: 'mapa', icon: Building2, label: 'Igrejas', value: snapshot.igrejasVisitadas, color: '#14b8a6', onClick: () => nav('mapa') }] : []),
    ...(MODULO_MONTAR_ROTAS_ATIVO ? [{ id: 'rotas', icon: Route, label: 'Rotas', value: snapshot.rotasCount, color: '#34d399', onClick: () => nav('rotas') }] : []),
    { id: 'apoiadores', icon: Heart, label: 'Apoiadores', value: snapshot.apoiadores, color: '#ec4899', onClick: () => nav('apoiadores') },
    { id: 'materiais', icon: Package, label: 'Materiais', value: snapshot.estoqueDisponivelTotal, color: '#fbbf24', onClick: () => nav('materiais'), sub: `${snapshot.retiradasPendentes} pend.` },
    { id: 'empresas', icon: Briefcase, label: 'Empresas', value: snapshot.empresasAtivas, color: 'var(--gold)', onClick: () => nav('empresas') },
    { id: 'pesquisas', icon: ClipboardList, label: 'Pesquisas', value: snapshot.totalRespostas, color: '#38bdf8', onClick: () => nav('pesquisas') },
    ...(canViewFinance ? [
      { id: 'previsao', icon: TrendingUp, label: 'Previsão', value: Math.round(snapshot.resumo?.pctUtilizado || 0), color: '#f0d48a', onClick: () => nav('previsao') },
    ] : []),
  ]

  // Detecta tenant vazio: todos os contadores zerados
  const tenantVazio = snapshot.membros === 0
    && snapshot.apoiadores === 0
    && snapshot.estoqueDisponivelTotal === 0
    && igrejasCatalog.length === 0
    && projecao.totalVotos === 0

  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-[1420px] mx-auto px-4 md:px-7 py-6 md:py-7">

        {/* Banner de campanha errada */}
        {tenantVazio && tenants.length > 1 && (
          <div
            className="mb-5 flex items-start gap-3 px-4 py-4 rounded-2xl"
            style={{ background: 'rgba(220,38,38,0.12)', border: '2px solid rgba(220,38,38,0.5)' }}
          >
            <AlertTriangle size={22} className="flex-shrink-0 mt-0.5" style={{ color: '#f87171' }} />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm" style={{ color: '#fca5a5' }}>
                Você está na campanha errada — seus dados estão em outra campanha
              </p>
              <p className="text-xs mt-1" style={{ color: '#fca5a5', opacity: 0.8 }}>
                601 igrejas, contratos e materiais estão na <strong>Campanha principal</strong>. Clique no botão abaixo para acessá-los.
              </p>
            </div>
            {onSwitchTenant && (
              <button
                type="button"
                onClick={onSwitchTenant}
                className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#dc2626,#b91c1c)' }}
              >
                <ArrowLeftRight size={15} />
                Ir para minha campanha
              </button>
            )}
          </div>
        )}

        <DashboardHeader
          greeting={greeting}
          dateLabel={hoje.toLocaleDateString('pt-BR', {
            weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
          })}
          diasEleicao={diasParaEleicao}
          dataEleicao={dataEleicaoLabel}
          weather={weather}
          weatherLoading={weatherLoading}
          pulse={{
            eventosHoje: eventosHoje.length,
            eventosSemana: eventosSemana.length,
            distSemana: snapshot.distSemanaQtd,
            interacoesSemana: snapshot.interacoesSemana,
          }}
        />

        <AlertStrip alertas={alertas} onNavigate={nav} />
        <CommandKpis items={commandKpis} />
        <WeeklyPulse items={weeklyItems} onNavigate={nav} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
          <div className="lg:col-span-8">
            <VoteCommandPanel
              projecao={projecao}
              diasEleicao={diasParaEleicao}
              metas={metas}
              editMetas={editMetas}
              onToggleEdit={() => setEditMetas(v => !v)}
              onMetaChange={(k, v) => setMetas(p => ({ ...p, [k]: v }))}
              onSaveMetas={() => saveToCloud({ metas_campanha: metas })}
              topZonas={projecao.topZonas}
            />
          </div>
          <div className="lg:col-span-4">
            <AgendaPanel eventosHoje={eventosHoje} proximosEvts={proximosEvts} onNavigate={nav} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
          <div className={canViewFinance ? 'lg:col-span-7' : 'lg:col-span-12'}>
            <DualActivityChart
              eventsByMonth={eventsByMonth}
              distByMonth={distByMonth}
              totalEventos={eventos.length}
              totalDist={snapshot.totalDist}
            />
          </div>
          {canViewFinance && (
            <div className="lg:col-span-5">
              <BudgetPanel resumo={snapshot.resumo} categorias={snapshot.categorias} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
          <div className="lg:col-span-5">
            <StockPanel
              itens={snapshot.materiaisStatus}
              alertas={snapshot.estoqueAlertas}
              totalItens={snapshot.materiaisItens}
              onNavigate={nav}
            />
          </div>
          <div className="lg:col-span-7">
            <RetiradasAgendaPanel
              pendentes={snapshot.retiradasPendentes}
              validadas={snapshot.retiradasValidadas}
              total={snapshot.retiradasTotal}
              agenda={snapshot.agendaRetiradas}
              onNavigate={nav}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-4">
          <FieldPanel
            rotas={snapshot.rotasCount}
            paradasPendentes={snapshot.paradasPendentes}
            igrejasPct={pctIgrejas}
            igrejasVisitadas={snapshot.igrejasVisitadas}
            totalIgrejas={totalIgrejas}
            onNavigate={nav}
          />
          <TeamPanel
            membros={snapshot.membros}
            cadastroOk={snapshot.cadastroOk}
            pendenciasCadastro={snapshot.pendenciasCadastro}
            tarefasPendentes={snapshot.tarefasPendentes}
            tarefasConcluidas={snapshot.tarefasConcluidas}
            saldoEquipe={snapshot.saldoEquipe}
            hideFinance={!canViewFinance}
            onNavigate={nav}
          />
          <SurveysPanel
            ativas={snapshot.enquetesAtivas}
            respostas={snapshot.totalRespostas}
            onNavigate={nav}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
          <div className="lg:col-span-6">
            <ApoiadoresPanel
              stats={snapshot}
              interacoesSemana={snapshot.interacoesSemana}
              onNavigate={nav}
            />
          </div>
          <div className="lg:col-span-6">
            <EmpresasPanel
              total={snapshot.empresasTotal}
              ativas={snapshot.empresasAtivas}
              valorContratos={snapshot.valorEmpresas}
              hideFinance={!canViewFinance}
              onNavigate={nav}
            />
          </div>
        </div>

        <div className="mb-4">
            <TopBairrosChart
              materiais={snapshot.topBairros}
              atuacao={snapshot.forcaAtuacao}
              moradia={snapshot.forcaMoradia}
              eleitorado={snapshot.coberturaEleitorado}
              quantidade={snapshot.forcaQuantidade}
              metaVotos={metas.metaVotos || 0}
            />
        </div>

        <div className="mb-5">
          <TerritoryPanel
            setores={setores}
            totalIgrejas={totalIgrejas}
            pctVisitadas={pctIgrejas}
            visitadas={snapshot.igrejasVisitadas}
            onNavigate={nav}
          />
        </div>

        <ModuleGrid modules={modules} />
      </div>
    </div>
  )
}
