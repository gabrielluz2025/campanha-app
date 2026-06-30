import { useState, useEffect, useMemo } from 'react'
import {
  FileText, Download, Printer, TrendingUp, Users, MapPin,
  CalendarDays, Package, ClipboardList, Heart, CheckCircle,
  AlertTriangle, BarChart3, ChevronDown, ChevronUp,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'

const CORES = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#06b6d4', '#84cc16']

export default function Relatorio() {
  const [semana, setSemana] = useState(() => {
    const d = new Date()
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(d.setDate(diff)).toISOString().split('T')[0]
  })

  // Gather data from all modules
  const dados = useMemo(() => {
    const weekStart = new Date(semana)
    const weekEnd = new Date(semana)
    weekEnd.setDate(weekEnd.getDate() + 6)
    weekEnd.setHours(23, 59, 59)

    const inWeek = (dateStr) => {
      const d = new Date(dateStr)
      return d >= weekStart && d <= weekEnd
    }

    // Agenda
    const eventos = JSON.parse(localStorage.getItem('agenda_eventos') || '[]')
    const eventosSemana = eventos.filter(e => {
      const d = new Date(e.data)
      return d >= weekStart && d <= weekEnd
    })

    // Equipe
    const tarefas = JSON.parse(localStorage.getItem('equipe_tarefas') || '[]')
    const tarefasConcluidas = tarefas.filter(t => t.status === 'concluida').length
    const tarefasPendentes = tarefas.filter(t => t.status === 'pendente').length
    const tarefasAndamento = tarefas.filter(t => t.status === 'em_andamento').length
    const membros = JSON.parse(localStorage.getItem('equipe_membros') || '[]')

    // Igrejas
    const visitas = JSON.parse(localStorage.getItem('igrejas_visitas') || '{}')
    const visitadas = Object.values(visitas).filter(Boolean).length
    const totalIgrejas = 88

    // Materiais
    const materiaisItens = JSON.parse(localStorage.getItem('materiais_estoque') || '[]')
    const distribuicoes = JSON.parse(localStorage.getItem('materiais_distribuicao') || '[]')
    const distSemana = distribuicoes.filter(d => inWeek(d.data))
    const totalDistSemana = distSemana.reduce((s, d) => s + d.quantidade, 0)

    // Pesquisas
    const enquetes = JSON.parse(localStorage.getItem('pesquisas_enquetes') || '[]')
    const respostas = JSON.parse(localStorage.getItem('pesquisas_respostas') || '{}')
    const totalRespostas = Object.values(respostas).reduce((s, arr) => s + arr.length, 0)
    const respostasSemana = Object.values(respostas).flat().filter(r => inWeek(r.data)).length

    // Apoiadores
    const apoiadores = JSON.parse(localStorage.getItem('apoiadores_lista') || '[]')
    const apoiadoresSemana = apoiadores.filter(a => inWeek(a.criadoEm)).length
    const interacoes = JSON.parse(localStorage.getItem('apoiadores_interacoes') || '{}')
    const totalInteracoes = Object.values(interacoes).flat().length
    const interacoesSemana = Object.values(interacoes).flat().filter(i => inWeek(i.data)).length

    // Eleitores
    const metaGlobal = parseInt(localStorage.getItem('meta_global_votos') || '0')
    const dadosEleitores = JSON.parse(localStorage.getItem('eleitores_data') || '{}')
    let totalVotos = 0
    if (dadosEleitores.zonas) {
      dadosEleitores.zonas.forEach(z => {
        z.locais.forEach(l => { l.secoes.forEach(s => { totalVotos += s.votos }) })
      })
    }

    // Distribuição por bairro
    const distPorBairro = {}
    distSemana.forEach(d => {
      distPorBairro[d.bairro] = (distPorBairro[d.bairro] || 0) + d.quantidade
    })
    const distBairroData = Object.entries(distPorBairro)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }))

    // Apoiadores por nível
    const porNivel = { simpatizante: 0, apoiador: 0, cabo_eleitoral: 0, lider: 0 }
    apoiadores.forEach(a => { if (porNivel[a.nivel] !== undefined) porNivel[a.nivel]++ })
    const nivelData = [
      { name: 'Simpatizantes', value: porNivel.simpatizante },
      { name: 'Apoiadores', value: porNivel.apoiador },
      { name: 'Cabos Eleitorais', value: porNivel.cabo_eleitoral },
      { name: 'Líderes', value: porNivel.lider },
    ]

    // Tarefas status
    const tarefasData = [
      { name: 'Concluídas', value: tarefasConcluidas },
      { name: 'Em Andamento', value: tarefasAndamento },
      { name: 'Pendentes', value: tarefasPendentes },
    ]

    return {
      eventosSemana: eventosSemana.length,
      totalEventos: eventos.length,
      tarefasConcluidas, tarefasPendentes, tarefasAndamento, totalTarefas: tarefas.length,
      membros: membros.length,
      visitadas, totalIgrejas,
      materiaisItens: materiaisItens.length,
      totalDistSemana,
      totalDist: distribuicoes.reduce((s, d) => s + d.quantidade, 0),
      enquetesAtivas: enquetes.filter(e => e.status === 'ativa').length,
      totalRespostas, respostasSemana,
      totalApoiadores: apoiadores.length, apoiadoresSemana,
      totalInteracoes, interacoesSemana,
      metaGlobal, totalVotos,
      distBairroData, nivelData, tarefasData,
      weekStart, weekEnd,
    }
  }, [semana])

  function formatDate(d) { return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) }

  function imprimirRelatorio() { window.print() }

  function exportarJSON() {
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'relatorio-semanal-' + semana + '.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const pctMeta = dados.metaGlobal > 0 ? Math.min(100, Math.round(dados.totalVotos / dados.metaGlobal * 100)) : 0
  const pctIgrejas = Math.round(dados.visitadas / dados.totalIgrejas * 100)

  return (
    <div className="flex-1 overflow-auto" >
      {/* Hero */}
      <div className="px-4 md:px-6 pt-7 pb-16"
        style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e3a8a 60%,#1d4ed8 100%)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 mb-7">
            <div className="flex items-center gap-4">
              <div className="w-13 h-13 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.18)', width: 52, height: 52 }}>
                <FileText size={26} className="text-white" />
              </div>
              <div>
                <h1 className="font-black text-white" style={{ fontSize: 24 }}>Relatório Semanal</h1>
                <p className="text-blue-200 mt-0.5" style={{ fontSize: 12 }}>
                  Visão consolidada de todas as atividades da campanha
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="date" value={semana} onChange={e => setSemana(e.target.value)}
                className="px-4 py-2.5 rounded-2xl text-sm font-bold bg-transparent text-white"
                style={{ border: '1px solid rgba(255,255,255,0.3)', colorScheme: 'dark' }} />
              <button onClick={exportarJSON}
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

          <div className="px-4 py-3 rounded-2xl mb-5"
            style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.14)' }}>
            <p className="text-blue-200 font-bold" style={{ fontSize: 12 }}>
              Período: {formatDate(dados.weekStart)} — {formatDate(dados.weekEnd)}
            </p>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {[
              { label: 'Eventos Semana', valor: dados.eventosSemana, icon: CalendarDays, cor: '#3b82f6' },
              { label: 'Membros Equipe', valor: dados.membros, icon: Users, cor: '#10b981' },
              { label: 'Igrejas Visitadas', valor: dados.visitadas + '/' + dados.totalIgrejas, icon: MapPin, cor: '#f59e0b' },
              { label: 'Tarefas OK', valor: dados.tarefasConcluidas + '/' + dados.totalTarefas, icon: CheckCircle, cor: '#06b6d4' },
              { label: 'Material Dist.', valor: dados.totalDistSemana, icon: Package, cor: '#ec4899' },
              { label: 'Respostas Semana', valor: dados.respostasSemana, icon: ClipboardList, cor: '#06b6d4' },
              { label: 'Novos Apoiadores', valor: dados.apoiadoresSemana, icon: Heart, cor: '#f97316' },
              { label: 'Interações', valor: dados.interacoesSemana, icon: BarChart3, cor: '#84cc16' },
            ].map(kpi => {
              const Icon = kpi.icon
              return (
                <div key={kpi.label} className="rounded-2xl px-3 py-3"
                  style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.14)' }}>
                  <Icon size={14} className="text-blue-300 mb-1" />
                  <p className="font-black text-white" style={{ fontSize: 18 }}>{kpi.valor}</p>
                  <p className="text-blue-300" style={{ fontSize: 9 }}>{kpi.label}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 pb-10 -mt-10 space-y-5">
        {/* Progress bars */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Meta de Votos */}
          <div className="surface rounded-3xl p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
            <h3 className="font-bold txt-1 flex items-center gap-2 mb-4" style={{ fontSize: 14 }}>
              <TrendingUp size={16} className="text-blue-500" /> Progresso da Meta de Votos
            </h3>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-3xl font-black txt-1">{pctMeta}%</span>
              <span className="text-sm txt-3">
                {dados.totalVotos.toLocaleString()} / {dados.metaGlobal.toLocaleString()} votos
              </span>
            </div>
            <div className="h-4 srf-soft rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{
                  width: pctMeta + '%',
                  background: pctMeta >= 80 ? 'linear-gradient(90deg,#10b981,#059669)' : pctMeta >= 50 ? 'linear-gradient(90deg,#f59e0b,#d97706)' : 'linear-gradient(90deg,#ef4444,#dc2626)',
                }} />
            </div>
            {pctMeta < 80 && (
              <div className="flex items-center gap-2 mt-3 text-xs font-semibold" style={{ color: '#fbbf24' }}>
                <AlertTriangle size={12} /> Meta abaixo de 80% — intensificar campanha
              </div>
            )}
          </div>

          {/* Cobertura Igrejas */}
          <div className="surface rounded-3xl p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
            <h3 className="font-bold txt-1 flex items-center gap-2 mb-4" style={{ fontSize: 14 }}>
              <MapPin size={16} className="text-amber-500" /> Cobertura de Igrejas
            </h3>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-3xl font-black txt-1">{pctIgrejas}%</span>
              <span className="text-sm txt-3">
                {dados.visitadas} de {dados.totalIgrejas} igrejas visitadas
              </span>
            </div>
            <div className="h-4 srf-soft rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{
                  width: pctIgrejas + '%',
                  background: 'linear-gradient(90deg,#f59e0b,#f97316)',
                }} />
            </div>
            <p className="text-xs txt-3 mt-3">
              Restam {dados.totalIgrejas - dados.visitadas} igrejas para visitar
            </p>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Tarefas */}
          <div className="surface rounded-3xl p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
            <h3 className="font-bold txt-1 mb-4" style={{ fontSize: 14 }}>Status das Tarefas</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={dados.tarefasData} cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                  paddingAngle={3} dataKey="value">
                  <Cell fill="#10b981" />
                  <Cell fill="#3b82f6" />
                  <Cell fill="#f59e0b" />
                </Pie>
                <Tooltip formatter={(v) => [v + ' tarefas']}
                  contentStyle={{ borderRadius: 12, background: 'rgba(13,17,28,0.97)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', fontSize: 11, color: '#fff' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-2">
              {[{ l: 'Concluídas', c: '#10b981' }, { l: 'Andamento', c: '#3b82f6' }, { l: 'Pendentes', c: '#f59e0b' }].map(x => (
                <div key={x.l} className="flex items-center gap-1.5 text-xs txt-3">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: x.c }} /> {x.l}
                </div>
              ))}
            </div>
          </div>

          {/* Apoiadores por nível */}
          <div className="surface rounded-3xl p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
            <h3 className="font-bold txt-1 mb-4" style={{ fontSize: 14 }}>Rede de Apoiadores</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dados.nivelData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'rgba(203,213,235,0.55)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'rgba(203,213,235,0.55)' }} />
                <Tooltip contentStyle={{ borderRadius: 12, background: 'rgba(13,17,28,0.97)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', fontSize: 11, color: '#fff' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {dados.nivelData.map((_, i) => <Cell key={i} fill={CORES[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-center text-xs txt-3 mt-2">Total: {dados.totalApoiadores} apoiadores</p>
          </div>

          {/* Distribuição por bairro */}
          <div className="surface rounded-3xl p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
            <h3 className="font-bold txt-1 mb-4" style={{ fontSize: 14 }}>Material por Bairro (semana)</h3>
            {dados.distBairroData.length === 0 ? (
              <div className="text-center py-12 txt-3 text-sm">Nenhuma distribuição nesta semana</div>
            ) : (
              <div className="space-y-2.5">
                {dados.distBairroData.map((d, i) => {
                  const max = dados.distBairroData[0]?.value || 1
                  return (
                    <div key={d.name} className="flex items-center gap-2">
                      <span className="text-xs font-semibold txt-3 w-24 truncate">{d.name}</span>
                      <div className="flex-1 h-5 srf-soft rounded-full overflow-hidden">
                        <div className="h-full rounded-full"
                          style={{ width: (d.value / max * 100) + '%', backgroundColor: CORES[i % CORES.length] }} />
                      </div>
                      <span className="text-xs font-bold txt-2 w-10 text-right">{d.value}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="surface rounded-3xl p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
            <h3 className="font-bold txt-1 mb-4 flex items-center gap-2" style={{ fontSize: 14 }}>
              <CheckCircle size={16} className="text-green-500" /> Destaques da Semana
            </h3>
            <div className="space-y-3">
              {[
                { texto: dados.eventosSemana + ' eventos realizados', ok: dados.eventosSemana > 0 },
                { texto: dados.apoiadoresSemana + ' novos apoiadores cadastrados', ok: dados.apoiadoresSemana > 0 },
                { texto: dados.respostasSemana + ' respostas de pesquisa coletadas', ok: dados.respostasSemana > 0 },
                { texto: dados.totalDistSemana + ' materiais distribuídos', ok: dados.totalDistSemana > 0 },
                { texto: dados.interacoesSemana + ' interações com apoiadores', ok: dados.interacoesSemana > 0 },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  {item.ok ? <CheckCircle size={14} className="text-green-500 flex-shrink-0" /> : <AlertTriangle size={14} className="txt-4 flex-shrink-0" />}
                  <span className={'text-sm ' + (item.ok ? 'txt-2' : 'txt-3')}>{item.texto}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="surface rounded-3xl p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
            <h3 className="font-bold txt-1 mb-4 flex items-center gap-2" style={{ fontSize: 14 }}>
              <AlertTriangle size={16} className="text-amber-500" /> Pontos de Atenção
            </h3>
            <div className="space-y-3">
              {(() => {
                const alertas = []
                if (pctMeta < 50) alertas.push({ msg: 'Meta de votos abaixo de 50% — ação urgente necessária', tipo: 'critico' })
                else if (pctMeta < 80) alertas.push({ msg: 'Meta de votos abaixo de 80% — intensificar campanha', tipo: 'alerta' })
                if (pctIgrejas < 50) alertas.push({ msg: 'Menos de 50% das igrejas visitadas', tipo: 'alerta' })
                if (dados.tarefasPendentes > 5) alertas.push({ msg: dados.tarefasPendentes + ' tarefas pendentes acumuladas', tipo: 'alerta' })
                if (dados.eventosSemana === 0) alertas.push({ msg: 'Nenhum evento na semana — planejar atividades', tipo: 'alerta' })
                if (dados.apoiadoresSemana === 0) alertas.push({ msg: 'Nenhum apoiador novo — expandir rede', tipo: 'aviso' })
                if (alertas.length === 0) alertas.push({ msg: 'Tudo em dia! Continue o bom trabalho.', tipo: 'ok' })
                const alertStyle = (tipo) => ({
                  critico: { background:'rgba(239,68,68,0.10)', border:'1px solid rgba(239,68,68,0.22)' },
                  alerta:  { background:'rgba(245,158,11,0.10)', border:'1px solid rgba(245,158,11,0.22)' },
                  aviso:   { background:'rgba(59,130,246,0.10)', border:'1px solid rgba(59,130,246,0.22)' },
                  ok:      { background:'rgba(16,185,129,0.10)', border:'1px solid rgba(16,185,129,0.22)' },
                })[tipo]
                const alertIcon = { critico:'#f87171', alerta:'#fbbf24', aviso:'#60a5fa', ok:'#34d399' }
                return alertas.map((a, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl" style={alertStyle(a.tipo)}>
                    {a.tipo === 'ok'
                      ? <CheckCircle size={14} style={{ color: alertIcon.ok, flexShrink: 0 }} />
                      : <AlertTriangle size={14} style={{ color: alertIcon[a.tipo], flexShrink: 0 }} />}
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{a.msg}</span>
                  </div>
                ))
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
