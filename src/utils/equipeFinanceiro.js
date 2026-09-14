/** Controle financeiro dos membros: valor do contrato, pagamentos (PIX/etc),
 *  saldo devedor e arquivos (contratos e comprovantes) em base64.
 *  Guardado em chave própria para não inchar a lista de membros. */

import { readStorage, writeStorage } from './persist'

export const FINANCEIRO_KEY = 'equipe_financeiro'

/** Tamanho máximo por arquivo anexado (evita estourar o sync). ~4 MB. */
export const MAX_ARQUIVO_BYTES = 4 * 1024 * 1024

export const TIPOS_PAGAMENTO = ['PIX', 'Transferência', 'Dinheiro', 'Outro']

export function uidFin() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function loadFinanceiro() {
  const data = readStorage(FINANCEIRO_KEY, {})
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
}

export function saveFinanceiro(map) {
  writeStorage(FINANCEIRO_KEY, map || {})
}

export function financeiroVazio() {
  return { valorContrato: '', pagamentos: [], contratos: [] }
}

function resolveFinEntry(map, membroId) {
  if (!map || membroId == null || membroId === '') return null
  if (map[membroId] && typeof map[membroId] === 'object') return { key: membroId, fin: map[membroId] }
  const sid = String(membroId)
  if (map[sid] && typeof map[sid] === 'object') return { key: sid, fin: map[sid] }
  return null
}

/** True se há valor de contrato > 0 (ignora "0", "0,00", vazio). */
export function valorContratoPreenchido(v) {
  const s = String(v ?? '').trim()
  if (!s) return false
  return parseValor(s) > 0
}

/** Pagamentos com valor ou contratos anexados de verdade. */
export function temMovimentoFinanceiro(fin) {
  const pags = (fin?.pagamentos || []).filter(p => parseValor(p?.valor) > 0)
  const contratos = (fin?.contratos || []).filter(c => c && (c.dados || c.nome))
  return pags.length > 0 || contratos.length > 0
}

export function getFinanceiroMembro(map, membroId) {
  const hit = resolveFinEntry(map, membroId)
  if (!hit) return financeiroVazio()
  const f = hit.fin
  const raw = f.valorContrato
  const contrato = valorContratoPreenchido(raw) ? String(raw).trim() : ''
  return {
    valorContrato: contrato,
    pagamentos: Array.isArray(f.pagamentos) ? f.pagamentos : [],
    contratos: Array.isArray(f.contratos) ? f.contratos : [],
  }
}

export function setFinanceiroMembro(map, membroId, fin) {
  const next = { ...(map || {}) }
  const sid = String(membroId)
  // Remove chaves duplicadas (número vs string)
  if (membroId !== sid && Object.prototype.hasOwnProperty.call(next, membroId)) {
    delete next[membroId]
  }
  const contratoLimpo = valorContratoPreenchido(fin?.valorContrato)
    ? String(fin.valorContrato).trim()
    : ''
  const temDado = fin && (
    contratoLimpo ||
    (fin.pagamentos && fin.pagamentos.length) ||
    (fin.contratos && fin.contratos.length)
  )
  if (temDado) {
    next[sid] = {
      valorContrato: contratoLimpo,
      pagamentos: fin.pagamentos || [],
      contratos: fin.contratos || [],
    }
  } else {
    delete next[sid]
    delete next[membroId]
  }
  return next
}

/**
 * Converte valor monetário em número.
 * Aceita formatos BR (1.234,56 / 1.234) e US/plain (1234.56 / 4000.00).
 * Bug antigo: remover todos os pontos transformava "4000.00" em 400000.
 */
export function parseValor(v) {
  let s = String(v ?? '').trim()
  if (!s) return 0
  s = s.replace(/[R$\s]/gi, '')
  if (!s) return 0

  const temVirgula = s.includes(',')
  const temPonto = s.includes('.')

  if (temVirgula && temPonto) {
    // BR: 1.234.567,89 → remove milhares, vírgula vira decimal
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (temVirgula) {
    // BR: 1234,56 ou 4,5
    s = s.replace(',', '.')
  } else if (temPonto) {
    const partes = s.split('.')
    // Último grupo com 1–2 dígitos = decimal US (4000.00 / 12.5)
    // Caso contrário = milhar BR (1.234 ou 1.234.567)
    const ultima = partes[partes.length - 1]
    if (partes.length === 2 && ultima.length <= 2) {
      // já está no formato decimal JS
    } else {
      s = s.replace(/\./g, '')
    }
  }

  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

export function totalPago(fin) {
  return (fin?.pagamentos || []).reduce((acc, p) => acc + parseValor(p.valor), 0)
}

export function valorContratoNum(fin) {
  return parseValor(fin?.valorContrato)
}

/**
 * Valor do contrato exibido no saldo.
 * Sem lançamentos: a remuneração manda — se foi zerada, NÃO usa valorContrato antigo (saldo fantasma).
 * Com pagamentos/contratos: usa valorContrato se definido, senão remuneração.
 */
export function valorContratoEfetivo(fin, membro) {
  const salarioNum = parseValor(membro?.salario)
  const contratoStr = String(fin?.valorContrato ?? '').trim()
  const contratoNum = contratoStr !== '' ? parseValor(contratoStr) : 0
  const movimento = temMovimentoFinanceiro(fin)

  if (!movimento) {
    // Remuneração removida/zerada → saldo 0 (ignora cópia antiga no financeiro)
    if (salarioNum <= 0) return 0
    if (contratoStr !== '') return contratoNum
    return salarioNum
  }

  if (contratoStr !== '') return contratoNum
  return salarioNum
}

export function saldoDevedorEfetivo(fin, membro) {
  return valorContratoEfetivo(fin, membro) - totalPago(fin)
}

export function saldoDevedor(fin) {
  return valorContratoNum(fin) - totalPago(fin)
}

export function progressoPct(fin) {
  const total = valorContratoNum(fin)
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, (totalPago(fin) / total) * 100))
}

/**
 * Alinha financeiro com a remuneração do cadastro.
 * Sem lançamentos: valorContrato acompanha o salário (vazio se remuneração zerada).
 * @returns {boolean} true se gravou alteração
 */
export function reconciliarFinanceiroComSalario(membroId, salario) {
  if (membroId == null || membroId === '') return false
  const mapa = loadFinanceiro()
  const fin = getFinanceiroMembro(mapa, membroId)
  if (temMovimentoFinanceiro(fin)) return false

  const salNum = parseValor(salario)
  const novoValor = salNum > 0 ? String(salNum) : ''
  const atualNum = parseValor(fin.valorContrato)

  if (atualNum === salNum && ((salNum > 0) === valorContratoPreenchido(fin.valorContrato))) {
    return false
  }

  const atualizado = setFinanceiroMembro(mapa, membroId, { ...fin, valorContrato: novoValor })
  saveFinanceiro(atualizado)
  return true
}

/**
 * Remove saldos fantasmas: remuneração zerada + sem lançamentos, mas valorContrato ainda gravado.
 * Chamar ao abrir Equipe / após sync.
 */
export function curarFinanceiroComEquipe(equipeLista = null) {
  let membros = equipeLista
  if (!Array.isArray(membros)) {
    try {
      const raw = readStorage('equipe_membros', [])
      membros = Array.isArray(raw) ? raw : []
    } catch {
      membros = []
    }
  }

  let mapa = loadFinanceiro()
  let changed = false

  for (const m of membros) {
    if (!m?.id) continue
    const fin = getFinanceiroMembro(mapa, m.id)
    if (temMovimentoFinanceiro(fin)) continue
    const salNum = parseValor(m.salario)
    const contratoNum = parseValor(fin.valorContrato)
    if (salNum <= 0 && (contratoNum > 0 || String(fin.valorContrato ?? '').trim())) {
      mapa = setFinanceiroMembro(mapa, m.id, { ...fin, valorContrato: '' })
      changed = true
    }
  }

  if (changed) saveFinanceiro(mapa)
  return changed
}

export function fmtMoeda(v) {
  const n = typeof v === 'number' ? v : parseValor(v)
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function fmtData(iso) {
  if (!iso) return ''
  try {
    return new Date(String(iso).slice(0, 10) + 'T12:00').toLocaleDateString('pt-BR')
  } catch {
    return String(iso)
  }
}

export function hojeIso() {
  return new Date().toISOString().slice(0, 10)
}

/** Lê um File e retorna { nome, tipo, tamanho, dados(base64) } ou erro. */
export function lerArquivoBase64(file) {
  return new Promise((resolve) => {
    if (!file) return resolve({ erro: 'Nenhum arquivo selecionado' })
    if (file.size > MAX_ARQUIVO_BYTES) {
      return resolve({ erro: `Arquivo muito grande (máx. ${Math.round(MAX_ARQUIVO_BYTES / 1024 / 1024)} MB)` })
    }
    const reader = new FileReader()
    reader.onload = ev => resolve({
      nome: file.name || 'arquivo',
      tipo: file.type || '',
      tamanho: file.size || 0,
      dados: ev.target.result,
    })
    reader.onerror = () => resolve({ erro: 'Falha ao ler arquivo' })
    reader.readAsDataURL(file)
  })
}

export function fmtTamanho(bytes) {
  const b = Number(bytes) || 0
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}
