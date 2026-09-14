import { ChevronDown, ChevronUp } from 'lucide-react'
import { STATUS_ROTA } from '../../../utils/rotaUtils'
import { useRotasCtx } from '../RotasContext'

export default function RouteResultPanel() {
  const {
    rotaAtiva,
    concluidas,
    qtdParadas,
    resultadoAberto,
    setResultadoAberto,
    motivoDraft,
    setMotivoDraft,
    registrarResultado,
    carga,
    gerarRelatorio,
  } = useRotasCtx()

  const pct = qtdParadas ? Math.round((concluidas / qtdParadas) * 100) : 0

  return (
    <div className="rt-resultado">
      <button
        type="button"
        className="rt-resultado__toggle"
        onClick={() => setResultadoAberto(!resultadoAberto)}
      >
        <span>Resultado do dia · {concluidas}/{qtdParadas} ({pct}%)</span>
        {resultadoAberto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {resultadoAberto && (
        <div className="rt-resultado__body">
          {carga?.length > 0 && (
            <div className="rt-resultado__carga">
              <p className="rt-resultado__label">Material na rota</p>
              {carga.map((c, i) => (
                <p key={i} className="rt-resultado__carga-item">{c.nome}: {c.quantidade} un. → {c.bairro}</p>
              ))}
            </div>
          )}

          <label className="rt-resultado__label">Observações / motivo (se parcial ou problema)</label>
          <textarea
            className="rt-resultado__motivo"
            rows={2}
            value={motivoDraft}
            onChange={e => setMotivoDraft(e.target.value)}
            placeholder="Ex.: chuva, igreja fechada, faltou tempo…"
          />

          <div className="rt-resultado__btns">
            {STATUS_ROTA.filter(s => ['concluida', 'parcial', 'nao_realizada', 'com_problema'].includes(s.id)).map(s => (
              <button
                key={s.id}
                type="button"
                className="rt-resultado__btn"
                style={{ borderColor: s.cor }}
                onClick={() => registrarResultado(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>

          <button type="button" className="rt-cta rt-cta--ghost" style={{ marginTop: 10 }} onClick={() => void gerarRelatorio()}>
            Copiar relatório (WhatsApp)
          </button>
        </div>
      )}
    </div>
  )
}
