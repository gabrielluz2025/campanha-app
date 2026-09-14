import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { FieldMapLayout } from '../../layouts'
import { useMobileLayout } from '../../hooks/useViewportMode'
import { useChurchVisit } from '../../context/ChurchVisitContext'
import ChurchVisitDetail from '../mapaVisitas/ChurchVisitDetail'
import { useMapaEleitoral } from './context/MapaEleitoralContext'
import EleitoralMap from './EleitoralMap'
import EleitoralKpiBar, { EleitoralLenteLegend } from './panels/EleitoralKpiBar'
import EleitoralRankingPanel, { EleitoralFiltrosPanel } from './panels/EleitoralRankingPanel'
import EleitoralPlanoPanel from './panels/EleitoralPlanoPanel'
import EleitoralBairroPanel, { EleitoralLayersPanel } from './panels/EleitoralBairroPanel'
import { SHEET_TABS } from './constants'
import './mapaEleitoral.css'

export default function MapaEleitoralLayout() {
  const mobile = useMobileLayout()
  const { semDadosEleitores } = useMapaEleitoral()
  const { selected, setSelectedId } = useChurchVisit()
  const [sheetTab, setSheetTab] = useState('plano')
  const [sheetSnap, setSheetSnap] = useState(mobile ? 'half' : 'peek')

  useEffect(() => {
    if (selected) setSheetSnap(mobile ? 'half' : 'peek')
  }, [selected, mobile])

  const sheetContent = {
    ranking: <EleitoralRankingPanel />,
    plano: <EleitoralPlanoPanel />,
    filtros: <EleitoralFiltrosPanel />,
  }[sheetTab]

  return (
    <FieldMapLayout
      className="me-layout"
      map={<EleitoralMap />}
      mapOverlay={(
        <>
          <div className="me-overlay-top">
            <EleitoralKpiBar />
          </div>
          <EleitoralLayersPanel />
          <div className="me-overlay-bottom-left">
            <EleitoralLenteLegend />
          </div>
          {semDadosEleitores && (
            <div className="me-banner-empty">
              <AlertCircle size={14} />
              Importe o PDF do TRE na aba Eleitores para ativar o radar territorial.
            </div>
          )}
        </>
      )}
      sheetSnap={sheetSnap}
      onSheetSnapChange={setSheetSnap}
      sheetPeekHeight={mobile ? 120 : 140}
      sheetHeader={(
        selected ? (
          <div className="me-sheet-head me-sheet-head--igreja">
            <ChurchVisitDetail onClose={() => setSelectedId(null)} />
          </div>
        ) : (
          <div className="me-sheet-head">
            <EleitoralBairroPanel />
          </div>
        )
      )}
      sheet={sheetContent}
      sheetBodyClassName="me-sheet-body"
      segmentOptions={SHEET_TABS}
      segmentValue={sheetTab}
      onSegmentChange={setSheetTab}
    />
  )
}
