import { useState } from 'react'
import {
  ChevronUp, ChevronDown, Trash2, CheckCircle2, Route, Loader2, MapPin, AlertTriangle, GripVertical,
} from 'lucide-react'
import { useRotasCtx } from '../RotasContext'

export default function ItineraryPanel() {
  const {
    paradasDetalhes,
    qtdParadas,
    rotaCalc,
    rotaLoad,
    routeHealth,
    organizarECalcularRota,
    moverParada,
    removerParada,
    marcarConcluida,
    corParada,
    resumoCultoIgreja,
    filtroDiaCulto,
    goStep,
    setFlyToPoint,
    liveDetalhe,
    aplicarOrdemParadas,
    alertasCulto,
    salvarTemplateAtivo,
  } = useRotasCtx()

  const [dragIdx, setDragIdx] = useState(null)

  const semGps = routeHealth?.semGps ?? 0
  const cultoWarns = (alertasCulto || []).filter(a => a.severity === 'warn')

  async function otimizarComAviso() {
    if (semGps > 0) {
      const ok = window.confirm(
        `${semGps} parada(s) sem GPS no mapa. A otimização pode piorar ou ignorar esses endereços.\n\n`
        + 'Recomendado: use "Colocar no mapa" na barra acima.\n\nContinuar mesmo assim?',
      )
      if (!ok) return
    }
    await organizarECalcularRota()
  }

  function onDrop(targetIdx) {
    if (dragIdx == null || dragIdx === targetIdx) return
    const keys = paradasDetalhes.map(p => p.key)
    const [moved] = keys.splice(dragIdx, 1)
    keys.splice(targetIdx, 0, moved)
    aplicarOrdemParadas(keys)
    setDragIdx(null)
  }

  if (!paradasDetalhes.length) {
    return (
      <div className="rt-empty">
        <MapPin size={32} />
        <p>Nenhuma parada na rota.</p>
        <button type="button" className="rt-cta rt-cta--ghost" style={{ marginTop: 16, maxWidth: 220, marginInline: 'auto' }} onClick={() => goStep('plan')}>
          Adicionar igrejas
        </button>
      </div>
    )
  }

  return (
    <div>
      {semGps > 0 && (
        <div className="rt-gps-warn">
          <AlertTriangle size={14} />
          <span>{semGps} parada(s) sem GPS — otimize após geocodificar.</span>
        </div>
      )}

      {cultoWarns.length > 0 && (
        <div className="rt-gps-warn rt-gps-warn--culto">
          <AlertTriangle size={14} />
          <span>{cultoWarns.length} parada(s) com risco de atraso no culto</span>
        </div>
      )}

      <div className="rt-stats">
        <div className="rt-stat">
          <p className="rt-stat__val">{qtdParadas}</p>
          <p className="rt-stat__lbl">Paradas</p>
        </div>
        <div className="rt-stat">
          <p className="rt-stat__val">{rotaCalc?.distancia || '—'}</p>
          <p className="rt-stat__lbl">km</p>
        </div>
        <div className="rt-stat">
          <p className="rt-stat__val">{rotaCalc?.duracao ?? '—'}</p>
          <p className="rt-stat__lbl">min</p>
        </div>
      </div>

      <button
        type="button"
        className="rt-cta rt-cta--primary"
        disabled={rotaLoad || paradasDetalhes.length < 2}
        onClick={otimizarComAviso}
      >
        {rotaLoad ? <Loader2 size={16} className="animate-spin" /> : <Route size={16} />}
        Otimizar e traçar rota
      </button>

      <button type="button" className="rt-health__link" style={{ marginTop: 8 }} onClick={() => salvarTemplateAtivo()}>
        Salvar como template
      </button>

      <div style={{ marginTop: 16 }}>
        {paradasDetalhes.map((p, idx) => {
          const live = liveDetalhe?.(p.key)
          const feita = p.status === 'concluido' || live?.status === 'concluido'
          const cor = corParada(p)
          const semPin = !p.lat || !p.lng
          const cultoAlert = alertasCulto?.find(a => a.key === p.key)
          return (
            <div
              key={p.key}
              className={`rt-stop${dragIdx === idx ? ' is-dragging' : ''}`}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => onDrop(idx)}
              onDragEnd={() => setDragIdx(null)}
            >
              <span className="rt-stop__grip" title="Arrastar"><GripVertical size={14} /></span>
              <div className="rt-stop__num" style={{ background: cor }}>{idx + 1}</div>
              <div className="rt-stop__main">
                <p style={{ fontSize: 13, fontWeight: 700 }}>{p.nome || p.endereco || p.key}</p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {p.setor || p.bairro || ''}
                  {semPin && <span style={{ color: '#fbbf24' }}> · sem GPS</span>}
                  {p.horaPrevista ? ` · ${p.horaPrevista}` : ''}
                  {resumoCultoIgreja(p.culto, filtroDiaCulto) ? ` · ${resumoCultoIgreja(p.culto, filtroDiaCulto)}` : ''}
                </p>
                {cultoAlert?.severity === 'warn' && (
                  <p className="rt-stop__culto-warn">{cultoAlert.msg}</p>
                )}
                {!feita && (
                  <div className="rt-stop__actions">
                    <button type="button" className="rt-icon-btn" title="Marcar visitada" onClick={() => marcarConcluida(p.key)}>
                      <CheckCircle2 size={14} />
                    </button>
                    <button type="button" className="rt-icon-btn" disabled={idx === 0} onClick={() => moverParada(p.key, -1)}>
                      <ChevronUp size={14} />
                    </button>
                    <button type="button" className="rt-icon-btn" disabled={idx === paradasDetalhes.length - 1} onClick={() => moverParada(p.key, 1)}>
                      <ChevronDown size={14} />
                    </button>
                    <button type="button" className="rt-icon-btn" onClick={() => removerParada(p.key)}>
                      <Trash2 size={14} />
                    </button>
                    {p.lat && p.lng && (
                      <button
                        type="button"
                        className="rt-icon-btn"
                        onClick={() => setFlyToPoint({ coords: [p.lat, p.lng], ts: Date.now(), panOnly: true })}
                      >
                        <MapPin size={14} />
                      </button>
                    )}
                  </div>
                )}
                {feita && (
                  <p style={{ fontSize: 11, color: '#34d399', marginTop: 6, fontWeight: 600 }}>✓ Visitada</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="rt-cta-row">
        <button type="button" className="rt-cta rt-cta--ghost" onClick={() => goStep('plan')}>
          + Paradas
        </button>
        <button type="button" className="rt-cta rt-cta--success" onClick={() => goStep('send')}>
          Enviar →
        </button>
      </div>
    </div>
  )
}
