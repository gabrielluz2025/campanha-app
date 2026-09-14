/** De-para de igrejas: nome parecido, GPS e mesmo endereço. */
import { haversineKm } from './rotaUtils'
import { bairroCanon } from './bairroMapa'

function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

export function extrairNumeroEndereco(end) {
  const s = String(end || '')
  if (/\bS\s*\/\s*N\b/i.test(s)) return 'SN'
  const head = s.split('-')[0]
  const afterComma = head.match(/,\s*n[ºo°.]?\s*(\d{1,6})\b/i) || head.match(/,\s*(\d{1,6})\b/)
  if (afterComma) return afterComma[1]
  const nums = [...head.matchAll(/\b(\d{1,6})\b/g)].map(m => m[1])
  if (!nums.length) return ''
  if (nums.length >= 2 && nums[0].length <= 2) return nums[nums.length - 1]
  return nums[nums.length - 1]
}

export function extrairLogradouro(end) {
  let s = String(end || '').split(' - ')[0].trim()
  s = s.replace(/\bS\s*\/\s*N\b/i, '')
  s = s.split(',')[0].trim()
  s = s.replace(/,?\s*\d{1,6}\s*$/, '').trim()
  s = s.replace(/^(RUA|R\.|AVENIDA|AV\.|TRAVESSA|TV\.|ALAMEDA|AL\.)\s+/i, '').trim()
  return s
}

export function chaveEnderecoIgreja(end) {
  const num = extrairNumeroEndereco(end)
  if (!num || num === 'SN') return ''
  const rua = String(extrairLogradouro(end) || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/(.)\1+/g, '$1')
    .trim()
  if (rua.length < 4) return ''
  return `${rua}|${num}`
}

function tokensRua(end) {
  return norm(extrairLogradouro(end)).split(/\s+/).filter(t => t.length > 2 && !/^\d+$/.test(t))
}

function canonToken(t) {
  return String(t || '').replace(/(.)\1+/g, '$1')
}

function lev1ou2(a, b) {
  if (a === b) return 0
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > 2) return 99
  const row = Array.from({ length: lb + 1 }, (_, i) => i)
  for (let i = 1; i <= la; i++) {
    let prev = i - 1
    row[0] = i
    for (let j = 1; j <= lb; j++) {
      const tmp = row[j]
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost)
      prev = tmp
    }
  }
  return row[lb]
}

function generoAo(a, b) {
  if (a.length < 4 || a.length !== b.length) return false
  return a.slice(0, -1) === b.slice(0, -1) && /[AO]$/.test(a) && /[AO]$/.test(b) && a !== b
}

export function tokensRuaIguais(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  if (canonToken(a) === canonToken(b) && a.length >= 4) return true
  if (generoAo(a, b)) return false
  const d = lev1ou2(a, b)
  if (Math.min(a.length, b.length) >= 6 && d <= 2) return true
  if (Math.min(a.length, b.length) >= 5 && d <= 1) return true
  return false
}

export function ruasConflitam(endA, endB) {
  const a = String(endA || '').trim()
  const b = String(endB || '').trim()
  if (!a || !b) return false
  return !ruaCompativel(a, b)
}

export function ruaCompativel(a, b) {
  const ta = tokensRua(a)
  const tb = tokensRua(b)
  if (!ta.length || !tb.length) return false
  const hit = ta.filter(t => tb.some(u => tokensRuaIguais(t, u))).length
  if (ta.length === 1) return hit === 1
  return hit >= Math.min(2, ta.length) && hit / ta.length >= 0.5
}

const STOP_NOME = new Set([
  'IGREJA', 'TEMPLO', 'CAPELA', 'PAROQUIA', 'COMUNIDADE', 'CONGREGACAO',
  'MINISTERIO', 'DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'A', 'O', 'AS', 'OS', 'EM',
  'SANTO', 'SANTA', 'SAO', 'NOSSA', 'SENHORA', 'JESUS', 'CRISTO',
  'BLUMENAU', 'BNU', 'ADBLU', 'ASSEMBLEIA', 'ASSEMBLEA', 'EVANGELICA', 'EVANGELICO',
])

const DENOM_FRACA = new Set([
  'PENTECOSTAL', 'BATISTA', 'QUADRANGULAR', 'CATOLICA', 'LUTERANA', 'ADVENTISTA',
  'METODISTA', 'PRESBITERIANA', 'UNIVERSAL', 'CONGREGACIONAL', 'APOSTOLICA',
  'MISSIONARIA', 'MISSAO', 'CRISTA', 'CRISTAO',
])

function tokensNome(nome) {
  return norm(nome).split(/\s+/).filter(t => t.length > 2 && !STOP_NOME.has(t))
}

export function nomesParecidosIgreja(a, b) {
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.length >= 12 && nb.includes(na)) return true
  if (nb.length >= 12 && na.includes(nb)) return true
  const ta = tokensNome(a)
  const tb = tokensNome(b)
  if (!ta.length || !tb.length) return false
  const hits = ta.filter(t => tb.some(u => tokensRuaIguais(t, u) || t === u))
  const hitForte = hits.filter(t => !DENOM_FRACA.has(t))
  if (!hitForte.length) return false
  if (ta.length === 1) return hitForte.length === 1 && ta[0].length >= 5
  return hitForte.length >= 2 && hitForte.length / Math.min(ta.length, tb.length) >= 0.55
}

function numeroProximo(a, b) {
  const na = Number(a)
  const nb = Number(b)
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return a === b
  if (na === nb) return true
  return Math.abs(na - nb) <= 12
}

/** Mesma rua + número (nomes podem ser diferentes). */
export function matchPorEndereco(hit, catalog = []) {
  const endHit = hit?.endereco
  const num = extrairNumeroEndereco(endHit)
  if (!num || num === 'SN' || !endHit) return null

  const candidatos = []
  for (const ig of catalog) {
    const numIg = extrairNumeroEndereco(ig.endereco)
    if (!numIg || numIg === 'SN' || !ruaCompativel(endHit, ig.endereco)) continue
    if (num === numIg) {
      candidatos.push(ig)
      continue
    }
    if (numeroProximo(num, numIg) && nomesParecidosIgreja(ig.nome, hit.nome)) {
      candidatos.push(ig)
    }
  }
  if (candidatos.length === 1) {
    return { igreja: candidatos[0], motivo: 'endereço' }
  }
  if (candidatos.length > 1) {
    const porNome = candidatos.filter(ig => nomesParecidosIgreja(ig.nome, hit.nome))
    if (porNome.length === 1) return { igreja: porNome[0], motivo: 'endereço+nome' }
    if (Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) {
      let best = null
      let bestD = Infinity
      for (const ig of candidatos) {
        if (!Number.isFinite(ig.lat) || !Number.isFinite(ig.lng)) continue
        const d = haversineKm({ lat: ig.lat, lng: ig.lng }, { lat: hit.lat, lng: hit.lng })
        if (d < bestD) {
          bestD = d
          best = ig
        }
      }
      if (best && bestD <= 0.18) return { igreja: best, motivo: 'endereço+gps' }
    }
    return { igreja: candidatos[0], motivo: 'endereço' }
  }
  return null
}

/** Única igreja do catálogo a menos de ~30 m (mesmo prédio, nome diferente). */
export function matchGpsUnico(hit, catalog = [], maxKm = 0.03) {
  if (!Number.isFinite(hit?.lat) || !Number.isFinite(hit?.lng)) return null
  const perto = []
  for (const ig of catalog) {
    if (!Number.isFinite(ig.lat) || !Number.isFinite(ig.lng)) continue
    const d = haversineKm({ lat: ig.lat, lng: ig.lng }, { lat: hit.lat, lng: hit.lng })
    if (d <= maxKm) perto.push(ig)
  }
  if (perto.length === 1) return { igreja: perto[0], motivo: 'gps-unico' }
  return null
}

export function hitNoBairro(hit, bairros = []) {
  if (!bairros?.length) return true
  const blob = norm([hit.setor, hit.endereco, hit.nome].join(' '))
  return bairros.some(b => {
    const nb = norm(b)
    return nb && blob.includes(nb)
  })
}

function isInRing(lng, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (((yi > lat) !== (yj > lat)) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function pointInGeoFeature(lng, lat, feature) {
  const g = feature?.geometry
  if (!g) return false
  if (g.type === 'Polygon') return isInRing(lng, lat, g.coordinates[0])
  if (g.type === 'MultiPolygon') return g.coordinates.some(p => isInRing(lng, lat, p[0]))
  return false
}

function nomesBairroEquivalentes(a, b) {
  if (!a || !b) return false
  const na = norm(a)
  const nb = norm(b)
  if (na === nb) return true
  if (na.length >= 3 && nb.length >= 3 && (na.includes(nb) || nb.includes(na))) return true
  const ca = norm(bairroCanon(a) || a)
  const cb = norm(bairroCanon(b) || b)
  if (ca && cb && ca === cb) return true
  if (ca.length >= 3 && cb.length >= 3 && (ca.includes(cb) || cb.includes(ca))) return true
  return false
}

/** Bairro (polígono) onde cai lat/lng, ou null. */
export function bairroGeoDaCoordenada(lat, lng, geoData) {
  if (!geoData?.features?.length || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const sorted = [...geoData.features].sort(
    (a, b) => (b.properties?.name?.length || 0) - (a.properties?.name?.length || 0),
  )
  for (const feat of sorted) {
    if (pointInGeoFeature(lng, lat, feat)) return feat.properties?.name || null
  }
  return null
}

/**
 * Igreja pertence ao bairro/setor do filtro?
 *
 * Prioridade:
 *  1. GPS + polígono GeoJSON  → mais preciso (evita falsos positivos por nome de rua)
 *  2. Campo `setor` cadastrado → confiável quando preenchido
 *  3. Nome do bairro na parte "-Bairro," do endereço padrão BR (ex: "... - Garcia, Blumenau")
 *
 * NÃO faz busca de texto livre no endereço completo (Rua Garcia ≠ bairro Garcia).
 */
export function igrejaCorrespondeBairroFiltro(ig, filtroSetor, geoData = null) {
  if (!filtroSetor || filtroSetor === 'Todos') return true

  const lat = Number(ig?.lat)
  const lng = Number(ig?.lng)
  const temGps = Number.isFinite(lat) && Number.isFinite(lng)

  // 1 — GPS + polígono GeoJSON (fonte de verdade geográfica)
  if (geoData && temGps) {
    const bairroGeo = bairroGeoDaCoordenada(lat, lng, geoData)
    if (bairroGeo) {
      // Temos resultado do polígono → confiar somente nele
      return nomesBairroEquivalentes(bairroGeo, filtroSetor)
    }
    // GeoJSON carregado mas ponto fora de todos os polígonos → continuar com outros critérios
  }

  // 2 — Campo setor cadastrado
  const setorIg = String(ig?.setor || '').trim()
  if (setorIg) {
    if (nomesBairroEquivalentes(setorIg, filtroSetor)) return true
    const filtroCanon = bairroCanon(filtroSetor)
    if (filtroCanon && nomesBairroEquivalentes(setorIg, filtroCanon)) return true
  }

  // 3 — Bairro no endereço padrão BR: "Rua X, 123 - Bairro, Cidade - UF"
  //     Só lê a parte após o " - ", antes da vírgula → evita "Rua Garcia" virar "Garcia"
  const endereco = String(ig?.endereco || '').trim()
  if (endereco) {
    const partes = endereco.split(' - ')
    if (partes.length >= 2) {
      const bairroNoEnd = partes[1].split(',')[0].trim()
      if (bairroNoEnd.length >= 3) {
        if (nomesBairroEquivalentes(bairroNoEnd, filtroSetor)) return true
        const filtroCanon = bairroCanon(filtroSetor)
        if (filtroCanon && nomesBairroEquivalentes(bairroNoEnd, filtroCanon)) return true
      }
    }
  }

  return false
}
