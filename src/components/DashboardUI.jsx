import { useState, useMemo } from 'react'
import {
  CalendarDays, Target, Cloud, CloudSun, Sun, Users, Heart, Package,
  ClipboardList, AlertTriangle, ChevronRight, Wallet, TrendingUp,
  CheckCircle2, Flag, Church, Pencil, Route,
  MapPin, Zap, ArrowUpRight, Briefcase, Vote, Home, Layers, Hash,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, ResponsiveContainer,
  Tooltip, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts'
import { AnimatedNumber, Card, Pill } from './ui'
import SaveButton from './SaveButton'
import { bairroBlumenauValido, planejamentoEquipePorBairro, VOTOS_POR_MEMBRO, VOTOS_POR_MEMBRO_OPCOES } from '../utils/forcaPorBairro'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtN = (v) => Number(v || 0).toLocaleString('pt-BR')

function ProgressBar({ pct, color = 'var(--gold)', height = 6 }) {
  const bg = String(color).includes('gradient')
    ? { backgroundImage: color }
    : { background: color }
  return (
    <div className="rounded-full overflow-hidden" style={{ height, background: 'var(--bg-raised)' }}>
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.min(100, Math.max(0, pct))}%`,
          ...bg,
          transition: 'width 0.7s cubic-bezier(0.16,1,0.3,1)',
        }}
      />
    </div>
  )
}

function SectionTitle({ icon: Icon, title, sub, action, color = 'var(--gold-bright)' }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex items-center justify-center rounded-xl flex-shrink-0"
          style={{ width: 34, height: 34, background: `${color}18` }}>
          <Icon size={16} style={{ color }} />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-white truncate" style={{ fontSize: 14 }}>{title}</p>
          {sub && <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>{sub}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

function ChartTip({ active, payload, label, unit = '' }) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-xl px-3 py-2" style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
      <p className="font-bold text-white" style={{ fontSize: 11 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-semibold" style={{ fontSize: 11, color: p.color || '#f0d48a', marginTop: 2 }}>
          {p.name}: {Number(p.value).toLocaleString('pt-BR')}{unit}
        </p>
      ))}
    </div>
  )
}

/* ─── Header ─── */
export function DashboardHeader({
  greeting, dateLabel, diasEleicao, dataEleicao, weather, weatherLoading,
  pulse = {},
}) {
  const WI = weather
    ? (weather.current.weather_code === 0 ? Sun : weather.current.weather_code <= 3 ? CloudSun : Cloud)
    : Cloud

  return (
    <div className="page-header mb-6 anim-fade-up">
      <div className="page-header-rule" aria-hidden />
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
        <div className="min-w-0">
          <p className="eyebrow mb-1.5" style={{ color: 'var(--gold)' }}>Sala de Comando · Central</p>
          <h1 className="font-extrabold text-white" style={{ fontSize: 26, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
            {greeting}, Coordenação
          </h1>
          <p className="font-medium capitalize mt-1.5" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {dateLabel}
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {[
              { l: 'Hoje', v: pulse.eventosHoje || 0, u: 'eventos' },
              { l: 'Semana', v: pulse.eventosSemana || 0, u: 'na agenda' },
              { l: 'Campo', v: pulse.distSemana || 0, u: 'materiais' },
              { l: 'Rede', v: pulse.interacoesSemana || 0, u: 'contatos' },
            ].map(p => (
              <div key={p.l} className="px-3 py-1.5 rounded-xl"
                style={{ background: 'rgba(212,175,95,0.08)', border: '1px solid rgba(212,175,95,0.18)' }}>
                <span className="font-bold tnum" style={{ fontSize: 13, color: 'var(--gold-bright)' }}>{fmtN(p.v)}</span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 6 }}>{p.l} · {p.u}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-stretch gap-2.5">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{
              background: 'linear-gradient(135deg, rgba(212,175,95,0.16), rgba(168,132,46,0.08))',
              border: '1px solid rgba(212,175,95,0.35)',
              minWidth: 140,
            }}>
            <div className="relative flex items-center justify-center"
              style={{ width: 48, height: 48 }}>
              <svg width="48" height="48" viewBox="0 0 48 48" className="absolute inset-0">
                <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(212,175,95,0.15)" strokeWidth="3" />
                <circle cx="24" cy="24" r="20" fill="none" stroke="var(--gold-bright)" strokeWidth="3"
                  strokeDasharray={`${Math.min(126, (diasEleicao / 100) * 126)} 126`}
                  strokeLinecap="round" transform="rotate(-90 24 24)" />
              </svg>
              <Flag size={16} style={{ color: 'var(--gold-bright)', position: 'relative' }} />
            </div>
            <div>
              <p className="font-extrabold tnum" style={{ fontSize: 28, lineHeight: 1, color: 'var(--gold-bright)' }}>
                <AnimatedNumber value={diasEleicao} duration={1200} />
              </p>
              <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>dias · {dataEleicao}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3.5 py-3 rounded-2xl"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
            {weatherLoading ? (
              <div className="skeleton" style={{ width: 72, height: 14, borderRadius: 6 }} />
            ) : weather ? (
              <>
                <WI size={16} style={{ color: 'var(--gold)' }} />
                <div>
                  <p className="font-bold tnum" style={{ fontSize: 16, color: 'var(--text-primary)' }}>
                    {Math.round(weather.current.temperature_2m)}°
                  </p>
                  <p style={{ fontSize: 9, color: 'var(--text-faint)' }}>Blumenau</p>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Alerts ─── */
export function AlertStrip({ alertas, onNavigate }) {
  if (!alertas?.length) return null
  return (
    <div className="flex flex-wrap gap-2 mb-5 anim-fade-up stagger-1">
      {alertas.map((a, i) => (
        <button
          key={i}
          type="button"
          onClick={() => a.tab && onNavigate?.(a.tab)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
          style={{
            background: 'var(--bg-raised)',
            border: `1px solid ${a.c}40`,
            cursor: a.tab ? 'pointer' : 'default',
          }}
        >
          <AlertTriangle size={13} style={{ color: a.c, flexShrink: 0 }} />
          <span className="font-medium text-left" style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{a.m}</span>
          {a.tab && <ArrowUpRight size={12} style={{ color: a.c, opacity: 0.7 }} />}
        </button>
      ))}
    </div>
  )
}

/* ─── KPI Command Grid ─── */
export function CommandKpis({ items }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5 anim-fade-up stagger-1">
      {items.map((item, i) => (
        <button
          key={item.label}
          type="button"
          onClick={item.onClick}
          className="text-left rounded-2xl p-4 transition-all"
          style={{
            background: i === 0
              ? 'linear-gradient(160deg, rgba(212,175,95,0.14), var(--bg-surface))'
              : 'var(--bg-surface)',
            border: i === 0 ? '1px solid rgba(212,175,95,0.35)' : '1px solid var(--border-subtle)',
          }}
        >
          <p className="eyebrow mb-2" style={{ color: item.color || 'var(--text-faint)' }}>{item.label}</p>
          <p className="font-bold tnum text-white" style={{ fontSize: 24, lineHeight: 1 }}>
            {item.prefix}
            <AnimatedNumber value={item.value} suffix={item.suffix || ''} />
          </p>
          <p className="mt-1.5 font-medium truncate" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            {item.sub}
          </p>
          {item.pct != null && (
            <div className="mt-2.5"><ProgressBar pct={item.pct} color={item.color || 'var(--gold)'} height={3} /></div>
          )}
        </button>
      ))}
    </div>
  )
}

/* ─── Weekly pulse ─── */
export function WeeklyPulse({ items, onNavigate }) {
  return (
    <Card className="p-4 mb-5 anim-fade-up stagger-2" style={{ borderRadius: 'var(--r-lg)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Zap size={14} style={{ color: 'var(--gold-bright)' }} />
        <p className="font-bold text-white" style={{ fontSize: 13 }}>Pulso da semana</p>
        <span style={{ fontSize: 10, color: 'var(--text-faint)', marginLeft: 4 }}>últimos 7 dias</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {items.map(it => (
          <button
            key={it.label}
            type="button"
            onClick={() => it.tab && onNavigate?.(it.tab)}
            className="rounded-xl px-3 py-3 text-left transition-all"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}
          >
            <p className="font-bold tnum" style={{ fontSize: 20, color: it.color, lineHeight: 1 }}>
              <AnimatedNumber value={it.value} />
            </p>
            <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>{it.label}</p>
          </button>
        ))}
      </div>
    </Card>
  )
}

/* ─── Vote war room ─── */
export function VoteCommandPanel({
  projecao, diasEleicao, metas, editMetas, onToggleEdit, onMetaChange, onSaveMetas, topZonas = [],
}) {
  const { totalVotos, metaVotos, pctMeta, faltam, votosPorDia, totalAptos, penetração } = projecao

  return (
    <Card className="p-5 md:p-6 h-full anim-fade-up stagger-2" style={{ borderRadius: 'var(--r-lg)' }}>
      <SectionTitle
        icon={Target}
        title="Sala de votos"
        sub="Importados vs meta · penetração no território"
        color="#22d3ee"
        action={(
          <button type="button" onClick={onToggleEdit}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
            style={{ background: 'var(--bg-raised)', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>
            <Pencil size={12} /> {editMetas ? 'Fechar' : 'Metas'}
          </button>
        )}
      />

      {editMetas && (
        <div className="grid grid-cols-2 gap-3 mb-5 p-3 rounded-xl" style={{ background: 'var(--bg-raised)' }}>
          <div>
            <label className="eyebrow block mb-1">Meta de votos</label>
            <input type="number" value={metas.metaVotos}
              onChange={e => onMetaChange('metaVotos', parseInt(e.target.value, 10) || 0)}
              className="input-dark w-full px-3 py-2 font-bold tnum" style={{ fontSize: 14 }} />
          </div>
          <div>
            <label className="eyebrow block mb-1">Meta zonas</label>
            <input type="number" value={metas.metaZonas}
              onChange={e => onMetaChange('metaZonas', parseInt(e.target.value, 10) || 0)}
              className="input-dark w-full px-3 py-2 font-bold tnum" style={{ fontSize: 14 }} />
          </div>
          <div className="col-span-2 flex justify-end">
            <SaveButton onSave={onSaveMetas} variant="inline" label="Salvar metas" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { l: 'Votos', v: totalVotos, c: '#22d3ee' },
          { l: '% da meta', v: Math.round(pctMeta), s: '%', c: 'var(--gold-bright)' },
          { l: 'Votos/dia', v: faltam > 0 ? votosPorDia : 0, c: '#fbbf24' },
          { l: 'Penetração', v: penetração, s: '%', c: '#34d399' },
        ].map(x => (
          <div key={x.l} className="rounded-xl p-3" style={{ background: 'var(--bg-raised)' }}>
            <p className="eyebrow mb-1">{x.l}</p>
            <p className="font-bold tnum" style={{ fontSize: 22, color: x.c, lineHeight: 1 }}>
              {fmtN(x.v)}{x.s || ''}
            </p>
          </div>
        ))}
      </div>

      {metaVotos > 0 && (
        <>
          <ProgressBar pct={pctMeta} color="linear-gradient(90deg,#a8842e,#f0d48a)" height={8} />
          <p className="mt-3 font-medium" style={{ fontSize: 11.5, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
            {faltam > 0
              ? `Faltam ${fmtN(faltam)} votos · ritmo ${fmtN(votosPorDia)}/dia em ${diasEleicao} dias${totalAptos ? ` · ${fmtN(totalAptos)} aptos` : ''}.`
              : 'Meta alcançada — mantenha o engajamento até a eleição.'}
          </p>
        </>
      )}

      {topZonas.length > 0 && (
        <div className="mt-5">
          <p className="eyebrow mb-2">Top zonas por votos</p>
          <div className="space-y-2">
            {topZonas.map((z, i) => (
              <div key={z.nome} className="flex items-center gap-2">
                <span className="font-bold tnum" style={{ fontSize: 10, color: 'var(--gold)', width: 14 }}>{i + 1}</span>
                <span className="truncate flex-1" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{z.nome}</span>
                <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-raised)' }}>
                  <div className="h-full rounded-full" style={{
                    width: `${(z.votos / (topZonas[0].votos || 1)) * 100}%`,
                    background: 'linear-gradient(90deg,#0e7490,#22d3ee)',
                  }} />
                </div>
                <span className="tnum font-bold" style={{ fontSize: 11, color: '#67e8f9', minWidth: 40, textAlign: 'right' }}>
                  {fmtN(z.votos)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

/* ─── Agenda ─── */
export function AgendaPanel({ eventosHoje, proximosEvts, onNavigate }) {
  return (
    <Card className="p-5 h-full anim-fade-up stagger-2" style={{ borderRadius: 'var(--r-lg)' }}>
      <SectionTitle
        icon={CalendarDays}
        title="Agenda operacional"
        sub="Hoje e próximos compromissos"
        color="var(--accent-bright)"
        action={(
          <button type="button" onClick={() => onNavigate?.('agenda')}
            className="text-xs font-bold" style={{ color: 'var(--accent-bright)' }}>
            Ver tudo
          </button>
        )}
      />

      {eventosHoje.length > 0 && (
        <div className="mb-4">
          <p className="eyebrow mb-2">Hoje</p>
          <div className="space-y-2">
            {eventosHoje.slice(0, 4).map(ev => (
              <div key={ev.id} className="flex items-center gap-2.5 p-2.5 rounded-xl"
                style={{ background: (ev.cor || '#3b82f6') + '14', border: `1px solid ${(ev.cor || '#3b82f6')}28` }}>
                <span className="rounded-full flex-shrink-0"
                  style={{ width: 8, height: 8, background: ev.cor || '#3b82f6' }} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white truncate" style={{ fontSize: 12 }}>{ev.titulo}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                    {[ev.horaInicio, ev.horaFim].filter(Boolean).join(' – ') || 'Horário livre'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="eyebrow mb-2">Próximos</p>
      {proximosEvts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <CalendarDays size={28} style={{ color: 'var(--text-faint)', marginBottom: 8 }} />
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Nenhum evento agendado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {proximosEvts.map(ev => {
            const d = new Date(ev.dataInicio + 'T12:00')
            return (
              <div key={ev.id} className="flex items-center gap-2.5 p-2 rounded-xl" style={{ background: 'var(--bg-raised)' }}>
                <div className="flex flex-col items-center flex-shrink-0" style={{ width: 36 }}>
                  <span className="font-black tnum" style={{ fontSize: 14, color: ev.cor || 'var(--gold)', lineHeight: 1 }}>{d.getDate()}</span>
                  <span className="font-bold" style={{ fontSize: 8, color: 'var(--text-faint)' }}>{MESES[d.getMonth()]}</span>
                </div>
                <p className="font-semibold text-white truncate flex-1" style={{ fontSize: 12 }}>{ev.titulo}</p>
                <ChevronRight size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

/* ─── Dual activity chart ─── */
export function DualActivityChart({ eventsByMonth, distByMonth, totalEventos, totalDist }) {
  return (
    <Card className="p-5 h-full anim-fade-up stagger-3" style={{ borderRadius: 'var(--r-lg)' }}>
      <SectionTitle
        icon={TrendingUp}
        title="Atividade nos últimos 6 meses"
        sub="Eventos na agenda e materiais distribuídos"
        color="var(--accent-bright)"
        action={(
          <div className="flex gap-2">
            <Pill color="var(--accent-bright)">{totalEventos} evt</Pill>
            <Pill color="var(--gold)">{fmtN(totalDist)} mat</Pill>
          </div>
        )}
      />
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={eventsByMonth.map((e, i) => ({
          ...e,
          dist: distByMonth[i]?.total || 0,
        }))} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="dashEvt" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5b9bff" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#5b9bff" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="dashMat" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d4af5f" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#d4af5f" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--chart-tick)', fontWeight: 600 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 9, fill: 'var(--chart-tick-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={<ChartTip />} cursor={{ stroke: 'var(--chart-cursor)' }} />
          <Area type="monotone" dataKey="total" name="Eventos" stroke="#5b9bff" strokeWidth={2}
            fill="url(#dashEvt)" dot={{ fill: '#5b9bff', r: 2.5, strokeWidth: 0 }} />
          <Area type="monotone" dataKey="dist" name="Materiais" stroke="#d4af5f" strokeWidth={2}
            fill="url(#dashMat)" dot={{ fill: '#d4af5f', r: 2.5, strokeWidth: 0 }} />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  )
}

/* ─── Budget + pie ─── */
export function BudgetPanel({ resumo, categorias = [] }) {
  const orcCor = resumo
    ? (resumo.saldoFinal < 0 ? '#ef4444' : resumo.pctUtilizado >= 90 ? '#f59e0b' : '#10b981')
    : '#10b981'
  const pieData = categorias.filter(c => c.value > 0).slice(0, 5)

  return (
    <Card className="p-5 h-full anim-fade-up stagger-3" style={{ borderRadius: 'var(--r-lg)' }}>
      <SectionTitle icon={Wallet} title="Caixa & previsão" sub="Uso do orçamento da campanha" color="#fbbf24" />
      {resumo?.temOrcamento ? (
        <>
          <div className="flex items-end justify-between gap-3 mb-3">
            <div>
              <p className="font-bold text-white tnum" style={{ fontSize: 26, lineHeight: 1 }}>{fmtBRL(resumo.totalGeral)}</p>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>de {fmtBRL(resumo.orcDisponivel)}</p>
            </div>
            <Pill color={orcCor}>{Math.round(resumo.pctUtilizado)}%</Pill>
          </div>
          <ProgressBar pct={resumo.pctUtilizado} color={orcCor} height={6} />
          {pieData.length > 0 && (
            <div className="flex items-center gap-3 mt-4">
              <ResponsiveContainer width={88} height={88}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" innerRadius={24} outerRadius={40} paddingAngle={2}>
                    {pieData.map((e, i) => <Cell key={i} fill={e.color} stroke="none" />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1 min-w-0">
                {pieData.map(c => (
                  <div key={c.name} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
                    <span className="truncate flex-1" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{c.name}</span>
                    <span className="tnum font-bold" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{fmtBRL(c.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="py-8 text-center">
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Configure na aba Previsão de Gasto</p>
        </div>
      )}
    </Card>
  )
}

/* ─── Estoque completo de materiais ─── */
export function StockPanel({
  itens = [],
  alertas = [],
  totalItens,
  onNavigate,
}) {
  const lista = (itens?.length ? itens : alertas) || []
  const totalCad = lista.reduce((s, i) => s + (Number(i.quantidade) || 0), 0)
  const totalDisp = lista.reduce((s, i) => s + (Number(i.disponivel ?? i.restante) || 0), 0)
  const totalRes = lista.reduce((s, i) => s + (Number(i.reservado) || 0), 0)
  const totalSaido = lista.reduce((s, i) => s + (Number(i.saido ?? i.distribuido) || 0), 0)

  return (
    <Card className="p-5 h-full anim-fade-up stagger-3" style={{ borderRadius: 'var(--r-lg)' }}>
      <SectionTitle
        icon={Package}
        title="Estoque de materiais"
        sub={`${lista.length || totalItens || 0} itens · ${alertas.length} críticos`}
        color="#fbbf24"
        action={(
          <button type="button" onClick={() => onNavigate?.('materiais')}
            className="text-xs font-bold" style={{ color: '#fbbf24' }}>Abrir</button>
        )}
      />

      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {[
          { l: 'Cadastro', v: totalCad, c: '#e2e8f0' },
          { l: 'Saídas', v: totalSaido, c: '#67e8f9' },
          { l: 'Reserv.', v: totalRes, c: '#fbbf24' },
          { l: 'Disp.', v: totalDisp, c: '#34d399' },
        ].map(x => (
          <div key={x.l} className="rounded-lg p-2 text-center" style={{ background: 'var(--bg-raised)' }}>
            <p className="font-bold tnum" style={{ fontSize: 13, color: x.c }}>{fmtN(x.v)}</p>
            <p style={{ fontSize: 8, color: 'var(--text-faint)' }}>{x.l}</p>
          </div>
        ))}
      </div>

      {lista.length === 0 ? (
        <div className="py-6 text-center">
          <Package size={22} className="mx-auto mb-2" style={{ color: 'var(--text-faint)' }} />
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Nenhum material cadastrado</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-0.5">
          {lista.map(it => {
            const disp = Number(it.disponivel ?? it.restante) || 0
            const st = it.status || (disp <= 0 ? 'esgotado' : 'ok')
            const cor = st === 'esgotado' ? '#f87171' : st === 'baixo' ? '#fbbf24' : '#34d399'
            return (
              <div key={it.id || it.nome} className="rounded-xl px-2.5 py-2"
                style={{
                  background: 'var(--bg-raised)',
                  border: `1px solid ${st !== 'ok' ? cor + '44' : 'transparent'}`,
                }}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="font-bold truncate" style={{ fontSize: 12, color: 'var(--text-primary)' }}>{it.nome}</p>
                  <span className="font-bold tnum flex-shrink-0" style={{ fontSize: 12, color: cor }}>{fmtN(disp)}</span>
                </div>
                <div className="grid grid-cols-4 gap-1" style={{ fontSize: 9, color: 'var(--text-faint)' }}>
                  <span>Cad. <b className="tnum" style={{ color: 'var(--text-secondary)' }}>{fmtN(it.quantidade)}</b></span>
                  <span>Said. <b className="tnum" style={{ color: 'var(--text-secondary)' }}>{fmtN(it.saido ?? it.distribuido)}</b></span>
                  <span>Res. <b className="tnum" style={{ color: 'var(--text-secondary)' }}>{fmtN(it.reservado)}</b></span>
                  <span>Disp. <b className="tnum" style={{ color: cor }}>{fmtN(disp)}</b></span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

/* ─── Agenda de retiradas de material ─── */
export function RetiradasAgendaPanel({
  pendentes = 0,
  validadas = 0,
  total = 0,
  agenda = [],
  onNavigate,
}) {
  function labelDia(iso) {
    if (!iso || iso === 'sem-data') return 'Sem data'
    try {
      const d = new Date(`${iso}T12:00:00`)
      return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
    } catch {
      return iso
    }
  }

  function statusStyle(st) {
    if (st === 'pendente') return { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', label: 'Pendente' }
    if (st === 'validado') return { bg: 'rgba(16,185,129,0.15)', color: '#34d399', label: 'Validado' }
    if (st === 'recusado') return { bg: 'rgba(239,68,68,0.15)', color: '#f87171', label: 'Recusado' }
    return { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8', label: st || '—' }
  }

  return (
    <Card className="p-5 h-full anim-fade-up stagger-3" style={{ borderRadius: 'var(--r-lg)' }}>
      <SectionTitle
        icon={ClipboardList}
        title="Agenda de retiradas"
        sub="Pedidos de material por data prevista"
        color="#67e8f9"
        action={(
          <button type="button" onClick={() => onNavigate?.('materiais')}
            className="text-xs font-bold" style={{ color: '#67e8f9' }}>Abrir</button>
        )}
      />

      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { l: 'Pendentes', v: pendentes, c: '#fbbf24' },
          { l: 'Validadas', v: validadas, c: '#34d399' },
          { l: 'Ativas', v: total, c: '#67e8f9' },
        ].map(x => (
          <div key={x.l} className="rounded-xl p-2.5 text-center" style={{ background: 'var(--bg-raised)' }}>
            <p className="font-bold tnum" style={{ fontSize: 18, color: x.c }}>{x.v}</p>
            <p style={{ fontSize: 9, color: 'var(--text-faint)' }}>{x.l}</p>
          </div>
        ))}
      </div>

      {agenda.length === 0 ? (
        <div className="py-6 text-center">
          <ClipboardList size={22} className="mx-auto mb-2" style={{ color: 'var(--text-faint)' }} />
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Nenhuma retirada agendada</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {agenda.map(grupo => (
            <div key={grupo.dia}>
              <p className="eyebrow mb-1.5" style={{ color: 'var(--text-faint)' }}>{labelDia(grupo.dia)}</p>
              <div className="space-y-1.5">
                {grupo.itens.map(r => {
                  const st = statusStyle(r.status)
                  const mats = (r.itens || [])
                    .map(it => `${it.itemNome || 'Item'}: ${fmtN(it.quantidade)}`)
                    .join(' · ')
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onNavigate?.('materiais')}
                      className="w-full text-left rounded-xl px-2.5 py-2 flex items-start gap-2"
                      style={{ background: 'var(--bg-raised)' }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-bold truncate" style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                            {r.coordenadorNome || '—'}
                          </p>
                          <span className="px-1.5 py-0.5 rounded-md flex-shrink-0"
                            style={{ fontSize: 9, fontWeight: 700, background: st.bg, color: st.color }}>
                            {st.label}
                          </span>
                        </div>
                        <p className="truncate" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                          {mats || 'Sem itens'}
                        </p>
                      </div>
                      <ChevronRight size={14} style={{ color: 'var(--text-faint)', flexShrink: 0, marginTop: 2 }} />
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/* ─── Field / routes ─── */
export function FieldPanel({ rotas, paradasPendentes, igrejasPct, igrejasVisitadas, totalIgrejas, onNavigate }) {
  return (
    <Card className="p-5 h-full anim-fade-up stagger-4" style={{ borderRadius: 'var(--r-lg)' }}>
      <SectionTitle icon={Route} title="Campo & rotas" sub="Logística e cobertura territorial" color="#34d399" />
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { l: 'Rotas', v: rotas, c: '#34d399' },
          { l: 'Paradas', v: paradasPendentes, c: '#fbbf24' },
          { l: 'Igrejas', v: `${igrejasPct}%`, c: '#67e8f9' },
        ].map(x => (
          <div key={x.l} className="rounded-xl p-2.5 text-center" style={{ background: 'var(--bg-raised)' }}>
            <p className="font-bold tnum" style={{ fontSize: 18, color: x.c }}>{x.v}</p>
            <p style={{ fontSize: 9, color: 'var(--text-faint)' }}>{x.l}</p>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>
        {igrejasVisitadas} de {totalIgrejas} igrejas visitadas
      </p>
      <ProgressBar pct={igrejasPct} color="#14b8a6" height={5} />
      <div className="flex gap-2 mt-4">
        <button type="button" onClick={() => onNavigate?.('rotas')}
          className="flex-1 py-2 rounded-xl font-bold" style={{ fontSize: 11, background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>
          Rotas
        </button>
        <button type="button" onClick={() => onNavigate?.('mapa')}
          className="flex-1 py-2 rounded-xl font-bold" style={{ fontSize: 11, background: 'rgba(34,211,238,0.12)', color: '#67e8f9' }}>
          Mapa igrejas
        </button>
      </div>
    </Card>
  )
}

/* ─── Team ops ─── */
export function TeamPanel({
  membros, cadastroOk, pendenciasCadastro, tarefasPendentes, tarefasConcluidas,
  saldoEquipe, hideFinance = false, onNavigate,
}) {
  const pctCad = membros > 0 ? Math.round((cadastroOk / membros) * 100) : 0
  return (
    <Card className="p-5 h-full anim-fade-up stagger-4" style={{ borderRadius: 'var(--r-lg)' }}>
      <SectionTitle
        icon={Users}
        title="Equipe em operação"
        sub="Cadastros, tarefas e financeiro"
        color="#a78bfa"
        action={(
          <button type="button" onClick={() => onNavigate?.('equipe')}
            className="text-xs font-bold" style={{ color: '#c4b5fd' }}>Abrir</button>
        )}
      />
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          { l: 'Membros', v: membros, c: 'var(--text-primary)' },
          { l: 'Cadastro ok', v: `${pctCad}%`, c: '#34d399' },
          { l: 'Tarefas ok', v: tarefasConcluidas, c: '#67e8f9' },
          { l: 'Pendentes', v: tarefasPendentes, c: '#f87171' },
        ].map(x => (
          <div key={x.l} className="rounded-xl p-2.5" style={{ background: 'var(--bg-raised)' }}>
            <p className="font-bold tnum" style={{ fontSize: 18, color: x.c }}>{x.v}</p>
            <p style={{ fontSize: 9, color: 'var(--text-faint)' }}>{x.l}</p>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
        {pendenciasCadastro} com dados faltando
        {!hideFinance ? ` · saldo a pagar ${fmtBRL(saldoEquipe)}` : ''}
      </p>
      <ProgressBar pct={pctCad} color="#a78bfa" height={5} />
    </Card>
  )
}

/* ─── Network ─── */
export function ApoiadoresPanel({ stats, interacoesSemana, onNavigate }) {
  const niveis = [
    { l: 'Simpatizantes', v: stats.porNivel.simpatizante, c: '#60a5fa' },
    { l: 'Apoiadores', v: stats.porNivel.apoiador, c: '#34d399' },
    { l: 'Cabos', v: stats.porNivel.cabo_eleitoral, c: '#fbbf24' },
    { l: 'Líderes', v: stats.porNivel.lider, c: '#e879f9' },
  ]
  return (
    <Card className="p-5 anim-fade-up stagger-4" style={{ borderRadius: 'var(--r-lg)' }}>
      <SectionTitle
        icon={Heart}
        title="Rede de apoiadores"
        sub={`${interacoesSemana} contatos esta semana`}
        color="#ec4899"
        action={(
          <button type="button" onClick={() => onNavigate?.('apoiadores')}
            className="font-bold tnum" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{stats.apoiadores}</button>
        )}
      />
      <div className="grid grid-cols-4 gap-2">
        {niveis.map(n => (
          <div key={n.l} className="rounded-xl p-2.5 text-center" style={{ background: n.c + '12' }}>
            <p className="font-bold tnum" style={{ fontSize: 18, color: n.c }}>
              <AnimatedNumber value={n.v} />
            </p>
            <p style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 2 }}>{n.l}</p>
          </div>
        ))}
      </div>
      {stats.apoiadores > 0 && (
        <div className="mt-3 h-2 rounded-full overflow-hidden flex" style={{ background: 'var(--bg-raised)' }}>
          {niveis.map((seg, i) => (
            <div key={i} className="h-full" style={{ width: `${(seg.v / stats.apoiadores) * 100}%`, background: seg.c }} />
          ))}
        </div>
      )}
    </Card>
  )
}

/* ─── Companies ─── */
export function EmpresasPanel({ total, ativas, valorContratos, hideFinance = false, onNavigate }) {
  return (
    <Card className="p-5 anim-fade-up stagger-4" style={{ borderRadius: 'var(--r-lg)' }}>
      <SectionTitle
        icon={Briefcase}
        title="Empresas & contratos"
        sub={hideFinance ? 'Fornecedores da campanha' : 'Fornecedores na previsão de gasto'}
        color="var(--gold-bright)"
        action={(
          <button type="button" onClick={() => onNavigate?.('empresas')}
            className="text-xs font-bold" style={{ color: 'var(--gold)' }}>Abrir</button>
        )}
      />
      <div className={`grid gap-2 ${hideFinance ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {[
          { l: 'Cadastradas', v: total, c: 'var(--text-primary)' },
          { l: 'Ativas', v: ativas, c: '#34d399' },
          ...(!hideFinance ? [{ l: 'A pagar', v: fmtBRL(valorContratos), c: 'var(--gold-bright)' }] : []),
        ].map(x => (
          <div key={x.l} className="rounded-xl p-2.5 text-center" style={{ background: 'var(--bg-raised)' }}>
            <p className="font-bold tnum truncate" style={{ fontSize: 15, color: x.c }}>{x.v}</p>
            <p style={{ fontSize: 9, color: 'var(--text-faint)' }}>{x.l}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ─── Surveys ─── */
export function SurveysPanel({ ativas, respostas, onNavigate }) {
  return (
    <Card className="p-5 anim-fade-up stagger-4" style={{ borderRadius: 'var(--r-lg)' }}>
      <SectionTitle
        icon={ClipboardList}
        title="Pesquisas & enquetes"
        sub="Termômetro da opinião"
        color="#38bdf8"
        action={(
          <button type="button" onClick={() => onNavigate?.('pesquisas')}
            className="text-xs font-bold" style={{ color: '#38bdf8' }}>Abrir</button>
        )}
      />
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-4" style={{ background: 'rgba(56,189,248,0.1)' }}>
          <p className="font-bold tnum" style={{ fontSize: 28, color: '#38bdf8' }}>{ativas}</p>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>enquetes ativas</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-raised)' }}>
          <p className="font-bold tnum" style={{ fontSize: 28, color: 'var(--text-primary)' }}>{fmtN(respostas)}</p>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>respostas totais</p>
        </div>
      </div>
    </Card>
  )
}

/* ─── Territory churches ─── */
export function TerritoryPanel({ setores, totalIgrejas, pctVisitadas, visitadas, onNavigate }) {
  const maxQtd = setores[0]?.qtd || 1
  const PALETA = ['#d4af5f', '#22d3ee', '#34d399', '#5b9bff', '#f59e0b', '#e879f9']

  return (
    <Card className="p-5 anim-fade-up stagger-4" style={{ borderRadius: 'var(--r-lg)' }}>
      <SectionTitle
        icon={Church}
        title="Território — igrejas"
        sub={`${visitadas} de ${totalIgrejas} visitadas (${pctVisitadas}%)`}
        color="#14b8a6"
        action={(
          <button type="button" onClick={() => onNavigate?.('mapa')}
            className="text-xs font-bold" style={{ color: '#14b8a6' }}>Mapa</button>
        )}
      />
      <ProgressBar pct={pctVisitadas} color="#14b8a6" height={5} />
      <div className="space-y-2 mt-4">
        {setores.slice(0, 6).map(({ nome, qtd }, i) => {
          const cor = PALETA[i % PALETA.length]
          return (
            <div key={nome} className="flex items-center gap-2">
              <span style={{ width: 6, height: 6, borderRadius: 999, background: cor, flexShrink: 0 }} />
              <span className="truncate flex-1" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{nome}</span>
              <div className="w-20 h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-raised)' }}>
                <div className="h-full rounded-full" style={{ width: `${(qtd / maxQtd) * 100}%`, background: cor }} />
              </div>
              <span className="tnum font-bold" style={{ fontSize: 10, color: 'var(--text-faint)', minWidth: 18, textAlign: 'right' }}>{qtd}</span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/* ─── Força por bairro ─── */
const FORCA_MODOS = [
  {
    id: 'quantidade',
    label: 'Quantidade',
    icon: Hash,
    sub: 'Equipe necessária · votos por membro à escolha · quantidade por bairro',
    cor: '#f0d48a',
    empty: 'Sem dados de bairros',
  },
  {
    id: 'eleitorado',
    label: 'Eleitorado',
    icon: Vote,
    sub: 'Penetração de votos × aptos TRE por bairro',
    cor: '#22d3ee',
    empty: 'Importe votos na aba Eleitores para ver a cobertura',
  },
  {
    id: 'atuacao',
    label: 'Atuação',
    icon: MapPin,
    sub: 'Presença da equipe nos bairros de trabalho',
    cor: '#5b9bff',
    empty: 'Cadastre bairros de atuação na Equipe',
  },
  {
    id: 'moradia',
    label: 'Moradia',
    icon: Home,
    sub: 'Onde a equipe mora (bairro de residência)',
    cor: '#34d399',
    empty: 'Cadastre bairro de moradia na Equipe',
  },
  {
    id: 'materiais',
    label: 'Materiais',
    icon: Package,
    sub: 'Distribuição de materiais nos últimos 7 dias',
    cor: '#d4af5f',
    empty: 'Sem distribuição nesta semana',
  },
]

function ForcaMetricChip({ label, value, color, warn }) {
  return (
    <div
      className="rounded-lg px-2 py-1.5 min-w-[4.2rem] flex-1"
      style={{
        background: warn ? 'rgba(251,191,36,0.12)' : 'var(--bg-raised)',
        border: `1px solid ${warn ? 'rgba(251,191,36,0.35)' : 'var(--border-subtle)'}`,
      }}
    >
      <p className="font-black tnum" style={{ fontSize: 14, color, lineHeight: 1.05 }}>
        {value}
      </p>
      <p className="font-bold mt-0.5 truncate" style={{ fontSize: 8, color: 'var(--text-faint)', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
        {label}
      </p>
    </div>
  )
}

function ForcaRankList({ items, cor, valueFmt, subFmt, maxValue, scrollable = true, showMetricas = false }) {
  const max = maxValue || Math.max(...items.map(i => Number(i.qtd) || 0), 1)
  return (
    <div
      className="space-y-2.5 forca-rank-scroll"
      style={scrollable ? {
        maxHeight: showMetricas ? 560 : 420,
        overflowY: 'auto',
        paddingRight: 6,
        marginRight: -2,
      } : undefined}
    >
      {items.map((item, i) => {
        const val = Number(item.qtd) || 0
        const pct = Math.min(100, (val / max) * 100)
        const semSecao = item.temSecao === false || item.estimado === true
        const semPessoas = !!item.semPessoas
        const faltam = Number(item.pessoasFaltamMeta) || 0
        const temos = Number(item.pessoasTem ?? item.atuacao) || 0
        const metaPessoas = Number(item.pessoasMeta) || 0
        const coberto = showMetricas && metaPessoas > 0 && faltam <= 0 && temos >= metaPessoas
        const nomeCor = semSecao ? '#f87171' : coberto ? '#34d399' : 'var(--text-primary)'
        const barCor = semSecao
          ? '#f87171'
          : coberto
            ? '#34d399'
            : semPessoas
              ? '#fbbf24'
              : cor
        return (
          <div
            key={item.nome || i}
            className="group rounded-xl px-2.5 py-2 -mx-1"
            style={{
              background: semSecao
                ? 'rgba(248,113,113,0.08)'
                : coberto
                  ? 'rgba(52,211,153,0.08)'
                  : semPessoas
                    ? 'rgba(251,191,36,0.06)'
                    : showMetricas
                      ? 'var(--bg-raised)'
                      : 'transparent',
              border: showMetricas
                ? `1px solid ${coberto ? 'rgba(52,211,153,0.28)' : 'var(--border-subtle)'}`
                : '1px solid transparent',
              borderLeft: `3px solid ${semSecao ? '#f87171' : coberto ? '#34d399' : semPessoas ? '#fbbf24' : 'transparent'}`,
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="font-black tnum flex-shrink-0"
                style={{
                  fontSize: 11, width: 18, textAlign: 'right',
                  color: semSecao
                    ? '#f87171'
                    : coberto
                      ? '#34d399'
                      : i === 0 ? 'var(--gold-bright)' : i < 3 ? 'var(--gold)' : 'var(--text-faint)',
                }}>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                    <p className="font-bold truncate" style={{ fontSize: showMetricas ? 13 : 12, color: nomeCor }}>
                      {item.nome}
                    </p>
                    {coberto && (
                      <span className="font-bold px-1.5 py-0.5 rounded"
                        style={{ fontSize: 8, background: 'rgba(52,211,153,0.18)', color: '#34d399' }}>
                        COBERTO
                      </span>
                    )}
                    {semSecao && (
                      <span className="font-bold px-1.5 py-0.5 rounded"
                        style={{ fontSize: 8, background: 'rgba(248,113,113,0.18)', color: '#f87171' }}>
                        SEM SEÇÃO
                      </span>
                    )}
                    {semPessoas && !coberto && (
                      <span className="font-bold px-1.5 py-0.5 rounded"
                        style={{ fontSize: 8, background: 'rgba(251,191,36,0.18)', color: '#fbbf24' }}>
                        SEM PESSOAS
                      </span>
                    )}
                  </div>
                  {!showMetricas && (
                    <p className="font-bold tnum flex-shrink-0" style={{ fontSize: 12, color: barCor }}>
                      {valueFmt(item)}
                    </p>
                  )}
                </div>
                {!showMetricas && subFmt && (
                  <p className="truncate mt-0.5" style={{ fontSize: 9, color: 'var(--text-faint)' }}>
                    {subFmt(item)}
                  </p>
                )}
              </div>
            </div>

            {showMetricas ? (
              <div className="ml-[26px] grid grid-cols-3 sm:grid-cols-7 gap-1.5 mb-2">
                <ForcaMetricChip label="Eleitores" value={fmtN(item.aptos || 0)} color="#f0d48a" />
                <ForcaMetricChip label="Votos" value={fmtN(item.votos || 0)} color="#22d3ee" />
                <ForcaMetricChip
                  label="Previsto"
                  value={fmtN(item.previsaoVotos || ((Number(item.pessoasTem ?? item.atuacao) || 0) * (item.votosPorMembro || 50)))}
                  color="#c4b5fd"
                />
                <ForcaMetricChip label="P/ manter" value={fmtN(item.pessoasManter || 0)} color="#a78bfa" />
                <ForcaMetricChip
                  label="P/ meta"
                  value={fmtN(metaPessoas)}
                  color={coberto ? '#34d399' : '#d4af5f'}
                />
                <ForcaMetricChip label="Temos" value={fmtN(temos)} color="#34d399" />
                <ForcaMetricChip
                  label="Faltam"
                  value={fmtN(faltam)}
                  color={faltam > 0 ? '#fbbf24' : '#34d399'}
                  warn={faltam > 0}
                />
              </div>
            ) : null}

            <div className="ml-[26px] rounded-full overflow-hidden" style={{ height: showMetricas ? 5 : 7, background: 'rgba(255,255,255,0.06)' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${barCor}88, ${barCor})`,
                  transition: 'width 0.55s cubic-bezier(0.16,1,0.3,1)',
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ForcaKpi({ label, value, sub, color }) {
  return (
    <div className="rounded-2xl px-3 py-2.5"
      style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
      <p className="font-bold tnum" style={{ fontSize: 18, color, lineHeight: 1.1 }}>
        {value}
      </p>
      <p className="font-bold mt-1" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{label}</p>
      {sub != null && sub !== '' && (
        <p className="truncate mt-0.5" style={{ fontSize: 9, color: 'var(--text-faint)' }}>{sub}</p>
      )}
    </div>
  )
}

export function TopBairrosChart({
  materiais = [], atuacao = null, moradia = null, eleitorado = null, quantidade = null, data,
  metaVotos = 0,
}) {
  const [modo, setModo] = useState('quantidade')
  const [limite, setLimite] = useState(35)
  const [sortEl, setSortEl] = useState('cobertura') // cobertura | votos | aptos
  const [sortQ, setSortQ] = useState('aptos') // aptos | votos | atuacao | moradia | materiais | pessoasMeta | pessoasFaltamMeta
  const [votosPorMembro, setVotosPorMembro] = useState(() => {
    try {
      const n = Number(localStorage.getItem('forca_votos_por_membro'))
      return VOTOS_POR_MEMBRO_OPCOES.includes(n) ? n : VOTOS_POR_MEMBRO
    } catch {
      return VOTOS_POR_MEMBRO
    }
  })

  const meta = FORCA_MODOS.find(m => m.id === modo) || FORCA_MODOS[0]
  const el = eleitorado || {}
  const qt = quantidade || {}
  const at = atuacao && !Array.isArray(atuacao) ? atuacao : { ranking: Array.isArray(atuacao) ? atuacao : [], bairrosCobertos: 0, bairrosDescobertos: 0, descobertosNomes: [], totalMembros: 0, semBairro: 0 }
  const mo = moradia && !Array.isArray(moradia) ? moradia : { ranking: Array.isArray(moradia) ? moradia : [], bairrosCobertos: 0, bairrosDescobertos: 0, descobertosNomes: [], totalMembros: 0, semBairro: 0 }

  const plano = useMemo(() => {
    const lista = qt.lista || []
    const apoiadoresPorBairro = Object.fromEntries(lista.map(b => [b.nome, b.apoiadores || 0]))
    const votosApoiadoresPorBairro = Object.fromEntries(lista.map(b => [b.nome, b.votosApoiadores || 0]))
    const votosApoiadoresTotal = Number(qt.planejamento?.votosApoiadores)
      || lista.reduce((s, b) => s + (Number(b.votosApoiadores) || 0), 0)
    // Usa pessoasTem já filtrado (sem Comunidade WhatsApp / formulário)
    const pessoasTemTotal = Number(qt.planejamento?.pessoasTem)
      || Number(qt.membrosOperacionais)
      || at.totalMembros
      || 0
    return planejamentoEquipePorBairro(lista, {
      metaVotos: metaVotos || 0,
      votosPorMembro,
      pessoasTemTotal,
      apoiadoresPorBairro,
      votosApoiadoresPorBairro,
      votosApoiadoresTotal,
    })
  }, [qt.lista, qt.planejamento?.votosApoiadores, qt.planejamento?.pessoasTem, qt.membrosOperacionais, metaVotos, at.totalMembros, votosPorMembro])

  const escolherVotosPorMembro = (n) => {
    setVotosPorMembro(n)
    try { localStorage.setItem('forca_votos_por_membro', String(n)) } catch { /* ignore */ }
  }
  const mat = useMemo(() => {
    const raw = materiais.length ? materiais : (data || [])
    const map = new Map()
    for (const r of raw) {
      const nome = bairroBlumenauValido(r.nome)
      if (!nome) continue
      map.set(nome, (map.get(nome) || 0) + (Number(r.qtd) || 0))
    }
    return [...map.entries()]
      .map(([nome, qtd]) => ({ nome, qtd }))
      .sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [materiais, data])

  const rankingEl = useMemo(() => {
    const list = [...(el.porBairro?.length ? el.porBairro : (el.ranking || []))]
    if (sortEl === 'votos') list.sort((a, b) => b.votos - a.votos || b.qtd - a.qtd)
    else if (sortEl === 'aptos') list.sort((a, b) => b.aptos - a.aptos || b.votos - a.votos)
    else list.sort((a, b) => b.qtd - a.qtd || b.votos - a.votos)
    return list
  }, [el.porBairro, el.ranking, sortEl])

  const rankingQ = useMemo(() => {
    const list = [...(plano.lista?.length ? plano.lista : (qt.lista || []))]
    const key = sortQ
    list.sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0) || a.nome.localeCompare(b.nome, 'pt-BR'))
    return list.map(row => ({
      ...row,
      qtd: Number(row[key]) || 0,
    }))
  }, [plano.lista, qt.lista, sortQ])

  const gapsDeficitMeta = useMemo(() => {
    return [...(plano.lista || [])]
      .filter(b => (Number(b.pessoasFaltamMeta) || 0) > 0)
      .sort((a, b) => (b.pessoasFaltamMeta || 0) - (a.pessoasFaltamMeta || 0) || (b.aptos || 0) - (a.aptos || 0))
      .slice(0, 20)
  }, [plano.lista])

  const items = useMemo(() => {
    if (modo === 'quantidade') return rankingQ.slice(0, limite)
    if (modo === 'eleitorado') return rankingEl.slice(0, limite)
    if (modo === 'atuacao') return (at.ranking || []).slice(0, limite)
    if (modo === 'moradia') return (mo.ranking || []).slice(0, limite)
    if (limite >= 35 && (qt.lista || []).length) {
      const map = Object.fromEntries(mat.map(m => [m.nome, m.qtd]))
      return [...qt.lista]
        .map(b => ({ nome: b.nome, qtd: map[b.nome] || 0 }))
        .sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome, 'pt-BR'))
    }
    return mat.slice(0, limite)
  }, [modo, rankingQ, rankingEl, at.ranking, mo.ranking, mat, limite, qt.lista])

  const kpis = useMemo(() => {
    if (modo === 'quantidade') {
      const prev = Number(plano.previsaoVotos) || 0
      const pctPrev = Number(plano.previsaoPctMeta) || 0
      return [
        {
          label: 'Previsão votos',
          value: fmtN(prev),
          sub: (plano.votosApoiadores || 0) > 0
            ? `${fmtN(plano.pessoasTem || 0)} × ${plano.votosPorMembro || 50} + ${fmtN(plano.votosApoiadores)} rede`
            : `${fmtN(plano.pessoasTem || 0)} × ${plano.votosPorMembro || 50} votos`,
          color: '#c4b5fd',
        },
        {
          label: '% da meta',
          value: plano.metaVotos > 0 ? `${Math.round(pctPrev)}%` : '—',
          sub: (plano.previsaoFaltamVotos || 0) > 0
            ? `faltam ${fmtN(plano.previsaoFaltamVotos)} votos`
            : (plano.metaVotos > 0 ? 'meta coberta na premissa' : 'defina a meta'),
          color: pctPrev >= 100 ? '#34d399' : '#f0d48a',
        },
        { label: 'Para a meta', value: fmtN(plano.pessoasMeta || 0), sub: `meta ${fmtN(plano.metaVotos || 0)} · ${plano.votosPorMembro || 50}/pessoa`, color: '#f0d48a' },
        { label: 'Temos na equipe', value: fmtN(plano.pessoasTem || 0), sub: `faltam ${fmtN(plano.pessoasFaltamMeta || 0)} p/ meta`, color: '#34d399' },
      ]
    }
    if (modo === 'eleitorado') {
      return [
        { label: 'Cobertura', value: `${el.coberturaPct ?? 0}%`, sub: `${fmtN(el.totalVotos || 0)} votos`, color: '#22d3ee' },
        { label: 'Com seção', value: `${el.bairrosComSecao ?? 0}/${el.bairrosTotal ?? 35}`, sub: `${fmtN(el.aptosComSecao || 0)} aptos`, color: '#34d399' },
        { label: 'Descobertos', value: `${el.bairrosSemSecao ?? 0}/${el.bairrosTotal ?? 35}`, sub: `${fmtN(el.aptosSemSecao || 0)} aptos`, color: '#fbbf24' },
        { label: 'Seções', value: el.secoesMapeadas ?? 0, sub: el.secoesSemBairro ? `${el.secoesSemBairro} sem bairro` : 'mapeadas', color: '#a78bfa' },
      ]
    }
    if (modo === 'atuacao') {
      const tot = (at.bairrosCobertos || 0) + (at.bairrosDescobertos || 0) || 35
      return [
        { label: 'Cobertos', value: `${at.bairrosCobertos ?? 0}/${tot}`, sub: 'com equipe', color: '#5b9bff' },
        { label: 'Descobertos', value: `${at.bairrosDescobertos ?? 0}/${tot}`, sub: 'sem atuação', color: '#fbbf24' },
        { label: 'Equipe', value: at.totalMembros ?? 0, sub: at.semBairro ? `${at.semBairro} sem bairro` : 'membros', color: '#34d399' },
        { label: 'Marcações', value: at.totalMarcacoes ?? 0, sub: 'membro×bairro', color: '#d4af5f' },
      ]
    }
    if (modo === 'moradia') {
      const tot = (mo.bairrosCobertos || 0) + (mo.bairrosDescobertos || 0) || 35
      return [
        { label: 'Bairros', value: `${mo.bairrosCobertos ?? 0}/${tot}`, sub: 'com moradores', color: '#34d399' },
        { label: 'Vazios', value: `${mo.bairrosDescobertos ?? 0}/${tot}`, sub: 'sem moradia', color: '#fbbf24' },
        { label: 'Equipe', value: mo.totalMembros ?? 0, sub: mo.semBairro ? `${mo.semBairro} sem endereço` : 'membros', color: '#5b9bff' },
        { label: 'Top', value: (mo.ranking?.[0]?.nome || '—').split(' ')[0], sub: mo.ranking?.[0] ? `${mo.ranking[0].qtd} mora` : '', color: '#d4af5f' },
      ]
    }
    const totalMat = mat.reduce((s, d) => s + (Number(d.qtd) || 0), 0)
    return [
      { label: 'Bairros', value: `${mat.length}/35`, sub: 'com entrega', color: '#d4af5f' },
      { label: 'Unidades', value: fmtN(totalMat), sub: 'últimos 7 dias', color: '#22d3ee' },
      { label: 'Líder', value: (mat[0]?.nome || '—').split(' ')[0], sub: mat[0] ? `${fmtN(mat[0].qtd)} un.` : '', color: '#34d399' },
      { label: '2º', value: (mat[1]?.nome || '—').split(' ')[0], sub: mat[1] ? `${fmtN(mat[1].qtd)} un.` : '—', color: '#a78bfa' },
    ]
  }, [modo, el, at, mo, mat, qt, plano])

  const gapsSemSecao = useMemo(() => {
    return (qt.lista || [])
      .filter(b => !b.temSecao)
      .map(b => ({ nome: b.nome, aptos: b.aptos }))
      .sort((a, b) => (b.aptos || 0) - (a.aptos || 0))
  }, [qt.lista])

  /** Bairros sem atuação e sem moradia da equipe */
  const gapsSemPessoas = useMemo(() => {
    return (qt.lista || [])
      .filter(b => !(Number(b.atuacao) > 0) && !(Number(b.moradia) > 0))
      .map(b => ({ nome: b.nome, aptos: b.aptos, temSecao: !!b.temSecao }))
      .sort((a, b) => (b.aptos || 0) - (a.aptos || 0))
  }, [qt.lista])

  const valueFmt = (item) => {
    if (modo === 'quantidade') {
      if (sortQ === 'cobertura') return `${Number(item.cobertura || 0).toLocaleString('pt-BR')}%`
      if (sortQ === 'pessoasManter' || sortQ === 'pessoasMeta' || sortQ === 'pessoasFaltamMeta' || sortQ === 'pessoasTem' || sortQ === 'previsaoVotos') {
        return fmtN(item.qtd)
      }
      return fmtN(item.qtd)
    }
    if (modo === 'eleitorado') {
      if (sortEl === 'votos') return fmtN(item.votos)
      if (sortEl === 'aptos') return fmtN(item.aptos)
      return `${Number(item.qtd || 0).toLocaleString('pt-BR')}%`
    }
    return fmtN(item.qtd)
  }

  const subFmt = (item) => {
    if (modo === 'quantidade') {
      const bits = [
        item.temSecao ? 'com seção' : 'sem seção',
        `${fmtN(item.aptos)} aptos`,
        item.votos ? `${fmtN(item.votos)} votos` : null,
        `manter ${fmtN(item.pessoasManter || 0)}`,
        `meta ${fmtN(item.pessoasMeta || 0)}`,
        `temos ${fmtN(item.pessoasTem ?? item.atuacao ?? 0)}`,
        `prev. ${fmtN(item.previsaoVotos || 0)}`,
        (item.pessoasFaltamMeta > 0) ? `faltam ${fmtN(item.pessoasFaltamMeta)}` : null,
      ].filter(Boolean)
      return bits.join(' · ')
    }
    if (modo === 'eleitorado') {
      return `${fmtN(item.votos)} votos · ${fmtN(item.aptos)} aptos${item.secoes ? ` · ${item.secoes} seções` : ''}`
    }
    if (modo === 'atuacao') return item.qtd ? `${item.qtd} membro${item.qtd !== 1 ? 's' : ''} atuando` : 'Sem atuação'
    if (modo === 'moradia') return item.qtd ? `${item.qtd} mora${item.qtd !== 1 ? 'm' : ''} aqui` : 'Ninguém mora aqui'
    return item.qtd ? `${fmtN(item.qtd)} unidades` : 'Sem distribuição'
  }

  const maxBar = (() => {
    if (modo === 'quantidade') return Math.max(...items.map(i => Number(i.qtd) || 0), 1)
    if (modo === 'eleitorado') {
      if (sortEl === 'votos') return Math.max(...items.map(i => i.votos || 0), 1)
      if (sortEl === 'aptos') return Math.max(...items.map(i => i.aptos || 0), 1)
      return Math.max(...items.map(i => i.qtd || 0), 1)
    }
    return Math.max(...items.map(i => Number(i.qtd) || 0), 1)
  })()

  const barItems = useMemo(() => {
    const byNome = Object.fromEntries((plano.lista || qt.lista || []).map(b => [b.nome, b]))
    const base = modo === 'eleitorado' && (sortEl === 'votos' || sortEl === 'aptos')
      ? items.map(i => ({ ...i, qtd: sortEl === 'votos' ? i.votos : i.aptos }))
      : items

    return base.map(item => {
      const metaB = byNome[item.nome] || item
      const temSecao = metaB.temSecao != null
        ? !!metaB.temSecao
        : item.temSecao != null
          ? !!item.temSecao
          : !item.estimado
      const atuacaoN = Number(metaB.atuacao ?? item.atuacao ?? (modo === 'atuacao' ? item.qtd : 0)) || 0
      const moradiaN = Number(metaB.moradia ?? item.moradia ?? (modo === 'moradia' ? item.qtd : 0)) || 0
      let semPessoas = false
      if (modo === 'atuacao') semPessoas = atuacaoN <= 0 && (Number(item.qtd) || 0) <= 0
      else if (modo === 'moradia') semPessoas = moradiaN <= 0 && (Number(item.qtd) || 0) <= 0
      else if (modo === 'materiais') semPessoas = atuacaoN <= 0 && moradiaN <= 0
      else semPessoas = atuacaoN <= 0 && moradiaN <= 0

      return {
        ...metaB,
        ...item,
        temSecao,
        estimado: !temSecao,
        aptos: Number(metaB.aptos ?? item.aptos) || 0,
        votos: Number(metaB.votos ?? item.votos) || 0,
        atuacao: atuacaoN,
        moradia: moradiaN,
        pessoasManter: Number(metaB.pessoasManter ?? item.pessoasManter) || 0,
        pessoasMeta: Number(metaB.pessoasMeta ?? item.pessoasMeta) || 0,
        pessoasTem: Number(metaB.pessoasTem ?? item.pessoasTem ?? atuacaoN) || 0,
        pessoasFaltamMeta: Number(metaB.pessoasFaltamMeta ?? item.pessoasFaltamMeta) || 0,
        previsaoVotos: Number(metaB.previsaoVotos ?? item.previsaoVotos) || 0,
        votosPorMembro: Number(metaB.votosPorMembro ?? plano.votosPorMembro) || votosPorMembro,
        semPessoas,
      }
    })
  }, [items, modo, sortEl, qt.lista, plano.lista, plano.votosPorMembro, votosPorMembro])

  const IconModo = meta.icon || Layers
  const limiteOpts = [10, 15, 35]

  return (
    <Card className="p-5 anim-fade-up stagger-4" style={{ borderRadius: 'var(--r-lg)' }}>
      <SectionTitle
        icon={MapPin}
        title="Força por bairro"
        sub={meta.sub}
        color="#f0d48a"
        action={
          <div className="flex gap-1 flex-shrink-0">
            {limiteOpts.map(n => (
              <button key={n} type="button" onClick={() => setLimite(n)}
                className="px-2 py-1 rounded-lg font-bold"
                style={{
                  fontSize: 10,
                  background: limite === n ? `${meta.cor}22` : 'var(--bg-raised)',
                  color: limite === n ? meta.cor : 'var(--text-faint)',
                  border: `1px solid ${limite === n ? meta.cor + '55' : 'transparent'}`,
                }}>
                {n === 35 ? 'Todos' : n}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex flex-wrap gap-1.5 mb-4">
        {FORCA_MODOS.map(m => {
          const ativo = m.id === modo
          const Icon = m.icon
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => { setModo(m.id); setLimite(35) }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all"
              style={{
                fontSize: 11,
                background: ativo ? `${m.cor}20` : 'var(--bg-raised)',
                border: `1px solid ${ativo ? m.cor + '66' : 'var(--border-subtle)'}`,
                color: ativo ? m.cor : 'var(--text-tertiary)',
                boxShadow: ativo ? `0 0 0 1px ${m.cor}22` : 'none',
              }}
            >
              <Icon size={12} />
              {m.label}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
        {kpis.map(k => (
          <ForcaKpi key={k.label} label={k.label} value={k.value} sub={k.sub} color={k.color} />
        ))}
      </div>

      {modo === 'quantidade' && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 700 }}>Ordenar por</span>
          {[
            { id: 'aptos', label: 'Aptos' },
            { id: 'votos', label: 'Votos' },
            { id: 'previsaoVotos', label: 'Previsto' },
            { id: 'pessoasManter', label: 'P/ manter' },
            { id: 'pessoasMeta', label: 'P/ meta' },
            { id: 'pessoasFaltamMeta', label: 'Faltam' },
            { id: 'atuacao', label: 'Atuação' },
            { id: 'moradia', label: 'Moradia' },
            { id: 'materiais', label: 'Materiais' },
          ].map(s => (
            <button key={s.id} type="button" onClick={() => setSortQ(s.id)}
              className="px-2.5 py-1 rounded-lg font-bold"
              style={{
                fontSize: 10,
                background: sortQ === s.id ? 'rgba(240,212,138,0.15)' : 'var(--bg-raised)',
                color: sortQ === s.id ? '#f0d48a' : 'var(--text-tertiary)',
                border: `1px solid ${sortQ === s.id ? 'rgba(240,212,138,0.4)' : 'var(--border-subtle)'}`,
              }}>
              {s.label}
            </button>
          ))}
        </div>
      )}

      {modo === 'quantidade' && (
        <div className="rounded-2xl px-3.5 py-3 mb-4"
          style={{
            background: 'rgba(34,211,238,0.06)',
            border: '1px solid rgba(34,211,238,0.22)',
          }}>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <p className="font-bold" style={{ fontSize: 12, color: '#67e8f9' }}>
              Planejamento de equipe · 1 membro =
            </p>
            <div className="flex flex-wrap items-center gap-1">
              {VOTOS_POR_MEMBRO_OPCOES.map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => escolherVotosPorMembro(n)}
                  className="px-2.5 py-1 rounded-lg font-bold tnum"
                  style={{
                    fontSize: 11,
                    background: votosPorMembro === n ? 'rgba(34,211,238,0.22)' : 'var(--bg-raised)',
                    color: votosPorMembro === n ? '#67e8f9' : 'var(--text-tertiary)',
                    border: `1px solid ${votosPorMembro === n ? 'rgba(34,211,238,0.55)' : 'var(--border-subtle)'}`,
                  }}
                >
                  {n}
                </button>
              ))}
              <span style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 700 }}>votos</span>
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
            <strong style={{ color: '#c4b5fd' }}>Previsão:</strong>{' '}
            {fmtN(plano.pessoasTem || 0)} membros operacionais × {plano.votosPorMembro || 50}
            {(plano.votosApoiadores || 0) > 0 && (
              <> + {fmtN(plano.votosApoiadores)} votos da rede (até {plano.votosPorApoiador || 5}/pessoa)</>
            )}
            {' '}= <strong style={{ color: '#c4b5fd' }}>{fmtN(plano.previsaoVotos || 0)} votos</strong>
            {plano.metaVotos > 0 && (
              <>
                {' '}({Math.round(plano.previsaoPctMeta || 0)}% da meta
                {(plano.previsaoFaltamVotos || 0) > 0
                  ? <> · faltam <strong style={{ color: '#fbbf24' }}>{fmtN(plano.previsaoFaltamVotos)}</strong></>
                  : ' · meta coberta'}
                )
              </>
            )}
            .
            {' '}Para <strong style={{ color: 'var(--text-secondary)' }}>manter</strong> os{' '}
            {fmtN(plano.totalVotos || 0)} votos atuais: <strong style={{ color: '#22d3ee' }}>{fmtN(plano.pessoasManter || 0)} pessoas</strong>
            {' · '}
            para a <strong style={{ color: 'var(--text-secondary)' }}>meta</strong> de{' '}
            {fmtN(plano.metaVotos || 0)}: <strong style={{ color: '#f0d48a' }}>{fmtN(plano.pessoasMeta || 0)} pessoas</strong>
            . Comunidade WhatsApp / formulário contam só na rede (até 5), não no ×{plano.votosPorMembro || 50}.
          </p>
          {(plano.pessoasTem || 0) > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {[
                { n: plano.pessoasTem, label: 'hoje', votosFixos: plano.previsaoVotos },
                { n: Math.max(plano.pessoasTem || 0, plano.pessoasManter || 0), label: 'p/ manter' },
                { n: Math.max(plano.pessoasTem || 0, plano.pessoasMeta || 0), label: 'p/ meta' },
                ...(plano.pessoasMeta > 0 ? [
                  { n: Math.ceil((plano.pessoasMeta || 0) * 1.25), label: '+25%' },
                ] : []),
              ].filter((s, i, arr) => arr.findIndex(x => x.n === s.n && x.label === s.label) === i)
                .map(s => {
                  const votos = s.votosFixos != null
                    ? Number(s.votosFixos) || 0
                    : (Number(s.n) || 0) * (plano.votosPorMembro || 50) + (Number(plano.votosApoiadores) || 0)
                  const pct = plano.metaVotos > 0 ? Math.round((votos / plano.metaVotos) * 100) : null
                  return (
                    <div key={`${s.label}-${s.n}`} className="rounded-lg px-2.5 py-1.5"
                      style={{ background: 'rgba(196,181,253,0.1)', border: '1px solid rgba(196,181,253,0.25)' }}>
                      <p className="font-black tnum" style={{ fontSize: 13, color: '#c4b5fd', lineHeight: 1.1 }}>
                        {fmtN(votos)}
                      </p>
                      <p style={{ fontSize: 9, color: 'var(--text-faint)', fontWeight: 700 }}>
                        {fmtN(s.n)} memb. · {s.label}{pct != null ? ` · ${pct}%` : ''}
                      </p>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      )}

      {modo === 'eleitorado' && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 700 }}>Ordenar</span>
          {[
            { id: 'cobertura', label: 'Cobertura %' },
            { id: 'votos', label: 'Votos' },
            { id: 'aptos', label: 'Aptos' },
          ].map(s => (
            <button key={s.id} type="button" onClick={() => setSortEl(s.id)}
              className="px-2.5 py-1 rounded-lg font-bold"
              style={{
                fontSize: 10,
                background: sortEl === s.id ? 'rgba(34,211,238,0.15)' : 'var(--bg-raised)',
                color: sortEl === s.id ? '#22d3ee' : 'var(--text-tertiary)',
                border: `1px solid ${sortEl === s.id ? 'rgba(34,211,238,0.4)' : 'var(--border-subtle)'}`,
              }}>
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 min-w-0">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <IconModo size={13} style={{ color: meta.cor }} />
            <p className="font-bold" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {modo === 'quantidade'
                ? `Por bairro · ${items.length} de ${qt.total || 35}`
                : `Ranking · ${items.length} bairro${items.length !== 1 ? 's' : ''}`}
              {limite >= 35 ? ' · role para ver todos' : ''}
            </p>
            <div className="flex items-center gap-2 ml-auto">
              <span className="inline-flex items-center gap-1 font-bold"
                style={{ fontSize: 9, color: '#34d399' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: '#34d399' }} />
                Coberto
              </span>
              <span className="inline-flex items-center gap-1 font-bold"
                style={{ fontSize: 9, color: '#f87171' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: '#f87171' }} />
                Sem seção
              </span>
              <span className="inline-flex items-center gap-1 font-bold"
                style={{ fontSize: 9, color: '#fbbf24' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: '#fbbf24' }} />
                Sem pessoas
              </span>
            </div>
          </div>
          {!items.length ? (
            <p className="py-10 text-center" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {meta.empty}
            </p>
          ) : (
            <ForcaRankList
              items={barItems}
              cor={meta.cor}
              valueFmt={valueFmt}
              subFmt={subFmt}
              maxValue={maxBar}
              showMetricas={modo === 'quantidade'}
            />
          )}
        </div>

        <div className="lg:col-span-5 min-w-0 space-y-3">
          {/* Déficit p/ meta */}
          {modo === 'quantidade' && (
            <div className="rounded-2xl p-3.5 flex flex-col"
              style={{
                background: 'rgba(34,211,238,0.06)',
                border: '1px solid rgba(34,211,238,0.22)',
              }}>
              <div className="flex items-center gap-2 mb-2">
                <Target size={14} style={{ color: '#22d3ee', flexShrink: 0 }} />
                <div className="min-w-0">
                  <p className="font-bold" style={{ fontSize: 12, color: '#22d3ee' }}>Faltam para a meta</p>
                  <p style={{ fontSize: 9, color: 'var(--text-faint)' }}>
                    {gapsDeficitMeta.length} bairros · pessoas ainda necessárias (meta ÷ {plano.votosPorMembro || 50} − atuação)
                  </p>
                </div>
              </div>
              {gapsDeficitMeta.length === 0 ? (
                <p className="flex items-center gap-1.5" style={{ fontSize: 11, color: '#34d399' }}>
                  <CheckCircle2 size={13} /> Nenhum déficit na premissa atual
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5 overflow-auto" style={{ maxHeight: 200 }}>
                  {gapsDeficitMeta.map(g => (
                    <span key={g.nome}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-semibold"
                      style={{
                        fontSize: 10,
                        background: 'rgba(34,211,238,0.12)',
                        border: '1px solid rgba(34,211,238,0.35)',
                        color: '#67e8f9',
                      }}>
                      {g.nome}
                      <span className="tnum" style={{ opacity: 0.95 }}>+{fmtN(g.pessoasFaltamMeta)}</span>
                      <span style={{ fontSize: 8, opacity: 0.7 }}>
                        ({fmtN(g.pessoasTem)}/{fmtN(g.pessoasMeta)})
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sem seção */}
          {modo !== 'materiais' && (
            <div className="rounded-2xl p-3.5 flex flex-col"
              style={{
                background: 'rgba(248,113,113,0.06)',
                border: '1px solid rgba(248,113,113,0.28)',
              }}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle size={14} style={{ color: '#f87171', flexShrink: 0 }} />
                  <div className="min-w-0">
                    <p className="font-bold" style={{ fontSize: 12, color: '#f87171' }}>Sem seção eleitoral</p>
                    <p style={{ fontSize: 9, color: 'var(--text-faint)' }}>
                      {gapsSemSecao.length} bairros · têm eleitores, sem colégio próprio
                    </p>
                  </div>
                </div>
              </div>
              {gapsSemSecao.length === 0 ? (
                <p className="flex items-center gap-1.5" style={{ fontSize: 11, color: '#34d399' }}>
                  <CheckCircle2 size={13} /> Todos com seção
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5 overflow-auto" style={{ maxHeight: 160 }}>
                  {gapsSemSecao.map(g => (
                    <span key={g.nome}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-semibold"
                      style={{
                        fontSize: 10,
                        background: 'rgba(248,113,113,0.12)',
                        border: '1px solid rgba(248,113,113,0.35)',
                        color: '#f87171',
                      }}>
                      {g.nome}
                      {g.aptos != null && (
                        <span className="tnum" style={{ opacity: 0.85 }}>{fmtN(g.aptos)}</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-2" style={{ fontSize: 9, color: 'var(--text-faint)', lineHeight: 1.4 }}>
                Aptos estimados (Censo × razão eleitor). Não entram no mapa de seções TRE.
              </p>
            </div>
          )}

          {/* Sem pessoas */}
          <div className="rounded-2xl p-3.5 flex flex-col"
            style={{
              background: 'rgba(251,191,36,0.06)',
              border: '1px solid rgba(251,191,36,0.28)',
            }}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <Users size={14} style={{ color: '#fbbf24', flexShrink: 0 }} />
                <div className="min-w-0">
                  <p className="font-bold" style={{ fontSize: 12, color: '#fbbf24' }}>Sem pessoas</p>
                  <p style={{ fontSize: 9, color: 'var(--text-faint)' }}>
                    {gapsSemPessoas.length} bairros · sem atuação e sem moradia da equipe
                  </p>
                </div>
              </div>
            </div>
            {gapsSemPessoas.length === 0 ? (
              <p className="flex items-center gap-1.5" style={{ fontSize: 11, color: '#34d399' }}>
                <CheckCircle2 size={13} /> Todos com alguém da equipe
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 overflow-auto" style={{ maxHeight: 200 }}>
                {gapsSemPessoas.map(g => (
                  <span key={g.nome}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-semibold"
                    style={{
                      fontSize: 10,
                      background: 'rgba(251,191,36,0.12)',
                      border: '1px solid rgba(251,191,36,0.35)',
                      color: '#fbbf24',
                    }}>
                    {g.nome}
                    {g.aptos != null && (
                      <span className="tnum" style={{ opacity: 0.85 }}>{fmtN(g.aptos)}</span>
                    )}
                    {!g.temSecao && (
                      <span style={{ fontSize: 8, color: '#f87171', fontWeight: 800 }}>S/SEÇÃO</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>

          {modo === 'materiais' && (
            <div className="rounded-2xl p-3.5"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Package size={14} style={{ color: '#d4af5f' }} />
                <p className="font-bold" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Resumo da semana</p>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                {mat.length
                  ? `${mat.length} de 35 bairros receberam material.`
                  : 'Registre distribuições em Materiais para acompanhar a força de campo por bairro.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

/* ─── Module launchpad ─── */
export function ModuleGrid({ modules }) {
  return (
    <div className="anim-fade-up stagger-5">
      <p className="eyebrow mb-3 px-0.5">Lançar módulo</p>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2.5">
        {modules.map(m => {
          const Icon = m.icon
          return (
            <button
              key={m.id}
              type="button"
              onClick={m.onClick}
              className="text-left p-3.5 rounded-2xl transition-all"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = m.color + '55' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
            >
              <div className="flex items-center justify-center rounded-lg mb-2.5"
                style={{ width: 30, height: 30, background: m.color + '18' }}>
                <Icon size={14} style={{ color: m.color }} />
              </div>
              <p className="font-bold truncate" style={{ fontSize: 11, color: 'var(--text-primary)' }}>{m.label}</p>
              <p className="font-bold tnum mt-0.5" style={{ fontSize: 16, color: m.color, lineHeight: 1.1 }}>
                {typeof m.value === 'number' ? <AnimatedNumber value={m.value} /> : m.value}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
