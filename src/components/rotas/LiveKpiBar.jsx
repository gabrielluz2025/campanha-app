import { useMemo } from 'react'
import { calcularKpisCommandCenter } from '../../utils/rotaCommandCenter'
import { useRotasCtx } from './RotasContext'

export default function LiveKpiBar() {
  const { execucoes, rotas, agoraLive } = useRotasCtx()
  const kpi = useMemo(
    () => calcularKpisCommandCenter({ execucoes, rotas, agoraLive }),
    [execucoes, rotas, agoraLive],
  )

  return (
    <div className="rt-kpi-bar">
      <div className="rt-kpi">
        <strong>{kpi.equipesCampo}</strong>
        <span>Equipes</span>
      </div>
      <div className="rt-kpi rt-kpi--live">
        <strong>{kpi.aoVivo}</strong>
        <span>GPS ao vivo</span>
      </div>
      <div className="rt-kpi">
        <strong>{kpi.aguardandoGps}</strong>
        <span>Aguardando</span>
      </div>
      <div className="rt-kpi">
        <strong>{kpi.visitas}/{kpi.totalParadas}</strong>
        <span>Visitas</span>
      </div>
      <div className="rt-kpi">
        <strong>{kpi.pctVisitas}%</strong>
        <span>Progresso</span>
      </div>
    </div>
  )
}
