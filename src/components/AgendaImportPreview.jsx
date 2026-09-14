import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, Trash2, Plus, Image as ImageIcon, AlertTriangle } from 'lucide-react'
import { CATEGORIAS_AGENDA } from '../utils/agendaCandidato'
import { eventoPreviewParaAgenda, normalizarData, normalizarHora } from '../utils/agendaImportFoto'

const INPUT = 'w-full rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400/40'
const INPUT_STY = {
  background: 'var(--bg-raised)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: 'var(--text-primary)',
}

/**
 * Prévia editável antes de confirmar importação da agenda do candidato (foto ou texto).
 */
export default function AgendaImportPreview({
  linhasIniciais,
  imagemUrl,
  arquivoNome,
  textoOcr,
  onCancelar,
  onConfirmar,
  confirmando,
}) {
  const [linhas, setLinhas] = useState(() =>
    (linhasIniciais || []).map((e, i) => ({
      _key: `ev-${i}-${e.horaInicio}-${e.titulo}`,
      incluir: true,
      titulo: e.titulo || '',
      dataInicio: e.dataInicio || '',
      horaInicio: e.horaInicio || '09:00',
      horaFim: e.horaFim || '10:00',
      local: e.local || '',
      categoria: e.categoria || 'reuniao',
      confianca: e.confianca || 'ok',
      _fonte: e._fonte || '',
    })),
  )
  const [mostrarOcr, setMostrarOcr] = useState(false)

  const resumo = useMemo(() => {
    const validas = linhas.filter(l => l.incluir && String(l.titulo || '').trim() && l.dataInicio && l.horaInicio)
    const semData = linhas.filter(l => l.incluir && !l.dataInicio).length
    const baixa = linhas.filter(l => l.incluir && l.confianca === 'baixa').length
    return {
      total: linhas.length,
      importar: validas.length,
      excluidos: linhas.length - validas.length,
      semData,
      baixa,
    }
  }, [linhas])

  function upd(i, patch) {
    setLinhas(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  function remover(i) {
    setLinhas(prev => prev.filter((_, idx) => idx !== i))
  }

  function adicionar() {
    const hoje = new Date().toISOString().slice(0, 10)
    setLinhas(prev => [
      ...prev,
      {
        _key: `novo-${Date.now()}`,
        incluir: true,
        titulo: '',
        dataInicio: prev[0]?.dataInicio || hoje,
        horaInicio: '09:00',
        horaFim: '10:00',
        local: '',
        categoria: 'reuniao',
        confianca: 'ok',
        _fonte: '',
      },
    ])
  }

  function confirmar() {
    const eventos = linhas
      .filter(l => l.incluir && String(l.titulo || '').trim())
      .map(l => eventoPreviewParaAgenda({
        ...l,
        dataInicio: normalizarData(l.dataInicio) || l.dataInicio,
        horaInicio: normalizarHora(l.horaInicio) || l.horaInicio,
        horaFim: normalizarHora(l.horaFim) || l.horaFim,
      }))
      .filter(e => e.titulo && e.dataInicio)

    if (!eventos.length) {
      window.alert('Nenhum compromisso válido. Preencha título, data e horário e marque para incluir.')
      return
    }
    const semData = eventos.filter(e => !/^\d{4}-\d{2}-\d{2}$/.test(e.dataInicio))
    if (semData.length) {
      window.alert('Corrija as datas no formato AAAA-MM-DD ou DD/MM/AAAA antes de confirmar.')
      return
    }
    onConfirmar(eventos)
  }

  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center p-3 md:p-6"
      style={{ zIndex: 2147483000, background: 'rgba(15,23,42,0.85)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancelar() }}
    >
      <div
        className="w-full max-w-5xl max-h-[94vh] rounded-3xl overflow-hidden flex flex-col"
        style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4"
          style={{ background: 'linear-gradient(135deg,#92400e 0%,#b45309 55%,#d97706 100%)' }}>
          <div>
            <h2 className="font-black text-white" style={{ fontSize: 18 }}>Prévia da importação</h2>
            <p className="text-amber-100 mt-0.5" style={{ fontSize: 12 }}>
              {arquivoNome ? `${arquivoNome} · ` : ''}
              Confira datas, nomes e horários — edite antes de gravar na agenda do candidato
            </p>
          </div>
          <button type="button" onClick={onCancelar} className="p-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.15)' }}>
            <X size={18} className="text-white" />
          </button>
        </div>

        <div className="px-5 py-2.5 flex flex-wrap gap-2 items-center"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="px-2.5 py-1 rounded-lg font-bold" style={{ fontSize: 11, background: 'rgba(245,158,11,0.18)', color: '#fcd34d' }}>
            {resumo.importar} para importar
          </span>
          {resumo.semData > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold"
              style={{ fontSize: 11, background: 'rgba(248,113,113,0.15)', color: '#f87171' }}>
              <AlertTriangle size={11} /> {resumo.semData} sem data
            </span>
          )}
          {resumo.baixa > 0 && (
            <span className="px-2.5 py-1 rounded-lg font-bold"
              style={{ fontSize: 11, background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
              {resumo.baixa} leitura incerta
            </span>
          )}
          <button type="button" onClick={adicionar}
            className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold"
            style={{ fontSize: 11, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
            <Plus size={12} /> Linha
          </button>
          {textoOcr && (
            <button type="button" onClick={() => setMostrarOcr(v => !v)}
              className="px-2.5 py-1 rounded-lg font-bold"
              style={{ fontSize: 11, background: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)' }}>
              {mostrarOcr ? 'Ocultar OCR' : 'Ver texto lido'}
            </button>
          )}
        </div>

        <div className="flex flex-1 min-h-0 flex-col lg:flex-row overflow-hidden">
          {(imagemUrl || mostrarOcr) && (
            <div className="lg:w-72 flex-shrink-0 overflow-auto p-3 space-y-3"
              style={{ borderRight: '1px solid rgba(255,255,255,0.08)', maxHeight: '36vh' }}>
              {imagemUrl && (
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div className="flex items-center gap-1.5 px-2 py-1.5" style={{ background: 'rgba(0,0,0,0.25)' }}>
                    <ImageIcon size={12} style={{ color: '#fcd34d' }} />
                    <span style={{ fontSize: 10, color: 'rgba(253,230,138,0.9)' }}>Prévia do arquivo</span>
                  </div>
                  <img src={imagemUrl} alt="Agenda" className="w-full object-contain"
                    style={{ maxHeight: 280, background: '#0f172a' }} />
                </div>
              )}
              {mostrarOcr && textoOcr && (
                <pre className="rounded-xl p-2 overflow-auto whitespace-pre-wrap font-mono"
                  style={{ fontSize: 10, color: 'rgba(203,213,235,0.7)', background: 'rgba(0,0,0,0.25)', maxHeight: 160 }}>
                  {textoOcr}
                </pre>
              )}
            </div>
          )}

          <div className="flex-1 overflow-auto p-3 md:p-4">
            {linhas.length === 0 ? (
              <div className="text-center py-16">
                <p className="font-bold txt-2" style={{ fontSize: 14 }}>Nenhum compromisso detectado</p>
                <p className="txt-3 mt-2" style={{ fontSize: 12 }}>
                  Adicione linhas manualmente ou tente outra foto mais nítida.
                </p>
                <button type="button" onClick={adicionar}
                  className="mt-4 px-4 py-2 rounded-xl font-bold text-white"
                  style={{ background: 'linear-gradient(135deg,#d97706,#f59e0b)', fontSize: 13 }}>
                  <Plus size={14} className="inline mr-1" /> Adicionar compromisso
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {linhas.map((l, i) => (
                  <div key={l._key}
                    className="rounded-2xl p-3"
                    style={{
                      background: l.incluir ? 'var(--bg-raised)' : 'rgba(0,0,0,0.2)',
                      border: `1px solid ${!l.dataInicio && l.incluir ? 'rgba(248,113,113,0.45)' : 'rgba(255,255,255,0.08)'}`,
                      opacity: l.incluir ? 1 : 0.55,
                    }}>
                    <div className="flex items-center gap-2 mb-2">
                      <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
                        <input type="checkbox" checked={l.incluir}
                          onChange={e => upd(i, { incluir: e.target.checked })}
                          className="rounded" />
                        <span className="font-bold" style={{ fontSize: 11, color: '#fcd34d' }}>#{i + 1}</span>
                      </label>
                      {l.confianca === 'baixa' && (
                        <span className="px-1.5 py-0.5 rounded font-bold"
                          style={{ fontSize: 9, background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>
                          Revisar
                        </span>
                      )}
                      <button type="button" onClick={() => remover(i)}
                        className="ml-auto p-1.5 rounded-lg hover:bg-red-500/15">
                        <Trash2 size={13} style={{ color: '#f87171' }} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                      <div className="col-span-2 md:col-span-2">
                        <label className="block mb-0.5 font-semibold" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Título / nome *</label>
                        <input value={l.titulo} onChange={e => upd(i, { titulo: e.target.value })}
                          className={INPUT} style={INPUT_STY} placeholder="Nome do compromisso" />
                      </div>
                      <div>
                        <label className="block mb-0.5 font-semibold" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Data *</label>
                        <input type="date" value={/^\d{4}-\d{2}-\d{2}$/.test(l.dataInicio) ? l.dataInicio : ''}
                          onChange={e => upd(i, { dataInicio: e.target.value })}
                          className={INPUT} style={INPUT_STY} />
                        {!/^\d{4}-\d{2}-\d{2}$/.test(l.dataInicio) && l.dataInicio && (
                          <input value={l.dataInicio}
                            onChange={e => upd(i, { dataInicio: e.target.value })}
                            className={`${INPUT} mt-1`} style={INPUT_STY}
                            placeholder="DD/MM/AAAA" />
                        )}
                      </div>
                      <div>
                        <label className="block mb-0.5 font-semibold" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Início</label>
                        <input type="time" value={l.horaInicio}
                          onChange={e => upd(i, { horaInicio: e.target.value })}
                          className={INPUT} style={INPUT_STY} />
                      </div>
                      <div>
                        <label className="block mb-0.5 font-semibold" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Fim</label>
                        <input type="time" value={l.horaFim}
                          onChange={e => upd(i, { horaFim: e.target.value })}
                          className={INPUT} style={INPUT_STY} />
                      </div>
                      <div>
                        <label className="block mb-0.5 font-semibold" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Categoria</label>
                        <select value={l.categoria} onChange={e => upd(i, { categoria: e.target.value })}
                          className={INPUT} style={INPUT_STY}>
                          {CATEGORIAS_AGENDA.map(c => (
                            <option key={c.id} value={c.id}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2 md:col-span-6">
                        <label className="block mb-0.5 font-semibold" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Local</label>
                        <input value={l.local} onChange={e => upd(i, { local: e.target.value })}
                          className={INPUT} style={INPUT_STY} placeholder="Endereço ou local" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button type="button" onClick={onCancelar}
            className="px-4 py-2.5 rounded-2xl font-semibold"
            style={{ border: '1.5px solid rgba(255,255,255,0.12)', color: 'var(--text-tertiary)', fontSize: 13 }}>
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={confirmando || resumo.importar === 0}
            className="flex-1 min-w-[180px] py-2.5 rounded-2xl font-bold text-white disabled:opacity-45 inline-flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg,#b45309,#f59e0b)', fontSize: 14, boxShadow: '0 4px 16px rgba(217,119,6,0.35)' }}>
            <Check size={16} />
            {confirmando ? 'Importando…' : `Confirmar importação (${resumo.importar})`}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
