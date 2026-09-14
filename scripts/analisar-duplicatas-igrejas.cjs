const fs = require('fs')
const path = require('path')

const DUMP = path.resolve(__dirname, '../tmp-igrejas-dump.json')
const JSX = path.resolve(__dirname, '../src/data/igrejasBase.js')
const OUT = path.resolve(__dirname, '../tmp-duplicatas-igrejas.json')

function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

function nomeChave(nome) {
  const tokens = norm(nome).split(/\s+/).filter(t => t.length > 2 && !STOP.has(t))
  return tokens.join(' ')
}

function extrairNumero(end) {
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

function extrairLogradouro(end) {
  let s = String(end || '').split(' - ')[0].trim()
  s = s.replace(/\bS\s*\/\s*N\b/i, '')
  s = s.split(',')[0].trim()
  s = s.replace(/,?\s*\d{1,6}\s*$/, '').trim()
  s = s.replace(/^(RUA|R\.|AVENIDA|AV\.|TRAVESSA|TV\.|ALAMEDA|AL\.)\s+/i, '').trim()
  return s
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

function tokensIguais(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  if (canonToken(a) === canonToken(b) && a.length >= 4) return true
  if (a.length >= 4 && a.length === b.length && a.slice(0, -1) === b.slice(0, -1) && /[AO]$/.test(a) && /[AO]$/.test(b)) return false
  const d = lev1ou2(a, b)
  if (Math.min(a.length, b.length) >= 6 && d <= 2) return true
  if (Math.min(a.length, b.length) >= 5 && d <= 1) return true
  return false
}

function ruaCompativel(a, b) {
  const ta = norm(extrairLogradouro(a)).split(/\s+/).filter(t => t.length > 2 && !/^\d+$/.test(t))
  const tb = norm(extrairLogradouro(b)).split(/\s+/).filter(t => t.length > 2 && !/^\d+$/.test(t))
  if (!ta.length || !tb.length) return false
  const hit = ta.filter(t => tb.some(u => tokensIguais(t, u))).length
  if (ta.length === 1) return hit === 1
  return hit >= Math.min(2, ta.length) && hit / ta.length >= 0.5
}

const STOP = new Set([
  'IGREJA', 'TEMPLO', 'CAPELA', 'PAROQUIA', 'COMUNIDADE', 'CONGREGACAO',
  'MINISTERIO', 'DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'A', 'O', 'AS', 'OS', 'EM',
  'SANTO', 'SANTA', 'SAO', 'NOSSA', 'SENHORA', 'JESUS', 'CRISTO', 'BLUMENAU',
  'BNU', 'SC', 'EVANGELICA', 'EVANGELICO', 'ADBLU', 'ASSEMBLEIA', 'ASSEMBLEA',
])

function nomesParecidos(a, b) {
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.length >= 12 && nb.includes(na)) return true
  if (nb.length >= 12 && na.includes(nb)) return true
  const ta = na.split(/\s+/).filter(t => t.length > 2 && !STOP.has(t))
  const tb = nb.split(/\s+/).filter(t => t.length > 2 && !STOP.has(t))
  if (!ta.length || !tb.length) return false
  const DENOM = new Set([
    'PENTECOSTAL', 'BATISTA', 'QUADRANGULAR', 'CATOLICA', 'LUTERANA', 'ADVENTISTA',
    'METODISTA', 'PRESBITERIANA', 'UNIVERSAL', 'CONGREGACIONAL', 'APOSTOLICA',
    'MISSIONARIA', 'MISSAO', 'CRISTA', 'CRISTAO',
  ])
  const hits = ta.filter(t => tb.some(u => tokensIguais(t, u) || t === u))
  const hitForte = hits.filter(t => !DENOM.has(t))
  if (!hitForte.length) return false
  if (ta.length === 1) return hitForte.length === 1 && ta[0].length >= 5
  return hitForte.length >= 2 && hitForte.length / Math.min(ta.length, tb.length) >= 0.55
}

function haversineKm(a, b) {
  if (!Number.isFinite(a?.lat) || !Number.isFinite(b?.lat)) return Infinity
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function parseCatalog(src) {
  const out = []
  const re = /\{\s*id:(\d+)\s*,\s*lat:(-?[\d.]+)\s*,\s*lng:(-?[\d.]+)\s*,\s*nome:'((?:\\'|[^'])*)'/g
  let m
  while ((m = re.exec(src))) {
    const id = Number(m[1])
    const lat = Number(m[2])
    const lng = Number(m[3])
    const nome = m[1] && m[4].replace(/\\'/g, "'")
    const chunkEnd = src.indexOf("\n  { id:", m.index + 10)
    const chunk = src.slice(m.index, chunkEnd > m.index ? chunkEnd : m.index + 450)
    const end = (chunk.match(/endereco:'((?:\\'|[^'])*)'/) || [])[1] || ''
    const setor = (chunk.match(/setor:'((?:\\'|[^'])*)'/) || [])[1] || ''
    const tel = (chunk.match(/telefone:'((?:\\'|[^'])*)'/) || [])[1] || ''
    const pastor = (chunk.match(/pastor1:'((?:\\'|[^'])*)'/) || [])[1] || ''
    const culto = (chunk.match(/culto:'((?:\\'|[^'])*)'/) || [])[1] || ''
    out.push({
      id, lat, lng, nome, endereco: end.replace(/\\'/g, "'"), setor, telefone: tel, pastor1: pastor, culto,
      origem: id <= 88 ? 'base' : 'externas',
    })
  }
  return out
}

function scoreFicha(ig) {
  const filled = [
    ig.endereco, ig.telefone, ig.whatsapp, ig.pastor1, ig.pastor2, ig.culto,
    ig.website, ig.instagram, ig.facebook, ig.setor, ig.cep,
  ].filter(v => String(v || '').trim() && String(v).trim() !== '—').length
  let s = filled * 10
  const id = Number(ig.id) || 0
  if (id <= 88) s += 1000
  else if (id <= 1999) s += 500
  if (ig.googlePlaceId) s += 8
  if (ig.triagemOk) s += 3
  s -= id * 0.0001
  return s
}

function pickWinner(cluster) {
  return [...cluster].sort((a, b) => scoreFicha(b) - scoreFicha(a))[0]
}

function parseDump(raw) {
  const custom = Array.isArray(raw.igrejas_custom) ? raw.igrejas_custom : []
  const enrich = raw.igrejas_enrich && typeof raw.igrejas_enrich === 'object' ? raw.igrejas_enrich : {}
  const coords = raw.geo_coords_igrejas && typeof raw.geo_coords_igrejas === 'object' ? raw.geo_coords_igrejas : {}
  return custom.map(ig => {
    const en = enrich[ig.id] || enrich[String(ig.id)] || {}
    const co = coords[ig.id] || coords[String(ig.id)] || {}
    return {
      ...ig,
      ...en,
      lat: Number(co.lat ?? en.lat ?? ig.lat),
      lng: Number(co.lng ?? en.lng ?? ig.lng),
      googlePlaceId: ig.googlePlaceId || en.googlePlaceId || '',
      origem: 'custom',
    }
  })
}

function pairKey(a, b) {
  return a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`
}

function motivoMatch(a, b) {
  const reasons = []
  const gpa = String(a.googlePlaceId || '').trim()
  const gpb = String(b.googlePlaceId || '').trim()
  if (gpa && gpb && gpa === gpb) reasons.push('googlePlaceId')
  const na = norm(a.nome)
  const nb = norm(b.nome)
  if (na && na === nb) reasons.push('nome-exato')
  else if (nomesParecidos(a.nome, b.nome)) reasons.push('nome-parecido')
  const numA = extrairNumero(a.endereco)
  const numB = extrairNumero(b.endereco)
  const mesmoEnd = numA && numB && numA !== 'SN' && numA === numB && ruaCompativel(a.endereco, b.endereco)
  if (mesmoEnd) reasons.push('endereco')
  const numClose = numA && numB && numA !== 'SN' && numB !== 'SN' && numA !== numB
    && Number.isFinite(Number(numA)) && Number.isFinite(Number(numB))
    && Math.abs(Number(numA) - Number(numB)) <= 12
    && ruaCompativel(a.endereco, b.endereco)
  if (numClose) reasons.push('endereco-proximo')
  const d = haversineKm(a, b)
  if (d <= 0.08 && (reasons.includes('nome-parecido') || reasons.includes('nome-exato'))) {
    reasons.push(`gps-${Math.round(d * 1000)}m`)
  }
  return { reasons, d }
}

function isDup(a, b) {
  if (a.id === b.id) return false
  const { reasons, d } = motivoMatch(a, b)
  if (reasons.includes('googlePlaceId')) return { ok: true, reasons, d }
  if (reasons.includes('endereco')) return { ok: true, reasons, d }
  const nomeOk = reasons.includes('nome-exato') || reasons.includes('nome-parecido')
  if (nomeOk && reasons.includes('endereco-proximo')) return { ok: true, reasons, d }
  const ruasDistintas = a.endereco && b.endereco && !ruaCompativel(a.endereco, b.endereco)
  if (nomeOk && d <= 0.08 && !ruasDistintas) return { ok: true, reasons, d }
  if (reasons.includes('nome-exato') && d <= 0.15 && !ruasDistintas) return { ok: true, reasons, d }
  return { ok: false, reasons, d }
}

function unionFind(items, pairs) {
  const parent = new Map(items.map(i => [i.id, i.id]))
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)))
      x = parent.get(x)
    }
    return x
  }
  const uni = (a, b) => {
    const pa = find(a)
    const pb = find(b)
    if (pa !== pb) parent.set(pa, pb)
  }
  for (const p of pairs) uni(p.a, p.b)
  const groups = new Map()
  for (const it of items) {
    const r = find(it.id)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r).push(it)
  }
  return [...groups.values()].filter(g => g.length > 1)
}

const src = fs.readFileSync(JSX, 'utf8')
const catalog = parseCatalog(src)
const dump = JSON.parse(fs.readFileSync(DUMP, 'utf8'))
const custom = parseDump(dump)
const all = [...catalog, ...custom]
const byId = new Map()
for (const ig of all) {
  if (!byId.has(ig.id)) byId.set(ig.id, ig)
}
const unique = [...byId.values()]

const pairs = []
const seen = new Set()
for (let i = 0; i < unique.length; i++) {
  for (let j = i + 1; j < unique.length; j++) {
    const a = unique[i]
    const b = unique[j]
    const hit = isDup(a, b)
    if (!hit.ok) continue
    const k = pairKey(a, b)
    if (seen.has(k)) continue
    seen.add(k)
    pairs.push({ a: a.id, b: b.id, reasons: hit.reasons, d: hit.d === Infinity ? null : Math.round(hit.d * 1000) })
  }
}

const clusters = unionFind(unique, pairs).map(g => {
  const win = pickWinner(g)
  const losers = g.filter(x => x.id !== win.id)
  return {
    keep: {
      id: win.id,
      origem: win.origem,
      nome: win.nome,
      endereco: win.endereco,
      setor: win.setor,
      telefone: win.telefone || '',
      pastor1: win.pastor1 || '',
    },
    remove: losers.map(x => ({
      id: x.id,
      origem: x.origem,
      nome: x.nome,
      endereco: x.endereco,
      setor: x.setor,
      telefone: x.telefone || '',
      pastor1: x.pastor1 || '',
    })),
    members: g.map(x => `${x.id} [${x.origem}] ${x.nome}`),
  }
})

const customDupIds = new Set()
const catalogRemove = []
for (const c of clusters) {
  for (const r of c.remove) {
    if (r.origem === 'custom') customDupIds.add(r.id)
    else catalogRemove.push({ keepId: c.keep.id, ...r })
  }
}

const byPlace = new Map()
for (const ig of unique) {
  const g = String(ig.googlePlaceId || '').trim()
  if (!g) continue
  if (!byPlace.has(g)) byPlace.set(g, [])
  byPlace.get(g).push(ig)
}
const placeDups = [...byPlace.values()].filter(g => g.length > 1)

const exactName = new Map()
for (const ig of unique) {
  const k = nomeChave(ig.nome) || norm(ig.nome)
  if (!k || k.length < 5) continue
  if (!exactName.has(k)) exactName.set(k, [])
  exactName.get(k).push(ig)
}

const report = {
  catalog: catalog.length,
  custom: custom.length,
  uniqueIds: unique.length,
  pairs: pairs.length,
  clusters: clusters.length,
  customToDelete: customDupIds.size,
  catalogHardcodedDups: catalogRemove,
  clusters,
  googlePlaceIdDups: placeDups.map(g => g.map(x => `${x.id} ${x.nome}`)),
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 2))
const applyPath = path.resolve(__dirname, '../tmp-dedupe-apply.json')
const remap = {}
for (const c of clusters) {
  for (const r of c.remove) {
    if (r.origem === 'custom') remap[r.id] = c.keep.id
  }
}
fs.writeFileSync(applyPath, JSON.stringify({
  deleteCustomIds: [...customDupIds].sort((a, b) => a - b),
  remap,
}, null, 2))
console.log(JSON.stringify({
  catalog: catalog.length,
  custom: custom.length,
  uniqueIds: unique.length,
  pairs: pairs.length,
  clusters: clusters.length,
  customToDelete: customDupIds.size,
  hardcodedToReview: catalogRemove.length,
}, null, 2))
console.log('\n=== CLUSTERS ===')
for (const c of clusters) {
  console.log(`KEEP ${c.keep.id} [${c.keep.origem}] ${c.keep.nome} | ${c.keep.endereco}`)
  for (const r of c.remove) {
    console.log(`  DEL ${r.id} [${r.origem}] ${r.nome} | ${r.endereco}`)
  }
}
if (catalogRemove.length) {
  console.log('\n=== HARDCODED (não apaga na nuvem) ===')
  for (const r of catalogRemove) {
    console.log(`  ${r.id} ${r.nome} -> keep ${r.keepId}`)
  }
}
