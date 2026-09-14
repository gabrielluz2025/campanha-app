import { useMemo, useState } from 'react'
import {
  Search, Pencil, Copy, Check, MessageCircle, UserCheck, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { linkWhatsApp } from '../utils/rotaUtils'
import {
  labelIndicacao, pendenciasCadastro, pctCadastro, cadastroCompleto,
} from '../utils/equipeCadastro'
import { formatarMembroTexto, copiarTexto } from '../utils/equipeContratoReport'
import { ehCargoSemRemuneracao } from '../utils/equipeSync'
import { listarIndicadores, valorRemuneracaoMembro } from '../utils/equipeIndicacoesReport'
import { fmtMoeda } from '../utils/equipeFinanceiro'

/**
 * Aba Indicações & Cadastros — qualidade dos dados e quem indicou cada membro.
 * Só remunerados: Apoiadores, Comunidade WhatsApp e formulário ficam de fora.
 */
export default function EquipeIndicacoes({
  membros = [],
  onEditar,
}) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todos') // todos | pendencias | completos
  const [vista, setVista] = useState('indicadores') // indicadores | membros
  const [copiadoId, setCopiadoId] = useState('')
  const [abertoId, setAbertoId] = useState('')

  const membrosOp = useMemo(
    () => membros.filter(m => !ehCargoSemRemuneracao(m.cargo, m)),
    [membros],
  )

  const indicadores = useMemo(() => listarIndicadores(membros), [membros])

  const stats = useMemo(() => {
    const comInd = membrosOp.filter(m => labelIndicacao(m, membros)).length
    const completos = membrosOp.filter(m => cadastroCompleto(m, membros)).length
    const valorComInd = membrosOp
      .filter(m => labelIndicacao(m, membros))
      .reduce((acc, m) => acc + valorRemuneracaoMembro(m), 0)
    return {
      total: membrosOp.length,
      comInd,
      completos,
      pendencias: membrosOp.length - completos,
      indicadores: indicadores.length,
      valorComInd,
    }
  }, [membrosOp, membros, indicadores])

  const listaIndicadores = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return indicadores.filter(g => {
      if (!q) return true
      if (g.nome.toLowerCase().includes(q)) return true
      return g.indicados.some(m =>
        (m.nome || '').toLowerCase().includes(q)
        || (m.telefone || '').includes(q)
        || (m.cpf || '').includes(q)
      )
    })
  }, [indicadores, busca])

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return membrosOp
      .filter(m => {
        const completo = cadastroCompleto(m, membros)
        if (filtro === 'pendencias' && completo) return false
        if (filtro === 'completos' && !completo) return false
        if (!q) return true
        const ind = labelIndicacao(m, membros).toLowerCase()
        return (m.nome || '').toLowerCase().includes(q)
          || ind.includes(q)
          || (m.telefone || '').includes(q)
          || (m.cpf || '').includes(q)
      })
      .sort((a, b) => {
        const pa = pctCadastro(a, membros)
        const pb = pctCadastro(b, membros)
        if (pa !== pb) return pa - pb
        return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
      })
  }, [membrosOp, membros, busca, filtro])

  async function copiar(m) {
    const ok = await copiarTexto(formatarMembroTexto(m))
    if (ok) {
      setCopiadoId(m.id)
      setTimeout(() => setCopiadoId(''), 2000)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Membros', valor: stats.total, cor: 'var(--text-primary)' },
          { label: 'Com indicação', valor: stats.comInd, cor: '#93c5fd' },
          { label: 'Indicadores', valor: stats.indicadores, cor: '#a5b4fc' },
          { label: 'Valor total (indicados)', valor: fmtMoeda(stats.valorComInd), cor: '#34d399', money: true },
          { label: 'Com pendências', valor: stats.pendencias, cor: stats.pendencias ? '#fbbf24' : 'var(--text-primary)' },
        ].map(c => (
          <div key={c.label} className="rounded-2xl px-4 py-3"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <p className="font-black truncate" style={{ fontSize: c.money ? 15 : 22, color: c.cor }}>{c.valor}</p>
            <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{c.label}</p>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
        Só quem tem remuneração. Apoiadores, formulário e Comunidade WhatsApp ficam na pirâmide e não entram aqui.
        O valor é a soma das remunerações cadastradas.
      </p>

      <div className="rounded-3xl p-4 space-y-3"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'indicadores', label: 'Por indicador' },
            { id: 'membros', label: 'Por membro' },
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setVista(f.id)}
              className="px-3 py-1.5 rounded-xl font-semibold transition-all"
              style={{
                fontSize: 11,
                background: vista === f.id ? 'rgba(37,99,235,0.25)' : 'rgba(255,255,255,0.05)',
                color: vista === f.id ? '#93c5fd' : 'var(--text-tertiary)',
                border: vista === f.id ? '1px solid rgba(59,130,246,0.4)' : '1px solid transparent',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-tertiary)' }} />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder={vista === 'indicadores'
              ? 'Buscar indicador ou indicado...'
              : 'Buscar membro ou quem fez a indicação...'}
            className="input-dark w-full pl-9 pr-3 py-2.5"
            style={{ fontSize: 13 }}
          />
        </div>

        {vista === 'membros' && (
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'pendencias', label: 'Com pendências' },
              { id: 'completos', label: 'Completos' },
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                className="px-3 py-1.5 rounded-xl font-semibold transition-all"
                style={{
                  fontSize: 11,
                  background: filtro === f.id ? 'rgba(37,99,235,0.25)' : 'rgba(255,255,255,0.05)',
                  color: filtro === f.id ? '#93c5fd' : 'var(--text-tertiary)',
                  border: filtro === f.id ? '1px solid rgba(59,130,246,0.4)' : '1px solid transparent',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {vista === 'indicadores' ? (
        listaIndicadores.length === 0 ? (
          <div className="rounded-3xl p-10 text-center"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              {indicadores.length === 0
                ? 'Nenhuma indicação registrada. Preencha o campo Indicação no cadastro do membro.'
                : 'Nenhum indicador neste filtro'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {listaIndicadores.map(g => {
              const aberto = abertoId === g.id
              return (
                <div key={g.id} className="rounded-3xl overflow-hidden"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                  <button
                    type="button"
                    onClick={() => setAbertoId(aberto ? '' : g.id)}
                    className="w-full text-left px-4 py-3.5 flex items-center gap-3"
                  >
                    <div className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(37,99,235,0.18)' }}>
                      <UserCheck size={16} style={{ color: '#93c5fd' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold truncate" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                        {g.nome}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        {g.total} pessoa{g.total !== 1 ? 's' : ''} indicada{g.total !== 1 ? 's' : ''}
                        {g.comPendencias > 0 ? ` · ${g.comPendencias} com pendência` : ''}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-black tnum" style={{ fontSize: 14, color: '#34d399' }}>
                        {fmtMoeda(g.valorTotal)}
                      </p>
                      <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>valor total</p>
                    </div>
                    {aberto
                      ? <ChevronUp size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                      : <ChevronDown size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
                  </button>

                  {aberto && (
                    <div className="px-4 pb-4 space-y-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      {g.indicados.map(m => {
                        const rem = valorRemuneracaoMembro(m)
                        const pend = pendenciasCadastro(m, membros)
                        return (
                          <div key={m.id} className="flex items-center gap-3 pt-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold truncate" style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                                {m.nome}
                              </p>
                              <p className="truncate" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                {[m.cargo, m.vinculo].filter(Boolean).join(' · ') || 'Sem cargo'}
                                {pend.length > 0 ? ` · ${pend.length} pendência${pend.length !== 1 ? 's' : ''}` : ''}
                              </p>
                            </div>
                            <span className="font-bold tnum flex-shrink-0" style={{ fontSize: 12, color: rem > 0 ? '#34d399' : 'var(--text-faint)' }}>
                              {rem > 0 ? fmtMoeda(rem) : '—'}
                            </span>
                            <button type="button" onClick={() => onEditar?.(m)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-bold flex-shrink-0"
                              style={{ fontSize: 10, background: 'rgba(37,99,235,0.16)', color: '#93c5fd' }}>
                              <Pencil size={11} /> Editar
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      ) : lista.length === 0 ? (
        <div className="rounded-3xl p-10 text-center"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
            {membrosOp.length === 0 ? 'Cadastre membros na aba Membros' : 'Nenhum membro neste filtro'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map(m => {
            const ind = labelIndicacao(m, membros)
            const pend = pendenciasCadastro(m, membros)
            const pct = pctCadastro(m, membros)
            const rem = valorRemuneracaoMembro(m)
            const wa = m.telefone
              ? linkWhatsApp(m.telefone, `Olá ${String(m.nome || '').split(' ')[0]}, tudo bem?`)
              : ''
            return (
              <div key={m.id} className="rounded-3xl p-4"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold truncate" style={{ fontSize: 14, color: 'var(--text-primary)' }}>{m.nome}</p>
                      {rem > 0 && (
                        <span className="font-bold tnum flex-shrink-0" style={{ fontSize: 12, color: '#34d399' }}>
                          {fmtMoeda(rem)}
                        </span>
                      )}
                    </div>
                    <p className="flex items-center gap-1 mt-0.5 truncate" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      <UserCheck size={11} style={{ flexShrink: 0, color: ind ? '#93c5fd' : 'var(--text-faint)' }} />
                      {ind ? <>INDICAÇÃO DE <span style={{ color: '#93c5fd' }}>{ind}</span></> : 'Sem indicação registrada'}
                    </p>
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                        <div className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background: pct >= 100 ? '#10b981' : pct >= 60 ? '#3b82f6' : '#f59e0b',
                          }} />
                      </div>
                      <span className="font-bold flex-shrink-0" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{pct}%</span>
                    </div>
                    {pend.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {pend.map(p => (
                          <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold"
                            style={{ fontSize: 9, background: 'rgba(245,158,11,0.12)', color: '#fbbf24' }}>
                            <AlertTriangle size={9} /> {p}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 font-semibold" style={{ fontSize: 10, color: '#34d399' }}>Cadastro completo</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 flex-shrink-0">
                    <button type="button" onClick={() => onEditar?.(m)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold"
                      style={{ fontSize: 11, background: 'rgba(37,99,235,0.16)', color: '#93c5fd' }}>
                      <Pencil size={12} /> Editar
                    </button>
                    <button type="button" onClick={() => copiar(m)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold"
                      style={{ fontSize: 11, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                      {copiadoId === m.id ? <Check size={12} /> : <Copy size={12} />}
                      {copiadoId === m.id ? 'Copiado' : 'Copiar'}
                    </button>
                    {wa && (
                      <a href={wa} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-white"
                        style={{ fontSize: 11, background: '#25D366' }}>
                        <MessageCircle size={12} /> WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
