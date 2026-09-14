import { useState } from 'react'
import { Sparkles, Route, Loader2 } from 'lucide-react'
import { sugerirRotaDoDia } from '../../../utils/rotaAssistente'
import { useRotasCtx } from '../RotasContext'

export default function RotaDiaPanel() {
  const {
    igrejasVisiveis,
    bairrosChip,
    paradas,
    aplicarSugestaoRotaDia,
    rotaLoad,
  } = useRotasCtx()

  const [bairro, setBairro] = useState('Todos')
  const [maxParadas, setMaxParadas] = useState(12)
  const [filtroVisita, setFiltroVisita] = useState('pendentes')
  const [preview, setPreview] = useState(null)

  function calcularPreview() {
    setPreview(sugerirRotaDoDia({
      igrejas: igrejasVisiveis,
      bairro,
      maxParadas: Number(maxParadas) || 12,
      filtroVisita,
    }))
  }

  async function aplicar() {
    if (!preview?.ids?.length) calcularPreview()
    await aplicarSugestaoRotaDia({
      bairro,
      maxParadas: Number(maxParadas) || 12,
      filtroVisita,
    })
  }

  return (
    <div className="rt-rota-dia">
      <p className="rt-rota-dia__lead">
        <Sparkles size={14} />
        Assistente monta uma rota sugerida por bairro e proximidade.
      </p>

      <label className="rt-rota-dia__label">Bairro / setor</label>
      <select className="rt-select" value={bairro} onChange={e => setBairro(e.target.value)}>
        <option value="Todos">Todos (filtrados)</option>
        {bairrosChip.slice(0, 20).map(b => (
          <option key={b} value={b}>{b}</option>
        ))}
      </select>

      <label className="rt-rota-dia__label">Máximo de paradas</label>
      <input
        type="range"
        min="3"
        max="25"
        value={maxParadas}
        onChange={e => setMaxParadas(Number(e.target.value))}
        className="rt-rota-dia__range"
      />
      <p className="rt-rota-dia__hint">{maxParadas} paradas · {paradas?.filter(p => !String(p.key).startsWith('equipe:')).length || 0} já na rota</p>

      <div className="rt-chips" style={{ marginBottom: 10 }}>
        <button
          type="button"
          className={`rt-chip${filtroVisita === 'pendentes' ? ' is-active' : ''}`}
          onClick={() => setFiltroVisita('pendentes')}
        >
          Não visitadas
        </button>
        <button
          type="button"
          className={`rt-chip${filtroVisita === 'todas' ? ' is-active' : ''}`}
          onClick={() => setFiltroVisita('todas')}
        >
          Todas
        </button>
      </div>

      {preview && (
        <p className="rt-rota-dia__preview">{preview.motivo}</p>
      )}

      <div className="rt-cta-row">
        <button type="button" className="rt-cta rt-cta--ghost" onClick={calcularPreview}>
          Pré-visualizar
        </button>
        <button
          type="button"
          className="rt-cta rt-cta--primary"
          disabled={rotaLoad}
          onClick={() => void aplicar()}
        >
          {rotaLoad ? <Loader2 size={14} className="animate-spin" /> : <Route size={14} />}
          Montar e otimizar
        </button>
      </div>
    </div>
  )
}
