import { CheckCircle2, Circle, MapPin, Loader2 } from 'lucide-react'
import { useChurchVisit, useFilteredChurches } from '../../context/ChurchVisitContext'

export default function ChurchVisitList({
  filters = {},
  onSelect,
}) {
  const { loading, churches, selectedId, markVisited, unmarkVisited, userName } = useChurchVisit()
  const filtradas = useFilteredChurches(filters)

  if (loading && !churches.length) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando igrejas…
      </div>
    )
  }

  if (!filtradas.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[var(--text-muted)]">
        Nenhuma igreja neste filtro.
      </div>
    )
  }

  const slice = filtradas.slice(0, 400)

  return (
    <ul className="scroll-y-smooth flex-1 min-h-0 divide-y divide-[var(--border-subtle)]">
      {slice.map(ig => {
        const sel = String(selectedId) === String(ig.id)
        const semGps = !(Number.isFinite(Number(ig.lat)) && Number.isFinite(Number(ig.lng)))
        return (
          <li key={ig.id}>
            <button
              type="button"
              onClick={() => onSelect?.(ig.id)}
              className={`w-full text-left px-3 py-2.5 flex items-start gap-2 transition-colors ${
                sel ? 'bg-[var(--gold-dim)]/30' : 'hover:bg-[var(--surface-hover)]'
              }`}
            >
              <span className="mt-0.5 shrink-0">
                {ig.visitado
                  ? <CheckCircle2 size={16} className="text-[var(--gold-bright)]" />
                  : <Circle size={16} className="text-[var(--text-faint)]" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-sm truncate text-[var(--text-primary)]">{ig.nome}</span>
                <span className="block text-xs text-[var(--text-muted)] truncate">
                  {[ig.setor, ig.denominacao].filter(Boolean).join(' · ')}
                  {semGps ? ' · sem GPS' : ''}
                </span>
              </span>
              <button
                type="button"
                title={ig.visitado ? 'Desmarcar visita' : 'Marcar visitada'}
                className="shrink-0 p-1 rounded-md hover:bg-[var(--surface-elevated)]"
                onClick={(e) => {
                  e.stopPropagation()
                  if (ig.visitado) unmarkVisited(ig.id)
                  else markVisited(ig.id, { visitantes: userName ? [userName] : [] })
                }}
              >
                <MapPin size={14} className={ig.visitado ? 'text-[var(--gold-bright)]' : 'text-[var(--text-faint)]'} />
              </button>
            </button>
          </li>
        )
      })}
      {filtradas.length > slice.length && (
        <li className="px-3 py-2 text-xs text-center text-[var(--text-muted)]">
          +{filtradas.length - slice.length} igrejas — refine a busca
        </li>
      )}
    </ul>
  )
}
