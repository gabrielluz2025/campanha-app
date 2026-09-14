import { Children, cloneElement, isValidElement, useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { googlePinIcon, streetViewMapsUrl } from '../../utils/googleMapIcons'
import { pinVariantIgreja } from '../../utils/igrejasAdbluNome'
import { coordValida } from '../../utils/rotaUtils'
import { leafletBasemapConfig } from '../../config/mapTiles'
import { BLUMENAU_MAP_MAX_BOUNDS } from '../../utils/blumenauLimit'
import { BairrosLeafletLayer } from './BairrosDemarcacao'
import BairrosLabelsLeaflet from './BairrosLabelsLeaflet'
import { ContornoMunicipalLeaflet } from './ContornoMunicipal'
import 'leaflet/dist/leaflet.css'

const BASEMAP = leafletBasemapConfig()

const LIVE_ANIM_MS = 800

function distDeg(a, b) {
  return Math.hypot(Number(b.lat) - Number(a.lat), Number(b.lng) - Number(a.lng))
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
}

function pinIconLeaflet(icon) {
  const url = icon?.url
  if (!url) return null
  const w = icon?.scaledSize?.width || 28
  const h = icon?.scaledSize?.height || 38
  const ax = icon?.anchor?.x ?? w / 2
  const ay = icon?.anchor?.y ?? h - 2
  return L.divIcon({
    className: 'osm-pin-wrap',
    html: `<img src="${escHtml(url)}" alt="" class="osm-pin-img" draggable="false" />`,
    iconSize: [w, h],
    iconAnchor: [ax, ay],
  })
}

function igrejaPinFromWrapper(p) {
  if (!p.ig?.lat || !p.ig?.lng) return null
  const ig = p.ig
  const cor = p.cor || '#3b82f6'
  const vezes = ig.visitado
    ? (ig.visita?.vezes || ig.visita?.historico?.length || 0)
    : 0
  const icon = googlePinIcon(
    '',
    cor,
    Boolean(p.selected),
    ig.visitado,
    ig.denominacao,
    ig.prioridade,
    ig.setor,
    false,
    vezes,
    pinVariantIgreja(ig),
  )
  return {
    lat: Number(ig.lat),
    lng: Number(ig.lng),
    icon,
    onClick: () => p.onSelect?.(ig),
    zIndexOffset: Number(p.zIndex) || 0,
    draggable: p.draggable,
    onDragEnd: p.onDragEnd,
  }
}

function OsmPinMarker({ lat, lng, icon, onClick, draggable, onDragEnd, keyPrefix, zIndexOffset = 0 }) {
  const leafletIcon = pinIconLeaflet(icon)
  if (!leafletIcon || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const handlers = {}
  if (onClick) {
    handlers.click = (e) => { e.originalEvent?.stopPropagation?.(); onClick() }
  }
  if (onDragEnd) {
    handlers.dragend = (e) => {
      const marker = e.target
      const position = marker.getLatLng()
      onDragEnd(position.lat, position.lng)
    }
  }
  return (
    <Marker
      key={keyPrefix}
      position={[lat, lng]}
      icon={leafletIcon}
      draggable={draggable}
      zIndexOffset={zIndexOffset}
      eventHandlers={Object.keys(handlers).length ? handlers : undefined}
    />
  )
}
function isLivePinProps(p) {
  return p.osmLive === true
    || (p.nome != null && p.ativa !== undefined
      && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)))
}

function livePinIcon({ nome, foto, fotoX, fotoY, ativa, heading }) {
  const inicial = escHtml(String(nome || '?').trim().charAt(0).toUpperCase() || '•')
  const rot = Number.isFinite(Number(heading)) && Number(heading) >= 0 ? Number(heading) : 0
  const inner = foto
    ? `<img src="${escHtml(foto)}" alt="" style="object-position:${Number(fotoX) || 50}% ${Number(fotoY) || 50}%" />`
    : `<span class="live-team-pin-letter">${inicial}</span>`
  const html = `<button type="button" class="live-team-pin ${ativa ? 'is-active' : ''} ${foto ? 'has-photo' : ''}" title="${escHtml(nome)}">
    <span class="live-team-pin-pulse"></span>
    <span class="live-team-pin-arrow" style="transform:rotate(${rot}deg)"></span>
    <span class="live-team-pin-inner">${inner}</span>
  </button>`
  return L.divIcon({
    className: 'osm-live-pin-wrap',
    html,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  })
}

function OsmLiveMarker({ lat, lng, heading, foto, fotoX, fotoY, nome, ativa, onClick, keyPrefix }) {
  const targetLat = Number(lat)
  const targetLng = Number(lng)
  const valid = Number.isFinite(targetLat) && Number.isFinite(targetLng)
  const [display, setDisplay] = useState(() => (valid ? { lat: targetLat, lng: targetLng } : null))
  const animRef = useRef(null)
  const displayRef = useRef(display)
  displayRef.current = display

  useEffect(() => {
    if (!valid) return undefined
    const from = displayRef.current || { lat: targetLat, lng: targetLng }
    const jump = distDeg(from, { lat: targetLat, lng: targetLng })
    if (jump > 0.08) {
      setDisplay({ lat: targetLat, lng: targetLng })
      return undefined
    }
    if (jump < 0.000003) return undefined

    const startLat = from.lat
    const startLng = from.lng
    const startTime = performance.now()
    cancelAnimationFrame(animRef.current)

    function frame(now) {
      const t = Math.min(1, (now - startTime) / LIVE_ANIM_MS)
      const ease = 1 - (1 - t) ** 3
      setDisplay({
        lat: startLat + (targetLat - startLat) * ease,
        lng: startLng + (targetLng - startLng) * ease,
      })
      if (t < 1) animRef.current = requestAnimationFrame(frame)
    }
    animRef.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(animRef.current)
  }, [targetLat, targetLng, valid])

  if (!valid || !display) return null

  return (
    <Marker
      key={keyPrefix}
      position={[display.lat, display.lng]}
      icon={livePinIcon({ nome, foto, fotoX, fotoY, ativa, heading })}
      zIndexOffset={ativa ? 1200 : 800}
      eventHandlers={onClick ? { click: (e) => { e.originalEvent?.stopPropagation?.(); onClick() } } : undefined}
    />
  )
}
function OsmCamera({ fitBounds, flyToPoint, flyTarget }) {
  const map = useMap()

  useEffect(() => {
    if (!fitBounds || fitBounds.length !== 2) return
    const [[lat1, lng1], [lat2, lng2]] = fitBounds
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return
    map.fitBounds([[lat1, lng1], [lat2, lng2]], { padding: [48, 48] })
  }, [map, fitBounds])

  useEffect(() => {
    if (!flyToPoint?.coords) return
    const [lat, lng] = flyToPoint.coords
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    map.panTo([lat, lng])
    if (!flyToPoint.panOnly) map.setZoom(flyToPoint.zoom ?? 17)
  }, [map, flyToPoint])

  useEffect(() => {
    if (flyTarget?.lat == null || flyTarget?.lng == null) return
    map.panTo([flyTarget.lat, flyTarget.lng])
    if (flyTarget.zoom) map.setZoom(flyTarget.zoom)
  }, [map, flyTarget])

  return null
}

function OsmClicks({ onClick }) {
  useMapEvents({
    click() { onClick?.() },
  })
  return null
}

function colorFromIcon(icon) {
  const url = icon?.url
  if (!url || typeof url !== 'string') return null
  try {
    const raw = url.includes(',') ? url.split(',')[1] : url
    const decoded = decodeURIComponent(raw)
    const m = decoded.match(/fill="(#[0-9a-fA-F]{3,8})"/)
      || decoded.match(/stop-color="(#[0-9a-fA-F]{3,8})"/)
    return m?.[1] || null
  } catch {
    return null
  }
}

function pinFromProps(p) {
  const markerColor = p.cor || colorFromIcon(p.icon)
  if (p.position?.lat != null && p.position?.lng != null) {
    const lat = Number(p.position.lat)
    const lng = Number(p.position.lng)
    if (!coordValida(lat, lng)) return null
    return { lat, lng, onClick: p.onClick, color: markerColor }
  }
  if (p.ig?.lat != null && p.ig?.lng != null) {
    const lat = Number(p.ig.lat)
    const lng = Number(p.ig.lng)
    if (!coordValida(lat, lng)) return null
    return {
      lat,
      lng,
      color: markerColor,
      onClick: () => p.onSelect?.(p.ig) || p.onClick?.(),
    }
  }
  if (p.lat != null && p.lng != null && !p.path) {
    const lat = Number(p.lat)
    const lng = Number(p.lng)
    if (!coordValida(lat, lng)) return null
    return {
      lat,
      lng,
      onClick: p.onClick,
      color: markerColor || (p.ativa ? '#22d3ee' : '#34d399'),
    }
  }
  return null
}

function lineFromProps(p) {
  if (!Array.isArray(p.path) || p.path.length < 2) return null
  const positions = p.path
    .map(pt => {
      if (Array.isArray(pt)) return [Number(pt[0]), Number(pt[1])]
      return [Number(pt.lat), Number(pt.lng)]
    })
    .filter(([lat, lng]) => coordValida(lat, lng))
  if (positions.length < 2) return null
  return {
    positions,
    color: p.options?.strokeColor || '#d4af5f',
    weight: p.options?.strokeWeight || 4,
    opacity: p.options?.strokeOpacity ?? 0.85,
  }
}

function isLeafletNativeNode(node) {
  if (!isValidElement(node)) return false
  const t = node.type
  return Boolean(t?.leafletNative)
}

function adaptNode(node, keyPrefix = 'osm') {
  if (node == null || node === false) return null
  if (Array.isArray(node)) {
    return node.map((child, i) => adaptNode(child, `${keyPrefix}-${i}`))
  }
  if (!isValidElement(node)) return null

  if (isLeafletNativeNode(node)) {
    return cloneElement(node, { key: keyPrefix })
  }

  const p = node.props || {}
  const line = lineFromProps(p)
  if (line) {
    return (
      <Polyline
        key={keyPrefix}
        positions={line.positions}
        pathOptions={{ color: line.color, weight: line.weight, opacity: line.opacity }}
      />
    )
  }

  if (typeof p.onCloseClick === 'function' && p.position?.lat != null && p.children) {
    return (
      <Popup
        key={keyPrefix}
        position={[p.position.lat, p.position.lng]}
        className="popup-igreja-leaflet"
        maxWidth={280}
        eventHandlers={{ remove: p.onCloseClick }}
      >
        {p.children}
      </Popup>
    )
  }

  if (isLivePinProps(p)) {
    return (
      <OsmLiveMarker
        key={keyPrefix}
        keyPrefix={keyPrefix}
        lat={p.lat}
        lng={p.lng}
        heading={p.heading}
        foto={p.foto}
        fotoX={p.fotoX}
        fotoY={p.fotoY}
        nome={p.nome}
        ativa={p.ativa}
        onClick={p.onClick}
      />
    )
  }

  const igPin = igrejaPinFromWrapper(p)
  if (igPin) {
    return (
      <OsmPinMarker
        key={keyPrefix}
        keyPrefix={keyPrefix}
        lat={igPin.lat}
        lng={igPin.lng}
        icon={igPin.icon}
        onClick={igPin.onClick}
        draggable={igPin.draggable}
        onDragEnd={igPin.onDragEnd}
        zIndexOffset={igPin.zIndexOffset}
      />
    )
  }

  if (p.position?.lat != null && p.position?.lng != null && p.icon?.url) {
    return (
      <OsmPinMarker
        key={keyPrefix}
        keyPrefix={keyPrefix}
        lat={Number(p.position.lat)}
        lng={Number(p.position.lng)}
        icon={p.icon}
        onClick={p.onClick}
        zIndexOffset={Number(p.zIndex) || 0}
      />
    )
  }

  const pin = pinFromProps(p)
  if (pin && coordValida(pin.lat, pin.lng)) {
    if (p.icon?.url) {
      return (
        <OsmPinMarker
          key={keyPrefix}
          keyPrefix={keyPrefix}
          lat={pin.lat}
          lng={pin.lng}
          icon={p.icon}
          onClick={pin.onClick}
          zIndexOffset={Number(p.zIndex) || 0}
        />
      )
    }
    return (
      <CircleMarker
        key={keyPrefix}
        center={[pin.lat, pin.lng]}
        radius={p.compact ? 5 : 8}
        pathOptions={{
          color: '#0b0e16',
          weight: 1.5,
          fillColor: pin.color || '#d4af5f',
          fillOpacity: 0.95,
        }}
        eventHandlers={pin.onClick ? { click: (e) => { e.originalEvent?.stopPropagation?.(); pin.onClick() } } : undefined}
      />
    )
  }

  if (p.children != null) {
    return Children.map(p.children, (child, i) => adaptNode(child, `${keyPrefix}-${i}`))
  }
  return null
}

export default function CampaignOsmMap({
  center,
  zoom = 13,
  onClick,
  children,
  fitBounds,
  flyToPoint,
  flyTarget,
  className = '',
  note,
  streetView = null,
  onStreetViewClose,
  bairrosOverlay = null,
  contornoMunicipal = null,
}) {
  useEffect(() => {
    const url = streetView?.url
      || (streetView?.endereco ? streetViewMapsUrl(null, null, streetView.endereco) : '')
      || (streetView?.lat != null && streetView?.lng != null
        ? streetViewMapsUrl(streetView.lat, streetView.lng)
        : '')
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
    onStreetViewClose?.()
  }, [streetView, onStreetViewClose])

  const lat = Number(center?.lat ?? -26.9194)
  const lng = Number(center?.lng ?? -49.0661)

  return (
    <div className={`campaign-osm ${className}`} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <MapContainer
        center={[lat, lng]}
        zoom={zoom}
        minZoom={11}
        maxBounds={BLUMENAU_MAP_MAX_BOUNDS}
        maxBoundsViscosity={0.35}
        style={{ width: '100%', height: '100%', background: '#e8ecf0' }}
        zoomControl
        attributionControl
        scrollWheelZoom
        dragging
        touchZoom
        doubleClickZoom
      >
        <TileLayer
          url={BASEMAP.url}
          subdomains={BASEMAP.subdomains}
          attribution={BASEMAP.attribution}
          maxZoom={BASEMAP.maxZoom}
          maxNativeZoom={BASEMAP.maxNativeZoom ?? BASEMAP.maxZoom}
        />
        {bairrosOverlay?.data && (
          <BairrosLeafletLayer
            data={bairrosOverlay.data}
            bairroCores={bairrosOverlay.bairroCores}
          />
        )}
        {bairrosOverlay?.data && bairrosOverlay.showLabels !== false && (
          <BairrosLabelsLeaflet
            data={bairrosOverlay.data}
            igrejasPorBairro={bairrosOverlay.igrejasPorBairro}
            visible={bairrosOverlay.showLabels !== false}
            minCount={bairrosOverlay.minLabelCount ?? 1}
          />
        )}
        {contornoMunicipal && <ContornoMunicipalLeaflet limitFeature={contornoMunicipal} />}
        <OsmCamera fitBounds={fitBounds} flyToPoint={flyToPoint} flyTarget={flyTarget}/>
        <OsmClicks onClick={onClick}/>
        {adaptNode(children)}
      </MapContainer>
      {note && <p className="campaign-osm-note">{note}</p>}
    </div>
  )
}
