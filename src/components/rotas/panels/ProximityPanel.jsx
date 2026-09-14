import {
  Search, ChevronUp, ChevronDown, Plus, MapPin,
} from 'lucide-react'
import { SETORES } from '../../../constants/igrejasTheme'
import { paradaKey, formatDistanciaKm } from '../../../utils/rotaUtils'
import { useRotasCtx } from '../RotasContext'

/** Planejamento por bairro / pares próximos (modo cluster). */
export default function ProximityPanel() {
  const {
    proxModo, setProxModo,
    proxDenom, setProxDenom,
    proxMaxKm, setProxMaxKm,
    proxSetor, setProxSetor,
    proxExpandido, setProxExpandido,
    busca, setBusca,
    proximidade,
    gruposParaImprimir,
    gruposProximos,
    adicionarTodasDoBairro,
    adicionarParIgrejas,
    keysNaRota,
    toggleParada,
    verParNoMapa,
  } = useRotasCtx()

  return (
    <div className="rt-prox">
      <div className="rt-prox__head">
        <p className="rt-prox__title">Montar por bairro</p>
        <p className="rt-prox__sub">Agrupe igrejas próximas e adicione o bairro inteiro à rota.</p>
        <div className="rt-prox__modes">
          {[{ id: 'lista', label: 'Por bairro' }, { id: 'pares', label: 'Pares próximos' }].map(opt => (
            <button
              key={opt.id}
              type="button"
              className={`rt-chip${proxModo === opt.id ? ' is-active' : ''}`}
              onClick={() => { setProxModo(opt.id); setProxExpandido(null) }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="rt-prox__filters">
          <select value={proxDenom} onChange={e => { setProxDenom(e.target.value); setProxExpandido(null) }} className="rt-select">
            <option value="ad">AD Blumenau</option>
            <option value="outras">Outras denom.</option>
            <option value="todas">Todas</option>
          </select>
          {proxModo === 'pares' ? (
            <select value={proxMaxKm} onChange={e => setProxMaxKm(Number(e.target.value))} className="rt-select">
              {[1, 2, 3, 5, 10].map(k => <option key={k} value={k}>{k} km entre igrejas</option>)}
            </select>
          ) : (
            <select value={proxSetor} onChange={e => setProxSetor(e.target.value)} className="rt-select">
              <option value="Todos">Todos os bairros</option>
              {(proximidade?.grupos || []).map(g => (
                <option key={g.setor} value={g.setor}>{g.setor} ({g.total})</option>
              ))}
            </select>
          )}
        </div>
        <div className="rt-search">
          <Search size={16} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
          <input
            type="search"
            placeholder="Buscar bairro ou igreja…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
      </div>

      {proxModo === 'lista' ? (
        gruposParaImprimir.length === 0 ? (
          <p className="rt-empty">Nenhuma igreja com GPS no filtro.</p>
        ) : gruposParaImprimir.map((grupo, idx) => {
          const aberto = proxExpandido === grupo.setor
            || (proxSetor !== 'Todos' && proxSetor === grupo.setor)
            || (proxExpandido == null && idx === 0)
          const cor = SETORES[grupo.setor] || '#3b82f6'
          const lista = grupo.igrejas || []
          return (
            <div key={grupo.setor} className="rt-prox-group">
              <button
                type="button"
                className="rt-prox-group__head"
                onClick={() => setProxExpandido(aberto && proxSetor === 'Todos' ? null : grupo.setor)}
              >
                <span className="rt-prox-group__dot" style={{ background: cor }} />
                <div className="rt-prox-group__info">
                  <p className="rt-prox-group__name">{grupo.setor}</p>
                  <p className="rt-prox-group__meta">{lista.length} igrejas</p>
                </div>
                {aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {aberto && (
                <div className="rt-prox-group__body">
                  <button type="button" className="rt-cta rt-cta--ghost" onClick={() => adicionarTodasDoBairro(grupo)}>
                    <Plus size={14} /> Adicionar bairro ({lista.length})
                  </button>
                  {lista.map(ig => {
                    const key = paradaKey('igreja', ig.id)
                    const naRota = keysNaRota.has(key)
                    return (
                      <div key={ig.id} className={`rt-item${naRota ? ' is-on-route' : ''}`} style={{ cursor: 'default' }}>
                        <div className="rt-item__body">
                          <p className="rt-item__name">{ig.nome}</p>
                        </div>
                        <button
                          type="button"
                          className="rt-item__action"
                          disabled={naRota}
                          onClick={() => toggleParada(key)}
                        >
                          {naRota ? '✓' : '+'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })
      ) : (
        gruposProximos.length === 0 ? (
          <p className="rt-empty">Nenhum par próximo neste raio.</p>
        ) : gruposProximos.map(grupo => (
          <div key={grupo.setor} className="rt-prox-group">
            <p className="rt-prox-group__name" style={{ padding: '8px 12px' }}>{grupo.setor}</p>
            {(grupo.pares || []).slice(0, 40).map((par, i) => {
              const ka = paradaKey('igreja', par.a.id)
              const kb = paradaKey('igreja', par.b.id)
              const naRota = keysNaRota.has(ka) && keysNaRota.has(kb)
              return (
                <div key={`${ka}-${kb}-${i}`} className="rt-prox-pair">
                  <div className="rt-prox-pair__names">
                    <span>{par.a.nome}</span>
                    <span className="rt-prox-pair__km">{formatDistanciaKm(par.km)}</span>
                    <span>{par.b.nome}</span>
                  </div>
                  <div className="rt-prox-pair__actions">
                    <button type="button" className="rt-icon-btn" title="Ver no mapa" onClick={() => verParNoMapa(par.a, par.b)}>
                      <MapPin size={14} />
                    </button>
                    <button
                      type="button"
                      className="rt-cta rt-cta--ghost"
                      style={{ padding: '4px 8px', fontSize: 10 }}
                      disabled={naRota}
                      onClick={() => adicionarParIgrejas(par.a, par.b)}
                    >
                      + Par
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ))
      )}
    </div>
  )
}
