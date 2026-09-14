/**
 * Fonte única dos totais da aba Previsão de Gastos.
 * Relatórios, Dashboard, Empresas e Freelancers devem usar isto
 * em vez de patches parciais em previsao_resumo.
 */

import { readStorage, writeStorage } from './persist'
import {
  loadPrevisao,
  mesclarEquipeNasListas,
  normalizarCargo,
  cargosAdmin,
  litrosTotalDoCarro,
} from './equipeSync'
import {
  FREELANCER_CAT_NOME,
  totalRuaFreelancers,
  qtdPessoasFreelancers,
} from './equipeRuaFreelancer'

const EMPRESAS_KEY = 'empresas_lista'

const EMPRESA_CAT_LABEL = {
  grafica: 'Gráfica / Material',
  comunicacao: 'Comunicação / Mídia',
  transporte: 'Transporte / Logística',
  alimentacao: 'Alimentação',
  juridico: 'Jurídico / Contábil',
  tecnologia: 'Tecnologia',
  evento: 'Eventos / Estrutura',
  outro: 'Outro',
}

/** Parse flexível (aceita "1500.5" e "1.500,50"). */
function num(v) {
  if (v === '' || v == null) return 0
  const s = String(v).trim()
  if (!s) return 0
  if (s.includes(',') && s.includes('.')) {
    const n = Number(s.replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(n) && n >= 0 ? n : 0
  }
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export function loadEmpresasParaPrevisao(empresasLista = null) {
  const lista = Array.isArray(empresasLista)
    ? empresasLista
    : (readStorage(EMPRESAS_KEY, []) || [])
  if (!Array.isArray(lista)) return []
  return lista
    .filter(e => e && e.status !== 'inativa' && num(e.valor) > 0)
    .map(e => ({
      id: e.id,
      nome: (e.nomeFantasia || e.razaoSocial || e.nome || 'Empresa').trim(),
      categoria: EMPRESA_CAT_LABEL[e.categoria] || e.categoria || 'Outro',
      valor: num(e.valor),
    }))
}

function sumValor(lista) {
  // Mesma regra da aba Previsão: Number(p.valor) — valores já vêm numéricos no storage
  return (lista || []).reduce((s, p) => s + (Number(p?.valor) || 0), 0)
}

function filtrarCargo(lista, cargo) {
  return (lista || []).filter(p => normalizarCargo(p.cargo) === cargo)
}

/**
 * Calcula totais e categorias iguais à aba Previsão.
 * @param {object|null} previsaoOverride — estado local da Previsão (já mesclado) ou null p/ ler storage
 * @param {object} [opts]
 * @param {array} [opts.empresas] — lista crua de empresas
 * @param {boolean} [opts.mesclarEquipe=false] — se true, sincroniza cargos/valores com a Equipe
 */
export function calcularPrevisaoCompleta(previsaoOverride = null, opts = {}) {
  const { empresas: empresasRaw = null, mesclarEquipe = false } = opts
  const base = previsaoOverride && typeof previsaoOverride === 'object'
    ? { ...loadPrevisao(), ...previsaoOverride }
    : loadPrevisao()
  const data = mesclarEquipe ? mesclarEquipeNasListas(base) : base

  const cabosPessoas = data.cabosPessoas || []
  const ruaPessoas = data.ruaPessoas || []
  const adminPessoas = data.adminPessoas || []
  const comites = data.comites || []
  const carros = data.carros || []
  const combPreco = num(data.combPreco)
  const ruaFreelancers = Array.isArray(data.ruaFreelancers) ? data.ruaFreelancers : []
  const dataInicio = data.dataInicio || ''
  const dataFim = data.dataFim || ''
  const orcDispNum = num(data.orcDisponivel)

  const pessoalRuaLista = filtrarCargo(ruaPessoas, 'Pessoal de Rua')
  const apoiadoresLista = filtrarCargo(ruaPessoas, 'Apoiador')
  const multiplicadoresLista = filtrarCargo(ruaPessoas, 'Multiplicador')
  const igrejaLista = filtrarCargo(ruaPessoas, 'Igreja')
  const ruaOutros = (ruaPessoas || []).filter(p => {
    const c = normalizarCargo(p.cargo)
    return !['Pessoal de Rua', 'Apoiador', 'Multiplicador', 'Igreja', 'Comunidade WhatsApp'].includes(c)
  })

  const totalCabos = sumValor(cabosPessoas)
  const totalPessoalRua = sumValor(pessoalRuaLista)
  const totalApoiadores = sumValor(apoiadoresLista)
  const totalMultiplicadores = sumValor(multiplicadoresLista)
  const totalIgreja = sumValor(igrejaLista)
  const totalRuaOutros = sumValor(ruaOutros)
  const totalRua = totalPessoalRua + totalApoiadores + totalMultiplicadores + totalIgreja + totalRuaOutros
  const totalAdmin = sumValor(adminPessoas)
  const totalFreelancers = totalRuaFreelancers(ruaFreelancers)
  const qtdFreelancers = qtdPessoasFreelancers(ruaFreelancers)
  const totalComite = (comites || []).reduce((s, c) => s + num(c.valorMensal ?? c.valor), 0)
  const totalComb = (carros || []).reduce((s, c) => s + litrosTotalDoCarro(c) * combPreco, 0)

  const empresasPrevisao = loadEmpresasParaPrevisao(empresasRaw)
  const totalEmpresas = empresasPrevisao.reduce((s, e) => s + e.valor, 0)

  const ordemAdmin = cargosAdmin()
  const adminPorCargo = []
  const grupos = {}
  for (const p of adminPessoas) {
    const cargo = normalizarCargo(p.cargo) || 'Outro'
    if (!grupos[cargo]) grupos[cargo] = []
    grupos[cargo].push(p)
  }
  for (const cargo of ordemAdmin) {
    const pessoas = grupos[cargo] || []
    adminPorCargo.push({
      cargo,
      pessoas,
      qtd: pessoas.length,
      total: sumValor(pessoas),
    })
  }
  for (const cargo of Object.keys(grupos).filter(c => !ordemAdmin.includes(c)).sort((a, b) => a.localeCompare(b, 'pt-BR'))) {
    const pessoas = grupos[cargo]
    adminPorCargo.push({
      cargo,
      pessoas,
      qtd: pessoas.length,
      total: sumValor(pessoas),
    })
  }

  const totalGeral = totalCabos + totalRua + totalFreelancers + totalComite + totalComb + totalAdmin + totalEmpresas
  const saldoFinal = orcDispNum - totalGeral
  const pctUtilizado = orcDispNum > 0 ? Math.min(100, (totalGeral / orcDispNum) * 100) : 0
  const temOrcamento = orcDispNum > 0

  // Categorias alinhadas aos cards da Previsão (Equipe Adm. quebrada por cargo)
  const categorias = [
    { nome: 'Cabos Eleitorais', valor: totalCabos, qtd: cabosPessoas.length, grupo: 'Campo' },
    { nome: 'Pessoal de Rua', valor: totalPessoalRua, qtd: pessoalRuaLista.length, grupo: 'Campo' },
    { nome: 'Apoiadores', valor: totalApoiadores, qtd: apoiadoresLista.length, grupo: 'Campo' },
    { nome: 'Multiplicadores', valor: totalMultiplicadores, qtd: multiplicadoresLista.length, grupo: 'Campo' },
    { nome: 'Igreja', valor: totalIgreja, qtd: igrejaLista.length, grupo: 'Campo' },
    ...(totalRuaOutros > 0
      ? [{ nome: 'Outros (rua)', valor: totalRuaOutros, qtd: ruaOutros.length, grupo: 'Campo' }]
      : []),
    { nome: FREELANCER_CAT_NOME, valor: totalFreelancers, qtd: qtdFreelancers, grupo: 'Campo' },
    { nome: 'Comitês', valor: totalComite, qtd: comites.length, grupo: 'Estrutura' },
    { nome: 'Combustível', valor: totalComb, qtd: carros.length, grupo: 'Estrutura' },
    ...adminPorCargo
      .filter(a => a.total > 0 || a.qtd > 0)
      .map(a => ({
        nome: a.cargo,
        valor: a.total,
        qtd: a.qtd,
        grupo: 'Equipe Adm.',
      })),
    { nome: 'Empresas', valor: totalEmpresas, qtd: empresasPrevisao.length, grupo: 'Rede' },
  ].filter(c => c.valor > 0)

  // Agregados do gráfico da Previsão (Equipe Adm. = soma dos cargos admin)
  const categoriasGrafico = [
    { nome: 'Cabos Eleitorais', valor: totalCabos, qtd: cabosPessoas.length },
    { nome: 'Pessoal de Rua', valor: totalPessoalRua, qtd: pessoalRuaLista.length },
    { nome: 'Rua Freelancer', valor: totalFreelancers, qtd: qtdFreelancers },
    { nome: 'Apoiadores', valor: totalApoiadores, qtd: apoiadoresLista.length },
    { nome: 'Multiplicadores', valor: totalMultiplicadores, qtd: multiplicadoresLista.length },
    { nome: 'Igreja', valor: totalIgreja, qtd: igrejaLista.length },
    { nome: 'Aluguel de Comitê', valor: totalComite, qtd: comites.length },
    { nome: 'Combustível', valor: totalComb, qtd: carros.length },
    { nome: 'Equipe Adm.', valor: totalAdmin, qtd: adminPessoas.length },
    { nome: 'Empresas', valor: totalEmpresas, qtd: empresasPrevisao.length },
  ]

  return {
    dataInicio,
    dataFim,
    totalGeral,
    orcDisponivel: orcDispNum,
    saldoFinal,
    pctUtilizado,
    temOrcamento,
    totalCabos,
    totalPessoalRua,
    totalApoiadores,
    totalMultiplicadores,
    totalIgreja,
    totalRuaOutros,
    totalRua,
    totalFreelancers,
    qtdFreelancers,
    totalComite,
    totalComb,
    totalAdmin,
    totalEmpresas,
    adminPorCargo,
    empresasPrevisao,
    categorias,
    categoriasGrafico,
    atualizadoEm: new Date().toISOString(),
  }
}

/** Grava previsao_resumo a partir do cálculo canônico (sem patch parcial). */
export function publicarPrevisaoResumo(previsaoOverride = null, opts = {}) {
  const c = calcularPrevisaoCompleta(previsaoOverride, opts)
  const resumo = {
    totalGeral: c.totalGeral,
    orcDisponivel: c.orcDisponivel,
    saldoFinal: c.saldoFinal,
    pctUtilizado: c.pctUtilizado,
    temOrcamento: c.temOrcamento,
    totalEmpresas: c.totalEmpresas,
    totalAdmin: c.totalAdmin,
    dataInicio: c.dataInicio,
    dataFim: c.dataFim,
    atualizadoEm: c.atualizadoEm,
    categorias: c.categorias,
  }
  writeStorage('previsao_resumo', resumo)
  return resumo
}
