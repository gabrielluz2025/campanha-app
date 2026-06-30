// netlify/functions/tse-proxy.js
// Proxy para a API do TSE — contorna CORS e adapta dados para o app

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const TSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://resultados.tse.jus.br/',
  'Origin': 'https://resultados.tse.jus.br',
}

// Mapa: ano + tipo → código de eleição TSE
const ELECTION_MAP = {
  '2022_geral':     { code: '545', base: 'ele2022' },
  '2024_municipal': { code: '619', base: 'ele2024' },
}

// Mapa: cargo → código TSE (4 dígitos)
const CARGO_MAP = {
  'PRESIDENTE':        '0001',
  'VICE-PRESIDENTE':   '0002',
  'GOVERNADOR':        '0003',
  'VICE-GOVERNADOR':   '0004',
  'SENADOR':           '0005',
  'DEPUTADO FEDERAL':  '0006',
  'DEPUTADO ESTADUAL': '0007',
  'DEPUTADO DISTRITAL':'0008',
  'PREFEITO':          '0011',
  'VICE-PREFEITO':     '0012',
  'VEREADOR':          '0013',
}

function isMunicipal(cargo) {
  return ['VEREADOR','PREFEITO','VICE-PREFEITO'].includes(cargo.toUpperCase())
}

function getElectionInfo(cargo, ano) {
  const key = isMunicipal(cargo) ? `${ano}_municipal` : `${ano}_geral`
  return ELECTION_MAP[key] || null
}

async function tseFetch(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(url, { headers: TSE_HEADERS, signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status} para ${url}`)
    const text = await res.text()
    return JSON.parse(text)
  } catch (err) {
    clearTimeout(timer)
    throw err
  }
}

// Tenta múltiplos formatos de URL para estado
async function fetchCandidatosSC(base, code, cargoCode) {
  const uf = 'sc'
  const codeP = code.padStart(6, '0')
  const urls = [
    `https://resultados.tse.jus.br/oficial/${base}/${code}/dados-simplificados/${uf}/${uf}-c${cargoCode}-e${codeP}-r.json`,
    `https://resultados.tse.jus.br/oficial/${base}/${code}/dados/${uf}/${uf}-c${cargoCode}-e${codeP}-r.json`,
  ]
  let lastErr
  for (const url of urls) {
    try {
      const data = await tseFetch(url)
      if (data) return data
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('Todas as URLs TSE falharam')
}

// Busca detalhe de município com votos por seção
async function fetchMunDetalhe(base, code, munCode, cargoCode) {
  const uf = 'sc'
  const codeP = code.padStart(6, '0')
  const urls = [
    `https://resultados.tse.jus.br/oficial/${base}/${code}/dados/${uf}/${munCode}/${munCode}-c${cargoCode}-e${codeP}-v.json`,
    `https://resultados.tse.jus.br/oficial/${base}/${code}/dados-simplificados/${uf}/${munCode}/${munCode}-c${cargoCode}-e${codeP}-r.json`,
  ]
  for (const url of urls) {
    try {
      const data = await tseFetch(url)
      if (data) return data
    } catch { /* tenta próxima */ }
  }
  return null
}

function transformar(summary, numero, detalhesPorMun) {
  const lista = summary?.lc || summary?.cands || []
  const cand = lista.find(c => String(c.n) === String(numero) || String(c.nm) === String(numero))
  if (!cand) return null

  const municipios = []
  const zonas = []
  const munResults = cand.dvt || cand.vot || cand.mun || []

  for (const mun of munResults) {
    const munNome = (mun.nm || mun.nmm || mun.nome || '').toUpperCase().trim()
    const munCod  = String(mun.cd || mun.cdm || '')
    const votMun  = parseInt(mun.vap || mun.tv || mun.votos || 0)
    if (!munNome || votMun === 0) continue
    municipios.push(munNome)

    const detalhe = detalhesPorMun[munCod]
    const candDetalhe = detalhe?.lc?.find(c => String(c.n) === String(numero))

    if (candDetalhe?.sec?.length) {
      const zonaMap = {}
      for (const s of candDetalhe.sec) {
        const zona  = String(s.ns || s.nz || s.zona || '1').padStart(4, '0')
        const secao = String(s.n  || s.ns || s.secao || '1').padStart(4, '0')
        const votos = parseInt(s.vap || s.v || s.votos || 0)
        if (!zonaMap[zona]) zonaMap[zona] = { zona, municipio: munNome, locais: {} }
        const localId   = String(s.idl || s.local || `${munCod}-${zona}`)
        const localNome = String(s.nml || s.nlocal || `Zona ${zona}`)
        if (!zonaMap[zona].locais[localId]) zonaMap[zona].locais[localId] = { id: localId, nome: localNome, secoes: [] }
        zonaMap[zona].locais[localId].secoes.push({ secao, votos })
      }
      for (const z of Object.values(zonaMap)) {
        zonas.push({ zona: z.zona, municipio: z.municipio, locais: Object.values(z.locais) })
      }
    } else {
      // Sem detalhes por seção — totais por município
      zonas.push({
        zona: '0001',
        municipio: munNome,
        locais: [{ id: `${munCod || munNome}`, nome: munNome, secoes: [{ secao: '0001', votos: votMun }] }],
      })
    }
  }

  return {
    candidato:      cand.nm   || '',
    urna:           cand.nmu  || cand.nmurna || '',
    numero:         String(cand.n || numero),
    partido:        cand.sg   || cand.p || cand.partido || '',
    situacao:       cand.ds   || cand.st || cand.situacao || '',
    municipio:      'SANTA CATARINA',
    municipios,
    zonas,
    votosTotal:     parseInt(cand.vap || cand.vt || cand.votos || 0),
    eleitoresAptos: parseInt(summary.ea || summary.e || 0),
  }
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

  const cargoUp  = cargo.toUpperCase()
  const cargoCode = CARGO_MAP[cargoUp]
  if (!cargoCode) {
    return {
      statusCode: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Cargo não reconhecido: ${cargo}` }),
    }
  }

  const elInfo = getElectionInfo(cargoUp, ano)
  if (!elInfo) {
    return {
      statusCode: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Eleição ${ano} / ${cargo} não disponível. Suportado: 2022 geral, 2024 municipal.` }),
    }
  }

  try {
    const { base, code } = elInfo

    // 1. Busca lista geral para SC
    const summary = await fetchCandidatosSC(base, code, cargoCode)

    // 2. Encontra o candidato para pegar seus municípios
    const lista = summary?.lc || summary?.cands || []
    const cand  = lista.find(c => String(c.n) === String(numero))

    // 3. Busca detalhe dos top 10 municípios em paralelo
    const detalhesPorMun = {}
    if (cand) {
      const muns = [...(cand.dvt || cand.vot || cand.mun || [])]
        .sort((a, b) => parseInt(b.vap || b.tv || 0) - parseInt(a.vap || a.tv || 0))
        .slice(0, 10)
        .filter(m => m.cd || m.cdm)

      await Promise.allSettled(muns.map(async (m) => {
        const cd = String(m.cd || m.cdm)
        const d  = await fetchMunDetalhe(base, code, cd, cargoCode)
        if (d) detalhesPorMun[cd] = d
      }))
    }

    const result = transformar(summary, numero, detalhesPorMun)
    if (!result) {
      return {
        statusCode: 404,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Candidato nº ${numero} não encontrado na eleição ${ano} (${cargo})` }),
      }
    }

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    }

  } catch (err) {
    console.error('[tse-proxy] erro:', err.message)
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Falha ao consultar TSE: ${err.message}` }),
    }
  }
}
