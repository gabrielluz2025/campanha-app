import { useMemo, useState } from 'react'
import {
  X, FileText, Copy, Printer, Check, Church,
} from 'lucide-react'
import { copiarTexto } from '../utils/equipeContratoReport'
import {
  listarPessoasIgreja,
  formatarRelatorioIgrejasTexto,
  imprimirRelatorioIgrejas,
  nomeIgrejaMembro,
  cargoEclesiastico,
  dataHoje,
} from '../utils/equipeIgrejasReport'

/**
 * Relatório PDF/impressão — rede de igrejas e cargos eclesiásticos.
 */
export default function EquipeRelatorioIgrejas({ membros = [], onFechar }) {
  const [escopo, setEscopo] = useState('cargo_igreja') // cargo_igreja | rede | todos
  const [denom, setDenom] = useState('todas')
  const [igrejaNome, setIgrejaNome] = useState('')
  const [cargoIgreja, setCargoIgreja] = useState('')
  const [agrupar, setAgrupar] = useState('igreja')
  const [msg, setMsg] = useState('')
  const [copiado, setCopiado] = useState(false)

  const igrejasOpts = useMemo(() => {
    const set = new Set()
    membros.forEach(m => {
      const n = nomeIgrejaMembro(m)
      if (n) set.add(n)
    })
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [membros])

  const cargosIgOpts = useMemo(() => {
    const set = new Set()
    membros.forEach(m => {
      const c = cargoEclesiastico(m)
      if (c) set.add(c)
    })
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [membros])

  const { lista, grupos } = useMemo(() => listarPessoasIgreja(membros, {
    escopo,
    denom,
    igrejaNome,
    cargoIgreja,
    agrupar,
  }), [membros, escopo, denom, igrejaNome, cargoIgreja, agrupar])

  const subtitulo = useMemo(() => {
    const parts = []
    if (escopo === 'cargo_igreja') parts.push('Com cargo na igreja')
    else if (escopo === 'rede') parts.push('Rede de igrejas')
    else parts.push('Todos os membros')
    if (denom === 'ad') parts.push('só AD/ADBLU')
    if (denom === 'outras') parts.push('só outras')
    if (igrejaNome) parts.push(igrejaNome)
    if (cargoIgreja) parts.push(cargoIgreja)
    return parts.join(' · ')
  }, [escopo, denom, igrejaNome, cargoIgreja])

  async function flash(texto) {
    setMsg(texto)
    setTimeout(() => setMsg(''), 2500)
  }

  async function copiar() {
    const texto = formatarRelatorioIgrejasTexto({ grupos, titulo: 'RELATÓRIO DE IGREJAS' })
    const ok = await copiarTexto(texto)
    setCopiado(ok)
    await flash(ok ? 'Texto copiado!' : 'Falha ao copiar')
    if (ok) setTimeout(() => setCopiado(false), 2000)
  }

  function imprimir() {
    if (!lista.length) return
    const res = imprimirRelatorioIgrejas({ grupos, subtitulo })
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

        <div className="px-5 py-4 flex items-center justify-between gap-3"
          style={{ background: 'linear-gradient(135deg,#0e7490,#155e75)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.18)' }}>
              <Church size={17} className="text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-white truncate" style={{ fontSize: 15 }}>
                Relatório de Igrejas
              </h3>
              <p className="truncate" style={{ fontSize: 11, color: 'rgba(207,250,254,0.9)' }}>
                Rede · cargos eclesiásticos · PDF / impressão
              </p>
            </div>
          </div>
          <button type="button" onClick={onFechar} className="p-1.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="space-y-3">
            <div>
              <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Quem incluir
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'cargo_igreja', label: 'Com cargo na igreja' },
                  { id: 'rede', label: 'Toda a rede (igreja ou cargo)' },
                  { id: 'todos', label: 'Todos os membros' },
                ].map(f => (
                  <button key={f.id} type="button" onClick={() => setEscopo(f.id)}
                    className="px-3 py-1.5 rounded-xl font-semibold"
                    style={{
                      fontSize: 11,
                      background: escopo === f.id ? 'rgba(14,116,144,0.35)' : 'rgba(255,255,255,0.05)',
                      color: escopo === f.id ? '#67e8f9' : 'var(--text-tertiary)',
                      border: escopo === f.id ? '1px solid rgba(34,211,238,0.45)' : '1px solid transparent',
                    }}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select value={denom} onChange={e => setDenom(e.target.value)}
                className="input-dark w-full py-2.5" style={{ fontSize: 12 }}>
                <option value="todas">Todas as denominações</option>
                <option value="ad">Só AD / ADBLU</option>
                <option value="outras">Só outras</option>
              </select>
              <select value={agrupar} onChange={e => setAgrupar(e.target.value)}
                className="input-dark w-full py-2.5" style={{ fontSize: 12 }}>
                <option value="igreja">Agrupar por igreja</option>
                <option value="cargo_igreja">Agrupar por cargo na igreja</option>
                <option value="cargo_campanha">Agrupar por cargo na campanha</option>
              </select>
              <select value={igrejaNome} onChange={e => setIgrejaNome(e.target.value)}
                className="input-dark w-full py-2.5" style={{ fontSize: 12 }}>
                <option value="">Todas as igrejas</option>
                {igrejasOpts.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <select value={cargoIgreja} onChange={e => setCargoIgreja(e.target.value)}
                className="input-dark w-full py-2.5" style={{ fontSize: 12 }}>
                <option value="">Todos os cargos na igreja</option>
                {cargosIgOpts.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="rounded-2xl p-4 space-y-3"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
            <div>
              <p className="font-bold" style={{ fontSize: 15, color: 'var(--text-primary)' }}>
                Prévia do relatório
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                {dataHoje()} · {subtitulo} · {lista.length} pessoa{lista.length !== 1 ? 's' : ''}
              </p>
            </div>

            {lista.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                Nenhuma pessoa neste filtro. Cadastre igreja e/ou cargo na igreja no membro.
              </p>
            ) : (
              <div className="space-y-3">
                {grupos.map(g => (
                  <div key={g.titulo}>
                    <p className="font-bold mb-1.5" style={{ fontSize: 12, color: '#67e8f9' }}>
                      {g.titulo} ({g.pessoas.length})
                    </p>
                    <div className="space-y-1.5">
                      {g.pessoas.map(m => (
                        <div key={m.id} className="rounded-xl px-3 py-2"
                          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                          <p className="font-bold" style={{ fontSize: 13, color: 'var(--text-primary)' }}>{m.nome}</p>
                          <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            {[
                              cargoEclesiastico(m),
                              nomeIgrejaMembro(m),
                              m.telefone,
                            ].filter(Boolean).join(' · ') || 'Sem detalhes'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {msg && (
            <p className="text-center" style={{ fontSize: 12, color: '#34d399' }}>{msg}</p>
          )}
        </div>

        <div className="px-5 py-4 space-y-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={!lista.length} onClick={copiar}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold"
              style={{
                fontSize: 12, opacity: lista.length ? 1 : 0.4,
                background: 'var(--bg-raised)', color: 'var(--text-secondary)',
              }}>
              {copiado ? <Check size={14} /> : <Copy size={14} />}
              {copiado ? 'Copiado' : 'Copiar texto'}
            </button>
            <button type="button" disabled={!lista.length} onClick={imprimir}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold text-black"
              style={{
                fontSize: 12, opacity: lista.length ? 1 : 0.4,
                background: 'linear-gradient(135deg,#22d3ee,#0891b2)',
              }}>
              <Printer size={14} /> <FileText size={14} /> Imprimir / PDF
            </button>
          </div>
          <p className="text-center" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
            Abre uma janela com o relatório — escolha “Salvar como PDF”
          </p>
        </div>
      </div>
    </div>
  )
}
