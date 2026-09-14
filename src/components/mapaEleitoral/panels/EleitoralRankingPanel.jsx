import { Crosshair, ListOrdered, RotateCcw, Search, Target } from 'lucide-react'
import { useMapaEleitoral } from '../context/MapaEleitoralContext'
import { radarLabel } from '../utils/eleitoralRadar'
import { pctColor, radarColor } from '../utils/eleitoralColors'

const SORT_OPTS = [
  { id: 'radar', label: 'Radar' },
  { id: 'votos', label: 'Votos' },
  { id: 'pct', label: '%' },
  { id: 'faltam', label: 'Faltam' },
  { id: 'semVoto', label: 'Sem voto' },
]

export default function EleitoralRankingPanel() {
  const {
    rankingList, radarMap, rankingSort, setRankingSort,
    bairroSel, selecionarBairro, isBlumenau,
  } = useMapaEleitoral()

  return (
    <div className="me-panel">
      <div className="me-panel__toolbar">
        <ListOrdered size={14} />
        <span className="me-panel__title">Ranking territorial</span>
        <select
          className="me-select"
          value={rankingSort}
          onChange={e => setRankingSort(e.target.value)}
        >
          {SORT_OPTS.filter(o => o.id !== 'faltam' || isBlumenau).map(o => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="me-rank-list">
        {rankingList.slice(0, 24).map((r, idx) => {
          const score = radarMap[r.bairro] || 0
          const active = bairroSel === r.bairro
          return (
            <button
              key={r.bairro}
              type="button"
              className={`me-rank-row${active ? ' me-rank-row--active' : ''}`}
              onClick={() => selecionarBairro(r.bairro)}
            >
              <span className="me-rank-row__pos">{idx + 1}</span>
              <span
                className="me-rank-row__dot"
                style={{ background: rankingSort === 'radar' ? radarColor(score) : pctColor(r.pct) }}
              />
              <span className="me-rank-row__name">{r.bairro}</span>
              <span className="me-rank-row__meta">
                {rankingSort === 'radar' && (
                  <><Target size={10} /> {score} · {radarLabel(score)}</>
                )}
                {rankingSort === 'votos' && `${r.votosObtidos} votos`}
                {rankingSort === 'pct' && `${(r.pct || 0).toFixed(1)}%`}
                {rankingSort === 'faltam' && `−${r.pessoasFaltamMeta || 0} pessoas`}
                {rankingSort === 'semVoto' && `${r.semVoto || 0} s/ voto`}
              </span>
            </button>
          )
        })}
        {!rankingList.length && (
          <p className="me-empty">Importe o PDF do TRE na aba Eleitores para ver o ranking.</p>
        )}
      </div>
    </div>
  )
}

export function EleitoralFiltrosPanel() {
  const {
    buscaBairro, setBuscaBairro, bairrosFiltradosLista, filtroBairros,
    toggleFiltroBairro, limparFiltros, filtrarRegiao, REGIOES, isBlumenau,
  } = useMapaEleitoral()

  return (
    <div className="me-panel">
      <div className="me-panel__toolbar">
        <Search size={14} />
        <input
          className="me-search"
          placeholder="Buscar bairro…"
          value={buscaBairro}
          onChange={e => setBuscaBairro(e.target.value)}
        />
        {filtroBairros.length > 0 && (
          <button type="button" className="me-btn-ghost" onClick={limparFiltros}>
            <RotateCcw size={12} /> Limpar
          </button>
        )}
      </div>
      {isBlumenau && (
        <div className="me-regioes">
          {Object.entries(REGIOES).map(([reg, bairros]) => (
            <button
              key={reg}
              type="button"
              className="me-regiao-chip"
              onClick={() => filtrarRegiao(bairros)}
            >
              <Crosshair size={10} /> {reg}
            </button>
          ))}
        </div>
      )}
      <div className="me-bairro-chips">
        {bairrosFiltradosLista.slice(0, 40).map(b => {
          const on = filtroBairros.includes(b)
          return (
            <button
              key={b}
              type="button"
              className={`me-bairro-chip${on ? ' me-bairro-chip--on' : ''}`}
              onClick={() => toggleFiltroBairro(b)}
            >
              {b}
            </button>
          )
        })}
      </div>
    </div>
  )
}
