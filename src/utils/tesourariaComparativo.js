import data2022 from '../data/tesouraria2022.json'
import { resumirCaixa, totaisPorCategoria, loadPrevisaoResumo, parseValor } from './tesouraria'
import { readStorage } from './persist'
import { totalRuaFreelancers, loadRuaFreelancers } from './equipeRuaFreelancer'

/** Mapeia categorias atuais ↔ referência 2022 para o comparativo. */
export const LINHAS_COMPARATIVO = [
  {
    id: 'pessoal',
    label: 'Pessoal / prestadores',
    hint: 'Equipe, diárias, cabos, freelancers',
    cats2022: ['Pessoa física / prestador'],
    catsCaixa: ['Pessoal / equipe'],
    catsPrevisao: [
      'Pessoal de rua',
      'Equipe de rua freelancer',
      'Cabos',
      'Apoiadores',
      'Multiplicadores',
      'Igreja',
      'Administrativo',
    ],
  },
  {
    id: 'grafica',
    label: 'Gráfica / comunicação',
    hint: 'Material impresso e visual',
    cats2022: ['Gráfica / Comunicação'],
    catsCaixa: ['Propaganda / gráfica'],
    catsPrevisao: [],
  },
  {
    id: 'midia',
    label: 'Mídia digital / ads',
    hint: 'Redes, anúncios, tráfego',
    cats2022: ['Mídia digital / Ads'],
    catsCaixa: ['Marketing digital / mídia'],
    catsPrevisao: [],
  },
  {
    id: 'servicos',
    label: 'Serviços / empresas',
    hint: 'Fornecedores PJ, comitês, empresas',
    cats2022: ['Serviços / empresas'],
    catsCaixa: ['Serviços / fornecedor', 'Serviços jurídicos / contábeis', 'Comitê / aluguel'],
    catsPrevisao: ['Empresas', 'Comitês'],
  },
  {
    id: 'eventos',
    label: 'Eventos / deslocamento',
    hint: 'Eventos, combustível, alimentação',
    cats2022: [],
    catsCaixa: ['Eventos / alimentação', 'Combustível / deslocamento'],
    catsPrevisao: ['Combustível'],
  },
]

function sumCats2022(names = []) {
  const cats = data2022.cats || []
  return names.reduce((s, name) => {
    const hit = cats.find(c => c.c === name)
    return s + (hit ? Number(hit.v) || 0 : 0)
  }, 0)
}

function sumCaixaPorCats(totais = [], nomes = [], tipo = 'saida') {
  const set = new Set(nomes)
  return totais
    .filter(t => t.tipo === tipo && set.has(t.categoria))
    .reduce((s, t) => s + (Number(t.total) || 0), 0)
}

function sumPrevisaoCats(resumo, nomes = []) {
  const cats = Array.isArray(resumo?.categorias) ? resumo.categorias : []
  const set = new Set(nomes)
  return cats
    .filter(c => set.has(c.nome))
    .reduce((s, c) => s + (Number(c.valor) || 0), 0)
}

export function pctDe(atual, ref) {
  const r = Number(ref) || 0
  if (r <= 0) return null
  return Math.min(999, ((Number(atual) || 0) / r) * 100)
}

/**
 * Monta o comparativo campanha atual × referência 2022.
 * @param {object[]} movimentos — lançamentos da tesouraria
 */
export function montarComparativoCampanha(movimentos = []) {
  const caixa = resumirCaixa(movimentos)
  const porCat = totaisPorCategoria(movimentos, { soConfirmados: true })
  const previsao = loadPrevisaoResumo()
  let freela = []
  let valorEmpresas = 0
  try { freela = loadRuaFreelancers() } catch { freela = [] }
  try {
    const empresas = readStorage('empresas_lista', [])
    valorEmpresas = (Array.isArray(empresas) ? empresas : [])
      .reduce((s, e) => s + parseValor(e.valor ?? e.valorContrato ?? 0), 0)
  } catch { valorEmpresas = 0 }

  const k22 = data2022.kpis || {}
  const ref = {
    entrada: Number(k22.entrada) || 0,
    saida: Number(k22.saida) || 0,
    despesas: Number(k22.despesas) || 0,
    tarifas: Number(k22.tarifa) || 0,
    empresas: Number(k22.empresas) || 0,
    pessoas: Number(k22.pessoas) || 0,
    periodo: 'Ago–Out/2022',
  }

  const orcado = Number(previsao?.totalGeral) || 0
  const orcadoDisponivel = Number(previsao?.orcDisponivel) || 0

  // Gasto “imputado” = caixa confirmado + previsão (se caixa ainda vazio em categoria usa previsão)
  const linhas = LINHAS_COMPARATIVO.map(cfg => {
    const ref2022 = sumCats2022(cfg.cats2022)
    const realizado = sumCaixaPorCats(porCat, cfg.catsCaixa, 'saida')
    let previsto = sumPrevisaoCats(previsao, cfg.catsPrevisao)
    if (cfg.id === 'servicos' && valorEmpresas > 0 && previsto === 0) previsto += valorEmpresas

    return {
      ...cfg,
      ref2022,
      realizado,
      previsto,
      exibido: realizado > 0 ? realizado : previsto,
      imputado: Math.max(realizado, previsto),
      pctRealizado: pctDe(realizado, ref2022),
      pctImputado: pctDe(Math.max(realizado, previsto), ref2022),
    }
  }).filter(l => l.ref2022 > 0 || l.realizado > 0 || l.previsto > 0)

  const macro = [
    {
      id: 'entradas',
      label: 'Entradas',
      atual: caixa.entradas,
      previsto: caixa.aReceber,
      referencia: ref.entrada,
      cor: '#34d399',
    },
    {
      id: 'saidas',
      label: 'Saídas (caixa)',
      atual: caixa.saidas,
      previsto: caixa.aPagar,
      referencia: ref.saida,
      cor: '#f87171',
    },
    {
      id: 'despesas',
      label: 'Gasto vs despesas 2022',
      atual: caixa.saidas,
      previsto: orcado,
      referencia: ref.despesas,
      cor: '#fbbf24',
      hint: 'Caixa atual × despesas oficiais 2022',
    },
    {
      id: 'orcamento',
      label: 'Previsão atual vs gasto 2022',
      atual: orcado,
      previsto: 0,
      referencia: ref.despesas,
      cor: '#a78bfa',
      hint: 'Total da Previsão de Gastos',
    },
  ].map(m => ({
    ...m,
    pct: pctDe(m.atual, m.referencia),
    pctComPrevisto: pctDe(m.atual + (m.previsto || 0), m.referencia),
  }))

  const ritmo = {
    pctCaixaVs2022: pctDe(caixa.saidas, ref.saida),
    pctOrcadoVs2022: pctDe(orcado, ref.despesas),
    pctEntradaVs2022: pctDe(caixa.entradas, ref.entrada),
    saldoAtual: caixa.saldo,
    orcado,
    orcadoDisponivel,
    freelaTotal: totalRuaFreelancers(freela),
  }

  return {
    ref,
    caixa,
    previsao,
    macro,
    linhas,
    ritmo,
    atualizadoEm: new Date().toISOString(),
  }
}

export function fmtPct(p) {
  if (p == null || !Number.isFinite(p)) return '—'
  return `${p.toFixed(p >= 10 ? 0 : 1)}%`
}
