import { useMemo, useRef, useState } from 'react'
import {
  X, DollarSign, Plus, Trash2, Paperclip, Download, Eye,
  FileText, Wallet, Check, AlertTriangle, Loader2, Receipt,
} from 'lucide-react'
import { confirmAction } from '../utils/confirm'
import {
  loadFinanceiro, saveFinanceiro, getFinanceiroMembro, setFinanceiroMembro,
  financeiroVazio, totalPago, saldoDevedor, valorContratoNum, progressoPct,
  fmtMoeda, fmtData, fmtTamanho, hojeIso, lerArquivoBase64, uidFin,
  TIPOS_PAGAMENTO,
} from '../utils/equipeFinanceiro'

const INPUT_CLS = 'input-dark w-full px-3 py-2'
const INPUT_STY = { fontSize: 13 }

function abrirArquivo(arq) {
  if (!arq?.dados) return
  try {
    const w = window.open()
    if (w) {
      w.document.write(
        `<iframe src="${arq.dados}" style="width:100%;height:100%;border:0" title="${arq.nome || 'arquivo'}"></iframe>`
      )
    }
  } catch { /* ignore */ }
}

export default function EquipeFinanceiro({ membro, onFechar, onAtualizar }) {
  const membroId = membro?.id
  const [fin, setFin] = useState(() => {
    if (!membroId) return financeiroVazio()
    return getFinanceiroMembro(loadFinanceiro(), membroId)
  })
  const [novoPagamento, setNovoPagamento] = useState(null) // { valor, data, tipo, obs, comprovante }
  const [salvandoArquivo, setSalvandoArquivo] = useState('')
  const [erro, setErro] = useState('')
  const contratoInputRef = useRef(null)
  const comprovanteInputRef = useRef(null)

  const total = valorContratoNum(fin)
  const pago = totalPago(fin)
  const saldo = saldoDevedor(fin)
  const pct = progressoPct(fin)
  const quitado = total > 0 && saldo <= 0

  function persistir(next) {
    setFin(next)
    if (!membroId) return
    const map = setFinanceiroMembro(loadFinanceiro(), membroId, next)
    saveFinanceiro(map)
    onAtualizar?.()
  }

  function updValorContrato(v) {
    persistir({ ...fin, valorContrato: v })
  }

  async function anexarContrato(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setSalvandoArquivo('contrato')
    setErro('')
    const res = await lerArquivoBase64(file)
    setSalvandoArquivo('')
    if (res.erro) { setErro(res.erro); return }
    const item = { id: uidFin(), ...res, addedAt: new Date().toISOString() }
    persistir({ ...fin, contratos: [...(fin.contratos || []), item] })
  }

  async function removerContrato(id) {
    const ok = await confirmAction({
      titulo: 'Remover arquivo',
      mensagem: 'Deseja remover este contrato anexado?',
      confirmar: 'Remover',
      perigo: true,
    })
    if (!ok) return
    persistir({ ...fin, contratos: (fin.contratos || []).filter(c => c.id !== id) })
  }

  function abrirNovoPagamento() {
    setNovoPagamento({ valor: '', data: hojeIso(), tipo: 'PIX', obs: '', comprovante: null })
    setErro('')
  }

  async function anexarComprovante(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setSalvandoArquivo('comprovante')
    setErro('')
    const res = await lerArquivoBase64(file)
    setSalvandoArquivo('')
    if (res.erro) { setErro(res.erro); return }
    setNovoPagamento(p => ({ ...p, comprovante: { id: uidFin(), ...res } }))
  }

  function salvarPagamento() {
    if (!novoPagamento) return
    const valorNum = parseFloat(String(novoPagamento.valor).replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      setErro('Informe um valor válido para o pagamento')
      return
    }
    const item = {
      id: uidFin(),
      valor: novoPagamento.valor,
      data: novoPagamento.data || hojeIso(),
      tipo: novoPagamento.tipo || 'PIX',
      obs: (novoPagamento.obs || '').trim(),
      comprovante: novoPagamento.comprovante || null,
      criadoEm: new Date().toISOString(),
    }
    const lista = [...(fin.pagamentos || []), item]
      .sort((a, b) => String(b.data).localeCompare(String(a.data)))
    persistir({ ...fin, pagamentos: lista })
    setNovoPagamento(null)
    setErro('')
  }

  async function removerPagamento(id) {
    const ok = await confirmAction({
      titulo: 'Remover pagamento',
      mensagem: 'Deseja remover este pagamento? O saldo devedor será recalculado.',
      confirmar: 'Remover',
      perigo: true,
    })
    if (!ok) return
    persistir({ ...fin, pagamentos: (fin.pagamentos || []).filter(p => p.id !== id) })
  }

  const pagamentosOrdenados = useMemo(
    () => [...(fin.pagamentos || [])].sort((a, b) => String(b.data).localeCompare(String(a.data))),
    [fin.pagamentos]
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(7,10,18,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={onFechar}>
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[94vh] flex flex-col anim-fade-up"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between gap-3"
          style={{ background: 'linear-gradient(135deg,#047857,#065f46)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.18)' }}>
              <Wallet size={17} className="text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-white truncate" style={{ fontSize: 15 }}>Financeiro & Contratos</h3>
              <p className="truncate" style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>{membro?.nome}</p>
            </div>
          </div>
          <button type="button" onClick={onFechar} className="p-1.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Resumo */}
          <div className="rounded-2xl p-4" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
            <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              Valor total do contrato
            </label>
            <div className="flex items-center gap-2 mb-3">
              <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>R$</span>
              <input
                type="number" min="0" step="0.01"
                value={fin.valorContrato}
                onChange={e => updValorContrato(e.target.value)}
                placeholder="0,00"
                className={INPUT_CLS} style={INPUT_STY} />
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <p style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>Total</p>
                <p className="font-bold" style={{ fontSize: 13, color: 'var(--text-primary)' }}>{fmtMoeda(total)}</p>
              </div>
              <div className="rounded-xl p-2.5 text-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
                <p style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>Pago</p>
                <p className="font-bold" style={{ fontSize: 13, color: '#34d399' }}>{fmtMoeda(pago)}</p>
              </div>
              <div className="rounded-xl p-2.5 text-center"
                style={{ background: quitado ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }}>
                <p style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>Saldo devedor</p>
                <p className="font-bold" style={{ fontSize: 13, color: quitado ? '#34d399' : '#f87171' }}>
                  {fmtMoeda(saldo < 0 ? 0 : saldo)}
                </p>
              </div>
            </div>

            {total > 0 && (
              <>
                <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: quitado ? '#10b981' : 'linear-gradient(90deg,#059669,#10b981)' }} />
                </div>
                <p className="mt-1.5 text-center" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                  {quitado ? 'Contrato quitado' : `${pct.toFixed(0)}% pago`}
                </p>
              </>
            )}
          </div>

          {erro && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <AlertTriangle size={13} style={{ color: '#f87171', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#fca5a5' }}>{erro}</span>
            </div>
          )}

          {/* Contratos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="font-bold flex items-center gap-1.5" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                <FileText size={13} /> Contratos assinados
              </p>
              <button type="button" onClick={() => contratoInputRef.current?.click()}
                disabled={salvandoArquivo === 'contrato'}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold"
                style={{ fontSize: 11, background: 'rgba(37,99,235,0.15)', color: 'var(--accent-bright)' }}>
                {salvandoArquivo === 'contrato' ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                Anexar
              </button>
              <input ref={contratoInputRef} type="file" accept="application/pdf,image/*"
                className="hidden" onChange={anexarContrato} />
            </div>
            {(fin.contratos || []).length === 0 ? (
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Nenhum contrato anexado</p>
            ) : (
              <div className="space-y-1.5">
                {fin.contratos.map(c => (
                  <ArquivoLinha key={c.id} arq={c} onRemover={() => removerContrato(c.id)} />
                ))}
              </div>
            )}
          </div>

          {/* Pagamentos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="font-bold flex items-center gap-1.5" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                <Receipt size={13} /> Pagamentos
              </p>
              {!novoPagamento && (
                <button type="button" onClick={abrirNovoPagamento}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold"
                  style={{ fontSize: 11, background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>
                  <Plus size={12} /> Registrar
                </button>
              )}
            </div>

            {/* Form novo pagamento */}
            {novoPagamento && (
              <div className="rounded-2xl p-3 mb-3 space-y-2.5"
                style={{ background: 'var(--bg-raised)', border: '1px solid rgba(16,185,129,0.25)' }}>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold mb-1" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Valor (R$)</label>
                    <input type="number" min="0" step="0.01" autoFocus
                      value={novoPagamento.valor}
                      onChange={e => setNovoPagamento(p => ({ ...p, valor: e.target.value }))}
                      placeholder="0,00" className={INPUT_CLS} style={INPUT_STY} />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Data</label>
                    <input type="date" value={novoPagamento.data}
                      onChange={e => setNovoPagamento(p => ({ ...p, data: e.target.value }))}
                      className={INPUT_CLS} style={{ ...INPUT_STY, colorScheme: 'dark' }} />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold mb-1" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Forma</label>
                  <select value={novoPagamento.tipo}
                    onChange={e => setNovoPagamento(p => ({ ...p, tipo: e.target.value }))}
                    className={INPUT_CLS} style={{ ...INPUT_STY, background: 'var(--bg-raised)' }}>
                    {TIPOS_PAGAMENTO.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Observação</label>
                  <input value={novoPagamento.obs}
                    onChange={e => setNovoPagamento(p => ({ ...p, obs: e.target.value }))}
                    placeholder="Ex.: 1ª parcela" className={INPUT_CLS} style={INPUT_STY} />
                </div>

                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => comprovanteInputRef.current?.click()}
                    disabled={salvandoArquivo === 'comprovante'}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold"
                    style={{ fontSize: 11, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                    {salvandoArquivo === 'comprovante' ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
                    {novoPagamento.comprovante ? 'Trocar comprovante' : 'Anexar comprovante'}
                  </button>
                  {novoPagamento.comprovante && (
                    <span className="flex items-center gap-1 truncate" style={{ fontSize: 10, color: '#34d399' }}>
                      <Check size={11} /> {novoPagamento.comprovante.nome}
                    </span>
                  )}
                  <input ref={comprovanteInputRef} type="file" accept="application/pdf,image/*"
                    className="hidden" onChange={anexarComprovante} />
                </div>

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => { setNovoPagamento(null); setErro('') }}
                    className="px-3 py-2 rounded-xl font-semibold"
                    style={{ fontSize: 12, border: '1px solid var(--border-soft)', color: 'var(--text-secondary)' }}>
                    Cancelar
                  </button>
                  <button type="button" onClick={salvarPagamento}
                    className="flex-1 py-2 rounded-xl font-bold text-white"
                    style={{ fontSize: 12, background: 'linear-gradient(135deg,#059669,#10b981)' }}>
                    Salvar pagamento
                  </button>
                </div>
              </div>
            )}

            {pagamentosOrdenados.length === 0 && !novoPagamento ? (
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Nenhum pagamento registrado</p>
            ) : (
              <div className="space-y-1.5">
                {pagamentosOrdenados.map(p => (
                  <div key={p.id} className="rounded-xl p-3"
                    style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold" style={{ fontSize: 14, color: '#34d399' }}>{fmtMoeda(p.valor)}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          {fmtData(p.data)} · {p.tipo}{p.obs ? ` · ${p.obs}` : ''}
                        </p>
                      </div>
                      <button type="button" onClick={() => removerPagamento(p.id)}
                        className="p-1.5 rounded-lg flex-shrink-0"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {p.comprovante && (
                      <div className="mt-2">
                        <ArquivoLinha arq={p.comprovante} compacto />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
            Arquivos ficam salvos e sincronizados. Cada arquivo pode ter até 4 MB (PDF ou imagem).
          </p>
        </div>
      </div>
    </div>
  )
}

function ArquivoLinha({ arq, onRemover, compacto }) {
  const isImg = (arq?.tipo || '').startsWith('image/')
  return (
    <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg"
      style={{ background: compacto ? 'rgba(255,255,255,0.04)' : 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(37,99,235,0.12)' }}>
        {isImg ? <Eye size={13} style={{ color: 'var(--accent-bright)' }} /> : <FileText size={13} style={{ color: 'var(--accent-bright)' }} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{arq.nome || 'arquivo'}</p>
        {arq.tamanho ? <p style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{fmtTamanho(arq.tamanho)}</p> : null}
      </div>
      <button type="button" onClick={() => abrirArquivo(arq)}
        className="p-1.5 rounded-lg flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}
        title="Visualizar">
        <Eye size={13} />
      </button>
      <a href={arq.dados} download={arq.nome || 'arquivo'}
        className="p-1.5 rounded-lg flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}
        title="Baixar">
        <Download size={13} />
      </a>
      {onRemover && (
        <button type="button" onClick={onRemover}
          className="p-1.5 rounded-lg flex-shrink-0" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}
          title="Remover">
          <Trash2 size={13} />
        </button>
      )}
    </div>
  )
}
