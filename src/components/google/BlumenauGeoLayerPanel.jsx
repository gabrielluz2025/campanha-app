import { useState } from 'react'
import { ChevronDown, ChevronUp, Layers, RotateCcw, X } from 'lucide-react'
import { BLUMENAU_MAP_ATTRIBUTION } from '../../utils/blumenauGeoApi'

function ToggleRow({ label, on, onToggle, hint }) {
  return (
    <button type="button" onClick={onToggle}
      className="blu-geo-toggle-row">
      <span className="blu-geo-toggle-label">
        <span className="blu-geo-toggle-name">{label}</span>
        {hint && <span className="blu-geo-toggle-hint">{hint}</span>}
      </span>
      <span className={`blu-geo-check ${on ? 'is-on' : ''}`} aria-hidden="true">
        {on && <span className="blu-geo-check-dot" />}
      </span>
    </button>
  )
}

/** Painel de camadas GEO Blumenau — categorias da prefeitura + camadas vetoriais do app. */
export default function BlumenauGeoLayerPanel({
  grouped = [],
  active = {},
  onToggle,
  onReset,
  appLayers = [],
  compact = false,
  onClose,
}) {
  const [openCats, setOpenCats] = useState(() => {
    const init = {}
    grouped.forEach(g => { init[g.key] = g.key === 'viario' || g.key === 'planejamento' })
    return init
  })

  function toggleCat(key) {
    setOpenCats(p => ({ ...p, [key]: !p[key] }))
  }

  return (
    <div className={`blu-geo-panel ${compact ? 'blu-geo-panel--compact' : ''}`}>
      <div className="blu-geo-panel-head">
        <div className="flex items-center gap-2 min-w-0">
          <Layers size={14} style={{ color: '#60c8ff', flexShrink: 0 }} />
          <div className="min-w-0">
            <p className="blu-geo-panel-title">GEO Blumenau</p>
            <p className="blu-geo-panel-sub">geo.blumenau.sc.gov.br</p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onReset && (
            <button type="button" onClick={onReset} className="blu-geo-icon-btn" title="Restaurar padrão">
              <RotateCcw size={13} />
            </button>
          )}
          {onClose && (
            <button type="button" onClick={onClose} className="blu-geo-icon-btn" title="Fechar">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="blu-geo-panel-body">
        {appLayers.length > 0 && (
          <section className="blu-geo-section">
            <p className="blu-geo-cat-label">Camadas do app</p>
            {appLayers.map(l => (
              <ToggleRow key={l.id} label={l.label} hint={l.hint} on={l.on} onToggle={l.onToggle} />
            ))}
          </section>
        )}

        {grouped.map(cat => (
          <section key={cat.key} className="blu-geo-section">
            <button type="button" onClick={() => toggleCat(cat.key)} className="blu-geo-cat-btn">
              <span>{cat.label}</span>
              <span className="blu-geo-cat-meta">
                {cat.layers.filter(l => active[l.id]).length}/{cat.layers.length}
                {openCats[cat.key] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </span>
            </button>
            {openCats[cat.key] && cat.layers.map(l => (
              <ToggleRow
                key={l.id}
                label={l.label}
                on={!!active[l.id]}
                onToggle={() => onToggle(l.id)}
              />
            ))}
          </section>
        ))}
      </div>

      <p className="blu-geo-credit">{BLUMENAU_MAP_ATTRIBUTION}</p>
    </div>
  )
}

/** Botão flutuante que abre o painel GEO. */
export function BlumenauGeoLayerButton({
  activeCount = 0,
  open,
  onToggleOpen,
  className = '',
}) {
  return (
    <button type="button" onClick={onToggleOpen}
      className={`blu-geo-float-btn ${open ? 'is-open' : ''} ${className}`}>
      <Layers size={13} />
      GEO
      {activeCount > 0 && <span className="blu-geo-badge">{activeCount}</span>}
    </button>
  )
}
