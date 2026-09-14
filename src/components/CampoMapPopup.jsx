import { useMemo, useState } from 'react'
import { Plus, Trash2, MapPin, ExternalLink, Check, X } from 'lucide-react'
import { montarEnderecoIgreja } from '../utils/agendaLocal'
import { labelDistanciaCheckin } from '../utils/campoCheckIn'
import { STATUS_PARADA } from '../utils/rotasDiarias'
import { churchToEditForm } from '../utils/churchVisitMutations'

const ST_LABEL = {
  [STATUS_PARADA.PENDENTE]: 'Pendente na rota',
  [STATUS_PARADA.EM_TRANSITO]: 'Em trânsito',
  [STATUS_PARADA.CONCLUIDO]: 'Concluída',
}

function streetViewUrl(lat, lng) {
  const la = Number(lat)
  const ln = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${la},${ln}`
}

export default function CampoMapPopup({
  igreja,
  parada = null,
  checkIn = null,
  membros = [],
  membroDespacho = '',
  onMembroDespachoChange,
  onAddToRota,
  onInativar,
  addBusy = false,
  pinEditActive = false,
  pinPending = null,
  onStartPinEdit,
  onConfirmPinSave,
  onCancelPinEdit,
  pinSaveBusy = false,
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)

  const jaNaRota = Boolean(parada)

  const enderecoFmt = useMemo(() => {
    const form = churchToEditForm(igreja)
    return montarEnderecoIgreja(form) || String(igreja?.endereco || '').trim() || '—'
  }, [igreja])

  const bairro = String(igreja?.bairro || igreja?.setor || '').trim()
  const cidade = String(igreja?.cidade || 'Blumenau').trim()
  const uf = String(igreja?.uf || 'SC').trim().toUpperCase().slice(0, 2)
  const setorBadge = String(igreja?.setor || '').trim()

  const pinLat = pinPending?.lat ?? Number(igreja?.lat)
  const pinLng = pinPending?.lng ?? Number(igreja?.lng)
  const svUrl = streetViewUrl(pinLat, pinLng)

  return (
    <div className="campo-map-popup campo-map-popup--v351 text-xs min-w-[240px] max-w-[300px]">
      <div className="campo-map-popup__card space-y-3">
        <header className="space-y-2">
          <div className="flex flex-wrap items-start gap-2 justify-between">
            <h3 className="font-bold text-[15px] text-slate-900 leading-snug flex-1 min-w-0">
              {igreja?.nome || 'Igreja'}
            </h3>
            {setorBadge && (
              <span className="campo-map-popup__badge shrink-0">{setorBadge}</span>
            )}
          </div>

          <div className="space-y-1 text-[11px] text-slate-600 leading-relaxed">
            <p className="text-slate-800">{enderecoFmt}</p>
            {(bairro || cidade) && (
              <p>
                {[bairro && `Bairro: ${bairro}`, cidade && `Cidade: ${cidade}${uf ? `/${uf}` : ''}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>

          {parada && (
            <p className="text-[10px] font-bold uppercase text-indigo-700 bg-indigo-50 rounded-md px-2 py-1 inline-block">
              Parada {parada.ordem} · {ST_LABEL[parada.status] || parada.status}
            </p>
          )}
          {checkIn?.hora && (
            <p className="text-[11px] text-emerald-700 font-medium">Check-in {checkIn.hora}</p>
          )}
          {checkIn?.distanciaMetros != null && (
            <p className="text-[11px] text-slate-500">{labelDistanciaCheckin(checkIn.distanciaMetros)}</p>
          )}
        </header>

        <div className="flex flex-col gap-2">
          {svUrl && (
            <a
              href={svUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="campo-map-popup__btn-street"
            >
              <span aria-hidden>👁️</span>
              Ver no Street View
              <ExternalLink size={13} className="opacity-70" />
            </a>
          )}

          {onStartPinEdit && (
            <div className="space-y-2">
              {!pinEditActive && !pinPending && (
                <button
                  type="button"
                  className="campo-map-popup__btn-outline w-full"
                  onClick={() => onStartPinEdit(igreja)}
                >
                  <span aria-hidden>📍</span>
                  Corrigir Posição no Mapa
                </button>
              )}
              {pinEditActive && !pinPending && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                  Modo correção ativo — arraste o pino até o telhado da igreja e solte.
                </p>
              )}
              {pinPending && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/90 p-2.5 space-y-2">
                  <p className="text-[11px] font-semibold text-emerald-900">Confirmar nova posição?</p>
                  <p className="text-[11px] font-mono text-emerald-800">
                    {Number(pinPending.lat).toFixed(6)}, {Number(pinPending.lng).toFixed(6)}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={pinSaveBusy}
                      onClick={() => onConfirmPinSave?.(igreja, pinPending)}
                      className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold text-white bg-emerald-600 disabled:opacity-50"
                    >
                      <Check size={14} />
                      Salvar GPS
                    </button>
                    <button
                      type="button"
                      disabled={pinSaveBusy}
                      onClick={() => onCancelPinEdit?.()}
                      className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600 bg-white border border-slate-200"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}
              {pinEditActive && pinPending && (
                <button
                  type="button"
                  className="text-[10px] text-slate-500 underline"
                  onClick={() => onCancelPinEdit?.()}
                >
                  Cancelar correção
                </button>
              )}
            </div>
          )}
        </div>

        {!jaNaRota && membros.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-200/90">
            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Despachar para
            </label>
            <select
              value={membroDespacho}
              onChange={e => onMembroDespachoChange?.(e.target.value)}
              className="campo-map-popup__select w-full rounded-lg px-2.5 py-2 text-xs border border-slate-200 bg-white text-slate-800 shadow-sm"
            >
              <option value="">Selecione o membro…</option>
              {membros.filter(m => m.email).map(m => (
                <option key={m.id || m.email} value={m.email}>{m.nome || m.email}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!membroDespacho || addBusy}
              onClick={() => onAddToRota?.(igreja?.id, membroDespacho)}
              className="campo-map-popup__btn-primary w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-black text-white disabled:opacity-40"
            >
              <Plus size={15} />
              Adicionar à Rota
            </button>
          </div>
        )}

        {jaNaRota && (
          <p className="text-[10px] text-slate-500 border-t border-slate-200 pt-2 flex items-center gap-1">
            <MapPin size={12} className="shrink-0" />
            Esta igreja já está na rota selecionada.
          </p>
        )}

        {onInativar && (
          <div className="border-t border-slate-200 pt-2">
            {!confirmRemove ? (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className="text-[11px] font-semibold text-red-600 hover:underline inline-flex items-center gap-1"
              >
                <Trash2 size={12} />
                Remover / inativar igreja
              </button>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[10px] text-red-700">Confirmar inativação no cadastro?</p>
                <button
                  type="button"
                  onClick={() => onInativar(igreja)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-[10px] font-bold"
                >
                  <Trash2 size={12} />
                  Confirmar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
