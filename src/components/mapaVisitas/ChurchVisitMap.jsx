import { useMemo } from 'react'
import CampaignMap from '../map/CampaignMap'
import IgrejaMapMarker from '../IgrejaMapMarker'
import { corPinIgreja } from './pinColors'
import { limitarPinsMapa, MAX_PINS_MAPA } from '../../utils/mapaPins'
import { igrejaSemPinMapa } from '../../utils/igrejasGeocodeFix'
import { BLUMENAU } from '../../constants/igrejasTheme'
import { useChurchVisit, useFilteredChurches } from '../../context/ChurchVisitContext'

export default function ChurchVisitMap({ filters = {}, height = '100%' }) {
  const { selectedId, setSelectedId } = useChurchVisit()
  const filtradas = useFilteredChurches(filters)

  const noMapa = useMemo(
    () => filtradas.filter(ig => !igrejaSemPinMapa(ig)),
    [filtradas],
  )

  const pins = useMemo(() => {
    const { pins: lista } = limitarPinsMapa(noMapa, {
      max: MAX_PINS_MAPA,
      prioridadeIds: selectedId ? [selectedId] : [],
    })
    return lista
  }, [noMapa, selectedId])

  return (
    <div className="relative w-full min-h-0" style={{ height }}>
      <CampaignMap
        center={BLUMENAU}
        zoom={12}
        className="absolute inset-0 rounded-none sm:rounded-lg overflow-hidden"
        onClick={() => setSelectedId(null)}
      >
        {pins.map(ig => (
          <IgrejaMapMarker
            key={ig.id}
            ig={ig}
            cor={corPinIgreja(ig)}
            selected={String(selectedId) === String(ig.id)}
            onSelect={(item) => setSelectedId(item.id)}
          />
        ))}
      </CampaignMap>
      {noMapa.length > pins.length && (
        <div className="absolute bottom-2 left-2 z-[500] rounded-md bg-black/60 px-2 py-1 text-[10px] text-white">
          {pins.length} de {noMapa.length} no mapa — aproxime ou filtre
        </div>
      )}
    </div>
  )
}
