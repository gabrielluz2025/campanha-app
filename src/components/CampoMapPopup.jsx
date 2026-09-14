import { useState } from 'react'
import { Plus, Trash2, Camera } from 'lucide-react'
import { isUsableFoto } from '../utils/mediaUpload'
import { labelDistanciaCheckin } from '../utils/campoCheckIn'
import { STATUS_PARADA } from '../utils/rotasDiarias'

const ST_LABEL = {
  [STATUS_PARADA.PENDENTE]: 'Pendente na rota',
  [STATUS_PARADA.EM_TRANSITO]: 'Em trânsito',
  [STATUS_PARADA.CONCLUIDO]: 'Concluída',
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
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const jaNaRota = Boolean(parada)
  const foto = checkIn?.foto || igreja?.foto

  return (
    <div className="campo-map-popup text-xs min-w-[200px] max-w-[260px] space-y-2.5">
      {foto && isUsableFoto(foto) ? (
        <img src={foto} alt="" className="w-full h-24 object-cover rounded-lg border border-white/10" />
      ) : (
        <div className="w-full h-16 rounded-lg bg-slate-200/80 flex items-center justify-center text-slate-500">
          <Camera size={20} />
        </div>
      )}
      <div>
        <p className="font-bold text-sm text-slate-900 leading-snug">{igreja?.nome}</p>
        <p className="text-[11px] text-slate-600 mt-0.5">
          {[igreja?.setor, igreja?.bairro].filter(Boolean).join(' · ') || '—'}
        </p>
        {parada && (
          <p className="text-[10px] font-bold uppercase mt-1 text-indigo-700">
            Parada {parada.ordem} · {ST_LABEL[parada.status] || parada.status}
          </p>
        )}
        {checkIn?.hora && (
          <p className="text-[11px] text-emerald-700 mt-1">Check-in {checkIn.hora}</p>
        )}
        {checkIn?.distanciaMetros != null && (
          <p className="text-[11px] text-slate-600">{labelDistanciaCheckin(checkIn.distanciaMetros)}</p>
        )}
      </div>

      {!jaNaRota && membros.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-slate-200">
          <label className="block text-[10px] font-bold uppercase text-slate-500">Despachar para</label>
          <select
            value={membroDespacho}
            onChange={e => onMembroDespachoChange?.(e.target.value)}
            className="w-full rounded-lg px-2 py-1.5 text-xs border border-slate-300 bg-white"
          >
            <option value="">Membro…</option>
            {membros.filter(m => m.email).map(m => (
              <option key={m.id || m.email} value={m.email}>{m.nome || m.email}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!membroDespacho || addBusy}
            onClick={() => onAddToRota?.(igreja?.id, membroDespacho)}
            className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-black text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)' }}
          >
            <Plus size={14} />
            Adicionar à rota
          </button>
        </div>
      )}

      {jaNaRota && (
        <p className="text-[10px] text-slate-500 border-t border-slate-200 pt-2">Esta igreja já está na rota selecionada.</p>
      )}

      {onInativar && (
        <div className="border-t border-slate-200 pt-2">
          {!confirmRemove ? (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className="text-[11px] font-semibold text-red-600 hover:underline"
            >
              Remover / inativar igreja
            </button>
          ) : (
            <div className="space-y-1">
              <p className="text-[10px] text-red-700">Confirmar inativação no cadastro?</p>
              <button
                type="button"
                onClick={() => onInativar(igreja)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-600 text-white text-[10px] font-bold"
              >
                <Trash2 size={12} />
                Confirmar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
