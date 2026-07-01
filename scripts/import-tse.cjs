/**
 * scripts/import-tse.cjs
 * 
 * Baixa dados do TSE para SC 2022/2024 e sobe para o Supabase.
 * Usa leitura por linha (streaming) para evitar limite de memória.
 * Execute UMA vez: node scripts/import-tse.cjs
 */

const https    = require('https')
const fs       = require('fs')
const path     = require('path')
const readline     = require('readline')
const { execSync } = require('child_process')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL || 'https://sdawefxseuuzzqbrjkej.supabase.co'
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE || process.env.VITE_SUPABASE_ANON_KEY || ''
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

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
const LOTE_SIZE = 300

// Processa CSV com for-await (backpressure nativo, sem crash)
async function processarCSVStreaming(csvFile, ano) {
  const rl = readline.createInterface({
    input: fs.createReadStream(csvFile, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  })

  const idx = (h, nome) => h.findIndex(c => c.toUpperCase().includes(nome.toUpperCase()))

  let header = null
  let iCargo, iNum, iMun, iZona, iSecao, iVotos
  let lote = []
  let totalOk = 0, totalErro = 0, lastErrMsg = ''

  const flush = async () => {
    if (lote.length === 0) return
    const { error } = await supabase
      .from('tse_votos_sc')
      .upsert(lote, { onConflict: 'ano,cargo,numero,municipio,zona,secao', ignoreDuplicates: true })
    if (error) {
      totalErro += lote.length
      lastErrMsg = error.message
      console.log(`\n  [ERRO] ${error.code}: ${error.message.substring(0,120)}`)
    } else {
      totalOk += lote.length
    }
    lote = []
    process.stdout.write(`\r  OK: ${totalOk} | Erros: ${totalErro}        `)
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
      console.log(`  Colunas: cargo[${iCargo}] num[${iNum}] mun[${iMun}] zona[${iZona}] sec[${iSecao}] votos[${iVotos}]`)
      continue
    }

    const cargo  = (col[iCargo] || '').toUpperCase()
    const numero = parseInt(col[iNum] || '')
    const mun    = (col[iMun]   || '').toUpperCase().trim()
    const zona   = String(col[iZona]  || '').padStart(4,'0')
    const secao  = String(col[iSecao] || '').padStart(4,'0')
    const votos  = parseInt(col[iVotos] || '0')

    if (!CARGOS_OK.some(c => cargo.includes(c))) continue
    if (!numero || isNaN(numero)) continue

    lote.push({ ano, cargo, numero, municipio: mun, zona, secao, votos })
    if (lote.length >= LOTE_SIZE) await flush()
  }

  await flush()
  console.log(`\n  Resultado: ${totalOk} registros importados, ${totalErro} erros`)
  if (lastErrMsg) console.log(`  Último erro: ${lastErrMsg}`)
  return { totalOk, totalErro }
}

async function main() {
  console.log('=== Importador de dados TSE → Supabase (streaming) ===\n')

  // Não limpa a tabela inteira (muitos registros → timeout).
  // O upsert com ignoreDuplicates mantém dados existentes e insere apenas os novos.
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
