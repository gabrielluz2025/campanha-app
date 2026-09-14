import { useMemo } from 'react'
import { calcularTimelineDia } from '../../utils/rotaCommandCenter'
import { useRotasCtx } from './RotasContext'

const ST_COLORS = {
  concluido: '#34d399',
  no_local: '#fbbf24',
  em_deslocamento: '#22d3ee',
  pendente: '#64748b',
  nao_visitou: '#f87171',
}

export default function LiveTimeline() {
  const { execucoes, rotas, agoraLive, rotaAtivaId, focarEquipeLive } = useRotasCtx()
  const eventos = useMemo(
    () => calcularTimelineDia({ execucoes, rotas, agoraLive }).slice(0, 24),
    [execucoes, rotas, agoraLive],
  )

  if (!eventos.length) return null

  return (
    <div className="rt-timeline">
      <p className="rt-timeline__title">Linha do tempo · hoje</p>
      <div className="rt-timeline__track">
        {eventos.map(ev => (
          <button
            key={ev.id}
            type="button"
            className={`rt-timeline__item${String(ev.rotaId) === String(rotaAtivaId) ? ' is-active' : ''}`}
            onClick={() => focarEquipeLive(ev.rotaId)}
          >
            <span className="rt-timeline__hora">{ev.hora}</span>
            <span className="rt-timeline__dot" style={{ background: ST_COLORS[ev.status] || ST_COLORS.pendente }} />
            <span className="rt-timeline__nome">{ev.nome}</span>
            {ev.aoVivo && <span className="rt-live-dot" />}
          </button>
        ))}
      </div>
    </div>
  )
}
