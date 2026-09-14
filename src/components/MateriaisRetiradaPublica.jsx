/* Formulário público: #/retirada-material/{token} */
import { useEffect, useMemo, useState } from 'react'
import { Package, Calendar, User, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { resolveShareId, carregarBundlePublico, submeterPedidoPublico } from '../utils/materiaisRetiradaShare'
import { limitesRestantes, maxPermitidoParaItem } from '../utils/materiaisRetirada'
/** Quantidades fixas do formulário público (iguais para todos os materiais). */
const QTD_OPCOES = [
  { valor: 10, label: '10' },
  { valor: 25, label: '25' },
  { valor: 50, label: '50' },
  { valor: 100, label: '100' },
  { valor: 300, label: '300' },
  { valor: 500, label: '500' },
  { valor: 1000, label: '1.000' },
  { valor: 2000, label: '2.000' },
  { valor: 3000, label: '3.000' },
  { valor: 5000, label: '5.000' },
  { valor: 10000, label: '10 mil' },
  { valor: 20000, label: '20 mil' },
]

function qtdOpcoesDoItem() {
  return QTD_OPCOES
}

function qtdPermitidaParaItem(_item, quantidade) {
  return QTD_OPCOES.some(o => o.valor === Number(quantidade))
}

const fieldStyle = {
  display: 'block',
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(148,163,184,0.25)',
  color: '#fff',
  fontSize: 16, // evita zoom no iOS
  borderRadius: 12,
  outline: 'none',
  WebkitAppearance: 'none',
  appearance: 'none',
}

function fmtDataBr(iso) {
  if (!iso) return '—'
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'long', year: 'numeric',
    })
  } catch {
    return iso
  }
}

export default function MateriaisRetiradaPublica({ token }) {
  const shareId = useMemo(() => resolveShareId(token), [token])

  const [bundle, setBundle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erroLoad, setErroLoad] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [confirmacao, setConfirmacao] = useState(null)

  const [coordSel, setCoordSel] = useState('') // id | '__outros__'
  const [nomeOutros, setNomeOutros] = useState('')
  const [dataPrevista, setDataPrevista] = useState(() => new Date().toISOString().slice(0, 10))
  const [obs, setObs] = useState('')
  const [qtds, setQtds] = useState({}) // itemId -> number
  const [avisoQtd, setAvisoQtd] = useState({}) // itemId -> string

  async function carregar({ silencioso = false } = {}) {
    if (!shareId) {
      setErroLoad('Link inválido.')
      setLoading(false)
      return
    }
    if (!silencioso) {
      setLoading(true)
      setErroLoad('')
    }
    const data = await carregarBundlePublico(shareId, { tentativas: silencioso ? 1 : 4 })
    if (!data || data.__erro || data.ativo === false) {
      if (silencioso) return
      const msg = data?.ativo === false
        ? 'Formulário desativado pela campanha.'
        : (data?.__erro
          ? `Não foi possível abrir (${data.__erro}). Peça ao responsável para abrir Materiais → Link.`
          : 'Link inválido ou ainda não disponível. Peça ao responsável para abrir Materiais → Link.')
      setErroLoad(msg)
      setBundle(null)
    } else {
      setBundle(data)
      setErroLoad('')
      setQtds(prev => {
        const next = { ...prev }
        let mudou = false
        for (const [itemId, q] of Object.entries(next)) {
          const item = (data.itens || []).find(i => String(i.id) === String(itemId))
          const disp = Number(item?.disponivel) || 0
          if (!item || Number(q) > disp) {
            delete next[itemId]
            mudou = true
          }
        }
        return mudou ? next : prev
      })
    }
    if (!silencioso) setLoading(false)
  }

  useEffect(() => { carregar() }, [shareId])

  useEffect(() => {
    if (!shareId || confirmacao) return undefined
    const tick = () => {
      if (document.visibilityState === 'hidden') return
      carregar({ silencioso: true })
    }
    const id = setInterval(tick, 12000)
    const onVis = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [shareId, confirmacao])

  const isOutros = coordSel === '__outros__'
  const coordenador = useMemo(
    () => (bundle?.coordenadores || []).find(c => String(c.id) === String(coordSel)) || null,
    [bundle, coordSel],
  )

  const lims = useMemo(() => {
    if (!bundle) return {}
    return limitesRestantes({
      coordenador,
      isOutros,
      cfg: {
        outrosHabilitado: bundle.outrosHabilitado,
        limiteOutrosPadrao: bundle.limiteOutrosPadrao || {},
      },
      retiradas: bundle.retiradasResumo || [],
      coordenadorNomeOutros: nomeOutros,
    })
  }, [bundle, coordenador, isOutros, nomeOutros])

  const itensVisiveis = useMemo(() => {
    // Mostra todos os materiais do formulário (mesmo sem estoque) para o coordenador ver a lista
    return [...(bundle?.itens || [])].sort((a, b) =>
      String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'),
    )
  }, [bundle])

  function maxDoItem(item) {
    if (!coordSel && !isOutros) return Number(item.disponivel) || 0
    return maxPermitidoParaItem({
      itemId: item.id,
      disponivel: item.disponivel,
      coordenador,
      isOutros,
      cfg: {
        outrosHabilitado: bundle.outrosHabilitado,
        limiteOutrosPadrao: bundle.limiteOutrosPadrao || {},
      },
      retiradas: bundle.retiradasResumo || [],
      coordenadorNomeOutros: nomeOutros,
    })
  }

  function escolherQtd(item, valor) {
    if (!coordSel) {
      setErro('Selecione o coordenador primeiro.')
      return
    }
    setErro('')
    const max = maxDoItem(item)
    if (valor > max) {
      const disp = Number(item.disponivel) || 0
      setAvisoQtd(prev => ({
        ...prev,
        [item.id]: disp < valor
          ? `Só há ${disp.toLocaleString('pt-BR')} disponível(is) no estoque.`
          : `Seu limite permite no máximo ${max.toLocaleString('pt-BR')}.`,
      }))
      setQtds(prev => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      return
    }
    setAvisoQtd(prev => {
      const next = { ...prev }
      delete next[item.id]
      return next
    })
    setQtds(prev => {
      if (Number(prev[item.id]) === valor) {
        const next = { ...prev }
        delete next[item.id]
        return next
      }
      return { ...prev, [item.id]: valor }
    })
  }

  async function enviar(e) {
    e.preventDefault()
    setErro('')
    if (!coordSel) {
      setErro('Selecione o coordenador.')
      return
    }
    const itensPedido = Object.entries(qtds)
      .map(([itemId, v]) => ({ itemId, quantidade: Number(v) || 0 }))
      .filter(i => i.quantidade > 0)

    const invalidas = itensPedido.filter(i => {
      const item = (bundle.itens || []).find(x => String(x.id) === String(i.itemId))
      return !qtdPermitidaParaItem(item, i.quantidade)
    })
    if (invalidas.length) {
      setErro('Use apenas as quantidades oferecidas para cada material.')
      return
    }
    if (!itensPedido.length) {
      setErro('Escolha a quantidade de pelo menos um material.')
      return
    }

    const nomeCoord = isOutros ? nomeOutros : coordenador?.nome
    const resumoItens = itensPedido.map(i => ({
      nome: (bundle.itens || []).find(x => String(x.id) === String(i.itemId))?.nome || 'Material',
      quantidade: i.quantidade,
    }))

    setEnviando(true)
    const res = await submeterPedidoPublico({
      shareId,
      bundle,
      coordenadorId: isOutros ? '' : coordSel,
      coordenadorNome: nomeCoord,
      isOutros,
      dataPrevista,
      itensPedido,
      obs,
    })
    setEnviando(false)
    if (!res.ok) {
      setErro(res.erro || 'Não foi possível enviar.')
      return
    }

    setConfirmacao({
      coordenadorNome: nomeCoord || '—',
      dataPrevista,
      itens: resumoItens,
      obs: obs.trim(),
    })
    setQtds({})
    setAvisoQtd({})
    setObs('')
    await carregar({ silencioso: true })
  }

  function novaRetirada() {
    setConfirmacao(null)
    setErro('')
    setCoordSel('')
    setNomeOutros('')
    setDataPrevista(new Date().toISOString().slice(0, 10))
  }

  if (!shareId) {
    return (
      <Shell>
        <ErroBox titulo="Link inválido" texto="Solicite um novo link ao responsável da campanha." />
      </Shell>
    )
  }

  if (loading) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-16">
          <Loader2 className="animate-spin" size={28} style={{ color: '#5eead4' }} />
          <p style={{ color: 'rgba(203,213,235,0.7)', fontSize: 13 }}>Carregando materiais...</p>
        </div>
      </Shell>
    )
  }

  if (erroLoad || !bundle) {
    return (
      <Shell>
        <Card>
          <div className="text-center py-10 px-2">
            <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <AlertTriangle size={24} color="#f87171" />
            </div>
            <p className="font-bold text-white mb-2" style={{ fontSize: 18 }}>Indisponível</p>
            <p style={{ fontSize: 13, color: 'rgba(203,213,235,0.65)', marginBottom: 16 }}>{erroLoad || 'Não foi possível carregar.'}</p>
            <button type="button" onClick={() => carregar()}
              className="px-4 py-2.5 rounded-xl font-bold text-white"
              style={{ fontSize: 13, background: '#0d9488' }}>
              Tentar novamente
            </button>
          </div>
        </Card>
      </Shell>
    )
  }

  if (confirmacao) {
    return (
      <Shell>
        <Card>
          <div className="text-center space-y-5">
            <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center"
              style={{ background: 'rgba(16,185,129,0.2)', border: '2px solid rgba(52,211,153,0.5)' }}>
              <CheckCircle2 size={36} style={{ color: '#34d399' }} />
            </div>
            <div>
              <p className="font-black text-white leading-tight" style={{ fontSize: 24 }}>
                Retirada agendada!
              </p>
              <p style={{ fontSize: 14, color: 'rgba(203,213,235,0.8)', marginTop: 8, lineHeight: 1.45 }}>
                Seu pedido foi enviado. Aguarde a validação no depósito para retirar o material.
              </p>
            </div>

            <div className="rounded-2xl px-4 py-4 text-left space-y-3"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148,163,184,0.2)' }}>
              <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.04em' }}>RESUMO</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p style={{ fontSize: 11, color: '#64748b' }}>Coordenador</p>
                  <p className="font-bold text-white" style={{ fontSize: 15 }}>{confirmacao.coordenadorNome}</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: '#64748b' }}>Data prevista</p>
                  <p className="font-bold text-white" style={{ fontSize: 15 }}>{fmtDataBr(confirmacao.dataPrevista)}</p>
                </div>
              </div>
              <div>
                <p style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>Materiais</p>
                <ul className="space-y-1.5">
                  {confirmacao.itens.map((it, idx) => (
                    <li key={idx} className="flex justify-between gap-3"
                      style={{ fontSize: 14, color: '#e2e8f0' }}>
                      <span className="truncate">{it.nome}</span>
                      <span className="font-bold" style={{ color: '#5eead4', flexShrink: 0 }}>
                        {Number(it.quantidade).toLocaleString('pt-BR')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              {confirmacao.obs ? (
                <div>
                  <p style={{ fontSize: 11, color: '#64748b' }}>Observação</p>
                  <p style={{ fontSize: 13, color: '#cbd5e1' }}>{confirmacao.obs}</p>
                </div>
              ) : null}
            </div>

            <button type="button" onClick={novaRetirada}
              className="w-full py-3 rounded-2xl font-bold text-white"
              style={{ fontSize: 15, background: '#0d9488' }}>
              Agendar outra retirada
            </button>
          </div>
        </Card>
      </Shell>
    )
  }

  return (
    <Shell>
      <Card>
        <div className="flex items-start gap-3 mb-5 pb-4"
          style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(13,148,136,0.2)', color: '#5eead4' }}>
            <Package size={20} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 className="font-bold text-white" style={{ fontSize: 17, lineHeight: 1.25 }}>
              {bundle.titulo || 'Agendar retirada'}
            </h1>
            <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.85)', marginTop: 3, lineHeight: 1.4 }}>
              Prévia — a baixa do estoque só ocorre após validação
            </p>
          </div>
        </div>

        <form onSubmit={enviar} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Coordenador">
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#94a3b8' }} />
                <select
                  style={{ ...fieldStyle, padding: '10px 12px 10px 36px' }}
                  value={coordSel}
                  onChange={e => setCoordSel(e.target.value)}
                  required
                >
                  <option value="">Selecione...</option>
                  {(bundle.coordenadores || []).map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                  {bundle.outrosHabilitado !== false && (
                    <option value="__outros__">Outros (informar nome)</option>
                  )}
                </select>
              </div>
            </Campo>

            <Campo label="Data prevista">
              <div className="relative">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" style={{ color: '#94a3b8' }} />
                <input
                  type="date"
                  style={{
                    ...fieldStyle,
                    padding: '10px 10px 10px 36px',
                    minWidth: 0,
                  }}
                  value={dataPrevista}
                  onChange={e => setDataPrevista(e.target.value)}
                  required
                />
              </div>
            </Campo>
          </div>

          {isOutros && (
            <Campo label="Nome do coordenador">
              <input
                style={{ ...fieldStyle, padding: '10px 12px' }}
                value={nomeOutros}
                onChange={e => setNomeOutros(e.target.value)}
                placeholder="Nome completo"
                required
              />
            </Campo>
          )}

          <div>
            <p className="font-semibold mb-2" style={{ fontSize: 12, color: '#94a3b8' }}>
              Materiais disponíveis
            </p>
            {itensVisiveis.length === 0 ? (
              <div className="rounded-xl px-3 py-3"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <p style={{ fontSize: 13, color: '#fbbf24' }}>Nenhum material disponível no momento.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {itensVisiveis.map(item => {
                  const max = maxDoItem(item)
                  const limInfo = lims[item.id]
                  const selecionado = Number(qtds[item.id]) || 0
                  return (
                    <div key={item.id} className="rounded-xl px-3 py-2.5 space-y-2"
                      style={{
                        background: selecionado
                          ? 'rgba(13,148,136,0.12)'
                          : 'rgba(255,255,255,0.04)',
                        border: selecionado
                          ? '1px solid rgba(45,212,191,0.35)'
                          : '1px solid rgba(148,163,184,0.15)',
                      }}>
                      <div className="flex items-start justify-between gap-2">
                        <div style={{ minWidth: 0 }}>
                          <p className="font-bold truncate" style={{ fontSize: 13, color: '#fff' }}>{item.nome}</p>
                          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                            Disp. {(Number(item.disponivel) || 0).toLocaleString('pt-BR')}
                            {item.reservado > 0 ? ` · Reserv. ${Number(item.reservado).toLocaleString('pt-BR')}` : ''}
                            {limInfo?.limite != null ? ` · Limite ${Number(limInfo.restante).toLocaleString('pt-BR')}` : ''}
                          </p>
                        </div>
                        {selecionado > 0 && (
                          <span className="font-bold flex-shrink-0 px-2 py-0.5 rounded-md"
                            style={{ fontSize: 11, background: 'rgba(13,148,136,0.35)', color: '#5eead4' }}>
                            {selecionado.toLocaleString('pt-BR')}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {qtdOpcoesDoItem(item).map(op => {
                          const semEstoque = op.valor > max
                          const ativo = selecionado === op.valor
                          return (
                            <button
                              key={op.valor}
                              type="button"
                              disabled={!coordSel}
                              onClick={() => escolherQtd(item, op.valor)}
                              className="px-2 py-1 rounded-md font-bold transition-colors"
                              style={{
                                fontSize: 11,
                                minWidth: 42,
                                opacity: !coordSel ? 0.45 : 1,
                                background: ativo
                                  ? '#0d9488'
                                  : semEstoque
                                    ? 'rgba(248,113,113,0.12)'
                                    : 'rgba(255,255,255,0.06)',
                                border: ativo
                                  ? '1px solid #2dd4bf'
                                  : semEstoque
                                    ? '1px solid rgba(248,113,113,0.35)'
                                    : '1px solid rgba(148,163,184,0.25)',
                                color: ativo ? '#fff' : semEstoque ? '#fca5a5' : '#e2e8f0',
                              }}
                              title={semEstoque ? `Disponível: ${max.toLocaleString('pt-BR')}` : op.label}
                            >
                              {op.label}
                            </button>
                          )
                        })}
                      </div>
                      {avisoQtd[item.id] && (
                        <p style={{ fontSize: 11, color: '#fbbf24' }}>{avisoQtd[item.id]}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <Campo label="Observação (opcional)">
            <textarea
              style={{ ...fieldStyle, padding: '10px 12px', minHeight: 64, resize: 'vertical', fontSize: 15 }}
              value={obs}
              onChange={e => setObs(e.target.value)}
              placeholder="Ex.: retirar no período da manhã"
            />
          </Campo>

          {erro && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-xl"
              style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#f87171' }} />
              <span style={{ fontSize: 12, color: '#fca5a5' }}>{erro}</span>
            </div>
          )}

          <button type="submit" disabled={enviando || !coordSel}
            className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2"
            style={{
              background: enviando ? '#64748b' : '#0d9488',
              fontSize: 15,
              opacity: !coordSel ? 0.5 : 1,
            }}>
            {enviando ? <Loader2 size={16} className="animate-spin" /> : <Package size={16} />}
            {enviando ? 'Enviando...' : 'Agendar retirada'}
          </button>
        </form>
      </Card>
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div
      className="min-h-screen flex justify-center"
      style={{
        width: '100%',
        maxWidth: '100vw',
        overflowX: 'hidden',
        boxSizing: 'border-box',
        background: 'linear-gradient(160deg, #0f172a 0%, #134e4a 45%, #0f172a 100%)',
        padding: '24px 16px 48px',
      }}
    >
      <div className="w-full" style={{ maxWidth: 520 }}>
        {children}
      </div>
    </div>
  )
}

function Card({ children }) {
  return (
    <div
      className="rounded-2xl p-4 sm:p-6"
      style={{
        background: 'rgba(15,23,42,0.94)',
        border: '1px solid rgba(148,163,184,0.18)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      {children}
    </div>
  )
}

function ErroBox({ titulo, texto }) {
  return (
    <Card>
      <div className="text-center py-10 px-2">
        <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <AlertTriangle size={24} color="#f87171" />
        </div>
        <p className="font-bold text-white mb-2" style={{ fontSize: 18 }}>{titulo}</p>
        <p style={{ fontSize: 13, color: 'rgba(203,213,235,0.65)' }}>{texto}</p>
      </div>
    </Card>
  )
}

function Campo({ label, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label className="block font-semibold mb-1.5" style={{ fontSize: 12, color: '#94a3b8' }}>{label}</label>
      {children}
    </div>
  )
}
