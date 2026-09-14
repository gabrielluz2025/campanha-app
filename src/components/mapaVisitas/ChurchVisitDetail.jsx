import { useEffect, useMemo, useState } from 'react'
import {
  X, CheckCircle2, Circle, MapPin, Clock, User, ExternalLink, ChevronDown, ChevronUp,
  Pencil, Loader2, Trash2,
} from 'lucide-react'
import { useChurchVisit } from '../../context/ChurchVisitContext'
import IgrejaFormEdicao from '../IgrejaFormEdicao'
import { DENOMINACOES, MAX_ID_BASE, SETORES } from '../../constants/igrejasTheme'
import { igrejaSemPinMapa } from '../../utils/igrejasGeocodeFix'

function hojeLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function agoraHora() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function ChurchVisitDetail({ onClose }) {
  const {
    selected, markVisited, unmarkVisited, userName,
    churchToEditForm, saveChurch, geocodeChurch, removeChurch, removeHistoryEntry,
  } = useChurchVisit()
  const [form, setForm] = useState({ data: hojeLocal(), horaInicio: agoraHora(), obs: '' })
  const [histAberto, setHistAberto] = useState(false)
  const [editando, setEditando] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [editErro, setEditErro] = useState('')
  const [editOk, setEditOk] = useState('')
  const [geoLoad, setGeoLoad] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    setEditando(false)
    setEditErro('')
    setEditOk('')
    if (selected) setEditForm(churchToEditForm(selected))
  }, [selected?.id, churchToEditForm, selected])

  const setoresOpcoes = useMemo(
    () => ['—', ...Object.keys(SETORES).sort((a, b) => a.localeCompare(b, 'pt-BR'))],
    [],
  )

  if (!selected) return null

  const visita = selected.visita
  const historico = visita?.historico || []
  const semGps = igrejaSemPinMapa(selected)
  const mapsUrl = selected.lat && selected.lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.endereco || selected.nome)}`
  const podeExcluir = selected.id > MAX_ID_BASE || String(selected.origem || '').includes('custom')

  async function registrarVisita() {
    await markVisited(selected.id, {
      data: form.data,
      horaInicio: form.horaInicio,
      visitantes: userName ? [userName] : [],
      visitadoPor: userName,
      obs: form.obs,
    })
    setForm({ data: hojeLocal(), horaInicio: agoraHora(), obs: '' })
  }

  async function salvarEdicao() {
    setEditErro('')
    setEditOk('')
    setSalvando(true)
    try {
      await saveChurch(selected, editForm)
      setEditOk('Salvo.')
      setEditando(false)
    } catch (e) {
      setEditErro(e?.message || 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function corrigirGps() {
    setEditErro('')
    setEditOk('')
    setGeoLoad(true)
    try {
      await geocodeChurch(selected)
      setEditOk('GPS atualizado.')
    } catch (e) {
      setEditErro(e?.message || 'Não foi possível localizar no mapa.')
    } finally {
      setGeoLoad(false)
    }
  }

  async function excluirIgreja() {
    if (!window.confirm(`Remover "${selected.nome}" do cadastro?`)) return
    await removeChurch(selected)
    onClose?.()
  }

  return (
    <div
      className="flex flex-col max-h-[min(72vh,520px)] sm:max-h-none bg-[var(--surface-glass)] border border-[var(--border-subtle)] shadow-xl rounded-t-2xl sm:rounded-xl overflow-hidden"
      style={{ backdropFilter: 'blur(12px)' }}
    >
      <div className="flex items-start gap-2 px-4 py-3 border-b border-[var(--border-subtle)]">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-base truncate">{selected.nome}</h3>
          <p className="text-xs text-[var(--text-muted)] truncate">
            {[selected.setor, selected.denominacao].filter(Boolean).join(' · ')}
            {semGps ? ' · sem GPS' : ''}
          </p>
        </div>
        <button
          type="button"
          title={editando ? 'Fechar edição' : 'Editar ficha'}
          onClick={() => { setEditando(v => !v); setEditErro(''); setEditOk('') }}
          className="p-1 rounded-md hover:bg-[var(--surface-hover)]"
        >
          <Pencil size={16} />
        </button>
        <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-[var(--surface-hover)]" aria-label="Fechar">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3 text-sm">
        {editando ? (
          <IgrejaFormEdicao
            ig={selected}
            editForm={editForm}
            onEditForm={setEditForm}
            editErro={editErro}
            editOk={editOk}
            onSalvar={salvarEdicao}
            onCancel={() => { setEditando(false); setEditForm(churchToEditForm(selected)) }}
            onRemover={podeExcluir ? excluirIgreja : undefined}
            onCorrigirGps={corrigirGps}
            setoresOpcoes={setoresOpcoes}
            denominacoes={DENOMINACOES}
            fichaCompleta={podeExcluir}
            showExcluir={podeExcluir}
            compact
          />
        ) : (
          <>
            {selected.endereco && (
              <p className="text-[var(--text-secondary)] text-xs leading-relaxed">{selected.endereco}</p>
            )}

            {(selected.pastor1 || selected.pastor2) && (
              <div className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
                <User size={14} className="mt-0.5 shrink-0" />
                <span>{[selected.pastor1, selected.pastor2].filter(Boolean).join(' · ')}</span>
              </div>
            )}

            {selected.culto && (
              <div className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
                <Clock size={14} className="mt-0.5 shrink-0" />
                <span>{selected.culto}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => (selected.visitado ? unmarkVisited(selected.id) : markVisited(selected.id, { visitantes: userName ? [userName] : [] }))}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                  selected.visitado
                    ? 'border-[var(--gold-bright)]/40 bg-[var(--gold-dim)]/20 text-[var(--gold-bright)]'
                    : 'border-[var(--border-subtle)] bg-[var(--surface-elevated)]'
                }`}
              >
                {selected.visitado ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                {selected.visitado ? 'Visitada' : 'Marcar visitada'}
              </button>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-[var(--border-subtle)] hover:bg-[var(--surface-hover)]"
              >
                <ExternalLink size={14} />
                Abrir rota
              </a>
              {semGps && (
                <button
                  type="button"
                  onClick={corrigirGps}
                  disabled={geoLoad}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-[var(--border-subtle)] hover:bg-[var(--surface-hover)]"
                >
                  {geoLoad ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                  Localizar no mapa
                </button>
              )}
            </div>

            {!selected.visitado && (
              <div className="space-y-2 pt-1 border-t border-[var(--border-subtle)]">
                <p className="text-xs font-medium text-[var(--text-secondary)]">Registrar visita</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] text-[var(--text-muted)]">
                    Data
                    <input
                      type="date"
                      value={form.data}
                      onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
                      className="mt-0.5 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1.5 text-xs"
                    />
                  </label>
                  <label className="text-[10px] text-[var(--text-muted)]">
                    Hora
                    <input
                      type="time"
                      value={form.horaInicio}
                      onChange={e => setForm(f => ({ ...f, horaInicio: e.target.value }))}
                      className="mt-0.5 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1.5 text-xs"
                    />
                  </label>
                </div>
                <textarea
                  placeholder="Observações (opcional)"
                  value={form.obs}
                  onChange={e => setForm(f => ({ ...f, obs: e.target.value }))}
                  rows={2}
                  className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1.5 text-xs resize-none"
                />
                <button
                  type="button"
                  onClick={registrarVisita}
                  disabled={salvando}
                  className="w-full py-2 rounded-lg bg-[var(--gold-bright)] text-black text-xs font-semibold"
                >
                  Salvar visita{userName ? ` · ${userName}` : ''}
                </button>
              </div>
            )}

            {historico.length > 0 && (
              <div className="border-t border-[var(--border-subtle)] pt-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-xs font-medium text-[var(--text-secondary)]"
                  onClick={() => setHistAberto(v => !v)}
                >
                  Histórico ({historico.length})
                  {histAberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {histAberto && (
                  <ul className="mt-2 space-y-1.5">
                    {historico.map(h => (
                      <li key={h.id} className="flex items-start gap-2 text-[11px] text-[var(--text-muted)] border-l-2 border-[var(--gold-dim)] pl-2">
                        <span className="min-w-0 flex-1">
                          <span className="text-[var(--text-secondary)]">{h.data} {h.horaInicio}</span>
                          {h.visitadoPor && ` · ${h.visitadoPor}`}
                          {h.obs && <span className="block italic">{h.obs}</span>}
                        </span>
                        <button
                          type="button"
                          title="Remover entrada"
                          className="shrink-0 p-0.5 rounded hover:bg-[var(--surface-hover)] text-[var(--text-faint)]"
                          onClick={() => {
                            if (window.confirm('Remover esta entrada do histórico?')) {
                              removeHistoryEntry(selected.id, h.id)
                            }
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
