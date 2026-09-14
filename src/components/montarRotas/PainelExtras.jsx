import {
  Search, ChevronUp, ChevronDown, Plus, CheckCircle2, MapPin, Package, X,
} from 'lucide-react'
import { SETORES } from '../../constants/igrejasTheme'
import { paradaKey, formatDistanciaKm } from '../../utils/rotaUtils'
import { BAIRROS_MAT } from './constants'

export { BAIRROS_MAT }

export default function PainelExtras({
  painel,
  proxModo,
  setProxModo,
  proxDenom,
  setProxDenom,
  proxMaxKm,
  setProxMaxKm,
  proxSetor,
  setProxSetor,
  proxExpandido,
  setProxExpandido,
  busca,
  setBusca,
  proximidade,
  gruposParaImprimir,
  gruposProximos,
  adicionarTodasDoBairro,
  keysNaRota,
  toggleParada,
  verParNoMapa,
  adicionarParIgrejas,
  materiaisDisp,
  matForm,
  setMatForm,
  adicionarMaterial,
  paradasDetalhes,
  removerParada,
}) {
  if (painel === 'proximas') {
    return (
      <div className="mrx-panel-scroll px-3 py-2 pb-10 space-y-3">
        <div className="p-3 rounded-xl space-y-2" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)' }}>
          <p className="font-bold text-xs" style={{ color: '#93c5fd' }}>
            {proxDenom === 'ad' ? 'AD Blu por bairro' : 'Igrejas por bairro'}
          </p>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)' }}>
            {[{ id: 'lista', label: 'Lista' }, { id: 'pares', label: 'Pares' }].map(opt => (
              <button key={opt.id} type="button" onClick={() => { setProxModo(opt.id); setProxExpandido(null) }}
                className="rounded-lg py-2 text-xs font-bold"
                style={{ background: proxModo === opt.id ? 'rgba(37,99,235,0.55)' : 'transparent', color: proxModo === opt.id ? '#fff' : 'var(--mrx-muted)' }}>
                {opt.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={proxDenom} onChange={e => { setProxDenom(e.target.value); setProxExpandido(null) }}
              className="text-xs rounded-lg px-2 py-2 srf">
              <option value="ad">AD Blu</option>
              <option value="outras">Outras</option>
              <option value="todas">Todas</option>
            </select>
            {proxModo === 'pares' ? (
              <select value={proxMaxKm} onChange={e => setProxMaxKm(Number(e.target.value))} className="text-xs rounded-lg px-2 py-2 srf">
                {[1, 2, 3, 5, 10].map(k => <option key={k} value={k}>{k} km</option>)}
              </select>
            ) : (
              <select value={proxSetor} onChange={e => setProxSetor(e.target.value)} className="text-xs rounded-lg px-2 py-2 srf">
                <option value="Todos">Todos</option>
                {proximidade.grupos.map(g => <option key={g.setor} value={g.setor}>{g.setor} ({g.total})</option>)}
              </select>
            )}
          </div>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--mrx-muted)' }}/>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar…"
              className="w-full text-xs rounded-lg pl-8 pr-2 py-2 srf"/>
          </div>
        </div>

        {proxModo === 'lista' ? (
          gruposParaImprimir.length === 0 ? (
            <p className="text-center py-8 text-xs" style={{ color: 'var(--mrx-muted)' }}>Nenhuma igreja.</p>
          ) : gruposParaImprimir.map((grupo, idx) => {
            const aberto = proxExpandido === grupo.setor || (proxSetor !== 'Todos' && proxSetor === grupo.setor) || (proxExpandido == null && idx === 0)
            const cor = SETORES[grupo.setor] || '#3b82f6'
            const lista = grupo.igrejas || []
            return (
              <div key={grupo.setor} className="rounded-xl overflow-hidden border border-[var(--mrx-border)]">
                <button type="button" onClick={() => setProxExpandido(aberto && proxSetor === 'Todos' ? null : grupo.setor)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
                  <span className="w-2 h-2 rounded-full" style={{ background: cor }}/>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs truncate">{grupo.setor}</p>
                    <p className="text-[10px]" style={{ color: 'var(--mrx-muted)' }}>{lista.length} igrejas</p>
                  </div>
                  {aberto ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                </button>
                {aberto && (
                  <div className="px-2 pb-2 space-y-1 border-t border-[var(--mrx-border)]">
                    <button type="button" onClick={() => adicionarTodasDoBairro(grupo)}
                      className="w-full mt-2 py-2 rounded-lg text-[11px] font-bold"
                      style={{ background: `${cor}22`, color: cor }}>
                      <Plus size={12} className="inline"/> Adicionar bairro
                    </button>
                    {lista.map(ig => {
                      const key = paradaKey('igreja', ig.id)
                      const naRota = keysNaRota.has(key)
                      return (
                        <div key={ig.id} className="rounded-lg px-2 py-2 flex items-center gap-2 mrx-item" style={naRota ? { borderColor: 'rgba(16,185,129,0.35)' } : undefined}>
                          <p className="flex-1 text-[11px] font-semibold truncate">{ig.nome}</p>
                          <button type="button" onClick={() => toggleParada(key)} disabled={naRota}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg disabled:opacity-60"
                            style={{ background: naRota ? 'rgba(16,185,129,0.2)' : 'rgba(37,99,235,0.25)', color: naRota ? '#86efac' : '#93c5fd' }}>
                            {naRota ? 'Na rota' : '+'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        ) : gruposProximos.length === 0 ? (
          <p className="text-center py-8 text-xs" style={{ color: 'var(--mrx-muted)' }}>Nenhum par próximo.</p>
        ) : gruposProximos.map((grupo, idx) => {
          const aberto = proxExpandido === grupo.setor || (proxSetor !== 'Todos' && proxSetor === grupo.setor) || (proxExpandido == null && idx === 0)
          const cor = SETORES[grupo.setor] || '#3b82f6'
          return (
            <div key={grupo.setor} className="rounded-xl overflow-hidden border border-[var(--mrx-border)]">
              <button type="button" onClick={() => setProxExpandido(aberto && proxSetor === 'Todos' ? null : grupo.setor)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
                <span className="w-2 h-2 rounded-full" style={{ background: cor }}/>
                <div className="flex-1">
                  <p className="font-bold text-xs">{grupo.setor}</p>
                  <p className="text-[10px]" style={{ color: 'var(--mrx-muted)' }}>{grupo.pares.length} pares</p>
                </div>
                {aberto ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
              </button>
              {aberto && grupo.pares.map(par => {
                const keyA = paradaKey('igreja', par.a.id)
                const keyB = paradaKey('igreja', par.b.id)
                const ambas = keysNaRota.has(keyA) && keysNaRota.has(keyB)
                return (
                  <div key={`${par.a.id}-${par.b.id}`} className="mx-2 mb-2 p-2 rounded-lg border border-[var(--mrx-border)]">
                    <p className="text-[11px] font-semibold">{par.a.nome}</p>
                    <p className="text-[10px]" style={{ color: 'var(--mrx-muted)' }}>↕ {par.b.nome} · {formatDistanciaKm(par.km)}</p>
                    <div className="flex gap-1 mt-2">
                      <button type="button" onClick={() => verParNoMapa(par.a, par.b)} className="flex-1 py-1.5 rounded-lg text-[10px] font-bold mrx-cta-secondary" style={{ margin: 0 }}>
                        <MapPin size={11} className="inline"/> Mapa
                      </button>
                      <button type="button" onClick={() => adicionarParIgrejas(par.a, par.b)} disabled={ambas}
                        className="flex-1 py-1.5 rounded-lg text-[10px] font-bold disabled:opacity-50"
                        style={{ background: 'rgba(37,99,235,0.25)', color: '#93c5fd' }}>
                        {ambas ? 'Na rota' : '+ As duas'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    )
  }

  if (painel === 'materiais') {
    return (
      <div className="mrx-panel-scroll px-3 py-3 pb-10 space-y-3">
        {materiaisDisp.length === 0 ? (
          <p className="text-center py-8 text-xs" style={{ color: 'var(--mrx-muted)' }}>Cadastre materiais na aba Materiais</p>
        ) : (
          <>
            <div className="p-3 rounded-xl space-y-2" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <p className="font-bold text-[11px]" style={{ color: '#fbbf24' }}>Nova entrega</p>
              <select value={matForm.itemId} onChange={e => setMatForm(f => ({ ...f, itemId: e.target.value }))} className="w-full text-xs rounded-lg px-3 py-2 srf">
                <option value="">Material…</option>
                {materiaisDisp.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.restante})</option>)}
              </select>
              <select value={matForm.bairro} onChange={e => setMatForm(f => ({ ...f, bairro: e.target.value }))} className="w-full text-xs rounded-lg px-3 py-2 srf">
                {BAIRROS_MAT.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <input type="number" min="1" value={matForm.quantidade} onChange={e => setMatForm(f => ({ ...f, quantidade: e.target.value }))}
                placeholder="Quantidade" className="w-full text-xs rounded-lg px-3 py-2 input-dark"/>
              <button type="button" onClick={adicionarMaterial} disabled={!matForm.itemId || !matForm.quantidade}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-50" style={{ background: '#f59e0b' }}>
                <Package size={12} className="inline"/> Adicionar
              </button>
            </div>
            {paradasDetalhes.filter(p => p.material).map(p => (
              <div key={p.key} className="mrx-item">
                <div className="mrx-item-inner">
                  <Package size={14} style={{ color: '#f59e0b' }}/>
                  <div className="flex-1 min-w-0">
                    <p className="mrx-item-name">{p.material.quantidade}x {p.material.nome}</p>
                    <p className="mrx-item-sub">{p.setor}</p>
                  </div>
                  <button type="button" onClick={() => removerParada(p.key)} style={{ color: '#fca5a5' }}><X size={12}/></button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    )
  }

  return null
}
