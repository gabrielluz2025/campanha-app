/**
 * Hub de relatórios — coleta de dados, texto e HTML para impressão/PDF.
 */

import { readStorage, readEleitoresData } from './persist'
import { getAllIgrejasCatalog, countIgrejasVisitadas, igrejasPorSetor } from './igrejasCatalog'
import {
  loadMetasCidade, getMetaCidade, cidadeFocoPadrao, zonaPertenceCidade, sanitizarDadosEleitores,
} from './eleitoresHelpers'
import { normalizarCargo, listaEquipeCompleta, resumoCargos, ehMembroRedeLevePrevisao, loadPrevisao } from './equipeSync'
import { pendenciasCadastro, cadastroCompleto } from './equipeCadastro'
import { loadFinanceiro, getFinanceiroMembro, saldoDevedorEfetivo, totalPago, fmtMoeda } from './equipeFinanceiro'
import { resumoRotasCampo, paradasOperacionaisRota } from './rotaUtils'
import { listarIndicadores } from './equipeIndicacoesReport'
import { listarPessoasIgreja, temCargoEclesiastico } from './equipeIgrejasReport'
import {
  coletarTodasLinhas, filtrarCargosGastos, resumoPorCargo, resumoPorCategoria, totaisLinhas,
} from './cargosGastosReport'
import {
  FREELANCER_CAT_NOME, totalLinhaFreelancer, totalRuaFreelancers, qtdPessoasFreelancers, parseNum,
} from './equipeRuaFreelancer'
import { calcularPrevisaoCompleta } from './previsaoCalculo'

export function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function fmtN(v) {
  return Number(v || 0).toLocaleString('pt-BR')
}

export function fmtBRL(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return (Number.isFinite(n) ? n : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function parseValorBR(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = String(v ?? '').trim()
  if (!s) return 0
  if (s.includes(',') && s.includes('.')) {
    const n = Number(s.replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  if (s.includes(',')) {
    const n = Number(s.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

function origemApoiadorLabel(a) {
  if (a?.origem === 'cadastro_publico') return 'Formulário'
  if (a?.origem === 'equipe') return 'Equipe'
  if (a?.origem) return String(a.origem)
  return 'Manual'
}

export function dataHojeLabel() {
  return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export function inicioSemanaIso(ref = new Date()) {
  const d = new Date(ref)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function fimPeriodo(inicio, dias = 6) {
  const d = new Date(inicio)
  d.setDate(d.getDate() + dias)
  d.setHours(23, 59, 59, 999)
  return d
}

function inRange(dateStr, start, end) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  return Number.isFinite(d.getTime()) && d >= start && d <= end
}

/** Abre janela clara e dispara impressão / Salvar como PDF */
export function abrirJanelaImpressao(html, titulo = 'Relatório') {
  const win = window.open('', '_blank', 'width=960,height=720')
  if (!win) return { ok: false, erro: 'popup' }
  try { win.opener = null } catch { /* ignore */ }
  const doc = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>${escHtml(titulo)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:"Segoe UI",Tahoma,Geneva,Verdana,sans-serif;color:#111;background:#fff;padding:28px 32px;font-size:13px;line-height:1.45}
  h1{font-size:20px;margin-bottom:4px}
  h2{font-size:14px;margin:18px 0 8px;padding-bottom:4px;border-bottom:1px solid #ddd;color:#854d0e}
  .meta{color:#555;font-size:12px;margin-bottom:14px}
  .kpis{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 18px}
  .kpi{border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;min-width:110px}
  .kpi b{display:block;font-size:18px}
  .kpi span{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.04em}
  table{width:100%;border-collapse:collapse;font-size:11px;margin-top:8px}
  th,td{border-bottom:1px solid #eee;padding:6px 8px;text-align:left;vertical-align:top}
  th{background:#f8fafc;color:#555;font-weight:700}
  .falta{color:#b45309;font-weight:700}
  .rodape{margin-top:20px;color:#666;font-size:11px}
  ul{margin:6px 0 6px 18px}
  @media print{body{padding:10mm}}
</style></head><body>${html}</body></html>`
  win.document.open()
  win.document.write(doc)
  win.document.close()
  const go = () => { try { win.focus(); win.print() } catch { /* ignore */ } }
  if (win.document.readyState === 'complete') setTimeout(go, 250)
  else { win.onload = () => setTimeout(go, 250); setTimeout(go, 700) }
  return { ok: true }
}

export function baixarJson(obj, nomeArquivo) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  a.click()
  URL.revokeObjectURL(url)
}

export function baixarTexto(texto, nomeArquivo) {
  const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  a.click()
  URL.revokeObjectURL(url)
}

/** Snapshot unificado de todos os módulos */
export function coletarSnapshot({ semanaInicioIso } = {}) {
  const weekStart = semanaInicioIso
    ? new Date(semanaInicioIso + 'T00:00:00')
    : inicioSemanaIso()
  const weekEnd = fimPeriodo(weekStart, 6)

  const eventos = readStorage('agenda_eventos', [])
  const membros = readStorage('equipe_membros', [])
  const tarefas = readStorage('equipe_tarefas', [])
  const visitas = readStorage('igrejas_visitas', {})
  const materiaisItens = readStorage('materiais_estoque', [])
  const distribuicoes = readStorage('materiais_distribuicao', [])
  const enquetes = readStorage('pesquisas_enquetes', [])
  const respostas = readStorage('pesquisas_respostas', {})
  const apoiadores = readStorage('apoiadores_lista', [])
  const interacoes = readStorage('apoiadores_interacoes', {})
  const empresas = readStorage('empresas_lista', [])
  const previsaoResumo = readStorage('previsao_resumo', null)
  const resumoRotas = resumoRotasCampo()
  const finMap = loadFinanceiro()
  const catalogIgrejas = getAllIgrejasCatalog()

  const eventosSemana = eventos.filter(e => {
    const ini = e.dataInicio || e.data || ''
    const fim = e.dataFim || ini
    if (!ini) return false
    return new Date(fim) >= weekStart && new Date(ini) <= weekEnd
  })

  const distSemana = distribuicoes.filter(d => inRange(d.data, weekStart, weekEnd))
  const materiaisStatus = materiaisItens.map(item => {
    const distQtd = distribuicoes
      .filter(d => String(d.itemId) === String(item.id))
      .reduce((s, d) => s + (Number(d.quantidade) || 0), 0)
    const restante = Math.max(0, (Number(item.quantidade) || 0) - distQtd)
    const min = Number(item.estoqueMinimo) || 0
    const status = restante <= 0 ? 'esgotado' : restante <= min ? 'baixo' : 'ok'
    return { ...item, restante, status, distribuido: distQtd }
  })

  const cargosLista = Object.entries(
    membros.reduce((acc, m) => {
      const c = normalizarCargo(m.cargo)
      acc[c] = (acc[c] || 0) + 1
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1])

  const cadastroOk = membros.filter(m => cadastroCompleto(m, membros)).length
  const indicadores = listarIndicadores(membros)
  const redeIgreja = listarPessoasIgreja(membros, { escopo: 'rede' })
  const cargosIgreja = membros.filter(temCargoEclesiastico)

  let totalVotos = 0
  let totalAptos = 0
  const topZonas = []
  const dadosEleitores = sanitizarDadosEleitores(readEleitoresData({}))
  const metasCidade = loadMetasCidade()
  const cidades = [...new Set(
    (dadosEleitores?.zonas || []).map(z => z.municipio || dadosEleitores.municipio).filter(Boolean),
  )]
  const cidadeFoco = cidadeFocoPadrao(dadosEleitores, cidades)
  const metaGlobal = getMetaCidade(metasCidade, cidadeFoco)
  if (dadosEleitores?.zonas) {
    dadosEleitores.zonas.forEach(z => {
      if (cidadeFoco && !zonaPertenceCidade(z, dadosEleitores, cidadeFoco)) return
      let zv = 0
      let za = 0
      ;(z.locais || []).forEach(l => (l.secoes || []).forEach(s => {
        zv += Number(s.votos) || 0
        za += Number(s.aptos || s.eleitores) || 0
      }))
      totalVotos += zv
      totalAptos += za
      topZonas.push({ nome: z.nome || z.zona || `Zona ${z.numero || ''}`, votos: zv, aptos: za })
    })
  }
  // votosTotal do TSE é estadual — só usa se NÃO houver filtro de cidade foco
  if (!cidadeFoco && Number(dadosEleitores?.votosTotal) > 0) {
    totalVotos = Number(dadosEleitores.votosTotal)
  }
  if (!cidadeFoco && !totalAptos && Number(dadosEleitores?.eleitoresAptos) > 0) {
    totalAptos = Number(dadosEleitores.eleitoresAptos)
  }
  topZonas.sort((a, b) => b.votos - a.votos)

  const empresasAtivas = empresas.filter(e => e.status !== 'inativa')
  const valorEmpresas = empresasAtivas.reduce((s, e) => s + parseValorBR(e.valor), 0)

  let saldoEquipe = 0
  let pagoEquipe = 0
  const financeiroLinhas = membros.map(m => {
    const fin = getFinanceiroMembro(finMap, m.id)
    const saldo = Math.max(0, saldoDevedorEfetivo(fin, m))
    const pago = totalPago(fin)
    saldoEquipe += saldo
    pagoEquipe += pago
    return { id: m.id, nome: m.nome, cargo: normalizarCargo(m.cargo), saldo, pago }
  }).filter(l => l.saldo > 0 || l.pago > 0)
    .sort((a, b) => b.saldo - a.saldo)

  const paradasPendentes = resumoRotas.paradasPendentes
  const paradasTotal = resumoRotas.paradasTotal
  const rotas = resumoRotas.rotas

  const membrosRede = membros.filter(m => ehMembroRedeLevePrevisao(m)).length
  const membrosOperacionais = Math.max(0, membros.length - membrosRede)

  const porNivel = { simpatizante: 0, apoiador: 0, cabo_eleitoral: 0, lider: 0 }
  apoiadores.forEach(a => { if (porNivel[a.nivel] !== undefined) porNivel[a.nivel]++ })

  const respostasFlat = Object.values(respostas || {}).flat().filter(Boolean)
  const respostasSemana = respostasFlat.filter(r => inRange(r.data || r.createdAt, weekStart, weekEnd)).length
  const interacoesFlat = Object.values(interacoes || {}).flat().filter(Boolean)
  const interacoesSemana = interacoesFlat.filter(i => inRange(i.data || i.createdAt, weekStart, weekEnd)).length

  const distPorBairro = {}
  distSemana.forEach(d => {
    const b = d.bairro || 'Sem bairro'
    distPorBairro[b] = (distPorBairro[b] || 0) + (Number(d.quantidade) || 0)
  })

  return {
    weekStart, weekEnd,
    eventos, eventosSemana,
    membros, tarefas,
    visitas, catalogIgrejas,
    visitadas: countIgrejasVisitadas(visitas),
    setores: igrejasPorSetor(catalogIgrejas),
    materiaisItens, materiaisStatus, distribuicoes, distSemana, distPorBairro,
    enquetes, respostasFlat, respostasSemana,
    apoiadores, porNivel, interacoesFlat, interacoesSemana,
    empresas, empresasAtivas, valorEmpresas,
    previsaoResumo,
    rotas: Array.isArray(rotas) ? rotas : [],
    paradasPendentes, paradasTotal,
    membrosRede, membrosOperacionais,
    totalVotos, totalAptos, topZonas, metaGlobal, cidadeFoco,
    cargosLista, cadastroOk,
    indicadores, redeIgreja, cargosIgreja,
    financeiroLinhas, saldoEquipe, pagoEquipe,
  }
}

function kpisHtml(items) {
  return `<div class="kpis">${items.map(i =>
    `<div class="kpi"><b>${escHtml(String(i.v))}</b><span>${escHtml(i.l)}</span></div>`
  ).join('')}</div>`
}

function tabelaHtml(headers, rows) {
  if (!rows.length) return '<p>Nenhum registro neste filtro.</p>'
  return `<table><thead><tr>${headers.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}

function cabecalho(titulo, sub) {
  return `<h1>${escHtml(titulo)}</h1><p class="meta">${escHtml(dataHojeLabel())}${sub ? ` · ${escHtml(sub)}` : ''}</p>`
}

export const CATALOGO = [
  { id: 'semanal', grupo: 'Operação', titulo: 'Resumo semanal', desc: 'Visão geral da semana — eventos, campo, rede e alertas', cor: '#d4af5f' },
  { id: 'eleitores', grupo: 'Eleitoral', titulo: 'Eleitores & metas', desc: 'Votos importados, penetração e ranking de zonas', cor: '#22d3ee' },
  { id: 'equipe', grupo: 'Equipe', titulo: 'Equipe & tarefas', desc: 'Headcount por cargo, cadastros e status de tarefas', cor: '#c4b5fd' },
  { id: 'indicacoes', grupo: 'Equipe', titulo: 'Indicações & pendências', desc: 'Quem indicou e dados faltando no cadastro', cor: '#fbbf24' },
  { id: 'contratos', grupo: 'Equipe', titulo: 'Contratos & financeiro', desc: 'Saldos a pagar, pagos e vínculos da equipe', cor: '#34d399' },
  { id: 'igrejas', grupo: 'Campo', titulo: 'Igrejas & cobertura', desc: 'Visitas, setores e cargos eclesiásticos', cor: '#14b8a6' },
  { id: 'agenda', grupo: 'Operação', titulo: 'Agenda', desc: 'Eventos do período e agenda completa', cor: '#5b9bff' },
  { id: 'materiais', grupo: 'Campo', titulo: 'Materiais', desc: 'Estoque, alertas e distribuição por bairro', cor: '#f59e0b' },
  { id: 'apoiadores', grupo: 'Rede', titulo: 'Apoiadores', desc: 'Rede por nível, bairro e interações', cor: '#ec4899' },
  { id: 'empresas', grupo: 'Financeiro', titulo: 'Empresas', desc: 'Fornecedores ativos e valores de contrato', cor: '#eab308' },
  { id: 'previsao', grupo: 'Financeiro', titulo: 'Previsão de gasto', desc: 'Orçamento, categorias e valor por cargo', cor: '#f0d48a' },
  { id: 'cargos-gastos', grupo: 'Financeiro', titulo: 'Cargos & gastos', desc: 'Filtre valores por cargo e categoria de gasto', cor: '#fb923c' },
  { id: 'rotas', grupo: 'Campo', titulo: 'Rotas de campo', desc: 'Rotas cadastradas e paradas pendentes', cor: '#10b981' },
  { id: 'pesquisas', grupo: 'Análise', titulo: 'Pesquisas', desc: 'Enquetes ativas e volume de respostas', cor: '#38bdf8' },
]

export function montarRelatorio(id, snap, filtros = {}) {
  const periodo = `${snap.weekStart.toLocaleDateString('pt-BR')} — ${snap.weekEnd.toLocaleDateString('pt-BR')}`
  const builders = {
    semanal: () => relatorioSemanal(snap, periodo),
    eleitores: () => relatorioEleitores(snap),
    equipe: () => relatorioEquipe(snap),
    indicacoes: () => relatorioIndicacoes(snap, filtros),
    contratos: () => relatorioContratos(snap),
    igrejas: () => relatorioIgrejas(snap),
    agenda: () => relatorioAgenda(snap, periodo),
    materiais: () => relatorioMateriais(snap, periodo),
    apoiadores: () => relatorioApoiadores(snap, periodo),
    empresas: () => relatorioEmpresas(snap),
    previsao: () => relatorioPrevisao(snap),
    'cargos-gastos': () => relatorioCargosGastos(snap, filtros),
    rotas: () => relatorioRotas(snap),
    pesquisas: () => relatorioPesquisas(snap, periodo),
  }
  const fn = builders[id] || builders.semanal
  return fn()
}

function relatorioSemanal(s, periodo) {
  const pctMeta = s.metaGlobal > 0 ? Math.round((s.totalVotos / s.metaGlobal) * 100) : 0
  const pctIgrejas = s.catalogIgrejas.length
    ? Math.round((s.visitadas / s.catalogIgrejas.length) * 100) : 0
  const tarefasPrazoSemana = s.tarefas.filter(t => inRange(t.prazo, s.weekStart, s.weekEnd))
  const linhas = [
    ['Eventos na semana', s.eventosSemana.length],
    ['Materiais distribuídos', s.distSemana.reduce((a, d) => a + (Number(d.quantidade) || 0), 0)],
    ['Novos apoiadores', s.apoiadores.filter(a => inRange(a.criadoEm || a.createdAt, s.weekStart, s.weekEnd)).length],
    ['Interações na rede', s.interacoesSemana],
    ['Respostas de pesquisa', s.respostasSemana],
    ['Tarefas com prazo na semana', tarefasPrazoSemana.length],
    ['Tarefas concluídas (total)', s.tarefas.filter(t => t.status === 'concluida').length],
    ['Tarefas pendentes (total)', s.tarefas.filter(t => t.status === 'pendente' || t.status === 'em_andamento').length],
    ['Meta de votos', `${fmtN(s.totalVotos)} / ${fmtN(s.metaGlobal)} (${pctMeta}%)`],
    ['Igrejas visitadas', `${s.visitadas}/${s.catalogIgrejas.length} (${pctIgrejas}%)`],
  ]
  const html = cabecalho('Resumo semanal da campanha', periodo)
    + kpisHtml([
      { l: 'Eventos', v: s.eventosSemana.length },
      { l: 'Materiais', v: fmtN(s.distSemana.reduce((a, d) => a + (Number(d.quantidade) || 0), 0)) },
      { l: 'Interações', v: s.interacoesSemana },
      { l: 'Meta votos', v: `${pctMeta}%` },
    ])
    + tabelaHtml(['Indicador', 'Valor'], linhas.map(([a, b]) => [escHtml(a), escHtml(String(b))]))
    + `<p class="rodape">Semana calendário (segunda–domingo). Gerado automaticamente pela Sala de Comando</p>`
  const texto = ['RESUMO SEMANAL', periodo, '', ...linhas.map(([a, b]) => `${a}: ${b}`)].join('\n')
  return {
    titulo: 'Resumo semanal',
    kpis: [
      { l: 'Eventos', v: s.eventosSemana.length },
      { l: 'Materiais', v: s.distSemana.reduce((a, d) => a + (Number(d.quantidade) || 0), 0) },
      { l: 'Interações', v: s.interacoesSemana },
      { l: 'Meta', v: `${pctMeta}%` },
    ],
    colunas: ['Indicador', 'Valor'],
    linhas: linhas.map(([a, b]) => [a, String(b)]),
    html, texto,
    json: { periodo, linhas },
  }
}

function relatorioEleitores(s) {
  const pct = s.metaGlobal > 0 ? Math.round((s.totalVotos / s.metaGlobal) * 100) : 0
  const pen = s.totalAptos > 0 ? Math.round((s.totalVotos / s.totalAptos) * 1000) / 10 : 0
  const zonasHtml = s.topZonas.slice(0, 50)
  const rows = zonasHtml.map((z, i) => [
    String(i + 1), escHtml(z.nome), fmtN(z.votos), fmtN(z.aptos),
    z.aptos ? `${Math.round((z.votos / z.aptos) * 1000) / 10}%` : '—',
  ])
  const html = cabecalho('Eleitores & metas', s.cidadeFoco || 'Campanha')
    + kpisHtml([
      { l: 'Votos', v: fmtN(s.totalVotos) },
      { l: 'Meta', v: fmtN(s.metaGlobal) },
      { l: '% meta', v: `${pct}%` },
      { l: 'Penetração', v: `${pen}%` },
    ])
    + '<h2>Ranking de zonas</h2>'
    + (s.topZonas.length > 50
      ? `<p class="meta">Mostrando top 50 de ${s.topZonas.length} zonas · XLSX/JSON trazem a lista completa</p>`
      : '')
    + tabelaHtml(['#', 'Zona', 'Votos', 'Aptos', 'Penetração'], rows)
  const texto = [
    'ELEITORES & METAS',
    `Cidade: ${s.cidadeFoco || '—'}`,
    `Votos: ${fmtN(s.totalVotos)} · Meta: ${fmtN(s.metaGlobal)} (${pct}%)`,
    '',
    ...s.topZonas.map((z, i) => `${i + 1}. ${z.nome}: ${fmtN(z.votos)} votos`),
  ].join('\n')
  return {
    titulo: 'Eleitores & metas',
    kpis: [
      { l: 'Votos', v: s.totalVotos },
      { l: 'Meta', v: s.metaGlobal },
      { l: '% meta', v: pct },
      { l: 'Zonas', v: s.topZonas.length },
    ],
    colunas: ['#', 'Zona', 'Votos', 'Aptos', 'Penetração'],
    linhas: s.topZonas.map((z, i) => [
      i + 1, z.nome, fmtN(z.votos), fmtN(z.aptos),
      z.aptos ? `${Math.round((z.votos / z.aptos) * 1000) / 10}%` : '—',
    ]),
    html, texto,
    json: { totalVotos: s.totalVotos, meta: s.metaGlobal, topZonas: s.topZonas },
  }
}

function relatorioEquipe(s) {
  const pendCad = s.membros.length - s.cadastroOk
  const rows = s.membros
    .slice()
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
    .map(m => {
      const pend = pendenciasCadastro(m, s.membros)
      const rede = ehMembroRedeLevePrevisao(m)
      return [
        escHtml(m.nome || '—'),
        escHtml(normalizarCargo(m.cargo)),
        escHtml(m.telefone || '—'),
        rede ? 'Comunidade' : (pend.length ? `<span class="falta">${escHtml(pend.join(', '))}</span>` : 'OK'),
      ]
    })
  const html = cabecalho('Equipe & tarefas', `${s.membros.length} membros`)
    + kpisHtml([
      { l: 'Membros', v: s.membros.length },
      { l: 'Operacionais', v: s.membrosOperacionais ?? s.membros.length },
      { l: 'Comunidade WA', v: s.membrosRede ?? 0 },
      { l: 'Cadastro OK', v: s.cadastroOk },
    ])
    + '<p class="meta">Comunidade WhatsApp / formulário entram na pirâmide, mas não na previsão financeira.</p>'
    + '<h2>Por cargo</h2>'
    + tabelaHtml(['Cargo', 'Qtd'], s.cargosLista.map(([c, q]) => [escHtml(c), String(q)]))
    + '<h2>Membros</h2>'
    + tabelaHtml(['Nome', 'Cargo', 'Telefone', 'Cadastro'], rows)
  const texto = [
    'EQUIPE & TAREFAS',
    `Membros: ${s.membros.length} · Operacionais: ${s.membrosOperacionais ?? s.membros.length} · Comunidade: ${s.membrosRede ?? 0}`,
    `Cadastro OK: ${s.cadastroOk}`,
    '',
    ...s.cargosLista.map(([c, q]) => `${c}: ${q}`),
  ].join('\n')
  return {
    titulo: 'Equipe & tarefas',
    kpis: [
      { l: 'Membros', v: s.membros.length },
      { l: 'Operacionais', v: s.membrosOperacionais ?? s.membros.length },
      { l: 'Comunidade', v: s.membrosRede ?? 0 },
      { l: 'Cadastro OK', v: s.cadastroOk },
    ],
    colunas: ['Nome', 'Cargo', 'Telefone', 'Cadastro'],
    linhas: s.membros.map(m => {
      const pend = pendenciasCadastro(m, s.membros)
      const rede = ehMembroRedeLevePrevisao(m)
      return [m.nome, normalizarCargo(m.cargo), m.telefone || '—', rede ? 'Comunidade' : (pend.length ? pend.join(', ') : 'OK')]
    }),
    html, texto,
    json: {
      membros: s.membros.length,
      membrosOperacionais: s.membrosOperacionais,
      membrosRede: s.membrosRede,
      cargos: Object.fromEntries(s.cargosLista),
    },
  }
}

function relatorioIndicacoes(s, filtros = {}) {
  const indicadorId = String(filtros.indicadorId || '').trim()
  const soPendencias = !!filtros.soPendencias

  let grupos = s.indicadores || []
  if (indicadorId) {
    grupos = grupos.filter(g => g.id === indicadorId)
  }

  const rows = []
  const linhas = []
  let totalIndicados = 0
  let comPend = 0

  grupos.forEach(g => {
    const lista = soPendencias
      ? g.indicados.filter(m => pendenciasCadastro(m, s.membros).length > 0)
      : g.indicados
    totalIndicados += lista.length
    lista.forEach(m => {
      const pend = pendenciasCadastro(m, s.membros)
      if (pend.length) comPend += 1
      rows.push([
        escHtml(g.nome),
        escHtml(m.nome || '—'),
        escHtml(normalizarCargo(m.cargo)),
        escHtml(m.telefone || '—'),
        pend.length ? `<span class="falta">${escHtml(pend.join(', '))}</span>` : 'Completo',
      ])
      linhas.push([
        g.nome,
        m.nome,
        normalizarCargo(m.cargo),
        m.telefone || '—',
        pend.length ? pend.join(', ') : 'Completo',
      ])
    })
  })

  const filtroNome = indicadorId
    ? (s.indicadores.find(g => g.id === indicadorId)?.nome || 'Indicador')
    : 'Todos os indicadores'
  const subtitulo = [
    filtroNome,
    soPendencias ? 'só pendências' : 'todos os indicados',
    `${totalIndicados} indicado${totalIndicados !== 1 ? 's' : ''}`,
  ].join(' · ')

  const html = cabecalho('Indicações & pendências de cadastro', subtitulo)
    + kpisHtml([
      { l: 'Indicadores', v: grupos.length || (indicadorId ? 0 : s.indicadores.length) },
      { l: 'Indicados', v: totalIndicados },
      { l: 'Com pendências', v: comPend },
      { l: 'Completos', v: Math.max(0, totalIndicados - comPend) },
    ])
    + (rows.length
      ? tabelaHtml(['Quem indicou', 'Indicado', 'Cargo', 'Telefone', 'Cadastro'], rows)
      : '<p class="muted">Nenhum indicado com esses filtros.</p>')

  const texto = [
    'INDICAÇÕES & PENDÊNCIAS',
    subtitulo,
    '',
    ...grupos.map(g => {
      const lista = soPendencias
        ? g.indicados.filter(m => pendenciasCadastro(m, s.membros).length > 0)
        : g.indicados
      if (!lista.length) return null
      return `\n── ${g.nome} (${lista.length})\n`
        + lista.map(m => {
          const pend = pendenciasCadastro(m, s.membros)
          return `• ${m.nome}${m.telefone ? ` · ${m.telefone}` : ''}${pend.length ? ` — Falta: ${pend.join(', ')}` : ' — OK'}`
        }).join('\n')
    }).filter(Boolean),
  ].join('\n')

  return {
    titulo: 'Indicações & pendências',
    kpis: [
      { l: 'Indicadores', v: grupos.length || (indicadorId ? 0 : s.indicadores.length) },
      { l: 'Indicados', v: totalIndicados },
      { l: 'Pendências', v: comPend },
      { l: 'Completos', v: Math.max(0, totalIndicados - comPend) },
    ],
    colunas: ['Quem indicou', 'Indicado', 'Cargo', 'Telefone', 'Cadastro'],
    linhas,
    html, texto,
    json: {
      filtros: { indicadorId: indicadorId || null, soPendencias },
      indicadores: grupos.map(g => ({
        id: g.id,
        nome: g.nome,
        total: g.total,
        pendencias: g.comPendencias,
        indicados: (soPendencias
          ? g.indicados.filter(m => pendenciasCadastro(m, s.membros).length > 0)
          : g.indicados
        ).map(m => ({
          id: m.id,
          nome: m.nome,
          cargo: normalizarCargo(m.cargo),
          telefone: m.telefone || '',
          pendencias: pendenciasCadastro(m, s.membros),
        })),
      })),
    },
  }
}

function relatorioContratos(s) {
  const rows = s.financeiroLinhas.map(l => [
    escHtml(l.nome || '—'),
    escHtml(l.cargo),
    escHtml(fmtMoeda(l.pago)),
    escHtml(fmtMoeda(l.saldo)),
  ])
  const html = cabecalho('Contratos & financeiro da equipe')
    + kpisHtml([
      { l: 'A pagar', v: fmtBRL(s.saldoEquipe) },
      { l: 'Já pago', v: fmtBRL(s.pagoEquipe) },
      { l: 'Com movimento', v: s.financeiroLinhas.length },
    ])
    + tabelaHtml(['Nome', 'Cargo', 'Pago', 'Saldo'], rows)
  const texto = [
    'CONTRATOS & FINANCEIRO',
    `Saldo a pagar: ${fmtBRL(s.saldoEquipe)} · Pago: ${fmtBRL(s.pagoEquipe)}`,
    '',
    ...s.financeiroLinhas.map(l => `${l.nome} (${l.cargo}): saldo ${fmtMoeda(l.saldo)}`),
  ].join('\n')
  return {
    titulo: 'Contratos & financeiro',
    kpis: [
      { l: 'A pagar', v: fmtBRL(s.saldoEquipe) },
      { l: 'Pago', v: fmtBRL(s.pagoEquipe) },
      { l: 'Linhas', v: s.financeiroLinhas.length },
    ],
    colunas: ['Nome', 'Cargo', 'Pago', 'Saldo'],
    linhas: s.financeiroLinhas.map(l => [l.nome, l.cargo, fmtMoeda(l.pago), fmtMoeda(l.saldo)]),
    html, texto,
    json: { saldoEquipe: s.saldoEquipe, pagoEquipe: s.pagoEquipe, linhas: s.financeiroLinhas },
  }
}

function relatorioIgrejas(s) {
  const total = s.catalogIgrejas.length
  const pct = total ? Math.round((s.visitadas / total) * 100) : 0
  const setorRows = (s.setores || []).map(x => [
    escHtml(x.nome), String(x.qtd || 0), String(x.visitadas || 0),
  ])
  const cargoRows = s.cargosIgreja
    .slice()
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
    .map(m => [
      escHtml(m.nome || '—'),
      escHtml(m.cargoIgreja || '—'),
      escHtml(m.igrejaNome || '—'),
      escHtml(normalizarCargo(m.cargo)),
    ])
  const html = cabecalho('Igrejas & cobertura')
    + kpisHtml([
      { l: 'Igrejas', v: total },
      { l: 'Visitadas', v: s.visitadas },
      { l: 'Cobertura', v: `${pct}%` },
      { l: 'Cargos ecles.', v: s.cargosIgreja.length },
    ])
    + '<h2>Por setor</h2>'
    + tabelaHtml(['Setor', 'Igrejas', 'Visitadas'], setorRows)
    + '<h2>Pessoas com cargo na igreja</h2>'
    + tabelaHtml(['Nome', 'Cargo igreja', 'Igreja', 'Cargo campanha'], cargoRows)
  const texto = [
    'IGREJAS & COBERTURA',
    `Visitadas: ${s.visitadas}/${total} (${pct}%)`,
    `Cargos eclesiásticos: ${s.cargosIgreja.length}`,
  ].join('\n')
  return {
    titulo: 'Igrejas & cobertura',
    kpis: [
      { l: 'Igrejas', v: total },
      { l: 'Visitadas', v: s.visitadas },
      { l: 'Cobertura', v: `${pct}%` },
      { l: 'Cargos', v: s.cargosIgreja.length },
    ],
    colunas: ['Nome', 'Cargo igreja', 'Igreja', 'Cargo campanha'],
    linhas: s.cargosIgreja.map(m => [
      m.nome, m.cargoIgreja || '—', m.igrejaNome || '—', normalizarCargo(m.cargo),
    ]),
    html, texto,
    json: { visitadas: s.visitadas, total, cargosIgreja: s.cargosIgreja.length },
  }
}

function relatorioAgenda(s, periodo) {
  const lista = s.eventosSemana.length ? s.eventosSemana : s.eventos.slice(0, 50)
  const rows = lista
    .slice()
    .sort((a, b) => String(a.dataInicio || a.data).localeCompare(String(b.dataInicio || b.data)))
    .map(e => [
      escHtml((e.dataInicio || e.data || '').slice(0, 10)),
      escHtml([e.horaInicio, e.horaFim].filter(Boolean).join('–') || '—'),
      escHtml(e.titulo || '—'),
      escHtml(e.local || e.bairro || '—'),
    ])
  const html = cabecalho('Agenda', periodo)
    + kpisHtml([
      { l: 'Na semana', v: s.eventosSemana.length },
      { l: 'Total cadastro', v: s.eventos.length },
    ])
    + tabelaHtml(['Data', 'Horário', 'Evento', 'Local'], rows)
  const texto = ['AGENDA', periodo, '', ...lista.map(e =>
    `${(e.dataInicio || e.data || '').slice(0, 10)} — ${e.titulo || '—'}`
  )].join('\n')
  return {
    titulo: 'Agenda',
    kpis: [
      { l: 'Semana', v: s.eventosSemana.length },
      { l: 'Total', v: s.eventos.length },
    ],
    colunas: ['Data', 'Horário', 'Evento', 'Local'],
    linhas: lista.map(e => [
      (e.dataInicio || e.data || '').slice(0, 10),
      [e.horaInicio, e.horaFim].filter(Boolean).join('–') || '—',
      e.titulo || '—',
      e.local || e.bairro || '—',
    ]),
    html, texto,
    json: { semana: s.eventosSemana.length, total: s.eventos.length },
  }
}

function relatorioMateriais(s, periodo) {
  const alertas = s.materiaisStatus.filter(i => i.status !== 'ok')
  const totalDist = s.distribuicoes.reduce((a, d) => a + (Number(d.quantidade) || 0), 0)
  const distSem = s.distSemana.reduce((a, d) => a + (Number(d.quantidade) || 0), 0)
  const bairroRows = Object.entries(s.distPorBairro)
    .sort((a, b) => b[1] - a[1])
    .map(([b, q]) => [escHtml(b), fmtN(q)])
  const html = cabecalho('Materiais', periodo)
    + kpisHtml([
      { l: 'Itens', v: s.materiaisItens.length },
      { l: 'Alertas', v: alertas.length },
      { l: 'Dist. semana', v: fmtN(distSem) },
      { l: 'Dist. total', v: fmtN(totalDist) },
    ])
    + '<h2>Estoque</h2>'
    + tabelaHtml(['Item', 'Categoria', 'Restante', 'Status'],
      s.materiaisStatus.map(i => [
        escHtml(i.nome), escHtml(i.categoria || '—'), fmtN(i.restante),
        i.status === 'ok' ? 'OK' : `<span class="falta">${escHtml(i.status)}</span>`,
      ]))
    + '<h2>Distribuição por bairro (semana)</h2>'
    + tabelaHtml(['Bairro', 'Qtd'], bairroRows)
  const texto = [
    'MATERIAIS',
    `Alertas: ${alertas.length} · Dist. semana: ${fmtN(distSem)}`,
    '',
    ...s.materiaisStatus.map(i => `${i.nome}: ${i.restante} (${i.status})`),
  ].join('\n')
  return {
    titulo: 'Materiais',
    kpis: [
      { l: 'Itens', v: s.materiaisItens.length },
      { l: 'Alertas', v: alertas.length },
      { l: 'Semana', v: distSem },
      { l: 'Total', v: totalDist },
    ],
    colunas: ['Item', 'Categoria', 'Restante', 'Status'],
    linhas: s.materiaisStatus.map(i => [i.nome, i.categoria || '—', fmtN(i.restante), i.status]),
    html, texto,
    json: { alertas: alertas.length, distSemana: distSem, porBairro: s.distPorBairro },
  }
}

function relatorioApoiadores(s, periodo) {
  const formQtd = s.apoiadores.filter(a => a.origem === 'cadastro_publico').length
  const rows = s.apoiadores
    .slice()
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
    .map(a => [
      escHtml(a.nome || '—'),
      escHtml(a.nivel || '—'),
      escHtml(a.bairro || '—'),
      escHtml(a.telefone || '—'),
      escHtml(origemApoiadorLabel(a)),
      String(Math.min(5, Number(a.votosEstimados) || 0)),
    ])
  const html = cabecalho('Rede de apoiadores', periodo)
    + kpisHtml([
      { l: 'Total', v: s.apoiadores.length },
      { l: 'Formulário', v: formQtd },
      { l: 'Líderes', v: s.porNivel.lider },
      { l: 'Interações', v: s.interacoesSemana },
    ])
    + '<p class="meta">Quem veio do formulário também entra na Equipe como Comunidade WhatsApp (sem remuneração).</p>'
    + tabelaHtml(['Nome', 'Nível', 'Bairro', 'Telefone', 'Origem', 'Votos prev.'], rows)
  const texto = [
    'APOIADORES',
    `Total: ${s.apoiadores.length} · Formulário: ${formQtd}`,
    `Simpatizante: ${s.porNivel.simpatizante} · Apoiador: ${s.porNivel.apoiador}`,
    `Cabo: ${s.porNivel.cabo_eleitoral} · Líder: ${s.porNivel.lider}`,
  ].join('\n')
  return {
    titulo: 'Apoiadores',
    kpis: [
      { l: 'Total', v: s.apoiadores.length },
      { l: 'Formulário', v: formQtd },
      { l: 'Líderes', v: s.porNivel.lider },
      { l: 'Interações/sem', v: s.interacoesSemana },
    ],
    colunas: ['Nome', 'Nível', 'Bairro', 'Telefone', 'Origem', 'Votos prev.'],
    linhas: s.apoiadores.map(a => [
      a.nome, a.nivel, a.bairro || '—', a.telefone || '—',
      origemApoiadorLabel(a), Math.min(5, Number(a.votosEstimados) || 0),
    ]),
    html, texto,
    json: { total: s.apoiadores.length, formQtd, porNivel: s.porNivel },
  }
}

function relatorioEmpresas(s) {
  const rows = s.empresas.map(e => [
    escHtml(e.nomeFantasia || e.razaoSocial || '—'),
    escHtml(e.categoria || '—'),
    escHtml(e.status || '—'),
    escHtml(fmtBRL(parseValorBR(e.valor))),
  ])
  const html = cabecalho('Empresas & fornecedores')
    + kpisHtml([
      { l: 'Cadastradas', v: s.empresas.length },
      { l: 'Ativas', v: s.empresasAtivas.length },
      { l: 'A pagar', v: fmtBRL(s.valorEmpresas) },
    ])
    + tabelaHtml(['Empresa', 'Categoria', 'Status', 'Valor'], rows)
  const texto = [
    'EMPRESAS',
    `Ativas: ${s.empresasAtivas.length} · Valor: ${fmtBRL(s.valorEmpresas)}`,
    '',
    ...s.empresas.map(e => `${e.nomeFantasia || e.razaoSocial}: ${fmtBRL(parseValorBR(e.valor))}`),
  ].join('\n')
  return {
    titulo: 'Empresas',
    kpis: [
      { l: 'Total', v: s.empresas.length },
      { l: 'Ativas', v: s.empresasAtivas.length },
      { l: 'A pagar', v: fmtBRL(s.valorEmpresas) },
    ],
    colunas: ['Empresa', 'Categoria', 'Status', 'Valor'],
    linhas: s.empresas.map(e => [
      e.nomeFantasia || e.razaoSocial, e.categoria || '—', e.status || '—', fmtBRL(parseValorBR(e.valor)),
    ]),
    html, texto,
    json: { total: s.empresas.length, valor: s.valorEmpresas },
  }
}

function relatorioPrevisao(s) {
  // Sempre recalcula ao vivo (mesma fórmula da aba Previsão) — não confia em resumo antigo
  const calc = calcularPrevisaoCompleta()
  const r = {
    ...(s.previsaoResumo || {}),
    totalGeral: calc.totalGeral,
    orcDisponivel: calc.orcDisponivel,
    saldoFinal: calc.saldoFinal,
    pctUtilizado: calc.pctUtilizado,
    temOrcamento: calc.temOrcamento,
    totalEmpresas: calc.totalEmpresas,
    categorias: calc.categorias,
  }
  const cats = calc.categorias

  const pessoas = listaEquipeCompleta().filter(p => !ehMembroRedeLevePrevisao(p))
  const porCargo = resumoCargos(pessoas).filter(c => c.qtd > 0)
  const totalCargos = porCargo.reduce((sum, c) => sum + c.total, 0)
  const pessoasQtd = porCargo.reduce((sum, c) => sum + c.qtd, 0)

  const prev = loadPrevisao() || {}
  const freelas = Array.isArray(prev.ruaFreelancers) ? prev.ruaFreelancers : []
  const totalFreela = calc.totalFreelancers
  const qtdFreela = calc.qtdFreelancers
  const freelaRows = freelas.map(f => {
    const qtd = Math.max(0, parseNum(f.quantidade))
    const diaria = parseNum(f.valorDiario)
    const dias = parseNum(f.dias)
    const tot = totalLinhaFreelancer(f)
    return {
      nome: f.nome || `Equipe freela (${qtd} pess.)`,
      qtd, diaria, dias, tot,
    }
  }).filter(f => f.tot > 0 || f.nome)

  // Preview: categorias = cards da Previsão (Administrativo = só o cargo, não a soma adm.)
  const linhas = cats.length
    ? cats.map(c => [
      c.nome || c.name,
      c.qtd != null && c.qtd > 0 ? String(c.qtd) : '—',
      fmtBRL(c.valor || c.total),
      c.grupo || 'Categoria',
    ])
    : [
      ...porCargo.map(c => [c.cargo, String(c.qtd), fmtBRL(c.total), c.categoria]),
      ...(totalFreela > 0
        ? [[FREELANCER_CAT_NOME, String(qtdFreela), fmtBRL(totalFreela), 'Campo']]
        : []),
    ]

  const html = cabecalho('Previsão de gasto')
    + kpisHtml([
      { l: 'Previsto', v: fmtBRL(r.totalGeral) },
      { l: 'Orçamento', v: fmtBRL(r.orcDisponivel) },
      { l: 'Utilização', v: `${Math.round(r.pctUtilizado || 0)}%` },
      { l: 'Saldo', v: fmtBRL(r.saldoFinal) },
    ])
    + (cats.length
      ? '<h2>Categorias (mesma base da aba Previsão)</h2>' + tabelaHtml(['Categoria', 'Qtd', 'Valor', 'Grupo'],
        cats.map(c => [
          escHtml(c.nome || c.name),
          c.qtd != null && c.qtd > 0 ? String(c.qtd) : '—',
          escHtml(fmtBRL(c.valor || c.total)),
          escHtml(c.grupo || '—'),
        ]))
        + `<p class="meta">Equipe Adm. (soma Coordenador + Comunicação + Administrativo + Outro): ${escHtml(fmtBRL(calc.totalAdmin))}</p>`
      : '')
    + (porCargo.length
      ? '<h2>Equipe operacional por cargo</h2>' + tabelaHtml(['Cargo', 'Pessoas', 'Valor', 'Grupo'],
        porCargo.map(c => [
          escHtml(c.cargo), String(c.qtd), escHtml(fmtBRL(c.total)), escHtml(c.categoria),
        ]))
        + `<p class="meta">Subtotal equipe operacional: ${escHtml(fmtBRL(totalCargos))} · ${pessoasQtd} pessoa(s) · Comunidade WA excluída</p>`
      : '<p>Nenhum membro operacional com valor. Cadastre remunerações na Equipe / Previsão.</p>')
    + (freelaRows.length
      ? `<h2>${escHtml(FREELANCER_CAT_NOME)}</h2>`
        + tabelaHtml(['Nome', 'Qtd', 'Diária', 'Dias', 'Total'],
          freelaRows.map(f => [
            escHtml(f.nome), String(f.qtd), escHtml(fmtBRL(f.diaria)), String(f.dias), escHtml(fmtBRL(f.tot)),
          ]))
        + `<p class="meta">Subtotal freelancers: ${escHtml(fmtBRL(totalFreela))} · ${qtdFreela} pessoa(s) · qtd × diária × dias</p>`
      : '')

  const texto = [
    'PREVISÃO DE GASTO',
    `Total: ${fmtBRL(r.totalGeral)} · Orçamento: ${fmtBRL(r.orcDisponivel)}`,
    `Utilização: ${Math.round(r.pctUtilizado || 0)}% · Saldo: ${fmtBRL(r.saldoFinal)}`,
    '',
    'CATEGORIAS (igual Previsão)',
    ...cats.map(c => `${c.nome || c.name}: ${fmtBRL(c.valor || c.total)}${c.grupo ? ` [${c.grupo}]` : ''}`),
    `Equipe Adm. (agregado): ${fmtBRL(calc.totalAdmin)}`,
    '',
    'POR CARGO (operacional)',
    ...porCargo.map(c => `${c.cargo}: ${c.qtd} pessoa(s) · ${fmtBRL(c.total)} (${c.categoria})`),
    `Subtotal equipe: ${fmtBRL(totalCargos)}`,
    '',
    FREELANCER_CAT_NOME.toUpperCase(),
    ...freelaRows.map(f => `${f.nome}: ${f.qtd} × ${fmtBRL(f.diaria)} × ${f.dias}d = ${fmtBRL(f.tot)}`),
    `Subtotal freelancers: ${fmtBRL(totalFreela)}`,
  ].join('\n')

  return {
    titulo: 'Previsão de gasto',
    kpis: [
      { l: 'Previsto', v: fmtBRL(r.totalGeral || 0) },
      { l: 'Orçamento', v: fmtBRL(r.orcDisponivel || 0) },
      { l: 'Uso', v: `${Math.round(r.pctUtilizado || 0)}%` },
      { l: 'Equipe Adm.', v: fmtBRL(calc.totalAdmin) },
    ],
    colunas: ['Cargo / categoria', 'Qtd', 'Valor', 'Grupo'],
    linhas,
    html, texto,
    json: { ...r, porCargo, totalCargos, pessoasQtd, freelas: freelaRows, totalFreela, qtdFreela, totalAdmin: calc.totalAdmin },
  }
}

function relatorioCargosGastos(_s, filtros = {}) {
  const todas = coletarTodasLinhas()
  const filtradas = filtrarCargosGastos(todas, filtros)
  const totais = totaisLinhas(filtradas)
  const porCargo = resumoPorCargo(filtradas)
  const porCat = resumoPorCategoria(filtradas)

  const filtroDesc = []
  if (filtros.cargos?.length) filtroDesc.push(`Cargos: ${filtros.cargos.join(', ')}`)
  if (filtros.categorias?.length) filtroDesc.push(`Gastos: ${filtros.categorias.join(', ')}`)
  if (filtros.minValor != null && filtros.minValor !== '') filtroDesc.push(`Mín. ${fmtBRL(filtros.minValor)}`)
  if (filtros.maxValor != null && filtros.maxValor !== '') filtroDesc.push(`Máx. ${fmtBRL(filtros.maxValor)}`)
  if (filtros.soComValor) filtroDesc.push('Somente com valor')
  if (filtros.escopo === 'pessoas') filtroDesc.push('Só equipe')
  if (filtros.escopo === 'outros') filtroDesc.push('Só outros gastos')
  const sub = filtroDesc.length ? filtroDesc.join(' · ') : 'Todos os cargos e categorias'

  const rowsHtml = filtradas.map(l => [
    escHtml(l.nome),
    escHtml(l.cargo),
    escHtml(l.categoria),
    escHtml(fmtBRL(l.valor)),
    escHtml(fmtBRL(l.pago)),
    escHtml(fmtBRL(l.saldo)),
  ])

  const html = cabecalho('Cargos & gastos', sub)
    + kpisHtml([
      { l: 'Itens', v: totais.qtd },
      { l: 'Total', v: fmtBRL(totais.total) },
      { l: 'Pago', v: fmtBRL(totais.pago) },
      { l: 'Saldo', v: fmtBRL(totais.saldo) },
    ])
    + (porCargo.length
      ? '<h2>Por cargo</h2>' + tabelaHtml(['Cargo', 'Qtd', 'Total', 'Pago', 'Saldo'],
        porCargo.map(r => [escHtml(r.cargo), String(r.qtd), escHtml(fmtBRL(r.total)), escHtml(fmtBRL(r.pago)), escHtml(fmtBRL(r.saldo))]))
      : '')
    + (porCat.length
      ? '<h2>Por categoria de gasto</h2>' + tabelaHtml(['Categoria', 'Qtd', 'Total'],
        porCat.map(r => [escHtml(r.categoria), String(r.qtd), escHtml(fmtBRL(r.total))]))
      : '')
    + '<h2>Detalhamento</h2>'
    + tabelaHtml(['Nome / item', 'Cargo', 'Categoria', 'Valor', 'Pago', 'Saldo'], rowsHtml)

  const texto = [
    'CARGOS & GASTOS',
    sub,
    `Itens: ${totais.qtd} · Total: ${fmtBRL(totais.total)} · Pago: ${fmtBRL(totais.pago)} · Saldo: ${fmtBRL(totais.saldo)}`,
    '',
    'POR CARGO',
    ...porCargo.map(r => `${r.cargo}: ${r.qtd} · ${fmtBRL(r.total)}`),
    '',
    'POR CATEGORIA',
    ...porCat.map(r => `${r.categoria}: ${r.qtd} · ${fmtBRL(r.total)}`),
    '',
    'DETALHE',
    ...filtradas.map(l =>
      `• ${l.nome} | ${l.cargo} | ${l.categoria} | ${fmtBRL(l.valor)} (pago ${fmtBRL(l.pago)} / saldo ${fmtBRL(l.saldo)})`
    ),
  ].join('\n')

  return {
    titulo: 'Cargos & gastos',
    kpis: [
      { l: 'Itens', v: totais.qtd },
      { l: 'Total', v: fmtBRL(totais.total) },
      { l: 'Pago', v: fmtBRL(totais.pago) },
      { l: 'Saldo', v: fmtBRL(totais.saldo) },
    ],
    colunas: ['Nome / item', 'Cargo', 'Categoria', 'Valor', 'Pago', 'Saldo'],
    linhas: filtradas.map(l => [
      l.nome, l.cargo, l.categoria, fmtBRL(l.valor), fmtBRL(l.pago), fmtBRL(l.saldo),
    ]),
    html, texto,
    json: { filtros, totais, porCargo, porCat, linhas: filtradas },
  }
}

function relatorioRotas(s) {
  const rows = s.rotas.map(r => [
    escHtml(r.nome || r.titulo || 'Rota'),
    escHtml(r.status || '—'),
    String(paradasOperacionaisRota(r).length),
    escHtml((r.cidade || r.cidadeAtuacao || '—')),
  ])
  const html = cabecalho('Rotas de campo')
    + kpisHtml([
      { l: 'Rotas', v: s.rotas.length },
      { l: 'Paradas', v: s.paradasTotal },
      { l: 'Pendentes', v: s.paradasPendentes },
    ])
    + tabelaHtml(['Rota', 'Status', 'Paradas', 'Cidade'], rows)
  const texto = [
    'ROTAS',
    `Rotas: ${s.rotas.length} · Paradas pendentes: ${s.paradasPendentes}`,
  ].join('\n')
  return {
    titulo: 'Rotas de campo',
    kpis: [
      { l: 'Rotas', v: s.rotas.length },
      { l: 'Paradas', v: s.paradasTotal },
      { l: 'Pendentes', v: s.paradasPendentes },
    ],
    colunas: ['Rota', 'Status', 'Paradas', 'Cidade'],
    linhas: s.rotas.map(r => [
      r.nome || r.titulo || 'Rota', r.status || '—', paradasOperacionaisRota(r).length, r.cidade || '—',
    ]),
    html, texto,
    json: { rotas: s.rotas.length, paradasPendentes: s.paradasPendentes },
  }
}

function relatorioPesquisas(s, periodo) {
  const ativas = s.enquetes.filter(e => e.status === 'ativa').length
  const rows = s.enquetes.map(e => {
    const qtd = Array.isArray(s.respostasFlat)
      ? s.respostasFlat.filter(r => String(r.enqueteId || r.pesquisaId) === String(e.id)).length
      : 0
    return [escHtml(e.titulo || e.nome || 'Enquete'), escHtml(e.status || '—'), String(qtd)]
  })
  const html = cabecalho('Pesquisas & enquetes', periodo)
    + kpisHtml([
      { l: 'Enquetes', v: s.enquetes.length },
      { l: 'Ativas', v: ativas },
      { l: 'Respostas', v: s.respostasFlat.length },
      { l: 'Na semana', v: s.respostasSemana },
    ])
    + tabelaHtml(['Enquete', 'Status', 'Respostas'], rows)
  const texto = [
    'PESQUISAS',
    `Ativas: ${ativas} · Respostas: ${s.respostasFlat.length} · Semana: ${s.respostasSemana}`,
  ].join('\n')
  return {
    titulo: 'Pesquisas',
    kpis: [
      { l: 'Enquetes', v: s.enquetes.length },
      { l: 'Ativas', v: ativas },
      { l: 'Respostas', v: s.respostasFlat.length },
      { l: 'Semana', v: s.respostasSemana },
    ],
    colunas: ['Enquete', 'Status', 'Respostas'],
    linhas: s.enquetes.map(e => {
      const qtd = s.respostasFlat.filter(r => String(r.enqueteId || r.pesquisaId) === String(e.id)).length
      return [e.titulo || e.nome || 'Enquete', e.status || '—', qtd]
    }),
    html, texto,
    json: { enquetes: s.enquetes.length, ativas, respostas: s.respostasFlat.length },
  }
}
