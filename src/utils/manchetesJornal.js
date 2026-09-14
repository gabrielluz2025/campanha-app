/**
 * Manchetes de jornal + radar eleitoral (Pesquisa de Rua).
 * Storage: pesquisas_manchetes
 */

import { readStorage, writeStorage, readEleitoresData } from './persist'
import {
  sanitizarDadosEleitores,
  loadMetasCidade,
  getMetaCidade,
  cidadeFocoPadrao,
  zonaPertenceCidade,
} from './eleitoresHelpers'

export const MANCHETES_KEY = 'pesquisas_manchetes'

export const VEICULOS_SUGERIDOS = [
  'NSC Total',
  'A Notícia',
  'Jornal de Santa Catarina',
  'ND Mais',
  'G1 SC',
  'Folha de Blumenau',
  'O Município',
  'CBN',
  'Rádio Clube',
  'Outro',
]

export const TOMS = [
  { id: 'positiva', label: 'Positiva', cor: '#10b981' },
  { id: 'neutra', label: 'Neutra', cor: '#94a3b8' },
  { id: 'negativa', label: 'Negativa', cor: '#ef4444' },
  { id: 'mista', label: 'Mista', cor: '#f59e0b' },
]

export const ABRANGENCIAS = ['Blumenau', 'Vale do Itajaí', 'SC', 'Nacional', 'Outro']

export function uidManchete() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function mancheteVazia() {
  const hoje = new Date().toISOString().slice(0, 10)
  return {
    id: uidManchete(),
    titulo: '',
    veiculo: '',
    dataPublicacao: hoje,
    url: '',
    resumo: '',
    tom: 'neutra',
    temas: [],
    cidade: 'Blumenau',
    abrangencia: 'Blumenau',
    notaEquipe: '',
    foto: '',
    pesquisaExterna: null,
    snapshotInterno: null,
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  }
}

export function pesquisaExternaVazia() {
  return {
    instituto: '',
    dataPesquisa: '',
    amostra: '',
    margem: '',
    candidatos: [{ nome: '', pct: '' }],
  }
}

export function loadManchetes() {
  const lista = readStorage(MANCHETES_KEY, [])
  return Array.isArray(lista) ? lista : []
}

export function saveManchetes(lista) {
  writeStorage(MANCHETES_KEY, Array.isArray(lista) ? lista : [])
  return lista
}

export function ordenarPorData(lista = []) {
  return [...lista].sort((a, b) => {
    const da = String(a.dataPublicacao || a.criadoEm || '')
    const db = String(b.dataPublicacao || b.criadoEm || '')
    return db.localeCompare(da) || String(b.criadoEm || '').localeCompare(String(a.criadoEm || ''))
  })
}

export function filtrarManchetes(lista, { veiculo = '', tom = '', tema = '', q = '' } = {}) {
  const qq = String(q || '').trim().toLowerCase()
  const temaQ = String(tema || '').trim().toLowerCase()
  return ordenarPorData(lista).filter(m => {
    if (veiculo && String(m.veiculo || '') !== veiculo) return false
    if (tom && m.tom !== tom) return false
    if (temaQ) {
      const temas = (m.temas || []).map(t => String(t).toLowerCase())
      if (!temas.some(t => t.includes(temaQ))) return false
    }
    if (qq) {
      const blob = [
        m.titulo, m.veiculo, m.resumo, m.notaEquipe, m.cidade,
        ...(m.temas || []),
      ].join(' ').toLowerCase()
      if (!blob.includes(qq)) return false
    }
    return true
  })
}

export function tomMeta(tom) {
  return TOMS.find(t => t.id === tom) || TOMS[1]
}

export function fmtDataBR(iso) {
  if (!iso) return '—'
  const s = String(iso).slice(0, 10)
  const [y, m, d] = s.split('-')
  if (!y || !m || !d) return s
  return `${d}/${m}/${y}`
}

export function fmtN(v) {
  return Number(v || 0).toLocaleString('pt-BR')
}

/**
 * Congela o cenário eleitoral interno no momento da captura
 * (mesma lógica do relatório semanal / Dashboard).
 */
export function capturarSnapshotEleitoral() {
  const dadosEleitores = sanitizarDadosEleitores(readEleitoresData({}))
  const metasCidade = loadMetasCidade()
  const cidades = [...new Set(
    (dadosEleitores?.zonas || []).map(z => z.municipio || dadosEleitores.municipio).filter(Boolean),
  )]
  const cidadeFoco = cidadeFocoPadrao(dadosEleitores, cidades)
  const metaVotos = getMetaCidade(metasCidade, cidadeFoco)

  let totalVotos = 0
  let totalAptos = 0
  const topZonas = []

  if (dadosEleitores?.zonas) {
    dadosEleitores.zonas.forEach(z => {
      if (cidadeFoco && !zonaPertenceCidade(z, dadosEleitores, cidadeFoco)) return
      let zv = 0
      let za = 0
      ;(z.locais || []).forEach(l => (l.secoes || []).forEach(s => {
        zv += Number(s.votos) || 0
        za += Number(s.aptos || s.eleitores) || 0
      }))
      totalVotos += zv
      totalAptos += za
      topZonas.push({
        nome: z.nome || z.zona || `Zona ${z.numero || ''}`,
        votos: zv,
        aptos: za,
      })
    })
  }
  // votosTotal estadual não sobrescreve o total da cidade foco
  if (!cidadeFoco && Number(dadosEleitores?.votosTotal) > 0) {
    totalVotos = Number(dadosEleitores.votosTotal)
  }
  if (!cidadeFoco && !totalAptos && Number(dadosEleitores?.eleitoresAptos) > 0) {
    totalAptos = Number(dadosEleitores.eleitoresAptos)
  }
  topZonas.sort((a, b) => b.votos - a.votos)

  const pctMeta = metaVotos > 0 ? Math.round((totalVotos / metaVotos) * 1000) / 10 : 0
  const penetração = totalAptos > 0 ? Math.round((totalVotos / totalAptos) * 1000) / 10 : 0

  return {
    cidadeFoco: cidadeFoco || '',
    totalVotos,
    totalAptos,
    metaVotos: metaVotos || 0,
    pctMeta,
    penetração,
    topZonas: topZonas.slice(0, 8),
    capturadoEm: new Date().toISOString(),
  }
}

export function normalizarManchete(raw) {
  const base = mancheteVazia()
  if (!raw || typeof raw !== 'object') return base
  const temas = Array.isArray(raw.temas)
    ? raw.temas.map(t => String(t).trim()).filter(Boolean)
    : String(raw.temas || '').split(',').map(t => t.trim()).filter(Boolean)

  let pesquisaExterna = null
  if (raw.pesquisaExterna && typeof raw.pesquisaExterna === 'object') {
    const cands = Array.isArray(raw.pesquisaExterna.candidatos)
      ? raw.pesquisaExterna.candidatos
        .map(c => ({
          nome: String(c?.nome || '').trim(),
          pct: c?.pct === '' || c?.pct == null ? '' : Number(c.pct),
        }))
        .filter(c => c.nome || c.pct !== '')
      : []
    pesquisaExterna = {
      instituto: String(raw.pesquisaExterna.instituto || '').trim(),
      dataPesquisa: String(raw.pesquisaExterna.dataPesquisa || '').slice(0, 10),
      amostra: String(raw.pesquisaExterna.amostra || '').trim(),
      margem: String(raw.pesquisaExterna.margem || '').trim(),
      candidatos: cands.length ? cands : [{ nome: '', pct: '' }],
    }
    if (!pesquisaExterna.instituto && !cands.some(c => c.nome || c.pct !== '')) {
      pesquisaExterna = null
    }
  }

  return {
    ...base,
    ...raw,
    id: raw.id || base.id,
    titulo: String(raw.titulo || '').trim(),
    veiculo: String(raw.veiculo || '').trim(),
    dataPublicacao: String(raw.dataPublicacao || base.dataPublicacao).slice(0, 10),
    url: String(raw.url || '').trim(),
    resumo: String(raw.resumo || '').trim(),
    tom: TOMS.some(t => t.id === raw.tom) ? raw.tom : 'neutra',
    temas,
    cidade: String(raw.cidade || raw.abrangencia || 'Blumenau').trim(),
    abrangencia: String(raw.abrangencia || raw.cidade || 'Blumenau').trim(),
    notaEquipe: String(raw.notaEquipe || '').trim(),
    foto: String(raw.foto || '').trim(),
    pesquisaExterna,
    snapshotInterno: raw.snapshotInterno && typeof raw.snapshotInterno === 'object'
      ? raw.snapshotInterno
      : null,
    criadoEm: raw.criadoEm || base.criadoEm,
    atualizadoEm: new Date().toISOString(),
  }
}
