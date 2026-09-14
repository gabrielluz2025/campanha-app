import { useState } from 'react'
import { ClipboardList, Crosshair, FileDown, Loader2, Sparkles } from 'lucide-react'
import { useMapaEleitoral } from '../context/MapaEleitoralContext'
import { radarLabel } from '../utils/eleitoralRadar'
import { radarColor } from '../utils/eleitoralColors'
import { exportarPlanoEleitoralPdf } from '../utils/eleitoralPlanoPdf'

export default function EleitoralPlanoPanel() {
  const {
    planoAcao, selecionarBairro, bairroSel, totais, cidadeAtiva, candidatoNome,
  } = useMapaEleitoral()
  const [pdfLoad, setPdfLoad] = useState(false)

  function copiarPlano() {
    const linhas = planoAcao.map((p, i) =>
      `${i + 1}. ${p.bairro} (radar ${p.score}) — ${p.acoes.join('; ')}`,
    )
    const texto = `Plano territorial — ${new Date().toLocaleDateString('pt-BR')}\n\n${linhas.join('\n')}`
    void navigator.clipboard?.writeText(texto)
  }

  async function baixarPdf() {
    setPdfLoad(true)
    try {
      await exportarPlanoEleitoralPdf({
        planoAcao,
        totais,
        cidadeAtiva,
        candidato: candidatoNome,
      })
    } finally {
      setPdfLoad(false)
    }
  }

  return (
    <div className="me-panel">
      <div className="me-panel__toolbar">
        <Sparkles size={14} />
        <span className="me-panel__title">Plano de ação</span>
        <button type="button" className="me-btn-ghost" onClick={copiarPlano} disabled={!planoAcao.length}>
          <ClipboardList size={12} /> Copiar
        </button>
        <button type="button" className="me-btn-ghost" onClick={baixarPdf} disabled={!planoAcao.length || pdfLoad}>
          {pdfLoad ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
          PDF
        </button>
      </div>
      <p className="me-plano-intro">
        Prioridades automáticas cruzando votos, equipe e seções sem voto. Toque para ir ao bairro no mapa.
      </p>
      <div className="me-plano-list">
        {planoAcao.map((p, idx) => {
          const active = bairroSel === p.bairro
          return (
            <button
              key={p.bairro}
              type="button"
              className={`me-plano-card${active ? ' me-plano-card--active' : ''}`}
              onClick={() => selecionarBairro(p.bairro)}
            >
              <div className="me-plano-card__head">
                <span className="me-plano-card__rank">#{idx + 1}</span>
                <span className="me-plano-card__name">{p.bairro}</span>
                <span
                  className="me-plano-card__score"
                  style={{ background: radarColor(p.score), color: p.score >= 55 ? '#fff' : '#0f172a' }}
                >
                  {p.score} · {radarLabel(p.score)}
                </span>
              </div>
              <ul className="me-plano-card__acoes">
                {p.acoes.map(a => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
              {p.resumo && (
                <div className="me-plano-card__stats">
                  <span>{p.resumo.votosObtidos} votos</span>
                  <span>{p.resumo.secoes} seções</span>
                  {p.resumo.pessoasFaltamMeta > 0 && (
                    <span className="me-plano-card__warn">
                      <Crosshair size={10} /> −{p.resumo.pessoasFaltamMeta} equipe
                    </span>
                  )}
                </div>
              )}
            </button>
          )
        })}
        {!planoAcao.length && (
          <p className="me-empty">Sem dados suficientes. Importe votos do TRE na aba Eleitores.</p>
        )}
      </div>
    </div>
  )
}
