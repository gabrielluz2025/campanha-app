/**
 * Busca igrejas via Google Places (Maps JS API) + cache local + depara com catálogo.
 * Requer senha para chamadas à API (evita uso acidental pela equipe).
 */
import { normStr } from './constants'
import { haversineKm } from './rotaUtils'
import { normalizarBairro } from './bairroMapa'
import { sleep } from './geocode'
import { readIgrejasEnrich } from './igrejasOverpass'
import { persistLocalOnly, liberarCachePesadoLocal } from './persist'
import { pushChurchCatalogToServer } from '../lib/cloudSync'
import { eIgrejaCrista } from './igrejaCrista'
import { gerarIdIgrejaCustom } from './igrejaCustomId'
import { matchPorEndereco, matchGpsUnico, hitNoBairro, extrairNumeroEndereco, ruaCompativel, ruasConflitam, nomesParecidosIgreja } from './igrejaMatch'

export const IGREJAS_GOOGLE_CACHE_KEY = 'igrejas_google_places_cache'
export const IGREJAS_GOOGLE_SENHA = '230811'
export const IGREJAS_GOOGLE_AUTO_NOVAS_KEY = 'igrejas_google_auto_novas'

const PHP_API = typeof window !== 'undefined' && window.location?.origin
  ? `${window.location.origin}/api.php`
  : '/api.php'

/** Cadastro vivo na memória — fonte da busca, não depende do localStorage. */
let catalogoMemoria = null

export function getCatalogoIgrejasMemoria() {
  return catalogoMemoria
}

export function setCatalogoIgrejasMemoria(next) {
  if (!next) return
  catalogoMemoria = {
    custom: Array.isArray(next.custom) ? next.custom : [],
    enrich: next.enrich && typeof next.enrich === 'object' ? next.enrich : {},
    coords: next.coords && typeof next.coords === 'object' ? next.coords : {},
  }
}

const MATCH_KM_NOME = 0.12
const MATCH_KM_PROX = 0.025
const GPS_MUDOU_KM = 0.08

const BLUMENAU_CENTER = { lat: -26.9194, lng: -49.0661 }
const NEARBY_RADIUS_M = 14000
const NEARBY_BAIRRO_M = 2200

function chaveBairros(bairros = []) {
  return [...new Set((bairros || []).map(b => normStr(b)).filter(Boolean))].sort().join('|')
}

function montarQueriesGoogle(cidade, bairros = []) {
  const c = String(cidade || 'Blumenau').trim() || 'Blumenau'
  const base = [
    `igreja ${c} SC`,
    `templo ${c} SC`,
    `paróquia ${c} SC`,
    `capela ${c} SC`,
    `catedral ${c} SC`,
    `assembleia de deus ${c}`,
    `igreja batista ${c}`,
    `igreja católica ${c}`,
    `igreja evangélica ${c}`,
    `igreja pentecostal ${c}`,
    `igreja luterana ${c}`,
    `igreja adventista ${c}`,
    `igreja quadrangular ${c}`,
    `igreja presbiteriana ${c}`,
    `congregação cristã ${c}`,
  ]
  const extra = (bairros || []).slice(0, 14).flatMap(b => [
    `igreja ${b} ${c} SC`,
    `igreja ${c} ${b}`,
  ])
  return [...base, ...extra]
}

function montarQueriesBairro(cidade, bairro) {
  const c = String(cidade || 'Blumenau').trim() || 'Blumenau'
  const b = String(bairro || '').trim()
  if (!b) return montarQueriesGoogle(c, [])
  return [
    `igreja ${b} ${c} SC`,
    `igreja ${c} ${b}`,
    `templo ${b} ${c}`,
    `capela ${b} ${c}`,
    `paróquia ${b} ${c}`,
    `assembleia de deus ${b} ${c}`,
    `igreja evangélica ${b} ${c}`,
    `igreja católica ${b} ${c}`,
  ]
}

/** Catálogo vivo: memória da busca, depois o que está no site/navegador. */
export function lerEstadoIgrejas(catalogProp = []) {
  let custom = []
  let coords = {}
  try { custom = JSON.parse(localStorage.getItem('igrejas_custom') || '[]') || [] } catch { custom = [] }
  try { coords = JSON.parse(localStorage.getItem('geo_coords_igrejas') || '{}') || {} } catch { coords = {} }
  if (!Array.isArray(custom)) custom = []
  let enrich = readIgrejasEnrich()
  if (catalogoMemoria?.custom?.length >= custom.length) {
    custom = catalogoMemoria.custom
    if (catalogoMemoria.enrich) enrich = { ...enrich, ...catalogoMemoria.enrich }
    if (catalogoMemoria.coords) coords = { ...coords, ...catalogoMemoria.coords }
  }
  const map = new Map()
  for (const i of catalogProp || []) {
    if (i?.id == null) continue
    map.set(i.id, i)
  }
  for (const i of custom) {
    if (i?.id == null) continue
    map.set(i.id, { ...(map.get(i.id) || {}), ...i })
  }
  return { catalog: [...map.values()], custom, enrich, coords }
}

export function verificarSenhaGoogle(s) {
  return String(s || '').trim() === IGREJAS_GOOGLE_SENHA
}

export function readGooglePlacesCache() {
  try {
    const v = JSON.parse(localStorage.getItem(IGREJAS_GOOGLE_CACHE_KEY) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export function writeGooglePlacesCache(data) {
  try {
    const hits = (data?.hits || []).map((h) => {
      if (!h || typeof h !== 'object') return h
      const { foto, ...rest } = h
      return rest
    })
    const payload = { ...data, hits, placeDetails: data?.placeDetails || {} }
    localStorage.setItem(IGREJAS_GOOGLE_CACHE_KEY, JSON.stringify(payload))
  } catch {
    try { localStorage.removeItem(IGREJAS_GOOGLE_CACHE_KEY) } catch { /* ignore */ }
  }
}

export function cacheGoogleValido(cidade = 'Blumenau', bairros = []) {
  const c = readGooglePlacesCache()
  const city = normStr(cidade)
  if (normStr(c.cidade) !== city) return false
  if (chaveBairros(c.bairros) !== chaveBairros(bairros)) return false
  return Array.isArray(c.hits) && c.hits.length > 0
}

function nomesParecidos(a, b) {
  return nomesParecidosIgreja(a, b)
}

function inferDenominacao(nome = '') {
  const n = normStr(nome)
  if (n.includes('ASSEMBLEIA DE DEUS') || /\bAD\b/.test(n)) return 'Assembleia de Deus'
  if (n.includes('BATISTA')) return 'Batista'
  if (n.includes('PRESBITER')) return 'Presbiteriana'
  if (n.includes('METODISTA')) return 'Metodista'
  if (n.includes('ADVENTISTA')) return 'Adventista'
  if (n.includes('CATOLICA') || n.includes('PAROQUIA')) return 'Igreja Católica'
  if (n.includes('UNIVERSAL')) return 'Universal'
  if (n.includes('CONGREGACAO CRISTA')) return 'Congregação Cristã'
  return 'Outra'
}

function setorFromComponents(components = []) {
  for (const type of ['sublocality', 'sublocality_level_1', 'neighborhood', 'administrative_area_level_4']) {
    const c = components.find(x => x.types?.includes(type))
    if (c?.long_name) return normalizarBairro(c.long_name) || c.long_name
  }
  return ''
}

function cepFromComponents(components = []) {
  const c = components.find(x => x.types?.includes('postal_code'))
  const raw = String(c?.long_name || '').replace(/\D/g, '')
  return raw.length === 8 ? raw : ''
}

function getPlacesService() {
  if (!window.google?.maps?.places) {
    throw new Error('Google Places não carregado. Aguarde o mapa ou recarregue a página.')
  }
  const div = document.createElement('div')
  return new window.google.maps.places.PlacesService(div)
}

function geocodeTextoGoogle(address) {
  return new Promise((resolve) => {
    if (!window.google?.maps?.Geocoder || !address) {
      resolve(null)
      return
    }
    const g = new window.google.maps.Geocoder()
    g.geocode({ address, componentRestrictions: { country: 'BR' } }, (results, status) => {
      if (status === 'OK' && results?.[0]?.geometry?.location) {
        const loc = results[0].geometry.location
        resolve({ lat: loc.lat(), lng: loc.lng() })
        return
      }
      resolve(null)
    })
  })
}

function findPlaceFromQuery(service, query) {
  return new Promise((resolve) => {
    if (!query || !service?.findPlaceFromQuery) {
      resolve([])
      return
    }
    service.findPlaceFromQuery({
      query,
      fields: ['place_id', 'name', 'formatted_address', 'geometry'],
    }, (results, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && results?.length) {
        resolve(results)
        return
      }
      resolve([])
    })
  })
}

function placesStatusOk(status) {
  const S = window.google.maps.places.PlacesServiceStatus
  return status === S.OK || status === S.ZERO_RESULTS
}

function textSearchPaged(service, request) {
  return new Promise((resolve, reject) => {
    const acc = []
    const run = (req) => {
      service.textSearch(req, (results, status, pagination) => {
        if (status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          resolve(acc)
          return
        }
        if (!placesStatusOk(status)) {
          if (acc.length) resolve(acc)
          else reject(new Error(`Google Places: ${status}`))
          return
        }
        acc.push(...(results || []))
        if (pagination?.hasNextPage) {
          setTimeout(() => pagination.nextPage(), 2200)
        } else {
          resolve(acc)
        }
      })
    }
    run(request)
  })
}

function nearbySearchPaged(service, request) {
  return new Promise((resolve, reject) => {
    const acc = []
    const run = (req) => {
      service.nearbySearch(req, (results, status, pagination) => {
        if (status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          resolve(acc)
          return
        }
        if (!placesStatusOk(status)) {
          if (acc.length) resolve(acc)
          else reject(new Error(`Google Nearby: ${status}`))
          return
        }
        acc.push(...(results || []))
        if (pagination?.hasNextPage) {
          setTimeout(() => pagination.nextPage(), 2200)
        } else {
          resolve(acc)
        }
      })
    }
    run(request)
  })
}

function getPlaceDetails(service, placeId) {
  return new Promise((resolve, reject) => {
    service.getDetails({
      placeId,
      fields: [
        'place_id', 'name', 'formatted_address', 'geometry',
        'formatted_phone_number', 'international_phone_number',
        'website', 'url', 'address_components', 'opening_hours',
        'photos', 'rating', 'user_ratings_total', 'business_status',
      ],
    }, (place, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
        resolve(place)
      } else {
        reject(new Error(`Detalhes: ${status}`))
      }
    })
  })
}

// Tipos do Google Places que indicam estabelecimento NÃO religioso
const TIPOS_NAO_RELIGIOSO = new Set([
  'grocery_or_supermarket', 'supermarket', 'convenience_store', 'store', 'shopping_mall',
  'clothing_store', 'shoe_store', 'furniture_store', 'hardware_store', 'home_goods_store',
  'electronics_store', 'book_store', 'bicycle_store', 'car_dealer', 'car_rental',
  'restaurant', 'food', 'cafe', 'bakery', 'meal_takeaway', 'meal_delivery', 'bar',
  'gas_station', 'parking', 'car_repair', 'car_wash',
  'hospital', 'doctor', 'dentist', 'pharmacy', 'veterinary_care', 'beauty_salon', 'hair_care',
  'gym', 'stadium', 'night_club', 'casino', 'movie_theater', 'amusement_park',
  'bank', 'atm', 'finance', 'insurance_agency', 'real_estate_agency',
  'school', 'university', 'library',
  'lodging', 'rv_park', 'campground',
  'laundry', 'locksmith', 'moving_company', 'storage',
  'funeral_home', 'cemetery',
])

// Tipos explicitamente religiosos aceitos
const TIPOS_RELIGIOSO = new Set(['church', 'place_of_worship', 'hindu_temple', 'mosque', 'synagogue'])

// Nome claramente não-religioso (palavras de negócio sem prefixo de igleja)
function nomeEhNegocioNaoReligioso(nome) {
  const n = normStr(nome)
  // Só bloqueia se não tiver palavra religiosa no nome
  const temReligioso = /IGREJA|IGREJ|TEMPLO|CAPEL|PAROQUIA|CATEDRAL|ASSEMBLEIA|CONGREGAC|MINISTERIO|PASTOR|EVANGEL|CRISTA|CRISTAO|BATISTA|PRESBITER|ADVENT|LUTERAN|METODIST|QUADRANGUL|UNIVERSAL DO REINO|DEUS AMOR|PENTECOST|RENOVADA|SHEKINAH|MARANATA|MISSAO|MISSOES|GOSPEL|WORSHIP|CHURCH/.test(n)
  if (temReligioso) return false
  // Palavras de negócio inequívocas no início do nome
  return /^(MERCADO|SUPERMERCADO|MERCEARIA|ARMAZEM|PADARIA|FARMACIA|DROGARIA|LOJA|BOUTIQUE|SALAO|BARBEARIA|ACADEMIA|RESTAURANTE|LANCHONETE|PIZZARIA|HAMBURGUERIA|SORVETERIA|SORVETER|ESCOLA |COLEGIO|CLINICA|CONSULTORIO|HOSPITAL|POSTO DE SAUDE|POSTO POLICIAL|AUTO POSTO|BORRACHARIA|IMOBILIARIA|INCORPORADORA|CONSTRUTORA|OFICINA|EMPRESA|ESCRITORIO|DEPOSITO|ARMAZEM|TERRENO|LOTE |LOCADORA|PETSHOP|PET SHOP|SUPOSTO|RESIDENCIA|CONDOMINIO|APART|SITIO|CHACARA)/.test(n)
}

function normalizarPlaceBasico(place, estrategia = 'text') {
  if (!place?.place_id) return null
  const lat = typeof place.geometry?.location?.lat === 'function'
    ? place.geometry.location.lat()
    : place.geometry?.location?.lat
  const lng = typeof place.geometry?.location?.lng === 'function'
    ? place.geometry.location.lng()
    : place.geometry?.location?.lng
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const nome = String(place.name || '').trim()
  if (!nome) return null

  // --- Filtro de tipos Google ---
  const tipos = Array.isArray(place.types) ? place.types : []
  const ehReligioso = tipos.some(t => TIPOS_RELIGIOSO.has(t))
  const ehNaoReligioso = tipos.some(t => TIPOS_NAO_RELIGIOSO.has(t))
  // Se o Google classificou como estabelecimento não religioso sem nenhum tipo religioso → rejeitar
  if (ehNaoReligioso && !ehReligioso) return null
  // Se não tem tipo religioso e o nome é claramente um negócio → rejeitar
  if (!ehReligioso && nomeEhNegocioNaoReligioso(nome)) return null

  const denominacao = inferDenominacao(nome)
  const endereco = String(place.formatted_address || place.vicinity || '').trim()
  const setor = setorFromComponents(place.address_components || [])

  return {
    googlePlaceId: place.place_id,
    nome,
    endereco,
    lat,
    lng,
    setor,
    denominacao,
    telefone: '',
    website: '',
    cep: cepFromComponents(place.address_components || []),
    cultoGoogle: '',
    fonte: 'google',
    estrategia,
  }
}

function fotoDoPlace(place) {
  try {
    const shot = place?.photos?.[0]
    if (!shot || typeof shot.getUrl !== 'function') return ''
    return shot.getUrl({ maxWidth: 800 })
  } catch {
    return ''
  }
}

function normalizarPlaceDetalhado(place) {
  const base = normalizarPlaceBasico(place, 'details')
  if (!base) return null
  const tel = String(place.formatted_phone_number || place.international_phone_number || '').trim()
  let website = String(place.website || '').trim()
  const cep = cepFromComponents(place.address_components || []) || base.cep
  const setor = setorFromComponents(place.address_components || []) || base.setor
  let cultoGoogle = ''
  if (place.opening_hours?.weekday_text?.length) {
    cultoGoogle = place.opening_hours.weekday_text.join('; ')
  }
  const redes = extrairRedesDeUrl(website)
  let instagram = redes.instagram
  let facebook = redes.facebook
  if (redes.instagram && website.toLowerCase().includes('instagram.com')) {
    instagram = website
    website = ''
  } else if (redes.facebook && (website.toLowerCase().includes('facebook.com') || website.toLowerCase().includes('fb.com'))) {
    facebook = website
    website = ''
  }
  const whatsapp = inferirWhatsApp(tel)
  const foto = fotoDoPlace(place)
  return {
    ...base,
    telefone: tel,
    website,
    cep,
    setor,
    cultoGoogle,
    instagram,
    facebook,
    whatsapp,
    endereco: String(place.formatted_address || base.endereco).trim(),
    mapsUrl: String(place.url || '').trim(),
    rating: Number.isFinite(Number(place.rating)) ? Number(place.rating) : null,
    avaliacoes: Number(place.user_ratings_total) || 0,
    foto,
  }
}

function extrairRedesDeUrl(url = '') {
  const u = String(url || '').trim()
  const lower = u.toLowerCase()
  let instagram = ''
  let facebook = ''

  const igM = lower.match(/instagram\.com\/([a-z0-9._]+)/i)
  if (igM && !['p', 'reel', 'reels', 'stories', 'explore'].includes(igM[1].toLowerCase())) {
    instagram = `https://instagram.com/${igM[1]}`
  }

  const fbM = lower.match(/(?:facebook\.com|fb\.com|m\.facebook\.com)\/([a-z0-9._\-]+)/i)
  if (fbM && !['sharer', 'share', 'plugins', 'dialog', 'login'].includes(fbM[1].toLowerCase())) {
    facebook = `https://facebook.com/${fbM[1]}`
  }

  return { instagram, facebook }
}

function sitePrecisaBuscaRedes(website = '', instagram = '', facebook = '') {
  if (campoVazio(website)) return false
  const lower = website.toLowerCase()
  if (lower.includes('instagram.com') || lower.includes('facebook.com') || lower.includes('fb.com')) {
    return false
  }
  return campoVazio(instagram) || campoVazio(facebook)
}

/** Lê Instagram/Facebook no HTML do site via proxy do servidor (api.php). */
async function buscarRedesDoSite(website) {
  const url = String(website || '').trim()
  if (!url || !/^https?:\/\//i.test(url)) return { instagram: '', facebook: '' }
  try {
    const r = await fetch(`${PHP_API}?action=igreja_redes&url=${encodeURIComponent(url)}`)
    if (!r.ok) return { instagram: '', facebook: '' }
    const data = await r.json()
    return {
      instagram: String(data?.instagram || '').trim(),
      facebook: String(data?.facebook || '').trim(),
    }
  } catch {
    return { instagram: '', facebook: '' }
  }
}

/** WhatsApp comum em telefone celular BR quando Google não traz link */
function inferirWhatsApp(tel = '') {
  const d = String(tel || '').replace(/\D/g, '')
  if (d.length === 13 && d.startsWith('55')) return `https://wa.me/${d}`
  if (d.length === 11 || d.length === 10) return `https://wa.me/55${d}`
  return ''
}

function campoVazio(val) {
  if (val == null) return true
  const s = String(val).trim()
  return !s || s === '—' || s === '/fotos/sem-foto.jpg'
}

function igrejaPrecisaCoords(ig) {
  if (!ig) return false
  if (!Number.isFinite(ig.lat) || !Number.isFinite(ig.lng)) return true
  return Math.abs(ig.lat - (-26.9194)) < 0.0001 && Math.abs(ig.lng - (-49.0661)) < 0.0001
}

/** Igreja do catálogo ainda sem algum dado que o Google pode trazer */
export function igrejaTemCamposFaltantes(ig, enrich = {}) {
  if (!ig) return false
  const fields = ['endereco', 'cep', 'telefone', 'website', 'instagram', 'facebook', 'whatsapp', 'culto']
  if (fields.some(f => campoVazio(enrich[ig.id]?.[f] ?? ig[f]))) return true
  return igrejaPrecisaCoords(ig)
}

/** O hit do Google traz algo que ainda falta na igreja */
export function hitPreencheFaltantes(hit, ig, enrich = {}) {
  if (!hit || !ig) return false
  const pairs = [
    ['endereco', hit.endereco],
    ['cep', hit.cep],
    ['telefone', hit.telefone],
    ['website', hit.website],
    ['instagram', hit.instagram],
    ['facebook', hit.facebook],
    ['whatsapp', hit.whatsapp],
    ['culto', hit.cultoGoogle],
  ]
  for (const [field, val] of pairs) {
    if (!campoVazio(val) && campoVazio(enrich[ig.id]?.[field] ?? ig[field])) return true
  }
  if (igrejaPrecisaCoords(ig) && Number.isFinite(hit.lat)) return true
  return false
}

function enderecoEquivalente(a, b) {
  if (campoVazio(a) && campoVazio(b)) return true
  if (campoVazio(a) || campoVazio(b)) return false
  if (normStr(a) === normStr(b)) return true
  const na = extrairNumeroEndereco(a)
  const nb = extrairNumeroEndereco(b)
  return Boolean(na && nb && na === nb && ruaCompativel(a, b))
}

/** De-para: o que mudou, o que falta, o que bate. */
export function analisarDeparaGoogle(hit, ig, enrich = {}) {
  if (!ig) return { triagem: 'nova', diffs: [] }
  const diffs = []
  const curEnd = enrich[ig.id]?.endereco ?? ig.endereco
  if (!campoVazio(hit.endereco) && !enderecoEquivalente(hit.endereco, curEnd)) {
    diffs.push({
      campo: 'endereco',
      tipo: 'mudou',
      nosso: curEnd || '—',
      google: hit.endereco,
    })
  }
  if (Number.isFinite(ig.lat) && Number.isFinite(ig.lng) && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) {
    const dKm = haversineKm({ lat: ig.lat, lng: ig.lng }, { lat: hit.lat, lng: hit.lng })
    if (dKm >= GPS_MUDOU_KM) {
      diffs.push({
        campo: 'gps',
        tipo: 'mudou',
        nosso: `${Number(ig.lat).toFixed(5)}, ${Number(ig.lng).toFixed(5)}`,
        google: `${Number(hit.lat).toFixed(5)}, ${Number(hit.lng).toFixed(5)}`,
        metros: Math.round(dKm * 1000),
      })
    }
  }
  const pares = [
    ['telefone', hit.telefone],
    ['cep', hit.cep],
    ['website', hit.website],
    ['instagram', hit.instagram],
    ['facebook', hit.facebook],
    ['whatsapp', hit.whatsapp],
    ['culto', hit.cultoGoogle],
    ['setor', hit.setor],
  ]
  for (const [campo, val] of pares) {
    if (campoVazio(val)) continue
    const cur = enrich[ig.id]?.[campo] ?? ig[campo]
    if (campoVazio(cur)) diffs.push({ campo, tipo: 'falta', nosso: '—', google: val })
  }
  if (igrejaPrecisaCoords(ig) && Number.isFinite(hit.lat)) {
    diffs.push({ campo: 'coordenadas', tipo: 'falta', nosso: '—', google: 'GPS Google' })
  }
  if (diffs.some(d => d.tipo === 'mudou')) return { triagem: 'mudou', diffs }
  if (diffs.some(d => d.tipo === 'falta')) return { triagem: 'complementar', diffs }
  return { triagem: 'ok', diffs }
}

function scoreHit(hit) {
  return [
    hit.endereco, hit.cep, hit.telefone, hit.website,
    hit.instagram, hit.facebook, hit.whatsapp, hit.cultoGoogle,
  ].filter(v => !campoVazio(v)).length
}

/** Um hit por igreja — o mais completo */
export function melhorHitPorIgreja(hits = []) {
  const map = new Map()
  for (const h of hits) {
    if (h.status !== 'existe' || h.matchId == null) continue
    const cur = map.get(h.matchId)
    if (!cur || scoreHit(h) > scoreHit(cur)) map.set(h.matchId, h)
  }
  return [...map.values()]
}

function aliviarFotoIgreja(foto) {
  const s = String(foto || '')
  if (!s || s.startsWith('data:')) return '/fotos/sem-foto.jpg'
  return s
}

function aliviarListaIgrejas(lista = []) {
  return (lista || []).map((ig) => {
    if (!ig || typeof ig !== 'object') return ig
    return { ...ig, foto: aliviarFotoIgreja(ig.foto) }
  })
}

function compactarIgrejaCustom(ig) {
  if (!ig || typeof ig !== 'object') return ig
  const o = {
    id: ig.id,
    nome: ig.nome || '',
    setor: ig.setor || '',
    denominacao: ig.denominacao || 'Outra',
    endereco: ig.endereco || '',
    lat: ig.lat,
    lng: ig.lng,
    googlePlaceId: ig.googlePlaceId || '',
    fonte: ig.fonte || 'google',
    triagemOk: true,
  }
  if (ig.culto) o.culto = ig.culto
  if (ig.telefone) o.telefone = ig.telefone
  if (ig.whatsapp) o.whatsapp = ig.whatsapp
  if (ig.website) o.website = ig.website
  if (ig.cep) o.cep = ig.cep
  if (ig.instagram) o.instagram = ig.instagram
  if (ig.facebook) o.facebook = ig.facebook
  return o
}

function compactarEnrich(enrich = {}) {
  const out = {}
  for (const [id, en] of Object.entries(enrich || {})) {
    if (!en || typeof en !== 'object') continue
    const slim = {}
    if (en.googlePlaceId) slim.googlePlaceId = en.googlePlaceId
    if (en.telefone) slim.telefone = en.telefone
    if (en.website) slim.website = en.website
    if (en.cep) slim.cep = en.cep
    if (en.instagram) slim.instagram = en.instagram
    if (en.facebook) slim.facebook = en.facebook
    if (en.whatsapp) slim.whatsapp = en.whatsapp
    if (en.nomeGoogle) slim.nomeGoogle = en.nomeGoogle
    if (en.endereco) slim.endereco = en.endereco
    if (Object.keys(slim).length) out[id] = slim
  }
  return out
}

export async function persistirResultadoGoogle(result) {
  if (!result) return { ok: false, error: 'Sem resultado para gravar.' }
  liberarCachePesadoLocal()
  const custom = aliviarListaIgrejas(result.custom || []).map(compactarIgrejaCustom)
  const enrich = compactarEnrich(result.enrich || {})
  const coords = {}
  for (const [id, c] of Object.entries(result.coords || {})) {
    const lat = Number(c?.lat)
    const lng = Number(c?.lng)
    if (Number.isFinite(lat) && Number.isFinite(lng)) coords[id] = { lat, lng }
  }
  setCatalogoIgrejasMemoria({ custom, enrich, coords })

  const cloud = await pushChurchCatalogToServer({ custom, enrich, coords })
  if (!cloud?.ok) return cloud || { ok: false, error: 'Não gravou no site.' }

  try {
    persistLocalOnly('igrejas_custom', custom)
    persistLocalOnly('igrejas_enrich', enrich)
    persistLocalOnly('geo_coords_igrejas', coords)
  } catch { /* cache local é opcional — o cadastro oficial é o site */ }

  return cloud
}

/** Cadastra no sistema as igrejas do Google (novas + selecionadas) e reclassifica a lista. */
export async function imputarHitsGoogle(hitsList, {
  catalogProp = [],
  maxIdExternas = 1999,
  atualizarMudancas = false,
  soNovasEComplementar = true,
} = {}) {
  const { catalog, custom, enrich, coords } = lerEstadoIgrejas()
  let alvo = (hitsList || []).filter(Boolean)
  if (soNovasEComplementar) {
    alvo = alvo.filter(h =>
      h.status === 'nova'
      || h.triagem === 'nova'
      || h.triagem === 'complementar'
    )
  }
  if (!alvo.length) {
    return {
      aplicado: false,
      novas: 0,
      enriquecidas: 0,
      custom,
      hits: classificarHitsGoogle(hitsList, catalog, enrich),
      total: catalog.length,
    }
  }
  const result = aplicarAtivacoesGoogle(alvo, {
    catalog,
    custom,
    enrich,
    coords,
    maxIdExternas,
    atualizarMudancas,
  })
  const cloud = await persistirResultadoGoogle(result)
  const vivo = lerEstadoIgrejas()
  return {
    aplicado: true,
    ...result,
    custom: vivo.custom,
    hits: classificarHitsGoogle(hitsList, vivo.catalog, vivo.enrich),
    novas: Math.max(0, vivo.custom.length - custom.length),
    total: vivo.catalog.length,
    nuvemOk: Boolean(cloud?.ok),
    nuvemErro: cloud?.ok ? '' : (cloud?.error || ''),
    totalSite: cloud?.server ?? null,
  }
}

/**
 * Aplica automaticamente em todas as igrejas existentes que ainda têm campos vazios.
 */
export function aplicarFaltantesAutomatico(hits, {
  catalog = [],
  custom = [],
  enrich = {},
  coords = {},
  maxIdExternas = 1999,
  incluirNovas = false,
} = {}) {
  const melhores = melhorHitPorIgreja(hits)
  const paraAplicar = melhores.filter(h => {
    const ig = catalog.find(i => i.id === h.matchId)
    return ig && hitPreencheFaltantes(h, ig, enrich)
  })

  if (incluirNovas) {
    const seen = new Set(paraAplicar.map(h => h.googlePlaceId))
    for (const h of (hits || [])) {
      if (h.status === 'nova' && h.googlePlaceId && !seen.has(h.googlePlaceId)) {
        seen.add(h.googlePlaceId)
        paraAplicar.push(h)
      }
    }
  }

  if (!paraAplicar.length) {
    return { aplicado: false, enriquecidas: 0, novas: 0, runtimeUpdates: [], detalhes: [] }
  }

  const result = aplicarAtivacoesGoogle(paraAplicar, {
    catalog,
    custom,
    enrich,
    coords,
    maxIdExternas,
  })

  const detalhes = paraAplicar.map(h => {
    if (h.status === 'nova') {
      return { id: null, nome: h.nome, campos: ['cadastro'], nova: true }
    }
    return {
      id: h.matchId,
      nome: h.matchNome || h.nome,
      campos: contarCamposPreenchidos(h, catalog.find(i => i.id === h.matchId), enrich),
    }
  })

  return {
    aplicado: true,
    ...result,
    detalhes,
  }
}

function contarCamposPreenchidos(hit, ig, enrich) {
  if (!ig || !hit) return []
  const out = []
  const pairs = [
    ['endereco', hit.endereco],
    ['cep', hit.cep],
    ['telefone', hit.telefone],
    ['website', hit.website],
    ['instagram', hit.instagram],
    ['facebook', hit.facebook],
    ['whatsapp', hit.whatsapp],
    ['culto', hit.cultoGoogle],
  ]
  for (const [field, val] of pairs) {
    if (!campoVazio(val) && campoVazio(enrich[ig.id]?.[field] ?? ig[field])) out.push(field)
  }
  if (igrejaPrecisaCoords(ig) && hit.lat) out.push('coordenadas')
  return out
}

export function matchGoogleHit(hit, catalog = [], enrich = {}) {
  if (!hit) return null

  for (const ig of catalog) {
    const gpid = ig.googlePlaceId || enrich[ig.id]?.googlePlaceId
    if (gpid && gpid === hit.googlePlaceId) {
      // Place ID antigo pode apontar para outro templo de nome parecido
      if (ruasConflitam(ig.endereco, hit.endereco)) continue
      return { igreja: ig, motivo: 'googlePlaceId' }
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
    if (d <= MATCH_KM_PROX && nomeOk) {
      if (d < bestDist) {
        bestDist = d
        best = { igreja: ig, motivo: 'proximidade' }
      }
    }
  }
  if (best) return best

  const mesmos = catalog.filter(ig => nomesParecidos(ig.nome, hit.nome))
  if (mesmos.length === 1) {
    const ig = mesmos[0]
    if (Number.isFinite(hit.lat) && Number.isFinite(ig.lat) && Number.isFinite(ig.lng)) {
      const d = haversineKm({ lat: ig.lat, lng: ig.lng }, { lat: hit.lat, lng: hit.lng })
      if (d > 0.35) return null
    }
    const setorHit = normStr(hit.setor)
    const setorIg = normStr(ig.setor)
    if (setorHit && setorIg && setorHit !== setorIg) return null
    // Se ambos têm endereço, as ruas devem ser compatíveis para aceitar match por nome
    // (evita que "Igreja Renacer" na João Pessoa seja matchada com resultado na Martin Luther)
    if (ig.endereco && hit.endereco) {
      const mesmaRua = ruaCompativel(ig.endereco, hit.endereco)
      if (!mesmaRua) return null
    }
    const n = normStr(hit.nome)
    const generico = n.length < 18 || /^(IGREJA|TEMPLO|CAPELA|PAROQUIA)\b/.test(n) && n.split(' ').length <= 3
    if (!generico) return { igreja: ig, motivo: 'nome' }
  }

  return null
}

export function classificarHitsGoogle(hits, catalog, enrich = {}) {
  return (hits || []).filter(eIgrejaCrista).map(hit => {
    const match = matchGoogleHit(hit, catalog, enrich)
    const nova = !match
    const ig = match?.igreja
    const depara = nova ? { triagem: 'nova', diffs: [] } : analisarDeparaGoogle(hit, ig, enrich)
    const preencher = depara.triagem === 'complementar' || depara.triagem === 'mudou'
    return {
      ...hit,
      status: nova ? 'nova' : 'existe',
      triagem: depara.triagem,
      diffs: depara.diffs,
      matchId: match?.igreja?.id ?? null,
      matchNome: match?.igreja?.nome ?? null,
      matchMotivo: match?.motivo ?? null,
      selecionada: nova || preencher,
    }
  }).sort((a, b) => {
    const ordem = { nova: 0, mudou: 1, complementar: 2, ok: 3 }
    const da = ordem[a.triagem] ?? 9
    const db = ordem[b.triagem] ?? 9
    if (da !== db) return da - db
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

export function aplicarAtivacoesGoogle(selecionados, {
  catalog = [],
  custom = [],
  enrich = {},
  coords = {},
  maxIdExternas = 1999,
  atualizarMudancas = false,
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

    let matchId = hit.matchId
    let jaExiste = hit.status === 'existe' && matchId != null
    if (!jaExiste) {
      const rematch = matchGoogleHit(hit, [...catalogById.values()], enrichNext)
      if (rematch?.igreja) {
        jaExiste = true
        matchId = rematch.igreja.id
      }
    }

    if (jaExiste && matchId != null) {
      const ig = catalogById.get(matchId)
      if (!ig) continue
      const ruaConflita = ruasConflitam(ig.endereco, hit.endereco)
      if (ruaConflita) {
        // Google apontou para outra rua (ex.: Renascer na Martin Luther em vez da João Pessoa).
        // Não aplica GPS/endereço e não cria um segundo pin no lugar errado.
        continue
      }
    }

    if (jaExiste && matchId != null) {
      const ig = catalogById.get(matchId)
      if (!ig) continue
      const overwrite = atualizarMudancas && hit.triagem === 'mudou'
      const catalogFixo = Number(ig.id) > 0 && Number(ig.id) <= 1999
      const patch = { googlePlaceId: hit.googlePlaceId, fonte: 'google' }
      const fields = catalogFixo
        ? ['telefone', 'website', 'cep', 'instagram', 'facebook', 'whatsapp']
        : ['endereco', 'telefone', 'setor', 'denominacao', 'website', 'cep', 'instagram', 'facebook', 'whatsapp']
      if (catalogFixo && overwrite) {
        fields.push('endereco', 'setor', 'cep')
      }
      for (const f of fields) {
        const cur = enrichNext[ig.id]?.[f] ?? ig[f]
        const empty = campoVazio(cur)
        if ((empty || (overwrite && (f === 'endereco' || f === 'setor' || f === 'cep'))) && hit[f]) {
          patch[f] = hit[f]
        }
      }
      if (campoVazio(enrichNext[ig.id]?.culto ?? ig.culto) && hit.cultoGoogle) {
        patch.culto = hit.cultoGoogle
      }
      // Só atualiza GPS se o match foi confiável (endereço, GPS+nome, proximidade)
      // Match por nome isolado NÃO atualiza coordenadas — evita trocar João Pessoa por Martin Luther
      // Também respeita coordenadas marcadas como gpsManual (corrigidas manualmente pelo usuário)
      const gpsManual = coords[ig.id]?.gpsManual || coords[String(ig.id)]?.gpsManual
      const matchMotivo = hit.matchMotivo || ''
      const matchConfiavel = matchMotivo === 'googlePlaceId'
        || matchMotivo.startsWith('endereço')
        || matchMotivo === 'nome+gps'
        || matchMotivo === 'gps-unico'
        || matchMotivo === 'proximidade'
      const needsCoords = !gpsManual && ((igrejaPrecisaCoords(ig) && matchConfiavel) || overwrite)
      if (needsCoords && Number.isFinite(hit.lat)) {
        coordsNext[ig.id] = { lat: hit.lat, lng: hit.lng }
        patch.lat = hit.lat
        patch.lng = hit.lng
      }

      const prev = enrichNext[ig.id] || {}
      if (hit.nome && !prev.nomeGoogle) patch.nomeGoogle = hit.nome
      enrichNext[ig.id] = { ...prev, ...patch }
      enriquecidas++
      runtimeUpdates.push({ id: ig.id, patch: { ...patch, ...(coordsNext[ig.id] || {}) } })

      const cIdx = customNext.findIndex(c => c.id === ig.id)
      if (cIdx >= 0) {
        let next = { ...customNext[cIdx] }
        if (overwrite) {
          if (hit.endereco) next.endereco = hit.endereco
          if (hit.setor) next.setor = hit.setor
          if (hit.cep) next.cep = hit.cep
          if (Number.isFinite(hit.lat)) { next.lat = hit.lat; next.lng = hit.lng }
        }
        const filled = fillMissing(next, { ...hit, ...patch }, [
          'endereco', 'telefone', 'setor', 'denominacao', 'website', 'cep',
          'instagram', 'facebook', 'whatsapp', 'culto', 'googlePlaceId', 'lat', 'lng',
        ])
        customNext[cIdx] = { ...filled.value, googlePlaceId: hit.googlePlaceId, fonte: 'google' }
      }
      continue
    }

    maxId += 1
    const nova = {
      id: gerarIdIgrejaCustom(),
      nome: hit.nome,
      setor: hit.setor || '—',
      denominacao: hit.denominacao || 'Outra',
      endereco: hit.endereco || hit.nome,
      culto: hit.cultoGoogle || '',
      foto: hit.foto || '/fotos/sem-foto.jpg',
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
      mapsUrl: hit.mapsUrl || '',
      rating: hit.rating ?? null,
      avaliacoes: hit.avaliacoes || 0,
      googlePlaceId: hit.googlePlaceId,
      fonte: 'google',
      triagemOk: true,
    }
    customNext.push(nova)
    catalogById.set(nova.id, nova)
    coordsNext[nova.id] = { lat: hit.lat, lng: hit.lng }
    enrichNext[nova.id] = {
      googlePlaceId: hit.googlePlaceId,
      fonte: 'google',
      nomeGoogle: hit.nome || '',
      endereco: hit.endereco || '',
      telefone: hit.telefone || '',
      website: hit.website || '',
      cep: hit.cep || '',
      instagram: hit.instagram || '',
      facebook: hit.facebook || '',
      whatsapp: hit.whatsapp || '',
      culto: hit.cultoGoogle || '',
      mapsUrl: hit.mapsUrl || '',
      rating: hit.rating ?? null,
      foto: hit.foto || '',
    }
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

async function enrichHitsWithDetails(service, hits, detailsCache, onProgress) {
  const out = []
  const detailsNext = { ...(detailsCache || {}) }
  let i = 0
  for (const hit of hits) {
    i += 1
    onProgress?.(`Detalhes Google ${i}/${hits.length}: ${hit.nome?.slice(0, 40) || '…'}`)
    if (detailsNext[hit.googlePlaceId]) {
      let merged = { ...hit, ...detailsNext[hit.googlePlaceId] }
      if (sitePrecisaBuscaRedes(merged.website, merged.instagram, merged.facebook)) {
        onProgress?.(`Redes no site ${i}/${hits.length}: ${hit.nome?.slice(0, 30) || '…'}`)
        const redes = await buscarRedesDoSite(merged.website)
        if (campoVazio(merged.instagram) && redes.instagram) merged.instagram = redes.instagram
        if (campoVazio(merged.facebook) && redes.facebook) merged.facebook = redes.facebook
        detailsNext[hit.googlePlaceId] = {
          ...detailsNext[hit.googlePlaceId],
          instagram: merged.instagram,
          facebook: merged.facebook,
        }
        await sleep(180)
      }
      out.push(merged)
      continue
    }
    try {
      const place = await getPlaceDetails(service, hit.googlePlaceId)
      const full = normalizarPlaceDetalhado(place)
      if (full) {
        if (sitePrecisaBuscaRedes(full.website, full.instagram, full.facebook)) {
          onProgress?.(`Redes sociais ${i}/${hits.length}: ${hit.nome?.slice(0, 30) || '…'}`)
          const redes = await buscarRedesDoSite(full.website)
          if (campoVazio(full.instagram) && redes.instagram) full.instagram = redes.instagram
          if (campoVazio(full.facebook) && redes.facebook) full.facebook = redes.facebook
          await sleep(180)
        }
        detailsNext[hit.googlePlaceId] = {
          telefone: full.telefone,
          website: full.website,
          cep: full.cep,
          setor: full.setor,
          endereco: full.endereco,
          cultoGoogle: full.cultoGoogle,
          instagram: full.instagram,
          facebook: full.facebook,
          whatsapp: full.whatsapp,
          mapsUrl: full.mapsUrl,
          rating: full.rating,
          avaliacoes: full.avaliacoes,
          foto: full.foto,
        }
        out.push({ ...hit, ...full })
      } else {
        out.push(hit)
      }
    } catch (e) {
      console.warn('Google details falhou', hit.googlePlaceId, e)
      out.push(hit)
    }
    await sleep(280)
  }
  return { hits: out, details: detailsNext }
}

/** Complementa Instagram/Facebook lendo o site quando o Google só trouxe URL principal. */
async function enrichRedesFaltantes(hits, onProgress) {
  const need = (hits || []).filter(h => sitePrecisaBuscaRedes(h.website, h.instagram, h.facebook))
  if (!need.length) return hits
  const out = []
  let i = 0
  for (const hit of hits) {
    if (!sitePrecisaBuscaRedes(hit.website, hit.instagram, hit.facebook)) {
      out.push(hit)
      continue
    }
    i += 1
    onProgress?.(`Buscando redes ${i}/${need.length}: ${hit.nome?.slice(0, 30) || '…'}`)
    const redes = await buscarRedesDoSite(hit.website)
    out.push({
      ...hit,
      instagram: hit.instagram || redes.instagram,
      facebook: hit.facebook || redes.facebook,
    })
    await sleep(180)
  }
  return out
}

/**
 * Busca aprofundada Google Places: cidade + bairros, de-para e auditoria do cadastro.
 */
export async function buscarIgrejasGoogle({
  catalog = [],
  enrich = {},
  cidade = 'Blumenau',
  bairros = [],
  forceRefresh = false,
  auditarCadastro = true,
  soBairro = false,
  onProgress,
} = {}) {
  const cidadeOk = String(cidade || 'Blumenau').trim() || 'Blumenau'
  const bairrosOk = Array.isArray(bairros) ? bairros.filter(Boolean) : []
  const modoBairro = soBairro && bairrosOk.length === 1
  const queries = modoBairro
    ? montarQueriesBairro(cidadeOk, bairrosOk[0])
    : montarQueriesGoogle(cidadeOk, bairrosOk)

  if (!forceRefresh && !modoBairro && cacheGoogleValido(cidadeOk, bairrosOk)) {
    const cache = readGooglePlacesCache()
    onProgress?.('Resultado do cache local — verificando redes sociais…')
    const comRedes = await enrichRedesFaltantes(cache.hits, onProgress)
    let classified = classificarHitsGoogle(comRedes, catalog, enrich)
    if (bairrosOk.length) classified = classified.filter(h => hitNoBairro(h, bairrosOk))
    return {
      hits: classified,
      fromCache: true,
      fetchedAt: cache.fetchedAt,
      apiCalls: 0,
      cidade: cidadeOk,
      bairros: bairrosOk,
    }
  }

  const service = getPlacesService()
  const rawMap = new Map()
  const bairroFoco = modoBairro ? bairrosOk[0] : ''

  function guardarHit(h, bairroTag = '') {
    if (!h) return
    if (bairroTag) {
      h.bairroBusca = bairroTag
      if (!h.setor || h.setor === '—') h.setor = bairroTag
    }
    const prev = rawMap.get(h.googlePlaceId)
    rawMap.set(h.googlePlaceId, prev ? { ...prev, ...h, setor: h.setor || prev.setor } : h)
  }

  for (let qi = 0; qi < queries.length; qi += 1) {
    const q = queries[qi]
    onProgress?.(`Busca texto ${qi + 1}/${queries.length}: ${q}`)
    try {
      const results = await textSearchPaged(service, { query: q, region: 'br' })
      for (const p of results) {
        guardarHit(normalizarPlaceBasico(p, modoBairro ? `text-bairro:${bairroFoco}` : `text:${qi}`), bairroFoco)
      }
    } catch (e) {
      console.warn('textSearch falhou', q, e)
    }
    await sleep(550)
  }

  if (!modoBairro) {
    onProgress?.(`Busca por área (${cidadeOk})`)
    try {
      const center = (normStr(cidadeOk) === 'BLUMENAU')
        ? BLUMENAU_CENTER
        : (await geocodeTextoGoogle(`${cidadeOk}, Santa Catarina, Brasil`)) || BLUMENAU_CENTER
      const nearby = await nearbySearchPaged(service, {
        location: center,
        radius: NEARBY_RADIUS_M,
        type: 'church',
      })
      for (const p of nearby) {
        guardarHit(normalizarPlaceBasico(p, 'nearby'))
      }
    } catch (e) {
      console.warn('nearbySearch falhou', e)
    }
  }

  const bairrosNearby = modoBairro ? bairrosOk : bairrosOk.slice(0, 10)
  for (let bi = 0; bi < bairrosNearby.length; bi += 1) {
    const bairro = bairrosNearby[bi]
    onProgress?.(`Área do bairro ${bi + 1}/${bairrosNearby.length}: ${bairro}`)
    try {
      const loc = await geocodeTextoGoogle(`${bairro}, ${cidadeOk}, Santa Catarina, Brasil`)
      if (!loc) continue
      const nearbyB = await nearbySearchPaged(service, {
        location: loc,
        radius: NEARBY_BAIRRO_M,
        type: 'church',
      })
      for (const p of nearbyB) {
        guardarHit(normalizarPlaceBasico(p, `nearby-bairro:${bairro}`), bairro)
      }
    } catch (e) {
      console.warn('nearby bairro falhou', bairro, e)
    }
    await sleep(400)
  }

  let rawHits = [...rawMap.values()]
  if (bairrosOk.length) {
    rawHits = rawHits.filter(h => h.bairroBusca || hitNoBairro(h, bairrosOk))
  }

  if (auditarCadastro && !modoBairro) {
    const prelim = classificarHitsGoogle(rawHits, catalog, enrich)
    const matched = new Set(prelim.filter(h => h.matchId != null).map(h => h.matchId))
    const alvos = (catalog || []).filter(ig => {
      if (matched.has(ig.id)) return false
      if (bairrosOk.length && !hitNoBairro({ setor: ig.setor, endereco: ig.endereco, nome: ig.nome }, bairrosOk)) {
        return false
      }
      return Boolean(String(ig.nome || '').trim())
    }).sort((a, b) => String(b.endereco || '').length - String(a.endereco || '').length).slice(0, 80)

    for (let i = 0; i < alvos.length; i += 1) {
      const ig = alvos[i]
      onProgress?.(`Conferindo cadastro ${i + 1}/${alvos.length}: ${String(ig.nome).slice(0, 36)}`)
      const q = [ig.nome, ig.endereco, cidadeOk, 'igreja'].filter(Boolean).join(' ')
      try {
        const found = await findPlaceFromQuery(service, q)
        const p = found[0]
        if (p?.place_id && !rawMap.has(p.place_id)) {
          guardarHit(normalizarPlaceBasico(p, 'audit-cadastro'))
        }
      } catch (e) {
        console.warn('audit findPlace falhou', ig.nome, e)
      }
      await sleep(280)
    }
    rawHits = [...rawMap.values()]
    if (bairrosOk.length) {
      rawHits = rawHits.filter(h => h.bairroBusca || hitNoBairro(h, bairrosOk))
    }
  }

  onProgress?.(`${rawHits.length} pontos encontrados — buscando telefone e site…`)

  const cachePrev = readGooglePlacesCache()
  const { hits: enriched, details } = await enrichHitsWithDetails(
    service,
    rawHits,
    cachePrev.placeDetails,
    onProgress,
  )

  onProgress?.('Verificando redes nos sites…')
  const enrichedRedes = await enrichRedesFaltantes(enriched, onProgress)

  const classified = classificarHitsGoogle(enrichedRedes, catalog, enrich)

  if (!modoBairro) {
    writeGooglePlacesCache({
      version: 2,
      cidade: cidadeOk,
      bairros: bairrosOk,
      fetchedAt: Date.now(),
      hits: enrichedRedes,
      placeDetails: details,
      queries,
    })
  }

  return {
    hits: classified,
    fromCache: false,
    fetchedAt: Date.now(),
    apiCalls: queries.length + 1 + enriched.length + (auditarCadastro && !modoBairro ? 1 : 0),
    cidade: cidadeOk,
    bairros: bairrosOk,
  }
}

export async function buscarIgrejasGoogleBlumenau(opts = {}) {
  return buscarIgrejasGoogle({ ...opts, cidade: opts.cidade || 'Blumenau' })
}

/** Carrega cache e reclassifica com catálogo atual (sem API). */
export function hitsGoogleDoCache(catalog = [], enrich = {}, cidade = 'Blumenau', bairros = []) {
  if (!cacheGoogleValido(cidade, bairros)) return null
  const cache = readGooglePlacesCache()
  let hits = classificarHitsGoogle(cache.hits, catalog, enrich)
  if (bairros?.length) hits = hits.filter(h => hitNoBairro(h, bairros))
  return {
    hits,
    fromCache: true,
    fetchedAt: cache.fetchedAt,
  }
}

export { readIgrejasEnrich, writeIgrejasEnrich } from './igrejasOverpass'
