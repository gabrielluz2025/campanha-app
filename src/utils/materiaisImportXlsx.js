/**
 * Importação de entradas de material a partir de planilha Excel
 * (formato: Data | Material | Quantidade — ex.: "Entrada de materiais - Campanha Ismael.xlsx").
 */

import { normNomeMaterial, desmarcarMaterialRemovido } from './materiaisCatalog'
import { KEY_ESTOQUE } from './materiaisRetirada'
import { KEY_ENTRADAS, loadEntradas } from './materiaisMovimentos'
import { writeStorage } from './persist'

async function loadXlsx() {
  return import('xlsx')
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

/** Excel serial ou string BR/ISO → YYYY-MM-DD */
export function parseDataCelula(v, XLSX) {
  if (v == null || v === '') return ''
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof v === 'number' && Number.isFinite(v) && v > 30000) {
    const parsed = XLSX?.SSF?.parse_date_code?.(v)
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
    }
  }
  const s = String(v).trim()
  const br = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/)
  if (br) {
    let y = br[3]
    if (y.length === 2) y = `20${y}`
    return `${y}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return ''
}

/** Separa "Material + Fornecedor ***" */
export function parseMaterialCelula(raw) {
  let s = String(raw || '').trim()
  s = s.replace(/\s*\*+\s*$/g, '').trim()
  const partes = s.split('+').map(p => p.trim()).filter(Boolean)
  const base = partes[0] || s
  const fornecedor = partes.slice(1).join(' + ')
  return { base, fornecedor, textoOriginal: String(raw || '').trim() }
}

export function formatarNomeMaterialImport(nomeBase) {
  return String(nomeBase || '').trim().toUpperCase()
}

export function inferirCategoriaMaterial(nome) {
  const n = normNomeMaterial(nome)
  if (/santinho|colinha/.test(n)) return 'Santinhos'
  if (/carta|cartas/.test(n)) return 'Carta'
  if (/adesivo.*bolacha|^bolacha/.test(n)) return 'Adesivos'
  if (/parabrisa/.test(n)) return 'Parabrisa'
  if (/parachoque/.test(n)) return 'Parachoque'
  if (/botton/.test(n)) return 'Botton'
  if (/flyer|panfleto/.test(n)) return 'Panfletos'
  if (/wind banner/.test(n)) return 'Wind banner'
  if (/bandeira/.test(n)) return 'Bandeira'
  if (/banner/.test(n)) return 'Outros'
  return 'Outros'
}

function normHeader(h) {
  return String(h || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function detectarCabecalho(rows) {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const row = rows[i] || []
    const cols = row.map(normHeader)
    const idxData = cols.findIndex(c => c === 'data' || c.startsWith('data'))
    const idxMat = cols.findIndex(c => c.includes('material') || c === 'item' || c === 'produto')
    const idxQtd = cols.findIndex(c =>
      c.includes('quant') || c === 'qtd' || c === 'qtde' || c === 'unidades',
    )
    if (idxMat >= 0 && idxQtd >= 0) {
      return { headerRow: i, idxData, idxMat, idxQtd }
    }
  }
  return { headerRow: 0, idxData: 0, idxMat: 1, idxQtd: 2 }
}

export function encontrarItemPorNome(itens = [], nomeMaterial) {
  const alvo = normNomeMaterial(nomeMaterial)
  if (!alvo) return null
  return (itens || []).find(i => normNomeMaterial(i.nome) === alvo) || null
}

function isoComHorario(dataYmd) {
  if (!dataYmd) return new Date().toISOString()
  return `${dataYmd}T12:00:00.000Z`
}

/**
 * Lê .xlsx no formato da planilha de entradas (Data, Material, Quantidade).
 */
export async function lerArquivoEntradasMateriaisXlsx(file) {
  if (!file) throw new Error('Nenhum arquivo selecionado.')
  const XLSX = await loadXlsx()
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames.find(n => /nota|entrada|material/i.test(n))
    || wb.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' })
  if (!rows.length) throw new Error('Planilha vazia.')

  const { headerRow, idxData, idxMat, idxQtd } = detectarCabecalho(rows)
  const linhas = []

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] || []
    const matRaw = row[idxMat]
    const qtdRaw = row[idxQtd]
    const dataRaw = idxData >= 0 ? row[idxData] : ''

    if (!matRaw && !qtdRaw) continue
    const qtd = Number(String(qtdRaw).replace(/\./g, '').replace(',', '.')) || 0
    if (!matRaw || qtd <= 0) continue

    const { base, fornecedor, textoOriginal } = parseMaterialCelula(matRaw)
    const nomeMaterial = formatarNomeMaterialImport(base)
    const data = parseDataCelula(dataRaw, XLSX)
    const categoria = inferirCategoriaMaterial(base)

    linhas.push({
      key: `${i}-${normNomeMaterial(nomeMaterial)}-${data}-${qtd}-${normNomeMaterial(fornecedor)}`,
      incluir: true,
      linhaPlanilha: i + 1,
      data,
      dataRaw: dataRaw != null && dataRaw !== '' ? String(dataRaw) : '',
      nomeMaterial,
      nomeOriginal: textoOriginal,
      fornecedor,
      quantidade: qtd,
      categoria,
      aviso: data ? '' : 'Data não reconhecida — será usada a data de hoje',
    })
  }

  if (!linhas.length) {
    throw new Error('Nenhuma entrada válida encontrada. Verifique colunas Data, Material e Quantidade.')
  }
  return linhas
}

export function classificarLinhaImportacao(itens = [], linha = {}) {
  const existente = encontrarItemPorNome(itens, linha.nomeMaterial)
  return {
    status: existente ? 'existente' : 'novo',
    itemId: existente?.id || null,
    itemNome: existente?.nome || linha.nomeMaterial,
    estoqueAtual: Number(existente?.quantidade) || 0,
  }
}

export function resumoImportEntradas(linhas = []) {
  const ativas = linhas.filter(l => l.incluir !== false)
  const materiais = new Map()
  let semData = 0
  let totalUn = 0
  let novos = 0
  let existentes = 0

  for (const l of ativas) {
    totalUn += Number(l.quantidade) || 0
    if (!l.data) semData++
    const k = normNomeMaterial(l.nomeMaterial)
    if (!materiais.has(k)) materiais.set(k, { novo: l.status === 'novo', count: 0 })
    materiais.get(k).count++
    if (l.status === 'novo') novos++
    else existentes++
  }

  return {
    total: linhas.length,
    selecionadas: ativas.length,
    materiaisDistintos: materiais.size,
    materiaisNovos: [...materiais.values()].filter(m => m.novo).length,
    totalUnidades: totalUn,
    semData,
  }
}

/**
 * Aplica entradas selecionadas: cria materiais novos, soma estoque e grava histórico.
 */
export function aplicarImportEntradasMateriais({
  linhas = [],
  itens = [],
  usuarioNome = '',
  usuarioEmail = '',
} = {}) {
  const selecionadas = linhas.filter(l => l.incluir !== false)
  if (!selecionadas.length) {
    return { ok: false, erro: 'Nenhuma linha selecionada.' }
  }

  const agora = new Date().toISOString()
  const itensMap = new Map((itens || []).map(i => [String(i.id), { ...i }]))
  const porNome = new Map()
  for (const i of itensMap.values()) {
    porNome.set(normNomeMaterial(i.nome), String(i.id))
  }

  const novasEntradas = []
  let criados = 0
  let entradasOk = 0

  for (const lin of selecionadas) {
    const qtd = Number(lin.quantidade) || 0
    if (qtd <= 0) continue

    let itemId = lin.itemId
    if (!itemId) {
      const existId = porNome.get(normNomeMaterial(lin.nomeMaterial))
      if (existId) itemId = existId
    }

    if (!itemId) {
      itemId = uid()
      const novo = {
        id: itemId,
        nome: lin.itemNome || lin.nomeMaterial,
        categoria: lin.categoria || inferirCategoriaMaterial(lin.nomeMaterial),
        quantidade: 0,
        estoqueMinimo: 0,
        noFormulario: true,
        criadoEm: agora,
        atualizadoEm: agora,
      }
      itensMap.set(String(itemId), novo)
      porNome.set(normNomeMaterial(novo.nome), String(itemId))
      criados++
    }

    const item = itensMap.get(String(itemId))
    if (!item) continue

    item.quantidade = (Number(item.quantidade) || 0) + qtd
    item.atualizadoEm = agora

    novasEntradas.push({
      id: uid(),
      itemId: item.id,
      itemNome: item.nome,
      quantidade: qtd,
      tipo: 'entrada',
      data: isoComHorario(lin.data),
      registradoPor: String(usuarioNome || 'Importação planilha').trim(),
      registradoPorEmail: String(usuarioEmail || '').trim(),
      fornecedor: String(lin.fornecedor || '').trim(),
      observacao: lin.fornecedor
        ? `Planilha · ${lin.fornecedor}${lin.nomeOriginal !== lin.nomeMaterial ? '' : ''}`
        : 'Importação planilha',
      origem: 'planilha',
      linhaPlanilha: lin.linhaPlanilha,
    })
    entradasOk++
  }

  const itensFinal = [...itensMap.values()]
  for (const item of itensFinal) {
    try { desmarcarMaterialRemovido(item) } catch { /* ignore */ }
  }
  const entradasAtual = [...novasEntradas, ...loadEntradas()]
  writeStorage(KEY_ESTOQUE, itensFinal, { force: true })
  writeStorage(KEY_ENTRADAS, entradasAtual, { force: true })

  return {
    ok: true,
    itens: itensFinal,
    entradas: entradasAtual,
    resumo: {
      entradas: entradasOk,
      materiaisCriados: criados,
      unidades: selecionadas.reduce((s, l) => s + (Number(l.quantidade) || 0), 0),
    },
  }
}
