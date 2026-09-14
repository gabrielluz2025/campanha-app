import { useState, useRef } from 'react'
import { Loader2, MapPin, ExternalLink } from 'lucide-react'
import { useChurchVisit } from '../../context/ChurchVisitContext'
import { navigateAppTab } from '../../utils/navigateAppTab'
import { useRotasCtx } from './RotasContext'

export default function RouteHealthBar() {
  const { routeHealth, qtdParadas, goStep } = useRotasCtx()
  const { geocodeAllMissing } = useChurchVisit()
  const [geoBatch, setGeoBatch] = useState(null)
  const geoAbortRef = useRef(null)
  const h = routeHealth || {}

  if (!h.total && !h.igrejasCatalogo) return null

  const semCatalogo = Math.max(0, (h.igrejasCatalogo || 0) - (h.igrejasComPin || 0))
  const geoPct = geoBatch?.total
    ? Math.min(100, Math.round((geoBatch.done / geoBatch.total) * 100))
    : 0

  function cancelarGeocode() {
    geoAbortRef.current?.abort()
  }

  async function iniciarGeocode() {
    if (geoBatch || semCatalogo <= 0) return
    if (!window.confirm(
      `Localizar ${semCatalogo} igreja(s) no mapa pelo endereço?\n\n`
      + 'Pode levar vários minutos. Mantenha esta aba aberta.',
    )) return

    const ac = new AbortController()
    geoAbortRef.current = ac
    setGeoBatch({ done: 0, total: semCatalogo, ok: 0, fail: 0 })

    try {
      await geocodeAllMissing({
        signal: ac.signal,
        onProgress: (p) => setGeoBatch({
          done: p.done,
          total: p.total,
          ok: p.ok,
          fail: p.fail,
        }),
      })
    } finally {
      geoAbortRef.current = null
      setGeoBatch(null)
    }
  }

  return (
    <div className="rt-health">
      <div className="rt-health__stats">
        <span><strong>{qtdParadas}</strong> paradas</span>
        {h.comGps != null && qtdParadas > 0 && (
          <span className={h.semGps > 0 ? 'rt-health__warn' : ''}>
            <strong>{h.comGps}</strong> com GPS na rota
            {h.semGps > 0 ? ` · ${h.semGps} sem pin` : ''}
          </span>
        )}
        {semCatalogo > 0 && (
          <span className="rt-health__warn">
            <strong>{h.igrejasComPin ?? 0}</strong>/{h.igrejasCatalogo} igrejas no mapa
          </span>
        )}
        {h.distEstKm != null && (
          <span><strong>{h.distEstKm}</strong> km{h.minEst != null ? ` · ~${h.minEst} min` : ''}</span>
        )}
        {h.otimizada && <span className="rt-health__ok">Rota traçada</span>}
      </div>

      {geoBatch ? (
        <div className="rt-health__geo">
          <div className="rt-health__geo-head">
            <Loader2 size={12} className="animate-spin" />
            <span>Localizando… {geoBatch.done}/{geoBatch.total}</span>
            <button type="button" className="rt-health__link" onClick={cancelarGeocode}>Parar</button>
          </div>
          <div className="rt-health__bar">
            <div className="rt-health__bar-fill" style={{ width: `${geoPct}%` }} />
          </div>
        </div>
      ) : (
        <div className="rt-health__actions">
          {h.semGps > 0 && qtdParadas > 0 && (
            <button type="button" className="rt-health__link" onClick={() => goStep('plan')}>
              Revisar paradas sem GPS
            </button>
          )}
          {semCatalogo > 0 && (
            <>
              <button type="button" className="rt-health__btn" onClick={iniciarGeocode}>
                <MapPin size={12} />
                Colocar no mapa ({semCatalogo})
              </button>
              <button
                type="button"
                className="rt-health__link"
                onClick={() => navigateAppTab('mapa', { geocode: true })}
              >
                <ExternalLink size={11} />
                Mapa de Visitas
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
