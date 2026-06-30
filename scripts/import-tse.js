/**
 * scripts/import-tse.js
 * 
 * Baixa os dados do TSE para SC 2022/2024 e sobe para o Supabase.
 * Execute UMA vez: node scripts/import-tse.js
 * 
 * Requer: npm install adm-zip @supabase/supabase-js
 */

const https  = require('https')
const fs     = require('fs')
const path   = require('path')
const AdmZip = require('adm-zip')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL  = 'https://sdawefxseuuzzqbrjkej.supabase.co'
const SUPABASE_KEY  = 'sb_publishable_fLJ6oIOMX0aYiwv0f1DVDw_KOr6Wi6g'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const TMP = path.join(__dirname, '../tmp-tse')
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true })

// Arquivos que vamos processar
const FONTES = [
  {
    label: 'SC 2022 - Votos por seção',
    url:   'https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_secao/votacao_secao_2022_SC.zip',
    ano:   2022,
    arquivo: 'votacao_secao_2022_SC.csv',
  },
  // 2024 municipal SC
  {
    label: 'SC 2024 - Votos por seção',
    url:   'https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_secao/votacao_secao_2024_SC.zip',
    ano:   2024,
    arquivo: 'votacao_secao_2024_SC.csv',
  },
]

// Download com progresso
function download(url, destFile) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(destFile)) {
      console.log(`  [cache] ${path.basename(destFile)} já existe, pulando download`)
      return resolve(destFile)
    }
    console.log(`  Baixando ${path.basename(destFile)}...`)
    const file = fs.createWriteStream(destFile)
    let downloaded = 0
    https.get(url, (res) => {
      const total = parseInt(res.headers['content-length'] || '0')
      res.on('data', chunk => {
        downloaded += chunk.length
        if (total) process.stdout.write(`\r  ${(downloaded/1024/1024).toFixed(1)}/${(total/1024/1024).toFixed(1)} MB`)
      })
      res.pipe(file)
      file.on('finish', () => { file.close(); console.log(''); resolve(destFile) })
    }).on('error', reject)
  })
}

// Parseia o CSV do TSE e agrupa votos por candidato+municipio+zona+secao
function parseCSV(csvText, ano) {
  const linhas = csvText.split('\n')
  const header = linhas[0].split(';').map(h => h.replace(/"/g,'').trim())
  console.log(`  Colunas: ${header.slice(0,10).join(', ')}...`)

  const idx = (nome) => header.findIndex(h => h.toUpperCase().includes(nome.toUpperCase()))
  
  // Detecta colunas-chave
  const iCargo  = idx('DS_CARGO') >= 0 ? idx('DS_CARGO') : idx('CARGO')
  const iNum    = idx('NR_VOTAVEL') >= 0 ? idx('NR_VOTAVEL') : idx('NR_CAND')
  const iMun    = idx('NM_MUNICIPIO') >= 0 ? idx('NM_MUNICIPIO') : idx('MUNICIPIO')
  const iZona   = idx('NR_ZONA')
  const iSecao  = idx('NR_SECAO')
  const iVotos  = idx('QT_VOTOS') >= 0 ? idx('QT_VOTOS') : idx('VOTOS')

  console.log(`  Índices: cargo=${iCargo} num=${iNum} mun=${iMun} zona=${iZona} secao=${iSecao} votos=${iVotos}`)

  const registros = []
  let skipped = 0

  for (let i = 1; i < linhas.length; i++) {
    const col = linhas[i].split(';').map(c => c.replace(/"/g,'').trim())
    if (col.length < 5) continue

    const cargo  = (col[iCargo] || '').toUpperCase()
    const numero = col[iNum]
    const mun    = (col[iMun] || '').toUpperCase()
    const zona   = (col[iZona] || '').padStart(4,'0')
    const secao  = (col[iSecao] || '').padStart(4,'0')
    const votos  = parseInt(col[iVotos] || '0')

    // Filtra apenas cargos relevantes
    const cargosOk = ['DEPUTADO FEDERAL','DEPUTADO ESTADUAL','SENADOR','GOVERNADOR','VEREADOR','PREFEITO']
    if (!cargosOk.some(c => cargo.includes(c))) { skipped++; continue }
    if (!numero || isNaN(parseInt(numero))) continue

    registros.push({ ano, cargo, numero: parseInt(numero), municipio: mun, zona, secao, votos })

    if (i % 500000 === 0) console.log(`  Processando linha ${i}/${linhas.length}...`)
  }

  console.log(`  Registros válidos: ${registros.length}, ignorados: ${skipped}`)
  return registros
}

// Sobe para Supabase em lotes
async function uploadSupabase(registros) {
  const LOTE = 500
  let ok = 0, erros = 0
  for (let i = 0; i < registros.length; i += LOTE) {
    const lote = registros.slice(i, i + LOTE)
    const { error } = await supabase
      .from('tse_votos_sc')
      .upsert(lote, { onConflict: 'ano,cargo,numero,municipio,zona,secao' })
    if (error) { erros += lote.length; console.error('  Erro:', error.message) }
    else ok += lote.length
    if (i % 50000 === 0) process.stdout.write(`\r  Upload: ${ok}/${registros.length}`)
  }
  console.log(`\n  Upload: ${ok} ok, ${erros} erros`)
}

async function main() {
  console.log('=== Importador de dados TSE → Supabase ===\n')

  for (const fonte of FONTES) {
    console.log(`\n--- ${fonte.label} ---`)
    const zipFile = path.join(TMP, path.basename(fonte.url))

    try {
      // 1. Download
      await download(fonte.url, zipFile)

      // 2. Extrai CSV
      console.log('  Extraindo ZIP...')
      const zip = new AdmZip(zipFile)
      const entry = zip.getEntries().find(e => e.entryName.endsWith('.csv') && e.entryName.includes('SC'))
      if (!entry) { console.error('  CSV não encontrado no ZIP'); continue }
      
      console.log(`  Extraindo ${entry.entryName} (${(entry.header.size/1024/1024).toFixed(1)}MB)...`)
      const csvText = entry.getData().toString('latin1')

      // 3. Parseia
      const registros = parseCSV(csvText, fonte.ano)

      // 4. Upload
      console.log('  Subindo para Supabase...')
      await uploadSupabase(registros)

    } catch (err) {
      console.error(`  ERRO: ${err.message}`)
    }
  }

  console.log('\n=== Concluído ===')
}

main().catch(console.error)
