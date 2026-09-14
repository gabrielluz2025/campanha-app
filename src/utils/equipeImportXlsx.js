/**
 * Template XLSX e importação em lote de membros da Equipe.
 * - Baixa planilha com colunas do cadastro
 * - Importa várias linhas de uma vez
 * - Se o membro já existir (CPF ou nome+telefone), só preenche campos vazios
 */
import {
  CARGOS, uid, normalizarCargo, normalizarCombustivelMembro, COMBUSTIVEL_VAZIO,
} from './equipeSync'

export const EQUIPE_XLSX_SHEET = 'Membros'

/** Colunas do template (chave interna → cabeçalho no Excel). */
export const EQUIPE_XLSX_COLS = [
  { key: 'nome', header: 'Nome*', exemplo: 'Maria Silva' },
  { key: 'cargo', header: 'Cargo', exemplo: 'Apoiador' },
  { key: 'vinculo', header: 'Vinculo', exemplo: 'Voluntário' },
  { key: 'telefone', header: 'Telefone', exemplo: '(47) 99999-0000' },
  { key: 'cpf', header: 'CPF', exemplo: '000.000.000-00' },
  { key: 'dataNascimento', header: 'Data Nascimento', exemplo: '15/03/1990' },
  { key: 'cep', header: 'CEP', exemplo: '89010-000' },
  { key: 'logradouro', header: 'Logradouro', exemplo: 'Rua XV de Novembro' },
  { key: 'numero', header: 'Numero', exemplo: '100' },
  { key: 'complemento', header: 'Complemento', exemplo: 'Apto 12' },
  { key: 'bairroResidencia', header: 'Bairro Residencia', exemplo: 'Centro' },
  { key: 'cidade', header: 'Cidade', exemplo: 'Blumenau' },
  { key: 'estado', header: 'Estado', exemplo: 'SC' },
  { key: 'bairros', header: 'Bairros Atuacao', exemplo: 'Centro, Velha, Itoupava' },
  { key: 'salario', header: 'Remuneracao', exemplo: '1500' },
  { key: 'dataInicio', header: 'Data Inicio', exemplo: '01/01/2026' },
  { key: 'contrato', header: 'Contrato', exemplo: 'CT-001' },
  { key: 'banco', header: 'Banco', exemplo: 'Banco do Brasil' },
  { key: 'agencia', header: 'Agencia', exemplo: '1234-5' },
  { key: 'conta', header: 'Conta', exemplo: '12345-6' },
  { key: 'pix', header: 'PIX', exemplo: '000.000.000-00' },
  { key: 'indicacaoPor', header: 'Indicacao Por', exemplo: 'João Coordenador' },
  { key: 'observacoes', header: 'Observacoes', exemplo: '' },
  { key: 'combustivelAtivo', header: 'Combustivel Ativo', exemplo: 'Não' },
  { key: 'combustivelVeiculo', header: 'Veiculo', exemplo: 'Fiat Uno ABC1D23' },
  { key: 'combustivelLitros', header: 'Litros Mes', exemplo: '40' },
]

const VINCULOS_OK = new Set([
  'Voluntário', 'CLT', 'PJ', 'Autônomo', 'Estagiário', 'Comissionado', 'Outro',
])

async function loadXlsx() {
  return import('xlsx')
}

function onlyDigits(v) {
  return String(v ?? '').replace(/\D/g, '')
}

function normNome(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function toTitleCase(s) {
  return String(s || '').replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase())
}

function formatTel(v) {
  const d = onlyDigits(v).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`
}

function formatCpf(v) {
  const d = onlyDigits(v).slice(0, 11)
  if (d.length !== 11) return d ? d : ''
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

function formatCep(v) {
  const d = onlyDigits(v).slice(0, 8)
  if (d.length !== 8) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

/** Excel serial date ou string BR/ISO → YYYY-MM-DD */
function parseDataCell(v, XLSX) {
  if (v == null || v === '') return ''
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    const parsed = XLSX?.SSF?.parse_date_code?.(v)
    if (parsed) {
      const y = parsed.y
      const m = String(parsed.m).padStart(2, '0')
      const d = String(parsed.d).padStart(2, '0')
      return `${y}-${m}-${d}`
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

function parseSimNao(v) {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return false
  return ['sim', 's', 'yes', 'y', '1', 'true', 'ativo', 'x'].includes(s)
}

function parseBairros(v) {
  if (Array.isArray(v)) return v.map(b => String(b || '').trim()).filter(Boolean)
  return String(v || '')
    .split(/[,;|/]/)
    .map(b => toTitleCase(b.trim()))
    .filter(Boolean)
}

function parseSalario(v) {
  if (v === '' || v == null) return ''
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  const s = String(v).replace(/[R$\s]/gi, '').trim()
  if (!s) return ''
  let n
  if (s.includes(',')) n = parseFloat(s.replace(/\./g, '').replace(',', '.'))
  else if (/^\d+\.\d{1,2}$/.test(s)) n = parseFloat(s)
  else if (s.includes('.')) n = parseFloat(s.replace(/\./g, ''))
  else n = parseFloat(s)
  return Number.isFinite(n) ? String(n) : ''
}

function normalizarVinculo(v) {
  const raw = String(v || '').trim()
  if (!raw) return 'Voluntário'
  if (VINCULOS_OK.has(raw)) return raw
  const hit = [...VINCULOS_OK].find(x => normNome(x) === normNome(raw))
  return hit || 'Outro'
}

function isEmptyValue(val) {
  if (val == null) return true
  if (typeof val === 'string') return val.trim() === ''
  if (Array.isArray(val)) return val.length === 0
  if (typeof val === 'object' && 'ativo' in val) {
    return !val.ativo && !val.veiculo && !val.litrosMes
  }
  return false
}

function headerMapFromRow(row0) {
  const map = {}
  const headers = EQUIPE_XLSX_COLS.map(c => ({
    key: c.key,
    variants: [
      normNome(c.header),
      normNome(c.header.replace(/\*$/, '')),
      normNome(c.key),
    ],
  }))
  Object.keys(row0 || {}).forEach(h => {
    const nh = normNome(h)
    const col = headers.find(c => c.variants.includes(nh) || c.variants.some(v => nh === v.replace(/\*$/, '')))
    if (col) map[h] = col.key
  })
  return map
}

function rowToPartial(raw, colMap, XLSX) {
  const get = (key) => {
    const header = Object.keys(colMap).find(h => colMap[h] === key)
    if (header != null) return raw[header]
    return raw[key]
  }

  const nome = toTitleCase(String(get('nome') ?? '').trim())
  if (!nome) return null

  const combustivelAtivo = parseSimNao(get('combustivelAtivo'))
  const veiculo = String(get('combustivelVeiculo') ?? '').trim()
  const litros = String(get('combustivelLitros') ?? '').trim()

  return {
    nome,
    cargo: normalizarCargo(get('cargo') || 'Voluntário'),
    vinculo: normalizarVinculo(get('vinculo')),
    telefone: formatTel(get('telefone')),
    cpf: formatCpf(get('cpf')),
    dataNascimento: parseDataCell(get('dataNascimento'), XLSX),
    cep: formatCep(get('cep')),
    logradouro: toTitleCase(String(get('logradouro') ?? '').trim()),
    numero: String(get('numero') ?? '').trim(),
    complemento: toTitleCase(String(get('complemento') ?? '').trim()),
    bairroResidencia: toTitleCase(String(get('bairroResidencia') ?? '').trim()),
    cidade: toTitleCase(String(get('cidade') ?? '').trim()),
    estado: String(get('estado') ?? '').trim().toUpperCase().slice(0, 2),
    bairros: parseBairros(get('bairros')),
    salario: parseSalario(get('salario')),
    dataInicio: parseDataCell(get('dataInicio'), XLSX),
    contrato: String(get('contrato') ?? '').trim(),
    banco: String(get('banco') ?? '').trim(),
    agencia: String(get('agencia') ?? '').trim(),
    conta: String(get('conta') ?? '').trim(),
    pix: String(get('pix') ?? '').trim(),
    indicacaoPor: toTitleCase(String(get('indicacaoPor') ?? '').trim()),
    indicacaoMembroId: '',
    observacoes: String(get('observacoes') ?? '').trim(),
    combustivel: combustivelAtivo || veiculo || litros
      ? {
          ativo: combustivelAtivo || Boolean(veiculo || litros),
          veiculo,
          litrosMes: litros,
        }
      : { ...COMBUSTIVEL_VAZIO },
  }
}

const MERGE_KEYS = [
  'cargo', 'vinculo', 'telefone', 'cpf', 'dataNascimento',
  'cep', 'logradouro', 'numero', 'complemento', 'bairroResidencia',
  'cidade', 'estado', 'bairros', 'salario', 'dataInicio', 'contrato',
  'banco', 'agencia', 'conta', 'pix',
  'indicacaoPor', 'observacoes',
]

/**
 * Preenche só campos vazios no existente; não sobrescreve dados já preenchidos.
 * Retorna { membro, mudou }.
 */
export function mesclarMembroVazios(existente, incoming) {
  let mudou = false
  const out = { ...existente }

  for (const key of MERGE_KEYS) {
    const cur = out[key]
    const next = incoming[key]
    if (isEmptyValue(cur) && !isEmptyValue(next)) {
      out[key] = next
      mudou = true
    }
  }

  if (!out.indicacaoMembroId && isEmptyValue(out.indicacaoPor) && !isEmptyValue(incoming.indicacaoPor)) {
    out.indicacaoPor = incoming.indicacaoPor
    out.indicacaoMembroId = ''
    mudou = true
  }

  const combCur = normalizarCombustivelMembro(out)
  const combIn = normalizarCombustivelMembro(incoming)
  if (!combCur.ativo && combIn.ativo) {
    out.combustivel = { ...combIn }
    mudou = true
  } else if (combCur.ativo) {
    const patched = { ...combCur }
    if (isEmptyValue(patched.veiculo) && !isEmptyValue(combIn.veiculo)) {
      patched.veiculo = combIn.veiculo
      mudou = true
    }
    if (isEmptyValue(patched.litrosMes) && !isEmptyValue(combIn.litrosMes)) {
      patched.litrosMes = combIn.litrosMes
      mudou = true
    }
    out.combustivel = patched
  }

  return { membro: out, mudou }
}

/** Encontra índice do membro existente: CPF > nome+tel > nome único. */
export function encontrarMembroExistente(lista, partial) {
  const cpf = onlyDigits(partial.cpf)
  if (cpf.length === 11) {
    const i = lista.findIndex(m => onlyDigits(m.cpf) === cpf)
    if (i >= 0) return i
  }
  const nome = normNome(partial.nome)
  const tel = onlyDigits(partial.telefone)
  if (nome && tel.length >= 10) {
    const i = lista.findIndex(
      m => normNome(m.nome) === nome && onlyDigits(m.telefone).slice(-8) === tel.slice(-8),
    )
    if (i >= 0) return i
  }
  if (nome) {
    const matches = lista
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => normNome(m.nome) === nome)
    if (matches.length === 1) return matches[0].i
  }
  return -1
}

export async function baixarTemplateEquipeXlsx() {
  const XLSX = await loadXlsx()
  const headers = EQUIPE_XLSX_COLS.map(c => c.header)
  const exemplo = EQUIPE_XLSX_COLS.map(c => c.exemplo)
  const instrucoes = [
    ['Instruções'],
    ['1. Preencha uma linha por membro na aba "Membros".'],
    ['2. Nome* é obrigatório.'],
    [`3. Cargos válidos: ${CARGOS.join(', ')}`],
    ['4. Vínculos: Voluntário, CLT, PJ, Autônomo, Estagiário, Comissionado, Outro'],
    ['5. Datas: DD/MM/AAAA ou AAAA-MM-DD'],
    ['6. Bairros de atuação: separe por vírgula'],
    ['7. Combustivel Ativo: Sim ou Não'],
    ['8. Na importação, se o membro já existir (mesmo CPF ou mesmo nome+telefone), só campos vazios são preenchidos — nada é duplicado nem sobrescrito.'],
    ['9. Apague a linha de exemplo antes de importar (ou deixe; linhas sem Nome são ignoradas).'],
  ]

  const wsMembros = XLSX.utils.aoa_to_sheet([headers, exemplo])
  wsMembros['!cols'] = EQUIPE_XLSX_COLS.map(c => ({
    wch: Math.max(14, String(c.header).length + 2, String(c.exemplo || '').length + 2),
  }))

  const wsInfo = XLSX.utils.aoa_to_sheet(instrucoes)
  wsInfo['!cols'] = [{ wch: 100 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, wsMembros, EQUIPE_XLSX_SHEET)
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Instrucoes')
  XLSX.writeFile(wb, 'template_equipe_membros.xlsx')
}

/**
 * Lê arquivo XLSX/CSV e devolve membros parciais normalizados.
 */
export async function lerArquivoEquipeXlsx(file) {
  const XLSX = await loadXlsx()
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames.includes(EQUIPE_XLSX_SHEET)
    ? EQUIPE_XLSX_SHEET
    : wb.SheetNames[0]
  if (!sheetName) throw new Error('Planilha vazia')
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '', raw: false })
  if (!rows.length) throw new Error('Nenhuma linha de dados na planilha')

  const colMap = headerMapFromRow(rows[0])
  const mappedKeys = new Set(Object.values(colMap))
  if (!mappedKeys.has('nome')) {
    throw new Error('Coluna "Nome*" não encontrada. Use o template oficial.')
  }

  const parciais = []
  for (const raw of rows) {
    const p = rowToPartial(raw, colMap, XLSX)
    if (p) parciais.push(p)
  }
  if (!parciais.length) throw new Error('Nenhum membro válido (verifique a coluna Nome*)')
  return parciais
}

/**
 * Aplica importação na lista atual.
 * @returns {{ lista, criados, complementados, ignorados }}
 */
export function aplicarImportacaoEquipe(listaAtual, parciais) {
  const lista = [...(listaAtual || [])]
  let criados = 0
  let complementados = 0
  let ignorados = 0

  for (const partial of parciais) {
    const idx = encontrarMembroExistente(lista, partial)
    if (idx >= 0) {
      const { membro, mudou } = mesclarMembroVazios(lista[idx], partial)
      if (mudou) {
        lista[idx] = membro
        complementados += 1
      } else {
        ignorados += 1
      }
    } else {
      lista.push({
        ...partial,
        id: uid(),
        foto: '',
        fotoX: 50,
        fotoY: 50,
        combustivel: normalizarCombustivelMembro(partial),
      })
      criados += 1
    }
  }

  return { lista, criados, complementados, ignorados }
}
