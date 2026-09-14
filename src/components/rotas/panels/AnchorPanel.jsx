import { MapPin, Users } from 'lucide-react'
import { paradaKey, formatDistanciaKm } from '../../../utils/rotaUtils'
import { useRotasCtx } from '../RotasContext'

/** Modo vizinhança: ancora + igrejas num raio. */
export default function AnchorPanel() {
  const {
    igrejaAncora,
    setIgrejaAncoraId,
    igrejasProximasDaAncora,
    proxIgrejaKm,
    setProxIgrejaKm,
    adicionarAncoraEProximas,
    keysNaRota,
    toggleParada,
    setFlyToPoint,
  } = useRotasCtx()

  if (!igrejaAncora) {
    return (
      <p className="rt-empty">
        Selecione uma igreja na lista (modo Igrejas) e use &quot;Usar como âncora&quot; para ver vizinhas.
      </p>
    )
  }

  return (
    <div className="rt-anchor">
      <div className="rt-anchor__head">
        <p className="rt-anchor__title">Âncora: {igrejaAncora.nome}</p>
        <p className="rt-anchor__sub">{igrejaAncora.setor || igrejaAncora.bairro || '—'}</p>
        <button type="button" className="rt-cta rt-cta--ghost" onClick={() => setIgrejaAncoraId(null)}>
          Trocar âncora
        </button>
      </div>

      <label className="rt-anchor__range">
        Raio: {proxIgrejaKm} km
        <input
          type="range"
          min={1}
          max={10}
          value={proxIgrejaKm}
          onChange={e => setProxIgrejaKm(Number(e.target.value))}
        />
      </label>

      <button type="button" className="rt-cta rt-cta--primary" onClick={adicionarAncoraEProximas}>
        <Users size={16} />
        Adicionar âncora + {igrejasProximasDaAncora.length} vizinhas
      </button>

      <div className="rt-list" style={{ marginTop: 12 }}>
        {[igrejaAncora, ...igrejasProximasDaAncora.map(v => v.igreja)].map(ig => {
          const key = paradaKey('igreja', ig.id)
          const on = keysNaRota.has(key)
          const dist = igrejasProximasDaAncora.find(v => String(v.igreja.id) === String(ig.id))
          return (
            <button
              key={key}
              type="button"
              className={`rt-item${on ? ' is-on-route' : ''}`}
              onClick={() => {
                toggleParada(key)
                if (ig.lat && ig.lng) {
                  setFlyToPoint({ coords: [ig.lat, ig.lng], ts: Date.now(), panOnly: true })
                }
              }}
            >
              <div className="rt-item__body">
                <p className="rt-item__name">{ig.nome}</p>
                <p className="rt-item__sub">
                  {dist ? formatDistanciaKm(dist.km) : 'Âncora'}
                </p>
              </div>
              <span className="rt-item__action">{on ? '✓' : '+'}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
