import { Filter, Plus, Trash2, Pencil, Share2, Copy } from 'lucide-react'
import { RecordCard, StatusPill } from '../ui'
import { fmtDataBR, statusRotaMeta, STATUS_ROTA, isParadaEquipe } from '../../utils/rotaUtils'

export default function PainelHistorico({
  relMembroId,
  setRelMembroId,
  relDataDe,
  setRelDataDe,
  relDataAte,
  setRelDataAte,
  relStatus,
  setRelStatus,
  membros,
  rotasFiltradasRel,
  rotasOrdenadas,
  rotaAtivaId,
  abrirNovaRota,
  abrirRotaParaEditar,
  abrirEnvioDaRota,
  duplicarRota,
  excluirRota,
  useRecordCards = false,
}) {
  return (
    <div className="px-3 py-2 pb-10 space-y-2">
      <div className="rounded-xl p-2.5 space-y-2 border border-[var(--mrx-border)]">
        <p className="font-bold text-[11px] flex items-center gap-1.5" style={{ color: 'var(--mrx-muted)' }}>
          <Filter size={12}/> Filtros
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          <select value={relMembroId} onChange={e => setRelMembroId(e.target.value)}
            className="col-span-2 text-[11px] rounded-lg px-2 py-1.5 srf">
            <option value="">Todos os membros</option>
            {membros.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
          <select value={relStatus} onChange={e => setRelStatus(e.target.value)}
            className="col-span-2 text-[11px] rounded-lg px-2 py-1.5 srf">
            <option value="">Todos os status</option>
            {STATUS_ROTA.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <input type="date" value={relDataDe} onChange={e => setRelDataDe(e.target.value)}
            className="text-[11px] rounded-lg px-2 py-1.5 srf" style={{ colorScheme: 'dark' }}/>
          <input type="date" value={relDataAte} onChange={e => setRelDataAte(e.target.value)}
            className="text-[11px] rounded-lg px-2 py-1.5 srf" style={{ colorScheme: 'dark' }}/>
        </div>
        <p className="text-[10px]" style={{ color: 'var(--mrx-muted)' }}>
          {rotasFiltradasRel.length} de {rotasOrdenadas.length} rotas
        </p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[11px]" style={{ color: 'var(--mrx-muted)' }}>Histórico</p>
        <button type="button" onClick={abrirNovaRota}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
          style={{ background: 'rgba(228,184,74,0.18)', color: '#e4b84a' }}>
          <Plus size={12}/> Nova
        </button>
      </div>

      {rotasFiltradasRel.length === 0 ? (
        <div className="mrx-empty">
          <Trash2 size={24}/>
          <strong>{rotasOrdenadas.length === 0 ? 'Nenhuma rota' : 'Nenhuma no filtro'}</strong>
          {rotasOrdenadas.length === 0 && (
            <button type="button" onClick={abrirNovaRota}>Criar rota</button>
          )}
        </div>
      ) : rotasFiltradasRel.map(r => {
        const st = statusRotaMeta(r.status)
        const ativa = r.id === rotaAtivaId
        const nParadas = (r.paradas || []).filter(p => !isParadaEquipe(p)).length
        const nFeitas = (r.paradas || []).filter(p => !isParadaEquipe(p) && p.status === 'concluido').length
        const pct = nParadas ? Math.round((nFeitas / nParadas) * 100) : 0
        const resp = membros.find(m => String(m.id) === String(r.responsavelId))
        const statusVariant = pct >= 100 ? 'visitada' : st.id === 'em_andamento' ? 'em-rota' : 'pendente'

        if (useRecordCards) {
          return (
            <RecordCard
              key={r.id}
              primary={r.nome || 'Rota'}
              secondary={`${fmtDataBR(r.data)}${resp ? ` · ${resp.nome.split(' ')[0]}` : ''}`}
              meta={`${nFeitas}/${nParadas} paradas · ${pct}%`}
              onClick={() => abrirRotaParaEditar(r.id)}
              status={
                <StatusPill variant={statusVariant} label={st.label} bordered={false} pulse={st.id === 'em_andamento'} />
              }
              actions={(
                <div className="flex flex-col gap-1">
                  <button type="button" onClick={e => { e.stopPropagation(); abrirEnvioDaRota(r.id) }}
                    className="px-2 py-1 rounded-lg text-[10px] font-bold"
                    style={{ background: 'rgba(228,184,74,0.12)', color: '#e4b84a' }}>
                    <Share2 size={9} className="inline" /> Enviar
                  </button>
                  <button type="button" onClick={e => { e.stopPropagation(); excluirRota(r.id, e) }}
                    className="px-2 py-1 rounded-lg text-[10px] font-bold"
                    style={{ background: 'rgba(248,113,113,0.08)', color: '#fca5a5' }}>
                    <Trash2 size={9} className="inline" />
                  </button>
                </div>
              )}
            />
          )
        }

        return (
          <div key={r.id} className="mrx-item" style={{
            borderColor: ativa ? 'rgba(228,184,74,0.4)' : undefined,
            borderLeft: `4px solid ${st.cor}`,
          }}>
            <button type="button" onClick={() => abrirRotaParaEditar(r.id)} className="w-full text-left p-3">
              <div className="flex justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-[13px] truncate" style={{ color: ativa ? '#e4b84a' : undefined }}>{r.nome || 'Rota'}</p>
                  <p className="text-[10px]" style={{ color: 'var(--mrx-muted)' }}>
                    {fmtDataBR(r.data)}{resp ? ` · ${resp.nome.split(' ')[0]}` : ''}
                  </p>
                </div>
                <span className="text-[9px] font-bold px-2 py-1 rounded-lg h-fit" style={{ color: st.cor, background: `${st.cor}18` }}>{st.label}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? '#34d399' : '#3b82f6' }}/>
                </div>
                <span className="text-[9px]" style={{ color: 'var(--mrx-muted)' }}>{nFeitas}/{nParadas}</span>
              </div>
            </button>
            <div className="flex gap-1 px-3 pb-2.5">
              <button type="button" onClick={() => abrirRotaParaEditar(r.id)} className="flex-1 py-1.5 rounded-lg text-[10px] font-bold mrx-cta-secondary" style={{ margin: 0 }}>
                <Pencil size={9} className="inline"/> Editar
              </button>
              <button type="button" onClick={() => abrirEnvioDaRota(r.id)} className="flex-1 py-1.5 rounded-lg text-[10px] font-bold" style={{ background: 'rgba(228,184,74,0.12)', color: '#e4b84a' }}>
                <Share2 size={9} className="inline"/> Enviar
              </button>
              <button type="button" onClick={() => duplicarRota(r.id)} className="flex-1 py-1.5 rounded-lg text-[10px] font-bold mrx-cta-secondary" style={{ margin: 0 }}>
                <Copy size={9} className="inline"/> Copiar
              </button>
              <button type="button" onClick={e => excluirRota(r.id, e)} className="flex-1 py-1.5 rounded-lg text-[10px] font-bold" style={{ background: 'rgba(248,113,113,0.08)', color: '#fca5a5' }}>
                <Trash2 size={9} className="inline"/>
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
