/**
 * Gera src/data/igrejasListaBnu.js a partir da planilha Excel da campanha.
 * Uso: node scripts/gerar-igrejas-lista-bnu.cjs [caminho.xlsx]
 */
const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

const defaultXlsx = path.join(
  __dirname, '..', '..', 'igrejas', 'Lista de Igrejas - BNU (2).xlsx',
)

const DIAS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM']
const DIA_LABEL = { SEG: 'Seg', TER: 'Ter', QUA: 'Qua', QUI: 'Qui', SEX: 'Sex', SAB: 'Sáb', DOM: 'Dom' }

function esc(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, ' ')
    .trim()
}

function fmtHora(v) {
  if (v == null || v === '') return ''
  if (typeof v === 'number' && v < 1) {
    const total = Math.round(v * 24 * 60)
    const h = Math.floor(total / 60)
    const m = total % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  if (v instanceof Date) {
    return `${String(v.getHours()).padStart(2, '0')}:${String(v.getMinutes()).padStart(2, '0')}`
  }
  const s = String(v).trim()
  if (!s) return ''
  const am = s.match(/^(\d{1,2}):(\d{2})\s*AM$/i)
  if (am) {
    let h = Number(am[1]) % 12
    return `${String(h).padStart(2, '0')}:${am[2]}`
  }
  const pm = s.match(/^(\d{1,2}):(\d{2})\s*PM$/i)
  if (pm) {
    let h = (Number(pm[1]) % 12) + 12
    return `${String(h).padStart(2, '0')}:${pm[2]}`
  }
  const hm = s.match(/^(\d{1,2}):(\d{2})/)
  if (hm) return `${String(Number(hm[1])).padStart(2, '0')}:${hm[2]}`
  return s
}

function cultoFromRow(row, headers) {
  const parts = []
  for (const d of DIAS) {
    const idx = headers.indexOf(d)
    if (idx < 0 || idx >= row.length) continue
    const h = fmtHora(row[idx])
    if (h) parts.push(`${DIA_LABEL[d]} ${h}`)
  }
  return parts.join(' · ')
}

function enderecoFromRua(rua) {
  let e = String(rua || '').trim()
  if (!e) return ''
  if (!/^(RUA|R\.|AVENIDA|AV\.|TRAVESSA|TV\.|ALAMEDA|ROD\.)/i.test(e)) {
    e = `Rua ${e}`
  }
  return e
}

function inferDenom(nome) {
  const n = String(nome || '').toUpperCase()
  if (n.includes('ASSEMBLEIA') || /\bAD\b/.test(n) || n.includes('ADBLU')) return 'Assembleia de Deus'
  if (n.includes('BATISTA')) return 'Batista'
  if (n.includes('PRESBITER')) return 'Presbiteriana'
  if (n.includes('CATOLIC') || n.includes('PAROQUIA')) return 'Igreja Católica'
  if (n.includes('UNIVERSAL')) return 'Universal'
  if (n.includes('ADVENTISTA')) return 'Adventista'
  if (n.includes('QUADRANGULAR')) return 'Quadrangular'
  if (n.includes('CONGREGACAO CRISTA')) return 'Congregação Cristã'
  return 'Outra'
}

function normPhone(v) {
  const d = String(v || '').replace(/\D/g, '')
  if (d.length < 8) return ''
  return d
}

function parseSheet(ws, regiao) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  if (!rows.length) return []
  const headers = rows[0].map(h => String(h || '').trim().toUpperCase())
  const col = (row, name) => {
    const i = headers.indexOf(name.toUpperCase())
    if (i < 0 || i >= row.length) return ''
    const v = row[i]
    return v == null ? '' : String(v).trim()
  }
  const out = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || !row.some(c => c != null && String(c).trim())) continue
    const nome = col(row, 'IGREJA')
    const rua = col(row, 'RUA')
    const bairro = col(row, 'BAIRRO')
    if (!nome && !rua) continue
    const pastor = col(row, 'PASTOR')
    const fone = normPhone(col(row, 'FONE'))
    const cel = normPhone(col(row, 'CELULAR') || col(row, 'CELULAR '))
    const cel2 = normPhone(col(row, 'CELULAR 2'))
    const telefone = fone || cel || cel2
    const whatsapp = cel || cel2 || ''
    out.push({
      regiao,
      nome: nome || 'Igreja',
      bairro,
      endereco: enderecoFromRua(rua),
      culto: cultoFromRow(row, headers),
      denominacao: inferDenom(nome),
      pastor,
      telefone,
      whatsapp: whatsapp && whatsapp !== telefone ? whatsapp : '',
    })
  }
  return out
}

function main() {
  const xlsxPath = process.argv[2] || defaultXlsx
  if (!fs.existsSync(xlsxPath)) {
    console.error('Arquivo não encontrado:', xlsxPath)
    process.exit(1)
  }
  const wb = XLSX.readFile(xlsxPath)
  const items = []
  wb.SheetNames.forEach((name, i) => {
    const regiao = i === 0 ? 'Plan1' : name
    items.push(...parseSheet(wb.Sheets[name], regiao))
  })
  const lines = items.map((it) => (
    `  { regiao: '${esc(it.regiao)}', nome: '${esc(it.nome)}', bairro: '${esc(it.bairro)}', `
    + `endereco: '${esc(it.endereco)}', culto: '${esc(it.culto)}', denominacao: '${esc(it.denominacao)}', `
    + `pastor: '${esc(it.pastor)}', telefone: '${esc(it.telefone)}', whatsapp: '${esc(it.whatsapp)}' },`
  ))
  const out = `/** Gerado por scripts/gerar-igrejas-lista-bnu.cjs — não editar à mão */\n\n`
    + `/** @type {import('./igrejasListaPapel').IgrejaListaPlanilha[]} */\n`
    + `export const IGREJAS_LISTA_BNU = [\n${lines.join('\n')}\n]\n\n`
    + `export const TOTAL_LISTA_BNU = IGREJAS_LISTA_BNU.length\n`
  const dest = path.join(__dirname, '..', 'src', 'data', 'igrejasListaBnu.js')
  fs.writeFileSync(dest, out, 'utf8')
  console.log(`Gerado ${items.length} igrejas → ${dest}`)
}

main()
