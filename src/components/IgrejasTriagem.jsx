import { useMemo, useState } from 'react'
import { Search, MapPin, Trash2, ClipboardList } from 'lucide-react'
import {
  classificarTriagem,
  eIgrejaDaBusca,
  fonteTriagemLabel,
  resumirTriagem,
  COR_TRIAGEM,
} from '../utils/igrejaTriagem'

export default function IgrejasTriagem({
  igrejas = [],
  selectedId,
  onSelect,
  onRemover,
  onRemoverVarias,
  maxIdExternas = 1999,
}) {
  const [filtro, setFiltro] = useState('branco')
  const [busca, setBusca] = useState('')
  const resumo = useMemo(() => resumirTriagem(igrejas, maxIdExternas), [igrejas, maxIdExternas])

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const base = filtro === 'todas'
      ? [...resumo.buckets.branco, ...resumo.buckets.parcial, ...resumo.buckets.presta]
      : (resumo.buckets[filtro] || [])
    if (!q) return base
    return base.filter(ig => {
      const blob = `${ig.nome} ${ig.setor} ${ig.endereco} ${ig.pastor1 || ''} ${ig.denominacao || ''}`
        .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      return blob.includes(q)
    })
  }, [resumo, filtro, busca])

  const idsBranco = resumo.buckets.branco.map(i => i.id)

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-shrink-0 px-3 pt-3 space-y-2">
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
          Só o que veio da busca / cadastro extra — não mexe nas {igrejas.length - resumo.total} do catálogo fixo.
        </p>
        <div className="grid grid-cols-4 gap-1">
          {[
            { id: 'todas', n: resumo.total, l: 'Busca', c: 'var(--text-secondary)' },
            { id: 'branco', n: resumo.branco, l: 'Branco', c: COR_TRIAGEM.branco },
            { id: 'parcial', n: resumo.parcial, l: 'Dados', c: COR_TRIAGEM.parcial },
            { id: 'presta', n: resumo.presta, l: 'Presta', c: COR_TRIAGEM.presta },
          ].map(b => (
            <button
              key={b.id}
              type="button"
              onClick={() => setFiltro(b.id)}
              className="rounded-xl py-2 px-1"
              style={{
                background: filtro === b.id ? 'rgba(212,175,95,0.16)' : 'rgba(0,0,0,0.28)',
                border: filtro === b.id ? '1px solid rgba(212,175,95,0.4)' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <p className="font-extrabold tnum" style={{ fontSize: 16, color: b.c, lineHeight: 1 }}>{b.n}</p>
              <p style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 3 }}>{b.l}</p>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Filtrar por nome, setor, endereço…"
            className="w-full rounded-xl pl-9 pr-3 py-2 outline-none"
            style={{
              fontSize: 12, fontWeight: 500,
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {filtro === 'branco' && idsBranco.length > 0 && (
          <button
            type="button"
            onClick={() => onRemoverVarias?.(idsBranco)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl font-bold"
            style={{
              fontSize: 11,
              background: 'rgba(248,113,113,0.12)',
              border: '1px solid rgba(248,113,113,0.28)',
              color: '#fca5a5',
            }}
          >
            <Trash2 size={12} />
            Apagar as {idsBranco.length} em branco
          </button>
        )}
      </div>

      <p className="px-4 pt-2.5 pb-1 flex-shrink-0" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
        {lista.length} nesta lista · toque para ver no mapa
      </p>

      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {lista.map(ig => {
          const info = ig._triagem || classificarTriagem(ig)
          const selected = selectedId === ig.id
          const cor = COR_TRIAGEM[info.nivel]
          return (
            <div
              key={ig.id}
              className="rounded-xl"
              style={{
                background: selected ? 'rgba(212,175,95,0.12)' : 'transparent',
                border: selected ? '1px solid rgba(212,175,95,0.35)' : '1px solid transparent',
              }}
            >
              <button
                type="button"
                onClick={() => onSelect?.(ig)}
                className="w-full flex items-start gap-2 px-2.5 py-2 text-left"
              >
                <span
                  className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: cor, boxShadow: `0 0 8px ${cor}` }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate" style={{ fontSize: 12.5, color: selected ? 'var(--gold-bright)' : 'var(--text-primary)' }}>
                    {ig.nome || 'Sem nome'}
                  </p>
                  <p className="truncate" style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>
                    {fonteTriagemLabel(ig)}
                    {ig.setor ? ` · ${ig.setor}` : ''}
                    {ig.endereco ? ` · ${ig.endereco}` : ' · sem endereço'}
                  </p>
                  <p style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 3 }}>
                    {info.preenchidos}/{info.max} campos
                    {info.faltas.length ? ` · falta ${info.faltas.slice(0, 3).join(', ')}` : ' · completo o bastante'}
                  </p>
                </div>
                <MapPin size={12} className="mt-1 flex-shrink-0" style={{ color: selected ? 'var(--gold)' : 'var(--text-faint)' }} />
              </button>
              {eIgrejaDaBusca(ig, maxIdExternas) && (
                <div className="flex justify-end px-2 pb-1.5">
                  <button
                    type="button"
                    onClick={e => onRemover?.(ig.id, e)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg font-bold"
                    style={{ fontSize: 10, color: '#fca5a5' }}
                  >
                    <Trash2 size={10} /> Tirar do mapa
                  </button>
                </div>
              )}
            </div>
          )
        })}
        {lista.length === 0 && (
          <div className="text-center py-10 px-4">
            <ClipboardList size={18} className="mx-auto mb-2" style={{ color: 'var(--gold)' }} />
            <p className="font-bold" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Nada nesta faixa
            </p>
            <p className="mt-1" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
              Troque o filtro acima ou a busca.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
