import { useCallback, useMemo, useState } from 'react'
import {
  BLUMENAU_GEO_LAYERS,
  defaultGeoLayersForScreen,
  resolveActiveTileLayers,
  layersByCategory,
} from '../utils/blumenauGeoCatalog'

const STORAGE_KEY = 'blumenau_geo_layers_v1'

function loadActive(screen) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultGeoLayersForScreen(screen)
    const pack = JSON.parse(raw)
    const saved = pack?.[screen]
    if (!saved || typeof saved !== 'object') return defaultGeoLayersForScreen(screen)
    const base = defaultGeoLayersForScreen(screen)
    return { ...base, ...saved }
  } catch {
    return defaultGeoLayersForScreen(screen)
  }
}

function saveActive(screen, active) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const pack = raw ? JSON.parse(raw) : {}
    pack[screen] = active
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pack))
  } catch { /* ignore quota */ }
}

/** Estado + persistência das camadas raster GEO Blumenau por tela do app. */
export function useBlumenauGeoLayers(screen) {
  const [active, setActiveState] = useState(() => loadActive(screen))

  const setActive = useCallback((next) => {
    setActiveState(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next
      saveActive(screen, resolved)
      return resolved
    })
  }, [screen])

  const toggle = useCallback((id) => {
    setActive(prev => ({ ...prev, [id]: !prev[id] }))
  }, [setActive])

  const resetDefaults = useCallback(() => {
    setActive(defaultGeoLayersForScreen(screen))
  }, [screen, setActive])

  const tileLayers = useMemo(() => resolveActiveTileLayers(active), [active])
  const grouped = useMemo(() => layersByCategory(), [])
  const activeCount = useMemo(
    () => BLUMENAU_GEO_LAYERS.filter(l => active[l.id]).length,
    [active],
  )

  return {
    active,
    toggle,
    setActive,
    resetDefaults,
    tileLayers,
    grouped,
    activeCount,
    catalog: BLUMENAU_GEO_LAYERS,
  }
}
