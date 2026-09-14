import { useState, useEffect, cloneElement } from 'react'
import {
  ChevronRight, History, Share2, Route, Radar,
} from 'lucide-react'
import SaveButton from '../SaveButton'
import RotasAoVivo from '../RotasAoVivo'
import { fmtDataBR, statusRotaMeta } from '../../utils/rotaUtils'
import { FieldMapLayout } from '../../layouts'
import RotaMapCanvas from './RotaMapCanvas'
import PainelMontar from './PainelMontar'
import PainelEnviar from './PainelEnviar'
import { RotaModalNova, RotaModalEnviar, RotaModalFoto, RotaModalEncerrarAoVivo } from './RotaModals'
import PanelExpandFab from './PanelExpandFab'
import './montarRotasV2.css'
import { useMobileLayout } from '../../hooks/useViewportMode'

const STEP_META = {
  adicionar: { title: 'Montar rota', sub: 'Escolha igrejas, agenda ou equipe' },
  busca: { title: 'Montar rota', sub: 'Escolha igrejas, agenda ou equipe' },
  rota: { title: 'Enviar rota', sub: 'Revise o itinerário e mande o link' },
  aovivo: { title: 'Campo ao vivo', sub: 'Acompanhe a equipe no mapa' },
  historico: { title: 'Histórico', sub: 'Rotas anteriores' },
}

const MRX_SEGMENT = [
  { id: 'adicionar', label: 'Montar', icon: Route },
  { id: 'rota', label: 'Enviar', icon: Share2 },
  { id: 'aovivo', label: 'Campo', icon: Radar },
  { id: 'historico', label: 'Hist.', icon: History },
]

function useIsMobileField() {
  return useMobileLayout()
}

export default function MontarRotasView(props) {
  const {
    center,
    rotasOrdenadas,
    rotaAtivaId,
    setRotaAtivaId,
    setRotaCalc,
    qtdParadas,
    respHead,
    sideTab,
    setSideTab,
    setPanelAberto,
    setPainel,
    setLiveSeguir,
    liveCount,
    liveSharesAtivos,
    livePulseCount,
    abrirNovaRota,
    panelAberto,
    mapProps,
    painel,
    fontesTabs,
    fontesExtras,
    selecionarPainel,
    montarProps,
    enviarProps,
    campoProps,
    panelExtras,
    panelHistorico,
    modals,
  } = props

  const isMobileField = useIsMobileField()
  const [sheetSnap, setSheetSnap] = useState('peek')

  const meta = STEP_META[sideTab] || STEP_META.adicionar
  const isMontar = sideTab === 'adicionar' || sideTab === 'busca'

  const segmentValue = sideTab === 'busca' ? 'adicionar' : sideTab

  useEffect(() => {
    if (!isMobileField) return
    if (panelAberto && sheetSnap === 'closed') setSheetSnap('peek')
  }, [panelAberto, isMobileField, sheetSnap])

  function handleSheetSnapChange(snap) {
    setSheetSnap(snap)
    if (snap === 'closed') setPanelAberto(false)
    else setPanelAberto(true)
  }

  function onSegmentChange(id) {
    if (id === 'adicionar') {
      setSideTab('adicionar')
      setPainel('igrejas')
    } else {
      setSideTab(id)
      if (id === 'aovivo') setLiveSeguir(true)
    }
    setPanelAberto(true)
    if (sheetSnap === 'closed') setSheetSnap('half')
  }

  const routePicker = (
    <select
      value={rotaAtivaId || ''}
      onChange={e => { setRotaAtivaId(e.target.value); setRotaCalc(null) }}
      disabled={!rotasOrdenadas.length}
      className="mrx-field-route-select"
    >
      {!rotasOrdenadas.length && <option value="">Nova rota</option>}
      {rotasOrdenadas.map(r => {
        const st = statusRotaMeta(r.status)
        return (
          <option key={r.id} value={r.id}>
            {fmtDataBR(r.data)} · {r.nome.replace(/^Rota\s+/i, '') || 'Rota'} · {st.label}
          </option>
        )
      })}
    </select>
  )

  const panelContent = (embedded = false) => (
    <aside className={`mrx-panel ${embedded ? 'mrx-panel--embedded' : ''}`}>
      {!embedded && (
        <div className="mrx-panel-head">
          <h2 className="mrx-panel-title">{meta.title}</h2>
          <p className="mrx-panel-sub">{meta.sub}</p>
        </div>
      )}

      {isMontar && (
        <>
          <div className="mrx-sources">
            {fontesTabs.map(t => (
              <button key={t.id} type="button" onClick={() => selecionarPainel(t.id)}
                className={`mrx-source ${painel === t.id ? 'is-on' : ''}`} title={t.desc}>
                {t.icon}
                {t.label}
                {t.badge ? <span className="mrx-source-badge">{t.badge}</span> : null}
              </button>
            ))}
            {fontesExtras.map(t => (
              <button key={t.id} type="button" onClick={() => selecionarPainel(t.id)}
                className={`mrx-source ${painel === t.id ? 'is-on' : ''}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <PainelMontar painel={painel} extrasPanel={panelExtras} useRecordCards={embedded} {...montarProps} />
          {qtdParadas > 0 && (
            <button type="button" className="mrx-next-bar"
              onClick={() => { setSideTab('rota'); setPanelAberto(true); if (isMobileField) setSheetSnap('half') }}>
              <span><b>{qtdParadas}</b> {qtdParadas === 1 ? 'parada' : 'paradas'}</span>
              <span className="inline-flex items-center gap-1 font-bold" style={{ color: '#e4b84a' }}>
                Ir ao envio <ChevronRight size={14} />
              </span>
            </button>
          )}
        </>
      )}

      {sideTab === 'rota' && <PainelEnviar {...enviarProps} useRecordCards={embedded} />}

      {sideTab === 'aovivo' && (
        <div className="mrx-panel-scroll flex-1 min-h-0">
          <RotasAoVivo {...campoProps} />
        </div>
      )}

      {sideTab === 'historico' && (
        <div className="mrx-panel-scroll">
          {embedded && panelHistorico
            ? cloneElement(panelHistorico, { useRecordCards: true })
            : panelHistorico}
        </div>
      )}
    </aside>
  )

  const mapCanvas = (
    <RotaMapCanvas
      center={center}
      fieldMobile={isMobileField}
      hidePanelToggle={isMobileField}
      {...mapProps}
    />
  )

  const modalsBlock = (
    <>
      <RotaModalNova {...modals.nova} />
      <RotaModalEnviar {...modals.enviar} />
      <RotaModalEncerrarAoVivo {...modals.encerrar} />
      <RotaModalFoto foto={modals.fotoAmpliada} onClose={modals.onCloseFoto} />
    </>
  )

  if (isMobileField) {
    return (
      <div className="mrx mrx--field-mobile">
        <FieldMapLayout
          className="h-full"
          title={meta.title}
          subtitle={`${qtdParadas} ${qtdParadas === 1 ? 'parada' : 'paradas'}${respHead ? ` · ${respHead.nome.split(' ')[0]}` : ''}`}
          headerAction={(
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <SaveButton variant="quiet" label="Salvar" className="!rounded-xl !text-xs !py-2 !px-2.5" />
              <button type="button" onClick={abrirNovaRota} className="mrx-btn-new" style={{ height: 32, padding: '0 10px', fontSize: 11 }}>
                + Nova
              </button>
            </div>
          )}
          map={mapCanvas}
          sheetSnap={sheetSnap}
          onSheetSnapChange={handleSheetSnapChange}
          sheetPeekHeight={80}
          sheetBodyClassName="p-0"
          sheetHeader={(
            <div className="space-y-2">
              {routePicker}
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold truncate" style={{ fontSize: 12, color: 'var(--text-field-primary)' }}>
                  {meta.sub}
                </p>
                <button
                  type="button"
                  onClick={() => handleSheetSnapChange('closed')}
                  className="flex-shrink-0 px-2 py-1 rounded-lg font-bold"
                  style={{ fontSize: 10, background: 'rgba(255,255,255,0.08)', color: 'var(--text-tertiary)' }}
                >
                  Ocultar
                </button>
              </div>
            </div>
          )}
          sheet={panelContent(true)}
          segmentOptions={MRX_SEGMENT.map(s => ({
            ...s,
            badge: s.id === 'rota' ? (qtdParadas || null) : s.id === 'aovivo' ? (liveCount || liveSharesAtivos || null) : null,
          }))}
          segmentValue={segmentValue}
          onSegmentChange={onSegmentChange}
          segmentFixedBottom
        />
        {sheetSnap === 'closed' && (
          <div className="absolute z-[1000] top-14 left-3">
            <PanelExpandFab
              onExpand={() => handleSheetSnapChange('peek')}
              visitadas={liveCount}
              pendentes={qtdParadas}
            />
          </div>
        )}
        {modalsBlock}
      </div>
    )
  }

  return (
    <div className="mrx">
      <header className="mrx-topbar">
        <div className="mrx-topbar-inner">
          <div className="mrx-route-picker">
            {routePicker}
            <p className="mrx-route-meta">
              {qtdParadas} {qtdParadas === 1 ? 'parada' : 'paradas'}
              {respHead ? ` · ${respHead.nome.split(' ')[0]}` : ''}
            </p>
          </div>

          <nav className="mrx-steps" aria-label="Passos">
            {[
              { id: 'adicionar', n: '1', label: 'Montar' },
              { id: 'rota', n: '2', label: 'Enviar', badge: qtdParadas || null },
              { id: 'aovivo', n: '3', label: 'Campo', badge: liveCount || liveSharesAtivos || null, pulse: livePulseCount > 0 },
            ].map(step => {
              const active = sideTab === step.id || (step.id === 'adicionar' && sideTab === 'busca')
              return (
                <button key={step.id} type="button"
                  className={`mrx-step ${active ? 'is-active' : ''}`}
                  onClick={() => {
                    setSideTab(step.id)
                    setPanelAberto(true)
                    if (step.id === 'aovivo') setLiveSeguir(true)
                    if (step.id === 'adicionar') setPainel('igrejas')
                  }}>
                  <span className="mrx-step-num">{step.n}</span>
                  <span className="mrx-step-label">{step.label}</span>
                  {step.badge != null && <span className="mrx-step-badge">{step.badge}</span>}
                  {step.pulse && <i className="mrx-step-pulse" />}
                </button>
              )
            })}
          </nav>

          <div className="mrx-top-actions">
            <button type="button"
              onClick={() => { setSideTab('historico'); setPanelAberto(true) }}
              className={`mrx-btn-hist ${sideTab === 'historico' ? 'is-on' : ''}`}
              title="Rotas anteriores">
              <History size={14} /> Histórico
            </button>
            <button type="button" onClick={abrirNovaRota} className="mrx-btn-new">
              <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Nova
            </button>
            <SaveButton variant="quiet" label="Salvar" className="!rounded-xl !text-xs !py-2 !px-2.5" />
          </div>
        </div>
      </header>

      <div className="mrx-body">
        {mapCanvas}

        {panelAberto && panelContent(false)}
      </div>

      {modalsBlock}
    </div>
  )
}
