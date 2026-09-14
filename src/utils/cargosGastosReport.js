/**
 * Relatório filtrável: valores (remuneração) por cargo e categoria de gasto.
 */

import {
  CARGOS, CARGO_ORDEM, normalizarCargo, categoriaPrevisaoLabel,
  listaEquipeCompleta, loadPrevisao, litrosTotalDoCarro, ehMembroRedeLevePrevisao,
} from './equipeSync'
import {
  loadFinanceiro, getFinanceiroMembro, totalPago, saldoDevedorEfetivo, valorContratoEfetivo,
} from './equipeFinanceiro'
import { readStorage } from './persist'
import {
  FREELANCER_CAT_NOME, totalLinhaFreelancer, loadRuaFreelancers, parseNum,
} from './equipeRuaFreelancer'

export const CATEGORIAS_GASTO = [
  'Equipe Administrativa',
  'Cabos Eleitorais',
  'Pessoal de Rua',
  'Apoiadores',
  'Multiplicadores',
  'Igreja',
  FREELANCER_CAT_NOME,
  'Comitês',
  'Combustível',
  'Empresas',
]

function parseValor(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, v)
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function valorPessoa(p) {
  const fromValor = parseValor(p?.valor)
  if (fromValor > 0) return fromValor
  return parseValor(p?.salario)
}

function nomeEmpresa(e) {
  return (e?.nomeFantasia || e?.razaoSocial || e?.nome || '').trim() || 'Empresa'
}

/** Linhas de pessoas (equipe) com valor e financeiro — exclui Comunidade WhatsApp / leads. */
export function coletarLinhasPessoas() {
  const pessoas = listaEquipeCompleta()
  const membros = readStorage('equipe_membros', [])
  const byId = Object.fromEntries(membros.map(m => [String(m.id), m]))
  const finMap = loadFinanceiro()

  return pessoas
    .filter(p => {
      const id = p.equipeId || p.id
      const m = byId[String(id)] || {}
      return !ehMembroRedeLevePrevisao({ ...m, ...p, id, cargo: p.cargo || m.cargo })
    })
    .map(p => {
    const id = p.equipeId || p.id
    const m = byId[String(id)] || {}
    const cargo = normalizarCargo(p.cargo || m.cargo)
    const valor = valorPessoa({ ...m, ...p, salario: m.salario ?? p.salario, valor: p.valor })
    const fin = getFinanceiroMembro(finMap, id)
    const contrato = valorContratoEfetivo(fin, { ...m, salario: valor || m.salario })
    const pago = totalPago(fin)
    const saldo = Math.max(0, saldoDevedorEfetivo(fin, { ...m, salario: valor || m.salario }))
    return {
      tipo: 'pessoa',
      id: String(id || p.nome),
      nome: p.nome || m.nome || '—',
      cargo,
      categoria: categoriaPrevisaoLabel(cargo),
      valor,
      pago,
      saldo,
      contrato,
      vinculo: m.vinculo || p.vinculo || '',
    }
  }).sort((a, b) => {
    const oa = CARGO_ORDEM[a.cargo] ?? 99
    const ob = CARGO_ORDEM[b.cargo] ?? 99
    if (oa !== ob) return oa - ob
    return String(a.nome).localeCompare(String(b.nome), 'pt-BR')
  })
}

/** Gastos agregados sem pessoa (freelancers, comitês, combustível, empresas) — mesma base da Previsão */
export function coletarLinhasOutrosGastos() {
  const prev = loadPrevisao() || {}
  const linhas = []

  const freelas = Array.isArray(prev.ruaFreelancers) ? prev.ruaFreelancers : loadRuaFreelancers()
  freelas.forEach((f, i) => {
    const valor = totalLinhaFreelancer(f)
    const qtd = Math.max(0, parseNum(f.quantidade))
    const diaria = parseNum(f.valorDiario)
    const dias = parseNum(f.dias)
    if (valor <= 0 && !f.nome) return
    linhas.push({
      tipo: 'outro',
      id: `freela-${f.id || i}`,
      nome: f.nome || `Equipe freela (${qtd} pess.)`,
      cargo: '—',
      categoria: FREELANCER_CAT_NOME,
      valor,
      pago: 0,
      saldo: valor,
      contrato: valor,
      vinculo: '',
      detalhe: `${qtd} × ${diaria} × ${dias} dias`,
    })
  })

  ;(prev.comites || []).forEach((c, i) => {
    const valor = parseValor(c.valorMensal ?? c.valor)
    if (valor <= 0 && !c.nome) return
    linhas.push({
      tipo: 'outro',
      id: `comite-${c.id || i}`,
      nome: c.nome || c.bairro || `Comitê ${i + 1}`,
      cargo: '—',
      categoria: 'Comitês',
      valor,
      pago: 0,
      saldo: valor,
      contrato: valor,
      vinculo: '',
    })
  })

  const preco = parseValor(prev.combPreco) || 0
  ;(prev.carros || []).forEach((c, i) => {
    const litros = litrosTotalDoCarro(c)
    const valor = litros * preco
    if (valor <= 0 && !c.nome && !c.placa) return
    linhas.push({
      tipo: 'outro',
      id: `comb-${c.id || i}`,
      nome: c.nome || c.placa || `Veículo ${i + 1}`,
      cargo: '—',
      categoria: 'Combustível',
      valor,
      pago: 0,
      saldo: valor,
      contrato: valor,
      vinculo: '',
    })
  })

  const empresas = readStorage('empresas_lista', [])
  empresas.filter(e => e.status !== 'inativa').forEach((e, i) => {
    const valor = parseValor(e.valor)
    linhas.push({
      tipo: 'outro',
      id: `emp-${e.id || i}`,
      nome: nomeEmpresa(e) === 'Empresa' ? `Empresa ${i + 1}` : nomeEmpresa(e),
      cargo: '—',
      categoria: 'Empresas',
      valor,
      pago: 0,
      saldo: valor,
      contrato: valor,
      vinculo: '',
    })
  })

  return linhas
}

export function coletarTodasLinhas() {
  return [...coletarLinhasPessoas(), ...coletarLinhasOutrosGastos()]
}

/**
 * @param {object} filtros
 * @param {string[]} [filtros.cargos] — vazio = todos (só pessoas)
 * @param {string[]} [filtros.categorias] — vazio = todas
 * @param {number|null} [filtros.minValor]
 * @param {number|null} [filtros.maxValor]
 * @param {boolean} [filtros.soComValor]
 * @param {'todos'|'pessoas'|'outros'} [filtros.escopo]
 */
export function filtrarCargosGastos(linhas, filtros = {}) {
  const cargos = new Set((filtros.cargos || []).filter(Boolean))
  const categorias = new Set((filtros.categorias || []).filter(Boolean))
  const min = filtros.minValor != null && filtros.minValor !== '' ? Number(filtros.minValor) : null
  const max = filtros.maxValor != null && filtros.maxValor !== '' ? Number(filtros.maxValor) : null
  const soComValor = Boolean(filtros.soComValor)
  const escopo = filtros.escopo || 'todos'

  return linhas.filter(l => {
    if (escopo === 'pessoas' && l.tipo !== 'pessoa') return false
    if (escopo === 'outros' && l.tipo !== 'outro') return false

    if (cargos.size > 0) {
      if (l.tipo !== 'pessoa') return false
      if (!cargos.has(l.cargo)) return false
    }
    if (categorias.size > 0 && !categorias.has(l.categoria)) return false
    if (soComValor && !(l.valor > 0)) return false
    if (min != null && Number.isFinite(min) && l.valor < min) return false
    if (max != null && Number.isFinite(max) && l.valor > max) return false
    return true
  })
}

export function resumoPorCargo(linhas) {
  const map = new Map()
  for (const l of linhas) {
    if (l.tipo !== 'pessoa') continue
    if (!map.has(l.cargo)) {
      map.set(l.cargo, { cargo: l.cargo, categoria: l.categoria, qtd: 0, total: 0, pago: 0, saldo: 0 })
    }
    const r = map.get(l.cargo)
    r.qtd += 1
    r.total += l.valor
    r.pago += l.pago
    r.saldo += l.saldo
  }
  return CARGOS
    .filter(c => map.has(c))
    .map(c => map.get(c))
}

export function resumoPorCategoria(linhas) {
  const map = new Map()
  for (const l of linhas) {
    if (!map.has(l.categoria)) {
      map.set(l.categoria, { categoria: l.categoria, qtd: 0, total: 0, pago: 0, saldo: 0 })
    }
    const r = map.get(l.categoria)
    r.qtd += 1
    r.total += l.valor
    r.pago += l.pago
    r.saldo += l.saldo
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

export function totaisLinhas(linhas) {
  return linhas.reduce((acc, l) => {
    acc.qtd += 1
    acc.total += l.valor
    acc.pago += l.pago
    acc.saldo += l.saldo
    return acc
  }, { qtd: 0, total: 0, pago: 0, saldo: 0 })
}

export function cargosComDados(linhas = coletarLinhasPessoas()) {
  const set = new Set(linhas.map(l => l.cargo))
  return CARGOS.filter(c => set.has(c))
}

export function categoriasComDados(linhas = coletarTodasLinhas()) {
  const set = new Set(linhas.map(l => l.categoria))
  return CATEGORIAS_GASTO.filter(c => set.has(c))
}
