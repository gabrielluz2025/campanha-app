import {
  Route, Plus, Loader2, CheckCircle2, ChevronUp, ChevronDown, ChevronRight,
  X, Package, Camera, Search, AlertTriangle, Clock,
} from 'lucide-react'
import MembroAvatar from '../MembroAvatar'
import MembroSearchPicker from '../MembroSearchPicker'
import {
  TIPOS_PARADA, STATUS_PARADA, labelTipoParada, corStatusParada,
  enderecoLinhaParada, fmtDataBR, statusRotaMeta, statusRotaExigeMotivo,
} from '../../utils/rotaUtils'

export default function PainelEnviar({
  rotaAtiva,
  abrirNovaRota,
  qtdParadas,
  paradasDetalhes,
  liveDetalhe,
  corParada,
  resumoCultoIgreja,
  fmtDataVisitaCurta,
  paradaExpandidaKey,
  setParadaExpandidaKey,
  setFlyToPoint,
  marcarConcluida,
  desfazerVisitaParada,
  moverParada,
  removerParada,
  atualizarParada,
  atualizarRota,
  alterarDataRota,
  hojeStr,
  statusRotaMetaAtual,
  definirResponsavel,
  membros,
  equipeIds,
  equipeDaRota,
  toggleEquipeNaRota,
  abrirPessoas,
  carga,
  resultadoAberto,
  setResultadoAberto,
  motivoDraft,
  setMotivoDraft,
  registrarResultado,
  abrirModalEnviar,
  enviarLoad,
  paradas,
  organizarECalcularRota,
  rotaLoad,
  rotaCalc,
  paradasComCoords,
  irAdicionar,
  setFotoAmpliada,
  shareAtivoNaRota,
  aoVivoAtivoNaRota,
  encerrarAoVivoDaRotaAtiva,
  useRecordCards = false,
}) {
  void useRecordCards
  if (!rotaAtiva) {
    return (
      <div className="mrx-empty flex-1 flex flex-col justify-center">
        <Route size={32}/>
        <strong>Nenhuma rota</strong>
        <p>Crie ou selecione uma rota acima.</p>
        <button type="button" onClick={abrirNovaRota} className="mrx-cta-primary mx-auto mt-2" style={{ width: 'auto', padding: '10px 20px' }}>
          <Plus size={14}/> Nova rota
        </button>
      </div>
    )
  }

  const feitas = paradasDetalhes.filter(p => {
    const st = liveDetalhe(p.key)?.status || p.status
    return st === 'concluido'
  }).length
  const pct = qtdParadas ? Math.round((feitas / qtdParadas) * 100) : 0

  return (
    <>
      <div className="mrx-kpis">
        <div className="mrx-kpi">
          <div className="mrx-kpi-val" style={{ color: '#60a5fa' }}>{qtdParadas}</div>
          <div className="mrx-kpi-lbl">Paradas</div>
        </div>
        <div className="mrx-kpi">
          <div className="mrx-kpi-val" style={{ color: '#34d399' }}>{feitas}</div>
          <div className="mrx-kpi-lbl">Feitas</div>
        </div>
        <div className="mrx-kpi">
          <div className="mrx-kpi-val" style={{ color: pct >= 100 ? '#34d399' : '#e4b84a' }}>{pct}%</div>
          <div className="mrx-kpi-lbl">Progresso</div>
        </div>
      </div>
      <div className="mrx-progress">
        <div className="mrx-progress-fill" style={{ width: `${pct}%`, background: pct >= 100 ? 'linear-gradient(90deg,#059669,#34d399)' : undefined }}/>
      </div>

      {(shareAtivoNaRota || aoVivoAtivoNaRota) && (
        <div className="mx-3 mb-2 p-2.5 rounded-xl flex flex-wrap items-center gap-2"
          style={{ background: aoVivoAtivoNaRota ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${aoVivoAtivoNaRota ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
          <span className="text-[10px] font-bold" style={{ color: aoVivoAtivoNaRota ? '#86efac' : '#fcd34d' }}>
            {aoVivoAtivoNaRota ? '● Equipe ao vivo no mapa' : 'Link enviado — aguardando GPS'}
          </span>
          <button type="button" onClick={encerrarAoVivoDaRotaAtiva}
            className="ml-auto text-[10px] font-bold px-2 py-1 rounded-lg"
            style={{ background: 'rgba(248,113,113,0.14)', color: '#fca5a5' }}>
            Encerrar ao vivo
          </button>
        </div>
      )}

      <div className="mrx-field">
        <input value={rotaAtiva?.nome || ''} onChange={e => atualizarRota({ nome: e.target.value })}
          placeholder="Nome da rota"/>
      </div>
      <div className="mrx-field flex gap-2">
        <input type="date" value={rotaAtiva?.data || hojeStr} onChange={e => alterarDataRota(e.target.value)}
          style={{ flex: 1, colorScheme: 'dark' }}/>
        <span className="px-3 py-2 rounded-xl font-bold text-[10px] flex items-center"
          style={{ color: statusRotaMetaAtual.cor, background: `${statusRotaMetaAtual.cor}18`, border: `1px solid ${statusRotaMetaAtual.cor}35` }}>
          {statusRotaMetaAtual.label}
        </span>
      </div>
      <div className="mrx-field">
        <MembroSearchPicker compact membros={membros} value={rotaAtiva?.responsavelId || ''}
          onChange={definirResponsavel} equipeIds={equipeIds} placeholder="Responsável…"/>
      </div>

      <div className="mrx-panel-scroll py-2">
        <div className="mx-3 mb-3 p-2.5 rounded-xl flex flex-wrap items-center gap-2"
          style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
          <span className="text-[10px] font-bold" style={{ color: '#86efac' }}>Equipe</span>
          {equipeDaRota.length === 0 ? (
            <button type="button" onClick={abrirPessoas} className="text-xs font-bold" style={{ color: 'var(--mrx-muted)' }}>+ Adicionar</button>
          ) : equipeDaRota.map(m => (
            <span key={m.id} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold"
              style={{ background: 'rgba(16,185,129,0.15)', color: '#86efac' }}>
              <MembroAvatar membro={m} size={16}/>{m.nome.split(' ')[0]}
              <button type="button" onClick={() => toggleEquipeNaRota(m.id, false)}><X size={10}/></button>
            </span>
          ))}
          <button type="button" onClick={abrirPessoas} className="text-[10px] font-bold px-2 py-1 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--mrx-muted)' }}>
            <Search size={10} className="inline"/> Buscar
          </button>
        </div>

        {paradasDetalhes.some(p => liveDetalhe(p.key)?.foto) && (
          <div className="mx-3 mb-3 p-2.5 rounded-xl" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(52,211,153,0.22)' }}>
            <p className="text-[11px] font-bold mb-1.5 flex items-center gap-1" style={{ color: '#86efac' }}>
              <Camera size={12}/> Fotos do campo
            </p>
            <div className="flex gap-1.5 overflow-x-auto">
              {paradasDetalhes.map(p => {
                const d = liveDetalhe(p.key)
                if (!d?.foto) return null
                return (
                  <button key={p.key} type="button" className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0"
                    onClick={() => setFotoAmpliada({ foto: d.foto, nome: p.nome, quando: d.confirmadoEm })}>
                    <img src={d.foto} alt="" className="w-full h-full object-cover"/>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {paradasDetalhes.length === 0 ? (
          <div className="mrx-empty">
            <Route size={28}/>
            <strong>Sem paradas</strong>
            <p>Volte ao passo Montar e adicione igrejas.</p>
            <button type="button" onClick={() => irAdicionar('igrejas')}>Escolher igrejas</button>
          </div>
        ) : paradasDetalhes.map((p, idx) => {
          const cor = corParada(p)
          const live = liveDetalhe(p.key)
          const st = live?.status || p.status || 'pendente'
          const expandida = paradaExpandidaKey === p.key
          const feita = st === 'concluido'
          const statusLabel = STATUS_PARADA.find(s => s.id === st)?.label
          return (
            <div key={p.key} className={`mrx-stop ${feita ? 'is-done' : ''}`}>
              <div className="mrx-stop-head">
                <button type="button" className="mrx-stop-ord" style={{ background: feita ? '#059669' : cor }}
                  onClick={() => {
                    setParadaExpandidaKey(expandida ? null : p.key)
                    if (p.lat) setFlyToPoint({ coords: [p.lat, p.lng], ts: Date.now() })
                  }}>
                  {feita ? '✓' : idx + 1}
                </button>
                <button type="button" className="flex-1 min-w-0 text-left bg-transparent border-none p-0"
                  onClick={() => setParadaExpandidaKey(expandida ? null : p.key)}>
                  <p className="font-bold text-[13px]" style={{ textDecoration: feita ? 'line-through' : 'none', opacity: feita ? 0.65 : 1 }}>
                    {p.nome}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--mrx-muted)' }}>
                    {labelTipoParada(p.tipoParada)}
                    {p.horaPrevista ? ` · ${p.horaPrevista}` : ''}
                    {live?.status && live.status !== 'pendente' && (
                      <span style={{ color: corStatusParada(live.status) }}> · {statusLabel}</span>
                    )}
                  </p>
                  {(p.enderecoCurto || enderecoLinhaParada(p)) && (
                    <p className="text-[9px] truncate" style={{ color: 'var(--mrx-muted)' }}>{p.enderecoCurto || enderecoLinhaParada(p)}</p>
                  )}
                  {feita && (live?.confirmadoEm || p.concluidoEm) && (
                    <p className="text-[9px] mt-0.5" style={{ color: '#86efac' }}>
                      {live?.confirmadoEm ? `Campo: ${fmtDataVisitaCurta(live.confirmadoEm)}` : fmtDataVisitaCurta(p.concluidoEm)}
                    </p>
                  )}
                </button>
              </div>
              {!feita && (
                <div className="mrx-stop-actions">
                  <button type="button" className="mrx-stop-btn visit" onClick={() => marcarConcluida(p.key)}>
                    <CheckCircle2 size={11} className="inline"/> Visitada
                  </button>
                  <button type="button" className="mrx-stop-btn ghost" onClick={() => moverParada(p.key, -1)} disabled={idx === 0}>
                    <ChevronUp size={13}/>
                  </button>
                  <button type="button" className="mrx-stop-btn ghost" onClick={() => moverParada(p.key, 1)} disabled={idx === paradasDetalhes.length - 1}>
                    <ChevronDown size={13}/>
                  </button>
                  <button type="button" className="mrx-stop-btn ghost" onClick={() => removerParada(p.key)}>
                    <X size={12}/>
                  </button>
                </div>
              )}
              {feita && (
                <div className="mrx-stop-actions">
                  <button type="button" className="mrx-stop-btn ghost" onClick={() => desfazerVisitaParada(p.key)}>
                    Desfazer visita
                  </button>
                </div>
              )}
              {expandida && (
                <div className="px-3 pb-3 space-y-2 border-t border-[var(--mrx-border)] pt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select value={p.tipoParada || 'visita'} onChange={e => atualizarParada(p.key, { tipoParada: e.target.value })}
                      className="text-[11px] rounded-lg px-2 py-2 srf">
                      {TIPOS_PARADA.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                    <select value={p.status || 'pendente'} onChange={e => {
                      if (e.target.value === 'concluido') marcarConcluida(p.key)
                      else if (e.target.value === 'pendente' && p.status === 'concluido') desfazerVisitaParada(p.key)
                      else atualizarParada(p.key, { status: e.target.value })
                    }} className="text-[11px] rounded-lg px-2 py-2 srf" style={{ color: corStatusParada(p.status || 'pendente') }}>
                      {STATUS_PARADA.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock size={11} style={{ color: 'var(--mrx-muted)' }}/>
                    <input type="time" value={p.horaPrevista || ''} onChange={e => atualizarParada(p.key, { horaPrevista: e.target.value })}
                      className="text-[11px] rounded-lg px-2 py-1.5 srf" style={{ colorScheme: 'dark', width: 110 }}/>
                  </div>
                  {live?.justificativa && (
                    <p className="text-[10px] rounded-lg px-2 py-1.5"
                      style={{ background: 'rgba(248,113,113,0.1)', color: '#fca5a5' }}>
                      <AlertTriangle size={10} className="inline mr-1"/>
                      {live.justificativa}
                    </p>
                  )}
                  {p.tipo === 'igreja' && resumoCultoIgreja(p.culto) && (
                    <p className="text-[10px]" style={{ color: 'var(--mrx-muted)' }}>{resumoCultoIgreja(p.culto)}</p>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {carga.length > 0 && (
          <div className="mx-3 mt-2 p-2.5 rounded-xl" style={{ background: 'rgba(228,184,74,0.08)', border: '1px solid rgba(228,184,74,0.2)' }}>
            <p className="text-[11px] font-bold mb-1 flex items-center gap-1" style={{ color: '#e4b84a' }}>
              <Package size={11}/> Carga
            </p>
            {carga.map(c => <p key={c.nome} className="text-[11px]" style={{ color: 'var(--mrx-muted)' }}>{c.quantidade}x {c.nome}</p>)}
          </div>
        )}

        <div className="mx-3 mt-3 rounded-xl overflow-hidden border border-[var(--mrx-border)]">
          <button type="button" onClick={() => setResultadoAberto(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-left">
            <span className="text-[11px] font-semibold" style={{ color: 'var(--mrx-muted)' }}>Resultado do dia</span>
            <ChevronRight size={14} className={`transition-transform ${resultadoAberto ? 'rotate-90' : ''}`}/>
          </button>
          {resultadoAberto && (
            <div className="px-3 pb-3 space-y-2 border-t border-[var(--mrx-border)]">
              <textarea value={motivoDraft} onChange={e => setMotivoDraft(e.target.value.slice(0, 400))}
                rows={2} placeholder="Motivo (se parcial ou problema)…"
                className="w-full rounded-lg px-2 py-2 text-[11px] resize-none srf"/>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'concluida', label: 'Concluída', bg: 'rgba(16,185,129,0.16)', color: '#86efac' },
                  { id: 'parcial', label: 'Parcial', bg: 'rgba(245,158,11,0.16)', color: '#fcd34d' },
                  { id: 'nao_realizada', label: 'Não feita', bg: 'rgba(248,113,113,0.14)', color: '#fca5a5' },
                  { id: 'com_problema', label: 'Problema', bg: 'rgba(239,68,68,0.14)', color: '#f87171' },
                ].map(opt => (
                  <button key={opt.id} type="button" onClick={() => registrarResultado(opt.id)}
                    className="py-2 rounded-lg text-[11px] font-bold"
                    style={{ background: opt.bg, color: opt.color }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mrx-footer-cta">
        <button type="button" onClick={abrirModalEnviar} disabled={enviarLoad || !paradas.length}
          className="mrx-cta-primary">
          {enviarLoad ? <Loader2 size={16} className="animate-spin"/> : '🚀'}
          {enviarLoad ? 'Gerando link…' : 'Enviar link para equipe'}
        </button>
        {paradasComCoords.length >= 2 && (
          <button type="button" onClick={organizarECalcularRota} disabled={rotaLoad} className="mrx-cta-secondary">
            {rotaLoad ? <Loader2 size={13} className="animate-spin inline"/> : '✨'}
            {rotaCalc ? `Rota · ${rotaCalc.distancia} km · ${rotaCalc.duracao} min` : 'Otimizar rota'}
          </button>
        )}
      </div>
    </>
  )
}
