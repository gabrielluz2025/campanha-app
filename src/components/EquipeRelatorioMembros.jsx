import { useMemo, useState } from 'react'
import {
  X, FileText, Copy, Printer, Check, Download, Users, Loader2,
} from 'lucide-react'
import {
  ordenarMembros,
  filtrarRemunerados,
  formatarRelatorioMembrosTexto,
  imprimirRelatorioMembros,
  baixarXlsxMembros,
  copiarTexto,
  dataHoje,
} from '../utils/equipeMembrosReport'
import { normalizarCargo } from '../utils/equipeSync'

/**
 * Relatório dos membros remunerados — PDF/impressão + XLSX.
 */
export default function EquipeRelatorioMembros({
  membros = [],
  membrosFiltrados = null,
  filtroAtual = 'Todos',
  buscaAtual = '',
  onFechar,
}) {
  const [escopo, setEscopo] = useState(
    (filtroAtual && filtroAtual !== 'Todos') || String(buscaAtual || '').trim()
      ? 'filtrados'
      : 'todos',
  )
  const [msg, setMsg] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [baixando, setBaixando] = useState(false)

  const remuneradosTodos = useMemo(() => filtrarRemunerados(membros), [membros])
  const remuneradosFiltrados = useMemo(
    () => filtrarRemunerados(Array.isArray(membrosFiltrados) ? membrosFiltrados : membros),
    [membros, membrosFiltrados],
  )

  const lista = useMemo(() => {
    const base = escopo === 'filtrados' ? remuneradosFiltrados : remuneradosTodos
    return ordenarMembros(base)
  }, [escopo, remuneradosTodos, remuneradosFiltrados])

  const subtitulo = useMemo(() => {
    if (escopo === 'filtrados') {
      const parts = []
      if (filtroAtual && filtroAtual !== 'Todos') parts.push(filtroAtual)
      if (String(buscaAtual || '').trim()) parts.push(`busca “${String(buscaAtual).trim()}”`)
      return parts.length
        ? `Só remunerados · ${parts.join(' · ')}`
        : 'Só remunerados · lista filtrada na tela'
    }
    return 'Somente quem tem remuneração cadastrada'
  }, [escopo, filtroAtual, buscaAtual])

  async function flash(texto) {
    setMsg(texto)
    setTimeout(() => setMsg(''), 2800)
  }

  async function copiar() {
    const texto = formatarRelatorioMembrosTexto(lista, { titulo: 'RELATÓRIO DE MEMBROS' })
    const ok = await copiarTexto(texto)
    setCopiado(ok)
    await flash(ok ? 'Texto copiado!' : 'Falha ao copiar')
    if (ok) setTimeout(() => setCopiado(false), 2000)
  }

  function imprimir() {
    if (!lista.length) {
      flash('Nenhum membro para imprimir')
      return
    }
    const res = imprimirRelatorioMembros({
      membros: lista,
      titulo: 'Relatório de Membros',
      subtitulo,
    })
    if (!res.ok && res.erro === 'popup') {
      flash('Permita pop-ups neste site para imprimir / salvar PDF')
    } else {
      flash('Janela de impressão aberta — use “Salvar como PDF” se quiser o arquivo')
    }
  }

  async function baixarXlsx() {
    if (!lista.length) {
      flash('Nenhum membro para exportar')
      return
    }
    setBaixando(true)
    try {
      const res = await baixarXlsxMembros(lista)
      await flash(res.ok ? `XLSX baixado: ${res.nome}` : 'Falha ao gerar XLSX')
    } catch {
      await flash('Falha ao gerar XLSX')
    } finally {
      setBaixando(false)
    }
  }

  const preview = lista.slice(0, 8)

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(7,10,18,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={onFechar}>
      <div
        className="w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[94vh] flex flex-col anim-fade-up"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        onClick={e => e.stopPropagation()}>

        <div className="px-5 py-4 flex items-center justify-between gap-3"
          style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e3a8a)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.18)' }}>
              <Users size={17} className="text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-white truncate" style={{ fontSize: 15 }}>
                Relatório de Membros
              </h3>
              <p className="truncate" style={{ fontSize: 11, color: 'rgba(191,219,254,0.95)' }}>
                Só remunerados · nome/telefone/igreja em amarelo
              </p>
            </div>
          </div>
          <button type="button" onClick={onFechar} className="p-1.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              Quem entra no relatório
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'todos', label: `Remunerados (${remuneradosTodos.length})` },
                {
                  id: 'filtrados',
                  label: `Filtro da tela (${remuneradosFiltrados.length})`,
                },
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setEscopo(opt.id)}
                  className="px-3 py-1.5 rounded-xl font-bold"
                  style={{
                    fontSize: 12,
                    background: escopo === opt.id ? 'rgba(37,99,235,0.25)' : 'rgba(255,255,255,0.05)',
                    color: escopo === opt.id ? '#93c5fd' : 'var(--text-tertiary)',
                    border: `1px solid ${escopo === opt.id ? 'rgba(59,130,246,0.45)' : 'transparent'}`,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
              {subtitulo} · {dataHoje()}
            </p>
          </div>

          <div className="rounded-2xl px-4 py-3"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)' }}>
            <p className="font-bold" style={{ fontSize: 13, color: 'var(--text-primary)' }}>
              {lista.length} membro{lista.length !== 1 ? 's' : ''} no relatório
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Nome, telefone e igreja em amarelo na impressão · inclui cargo na igreja.
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-semibold" style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
              Prévia
            </p>
            {preview.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Nenhum membro neste escopo.</p>
            ) : preview.map(m => (
              <div key={m.id || m.nome} className="rounded-xl px-3 py-2"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="font-bold truncate" style={{ fontSize: 13, color: 'var(--text-primary)' }}>{m.nome}</p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {[normalizarCargo(m.cargo), m.telefone, m.cidadeAtuacao || m.cidade].filter(Boolean).join(' · ')}
                </p>
              </div>
            ))}
            {lista.length > preview.length && (
              <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                +{lista.length - preview.length} outros no arquivo completo
              </p>
            )}
          </div>

          {msg && (
            <p className="rounded-xl px-3 py-2 font-semibold"
              style={{ fontSize: 12, background: 'rgba(34,197,94,0.12)', color: '#86efac' }}>
              {msg}
            </p>
          )}
        </div>

        <div className="px-5 py-4 flex flex-wrap gap-2"
          style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <button type="button" onClick={copiar}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl font-bold"
            style={{ fontSize: 12, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
            {copiado ? <Check size={14} /> : <Copy size={14} />}
            Copiar texto
          </button>
          <button type="button" onClick={imprimir} disabled={!lista.length}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl font-bold disabled:opacity-40"
            style={{ fontSize: 12, background: 'rgba(37,99,235,0.2)', color: '#93c5fd' }}>
            <Printer size={14} />
            Imprimir / PDF
          </button>
          <button type="button" onClick={baixarXlsx} disabled={!lista.length || baixando}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl font-bold text-white disabled:opacity-40"
            style={{ fontSize: 12, background: 'linear-gradient(135deg,#059669,#10b981)' }}>
            {baixando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Baixar XLSX
          </button>
          <button type="button" onClick={onFechar}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl font-semibold"
            style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
