/** Painel admin: coordenadores, retiradas pendentes e link público. */
import { useMemo, useState, useEffect } from 'react'
import {
  Plus, Trash2, Check, X, Link2, Copy, RefreshCw, Users, ClipboardList,
  AlertTriangle, CheckCircle2, Ban, Pencil, Printer, CalendarDays, List,
} from 'lucide-react'
import { confirmAction } from '../utils/confirm'
import { flushAfterSave } from '../utils/persist'
import {
  criarCoordenador, saveCoordenadores, loadRetiradas, loadDistribuicoes,
  validarRetirada, recusarRetirada, cancelarRetirada, excluirRetirada,
  STATUS_PENDENTE, STATUS_VALIDADO, STATUS_RECUSADO, STATUS_CANCELADO,
  saveCfg, persistFlush,
} from '../utils/materiaisRetirada'
import {
  garantirLinkRetirada, getRetiradaPublicLink,
  publicarBundleRetirada, sincronizarInboxRetiradas,
} from '../utils/materiaisRetiradaShare'
import {
  agruparAgendaRetiradas, imprimirAgendaRetiradas,
} from '../utils/materiaisRetiradaReport'

function fmtData(iso) {
  if (!iso) return '—'
  try {
    const d = String(iso).length <= 10
      ? new Date(`${iso}T12:00:00`)
      : new Date(iso)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return '—'
  }
}

const STATUS_STYLE = {
  [STATUS_PENDENTE]: { label: 'Pendente', bg: 'rgba(245,158,11,0.15)', color: '#fbbf24' },
  [STATUS_VALIDADO]: { label: 'Validado', bg: 'rgba(16,185,129,0.15)', color: '#34d399' },
  [STATUS_RECUSADO]: { label: 'Recusado', bg: 'rgba(239,68,68,0.15)', color: '#f87171' },
  [STATUS_CANCELADO]: { label: 'Cancelado', bg: 'rgba(148,163,184,0.15)', color: '#94a3b8' },
}

export default function MateriaisRetiradaAdmin({
  subAba, // coordenadores | retiradas | link
  itens,
  coordenadores,
  setCoordenadores,
  retiradas,
  setRetiradas,
  cfg,
  setCfg,
  onEstoqueChange,
  userEmail = '',
}) {
  if (subAba === 'coordenadores') {
    return (
      <PainelCoordenadores
        itens={itens}
        coordenadores={coordenadores}
        setCoordenadores={setCoordenadores}
        cfg={cfg}
        setCfg={setCfg}
      />
    )
  }
  if (subAba === 'retiradas') {
    return (
      <PainelRetiradas
        itens={itens}
        retiradas={retiradas}
        setRetiradas={setRetiradas}
        onEstoqueChange={onEstoqueChange}
        userEmail={userEmail}
      />
    )
  }
  return (
    <PainelLink
      cfg={cfg}
      setCfg={setCfg}
      coordenadores={coordenadores}
    />
  )
}

function PainelCoordenadores({ itens, coordenadores, setCoordenadores, cfg, setCfg }) {
  const [nome, setNome] = useState('')
  const [editando, setEditando] = useState(null) // { id, nome, limites, ativo }

  function adicionar() {
    const n = nome.trim()
    if (!n) return
    if (coordenadores.some(c => c.nome.toLowerCase() === n.toLowerCase())) {
      window.alert('Já existe um coordenador com esse nome.')
      return
    }
    const lista = [...coordenadores, criarCoordenador({ nome: n })]
    setCoordenadores(lista)
    saveCoordenadores(lista)
    setNome('')
    flushAfterSave()
  }

  function toggleAtivo(id) {
    const lista = coordenadores.map(c =>
      String(c.id) === String(id) ? { ...c, ativo: !c.ativo } : c,
    )
    setCoordenadores(lista)
    saveCoordenadores(lista)
    flushAfterSave()
  }

  async function excluir(id) {
    const ok = await confirmAction({
      title: 'Remover coordenador',
      message: 'Remover este nome da lista? Pedidos antigos permanecem no histórico.',
      danger: true,
    })
    if (!ok) return
    const lista = coordenadores.filter(c => String(c.id) !== String(id))
    setCoordenadores(lista)
    saveCoordenadores(lista)
    flushAfterSave()
  }

  function abrirEditar(c) {
    setEditando({
      id: c.id,
      nome: c.nome || '',
      ativo: c.ativo !== false,
      limites: { ...(c.limites || {}) },
    })
  }

  function salvarEdicao() {
    if (!editando) return
    const n = String(editando.nome || '').trim()
    if (!n) {
      window.alert('Informe o nome do coordenador.')
      return
    }
    const duplicado = coordenadores.some(c =>
      String(c.id) !== String(editando.id)
      && c.nome.toLowerCase() === n.toLowerCase(),
    )
    if (duplicado) {
      window.alert('Já existe outro coordenador com esse nome.')
      return
    }
    const lista = coordenadores.map(c =>
      String(c.id) === String(editando.id)
        ? {
            ...c,
            nome: n,
            ativo: editando.ativo !== false,
            limites: { ...(editando.limites || {}) },
          }
        : c,
    )
    setCoordenadores(lista)
    saveCoordenadores(lista)
    setEditando(null)
    flushAfterSave()
  }

  function salvarCfgOutros(patch) {
    const next = { ...cfg, ...patch }
    setCfg(next)
    saveCfg(next)
    flushAfterSave()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl p-4 space-y-3"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
        <p className="font-bold" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
          Lista de coordenadores
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          Nomes fixos no formulário — evita variações. Clique em Editar para mudar nome e limites.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="input-dark flex-1 px-3 py-2.5"
            style={{ fontSize: 13 }}
            placeholder="Nome do coordenador"
            value={nome}
            onChange={e => setNome(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && adicionar()}
          />
          <button type="button" onClick={adicionar}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-white"
            style={{ fontSize: 12, background: '#0d9488' }}>
            <Plus size={14} /> Adicionar
          </button>
        </div>
      </div>

      <div className="rounded-3xl p-4 space-y-3"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="font-bold" style={{ fontSize: 13, color: 'var(--text-primary)' }}>Opção “Outros”</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={cfg.outrosHabilitado !== false}
              onChange={e => salvarCfgOutros({ outrosHabilitado: e.target.checked })}
            />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Permitir no formulário</span>
          </label>
        </div>
        {cfg.outrosHabilitado !== false && (
          <div className="space-y-2">
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              Limite padrão por material para quem escolher “Outros” (opcional):
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {itens.map(item => (
                <div key={item.id} className="flex items-center gap-2">
                  <span className="flex-1 truncate" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {item.nome}
                  </span>
                  <input
                    type="number"
                    min={0}
                    className="input-dark w-24 px-2 py-1.5"
                    style={{ fontSize: 12 }}
                    placeholder="∞"
                    value={cfg.limiteOutrosPadrao?.[item.id] ?? ''}
                    onChange={e => {
                      const v = e.target.value
                      const lim = { ...(cfg.limiteOutrosPadrao || {}) }
                      if (v === '') delete lim[item.id]
                      else lim[item.id] = parseInt(v, 10) || 0
                      salvarCfgOutros({ limiteOutrosPadrao: lim })
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {coordenadores.length === 0 ? (
          <p className="text-center py-8" style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
            Nenhum coordenador cadastrado ainda.
          </p>
        ) : coordenadores.map(c => (
          <div key={c.id} className="rounded-2xl px-4 py-3"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              opacity: c.ativo ? 1 : 0.55,
            }}>
            <div className="flex items-center gap-2 flex-wrap">
              <Users size={14} style={{ color: '#5eead4' }} />
              <p className="font-bold flex-1 min-w-0 truncate" style={{ fontSize: 14, color: 'var(--text-primary)' }}>{c.nome}</p>
              <button type="button" onClick={() => abrirEditar(c)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold"
                style={{ fontSize: 11, background: 'rgba(37,99,235,0.16)', color: '#93c5fd' }}>
                <Pencil size={12} /> Editar
              </button>
              <button type="button" onClick={() => toggleAtivo(c.id)}
                className="px-2.5 py-1 rounded-lg font-bold"
                style={{
                  fontSize: 11,
                  background: c.ativo ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.15)',
                  color: c.ativo ? '#34d399' : '#94a3b8',
                }}>
                {c.ativo ? 'Ativo' : 'Inativo'}
              </button>
              <button type="button" onClick={() => excluir(c.id)} className="p-1.5 rounded-lg" title="Remover">
                <Trash2 size={13} style={{ color: '#f87171' }} />
              </button>
            </div>
            {Object.keys(c.limites || {}).length > 0 && (
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
                Limites: {Object.entries(c.limites).map(([id, lim]) => {
                  const nomeItem = itens.find(i => String(i.id) === String(id))?.nome || id
                  return `${nomeItem}: ${lim}`
                }).join(' · ')}
              </p>
            )}
          </div>
        ))}
      </div>

      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setEditando(null)}>
          <div className="rounded-3xl w-full max-w-md"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <h3 className="font-bold" style={{ fontSize: 16, color: 'var(--text-primary)' }}>
                Editar coordenador
              </h3>
              <button type="button" onClick={() => setEditando(null)} className="p-1.5">
                <X size={16} style={{ color: 'var(--text-tertiary)' }} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="font-semibold block mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  Nome
                </label>
                <input
                  className="input-dark w-full px-3 py-2.5"
                  style={{ fontSize: 13 }}
                  value={editando.nome}
                  onChange={e => setEditando(prev => ({ ...prev, nome: e.target.value }))}
                  autoFocus
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editando.ativo !== false}
                  onChange={e => setEditando(prev => ({ ...prev, ativo: e.target.checked }))}
                />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Ativo no formulário</span>
              </label>
              <div>
                <p className="font-semibold mb-2" style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                  Limites por material (campanha)
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>
                  Em branco = sem teto (só o estoque disponível).
                </p>
                {itens.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#fbbf24' }}>Cadastre materiais no estoque primeiro.</p>
                ) : (
                  <div className="space-y-2">
                    {itens.map(item => (
                      <div key={item.id} className="flex items-center gap-2">
                        <span className="flex-1 truncate" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                          {item.nome}
                        </span>
                        <input
                          type="number"
                          min={0}
                          className="input-dark w-28 px-2 py-2"
                          style={{ fontSize: 13 }}
                          placeholder="∞"
                          value={editando.limites?.[item.id] ?? ''}
                          onChange={e => {
                            const v = e.target.value
                            setEditando(prev => {
                              const lim = { ...(prev.limites || {}) }
                              if (v === '') delete lim[item.id]
                              else lim[item.id] = parseInt(v, 10) || 0
                              return { ...prev, limites: lim }
                            })
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 py-3 flex justify-end gap-2"
              style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button type="button" onClick={() => setEditando(null)}
                className="px-4 py-2 rounded-xl font-bold"
                style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                Cancelar
              </button>
              <button type="button" onClick={salvarEdicao}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-xl font-bold text-white"
                style={{ fontSize: 12, background: '#2563eb' }}>
                <Check size={13} /> Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PainelRetiradas({ itens, retiradas, setRetiradas, onEstoqueChange, userEmail = '' }) {
  const [filtro, setFiltro] = useState('pendente')
  const [modo, setModo] = useState('agenda') // agenda | lista
  const [syncMsg, setSyncMsg] = useState('')
  const [aoVivo, setAoVivo] = useState(true)

  const lista = useMemo(() => {
    return [...retiradas]
      .filter(r => filtro === 'todos' || r.status === filtro)
      .sort((a, b) => {
        if (modo === 'agenda') {
          const da = String(a.dataPrevista || '').slice(0, 10)
          const db = String(b.dataPrevista || '').slice(0, 10)
          if (da !== db) {
            if (!da) return 1
            if (!db) return -1
            return da.localeCompare(db)
          }
          return String(a.coordenadorNome || '').localeCompare(String(b.coordenadorNome || ''), 'pt-BR')
        }
        return new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0)
      })
  }, [retiradas, filtro, modo])

  const agendaGrupos = useMemo(() => agruparAgendaRetiradas(lista), [lista])

  const nPend = retiradas.filter(r => r.status === STATUS_PENDENTE).length

  const filtroLabel = {
    pendente: 'Pendentes',
    validado: 'Validados',
    recusado: 'Recusados',
    todos: 'Todas',
  }[filtro] || filtro

  function imprimirAgenda() {
    const res = imprimirAgendaRetiradas({
      retiradas: lista,
      itens,
      filtroLabel,
    })
    if (!res?.ok) {
      window.alert('Permita pop-ups neste site para imprimir o relatório.')
    }
  }

  async function syncInbox({ silencioso = false } = {}) {
    if (!silencioso) setSyncMsg('Sincronizando...')
    const res = await sincronizarInboxRetiradas()
    if (res.adicionados > 0) {
      setRetiradas(loadRetiradas())
      if (!silencioso || res.adicionados) {
        setSyncMsg(`${res.adicionados} novo(s) pedido(s) do formulário`)
        setTimeout(() => setSyncMsg(''), 4000)
      }
    } else if (!silencioso) {
      setSyncMsg('Nenhum pedido novo')
      setTimeout(() => setSyncMsg(''), 2500)
    }
  }

  // Tempo real: busca pedidos do formulário automaticamente
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      if (document.visibilityState === 'hidden') return
      if (cancelled) return
      const res = await sincronizarInboxRetiradas()
      if (cancelled) return
      if (res.adicionados > 0) {
        setRetiradas(loadRetiradas())
        setSyncMsg(`${res.adicionados} novo(s) pedido(s) do formulário`)
        setTimeout(() => setSyncMsg(''), 4000)
      }
      setAoVivo(true)
    }
    tick()
    const id = setInterval(tick, 5000)
    const onVis = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [setRetiradas])

  async function validar(id) {
    const ok = await confirmAction({
      title: 'Validar retirada',
      message: 'Confirmar que o material foi entregue? O estoque será baixado agora.',
      confirmLabel: 'Validar',
    })
    if (!ok) return
    const email = String(userEmail || '').trim()
    const nome = email.split('@')[0]?.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || email
    const res = validarRetirada(id, {
      validadoPor: nome || email,
      registradoPor: nome || email,
      registradoPorEmail: email,
    })
    if (!res.ok) {
      window.alert(res.erro)
      return
    }
    setRetiradas(loadRetiradas())
    onEstoqueChange?.(loadDistribuicoes())
    await persistFlush()
    await publicarBundleRetirada({ confirmar: false })
  }

  async function recusar(id) {
    const ok = await confirmAction({
      title: 'Recusar retirada',
      message: 'Recusar este pedido? A reserva será liberada.',
      danger: true,
      confirmLabel: 'Recusar',
    })
    if (!ok) return
    recusarRetirada(id)
    setRetiradas(loadRetiradas())
    await persistFlush()
    await publicarBundleRetirada({ confirmar: false })
  }

  async function cancelar(id) {
    const ok = await confirmAction({
      title: 'Cancelar retirada',
      message: 'Cancelar este pedido pendente?',
      danger: true,
    })
    if (!ok) return
    cancelarRetirada(id)
    setRetiradas(loadRetiradas())
    await persistFlush()
    await publicarBundleRetirada({ confirmar: false })
  }

  async function apagar(id) {
    const r = retiradas.find(x => String(x.id) === String(id))
    const nome = r?.coordenadorNome || 'esta retirada'
    const ok = await confirmAction({
      title: 'Apagar retirada',
      message: r?.status === STATUS_VALIDADO
        ? `Apagar a retirada validada de "${nome}"? As saídas vinculadas serão removidas e o estoque disponível volta.`
        : `Apagar a retirada de "${nome}"? Esta ação não pode ser desfeita.`,
      danger: true,
      confirmLabel: 'Apagar',
    })
    if (!ok) return
    const res = excluirRetirada(id)
    if (!res.ok) {
      window.alert(res.erro || 'Não foi possível apagar.')
      return
    }
    setRetiradas(loadRetiradas())
    onEstoqueChange?.(loadDistribuicoes())
    await persistFlush()
    await publicarBundleRetirada({ confirmar: false })
  }

  function CardRetirada({ r }) {
    const st = STATUS_STYLE[r.status] || STATUS_STYLE[STATUS_PENDENTE]
    return (
      <div className="rounded-3xl px-4 py-3"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex flex-wrap items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                {r.coordenadorNome}
                {r.isOutros ? ' (Outros)' : ''}
              </p>
              <span className="px-2 py-0.5 rounded-lg font-bold"
                style={{ fontSize: 10, background: st.bg, color: st.color }}>
                {st.label}
              </span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
              Prevista: {fmtData(r.dataPrevista)}
              {r.dataValidacao ? ` · Validada: ${fmtData(r.dataValidacao)}` : ''}
              {r.origem === 'formulario' ? ' · Formulário' : ' · Painel'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
              {(r.itens || []).map(it => {
                const nome = it.itemNome || itens.find(i => String(i.id) === String(it.itemId))?.nome || 'Item'
                return `${nome}: ${Number(it.quantidade).toLocaleString('pt-BR')}`
              }).join(' · ')}
            </p>
            {r.obs && (
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{r.obs}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {r.status === STATUS_PENDENTE && (
              <>
                <button type="button" onClick={() => validar(r.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-bold text-white"
                  style={{ fontSize: 11, background: '#059669' }}>
                  <Check size={12} /> Validar
                </button>
                <button type="button" onClick={() => recusar(r.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-bold"
                  style={{ fontSize: 11, background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                  <Ban size={12} /> Recusar
                </button>
                <button type="button" onClick={() => cancelar(r.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-bold"
                  style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'rgba(255,255,255,0.05)' }}>
                  Cancelar
                </button>
              </>
            )}
            <button type="button" onClick={() => apagar(r.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-bold"
              style={{ fontSize: 11, background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
              title="Apagar (inclui testes validados)">
              <Trash2 size={12} /> Apagar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {[
          { id: 'pendente', label: `Pendentes (${nPend})` },
          { id: 'validado', label: 'Validados' },
          { id: 'recusado', label: 'Recusados' },
          { id: 'todos', label: 'Todos' },
        ].map(f => (
          <button key={f.id} type="button" onClick={() => setFiltro(f.id)}
            className="px-3 py-1.5 rounded-xl font-semibold"
            style={{
              fontSize: 11,
              background: filtro === f.id ? 'rgba(13,148,136,0.22)' : 'rgba(255,255,255,0.05)',
              color: filtro === f.id ? '#5eead4' : 'var(--text-tertiary)',
            }}>
            {f.label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="inline-flex rounded-xl overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
          <button type="button" onClick={() => setModo('agenda')}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 font-bold"
            style={{
              fontSize: 11,
              background: modo === 'agenda' ? 'rgba(13,148,136,0.22)' : 'transparent',
              color: modo === 'agenda' ? '#5eead4' : 'var(--text-tertiary)',
            }}>
            <CalendarDays size={12} /> Agenda
          </button>
          <button type="button" onClick={() => setModo('lista')}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 font-bold"
            style={{
              fontSize: 11,
              background: modo === 'lista' ? 'rgba(13,148,136,0.22)' : 'transparent',
              color: modo === 'lista' ? '#5eead4' : 'var(--text-tertiary)',
            }}>
            <List size={12} /> Lista
          </button>
        </div>
        <button type="button" onClick={imprimirAgenda}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold"
          style={{ fontSize: 11, background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>
          <Printer size={12} /> Imprimir agenda
        </button>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-semibold"
          style={{
            fontSize: 11,
            background: 'rgba(16,185,129,0.12)',
            color: '#6ee7b7',
            border: '1px solid rgba(16,185,129,0.25)',
          }}
          title="Pedidos do formulário entram sozinhos a cada poucos segundos">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: aoVivo ? '#34d399' : '#94a3b8' }} />
          Ao vivo
        </span>
        <button type="button" onClick={() => syncInbox({ silencioso: false })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold"
          style={{ fontSize: 11, background: 'rgba(37,99,235,0.12)', color: '#93c5fd' }}>
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>
      {syncMsg && <p style={{ fontSize: 12, color: '#34d399' }}>{syncMsg}</p>}

      {lista.length === 0 ? (
        <div className="rounded-3xl p-10 text-center"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <ClipboardList size={28} className="mx-auto mb-3" style={{ color: 'var(--text-faint)' }} />
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Nenhuma retirada neste filtro.</p>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6 }}>
            Novos pedidos do formulário aparecem aqui automaticamente.
          </p>
        </div>
      ) : modo === 'agenda' ? (
        <div className="space-y-4">
          {agendaGrupos.map(([dia, diaLista]) => (
            <div key={dia} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <CalendarDays size={14} style={{ color: '#5eead4' }} />
                <h3 className="font-bold" style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                  {dia === 'sem-data' ? 'Sem data prevista' : fmtData(dia)}
                </h3>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {diaLista.length} retirada{diaLista.length !== 1 ? 's' : ''}
                </span>
              </div>
              {diaLista.map(r => <CardRetirada key={r.id} r={r} />)}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {lista.map(r => <CardRetirada key={r.id} r={r} />)}
        </div>
      )}
    </div>
  )
}

function PainelLink({ cfg, setCfg, coordenadores }) {
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [syncOk, setSyncOk] = useState(false)

  useEffect(() => {
    const next = garantirLinkRetirada(cfg)
    if (next.shareId !== cfg.shareId || next.token !== cfg.token) setCfg(next)
    // Garante que o link já nasce sincronizado
    publicarBundleRetirada({ confirmar: false }).then(r => {
      if (r?.ok) setSyncOk(true)
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const link = getRetiradaPublicLink(cfg.shareId || cfg.token || '')

  async function forcarSync() {
    setBusy(true)
    setMsg('')
    if (!coordenadores.some(c => c.ativo !== false) && cfg.outrosHabilitado === false) {
      setMsg('Cadastre ao menos um coordenador (ou habilite Outros).')
      setBusy(false)
      return
    }
    const next = garantirLinkRetirada(cfg)
    setCfg(next)
    const res = await publicarBundleRetirada({ confirmar: true })
    setBusy(false)
    setSyncOk(!!res.ok)
    setMsg(res.ok
      ? 'Formulário sincronizado agora.'
      : (res.erro || 'Falha ao sincronizar. Confira se está online/logado.'))
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link)
      setMsg('Link copiado!')
    } catch {
      setMsg(link)
    }
  }

  function toggleAtivo() {
    const next = saveCfg({ ...cfg, ativo: cfg.ativo === false })
    setCfg(next)
    flushAfterSave()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl p-5 space-y-4"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <Link2 size={18} style={{ color: '#5eead4' }} />
          <h3 className="font-bold" style={{ fontSize: 15, color: 'var(--text-primary)' }}>
            Link fixo do formulário
          </h3>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          Este link não muda. Envie aos coordenadores uma vez; estoque, limites e nomes atualizam sozinhos no formulário.
        </p>

        <div className="flex gap-2">
          <input readOnly value={link} className="input-dark flex-1 px-3 py-2.5" style={{ fontSize: 12 }} />
          <button type="button" onClick={copiar}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl font-bold"
            style={{ fontSize: 12, background: 'rgba(37,99,235,0.18)', color: '#93c5fd' }}>
            <Copy size={13} /> Copiar
          </button>
        </div>

        <div>
          <label className="font-semibold block mb-1" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Título no formulário
          </label>
          <input
            className="input-dark w-full px-3 py-2.5"
            style={{ fontSize: 13 }}
            value={cfg.titulo || ''}
            onChange={e => {
              const next = { ...cfg, titulo: e.target.value }
              setCfg(next)
              saveCfg(next)
            }}
            onBlur={() => flushAfterSave()}
            placeholder="Agendar retirada de material"
          />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold"
            style={{
              fontSize: 12,
              background: 'rgba(16,185,129,0.12)',
              color: '#6ee7b7',
              border: '1px solid rgba(16,185,129,0.25)',
            }}>
            <CheckCircle2 size={14} />
            {syncOk ? 'Atualização automática ativa' : 'Sincronizando automaticamente…'}
          </span>
          <button type="button" onClick={forcarSync} disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold"
            style={{ fontSize: 12, background: 'rgba(148,163,184,0.12)', color: 'var(--text-secondary)' }}>
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
            {busy ? 'Sincronizando...' : 'Sincronizar agora'}
          </button>
          <button type="button" onClick={toggleAtivo}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold"
            style={{
              fontSize: 12,
              background: cfg.ativo === false ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
              color: cfg.ativo === false ? '#34d399' : '#fbbf24',
            }}>
            {cfg.ativo === false ? 'Ativar formulário' : 'Pausar formulário'}
          </button>
        </div>

        {msg && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'rgba(13,148,136,0.12)', border: '1px solid rgba(13,148,136,0.25)' }}>
            <AlertTriangle size={14} className="mt-0.5" style={{ color: '#5eead4' }} />
            <span style={{ fontSize: 12, color: '#99f6e4' }}>{msg}</span>
          </div>
        )}

        <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          Qualquer mudança em estoque, coordenadores ou limites já atualiza o formulário sozinha. Use “Sincronizar agora” só se precisar forçar.
        </p>
      </div>
    </div>
  )
}
