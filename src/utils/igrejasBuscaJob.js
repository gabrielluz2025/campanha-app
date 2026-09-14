/**
 * Busca Google de igrejas fora do React — continua com o painel fechado
 * e sobrevive a remount. Fechar a aba do navegador encerra (Places precisa da página).
 */
import {
  buscarIgrejasGoogle,
  imputarHitsGoogle,
  lerEstadoIgrejas,
  getCatalogoIgrejasMemoria,
} from './igrejasGooglePlaces'
import { pushChurchCatalogToServer } from '../lib/cloudSync'

export const BUSCA_IGREJAS_JOB_EVENT = 'campanha-igrejas-busca-job'

const state = {
  running: false,
  cancelar: false,
  modo: null,
  cidade: 'Blumenau',
  bairroAtual: '',
  index: 0,
  total: 0,
  novas: 0,
  enriquecidas: 0,
  totalSistema: 0,
  progressoMsg: '',
  resumoLote: '',
  erro: '',
  hits: null,
  lastResult: null,
}

function marcarJanela() {
  if (typeof window === 'undefined') return
  window.__campanhaBuscaIgrejasAtiva = state.running
}

function emit(extra = {}) {
  marcarJanela()
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(BUSCA_IGREJAS_JOB_EVENT, {
    detail: { ...getBuscaIgrejasJob(), ...extra },
  }))
}

export function getBuscaIgrejasJob() {
  return { ...state, hits: state.hits }
}

export function buscaIgrejasEmAndamento() {
  return Boolean(state.running)
}

export function pararBuscaIgrejasJob() {
  state.cancelar = true
}

export function subscribeBuscaIgrejasJob(fn) {
  if (typeof window === 'undefined') return () => {}
  const on = (e) => fn(e.detail || getBuscaIgrejasJob())
  window.addEventListener(BUSCA_IGREJAS_JOB_EVENT, on)
  fn(getBuscaIgrejasJob())
  return () => window.removeEventListener(BUSCA_IGREJAS_JOB_EVENT, on)
}

async function imputarEAvisar(hits, { maxIdExternas }) {
  const auto = await imputarHitsGoogle(hits, {
    catalogProp: [],
    maxIdExternas,
    atualizarMudancas: false,
    soNovasEComplementar: true,
  })
  state.hits = auto.hits || hits
  state.lastResult = auto
  state.totalSistema = auto.total || state.totalSistema
  emit({ imputado: true, lastResult: auto })
  return auto
}

export async function rodarBuscaIgrejasJob({
  cidade,
  bairros = [],
  force = false,
  auditarCadastro = true,
  incluirNovas = true,
  catalogProp = [],
  maxIdExternas = 1999,
}) {
  if (state.running) return getBuscaIgrejasJob()
  const soBairro = bairros.length === 1
  state.running = true
  state.cancelar = false
  state.modo = soBairro ? 'bairro' : 'busca'
  state.cidade = cidade
  state.bairroAtual = soBairro ? bairros[0] : ''
  state.index = 0
  state.total = 1
  state.erro = ''
  state.progressoMsg = soBairro ? `Buscando ${bairros[0]}…` : 'Buscando igrejas…'
  state.resumoLote = ''
  emit()
  try {
    const { catalog, enrich } = lerEstadoIgrejas()
    const result = await buscarIgrejasGoogle({
      catalog,
      enrich,
      cidade,
      bairros,
      forceRefresh: force || soBairro,
      auditarCadastro: auditarCadastro && !soBairro,
      soBairro,
      onProgress: (msg) => {
        state.progressoMsg = msg
        emit()
      },
    })
    if (state.cancelar) return getBuscaIgrejasJob()
    state.hits = result.hits
    emit()
    if (incluirNovas) {
      state.progressoMsg = 'Gravando igrejas no site…'
      emit()
      const auto = await imputarEAvisar(result.hits, { maxIdExternas })
      state.novas += auto.novas || 0
      state.enriquecidas += auto.enriquecidas || 0
      state.resumoLote = auto.novas || auto.enriquecidas
        ? `No site: ${auto.novas || 0} nova(s)`
          + (auto.enriquecidas ? `, ${auto.enriquecidas} atualizada(s)` : '')
          + (auto.totalSite != null ? ` · total no site ${auto.totalSite}` : ` · total ${auto.total ?? '—'}`)
        : `Nada novo neste bairro · total no site ${auto.totalSite ?? auto.total ?? '—'}`
      if (!auto.nuvemOk) state.erro = auto.nuvemErro || 'Não gravou no site neste bairro.'
      else state.erro = ''
    }
    state.progressoMsg = ''
  } catch (e) {
    state.erro = e?.message || 'Falha na busca Google.'
  } finally {
    state.running = false
    marcarJanela()
    maybeReloadAposBusca()
    emit()
  }
  return getBuscaIgrejasJob()
}

export async function rodarTodosBairrosJob({
  cidade,
  bairros = [],
  catalogProp = [],
  maxIdExternas = 1999,
}) {
  if (state.running) return getBuscaIgrejasJob()
  const lista = (bairros || []).filter(Boolean)
  if (!lista.length) {
    state.erro = 'Não achei a lista de bairros desta cidade.'
    emit()
    return getBuscaIgrejasJob()
  }
  state.running = true
  state.cancelar = false
  state.modo = 'todos'
  state.cidade = cidade
  state.novas = 0
  state.enriquecidas = 0
  state.total = lista.length
  state.index = 0
  state.erro = ''
  state.resumoLote = `0/${lista.length} bairros`
  emit()
  try {
    let feitos = 0
    for (let i = 0; i < lista.length; i += 1) {
      if (state.cancelar) break
      const bairro = lista[i]
      state.index = i
      state.bairroAtual = bairro
      state.progressoMsg = `Bairro ${i + 1}/${lista.length}: ${bairro}`
      state.hits = null
      emit()
      const { catalog, enrich } = lerEstadoIgrejas()
      const result = await buscarIgrejasGoogle({
        catalog,
        enrich,
        cidade,
        bairros: [bairro],
        forceRefresh: true,
        auditarCadastro: false,
        soBairro: true,
        onProgress: (msg) => {
          state.progressoMsg = `Bairro ${i + 1}/${lista.length} · ${bairro} — ${msg}`
          emit()
        },
      })
      if (state.cancelar) break
      state.hits = result.hits
      state.progressoMsg = `Bairro ${i + 1}/${lista.length}: ${bairro} — gravando no site…`
      emit()
      try {
        const auto = await imputarEAvisar(result.hits, { maxIdExternas })
        state.novas += auto.novas || 0
        state.enriquecidas += auto.enriquecidas || 0
        feitos = i + 1
        const noSite = auto.totalSite ?? auto.total
        state.resumoLote = `Andamento ${feitos}/${lista.length} · novas ${state.novas} · atualizadas ${state.enriquecidas}`
          + (noSite != null ? ` · no site ${noSite}` : '')
        if (!auto.nuvemOk) state.erro = auto.nuvemErro || `Não gravou o bairro ${bairro} no site.`
        else state.erro = ''
      } catch (e) {
        feitos = i + 1
        state.erro = e?.message || `Não gravou o bairro ${bairro} no site.`
        state.resumoLote = `Andamento ${feitos}/${lista.length} · novas ${state.novas} · falhou em ${bairro}`
      }
      emit()
    }
    state.progressoMsg = 'Enviando o cadastro completo para o site…'
    emit()
    const cloud = await pushChurchCatalogToServer(getCatalogoIgrejasMemoria())
    const vivo = lerEstadoIgrejas()
    const parou = state.cancelar
    const nSite = cloud.ok ? (cloud.server ?? vivo.catalog.length) : vivo.catalog.length
    state.resumoLote = `${parou ? 'Parou no meio. ' : ''}Bairros: ${feitos}/${lista.length}. `
      + `Imputadas ${state.novas} igreja(s) nova(s)`
      + (state.enriquecidas ? `, ${state.enriquecidas} atualizada(s)` : '')
      + `. Total no site: ${nSite}.`
    if (!cloud.ok) {
      state.erro = cloud.error || 'As igrejas ficaram só neste navegador — não confirmaram no site.'
    } else if (!state.erro) {
      state.erro = ''
    }
    state.progressoMsg = ''
    state.totalSistema = nSite
  } catch (e) {
    state.erro = e?.message || 'A busca bairro a bairro falhou.'
  } finally {
    state.running = false
    state.cancelar = false
    marcarJanela()
    maybeReloadAposBusca()
    emit()
  }
  return getBuscaIgrejasJob()
}

function maybeReloadAposBusca() {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent('campanha:busca-igrejas-done'))
  } catch { /* ignore */ }
}
