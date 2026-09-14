/** Mínimo para igrejas custom (catálogo fixo usa id ≤ 1999). */
export const MIN_ID_IGREJA_CUSTOM = 2000

/**
 * ID numérico único para igreja custom — offline-safe (timestamp + aleatório).
 * Permanece Number compatível com id > 1999, geo_coords[id], rotas, etc.
 */
export function gerarIdIgrejaCustom() {
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 1000)
  const id = timestamp * 1000 + random
  return id > MIN_ID_IGREJA_CUSTOM ? id : MIN_ID_IGREJA_CUSTOM + id
}
