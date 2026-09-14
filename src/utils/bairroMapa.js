import { BAIRROS_BLUMENAU, normStr } from './constants'

/** Nomes no GeoJSON (OSM) → chave canônica usada nos dados TRE/constants */
export const GEO_PARA_CANON = {
  'Da Glória': 'Glória',
  'Do Salto': 'Salto',
}

const CANON_PARA_GEO = Object.fromEntries(
  Object.entries(GEO_PARA_CANON).map(([geo, canon]) => [canon, geo]),
)

const BAIRRO_POR_NORM = Object.fromEntries(BAIRROS_BLUMENAU.map(b => [normStr(b), b]))

const TRE_ALIASES = {
  GLORIA: 'Glória',
  'DA GLORIA': 'Glória',
  'DO SALTO': 'Salto',
  FIDELIS: 'Fidélis',
  VALPARAISO: 'Valparaíso',
}

/** Converte nome de bairro do TRE/OSM para o formato usado nos selects. */
export function normalizarBairro(bairro, lista = BAIRROS_BLUMENAU) {
  if (!bairro) return ''
  const trimmed = String(bairro).trim()
  if (lista.includes(trimmed)) return trimmed
  const n = normStr(trimmed)
  if (BAIRRO_POR_NORM[n]) return BAIRRO_POR_NORM[n]
  const porNorm = Object.fromEntries(lista.map(b => [normStr(b), b]))
  if (porNorm[n]) return porNorm[n]
  if (TRE_ALIASES[n]) return TRE_ALIASES[n]
  return trimmed
}

export function bairroCanon(nome) {
  if (!nome) return null
  if (GEO_PARA_CANON[nome]) return GEO_PARA_CANON[nome]
  if (BAIRROS_BLUMENAU.includes(nome)) return nome
  const norm = normalizarBairro(nome)
  return BAIRROS_BLUMENAU.includes(norm) ? norm : nome
}

export function bairroGeoNome(canon) {
  return CANON_PARA_GEO[canon] || canon
}

export function isBairroBlumenau(nome) {
  if (!nome) return false
  const c = bairroCanon(nome)
  return BAIRROS_BLUMENAU.includes(c)
}

export function isZonaBlumenau(zona, dados) {
  const mun = normStr(zona?.municipio || dados?.municipio || 'BLUMENAU')
  return mun === normStr('BLUMENAU')
}
