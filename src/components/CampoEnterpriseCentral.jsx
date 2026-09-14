import { LayoutGrid, Radio, Church } from 'lucide-react'
import CampoTorreMap from './CampoTorreMap'
import CampoDespachoPanel from './CampoDespachoPanel'
import CampoIgrejasGestaoPanel from './CampoIgrejasGestaoPanel'

const TABS = [
  { id: 'despacho', label: 'Despacho', Icon: LayoutGrid },
  { id: 'feed', label: 'Feed equipe', Icon: Radio },
  { id: 'igrejas', label: 'Igrejas', Icon: Church },
]

export default function CampoEnterpriseCentral({
  churches,
  membros,
  dataRota,
  onDataRotaChange,
  membroRotaEmail,
  onMembroRotaEmailChange,
  rotaMapa,
  checkInsByIgreja,
  statusFiltro,
  setorFiltro,
  setStatusFiltro,
  setSetorFiltro,
  setoresOpcoes,
  onAddIgrejaRota,
  onInativarIgreja,
  onNovaIgreja,
  despachoRef,
  painelTab,
  onPainelTabChange,
  feedContent,
  mapFloatingExtra = null,
}) {
  return (
    <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
      <div className="relative w-[60%] min-w-0 border-r border-white/10 flex flex-col">
        <CampoTorreMap
          fullHeight
          dispatchEnabled
          membroEmail={membroRotaEmail}
          rota={rotaMapa}
          churches={churches}
          checkInsByIgreja={checkInsByIgreja}
          statusFiltro={statusFiltro}
          setorFiltro={setorFiltro}
          membros={membros}
          membroDespacho={membroRotaEmail}
          onMembroDespachoChange={onMembroRotaEmailChange}
          onAddIgrejaRota={onAddIgrejaRota}
          onInativarIgreja={onInativarIgreja}
          floatingSlot={(
            <>
              <div
                className="rounded-xl px-3 py-2 backdrop-blur-md border border-white/15 shadow-lg flex flex-wrap gap-2 items-center max-w-full"
                style={{ background: 'rgba(15,18,28,0.72)' }}
              >
                <select
                  value={membroRotaEmail}
                  onChange={e => onMembroRotaEmailChange(e.target.value)}
                  className="rounded-lg px-2 py-1.5 text-xs min-w-[140px] max-w-[200px] bg-black/40 border border-white/10"
                >
                  <option value="">Trajeto — membro…</option>
                  {membros.filter(m => m.email).map(m => (
                    <option key={m.id || m.email} value={m.email}>{m.nome || m.email}</option>
                  ))}
                </select>
                <select
                  value={statusFiltro}
                  onChange={e => setStatusFiltro(e.target.value)}
                  className="rounded-lg px-2 py-1.5 text-xs bg-black/40 border border-white/10"
                >
                  <option value="todos">Status: todos</option>
                  <option value="pendente">Pendente</option>
                  <option value="em_transito">Em trânsito</option>
                  <option value="concluido">Concluído</option>
                  <option value="fora_raio">Fora do raio</option>
                </select>
                <select
                  value={setorFiltro}
                  onChange={e => setSetorFiltro(e.target.value)}
                  className="rounded-lg px-2 py-1.5 text-xs bg-black/40 border border-white/10 max-w-[140px]"
                >
                  <option value="todos">Setor: todos</option>
                  {setoresOpcoes.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              {mapFloatingExtra}
            </>
          )}
        />
      </div>

      <div
        className="w-[40%] min-w-0 flex flex-col min-h-0"
        style={{ background: 'rgba(12,14,22,0.95)' }}
      >
        <div className="flex-shrink-0 px-3 pt-3 pb-2 border-b border-white/10 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300/90">Enterprise dispatch</p>
            <button
              type="button"
              onClick={onNovaIgreja}
              className="text-[10px] font-black px-2.5 py-1 rounded-lg text-white"
              style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)' }}
            >
              + Nova igreja
            </button>
          </div>
          <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04]">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onPainelTabChange(id)}
                className="flex-1 flex items-center justify-center gap-1 py-2 px-1 rounded-lg text-[10px] font-bold transition-colors min-w-0"
                style={{
                  background: painelTab === id ? 'rgba(99,102,241,0.35)' : 'transparent',
                  color: painelTab === id ? '#c7d2fe' : 'var(--text-muted)',
                }}
              >
                <Icon size={12} className="flex-shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
          {painelTab === 'despacho' && (
            <CampoDespachoPanel
              ref={despachoRef}
              compact
              churches={churches}
              dataRota={dataRota}
              onDataRotaChange={onDataRotaChange}
              membroEmail={membroRotaEmail}
              onMembroEmailChange={onMembroRotaEmailChange}
            />
          )}
          {painelTab === 'feed' && feedContent}
          {painelTab === 'igrejas' && (
            <CampoIgrejasGestaoPanel churches={churches} onInativar={onInativarIgreja} onNova={onNovaIgreja} />
          )}
        </div>
      </div>
    </div>
  )
}
