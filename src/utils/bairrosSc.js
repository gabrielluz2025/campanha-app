import { BAIRROS_BLUMENAU, normStr } from './constants'

let cache = null
let loading = null

/** Carrega mapa cidade → bairros (SC) de /bairros_sc.json */
export async function loadBairrosSc() {
  if (cache) return cache
  if (loading) return loading
  loading = (async () => {
    try {
      const r = await fetch('/bairros_sc.json')
      const data = await r.json()
      if (data && typeof data === 'object') {
        // Garante Blumenau com lista canônica do sistema
        if (!data.Blumenau?.length) data.Blumenau = [...BAIRROS_BLUMENAU]
        cache = data
      } else {
        cache = { Blumenau: [...BAIRROS_BLUMENAU] }
      }
    } catch {
      cache = { Blumenau: [...BAIRROS_BLUMENAU] }
    } finally {
      loading = null
    }
    return cache
  })()
  return loading
}

export function listarCidadesSc(mapa) {
  if (!mapa) return ['Blumenau']
  return Object.keys(mapa).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export function bairrosDaCidadeSc(mapa, cidade) {
  if (!cidade) return []
  if (mapa) {
    const hit = Object.keys(mapa).find(c => normStr(c) === normStr(cidade))
    if (hit && Array.isArray(mapa[hit]) && mapa[hit].length) {
      return [...mapa[hit]].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    }
  }
  if (normStr(cidade) === normStr('Blumenau')) return [...BAIRROS_BLUMENAU]
  return []
}

/** Infere cidade de atuação a partir dos bairros já salvos. */
export function inferirCidadeAtuacao(mapa, bairros = []) {
  if (!bairros?.length) return 'Blumenau'
  const list = bairros.map(b => normStr(b))
  if (list.every(b => BAIRROS_BLUMENAU.some(x => normStr(x) === b))) return 'Blumenau'
  if (!mapa) return ''
  let best = ''
  let bestScore = 0
  for (const [cidade, arr] of Object.entries(mapa)) {
    if (!Array.isArray(arr)) continue
    const set = new Set(arr.map(normStr))
    const score = list.filter(b => set.has(b)).length
    if (score > bestScore) {
      bestScore = score
      best = cidade
    }
  }
  return bestScore > 0 ? best : ''
}
