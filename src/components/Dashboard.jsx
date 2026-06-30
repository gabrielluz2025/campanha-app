import { useMemo, useState, useEffect } from 'react'
import { IGREJAS_BASE } from './MapaIgrejas'
import {
  CalendarDays, MapPin, Building2, Target, Zap, Activity,
  Cloud, CloudSun, Sun, Droplets, Wind, TrendingUp,
  Users, Heart, Package, ClipboardList, CheckCircle, AlertTriangle,
  ArrowUpRight, Flame, Sparkles, ChevronRight, Gauge, Wallet,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
} from 'recharts'
import { AnimatedNumber, Card, IconBadge, ProgressRing, Pill } from './ui'

const STORAGE_KEY_EVENTOS = 'agenda_eventos'
const STORAGE_KEY_METAS = 'metas_campanha'
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const PALETA = ['#2563eb','#06b6d4','#ec4899','#f97316','#10b981','#06b6d4','#f59e0b','#ef4444','#3b82f6','#84cc16']
const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

// Eleição: 03/10/2026
const DATA_ELEICAO = '2026-10-03'
const BLUMENAU_COORDS = { lat: -26.9194, lon: -49.0661 }

function normalizeEvento(ev) {
  if (ev.dataInicio) return ev
  return { ...ev, dataInicio: ev.data || '', dataFim: ev.data || '', representantes: [] }
}

function fmtDia(iso) {
  const d = new Date(iso + 'T12:00')
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-2xl px-4 py-3" style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
      <p className="font-bold text-white" style={{ fontSize: 12 }}>{label}</p>
      <p className="font-semibold" style={{ fontSize: 12, color: '#5b9bff', marginTop: 2 }}>
        {payload[0].value} evento{payload[0].value !== 1 ? 's' : ''}
      </p>
    </div>
  )
}

export default function Dashboard() {
  const hoje = new Date()
  const hojeStr = hoje.toISOString().slice(0, 10)
  const mesAtual = hojeStr.slice(0, 7)

  // Weather state (Open-Meteo, free, no API key)
  const [weather, setWeather] = useState(null)
  const [weatherLoading, setWeatherLoading] = useState(true)

  // Vote goals state
  const [metas, setMetas] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_METAS)
    return saved ? JSON.parse(saved) : { metaVotos: 50000, metaZonas: 100 }
  })

  // Fetch weather on mount
  useEffect(() => {
    async function fetchWeather() {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${BLUMENAU_COORDS.lat}&longitude=${BLUMENAU_COORDS.lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=America%2FSao_Paulo`
        const res = await fetch(url)
        const data = await res.json()
        setWeather({
          current: data.current,
          daily: data.daily,
        })
      } catch (e) {
        console.warn('Weather fetch failed', e)
      } finally {
        setWeatherLoading(false)
      }
    }
    fetchWeather()
  }, [])

  // Save metas to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_METAS, JSON.stringify(metas))
  }, [metas])

  const eventos = useMemo(() =>
    JSON.parse(localStorage.getItem(STORAGE_KEY_EVENTOS) || '[]').map(normalizeEvento), [])

  const setores = useMemo(() => {
    const map = {}
    IGREJAS_BASE.forEach(ig => { map[ig.setor] = (map[ig.setor] || 0) + 1 })
    return Object.entries(map).map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd)
  }, [])

  const eventosHoje  = eventos.filter(e => e.dataInicio <= hojeStr && (e.dataFim || e.dataInicio) >= hojeStr)
  const eventosMes   = eventos.filter(e => (e.dataInicio || '').startsWith(mesAtual))
  const proximosEvts = eventos
    .filter(e => e.dataInicio > hojeStr)
    .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio))
    .slice(0, 5)

  const eventsByMonth = useMemo(() => {
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
  }, [eventos])

  const maxQtd = setores[0]?.qtd || 1
  const [setoresAberto, setSetoresAberto] = useState(false)

  // Countdown to election
  const diasParaEleicao = useMemo(() => {
    const diff = new Date(DATA_ELEICAO) - hoje
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }, [])

  // Weather code to icon mapper (WMO)
  const getWeatherIcon = (code) => {
    if (code === 0) return Sun
    if (code <= 3) return CloudSun
    if (code <= 48) return Cloud
    if (code <= 67) return Cloud
    if (code <= 77) return Cloud
    return Cloud
  }

  const getWeatherLabel = (code) => {
    if (code === 0) return 'Céu limpo'
    if (code <= 3) return 'Parcialmente nublado'
    if (code <= 48) return 'Nublado'
    if (code <= 67) return 'Chuva'
    if (code <= 77) return 'Neve'
    return 'Tempestade'
  }

  // Cross-module stats
  const crossStats = useMemo(() => {
    const visitas = JSON.parse(localStorage.getItem('igrejas_visitas') || '{}')
    const igrejasVisitadas = Object.values(visitas).filter(Boolean).length
    const apoiadores = JSON.parse(localStorage.getItem('apoiadores_lista') || '[]')
    const materiaisItens = JSON.parse(localStorage.getItem('materiais_estoque') || '[]')
    const distribuicoes = JSON.parse(localStorage.getItem('materiais_distribuicao') || '[]')
    const totalDist = distribuicoes.reduce((s, d) => s + d.quantidade, 0)
    const enquetes = JSON.parse(localStorage.getItem('pesquisas_enquetes') || '[]')
    const respostas = JSON.parse(localStorage.getItem('pesquisas_respostas') || '{}')
    const totalRespostas = Object.values(respostas).reduce((s, arr) => s + arr.length, 0)
    const tarefas = JSON.parse(localStorage.getItem('equipe_tarefas') || '[]')
    const membros = JSON.parse(localStorage.getItem('equipe_membros') || '[]')
    const tarefasConcluidas = tarefas.filter(t => t.status === 'concluida').length
    const tarefasPendentes = tarefas.filter(t => t.status === 'pendente').length

    const porNivel = { simpatizante: 0, apoiador: 0, cabo_eleitoral: 0, lider: 0 }
    apoiadores.forEach(a => { if (porNivel[a.nivel] !== undefined) porNivel[a.nivel]++ })

    return {
      igrejasVisitadas,
      apoiadores: apoiadores.length,
      materiaisItens: materiaisItens.length,
      totalDist,
      enquetesAtivas: enquetes.filter(e => e.status === 'ativa').length,
      totalRespostas,
      membros: membros.length,
      tarefasConcluidas,
      tarefasPendentes,
      totalTarefas: tarefas.length,
      porNivel,
    }
  }, [])

  const pctIgrejas = Math.round(crossStats.igrejasVisitadas / IGREJAS_BASE.length * 100)
  const pctTarefas = crossStats.totalTarefas > 0 ? Math.round(crossStats.tarefasConcluidas / crossStats.totalTarefas * 100) : 0
  const pctApoiadores = crossStats.apoiadores > 0 ? Math.min(100, Math.round(crossStats.apoiadores / 50 * 100)) : 0

  // Projeção inteligente: ritmo para a meta de votos + saúde do orçamento
  const projecao = useMemo(() => {
    const dados = JSON.parse(localStorage.getItem('eleitores_data') || '{}')
    let totalVotos = 0
    if (dados.zonas) {
      dados.zonas.forEach(z => (z.locais || []).forEach(l => (l.secoes || []).forEach(s => { totalVotos += (s.votos || 0) })))
    }
    const metaVotos = metas.metaVotos || 0
    const pctMeta = metaVotos > 0 ? Math.min(100, (totalVotos / metaVotos) * 100) : 0
    const faltam = Math.max(0, metaVotos - totalVotos)
    const votosPorDia = diasParaEleicao > 0 ? Math.ceil(faltam / diasParaEleicao) : faltam
    let resumo = null
    try { resumo = JSON.parse(localStorage.getItem('previsao_resumo') || 'null') } catch { resumo = null }
    return { totalVotos, metaVotos, pctMeta, faltam, votosPorDia, resumo }
  }, [metas, diasParaEleicao])

  const orcCor = projecao.resumo
    ? (projecao.resumo.saldoFinal < 0 ? '#ef4444' : projecao.resumo.pctUtilizado >= 90 ? '#f59e0b' : '#10b981')
    : '#10b981'

  const greeting = (() => {
    const h = hoje.getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  })()

  const kpis = [
    { label: 'Igrejas Mapeadas', value: IGREJAS_BASE.length, sub: `${setores.length} setores ativos`, icon: Building2, from: '#3b82f6', to: '#2563eb' },
    { label: 'Apoiadores', value: crossStats.apoiadores, sub: `${crossStats.porNivel.lider} líderes`, icon: Heart, from: '#ec4899', to: '#f43f5e' },
    { label: 'Eventos no Mês', value: eventosMes.length, sub: MESES[hoje.getMonth()], icon: CalendarDays, from: '#06b6d4', to: '#22d3ee' },
    { label: 'Respostas', value: crossStats.totalRespostas, sub: `${crossStats.enquetesAtivas} enquetes ativas`, icon: ClipboardList, from: '#06b6d4', to: '#0891b2' },
  ]

  const alertas = (() => {
    const a = []
    if (crossStats.tarefasPendentes > 0) a.push({ m: `${crossStats.tarefasPendentes} tarefas pendentes`, c: 'var(--warning)' })
    if (pctIgrejas < 50) a.push({ m: 'Cobertura de igrejas abaixo de 50%', c: 'var(--danger)' })
    if (crossStats.enquetesAtivas > 0) a.push({ m: `${crossStats.enquetesAtivas} enquete(s) aguardando respostas`, c: 'var(--info)' })
    if (diasParaEleicao < 120) a.push({ m: `Faltam menos de 120 dias para a eleição`, c: 'var(--danger)' })
    if (a.length === 0) a.push({ m: 'Tudo em dia! Continue o bom trabalho.', c: 'var(--success)' })
    return a.slice(0, 4)
  })()

  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-base)', position: 'relative' }}>
      {/* Ambient background glow */}
      <div aria-hidden style={{ position: 'fixed', top: -120, left: '30%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(37,99,235,0.07), transparent 65%)', filter: 'blur(40px)', pointerEvents: 'none', zIndex: 0 }} />

      <div className="max-w-7xl mx-auto px-4 md:px-7 py-7" style={{ position: 'relative', zIndex: 1 }}>

        {/* ═══ TOP BAR ═══ */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-7 anim-fade-up">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={13} style={{ color: 'var(--accent-bright)' }} />
              <span className="eyebrow">Painel de Controle</span>
            </div>
            <h1 className="text-display font-bold text-white" style={{ fontSize: 32, lineHeight: 1 }}>
              {greeting}, Coordenação
            </h1>
            <p className="font-medium capitalize" style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 6 }}>
              {hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            {eventosHoje.length > 0 && (
              <Pill color="var(--success)" dot glow>{eventosHoje.length} ao vivo</Pill>
            )}
            <div className="glass flex items-center gap-2 px-3.5 py-2" style={{ borderRadius: 999 }}>
              {weatherLoading ? (
                <div className="skeleton" style={{ width: 70, height: 14, borderRadius: 8 }} />
              ) : weather ? (
                <>
                  {(() => { const WI = getWeatherIcon(weather.current.weather_code); return <WI size={15} style={{ color: 'var(--accent-bright)' }} /> })()}
                  <span className="font-bold tnum" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {Math.round(weather.current.temperature_2m)}° Blumenau
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Clima indisponível</span>
              )}
            </div>
          </div>
        </div>

        {/* ═══ HERO — Countdown + rings ═══ */}
        <Card spotlight className="p-6 md:p-8 mb-6 anim-fade-up stagger-1" style={{ borderRadius: 'var(--r-xl)' }}>
          <div className="absolute top-0 right-0" style={{ width: 380, height: 380, background: 'radial-gradient(circle, rgba(239,68,68,0.10), transparent 65%)', filter: 'blur(30px)', pointerEvents: 'none' }} />
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
            <div className="flex items-center gap-5">
              <div className="anim-float">
                <IconBadge icon={Flame} from="#ef4444" to="#f97316" size={64} iconSize={28} />
              </div>
              <div>
                <span className="eyebrow">Contagem Regressiva</span>
                <div className="flex items-baseline gap-2.5 mt-1.5">
                  <span className="text-display font-bold text-white tnum" style={{ fontSize: 58, lineHeight: 0.9 }}>
                    <AnimatedNumber value={diasParaEleicao} duration={1400} />
                  </span>
                  <span className="font-bold" style={{ fontSize: 17, color: 'var(--text-tertiary)' }}>dias</span>
                </div>
                <p className="font-medium" style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>
                  até a eleição · {new Date(DATA_ELEICAO + 'T12:00').toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
            <div className="flex gap-6 lg:gap-8">
              <div className="flex flex-col items-center gap-2">
                <ProgressRing pct={pctIgrejas} size={84} stroke={6} from="#10b981" to="#34d399" />
                <span className="eyebrow">Igrejas</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <ProgressRing pct={pctTarefas} size={84} stroke={6} from="#2563eb" to="#a78bfa" />
                <span className="eyebrow">Tarefas</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <ProgressRing pct={pctApoiadores} size={84} stroke={6} from="#ec4899" to="#f472b6" />
                <span className="eyebrow">Apoiadores</span>
              </div>
            </div>
          </div>
        </Card>

        {/* ═══ KPI ROW ═══ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
          {kpis.map((kpi, i) => (
            <Card key={kpi.label} hover spotlight className={`p-5 cursor-default anim-fade-up stagger-${i + 2}`}>
              <div className="flex items-center justify-between mb-4">
                <IconBadge icon={kpi.icon} from={kpi.from} to={kpi.to} size={40} soft />
                <ArrowUpRight size={15} style={{ color: 'var(--text-faint)' }} />
              </div>
              <p className="text-display font-bold text-white tnum" style={{ fontSize: 32, lineHeight: 1 }}>
                <AnimatedNumber value={kpi.value} />
              </p>
              <p className="font-bold mt-2" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{kpi.label}</p>
              <p className="font-medium" style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{kpi.sub}</p>
            </Card>
          ))}
        </div>

        {/* ═══ META + STATUS + ALERTAS ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 mb-6">
          {/* Meta de Votos */}
          <Card className="p-5 anim-fade-up stagger-2">
            <div className="flex items-center gap-3 mb-4">
              <IconBadge icon={Target} from="#06b6d4" to="#22d3ee" size={36} soft />
              <span className="font-bold text-white" style={{ fontSize: 14 }}>Meta de Votos</span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="eyebrow block mb-1.5">Votos</label>
                <input type="number" value={metas.metaVotos}
                  onChange={e => setMetas(p => ({ ...p, metaVotos: parseInt(e.target.value) || 0 }))}
                  className="input-dark w-full px-3.5 py-2.5 font-bold tnum" style={{ fontSize: 15 }} />
              </div>
              <div>
                <label className="eyebrow block mb-1.5">Zonas Vencidas</label>
                <input type="number" value={metas.metaZonas}
                  onChange={e => setMetas(p => ({ ...p, metaZonas: parseInt(e.target.value) || 0 }))}
                  className="input-dark w-full px-3.5 py-2.5 font-bold tnum" style={{ fontSize: 15 }} />
              </div>
            </div>
          </Card>

          {/* Status Geral */}
          <Card className="p-5 anim-fade-up stagger-3">
            <div className="flex items-center gap-3 mb-4">
              <IconBadge icon={Activity} from="#10b981" to="#059669" size={36} soft />
              <span className="font-bold text-white" style={{ fontSize: 14 }}>Status Geral</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { l: 'Equipe', v: crossStats.membros, c: '#a78bfa' },
                { l: 'Material', v: crossStats.totalDist, c: '#fbbf24' },
                { l: 'Concluídas', v: crossStats.tarefasConcluidas, c: '#34d399' },
                { l: 'Pendentes', v: crossStats.tarefasPendentes, c: '#f87171' },
              ].map(s => (
                <div key={s.l} className="rounded-xl p-3" style={{ background: 'var(--bg-raised)' }}>
                  <p className="text-display font-bold text-white tnum" style={{ fontSize: 20 }}>
                    <AnimatedNumber value={s.v} />
                  </p>
                  <p className="font-bold" style={{ fontSize: 10, color: s.c }}>{s.l}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Alertas */}
          <Card className="p-5 anim-fade-up stagger-4">
            <div className="flex items-center gap-3 mb-4">
              <IconBadge icon={AlertTriangle} from="#f59e0b" to="#d97706" size={36} soft />
              <span className="font-bold text-white" style={{ fontSize: 14 }}>Pontos de Atenção</span>
            </div>
            <div className="space-y-2">
              {alertas.map((x, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
                  style={{ background: 'var(--bg-raised)' }}>
                  <span className="glow-pulse" style={{ width: 6, height: 6, borderRadius: 999, background: x.c, color: x.c, flexShrink: 0 }} />
                  <span className="font-medium" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{x.m}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ═══ PROJEÇÃO INTELIGENTE ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-6">
          {/* Ritmo para a meta de votos */}
          <Card className="p-5 anim-fade-up">
            <div className="flex items-center gap-3 mb-4">
              <IconBadge icon={Gauge} from="#06b6d4" to="#22d3ee" size={36} soft />
              <span className="font-bold text-white" style={{ fontSize: 14 }}>Ritmo para a Meta de Votos</span>
              {projecao.metaVotos > 0 && (
                <span className="ml-auto"><Pill color="var(--accent-bright)">{Math.round(projecao.pctMeta)}%</Pill></span>
              )}
            </div>
            {projecao.metaVotos > 0 ? (
              <>
                <div className="flex items-end justify-between mb-2.5">
                  <div>
                    <p className="text-display font-bold text-white tnum" style={{ fontSize: 28, lineHeight: 1 }}>
                      {projecao.totalVotos.toLocaleString('pt-BR')}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                      de {projecao.metaVotos.toLocaleString('pt-BR')} votos
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold tnum" style={{ fontSize: 20, color: projecao.faltam > 0 ? '#fbbf24' : '#34d399' }}>
                      {projecao.faltam > 0 ? projecao.votosPorDia.toLocaleString('pt-BR') : '✓'}
                    </p>
                    <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                      {projecao.faltam > 0 ? `votos/dia · ${diasParaEleicao}d restantes` : 'meta atingida'}
                    </p>
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-raised)' }}>
                  <div className="h-full rounded-full" style={{ width: projecao.pctMeta + '%', background: 'linear-gradient(90deg,#06b6d4,#22d3ee)', transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
                </div>
                <p className="mt-2.5 font-medium" style={{ fontSize: 11.5, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                  {projecao.faltam > 0
                    ? `Faltam ${projecao.faltam.toLocaleString('pt-BR')} votos. No ritmo necessário de ${projecao.votosPorDia.toLocaleString('pt-BR')}/dia para alcançar a meta até a eleição.`
                    : 'Meta de votos alcançada — mantenha o engajamento até o dia da eleição.'}
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-7 text-center">
                <Target size={30} style={{ color: 'var(--text-faint)', marginBottom: 10 }} />
                <p className="font-semibold" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Defina a meta de votos</p>
                <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>no cartão "Meta de Votos" abaixo</p>
              </div>
            )}
          </Card>

          {/* Saúde do orçamento */}
          <Card className="p-5 anim-fade-up">
            <div className="flex items-center gap-3 mb-4">
              <IconBadge icon={Wallet} from="#f59e0b" to="#f97316" size={36} soft />
              <span className="font-bold text-white" style={{ fontSize: 14 }}>Saúde do Orçamento</span>
              {projecao.resumo?.temOrcamento && (
                <span className="ml-auto"><Pill color={orcCor}>{Math.round(projecao.resumo.pctUtilizado)}%</Pill></span>
              )}
            </div>
            {projecao.resumo?.temOrcamento ? (
              <>
                <div className="flex items-end justify-between mb-2.5">
                  <div>
                    <p className="text-display font-bold text-white tnum" style={{ fontSize: 24, lineHeight: 1 }}>
                      {fmtBRL(projecao.resumo.totalGeral)}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                      previsto de {fmtBRL(projecao.resumo.orcDisponivel)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold tnum" style={{ fontSize: 18, color: orcCor }}>
                      {fmtBRL(Math.abs(projecao.resumo.saldoFinal))}
                    </p>
                    <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                      {projecao.resumo.saldoFinal < 0 ? 'acima do orçamento' : 'saldo livre'}
                    </p>
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-raised)' }}>
                  <div className="h-full rounded-full" style={{ width: Math.min(100, projecao.resumo.pctUtilizado) + '%', background: orcCor, transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
                </div>
                <p className="mt-2.5 font-medium" style={{ fontSize: 11.5, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                  {projecao.resumo.saldoFinal < 0
                    ? `Orçamento excedido em ${fmtBRL(Math.abs(projecao.resumo.saldoFinal))}. Reveja os valores na Previsão de Gasto.`
                    : projecao.resumo.pctUtilizado >= 90
                      ? 'Orçamento quase esgotado (90%+). Atenção aos próximos gastos.'
                      : `${Math.round(projecao.resumo.pctUtilizado)}% do orçamento comprometido. Situação saudável.`}
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-7 text-center">
                <Wallet size={30} style={{ color: 'var(--text-faint)', marginBottom: 10 }} />
                <p className="font-semibold" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Orçamento não configurado</p>
                <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>defina o disponível na aba Previsão de Gasto</p>
              </div>
            )}
          </Card>
        </div>

        {/* ═══ CHART + EVENTS ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3.5 mb-6">
          {/* Chart */}
          <Card className="lg:col-span-3 p-5 anim-fade-up stagger-3">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <IconBadge icon={TrendingUp} from="#2563eb" to="#5b9bff" size={36} soft />
                <div>
                  <p className="font-bold text-white" style={{ fontSize: 14 }}>Atividade de Eventos</p>
                  <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>Últimos 6 meses</p>
                </div>
              </div>
              <Pill color="var(--accent-bright)">{eventos.length} total</Pill>
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={eventsByMonth} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5b9bff" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#5b9bff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.30)', fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.18)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />
                <Area type="monotone" dataKey="total" stroke="#5b9bff" strokeWidth={2.5}
                  fill="url(#grad1)"
                  dot={{ fill: '#5b9bff', strokeWidth: 0, r: 4 }}
                  activeDot={{ r: 6, fill: '#2563eb', stroke: '#fff', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Próximos Eventos */}
          <Card className="lg:col-span-2 p-5 anim-fade-up stagger-4">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <IconBadge icon={CalendarDays} from="#3b82f6" to="#2563eb" size={36} soft />
                <p className="font-bold text-white" style={{ fontSize: 14 }}>Próximos Eventos</p>
              </div>
              {proximosEvts.length > 0 && <ChevronRight size={16} style={{ color: 'var(--text-faint)' }} />}
            </div>
            {proximosEvts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <CalendarDays size={34} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
                <p className="font-semibold" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Nenhum evento agendado</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {proximosEvts.map(ev => {
                  const d = new Date(ev.dataInicio + 'T12:00')
                  return (
                    <div key={ev.id} className="flex items-center gap-3 p-2.5 rounded-xl transition-colors"
                      style={{ background: 'var(--bg-raised)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-overlay)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-raised)'}>
                      <div className="flex flex-col items-center justify-center flex-shrink-0"
                        style={{ width: 44, height: 48, borderRadius: 12, background: ev.cor + '18', border: '1px solid ' + ev.cor + '2e' }}>
                        <span className="font-black tnum" style={{ fontSize: 16, color: ev.cor, lineHeight: 1 }}>{d.getDate()}</span>
                        <span className="font-bold" style={{ fontSize: 8, color: ev.cor + 'cc', textTransform: 'uppercase', letterSpacing: 0.5 }}>{MESES[d.getMonth()]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-white truncate" style={{ fontSize: 12.5 }}>{ev.titulo}</p>
                        <p className="font-medium" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{ev.horaInicio} – {ev.horaFim}</p>
                      </div>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: ev.cor, boxShadow: `0 0 8px ${ev.cor}`, flexShrink: 0 }} />
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>

        {/* ═══ APOIADORES + SETORES ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {/* Rede de Apoiadores */}
          <Card className="p-5 anim-fade-up stagger-5">
            <div className="flex items-center gap-3 mb-5">
              <IconBadge icon={Users} from="#ec4899" to="#db2777" size={36} soft />
              <p className="font-bold text-white" style={{ fontSize: 14 }}>Rede de Apoiadores</p>
              <span className="ml-auto font-bold tnum" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{crossStats.apoiadores} total</span>
            </div>
            <div className="grid grid-cols-4 gap-2.5 mb-3">
              {[
                { l: 'Simpatizantes', v: crossStats.porNivel.simpatizante, c: '#60a5fa' },
                { l: 'Apoiadores', v: crossStats.porNivel.apoiador, c: '#34d399' },
                { l: 'Cabos', v: crossStats.porNivel.cabo_eleitoral, c: '#fbbf24' },
                { l: 'Líderes', v: crossStats.porNivel.lider, c: '#a78bfa' },
              ].map(n => (
                <div key={n.l} className="rounded-xl p-3 text-center" style={{ background: n.c + '14', border: '1px solid ' + n.c + '24' }}>
                  <p className="text-display font-bold tnum" style={{ fontSize: 22, color: n.c }}>
                    <AnimatedNumber value={n.v} />
                  </p>
                  <p className="font-bold" style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{n.l}</p>
                </div>
              ))}
            </div>
            {crossStats.apoiadores > 0 && (
              <div className="h-2 rounded-full overflow-hidden flex" style={{ background: 'var(--bg-raised)' }}>
                {[
                  { v: crossStats.porNivel.simpatizante, c: '#60a5fa' },
                  { v: crossStats.porNivel.apoiador, c: '#34d399' },
                  { v: crossStats.porNivel.cabo_eleitoral, c: '#fbbf24' },
                  { v: crossStats.porNivel.lider, c: '#a78bfa' },
                ].map((seg, i) => (
                  <div key={i} className="h-full" style={{ width: (seg.v / crossStats.apoiadores * 100) + '%', background: seg.c, transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
                ))}
              </div>
            )}
          </Card>

          {/* Igrejas por Setor */}
          <Card className="p-5 anim-fade-up stagger-6">
            <div className="flex items-center gap-3 mb-5">
              <IconBadge icon={MapPin} from="#14b8a6" to="#0d9488" size={36} soft />
              <p className="font-bold text-white" style={{ fontSize: 14 }}>Igrejas por Setor</p>
              <span className="ml-auto font-bold tnum" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{IGREJAS_BASE.length} total</span>
            </div>
            <div className="space-y-2.5">
              {setores.slice(0, 6).map(({ nome, qtd }, i) => {
                const pct = (qtd / maxQtd) * 100
                const cor = PALETA[i % PALETA.length]
                return (
                  <div key={nome} className="flex items-center gap-3">
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: cor, flexShrink: 0 }} />
                    <span className="font-medium truncate" style={{ fontSize: 12, color: 'var(--text-secondary)', width: 130 }}>{nome}</span>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-raised)' }}>
                      <div className="h-full rounded-full" style={{ width: pct + '%', background: cor, transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
                    </div>
                    <span className="font-bold tnum" style={{ fontSize: 11, color: 'var(--text-tertiary)', minWidth: 24, textAlign: 'right' }}>{qtd}</span>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
