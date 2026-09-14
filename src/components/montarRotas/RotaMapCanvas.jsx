import { Marker, Polyline, InfoWindow } from '../map/MapChildren'
import {
  Loader2, PanelRightClose, PanelRightOpen, Crosshair,
} from 'lucide-react'
import CampaignMap from '../map/CampaignMap'
import { BairrosNomesMarkers } from '../google/BairrosNomesLayer'
import { IgrejaBalloonContent } from '../IgrejaMapBalloon'
import LiveTeamPin from '../LiveTeamPin'
import {
  DENOMINACAO_PADRAO, COR_DENOMINACAO, SETORES, BLUMENAU,
} from '../../constants/igrejasTheme'
import {
  paradaKey, CARGO_CORES, resolverParadas, resolverMembroRota,
  isParadaEquipe, labelTipoParada, corTipoParada, streetViewUrlIgrejaAsync,
} from '../../utils/rotaUtils'
import { googlePinIcon, googleSquareIcon } from '../../utils/googleMapIcons'
import { pinVariantIgreja } from '../../utils/igrejasAdbluNome'
import { corPinIgreja } from '../mapaVisitas/pinColors'
import { gpsPosicaoVisivel, execucaoEstaEncerrada } from '../../utils/rotaShare'

export default function RotaMapCanvas({
  center,
  fitBounds,
  flyToPoint,
  streetView,
  onStreetViewClose,
  onMapClick,
  bairrosOverlay = null,
  contornoMunicipal = null,
  showBairrosMapa = true,
  setShowBairrosMapa,
  showContornoMapa = true,
  setShowContornoMapa,
  showBairroNomes = true,
  setShowBairroNomes,
  bairrosGeoData = null,
  filtroDenom = 'todas',
  // layers
  camadaMapa,
  setCamadaMapa,
  panelAberto,
  setPanelAberto,
  fieldMobile = false,
  hidePanelToggle = false,
  // churches
  igrejasNoMapa,
  igrejasNoMapaOmitidas,
  igrejasNoMapaTotal,
  keysNaRota,
  mostrarTodasIgrejas,
  mostrarCandidatas = false,
  paradaOrdemMap,
  paradasDetalhes,
  corParada,
  hoverMapaAtivo,
  abrirHoverRota,
  fecharHoverRota,
  setMapInfoKey,
  setHoverKey,
  setFlyToPoint,
  toggleParada,
  toggleEquipeNaRota,
  setStreetView,
  mapInfoKey,
  hoverKey,
  igrejas,
  // team
  bairrosCoords,
  membros,
  liveMembroIds,
  equipeIdsSet,
  mostrarEquipeMapa,
  // route
  rotaCalc,
  fitParadas,
  paradasComCoords,
  organizarECalcularRota,
  rotaLoad,
  qtdParadas,
  // live
  liveCount,
  liveSharesAtivos,
  livePulseCount,
  liveTrails,
  rotaAtivaId,
  execucoes,
  agoraLive,
  focarEquipeLive,
  sideTab,
  liveDir,
  liveGpsDestino,
  liveFollowTarget,
  liveSeguir,
  setLiveSeguir,
  goStep,
  setPanelAberto: openPanel,
}) {
  return (
    <div className={`mrx-map-wrap${fieldMobile ? ' mrx-map-wrap--field' : ''}`}>
      <CampaignMap
        center={center}
        zoom={13}
        fitBounds={fitBounds}
        flyToPoint={flyToPoint}
        streetView={streetView}
        onStreetViewClose={onStreetViewClose}
        onClick={onMapClick}
        bairrosOverlay={bairrosOverlay}
        contornoMunicipal={contornoMunicipal}
      >
        {showBairroNomes && bairrosGeoData && (
          <BairrosNomesMarkers data={bairrosGeoData} visible={showBairroNomes} />
        )}
        {igrejasNoMapa.map(ig => {
          if (!ig.lat) return null
          const key = paradaKey('igreja', ig.id)
          const naRota = keysNaRota.has(key)
          if (!naRota && !mostrarTodasIgrejas && !mostrarCandidatas) return null
          const ordemRota = paradaOrdemMap.get(key) ?? -1
          const par = naRota ? paradasDetalhes.find(x => x.key === key) : null
          const label = naRota && ordemRota >= 0 ? String(ordemRota + 1) : ''
          const markerCor = naRota
            ? corParada(par || { key, tipoParada: 'visita', denominacao: ig.denominacao, setor: ig.setor })
            : corPinIgreja(ig)
          const compact = !naRota && mostrarTodasIgrejas
          const visitCount = ig.visita?.vezes || ig.visita?.historico?.length || 0
          return (
            <Marker key={key}
              position={{ lat: ig.lat, lng: ig.lng }}
              cor={markerCor}
              icon={googlePinIcon(label, markerCor, naRota, ig.visitado, ig.denominacao, ig.prioridade || 'media', ig.setor, compact, visitCount, pinVariantIgreja(ig))}
              zIndex={naRota ? 500 : 100}
              onClick={() => {
                setHoverKey(null)
                setFlyToPoint({ coords: [ig.lat, ig.lng], ts: Date.now(), panOnly: true })
                setMapInfoKey(key)
              }}
              onMouseOver={hoverMapaAtivo ? () => abrirHoverRota(key) : undefined}
              onMouseOut={hoverMapaAtivo ? fecharHoverRota : undefined}
            />
          )
        })}

        {bairrosCoords && membros.map(m => {
          if (liveMembroIds.has(String(m.id))) return null
          const p = resolverParadas([paradaKey('equipe', m.id)], igrejas, [m], bairrosCoords)[0]
          if (!p?.lat) return null
          const naEquipe = equipeIdsSet.has(String(m.id))
          if (!naEquipe && !mostrarEquipeMapa) return null
          const label = m.nome?.[0]?.toUpperCase() || '?'
          return (
            <Marker key={p.key}
              position={{ lat: p.lat, lng: p.lng }}
              cor={p.cor || CARGO_CORES[p.cargo] || '#10b981'}
              icon={googleSquareIcon(label, p.cor, naEquipe)}
              zIndex={naEquipe ? 600 : 200}
              onClick={() => {
                toggleEquipeNaRota(m.id)
                setFlyToPoint({ coords: [p.lat, p.lng], ts: Date.now() })
                setMapInfoKey(p.key)
              }}
            />
          )
        })}

        {paradasDetalhes.filter(p => p.key.startsWith('agenda:') || p.key.startsWith('material:')).map(p => {
          if (!p.lat || !p.lng) return null
          const ordem = paradasDetalhes.findIndex(x => x.key === p.key)
          return (
            <Marker key={p.key}
              position={{ lat: p.lat, lng: p.lng }}
              cor={corTipoParada(p.tipoParada)}
              icon={googleSquareIcon(String(ordem + 1), corTipoParada(p.tipoParada), true)}
              zIndex={550}
              onClick={() => setMapInfoKey(p.key)}
            />
          )
        })}

        {rotaCalc && (
          <Polyline
            path={rotaCalc.linha.map(([lat, lng]) => ({ lat, lng }))}
            options={{ strokeColor: '#3b82f6', strokeWeight: 4, strokeOpacity: 0.9 }}
          />
        )}

        {liveCount > 0 && Object.entries(liveTrails).map(([rid, path]) => {
          if (!path?.length || path.length < 2) return null
          const ativa = String(rid) === String(rotaAtivaId)
          return (
            <Polyline
              key={`trail-${rid}`}
              path={path}
              options={{
                strokeColor: ativa ? '#22d3ee' : '#34d399',
                strokeWeight: ativa ? 4 : 3,
                strokeOpacity: ativa ? 0.8 : 0.4,
                geodesic: true,
                zIndex: ativa ? 420 : 380,
              }}
            />
          )
        })}

        {Object.values(execucoes).map(pack => {
          const pos = pack?.exec?.posicao
          if (execucaoEstaEncerrada(pack?.exec, pack?.share)) return null
          if (!gpsPosicaoVisivel(pos, agoraLive)) return null
          const sid = pack.share?.shareId || pack.exec?.shareId
          const rid = pack.share?.rotaId || pack.exec?.rotaId
          const ativa = String(rid) === String(rotaAtivaId)
          const membro = resolverMembroRota(membros, {
            membroId: pack.share?.membroId || pack.exec?.membroId,
            membroNome: pack.share?.membro || pack.exec?.membroNome,
          })
          return (
            <LiveTeamPin
              key={`live-${sid}`}
              osmLive
              lat={pos.lat}
              lng={pos.lng}
              heading={pos.heading}
              foto={membro?.foto || ''}
              fotoX={membro?.fotoX ?? 50}
              fotoY={membro?.fotoY ?? 50}
              nome={membro?.nome || pack.share?.membro || pack.exec?.membroNome || 'Equipe'}
              ativa={ativa}
              onClick={() => {
                focarEquipeLive(rid, pos)
                setMapInfoKey(`live:${sid}`)
              }}
            />
          )
        })}

        {sideTab === 'aovivo' && liveGpsDestino && liveDir?.path?.length > 0 && (
          <Polyline
            path={liveDir.path}
            options={{
              strokeColor: '#f59e0b',
              strokeWeight: 3,
              strokeOpacity: 0.85,
              geodesic: false,
              icons: [{
                icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
                offset: '0',
                repeat: '14px',
              }],
            }}
          />
        )}

        {mapInfoKey && (() => {
          if (mapInfoKey.startsWith('live:')) {
            const sid = mapInfoKey.slice(5)
            const pack = Object.values(execucoes).find(p =>
              (p.share?.shareId || p.exec?.shareId) === sid)
            const pos = pack?.exec?.posicao
            if (!gpsPosicaoVisivel(pos, agoraLive)) return null
            const membroLive = resolverMembroRota(membros, {
              membroId: pack.share?.membroId || pack.exec?.membroId,
              membroNome: pack.share?.membro || pack.exec?.membroNome,
            })
            const quando = pos.atualizadoEm
              ? new Date(pos.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              : ''
            return (
              <InfoWindow position={{ lat: pos.lat, lng: pos.lng }} onCloseClick={() => setMapInfoKey(null)}>
                <div style={{ minWidth: 180, fontFamily: 'Inter,sans-serif', display: 'flex', gap: 10, alignItems: 'center' }}>
                  {membroLive?.foto && (
                    <img src={membroLive.foto} alt="" style={{
                      width: 44, height: 44, borderRadius: 99, objectFit: 'cover',
                      objectPosition: `${membroLive.fotoX ?? 50}% ${membroLive.fotoY ?? 50}%`,
                    }}/>
                  )}
                  <div>
                    <p style={{ fontWeight: 800, fontSize: 12, color: '#059669' }}>Ao vivo</p>
                    <p style={{ fontWeight: 700, fontSize: 13 }}>{pack.share?.nome || 'Rota'}</p>
                    <p style={{ fontSize: 11, color: '#64748b' }}>
                      {membroLive?.nome || pack.share?.membro || pack.exec?.membroNome || 'Equipe'}
                      {quando ? ` · ${quando}` : ''}
                    </p>
                  </div>
                </div>
              </InfoWindow>
            )
          }
          if (mapInfoKey.startsWith('igreja:')) {
            const ig = igrejas.find(i => paradaKey('igreja', i.id) === mapInfoKey)
            if (!ig?.lat) return null
            const naRota = keysNaRota.has(mapInfoKey)
            const par = paradasDetalhes.find(p => p.key === mapInfoKey)
            const markerCor = naRota
              ? corParada(par || { key: mapInfoKey, tipoParada: 'visita', denominacao: ig.denominacao, setor: ig.setor })
              : (ig.denominacao !== DENOMINACAO_PADRAO ? (COR_DENOMINACAO[ig.denominacao] || '#8b5cf6') : (SETORES[ig.setor] || '#3b82f6'))
            return (
              <InfoWindow position={{ lat: ig.lat, lng: ig.lng }} onCloseClick={() => setMapInfoKey(null)}>
                <IgrejaBalloonContent
                  ig={ig}
                  markerCor={markerCor}
                  pinned
                  interactive
                  inPopup
                  naRota={naRota}
                  onToggleRota={() => toggleParada(mapInfoKey)}
                  onVerRua={async () => {
                    const url = await streetViewUrlIgrejaAsync(ig)
                    if (!url) return
                    setMapInfoKey(null)
                    setStreetView({ url })
                  }}
                />
              </InfoWindow>
            )
          }
          const eq = membros.find(m => paradaKey('equipe', m.id) === mapInfoKey)
          if (eq) {
            const p = resolverParadas([mapInfoKey], igrejas, [eq], bairrosCoords || {})[0]
            if (!p?.lat) return null
            const naEquipe = equipeIdsSet.has(String(eq.id))
            return (
              <InfoWindow position={{ lat: p.lat, lng: p.lng }} onCloseClick={() => setMapInfoKey(null)}>
                <div style={{ minWidth: 160, fontFamily: 'Inter,sans-serif' }}>
                  <p style={{ fontWeight: 700, fontSize: 13 }}>{eq.nome}</p>
                  <p style={{ fontSize: 11, color: '#64748b' }}>{eq.cargo}</p>
                  <button type="button" onClick={() => toggleEquipeNaRota(eq.id)}
                    style={{
                      marginTop: 8, width: '100%', padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                      background: naEquipe ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                      color: naEquipe ? '#f87171' : '#10b981', border: 'none', cursor: 'pointer',
                    }}>
                    {naEquipe ? 'Remover da equipe' : 'Incluir na equipe'}
                  </button>
                </div>
              </InfoWindow>
            )
          }
          const par = paradasDetalhes.find(x => x.key === mapInfoKey)
          if (par?.lat) {
            return (
              <InfoWindow position={{ lat: par.lat, lng: par.lng }} onCloseClick={() => setMapInfoKey(null)}>
                <div style={{ minWidth: 140 }}>
                  <p style={{ fontWeight: 700, fontSize: 13 }}>{par.nome}</p>
                  <p style={{ fontSize: 11, color: '#64748b' }}>{labelTipoParada(par.tipoParada)}</p>
                </div>
              </InfoWindow>
            )
          }
          return null
        })()}
      </CampaignMap>

      {!hidePanelToggle && (
      <button type="button" onClick={() => setPanelAberto(v => !v)}
        className="mrx-panel-toggle"
        title={panelAberto ? 'Expandir mapa' : 'Abrir painel'}>
        {panelAberto ? <PanelRightClose size={18}/> : <PanelRightOpen size={18}/>}
      </button>
      )}

      {camadaMapa === 'igrejas' && igrejasNoMapaOmitidas > 0 && (
        <div className="mrx-map-hint">
          Mapa com <strong>{igrejasNoMapa.length}</strong> de {igrejasNoMapaTotal} igrejas.
          Use busca ou filtro de bairro para ver as outras {igrejasNoMapaOmitidas}.
        </div>
      )}

      {(liveCount > 0 || liveSharesAtivos > 0) && (
        <div className="mrx-live-float">
          <button type="button"
            onClick={() => { goStep?.('live'); openPanel(true) }}
            className={`mrx-live-pill ${livePulseCount > 0 ? '' : 'is-wait'}`}>
            <span className="dot"/>
            {liveCount > 0 ? `Ao vivo · ${liveCount}` : `Aguardando GPS · ${liveSharesAtivos}`}
          </button>
          {liveFollowTarget && (
            <button type="button" onClick={() => setLiveSeguir(v => !v)}
              className={`mrx-follow-btn ${liveSeguir ? 'is-on' : ''}`}>
              <Crosshair size={14}/>
              {liveSeguir ? 'Seguindo' : 'Seguir'}
            </button>
          )}
        </div>
      )}

      <div className="mrx-map-toolbar">
        {[
          { id: 'igrejas', label: 'Igrejas' },
          { id: 'rota', label: 'Rota' },
          { id: 'equipe', label: 'Equipe' },
        ].map(c => (
          <button key={c.id} type="button" onClick={() => setCamadaMapa(c.id)}
            className={`mrx-toolbar-btn ${camadaMapa === c.id ? 'is-on' : ''}`}>
            {c.label}
          </button>
        ))}
        {[
          { id: 'bairros', label: 'Bairros', on: showBairrosMapa, toggle: () => setShowBairrosMapa?.(v => !v) },
          { id: 'nomes', label: 'Nomes', on: showBairroNomes, toggle: () => setShowBairroNomes?.(v => !v) },
          { id: 'contorno', label: 'Contorno', on: showContornoMapa, toggle: () => setShowContornoMapa?.(v => !v) },
        ].map(c => (
          <button key={c.id} type="button" onClick={c.toggle}
            className={`mrx-toolbar-btn ${c.on ? 'is-on' : ''}`}>
            {c.label}
          </button>
        ))}
        {paradasComCoords.length > 0 && (
          <button type="button" onClick={fitParadas} className="mrx-toolbar-btn">
            Enquadrar
          </button>
        )}
        {qtdParadas >= 2 && (
          <button type="button" onClick={organizarECalcularRota} disabled={rotaLoad}
            className="mrx-toolbar-btn is-gold">
            {rotaLoad ? <Loader2 size={13} className="animate-spin"/> : '✨ Otimizar'}
          </button>
        )}
      </div>
    </div>
  )
}
