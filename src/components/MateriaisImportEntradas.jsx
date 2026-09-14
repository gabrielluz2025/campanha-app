import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X, FileSpreadsheet, Loader2, Upload, Package, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import {
  lerArquivoEntradasMateriaisXlsx,
  classificarLinhaImportacao,
  resumoImportEntradas,
  aplicarImportEntradasMateriais,
} from '../utils/materiaisImportXlsx'

function fmtData(iso) {
  if (!iso) return '—'
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR')
  } catch {
    return iso
  }
}

export default function MateriaisImportEntradas({
  aberto,
  onFechar,
  itens = [],
  usuarioNome = '',
  usuarioEmail = '',
  onAplicado,
}) {
  const [linhas, setLinhas] = useState([])
  const [arquivo, setArquivo] = useState('')
  const [lendo, setLendo] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef(null)

  const linhasClassificadas = useMemo(() =>
    linhas.map(l => ({
      ...l,
      ...classificarLinhaImportacao(itens, l),
    })),
  [linhas, itens])

  const resumo = useMemo(() => resumoImportEntradas(linhasClassificadas), [linhasClassificadas])

  function fechar() {
    if (aplicando) return
    setLinhas([])
    setArquivo('')
    setMsg('')
    onFechar?.()
  }

  async function handleArquivo(file) {
    if (!file) return
    setLendo(true)
    setMsg('')
    try {
      const parsed = await lerArquivoEntradasMateriaisXlsx(file)
      setLinhas(parsed)
      setArquivo(file.name)
      const r = resumoImportEntradas(parsed.map(l => ({
        ...l,
        ...classificarLinhaImportacao(itens, l),
      })))
      setMsg(`Lidas ${r.selecionadas} entradas · ${r.materiaisDistintos} tipo(s) de material · ${r.totalUnidades.toLocaleString('pt-BR')} unidades`)
    } catch (e) {
      setMsg(e?.message || 'Não foi possível ler a planilha.')
      setLinhas([])
    } finally {
      setLendo(false)
    }
  }

  function toggle(key) {
    setLinhas(prev => prev.map(l => l.key === key ? { ...l, incluir: !l.incluir } : l))
  }

  function toggleTodas(val) {
    setLinhas(prev => prev.map(l => ({ ...l, incluir: val })))
  }

  async function confirmar() {
    const ativas = linhasClassificadas.filter(l => l.incluir !== false)
    if (!ativas.length) {
      setMsg('Marque ao menos uma linha para importar.')
      return
    }
    setAplicando(true)
    setMsg('')
    if (typeof window !== 'undefined') window.__campanhaMateriaisImportAtivo = true
    try {
      const res = aplicarImportEntradasMateriais({
        linhas: ativas,
        itens,
        usuarioNome,
        usuarioEmail,
      })
      if (!res.ok) {
        setMsg(res.erro || 'Falha na importação.')
        return
      }
      await onAplicado?.(res)
      fechar()
    } catch (e) {
      setMsg(e?.message || 'Falha ao importar.')
    } finally {
      if (typeof window !== 'undefined') window.__campanhaMateriaisImportAtivo = false
      setAplicando(false)
    }
  }

  if (!aberto) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.72)' }}
      onClick={fechar}
    >
      <div
        className="w-full sm:max-w-4xl max-h-[92vh] overflow-hidden rounded-t-3xl sm:rounded-3xl flex flex-col"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 flex items-start gap-3 border-b border-white/10">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(52,211,153,0.3)' }}>
            <FileSpreadsheet size={20} style={{ color: '#34d399' }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold" style={{ fontSize: 17, color: 'var(--text-primary)' }}>
              Importar entradas de material
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
              Planilha com colunas <b>Data</b>, <b>Material</b> e <b>Quantidade</b>
              (ex.: Entrada de materiais - Campanha Ismael.xlsx)
            </p>
          </div>
          <button type="button" onClick={fechar} className="p-2 rounded-xl hover:bg-white/5">
            <X size={18} style={{ color: 'var(--text-tertiary)' }} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          <div className="flex flex-wrap gap-2 items-center">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => handleArquivo(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={lendo}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold"
              style={{
                fontSize: 13,
                background: 'linear-gradient(135deg,#0d9488,#14b8a6)',
                color: '#fff',
              }}
            >
              {lendo ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {arquivo ? 'Trocar arquivo' : 'Escolher planilha .xlsx'}
            </button>
            {arquivo && (
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{arquivo}</span>
            )}
          </div>

          {msg && (
            <p style={{ fontSize: 12, color: msg.includes('Falha') || msg.includes('Nenhuma') ? '#f87171' : '#5eead4' }}>
              {msg}
            </p>
          )}

          {linhasClassificadas.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Entradas', value: resumo.selecionadas, cor: '#5eead4' },
                  { label: 'Materiais', value: resumo.materiaisDistintos, cor: '#93c5fd' },
                  { label: 'Novos tipos', value: resumo.materiaisNovos, cor: '#fbbf24' },
                  { label: 'Unidades', value: resumo.totalUnidades.toLocaleString('pt-BR'), cor: '#34d399' },
                ].map(k => (
                  <div key={k.label} className="rounded-xl px-3 py-2"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>{k.label}</p>
                    <p className="font-bold" style={{ fontSize: 16, color: k.cor }}>{k.value}</p>
                  </div>
                ))}
              </div>

              {resumo.semData > 0 && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(251,191,36,0.25)' }}>
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#fbbf24' }} />
                  <p style={{ fontSize: 11, color: '#fde68a' }}>
                    {resumo.semData} linha(s) sem data reconhecida — ao importar, usarão a data de hoje.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => toggleTodas(true)}
                  className="px-3 py-1.5 rounded-lg font-bold"
                  style={{ fontSize: 11, background: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)' }}>
                  Marcar todas
                </button>
                <button type="button" onClick={() => toggleTodas(false)}
                  className="px-3 py-1.5 rounded-lg font-bold"
                  style={{ fontSize: 11, background: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)' }}>
                  Desmarcar todas
                </button>
              </div>

              <div className="rounded-2xl overflow-hidden border border-white/10 max-h-[340px] overflow-y-auto">
                <table className="w-full" style={{ fontSize: 11 }}>
                  <thead style={{ background: 'rgba(255,255,255,0.04)', position: 'sticky', top: 0 }}>
                    <tr>
                      <th className="px-2 py-2 text-left w-8" />
                      <th className="px-2 py-2 text-left">Data</th>
                      <th className="px-2 py-2 text-left">Material</th>
                      <th className="px-2 py-2 text-left hidden sm:table-cell">Fornecedor</th>
                      <th className="px-2 py-2 text-right">Qtd.</th>
                      <th className="px-2 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasClassificadas.map(l => (
                      <tr key={l.key} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <td className="px-2 py-1.5">
                          <input type="checkbox" checked={l.incluir !== false} onChange={() => toggle(l.key)} />
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{fmtData(l.data)}</td>
                        <td className="px-2 py-1.5">
                          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{l.nomeMaterial}</span>
                          {l.nomeOriginal !== l.nomeMaterial && (
                            <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>{l.nomeOriginal}</p>
                          )}
                        </td>
                        <td className="px-2 py-1.5 hidden sm:table-cell" style={{ color: 'var(--text-tertiary)' }}>
                          {l.fornecedor || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right font-bold" style={{ color: '#34d399' }}>
                          {Number(l.quantidade).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-2 py-1.5">
                          {l.status === 'novo' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold"
                              style={{ fontSize: 9, background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>
                              <Package size={9} /> Novo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold"
                              style={{ fontSize: 9, background: 'rgba(52,211,153,0.12)', color: '#6ee7b7' }}>
                              <CheckCircle2 size={9} /> No estoque
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                Cada linha vira uma entrada no histórico (com a data da planilha) e soma ao cadastro do material.
                Materiais novos são criados automaticamente com a categoria inferida pelo nome.
              </p>
            </>
          )}
        </div>

        <div className="px-5 py-4 flex gap-2 justify-end border-t border-white/10">
          <button type="button" onClick={fechar} disabled={aplicando}
            className="px-4 py-2.5 rounded-xl font-bold"
            style={{ fontSize: 13, background: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)' }}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={aplicando || !linhasClassificadas.length}
            className="px-5 py-2.5 rounded-xl font-bold inline-flex items-center gap-2"
            style={{
              fontSize: 13,
              background: 'linear-gradient(135deg,#0d9488,#14b8a6)',
              color: '#fff',
              opacity: (!linhasClassificadas.length || aplicando) ? 0.5 : 1,
            }}
          >
            {aplicando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {aplicando ? 'Importando…' : `Importar ${resumo.selecionadas} entrada(s)`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
