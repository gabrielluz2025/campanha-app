import { useMemo, useState } from 'react'
import { Search, Trash2 } from 'lucide-react'

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export default function CampoIgrejasGestaoPanel({ churches = [], onInativar, onNova }) {
  const [q, setQ] = useState('')

  const lista = useMemo(() => {
    const n = norm(q)
    let arr = [...(churches || [])]
    arr.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
    if (n) {
      arr = arr.filter(ig =>
        norm(ig.nome).includes(n) || norm(ig.setor).includes(n) || norm(ig.endereco).includes(n),
      )
    }
    return arr.slice(0, 120)
  }, [churches, q])

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/35" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar igreja…"
            className="w-full pl-8 pr-3 py-2 rounded-xl text-xs bg-black/25 border border-white/10"
          />
        </div>
        <button
          type="button"
          onClick={onNova}
          className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-black text-white"
          style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)' }}
        >
          + Nova
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto space-y-1 min-h-0 pr-1">
        {lista.map(ig => {
          const temGps = ig.lat != null && ig.lng != null
          return (
            <li
              key={ig.id}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs border border-white/5 bg-white/[0.03] hover:bg-white/[0.06]"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{ig.nome}</p>
                <p className="text-[10px] text-white/45 truncate">{ig.setor || '—'} · {temGps ? 'GPS ok' : 'Sem GPS'}</p>
              </div>
              <button
                type="button"
                title="Inativar"
                onClick={() => {
                  if (window.confirm(`Inativar "${ig.nome}" do cadastro?`)) onInativar?.(ig)
                }}
                className="p-1.5 rounded-lg text-red-300/90 hover:bg-red-500/15"
              >
                <Trash2 size={14} />
              </button>
            </li>
          )
        })}
        {!lista.length && (
          <li className="text-center text-white/40 py-8 text-xs">Nenhuma igreja encontrada.</li>
        )}
      </ul>
    </div>
  )
}
