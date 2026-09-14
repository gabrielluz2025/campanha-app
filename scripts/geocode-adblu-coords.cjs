/**
 * Geocodifica as 88 igrejas ADBLU via Nominatim e gera src/data/igrejasCoordsAdblu.json
 * Uso: node scripts/geocode-adblu-coords.cjs
 */
const fs = require('fs')
const path = require('path')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const BOUNDS = { latMin: -27.15, latMax: -26.50, lngMin: -49.40, lngMax: -48.75 }

function dentro({ lat, lng }) {
  return lat > BOUNDS.latMin && lat < BOUNDS.latMax
    && lng > BOUNDS.lngMin && lng < BOUNDS.lngMax
}

async function geocode(q) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=br`
  const res = await fetch(url, { headers: { 'User-Agent': 'campanha-app-geocode/1.0 (campanha.space)' } })
  if (!res.ok) return null
  const j = await res.json()
  if (!j?.[0]) return null
  const lat = Number(j[0].lat)
  const lng = Number(j[0].lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !dentro({ lat, lng })) return null
  return { lat, lng, display: j[0].display_name }
}

async function main() {
  const listaPath = path.join(__dirname, '../src/data/igrejasListaAdblu.js')
  const text = fs.readFileSync(listaPath, 'utf8')
  const enderecos = [...text.matchAll(/endereco:\s*'([^']+)'/g)].map((m) => m[1])
  const congregacoes = [...text.matchAll(/congregacao:\s*'([^']+)'/g)].map((m) => m[1])

  const basePath = path.join(__dirname, '../src/data/igrejasBase.js')
  const baseText = fs.readFileSync(basePath, 'utf8')
  const ids = [...baseText.matchAll(/\{\s*id:(\d+),/g)].map((m) => Number(m[1])).slice(0, 88)

  const out = {}
  let ok = 0

  for (let i = 0; i < enderecos.length; i++) {
    const id = ids[i]
    const endereco = enderecos[i]
    const cong = congregacoes[i]
    process.stdout.write(`${i + 1}/${enderecos.length} id=${id} ... `)

    let result = await geocode(endereco)
    if (!result) {
      result = await geocode(`Assembleia de Deus ${cong}, ${endereco}`)
    }
    await sleep(1100)

    if (result) {
      out[id] = { lat: result.lat, lng: result.lng, endereco }
      ok++
      console.log(`${result.lat}, ${result.lng}`)
    } else {
      console.log('FALHOU')
    }
  }

  const dest = path.join(__dirname, '../src/data/igrejasCoordsAdblu.json')
  fs.writeFileSync(dest, JSON.stringify(out, null, 2))
  console.log(`\nSalvo ${ok}/${enderecos.length} em ${dest}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
