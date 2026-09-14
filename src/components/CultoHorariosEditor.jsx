import { DIAS_CULTO, CULTOS_TEMPLATES, cultoTextoParaEditor, editorParaCultoTexto } from '../utils/cultoParse'

const inputStyle = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(0,0,0,0.25)',
  color: 'inherit',
  fontSize: 12,
}

export default function CultoHorariosEditor({ value = '', onChange, compact = false }) {
  const slots = cultoTextoParaEditor(value)

  function patchSlot(diaId, horarios) {
    const next = slots.map(s => (s.dia === diaId ? { ...s, horarios } : s))
    onChange?.(editorParaCultoTexto(next))
  }

  function toggleDia(diaId) {
    const slot = slots.find(s => s.dia === diaId)
    const ativo = slot?.horarios?.length > 0
    patchSlot(diaId, ativo ? [] : ['19:30'])
  }

  function setHorario(diaId, idx, hora) {
    const slot = slots.find(s => s.dia === diaId)
    const horarios = [...(slot?.horarios || [])]
    horarios[idx] = hora
    patchSlot(diaId, horarios.filter(Boolean))
  }

  function addHorario(diaId) {
    const slot = slots.find(s => s.dia === diaId)
    const horarios = [...(slot?.horarios || []), '10:00']
    patchSlot(diaId, horarios)
  }

  return (
    <div className="culto-editor">
      {!compact && (
        <div className="culto-editor__templates">
          {CULTOS_TEMPLATES.map(t => (
            <button
              key={t.id}
              type="button"
              className="culto-editor__tpl"
              onClick={() => onChange?.(t.culto)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div className="culto-editor__dias">
        {DIAS_CULTO.map(d => {
          const slot = slots.find(s => s.dia === d.id)
          const ativo = slot?.horarios?.length > 0
          return (
            <div key={d.id} className={`culto-editor__dia${ativo ? ' is-on' : ''}`}>
              <button type="button" className="culto-editor__dia-btn" onClick={() => toggleDia(d.id)}>
                {d.short}
              </button>
              {ativo && (
                <div className="culto-editor__horas">
                  {(slot.horarios || []).map((h, i) => (
                    <input
                      key={`${d.id}-${i}`}
                      type="time"
                      value={h || ''}
                      onChange={e => setHorario(d.id, i, e.target.value)}
                      style={inputStyle}
                    />
                  ))}
                  {(slot.horarios || []).length < 2 && (
                    <button type="button" className="culto-editor__add-h" onClick={() => addHorario(d.id)}>
                      +
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {value && (
        <p className="culto-editor__preview">{value}</p>
      )}
    </div>
  )
}
