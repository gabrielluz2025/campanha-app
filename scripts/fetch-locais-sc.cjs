const fs = require('fs')
const path = require('path')
const https = require('https')

const URL = 'https://apps.tre-sc.jus.br/dadosabertos-api/lista-locais/json'
const OUT = path.resolve(__dirname, '../public/locais_sc.json')

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJson(res.headers.location).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

function parseSecoes(str) {
  // "118(303), 126(305)" => [{secao:118,aptos:303}, ...]
  return [...(str || '').matchAll(/(\d+)\s*\(\s*(\d+)\s*\)/g)].map(m => ({
    secao: parseInt(m[1]),
    aptos: parseInt(m[2]),
  }))
}

async function main() {
  console.log('Buscando locais de votação do TRE-SC...')
  const data = await fetchJson(URL)
  if (!data.sucesso && !Array.isArray(data.locais)) {
    throw new Error('Resposta inesperada da API: ' + JSON.stringify(data).slice(0, 200))
  }
  const locais = (data.locais || []).map(l => ({
    n: l.nome_local_votacao?.trim().toUpperCase() || '',
    z: l.zona_eleitoral,
    b: l.bairro?.trim().toUpperCase() || '',
    e: l.total_eleitores,
    m: l.municipio?.trim().toUpperCase() || '',
    end: l.endereco?.trim().toUpperCase() || '',
    cep: l.cep?.trim() || '',
    cod: l.cod_local_votacao,
    s: l.total_secao,
    secoes: parseSecoes(l.secoes_aptos),
  }))
  fs.writeFileSync(OUT, JSON.stringify(locais, null, 2))
  console.log(`Salvo ${locais.length} locais em ${OUT}`)
}

main().catch(e => { console.error(e); process.exit(1) })
