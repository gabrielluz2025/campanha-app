import { useMemo, useState } from 'react'
import { Plus, Trash2, MapPin, ExternalLink, Check, X, User, Search } from 'lucide-react'
import { montarEnderecoIgreja } from '../utils/agendaLocal'
import { buscarIgrejasMaisProximas, labelDistanciaCheckin } from '../utils/campoCheckIn'
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
  churchesCatalog = [],
  excluirIgrejaIds = null,
  onAddIgrejaProxima,
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
  const responsavel = String(igreja?.pastor1 || igreja?.responsavel || '').trim()

  const pinLat = pinPending?.lat ?? Number(igreja?.lat)
  const pinLng = pinPending?.lng ?? Number(igreja?.lng)
  const svUrl = streetViewUrl(pinLat, pinLng)

  const excluirIds = useMemo(() => {
    const s = excluirIgrejaIds instanceof Set
      ? excluirIgrejaIds
      : new Set((excluirIgrejaIds || []).map(x => String(x)))
    s.add(String(igreja?.id ?? ''))
    return [...s]
  }, [excluirIgrejaIds, igreja?.id])

  const proximas = useMemo(() => {
    if (!churchesCatalog?.length) return []
    return buscarIgrejasMaisProximas(
      { lat: pinLat, lng: pinLng },
      churchesCatalog,
      { limite: 3, excluirIds },
    )
  }, [churchesCatalog, pinLat, pinLng, excluirIds])

  return (
    <div className="campo-map-popup campo-map-popup--glass text-xs min-w-[260px] max-w-[320px]">
      <div className="campo-map-popup__glass-card space-y-3">
        <header className="space-y-2.5">
          <div className="flex flex-wrap items-start gap-2 justify-between">
            <h3 className="font-extrabold text-[16px] text-slate-900 leading-snug flex-1 min-w-0 tracking-tight">
              {igreja?.nome || 'Igreja'}
            </h3>
            {setorBadge && (
              <span className="campo-map-popup__badge-glass shrink-0">{setorBadge}</span>
            )}
          </div>

          <div className="flex gap-2 text-[11px] text-slate-700 leading-relaxed">
            <MapPin size={14} className="shrink-0 text-indigo-500 mt-0.5" />
            <div className="space-y-1 min-w-0">
              <p className="font-medium text-slate-900">{enderecoFmt}</p>
              {(bairro || cidade) && (
                <p className="text-slate-600">
                  {[bairro && `Bairro ${bairro}`, cidade && `${cidade}${uf ? `/${uf}` : ''}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            </div>
          </div>

          {responsavel && (
            <p className="flex items-center gap-1.5 text-[11px] text-slate-600 bg-white/50 rounded-lg px-2 py-1.5 border border-white/60">
              <User size={12} className="text-indigo-500" />
              <span className="font-semibold text-slate-800">{responsavel}</span>
            </p>
          )}

          {parada && (
            <p className="text-[10px] font-bold uppercase text-indigo-800 bg-indigo-100/80 rounded-lg px-2.5 py-1 inline-block border border-indigo-200/80">
              Parada {parada.ordem} · {ST_LABEL[parada.status] || parada.status}
            </p>
          )}
          {checkIn?.hora && (
            <p className="text-[11px] text-emerald-800 font-semibold">Check-in {checkIn.hora}</p>
          )}
          {checkIn?.distanciaMetros != null && (
            <p className="text-[11px] text-slate-500">{labelDistanciaCheckin(checkIn.distanciaMetros)}</p>
          )}
        </header>

        <div className="grid grid-cols-1 gap-2">
          {svUrl && (
            <a
              href={svUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="campo-map-popup__btn-glass campo-map-popup__btn-glass--sky"
            >
              <span aria-hidden>👁️</span>
              Street View
              <ExternalLink size={13} className="opacity-70 ml-auto" />
            </a>
          )}

          {onStartPinEdit && (
            <div className="space-y-2">
              {!pinEditActive && !pinPending && (
                <button
                  type="button"
                  className="campo-map-popup__btn-glass campo-map-popup__btn-glass--amber w-full"
                  onClick={() => onStartPinEdit(igreja)}
                >
                  <span aria-hidden>📍</span>
                  Corrigir Posição
                </button>
              )}
              {pinEditActive && !pinPending && (
                <p className="text-[11px] text-amber-900 bg-amber-100/70 border border-amber-200/80 rounded-xl px-2.5 py-2 backdrop-blur-sm">
                  Arraste o pino até o telhado da igreja e solte.
                </p>
              )}
              {pinPending && (
                <div className="rounded-xl border border-emerald-300/70 bg-emerald-50/80 backdrop-blur-md p-2.5 space-y-2 shadow-inner">
                  <p className="text-[11px] font-bold text-emerald-950">Confirmar nova posição?</p>
                  <p className="text-[11px] font-mono text-emerald-900">
                    {Number(pinPending.lat).toFixed(6)}, {Number(pinPending.lng).toFixed(6)}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={pinSaveBusy}
                      onClick={() => onConfirmPinSave?.(igreja, pinPending)}
                      className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-bold text-white bg-emerald-600 disabled:opacity-50"
                    >
                      <Check size={14} />
                      Salvar GPS
                    </button>
                    <button
                      type="button"
                      disabled={pinSaveBusy}
                      onClick={() => onCancelPinEdit?.()}
                      className="inline-flex items-center justify-center px-2.5 py-2 rounded-lg text-[11px] font-semibold text-slate-600 bg-white/90 border border-slate-200"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {proximas.length > 0 && onAddIgrejaProxima && (
          <div className="pt-2 border-t border-white/50 space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-500 flex items-center gap-1">
              <Search size={11} />
              Igrejas próximas
            </p>
            <ul className="space-y-1">
              {proximas.map(({ igreja: prox, labelDistancia }) => (
                <li key={prox.id}>
                  <button
                    type="button"
                    className="campo-map-popup__prox-item w-full text-left"
                    onClick={() => onAddIgrejaProxima(prox)}
                  >
                    <span className="truncate font-semibold text-slate-800">{prox.nome}</span>
                    <span className="shrink-0 text-indigo-600 font-bold">— a {labelDistancia}</span>
                    <Plus size={12} className="shrink-0 opacity-60" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!jaNaRota && membros.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-white/50">
            <label className="block text-[10px] font-black uppercase tracking-wide text-slate-500">
              Despachar para
            </label>
            <select
              value={membroDespacho}
              onChange={e => onMembroDespachoChange?.(e.target.value)}
              className="campo-map-popup__select-glass w-full rounded-xl px-2.5 py-2 text-xs text-slate-800"
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
              className="campo-map-popup__btn-glass campo-map-popup__btn-glass--indigo w-full disabled:opacity-40"
            >
              <Plus size={15} />
              Adicionar à Rota
            </button>
          </div>
        )}

        {jaNaRota && (
          <p className="text-[10px] text-slate-600 border-t border-white/40 pt-2 flex items-center gap-1">
            <MapPin size={12} className="shrink-0 text-indigo-500" />
            Já incluída na rota selecionada.
          </p>
        )}

        {onInativar && (
          <div className="border-t border-white/40 pt-2">
            {!confirmRemove ? (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className="text-[11px] font-semibold text-red-600 hover:underline inline-flex items-center gap-1"
              >
                <Trash2 size={12} />
                Remover / inativar
              </button>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[10px] text-red-700">Confirmar inativação?</p>
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
