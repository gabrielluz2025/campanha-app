// netlify/functions/tse-proxy.js
// Proxy para a API do TSE — contorna o bloqueio de CORS do navegador

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

// Códigos de eleição do TSE
const ELECTION_CODES = {
  '2022_federal':   { code: '545', base: 'ele2022' },
  '2022_estadual':  { code: '545', base: 'ele2022' },
  '2024_municipal': { code: '619', base: 'ele2024' },
}

// Códigos de cargo do TSE
const CARGO_CODES = {
  'DEPUTADO FEDERAL':  '0006',
  'DEPUTADO ESTADUAL': '0007',
  'SENADOR':           '0005',
  'GOVERNADOR':        '0003',
  'VEREADOR':          '0013',
  'PREFEITO':          '0011',
}

// Determina o tipo de eleição (federal/estadual = geral, municipal = municipal)
function getElectionKey(cargo, ano) {
  const isMunicipal = ['VEREADOR', 'PREFEITO'].includes(cargo.toUpperCase())
  if (isMunicipal) return `${ano}_municipal`
  return `${ano}_federal`
}

// Busca dados simplificados por estado (municípios agregados)
async function fetchStateSummary(base, code, uf, cargoCode) {
  const url = `https://resultados.tse.jus.br/oficial/${base}/${code}/dados-simplificados/${uf}/${uf}-c${cargoCode}-e${code.padStart(6,'0')}-r.json`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`TSE HTTP ${res.status}: ${url}`)
  return res.json()
}

// Busca dados detalhados por município (por seção)
async function fetchMunicipalityDetail(base, code, uf, munCode, cargoCode) {
  const url = `https://resultados.tse.jus.br/oficial/${base}/${code}/dados/${uf}/${munCode}/${munCode}-c${cargoCode}-e${code.padStart(6,'0')}-v.json`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) return null
  return res.json()
}

// Busca configuração de zonas/seções por município
async function fetchMunConfig(base, code, uf, munCode) {
  const url = `https://resultados.tse.jus.br/oficial/${base}/arquivo-urna/${code}/config/${uf}/${munCode}/p${code.padStart(6,'0')}-${uf}-m${munCode}-e${code.padStart(6,'0')}-u.json`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) return null
  return res.json()
}

// Transforma resposta do TSE no formato interno do app
function transformTSEData(stateSummary, numero, detailsByMun = {}) {
  if (!stateSummary?.lc) return null

  // Encontra o candidato pelo número
  const cand = stateSummary.lc.find(c => String(c.n) === String(numero))
  if (!cand) return null

  const municipios = []
  const zonas = []

  // Processa resultado por município
  const munResults = cand.dvt || cand.vot || []
  for (const mun of munResults) {
    const munNome = (mun.nm || mun.nmm || '').toUpperCase()
    const munCod = mun.cd || mun.cdm || ''
    const totalVotosMun = parseInt(mun.vap || mun.tv || 0)
    if (!munNome || totalVotosMun === 0) continue

    municipios.push(munNome)

    // Se temos dados detalhados por seção para este município
    const detail = detailsByMun[munCod]
    if (detail) {
      const candDetail = detail.lc?.find(c => String(c.n) === String(numero))
      if (candDetail?.sec) {
        // Agrupa por zona
        const zonaMap = {}
        for (const s of candDetail.sec) {
          const zona = String(s.ns || s.z || '0001').padStart(4, '0')
          const secao = String(s.n || s.s || '0001').padStart(4, '0')
          const votos = parseInt(s.vap || s.v || 0)
          if (!zonaMap[zona]) {
            zonaMap[zona] = { zona, municipio: munNome, locais: {} }
          }
          const localId = s.idl || s.l || `${munCod}-${zona}`
          const localNome = s.nml || s.nl || `Local ${localId}`
          if (!zonaMap[zona].locais[localId]) {
            zonaMap[zona].locais[localId] = { id: localId, nome: localNome, secoes: [] }
          }
          zonaMap[zona].locais[localId].secoes.push({ secao, votos })
        }
        for (const z of Object.values(zonaMap)) {
          zonas.push({
            zona: z.zona,
            municipio: z.municipio,
            locais: Object.values(z.locais),
          })
        }
      } else {
        // Sem detalhes de seção — cria zona sintética com total do município
        zonas.push({
          zona: '0001',
          municipio: munNome,
          locais: [{
            id: `${munCod}-total`,
            nome: munNome,
            secoes: [{ secao: '0001', votos: totalVotosMun }],
          }],
        })
      }
    } else {
      // Sem detalhes — usa total do município
      zonas.push({
        zona: '0001',
        municipio: munNome,
        locais: [{
          id: `${munCod}-total`,
          nome: `${munNome} (total)`,
          secoes: [{ secao: '0001', votos: totalVotosMun }],
        }],
      })
    }
  }

  return {
    candidato:  cand.nm   || cand.nome || '',
    urna:       cand.nmu  || cand.nmurna || '',
    numero:     cand.n,
    partido:    cand.sg   || cand.p || '',
    situacao:   cand.ds   || cand.st || '',
    municipio:  'SANTA CATARINA',
    municipios,
    zonas,
    votosTotal:    parseInt(cand.vap || cand.vt || 0),
    eleitoresAptos: parseInt(stateSummary.ea || stateSummary.e || 0),
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' }
  }

  const { numero, cargo, ano, municipio_code } = event.queryStringParameters || {}

  if (!numero || !cargo || !ano) {
    return {
      statusCode: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Parâmetros obrigatórios: numero, cargo, ano' }),
    }
  }

  try {
    const cargoUpper = cargo.toUpperCase()
    const cargoCode = CARGO_CODES[cargoUpper]
    if (!cargoCode) {
      return {
        statusCode: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Cargo não suportado: ${cargo}. Use: ${Object.keys(CARGO_CODES).join(', ')}` }),
      }
    }

    const elKey = getElectionKey(cargoUpper, ano)
    const elInfo = ELECTION_CODES[elKey]
    if (!elInfo) {
      return {
        statusCode: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Eleição não suportada: ${ano} / ${cargo}` }),
      }
    }

    const { base, code } = elInfo
    const uf = 'sc'

    // Busca sumário estadual
    const stateSummary = await fetchStateSummary(base, code, uf, cargoCode)

    // Busca detalhes por município (top 10 municípios com mais votos)
    const cand = stateSummary?.lc?.find(c => String(c.n) === String(numero))
    const detailsByMun = {}

    if (cand?.dvt || cand?.vot) {
      const topMuns = [...(cand.dvt || cand.vot || [])]
        .sort((a, b) => parseInt(b.vap || b.tv || 0) - parseInt(a.vap || a.tv || 0))
        .slice(0, 15)
        .filter(m => m.cd || m.cdm)

      await Promise.allSettled(
        topMuns.map(async (mun) => {
          const munCod = mun.cd || mun.cdm
          const detail = await fetchMunicipalityDetail(base, code, uf, munCod, cargoCode)
          if (detail) detailsByMun[munCod] = detail
        })
      )
    }

    const result = transformTSEData(stateSummary, numero, detailsByMun)

    if (!result) {
      return {
        statusCode: 404,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Candidato nº ${numero} não encontrado na eleição ${ano}` }),
      }
    }

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    }

  } catch (err) {
    console.error('Erro TSE proxy:', err)
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    }
  }
}
