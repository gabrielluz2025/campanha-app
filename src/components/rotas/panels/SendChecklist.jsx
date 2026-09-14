import { useMemo } from 'react'
import { CheckCircle2, AlertCircle, Circle } from 'lucide-react'
import { avaliarChecklistEnvio } from '../../../utils/rotaSendChecklist'
import { useRotasCtx } from '../RotasContext'

export default function SendChecklist() {
  const {
    paradasDetalhes,
    routeHealth,
    rotaAtiva,
    rotaCalc,
    membros,
    enviarPara,
    shareAtivoNaRota,
    aoVivoAtivoNaRota,
  } = useRotasCtx()

  const membroId = enviarPara || rotaAtiva?.responsavelId || ''
  const membro = membros.find(m => String(m.id) === String(membroId))

  const check = useMemo(() => avaliarChecklistEnvio({
    paradasDetalhes,
    routeHealth,
    membro,
    rotaCalc,
    rotaAtiva,
    shareAtivo: shareAtivoNaRota || aoVivoAtivoNaRota,
  }), [paradasDetalhes, routeHealth, membro, rotaCalc, rotaAtiva, shareAtivoNaRota, aoVivoAtivoNaRota])

  return (
    <div className={`rt-checklist${check.ok ? ' rt-checklist--ok' : ''}`}>
      <div className="rt-checklist__head">
        <span>Checklist pré-envio</span>
        <strong>{check.score}/{check.total}</strong>
      </div>
      <ul className="rt-checklist__list">
        {check.items.map(item => (
          <li key={item.id} className={item.ok ? 'is-ok' : 'is-warn'}>
            {item.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
            <span>{item.label}</span>
            {!item.ok && item.warn && <em>{item.warn}</em>}
          </li>
        ))}
      </ul>
      {!check.ok && (
        <p className="rt-checklist__foot">
          <Circle size={10} /> Complete os itens acima antes de enviar ao campo.
        </p>
      )}
    </div>
  )
}
