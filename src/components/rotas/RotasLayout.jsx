import { useState, useEffect } from 'react'
import {
  Plus, MapPin, Route, Share2, Radio, History,
} from 'lucide-react'
import { FieldMapLayout } from '../../layouts'
import { useMobileLayout } from '../../hooks/useViewportMode'
import { fmtDataBR, statusRotaMeta } from '../../utils/rotaUtils'
import { useRotasCtx } from './RotasContext'
import RotasMap from './RotasMap'
import PlanPanel from './panels/PlanPanel'
import ItineraryPanel from './panels/ItineraryPanel'
import SendPanel from './panels/SendPanel'
import LivePanel from './panels/LivePanel'
import HistoryPanel from './panels/HistoryPanel'
import RouteHealthBar from './RouteHealthBar'
import { RotaModalNova, RotaModalEnviar, RotaModalFoto, RotaModalEncerrarAoVivo } from '../montarRotas/RotaModals'
import '../montarRotas/montarRotasV2.css'
import './rotas.css'
import { APP_VERSION } from '../../constants/appVersion'

const STEPS = [
  { id: 'plan', label: 'Planejar', icon: MapPin },
  { id: 'itinerary', label: 'Itinerário', icon: Route },
  { id: 'send', label: 'Enviar', icon: Share2 },
  { id: 'live', label: 'Campo', icon: Radio, badgeKey: 'livePulseCount' },
  { id: 'history', label: 'Histórico', icon: History },
]

const STEP_COPY = {
  plan: { title: 'Planejar rota', sub: 'Assistente, lista, bairro ou vizinhança' },
  itinerary: { title: 'Itinerário', sub: 'Arraste paradas e otimize o trajeto' },
  send: { title: 'Enviar', sub: 'Checklist, WhatsApp e link ao vivo' },
  live: { title: 'Centro de comando', sub: 'GPS, alertas e timeline em tempo real' },
  history: { title: 'Histórico', sub: 'Rotas anteriores e resultados' },
}

export default function RotasLayout() {
  const ctx = useRotasCtx()
  const {
    rotasOrdenadas,
    rotaAtivaId,
    setRotaAtivaId,
    qtdParadas,
    respHead,
    wizardStep,
    goStep,
    liveCount,
    livePulseCount,
    abrirNovaRota,
    panelAberto,
    rotaAtiva,
    modals,
    commandMode,
  } = ctx

  const step = wizardStep || 'plan'
  const isMobile = useMobileLayout()
  const [sheetSnap, setSheetSnap] = useState('half')

  function onStep(id) {
    goStep(id)
    if (isMobile && sheetSnap === 'closed') setSheetSnap('half')
  }

  const meta = STEP_COPY[step] || STEP_COPY.plan
  const statusMeta = statusRotaMeta(rotaAtiva?.status)

  const routeRail = (
    <aside className="rt-rail rt-rail--desktop">
      <div className="rt-rail__head">
        <p className="rt-rail__title">Suas rotas</p>
        <button type="button" className="rt-new-btn" onClick={abrirNovaRota}>
          <Plus size={14} /> Nova rota
        </button>
      </div>
      <div className="rt-rail__list">
        {rotasOrdenadas.map(r => {
          const n = (r.paradas || []).filter(p => p.key && !String(p.key).startsWith('equipe:')).length
          const active = String(r.id) === String(rotaAtivaId)
          return (
            <button
              key={r.id}
              type="button"
              className={`rt-route-btn${active ? ' is-active' : ''}`}
              onClick={() => {
                setRotaAtivaId(r.id)
                onStep(n > 0 ? 'itinerary' : 'plan')
              }}
            >
              <span className="rt-route-btn__name">{r.nome}</span>
              <span className="rt-route-btn__meta">
                {fmtDataBR(r.data)} · {n} parada{n !== 1 ? 's' : ''}
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )

  const stepBar = (
    <div className="rt-steps">
      {STEPS.map(s => {
        const Icon = s.icon
        const badge = s.badgeKey === 'livePulseCount' && livePulseCount > 0 ? livePulseCount : null
        return (
          <button
            key={s.id}
            type="button"
            className={`rt-step${step === s.id ? ' is-active' : ''}`}
            onClick={() => onStep(s.id)}
          >
            <Icon size={14} />
            {s.label}
            {badge ? <span className="rt-step__badge">{badge}</span> : null}
          </button>
        )
      })}
    </div>
  )

  function panelContent() {
    switch (step) {
      case 'itinerary': return <ItineraryPanel />
      case 'send': return <SendPanel />
      case 'live': return commandMode ? null : <LivePanel />
      case 'history': return <HistoryPanel />
      default: return <PlanPanel />
    }
  }

  const panel = (
    <div className="rt-panel">
      <div className="rt-panel__head">
        <p className="rt-panel__title">{meta.title}</p>
        <p className="rt-panel__sub">{meta.sub}</p>
      </div>
      <div className="rt-panel__body">
        <RouteHealthBar />
        {panelContent()}
      </div>
    </div>
  )

  const modalsBlock = (
    <>
      <RotaModalNova {...modals.nova} />
      <RotaModalEnviar {...modals.enviar} />
      <RotaModalFoto foto={modals.fotoAmpliada} onClose={modals.onCloseFoto} />
      <RotaModalEncerrarAoVivo {...modals.encerrar} />
    </>
  )

  if (isMobile) {
    const segments = STEPS.map(s => ({ id: s.id, label: s.label, icon: s.icon }))
    return (
      <>
        <FieldMapLayout
          title={rotaAtiva?.nome || 'Montar Rotas'}
          subtitle={`${qtdParadas} paradas · ${respHead?.nome || 'Sem responsável'}`}
          map={<RotasMap fieldMobile />}
          sheetSnap={sheetSnap}
          onSheetSnapChange={setSheetSnap}
          sheetPeekHeight={120}
          sheetHeader={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700 }}>{meta.title}</p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{meta.sub}</p>
              </div>
              {liveCount > 0 && step !== 'live' && (
                <button type="button" className="rt-step is-active" style={{ padding: '6px 10px' }} onClick={() => onStep('live')}>
                  <span className="rt-live-dot" /> {liveCount} ao vivo
                </button>
              )}
            </div>
          }
          sheet={<div className="rt-mobile-sheet"><RouteHealthBar />{panelContent()}</div>}
          segmentOptions={segments}
          segmentValue={step}
          onSegmentChange={onStep}
        />
        {modalsBlock}
      </>
    )
  }

  return (
    <>
      <div className="rt-shell rt-shell--desktop">
        {routeRail}
        <div className="rt-main">
          <header className="rt-topbar">
            {stepBar}
            <div className="rt-topbar__info">
              <p className="rt-topbar__info-name">{rotaAtiva?.nome}</p>
              <p className="rt-topbar__info-sub">
                {fmtDataBR(rotaAtiva?.data)} · {qtdParadas} paradas
                {respHead ? ` · ${respHead.nome}` : ''}
                <span style={{ marginLeft: 6, color: statusMeta.cor }}>· {statusMeta.label}</span>
              </p>
            </div>
          </header>
          <div className={`rt-body${commandMode && step === 'live' ? ' rt-body--command' : ''}`}>
            <div className="rt-map">
              <RotasMap />
              {step === 'live' && (
                <div className={`rt-command-float${commandMode ? ' rt-command-float--full' : ''}`}>
                  <LivePanel />
                </div>
              )}
            </div>
            {panelAberto !== false && !(commandMode && step === 'live') && panel}
          </div>
        </div>
      </div>
      {modalsBlock}
      <p className="rt-version">Montar Rotas v2 · v{APP_VERSION}</p>
    </>
  )
}
