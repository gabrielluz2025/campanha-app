/**
 * Gera src/data/igrejasListaAdblu.js a partir de adblu.org/congregacoes/print
 * Uso: node scripts/gerar-igrejas-adblu.cjs [url-ou-arquivo]
 */
const fs = require('fs')
const path = require('path')
const https = require('https')

const defaultUrl = 'https://adblu.org/congregacoes/print'

function esc(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, ' ')
    .trim()
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'campanha-app/1.0' } }, (res) => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

function parseCultoAdblu(s) {
  const dias = [
    ['DOMINGO', 'Dom'],
    ['SEGUNDA', 'Seg'],
    ['TERÇA', 'Ter'],
    ['TERCA', 'Ter'],
    ['QUARTA', 'Qua'],
    ['QUINTA', 'Qui'],
    ['SEXTA', 'Sex'],
    ['SÁBADO', 'Sáb'],
    ['SABADO', 'Sáb'],
  ]
  const parts = String(s || '').split(/\s*-\s*/).map(p => p.trim()).filter(Boolean)
  const out = []
  for (const part of parts) {
    const up = part.toUpperCase()
    const horas = [...part.matchAll(/(\d{1,2}:\d{2})/g)].map(m => m[1])
    for (const [key, label] of dias) {
      if (up.includes(key)) {
        if (horas.length) horas.forEach(h => out.push(`${label} ${h}`))
        else out.push(label)
        break
      }
    }
  }
  return [...new Set(out)].join(' · ')
}

/** Página /print: ### Nome, Setor, Endereço, Dias de Culto */
function parsePrintMarkdown(text) {
  const rows = []
  const blocks = String(text).split(/^###\s+/m).slice(1)
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const cong = lines[0] || ''
    if (!cong || /footer|menu|filtrar|ordenar/i.test(cong)) continue

    let setor = ''
    let endereco = ''
    let culto = ''
    for (let i = 1; i < lines.length; i++) {
      const label = lines[i].toLowerCase()
      if (label === 'setor' && lines[i + 1]) {
        setor = lines[i + 1].trim()
        i += 1
      } else if (label === 'endereço' || label === 'endereco') {
        if (lines[i + 1]) {
          endereco = lines[i + 1].trim().replace(/,\s*$/, '')
          i += 1
        }
      } else if (label.startsWith('dias de culto') && lines[i + 1]) {
        culto = lines[i + 1].trim()
        i += 1
      }
    }
    if (!cong || !endereco) continue
    rows.push({ cong, culto, setor, endereco })
  }
  return rows
}

function parseTableFromText(text) {
  const rows = []
  const lines = String(text).split(/\r?\n/)
  for (const line of lines) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|/)
    if (!m) continue
    const cong = m[1].trim()
    const culto = m[2].trim()
    const setorNum = m[3].trim()
    const setor = m[4].trim()
    if (!cong || cong.includes('Congregação') || cong.includes('---')) continue
    if (setor === 'Veja Mais' || culto.includes('Ordenação')) continue
    rows.push({ cong, culto, setorNum, setor, endereco: '' })
  }
  return rows
}

function parseHtmlCongregacoes(html) {
  const rows = []
  const articleRe = /<article[^>]*class="[^"]*content-type--congregation[^"]*"[^>]*>([\s\S]*?)<\/article>/gi
  let block
  while ((block = articleRe.exec(html))) {
    const chunk = block[1]
    const title = chunk.match(/field--name-title[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/i)
    const setor = chunk.match(/field--name-field-district[\s\S]*?class="field__item"[^>]*>([^<]+)</i)
    const endereco = chunk.match(/field--name-field-address[\s\S]*?class="field__item"[^>]*>([^<]+)</i)
    const culto = chunk.match(/field--name-field-services-days[\s\S]*?class="field__item"[^>]*>([^<]+)</i)
      || chunk.match(/Dias de Culto[\s\S]*?class="field__item"[^>]*>([^<]+)</i)
    const cong = title ? title[1].trim() : ''
    if (!cong || !endereco) continue
    rows.push({
      cong,
      setor: setor ? setor[1].trim() : '',
      endereco: endereco[1].trim(),
      culto: culto ? culto[1].trim() : '',
    })
  }
  return rows
}

function parseHtmlTable(html) {
  const rows = []
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let tr
  while ((tr = trRe.exec(html))) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m =>
      m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    )
    if (cells.length < 4) continue
    const [cong, culto, setorNum, setor] = cells
    if (!cong || !/^\d+$/.test(setorNum)) continue
    rows.push({ cong, culto, setorNum, setor, endereco: '' })
  }
  return rows
}

function loadSetorNumMap(destFile) {
  const map = new Map()
  if (!fs.existsSync(destFile)) return map
  const raw = fs.readFileSync(destFile, 'utf8')
  for (const m of raw.matchAll(/congregacao:\s*'([^']+)'[\s\S]*?setorNum:\s*'(\d+)'/g)) {
    map.set(m[1], m[2])
  }
  return map
}

async function loadSource(arg) {
  const src = arg || defaultUrl
  if (fs.existsSync(src)) return fs.readFileSync(src, 'utf8')
  if (src.startsWith('http')) return fetchUrl(src)
  return fetchUrl(defaultUrl)
}

async function main() {
  const raw = await loadSource(process.argv[2])
  const dest = path.join(__dirname, '..', 'src', 'data', 'igrejasListaAdblu.js')
  const setorNumMap = loadSetorNumMap(dest)

  let rows = parsePrintMarkdown(raw)
  if (!rows.length) rows = parseHtmlCongregacoes(raw)
  if (!rows.length) rows = parseTableFromText(raw)
  if (!rows.length) rows = parseHtmlTable(raw)
  if (!rows.length) {
    console.error('Nenhuma congregação encontrada na fonte.')
    process.exit(1)
  }

  const items = rows.map((r) => {
    const setorNum = r.setorNum || setorNumMap.get(r.cong) || ''
    return {
      regiao: setorNum ? `Setor ${setorNum}` : String(r.setor || ''),
      nome: `Assembleia de Deus ADBLU ${r.cong}`,
      congregacao: r.cong,
      bairro: r.setor,
      endereco: r.endereco || '',
      culto: parseCultoAdblu(r.culto),
      denominacao: 'Assembleia de Deus',
      pastor: '',
      telefone: '',
      whatsapp: '',
      setorNum: String(setorNum),
      fonteLista: 'adblu',
    }
  })

  const comEnd = items.filter(i => i.endereco).length
  const lines = items.map((it) => (
    `  { regiao: '${esc(it.regiao)}', nome: '${esc(it.nome)}', congregacao: '${esc(it.congregacao)}', `
    + `bairro: '${esc(it.bairro)}', endereco: '${esc(it.endereco)}', culto: '${esc(it.culto)}', `
    + `denominacao: '${esc(it.denominacao)}', pastor: '${esc(it.pastor)}', telefone: '${esc(it.telefone)}', `
    + `whatsapp: '${esc(it.whatsapp)}', setorNum: '${esc(it.setorNum)}', fonteLista: 'adblu' },`
  ))
  const out = `/** Gerado por scripts/gerar-igrejas-adblu.cjs — não editar à mão */\n\n`
    + `/** @type {import('./igrejasListaPapel').IgrejaListaPlanilha[]} */\n`
    + `export const IGREJAS_LISTA_ADBLU = [\n${lines.join('\n')}\n]\n\n`
    + `export const TOTAL_LISTA_ADBLU = IGREJAS_LISTA_ADBLU.length\n`
  fs.writeFileSync(dest, out, 'utf8')
  console.log(`Gerado ${items.length} congregações ADBLU (${comEnd} com endereço) → ${dest}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
