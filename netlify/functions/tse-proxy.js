// netlify/functions/tse-proxy.js
// Consulta dados do TSE pré-processados no Supabase
// (os dados foram importados com scripts/import-tse.js)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://sdawefxseuuzzqbrjkej.supabase.co'
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || ''

async function sbFetch(path, params = {}) {
  const qs = Object.entries(params).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  const url = `${SUPABASE_URL}/rest/v1/${path}${qs ? '?'+qs : ''}`
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Accept': 'application/json',
      'Prefer': 'count=exact',
    }
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Supabase ${res.status}: ${txt}`)
  }
  return res.json()
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' }
  }

  const q = event.queryStringParameters || {}
  const { numero, cargo, ano } = q

  if (!numero || !cargo || !ano) {
    return {
      statusCode: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Parâmetros obrigatórios: numero, cargo, ano' }),
    }
  }

  try {
    // Busca paginada para não perder dados com o limite do Supabase
    const PAGE = 10000
    let rows = [], offset = 0, done = false
    while (!done) {
      const chunk = await sbFetch('tse_votos_sc', {
        select: 'municipio,zona,secao,votos',
        ano:    `eq.${parseInt(ano)}`,
        numero: `eq.${parseInt(numero)}`,
        cargo:  `ilike.%${cargo.toUpperCase().trim()}%`,
        order:  'municipio,zona,secao',
        limit:  PAGE,
        offset,
      })
      if (!chunk || chunk.length === 0) break
      rows = rows.concat(chunk)
      if (chunk.length < PAGE) done = true
      else offset += PAGE
    }

    if (!rows || rows.length === 0) {
      return {
        statusCode: 404,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: `Candidato nº ${numero} não encontrado. Execute scripts/import-tse.js para importar os dados do TSE.`
        }),
      }
    }

    // Agrupa por municipio → zona → secao
    const munMap = {}
    let votosTotal = 0

    for (const row of rows) {
      const mun   = row.municipio
      const zona  = String(row.zona).padStart(4,'0')
      const secao = String(row.secao).padStart(4,'0')
      const votos = parseInt(row.votos || 0)
      votosTotal += votos

      if (!munMap[mun]) munMap[mun] = {}
      if (!munMap[mun][zona]) munMap[mun][zona] = {}
      munMap[mun][zona][secao] = (munMap[mun][zona][secao] || 0) + votos
    }

    const municipios = Object.keys(munMap).sort()
    const zonas = []

    for (const [mun, zonaMap] of Object.entries(munMap)) {
      for (const [zona, secMap] of Object.entries(zonaMap)) {
        const secoes = Object.entries(secMap).map(([secao, votos]) => ({ secao, votos }))
        zonas.push({
          zona,
          municipio: mun,
          locais: [{
            id:     `${mun}-${zona}`,
            nome:   `Zona ${zona} — ${mun}`,
            secoes,
          }],
        })
      }
    }

    // Ordena zonas por total de votos desc
    zonas.sort((a, b) => {
      const ta = a.locais[0].secoes.reduce((s,x) => s+x.votos, 0)
      const tb = b.locais[0].secoes.reduce((s,x) => s+x.votos, 0)
      return tb - ta
    })

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        numero:         String(numero),
        cargo:          cargo.toUpperCase(),
        ano:            parseInt(ano),
        municipio:      'SANTA CATARINA',
        municipios,
        zonas,
        votosTotal,
        eleitoresAptos: 0,
      }),
    }

  } catch (err) {
    console.error('[tse-proxy] erro:', err.message)
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Erro interno: ${err.message}` }),
    }
  }
}
