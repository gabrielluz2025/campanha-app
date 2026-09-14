import { normStr } from './constants'
import { CIDADES_IGREJAS_MAPA } from './igrejasFonte'
import { coordDentroBlumenau } from './blumenauLimit'
import { enderecoEhRegiaoAdblu } from './igrejasAdbluNome'

/** Região ADBLU (Blumenau, Gaspar, Indaial) — fallback por GPS quando endereço incompleto. */
const BOUNDS_CAMPANHA = { latMin: -27.15, latMax: -26.50, lngMin: -49.40, lngMax: -48.75 }

function coordNaRegiaoCampanha(lat, lng) {
  const la = Number(lat)
  const ln = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false
  return la > BOUNDS_CAMPANHA.latMin && la < BOUNDS_CAMPANHA.latMax
    && ln > BOUNDS_CAMPANHA.lngMin && ln < BOUNDS_CAMPANHA.lngMax
}

const TOKENS_CIDADE_PERMITIDA = CIDADES_IGREJAS_MAPA.map(c => normStr(c))

/** Nome canônico por token normalizado no endereço. */
const CIDADE_POR_NORM = {
  BLUMENAU: 'Blumenau',
  GASPAR: 'Gaspar',
  INDAIAL: 'Indaial',
  TIMBO: 'Timbó',
  POMERODE: 'Pomerode',
  ILHOTA: 'Ilhota',
  BRUSQUE: 'Brusque',
  JOINVILLE: 'Joinville',
  FLORIANOPOLIS: 'Florianópolis',
  ITAJAI: 'Itajaí',
  NAVEGANTES: 'Navegantes',
  'BALNEARIO CAMBORIU': 'Balneário Camboriú',
  CAMBORIU: 'Camboriú',
}

const OUTRAS_CIDADES_NORM = Object.keys(CIDADE_POR_NORM).filter(
  k => !CIDADES_IGREJAS_MAPA.some(c => normStr(c) === k),
)

/** Extrai município do cadastro ou do endereço ("… - Bairro, Cidade - SC"). */
export function extrairCidadeIgreja(ig) {
  if (!ig) return ''
  const explicit = String(ig.cidade || '').trim()
  if (explicit) return explicit

  const end = String(ig.endereco || '').trim()
  if (!end) return ''

  const m = end.match(/-([^-]+?)\s*-\s*SC\s*$/i)
  if (m) {
    const chunk = m[1].trim()
    const comma = chunk.lastIndexOf(',')
    if (comma >= 0) return chunk.slice(comma + 1).trim()
    return chunk
  }

  const norm = normStr(end)
  for (const [key, label] of Object.entries(CIDADE_POR_NORM)) {
    if (norm.includes(key)) return label
  }
  return ''
}

export function igrejaNaCidadePermitida(ig, cidades = CIDADES_IGREJAS_MAPA) {
  if (!Array.isArray(cidades) || !cidades.length) return true
  const permitidas = new Set(cidades.map(c => normStr(c)))

  const cidade = extrairCidadeIgreja(ig)
  if (cidade) return permitidas.has(normStr(cidade))

  const endereco = String(ig?.endereco || '').trim()
  const normEnd = normStr(endereco)
  for (const outra of OUTRAS_CIDADES_NORM) {
    if (permitidas.has(outra)) continue
    if (normEnd.includes(outra)) return false
  }
  if (endereco) {
    if (enderecoEhRegiaoAdblu(endereco)) return true
    return false
  }

  const blob = normStr(`${ig?.bairro || ''} ${ig?.setor || ''} ${ig?.nome || ''}`)
  if (blob && TOKENS_CIDADE_PERMITIDA.some(t => blob.includes(t))) return true

  if (coordNaRegiaoCampanha(ig?.lat, ig?.lng)) return true
  return false
}

export function separarIgrejasPorCidadeCampanha(list, cidades = CIDADES_IGREJAS_MAPA) {
  const manter = []
  const fora = []
  for (const ig of list || []) {
    if (igrejaNaCidadePermitida(ig, cidades)) manter.push(ig)
    else fora.push(ig)
  }
  return { manter, fora }
}

export function filtrarListaIgrejasCidadesCampanha(list, cidades = CIDADES_IGREJAS_MAPA) {
  return separarIgrejasPorCidadeCampanha(list, cidades).manter
}

export function podarObjetoChavesIgrejas(obj, allowedIds) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj
  const allow = allowedIds instanceof Set ? allowedIds : new Set((allowedIds || []).map(String))
  const next = { ...obj }
  for (const k of Object.keys(next)) {
    if (!allow.has(String(k))) delete next[k]
  }
  return next
}

/**
 * Mapa de Visitas / Montar Rotas — só igrejas das cidades da campanha.
 * Igrejas de Blumenau com GPS também devem cair dentro do limite municipal.
 */
export function filtrarIgrejasMapaCampanha(
  igrejas = [],
  { cidades = CIDADES_IGREJAS_MAPA, boundary = null } = {},
) {
  return (igrejas || []).filter(ig => {
    if (!igrejaNaCidadePermitida(ig, cidades)) return false

    const lat = Number(ig?.lat)
    const lng = Number(ig?.lng)
    const temGps = Number.isFinite(lat) && Number.isFinite(lng)
    const b = boundary?.limit || boundary?.bairros?.features?.length ? boundary : null
    const cidade = normStr(extrairCidadeIgreja(ig))

    if (temGps && b && cidade === normStr('BLUMENAU')) {
      return coordDentroBlumenau(lat, lng, b)
    }

    return true
  })
}
