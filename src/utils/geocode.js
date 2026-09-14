export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

/** Geocodifica endereço via Nominatim (OpenStreetMap). */
export async function geocodeEndereco(endereco) {
  if (!endereco?.trim()) return null
  const headers = { 'Accept-Language': 'pt-BR', 'User-Agent': 'CampanhaApp/1.0' }
  async function tryQuery(q) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=br`,
        { headers },
      )
      if (!res.ok) return null
      const data = await res.json()
      if (!Array.isArray(data) || data.length === 0) return null
      const lat = parseFloat(data[0].lat)
      const lng = parseFloat(data[0].lon)
      if (isNaN(lat) || isNaN(lng)) return null
      return { lat, lng }
    } catch { /* ignore */ }
    return null
  }
  const r1 = await tryQuery(endereco)
  if (r1) return r1
  await sleep(700)
  return await tryQuery(endereco.replace(/,\s*\d+/, '').trim())
}
