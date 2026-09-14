import { useMemo } from 'react'
import { calcularAlertasLive } from '../../utils/rotaCommandCenter'
import { useRotasCtx } from './RotasContext'

export default function LiveAlertsPanel() {
  const { execucoes, rotas, agoraLive, focarEquipeLive } = useRotasCtx()
  const alertas = useMemo(
    () => calcularAlertasLive({ execucoes, rotas, agoraLive }),
    [execucoes, rotas, agoraLive],
  )

  if (!alertas.length) {
    return <p className="rt-empty rt-empty--sm">Nenhum alerta no momento.</p>
  }

  return (
    <div className="rt-alerts">
      {alertas.map(a => (
        <button
          key={a.id}
          type="button"
          className={`rt-alert rt-alert--${a.severity}`}
          onClick={() => a.rotaId && focarEquipeLive(a.rotaId)}
        >
          <strong>{a.titulo}</strong>
          <span>{a.msg}</span>
        </button>
      ))}
    </div>
  )
}
