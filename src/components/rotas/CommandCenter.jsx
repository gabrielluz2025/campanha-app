import { Maximize2, Minimize2, Radio } from 'lucide-react'
import LiveKpiBar from './LiveKpiBar'
import LiveAlertsPanel from './LiveAlertsPanel'
import LiveTimeline from './LiveTimeline'
import GpsReplayPanel from './GpsReplayPanel'
import RotasAoVivo from '../RotasAoVivo'
import { useRotasCtx } from './RotasContext'

export default function CommandCenter() {
  const {
    commandMode,
    setCommandMode,
    rotas,
    execucoes,
    membros,
    igrejas,
    bairrosCoords,
    rotaAtivaId,
    liveSeguir,
    focarEquipeLive,
    encerrarAoVivo,
    abrirModalEncerrarAoVivo,
    abrirModalEnviar,
    goStep,
    setPanelAberto,
  } = useRotasCtx()

  return (
    <div className={`rt-command${commandMode ? ' rt-command--fullscreen' : ''}`}>
      <div className="rt-command__bar">
        <div className="rt-command__title">
          <Radio size={16} />
          Torre de controle
        </div>
        <button
          type="button"
          className="rt-command__toggle"
          onClick={() => {
            setCommandMode(!commandMode)
            if (!commandMode) setPanelAberto(false)
            else setPanelAberto(true)
          }}
        >
          {commandMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          {commandMode ? 'Sair tela cheia' : 'Torre tela cheia'}
        </button>
      </div>

      <LiveKpiBar />
      <LiveAlertsPanel />
      <LiveTimeline />
      <GpsReplayPanel />

      <div className="rt-command__cards">
        <RotasAoVivo
          rotas={rotas}
          execucoes={execucoes}
          membros={membros}
          igrejas={igrejas}
          bairrosCoords={bairrosCoords}
          rotaAtivaId={rotaAtivaId}
          liveSeguir={liveSeguir}
          onSelectRota={focarEquipeLive}
          onEncerrar={encerrarAoVivo}
          onAbrirEncerrar={abrirModalEncerrarAoVivo}
          onEnviarLink={() => {
            goStep('send')
            void abrirModalEnviar()
          }}
        />
      </div>
    </div>
  )
}
