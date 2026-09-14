/** Teto de pins no mapa — acima disso o navegador trava ao pan/zoom/scroll. */
export const MAX_PINS_MAPA = 450
export const MAX_PINS_ADBLU = 450

/**
 * Prioriza pins da rota / selecionados e corta o restante.
 * @returns {{ pins: object[], omitidas: number, total: number }}
 */
export function limitarPinsMapa(lista, { max = MAX_PINS_MAPA, prioridadeIds } = {}) {
  const arr = Array.isArray(lista) ? lista : []
  const total = arr.length
  if (total <= max) return { pins: arr, omitidas: 0, total }
  const pri = new Set((prioridadeIds || []).map(String))
  const first = []
  const rest = []
  for (const ig of arr) {
    if (ig && pri.has(String(ig.id))) first.push(ig)
    else rest.push(ig)
  }
  const pins = first.length >= max ? first.slice(0, max) : [...first, ...rest].slice(0, max)
  return { pins, omitidas: total - pins.length, total }
}
