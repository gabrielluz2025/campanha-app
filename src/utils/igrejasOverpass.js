/**
 * Busca aprofundada de igrejas (OSM Overpass + Nominatim) + depara com o catálogo local.
 * Estratégias progressivas: cada profundidade amplia a forma de busca para achar novas.
 */
import { normStr } from './constants'
import { haversineKm } from './rotaUtils'
import { normalizarBairro } from './bairroMapa'
import { eIgrejaCrista } from './igrejaCrista'
import { gerarIdIgrejaCustom } from './igrejaCustomId'
import { matchPorEndereco, matchGpsUnico, hitNoBairro } from './igrejaMatch'

export const IGREJAS_ENRICH_KEY = 'igrejas_enrich'

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const NOMINATIM = 'https://nominatim.openstreetmap.org'

/** Match GPS só conta com nome parecido; sem nome, exige ~25 m */
const MATCH_KM_NOME = 0.12
const MATCH_KM_PROX = 0.025

const UA = { 'User-Agent': 'CampanhaApp/1.0 (mapa-visitas)' }

export const ESTRATEGIAS = [
  {
    id: 'basica',
    label: 'Básica',
    desc: 'Templos e igrejas oficiais da cidade',
  },
  {
    id: 'ampliada',
    label: 'Ampliada',
    desc: 'Capelas, catredais e nomes com “igreja/templo”',
  },
  {
    id: 'denominacoes',
    label: 'Denominações',
    desc: 'Assembleia, Batista, Católica, Universal…',
  },
  {
    id: 'nominatim',
    label: 'Busca por nome',
    desc: 'Nominatim — variações de nome na cidade',
  },
  {
    id: 'vizinhanca',
    label: 'Vizinhança',
    desc: 'Pontos próximos às igrejas que você já tem',
  },
]

export function readIgrejasEnrich() {
  try {
    const v = JSON.parse(localStorage.getItem(IGREJAS_ENRICH_KEY) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export function writeIgrejasEnrich(map) {
  localStorage.setItem(IGREJAS_ENRICH_KEY, JSON.stringify(map || {}))
}

function buildEndereco(tags = {}, cidade = '') {
  const rua = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(', ')
  const bairro = tags['addr:suburb'] || tags['addr:neighbourhood'] || tags['addr:district'] || ''
  const mun = tags['addr:city'] || cidade || ''
  const uf = tags['addr:state'] || (mun ? 'SC' : '')
  const partes = []
  if (rua) partes.push(rua)
  if (bairro) partes.push(bairro)
  if (mun) partes.push(uf ? `${mun} - ${uf}` : mun)
  return partes.join(', ')
}

function mapDenominacao(tags = {}) {
  const rel = normStr(tags.religion || '')
  const den = normStr(tags.denomination || tags['denomination:pt'] || '')
  const name = normStr(tags.name || '')

  if (rel.includes('CATHOLIC') || den.includes('CATHOLIC') || den.includes('ROMAN CATHOLIC')
    || name.includes('CATOLICA') || name.includes('PAROQUIA')) {
    return 'Igreja Católica'
  }
  if (den.includes('BAPTIST') || den.includes('BATISTA') || name.includes('BATISTA')) return 'Batista'
  if (den.includes('PRESBYTERIAN') || den.includes('PRESBITER') || name.includes('PRESBITER')) return 'Presbiteriana'
  if (den.includes('METHODIST') || den.includes('METODISTA') || name.includes('METODISTA')) return 'Metodista'
  if (den.includes('ADVENTIST') || den.includes('ADVENTISTA') || name.includes('ADVENTISTA')) return 'Adventista'
  if (den.includes('ASSEMBL') || name.includes('ASSEMBLEIA DE DEUS') || /\bAD\b/.test(name)) return 'Assembleia de Deus'
  if (name.includes('UNIVERSAL') || den.includes('UNIVERSAL')) return 'Universal'
  if (name.includes('CONGREGACAO CRISTA') || den.includes('CONGREGATIONAL')) return 'Congregação Cristã'
  if (name.includes('QUADRANGULAR') || den.includes('FOURSQUARE')) return 'Outra'
  if (rel && !rel.includes('CHRISTIAN') && !rel.includes('CHRISTIANITY')) return 'Outra'
  return 'Outra'
}

function inferSetor(tags = {}, denominacao = '') {
  const suburb = tags['addr:suburb'] || tags['addr:neighbourhood'] || tags['addr:district'] || ''
  const bairro = normalizarBairro(suburb)
  if (bairro) return bairro
  if (denominacao === 'Assembleia de Deus') return ''
  return bairro || ''
}

function elementCoords(el) {
  if (el.type === 'node' && Number.isFinite(el.lat) && Number.isFinite(el.lon)) {
    return { lat: el.lat, lng: el.lon }
  }
  if (el.center && Number.isFinite(el.center.lat) && Number.isFinite(el.center.lon)) {
    return { lat: el.center.lat, lng: el.center.lon }
  }
  if (Number.isFinite(el.lat) && Number.isFinite(el.lon)) {
    return { lat: el.lat, lng: el.lon }
  }
  return null
}

export function normalizarHitOsm(el, cidade = 'Blumenau', estrategia = 'basica') {
  const tags = el.tags || {}
  const coords = elementCoords(el)
  if (!coords) return null
  const nome = String(tags.name || tags['name:pt'] || tags.alt_name || '').trim()
  if (!nome) return null

  const denominacao = mapDenominacao(tags)
  const endereco = buildEndereco(tags, cidade)
  const setor = inferSetor(tags, denominacao)
  const telefone = String(tags.phone || tags['contact:phone'] || tags['contact:mobile'] || '').trim()
  const website = String(tags.website || tags['contact:website'] || '').trim()
  const cep = String(tags['addr:postcode'] || '').replace(/\D/g, '')
  const instagram = String(tags['contact:instagram'] || tags.instagram || '').trim()
  const facebook = String(tags['contact:facebook'] || tags.facebook || '').trim()
  const whatsapp = String(tags['contact:whatsapp'] || '').trim()
  const tipo = el.type || 'node'
  const id = el.id != null ? el.id : `${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}`

  return {
    osmId: `${tipo}/${id}`,
    nome,
    endereco,
    lat: coords.lat,
    lng: coords.lng,
    setor,
    denominacao,
    telefone,
    website,
    cep: cep.length === 8 ? cep : '',
    instagram,
    facebook,
    whatsapp,
    religion: tags.religion || '',
    denominationRaw: tags.denomination || '',
    fonte: 'osm',
    estrategia,
  }
}

function nomesParecidos(a, b) {
  const na = normStr(a)
  const nb = normStr(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.length >= 8 && nb.includes(na)) return true
  if (nb.length >= 8 && na.includes(nb)) return true
  const stop = new Set([
    'IGREJA', 'TEMPLO', 'CAPELA', 'PAROQUIA', 'COMUNIDADE', 'CONGREGACAO',
    'DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'A', 'O', 'AS', 'OS', 'EM',
    'SANTO', 'SANTA', 'SAO', 'NOSSA', 'SENHORA', 'JESUS', 'CRISTO',
  ])
  const ta = na.split(/\s+/).filter(t => t.length > 2 && !stop.has(t))
  const tb = new Set(nb.split(/\s+/).filter(t => t.length > 2 && !stop.has(t)))
  if (ta.length === 0) return false
  const hit = ta.filter(t => tb.has(t)).length
  // exige pelo menos 2 tokens significativos em comum (ou 1 se for o único)
  if (ta.length === 1) return hit === 1 && ta[0].length >= 5
  return hit >= 2 && hit / ta.length >= 0.55
}

/**
 * Encontra igreja do catálogo que corresponde ao hit OSM.
 */
export function matchIgrejaExistente(hit, catalog = [], enrich = {}) {
  if (!hit) return null

  for (const ig of catalog) {
    const osm = ig.osmId || enrich[ig.id]?.osmId
    if (osm && osm === hit.osmId) {
      return { igreja: ig, motivo: 'osmId' }
    }
  }

  const porEndereco = matchPorEndereco(hit, catalog)
  if (porEndereco) return porEndereco

  const gpsUnico = matchGpsUnico(hit, catalog)
  if (gpsUnico) return gpsUnico

  let best = null
  let bestDist = Infinity
  for (const ig of catalog) {
    if (!Number.isFinite(ig.lat) || !Number.isFinite(ig.lng)) continue
    const d = haversineKm({ lat: ig.lat, lng: ig.lng }, { lat: hit.lat, lng: hit.lng })
    const nomeOk = nomesParecidos(ig.nome, hit.nome)

    if (nomeOk && d <= MATCH_KM_NOME) {
      if (d < bestDist) {
        bestDist = d
        best = { igreja: ig, motivo: 'nome+gps' }
      }
      continue
    }
    // proximidade extrema só se o nome também for razoável (evita falso depara)
    if (d <= MATCH_KM_PROX && nomeOk) {
      if (d < bestDist) {
        bestDist = d
        best = { igreja: ig, motivo: 'proximidade' }
      }
    }
  }
  if (best) return best

  // nome igual único — só se for bem específico (não “Igreja Católica”)
  const mesmos = catalog.filter(ig => nomesParecidos(ig.nome, hit.nome))
  if (mesmos.length === 1) {
    const n = normStr(hit.nome)
    const generico = n.length < 18 || /^(IGREJA|TEMPLO|CAPELA|PAROQUIA)\b/.test(n) && n.split(' ').length <= 3
    if (!generico) return { igreja: mesmos[0], motivo: 'nome' }
  }

  return null
}

export function classificarHitsOsm(hits, catalog, enrich = {}) {
  return (hits || []).filter(eIgrejaCrista).map(hit => {
    const match = matchIgrejaExistente(hit, catalog, enrich)
    const nova = !match
    return {
      ...hit,
      status: nova ? 'nova' : 'existe',
      matchId: match?.igreja?.id ?? null,
      matchNome: match?.igreja?.nome ?? null,
      matchMotivo: match?.motivo ?? null,
      // prioriza novas: só elas vêm marcadas
      selecionada: nova,
    }
  }).sort((a, b) => {
    if (a.status !== b.status) return a.status === 'nova' ? -1 : 1
    return (a.nome || '').localeCompare(b.nome || '', 'pt-BR')
  })
}

function fillMissing(target, source, fields) {
  const out = { ...target }
  for (const f of fields) {
    const cur = out[f]
    const next = source[f]
    const empty = cur == null || String(cur).trim() === '' || cur === '/fotos/sem-foto.jpg'
    if (empty && next != null && String(next).trim() !== '') {
      out[f] = next
    }
  }
  return { value: out }
}

export function aplicarAtivacoesIgrejas(selecionados, {
  catalog = [],
  custom = [],
  enrich = {},
  coords = {},
  maxIdExternas = 1999,
} = {}) {
  const enrichNext = { ...enrich }
  const coordsNext = { ...coords }
  let customNext = [...custom]
  const catalogById = new Map(catalog.map(i => [i.id, i]))

  let maxId = Math.max(
    maxIdExternas,
    ...catalog.map(i => i.id || 0),
    ...customNext.map(i => i.id || 0),
  )

  let enriquecidas = 0
  let novas = 0
  const runtimeUpdates = []

  for (const hit of selecionados) {
    if (!hit) continue

    if (hit.status === 'existe' && hit.matchId != null) {
      const ig = catalogById.get(hit.matchId)
      if (!ig) continue
      const patch = { osmId: hit.osmId }
      const catalogFixo = Number(ig.id) > 0 && Number(ig.id) <= 1999
      const fields = catalogFixo
        ? ['telefone', 'website', 'cep', 'instagram', 'facebook', 'whatsapp']
        : ['endereco', 'telefone', 'setor', 'denominacao', 'website', 'cep', 'instagram', 'facebook', 'whatsapp']
      for (const f of fields) {
        const cur = enrichNext[ig.id]?.[f] ?? ig[f]
        const empty = cur == null || String(cur).trim() === '' || cur === '—'
        if (empty && hit[f]) patch[f] = hit[f]
      }
      const needsCoords = !Number.isFinite(ig.lat) || !Number.isFinite(ig.lng)
        || (Math.abs(ig.lat - (-26.9194)) < 0.0001 && Math.abs(ig.lng - (-49.0661)) < 0.0001)
      if (needsCoords && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) {
        coordsNext[ig.id] = { lat: hit.lat, lng: hit.lng }
        patch.lat = hit.lat
        patch.lng = hit.lng
      }

      const prev = enrichNext[ig.id] || {}
      enrichNext[ig.id] = { ...prev, ...patch }
      enriquecidas++
      runtimeUpdates.push({ id: ig.id, patch: { ...patch, ...(coordsNext[ig.id] || {}) } })

      const cIdx = customNext.findIndex(c => c.id === ig.id)
      if (cIdx >= 0) {
        const filled = fillMissing(customNext[cIdx], { ...hit, ...patch }, [
          'endereco', 'telefone', 'setor', 'denominacao', 'website', 'cep', 'instagram', 'facebook', 'whatsapp', 'osmId', 'lat', 'lng',
        ])
        customNext[cIdx] = { ...filled.value, osmId: hit.osmId }
      }
      continue
    }

    maxId += 1
    const nova = {
      id: gerarIdIgrejaCustom(),
      nome: hit.nome,
      setor: hit.setor || '—',
      denominacao: hit.denominacao || 'Outra',
      endereco: hit.endereco || `${hit.nome}, ${hit.setor || ''}`.trim(),
      culto: '',
      foto: '/fotos/sem-foto.jpg',
      lat: hit.lat,
      lng: hit.lng,
      status: 'ok',
      pastor1: '', esposa1: '', pastor2: '', esposa2: '',
      visitado: false, nota: '', prioridade: 'media',
      telefone: hit.telefone || '',
      website: hit.website || '',
      cep: hit.cep || '',
      instagram: hit.instagram || '',
      facebook: hit.facebook || '',
      whatsapp: hit.whatsapp || '',
      osmId: hit.osmId,
      fonte: 'osm',
    }
    customNext.push(nova)
    coordsNext[nova.id] = { lat: hit.lat, lng: hit.lng }
    enrichNext[nova.id] = { osmId: hit.osmId, fonte: 'osm' }
    novas++
    runtimeUpdates.push({ id: nova.id, patch: nova, isNew: true })
  }

  return {
    custom: customNext,
    enrich: enrichNext,
    coords: coordsNext,
    enriquecidas,
    novas,
    runtimeUpdates,
  }
}

function safeCity(cidade) {
  return String(cidade || 'Blumenau').replace(/"/g, '').trim() || 'Blumenau'
}

function overpassBasica(cidade) {
  const safe = safeCity(cidade)
  return `
[out:json][timeout:90];
area["name"="${safe}"]["admin_level"="8"]["boundary"="administrative"]->.a;
(
  node["amenity"="place_of_worship"]["religion"="christian"](area.a);
  way["amenity"="place_of_worship"]["religion"="christian"](area.a);
  relation["amenity"="place_of_worship"]["religion"="christian"](area.a);
  node["amenity"="place_of_worship"][!"religion"](area.a);
  way["amenity"="place_of_worship"][!"religion"](area.a);
  node["building"="church"](area.a);
  way["building"="church"](area.a);
);
out center tags;
`.trim()
}

function overpassAmpliada(cidade) {
  const safe = safeCity(cidade)
  return `
[out:json][timeout:90];
area["name"="${safe}"]["admin_level"="8"]["boundary"="administrative"]->.a;
(
  node["amenity"="place_of_worship"]["religion"="christian"](area.a);
  way["amenity"="place_of_worship"]["religion"="christian"](area.a);
  relation["amenity"="place_of_worship"]["religion"="christian"](area.a);
  node["amenity"="place_of_worship"][!"religion"](area.a);
  way["amenity"="place_of_worship"][!"religion"](area.a);
  node["building"~"^(church|chapel|cathedral)$"](area.a);
  way["building"~"^(church|chapel|cathedral)$"](area.a);
  node["name"~"igreja|templo|capela|paroquia|assembleia|batista|evangel",i](area.a);
  way["name"~"igreja|templo|capela|paroquia|assembleia|batista|evangel",i](area.a);
  node["religion"="christian"](area.a);
  way["religion"="christian"](area.a);
);
out center tags;
`.trim()
}

function overpassDenominacoes(cidade) {
  const safe = safeCity(cidade)
  return `
[out:json][timeout:90];
area["name"="${safe}"]["admin_level"="8"]["boundary"="administrative"]->.a;
(
  node["name"~"Assembleia de Deus|AD |Batista|Presbiteriana|Metodista|Adventista|Universal|Congrega..o Crist.|Quadrangular|Deus . Amor|Mundial|Maranata|Pentecostal|Cat.lica|Par.quia",i](area.a);
  way["name"~"Assembleia de Deus|AD |Batista|Presbiteriana|Metodista|Adventista|Universal|Congrega..o Crist.|Quadrangular|Deus . Amor|Mundial|Maranata|Pentecostal|Cat.lica|Par.quia",i](area.a);
  node["denomination"](area.a);
  way["denomination"](area.a);
  node["amenity"="place_of_worship"]["religion"="christian"](area.a);
  way["amenity"="place_of_worship"]["religion"="christian"](area.a);
);
out center tags;
`.trim()
}

function overpassAroundPoints(points, raioM = 350) {
  const samples = points
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .slice(0, 40)
  if (!samples.length) return null
  const parts = samples.map(p => `
  node["amenity"="place_of_worship"](around:${raioM},${p.lat},${p.lng});
  way["amenity"="place_of_worship"](around:${raioM},${p.lat},${p.lng});
  node["building"~"^(church|chapel)$"](around:${raioM},${p.lat},${p.lng});
  way["building"~"^(church|chapel)$"](around:${raioM},${p.lat},${p.lng});
  node["name"~"igreja|templo|capela|assembleia",i](around:${raioM},${p.lat},${p.lng});
`).join('\n')
  return `
[out:json][timeout:90];
(
${parts}
);
out center tags;
`.trim()
}

async function fetchOverpass(query, signal) {
  let lastErr = null
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 95000)
    const onAbort = () => ctrl.abort()
    try {
      if (signal) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        signal.addEventListener('abort', onAbort, { once: true })
      }
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          Accept: 'application/json',
          ...UA,
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: ctrl.signal,
      })
      if (!r.ok) {
        lastErr = new Error(`Overpass HTTP ${r.status}`)
        continue
      }
      return await r.json()
    } catch (e) {
      lastErr = e
    } finally {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
    }
  }
  throw lastErr || new Error('Falha na busca Overpass')
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function nominatimSearch(q, signal) {
  const url = `${NOMINATIM}/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=40&countrycodes=br`
  const r = await fetch(url, { headers: { ...UA, Accept: 'application/json' }, signal })
  if (!r.ok) throw new Error(`Nominatim HTTP ${r.status}`)
  return r.json()
}

function nominatimToHit(item, cidade, estrategia) {
  const lat = parseFloat(item.lat)
  const lng = parseFloat(item.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const nome = String(item.display_name || '').split(',')[0].trim()
  if (!nome) return null
  const n = normStr(nome)
  // filtra resultados genéricos sem cara de templo
  if (!/(IGREJA|TEMPLO|CAPELA|PAROQUIA|ASSEMBLEIA|BATISTA|PRESBITER|ADVENT|UNIVERSAL|CATOLIC|EVANGEL|CRISTA|PENTECOST)/.test(n)) {
    return null
  }
  if (!eIgrejaCrista({ nome, endereco: item.display_name || '' })) return null
  const addr = item.address || {}
  const cidadeHit = addr.city || addr.town || addr.municipality || addr.village || ''
  if (cidadeHit && normStr(cidadeHit) !== normStr(cidade)) {
    // ainda aceita se o query mencionou a cidade e o display_name inclui
    if (!normStr(item.display_name || '').includes(normStr(cidade))) return null
  }
  return {
    osmId: `${item.osm_type || 'node'}/${item.osm_id}`,
    nome,
    endereco: item.display_name || '',
    lat,
    lng,
    setor: normalizarBairro(addr.suburb || addr.neighbourhood || '') || '',
    denominacao: mapDenominacao({ name: nome, religion: item.type === 'place_of_worship' ? 'christian' : '' }),
    telefone: '',
    website: '',
    religion: '',
    denominationRaw: '',
    fonte: 'nominatim',
    estrategia,
  }
}

function mergeHits(map, list) {
  for (const h of list || []) {
    if (!h?.osmId) continue
    if (!map.has(h.osmId)) map.set(h.osmId, h)
  }
}

function hitsFromOverpass(raw, cidade, estrategia) {
  const elements = Array.isArray(raw?.elements) ? raw.elements : []
  const out = []
  for (const el of elements) {
    const hit = normalizarHitOsm(el, cidade, estrategia)
    if (hit && eIgrejaCrista(hit)) out.push(hit)
  }
  return out
}

/**
 * Executa uma estratégia específica e devolve hits brutos (sem classificar).
 */
export async function executarEstrategia(estrategiaId, cidade, { signal, catalog = [], bairros = [] } = {}) {
  const cidadeNome = safeCity(cidade)
  const id = estrategiaId || 'basica'

  if (id === 'basica') {
    const raw = await fetchOverpass(overpassBasica(cidadeNome), signal)
    return hitsFromOverpass(raw, cidadeNome, id)
  }

  if (id === 'ampliada') {
    const raw = await fetchOverpass(overpassAmpliada(cidadeNome), signal)
    return hitsFromOverpass(raw, cidadeNome, id)
  }

  if (id === 'denominacoes') {
    const raw = await fetchOverpass(overpassDenominacoes(cidadeNome), signal)
    return hitsFromOverpass(raw, cidadeNome, id)
  }

  if (id === 'nominatim') {
    const queries = [
      `igreja ${cidadeNome} SC`,
      `templo ${cidadeNome} SC`,
      `assembleia de deus ${cidadeNome}`,
      `igreja batista ${cidadeNome}`,
      `paroquia ${cidadeNome} SC`,
      `capela ${cidadeNome} SC`,
      `igreja universal ${cidadeNome}`,
      `congregação cristã ${cidadeNome}`,
    ]
    const map = new Map()
    for (let i = 0; i < queries.length; i++) {
      if (signal?.aborted) break
      try {
        const rows = await nominatimSearch(queries[i], signal)
        for (const row of rows || []) {
          const hit = nominatimToHit(row, cidadeNome, id)
          if (hit) map.set(hit.osmId, hit)
        }
      } catch (_) { /* tenta próxima */ }
      if (i < queries.length - 1) await sleep(1100)
    }
    return [...map.values()]
  }

  if (id === 'vizinhanca') {
    const pts = (catalog || [])
      .filter(i => Number.isFinite(i.lat) && Number.isFinite(i.lng))
      .filter(i => !bairros?.length || hitNoBairro({ setor: i.setor, endereco: i.endereco, nome: i.nome }, bairros))
      .map(i => ({ lat: i.lat, lng: i.lng }))
    // espalha amostragem: pega espaçadas pelo catálogo
    const step = Math.max(1, Math.floor(pts.length / 35))
    const sample = pts.filter((_, i) => i % step === 0).slice(0, 35)
    const q = overpassAroundPoints(sample, 400)
    if (!q) return []
    const raw = await fetchOverpass(q, signal)
    return hitsFromOverpass(raw, cidadeNome, id)
  }

  return []
}

/**
 * Busca progressiva: roda estratégias em sequência, funde resultados e
 * aprofunda automaticamente enquanto houver poucas novas.
 *
 * @param {object} opts
 * @param {string} opts.cidade
 * @param {object[]} opts.catalog
 * @param {object} opts.enrich
 * @param {number} [opts.ateNivel] — índice máximo em ESTRATEGIAS (inclusive)
 * @param {number} [opts.desdeNivel] — começa deste índice
 * @param {Map|object} [opts.hitsPrevios] — osmId → hit já acumulado
 * @param {function} [opts.onProgress] — ({ nivel, estrategia, acumulados, novas, mensagem })
 * @param {AbortSignal} [opts.signal]
 * @param {number} [opts.metaNovas=8] — se atingir, para de aprofundar
 */
export async function buscarIgrejasProgressivo({
  cidade = 'Blumenau',
  catalog = [],
  enrich = {},
  ateNivel = ESTRATEGIAS.length - 1,
  desdeNivel = 0,
  hitsPrevios = null,
  onProgress,
  signal,
  metaNovas = 8,
  autoAprofundar = true,
  bairros = [],
} = {}) {
  const byOsm = new Map()
  if (hitsPrevios instanceof Map) {
    hitsPrevios.forEach((v, k) => byOsm.set(k, v))
  } else if (hitsPrevios && typeof hitsPrevios === 'object') {
    Object.values(hitsPrevios).forEach(h => { if (h?.osmId) byOsm.set(h.osmId, h) })
  }

  const log = []
  let lastClassified = classificarHitsOsm([...byOsm.values()], catalog, enrich)
  let nivelFinal = desdeNivel - 1

  for (let i = Math.max(0, desdeNivel); i <= ateNivel; i++) {
    if (signal?.aborted) break
    const est = ESTRATEGIAS[i]
    onProgress?.({
      nivel: i,
      estrategia: est,
      acumulados: byOsm.size,
      novas: lastClassified.filter(h => h.status === 'nova').length,
      mensagem: `Buscando: ${est.label}…`,
    })

    let found = []
    try {
      found = await executarEstrategia(est.id, cidade, { signal, catalog, bairros })
      if (bairros?.length) found = found.filter(h => hitNoBairro(h, bairros))
    } catch (e) {
      log.push({ id: est.id, label: est.label, erro: e?.message || 'falhou', adicionados: 0, novasNovas: 0 })
      continue
    }

    const before = byOsm.size
    const novasAntes = new Set(lastClassified.filter(h => h.status === 'nova').map(h => h.osmId))
    mergeHits(byOsm, found)
    lastClassified = classificarHitsOsm([...byOsm.values()], catalog, enrich)
    const novasDepois = lastClassified.filter(h => h.status === 'nova')
    const novasNovas = novasDepois.filter(h => !novasAntes.has(h.osmId)).length

    log.push({
      id: est.id,
      label: est.label,
      adicionados: byOsm.size - before,
      total: byOsm.size,
      novas: novasDepois.length,
      novasNovas,
    })
    nivelFinal = i

    onProgress?.({
      nivel: i,
      estrategia: est,
      acumulados: byOsm.size,
      novas: novasDepois.length,
      mensagem: `${est.label}: +${byOsm.size - before} pontos · ${novasDepois.length} novas`,
    })

    if (!autoAprofundar) break
    if (novasDepois.length >= metaNovas) break
    // se esta rodada não trouxe nada novo no mapa, ainda tenta a próxima
  }

  return {
    hits: lastClassified,
    nivel: nivelFinal,
    log,
    temMais: nivelFinal < ESTRATEGIAS.length - 1,
    proxima: nivelFinal < ESTRATEGIAS.length - 1 ? ESTRATEGIAS[nivelFinal + 1] : null,
  }
}

/** Compat: busca simples (estratégia básica). */
export async function buscarIgrejasOsmPorCidade(cidade = 'Blumenau', { signal } = {}) {
  return executarEstrategia('basica', cidade, { signal })
}
