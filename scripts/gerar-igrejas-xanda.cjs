/**
 * Gera src/data/igrejasListaXanda.js a partir do DOCX do levantamento.
 * Uso: node scripts/gerar-igrejas-xanda.cjs [caminho.docx]
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')

const defaultDocx = path.join(
  __dirname, '..', '..', 'igrejas', 'LEVANTAMENTO IGREJAS XANDA (1).docx',
)

function esc(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, ' ')
    .trim()
}

function normPhone(v) {
  const d = String(v || '').replace(/\D/g, '')
  return d.length >= 8 ? d : ''
}

function inferDenom(nome) {
  const n = String(nome || '').toUpperCase()
  if (n.includes('ASSEMBLEIA') || /\bAD\b/.test(n) || n.includes('ADBLU')) return 'Assembleia de Deus'
  if (n.includes('BATISTA')) return 'Batista'
  if (n.includes('UNIVERSAL')) return 'Universal'
  if (n.includes('QUADRANGULAR')) return 'Quadrangular'
  return 'Outra'
}

function isBairroLine(line) {
  const u = line.toUpperCase().trim()
  if (/^BAIRRO\s*:/.test(u)) return true
  if (/^(GARCIA|VAL PARA[IÍ]SO|PROGRESSO|BADENFURT|FORTALEZA|CENTRO|ITOUAVA|VILA NOVA)$/.test(u)) return true
  if (u === 'BAIRRO DA GLÓRIA' || u === 'BAIRRO DA GLORIA') return true
  return false
}

function cleanBairro(line) {
  return String(line || '')
    .replace(/^BAIRRO\s*:\s*/i, '')
    .replace(/^BAIRRO DA\s+/i, '')
    .trim()
}

function isEnderecoLine(line) {
  const u = line.toUpperCase()
  return /^(RUA|R\.|R:|AVENIDA|AV\.|TRAVESSA|TV\.)/.test(u)
    || /DEFRONTE|AO LADO|LOGO APÓS|PISO SUPERIOR/.test(u)
}

function isCultoLine(line) {
  const u = line.toUpperCase()
  return /FEIRA|DOMINGO|SABADO|SÁBADO|SEXTA|TERÇA|TODOS OS DIAS|^\d/.test(u)
    && !/^PR\.|^PRA\./.test(u)
}

function isPastorLine(line) {
  const u = line.toUpperCase()
  return /^PR\.|^PRA\.|^PASTOR/.test(u) || /^\d{2}\s*\d{4,}/.test(line.trim())
}

function isChurchName(line) {
  const u = line.toUpperCase().trim()
  if (!u || u.length < 2) return false
  if (isEnderecoLine(line) || isPastorLine(line) || isCultoLine(line)) return false
  if (/^NOME IGREJA|^ENDEREÇO|^DIAS DE CULTO|^NOME E TELE/.test(u)) return false
  if (/^ADBLU\b/.test(u)) return true
  if (/IGREJA|ASSEMBLEIA|COMUNIDADE|MINISTERIO|MINISTÉRIO|MFA|CEI|SANPAZ|SHALON|AME VIDAS|VISAO|VISÃO/i.test(line)) {
    return true
  }
  if (isBairroLine(line)) return false
  if (line.length <= 35 && !/^\d/.test(line)) return true
  return false
}

function parseCultoXanda(lines) {
  const mapDia = [
    [/SEGUNDA|2ª/i, 'Seg'],
    [/TERÇA|3ª/i, 'Ter'],
    [/QUARTA|4ª/i, 'Qua'],
    [/QUINTA|5ª/i, 'Qui'],
    [/SEXTA|6ª/i, 'Sex'],
    [/SABADO|SÁBADO/i, 'Sáb'],
    [/DOMINGO/i, 'Dom'],
  ]
  const parts = []
  for (const raw of lines) {
    const line = String(raw || '').trim()
    if (!line) continue
    const horas = [...line.matchAll(/(\d{1,2}:\d{2})/g)].map(m => m[1])
    const hora = horas[0] || ''
    for (const [re, label] of mapDia) {
      if (re.test(line)) {
        parts.push(hora ? `${label} ${hora}` : label)
        break
      }
    }
    if (/TODOS OS DIAS/i.test(line)) parts.push('Diário')
  }
  return [...new Set(parts)].join(' · ')
}

function parsePastorPhone(lines) {
  let pastor = ''
  let telefone = ''
  for (const line of lines) {
    const t = String(line || '').trim()
    if (!t) continue
    const phones = [...t.matchAll(/(\d{2}\s*\d{4,5}[-\s]?\d{4}|\d{10,11})/g)]
    if (phones.length && !telefone) telefone = normPhone(phones[0][1])
    const pr = t.replace(/\d{2}\s*\d{4,5}[-\s]?\d{4}.*/, '').trim()
    if (/^PR\.|^PRA\.|^PASTOR/i.test(pr) && !pastor) {
      pastor = pr.replace(/^PR\.?\s*/i, '').replace(/^PRA\.?\s*/i, '').replace(/[–-]\s*$/, '').trim()
    }
  }
  return { pastor, telefone }
}

function enderecoFromParts(parts) {
  const joined = parts
    .map(p => String(p || '').trim())
    .filter(Boolean)
    .join(', ')
    .replace(/\s+,/g, ',')
  let e = joined
  if (e && !/^(RUA|R\.|AVENIDA|AV\.)/i.test(e)) {
    if (/^R[.:]?\s/i.test(e)) e = e.replace(/^R[.:]?\s/i, 'Rua ')
    else if (!/^Rua/i.test(e)) e = `Rua ${e}`
  }
  return e
}

function readDocxParagraphs(docxPath) {
  const tmp = path.join(os.tmpdir(), 'xanda-unzip-gen')
  const udir = path.join(tmp, 'u')
  if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true })
  fs.mkdirSync(udir, { recursive: true })
  fs.copyFileSync(docxPath, path.join(tmp, 'doc.zip'))
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Path '${path.join(tmp, 'doc.zip').replace(/'/g, "''")}' -DestinationPath '${udir.replace(/'/g, "''")}' -Force"`,
  )
  const xml = fs.readFileSync(path.join(udir, 'word', 'document.xml'), 'utf8')
  return xml.split(/<w:p[ >]/).slice(1).map((p) => {
    const texts = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1])
    return texts.join('').trim()
  }).filter(Boolean)
}

function parseXanda(paras) {
  const items = []
  let i = 0
  while (i < paras.length && !isChurchName(paras[i])) i += 1

  while (i < paras.length) {
    if (!isChurchName(paras[i])) { i += 1; continue }
    const nome = paras[i++]
    const endParts = []
    const cultoLines = []
    const pastorLines = []
    let bairro = ''

    while (i < paras.length && !isChurchName(paras[i])) {
      const line = paras[i]
      if (isEnderecoLine(line) || (/DEFRONTE|AO LADO|LOGO APÓS|PISO/i.test(line) && !isCultoLine(line))) {
        endParts.push(line.replace(/^R:\s*/i, ''))
        i += 1
        continue
      }
      if (isBairroLine(line)) {
        bairro = cleanBairro(line)
        i += 1
        continue
      }
      if (isCultoLine(line)) {
        cultoLines.push(line)
        i += 1
        continue
      }
      if (isPastorLine(line)) {
        pastorLines.push(line)
        i += 1
        continue
      }
      if (!bairro && line.length < 30) {
        bairro = cleanBairro(line)
        i += 1
        continue
      }
      i += 1
    }

    const { pastor, telefone } = parsePastorPhone(pastorLines)
    const endereco = enderecoFromParts(endParts)
  const nomeAdblu = /^ADBLU\b/i.test(nome)
      ? nome.replace(/^ADBLU\s*/i, '').trim()
      : ''
    items.push({
      regiao: 'Xanda',
      nome: nomeAdblu ? `Assembleia de Deus ADBLU ${nomeAdblu}` : nome,
      congregacao: nomeAdblu || '',
      bairro,
      endereco,
      culto: parseCultoXanda(cultoLines),
      denominacao: inferDenom(nome),
      pastor,
      telefone,
      whatsapp: telefone,
    })
  }
  return items
}

function main() {
  const docxPath = process.argv[2] || defaultDocx
  if (!fs.existsSync(docxPath)) {
    console.error('Arquivo não encontrado:', docxPath)
    process.exit(1)
  }
  const paras = readDocxParagraphs(docxPath)
  const items = parseXanda(paras)
  const lines = items.map((it) => (
    `  { regiao: '${esc(it.regiao)}', nome: '${esc(it.nome)}', congregacao: '${esc(it.congregacao)}', `
    + `bairro: '${esc(it.bairro)}', endereco: '${esc(it.endereco)}', culto: '${esc(it.culto)}', `
    + `denominacao: '${esc(it.denominacao)}', pastor: '${esc(it.pastor)}', telefone: '${esc(it.telefone)}', `
    + `whatsapp: '${esc(it.whatsapp)}', fonteLista: 'xanda' },`
  ))
  const out = `/** Gerado por scripts/gerar-igrejas-xanda.cjs — não editar à mão */\n\n`
    + `/** @type {import('./igrejasListaPapel').IgrejaListaPlanilha[]} */\n`
    + `export const IGREJAS_LISTA_XANDA = [\n${lines.join('\n')}\n]\n\n`
    + `export const TOTAL_LISTA_XANDA = IGREJAS_LISTA_XANDA.length\n`
  const dest = path.join(__dirname, '..', 'src', 'data', 'igrejasListaXanda.js')
  fs.writeFileSync(dest, out, 'utf8')
  console.log(`Gerado ${items.length} igrejas → ${dest}`)
}

main()
