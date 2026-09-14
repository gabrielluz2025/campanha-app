import { normStr, BAIRROS_BLUMENAU } from './constants'
import { bairroCanon, bairroGeoNome } from './bairroMapa'
import { CARGO_CORES, normalizarCargo } from './equipeSync'
import { readStorage, writeStorage, readStorageArray } from './persist'
import { cultoParaData, horaInicioCultoNaData, resolverCultoIgreja } from './cultoParse'

export const ROTAS_STORAGE = 'rotas_paradas'
export const ROTAS_LOGISTICA_STORAGE = 'rotas_logistica'
export const ROTAS_ATIVA_STORAGE = 'rotas_ativa_id'
export const ROTAS_REMOVIDOS_STORAGE = 'rotas_logistica_removidos'
const LEGACY_STORAGE = 'igrejas_rota'

export const TIPOS_PARADA = [
  { id: 'visita', label: 'Visita', cor: '#3b82f6', duracao: 20 },
  { id: 'reuniao', label: 'Reunião', cor: '#06b6d4', duracao: 45 },
  { id: 'entrega', label: 'Entrega', cor: '#f59e0b', duracao: 15 },
  { id: 'evento', label: 'Evento', cor: '#ec4899', duracao: 60 },
  { id: 'apoio', label: 'Apoio / Cabo', cor: '#10b981', duracao: 20 },
  { id: 'outro', label: 'Outro', cor: '#94a3b8', duracao: 15 },
]

export const STATUS_PARADA = [
  { id: 'pendente', label: 'Pendente', cor: '#94a3b8' },
  { id: 'em_deslocamento', label: 'Em deslocamento', cor: '#06b6d4' },
  { id: 'no_local', label: 'No local', cor: '#f59e0b' },
  { id: 'concluido', label: 'Concluído', cor: '#10b981' },
  { id: 'reagendar', label: 'Reagendar', cor: '#f97316' },
  { id: 'cancelado', label: 'Cancelado', cor: '#ef4444' },
]

export const STATUS_ROTA = [
  { id: 'rascunho', label: 'Rascunho', cor: '#94a3b8' },
  { id: 'em_andamento', label: 'Em andamento', cor: '#3b82f6' },
  { id: 'concluida', label: 'Concluída', cor: '#10b981' },
  { id: 'parcial', label: 'Parcial', cor: '#f59e0b' },
  { id: 'nao_realizada', label: 'Não realizada', cor: '#f87171' },
  { id: 'com_problema', label: 'Com problema', cor: '#ef4444' },
]

const STATUS_ROTA_IDS = new Set(STATUS_ROTA.map(s => s.id))

/** Data local YYYY-MM-DD (evita erro de fuso com toISOString). Aceita Date opcional. */
export function dataLocalHoje(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fmtDataBR(ymd) {
  const s = String(ymd || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export function nomeRotaPadrao(dataYmd) {
  return `Rota ${fmtDataBR(dataYmd || dataLocalHoje())}`
}

export function statusRotaMeta(id) {
  return STATUS_ROTA.find(s => s.id === id) || STATUS_ROTA[0]
}

/** Status que pedem motivo/explicação. */
export function statusRotaExigeMotivo(id) {
  return ['parcial', 'nao_realizada', 'com_problema'].includes(String(id || ''))
}

const TIPO_MAP = Object.fromEntries(TIPOS_PARADA.map(t => [t.id, t]))
const STATUS_MAP = Object.fromEntries(STATUS_PARADA.map(s => [s.id, s]))

let bairrosCoordsCache = null

export function gerarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function paradaKey(tipo, id) {
  return `${tipo}:${String(id)}`
}

export function parseParadaKey(key) {
  const idx = String(key).indexOf(':')
  if (idx < 0) return { tipo: 'igreja', id: key }
  return { tipo: key.slice(0, idx), id: key.slice(idx + 1) }
}

export function corTipoParada(tipo) {
  return TIPO_MAP[tipo]?.cor || '#3b82f6'
}

export function labelTipoParada(tipo) {
  return TIPO_MAP[tipo]?.label || 'Visita'
}

export function corStatusParada(status) {
  return STATUS_MAP[status]?.cor || '#94a3b8'
}

export function duracaoPadraoTipo(tipo) {
  return TIPO_MAP[tipo]?.duracao || 15
}

export function criarParadaBase(overrides = {}) {
  return {
    key: overrides.key || paradaKey('manual', gerarId()),
    tipoParada: overrides.tipoParada || 'visita',
    status: overrides.status || 'pendente',
    duracaoMin: overrides.duracaoMin ?? duracaoPadraoTipo(overrides.tipoParada || 'visita'),
    horaPrevista: overrides.horaPrevista || '',
    obs: overrides.obs || '',
    material: overrides.material || null,
    agendaEventoId: overrides.agendaEventoId || null,
    concluidoEm: overrides.concluidoEm || null,
    ...overrides,
  }
}

export function migrarLegadoParaRotas() {
  const legado = loadParadasSalvas()
  if (!legado.length) return null
  const hoje = dataLocalHoje()
  return {
    id: gerarId(),
    nome: nomeRotaPadrao(hoje),
    data: hoje,
    responsavelId: '',
    status: 'rascunho',
    resultadoMotivo: '',
    resultadoEm: '',
    resultadoPor: '',
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
    paradas: legado.map(key => criarParadaBase({ key })),
    equipeIds: [],
  }
}

export function loadRotasLogistica() {
  try {
    const raw = JSON.parse(localStorage.getItem(ROTAS_LOGISTICA_STORAGE) || 'null')
    const removidos = loadRotasRemovidos()
    if (Array.isArray(raw) && raw.length) {
      return raw.map(normalizarRota).filter(r => r?.id && !removidos.has(String(r.id)))
    }
    const migrada = migrarLegadoParaRotas()
    if (migrada) return [normalizarRota(migrada)]
    return []
  } catch {
    return []
  }
}

export function loadRotasRemovidos() {
  try {
    const raw = JSON.parse(localStorage.getItem(ROTAS_REMOVIDOS_STORAGE) || '[]')
    return new Set((Array.isArray(raw) ? raw : []).map(String))
  } catch {
    return new Set()
  }
}

export function loadRotaAtivaId() {
  try {
    return localStorage.getItem(ROTAS_ATIVA_STORAGE) || ''
  } catch {
    return ''
  }
}

export function marcarRotaRemovida(id) {
  if (id == null || id === '') return
  try {
    const set = loadRotasRemovidos()
    set.add(String(id))
    writeStorage(ROTAS_REMOVIDOS_STORAGE, [...set])
  } catch { /* */ }
}

/** Remove paradas igreja: de todas as rotas salvas (ex.: ao apagar igreja no mapa). */
export function removerIgrejaDeTodasRotas(igrejaId) {
  const key = paradaKey('igreja', igrejaId)
  const rotas = loadRotasLogistica()
  let changed = false
  const next = rotas.map(r => {
    const antes = r.paradas || []
    const paradas = antes.filter(p => {
      const k = typeof p === 'string' ? p : p?.key
      return k !== key
    })
    if (paradas.length === antes.length) return r
    changed = true
    return { ...r, paradas, atualizadoEm: new Date().toISOString() }
  })
  if (changed) saveRotasLogistica(next, loadRotaAtivaId())
  return changed
}

export function removerIgrejasDeTodasRotas(ids = []) {
  let any = false
  for (const id of ids) {
    if (removerIgrejaDeTodasRotas(id)) any = true
  }
  return any
}

export function saveRotasLogistica(rotas, ativaId) {
  const removidos = loadRotasRemovidos()
  const limpas = (Array.isArray(rotas) ? rotas : [])
    .map(normalizarRota)
    .filter(r => r?.id && !removidos.has(String(r.id)))
  writeStorage(ROTAS_LOGISTICA_STORAGE, limpas)
  if (ativaId !== undefined) {
    const ativaOk = limpas.some(r => String(r.id) === String(ativaId))
    writeStorage(ROTAS_ATIVA_STORAGE, ativaOk ? ativaId : (limpas[0]?.id || ''))
  }
}

export function criarRotaVazia({ nome, data, responsavelId } = {}) {
  const hoje = dataLocalHoje()
  const dataRota = data || hoje
  return {
    id: gerarId(),
    nome: nome || nomeRotaPadrao(dataRota),
    data: dataRota,
    responsavelId: responsavelId || '',
    status: 'rascunho',
    resultadoMotivo: '',
    resultadoEm: '',
    resultadoPor: '',
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
    paradas: [],
    /** Integrantes que vão executar a rota (não são paradas). */
    equipeIds: [],
  }
}

/** True se a chave/parada representa um membro da equipe (não um local). */
export function isParadaEquipe(keyOrParada) {
  const key = typeof keyOrParada === 'string' ? keyOrParada : keyOrParada?.key
  return Boolean(key && String(key).startsWith('equipe:'))
}

const PARADA_STATUS_PENDENTE_CAMPO = new Set(['pendente', 'reagendar', 'em_deslocamento'])

function statusParadaLogistica(parada) {
  if (typeof parada === 'string') return 'pendente'
  return parada?.status || 'pendente'
}

/** Paradas operacionais da rota (exclui legado equipe:). */
export function paradasOperacionaisRota(rota) {
  const paradas = Array.isArray(rota?.paradas) ? rota.paradas : []
  return paradas.filter(p => !isParadaEquipe(p))
}

/**
 * Resumo de rotas de campo para Dashboard e relatórios.
 * Fonte de verdade: rotas_logistica (não rotas_paradas).
 */
export function resumoRotasCampo({ dataRef } = {}) {
  const hoje = dataRef || dataLocalHoje()
  const rotas = loadRotasLogistica().filter(r => {
    const dataRota = String(r?.data || '').slice(0, 10)
    return dataRota === hoje || r?.status === 'em_andamento'
  })

  let paradasTotal = 0
  let paradasPendentes = 0
  for (const rota of rotas) {
    for (const p of paradasOperacionaisRota(rota)) {
      paradasTotal++
      const st = statusParadaLogistica(p)
      if (PARADA_STATUS_PENDENTE_CAMPO.has(st)) paradasPendentes++
    }
  }

  return {
    dataReferencia: hoje,
    rotas,
    rotasCount: rotas.length,
    paradasTotal,
    paradasPendentes,
  }
}

/** Extrai equipe: das paradas legadas e garante equipeIds + campos de resultado. */
export function normalizarRota(rota) {
  if (!rota || typeof rota !== 'object') return rota
  const paradasIn = Array.isArray(rota.paradas) ? rota.paradas : []
  const equipeIds = new Set(
    (Array.isArray(rota.equipeIds) ? rota.equipeIds : []).map(String).filter(Boolean),
  )
  const paradas = []
  for (const p of paradasIn) {
    const key = typeof p === 'string' ? p : p?.key
    if (!key) continue
    if (isParadaEquipe(key)) {
      const id = String(key).slice('equipe:'.length)
      if (id) equipeIds.add(id)
      continue
    }
    paradas.push(typeof p === 'string' ? criarParadaBase({ key: p }) : p)
  }
  const status = STATUS_ROTA_IDS.has(rota.status) ? rota.status : 'rascunho'
  const data = String(rota.data || dataLocalHoje()).slice(0, 10)
  return {
    ...rota,
    data,
    nome: String(rota.nome || nomeRotaPadrao(data)).trim() || nomeRotaPadrao(data),
    status,
    resultadoMotivo: String(rota.resultadoMotivo || rota.motivo || '').trim(),
    resultadoEm: String(rota.resultadoEm || '').trim(),
    resultadoPor: String(rota.resultadoPor || '').trim(),
    paradas,
    equipeIds: [...equipeIds],
  }
}

/** Atualiza data e, se o nome for o padrão antigo, renomeia junto. */
export function patchDataRota(rota, novaData) {
  const data = String(novaData || dataLocalHoje()).slice(0, 10)
  const oldData = String(rota?.data || '').slice(0, 10)
  const oldNome = String(rota?.nome || '').trim()
  const eraPadrao = !oldNome
    || oldNome === nomeRotaPadrao(oldData)
    || /^Rota \d{2}\/\d{2}\/\d{4}$/.test(oldNome)
  return {
    data,
    ...(eraPadrao ? { nome: nomeRotaPadrao(data) } : {}),
    atualizadoEm: new Date().toISOString(),
  }
}

export function loadParadasSalvas() {
  try {
    const raw = JSON.parse(localStorage.getItem(ROTAS_STORAGE) || 'null')
    if (Array.isArray(raw) && raw.length) {
      if (typeof raw[0] === 'number') return raw.map(id => paradaKey('igreja', id))
      return raw.filter(k => typeof k === 'string')
    }
    const leg = JSON.parse(localStorage.getItem(LEGACY_STORAGE) || '[]')
    if (Array.isArray(leg) && leg.length && typeof leg[0] === 'number') {
      return leg.map(id => paradaKey('igreja', id))
    }
    return []
  } catch {
    return []
  }
}

export async function getBairrosCoords() {
  if (bairrosCoordsCache) return bairrosCoordsCache
  try {
    const res = await fetch('/bairros_coords.json')
    bairrosCoordsCache = await res.json()
  } catch {
    bairrosCoordsCache = {}
  }
  return bairrosCoordsCache
}

export function coordsDoBairro(bairrosCoords, bairroNome) {
  if (!bairroNome || !bairrosCoords) return null
  const canon = bairroCanon(bairroNome)
  const candidatos = [
    `BLUMENAU::${String(canon).toUpperCase()}`,
    `BLUMENAU::${String(bairroGeoNome(canon)).toUpperCase()}`,
    `BLUMENAU::${normStr(canon).toUpperCase()}`,
  ]
  for (const k of candidatos) {
    if (bairrosCoords[k]?.lat) return bairrosCoords[k]
  }
  const alvo = normStr(canon)
  for (const [k, v] of Object.entries(bairrosCoords)) {
    if (!k.startsWith('BLUMENAU::')) continue
    const nome = normStr(k.replace('BLUMENAU::', ''))
    if (nome === alvo || nome.includes(alvo) || alvo.includes(nome)) return v
  }
  return null
}

export function loadEquipeMembros() {
  return readStorageArray('equipe_membros', [])
}

export function bairrosDoMembro(m) {
  if (Array.isArray(m.bairros) && m.bairros.length) return m.bairros
  if (m.bairro) return String(m.bairro).split(',').map(b => b.trim()).filter(Boolean)
  return []
}

/** Ignora placeholders como "0", "—" ou só números curtos. */
export function enderecoTextoUtil(s) {
  const t = String(s || '').trim()
  if (t.length < 4) return false
  if (/^\d+$/.test(t)) return false
  if (t === '—' || t === '-' || t === '0') return false
  return true
}

/** Monta endereço completo para exibição e links de mapa. */
export function formatEnderecoParada(p) {
  if (!p) return ''
  const end = enderecoTextoUtil(p.endereco || p.local) ? String(p.endereco || p.local).trim() : ''
  const bairro = String(p.bairro || p.setor || '').trim()
  const cidade = String(p.cidade || 'Blumenau').trim()
  const uf = String(p.uf || 'SC').trim()
  const cidadeUf = `${cidade} - ${uf}`

  const log = String(p.logradouro || p.rua || '').trim()
  const num = String(p.numero || '').trim()
  const linhaRua = log ? (num ? `${log}, ${num}` : log) : ''

  if (end.length >= 18 && (end.includes('Blumenau') || /\d{2,}/.test(end))) {
    const nEnd = normStr(end)
    if (bairro && !nEnd.includes(normStr(bairro)) && end.length < 55) {
      return `${end} - ${bairro}, ${cidadeUf}`
    }
    return end
  }

  const parts = []
  if (linhaRua) parts.push(linhaRua)
  else if (end && end.length > 3) parts.push(end)
  if (bairro) {
    const nParts = normStr(parts.join(' '))
    if (!nParts.includes(normStr(bairro))) parts.push(bairro)
  }
  const nAll = normStr(parts.join(' '))
  if (!nAll.includes(normStr(cidadeUf))) parts.push(cidadeUf)
  return parts.filter(Boolean).join(', ')
}

/** Uma linha curta para listas (rua ou bairro + cidade). */
export function enderecoLinhaParada(p) {
  if (!p) return ''
  const full = formatEnderecoParada(p)
  if (!full) return ''
  const log = String(p.logradouro || p.rua || '').trim()
  const num = String(p.numero || '').trim()
  if (log) return num ? `${log}, ${num}` : log
  const end = String(p.endereco || '').trim()
  if (end && end.length > 8 && !end.includes(',')) return end
  const first = full.split(',')[0]?.trim()
  return first || full
}

export function membroParaParada(m, bairrosCoords) {
  const bairros = bairrosDoMembro(m)
  const bairro = bairros[0] || ''
  const coords = bairro ? coordsDoBairro(bairrosCoords, bairro) : null
  const cargo = normalizarCargo(m.cargo)
  return {
    key: paradaKey('equipe', m.id),
    tipo: 'equipe',
    id: m.id,
    nome: m.nome || 'Sem nome',
    cargo,
    telefone: m.telefone || '',
    foto: m.foto || '',
    fotoX: m.fotoX ?? 50,
    fotoY: m.fotoY ?? 50,
    bairros,
    setor: bairro || (bairros.length ? bairros.join(', ') : 'Sem bairro'),
    endereco: bairro ? `${bairro}, Blumenau - SC` : (bairros.length ? `${bairros.join(', ')}, Blumenau - SC` : ''),
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    status: coords?.lat ? 'ok' : 'sem_coords',
    cor: CARGO_CORES[cargo] || '#10b981',
  }
}

export function igrejaParaParada(ig) {
  const base = {
    key: paradaKey('igreja', ig.id),
    tipo: 'igreja',
    id: ig.id,
    nome: ig.nome,
    setor: ig.setor,
    endereco: ig.endereco || '',
    cep: ig.cep || '',
    logradouro: ig.logradouro || ig.rua || '',
    numero: ig.numero || '',
    complemento: ig.complemento || '',
    bairro: ig.bairro || ig.setor || '',
    cidade: ig.cidade || 'Blumenau',
    uf: ig.uf || 'SC',
    lat: coordValida(ig.lat, ig.lng) ? Number(ig.lat) : null,
    lng: coordValida(ig.lat, ig.lng) ? Number(ig.lng) : null,
    status: coordValida(ig.lat, ig.lng) ? 'ok' : 'sem_coords',
    denominacao: ig.denominacao,
    pastor1: ig.pastor1,
    pastor2: ig.pastor2,
    culto: resolverCultoIgreja(ig),
    telefone: ig.telefone || '',
    website: ig.website || '',
    instagram: ig.instagram || '',
    facebook: ig.facebook || '',
    whatsapp: ig.whatsapp || '',
    visitado: !!ig.visitado,
    visita: ig.visita || null,
    geoFonte: ig.geoFonte || null,
  }
  base.endereco = formatEnderecoParada(base) || base.endereco
  base.enderecoCurto = enderecoLinhaParada(base)
  base.navPorEndereco = enderecoTextoUtil(base.endereco)
  return base
}

export function agendaParaParada(ev, bairrosCoords) {
  const catMap = {
    visita: 'visita', reuniao: 'reuniao', culto: 'evento',
    palestra: 'evento', entrevista: 'reuniao', outro: 'outro',
  }
  const tipoParada = catMap[ev.categoria] || 'evento'
  const local = ev.local || ''
  let lat = null, lng = null, setor = ''
  for (const b of BAIRROS_BLUMENAU) {
    if (normStr(local).includes(normStr(b))) {
      setor = b
      const c = coordsDoBairro(bairrosCoords, b)
      if (c) { lat = c.lat; lng = c.lng }
      break
    }
  }
  return criarParadaBase({
    key: paradaKey('agenda', ev.id),
    tipoParada,
    nome: ev.titulo || 'Evento',
    endereco: local,
    setor,
    lat,
    lng,
    horaPrevista: ev.horaInicio || '',
    duracaoMin: duracaoPadraoTipo(tipoParada),
    agendaEventoId: ev.id,
    obs: ev.observacoes || '',
  })
}

export function materialParaParada(item, bairro, quantidade, bairrosCoords) {
  const coords = coordsDoBairro(bairrosCoords, bairro)
  return criarParadaBase({
    key: paradaKey('material', `${item.id}_${bairro}_${gerarId()}`),
    tipoParada: 'entrega',
    nome: `Entrega: ${item.nome}`,
    endereco: `${bairro}, Blumenau - SC`,
    setor: bairro,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    material: { itemId: item.id, nome: item.nome, quantidade, bairro },
    duracaoMin: 15,
  })
}

export function resolverParadas(paradasOuKeys, igrejas, membros, bairrosCoords) {
  const keys = Array.isArray(paradasOuKeys) && paradasOuKeys.length
    ? (typeof paradasOuKeys[0] === 'string'
      ? paradasOuKeys
      : paradasOuKeys.map(p => p.key))
    : []
  const metaMap = {}
  if (Array.isArray(paradasOuKeys) && paradasOuKeys[0]?.key) {
    paradasOuKeys.forEach(p => { metaMap[p.key] = p })
  }
  const needIgreja = new Set()
  const needEquipe = new Set()
  for (const k of keys) {
    const s = String(k || '')
    if (s.startsWith('igreja:')) needIgreja.add(s.slice(7))
    else if (s.startsWith('equipe:')) needEquipe.add(s.slice(7))
  }
  const igMap = {}
  for (const i of igrejas || []) {
    if (!needIgreja.has(String(i.id))) continue
    igMap[paradaKey('igreja', i.id)] = igrejaParaParada(i)
  }
  const eqMap = {}
  for (const m of membros || []) {
    if (!needEquipe.has(String(m.id))) continue
    eqMap[paradaKey('equipe', m.id)] = membroParaParada(m, bairrosCoords)
  }
  return keys.map(k => {
    const base = igMap[k] || eqMap[k]
    const meta = metaMap[k]
    if (!base && meta) {
      return {
        ...meta,
        geoOk: Boolean(meta.lat && meta.lng),
        status: meta.status || 'pendente',
      }
    }
    if (!base) return meta ? { ...meta, geoOk: Boolean(meta.lat && meta.lng), status: meta.status || 'pendente' } : null
    return {
      ...base,
      geoOk: base.status === 'ok',
      tipoParada: meta?.tipoParada || (base.tipo === 'equipe' ? 'apoio' : 'visita'),
      status: meta?.status || 'pendente',
      duracaoMin: meta?.duracaoMin ?? duracaoPadraoTipo(meta?.tipoParada || 'visita'),
      horaPrevista: meta?.horaPrevista || '',
      obs: meta?.obs || '',
      material: meta?.material || null,
      agendaEventoId: meta?.agendaEventoId || null,
      concluidoEm: meta?.concluidoEm || null,
    }
  }).filter(Boolean)
}

/** Reidrata nome/endereço/GPS a partir do catálogo de igrejas quando o share veio incompleto. */
export function enriquecerParadaDoCatalogo(p, igrejas = []) {
  if (!p) return p
  const key = String(p.key || '')
  if (!key.startsWith('igreja:')) return p
  const ig = (igrejas || []).find(i => String(i.id) === key.slice(7))
  if (!ig) return p
  const cat = igrejaParaParada(ig)
  const lat = coordValida(cat.lat, cat.lng) ? cat.lat : (coordValida(p.lat, p.lng) ? Number(p.lat) : null)
  const lng = coordValida(cat.lat, cat.lng) ? cat.lng : (coordValida(p.lat, p.lng) ? Number(p.lng) : null)
  return {
    ...p,
    nome: cat.nome || p.nome || '',
    endereco: cat.endereco || (enderecoTextoUtil(p.endereco) ? p.endereco : ''),
    enderecoCurto: cat.enderecoCurto || p.enderecoCurto || '',
    navPorEndereco: cat.navPorEndereco ?? enderecoTextoUtil(cat.endereco || p.endereco),
    logradouro: cat.logradouro || p.logradouro || '',
    numero: cat.numero || p.numero || '',
    bairro: cat.bairro || p.bairro || p.setor || '',
    setor: cat.setor || p.setor || '',
    cidade: cat.cidade || p.cidade || 'Blumenau',
    uf: cat.uf || p.uf || 'SC',
    lat,
    lng,
    denominacao: cat.denominacao || p.denominacao,
    culto: cat.culto || p.culto,
    telefone: cat.telefone || p.telefone,
  }
}

/** Paradas com nome/endereço para o painel Ao vivo e link público. */
export function paradasParaPainelAoVivo(
  rotaParadas = [],
  igrejas = [],
  membros = [],
  bairrosCoords = null,
  shareParadas = [],
) {
  const raw = (rotaParadas?.length ? rotaParadas : shareParadas) || []
  const resolved = resolverParadas(raw, igrejas, membros, bairrosCoords || {})
  const remote = {}
  for (const p of shareParadas || []) {
    if (p?.key) remote[p.key] = p
  }
  return resolved
    .filter(p => p && !String(p.key || '').startsWith('equipe:'))
    .map(p => {
      const rem = remote[p.key] || {}
      const base = enriquecerParadaDoCatalogo(p, igrejas)
      const lat = coordValida(base.lat, base.lng) ? Number(base.lat)
        : coordValida(rem.lat, rem.lng) ? Number(rem.lat) : null
      const lng = coordValida(base.lat, base.lng) ? Number(base.lng)
        : coordValida(rem.lat, rem.lng) ? Number(rem.lng) : null
      const merged = {
        ...rem,
        ...base,
        lat,
        lng,
        nome: base.nome || rem.nome || rem.titulo || '',
        bairro: base.bairro || rem.bairro || base.setor || rem.setor || '',
        logradouro: base.logradouro || rem.logradouro || '',
        numero: base.numero || rem.numero || '',
        cidade: base.cidade || rem.cidade || 'Blumenau',
        uf: base.uf || rem.uf || 'SC',
        horaPrevista: base.horaPrevista || rem.horaPrevista || '',
      }
      merged.endereco = formatEnderecoParada(merged)
        || (enderecoTextoUtil(rem.endereco) ? rem.endereco : '')
        || (enderecoTextoUtil(base.endereco) ? base.endereco : '')
        || (enderecoTextoUtil(rem.local) ? rem.local : '')
      merged.enderecoCurto = enderecoLinhaParada(merged)
      return merged
    })
}

export function haversineKm(a, b) {
  if (!coordValida(a?.lat, a?.lng) || !coordValida(b?.lat, b?.lng)) return Infinity
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

/** Rejeita Null Island (0,0) e coords fora do Brasil — evita pin/rota no oceano. */
export function coordValida(lat, lng) {
  const la = Number(lat)
  const ln = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false
  if (Math.abs(la) < 0.0001 && Math.abs(ln) < 0.0001) return false
  if (la > 6 || la < -35 || ln > -28 || ln < -75) return false
  return true
}

/** Raio padrão para considerar chegada ao local (metros). */
export const RAIO_CHEGADA_PADRAO_M = 90
/** Limite máximo do raio com margem de precisão do GPS. */
export const RAIO_CHEGADA_MAX_M = 180

export function distanciaMetrosParada(origem, parada) {
  const lat = Number(parada?.lat)
  const lng = Number(parada?.lng)
  if (!coordValida(lat, lng)) return Infinity
  const oLat = Number(origem?.lat ?? origem?.latitude)
  const oLng = Number(origem?.lng ?? origem?.longitude)
  if (!coordValida(oLat, oLng)) return Infinity
  return haversineKm({ lat: oLat, lng: oLng }, { lat, lng }) * 1000
}

export function raioChegadaParada(posicao, parada) {
  const acc = Number(posicao?.acc ?? posicao?.accuracy ?? 0)
  if (Number.isFinite(acc) && acc > 0) {
    return Math.min(RAIO_CHEGADA_MAX_M, Math.max(RAIO_CHEGADA_PADRAO_M, acc * 1.4))
  }
  return RAIO_CHEGADA_PADRAO_M
}

export function estaNoLocalParada(posicao, parada) {
  const d = distanciaMetrosParada(posicao, parada)
  if (!Number.isFinite(d)) return false
  return d <= raioChegadaParada(posicao, parada)
}

/** Próxima parada ainda não resolvida na rota. */
export function proximaParadaAberta(exec, paradas, detalheFn) {
  const det = detalheFn || ((e, k) => e?.detalhes?.[k] || { status: e?.statusParadas?.[k] || 'pendente' })
  return (paradas || []).find((p) => {
    const st = det(exec, p.key).status || 'pendente'
    return st !== 'concluido' && st !== 'nao_visitou' && st !== 'reagendar' && st !== 'cancelado'
  }) || null
}

/** Formata distância: metros abaixo de 1 km. */
export function formatDistanciaKm(km) {
  if (!Number.isFinite(km) || km === Infinity) return '—'
  if (km < 0.05) return '< 50 m'
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

/**
 * Agrupa igrejas por bairro/setor e lista pares próximos (haversine).
 * Retorna grupos ordenados pelos pares mais próximos.
 */
export function agruparIgrejasProximas(igrejas, { maxKm = 3, maxParesPorGrupo = 30 } = {}) {
  const comGps = (igrejas || []).filter(ig => Number(ig?.lat) && Number(ig?.lng))
  const bySetor = new Map()
  for (const ig of comGps) {
    const setor = String(ig.setor || '').trim() || 'Sem bairro'
    if (!bySetor.has(setor)) bySetor.set(setor, [])
    bySetor.get(setor).push(ig)
  }

  const grupos = []
  for (const [setor, lista] of bySetor.entries()) {
    const pares = []
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const km = haversineKm(lista[i], lista[j])
        if (Number.isFinite(km) && km <= maxKm) {
          pares.push({ a: lista[i], b: lista[j], km })
        }
      }
    }
    pares.sort((x, y) => x.km - y.km)

    const vizinhos = lista.map(ig => {
      let best = null
      for (const other of lista) {
        if (String(other.id) === String(ig.id)) continue
        const km = haversineKm(ig, other)
        if (!Number.isFinite(km)) continue
        if (!best || km < best.km) best = { igreja: other, km }
      }
      return { igreja: ig, vizinho: best }
    }).filter(v => v.vizinho && v.vizinho.km <= maxKm)
      .sort((a, b) => a.vizinho.km - b.vizinho.km)

    grupos.push({
      setor,
      total: lista.length,
      comPar: new Set(pares.flatMap(p => [String(p.a.id), String(p.b.id)])).size,
      pares: pares.slice(0, maxParesPorGrupo),
      vizinhos,
      igrejas: lista,
      menorKm: pares[0]?.km ?? Infinity,
    })
  }

  grupos.sort((a, b) => {
    if (a.menorKm !== b.menorKm) return a.menorKm - b.menorKm
    return a.setor.localeCompare(b.setor, 'pt-BR')
  })

  const topPares = grupos
    .flatMap(g => g.pares.map(p => ({ ...p, setor: g.setor })))
    .sort((a, b) => a.km - b.km)
    .slice(0, 20)

  return { grupos, topPares, totalComGps: comGps.length }
}

function nnOrdemDesde(comCoords, startIdx = 0) {
  const restante = comCoords.map((p, i) => ({ p, i })).filter(x => x.i !== startIdx)
  const ordenados = [comCoords[startIdx]]
  let atual = comCoords[startIdx]
  while (restante.length) {
    let proxIdx = 0
    let proxDist = Infinity
    for (let i = 0; i < restante.length; i++) {
      const d = haversineKm(atual, restante[i].p)
      const bonus = restante[i].p.horaPrevista
        ? -0.01 * parseInt(String(restante[i].p.horaPrevista).replace(':', ''), 10)
        : 0
      if (d + bonus < proxDist) { proxDist = d + bonus; proxIdx = i }
    }
    atual = restante.splice(proxIdx, 1)[0].p
    ordenados.push(atual)
  }
  return ordenados
}

function distanciaTotalOrdem(comCoords, ordenados) {
  let total = 0
  for (let i = 1; i < ordenados.length; i++) {
    total += haversineKm(ordenados[i - 1], ordenados[i])
  }
  return total
}

/** Otimização nearest-neighbor; fixa primeira parada se fixarInicio */
export function otimizarOrdemParadas(paradasDetalhes, { fixarInicio = true } = {}) {
  const comCoords = paradasDetalhes.filter(p => p.lat && p.lng)
  const semCoords = paradasDetalhes.filter(p => !p.lat || !p.lng)
  if (comCoords.length < 2) return paradasDetalhes.map(p => p.key)

  let ordenados
  if (fixarInicio) {
    ordenados = nnOrdemDesde(comCoords, 0)
  } else if (comCoords.length <= 8) {
    let best = null
    let bestDist = Infinity
    for (let s = 0; s < comCoords.length; s++) {
      const cand = nnOrdemDesde(comCoords, s)
      const dist = distanciaTotalOrdem(comCoords, cand)
      if (dist < bestDist) { bestDist = dist; best = cand }
    }
    ordenados = best || nnOrdemDesde(comCoords, 0)
  } else {
    const start = comCoords.reduce((best, p, i) => {
      const score = (p.tipoParada === 'evento' ? -1000 : 0)
        + (p.horaPrevista ? -parseInt(String(p.horaPrevista).replace(':', ''), 10) : 0)
      return !best || score < best.score ? { i, score } : best
    }, null)?.i ?? 0
    ordenados = nnOrdemDesde(comCoords, start)
  }

  const keysOrdenadas = ordenados.map(p => p.key)
  return [...keysOrdenadas, ...semCoords.map(p => p.key)]
}

export function calcularHorariosParadas(paradas, inicioHora = '08:00', tempoDeslocMin = 8) {
  const [h0, m0] = inicioHora.split(':').map(Number)
  let minutos = h0 * 60 + m0
  return paradas.map(p => {
    const hora = `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`
    minutos += (p.duracaoMin || 15) + tempoDeslocMin
    return { ...p, horaPrevista: p.horaPrevista || hora }
  })
}

export function eventosAgendaDoDia(dataStr) {
  try {
    const eventos = JSON.parse(localStorage.getItem('agenda_eventos') || '[]')
    return eventos.filter(ev => {
      const df = ev.dataFim || ev.dataInicio
      return ev.dataInicio <= dataStr && df >= dataStr
    })
  } catch {
    return []
  }
}

export function loadMateriaisEstoque() {
  try {
    return JSON.parse(localStorage.getItem('materiais_estoque') || '[]')
  } catch {
    return []
  }
}

export function materiaisComSaldo() {
  const itens = loadMateriaisEstoque()
  let dists = []
  try { dists = JSON.parse(localStorage.getItem('materiais_distribuicao') || '[]') } catch { /* */ }
  let retiradas = []
  try { retiradas = JSON.parse(localStorage.getItem('materiais_retiradas') || '[]') } catch { /* */ }
  return itens.map(item => {
    const distribuido = dists.filter(d => d.itemId === item.id).reduce((s, d) => s + (Number(d.quantidade) || 0), 0)
    const reservado = retiradas
      .filter(r => r.status === 'pendente')
      .reduce((s, r) => s + (r.itens || [])
        .filter(it => it.itemId === item.id)
        .reduce((ss, it) => ss + (Number(it.quantidade) || 0), 0), 0)
    return { ...item, restante: Math.max(0, (Number(item.quantidade) || 0) - distribuido - reservado), reservado, distribuido }
  }).filter(i => i.restante > 0)
}

export function registrarEntregaMaterial(material, responsavel = '') {
  if (!material?.itemId || !material.quantidade) return
  let dists = []
  try { dists = JSON.parse(localStorage.getItem('materiais_distribuicao') || '[]') } catch { /* */ }
  let itens = []
  try { itens = JSON.parse(localStorage.getItem('materiais_estoque') || '[]') } catch { /* */ }
  const item = itens.find(i => i.id === material.itemId)
  dists.push({
    id: gerarId(),
    itemId: material.itemId,
    itemNome: item?.nome || material.nome || '',
    quantidade: material.quantidade,
    bairro: material.bairro || '',
    evento: material.rotaNome || material.evento || '',
    responsavel: responsavel || material.responsavel || '',
    data: new Date().toISOString(),
  })
  writeStorage('materiais_distribuicao', dists)
}

export {
  normalizarVisitantes,
  labelVisitantes,
  normalizarRegistroVisita,
  isIgrejaVisitada,
} from './igrejasVisitasCore'

export {
  loadMapaVisitasIgrejas,
  marcarIgrejaVisitada,
  desmarcarIgrejaVisitada,
  removerEntradaHistoricoVisita,
  sanitizarVisitasIgrejasSalvas,
  migrarVisitasStorageSePreciso,
  compactarVisitasStorageSeDivergir,
  limparTodasVisitasIgrejas,
} from './igrejasVisitas'

/** Vizinhos por distância a partir de uma igreja âncora. */
export function vizinhosDaIgreja(origem, candidatas = [], { maxKm = 3 } = {}) {
  if (!origem || !Number(origem.lat) || !Number(origem.lng)) return []
  return (candidatas || [])
    .filter(ig => ig && String(ig.id) !== String(origem.id) && Number(ig.lat) && Number(ig.lng))
    .map(ig => ({ igreja: ig, km: haversineKm(origem, ig) }))
    .filter(v => Number.isFinite(v.km) && v.km <= maxKm)
    .sort((a, b) => a.km - b.km)
}

export function resumoCargaRota(paradas) {
  const entregas = paradas.filter(p => p.material?.quantidade)
  const porItem = {}
  entregas.forEach(p => {
    const id = p.material.itemId
    if (!porItem[id]) porItem[id] = { nome: p.material.nome, quantidade: 0 }
    porItem[id].quantidade += p.material.quantidade
  })
  return Object.values(porItem)
}

/**
 * Ponto para URL do Maps — endereço cadastrado tem prioridade sobre GPS do mapa.
 */
export function enderecoNavParada(p) {
  return enderecoMapsParada(p)
}

function enderecoMapsParada(p) {
  const fmt = formatEnderecoParada(p)
  if (fmt) return fmt
  const curto = String(p?.enderecoCurto || '').trim()
  if (enderecoTextoUtil(curto)) return curto
  return enderecoTextoUtil(p?.endereco) ? String(p.endereco).trim() : ''
}

/** Parada pode ir para Google Maps / Waze / OSRM (endereço ou coords). */
export function paradaTemDestinoRota(p) {
  if (!p || isParadaEquipe(p)) return false
  if (enderecoMapsParada(p)) return true
  return coordValida(p.lat, p.lng)
}

const _coordsRotaCache = new Map()

/** GPS para traçar rota — geocodifica o endereço da ficha, não o pin do mapa. */
export async function coordsRotaParada(p) {
  if (!p) return null
  const endNav = enderecoMapsParada(p)
  const usarEndereco = Boolean(p.navPorEndereco || (p.tipo === 'igreja' && endNav))

  if (usarEndereco && endNav) {
    const ck = `end:${endNav}`
    if (_coordsRotaCache.has(ck)) return _coordsRotaCache.get(ck)
    const { geocodeEndereco, sleep } = await import('./geocode')
    const g = await geocodeEndereco(endNav)
    if (g) {
      _coordsRotaCache.set(ck, { lat: g.lat, lng: g.lng, fonte: 'endereco' })
      return _coordsRotaCache.get(ck)
    }
    await sleep(400)
  }

  if (coordValida(p.lat, p.lng) && !usarEndereco) {
    return { lat: Number(p.lat), lng: Number(p.lng), fonte: 'gps' }
  }

  if (endNav && !usarEndereco) {
    const ck = `end:${endNav}`
    if (_coordsRotaCache.has(ck)) return _coordsRotaCache.get(ck)
    const { geocodeEndereco, sleep } = await import('./geocode')
    const g = await geocodeEndereco(endNav)
    if (g) {
      _coordsRotaCache.set(ck, { lat: g.lat, lng: g.lng, fonte: 'endereco' })
      return _coordsRotaCache.get(ck)
    }
    await sleep(400)
  }

  return null
}

/** Waypoints OSRM na ordem das paradas — coords derivadas do endereço cadastrado. */
export async function resolverCoordsRotaParadas(paradas = [], { concurrency = 4 } = {}) {
  const filtradas = (paradas || []).filter(p => p && !isParadaEquipe(p))
  if (!filtradas.length) return []
  const out = new Array(filtradas.length).fill(null)
  let cursor = 0
  async function worker() {
    while (cursor < filtradas.length) {
      const i = cursor++
      const c = await coordsRotaParada(filtradas[i])
      if (c) out[i] = { key: filtradas[i].key, lat: c.lat, lng: c.lng, fonte: c.fonte }
    }
  }
  const n = Math.min(Math.max(1, concurrency), filtradas.length)
  await Promise.all(Array.from({ length: n }, () => worker()))
  return out.filter(Boolean)
}

function pontoMapsUrl(p) {
  const end = enderecoMapsParada(p)
  if (end) return encodeURIComponent(end)
  if (p?.navPorEndereco) return ''
  const lat = Number(p?.lat)
  const lng = Number(p?.lng)
  if (coordValida(lat, lng)) return `${lat},${lng}`
  return ''
}

function paradaTemDestinoMaps(p) {
  return paradaTemDestinoRota(p)
}

/**
 * Link Google Maps para a sequência de paradas.
 * @param {object[]} paradas
 * @param {{ origemAtual?: boolean }} opts — se true, origem = Current+Location
 *   (cada pessoa que abre usa o GPS dela). Ideal ao enviar para a equipe.
 */
export function linkGoogleMaps(paradas, { origemAtual = false } = {}) {
  const lista = (paradas || []).filter(p => !isParadaEquipe(p))
  const pts = lista.filter(paradaTemDestinoMaps)
  if (!pts.length) return ''

  const partes = pts.map(pontoMapsUrl).filter(Boolean)
  if (!partes.length) return ''

  // Sem origin: no celular o Maps usa a localização atual do aparelho.
  if (origemAtual) {
    if (partes.length === 1) {
      return `https://www.google.com/maps/dir/?api=1&destination=${partes[0]}&travelmode=driving`
    }
    const destination = partes[partes.length - 1]
    const waypoints = partes.slice(0, -1).join('|')
    return `https://www.google.com/maps/dir/?api=1&destination=${destination}&waypoints=${waypoints}&travelmode=driving`
  }

  const comGps = pts.filter(p => coordValida(p.lat, p.lng))
  if (!comGps.length) {
    return `https://www.google.com/maps/dir/?api=1&destination=${partes[0]}&travelmode=driving`
  }
  if (comGps.length === 1) {
    return `https://www.google.com/maps/dir/?api=1&destination=${pontoMapsUrl(comGps[0])}&travelmode=driving`
  }

  const fmt = p => pontoMapsUrl(p)
  const origin = fmt(comGps[0])
  const destination = fmt(comGps[comGps.length - 1])
  const meio = comGps.slice(1, -1)
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`
  if (meio.length) url += `&waypoints=${meio.map(fmt).join('%7C')}`
  return url
}

/** Atalho: rota partindo da localização atual de quem abre o link. */
export function linkGoogleMapsDaLocalizacao(paradas) {
  return linkGoogleMaps(paradas, { origemAtual: true })
}

export function linkWaze(parada) {
  if (!parada) return ''
  const end = enderecoMapsParada(parada)
  if (end) {
    return `https://waze.com/ul?q=${encodeURIComponent(end)}&navigate=yes`
  }
  if (coordValida(parada.lat, parada.lng)) {
    return `https://waze.com/ul?ll=${parada.lat},${parada.lng}&navigate=yes`
  }
  return ''
}

export function linkGoogleMapsEndereco(endereco) {
  const q = String(endereco || '').trim()
  if (!q) return ''
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

/** Street View síncrono — fallback (coords do pin só se não houver endereço). */
export function streetViewUrlParada(p) {
  const end = enderecoMapsParada(p)
  if (end) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(end)}`
  }
  const lat = Number(p?.lat)
  const lng = Number(p?.lng)
  if (coordValida(lat, lng)) {
    return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`
  }
  return ''
}

export function streetViewUrlIgreja(ig) {
  if (!ig) return ''
  return streetViewUrlParada(igrejaParaParada(ig))
}

/** Street View — geocodifica o endereço da ficha (não usa pin do mapa). */
export async function streetViewUrlIgrejaAsync(ig) {
  if (!ig) return ''
  const p = igrejaParaParada(ig)
  const end = enderecoMapsParada(p)
  if (end) {
    const { geocodeEndereco } = await import('./geocode')
    const g = await geocodeEndereco(end)
    if (g?.lat != null && g?.lng != null) {
      return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${g.lat},${g.lng}`
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(end)}`
  }
  return streetViewUrlParada(p)
}

export function linkWazeEndereco(endereco) {
  const q = String(endereco || '').trim()
  if (!q) return ''
  return linkWaze({ endereco: q })
}

export function linkWazeLista(paradas) {
  return (paradas || []).filter(paradaTemDestinoRota).map((p, i) => ({
    idx: i + 1,
    nome: p.nome,
    url: linkWaze(p),
  })).filter(x => x.url)
}

export function telefoneWhatsApp(tel) {
  const digits = String(tel || '').replace(/\D/g, '')
  if (!digits) return ''
  const n = digits.startsWith('55') ? digits : `55${digits}`
  return n
}

function normNomeMembro(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

/** Acha o cadastro da equipe a partir do share/execução da rota. */
export function resolverMembroRota(membros = [], { membroId, membroNome } = {}) {
  const lista = Array.isArray(membros) ? membros : []
  if (membroId) {
    const byId = lista.find(m => String(m.id) === String(membroId))
    if (byId) return byId
  }
  const alvo = normNomeMembro(membroNome)
  if (!alvo) return null
  const exact = lista.find(m => normNomeMembro(m.nome) === alvo)
  if (exact) return exact
  const primeiro = alvo.split(/\s+/)[0]
  return lista.find(m => normNomeMembro(m.nome).startsWith(primeiro)) || null
}

export function mensagemRota(paradas, mapsUrl, rotaNome, equipeNomes = [], { wazeUrl, data, liveUrl } = {}) {
  const locs = (paradas || []).filter(p => !isParadaEquipe(p))
  const linhas = locs.map((p, i) => {
    const local = p.endereco || p.setor || 'Local não informado'
    const tipo = labelTipoParada(p.tipoParada || 'visita')
    const mat = p.material ? ` 📦 ${p.material.quantidade}x ${p.material.nome}` : ''
    const cultoTxt = p.culto ? cultoParaData(p.culto, data) : ''
    const horaCulto = !p.horaPrevista && p.culto ? horaInicioCultoNaData(p.culto, data) : ''
    const hora = p.horaPrevista
      ? ` (${p.horaPrevista})`
      : (horaCulto ? ` (culto ${horaCulto})` : '')
    const cultoLinha = cultoTxt ? `\n   ⛪ Culto: ${cultoTxt}` : ''
    return `${i + 1}. [${tipo}] ${p.nome}${hora}${mat} — ${local}${cultoLinha}`
  })
  let msg = `🗺️ *${rotaNome || 'Rota da campanha'}* (${locs.length} parada${locs.length !== 1 ? 's' : ''})`
  if (data) {
    const [y, m, d] = String(data).slice(0, 10).split('-')
    if (y && m && d) msg += `\n📅 ${d}/${m}/${y}`
  }
  msg += '\n\n'
  if (equipeNomes?.length) {
    msg += `👥 Equipe: ${equipeNomes.join(', ')}\n\n`
  }
  if (liveUrl) {
    msg += `🔴 *AO VIVO — abra este link* (é o que aparece no mapa da campanha):\n${liveUrl}\n`
    msg += `Permita a *localização* quando o site pedir. O Google Maps sozinho *não* envia sua posição.\n\n`
  }
  msg += linhas.join('\n')
  if (!liveUrl) {
    msg += '\n\n🚗 Sai do *local onde você estiver*.'
    if (mapsUrl) msg += `\n\n📍 Google Maps:\n${mapsUrl}`
    if (wazeUrl) msg += `\n\n🧭 Waze (1ª parada):\n${wazeUrl}`
  }
  return msg
}

export function linkWhatsApp(telefone, texto) {
  const n = telefoneWhatsApp(telefone)
  if (!n) return ''
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`
}

export { BAIRROS_BLUMENAU, CARGO_CORES }
