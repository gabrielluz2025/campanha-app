/**
 * Geocodificação de igrejas por endereço com validação de rua (Nominatim + CEP).
 * Corrige pins que estavam na rua errada mesmo com endereço certo na ficha.
 */
import { sleep } from './geocode'
import {
  parseEnderecoIgreja,
  buscarEnderecoPorCepClient,
  ruasCompativelCep,
} from './igrejaEnderecoCep'
import { ruaCompativel, extrairLogradouro } from './igrejaMatch'

const HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'pt-BR',
  'User-Agent': 'CampanhaApp/3.24.0 (campanha.space)',
}

/** Bump para forçar limpeza de pins antigos não validados (localStorage). */
export const GEO_MOTOR_VERSAO = 6
export const GEO_MOTOR_ACK_KEY = 'geo_motor_versao_ack'

/** Viewbox Blumenau — prioriza resultados na região. */
const VIEWBOX_BLU = '-49.22,-26.76,-48.80,-27.06'

const CORRECOES_LOGRADOURO = [
  [/\bherman\s+hucher\b/gi, 'Hermann Huscher'],
  [/\bherman\s+hemmer\b/gi, 'Hermann Huscher'],
  [/\bhucher\b/gi, 'Huscher'],
  [/\bhemmer\b/gi, 'Huscher'],
  [/\brudiger\b/gi, 'Ruediger'],
  [/\bherman kr?atz\b/gi, 'Hermann Kratz'],
  [/\bherman\b(?!\s+kratz)/gi, 'Hermann'],
  [/\bzimer?mann\b/gi, 'Zimmermann'],
  [/\bzimermann\b/gi, 'Zimmermann'],
  [/\bsasche\b/gi, 'Sachse'],
  [/\bjesen\b/gi, 'Jensen'],
  [/\bval\s*para[ií]so\b/gi, 'Valparaíso'],
  [/\bval paraiso\b/gi, 'Valparaíso'],
  [/\bvaldiehk\b/gi, 'Valdiek'],
  [/\b02 de setembro\b/gi, 'Dois de Setembro'],
  [/\bsete de setembro\b/gi, 'Sete de Setembro'],
  [/\bs[aã]o paulo\b/gi, 'São Paulo'],
  [/\bmarcone\b/gi, 'Marconi'],
  [/\blurders\b/gi, 'Lueders'],
  [/\blions club\b/gi, 'Lions Clube'],
  [/\bpref\.\s*/gi, 'Prefeito '],
  [/\bschraiber\b/gi, 'Schreiber'],
  [/\blidia correa tobias\b/gi, 'Lídia Corrêa Tobias'],
  [/\bperola do vale\b/gi, 'Pérola do Vale'],
]

function normRef(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function refEnderecoIgreja(ig) {
  const end = String(ig?.endereco || '').trim()
  if (end) return normRef(end)
  const cep = String(ig?.cep || '').replace(/\D/g, '')
  if (cep) return normRef(`${cep}, ${ig?.cidade || 'Blumenau'}, ${ig?.uf || 'SC'}`)
  return ''
}

/** Tem latitude/longitude exibível no mapa. */
export function igrejaTemCoordenadaMapa(ig) {
  const lat = Number(ig?.lat)
  const lng = Number(ig?.lng)
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) > 0.01 && Math.abs(lng) > 0.01
}

/** Sem pin no mapa (falta coordenada — o contador "Sem GPS" usa isto). */
export function igrejaSemPinMapa(ig) {
  return !igrejaTemCoordenadaMapa(ig)
}

export function coordsVerificadosParaEndereco(co, enderecoRef) {
  if (!co?.lat || !co?.lng || !enderecoRef) return false
  const ref = co._enderecoRef || ''
  if (ref !== enderecoRef) return false
  if (co.gpsManual) return true
  if (co._enderecoGeoCep) return true
  // Pins aproximados (rua não confirmada) nunca entram no mapa.
  if (co._enderecoGeoAprox && ref && co._enderecoRef === ref) return true
  if (co._enderecoGeo && co._ruaConfirmada) return true
  if (co._enderecoGeo && !co._enderecoGeoAprox) return true
  if (co._adbluGeo) return true
  return false
}

/** Precisa geocodificar ou re-geocodificar (coords antigas sem validação de rua). */
export function igrejaPrecisaCorrigirGps(ig, coords = {}) {
  const endRef = refEnderecoIgreja(ig)
  if (!endRef) return false
  const co = coords[ig.id] ?? coords[String(ig.id)] ?? {}
  if (coordsVerificadosParaEndereco(co, endRef)) return false
  return true
}

async function geocodeFallbackPorCep(parsed, cepData, endRef) {
  const cep = String(parsed.cep || cepData?.cep || '').replace(/\D/g, '').slice(0, 8)
  if (cep.length !== 8) return null
  const cidade = parsed.cidade || cepData?.localidade || 'Blumenau'
  const uf = parsed.uf || cepData?.uf || 'SC'
  const bairroEsp = parsed.bairro || cepData?.bairro || ''
  await sleep(500)
  const resultados = await geocodeNominatimQuery(`${cep}, ${bairroEsp}, ${cidade}, ${uf}, Brasil`)
  if (!resultados?.length) return null
  const ranked = resultados
    .map((g) => ({ g, score: scoreResultadoGeo(g, parsed, cepData, parsed.logradouro || cepData?.logradouro || '') }))
    .sort((a, b) => b.score - a.score)
  const best = ranked[0]
  if (!best || best.score < 28) return null
  if (bairroEsp && best.score < 50 && !bairrosCompat(bairroEsp, best.g.bairro)) return null
  return {
    lat: best.g.lat,
    lng: best.g.lng,
    _enderecoGeo: true,
    _enderecoRef: endRef,
    _enderecoGeoCep: true,
    _ruaConfirmada: false,
  }
}

function limparLogradouroBusca(log) {
  let s = String(log || '').trim()
  s = s.replace(/^(rua|av\.?|avenida|travessa|alameda|rodovia|estrada)\.?\s+/i, '')
  s = s.replace(/\s*\([^)]*\)/g, ' ').replace(/\s*ao lado[^,]*/gi, ' ')
  s = s.replace(/\s*esquina[^,]*/gi, ' ').replace(/\s*lote[^,]*/gi, ' ')
  s = s.replace(/\s*sala\s*\d+/gi, ' ').replace(/\s+/g, ' ').trim()
  for (const [re, rep] of CORRECOES_LOGRADOURO) s = s.replace(re, rep)
  return s
}

function prepararEnderecoParaBusca(parsed) {
  let log = String(parsed.logradouro || '').trim()
  if (log && !/^(rua|av\.?|avenida|travessa|alameda|rodovia|estrada)\b/i.test(log)) {
    log = `Rua ${log}`
  }
  for (const [re, rep] of CORRECOES_LOGRADOURO) log = log.replace(re, rep)
  return { ...parsed, logradouro: log.replace(/\s+/g, ' ').trim() }
}

function escolherCepDaLista(lista, numero) {
  if (!Array.isArray(lista) || !lista.length) return null
  const num = parseInt(String(numero || '').replace(/\D/g, ''), 10)
  if (Number.isFinite(num)) {
    const par = num % 2 === 0
    const lado = lista.find((r) => {
      const c = String(r.complemento || '').toLowerCase()
      if (par && c.includes('par')) return true
      if (!par && (c.includes('ímpar') || c.includes('impar'))) return true
      return false
    })
    if (lado) return lado
  }
  return lista[0]
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

async function buscarCepPorLogradouro(parsed) {
  const uf = String(parsed.uf || 'SC').trim()
  const cidade = String(parsed.cidade || 'Blumenau').trim()
  const logBusca = limparLogradouroBusca(parsed.logradouro)
  if (!logBusca || logBusca.length < 3) return null
  const url = `https://viacep.com.br/ws/${encodeURIComponent(uf)}/${encodeURIComponent(cidade)}/${encodeURIComponent(logBusca)}/json/`
  try {
    const raw = await fetchJson(url)
    if (!Array.isArray(raw) || !raw.length || raw[0]?.erro) return null
    const pick = escolherCepDaLista(raw, parsed.numero)
    if (!pick?.cep) return null
    const digits = String(pick.cep).replace(/\D/g, '').slice(0, 8)
    return {
      cep: digits,
      logradouro: String(pick.logradouro || parsed.logradouro).trim(),
      bairro: String(pick.bairro || parsed.bairro || '').trim(),
      localidade: String(pick.localidade || cidade).trim(),
      uf: String(pick.uf || uf).trim().toUpperCase().slice(0, 2),
    }
  } catch {
    return null
  }
}

function parseNominatimAddress(addr, lat, lng) {
  return {
    lat: Number(lat),
    lng: Number(lng),
    logradouro: addr.road || addr.street || '',
    bairro: addr.suburb || addr.neighbourhood || addr.quarter || '',
    cidade: addr.city || addr.town || addr.municipality || addr.village || '',
    uf: (addr['ISO3166-2-lvl4'] || addr.state || '').replace(/^BR-/, '').slice(0, 2),
    cep: String(addr.postcode || '').replace(/\D/g, '').slice(0, 8),
  }
}

function parseNominatimItem(item) {
  const addr = item.address || {}
  return {
    lat: Number(item.lat),
    lng: Number(item.lon),
    logradouro: addr.road || addr.street || '',
    bairro: addr.suburb || addr.neighbourhood || addr.quarter || '',
    cidade: addr.city || addr.town || addr.municipality || addr.village || '',
    uf: (addr['ISO3166-2-lvl4'] || addr.state || '').replace(/^BR-/, '').slice(0, 2),
    cep: String(addr.postcode || '').replace(/\D/g, '').slice(0, 8),
    display: item.display_name,
    boundingbox: Array.isArray(item.boundingbox) ? item.boundingbox.map(Number) : null,
  }
}

async function geocodeNominatimQuery(q) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&countrycodes=br&limit=5&viewbox=${VIEWBOX_BLU}&bounded=0`
  const j = await fetchJson(url)
  if (!Array.isArray(j) || !j.length) return []
  return j.map(parseNominatimItem).filter((g) => Number.isFinite(g.lat) && Number.isFinite(g.lng))
}

async function geocodeNominatimStructured({ street, city, state, postalcode }) {
  const p = new URLSearchParams({
    format: 'json',
    addressdetails: '1',
    countrycodes: 'br',
    limit: '5',
    street: street || '',
    city: city || 'Blumenau',
    state: state || 'SC',
    country: 'Brazil',
  })
  if (postalcode) p.set('postalcode', String(postalcode).replace(/\D/g, '').slice(0, 8))
  const url = `https://nominatim.openstreetmap.org/search?${p}`
  const j = await fetchJson(url)
  if (!Array.isArray(j) || !j.length) return []
  return j.map(parseNominatimItem).filter((g) => Number.isFinite(g.lat) && Number.isFinite(g.lng))
}

async function geocodePhoton(q) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5`
  const j = await fetchJson(url)
  if (!j?.features?.length) return []
  return j.features
    .map((f) => {
      const c = f.geometry?.coordinates
      if (!c || c.length < 2) return null
      const p = f.properties || {}
      return {
        lat: Number(c[1]),
        lng: Number(c[0]),
        logradouro: p.street || p.name || '',
        bairro: p.district || p.locality || '',
        cidade: p.city || '',
        uf: (p.state || '').slice(0, 2),
        cep: String(p.postcode || '').replace(/\D/g, '').slice(0, 8),
      }
    })
    .filter((g) => g && Number.isFinite(g.lat) && Number.isFinite(g.lng))
}

async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`
  const j = await fetchJson(url)
  if (!j?.address) return null
  return parseNominatimAddress(j.address, lat, lng)
}

function ruaConfere(logEsperado, geo) {
  const logEsp = String(logEsperado || '').trim()
  const ruaGeo = String(geo?.logradouro || '').trim()
  if (!logEsp) return true
  if (!ruaGeo) return false
  if (ruaCompativel(logEsp, ruaGeo)) return true
  if (ruasCompativelCep(logEsp, ruaGeo)) return true
  const limpo = limparLogradouroBusca(logEsp)
  if (limpo !== logEsp && ruaCompativel(limpo, ruaGeo)) return true
  return false
}

async function validarGeoNaRua(geo, logEsperado) {
  if (ruaConfere(logEsperado, geo)) return geo
  await sleep(1000)
  const rev = await reverseGeocode(geo.lat, geo.lng)
  if (rev && ruaConfere(logEsperado, rev)) return { ...geo, ...rev }
  return null
}

function bairrosCompat(a, b) {
  const na = normRef(a)
  const nb = normRef(b)
  if (!na || !nb) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

function scoreResultadoGeo(geo, parsed, cepData, logEsperado) {
  let score = 0
  const bairroEsp = parsed.bairro || cepData?.bairro || ''
  if (bairrosCompat(bairroEsp, geo.bairro)) score += 60
  const cepEsp = String(parsed.cep || cepData?.cep || '').replace(/\D/g, '')
  const cepGeo = String(geo.cep || '').replace(/\D/g, '')
  if (cepEsp && cepGeo && cepEsp === cepGeo) score += 40
  else if (cepEsp && cepGeo && cepEsp.slice(0, 5) === cepGeo.slice(0, 5)) score += 15
  if (ruaConfere(logEsperado, geo)) score += 25
  if (normRef(geo.cidade).includes('blumenau')) score += 5
  return score
}

/** Aproxima número na faixa da rua (OSM traz trecho, não porta). */
function interpolarNumeroNaRua(geo, numero) {
  const num = parseInt(String(numero || '').replace(/\D/g, ''), 10)
  const bb = geo.boundingbox
  if (!Number.isFinite(num) || num <= 0 || !bb || bb.length < 4) return geo
  const [latMin, latMax, lonMin, lonMax] = bb
  if (![latMin, latMax, lonMin, lonMax].every(Number.isFinite)) return geo
  const t = Math.min(0.92, Math.max(0.08, (num % 2000) / 2000))
  return {
    ...geo,
    lat: latMin + (latMax - latMin) * t,
    lng: lonMin + (lonMax - lonMin) * t,
  }
}

async function escolherMelhorGeo(resultados, parsed, cepData, logEsperado, { permitirAprox = false } = {}) {
  if (!resultados?.length) return null
  const ranked = resultados
    .map((g) => ({ g, score: scoreResultadoGeo(g, parsed, cepData, logEsperado) }))
    .filter((x) => x.score > 0 || ruaConfere(logEsperado, x.g))
    .sort((a, b) => b.score - a.score)
  if (!ranked.length) return null
  let best = ranked[0].g
  if (parsed.numero && parsed.numero !== 'S/N') {
    best = interpolarNumeroNaRua(best, parsed.numero)
  }
  const validated = await validarGeoNaRua(best, logEsperado)
  if (validated) return validated
  if (permitirAprox && ranked[0].score >= 55 && ruaConfere(logEsperado, best)) return best
  return null
}

function montarTentativas(parsed, cepData) {
  const log = cepData?.logradouro || parsed.logradouro
  const logLimpo = limparLogradouroBusca(log)
  const num = parsed.numero
  const bairro = parsed.bairro || cepData?.bairro || ''
  const cidade = parsed.cidade || cepData?.localidade || 'Blumenau'
  const uf = parsed.uf || cepData?.uf || 'SC'
  const cep = parsed.cep || cepData?.cep || ''
  const tentativas = []

  if (log && num && num !== 'S/N') {
    tentativas.push({ kind: 'structured', street: `${logLimpo} ${num}`, city: cidade, state: uf, postalcode: cep })
    tentativas.push({ kind: 'q', q: `${logLimpo}, ${num}, ${bairro}, ${cidade}, ${uf}, Brasil` })
    tentativas.push({ kind: 'q', q: `${log}, ${num}, ${bairro}, ${cidade}, ${uf}, Brasil` })
  }
  if (log) {
    tentativas.push({ kind: 'q', q: `${logLimpo}, ${bairro}, ${cidade}, ${uf}, Brasil` })
    tentativas.push({ kind: 'photon', q: `${logLimpo} ${num && num !== 'S/N' ? num : ''} ${cidade}`.replace(/\s+/g, ' ').trim() })
  }
  if (parsed.enderecoOriginal) {
    tentativas.push({ kind: 'q', q: parsed.enderecoOriginal })
  }
  if (cep) {
    tentativas.push({ kind: 'q', q: `${cep}, ${cidade}, ${uf}, Brasil` })
  }
  return { tentativas, logEsperado: logLimpo || log }
}

async function buscarGeoTentativa(t) {
  if (t.kind === 'structured') return geocodeNominatimStructured(t)
  if (t.kind === 'photon') return geocodePhoton(t.q)
  return geocodeNominatimQuery(t.q)
}

/**
 * Geocodifica igreja pelo endereço cadastrado, validando se a rua do pin bate.
 * @returns {{ lat, lng, _enderecoGeo, _enderecoRef, _enderecoGeoAprox? } | null}
 */
export async function geocodeIgrejaPorEndereco(ig) {
  const end = String(ig?.endereco || '').trim()
  if (!end && !ig?.cep && !ig?.logradouro) return null

  const parsedRaw = parseEnderecoIgreja(
    end || `${ig.logradouro || ''}, ${ig.numero || ''} - ${ig.bairro || ig.setor || ''}, ${ig.cidade || 'Blumenau'} - ${ig.uf || 'SC'}`,
  )
  if (!parsedRaw) return null
  const parsed = prepararEnderecoParaBusca({
    ...parsedRaw,
    cep: parsedRaw.cep || String(ig?.cep || '').replace(/\D/g, '').slice(0, 8),
    logradouro: parsedRaw.logradouro || String(ig?.logradouro || '').trim(),
    numero: parsedRaw.numero || String(ig?.numero || '').trim(),
    bairro: parsedRaw.bairro || String(ig?.bairro || ig?.setor || '').trim(),
    cidade: parsedRaw.cidade || String(ig?.cidade || 'Blumenau').trim(),
    uf: parsedRaw.uf || String(ig?.uf || 'SC').trim(),
  })

  let cepData = null
  if (parsed.cep) {
    cepData = await buscarEnderecoPorCepClient(parsed.cep)
    await sleep(250)
  }
  if (!cepData?.logradouro && parsed.logradouro) {
    cepData = await buscarCepPorLogradouro(parsed)
    await sleep(350)
  }
  if (cepData?.logradouro && parsed.logradouro && !ruasCompativelCep(parsed.logradouro, cepData.logradouro)) {
    parsed.logradouro = cepData.logradouro
  }

  const logCanonico = cepData?.logradouro || parsed.logradouro
  const { tentativas, logEsperado: logTentativas } = montarTentativas(parsed, cepData)
  const logEsperado = limparLogradouroBusca(logCanonico) || logTentativas
  const endRef = refEnderecoIgreja(ig)

  for (let ti = 0; ti < tentativas.length; ti++) {
    const t = tentativas[ti]
    await sleep(ti === 0 ? 250 : 450)
    const resultados = await buscarGeoTentativa(t)
    const ultima = ti === tentativas.length - 1
    const ok = await escolherMelhorGeo(
      resultados,
      parsed,
      cepData,
      logEsperado || extrairLogradouro(end),
      { permitirAprox: ultima },
    )
    if (ok && ruaConfere(logEsperado || extrairLogradouro(end), ok)) {
      const aprox = Boolean(ultima && !ok._ruaConfirmada)
      return {
        lat: ok.lat,
        lng: ok.lng,
        _enderecoGeo: true,
        _enderecoRef: endRef,
        _ruaConfirmada: !aprox,
        ...(aprox ? { _enderecoGeoAprox: true } : {}),
      }
    }
    if (ok && ultima) {
      return {
        lat: ok.lat,
        lng: ok.lng,
        _enderecoGeo: true,
        _enderecoRef: endRef,
        _enderecoGeoAprox: true,
        _ruaConfirmada: false,
      }
    }
  }

  const cepPin = await geocodeFallbackPorCep(parsed, cepData, endRef)
  if (cepPin) return cepPin

  const endTexto = end || [
    parsed.logradouro,
    parsed.numero && parsed.numero !== 'S/N' ? parsed.numero : '',
    parsed.bairro,
    `${parsed.cidade || 'Blumenau'} - ${parsed.uf || 'SC'}`,
  ].filter(Boolean).join(', ')
  if (endTexto.length > 8) {
    await sleep(500)
    const resultados = await geocodeNominatimQuery(`${endTexto}, Brasil`)
    if (resultados?.length) {
      const g = resultados[0]
      return {
        lat: Number(g.lat),
        lng: Number(g.lng),
        _enderecoGeo: true,
        _enderecoRef: endRef,
        _enderecoGeoAprox: true,
        _ruaConfirmada: false,
      }
    }
  }

  return null
}

/** Remove coords antigas não verificadas (pins errados) para forçar nova busca. */
export function limparCoordsNaoVerificados(coords, lista) {
  const next = { ...coords }
  let changed = false
  for (const ig of lista) {
    const id = ig.id
    const co = next[id] ?? next[String(id)]
    if (!co?.lat || !co?.lng) continue
    const ref = refEnderecoIgreja(ig)
    if (coordsVerificadosParaEndereco(co, ref)) continue
    delete next[id]
    delete next[String(id)]
    changed = true
  }
  return { coords: next, changed }
}

/** Remove coords de endereço antigo ou aproximado (força nova busca). Preserva gpsManual. */
export function limparCoordsEnderecoDesatualizado(coords, lista) {
  const next = { ...coords }
  let changed = false
  for (const ig of lista) {
    const id = ig.id
    const co = next[id] ?? next[String(id)]
    if (!co) continue
    if (co.gpsManual) continue
    const ref = refEnderecoIgreja(ig)
    const refMismatch = ref && co._enderecoRef && co._enderecoRef !== ref
    const semRua = co._enderecoGeo && !co._ruaConfirmada && !co._adbluGeo && !co._enderecoGeoCep
      && !co._enderecoGeoAprox && !co.gpsManual
    if (refMismatch || semRua) {
      delete next[id]
      delete next[String(id)]
      changed = true
    }
  }
  return { coords: next, changed }
}

/** Limpa todo cache GPS exceto pins arrastados manualmente pelo usuário. */
export function resetCoordsParaRecalcular(coords, lista) {
  const next = { ...coords }
  let changed = false
  for (const ig of lista) {
    const id = ig.id
    const co = next[id] ?? next[String(id)]
    if (!co) continue
    if (co.gpsManual) continue
    delete next[id]
    delete next[String(id)]
    changed = true
  }
  return { coords: next, changed }
}

/** Permite re-tentar geocode após melhorias no motor (ex.: v3.23). */
export function limparMarcadoresFalhaGeocode(coords) {
  const next = { ...coords }
  let changed = false
  for (const key of Object.keys(next)) {
    const co = next[key]
    if (co && co._enderecoGeoFail) {
      const { _enderecoGeoFail, ...rest } = co
      if (rest.lat || rest.lng) next[key] = rest
      else delete next[key]
      changed = true
    }
  }
  return { coords: next, changed }
}

export function patchCoordsVerificadas(id, coords, enderecoRef, extra = {}) {
  const manual = extra.gpsManual || false
  const { _enderecoGeoAprox, ...restCoords } = coords || {}
  return {
    ...restCoords,
    lat: extra.lat,
    lng: extra.lng,
    _enderecoGeo: true,
    _enderecoRef: enderecoRef,
    gpsManual: manual,
    _ruaConfirmada: manual || extra._ruaConfirmada || Boolean(extra._enderecoGeoCep) || false,
    ...(extra._enderecoGeoCep ? { _enderecoGeoCep: true } : {}),
    ...(extra._enderecoGeoAprox ? { _enderecoGeoAprox: true } : {}),
  }
}

export function patchCoordsFalha(id, enderecoRef) {
  return {
    _enderecoGeoFail: true,
    _enderecoRef: enderecoRef,
    lat: undefined,
    lng: undefined,
  }
}
