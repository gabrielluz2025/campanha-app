import { MAPA_VISITAS_SO_CUSTOM, IGREJAS_MAPA_SOMENTE_MANUAL, eIgrejaCadastroManual } from './igrejasFonte'

const MAX_ID_CATALOGO = 1999

/** Igreja vinda da busca Google / OSM / Nominatim (não cadastro manual). */
export function eIgrejaImportadaAutomaticamente(ig) {
  if (!ig) return false
  const fonte = String(ig.fonte || '').toLowerCase()
  if (fonte === 'manual' || fonte === 'cadastro') return false
  if (ig.manter || ig.triagemOk) return false
  if (ig.importPlanilha) return false
  if (['google', 'osm', 'nominatim'].includes(fonte)) return true
  if (ig.googlePlaceId || ig.osmId) return true
  return false
}

function limpo(v) {
  const s = String(v || '').trim()
  if (!s) return ''
  if (s === '—' || s === '-' || s === '–') return ''
  if (s === '/fotos/sem-foto.jpg') return ''
  return s
}

export function eIgrejaDaBusca(ig, maxIdExternas = MAX_ID_CATALOGO) {
  if (!ig) return false
  const fonte = String(ig.fonte || '').toLowerCase()
  if (fonte === 'manual' || fonte === 'cadastro') return false
  if (ig.manter || ig.triagemOk) return false
  if (fonte === 'osm' || fonte === 'google' || fonte === 'nominatim') return true
  return Number(ig.id) > Number(maxIdExternas)
}

export function fonteTriagemLabel(ig) {
  const f = String(ig?.fonte || '').toLowerCase()
  if (f === 'google') return 'Google'
  if (f === 'osm' || f === 'nominatim') return 'OSM'
  if (f === 'lista-papel') return 'Lista'
  if (Number(ig?.id) > MAX_ID_CATALOGO) return 'Cadastro'
  return 'Catálogo'
}

function nomeGenerico(nome) {
  const n = limpo(nome)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (n.length < 8) return true
  return /^(IGREJA|TEMPLO|CAPELA|PAROQUIA|CHURCH|PLACE OF WORSHIP)$/.test(n)
}

export function camposTriagem(ig = {}) {
  const endereco = limpo(ig.endereco)
  const setor = limpo(ig.setor)
  const culto = limpo(ig.culto)
  const pastor = limpo(ig.pastor1) || limpo(ig.pastor2)
  const telefone = limpo(ig.telefone) || limpo(ig.whatsapp)
  const redes = limpo(ig.instagram) || limpo(ig.facebook) || limpo(ig.website)
  return {
    endereco: endereco.length >= 8,
    setor: Boolean(setor),
    culto: Boolean(culto),
    pastor: Boolean(pastor),
    telefone: Boolean(telefone),
    redes: Boolean(redes),
    gps: Number.isFinite(Number(ig.lat)) && Number.isFinite(Number(ig.lng)),
    nomeFraco: nomeGenerico(ig.nome),
  }
}

export function classificarTriagem(ig) {
  const c = camposTriagem(ig)
  const contato = c.pastor || c.telefone || c.redes
  const faltas = []
  if (!c.endereco) faltas.push('endereço')
  if (!c.pastor) faltas.push('pastor')
  if (!c.telefone) faltas.push('telefone')
  if (!c.culto) faltas.push('culto')
  if (!c.setor) faltas.push('setor')
  if (c.nomeFraco) faltas.push('nome fraco')

  let nivel = 'parcial'
  if (!c.endereco && !contato && !c.culto) nivel = 'branco'
  else if (c.endereco && contato) nivel = 'presta'

  const preenchidos = [c.endereco, c.setor, c.culto, c.pastor, c.telefone, c.redes].filter(Boolean).length
  return { nivel, faltas, preenchidos, max: 6, campos: c }
}

/** Catálogo fixo sempre fica. Da busca, só fica quem tem endereço+contato — ou foi aplicada na triagem Google. */
export function eIgrejaFichaUtil(ig, maxIdExternas = MAX_ID_CATALOGO) {
  if (!eIgrejaDaBusca(ig, maxIdExternas)) return true
  if (ig.triagemOk || ig.manter) return true
  return classificarTriagem(ig).nivel === 'presta'
}

/** Mesma regra em todo o mapa; em modo só-cadastro, só entra o que o usuário cadastrou. */
export function igrejaVisivelNoMapa(ig, maxIdExternas = MAX_ID_CATALOGO) {
  if (!ig) return false
  if (IGREJAS_MAPA_SOMENTE_MANUAL) return eIgrejaCadastroManual(ig)
  if (MAPA_VISITAS_SO_CUSTOM && eIgrejaImportadaAutomaticamente(ig)) return false
  const fonte = String(ig.fonte || '').toLowerCase()
  if (fonte === 'google' || ig.triagemOk || ig.manter) return true
  if (!eIgrejaDaBusca(ig, maxIdExternas)) return true
  return eIgrejaFichaUtil(ig, maxIdExternas)
}

export function resumirTriagem(lista = [], maxIdExternas = MAX_ID_CATALOGO) {
  const daBusca = (lista || []).filter(ig => eIgrejaDaBusca(ig, maxIdExternas))
  const buckets = { branco: [], parcial: [], presta: [] }
  for (const ig of daBusca) {
    const info = classificarTriagem(ig)
    buckets[info.nivel].push({ ...ig, _triagem: info })
  }
  const sortNome = (a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
  buckets.branco.sort(sortNome)
  buckets.parcial.sort(sortNome)
  buckets.presta.sort(sortNome)
  return {
    total: daBusca.length,
    branco: buckets.branco.length,
    parcial: buckets.parcial.length,
    presta: buckets.presta.length,
    buckets,
  }
}

export const COR_TRIAGEM = {
  branco: '#94a3b8',
  parcial: '#f59e0b',
  presta: '#22c55e',
}

export const LABEL_TRIAGEM = {
  branco: 'Em branco',
  parcial: 'Tem dados',
  presta: 'Presta',
}
