/**
 * CEP (ViaCEP) + geocodificação por endereço para cadastro de igrejas.
 * Ordem: Google / Mapbox / LocationIQ (se configurados) → Nominatim estruturado → busca livre.
 */
import { sleep } from './geocode'

const NOMINATIM_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'pt-BR',
  'User-Agent': 'CampanhaApp/3.51.0 (campanha.space)',
}

const VIEWBOX_REGIAO = '-49.22,-26.76,-48.80,-27.06'

const GOOGLE_GEO_KEY = String(import.meta.env.VITE_GOOGLE_GEOCODING_API_KEY || '').trim()
const MAPBOX_TOKEN = String(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '').trim()
const LOCATIONIQ_KEY = String(import.meta.env.VITE_LOCATIONIQ_API_KEY || '').trim()

function digitsCep(cep) {
  return String(cep || '').replace(/\D/g, '').slice(0, 8)
}

function prepLogradouro(log) {
  let s = String(log || '').trim()
  if (!s) return ''
  if (!/^(rua|av\.?|avenida|travessa|alameda|rodovia|estrada)\b/i.test(s)) {
    s = `Rua ${s}`
  }
  return s.replace(/\s+/g, ' ').trim()
}

function streetLine(logradouro, numero) {
  const log = prepLogradouro(logradouro)
  const num = String(numero || '').trim()
  const numOk = num && num !== 'S/N'
  if (!log) return ''
  if (numOk) return `${log}, ${num}`
  return log
}

function parseLatLng(lat, lng) {
  const la = Number(lat)
  const ln = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null
  return { lat: la, lng: ln }
}

async function geocodeGoogle(address) {
  if (!GOOGLE_GEO_KEY || !address) return null
  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}`
      + `&components=country:BR&key=${encodeURIComponent(GOOGLE_GEO_KEY)}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (data?.status !== 'OK' || !data.results?.length) return null
    const loc = data.results[0]?.geometry?.location
    const hit = parseLatLng(loc?.lat, loc?.lng)
    if (!hit) return null
    const locType = data.results[0]?.geometry?.location_type
    const aproximado = locType === 'APPROXIMATE' || locType === 'GEOMETRIC_CENTER'
    return { ...hit, aproximado }
  } catch {
    return null
  }
}

async function geocodeMapbox(address) {
  if (!MAPBOX_TOKEN || !address) return null
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`
      + `?access_token=${encodeURIComponent(MAPBOX_TOKEN)}&country=br&limit=1&language=pt`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const c = data?.features?.[0]?.geometry?.coordinates
    const hit = c?.length >= 2 ? parseLatLng(c[1], c[0]) : null
    if (!hit) return null
    const relevance = Number(data.features[0]?.relevance)
    return { ...hit, aproximado: !(relevance >= 0.85) }
  } catch {
    return null
  }
}

async function geocodeLocationIq(address) {
  if (!LOCATIONIQ_KEY || !address) return null
  try {
    const url =
      `https://us1.locationiq.com/v1/search?key=${encodeURIComponent(LOCATIONIQ_KEY)}`
      + `&q=${encodeURIComponent(address)}&format=json&countrycodes=br&limit=1&addressdetails=1`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const list = await res.json()
    if (!Array.isArray(list) || !list.length) return null
    const hit = parseLatLng(list[0].lat, list[0].lon)
    if (!hit) return null
    const cls = String(list[0].class || '')
    const typ = String(list[0].type || '')
    const aproximado = cls === 'place' && (typ === 'suburb' || typ === 'neighbourhood' || typ === 'city')
    return { ...hit, aproximado }
  } catch {
    return null
  }
}

async function nominatimStructured({ street, city, state, postalcode }) {
  const p = new URLSearchParams({
    format: 'json',
    addressdetails: '1',
    countrycodes: 'br',
    limit: '3',
    street: street || '',
    city: city || 'Blumenau',
    state: state || 'SC',
    country: 'Brazil',
  })
  if (postalcode) p.set('postalcode', String(postalcode).replace(/\D/g, '').slice(0, 8))
  const url = `https://nominatim.openstreetmap.org/search?${p}`
  try {
    const res = await fetch(url, { headers: NOMINATIM_HEADERS })
    if (!res.ok) return null
    const list = await res.json()
    if (!Array.isArray(list) || !list.length) return null
    const item = list[0]
    const hit = parseLatLng(item.lat, item.lon)
    if (!hit) return null
    const typ = String(item.type || item.class || '')
    const aproximado = /suburb|neighbourhood|administrative|postcode/i.test(typ)
    return { ...hit, aproximado, display: item.display_name }
  } catch {
    return null
  }
}

async function nominatimBusca(q) {
  if (!q || q.length < 6) return null
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=br&limit=3`
    + `&q=${encodeURIComponent(q)}&viewbox=${VIEWBOX_REGIAO}&bounded=0`
  try {
    const res = await fetch(url, { headers: NOMINATIM_HEADERS })
    if (!res.ok) return null
    const list = await res.json()
    if (!Array.isArray(list) || !list.length) return null
    const item = list[0]
    const hit = parseLatLng(item.lat, item.lon)
    if (!hit) return null
    return { ...hit, display: item.display_name }
  } catch {
    return null
  }
}

async function tentarProvedoresAltaPrecisao(address) {
  const providers = [
    () => geocodeGoogle(address),
    () => geocodeMapbox(address),
    () => geocodeLocationIq(address),
  ]
  for (let i = 0; i < providers.length; i++) {
    if (i > 0) await sleep(120)
    const hit = await providers[i]()
    if (hit) return hit
  }
  return null
}

/**
 * @returns {Promise<{ cep, logradouro, bairro, localidade, uf, erro?: boolean } | null>}
 */
export async function buscarDadosPorCep(cep) {
  const digits = digitsCep(cep)
  if (digits.length !== 8) return null
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const raw = await res.json()
    if (raw?.erro) return { cep: digits, erro: true }
    return {
      cep: digits,
      logradouro: String(raw.logradouro || '').trim(),
      bairro: String(raw.bairro || '').trim(),
      localidade: String(raw.localidade || '').trim(),
      uf: String(raw.uf || '').trim().toUpperCase().slice(0, 2),
    }
  } catch {
    return null
  }
}

/**
 * @param {string} logradouro
 * @param {string} bairro
 * @param {string} cidade
 * @param {string} uf
 * @param {{ numero?: string, cep?: string }} [opts]
 * @returns {Promise<{ lat: number, lng: number, aproximado: boolean } | null>}
 */
export async function obterCoordenadasPorEndereco(logradouro, bairro, cidade, uf, opts = {}) {
  const log = prepLogradouro(logradouro)
  const b = String(bairro || '').trim()
  const cid = String(cidade || 'Blumenau').trim()
  const estado = String(uf || 'SC').trim().toUpperCase().slice(0, 2)
  const num = String(opts.numero || '').trim()
  const cep = digitsCep(opts.cep)
  const ruaNum = streetLine(logradouro, num)

  const enderecoCompleto = [
    ruaNum || log,
    b,
    `${cid} - ${estado}`,
    'Brasil',
  ].filter(Boolean).join(', ')

  if (enderecoCompleto.length >= 10) {
    const hi = await tentarProvedoresAltaPrecisao(enderecoCompleto)
    if (hi) return hi
  }

  if (ruaNum) {
    await sleep(350)
    const structured = await nominatimStructured({
      street: ruaNum,
      city: cid,
      state: estado,
      postalcode: cep.length === 8 ? cep : undefined,
    })
    if (structured) return structured
  }

  if (log && num && num !== 'S/N') {
    await sleep(350)
    const housenumber = num
    const streetOnly = prepLogradouro(logradouro)
    const p = new URLSearchParams({
      format: 'json',
      addressdetails: '1',
      countrycodes: 'br',
      limit: '3',
      street: streetOnly,
      city: cid,
      state: estado,
      country: 'Brazil',
    })
    p.set('housenumber', housenumber)
    if (cep.length === 8) p.set('postalcode', cep)
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${p}`, {
        headers: NOMINATIM_HEADERS,
      })
      if (res.ok) {
        const list = await res.json()
        if (Array.isArray(list) && list.length) {
          const hit = parseLatLng(list[0].lat, list[0].lon)
          if (hit) return { ...hit, aproximado: false, display: list[0].display_name }
        }
      }
    } catch { /* fallback abaixo */ }
  }

  const tentativas = []
  if (log && num && num !== 'S/N') {
    tentativas.push({ q: `${ruaNum}, ${b}, ${cid}, ${estado}, Brasil`, aproximado: false })
  }
  if (log && b) {
    tentativas.push({ q: `${log}, ${b}, ${cid}, ${estado}, Brasil`, aproximado: false })
  }
  if (log) {
    tentativas.push({ q: `${log}, ${cid}, ${estado}, Brasil`, aproximado: true })
  }
  if (b && cid) {
    tentativas.push({ q: `${b}, ${cid}, ${estado}, Brasil`, aproximado: true })
  }

  for (let i = 0; i < tentativas.length; i++) {
    if (i > 0) await sleep(400)
    const { q, aproximado } = tentativas[i]
    const hit = await nominatimBusca(q)
    if (hit) return { lat: hit.lat, lng: hit.lng, aproximado }
  }
  return null
}

/** Geocodifica a partir dos campos do formulário de igreja (CEP opcional já preenchido). */
export async function geocodificarFormularioIgreja(form = {}) {
  const logradouro = String(form.logradouro || '').trim()
  const bairro = String(form.bairro || form.setor || '').trim()
  const cidade = String(form.cidade || 'Blumenau').trim()
  const uf = String(form.uf || 'SC').trim()
  const numero = String(form.numero || '').trim()
  const cep = digitsCep(form.cep)

  let coords = await obterCoordenadasPorEndereco(logradouro, bairro, cidade, uf, { numero, cep })
  if (coords) return coords

  const endManual = String(form.endereco || '').trim()
  if (endManual.length >= 12) {
    await sleep(400)
    const hi = await tentarProvedoresAltaPrecisao(`${endManual}, Brasil`)
    if (hi) return hi
    const hit = await nominatimBusca(`${endManual}, Brasil`)
    if (hit) return { lat: hit.lat, lng: hit.lng, aproximado: true }
  }

  if (cep.length === 8) {
    const cepData = await buscarDadosPorCep(cep)
    if (cepData && !cepData.erro) {
      await sleep(400)
      coords = await obterCoordenadasPorEndereco(
        cepData.logradouro || logradouro,
        cepData.bairro || bairro,
        cepData.localidade || cidade,
        cepData.uf || uf,
        { numero, cep },
      )
      if (coords) return coords
      const qCep = `${cep}, ${cepData.localidade || cidade}, ${cepData.uf || uf}, Brasil`
      const hit = await nominatimBusca(qCep)
      if (hit) return { lat: hit.lat, lng: hit.lng, aproximado: true }
    }
  }

  return null
}
