import { AlertTriangle, Building2, CheckCircle, Map, Radar, School, Vote } from 'lucide-react'
import { useMapaEleitoral } from '../context/MapaEleitoralContext'

export default function EleitoralKpiBar() {
  const {
    totais, cidadesDisponiveis, cidadeAtiva, escolherCidade,
    geoFonte, geoErro, isBlumenau, geoColegios, locaisSemSetor, colegiosNoMapa,
  } = useMapaEleitoral()

  const chips = isBlumenau
    ? [
      { label: 'Votos', value: totais.votos.toLocaleString('pt-BR'), color: 'var(--gold-bright)' },
      { label: 'Radar médio', value: totais.radarMedio, color: totais.radarMedio >= 55 ? '#f87171' : '#34d399' },
      { label: 'Críticos', value: totais.criticos, color: '#fb923c' },
      { label: 'Previsto', value: (totais.previsaoVotos || 0).toLocaleString('pt-BR'), color: '#c4b5fd' },
      { label: 'Faltam pessoas', value: totais.pessoasFaltamMeta, color: totais.pessoasFaltamMeta > 0 ? '#fbbf24' : '#34d399' },
    ]
    : [
      { label: 'Votos', value: totais.votos.toLocaleString('pt-BR'), color: 'var(--gold-bright)' },
      { label: 'Seções', value: totais.totalSecoes, color: 'var(--text-secondary)' },
      { label: 'Colégios', value: colegiosNoMapa.length, color: '#fb923c' },
    ]

  return (
    <div className="me-kpi-bar">
      <div className="me-kpi-bar__brand">
        <Vote size={14} className="me-kpi-bar__icon" />
        <span>Radar Eleitoral</span>
        {cidadesDisponiveis.length > 0 && (
          <label className="me-kpi-bar__city">
            <Building2 size={11} />
            <select value={cidadeAtiva} onChange={e => escolherCidade(e.target.value)}>
              {cidadesDisponiveis.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        )}
        {totais.fonte && (
          <span className="me-kpi-bar__badge me-kpi-bar__badge--ok">
            <CheckCircle size={8} /> TRE
          </span>
        )}
        {geoFonte && (
          <span className="me-kpi-bar__badge me-kpi-bar__badge--map">
            <Map size={8} /> {geoFonte}
          </span>
        )}
        {geoErro && (
          <span className="me-kpi-bar__badge me-kpi-bar__badge--warn" title={geoErro}>
            <AlertTriangle size={8} /> Sem polígonos
          </span>
        )}
      </div>
      <div className="me-kpi-bar__metrics">
        {chips.map(({ label, value, color }) => (
          <div key={label} className="me-kpi-chip">
            <strong style={{ color }}>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      {totais.semVoto > 0 && (
        <span className="me-kpi-bar__alert">
          <AlertTriangle size={9} /> {totais.semVoto} sem voto
        </span>
      )}
      {geoColegios.total > 0 && (
        <span className="me-kpi-bar__alert me-kpi-bar__alert--geo">
          <School size={9} /> GPS {geoColegios.done}/{geoColegios.total}
        </span>
      )}
      {locaisSemSetor.length > 0 && (
        <span className="me-kpi-bar__alert me-kpi-bar__alert--warn">
          <AlertTriangle size={9} /> {locaisSemSetor.length} sem bairro
        </span>
      )}
    </div>
  )
}

export function EleitoralLenteLegend() {
  const { lente } = useMapaEleitoral()
  if (lente === 'radar') {
    return (
      <div className="me-legend">
        <Radar size={12} />
        <span>Estável</span>
        <div className="me-legend__bar me-legend__bar--radar" />
        <span>Crítico</span>
      </div>
    )
  }
  if (lente === 'forca') {
    return (
      <div className="me-legend">
        <span>Longe da meta</span>
        <div className="me-legend__bar me-legend__bar--forca" />
        <span>Coberto</span>
      </div>
    )
  }
  if (lente === 'resultado') {
    return (
      <div className="me-legend">
        <span>0%</span>
        <div className="me-legend__bar me-legend__bar--pct" />
        <span>10%+</span>
      </div>
    )
  }
  return (
    <div className="me-legend">
      <span>Menos votos</span>
      <div className="me-legend__bar me-legend__bar--votos" />
      <span>Mais votos</span>
    </div>
  )
}
