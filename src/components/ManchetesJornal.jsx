import { useMemo, useState } from 'react'
import {
  Newspaper, Plus, Trash2, Edit3, ExternalLink, Camera,
  BarChart3, X, Search, Filter,
} from 'lucide-react'
import { Card, Button, EmptyState, Pill, selectDark } from './ui'
import { confirmAction } from '../utils/confirm'
import { flushAfterSave } from '../utils/persist'
import {
  VEICULOS_SUGERIDOS, TOMS, ABRANGENCIAS,
  mancheteVazia, pesquisaExternaVazia, normalizarManchete,
  filtrarManchetes, tomMeta, fmtDataBR, fmtN,
  capturarSnapshotEleitoral, saveManchetes,
} from '../utils/manchetesJornal'

const INPUT = 'input-dark w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none'

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="eyebrow block mb-1.5">{label}</span>
      {children}
    </label>
  )
}

export default function ManchetesJornal({ manchetes, setManchetes }) {
  const [filtroVeiculo, setFiltroVeiculo] = useState('')
  const [filtroTom, setFiltroTom] = useState('')
  const [filtroTema, setFiltroTema] = useState('')
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(null) // null | 'nova' | id
  const [form, setForm] = useState(() => mancheteVazia())
  const [temasStr, setTemasStr] = useState('')
  const [anexarPesquisa, setAnexarPesquisa] = useState(false)

  const lista = useMemo(
    () => filtrarManchetes(manchetes, {
      veiculo: filtroVeiculo,
      tom: filtroTom,
      tema: filtroTema,
      q: busca,
    }),
    [manchetes, filtroVeiculo, filtroTom, filtroTema, busca],
  )

  const veiculosUsados = useMemo(() => {
    const set = new Set(manchetes.map(m => m.veiculo).filter(Boolean))
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [manchetes])

  function persist(next) {
    setManchetes(next)
    saveManchetes(next)
    flushAfterSave().catch(() => {})
  }

  function abrirNova() {
    const m = mancheteVazia()
    setForm(m)
    setTemasStr('')
    setAnexarPesquisa(false)
    setModal('nova')
  }

  function abrirEdicao(m) {
    setForm({ ...normalizarManchete(m) })
    setTemasStr((m.temas || []).join(', '))
    setAnexarPesquisa(!!m.pesquisaExterna)
    setModal(m.id)
  }

  function fecharModal() {
    setModal(null)
  }

  function setPesquisaField(field, value) {
    setForm(prev => ({
      ...prev,
      pesquisaExterna: {
        ...(prev.pesquisaExterna || pesquisaExternaVazia()),
        [field]: value,
      },
    }))
  }

  function setCand(i, field, value) {
    setForm(prev => {
      const pe = prev.pesquisaExterna || pesquisaExternaVazia()
      const candidatos = [...(pe.candidatos || [])]
      candidatos[i] = { ...candidatos[i], [field]: value }
      return { ...prev, pesquisaExterna: { ...pe, candidatos } }
    })
  }

  function addCand() {
    setForm(prev => {
      const pe = prev.pesquisaExterna || pesquisaExternaVazia()
      return {
        ...prev,
        pesquisaExterna: {
          ...pe,
          candidatos: [...(pe.candidatos || []), { nome: '', pct: '' }],
        },
      }
    })
  }

  function removeCand(i) {
    setForm(prev => {
      const pe = prev.pesquisaExterna || pesquisaExternaVazia()
      const candidatos = (pe.candidatos || []).filter((_, idx) => idx !== i)
      return {
        ...prev,
        pesquisaExterna: {
          ...pe,
          candidatos: candidatos.length ? candidatos : [{ nome: '', pct: '' }],
        },
      }
    })
  }

  function capturarCenario() {
    const snap = capturarSnapshotEleitoral()
    setForm(prev => ({ ...prev, snapshotInterno: snap }))
  }

  function limparSnapshot() {
    setForm(prev => ({ ...prev, snapshotInterno: null }))
  }

  function salvar() {
    if (!String(form.titulo || '').trim()) return
    const payload = normalizarManchete({
      ...form,
      temas: temasStr,
      pesquisaExterna: anexarPesquisa ? (form.pesquisaExterna || pesquisaExternaVazia()) : null,
    })
    if (!payload.titulo) return

    if (modal === 'nova') {
      persist([payload, ...manchetes])
    } else {
      persist(manchetes.map(m => (m.id === modal ? { ...payload, id: m.id, criadoEm: m.criadoEm } : m)))
    }
    fecharModal()
  }

  async function excluir(id) {
    const m = manchetes.find(x => x.id === id)
    const ok = await confirmAction({
      title: 'Excluir manchete',
      message: `Excluir "${m?.titulo || 'esta manchete'}" do histórico?`,
    })
    if (!ok) return
    persist(manchetes.filter(x => x.id !== id))
    if (modal === id) fecharModal()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold" style={{ fontSize: 15, color: 'var(--text-primary)' }}>
            Manchetes & radar eleitoral
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            Histórico de jornais + pesquisas digitadas + snapshot dos votos do sistema
          </p>
        </div>
        <Button onClick={abrirNova} icon={Plus}>Nova manchete</Button>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
            <input
              className={`${INPUT} pl-9`}
              placeholder="Buscar título, veículo…"
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
          <select className={selectDark} value={filtroVeiculo} onChange={e => setFiltroVeiculo(e.target.value)}>
            <option value="">Todos os veículos</option>
            {veiculosUsados.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <select className={selectDark} value={filtroTom} onChange={e => setFiltroTom(e.target.value)}>
            <option value="">Todos os tons</option>
            {TOMS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <div className="relative">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
            <input
              className={`${INPUT} pl-9`}
              placeholder="Filtrar tema…"
              value={filtroTema}
              onChange={e => setFiltroTema(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {lista.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title={manchetes.length === 0 ? 'Nenhuma manchete cadastrada' : 'Nenhum resultado com esses filtros'}
          subtitle={manchetes.length === 0
            ? 'Registre manchetes de jornais e anexe números de pesquisas ou o cenário de votos atual.'
            : 'Ajuste a busca ou limpe os filtros.'}
          action={manchetes.length === 0
            ? <Button onClick={abrirNova} icon={Plus}>Nova manchete</Button>
            : null}
        />
      ) : (
        <div className="relative pl-4 space-y-4" style={{ borderLeft: '2px solid var(--border-subtle)' }}>
          {lista.map(m => {
            const tom = tomMeta(m.tom)
            return (
              <div key={m.id} className="relative">
                <span
                  className="absolute -left-[21px] top-5 w-2.5 h-2.5 rounded-full"
                  style={{ background: tom.cor, boxShadow: `0 0 0 3px var(--bg-raised)` }}
                />
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="font-semibold tnum" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          {fmtDataBR(m.dataPublicacao)}
                        </span>
                        {m.veiculo && <Pill>{m.veiculo}</Pill>}
                        <span
                          className="px-2 py-0.5 rounded-full font-semibold"
                          style={{ fontSize: 10, background: `${tom.cor}22`, color: tom.cor }}
                        >
                          {tom.label}
                        </span>
                        {m.abrangencia && (
                          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{m.abrangencia}</span>
                        )}
                      </div>
                      <h3 className="font-bold leading-snug" style={{ fontSize: 15, color: 'var(--text-primary)' }}>
                        {m.titulo}
                      </h3>
                      {m.resumo && (
                        <p className="mt-1.5" style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                          {m.resumo}
                        </p>
                      )}
                      {(m.temas || []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {m.temas.map(t => (
                            <span key={t} className="px-2 py-0.5 rounded-lg"
                              style={{ fontSize: 10, background: 'var(--bg-surface)', color: 'var(--text-tertiary)' }}>
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      {m.notaEquipe && (
                        <p className="mt-2 italic" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                          Nota: {m.notaEquipe}
                        </p>
                      )}

                      {(m.pesquisaExterna || m.snapshotInterno) && (
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                          {m.pesquisaExterna && (
                            <div className="rounded-xl p-3"
                              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                              <p className="font-bold mb-1 flex items-center gap-1.5"
                                style={{ fontSize: 11, color: 'var(--gold-bright)' }}>
                                <BarChart3 size={12} /> Pesquisa externa
                              </p>
                              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                {[m.pesquisaExterna.instituto, m.pesquisaExterna.dataPesquisa && fmtDataBR(m.pesquisaExterna.dataPesquisa)]
                                  .filter(Boolean).join(' · ') || '—'}
                              </p>
                              {(m.pesquisaExterna.amostra || m.pesquisaExterna.margem) && (
                                <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                                  {[m.pesquisaExterna.amostra && `n=${m.pesquisaExterna.amostra}`,
                                    m.pesquisaExterna.margem && `±${m.pesquisaExterna.margem}%`]
                                    .filter(Boolean).join(' · ')}
                                </p>
                              )}
                              <ul className="mt-1.5 space-y-0.5">
                                {(m.pesquisaExterna.candidatos || [])
                                  .filter(c => c.nome)
                                  .map((c, i) => (
                                    <li key={i} className="flex justify-between gap-2 tnum"
                                      style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                                      <span className="truncate">{c.nome}</span>
                                      <strong>{c.pct !== '' && c.pct != null ? `${c.pct}%` : '—'}</strong>
                                    </li>
                                  ))}
                              </ul>
                            </div>
                          )}
                          {m.snapshotInterno && (
                            <div className="rounded-xl p-3"
                              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                              <p className="font-bold mb-1" style={{ fontSize: 11, color: '#22d3ee' }}>
                                Cenário interno (congelado)
                              </p>
                              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                {m.snapshotInterno.cidadeFoco || 'Cidade'} · {fmtN(m.snapshotInterno.totalVotos)} votos
                                {m.snapshotInterno.metaVotos
                                  ? ` / meta ${fmtN(m.snapshotInterno.metaVotos)} (${m.snapshotInterno.pctMeta}%)`
                                  : ''}
                              </p>
                              {m.snapshotInterno.capturadoEm && (
                                <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                                  Capturado em {new Date(m.snapshotInterno.capturadoEm).toLocaleString('pt-BR')}
                                </p>
                              )}
                              {(m.snapshotInterno.topZonas || []).slice(0, 3).length > 0 && (
                                <ul className="mt-1.5 space-y-0.5">
                                  {m.snapshotInterno.topZonas.slice(0, 3).map((z, i) => (
                                    <li key={i} className="flex justify-between gap-2 tnum"
                                      style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                      <span className="truncate">{z.nome}</span>
                                      <span>{fmtN(z.votos)}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {m.url && (
                        <a href={m.url} target="_blank" rel="noopener noreferrer"
                          className="p-2 rounded-lg"
                          style={{ color: 'var(--text-secondary)' }}
                          title="Abrir link">
                          <ExternalLink size={15} />
                        </a>
                      )}
                      <button type="button" onClick={() => abrirEdicao(m)} className="p-2 rounded-lg"
                        style={{ color: 'var(--text-secondary)' }} title="Editar">
                        <Edit3 size={15} />
                      </button>
                      <button type="button" onClick={() => excluir(m.id)} className="p-2 rounded-lg"
                        style={{ color: '#f87171' }} title="Excluir">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </Card>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={fecharModal}>
          <div
            className="w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 space-y-4"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold" style={{ fontSize: 16, color: 'var(--text-primary)' }}>
                {modal === 'nova' ? 'Nova manchete' : 'Editar manchete'}
              </h3>
              <button type="button" onClick={fecharModal} className="p-1.5 rounded-lg"
                style={{ color: 'var(--text-tertiary)' }}>
                <X size={18} />
              </button>
            </div>

            <Field label="Título *">
              <input className={INPUT} value={form.titulo}
                onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                placeholder="Manchete exatamente como no jornal" />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Veículo">
                <input className={INPUT} list="veiculos-manchete" value={form.veiculo}
                  onChange={e => setForm(f => ({ ...f, veiculo: e.target.value }))}
                  placeholder="NSC, A Notícia…" />
                <datalist id="veiculos-manchete">
                  {VEICULOS_SUGERIDOS.map(v => <option key={v} value={v} />)}
                </datalist>
              </Field>
              <Field label="Data de publicação">
                <input type="date" className={INPUT} value={form.dataPublicacao || ''}
                  onChange={e => setForm(f => ({ ...f, dataPublicacao: e.target.value }))} />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Tom">
                <select className={selectDark} value={form.tom}
                  onChange={e => setForm(f => ({ ...f, tom: e.target.value }))}>
                  {TOMS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Abrangência">
                <select className={selectDark} value={form.abrangencia}
                  onChange={e => setForm(f => ({ ...f, abrangencia: e.target.value, cidade: e.target.value }))}>
                  {ABRANGENCIAS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Link da matéria">
              <input className={INPUT} value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://…" />
            </Field>

            <Field label="Temas (separados por vírgula)">
              <input className={INPUT} value={temasStr}
                onChange={e => setTemasStr(e.target.value)}
                placeholder="adversário, infraestrutura, religião…" />
            </Field>

            <Field label="Resumo / recorte">
              <textarea className={`${INPUT} min-h-[72px] resize-y`} value={form.resumo}
                onChange={e => setForm(f => ({ ...f, resumo: e.target.value }))}
                placeholder="Trecho ou contexto da matéria" />
            </Field>

            <Field label="Nota da equipe">
              <textarea className={`${INPUT} min-h-[56px] resize-y`} value={form.notaEquipe}
                onChange={e => setForm(f => ({ ...f, notaEquipe: e.target.value }))}
                placeholder="Como reagimos / impacto esperado" />
            </Field>

            <div className="rounded-2xl p-3 space-y-3"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold" style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                  Números da eleição
                </p>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={anexarPesquisa}
                  onChange={e => {
                    const on = e.target.checked
                    setAnexarPesquisa(on)
                    if (on && !form.pesquisaExterna) {
                      setForm(f => ({ ...f, pesquisaExterna: pesquisaExternaVazia() }))
                    }
                  }}
                  style={{ accentColor: 'var(--gold)' }} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Anexar pesquisa de instituto (Ibope, Paraná Pesquisas…)
                </span>
              </label>

              {anexarPesquisa && (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input className={INPUT} placeholder="Instituto"
                      value={form.pesquisaExterna?.instituto || ''}
                      onChange={e => setPesquisaField('instituto', e.target.value)} />
                    <input type="date" className={INPUT}
                      value={form.pesquisaExterna?.dataPesquisa || ''}
                      onChange={e => setPesquisaField('dataPesquisa', e.target.value)} />
                    <input className={INPUT} placeholder="Amostra (n)"
                      value={form.pesquisaExterna?.amostra || ''}
                      onChange={e => setPesquisaField('amostra', e.target.value)} />
                    <input className={INPUT} placeholder="Margem (± %)"
                      value={form.pesquisaExterna?.margem || ''}
                      onChange={e => setPesquisaField('margem', e.target.value)} />
                  </div>
                  {(form.pesquisaExterna?.candidatos || []).map((c, i) => (
                    <div key={i} className="flex gap-2">
                      <input className={`${INPUT} flex-1`} placeholder="Candidato / nome"
                        value={c.nome}
                        onChange={e => setCand(i, 'nome', e.target.value)} />
                      <input className={`${INPUT} w-24`} placeholder="%" type="number" step="0.1"
                        value={c.pct}
                        onChange={e => setCand(i, 'pct', e.target.value)} />
                      <button type="button" onClick={() => removeCand(i)} className="p-2 rounded-lg"
                        style={{ color: '#f87171' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={addCand}
                    className="text-xs font-semibold" style={{ color: 'var(--gold-bright)' }}>
                    + candidato
                  </button>
                </div>
              )}

              <div className="pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="ghost" icon={Camera} onClick={capturarCenario}>
                    Capturar cenário atual
                  </Button>
                  {form.snapshotInterno && (
                    <button type="button" onClick={limparSnapshot}
                      className="text-xs font-semibold" style={{ color: 'var(--text-faint)' }}>
                      Remover snapshot
                    </button>
                  )}
                </div>
                {form.snapshotInterno ? (
                  <p className="mt-2" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {form.snapshotInterno.cidadeFoco || '—'} · {fmtN(form.snapshotInterno.totalVotos)} votos
                    {form.snapshotInterno.metaVotos
                      ? ` · ${form.snapshotInterno.pctMeta}% da meta (${fmtN(form.snapshotInterno.metaVotos)})`
                      : ''}
                    {' · '}congelado em {new Date(form.snapshotInterno.capturadoEm).toLocaleString('pt-BR')}
                  </p>
                ) : (
                  <p className="mt-1.5" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    Grava votos/meta do sistema nesta data (não muda depois).
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={fecharModal}>Cancelar</Button>
              <Button className="flex-1" onClick={salvar} disabled={!String(form.titulo || '').trim()}>
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
