/**
 * scripts/import-tse.cjs
 * 
 * Baixa dados do TSE para SC 2022/2024 e envia para API PHP no Hostinger.
 * Usa leitura por linha (streaming) para evitar limite de memória.
 * Execute UMA vez: node scripts/import-tse.cjs
 */

const https    = require('https')
const fs       = require('fs')
const path     = require('path')
const readline     = require('readline')
const { execSync } = require('child_process')

const envPath = path.join(__dirname, '../.env')
const env = {}
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '')
  content.split(/\r?\n/).forEach(line => {
    const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) return
    let val = m[2].trim()
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1)
    env[m[1]] = val
  })
}

const IMPORT_URL = env.HOSTINGER_IMPORT_URL || process.env.HOSTINGER_IMPORT_URL || 'https://campanha.space/api/import.php'

const TMP = path.join(__dirname, '../tmp-tse')
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true })

const FONTES = [
  {
    label:   'SC 2022 - Votos por seção',
    url:     'https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_secao/votacao_secao_2022_SC.zip',
    ano:     2022,
    csvNome: 'votacao_secao_2022_SC.csv',
  },
  {
    label:   'SC 2024 - Votos por seção',
    url:     'https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_secao/votacao_secao_2024_SC.zip',
    ano:     2024,
    csvNome: 'votacao_secao_2024_SC.csv',
  },
]

// Download com progresso e retry
function download(url, destFile, tentativa = 1) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(destFile)) {
      if (fs.statSync(destFile).size > 0) {
        console.log(`  [cache] ${path.basename(destFile)} já existe, pulando download`)
        return resolve(destFile)
      }
      fs.unlinkSync(destFile)
    }
    console.log(`  Baixando ${path.basename(destFile)}...`)
    const file = fs.createWriteStream(destFile)
    let downloaded = 0
    const req = https.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.destroy()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      const total = parseInt(res.headers['content-length'] || '0')
      res.on('data', chunk => {
        downloaded += chunk.length
        if (total) process.stdout.write(`\r  ${(downloaded/1024/1024).toFixed(1)}/${(total/1024/1024).toFixed(1)} MB`)
      })
      res.pipe(file)
      file.on('finish', () => { file.close(); console.log(''); resolve(destFile) })
    })
    req.on('error', (err) => {
      file.destroy()
      if (fs.existsSync(destFile)) fs.unlinkSync(destFile)
      if (tentativa < 3) {
        console.log(`\n  Erro de rede, tentando novamente (${tentativa}/3)...`)
        return setTimeout(() => resolve(download(url, destFile, tentativa + 1)), 3000)
      }
      reject(err)
    })
  })
}

const CARGOS_OK = ['DEPUTADO FEDERAL','DEPUTADO ESTADUAL','SENADOR','GOVERNADOR','VEREADOR','PREFEITO']
const LOTE_SIZE = 500
const FLUSH_DELAY_MS = 100

// Processa CSV com for-await (backpressure nativo, sem crash)
async function processarCSVStreaming(csvFile, ano) {
  const rl = readline.createInterface({
    input: fs.createReadStream(csvFile, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  })

  const idx = (h, nome) => h.findIndex(c => c.toUpperCase().includes(nome.toUpperCase()))

  let header = null
  let iCargo, iNum, iMun, iZona, iSecao, iVotos, iLocal
  let lote = []
  let totalOk = 0, totalErro = 0, lastErrMsg = ''

  const flush = async () => {
    if (lote.length === 0) return
    // Remove duplicatas dentro do lote
    const map = new Map()
    for (const row of lote) {
      const key = `${row.ano}|${row.cargo}|${row.numero}|${row.municipio}|${row.zona}|${row.secao}`
      map.set(key, row)
    }
    const loteUnico = Array.from(map.values())
    try {
      const res = await fetch(IMPORT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: loteUnico }),
      })
      const txt = await res.text()
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${txt}`)
      }
      totalOk += lote.length
    } catch (err) {
      totalErro += lote.length
      lastErrMsg = err.message
      console.log(`\n  [ERRO] ${err.message.substring(0,200)}`)
    }
    lote = []
    process.stdout.write(`\r  OK: ${totalOk} | Erros: ${totalErro}        `)
    if (FLUSH_DELAY_MS) await new Promise(r => setTimeout(r, FLUSH_DELAY_MS))
  }

  for await (const linha of rl) {
    const col = linha.split(';').map(c => c.replace(/"/g,'').trim())
    if (col.length < 5) continue

    if (!header) {
      header = col
      const h = col.map(c => c.toUpperCase())
      iCargo = idx(h, 'DS_CARGO')   >= 0 ? idx(h, 'DS_CARGO')   : idx(h, 'CARGO')
      iNum   = idx(h, 'NR_VOTAVEL') >= 0 ? idx(h, 'NR_VOTAVEL') : idx(h, 'NR_CAND')
      iMun   = idx(h, 'NM_MUNICIPIO')>= 0? idx(h,'NM_MUNICIPIO'): idx(h, 'MUNICIPIO')
      iZona  = idx(h, 'NR_ZONA')
      iSecao = idx(h, 'NR_SECAO')
      iVotos = idx(h, 'QT_VOTOS')  >= 0 ? idx(h, 'QT_VOTOS')   : idx(h, 'VOTOS')
      iLocal = idx(h, 'DS_LOCAL_VOTACAO') >= 0 ? idx(h, 'DS_LOCAL_VOTACAO') : idx(h, 'LOCAL')
      console.log(`  Colunas: cargo[${iCargo}] num[${iNum}] mun[${iMun}] zona[${iZona}] sec[${iSecao}] votos[${iVotos}] local[${iLocal}]`)
      continue
    }

    const cargo  = (col[iCargo] || '').toUpperCase()
    const numero = parseInt(col[iNum] || '')
    const mun    = (col[iMun]   || '').toUpperCase().trim()
    const zona   = String(col[iZona]  || '').padStart(4,'0')
    const secao  = String(col[iSecao] || '').padStart(4,'0')
    const votos  = parseInt(col[iVotos] || '0')
    const local  = (col[iLocal] || '').toUpperCase().trim()

    if (!CARGOS_OK.some(c => cargo.includes(c))) continue
    if (!numero || isNaN(numero)) continue

    lote.push({ ano, cargo, numero, municipio: mun, zona, secao, votos, local })
    if (lote.length >= LOTE_SIZE) await flush()
  }

  await flush()
  console.log(`\n  Resultado: ${totalOk} registros importados, ${totalErro} erros`)
  if (lastErrMsg) console.log(`  Último erro: ${lastErrMsg}`)
  return { totalOk, totalErro }
}

async function main() {
  console.log('=== Importador de dados TSE → Hostinger PHP API (streaming) ===\n')
  console.log('Enviando para:', IMPORT_URL)
  console.log('Iniciando importação incremental...')

  for (const fonte of FONTES) {
    console.log(`\n--- ${fonte.label} ---`)
    const zipFile = path.join(TMP, path.basename(fonte.url))
    const csvFile = path.join(TMP, fonte.csvNome)

    try {
      // 1. Download do ZIP
      await download(fonte.url, zipFile)

      // 2. Extrai CSV para subpasta própria (evita colisão entre anos)
      const extraiDir = path.join(TMP, `extrai-${fonte.ano}`)
      if (!fs.existsSync(extraiDir)) fs.mkdirSync(extraiDir, { recursive: true })
      if (!fs.existsSync(csvFile)) {
        console.log('  Extraindo ZIP com PowerShell...')
        const zipEsc = zipFile.replace(/'/g, "''")
        const dirEsc = extraiDir.replace(/'/g, "''")
        execSync(
          `powershell -Command "Expand-Archive -Path '${zipEsc}' -DestinationPath '${dirEsc}' -Force"`,
          { stdio: 'inherit' }
        )
        const arquivos = fs.readdirSync(extraiDir).filter(f => f.toLowerCase().endsWith('.csv'))
        if (arquivos.length === 0) { console.error('  CSV não encontrado após extração'); continue }
        const extraido = path.join(extraiDir, arquivos[0])
        if (extraido !== csvFile) fs.renameSync(extraido, csvFile)
        console.log('  CSV extraído com sucesso.')
      } else {
        console.log('  [cache] CSV já extraído.')
      }

      // 3. Processa linha por linha e sobe para Supabase
      console.log('  Processando e importando...')
      await processarCSVStreaming(csvFile, fonte.ano)

    } catch (err) {
      console.error(`  ERRO: ${err.message}`)
    }
  }

  console.log('\n=== Importação concluída ===')
}

main().catch(console.error)
