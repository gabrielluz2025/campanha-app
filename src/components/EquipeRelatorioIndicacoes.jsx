import { useMemo, useState } from 'react'
import {
  X, FileText, Copy, MessageCircle, Printer, Check, UserCheck,
} from 'lucide-react'
import { linkWhatsApp } from '../utils/rotaUtils'
import { pendenciasCadastro, pctCadastro, checklistCadastroIndicacoes } from '../utils/equipeCadastro'
import { copiarTexto } from '../utils/equipeContratoReport'
import {
  listarIndicadores,
  filtrarIndicados,
  formatarMensagemPendencias,
  formatarRelatorioIndicacoesTexto,
  imprimirRelatorioIndicacoes,
  dataHoje,
} from '../utils/equipeIndicacoesReport'
import { fmtMoeda } from '../utils/equipeFinanceiro'

const WHATSAPP_MAX = 1800

/**
 * Relatório PDF/impressão e WhatsApp — pendências por quem indicou.
 */
export default function EquipeRelatorioIndicacoes({ membros = [], onFechar }) {
  const indicadores = useMemo(() => listarIndicadores(membros), [membros])
  const [indicadorId, setIndicadorId] = useState('')
  const [soPendencias, setSoPendencias] = useState(true)
  const [msg, setMsg] = useState('')
  const [copiado, setCopiado] = useState(false)

  const gruposSelecionados = useMemo(() => {
    if (!indicadorId) return indicadores
    const g = indicadores.find(x => x.id === indicadorId)
    return g ? [g] : []
  }, [indicadores, indicadorId])

  const listaPlana = useMemo(() => {
    const out = []
    for (const g of gruposSelecionados) {
      const lista = filtrarIndicados(g.indicados, membros, { soPendencias })
      for (const m of lista) out.push({ indicador: g, membro: m })
    }
    return out
  }, [gruposSelecionados, membros, soPendencias])

  const indicadorAtual = indicadorId
    ? indicadores.find(x => x.id === indicadorId) || null
    : null

  const totalPend = listaPlana.filter(
    ({ membro }) => pendenciasCadastro(membro, membros).length > 0
  ).length

  async function flash(texto) {
    setMsg(texto)
    setTimeout(() => setMsg(''), 2500)
  }

  async function copiarRelatorio() {
    const texto = indicadorAtual
      ? formatarMensagemPendencias({
          indicadorNome: indicadorAtual.nome,
          indicados: indicadorAtual.indicados,
          membros,
          soPendencias,
        })
      : formatarRelatorioIndicacoesTexto({
          grupos: gruposSelecionados,
          membros,
          soPendencias,
        })
    const ok = await copiarTexto(texto)
    setCopiado(ok)
    await flash(ok ? 'Texto copiado!' : 'Falha ao copiar')
    if (ok) setTimeout(() => setCopiado(false), 2000)
  }

  async function abrirWhatsApp() {
    if (!indicadorAtual) {
      await flash('Escolha um indicador para enviar no WhatsApp')
      return
    }
    const texto = formatarMensagemPendencias({
      indicadorNome: indicadorAtual.nome,
      indicados: indicadorAtual.indicados,
      membros,
      soPendencias,
    })
    await copiarTexto(texto)
    if (texto.length > WHATSAPP_MAX) {
      window.open('https://wa.me/', '_blank', 'noopener,noreferrer')
      await flash('Texto longo: já copiado. Cole no WhatsApp (Ctrl+V).')
      return
    }
    const wa = indicadorAtual.telefone ? linkWhatsApp(indicadorAtual.telefone, texto) : ''
    if (wa) {
      window.open(wa, '_blank', 'noopener,noreferrer')
      await flash('Abrindo WhatsApp…')
      return
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer')
    await flash('Abrindo WhatsApp…')
  }

  function imprimir() {
    if (!listaPlana.length) return
    const res = imprimirRelatorioIndicacoes({
      grupos: gruposSelecionados,
      membros,
      soPendencias,
      indicadorNome: indicadorAtual?.nome || '',
    })
    if (!res.ok && res.erro === 'popup') {
      flash('Permita pop-ups neste site para gerar o PDF')
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(7,10,18,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={onFechar}>
      <div
        className="w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[94vh] flex flex-col anim-fade-up"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        onClick={e => e.stopPropagation()}>

        <div className="px-5 py-4 flex items-center justify-between gap-3 no-print"
          style={{ background: 'linear-gradient(135deg,#a16207,#854d0e)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.18)' }}>
              <UserCheck size={17} className="text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-white truncate" style={{ fontSize: 15 }}>
                Relatório de Indicações
              </h3>
              <p className="truncate" style={{ fontSize: 11, color: 'rgba(254,243,199,0.9)' }}>
                Solicitar dados faltantes · PDF / impressão
              </p>
            </div>
          </div>
          <button type="button" onClick={onFechar} className="p-1.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="space-y-3 no-print">
            <div>
              <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Quem indicou
              </label>
              <select
                value={indicadorId}
                onChange={e => setIndicadorId(e.target.value)}
                className="input-dark w-full py-2.5"
                style={{ fontSize: 13 }}
              >
                <option value="">Todos os indicadores</option>
                {indicadores.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.nome} — {g.total} pessoa{g.total !== 1 ? 's' : ''} · {fmtMoeda(g.valorTotal)} · {g.comPendencias} pendência{g.comPendencias !== 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none"
              style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                checked={soPendencias}
                onChange={e => setSoPendencias(e.target.checked)}
                className="rounded"
              />
              Listar apenas indicados com dados faltando
            </label>

            {indicadores.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                Nenhum membro tem indicação registrada. Preencha o campo “Indicação” no cadastro.
              </p>
            )}
          </div>

          {/* Prévia na tela (impressão abre janela própria) */}
          <div className="rounded-2xl p-4 space-y-4"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
            <div>
              <p className="font-bold" style={{ fontSize: 16, color: 'var(--text-primary)' }}>
                Relatório de Indicações — Pendências de Cadastro
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                {dataHoje()}
                {indicadorAtual
                  ? ` · Indicador: ${indicadorAtual.nome}`
                  : ' · Todos os indicadores'}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                {soPendencias
                  ? 'Solicitamos o preenchimento dos dados abaixo para completar o cadastro de cada indicado.'
                  : 'Situação do cadastro dos indicados listados abaixo.'}
              </p>
            </div>

            {listaPlana.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                {soPendencias
                  ? 'Nenhuma pendência no filtro selecionado.'
                  : 'Nenhum indicado no filtro selecionado.'}
              </p>
            ) : (
              <div className="space-y-3">
                {gruposSelecionados.map(g => {
                  const lista = filtrarIndicados(g.indicados, membros, { soPendencias })
                  if (!lista.length) return null
                  return (
                    <div key={g.id} className="space-y-2">
                      {(!indicadorId || gruposSelecionados.length > 1) && (
                        <div>
                          <p className="font-bold flex items-center gap-1.5"
                            style={{ fontSize: 13, color: 'var(--brand-gold, #eab308)' }}>
                            <UserCheck size={14} /> Indicação de {g.nome}
                          </p>
                          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                            {g.total} pessoa{g.total !== 1 ? 's' : ''} · total {fmtMoeda(g.valorTotal)}
                          </p>
                        </div>
                      )}
                      {indicadorId && gruposSelecionados.length === 1 && (
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {g.total} pessoa{g.total !== 1 ? 's' : ''} indicada{g.total !== 1 ? 's' : ''} · valor total {fmtMoeda(g.valorTotal)}
                        </p>
                      )}
                      {lista.map(m => {
                        const check = checklistCadastroIndicacoes(m, membros)
                        const pend = check.filter(c => c.falta)
                        const pct = pctCadastro(m, membros)
                        return (
                          <div key={m.id} className="rounded-xl p-3"
                            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="min-w-0">
                                <p className="font-bold truncate" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                                  {m.nome || '—'}
                                </p>
                                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                  {[m.cargo, m.vinculo].filter(Boolean).join(' · ') || 'Sem cargo/vínculo'}
                                </p>
                              </div>
                              <span className="font-bold flex-shrink-0" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                {pct}%
                              </span>
                            </div>
                            <div className="space-y-1">
                              {check.filter(c => !(c.opcional && !c.valor && !c.falta)).map(c => (
                                <div key={c.key} className="flex gap-2 justify-between" style={{ fontSize: 11 }}>
                                  <span style={{ color: 'var(--text-tertiary)' }}>{c.label}</span>
                                  <span className="text-right font-semibold" style={{
                                    color: c.falta ? '#fbbf24' : 'var(--text-secondary)',
                                    maxWidth: '58%',
                                    wordBreak: 'break-word',
                                  }}>
                                    {c.falta ? 'FALTA' : (c.valor || '—')}
                                  </span>
                                </div>
                              ))}
                            </div>
                            {pend.length === 0 && (
                              <p className="mt-2 font-semibold" style={{ fontSize: 11, color: '#34d399' }}>
                                Cadastro completo
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}

            <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              Total nesta lista: {listaPlana.length}
              {soPendencias ? ` · ${totalPend} com pendências` : ''}
            </p>
          </div>

          {msg && (
            <p className="text-center no-print" style={{ fontSize: 12, color: '#34d399' }}>{msg}</p>
          )}
        </div>

        <div className="px-5 py-4 space-y-2 no-print" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={!listaPlana.length} onClick={copiarRelatorio}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold"
              style={{
                fontSize: 12, opacity: listaPlana.length ? 1 : 0.4,
                background: 'var(--bg-raised)', color: 'var(--text-secondary)',
              }}>
              {copiado ? <Check size={14} /> : <Copy size={14} />}
              {copiado ? 'Copiado' : 'Copiar texto'}
            </button>
            <button type="button" disabled={!indicadorAtual || !listaPlana.length} onClick={abrirWhatsApp}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold"
              style={{
                fontSize: 12, opacity: indicadorAtual && listaPlana.length ? 1 : 0.4,
                background: 'rgba(16,185,129,0.15)', color: '#34d399',
              }}>
              <MessageCircle size={14} /> Enviar WhatsApp
            </button>
          </div>
          <button type="button" disabled={!listaPlana.length} onClick={imprimir}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold text-black"
            style={{
              fontSize: 13, opacity: listaPlana.length ? 1 : 0.4,
              background: 'linear-gradient(135deg,#eab308,#ca8a04)',
            }}>
            <Printer size={14} /> <FileText size={14} /> Imprimir / Salvar PDF
          </button>
          <p className="text-center" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
            Abre uma janela com o relatório — escolha “Salvar como PDF” no destino
          </p>
        </div>
      </div>
    </div>
  )
}
