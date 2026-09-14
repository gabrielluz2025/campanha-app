import { useCallback } from 'react'
import { Marker, InfoWindow } from '../map/MapChildren'
import CampaignMap from '../map/CampaignMap'
import GeoJsonLayer from '../google/GeoJsonLayer'
import IgrejaMapMarker from '../IgrejaMapMarker'
import { bairroCanon } from '../../utils/bairroMapa'
import { googleCircleIcon, googleBairroLabelIcon } from '../../utils/googleMapIcons'
import { corPinIgreja } from '../mapaVisitas/pinColors'
import { useChurchVisit } from '../../context/ChurchVisitContext'
import { useMapaEleitoral } from './context/MapaEleitoralContext'
import { BLUMENAU_COORD } from './constants'
import {
  pctColor, votosColor, forcaStatusColor, radarColor, colegioMarkerSize,
} from './utils/eleitoralColors'
import { getCentroid } from './utils/eleitoralGeo'

export default function EleitoralMap() {
  const {
    geoData, geoErro, cidadeAtiva, focusBounds, flyTarget, contornoMunicipal,
    layers, lente, bairroSel, filtroBairros, resumo, radarMap, bairroPassaFiltro,
    colegiosNoMapa, colegioSel, colegioDetail, selecionarColegio, setColegioSel,
    selecionarBairro, selecionarIgreja, toggleFiltroBairro, setBairroSel, setFocusBounds, setColegioSel: clearColegio,
    igrejasNoMapa,
  } = useMapaEleitoral()
  const { selectedId, setSelectedId } = useChurchVisit()

  const geoStyle = useCallback((feature) => {
    const geoNome = feature.properties.name
    const canon = bairroCanon(geoNome)
    const r = resumo[canon]
    const visivel = bairroPassaFiltro(canon)
    const isSel = bairroSel === canon

    if (!visivel) {
      return {
        fillColor: '#0a0a12',
        fillOpacity: 0.35,
        color: 'rgba(255,255,255,0.08)',
        weight: 1,
      }
    }

    if (lente === 'colegios' || !layers.choropleth) {
      return {
        fillColor: 'transparent',
        fillOpacity: 0,
        color: isSel ? '#fbbf24' : 'rgba(255,255,255,0.42)',
        weight: isSel ? 2.5 : 1.5,
      }
    }

    let fillColor = 'rgba(255,255,255,0.04)'
    let fillOpacity = 0.15

    if (lente === 'radar') {
      fillColor = radarColor(radarMap[canon] || 0)
      fillOpacity = r ? 0.78 : 0.12
    } else if (lente === 'forca') {
      fillColor = forcaStatusColor(r)
      fillOpacity = r ? 0.78 : 0.12
    } else if (r?.secoes > 0) {
      fillColor = pctColor(r.pct)
      fillOpacity = filtroBairros.length ? 0.88 : 0.72
    } else if (r?.totalEleitores > 0) {
      fillColor = '#1a1a2e'
      fillOpacity = 0.35
    }

    return {
      fillColor,
      fillOpacity,
      color: isSel ? '#fbbf24' : (r?.coberto && lente === 'forca' ? '#34d399' : 'rgba(255,255,255,0.42)'),
      weight: isSel ? 3 : 1.5,
    }
  }, [resumo, radarMap, bairroSel, lente, layers.choropleth, filtroBairros, bairroPassaFiltro])

  const handleBairroGeoClick = useCallback((feature) => {
    setSelectedId(null)
    const geoNome = feature.properties?.name ?? feature.getProperty?.('name')
    const canon = bairroCanon(geoNome)
    if (filtroBairros.length > 0) {
      toggleFiltroBairro(canon)
    } else if (bairroSel === canon) {
      setBairroSel(null)
      clearColegio(null)
      setFocusBounds(null)
    } else {
      selecionarBairro(canon)
    }
  }, [filtroBairros, bairroSel, toggleFiltroBairro, selecionarBairro, setBairroSel, clearColegio, setFocusBounds, setSelectedId])

  const handleColegioClick = useCallback((c) => {
    setSelectedId(null)
    selecionarColegio(c)
  }, [setSelectedId, selecionarColegio])

  const handleIgrejaSelect = useCallback((ig) => {
    setSelectedId(ig.id)
    selecionarIgreja(ig)
  }, [setSelectedId, selecionarIgreja])

  if (!geoData && !colegiosNoMapa.length && !geoErro) {
    return (
      <div className="me-map-loading">
        Carregando mapa territorial…
      </div>
    )
  }

  return (
    <CampaignMap
      key={`me-map-${cidadeAtiva}`}
      center={BLUMENAU_COORD}
      zoom={12}
      fitBounds={focusBounds}
      flyTarget={flyTarget}
      options={{ zoomControl: false }}
      contornoMunicipal={contornoMunicipal}
      onClick={() => setSelectedId(null)}
    >
      {geoData && (
        <GeoJsonLayer
          key={`${cidadeAtiva}-${lente}-${bairroSel}-${filtroBairros.join(',')}`}
          data={geoData}
          styleFn={geoStyle}
          onFeatureClick={handleBairroGeoClick}
          layerKey={`${cidadeAtiva}-${lente}-${bairroSel}`}
        />
      )}
      {layers.nomes && geoData?.features?.map(feature => {
        const geoNome = feature.properties.name
        const canon = bairroCanon(geoNome)
        if (!bairroPassaFiltro(canon)) return null
        const centroid = getCentroid(feature)
        return (
          <Marker
            key={`nome-${geoNome}`}
            position={centroid}
            icon={googleBairroLabelIcon(geoNome)}
            clickable={false}
            zIndex={500}
          />
        )
      })}
      {(layers.colegios || lente === 'colegios') && colegiosNoMapa.map(c => {
        const sel = colegioSel === c.id
        const size = colegioMarkerSize(c.votos)
        return (
          <Marker
            key={`col-${c.id}`}
            position={{ lat: c.lat, lng: c.lng }}
            icon={googleCircleIcon(size, votosColor(c.votos), sel ? '#fbbf24' : '#fff', sel ? 3 : 1.5)}
            zIndex={sel ? 900 : 800}
            onClick={() => handleColegioClick(c)}
            title={c.nome}
          />
        )
      })}
      {layers.igrejas && igrejasNoMapa.map(ig => (
        <IgrejaMapMarker
          key={`ig-${ig.id}`}
          ig={ig}
          cor={corPinIgreja(ig)}
          selected={String(selectedId) === String(ig.id)}
          onSelect={handleIgrejaSelect}
        />
      ))}
      {colegioDetail && (
        <InfoWindow
          position={{ lat: colegioDetail.lat, lng: colegioDetail.lng }}
          onCloseClick={() => setColegioSel(null)}
        >
          <div className="me-infowin">
            <p className="me-infowin__title">{colegioDetail.nome}</p>
            {colegioDetail.bairro
              ? <p className="me-infowin__sub">📍 {colegioDetail.bairro} · Zona {colegioDetail.zona}</p>
              : <p className="me-infowin__warn">⚠ Bairro não atribuído</p>}
            <div className="me-infowin__grid">
              <div><strong>{colegioDetail.votos}</strong><span>Votos</span></div>
              <div><strong>{colegioDetail.numSecoes}</strong><span>Seções</span></div>
            </div>
          </div>
        </InfoWindow>
      )}
    </CampaignMap>
  )
}
