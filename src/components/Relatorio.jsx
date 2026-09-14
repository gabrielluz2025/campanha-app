import { useEffect, useMemo, useState } from 'react'
import {
  FileText, Download, Printer, Copy, Check, ChevronRight,
  BarChart3, Users, UserCheck, Church, CalendarDays, Package,
  Heart, Building2, Wallet, Route, ClipboardList, Briefcase,
  TrendingUp, AlertTriangle, Filter, X,
} from 'lucide-react'
import { PageHeader, ModuleWrap, Button, Pill } from './ui'
import { copiarTexto } from '../utils/equipeContratoReport'
import { CARGOS } from '../utils/equipeSync'
import {
  CATEGORIAS_GASTO, cargosComDados, categoriasComDados,
} from '../utils/cargosGastosReport'
import {
  CATALOGO, coletarSnapshot, montarRelatorio,
  abrirJanelaImpressao, baixarJson, baixarTexto, inicioSemanaIso,
} from '../utils/relatoriosHub'
import { baixarRelatorioXlsx, baixarTodosRelatoriosXlsx } from '../utils/relatoriosXlsx'
import { useCanViewFinance } from '../context/AccessContext'
import { RELATORIOS_FINANCEIROS } from '../utils/acessoAbas'

const ICONES = {
  semanal: TrendingUp,
  eleitores: BarChart3,
  equipe: Users,
  indicacoes: UserCheck,
  contratos: Briefcase,
  igrejas: Church,
  agenda: CalendarDays,
  materiais: Package,
  apoiadores: Heart,
  empresas: Building2,
  previsao: Wallet,
  'cargos-gastos': Filter,
  rotas: Route,
  pesquisas: ClipboardList,
}

const FILTROS_VAZIOS = {
  cargos: [],
  categorias: [],
  minValor: '',
  maxValor: '',
  soComValor: false,
  escopo: 'todos',
}

const FILTROS_IND_VAZIOS = {
  indicadorId: '',
  soPendencias: false,
}

function semanaIsoHoje() {
  return inicioSemanaIso().toISOString().slice(0, 10)
}

function toggleInList(list, item) {
  return list.includes(item) ? list.filter(x => x !== item) : [...list, item]
}

export default function Relatorio() {
  const canViewFinance = useCanViewFinance()
  const [semana, setSemana] = useState(semanaIsoHoje)
  const [ativo, setAtivo] = useState('semanal')
  const [msg, setMsg] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [filtrosCG, setFiltrosCG] = useState(FILTROS_VAZIOS)
  const [filtrosInd, setFiltrosInd] = useState(FILTROS_IND_VAZIOS)

  const catalogoVisivel = useMemo(
    () => canViewFinance
      ? CATALOGO
      : CATALOGO.filter(c => !RELATORIOS_FINANCEIROS.includes(c.id)),
    [canViewFinance],
  )

  useEffect(() => {
    if (!catalogoVisivel.some(c => c.id === ativo)) {
      setAtivo(catalogoVisivel[0]?.id || 'semanal')
    }
  }, [catalogoVisivel, ativo])

  const snap = useMemo(() => coletarSnapshot({ semanaInicioIso: semana }), [semana])
  const filtrosAtivos = ativo === 'cargos-gastos'
    ? filtrosCG
    : ativo === 'indicacoes'
      ? filtrosInd
      : undefined
  const rel = useMemo(
    () => montarRelatorio(ativo, snap, filtrosAtivos),
    [ativo, snap, filtrosCG, filtrosInd],
  )
  const meta = catalogoVisivel.find(c => c.id === ativo) || catalogoVisivel[0] || CATALOGO[0]

  const indicadoresOpts = useMemo(
    () => (snap.indicadores || []).slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [snap.indicadores],
  )

  const cargosOpts = useMemo(() => {
    const com = new Set(cargosComDados())
    return CARGOS.filter(c => com.has(c) || filtrosCG.cargos.includes(c))
  }, [filtrosCG.cargos, snap])

  const catsOpts = useMemo(() => {
    const com = new Set(categoriasComDados())
    return CATEGORIAS_GASTO.filter(c => com.has(c) || filtrosCG.categorias.includes(c))
  }, [filtrosCG.categorias, snap])

  const grupos = useMemo(() => {
    const map = new Map()
    catalogoVisivel.forEach(c => {
      if (!map.has(c.grupo)) map.set(c.grupo, [])
      map.get(c.grupo).push(c)
    })
    return [...map.entries()]
  }, [catalogoVisivel])

  async function flash(t) {
    setMsg(t)
    setTimeout(() => setMsg(''), 2500)
  }

  async function copiar() {
    const ok = await copiarTexto(rel.texto || '')
    setCopiado(ok)
    await flash(ok ? 'Texto copiado!' : 'Falha ao copiar')
    if (ok) setTimeout(() => setCopiado(false), 2000)
  }

  function imprimir() {
    const res = abrirJanelaImpressao(rel.html, rel.titulo)
    if (!res.ok) flash('Permita pop-ups para gerar o PDF')
  }

  function exportarJson() {
    baixarJson({
      relatorio: ativo,
      geradoEm: new Date().toISOString(),
      periodo: {
        inicio: snap.weekStart.toISOString(),
        fim: snap.weekEnd.toISOString(),
      },
      filtros: ativo === 'cargos-gastos'
        ? filtrosCG
        : ativo === 'indicacoes'
          ? filtrosInd
          : undefined,
      dados: rel.json,
    }, `relatorio-${ativo}-${semana}.json`)
    flash('JSON baixado')
  }

  function exportarTxt() {
    baixarTexto(rel.texto || '', `relatorio-${ativo}-${semana}.txt`)
    flash('TXT baixado')
  }

  async function exportarXlsx() {
    try {
      await baixarRelatorioXlsx(
        ativo,
        snap,
        filtrosAtivos || {},
        `relatorio-${ativo}-${semana}.xlsx`,
      )
      flash('XLSX baixado · só o relatório selecionado')
    } catch (err) {
      console.error(err)
      flash('Falha ao gerar XLSX')
    }
  }

  async function exportarTodosXlsx() {
    try {
      const r = await baixarTodosRelatoriosXlsx(snap, {
        filtrosCG,
        filtrosInd,
        semana,
      })
      flash(`XLSX completo · ${r.qtd} abas`)
    } catch (err) {
      console.error(err)
      flash('Falha ao gerar XLSX completo')
    }
  }

  const periodoLabel = `${snap.weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} — ${snap.weekEnd.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`
  const filtrosCount = (filtrosCG.cargos.length + filtrosCG.categorias.length
    + (filtrosCG.minValor !== '' ? 1 : 0)
    + (filtrosCG.maxValor !== '' ? 1 : 0)
    + (filtrosCG.soComValor ? 1 : 0)
    + (filtrosCG.escopo !== 'todos' ? 1 : 0))
  const filtrosIndCount = (filtrosInd.indicadorId ? 1 : 0) + (filtrosInd.soPendencias ? 1 : 0)

  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-base)' }}>
      <ModuleWrap className="pb-10">
        <PageHeader
          icon={FileText}
          title="Central de Relatórios"
          subtitle="Todos os relatórios da campanha · impressão, PDF, XLSX, cópia e exportação"
          actions={
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>Semana</span>
                <input
                  type="date"
                  value={semana}
                  onChange={e => setSemana(e.target.value)}
                  className="input-dark px-3 py-2 rounded-xl text-sm font-bold"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
              {canViewFinance && (
                <Button icon={Download} variant="ghost" onClick={exportarTodosXlsx}>Todos XLSX</Button>
              )}
              <Button icon={Download} variant="ghost" onClick={exportarXlsx}>XLSX</Button>
              <Button icon={Download} variant="ghost" onClick={exportarJson}>JSON</Button>
              <Button icon={Printer} onClick={imprimir}>Imprimir / PDF</Button>
            </>
          }
        />

        <p className="mb-4" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          Período de referência: <strong style={{ color: 'var(--gold-bright)' }}>{periodoLabel}</strong>
          {' · '}semana calendário (segunda–domingo)
          {' · '}{catalogoVisivel.length} tipos de relatório
          {!canViewFinance ? ' · financeiro oculto' : ''}
        </p>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <aside className="xl:col-span-4 space-y-4">
            {grupos.map(([grupo, itens]) => (
              <div key={grupo} className="rounded-2xl p-3"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <p className="eyebrow px-1 mb-2" style={{ color: 'var(--gold)' }}>{grupo}</p>
                <div className="space-y-1">
                  {itens.map(c => {
                    const Icon = ICONES[c.id] || FileText
                    const on = ativo === c.id
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setAtivo(c.id)}
                        className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                        style={{
                          background: on ? 'rgba(212,175,95,0.12)' : 'transparent',
                          border: on ? '1px solid rgba(212,175,95,0.35)' : '1px solid transparent',
                        }}
                      >
                        <div className="flex items-center justify-center rounded-lg flex-shrink-0 mt-0.5"
                          style={{ width: 32, height: 32, background: c.cor + '22' }}>
                          <Icon size={15} style={{ color: c.cor }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold truncate" style={{
                            fontSize: 13,
                            color: on ? 'var(--gold-bright)' : 'var(--text-primary)',
                          }}>
                            {c.titulo}
                          </p>
                          <p className="truncate" style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                            {c.desc}
                          </p>
                        </div>
                        <ChevronRight size={14} className="flex-shrink-0 mt-1"
                          style={{ color: on ? 'var(--gold)' : 'var(--text-faint)' }} />
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </aside>

          <section className="xl:col-span-8 space-y-4">
            <div className="rounded-3xl p-5 md:p-6"
              style={{
                background: 'linear-gradient(160deg, rgba(212,175,95,0.10), var(--bg-surface))',
                border: '1px solid rgba(212,175,95,0.28)',
              }}>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                <div>
                  <Pill color={meta.cor}>{meta.grupo}</Pill>
                  <h2 className="font-extrabold mt-2" style={{ fontSize: 22, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                    {rel.titulo}
                  </h2>
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>{meta.desc}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={copiar}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold"
                    style={{ fontSize: 11, background: 'var(--bg-raised)', color: 'var(--text-secondary)' }}>
                    {copiado ? <Check size={13} /> : <Copy size={13} />}
                    {copiado ? 'Copiado' : 'Copiar'}
                  </button>
                  <button type="button" onClick={exportarTxt}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold"
                    style={{ fontSize: 11, background: 'var(--bg-raised)', color: 'var(--text-secondary)' }}>
                    <Download size={13} /> TXT
                  </button>
                  <button type="button" onClick={exportarXlsx}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold"
                    style={{
                      fontSize: 11,
                      background: 'rgba(52,211,153,0.14)',
                      color: '#34d399',
                      border: '1px solid rgba(52,211,153,0.35)',
                    }}>
                    <Download size={13} /> XLSX
                  </button>
                  <button type="button" onClick={exportarJson}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold"
                    style={{ fontSize: 11, background: 'var(--bg-raised)', color: 'var(--text-secondary)' }}>
                    <Download size={13} /> JSON
                  </button>
                  <button type="button" onClick={imprimir}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-on-solid"
                    style={{ fontSize: 11, background: 'linear-gradient(135deg,#eab308,#ca8a04)', color: '#1a1408' }}>
                    <Printer size={13} /> Imprimir / PDF
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {(rel.kpis || []).map(k => (
                  <div key={k.l} className="rounded-xl px-3 py-3"
                    style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
                    <p className="eyebrow" style={{ color: 'var(--text-faint)' }}>{k.l}</p>
                    <p className="font-bold tnum mt-1" style={{ fontSize: 20, color: 'var(--gold-bright)', lineHeight: 1.1 }}>
                      {k.v}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {ativo === 'indicacoes' && (
              <div className="rounded-3xl p-4 md:p-5 space-y-4"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Filter size={15} style={{ color: '#fbbf24' }} />
                    <p className="font-bold" style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                      Filtrar por indicador
                    </p>
                    {filtrosIndCount > 0 && (
                      <span className="px-2 py-0.5 rounded-md font-bold"
                        style={{ fontSize: 10, background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>
                        {filtrosIndCount} ativo{filtrosIndCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {filtrosIndCount > 0 && (
                    <button type="button" onClick={() => setFiltrosInd(FILTROS_IND_VAZIOS)}
                      className="inline-flex items-center gap-1 font-bold"
                      style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      <X size={12} /> Limpar
                    </button>
                  )}
                </div>

                <div>
                  <label className="eyebrow mb-1.5 block" style={{ color: 'var(--text-faint)' }}>
                    Quem indicou
                  </label>
                  <select
                    value={filtrosInd.indicadorId}
                    onChange={e => setFiltrosInd(f => ({ ...f, indicadorId: e.target.value }))}
                    className="input-dark w-full px-3 py-2.5 rounded-xl font-semibold"
                    style={{ fontSize: 13 }}
                  >
                    <option value="">Todos os indicadores ({indicadoresOpts.length})</option>
                    {indicadoresOpts.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.nome} · {g.total} indicado{g.total !== 1 ? 's' : ''}
                        {g.comPendencias ? ` · ${g.comPendencias} pend.` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {filtrosInd.indicadorId && (() => {
                  const g = indicadoresOpts.find(x => x.id === filtrosInd.indicadorId)
                  if (!g) return null
                  return (
                    <div className="rounded-2xl px-3.5 py-3"
                      style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}>
                      <p className="font-bold" style={{ fontSize: 13, color: '#fbbf24' }}>{g.nome}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        {g.total} indicado{g.total !== 1 ? 's' : ''}
                        {g.comPendencias ? ` · ${g.comPendencias} com pendência` : ' · nenhum com pendência'}
                        {g.telefone ? ` · ${g.telefone}` : ''}
                      </p>
                    </div>
                  )
                })()}

                <label className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl cursor-pointer"
                  style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
                  <input type="checkbox" checked={filtrosInd.soPendencias}
                    onChange={e => setFiltrosInd(f => ({ ...f, soPendencias: e.target.checked }))}
                    style={{ accentColor: '#fbbf24' }} />
                  <span className="font-semibold" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Mostrar só indicados com pendências de cadastro
                  </span>
                </label>
              </div>
            )}

            {ativo === 'cargos-gastos' && (
              <div className="rounded-3xl p-4 md:p-5 space-y-4"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Filter size={15} style={{ color: 'var(--gold)' }} />
                    <p className="font-bold" style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                      Filtros
                    </p>
                    {filtrosCount > 0 && (
                      <span className="px-2 py-0.5 rounded-md font-bold"
                        style={{ fontSize: 10, background: 'rgba(212,175,95,0.15)', color: 'var(--gold-bright)' }}>
                        {filtrosCount} ativo{filtrosCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {filtrosCount > 0 && (
                    <button type="button" onClick={() => setFiltrosCG(FILTROS_VAZIOS)}
                      className="inline-flex items-center gap-1 font-bold"
                      style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      <X size={12} /> Limpar
                    </button>
                  )}
                </div>

                <div>
                  <p className="eyebrow mb-2" style={{ color: 'var(--text-faint)' }}>Cargo</p>
                  <div className="flex flex-wrap gap-1.5">
                    {cargosOpts.map(c => {
                      const on = filtrosCG.cargos.includes(c)
                      return (
                        <button key={c} type="button"
                          onClick={() => setFiltrosCG(f => ({ ...f, cargos: toggleInList(f.cargos, c) }))}
                          className="px-2.5 py-1.5 rounded-lg font-bold"
                          style={{
                            fontSize: 11,
                            background: on ? 'rgba(212,175,95,0.2)' : 'var(--bg-raised)',
                            color: on ? 'var(--gold-bright)' : 'var(--text-secondary)',
                            border: on ? '1px solid rgba(212,175,95,0.4)' : '1px solid transparent',
                          }}>
                          {c}
                        </button>
                      )
                    })}
                    {cargosOpts.length === 0 && (
                      <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Nenhum cargo com dados</p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="eyebrow mb-2" style={{ color: 'var(--text-faint)' }}>Categoria de gasto</p>
                  <div className="flex flex-wrap gap-1.5">
                    {catsOpts.map(c => {
                      const on = filtrosCG.categorias.includes(c)
                      return (
                        <button key={c} type="button"
                          onClick={() => setFiltrosCG(f => ({ ...f, categorias: toggleInList(f.categorias, c) }))}
                          className="px-2.5 py-1.5 rounded-lg font-bold"
                          style={{
                            fontSize: 11,
                            background: on ? 'rgba(251,146,60,0.18)' : 'var(--bg-raised)',
                            color: on ? '#fdba74' : 'var(--text-secondary)',
                            border: on ? '1px solid rgba(251,146,60,0.4)' : '1px solid transparent',
                          }}>
                          {c}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="eyebrow mb-1.5 block" style={{ color: 'var(--text-faint)' }}>Valor mínimo (R$)</label>
                    <input type="number" min="0" step="100" placeholder="Ex: 1000"
                      value={filtrosCG.minValor}
                      onChange={e => setFiltrosCG(f => ({ ...f, minValor: e.target.value }))}
                      className="input-dark w-full px-3 py-2 rounded-xl"
                      style={{ fontSize: 13 }} />
                  </div>
                  <div>
                    <label className="eyebrow mb-1.5 block" style={{ color: 'var(--text-faint)' }}>Valor máximo (R$)</label>
                    <input type="number" min="0" step="100" placeholder="Ex: 5000"
                      value={filtrosCG.maxValor}
                      onChange={e => setFiltrosCG(f => ({ ...f, maxValor: e.target.value }))}
                      className="input-dark w-full px-3 py-2 rounded-xl"
                      style={{ fontSize: 13 }} />
                  </div>
                  <div>
                    <label className="eyebrow mb-1.5 block" style={{ color: 'var(--text-faint)' }}>Escopo</label>
                    <select
                      value={filtrosCG.escopo}
                      onChange={e => setFiltrosCG(f => ({ ...f, escopo: e.target.value }))}
                      className="input-dark w-full px-3 py-2 rounded-xl"
                      style={{ fontSize: 13 }}
                    >
                      <option value="todos">Equipe + outros gastos</option>
                      <option value="pessoas">Só equipe (por cargo)</option>
                      <option value="outros">Só freelancers / comitês / combustível / empresas</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl cursor-pointer"
                      style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
                      <input type="checkbox" checked={filtrosCG.soComValor}
                        onChange={e => setFiltrosCG(f => ({ ...f, soComValor: e.target.checked }))}
                        style={{ accentColor: 'var(--gold)' }} />
                      <span className="font-semibold" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Só com valor &gt; 0
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {msg && (
              <p className="text-center font-semibold" style={{ fontSize: 12, color: '#34d399' }}>{msg}</p>
            )}

            <div className="rounded-3xl overflow-hidden"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div className="px-5 py-3 flex items-center justify-between"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <p className="font-bold" style={{ fontSize: 13, color: 'var(--text-primary)' }}>Prévia dos dados</p>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {(rel.linhas || []).length} linha{(rel.linhas || []).length !== 1 ? 's' : ''}
                </span>
              </div>

              {(rel.linhas || []).length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <AlertTriangle size={22} className="mx-auto mb-2" style={{ color: 'var(--text-faint)' }} />
                  <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                    {ativo === 'cargos-gastos'
                      ? 'Nenhum item com esses filtros. Ajuste cargo, categoria ou faixa de valor.'
                      : ativo === 'indicacoes'
                        ? 'Nenhum indicado com esses filtros. Escolha outro indicador ou desmarque “só pendências”.'
                        : 'Sem dados neste relatório. Cadastre informações no módulo correspondente.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                  <table className="w-full" style={{ fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead className="sticky top-0" style={{ background: 'var(--bg-raised)' }}>
                      <tr>
                        {(rel.colunas || []).map(col => (
                          <th key={col} className="text-left px-4 py-2.5 font-bold whitespace-nowrap"
                            style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(rel.linhas || []).slice(0, 200).map((row, i) => (
                        <tr key={i}
                          style={{ borderBottom: '1px solid var(--border-subtle)' }}
                          className="hov-srf">
                          {row.map((cell, j) => (
                            <td key={j} className="px-4 py-2.5 align-top"
                              style={{
                                color: j === 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                                fontWeight: j === 0 ? 600 : 400,
                                maxWidth: 280,
                                wordBreak: 'break-word',
                              }}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(rel.linhas || []).length > 200 && (
                    <p className="px-4 py-3 text-center" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      Mostrando 200 de {rel.linhas.length} — exporte XLSX para a lista completa em colunas
                    </p>
                  )}
                </div>
              )}
            </div>

            <p className="text-center" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
              Em Imprimir / PDF, escolha “Salvar como PDF” no destino da impressora
            </p>
          </section>
        </div>
      </ModuleWrap>
    </div>
  )
}
