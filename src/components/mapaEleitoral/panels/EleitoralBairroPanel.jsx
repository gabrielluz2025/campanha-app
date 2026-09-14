import { Layers, MapPin, School, Users, Vote, Church } from 'lucide-react'
import { useMapaEleitoral } from '../context/MapaEleitoralContext'
import { LENTES } from '../constants'
import { EleitoralSecoesButton } from './EleitoralSecoesModal'

export default function EleitoralBairroPanel() {
  const {
    bairroDetail, bairroSel, radarMap, colegioDetail, secoesNoBairroSel, secoesNoColegio,
    colegiosNoMapa, selecionarColegio, setColegioSel, isBlumenau,
  } = useMapaEleitoral()

  if (colegioDetail) {
    return (
      <div className="me-detail">
        <p className="me-detail__label">Colégio eleitoral</p>
        <h3 className="me-detail__title">{colegioDetail.nome}</h3>
        <p className="me-detail__sub">
          {colegioDetail.bairro || 'Bairro não identificado'} · Zona {colegioDetail.zona}
        </p>
        <div className="me-detail__grid">
          <div><strong>{colegioDetail.votos}</strong><span>Votos</span></div>
          <div><strong>{colegioDetail.numSecoes}</strong><span>Seções</span></div>
          <div><strong>{secoesNoColegio.filter(s => !Number(s.votosObtidos)).length}</strong><span>Sem voto</span></div>
        </div>
        {colegioDetail.endereco && (
          <p className="me-detail__addr">{colegioDetail.endereco}</p>
        )}
        <button type="button" className="me-btn-ghost" onClick={() => setColegioSel(null)}>
          Voltar ao bairro
        </button>
      </div>
    )
  }

  if (!bairroDetail || !bairroSel) {
    return (
      <div className="me-detail me-detail--hint">
        <MapPin size={20} />
        <p>Toque em um bairro no mapa ou escolha no ranking para ver detalhes e seções.</p>
      </div>
    )
  }

  const score = radarMap[bairroSel] || 0
  const colegiosBairro = colegiosNoMapa.filter(c => c.bairro === bairroSel)

  return (
    <div className="me-detail">
      <p className="me-detail__label">Bairro selecionado</p>
      <h3 className="me-detail__title">{bairroSel}</h3>
      <div className="me-detail__badge" style={{ background: `linear-gradient(135deg, rgba(251,191,36,0.2), rgba(234,88,12,0.15))` }}>
        Radar {score}/100
      </div>
      <div className="me-detail__grid">
        <div><strong>{bairroDetail.votosObtidos}</strong><span>Votos</span></div>
        <div><strong>{(bairroDetail.pct || 0).toFixed(1)}%</strong><span>% aptos</span></div>
        <div><strong>{bairroDetail.secoes}</strong><span>Seções</span></div>
        <div><strong>{bairroDetail.semVoto}</strong><span>Sem voto</span></div>
      </div>
      {isBlumenau && (
        <div className="me-detail__grid me-detail__grid--forca">
          <div><strong>{bairroDetail.pessoasTem}</strong><span>Equipe</span></div>
          <div><strong>{bairroDetail.pessoasFaltamMeta}</strong><span>Faltam</span></div>
          <div><strong>{Math.round(bairroDetail.previsaoVotos || 0)}</strong><span>Previsto</span></div>
          <div><strong>{bairroDetail.coberto ? 'Sim' : 'Não'}</strong><span>Coberto</span></div>
        </div>
      )}
      {colegiosBairro.length > 0 && (
        <div className="me-detail__colegios">
          <p className="me-detail__section"><School size={12} /> Colégios ({colegiosBairro.length})</p>
          {colegiosBairro.slice(0, 6).map(c => (
            <button
              key={c.id}
              type="button"
              className="me-colegio-link"
              onClick={() => selecionarColegio(c)}
            >
              <span>{c.nome}</span>
              <strong>{c.votos} v</strong>
            </button>
          ))}
        </div>
      )}
      {secoesNoBairroSel.length > 0 && (
        <div className="me-detail__secoes">
          <p className="me-detail__section"><Vote size={12} /> Seções</p>
          <div className="me-secoes-scroll">
            {secoesNoBairroSel.slice(0, 20).map(s => (
              <div key={s.id} className={`me-secao-row${Number(s.votosObtidos) ? '' : ' me-secao-row--zero'}`}>
                <span>#{s.secao}</span>
                <span className="me-secao-row__col">{s.colegio?.slice(0, 28)}</span>
                <strong>{s.votosObtidos || 0}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
      {isBlumenau && (
        <div className="me-detail__footer">
          <EleitoralSecoesButton />
        </div>
      )}
    </div>
  )
}

export function EleitoralLayersPanel() {
  const {
    lente, setLente, layers, setLayers, isBlumenau,
    igrejasModo, setIgrejasModo, igrejasStats, igrejasLoading,
  } = useMapaEleitoral()

  const lentesVisiveis = LENTES.filter(l => {
    if (l.id === 'forca') return isBlumenau
    return true
  })

  return (
    <div className="me-layers-float">
      <div className="me-layers-float__head">
        <Layers size={13} />
        <span>Lentes</span>
      </div>
      <div className="me-lentes">
        {lentesVisiveis.map(l => (
          <button
            key={l.id}
            type="button"
            className={`me-lente-btn${lente === l.id ? ' me-lente-btn--on' : ''}`}
            onClick={() => setLente(l.id)}
            title={l.desc}
          >
            {l.id === 'radar' && <Users size={12} />}
            {l.id === 'resultado' && <Vote size={12} />}
            {l.id === 'forca' && <Users size={12} />}
            {l.id === 'colegios' && <School size={12} />}
            {l.label}
          </button>
        ))}
      </div>
      <div className="me-layer-toggles">
        <label>
          <input
            type="checkbox"
            checked={layers.nomes}
            onChange={e => setLayers(p => ({ ...p, nomes: e.target.checked }))}
          />
          Nomes
        </label>
        <label>
          <input
            type="checkbox"
            checked={layers.colegios}
            onChange={e => setLayers(p => ({ ...p, colegios: e.target.checked }))}
          />
          Colégios
        </label>
        <label title="Igrejas do Mapa de Visitas — dourado = visitada">
          <input
            type="checkbox"
            checked={layers.igrejas}
            onChange={e => setLayers(p => ({ ...p, igrejas: e.target.checked }))}
          />
          <Church size={10} /> Igrejas
        </label>
      </div>
      {layers.igrejas && (
        <div className="me-igrejas-mode">
          <select
            className="me-select me-select--full"
            value={igrejasModo}
            onChange={e => setIgrejasModo(e.target.value)}
          >
            <option value="todas">Todas ({igrejasStats.total})</option>
            <option value="visitadas">Visitadas ({igrejasStats.visitadas})</option>
            <option value="pendentes">Pendentes ({igrejasStats.pendentes})</option>
          </select>
          {igrejasLoading && (
            <span className="me-igrejas-loading">Carregando igrejas…</span>
          )}
        </div>
      )}
    </div>
  )
}
