import { useMemo, useState } from 'react'
import {
  Search, Building2, Users, Receipt, FileText, LayoutDashboard,
  ArrowDownLeft, ArrowUpRight, ExternalLink, X, History,
} from 'lucide-react'
import data2022 from '../data/tesouraria2022.json'
import { fmtMoeda, formatarCpfCnpj } from '../utils/tesouraria'
import { KpiStrip } from './ui'

const INPUT = 'input-dark w-full px-3 py-2'
const INPUT_STY = { fontSize: 13 }

const VIEWS = [
  { id: 'painel', label: 'Painel', icon: LayoutDashboard },
  { id: 'empresas', label: 'Empresas', icon: Building2 },
  { id: 'pessoas', label: 'Pessoas', icon: Users },
  { id: 'extrato', label: 'Extrato BB', icon: Receipt },
  { id: 'despesas', label: 'Despesas', icon: FileText },
  { id: 'nfse', label: 'NFS-e', icon: FileText },
]

function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function matchQ(q, ...parts) {
  const raw = String(q || '').trim()
  if (!raw) return true
  const n = norm(raw)
  const digits = raw.replace(/\D/g, '')
  return parts.some(p => {
    if (n && norm(p).includes(n)) return true
    // Só compara documento se houver dígitos — "".includes("") quebrava a busca por nome
    if (digits && String(p || '').replace(/\D/g, '').includes(digits)) return true
    return false
  })
}

function KindPill({ kind }) {
  const map = {
    empresa: { label: 'Empresa', c: '#60a5fa' },
    pessoa: { label: 'Pessoa', c: '#34d399' },
    banco: { label: 'Banco', c: '#a78bfa' },
    outro: { label: 'Outro', c: '#94a3b8' },
  }
  const m = map[kind] || map.outro
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full font-bold"
      style={{ fontSize: 10, color: m.c, background: `${m.c}18`, border: `1px solid ${m.c}44` }}>
      {m.label}
    </span>
  )
}

function TipoValor({ t, v }) {
  const entrada = t === 'entrada' || t === 'in'
  const Icon = entrada ? ArrowDownLeft : ArrowUpRight
  const cor = entrada ? '#34d399' : '#f87171'
  return (
    <span className="inline-flex items-center gap-1 font-bold tnum" style={{ color: cor, fontSize: 13 }}>
      <Icon size={12} />{fmtMoeda(v)}
    </span>
  )
}

function BarRow({ label, value, max, hint }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="mb-3">
      <div className="flex justify-between gap-2 mb-1">
        <span className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span className="text-[12px] font-bold tnum whitespace-nowrap" style={{ color: 'var(--gold-bright)' }}>
          {fmtMoeda(value)}{hint ? ` · ${hint}` : ''}
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #c9a227, #f0d78c)' }} />
      </div>
    </div>
  )
}

function TableShell({ children, empty }) {
  if (empty) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Nenhum registro encontrado.</p>
      </div>
    )
  }
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

function Th({ children, right }) {
  return (
    <th className={`px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide ${right ? 'text-right' : 'text-left'}`}
      style={{ color: 'var(--text-faint)', borderBottom: '1px solid var(--border-subtle)' }}>
      {children}
    </th>
  )
}

function Td({ children, right, className = '' }) {
  return (
    <td className={`px-3 py-2.5 text-[13px] ${right ? 'text-right' : ''} ${className}`}
      style={{ color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      {children}
    </td>
  )
}

export default function TesourariaHistorico2022() {
  const [view, setView] = useState('painel')
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [cat, setCat] = useState('')
  const [detalhe, setDetalhe] = useState(null)

  const K = data2022.kpis
  const cats = data2022.cats || []
  const parties = data2022.parties || []
  const bb = data2022.bb || []
  const despesas = data2022.despesas || []
  const nfse = data2022.nfse || []
  const mensal = data2022.mensal || { labels: [], entrada: [], saida: [] }

  const catOpts = useMemo(() => [...new Set([
    ...cats.map(c => c.c),
    ...parties.map(p => p.cat).filter(Boolean),
  ])].sort((a, b) => a.localeCompare(b, 'pt-BR')), [cats, parties])

  const empresas = useMemo(() => {
    return parties
      .filter(p => p.kind === 'empresa')
      .filter(p => matchQ(q, p.nome, p.doc, p.cat))
      .filter(p => !cat || p.cat === cat)
      .sort((a, b) => (b.out || 0) - (a.out || 0))
  }, [parties, q, cat])

  const pessoas = useMemo(() => {
    return parties
      .filter(p => p.kind === 'pessoa')
      .filter(p => matchQ(q, p.nome, p.doc, p.cat))
      .filter(p => !cat || p.cat === cat)
      .sort((a, b) => (b.out || 0) - (a.out || 0))
  }, [parties, q, cat])

  const bbFiltrado = useMemo(() => {
    return bb
      .filter(r => matchQ(q, r.nome, r.doc, r.h, r.cat))
      .filter(r => !kind || r.kind === kind)
      .filter(r => !cat || r.cat === cat)
  }, [bb, q, kind, cat])

  const despFiltrado = useMemo(() => {
    return despesas
      .filter(r => matchQ(q, r.nome, r.doc, r.cat, r.ndoc))
      .filter(r => !kind || r.kind === kind)
      .filter(r => !cat || r.cat === cat)
  }, [despesas, q, kind, cat])

  const nfseFiltrado = useMemo(() => {
    return nfse.filter(r => matchQ(q, r.nome, r.doc, r.cat, r.nf, r.nat))
  }, [nfse, q])

  const partyMoves = useMemo(() => {
    if (!detalhe) return { bb: [], desp: [], nfse: [] }
    const doc = String(detalhe.doc || '').replace(/\D/g, '')
    const nome = norm(detalhe.nome)
    return {
      bb: bb.filter(r => String(r.doc || '').replace(/\D/g, '') === doc || norm(r.nome) === nome),
      desp: despesas.filter(r => String(r.doc || '').replace(/\D/g, '') === doc || norm(r.nome) === nome),
      nfse: nfse.filter(r => String(r.doc || '').replace(/\D/g, '') === doc || norm(r.nome) === nome),
    }
  }, [detalhe, bb, despesas, nfse])

  const maxCat = Math.max(...cats.map(c => c.v), 1)
  const maxMes = Math.max(...(mensal.saida || [1]), ...(mensal.entrada || [1]), 1)
  const topEmp = empresas.slice(0, 8)
  const topPes = pessoas.slice(0, 8)
  const maxEmp = Math.max(...topEmp.map(p => p.out || 0), 1)
  const maxPes = Math.max(...topPes.map(p => p.out || 0), 1)

  const kpis = [
    { label: 'Entradas BB', value: fmtMoeda(K.entrada), gold: true, hint: 'Ago–Out/2022' },
    { label: 'Saídas BB', value: fmtMoeda(K.saida) },
    { label: 'Despesas oficiais', value: fmtMoeda(K.despesas), hint: `${K.desp_qtd} lanç.` },
    { label: 'Entidades', value: `${K.empresas} emp. · ${K.pessoas} pess.` },
  ]

  function abrirParty(p) {
    setDetalhe(p)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl px-3 py-2.5 flex items-start gap-2"
        style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.28)' }}>
        <History size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#60a5fa' }} />
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          <strong style={{ color: '#93c5fd' }}>Referência eleição 2022</strong>
          {' '}· somente visualização · extrato BB, despesas oficiais e NFS-e · não altera o caixa da campanha atual.
        </div>
      </div>

      <KpiStrip items={kpis} columns={4} />

      <div className="flex gap-1 p-1 rounded-xl overflow-x-auto"
        style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-subtle)' }}>
        {VIEWS.map(t => {
          const Icon = t.icon
          const on = view === t.id
          return (
            <button key={t.id} type="button" onClick={() => setView(t.id)}
              className="px-3 py-2 rounded-lg text-[12px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
              style={{
                background: on ? 'rgba(96,165,250,0.18)' : 'transparent',
                color: on ? '#93c5fd' : 'var(--text-tertiary)',
                border: on ? '1px solid rgba(96,165,250,0.35)' : '1px solid transparent',
              }}>
              <Icon size={13} />{t.label}
            </button>
          )
        })}
      </div>

      {view !== 'painel' && (
        <div className="rounded-2xl p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
          <div className="relative sm:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
            <input
              className={INPUT} style={{ ...INPUT_STY, paddingLeft: 34 }}
              placeholder="Buscar pessoa, empresa, CPF/CNPJ, serviço…"
              value={q} onChange={e => setQ(e.target.value)}
            />
          </div>
          {(view === 'extrato' || view === 'despesas') && (
            <select className={INPUT} style={INPUT_STY} value={kind} onChange={e => setKind(e.target.value)}>
              <option value="">Entidade</option>
              <option value="empresa">Empresa</option>
              <option value="pessoa">Pessoa</option>
              <option value="banco">Banco</option>
              <option value="outro">Outro</option>
            </select>
          )}
          {(view === 'empresas' || view === 'pessoas' || view === 'extrato' || view === 'despesas') && (
            <select className={INPUT} style={INPUT_STY} value={cat} onChange={e => setCat(e.target.value)}>
              <option value="">Categoria</option>
              {catOpts.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
      )}

      {view === 'painel' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <h3 className="text-[11px] font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--text-faint)' }}>
              Fluxo mensal BB
            </h3>
            {(mensal.labels || []).map((lab, i) => (
              <div key={lab} className="mb-4 last:mb-0">
                <p className="text-[12px] font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{lab}</p>
                <BarRow label="Entradas" value={mensal.entrada[i] || 0} max={maxMes} />
                <BarRow label="Saídas" value={mensal.saida[i] || 0} max={maxMes} />
              </div>
            ))}
            <div className="pt-2 mt-1 grid grid-cols-3 gap-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div>
                <p className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-faint)' }}>Tarifas</p>
                <p className="text-sm font-bold tnum" style={{ color: 'var(--text-secondary)' }}>{fmtMoeda(K.tarifa)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-faint)' }}>NFS-e</p>
                <p className="text-sm font-bold tnum" style={{ color: 'var(--text-secondary)' }}>{fmtMoeda(K.nfse)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-faint)' }}>Lanç. BB</p>
                <p className="text-sm font-bold tnum" style={{ color: 'var(--text-secondary)' }}>{K.bb_qtd}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <h3 className="text-[11px] font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--text-faint)' }}>
              Categorias de despesa
            </h3>
            {cats.map(c => (
              <BarRow key={c.c} label={c.c} value={c.v} max={maxCat} hint={`${c.n} itens`} />
            ))}
          </div>

          <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
                Top empresas
              </h3>
              <button type="button" className="text-[11px] font-bold" style={{ color: '#93c5fd' }} onClick={() => setView('empresas')}>
                Ver todas
              </button>
            </div>
            {topEmp.map(p => (
              <button key={p.id} type="button" className="w-full text-left" onClick={() => abrirParty(p)}>
                <BarRow label={p.nome} value={p.out || 0} max={maxEmp} />
              </button>
            ))}
          </div>

          <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
                Top pessoas (equipe / prestadores)
              </h3>
              <button type="button" className="text-[11px] font-bold" style={{ color: '#93c5fd' }} onClick={() => setView('pessoas')}>
                Ver todas
              </button>
            </div>
            {topPes.map(p => (
              <button key={p.id} type="button" className="w-full text-left" onClick={() => abrirParty(p)}>
                <BarRow label={p.nome} value={p.out || 0} max={maxPes} />
              </button>
            ))}
          </div>
        </div>
      )}

      {view === 'empresas' && (
        <>
          <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
            <b style={{ color: 'var(--text-secondary)' }}>{empresas.length}</b> empresas · saídas filtradas{' '}
            <b style={{ color: 'var(--gold-bright)' }}>{fmtMoeda(empresas.reduce((s, p) => s + (p.out || 0), 0))}</b>
          </p>
          <TableShell empty={!empresas.length}>
            <table className="w-full min-w-[640px]">
              <thead>
                <tr>
                  <Th>Empresa</Th>
                  <Th>Categoria</Th>
                  <Th right>Entradas</Th>
                  <Th right>Saídas</Th>
                  <Th right>Lanç.</Th>
                </tr>
              </thead>
              <tbody>
                {empresas.map(p => (
                  <tr key={p.id} className="cursor-pointer hover:bg-white/[0.03]" onClick={() => abrirParty(p)}>
                    <Td>
                      <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{p.nome}</div>
                      <div className="text-[11px] tnum" style={{ color: 'var(--text-faint)' }}>{formatarCpfCnpj(p.doc)}</div>
                    </Td>
                    <Td>{p.cat || '—'}</Td>
                    <Td right><span className="tnum" style={{ color: '#34d399' }}>{fmtMoeda(p.in || 0)}</span></Td>
                    <Td right><span className="tnum font-bold" style={{ color: '#f87171' }}>{fmtMoeda(p.out || 0)}</span></Td>
                    <Td right className="tnum">{p.q || 0}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </>
      )}

      {view === 'pessoas' && (
        <>
          <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
            <b style={{ color: 'var(--text-secondary)' }}>{pessoas.length}</b> pessoas · saídas filtradas{' '}
            <b style={{ color: 'var(--gold-bright)' }}>{fmtMoeda(pessoas.reduce((s, p) => s + (p.out || 0), 0))}</b>
          </p>
          <TableShell empty={!pessoas.length}>
            <table className="w-full min-w-[640px]">
              <thead>
                <tr>
                  <Th>Pessoa</Th>
                  <Th>Categoria</Th>
                  <Th right>Entradas</Th>
                  <Th right>Saídas</Th>
                  <Th right>Lanç.</Th>
                </tr>
              </thead>
              <tbody>
                {pessoas.map(p => (
                  <tr key={p.id} className="cursor-pointer hover:bg-white/[0.03]" onClick={() => abrirParty(p)}>
                    <Td>
                      <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{p.nome}</div>
                      <div className="text-[11px] tnum" style={{ color: 'var(--text-faint)' }}>{formatarCpfCnpj(p.doc)}</div>
                    </Td>
                    <Td>{p.cat || '—'}</Td>
                    <Td right><span className="tnum" style={{ color: '#34d399' }}>{fmtMoeda(p.in || 0)}</span></Td>
                    <Td right><span className="tnum font-bold" style={{ color: '#f87171' }}>{fmtMoeda(p.out || 0)}</span></Td>
                    <Td right className="tnum">{p.q || 0}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </>
      )}

      {view === 'extrato' && (
        <>
          <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
            <b style={{ color: 'var(--text-secondary)' }}>{bbFiltrado.length}</b> lançamentos do extrato BB
          </p>
          <TableShell empty={!bbFiltrado.length}>
            <table className="w-full min-w-[760px]">
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Tipo</Th>
                  <Th>Contraparte</Th>
                  <Th>Histórico</Th>
                  <Th>Cat.</Th>
                  <Th right>Valor</Th>
                </tr>
              </thead>
              <tbody>
                {bbFiltrado.map((r, i) => (
                  <tr key={`${r.iso}-${r.doc}-${i}`}>
                    <Td className="tnum whitespace-nowrap">{r.d}</Td>
                    <Td><KindPill kind={r.kind} /></Td>
                    <Td>
                      <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{r.nome || '—'}</div>
                      <div className="text-[11px] tnum" style={{ color: 'var(--text-faint)' }}>{r.doc ? formatarCpfCnpj(r.doc) : ''}</div>
                    </Td>
                    <Td>{r.h}</Td>
                    <Td>{r.cat || '—'}</Td>
                    <Td right><TipoValor t={r.t} v={r.v} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </>
      )}

      {view === 'despesas' && (
        <>
          <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
            <b style={{ color: 'var(--text-secondary)' }}>{despFiltrado.length}</b> despesas oficiais ·{' '}
            <b style={{ color: 'var(--gold-bright)' }}>{fmtMoeda(despFiltrado.reduce((s, r) => s + (r.v || 0), 0))}</b>
          </p>
          <TableShell empty={!despFiltrado.length}>
            <table className="w-full min-w-[700px]">
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Fornecedor</Th>
                  <Th>Tipo</Th>
                  <Th>Categoria</Th>
                  <Th right>Valor</Th>
                </tr>
              </thead>
              <tbody>
                {despFiltrado.map((r, i) => (
                  <tr key={`${r.iso}-${r.doc}-${i}`}>
                    <Td className="tnum whitespace-nowrap">{r.d}</Td>
                    <Td>
                      <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{r.nome}</div>
                      <div className="text-[11px] tnum" style={{ color: 'var(--text-faint)' }}>
                        {r.doc ? formatarCpfCnpj(r.doc) : ''}{r.ndoc ? ` · NF ${r.ndoc}` : ''}
                      </div>
                    </Td>
                    <Td><KindPill kind={r.kind} /></Td>
                    <Td>{r.cat || '—'}</Td>
                    <Td right><span className="tnum font-bold" style={{ color: '#f87171' }}>{fmtMoeda(r.v)}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </>
      )}

      {view === 'nfse' && (
        <>
          <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
            <b style={{ color: 'var(--text-secondary)' }}>{nfseFiltrado.length}</b> notas ·{' '}
            <b style={{ color: 'var(--gold-bright)' }}>{fmtMoeda(nfseFiltrado.reduce((s, r) => s + (r.v || 0), 0))}</b>
          </p>
          <TableShell empty={!nfseFiltrado.length}>
            <table className="w-full min-w-[720px]">
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Emitente</Th>
                  <Th>Categoria</Th>
                  <Th>Natureza</Th>
                  <Th>NF</Th>
                  <Th right>Valor</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {nfseFiltrado.map((r, i) => (
                  <tr key={`${r.d}-${r.nf}-${i}`}>
                    <Td className="tnum whitespace-nowrap">{r.d}</Td>
                    <Td>
                      <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{r.nome}</div>
                      <div className="text-[11px] tnum" style={{ color: 'var(--text-faint)' }}>{formatarCpfCnpj(r.doc)}</div>
                    </Td>
                    <Td>{r.cat || '—'}</Td>
                    <Td>{r.nat || '—'}</Td>
                    <Td className="tnum">{r.nf || '—'}</Td>
                    <Td right><span className="tnum font-bold">{fmtMoeda(r.v)}</span></Td>
                    <Td>
                      {r.link ? (
                        <a href={r.link} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: '#93c5fd' }}>
                          Abrir <ExternalLink size={11} />
                        </a>
                      ) : '—'}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </>
      )}

      {detalhe && (
        <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setDetalhe(null)}>
          <aside
            className="h-full w-full max-w-md overflow-y-auto shadow-2xl"
            style={{ background: 'var(--bg-surface, #0e131c)', borderLeft: '1px solid var(--border-subtle)' }}
            onClick={e => e.stopPropagation()}
          >
            <header className="sticky top-0 flex items-start justify-between gap-3 px-4 py-4"
              style={{ background: 'var(--bg-surface, #0e131c)', borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <KindPill kind={detalhe.kind} />
                <h2 className="mt-2 text-lg font-bold leading-snug" style={{ color: 'var(--text-primary)' }}>{detalhe.nome}</h2>
                <p className="text-[12px] tnum mt-1" style={{ color: 'var(--text-faint)' }}>{formatarCpfCnpj(detalhe.doc)}</p>
                {detalhe.cat && <p className="text-[12px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{detalhe.cat}</p>}
              </div>
              <button type="button" onClick={() => setDetalhe(null)} className="p-1.5 rounded-lg"
                style={{ color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)' }}>
                <X size={16} />
              </button>
            </header>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { l: 'Entradas', v: detalhe.in, c: '#34d399' },
                  { l: 'Saídas', v: detalhe.out, c: '#f87171' },
                  { l: 'Lançamentos', v: detalhe.q, raw: true },
                ].map(x => (
                  <div key={x.l} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
                    <p className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-faint)' }}>{x.l}</p>
                    <p className="text-sm font-bold tnum mt-1" style={{ color: x.c || 'var(--text-primary)' }}>
                      {x.raw ? (x.v || 0) : fmtMoeda(x.v || 0)}
                    </p>
                  </div>
                ))}
              </div>

              <section>
                <h3 className="text-[11px] font-bold uppercase mb-2" style={{ color: 'var(--text-faint)' }}>
                  Extrato BB ({partyMoves.bb.length})
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {partyMoves.bb.length === 0 && <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>Sem lançamentos.</p>}
                  {partyMoves.bb.map((r, i) => (
                    <div key={i} className="flex justify-between gap-2 text-[12px]">
                      <span style={{ color: 'var(--text-tertiary)' }}>{r.d} · {r.h}</span>
                      <TipoValor t={r.t} v={r.v} />
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-[11px] font-bold uppercase mb-2" style={{ color: 'var(--text-faint)' }}>
                  Despesas oficiais ({partyMoves.desp.length})
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {partyMoves.desp.length === 0 && <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>Sem despesas.</p>}
                  {partyMoves.desp.map((r, i) => (
                    <div key={i} className="flex justify-between gap-2 text-[12px]">
                      <span style={{ color: 'var(--text-tertiary)' }}>{r.d} · {r.cat || '—'}</span>
                      <span className="tnum font-bold" style={{ color: '#f87171' }}>{fmtMoeda(r.v)}</span>
                    </div>
                  ))}
                </div>
              </section>

              {partyMoves.nfse.length > 0 && (
                <section>
                  <h3 className="text-[11px] font-bold uppercase mb-2" style={{ color: 'var(--text-faint)' }}>
                    NFS-e ({partyMoves.nfse.length})
                  </h3>
                  <div className="space-y-2">
                    {partyMoves.nfse.map((r, i) => (
                      <div key={i} className="flex justify-between gap-2 text-[12px]">
                        <span style={{ color: 'var(--text-tertiary)' }}>
                          {r.d} · NF {r.nf}
                          {r.link && (
                            <a href={r.link} target="_blank" rel="noreferrer" className="ml-2 font-bold" style={{ color: '#93c5fd' }}>
                              abrir
                            </a>
                          )}
                        </span>
                        <span className="tnum font-bold">{fmtMoeda(r.v)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
