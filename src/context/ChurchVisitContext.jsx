import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import {
  invalidateIgrejasCatalogCache,
  reloadIgrejasHidratadasAsync,
  loadIgrejasHidratadas,
  IGREJAS_ATUALIZADAS_EVENT,
} from '../utils/igrejasCatalog'
import { marcarIgrejaVisitada, desmarcarIgrejaVisitada, podarVisitasForaCadastroManual, sanitizarHistoricosVisitasArmazenadas } from '../utils/igrejasVisitas'
import { normalizarRegistroVisita } from '../utils/igrejasVisitasCore'
import { flushAfterSave } from '../utils/persist'
import {
  SYNC_EVENT, SYNC_STORAGE_EVENT, syncIgrejasVisitasFromServer, ensureChurchCatalogSynced,
} from '../lib/cloudSync'
import { deferHeavyUiWork, shouldDeferSyncUi, markUiQuiet, markSyncPaused } from '../utils/syncUiGate'
import { filterChurches } from '../utils/churchVisitFilters'
import {
  churchToEditForm,
  saveChurchFromForm,
  addChurchFromForm,
  geocodeAndSaveChurch,
  geocodificarIgrejasSemPin,
  setChurchNota,
  setChurchPrioridade,
  removeChurchFromCatalog,
  clearAllVisits,
  clearAllChurches,
  removeVisitHistoryEntry,
  mergeChurchFromForm,
  purgarIgrejasForaCidadesCampanha,
  aplicarDeparaDuplicatasIgrejasCadastro,
  listarDuplicatasIgrejasCadastro,
  purificarCadastroAdbluOficial,
} from '../utils/churchVisitMutations'
import { CIDADES_IGREJAS_MAPA } from '../utils/igrejasFonte'
import { separarIgrejasPorCidadeCampanha } from '../utils/igrejaCidade'
import { readIgrejasCustom } from '../utils/igrejasCatalog'
import { TOTAL_LISTA_ADBLU } from '../data/igrejasListaAdblu'

const ChurchVisitContext = createContext(null)

const CHURCH_STORAGE_KEYS = new Set([
  'igrejas_custom', 'igrejas_enrich', 'geo_coords_igrejas',
  'igrejas_overrides', 'igrejas_visitas', 'pastores_igrejas', 'igrejas_ocultas',
])

function isChurchStorageKey(key) {
  return key != null && CHURCH_STORAGE_KEYS.has(String(key))
}

/** Decide se um SYNC_EVENT/SYNC_STORAGE deve recarregar igrejas e com qual intensidade. */
function churchReloadMode(e, hot) {
  const d = e?.detail || {}
  if (d.materiaisPartial) return null
  if (d.igrejasCadastroLimpo) return 'full'
  if (d.igrejasVisitasPartial) return hot ? 'visitas' : null
  if (d.approvedKey) return isChurchStorageKey(d.approvedKey) ? (hot ? 'full' : 'visitas') : null
  if (e?.type === SYNC_STORAGE_EVENT) {
    if (!d.external) return null
    return isChurchStorageKey(d.key) ? (hot ? 'light' : null) : null
  }
  if (d.fromServer && d.forceReload) return hot ? 'light' : null
  if (d.syncNow) return null
  return hot ? 'light' : null
}

function normNomeIgreja(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function labelUsuarioCurto(email = '') {
  const e = String(email || '').trim()
  if (!e) return ''
  return (e.split('@')[0] || e).replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function aplicarVisitaNaIgreja(ig, reg) {
  const visita = normalizarRegistroVisita(reg)
  return {
    ...ig,
    visitado: Boolean(visita?.visitado),
    visita: visita || null,
  }
}

export function ChurchVisitProvider({ children, userEmail = '', active = true, hot = false }) {
  const [churches, setChurches] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const loadGen = useRef(0)
  const prevHot = useRef(false)
  const userName = useMemo(() => labelUsuarioCurto(userEmail), [userEmail])

  const refresh = useCallback(async ({ silent = false } = {}) => {
    const gen = ++loadGen.current
    if (!silent) setLoading(true)
    setLoadError('')
    try {
      invalidateIgrejasCatalogCache()
      const list = await reloadIgrejasHidratadasAsync()
      if (gen !== loadGen.current) return
      setChurches(Array.isArray(list) ? list : [])
    } catch {
      if (gen === loadGen.current) setLoadError('Não foi possível carregar as igrejas.')
    } finally {
      if (gen === loadGen.current) setLoading(false)
    }
  }, [])

  // Ao entrar em aba que usa igrejas (mapa/rotas/mapa eleitoral/campo), cache local primeiro; sync em background.
  useEffect(() => {
    if (!active || !hot) return undefined
    if (!prevHot.current) {
      try {
        invalidateIgrejasCatalogCache()
        const cached = loadIgrejasHidratadas()
        if (Array.isArray(cached) && cached.length) {
          setChurches(cached)
          setLoading(false)
        }
      } catch { /* ignore */ }

      refresh({ silent: true })

      const runBgBoot = async () => {
        await syncIgrejasVisitasFromServer().catch(() => {})
        await ensureChurchCatalogSynced({ force: false }).catch(() => {})
        podarVisitasForaCadastroManual({ write: true })
        sanitizarHistoricosVisitasArmazenadas({ write: true })
        await flushAfterSave().catch(() => {})
        await refresh({ silent: true })
        const n = readIgrejasCustom().length
        if (n > TOTAL_LISTA_ADBLU + 15) {
          try {
            await purificarCadastroAdbluOficial({ force: true })
            await refresh({ silent: true })
          } catch { /* ignore */ }
        }
      }

      const idle = typeof requestIdleCallback === 'function'
        ? (cb) => requestIdleCallback(cb, { timeout: 8000 })
        : (cb) => setTimeout(cb, 400)
      if (shouldDeferSyncUi()) {
        deferHeavyUiWork(() => { idle(() => { runBgBoot() }) }, { minDelay: 400 })
      } else {
        idle(() => { runBgBoot() })
      }
    }
    prevHot.current = hot
    return undefined
  }, [active, hot, refresh])

  useEffect(() => {
    if (!active || !hot) return undefined
    let cancelled = false
    let refreshTimer = null

    const runReload = (mode) => {
      const exec = async () => {
        if (cancelled) return
        try {
          if (mode === 'full') {
            await syncIgrejasVisitasFromServer().catch(() => {})
            const recentCadastro = typeof window !== 'undefined'
              && (Date.now() - (window.__campanhaUltimoCadastroIgreja || 0) < 120_000)
            if (!recentCadastro) {
              await ensureChurchCatalogSynced({ force: false }).catch(() => {})
            }
          } else if (mode === 'visitas') {
            await syncIgrejasVisitasFromServer().catch(() => {})
          }
          if (hot) await refresh()
        } catch { /* ignore */ }
      }
      if (shouldDeferSyncUi()) {
        deferHeavyUiWork(() => { exec() }, { minDelay: 900 })
        return
      }
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(exec, mode === 'full' ? 80 : 450)
    }

    const onEvent = (e) => {
      if (e?.type === SYNC_STORAGE_EVENT && !e?.detail?.external) return
      if (e?.detail?.syncNow) return
      if (typeof window !== 'undefined' && window.__campanhaGeocodificacaoAtiva) return

      if (e?.type === IGREJAS_ATUALIZADAS_EVENT) {
        if (e?.detail?.localEdit) return
        if (hot) runReload('light')
        return
      }

      const mode = churchReloadMode(e, hot)
      if (!mode) return
      runReload(mode)
    }

    window.addEventListener(SYNC_EVENT, onEvent)
    window.addEventListener(SYNC_STORAGE_EVENT, onEvent)
    window.addEventListener(IGREJAS_ATUALIZADAS_EVENT, onEvent)
    return () => {
      cancelled = true
      clearTimeout(refreshTimer)
      window.removeEventListener(SYNC_EVENT, onEvent)
      window.removeEventListener(SYNC_STORAGE_EVENT, onEvent)
      window.removeEventListener(IGREJAS_ATUALIZADAS_EVENT, onEvent)
    }
  }, [active, hot, refresh])

  useEffect(() => {
    if (active && !hot) {
      setLoading(false)
      prevHot.current = false
    }
  }, [active, hot])

  const patchChurch = useCallback((id, fn) => {
    setChurches(prev => prev.map(ig => (String(ig.id) === String(id) ? fn(ig) : ig)))
  }, [])

  const markVisited = useCallback(async (id, meta = {}) => {
    const reg = marcarIgrejaVisitada(id, {
      ...meta,
      visitadoPorEmail: userEmail,
      visitadoPor: meta.visitadoPor || userName,
      visitantes: meta.visitantes?.length ? meta.visitantes : (userName ? [userName] : []),
    })
    if (!reg) return null
    patchChurch(id, ig => aplicarVisitaNaIgreja(ig, reg))
    invalidateIgrejasCatalogCache()
    flushAfterSave()
    return reg
  }, [userEmail, userName, patchChurch])

  const unmarkVisited = useCallback(async (id) => {
    const reg = desmarcarIgrejaVisitada(id)
    patchChurch(id, ig => aplicarVisitaNaIgreja(ig, reg))
    invalidateIgrejasCatalogCache()
    flushAfterSave()
    return reg
  }, [patchChurch])

  const saveChurch = useCallback(async (ig, form) => {
    markUiQuiet(5000)
    await saveChurchFromForm(ig, form)
    patchChurch(ig.id, church => mergeChurchFromForm(church, form))
  }, [patchChurch])

  const addChurch = useCallback(async (form) => {
    markUiQuiet(120_000)
    markSyncPaused(120_000)
    const nova = await addChurchFromForm(form)
    invalidateIgrejasCatalogCache()
    const list = await reloadIgrejasHidratadasAsync()
    const hidratada = list.find((c) => String(c.id) === String(nova.id))
      || list.find((c) => normNomeIgreja(c.nome) === normNomeIgreja(nova.nome)
        && normNomeIgreja(c.endereco) === normNomeIgreja(nova.endereco))
    const fallback = { ...nova, visitado: false, status: 'ok' }
    setChurches(hidratada ? list : [...list, fallback])
    return hidratada || fallback
  }, [])

  const geocodeChurch = useCallback(async (ig) => {
    markUiQuiet(5000)
    const coords = await geocodeAndSaveChurch(ig)
    patchChurch(ig.id, church => ({ ...church, lat: coords.lat, lng: coords.lng }))
    return coords
  }, [patchChurch])

  const geocodeAllMissing = useCallback(async (opts = {}) => {
    const list = churches.length ? churches : await reloadIgrejasHidratadasAsync().catch(() => [])
    const result = await geocodificarIgrejasSemPin(list, opts)
    await refresh()
    return result
  }, [churches, refresh])

  const setNota = useCallback(async (id, nota) => {
    setChurchNota(id, nota)
    await refresh()
  }, [refresh])

  const setPrioridade = useCallback(async (id, prioridade) => {
    setChurchPrioridade(id, prioridade)
    await refresh()
  }, [refresh])

  const removeChurch = useCallback(async (ig) => {
    markUiQuiet(5000)
    await removeChurchFromCatalog(ig)
    if (String(selectedId) === String(ig?.id)) setSelectedId(null)
    setChurches(prev => prev.filter(c => String(c.id) !== String(ig?.id)))
  }, [selectedId])

  const clearVisits = useCallback(async () => {
    await clearAllVisits()
    await refresh()
  }, [refresh])

  const clearChurches = useCallback(async () => {
    const result = await clearAllChurches()
    setSelectedId(null)
    await refresh()
    return result
  }, [refresh])

  const purgeOutsideCities = useCallback(async () => {
    const result = await purgarIgrejasForaCidadesCampanha()
    setSelectedId(null)
    await refresh()
    return result
  }, [refresh])

  const foraCidadesCount = useMemo(() => {
    const { fora } = separarIgrejasPorCidadeCampanha(readIgrejasCustom(), CIDADES_IGREJAS_MAPA)
    return fora.length
  }, [churches])

  const duplicatasCount = useMemo(() => {
    return listarDuplicatasIgrejasCadastro().duplicateCount
  }, [churches])

  const mergeDuplicates = useCallback(async () => {
    const result = await aplicarDeparaDuplicatasIgrejasCadastro()
    setSelectedId(null)
    await refresh()
    return result
  }, [refresh])

  const purifyAdbluCatalog = useCallback(async (opts) => {
    const result = await purificarCadastroAdbluOficial(opts)
    setSelectedId(null)
    await refresh()
    return result
  }, [refresh])

  const removeHistoryEntry = useCallback(async (churchId, entryId) => {
    const reg = removeVisitHistoryEntry(churchId, entryId)
    if (reg) patchChurch(churchId, ig => aplicarVisitaNaIgreja(ig, reg))
    await refresh()
    return reg
  }, [patchChurch, refresh])

  const stats = useMemo(() => {
    const total = churches.length
    const visitadas = churches.filter(c => c.visitado).length
    return { total, visitadas, pendentes: Math.max(0, total - visitadas) }
  }, [churches])

  const selected = useMemo(
    () => churches.find(c => String(c.id) === String(selectedId)) || null,
    [churches, selectedId],
  )

  const value = useMemo(() => ({
    churches,
    loading,
    loadError,
    selected,
    selectedId,
    setSelectedId,
    refresh,
    markVisited,
    unmarkVisited,
    saveChurch,
    addChurch,
    geocodeChurch,
    geocodeAllMissing,
    setNota,
    setPrioridade,
    removeChurch,
    clearVisits,
    clearChurches,
    purgeOutsideCities,
    foraCidadesCount,
    duplicatasCount,
    mergeDuplicates,
    purifyAdbluCatalog,
    cidadesIgrejasMapa: CIDADES_IGREJAS_MAPA,
    removeHistoryEntry,
    churchToEditForm,
    stats,
    userEmail,
    userName,
  }), [
    churches, loading, loadError, selected, selectedId,
    refresh, markVisited, unmarkVisited,
    saveChurch, addChurch, geocodeChurch, geocodeAllMissing, setNota, setPrioridade,
    removeChurch, clearVisits, clearChurches, purgeOutsideCities, foraCidadesCount,
    duplicatasCount, mergeDuplicates, purifyAdbluCatalog,
    removeHistoryEntry,
    stats, userEmail, userName,
  ])

  return (
    <ChurchVisitContext.Provider value={value}>
      {children}
    </ChurchVisitContext.Provider>
  )
}

export function useChurchVisit() {
  const ctx = useContext(ChurchVisitContext)
  if (!ctx) throw new Error('useChurchVisit deve ser usado dentro de ChurchVisitProvider')
  return ctx
}

export function useFilteredChurches(filters = {}) {
  const { churches } = useChurchVisit()
  return useMemo(() => filterChurches(churches, filters), [churches, filters])
}
