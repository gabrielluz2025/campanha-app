import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Popup, Marker, GeoJSON, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { BLUMENAU } from '../constants/igrejasTheme'
import { leafletBasemapConfig } from '../config/mapTiles'
import { coordValida } from '../utils/rotaUtils'
import { STATUS_PARADA } from '../utils/rotasDiarias'
import { fetchOsrmDrivingGeometry } from '../utils/osrmRoute'
import {
  igrejaPassaFiltroSetor,
  paradaPassaFiltroStatus,
} from '../utils/campoTorreFiltros'
import { churchToEditForm, persistCoordsGeocodeForm } from '../utils/churchVisitMutations'
import CampoMapPopup from './CampoMapPopup'
import 'leaflet/dist/leaflet.css'

const BASEMAP = leafletBasemapConfig()
const MAX_IGREJAS_MAPA = 600

const CORES = {
  [STATUS_PARADA.CONCLUIDO]: '#22c55e',
  [STATUS_PARADA.EM_TRANSITO]: '#eab308',
  [STATUS_PARADA.PENDENTE]: '#3b82f6',
}

const CHECK_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><path d="M5 13l4 4L19 7"/></svg>`

function globalPinIcon(dimmed) {
  return L.divIcon({
    className: 'campo-pin-global-wrap',
    html: `<div class="campo-pin-global${dimmed ? ' is-dim' : ''}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

function routePinIcon(status, label) {
  const bg = CORES[status] || CORES[STATUS_PARADA.PENDENTE]
  const pulse = status === STATUS_PARADA.EM_TRANSITO ? '<span class="campo-pin-pulse-ring"></span>' : ''
  const inner = status === STATUS_PARADA.CONCLUIDO ? CHECK_SVG : String(label || '')
  const size = status === STATUS_PARADA.EM_TRANSITO ? 34 : 30
  return L.divIcon({
    className: 'campo-pin-route-wrap',
    html: `<div class="campo-pin-route" style="width:${size}px;height:${size}px;background:${bg}">${pulse}${inner}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function FitRota({ points, fitKey, allChurches = [] }) {
  const map = useMap()
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        map.invalidateSize()
      } catch { /* ignore */ }
      const routePts = (points || []).filter(p => coordValida(p.lat, p.lng))
      const extra = (allChurches || []).slice(0, 80).filter(ig =>
        coordValida(Number(ig.lat), Number(ig.lng)),
      )
      const latlngs = routePts.length
        ? routePts.map(p => [p.lat, p.lng])
        : extra.map(ig => [Number(ig.lat), Number(ig.lng)])
      if (!latlngs.length) {
        map.setView(BLUMENAU, 12)
        return
      }
      if (latlngs.length === 1) {
        map.setView(latlngs[0], 14)
        return
      }
      const bounds = L.latLngBounds(latlngs)
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: routePts.length ? 15 : 13 })
    }, 80)
    return () => clearTimeout(timer)
  }, [map, points, fitKey, allChurches])
  return null
}

const ROTA_PATH = { color: '#6366f1', weight: 4, opacity: 0.88 }

function OsrmRouteLayer({ points, muted = false }) {
  const [geometry, setGeometry] = useState(null)
  const [usarFallbackLinhaReta, setUsarFallbackLinhaReta] = useState(false)
  const pointsKey = useMemo(
    () => `${muted ? 'm' : 'a'}-${(points || []).map(p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')}`,
    [points, muted],
  )

  const linhaReta = useMemo(
    () => (points || []).map(p => [p.lat, p.lng]),
    [points],
  )

  const pathStyle = muted
    ? { color: '#6366f1', weight: 3, opacity: 0.22, dashArray: '4 8' }
    : ROTA_PATH

  useEffect(() => {
    let cancelled = false
    setGeometry(null)
    setUsarFallbackLinhaReta(false)
    if ((points || []).length < 2) return undefined
    fetchOsrmDrivingGeometry(points)
      .then(geom => {
        if (cancelled) return
        if (geom) {
          setGeometry(geom)
          setUsarFallbackLinhaReta(false)
        } else {
          setGeometry(null)
          setUsarFallbackLinhaReta(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGeometry(null)
          setUsarFallbackLinhaReta(true)
        }
      })
    return () => { cancelled = true }
  }, [pointsKey, points])

  if (geometry && !usarFallbackLinhaReta) {
    return (
      <GeoJSON
        key={`osrm-${pointsKey}`}
        data={{ type: 'Feature', properties: {}, geometry }}
        style={pathStyle}
      />
    )
  }

  if (usarFallbackLinhaReta && linhaReta.length >= 2) {
    return (
      <Polyline
        key={`fallback-${pointsKey}`}
        positions={linhaReta}
        pathOptions={{
          ...pathStyle,
          ...(muted ? {} : { dashArray: '8 6', opacity: muted ? 0.22 : 0.75 }),
        }}
      />
    )
  }

  return null
}

function CampoIgrejaMarker({
  igreja,
  position,
  icon,
  zIndexOffset = 100,
  draggable = false,
  onDragEnd,
  children,
}) {
  const [pos, setPos] = useState(position)
  useEffect(() => {
    setPos(position)
  }, [position[0], position[1]])

  return (
    <Marker
      position={pos}
      icon={icon}
      zIndexOffset={zIndexOffset}
      draggable={draggable}
      eventHandlers={{
        dragend: e => {
          const ll = e.target.getLatLng()
          const next = [ll.lat, ll.lng]
          setPos(next)
          onDragEnd?.(ll.lat, ll.lng)
        },
      }}
    >
      {children}
    </Marker>
  )
}

function popupPropsForIgreja(ctx, ig) {
  const id = String(ig.id)
  return {
    pinEditActive: ctx.pinEditId === id,
    pinPending: ctx.pinPending?.igrejaId === id ? ctx.pinPending : null,
    onStartPinEdit: ctx.onStartPinEdit,
    onConfirmPinSave: ctx.onConfirmPinSave,
    onCancelPinEdit: ctx.onCancelPinEdit,
    pinSaveBusy: ctx.pinSaveBusy,
  }
}

export default function CampoTorreMap({
  membroEmail = '',
  rota = null,
  churches = [],
  checkInsByIgreja = {},
  height = 320,
  fullHeight = false,
  statusFiltro = 'todos',
  setorFiltro = 'todos',
  membros = [],
  membroDespacho = '',
  onMembroDespachoChange,
  onAddIgrejaRota,
  onInativarIgreja,
  dispatchEnabled = false,
  floatingSlot = null,
  allowPinCorrection = true,
}) {
  const [pinEditId, setPinEditId] = useState(null)
  const [pinPending, setPinPending] = useState(null)
  const [pinSaveBusy, setPinSaveBusy] = useState(false)

  const onStartPinEdit = useCallback(ig => {
    if (!ig?.id) return
    setPinEditId(String(ig.id))
    setPinPending(null)
  }, [])

  const onCancelPinEdit = useCallback(() => {
    setPinEditId(null)
    setPinPending(null)
  }, [])

  const onConfirmPinSave = useCallback(async (ig, pending) => {
    if (!ig?.id || !pending?.lat || !pending?.lng) return
    setPinSaveBusy(true)
    try {
      const form = churchToEditForm(ig)
      persistCoordsGeocodeForm(
        ig.id,
        form,
        { lat: pending.lat, lng: pending.lng, aproximado: false },
        { gpsManual: true },
      )
      setPinEditId(null)
      setPinPending(null)
    } finally {
      setPinSaveBusy(false)
    }
  }, [])

  const pinCtx = useMemo(() => ({
    pinEditId,
    pinPending,
    pinSaveBusy,
    onStartPinEdit: allowPinCorrection ? onStartPinEdit : undefined,
    onConfirmPinSave: allowPinCorrection ? onConfirmPinSave : undefined,
    onCancelPinEdit: allowPinCorrection ? onCancelPinEdit : undefined,
  }), [
    pinEditId, pinPending, pinSaveBusy, allowPinCorrection,
    onStartPinEdit, onConfirmPinSave, onCancelPinEdit,
  ])

  const igById = useMemo(
    () => new Map((churches || []).map(ig => [String(ig.id), ig])),
    [churches],
  )

  const rotaIds = useMemo(() => {
    const s = new Set()
    for (const p of rota?.igrejas || []) s.add(String(p.igrejaId))
    return s
  }, [rota])

  const paradas = useMemo(() => {
    if (!rota?.igrejas?.length) return []
    return [...rota.igrejas]
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
      .slice(0, 50)
      .map(p => {
        const ig = igById.get(String(p.igrejaId))
        const lat = Number(ig?.lat)
        const lng = Number(ig?.lng)
        if (!ig || !coordValida(lat, lng)) return null
        return {
          ...p,
          igreja: ig,
          lat,
          lng,
          checkIn: checkInsByIgreja[String(p.igrejaId)] || null,
        }
      })
      .filter(Boolean)
  }, [rota, igById, checkInsByIgreja])

  const igrejasGlobais = useMemo(() => {
    return (churches || [])
      .filter(ig => {
        const lat = Number(ig.lat)
        const lng = Number(ig.lng)
        return coordValida(lat, lng)
      })
      .slice(0, MAX_IGREJAS_MAPA)
  }, [churches])

  const foraRota = useMemo(
    () => igrejasGlobais.filter(ig => !rotaIds.has(String(ig.id))),
    [igrejasGlobais, rotaIds],
  )

  const routePointsFull = useMemo(
    () => paradas.map(p => ({ lat: p.lat, lng: p.lng })),
    [paradas],
  )

  const paradasVisiveis = useMemo(
    () => paradas.filter(p =>
      igrejaPassaFiltroSetor(p.igreja, setorFiltro)
      && paradaPassaFiltroStatus(p, statusFiltro, checkInsByIgreja),
    ),
    [paradas, setorFiltro, statusFiltro, checkInsByIgreja],
  )

  const routePointsAtivos = useMemo(
    () => paradasVisiveis.map(p => ({ lat: p.lat, lng: p.lng })),
    [paradasVisiveis],
  )

  const statusFiltrado = statusFiltro && statusFiltro !== 'todos'

  const fitKey = `${membroEmail}|${rota?.id || ''}|${paradas.length}|${igrejasGlobais.length}|${statusFiltro}|${setorFiltro}`

  const mapH = fullHeight ? '100%' : height

  if (!igrejasGlobais.length && !paradas.length) {
    return (
      <div
        className="rounded-xl flex items-center justify-center text-xs text-[var(--text-muted)] border border-white/10 px-4 text-center"
        style={{ height: mapH, background: 'rgba(0,0,0,0.2)' }}
      >
        Nenhuma igreja com GPS no cadastro. Geocodifique endereços na ficha da igreja.
      </div>
    )
  }

  return (
    <div className={`relative ${fullHeight ? 'h-full min-h-0' : 'space-y-1'}`}>
      <div
        className={`overflow-hidden ${fullHeight ? 'h-full rounded-none border-0' : 'rounded-xl border border-white/10'}`}
        style={{ height: fullHeight ? undefined : height }}
      >
        {floatingSlot && (
          <div className="absolute top-3 left-3 right-3 z-[500] flex flex-wrap items-start gap-2 pointer-events-none">
            <div className="pointer-events-auto flex flex-wrap gap-2">{floatingSlot}</div>
          </div>
        )}
        <MapContainer
          key={fitKey}
          center={BLUMENAU}
          zoom={12}
          className="h-full w-full"
          scrollWheelZoom
          preferCanvas
        >
          <TileLayer attribution={BASEMAP.attribution} url={BASEMAP.url} />
          <FitRota points={paradasVisiveis.length ? paradasVisiveis : paradas} fitKey={fitKey} allChurches={igrejasGlobais} />
          {statusFiltrado && routePointsFull.length >= 2 && (
            <OsrmRouteLayer points={routePointsFull} muted />
          )}
          {(routePointsAtivos.length >= 2
            ? <OsrmRouteLayer points={routePointsAtivos} />
            : (!statusFiltrado && routePointsFull.length >= 2 && <OsrmRouteLayer points={routePointsFull} />)
          )}

          {foraRota.map(ig => {
            const opaco = !igrejaPassaFiltroSetor(ig, setorFiltro)
            const id = String(ig.id)
            const lat = Number(ig.lat)
            const lng = Number(ig.lng)
            const pending = pinPending?.igrejaId === id ? pinPending : null
            const pos = pending
              ? [pending.lat, pending.lng]
              : [lat, lng]
            const pinProps = popupPropsForIgreja(pinCtx, ig)
            return (
              <CampoIgrejaMarker
                key={`off-${ig.id}`}
                igreja={ig}
                position={pos}
                icon={globalPinIcon(opaco)}
                zIndexOffset={pinEditId === id ? 800 : 100}
                draggable={pinEditId === id}
                onDragEnd={(la, ln) => setPinPending({ igrejaId: id, lat: la, lng: ln })}
              >
                <Popup maxWidth={320} minWidth={260}>
                  <CampoMapPopup
                    igreja={{ ...ig, lat: pos[0], lng: pos[1] }}
                    checkIn={checkInsByIgreja[id]}
                    membros={dispatchEnabled ? membros : []}
                    membroDespacho={membroDespacho}
                    onMembroDespachoChange={onMembroDespachoChange}
                    onAddToRota={onAddIgrejaRota}
                    onInativar={dispatchEnabled ? onInativarIgreja : undefined}
                    {...pinProps}
                  />
                </Popup>
              </CampoIgrejaMarker>
            )
          })}

          {paradas.map(p => {
            if (!igrejaPassaFiltroSetor(p.igreja, setorFiltro)) return null
            if (!paradaPassaFiltroStatus(p, statusFiltro, checkInsByIgreja)) return null
            const st = p.status || STATUS_PARADA.PENDENTE
            const label = st === STATUS_PARADA.CONCLUIDO ? '' : String(p.ordem || '')
            const id = String(p.igrejaId)
            const pending = pinPending?.igrejaId === id ? pinPending : null
            const pos = pending
              ? [pending.lat, pending.lng]
              : [p.lat, p.lng]
            const pinProps = popupPropsForIgreja(pinCtx, p.igreja)
            return (
              <CampoIgrejaMarker
                key={p.igrejaId}
                igreja={p.igreja}
                position={pos}
                icon={routePinIcon(st, label)}
                zIndexOffset={pinEditId === id ? 900 : (st === STATUS_PARADA.EM_TRANSITO ? 600 : 500)}
                draggable={pinEditId === id}
                onDragEnd={(la, ln) => setPinPending({ igrejaId: id, lat: la, lng: ln })}
              >
                <Popup maxWidth={320} minWidth={260}>
                  <CampoMapPopup
                    igreja={{ ...p.igreja, lat: pos[0], lng: pos[1] }}
                    parada={p}
                    checkIn={p.checkIn}
                    membros={[]}
                    onInativar={dispatchEnabled ? onInativarIgreja : undefined}
                    {...pinProps}
                  />
                </Popup>
              </CampoIgrejaMarker>
            )
          })}
        </MapContainer>
      </div>
      {!fullHeight && !membroEmail && (
        <p className="text-[10px] text-[var(--text-muted)] px-1">
          Selecione um membro para trajeto viário (OSRM) e paradas coloridas na rota.
        </p>
      )}
    </div>
  )
}
