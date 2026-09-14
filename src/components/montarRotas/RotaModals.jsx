import { useEffect, useMemo, useState } from 'react'
import { Plus, X, Share2, Copy, Check, MessageCircle, ExternalLink, Loader2, AlertTriangle, Square, Radio } from 'lucide-react'
import MembroSearchPicker from '../MembroSearchPicker'
import { fmtDataBR, statusRotaMeta } from '../../utils/rotaUtils'
import { gpsEstaAoVivo } from '../../utils/rotaShare'

export function RotaModalNova({
  open,
  onClose,
  novaRotaData,
  setNovaRotaData,
  novaRotaMembroId,
  setNovaRotaMembroId,
  membros,
  hojeStr,
  onCriar,
}) {
  if (!open) return null
  return (
    <div className="mrx-modal-back" onClick={onClose}>
      <div className="mrx-modal" onClick={e => e.stopPropagation()}>
        <h3><Plus size={16} style={{ color: '#e4b84a' }}/> Nova rota</h3>
        <p>Crie uma rota para a equipe. Depois adicione paradas e envie o link ao vivo.</p>
        <label className="block space-y-1 mb-3">
          <span className="text-[11px] font-bold" style={{ color: 'var(--mrx-muted)' }}>Data</span>
          <input type="date" value={novaRotaData} onChange={e => setNovaRotaData(e.target.value)}
            className="w-full text-sm rounded-xl px-3 py-2.5 srf" style={{ colorScheme: 'dark' }}/>
        </label>
        <label className="block space-y-1 mb-4">
          <span className="text-[11px] font-bold" style={{ color: 'var(--mrx-muted)' }}>Responsável</span>
          <MembroSearchPicker compact membros={membros} value={novaRotaMembroId}
            onChange={setNovaRotaMembroId} allowEmpty emptyLabel="Sem membro específico" placeholder="Buscar…"/>
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => onCriar({ data: novaRotaData || hojeStr, responsavelId: novaRotaMembroId })}
            className="mrx-cta-primary flex-1">
            <Plus size={13}/> Criar
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm font-semibold" style={{ color: 'var(--mrx-muted)' }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

export function RotaModalEnviar({
  open,
  onClose,
  enviarPara,
  setEnviarPara,
  rotaAtiva,
  membros,
  enviarLoad,
  onWhatsApp,
  shareLink,
  shareCopiado,
  onCopiarShare,
  mapsUrl,
  wazePrimeira,
  shareAtivoNaRota,
  aoVivoAtivoNaRota,
  onEncerrarAoVivo,
  onGerarLink,
  qtdParadas,
  paradasComCoords,
}) {
  if (!open) return null
  const semGps = qtdParadas > 0 && paradasComCoords < qtdParadas
  return (
    <div className="mrx-modal-back" onClick={onClose}>
      <div className="mrx-modal" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3><Share2 size={16} style={{ color: '#e4b84a' }}/> Enviar rota</h3>
          <button type="button" onClick={onClose} style={{ color: 'var(--mrx-muted)' }}><X size={16}/></button>
        </div>
        <p>O link da <strong style={{ color: '#86efac' }}>campanha</strong> ativa o GPS ao vivo. Maps e Waze ficam dentro dele.</p>

        {semGps && (
          <div className="mrx-alert mt-3">
            <AlertTriangle size={14}/>
            <span>{qtdParadas - paradasComCoords} parada(s) sem GPS — a equipe pode não ver no mapa ao vivo.</span>
          </div>
        )}

        {(shareAtivoNaRota || aoVivoAtivoNaRota) && (
          <div className="mt-3 p-2.5 rounded-xl flex flex-wrap items-center gap-2"
            style={{ background: aoVivoAtivoNaRota ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)', border: `1px solid ${aoVivoAtivoNaRota ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}` }}>
            <span className="text-[11px] font-bold" style={{ color: aoVivoAtivoNaRota ? '#86efac' : '#fcd34d' }}>
              {aoVivoAtivoNaRota ? '● GPS ao vivo ativo' : 'Link enviado — aguardando GPS'}
            </span>
            <button type="button" onClick={onEncerrarAoVivo} disabled={enviarLoad}
              className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold"
              style={{ background: 'rgba(248,113,113,0.15)', color: '#fca5a5' }}>
              <Square size={10}/> Encerrar ao vivo
            </button>
          </div>
        )}

        <MembroSearchPicker compact membros={membros}
          value={enviarPara || rotaAtiva?.responsavelId || ''}
          onChange={setEnviarPara} placeholder="Quem recebe…" className="mt-3"/>

        <button type="button" onClick={onWhatsApp} disabled={enviarLoad}
          className="mrx-cta-primary mt-3">
          {enviarLoad ? <Loader2 size={14} className="animate-spin"/> : <MessageCircle size={14}/>}
          Enviar WhatsApp
        </button>

        {!shareLink && (
          <button type="button" onClick={onGerarLink} disabled={enviarLoad}
            className="mrx-cta-secondary mt-2 w-full">
            {enviarLoad ? <Loader2 size={14} className="animate-spin inline"/> : <Share2 size={14} className="inline"/>}
            {enviarLoad ? 'Gerando…' : 'Gerar link'}
          </button>
        )}

        {shareLink && (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <input readOnly value={shareLink} className="flex-1 text-[11px] rounded-lg px-2 py-2 srf truncate"/>
              <button type="button" onClick={onCopiarShare}
                className="px-3 py-2 rounded-lg font-bold text-[11px]"
                style={{ background: 'rgba(255,255,255,0.06)', color: shareCopiado ? '#86efac' : 'var(--mrx-muted)' }}>
                {shareCopiado ? <Check size={14}/> : <Copy size={14}/>}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <a href={mapsUrl || '#'} target="_blank" rel="noreferrer"
                className={`text-center py-2 rounded-lg text-[11px] font-bold ${!mapsUrl ? 'opacity-40 pointer-events-none' : ''}`}
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--mrx-muted)' }}>
                <ExternalLink size={11} className="inline"/> Maps
              </a>
              <a href={wazePrimeira || '#'} target="_blank" rel="noreferrer"
                className={`text-center py-2 rounded-lg text-[11px] font-bold ${!wazePrimeira ? 'opacity-40 pointer-events-none' : ''}`}
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--mrx-muted)' }}>
                <ExternalLink size={11} className="inline"/> Waze
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function RotaModalFoto({ foto, onClose }) {
  if (!foto) return null
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/85" onClick={onClose}>
      <div className="max-w-lg w-full" onClick={e => e.stopPropagation()}>
        <img src={foto.foto} alt="" className="w-full rounded-2xl"/>
        <p className="text-center mt-2 text-sm font-bold">{foto.nome}</p>
        <button type="button" onClick={onClose} className="mt-3 w-full py-2 rounded-xl font-bold" style={{ background: 'rgba(255,255,255,0.1)' }}>
          Fechar
        </button>
      </div>
    </div>
  )
}

export function RotaModalEncerrarAoVivo({
  open,
  onClose,
  membros = [],
  rotas = [],
  execucoes = {},
  sharesAtivos = [],
  membroIdInicial = '',
  rotaIdsPreselect = [],
  onConfirm,
  loading = false,
}) {
  const [membroId, setMembroId] = useState(membroIdInicial || '')
  const [selecionadas, setSelecionadas] = useState(() => new Set())
  const [statusConclusao, setStatusConclusao] = useState('concluida')
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    if (!open) return
    setMembroId(membroIdInicial || '')
    setSelecionadas(new Set((rotaIdsPreselect || []).map(String)))
    setStatusConclusao('concluida')
    setMotivo('')
  }, [open, membroIdInicial, rotaIdsPreselect])

  const itens = useMemo(() => {
    return (sharesAtivos || []).map(s => {
      const rota = rotas.find(r => String(r.id) === String(s.rotaId))
      const pack = execucoes[s.rotaId] || execucoes[String(s.rotaId)]
      const membroShare = String(s.membroId || rota?.responsavelId || '')
      const gps = pack?.exec?.posicao
      const aoVivo = gpsEstaAoVivo(gps)
      return {
        rotaId: String(s.rotaId),
        shareId: s.shareId,
        nome: rota?.nome || s.nome || 'Rota',
        data: rota?.data || '',
        membroId: membroShare,
        membroNome: s.membro || '',
        status: rota?.status || 'em_andamento',
        aoVivo,
        aguardando: !aoVivo,
      }
    }).filter(item => {
      if (!membroId) return true
      return String(item.membroId) === String(membroId)
    })
  }, [sharesAtivos, rotas, execucoes, membroId])

  useEffect(() => {
    if (!open || rotaIdsPreselect?.length) return
    setSelecionadas(new Set(itens.map(i => i.rotaId)))
  }, [open, membroId, itens, rotaIdsPreselect])

  const todasMarcadas = itens.length > 0 && itens.every(i => selecionadas.has(i.rotaId))

  function toggle(rotaId) {
    setSelecionadas(prev => {
      const next = new Set(prev)
      if (next.has(rotaId)) next.delete(rotaId)
      else next.add(rotaId)
      return next
    })
  }

  function toggleTodas() {
    if (todasMarcadas) setSelecionadas(new Set())
    else setSelecionadas(new Set(itens.map(i => i.rotaId)))
  }

  async function confirmar(concluir) {
    const rotaIds = [...selecionadas]
    if (!rotaIds.length) {
      window.alert('Selecione pelo menos uma rota.')
      return
    }
    await onConfirm?.({
      rotaIds,
      concluir,
      status: statusConclusao,
      motivo: motivo.trim(),
    })
  }

  if (!open) return null

  return (
    <div className="mrx-modal-back" onClick={onClose}>
      <div className="mrx-modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3><Square size={16} style={{ color: '#fca5a5' }}/> Encerrar ao vivo</h3>
          <button type="button" onClick={onClose} style={{ color: 'var(--mrx-muted)' }}><X size={16}/></button>
        </div>
        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--mrx-muted)' }}>
          Escolha o membro e marque quais rotas encerrar. Você pode só parar o GPS ou encerrar e marcar como concluída.
        </p>

        <label className="block mt-3 space-y-1">
          <span className="text-[11px] font-bold" style={{ color: 'var(--mrx-muted)' }}>Membro</span>
          <MembroSearchPicker compact membros={membros} value={membroId}
            onChange={setMembroId} allowEmpty emptyLabel="Todos os membros" placeholder="Filtrar por membro…"/>
        </label>

        <div className="mt-3 rounded-xl overflow-hidden border border-[var(--mrx-border)]">
          <label className="flex items-center gap-2 px-3 py-2 cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--mrx-border)' }}>
            <input type="checkbox" checked={todasMarcadas} onChange={toggleTodas}/>
            <span className="text-[11px] font-bold" style={{ color: 'var(--mrx-muted)' }}>
              Marcar todas ({itens.length})
            </span>
          </label>
          <div className="max-h-52 overflow-y-auto">
            {itens.length === 0 ? (
              <p className="px-3 py-4 text-center text-[11px]" style={{ color: 'var(--mrx-muted)' }}>
                Nenhuma rota ao vivo{membroId ? ' para este membro' : ''}.
              </p>
            ) : itens.map(item => {
              const st = statusRotaMeta(item.status)
              return (
                <label key={item.rotaId}
                  className="flex items-start gap-2 px-3 py-2.5 cursor-pointer border-b border-[var(--mrx-border)] last:border-0">
                  <input type="checkbox" className="mt-0.5" checked={selecionadas.has(item.rotaId)}
                    onChange={() => toggle(item.rotaId)}/>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold truncate" style={{ color: '#e2e8f0' }}>{item.nome}</p>
                    <p className="text-[10px]" style={{ color: 'var(--mrx-muted)' }}>
                      {fmtDataBR(item.data)} · {st.label}
                      {item.aoVivo ? ' · ● GPS ao vivo' : ' · aguardando GPS'}
                    </p>
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <span className="text-[11px] font-bold" style={{ color: 'var(--mrx-muted)' }}>Ao concluir, marcar como:</span>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: 'concluida', label: 'Concluída', color: '#86efac' },
              { id: 'parcial', label: 'Parcial', color: '#fcd34d' },
            ].map(opt => (
              <button key={opt.id} type="button" onClick={() => setStatusConclusao(opt.id)}
                className="py-2 rounded-lg text-[11px] font-bold"
                style={{
                  background: statusConclusao === opt.id ? `${opt.color}22` : 'rgba(255,255,255,0.04)',
                  color: opt.color,
                  border: `1px solid ${statusConclusao === opt.id ? `${opt.color}55` : 'transparent'}`,
                }}>
                {opt.label}
              </button>
            ))}
          </div>
          {statusConclusao === 'parcial' && (
            <textarea value={motivo} onChange={e => setMotivo(e.target.value.slice(0, 400))}
              rows={2} placeholder="Motivo da conclusão parcial (opcional)…"
              className="w-full rounded-lg px-2 py-2 text-[11px] resize-none srf"/>
          )}
        </div>

        <div className="flex flex-col gap-2 mt-4">
          <button type="button" disabled={loading || !itens.length}
            onClick={() => confirmar(true)}
            className="mrx-cta-primary w-full">
            {loading ? <Loader2 size={14} className="animate-spin inline"/> : <Check size={14} className="inline"/>}
            Encerrar e concluir selecionadas
          </button>
          <button type="button" disabled={loading || !itens.length}
            onClick={() => confirmar(false)}
            className="mrx-cta-secondary w-full">
            {loading ? <Loader2 size={14} className="animate-spin inline"/> : <Radio size={14} className="inline"/>}
            Só encerrar GPS (sem concluir)
          </button>
          <button type="button" onClick={onClose} className="py-2 text-[12px] font-semibold" style={{ color: 'var(--mrx-muted)' }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
