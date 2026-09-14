import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip,
  CartesianGrid,
} from 'recharts'
import {
  Award, Users, MapPin, Target, TrendingUp, BarChart2,
  AlertCircle, ChevronRight, Sparkles, Zap, Flag, Layers,
  Percent, Building2, Download, Search, X,
  ChevronUp, ChevronDown, Link2, Upload, FileText, Loader2, Printer,
} from 'lucide-react'
import { AnimatedNumber, Card, ProgressRing, Button } from './ui'

export const ELEITORES_PALETA = [
  '#d4af5f', '#e8c878', '#c9a24a', '#22d3ee', '#38bdf8',
  '#60a5fa', '#34d399', '#a78bfa', '#f59e0b', '#f97316',
]

function fmt(n) {
  return Number(n || 0).toLocaleString('pt-BR')
}

function fmtK(n) {
  const v = Number(n || 0)
  if (v >= 10000) return `${(v / 1000).toFixed(0)}k`
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  return fmt(v)
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-xl px-3 py-2" style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.55)', border: '1px solid rgba(212,175,95,0.28)' }}>
      <p className="font-bold text-white" style={{ fontSize: 11 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-semibold tnum" style={{ fontSize: 11, color: p.color || '#f0d48a', marginTop: 2 }}>
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  )
}

/** Ranking bars — cleaner than default Recharts for lists */
function RankBars({
  items, maxValue, onClick, valueKey = 'value', labelKey = 'label',
  subKey, accent = 'gold', showIndex = true, barHeight = 8,
}) {
  const max = maxValue || Math.max(...items.map(i => i[valueKey] || 0), 1)
  const grad = accent === 'cyan'
    ? 'linear-gradient(90deg, #0e7490, #22d3ee)'
    : accent === 'violet'
      ? 'linear-gradient(90deg, #6d28d9, #a78bfa)'
      : 'linear-gradient(90deg, #a8842e, #f0d48a)'

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const val = item[valueKey] || 0
        const pct = (val / max) * 100
        const share = item.share
        const active = item.active
        return (
          <button
            key={item.id || item[labelKey] || i}
            type="button"
            onClick={() => onClick?.(item)}
            className="w-full text-left group"
            style={{ cursor: onClick ? 'pointer' : 'default' }}
          >
            <div className="flex items-center gap-2.5 mb-1">
              {showIndex && (
                <span className="font-black tnum flex-shrink-0"
                  style={{
                    fontSize: 11, width: 18, textAlign: 'right',
                    color: i === 0 ? 'var(--gold-bright)' : i < 3 ? 'var(--gold)' : 'var(--text-faint)',
                  }}>
                  {i + 1}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold truncate" style={{
                    fontSize: 12,
                    color: active ? 'var(--gold-bright)' : 'var(--text-primary)',
                  }}>
                    {item[labelKey]}
                  </p>
                  <div className="flex items-baseline gap-2 flex-shrink-0">
                    {share != null && (
                      <span className="tnum font-medium" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                        {share.toFixed(1)}%
                      </span>
                    )}
                    <span className="tnum font-black" style={{
                      fontSize: 13,
                      color: i === 0 ? 'var(--gold-bright)' : 'var(--text-secondary)',
                    }}>
                      {fmt(val)}
                    </span>
                  </div>
                </div>
                {subKey && item[subKey] != null && (
                  <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>{item[subKey]}</p>
                )}
              </div>
            </div>
            <div className="rounded-full overflow-hidden ml-[26px]"
              style={{ height: barHeight, background: 'rgba(255,255,255,0.05)' }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.max(2, pct)}%`,
                  background: active
                    ? 'linear-gradient(90deg, #b45309, #fbbf24)'
                    : grad,
                  boxShadow: i === 0 ? '0 0 12px rgba(212,175,95,0.35)' : 'none',
                }}
              />
            </div>
          </button>
        )
      })}
    </div>
  )
}

export function PanelCard({ icon: Icon, title, subtitle, action, children, className = '' }) {
  return (
    <Card hover spotlight className={`p-5 md:p-6 anim-fade-up ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, rgba(212,175,95,0.22), rgba(34,211,238,0.1))' }}>
              <Icon size={18} style={{ color: 'var(--gold-bright)' }} />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="font-bold truncate" style={{ fontSize: 15, color: 'var(--text-primary)' }}>{title}</h2>
            {subtitle && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </Card>
  )
}

/* ─── Command header ─── */
export function EleitoresCommandHeader({
  dados, cidade, totalVotos, totalVotosGeral, eleitoresAptos, metaCidade, metaPct,
  penetração, onBuscar, onImportar, onLimpar, onImprimirRankBairros, saveSlot,
}) {
  const faltam = Math.max(0, (metaCidade || 0) - (totalVotos || 0))
  const corMeta = metaPct >= 100 ? '#34d399' : metaPct >= 80 ? '#60a5fa' : metaPct >= 50 ? '#fbbf24' : '#f87171'
  const temFiltroCidade = !!cidade
  const geral = Number(totalVotosGeral) || 0
  const cidadeVotos = Number(totalVotos) || 0
  const mostrarGeral = geral > 0 && (!temFiltroCidade || geral !== cidadeVotos)

  return (
    <div className="page-header mb-5 anim-fade-up">
      <div className="page-header-rule" aria-hidden />
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
        <div className="flex items-start gap-4 min-w-0">
          {dados?.foto ? (
            <img src={dados.foto} alt="" className="rounded-2xl object-cover flex-shrink-0"
              style={{ width: 72, height: 72, border: '2px solid rgba(212,175,95,0.45)' }} />
          ) : (
            <div className="rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{
                width: 72, height: 72,
                background: 'linear-gradient(145deg, rgba(212,175,95,0.2), rgba(168,132,46,0.08))',
                border: '1px solid rgba(212,175,95,0.35)',
              }}>
              <Users size={28} style={{ color: 'var(--gold-bright)' }} />
            </div>
          )}
          <div className="min-w-0">
            <p className="eyebrow mb-1" style={{ color: 'var(--gold)' }}>Sala de Comando · Inteligência Eleitoral</p>
            <h1 className="font-extrabold text-white truncate" style={{ fontSize: 24, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
              {dados?.candidato || dados?.urna || 'Eleitores'}
            </h1>
            <p className="mt-1.5 font-medium" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {[
                dados?.numero && `Nº ${dados.numero}`,
                dados?.partido,
                dados?.cargo,
                dados?.ano,
                cidade || (dados?.municipio === 'SANTA CATARINA' ? 'Santa Catarina' : dados?.municipio),
              ].filter(Boolean).join(' · ') || 'Importe dados do TRE ou busque um candidato'}
            </p>
            {dados && (
              <div className="flex flex-wrap gap-2 mt-3">
                {[
                  mostrarGeral && { l: 'Votos totais', v: fmt(geral), c: 'var(--gold-bright)' },
                  temFiltroCidade && { l: `Votos em ${cidade}`, v: fmt(cidadeVotos), c: '#fbbf24' },
                  !temFiltroCidade && !mostrarGeral && { l: 'Votos', v: fmt(cidadeVotos), c: 'var(--gold-bright)' },
                  !temFiltroCidade && mostrarGeral && null,
                  { l: 'Aptos', v: fmt(eleitoresAptos), c: '#34d399' },
                  { l: 'Penetração', v: `${penetração.toFixed(2)}%`, c: '#22d3ee' },
                  metaCidade > 0 && temFiltroCidade && { l: 'Meta', v: `${metaPct.toFixed(0)}%`, c: corMeta },
                ].filter(Boolean).map(p => (
                  <div key={p.l} className="px-3 py-1.5 rounded-xl"
                    style={{ background: 'rgba(212,175,95,0.08)', border: '1px solid rgba(212,175,95,0.18)' }}>
                    <span className="font-bold tnum" style={{ fontSize: 13, color: p.c }}>{p.v}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 6 }}>{p.l}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-stretch gap-2.5">
          {dados && metaCidade > 0 && temFiltroCidade && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, rgba(212,175,95,0.16), rgba(168,132,46,0.08))',
                border: '1px solid rgba(212,175,95,0.35)',
                minWidth: 150,
              }}>
              <Flag size={16} style={{ color: 'var(--gold-bright)' }} />
              <div>
                <p className="font-extrabold tnum" style={{ fontSize: 22, lineHeight: 1, color: 'var(--gold-bright)' }}>
                  {fmt(faltam)}
                </p>
                <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>faltam p/ meta em {cidade}</p>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {saveSlot}
            {dados && onImprimirRankBairros && (
              <Button icon={Printer} variant="ghost" onClick={onImprimirRankBairros}>
                Rank bairros
              </Button>
            )}
            <Button icon={Search} variant="ghost" onClick={onBuscar}>Candidato</Button>
            {dados && <Button icon={X} variant="danger" onClick={onLimpar}>Limpar</Button>}
            <Button icon={Upload} onClick={onImportar}>Importar</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── KPI strip ─── */
export function EleitoresKpiStrip({ stats }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      {stats.map((s, i) => {
        const Icon = s.icon
        return (
          <button
            key={s.label}
            type="button"
            onClick={s.onClick}
            className="rounded-2xl px-4 py-4 anim-fade-up text-left transition-all"
            style={{
              background: i === 0
                ? 'linear-gradient(160deg, rgba(212,175,95,0.14), var(--bg-surface))'
                : 'var(--bg-surface)',
              border: i === 0 ? '1px solid rgba(212,175,95,0.35)' : '1px solid var(--border-subtle)',
              animationDelay: `${i * 50}ms`,
              cursor: s.onClick ? 'pointer' : 'default',
            }}>
            <div className="w-9 h-9 rounded-xl mb-3 flex items-center justify-center"
              style={{ background: `${s.cor}22` }}>
              <Icon size={16} style={{ color: s.cor }} />
            </div>
            <p className="font-black text-white tnum" style={{ fontSize: 24, lineHeight: 1 }}>
              {typeof s.raw === 'number'
                ? <AnimatedNumber value={s.raw} duration={900} />
                : s.value}
              {s.suffix}
            </p>
            <p className="mt-1.5 font-semibold" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.label}</p>
            <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>{s.sub}</p>
          </button>
        )
      })}
    </div>
  )
}

/* ─── Intelligence insights ─── */
export function InteligenciaStrip({ insights }) {
  if (!insights?.length) return null
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 anim-fade-up">
      {insights.map((it, i) => {
        const Icon = it.icon || Layers
        return (
          <div key={it.label} className="rounded-2xl px-3.5 py-3.5"
            style={{
              background: i === 0
                ? 'linear-gradient(155deg, rgba(212,175,95,0.12), var(--bg-surface))'
                : 'var(--bg-surface)',
              border: i === 0 ? '1px solid rgba(212,175,95,0.28)' : '1px solid var(--border-subtle)',
            }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: `${it.color || 'var(--gold)'}18` }}>
                <Icon size={13} style={{ color: it.color || 'var(--gold)' }} />
              </div>
              <p className="eyebrow" style={{ color: 'var(--text-faint)' }}>{it.label}</p>
            </div>
            <p className="font-extrabold tnum text-white" style={{ fontSize: 20, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
              {it.value}
            </p>
            <p className="mt-1.5 truncate" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{it.sub}</p>
          </div>
        )
      })}
    </div>
  )
}

/* ─── View tabs ─── */
export function EleitoresViewTabs({ views, active, onChange }) {
  return (
    <div className="flex gap-1.5 p-1.5 rounded-2xl overflow-x-auto"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      {views.map(t => {
        const Icon = t.icon
        const on = active === t.id
        return (
          <button key={t.id} type="button" onClick={() => onChange(t.id)}
            className="flex items-center justify-center gap-2 flex-1 min-w-[110px] py-2.5 px-3 rounded-xl font-bold transition-all"
            style={{
              fontSize: 12,
              background: on
                ? 'linear-gradient(135deg, rgba(212,175,95,0.28), rgba(168,132,46,0.12))'
                : 'transparent',
              color: on ? 'var(--gold-bright)' : 'var(--text-tertiary)',
              border: on ? '1px solid rgba(212,175,95,0.4)' : '1px solid transparent',
            }}>
            {Icon && <Icon size={14} />}
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

/* ─── City filter ─── */
export function CidadeFiltroBar({
  cargoMunicipal, cargoAmplo, filtroCidade, cidadeMeta, cidadesDisponiveis, municipio,
  onChange, totalVotosGeral = 0, totalVotosCidade = 0,
}) {
  return (
    <div className="rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      <Building2 size={14} style={{ color: 'var(--gold)' }} />
      <label className="font-semibold whitespace-nowrap" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {cargoMunicipal ? 'Município' : cargoAmplo ? 'Cidade da meta' : 'Território'}
      </label>
      {cargoMunicipal && cidadesDisponiveis.length <= 1 ? (
        <span className="px-3 py-1.5 rounded-xl font-bold"
          style={{ fontSize: 12, background: 'rgba(16,185,129,0.12)', color: '#34d399' }}>
          {filtroCidade || municipio}
        </span>
      ) : (
        <select
          value={filtroCidade || ''}
          onChange={e => onChange(e.target.value || null)}
          className="flex-1 min-w-[160px] rounded-xl px-3 py-2 font-semibold outline-none"
          style={{ fontSize: 12, background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', color: '#e2e8f0' }}>
          {!cargoMunicipal && (
            <option value="">Todas as cidades ({cidadesDisponiveis.length})</option>
          )}
          {cidadesDisponiveis.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}
      {cargoAmplo && (
        <span className="px-2 py-1 rounded-lg font-bold"
          style={{ fontSize: 10, background: 'rgba(212,175,95,0.12)', color: 'var(--gold-bright)' }}>
          Meta por cidade
        </span>
      )}
      {!!filtroCidade && totalVotosGeral > 0 && totalVotosGeral !== totalVotosCidade && (
        <span className="px-2.5 py-1 rounded-lg font-bold tnum"
          style={{ fontSize: 11, background: 'rgba(34,211,238,0.1)', color: '#67e8f9', border: '1px solid rgba(34,211,238,0.25)' }}>
          Total geral {fmt(totalVotosGeral)} · nesta cidade {fmt(totalVotosCidade)}
        </span>
      )}
    </div>
  )
}

export function MetaGlobalPanel({
  metaGlobal, totalVotos, metaGlobalPct, onMetaChange, cidade, escopoCidade, fmt: fmtFn = fmt,
}) {
  const faltam = Math.max(0, metaGlobal - totalVotos)
  const cor = metaGlobalPct >= 100 ? '#34d399' : metaGlobalPct >= 80 ? '#60a5fa' : metaGlobalPct >= 50 ? '#fbbf24' : '#f87171'
  const titulo = escopoCidade && cidade ? `Meta em ${cidade}` : 'Meta Global de Votos'
  const subtitulo = escopoCidade && cidade
    ? 'Objetivo de votos na cidade — não no estado inteiro'
    : 'Acompanhe o progresso da campanha em tempo real'

  return (
    <PanelCard icon={Target} title={titulo} subtitle={subtitulo}>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-center">
        <div className="space-y-4">
          <div>
            <label className="eyebrow block mb-2">
              {escopoCidade && cidade ? `Meta de votos em ${cidade}` : 'Meta total de votos'}
            </label>
            <input
              type="number"
              value={metaGlobal || ''}
              onChange={e => onMetaChange(parseInt(e.target.value, 10) || 0)}
              placeholder="Ex: 50000"
              className="input-dark w-full max-w-xs px-4 py-3 font-bold tnum"
              style={{ fontSize: 18 }}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Conquistados', value: totalVotos, cor: 'var(--gold-bright)' },
              { label: 'Faltam', value: metaGlobal > 0 ? faltam : 0, cor: faltam === 0 && metaGlobal > 0 ? '#34d399' : '#fbbf24' },
              { label: 'Meta', value: metaGlobal, cor: '#a78bfa' },
            ].map(item => (
              <div key={item.label} className="rounded-xl px-3 py-3 text-center" style={{ background: 'var(--bg-raised)' }}>
                <p className="font-black tnum" style={{ fontSize: 20, color: item.cor }}>
                  <AnimatedNumber value={item.value} duration={800} />
                </p>
                <p className="eyebrow mt-1">{item.label}</p>
              </div>
            ))}
          </div>
          {metaGlobal > 0 && (
            <div>
              <div className="flex justify-between mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                <span>Progresso</span>
                <span className="font-bold tnum" style={{ color: cor }}>{metaGlobalPct.toFixed(1)}%</span>
              </div>
              <div className="rounded-full overflow-hidden" style={{ height: 10, background: 'var(--bg-raised)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(metaGlobalPct, 100)}%`,
                    background: `linear-gradient(90deg, ${cor}88, ${cor})`,
                    boxShadow: `0 0 12px ${cor}55`,
                  }} />
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-center">
          <ProgressRing
            pct={metaGlobal > 0 ? Math.min(metaGlobalPct, 100) : 0}
            size={140}
            stroke={10}
            from={cor}
            to={`${cor}99`}
            label={metaGlobal > 0 ? 'da meta' : 'sem meta'}
          />
        </div>
      </div>
    </PanelCard>
  )
}

export function PenetracaoPanel({ totalVotos, eleitoresAptos, fmtPct }) {
  const pct = eleitoresAptos > 0 ? (totalVotos / eleitoresAptos) * 100 : 0
  const r = 54
  const c = 2 * Math.PI * r
  const dash = Math.min(100, pct) / 100 * c

  return (
    <PanelCard icon={Users} title="Penetração Eleitoral" subtitle={`${fmt(totalVotos)} votos de ${fmt(eleitoresAptos)} aptos`}>
      <div className="grid grid-cols-1 sm:grid-cols-[150px_1fr] gap-5 items-center">
        <div className="relative mx-auto" style={{ width: 140, height: 140 }}>
          <svg width="140" height="140" viewBox="0 0 140 140">
            <defs>
              <linearGradient id="penGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#a8842e" />
                <stop offset="55%" stopColor="#f0d48a" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
              <filter id="penGlow">
                <feGaussianBlur stdDeviation="2.5" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
            <circle cx="70" cy="70" r={r} fill="none" stroke="url(#penGrad)" strokeWidth="10"
              strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
              transform="rotate(-90 70 70)" filter="url(#penGlow)"
              style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(0.16,1,0.3,1)' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="font-black tnum text-white" style={{ fontSize: 26, letterSpacing: '-0.03em' }}>{pct.toFixed(1)}%</span>
            <span className="eyebrow">do eleitorado</span>
          </div>
        </div>
        <div className="space-y-2.5">
          {[
            { l: 'Votos recebidos', v: totalVotos, c: 'var(--gold-bright)', bar: pct },
            { l: 'Eleitores aptos', v: eleitoresAptos, c: '#34d399', bar: 100 },
            { l: 'Espaço a conquistar', v: Math.max(0, eleitoresAptos - totalVotos), c: '#67e8f9', bar: 100 - pct },
          ].map(row => (
            <div key={row.l} className="rounded-xl px-3 py-2.5" style={{ background: 'var(--bg-raised)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{row.l}</span>
                <span className="font-black tnum" style={{ fontSize: 15, color: row.c }}>{fmt(row.v)}</span>
              </div>
              <div className="rounded-full overflow-hidden" style={{ height: 3, background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, row.bar)}%`, background: row.c }} />
              </div>
            </div>
          ))}
          <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>{fmtPct(totalVotos, eleitoresAptos)} de penetração no território</p>
        </div>
      </div>
    </PanelCard>
  )
}

export function ZonaVotosChart({ data, totalVotos, onZonaClick }) {
  const items = useMemo(() =>
    data.map(z => ({
      id: z.zona,
      label: `Zona ${z.zona}`,
      value: z.totalVotos,
      share: totalVotos > 0 ? (z.totalVotos / totalVotos) * 100 : 0,
      sub: `${z.numLocais || 0} locais · ${z.numSecoes || 0} seções`,
      zona: z.zona,
    })),
    [data, totalVotos],
  )
  const media = data.length > 0 ? totalVotos / data.length : 0

  return (
    <PanelCard
      icon={BarChart2}
      title="Votos por Zona"
      subtitle={`${data.length} zonas · média ${fmtK(media)} votos/zona`}
      action={<span className="font-black tnum" style={{ fontSize: 20, color: 'var(--gold-bright)' }}>{fmt(totalVotos)}</span>}
    >
      {items.length === 0 ? (
        <p className="py-8 text-center" style={{ fontSize: 12, color: 'var(--text-faint)' }}>Sem zonas neste filtro</p>
      ) : (
        <RankBars
          items={items}
          onClick={it => onZonaClick?.(it.zona)}
          barHeight={9}
          accent="gold"
        />
      )}
      <p className="mt-4" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
        Clique numa zona para abrir os locais
      </p>
    </PanelCard>
  )
}

export function TopLocaisChart({ locais, totalVotos }) {
  const items = useMemo(() =>
    locais.slice(0, 10).map(l => ({
      id: l.id || l.nome,
      label: l.nome,
      value: l.totalVotos,
      share: totalVotos > 0 ? (l.totalVotos / totalVotos) * 100 : 0,
      sub: [
        l.zonaNum != null && `Zona ${l.zonaNum}`,
        l.setor,
        l.numSecoes != null && `${l.numSecoes} seções`,
      ].filter(Boolean).join(' · '),
    })),
    [locais, totalVotos],
  )
  const topShare = items.slice(0, 3).reduce((s, i) => s + (i.share || 0), 0)

  return (
    <PanelCard
      icon={Award}
      title="Top 10 Locais"
      subtitle={items.length ? `Top 3 concentram ${topShare.toFixed(1)}% dos votos` : 'Sem locais'}
    >
      {items.length === 0 ? (
        <p className="py-8 text-center" style={{ fontSize: 12, color: 'var(--text-faint)' }}>Importe dados para ver o ranking</p>
      ) : (
        <RankBars items={items} accent="cyan" barHeight={7} />
      )}
    </PanelCard>
  )
}

export function BairroVotosChart({ data, onBairroClick, filtroBairro, onImprimir }) {
  const [limite, setLimite] = useState(12)
  const total = useMemo(() => data.reduce((s, d) => s + d.votos, 0), [data])
  const items = useMemo(() =>
    data.slice(0, limite).map(d => ({
      id: d.name,
      label: d.name,
      value: d.votos,
      share: total > 0 ? (d.votos / total) * 100 : 0,
      sub: `${d.locais} local${d.locais !== 1 ? 'is' : ''}`,
      active: filtroBairro === d.name,
      name: d.name,
    })),
    [data, limite, total, filtroBairro],
  )

  return (
    <PanelCard
      icon={TrendingUp}
      title="Força por Bairro"
      subtitle={`${data.length} bairros mapeados · clique para filtrar seções`}
      action={
        <div className="flex items-center gap-1.5">
          {onImprimir && (
            <button type="button" onClick={onImprimir} title="Imprimir rank de bairros"
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1"
              style={{
                background: 'rgba(212,175,95,0.12)',
                color: 'var(--gold-bright)',
                border: '1px solid rgba(212,175,95,0.28)',
              }}>
              <Printer size={12} />
              Imprimir
            </button>
          )}
          {[8, 12, 20].map(n => (
            <button key={n} type="button" onClick={() => setLimite(n)}
              className="px-2 py-1 rounded-lg text-[10px] font-bold"
              style={{
                background: limite === n ? 'rgba(212,175,95,0.22)' : 'var(--bg-raised)',
                color: limite === n ? 'var(--gold-bright)' : 'var(--text-faint)',
                border: limite === n ? '1px solid rgba(212,175,95,0.35)' : '1px solid transparent',
              }}>
              {n}
            </button>
          ))}
        </div>
      }
    >
      <RankBars
        items={items}
        onClick={it => onBairroClick?.(it.name)}
        accent="violet"
        barHeight={8}
      />
      {filtroBairro && (
        <button type="button" onClick={() => onBairroClick?.(filtroBairro)}
          className="mt-4 w-full py-2 rounded-xl font-bold"
          style={{ fontSize: 11, background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>
          Filtro: {filtroBairro} · clique para limpar
        </button>
      )}
    </PanelCard>
  )
}

export function DistribuicaoSecoesChart({ secoes }) {
  const { buckets, media, mediana } = useMemo(() => {
    const b = [
      { faixa: '0', min: 0, max: 0, count: 0 },
      { faixa: '1–5', min: 1, max: 5, count: 0 },
      { faixa: '6–15', min: 6, max: 15, count: 0 },
      { faixa: '16–30', min: 16, max: 30, count: 0 },
      { faixa: '31–60', min: 31, max: 60, count: 0 },
      { faixa: '60+', min: 61, max: Infinity, count: 0 },
    ]
    const vals = []
    secoes.forEach(s => {
      const v = Number(s.votos) || 0
      vals.push(v)
      const bucket = b.find(x => v >= x.min && v <= x.max)
      if (bucket) bucket.count++
    })
    vals.sort((a, c) => a - c)
    const mediaV = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : 0
    const med = vals.length ? vals[Math.floor(vals.length / 2)] : 0
    return { buckets: b, media: mediaV, mediana: med }
  }, [secoes])

  const maxCount = Math.max(...buckets.map(b => b.count), 1)

  return (
    <PanelCard
      icon={Target}
      title="Distribuição por Seção"
      subtitle={`Média ${media.toFixed(1)} · mediana ${mediana} votos/seção`}
    >
      <div className="flex items-end gap-2" style={{ height: 160 }}>
        {buckets.map((b, i) => {
          const h = (b.count / maxCount) * 100
          const hot = i >= 4
          return (
            <div key={b.faixa} className="flex-1 flex flex-col items-center justify-end h-full gap-1.5 group">
              <span className="font-bold tnum opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ fontSize: 10, color: 'var(--gold-bright)' }}>
                {b.count}
              </span>
              <div className="w-full rounded-t-lg relative"
                style={{
                  height: `${Math.max(4, h)}%`,
                  background: hot
                    ? 'linear-gradient(180deg, #f0d48a, #a8842e)'
                    : i === 0
                      ? 'linear-gradient(180deg, #f87171, #7f1d1d)'
                      : 'linear-gradient(180deg, rgba(34,211,238,0.85), rgba(14,116,144,0.55))',
                  boxShadow: hot ? '0 0 16px rgba(212,175,95,0.25)' : 'none',
                  transition: 'height 0.6s cubic-bezier(0.16,1,0.3,1)',
                }}
                title={`${b.count} seções`}
              />
              <span className="font-semibold" style={{ fontSize: 9, color: 'var(--text-faint)' }}>{b.faixa}</span>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between mt-3 px-0.5">
        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>Fracos ←</span>
        <span style={{ fontSize: 10, color: 'var(--gold)' }}>→ Fortes</span>
      </div>
    </PanelCard>
  )
}

export function MetaVsVotosChart({ zonas, fmt: fmtFn = fmt }) {
  const chartData = useMemo(() =>
    [...zonas]
      .sort((a, b) => (b.votos || 0) - (a.votos || 0))
      .map(z => ({
        name: `Z${z.zona}`,
        votos: z.votos || 0,
        meta: z.meta || 0,
        pct: z.pct || 0,
      })),
    [zonas],
  )
  const comMeta = chartData.filter(z => z.meta > 0)
  if (!comMeta.length) return null

  return (
    <PanelCard
      icon={BarChart2}
      title="Votos × Meta por Zona"
      subtitle="Barras douradas = votos · barras ciano = meta"
    >
      <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 42)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }} barGap={3} barCategoryGap="28%">
          <defs>
            <linearGradient id="barVotos" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#a8842e" />
              <stop offset="100%" stopColor="#f0d48a" />
            </linearGradient>
            <linearGradient id="barMeta" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0e7490" />
              <stop offset="100%" stopColor="#67e8f9" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.28)' }} axisLine={false} tickLine={false}
            tickFormatter={fmtK} />
          <YAxis type="category" dataKey="name" width={36}
            tick={{ fontSize: 11, fill: 'rgba(250,248,242,0.75)', fontWeight: 700 }}
            axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="votos" name="Votos" fill="url(#barVotos)" radius={[0, 5, 5, 0]} maxBarSize={12} />
          <Bar dataKey="meta" name="Meta" fill="url(#barMeta)" radius={[0, 5, 5, 0]} maxBarSize={12} />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-3 justify-center">
        <span className="flex items-center gap-1.5" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'linear-gradient(90deg,#a8842e,#f0d48a)' }} /> Votos
        </span>
        <span className="flex items-center gap-1.5" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'linear-gradient(90deg,#0e7490,#67e8f9)' }} /> Meta
        </span>
      </div>
    </PanelCard>
  )
}

export function MetasZonaPanel({
  zonas, metasZona, onMetaChange, onSugerirMetas, metaGlobal = 0, cidade, escopoCidade, fmt: fmtFn = fmt,
}) {
  const totalVotos = useMemo(() => zonas.reduce((s, z) => s + (z.votos || 0), 0), [zonas])
  const totalMetas = useMemo(() => zonas.reduce((s, z) => s + (z.meta || 0), 0), [zonas])
  const semMeta = zonas.filter(z => !z.meta).length
  const prioridade = useMemo(() => {
    if (!totalVotos) return null
    const top = [...zonas].sort((a, b) => (b.votos || 0) - (a.votos || 0))[0]
    if (!top) return null
    const pct = (top.votos / totalVotos) * 100
    return { zona: top.zona, pct, votos: top.votos }
  }, [zonas, totalVotos])

  return (
    <PanelCard
      icon={Target}
      title={escopoCidade && cidade ? `Metas por Zona · ${cidade}` : 'Metas por Zona'}
      subtitle={semMeta > 0
        ? `${semMeta} zona${semMeta > 1 ? 's' : ''} sem meta — use as sugestões abaixo`
        : escopoCidade && cidade
          ? `Metas eleitorais na cidade de ${cidade}`
          : 'Acompanhe o desempenho por zona eleitoral'}
      action={
        <div className="flex flex-wrap gap-1.5 justify-end">
          {metaGlobal > 0 && onSugerirMetas && (
            <button type="button" onClick={() => onSugerirMetas('proporcional')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold"
              style={{ fontSize: 10, background: 'rgba(212,175,95,0.12)', color: 'var(--gold-bright)', border: '1px solid rgba(212,175,95,0.3)' }}>
              <Sparkles size={11} /> {escopoCidade ? 'Dividir meta' : 'Dividir meta'}
            </button>
          )}
          {onSugerirMetas && (
            <button type="button" onClick={() => onSugerirMetas('crescimento')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold"
              style={{ fontSize: 10, background: 'rgba(16,185,129,0.12)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.28)' }}>
              <Zap size={11} /> Meta +20%
            </button>
          )}
        </div>
      }
    >
      {(prioridade || metaGlobal > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {prioridade && (
            <div className="rounded-xl px-3 py-3" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.22)' }}>
              <p className="eyebrow" style={{ color: '#fbbf24' }}>Zona prioritária</p>
              <p className="font-black tnum mt-1" style={{ fontSize: 18, color: 'var(--text-primary)' }}>Zona {prioridade.zona}</p>
              <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                {prioridade.pct.toFixed(1)}% dos votos ({fmtFn(prioridade.votos)})
              </p>
            </div>
          )}
          <div className="rounded-xl px-3 py-3" style={{ background: 'var(--bg-raised)' }}>
            <p className="eyebrow">{escopoCidade && cidade ? `Votos em ${cidade}` : 'Votos na cidade'}</p>
            <p className="font-black tnum mt-1" style={{ fontSize: 18, color: 'var(--gold-bright)' }}>{fmtFn(totalVotos)}</p>
            <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>{zonas.length} zonas</p>
          </div>
          <div className="rounded-xl px-3 py-3" style={{ background: 'var(--bg-raised)' }}>
            <p className="eyebrow">Soma das metas</p>
            <p className="font-black tnum mt-1" style={{ fontSize: 18, color: totalMetas > 0 ? '#a78bfa' : 'var(--text-faint)' }}>
              {totalMetas > 0 ? fmtFn(totalMetas) : '—'}
            </p>
            {metaGlobal > 0 && totalMetas > 0 && (
              <p style={{ fontSize: 10, color: Math.abs(totalMetas - metaGlobal) < 50 ? '#34d399' : '#fbbf24', marginTop: 4 }}>
                {Math.abs(totalMetas - metaGlobal) < 50
                  ? (escopoCidade ? 'Alinhado à meta da cidade' : 'Alinhado à meta global')
                  : `Δ ${fmtFn(Math.abs(totalMetas - metaGlobal))} vs ${escopoCidade ? 'cidade' : 'global'}`}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2.5">
        {zonas.map(z => {
          const cor = z.status === 'atingida' ? '#34d399' : z.status === 'boa' ? '#60a5fa' : z.status === 'alerta' ? '#fbbf24' : z.status === 'sem_meta' ? 'var(--text-faint)' : '#f87171'
          const share = totalVotos > 0 ? ((z.votos / totalVotos) * 100) : 0
          const sugestao = metaGlobal > 0 && totalVotos > 0
            ? Math.round(metaGlobal * (z.votos / totalVotos))
            : Math.round(z.votos * 1.2)
          const metaMax = Math.max(z.meta || 0, z.votos || 0, 1)
          return (
            <div key={z.zona} className="rounded-2xl px-4 py-3"
              style={{ background: 'var(--bg-raised)', border: `1px solid ${cor}28` }}>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="min-w-[72px]">
                  <p className="font-bold text-white" style={{ fontSize: 13 }}>Zona {z.zona}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>{share.toFixed(1)}% do total</p>
                </div>
                <div className="flex-1 min-w-[140px]">
                  <div className="flex justify-between mb-1" style={{ fontSize: 10 }}>
                    <span style={{ color: 'var(--gold-bright)' }}>{fmtFn(z.votos)} votos</span>
                    <span style={{ color: cor }}>{z.meta > 0 ? `${z.pct.toFixed(0)}% meta` : 'sem meta'}</span>
                  </div>
                  <div className="relative rounded-full overflow-hidden" style={{ height: 8, background: 'rgba(255,255,255,0.06)' }}>
                    {z.meta > 0 && (
                      <div className="absolute inset-y-0 left-0 rounded-full"
                        style={{ width: `${(z.meta / metaMax) * 100}%`, background: 'rgba(34,211,238,0.22)' }} />
                    )}
                    <div className="relative h-full rounded-full"
                      style={{
                        width: `${(z.votos / metaMax) * 100}%`,
                        background: `linear-gradient(90deg, ${cor}99, ${cor})`,
                      }} />
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={z.meta || ''}
                    onChange={e => onMetaChange(z.zona, parseInt(e.target.value, 10) || 0)}
                    placeholder={sugestao > 0 ? String(sugestao) : 'Meta'}
                    className="input-dark w-24 px-2 py-1.5 font-bold tnum text-center"
                    style={{ fontSize: 12 }}
                  />
                  {z.meta === 0 && sugestao > 0 && (
                    <button type="button" onClick={() => onMetaChange(z.zona, sugestao)}
                      className="px-2 py-1.5 rounded-lg font-bold"
                      style={{ fontSize: 10, background: 'rgba(16,185,129,0.15)', color: '#6ee7b7' }}>
                      Usar
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </PanelCard>
  )
}

export function AlertasMetaStrip({ alertas }) {
  if (!alertas.length) return null
  return (
    <Card className="p-5 anim-fade-up">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.16)' }}>
          <AlertCircle size={16} style={{ color: '#fbbf24' }} />
        </div>
        <div>
          <h3 className="font-bold" style={{ fontSize: 14, color: 'var(--text-primary)' }}>Alertas de Meta</h3>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{alertas.length} ponto{alertas.length > 1 ? 's' : ''} de atenção</p>
        </div>
      </div>
      <div className="space-y-2">
        {alertas.map((a, i) => (
          <div key={i} className="flex items-start gap-2 p-3 rounded-xl"
            style={{
              background: a.tipo === 'critico' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
              border: `1px solid ${a.tipo === 'critico' ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`,
            }}>
            <ChevronRight size={14} style={{ color: a.tipo === 'critico' ? '#f87171' : '#fbbf24', flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a.msg}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ─── Import panel (dark) ─── */
export function ImportPanel({
  loading, nomeArq, texto, erro, fileRef, onPick, onDrop, onTexto, onClear, onImport,
}) {
  return (
    <PanelCard icon={Upload} title="Importar Dados do TRE" subtitle='PDF ou texto · "Votação do Candidato por Seção"'>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={e => { if (e.target.files[0]) onPick(e.target.files[0]); e.target.value = '' }}
      />
      <div
        className="rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all mb-5"
        style={{
          border: '1.5px dashed rgba(212,175,95,0.4)',
          background: loading ? 'rgba(212,175,95,0.1)' : 'rgba(212,175,95,0.04)',
          minHeight: 130, padding: '24px 16px',
        }}
        onClick={() => !loading && fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onDrop(f) }}
      >
        {loading ? (
          <>
            <Loader2 size={28} className="mb-2 animate-spin" style={{ color: 'var(--gold-bright)' }} />
            <p className="font-bold" style={{ fontSize: 13, color: 'var(--gold-bright)' }}>Lendo o PDF…</p>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{nomeArq}</p>
          </>
        ) : nomeArq ? (
          <>
            <FileText size={28} className="mb-2" style={{ color: 'var(--gold-bright)' }} />
            <p className="font-bold text-center" style={{ fontSize: 13, color: 'var(--text-primary)' }}>{nomeArq}</p>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Texto extraído · clique para trocar</p>
          </>
        ) : (
          <>
            <Upload size={28} className="mb-2" style={{ color: 'var(--gold)' }} />
            <p className="font-bold" style={{ fontSize: 14, color: 'var(--text-primary)' }}>Clique ou arraste o PDF aqui</p>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
              Relatório TRE-SC · Votação do Candidato por Seção
            </p>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1" style={{ height: 1, background: 'var(--border-subtle)' }} />
        <span className="font-semibold" style={{ fontSize: 11, color: 'var(--text-faint)' }}>ou cole o texto</span>
        <div className="flex-1" style={{ height: 1, background: 'var(--border-subtle)' }} />
      </div>

      <textarea
        value={texto}
        onChange={e => onTexto(e.target.value)}
        placeholder="O texto do PDF aparece aqui após o upload. Também pode colar manualmente."
        rows={8}
        className="input-dark w-full rounded-2xl px-4 py-3 resize-none"
        style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace' }}
      />

      {erro && (
        <div className="mt-3 flex items-start gap-2 px-4 py-3 rounded-2xl"
          style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <AlertCircle size={14} style={{ color: '#f87171', flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 12, color: '#fca5a5' }}>{erro}</p>
        </div>
      )}

      <div className="flex gap-3 mt-4">
        <Button variant="ghost" onClick={onClear}>Limpar</Button>
        <Button className="flex-1" disabled={!texto.trim()} onClick={onImport}>Processar e Importar</Button>
      </div>
    </PanelCard>
  )
}

export function EmptyEleitores({ onImportar, onBuscar }) {
  return (
    <div className="rounded-3xl p-10 md:p-14 text-center anim-fade-up"
      style={{
        background: 'linear-gradient(160deg, rgba(212,175,95,0.08), var(--bg-surface))',
        border: '1px solid rgba(212,175,95,0.22)',
      }}>
      <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
        style={{ background: 'rgba(212,175,95,0.15)', border: '1px solid rgba(212,175,95,0.3)' }}>
        <Layers size={28} style={{ color: 'var(--gold-bright)' }} />
      </div>
      <p className="font-extrabold text-white" style={{ fontSize: 20 }}>Central de Inteligência Eleitoral</p>
      <p className="mx-auto mt-2 max-w-md" style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
        Importe o relatório do TRE ou busque um candidato para cruzar zonas, seções, bairros e metas da campanha.
      </p>
      <div className="flex flex-wrap justify-center gap-2 mt-6">
        <Button icon={Search} variant="ghost" onClick={onBuscar}>Buscar Candidato</Button>
        <Button icon={Upload} onClick={onImportar}>Importar TRE</Button>
      </div>
    </div>
  )
}

/* ─── Locais list ─── */
export function LocaisPanel({
  locais, totalVotos, busca, onBusca, filtroZona, onFiltroZona, zonas,
  expandido, onToggle, onAtribuir, onExport, fmt: fmtFn = fmt,
}) {
  return (
    <PanelCard
      icon={MapPin}
      title="Locais de Votação"
      subtitle={`${locais.length} local${locais.length !== 1 ? 'is' : ''} · ranking por votos`}
      action={
        <button type="button" onClick={onExport}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-bold"
          style={{ fontSize: 11, background: 'rgba(212,175,95,0.12)', color: 'var(--gold-bright)', border: '1px solid rgba(212,175,95,0.28)' }}>
          <Download size={12} /> CSV
        </button>
      }
    >
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-faint)' }} />
          <input value={busca} onChange={e => onBusca(e.target.value)}
            placeholder="Buscar local de votação…"
            className="input-dark w-full rounded-xl pl-9 pr-3 py-2.5"
            style={{ fontSize: 13 }} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Chip active={!filtroZona} onClick={() => onFiltroZona(null)}>Todos</Chip>
          {(zonas || []).map(z => (
            <Chip key={z.zona} active={filtroZona === z.zona}
              onClick={() => onFiltroZona(filtroZona === z.zona ? null : z.zona)}>
              Z{z.zona}
            </Chip>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        {locais.map((l, idx) => {
          const pct = totalVotos > 0 ? (l.totalVotos / totalVotos) * 100 : 0
          const isOpen = expandido[l.id]
          return (
            <div key={l.id} className="rounded-2xl overflow-hidden"
              style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-raised)' }}>
              <div className="flex items-center gap-3 p-3 cursor-pointer"
                onClick={() => onToggle(l.id)}>
                <span className="font-black tnum w-7 text-right flex-shrink-0"
                  style={{ fontSize: 12, color: idx < 3 ? 'var(--gold-bright)' : 'var(--text-faint)' }}>
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate" style={{ fontSize: 12, color: 'var(--text-primary)' }}>{l.nome}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>Zona {l.zonaNum} · {l.numSecoes} seções</span>
                    {l.setor && (
                      <span className="px-2 py-0.5 rounded-full font-bold"
                        style={{ fontSize: 9, background: 'rgba(212,175,95,0.15)', color: 'var(--gold-bright)' }}>
                        {l.setor}
                      </span>
                    )}
                  </div>
                  {l.endereco && (
                    <p className="truncate mt-0.5" style={{ fontSize: 10, color: 'var(--text-faint)' }} title={l.endereco}>
                      {l.endereco}
                    </p>
                  )}
                  <div className="mt-2 rounded-full overflow-hidden" style={{ height: 3, background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct * 4)}%`, background: 'var(--gold)' }} />
                  </div>
                </div>
                <div className="text-right flex-shrink-0 mr-1">
                  <p className="font-black tnum" style={{ fontSize: 15, color: 'var(--gold-bright)' }}>{fmtFn(l.totalVotos)}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>{pct.toFixed(2)}%</p>
                </div>
                <button type="button" onClick={e => { e.stopPropagation(); onAtribuir(l.id) }}
                  className="p-1.5 rounded-lg flex-shrink-0" title="Atribuir bairro">
                  <Link2 size={12} style={{ color: l.setor ? 'var(--gold-bright)' : 'var(--text-faint)' }} />
                </button>
                <div className="flex-shrink-0" style={{ color: 'var(--text-faint)' }}>
                  {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </div>
              {isOpen && (
                <div className="px-4 pb-3 pt-1" style={{ background: 'rgba(0,0,0,0.2)' }}>
                  <p className="font-semibold mb-2" style={{ fontSize: 10, color: 'var(--text-faint)' }}>SEÇÃO (VOTOS)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(l.secoes || []).map(s => (
                      <div key={s.secao} className="px-2.5 py-1 rounded-xl"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', fontSize: 11 }}>
                        <span className="font-bold" style={{ color: 'var(--text-secondary)' }}>{s.secao}</span>
                        <span className="ml-1 tnum" style={{ color: 'var(--gold-bright)' }}>({s.votos})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {locais.length === 0 && (
          <p className="text-center py-10" style={{ fontSize: 13, color: 'var(--text-faint)' }}>Nenhum local encontrado</p>
        )}
      </div>
    </PanelCard>
  )
}

function Chip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className="px-3 py-2 rounded-xl font-semibold"
      style={{
        fontSize: 12,
        background: active ? 'rgba(212,175,95,0.22)' : 'var(--bg-raised)',
        color: active ? 'var(--gold-bright)' : 'var(--text-tertiary)',
        border: active ? '1px solid rgba(212,175,95,0.4)' : '1px solid transparent',
      }}>
      {children}
    </button>
  )
}

/* ─── Seções table ─── */
export function SecoesPanel({
  secoes, filtroBairro, onFiltroBairro, bairros, onExport, fmt: fmtFn = fmt,
}) {
  const [busca, setBusca] = useState('')
  const [sortKey, setSortKey] = useState('votos')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(0)
  const PAGE = 80

  const filtradas = useMemo(() => {
    let list = secoes
    if (busca.trim()) {
      const q = busca.trim().toLowerCase()
      list = list.filter(s =>
        String(s.secao).includes(q)
        || (s.local || '').toLowerCase().includes(q)
        || (s.bairro || '').toLowerCase().includes(q)
        || (s.cidade || '').toLowerCase().includes(q)
        || String(s.zonaNum).includes(q),
      )
    }
    const dir = sortDir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      if (sortKey === 'votos') return (a.votos - b.votos) * dir
      if (sortKey === 'secao') return (a.secao - b.secao) * dir
      if (sortKey === 'zona') return (a.zonaNum - b.zonaNum) * dir
      return String(a[sortKey] || '').localeCompare(String(b[sortKey] || '')) * dir
    })
  }, [secoes, busca, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtradas.length / PAGE))
  const slice = filtradas.slice(page * PAGE, page * PAGE + PAGE)

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'votos' ? 'desc' : 'asc') }
    setPage(0)
  }

  const headers = [
    { k: '#', sort: null },
    { k: 'Seção', sort: 'secao' },
    { k: 'Zona', sort: 'zona' },
    { k: 'Cidade', sort: 'cidade' },
    { k: 'Local', sort: 'local' },
    { k: 'Bairro', sort: 'bairro' },
    { k: 'Endereço', sort: null },
    { k: 'Votos', sort: 'votos', right: true },
  ]

  return (
    <PanelCard
      icon={Target}
      title="Seções Eleitorais"
      subtitle={`${fmtFn(filtradas.length)} seções${filtroBairro ? ` · ${filtroBairro}` : ''} · ordenáveis e exportáveis`}
      action={
        <button type="button" onClick={onExport}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-bold"
          style={{ fontSize: 11, background: 'rgba(212,175,95,0.12)', color: 'var(--gold-bright)', border: '1px solid rgba(212,175,95,0.28)' }}>
          <Download size={12} /> CSV
        </button>
      }
    >
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
        <input value={busca} onChange={e => { setBusca(e.target.value); setPage(0) }}
          placeholder="Filtrar seção, local, bairro, zona…"
          className="input-dark w-full rounded-xl pl-9 pr-3 py-2.5" style={{ fontSize: 13 }} />
      </div>

      {bairros.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <Chip active={!filtroBairro} onClick={() => onFiltroBairro(null)}>Todos</Chip>
          {bairros.map(b => (
            <Chip key={b} active={filtroBairro === b}
              onClick={() => onFiltroBairro(filtroBairro === b ? null : b)}>
              {b}
            </Chip>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border-subtle)' }}>
        <table className="w-full">
          <thead>
            <tr style={{ background: 'rgba(212,175,95,0.06)' }}>
              {headers.map(h => (
                <th key={h.k}
                  className={`py-2.5 px-3 font-bold ${h.right ? 'text-right' : 'text-left'} ${h.sort ? 'cursor-pointer select-none' : ''}`}
                  style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}
                  onClick={() => h.sort && toggleSort(h.sort)}>
                  {h.k}
                  {h.sort && sortKey === h.sort && (
                    <span style={{ color: 'var(--gold-bright)', marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((s, i) => (
              <tr key={`${page}-${i}-${s.localId}-${s.secao}`}
                style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <td className="py-2 px-3 font-bold tnum" style={{ fontSize: 11, color: 'var(--text-faint)' }}>{page * PAGE + i + 1}</td>
                <td className="py-2 px-3 font-bold" style={{ fontSize: 12, color: 'var(--text-primary)' }}>{s.secao}</td>
                <td className="py-2 px-3" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{s.zonaNum}</td>
                <td className="py-2 px-3" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.cidade}</td>
                <td className="py-2 px-3 max-w-[200px]" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  <span className="truncate block">{s.local}</span>
                </td>
                <td className="py-2 px-3" style={{ fontSize: 11 }}>
                  {s.bairro !== '—' ? (
                    <span className="px-2 py-0.5 rounded-full font-bold"
                      style={{ background: 'rgba(212,175,95,0.14)', color: 'var(--gold-bright)' }}>
                      {s.bairro}
                    </span>
                  ) : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                </td>
                <td className="py-2 px-3 max-w-[180px]" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                  <span className="truncate block" title={s.endereco}>{s.endereco || '—'}</span>
                </td>
                <td className="py-2 px-3 text-right font-black tnum" style={{ fontSize: 13, color: 'var(--gold-bright)' }}>
                  {s.votos}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4 gap-3 flex-wrap">
        <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          Página {page + 1} de {totalPages} · {fmtFn(filtradas.length)} registros
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
          <Button variant="ghost" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Próxima</Button>
        </div>
      </div>
    </PanelCard>
  )
}

export function BairrosAtribuicaoPanel({
  numSemSetor, locais, bairrosDaCidade, mostrarTodos, onToggleTodos, totalLocais,
  onAutoFill, bairroMsg, onAtribuir, fmt: fmtFn = fmt, normalizarBairro,
}) {
  return (
    <PanelCard
      icon={Link2}
      title="Atribuição de Bairros"
      subtitle="Necessário para cruzar com o Mapa Eleitoral"
      action={
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {numSemSetor > 0 && (
            <span className="px-2.5 py-1 rounded-lg font-bold"
              style={{ fontSize: 11, background: 'rgba(249,115,22,0.15)', color: '#fb923c' }}>
              {numSemSetor} pendente{numSemSetor > 1 ? 's' : ''}
            </span>
          )}
          <button type="button" onClick={onAutoFill}
            className="px-2.5 py-1.5 rounded-lg font-bold"
            style={{ fontSize: 11, background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)' }}>
            Preencher automático
          </button>
          {bairroMsg && (
            <span className="px-2.5 py-1 rounded-lg font-semibold"
              style={{ fontSize: 11, background: 'rgba(212,175,95,0.12)', color: 'var(--gold-bright)' }}>
              {bairroMsg}
            </span>
          )}
          {totalLocais > locais.length && (
            <button type="button" onClick={onToggleTodos}
              className="px-2.5 py-1.5 rounded-lg font-bold"
              style={{ fontSize: 11, background: 'var(--bg-raised)', color: 'var(--text-tertiary)' }}>
              {mostrarTodos ? 'Só pendentes' : `Ver todos (${totalLocais})`}
            </button>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto pr-1">
        {locais.map(l => {
          const setorSel = l.setor ? (normalizarBairro(l.setor, bairrosDaCidade) || l.setor) : ''
          const opcoes = setorSel && !bairrosDaCidade.includes(setorSel)
            ? [setorSel, ...bairrosDaCidade]
            : bairrosDaCidade
          return (
            <div key={l.id} className="rounded-2xl px-3 pt-2 pb-2.5"
              style={{
                border: setorSel ? '1px solid rgba(16,185,129,0.3)' : '1px dashed rgba(249,115,22,0.5)',
                background: setorSel ? 'rgba(16,185,129,0.05)' : 'rgba(249,115,22,0.04)',
              }}>
              <p className="font-semibold truncate" style={{ fontSize: 11, color: 'var(--text-primary)' }}>{l.nome}</p>
              <p className="mb-1.5" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                Zona {l.zonaNum} · {fmtFn(l.totalVotos)} votos · {l.numSecoes} seções
              </p>
              <select
                value={setorSel}
                onChange={e => onAtribuir(l.id, e.target.value || null)}
                className="w-full text-xs rounded-lg px-2 py-1.5 font-semibold outline-none"
                style={{
                  background: '#0d111c',
                  color: setorSel ? '#34d399' : '#fb923c',
                  border: `1px solid ${setorSel ? 'rgba(52,211,153,0.3)' : 'rgba(251,146,60,0.4)'}`,
                }}>
                <option value="">— Selecionar bairro —</option>
                {opcoes.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )
        })}
      </div>
    </PanelCard>
  )
}

/** Helpers exported for parent */
export function calcInteligencia({ locaisFlat, todasSecoes, votosPorZona, votosPorBairro, totalVotos, numSemSetor }) {
  const nSec = todasSecoes.length || 1
  const media = totalVotos / nSec
  const zeradas = todasSecoes.filter(s => !s.votos).length
  const sorted = [...todasSecoes].sort((a, b) => b.votos - a.votos)
  const topN = Math.max(1, Math.ceil(sorted.length * 0.1))
  const votosTop10 = sorted.slice(0, topN).reduce((s, x) => s + (x.votos || 0), 0)
  const conc = totalVotos > 0 ? (votosTop10 / totalVotos) * 100 : 0
  const top5Loc = locaisFlat.slice(0, 5).reduce((s, l) => s + l.totalVotos, 0)
  const pareto = totalVotos > 0 ? (top5Loc / totalVotos) * 100 : 0
  const melhorZona = votosPorZona[0]
  const melhorBairro = votosPorBairro[0]
  const mapeados = locaisFlat.length - numSemSetor
  const cobertura = locaisFlat.length > 0 ? (mapeados / locaisFlat.length) * 100 : 0

  return [
    {
      label: 'Concentração',
      value: `${conc.toFixed(0)}%`,
      sub: `Top 10% das seções concentram os votos`,
      icon: Percent,
      color: conc > 40 ? '#fbbf24' : '#34d399',
    },
    {
      label: 'Média / seção',
      value: media.toFixed(1),
      sub: `${zeradas} seção${zeradas !== 1 ? 'ões' : ''} com zero votos`,
      icon: Layers,
      color: '#22d3ee',
    },
    {
      label: 'Pareto (top 5)',
      value: `${pareto.toFixed(0)}%`,
      sub: 'Dos votos nos 5 melhores locais',
      icon: Award,
      color: 'var(--gold-bright)',
    },
    {
      label: melhorBairro ? `Bairro #1` : melhorZona ? `Zona #1` : 'Cobertura',
      value: melhorBairro?.name || (melhorZona ? `Z${melhorZona.zona}` : `${cobertura.toFixed(0)}%`),
      sub: melhorBairro
        ? `${fmt(melhorBairro.votos)} votos · ${melhorBairro.locais} locais`
        : melhorZona
          ? `${fmt(melhorZona.totalVotos)} votos`
          : `${mapeados}/${locaisFlat.length} colégios com bairro`,
      icon: MapPin,
      color: '#a78bfa',
    },
  ]
}

export function baixarCsv(nome, rows) {
  if (!rows?.length) return
  const headers = Object.keys(rows[0])
  const esc = v => {
    const s = String(v ?? '')
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const body = [headers.join(';'), ...rows.map(r => headers.map(h => esc(r[h])).join(';'))].join('\n')
  const blob = new Blob(['\uFEFF' + body], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nome
  a.click()
  URL.revokeObjectURL(a.href)
}
