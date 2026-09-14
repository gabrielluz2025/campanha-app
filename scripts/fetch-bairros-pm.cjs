/**
 * Baixa polígonos oficiais de bairros (GEO.WFS_BAIRROS) e grava public/bairros_pm.geojson
 * Fonte: Município de Blumenau — https://geo.blumenau.sc.gov.br/wfs/wfs.html
 */
const fs = require('fs')
const path = require('path')

const URL = 'https://geo.blumenau.sc.gov.br/server/rest/services/publicacao/Publicacao_WFS/MapServer/2/query'
  + '?where=1%3D1&outFields=BAIRROS,CD_BAIRRO&f=geojson&outSR=4326'

const BAIRROS_BLUMENAU = [
  'Água Verde', 'Badenfurt', 'Boa Vista', 'Bom Retiro', 'Centro',
  'Escola Agrícola', 'Fidélis', 'Fortaleza', 'Fortaleza Alta', 'Garcia',
  'Glória', 'Itoupava Central', 'Itoupava Norte', 'Itoupava Seca', 'Itoupavazinha',
  'Jardim Blumenau', 'Nova Esperança', 'Passo Manso', 'Ponta Aguda', 'Progresso',
  'Ribeirão Fresco', 'Salto', 'Salto do Norte', 'Salto Weissbach', 'Testo Salto',
  'Tribess', 'Valparaíso', 'Velha', 'Velha Central', 'Velha Grande',
  'Victor Konder', 'Vila Formosa', 'Vila Itoupava', 'Vila Nova', 'Vorstadt',
]

const CANON_PARA_GEO = { Glória: 'Da Glória', Salto: 'Do Salto' }
const BAIRRO_POR_NORM = Object.fromEntries(BAIRROS_BLUMENAU.map(b => [normStr(b), b]))
const TRE_ALIASES = {
  GLORIA: 'Glória', 'DA GLORIA': 'Glória', 'DO SALTO': 'Salto',
  FIDELIS: 'Fidélis', VALPARAISO: 'Valparaíso',
}

function normStr(s) {
  return (s || '').toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizarBairro(bairro) {
  if (!bairro) return ''
  const trimmed = String(bairro).trim()
  if (BAIRROS_BLUMENAU.includes(trimmed)) return trimmed
  const n = normStr(trimmed)
  if (BAIRRO_POR_NORM[n]) return BAIRRO_POR_NORM[n]
  if (TRE_ALIASES[n]) return TRE_ALIASES[n]
  return trimmed
}

function nomeExibicao(canon) {
  return CANON_PARA_GEO[canon] || canon
}

async function main() {
  console.log('Baixando GEO.WFS_BAIRROS…')
  const res = await fetch(URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const raw = await res.json()
  if (!raw.features?.length) throw new Error('Nenhum bairro retornado')

  const features = raw.features.map(f => {
    const canon = normalizarBairro(f.properties.BAIRROS)
    return {
      type: 'Feature',
      properties: {
        name: nomeExibicao(canon),
        canon,
        namePm: f.properties.BAIRROS,
        cdBairro: f.properties.CD_BAIRRO,
      },
      geometry: f.geometry,
    }
  })

  const out = {
    type: 'FeatureCollection',
    features,
    properties: {
      source: 'Município de Blumenau',
      sourceUrl: 'https://geo.blumenau.sc.gov.br/wfs/wfs.html',
      layer: 'GEO.WFS_BAIRROS',
      fetchedAt: new Date().toISOString(),
      count: features.length,
    },
  }

  const dest = path.join(__dirname, '../public/bairros_pm.geojson')
  fs.writeFileSync(dest, JSON.stringify(out))
  console.log(`Salvo: ${dest} (${features.length} bairros, ${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`)
}

main().catch(err => {
  console.error('Erro:', err.message)
  process.exit(1)
})
