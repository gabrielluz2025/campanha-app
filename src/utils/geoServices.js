/**
 * CEP (ViaCEP) + geocodificação por endereço (Nominatim/OSM) para cadastro de igrejas.
 */
import { sleep } from './geocode'

const NOMINATIM_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'pt-BR',
  'User-Agent': 'CampanhaApp/3.45.0 (campanha.space)',
}

const VIEWBOX_REGIAO = '-49.22,-26.76,-48.80,-27.06'

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
    const lat = Number(item.lat)
    const lng = Number(item.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng, display: item.display_name }
  } catch {
    return null
  }
}

/**
 * @param {string} logradouro
 * @param {string} bairro
 * @param {string} cidade
 * @param {string} uf
 * @param {{ numero?: string }} [opts]
 * @returns {Promise<{ lat: number, lng: number, aproximado: boolean } | null>}
 */
export async function obterCoordenadasPorEndereco(logradouro, bairro, cidade, uf, opts = {}) {
  const log = prepLogradouro(logradouro)
  const b = String(bairro || '').trim()
  const cid = String(cidade || 'Blumenau').trim()
  const estado = String(uf || 'SC').trim().toUpperCase().slice(0, 2)
  const num = String(opts.numero || '').trim()
  const numOk = num && num !== 'S/N'

  const tentativas = []
  if (log && numOk) {
    tentativas.push({ q: `${log}, ${num}, ${b}, ${cid}, ${estado}, Brasil`, aproximado: false })
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

  let coords = await obterCoordenadasPorEndereco(logradouro, bairro, cidade, uf, { numero })
  if (coords) return coords

  const endManual = String(form.endereco || '').trim()
  if (endManual.length >= 12) {
    await sleep(400)
    const hit = await nominatimBusca(`${endManual}, Brasil`)
    if (hit) return { lat: hit.lat, lng: hit.lng, aproximado: true }
  }

  const cep = digitsCep(form.cep)
  if (cep.length === 8) {
    const cepData = await buscarDadosPorCep(cep)
    if (cepData && !cepData.erro) {
      await sleep(400)
      coords = await obterCoordenadasPorEndereco(
        cepData.logradouro || logradouro,
        cepData.bairro || bairro,
        cepData.localidade || cidade,
        cepData.uf || uf,
        { numero },
      )
      if (coords) return coords
      const qCep = `${cep}, ${cepData.localidade || cidade}, ${cepData.uf || uf}, Brasil`
      const hit = await nominatimBusca(qCep)
      if (hit) return { lat: hit.lat, lng: hit.lng, aproximado: true }
    }
  }

  return null
}
