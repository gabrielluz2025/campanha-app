import { useMemo, useState } from 'react'
import {
  X, Search, FileText, Copy, MessageCircle, Printer, Link2,
  CheckSquare, Square, AlertTriangle, Check, Loader2, Lock, ChevronLeft,
} from 'lucide-react'
import {
  membroParaRelatorio, formatarMembroTexto, formatarRelatorioTexto,
  camposFaltando, formatarDataExibicao, formatarSalarioExibicao,
  formatarEnderecoExibicao, copiarTexto,
} from '../utils/equipeContratoReport'
import {
  criarCompartilhamentoContratos, loadCompartilhamentosContratos,
} from '../utils/equipeContratoShare'
import { normalizarCargo } from '../utils/equipeSync'
import { membroElegivelContrato } from '../utils/equipeContratoDoc'

const WHATSAPP_MAX = 1800

function CardMembroContrato({ m, onCopiar, copiadoId }) {
  const faltas = camposFaltando(m)
  const end = formatarEnderecoExibicao(m)
  return (
    <div className="rounded-2xl p-4 break-inside-avoid contrato-ficha"
      style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-bold" style={{ fontSize: 15, color: 'var(--text-primary)' }}>{m.nome || '—'}</p>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {[m.cargo, m.vinculo].filter(Boolean).join(' · ') || 'Sem cargo/vínculo'}
          </p>
        </div>
        {onCopiar && (
          <button type="button" onClick={() => onCopiar(m)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold no-print"
            style={{
              fontSize: 11,
              background: copiadoId === m.id ? 'rgba(16,185,129,0.18)' : 'rgba(37,99,235,0.15)',
              color: copiadoId === m.id ? '#34d399' : 'var(--accent-bright)',
            }}>
            {copiadoId === m.id ? <Check size={12} /> : <Copy size={12} />}
            {copiadoId === m.id ? 'Copiado' : 'Copiar'}
          </button>
        )}
      </div>

      {faltas.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3 px-2 py-1.5 rounded-lg no-print"
          style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <AlertTriangle size={12} style={{ color: '#fbbf24', flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: '#fcd34d' }}>Falta: {faltas.join(', ')}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2" style={{ fontSize: 12 }}>
        <Linha label="CPF" value={m.cpf} />
        <Linha label="Nascimento" value={m.dataNascimento ? formatarDataExibicao(m.dataNascimento) : ''} />
        <Linha label="Telefone" value={m.telefone} />
        <Linha label="Remuneração" value={m.salario ? formatarSalarioExibicao(m.salario) : ''} />
        <Linha label="Início" value={m.dataInicio ? formatarDataExibicao(m.dataInicio) : ''} />
        <Linha label="Nº contrato" value={m.contrato} />
        <div className="sm:col-span-2"><Linha label="Endereço" value={end} /></div>
        {m.observacoes && (
          <div className="sm:col-span-2"><Linha label="Observações" value={m.observacoes} /></div>
        )}
      </div>
    </div>
  )
}

function Linha({ label, value }) {
  return (
    <div>
      <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 1 }}>{label}</p>
      <p style={{ color: 'var(--text-secondary)', wordBreak: 'break-word' }}>{value || '—'}</p>
    </div>
  )
}

export default function EquipeRelatorioContratos({ membros = [], onFechar }) {
  const [busca, setBusca] = useState('')
  const [selecionados, setSelecionados] = useState(() => new Set())
  const [etapa, setEtapa] = useState('selecao') // selecao | visualizacao | impressao | link
  const [copiadoId, setCopiadoId] = useState(null)
  const [msg, setMsg] = useState('')
  const [gerandoLink, setGerandoLink] = useState(false)
  const [linkInfo, setLinkInfo] = useState(null) // { link, pin, qtd }
  const [historico] = useState(() => loadCompartilhamentosContratos().slice().reverse().slice(0, 5))

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return membros
      .filter(m => membroElegivelContrato(m))
      .map(m => ({ ...m, cargo: normalizarCargo(m.cargo) }))
      .filter(m => {
        if (!q) return true
        return (m.nome || '').toLowerCase().includes(q) ||
          (m.cpf || '').includes(q) ||
          (m.cidade || '').toLowerCase().includes(q) ||
          (m.vinculo || '').toLowerCase().includes(q)
      })
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
  }, [membros, busca])

  const selecionadosLista = useMemo(() => {
    return membros
      .filter(m => selecionados.has(m.id))
      .map(membroParaRelatorio)
      .filter(Boolean)
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
  }, [membros, selecionados])

  function toggle(id) {
    setSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function marcarTodosVisiveis() {
    setSelecionados(prev => {
      const next = new Set(prev)
      lista.forEach(m => next.add(m.id))
      return next
    })
  }

  function desmarcarTodos() {
    setSelecionados(new Set())
  }

  async function flash(texto, id = 'all') {
    setMsg(texto)
    setCopiadoId(id)
    setTimeout(() => {
      setCopiadoId(null)
      setMsg('')
    }, 2000)
  }

  async function copiarUm(m) {
    const ok = await copiarTexto(formatarMembroTexto(m))
    await flash(ok ? 'Copiado!' : 'Não foi possível copiar', m.id)
  }

  async function copiarTodos() {
    if (!selecionadosLista.length) return
    const ok = await copiarTexto(formatarRelatorioTexto(selecionadosLista))
    await flash(ok ? `${selecionadosLista.length} membro(s) copiado(s)` : 'Não foi possível copiar', 'all')
  }

  async function abrirWhatsApp() {
    if (!selecionadosLista.length) return
    const texto = formatarRelatorioTexto(selecionadosLista)
    await copiarTexto(texto)
    if (texto.length > WHATSAPP_MAX) {
      await flash('Texto longo: já copiado. Cole no WhatsApp (Ctrl+V).', 'wa')
      window.open('https://wa.me/', '_blank', 'noopener,noreferrer')
      return
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer')
    await flash('Abrindo WhatsApp…', 'wa')
  }

  function irVisualizar() {
    if (!selecionadosLista.length) return
    setEtapa('visualizacao')
  }

  function irImprimir() {
    if (!selecionadosLista.length) return
    setEtapa('impressao')
    setTimeout(() => window.print(), 350)
  }

  async function gerarLink() {
    if (!selecionadosLista.length) return
    setGerandoLink(true)
    setMsg('')
    try {
      const res = await criarCompartilhamentoContratos(selecionadosLista)
      setLinkInfo(res)
      setEtapa('link')
    } catch {
      setMsg('Erro ao gerar link. Tente novamente.')
    } finally {
      setGerandoLink(false)
    }
  }

  async function copiarLink() {
    if (!linkInfo?.link) return
    const ok = await copiarTexto(linkInfo.link)
    await flash(ok ? 'Link copiado!' : 'Falha ao copiar', 'link')
  }

  async function copiarPin() {
    if (!linkInfo?.pin) return
    const ok = await copiarTexto(linkInfo.pin)
    await flash(ok ? 'PIN copiado!' : 'Falha ao copiar', 'pin')
  }

  const qtd = selecionados.size
  const podeAgir = qtd > 0

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(7,10,18,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={onFechar}>
      <div
        className="w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[94vh] flex flex-col anim-fade-up"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between gap-3 no-print"
          style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e40af)' }}>
          <div className="flex items-center gap-3 min-w-0">
            {etapa !== 'selecao' && (
              <button type="button" onClick={() => setEtapa('selecao')}
                className="p-1.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                <ChevronLeft size={16} />
              </button>
            )}
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.18)' }}>
              <FileText size={17} className="text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-white truncate" style={{ fontSize: 15 }}>
                Relatório para Contratos
              </h3>
              <p className="text-blue-200 truncate" style={{ fontSize: 11 }}>
                {etapa === 'selecao' && `${qtd} selecionado${qtd !== 1 ? 's' : ''}`}
                {etapa === 'visualizacao' && `Visualizando ${selecionadosLista.length} membro(s)`}
                {etapa === 'impressao' && 'Pronto para imprimir / salvar PDF'}
                {etapa === 'link' && 'Link gerado com PIN'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onFechar} className="p-1.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
            <X size={16} />
          </button>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* ── Seleção ── */}
          {etapa === 'selecao' && (
            <>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--text-tertiary)' }} />
                <input value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar por nome, CPF, cidade ou vínculo…"
                  className="input-dark w-full pl-9 pr-3 py-2" style={{ fontSize: 13 }} />
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex gap-2">
                  <button type="button" onClick={marcarTodosVisiveis}
                    className="px-3 py-1.5 rounded-lg font-semibold"
                    style={{ fontSize: 11, background: 'var(--bg-raised)', color: 'var(--text-secondary)' }}>
                    Marcar visíveis
                  </button>
                  <button type="button" onClick={desmarcarTodos}
                    className="px-3 py-1.5 rounded-lg font-semibold"
                    style={{ fontSize: 11, background: 'var(--bg-raised)', color: 'var(--text-secondary)' }}>
                    Limpar
                  </button>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {lista.length} na lista · {qtd} marcado{qtd !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="space-y-1.5 max-h-[42vh] overflow-y-auto pr-1">
                {lista.length === 0 ? (
                  <p className="text-center py-8" style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                    Nenhum membro encontrado
                  </p>
                ) : lista.map(m => {
                  const sel = selecionados.has(m.id)
                  const faltas = camposFaltando(m)
                  return (
                    <button key={m.id} type="button" onClick={() => toggle(m.id)}
                      className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left hov-srf transition-colors"
                      style={{
                        background: sel ? 'rgba(37,99,235,0.12)' : 'transparent',
                        border: `1px solid ${sel ? 'rgba(59,130,246,0.35)' : 'var(--border-subtle)'}`,
                      }}>
                      <div className="mt-0.5 flex-shrink-0">
                        {sel
                          ? <CheckSquare size={18} style={{ color: 'var(--accent-bright)' }} />
                          : <Square size={18} style={{ color: 'var(--text-tertiary)' }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate" style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                          {m.nome}
                        </p>
                        <p className="truncate" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          {[normalizarCargo(m.cargo), m.vinculo, m.cidade].filter(Boolean).join(' · ')}
                        </p>
                        {faltas.length > 0 && (
                          <p className="mt-1 flex items-center gap-1" style={{ fontSize: 10, color: '#fbbf24' }}>
                            <AlertTriangle size={10} /> Falta: {faltas.join(', ')}
                          </p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>

              {historico.length > 0 && (
                <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
                  <p className="font-bold mb-2" style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                    Links recentes
                  </p>
                  <div className="space-y-1.5">
                    {historico.map(h => (
                      <div key={h.shareId} className="flex items-center justify-between gap-2"
                        style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        <span className="truncate">
                          {h.qtd} membro{h.qtd !== 1 ? 's' : ''} · {h.geradoEm ? formatarDataExibicao(h.geradoEm) : '—'}
                          {h.nomes?.length ? ` · ${h.nomes.slice(0, 2).join(', ')}` : ''}
                        </span>
                        {h.pin && (
                          <span className="flex-shrink-0 font-mono" style={{ color: 'var(--accent-bright)' }}>
                            PIN {h.pin}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Visualização / Impressão ── */}
          {(etapa === 'visualizacao' || etapa === 'impressao') && (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap no-print">
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {selecionadosLista.length} ficha{selecionadosLista.length !== 1 ? 's' : ''}
                </p>
                <div className="flex gap-2 flex-wrap">
                  <button type="button" onClick={copiarTodos}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold"
                    style={{ fontSize: 12, background: 'rgba(37,99,235,0.15)', color: 'var(--accent-bright)' }}>
                    <Copy size={13} /> Copiar todos
                  </button>
                  {etapa === 'impressao' && (
                    <button type="button" onClick={() => window.print()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold"
                      style={{ fontSize: 12, background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>
                      <Printer size={13} /> Imprimir de novo
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3 contrato-print-area">
                {selecionadosLista.map(m => (
                  <CardMembroContrato key={m.id} m={m} onCopiar={copiarUm} copiadoId={copiadoId} />
                ))}
              </div>
            </>
          )}

          {/* ── Link gerado ── */}
          {etapa === 'link' && linkInfo && (
            <div className="space-y-4">
              <div className="rounded-2xl p-4" style={{ background: 'rgba(37,99,235,0.10)', border: '1px solid rgba(59,130,246,0.30)' }}>
                <p className="font-bold flex items-center gap-2 mb-2" style={{ fontSize: 13, color: '#93c5fd' }}>
                  <Link2 size={14} /> Link público gerado
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-all', marginBottom: 10 }}>
                  {linkInfo.link}
                </p>
                <button type="button" onClick={copiarLink}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold"
                  style={{ fontSize: 12, background: 'rgba(255,255,255,0.08)', color: '#fff' }}>
                  <Copy size={13} /> Copiar link
                </button>
              </div>

              <div className="rounded-2xl p-4" style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.28)' }}>
                <p className="font-bold flex items-center gap-2 mb-2" style={{ fontSize: 13, color: '#fcd34d' }}>
                  <Lock size={14} /> PIN de acesso
                </p>
                <p className="font-black tracking-widest mb-2" style={{ fontSize: 28, color: '#fff' }}>
                  {linkInfo.pin}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>
                  Envie o PIN separado do link (WhatsApp). A pessoa precisa digitar para ver CPF e endereço.
                </p>
                <button type="button" onClick={copiarPin}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold"
                  style={{ fontSize: 12, background: 'rgba(255,255,255,0.08)', color: '#fff' }}>
                  <Copy size={13} /> Copiar PIN
                </button>
              </div>

              <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Snapshot com {linkInfo.qtd} membro{linkInfo.qtd !== 1 ? 's' : ''}. Se editar um membro depois, gere um novo link.
              </p>
            </div>
          )}

          {msg && (
            <p className="text-center no-print" style={{ fontSize: 12, color: '#34d399' }}>{msg}</p>
          )}
        </div>

        {/* Footer ações */}
        {etapa === 'selecao' && (
          <div className="px-5 py-4 space-y-2 no-print" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={!podeAgir} onClick={irVisualizar}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold"
                style={{
                  fontSize: 12, opacity: podeAgir ? 1 : 0.4,
                  background: 'rgba(37,99,235,0.18)', color: 'var(--accent-bright)',
                }}>
                <FileText size={14} /> Ver no sistema
              </button>
              <button type="button" disabled={!podeAgir} onClick={copiarTodos}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold"
                style={{
                  fontSize: 12, opacity: podeAgir ? 1 : 0.4,
                  background: 'var(--bg-raised)', color: 'var(--text-secondary)',
                }}>
                <Copy size={14} /> Copiar
              </button>
              <button type="button" disabled={!podeAgir} onClick={abrirWhatsApp}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold"
                style={{
                  fontSize: 12, opacity: podeAgir ? 1 : 0.4,
                  background: 'rgba(16,185,129,0.15)', color: '#34d399',
                }}>
                <MessageCircle size={14} /> WhatsApp
              </button>
              <button type="button" disabled={!podeAgir} onClick={irImprimir}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold"
                style={{
                  fontSize: 12, opacity: podeAgir ? 1 : 0.4,
                  background: 'var(--bg-raised)', color: 'var(--text-secondary)',
                }}>
                <Printer size={14} /> Imprimir / PDF
              </button>
            </div>
            <button type="button" disabled={!podeAgir || gerandoLink} onClick={gerarLink}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold text-white"
              style={{
                fontSize: 13, opacity: podeAgir && !gerandoLink ? 1 : 0.45,
                background: 'linear-gradient(135deg,#1d4ed8,#1e40af)',
              }}>
              {gerandoLink
                ? <><Loader2 size={14} className="animate-spin" /> Gerando link…</>
                : <><Link2 size={14} /> Gerar link público + PIN</>}
            </button>
          </div>
        )}

        {(etapa === 'visualizacao' || etapa === 'impressao') && (
          <div className="px-5 py-3 flex gap-2 no-print" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <button type="button" onClick={abrirWhatsApp}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold"
              style={{ fontSize: 12, background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>
              <MessageCircle size={14} /> WhatsApp
            </button>
            <button type="button" onClick={() => { setEtapa('impressao'); setTimeout(() => window.print(), 200) }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold"
              style={{ fontSize: 12, background: 'var(--bg-raised)', color: 'var(--text-secondary)' }}>
              <Printer size={14} /> Imprimir
            </button>
            <button type="button" disabled={gerandoLink} onClick={gerarLink}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-white"
              style={{ fontSize: 12, background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', opacity: gerandoLink ? 0.5 : 1 }}>
              <Link2 size={14} /> Link
            </button>
          </div>
        )}
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .contrato-print-area, .contrato-print-area * { visibility: visible !important; }
          .contrato-print-area {
            position: absolute !important;
            left: 0; top: 0; width: 100%;
            background: #fff !important;
            color: #111 !important;
            padding: 16px !important;
          }
          .contrato-ficha {
            background: #fff !important;
            border: 1px solid #ccc !important;
            color: #111 !important;
            page-break-inside: avoid;
            break-inside: avoid;
            margin-bottom: 16px !important;
          }
          .contrato-ficha p { color: #111 !important; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  )
}
