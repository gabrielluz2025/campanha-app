import { Package, Plus } from 'lucide-react'
import { BAIRROS_MAT } from '../../montarRotas/constants'
import { useRotasCtx } from '../RotasContext'

export default function MaterialsPanel() {
  const {
    materiaisDisp,
    matForm,
    setMatForm,
    adicionarMaterial,
    paradasDetalhes,
    removerParada,
  } = useRotasCtx()

  const paradasMat = paradasDetalhes.filter(p => p.material || p.tipoParada === 'material')

  return (
    <div className="rt-materiais">
      <div className="rt-send-card">
        <label><Package size={12} style={{ display: 'inline', marginRight: 4 }} />Entrega de material</label>
        <select
          className="rt-select"
          value={matForm.itemId}
          onChange={e => setMatForm(f => ({ ...f, itemId: e.target.value }))}
        >
          <option value="">Material…</option>
          {materiaisDisp.map(it => (
            <option key={it.id} value={it.id}>
              {it.nome} (saldo {it.restante})
            </option>
          ))}
        </select>
        <div className="rt-materiais__row">
          <select
            className="rt-select"
            value={matForm.bairro}
            onChange={e => setMatForm(f => ({ ...f, bairro: e.target.value }))}
          >
            {BAIRROS_MAT.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <input
            type="number"
            min="1"
            placeholder="Qtd"
            className="rt-select"
            value={matForm.quantidade}
            onChange={e => setMatForm(f => ({ ...f, quantidade: e.target.value }))}
          />
        </div>
        <button type="button" className="rt-cta rt-cta--ghost" onClick={adicionarMaterial}>
          <Plus size={14} /> Adicionar parada de material
        </button>
      </div>

      {paradasMat.length > 0 && (
        <div className="rt-list" style={{ marginTop: 12 }}>
          {paradasMat.map(p => (
            <div key={p.key} className="rt-item is-on-route">
              <div className="rt-item__body">
                <p className="rt-item__name">{p.nome || p.material?.nome || 'Material'}</p>
                <p className="rt-item__sub">
                  {p.bairro || p.setor || '—'}
                  {p.material?.quantidade ? ` · ${p.material.quantidade} un.` : ''}
                </p>
              </div>
              <button type="button" className="rt-icon-btn" onClick={() => removerParada(p.key)}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
