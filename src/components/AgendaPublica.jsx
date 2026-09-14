/* ─────────────────────────────────────────────────────────────
   AgendaPublica.jsx — Visualização pública da agenda para equipe
   Acesso via: /#/agenda-equipe/{base64token}
───────────────────────────────────────────────────────────── */
import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  CalendarDays, Clock, User,
  Plus, X, CheckCircle, AlertTriangle, Flag, Filter, Circle, Trash2,
} from 'lucide-react'
import {
  decodeShareToken, loadColaboracao, saveColaboracao, criarColaboracaoVazia,
  eventoEhDoMembro, shareUid, eventosParaMembro, carregarColaboracaoLocal,
} from '../utils/agendaShare'
import AgendaLocalMapa from './AgendaLocalMapa'
import AgendaLocalBusca from './AgendaLocalBusca'

const MESES       = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const CATEGORIAS  = {
  visita:     { label: 'Visita',      cor: '#3b82f6' },
  reuniao:    { label: 'Reunião',     cor: '#06b6d4' },
  culto:      { label: 'Culto',       cor: '#ec4899' },
  palestra:   { label: 'Palestra',    cor: '#f97316' },
  entrevista: { label: 'Entrevista',  cor: '#10b981' },
  outro:      { label: 'Outro',       cor: 'rgba(203,213,235,0.60)' },
}

const FORM_NOVO = { titulo: '', horaInicio: '08:00', horaFim: '09:00', local: '', obs: '' }

export default function AgendaPublica({ token }) {
  const data = useMemo(() => decodeShareToken(token), [token])

  const hoje    = new Date()
  const hojeStr = hoje.toISOString().slice(0, 10)

  const [mes, setMes]               = useState(hoje.getMonth())
  const [ano, setAno]               = useState(hoje.getFullYear())
  const [diaSel, setDiaSel]         = useState(hojeStr)
  const [modalAbrir, setModalAbrir] = useState(false)
  const [formNovo, setFormNovo]     = useState(FORM_NOVO)
  const [confirmado, setConfirmado] = useState(false)
  const [filtroNome, setFiltroNome] = useState(() => (data?.membro ? 'meus' : 'permitidos'))
  const [colaboracao, setColaboracao] = useState(null)
  const [syncing, setSyncing]       = useState(false)

  const shareId   = data?.shareId || null
  const membro    = data?.membro || ''
  const membroId  = data?.membroId || ''

  const cacheKey = shareId ? `agenda_publica_v2_${shareId}` : `agenda_publica_local_${token}`

  const carregarColaboracao = useCallback(async () => {
    if (!shareId) return
    setSyncing(true)
    const remoto = await loadColaboracao(shareId)
    if (remoto) {
      setColaboracao(remoto)
    } else {
      const vazio = criarColaboracaoVazia({ shareId, membroId, membroNome: membro })
      setColaboracao(vazio)
    }
    setSyncing(false)
  }, [shareId, membroId, membro])

  useEffect(() => { carregarColaboracao() }, [carregarColaboracao])

  useEffect(() => {
    if (shareId) return
    const local = carregarColaboracaoLocal({ shareId, token, membroId, membroNome: membro })
    if (local) setColaboracao(local)
  }, [shareId, token, membroId, membro])

  useEffect(() => {
    if (!shareId) return
    const t = setInterval(carregarColaboracao, 12000)
    return () => clearInterval(t)
  }, [shareId, carregarColaboracao])

  const tokenValido = Boolean(data && (data.eventos?.length || data.podeMarcar || data.membro))
  const eventos = data?.eventos || []
  const podeMarcar = Boolean(data?.podeMarcar)
  const titulo = data?.titulo || 'Agenda da Equipe'
  const eventosAdicionados = colaboracao?.eventosAdicionados || []
  const marcacoes = colaboracao?.marcacoes || {}

  const todosEventos = useMemo(() => eventosParaMembro({
    eventos, eventosAdicionados, membro, filtro: filtroNome,
  }), [eventos, eventosAdicionados, filtroNome, membro])

  /* ── Token inválido ── */
  if (!tokenValido) {
    return (
      <div style={{ background: 'var(--bg-base)', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding: 24 }}>
        <div style={{ textAlign:'center', maxWidth: 340 }}>
          <div style={{ width:56, height:56, borderRadius:16, background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.3)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
            <AlertTriangle size={24} color="#f87171" />
          </div>
          <p style={{ color:'#fff', fontSize:18, fontWeight:700, marginBottom:8 }}>Link inválido ou expirado</p>
          <p style={{ color:'rgba(203,213,235,0.55)', fontSize:13 }}>Solicite um novo link ao coordenador da campanha.</p>
        </div>
      </div>
    )
  }

  /* ── Helpers calendário ── */
  const primeiroDia = new Date(ano, mes, 1).getDay()
  const diasNoMes   = new Date(ano, mes + 1, 0).getDate()
  const celulas     = [...Array(primeiroDia).fill(null), ...Array.from({ length: diasNoMes }, (_, i) => i + 1)]

  function toDataStr(d) {
    return `${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  }

  function eventosNoDia(data) {
    return todosEventos
      .filter(e => e.dataInicio <= data && (e.dataFim || e.dataInicio) >= data)
      .sort((a, b) => (a.horaInicio || '').localeCompare(b.horaInicio || ''))
  }

  function navMes(delta) {
    const d = new Date(ano, mes + delta, 1)
    setMes(d.getMonth()); setAno(d.getFullYear())
  }

  async function persistirColaboracao(nova) {
    setColaboracao(nova)
    if (shareId) {
      await saveColaboracao(shareId, nova)
    } else {
      localStorage.setItem(cacheKey, JSON.stringify(nova))
    }
  }

  /* ── Salvar evento ── */
  async function salvarNovoEvento() {
    if (!formNovo.titulo.trim()) return
    const ev = {
      ...formNovo,
      observacoes: formNovo.obs,
      id: shareUid(),
      dataInicio: diaSel,
      dataFim: diaSel,
      cor: '#10b981',
      categoria: 'outro',
      _local: true,
      representantes: [{ data: diaSel, nome: membro }],
      criadoPor: membro,
      criadoEm: new Date().toISOString(),
    }
    const base = colaboracao || criarColaboracaoVazia({ shareId, membroId, membroNome: membro })
    const nova = {
      ...base,
      eventosAdicionados: [...(base.eventosAdicionados || []), ev],
    }
    await persistirColaboracao(nova)
    setFormNovo(FORM_NOVO)
    setModalAbrir(false)
    setConfirmado(true)
    setTimeout(() => setConfirmado(false), 3000)
  }

  async function excluirMeuEvento(ev) {
    if (!ev._local || !podeMarcar) return
    const ok = window.confirm(`Excluir "${ev.titulo}" da sua agenda?`)
    if (!ok) return
    const base = colaboracao || criarColaboracaoVazia({ shareId, membroId, membroNome: membro })
    const nova = {
      ...base,
      eventosAdicionados: (base.eventosAdicionados || []).filter(e => e.id !== ev.id),
    }
    await persistirColaboracao(nova)
  }

  async function toggleMarcacao(ev) {
    if (!podeMarcar) return
    const base = colaboracao || criarColaboracaoVazia({ shareId, membroId, membroNome: membro })
    const atual = base.marcacoes?.[ev.id]
    const novasMarcacoes = { ...(base.marcacoes || {}) }
    if (atual?.confirmado) {
      delete novasMarcacoes[ev.id]
    } else {
      novasMarcacoes[ev.id] = {
        confirmado: true,
        data: diaSel,
        marcadoEm: new Date().toISOString(),
        marcadoPor: membro,
      }
    }
    await persistirColaboracao({ ...base, marcacoes: novasMarcacoes })
  }

  const eventosDia = eventosNoDia(diaSel)
  const diaSelecionadoLabel = new Date(diaSel + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const meusCount = eventosAdicionados.length + Object.keys(marcacoes).length

  return (
    <div style={{ background: 'var(--bg-base)', minHeight:'100vh', fontFamily:'Inter,sans-serif', color:'#fff' }}>

      {/* ── Header ── */}
      <div style={{ background:'linear-gradient(135deg,#1e3a8a,#1d4ed8)', padding:'20px 20px 28px' }}>
        <div style={{ maxWidth:640, margin:'0 auto' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
            <div style={{ width:40, height:40, borderRadius:12, background:'rgba(255,255,255,0.18)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <CalendarDays size={20} color="#fff" />
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ fontSize:18, fontWeight:800, color:'#fff', margin:0 }}>{titulo}</p>
              {membro && <p style={{ fontSize:11, color:'rgba(147,197,253,0.9)', margin:0 }}>Acesso de: {membro}</p>}
            </div>
            {syncing && (
              <span style={{ fontSize:10, color:'rgba(147,197,253,0.6)' }}>Sincronizando…</span>
            )}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <div style={{ flex:1, background:'rgba(255,255,255,0.13)', borderRadius:12, padding:'8px 14px', textAlign:'center' }}>
              <p style={{ fontSize:20, fontWeight:900, color:'#fff', margin:0 }}>{todosEventos.length}</p>
              <p style={{ fontSize:10, color:'rgba(147,197,253,0.8)', margin:0 }}>Eventos</p>
            </div>
            <div style={{ flex:1, background:'rgba(255,255,255,0.13)', borderRadius:12, padding:'8px 14px', textAlign:'center' }}>
              <p style={{ fontSize:20, fontWeight:900, color:'#fff', margin:0 }}>
                {todosEventos.filter(e => e.dataInicio >= hojeStr).length}
              </p>
              <p style={{ fontSize:10, color:'rgba(147,197,253,0.8)', margin:0 }}>Futuros</p>
            </div>
            {podeMarcar && (
              <div style={{ flex:1, background:'rgba(16,185,129,0.22)', borderRadius:12, padding:'8px 14px', textAlign:'center' }}>
                <p style={{ fontSize:20, fontWeight:900, color:'#34d399', margin:0 }}>{meusCount}</p>
                <p style={{ fontSize:10, color:'rgba(52,211,153,0.7)', margin:0 }}>Minhas ações</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:640, margin:'0 auto', padding:`0 16px ${podeMarcar ? '100px' : '40px'}`, paddingBottom: podeMarcar ? 'calc(100px + env(safe-area-inset-bottom, 0px))' : 40 }}>

        {/* ── Filtro por nome ── */}
        {membro && (
          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            {[
              { id: 'meus', label: `Minha agenda (${membro.split(' ')[0]})` },
              { id: 'permitidos', label: 'Toda a equipe' },
            ].map(f => (
              <button key={f.id} onClick={() => setFiltroNome(f.id)}
                style={{
                  flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                  padding:'8px 12px', borderRadius:12, cursor:'pointer', fontWeight:700, fontSize:11,
                  background: filtroNome === f.id ? 'rgba(37,99,235,0.25)' : 'rgba(255,255,255,0.06)',
                  color: filtroNome === f.id ? '#93c5fd' : 'rgba(203,213,235,0.55)',
                  border: filtroNome === f.id ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
                }}>
                <Filter size={11} /> {f.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Notificação confirmado ── */}
        {confirmado && (
          <div style={{ display:'flex', alignItems:'center', gap:10, background:'rgba(16,185,129,0.14)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:14, padding:'10px 16px', margin:'16px 0 0' }}>
            <CheckCircle size={16} color="#34d399" />
            <span style={{ fontSize:13, color:'#6ee7b7' }}>Salvo! O coordenador verá na agenda dele.</span>
          </div>
        )}

        {/* ── Calendário ── */}
        <div style={{ background:'rgba(13,17,28,0.95)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:20, marginTop:16, overflow:'hidden' }}>

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
            <button onClick={() => navMes(-1)} style={{ background:'rgba(255,255,255,0.07)', border:'none', borderRadius:10, padding:'6px 10px', color:'rgba(203,213,235,0.7)', cursor:'pointer', fontSize:14 }}>‹</button>
            <span style={{ fontWeight:700, fontSize:14, color:'#fff' }}>{MESES[mes]} {ano}</span>
            <button onClick={() => navMes(1)} style={{ background:'rgba(255,255,255,0.07)', border:'none', borderRadius:10, padding:'6px 10px', color:'rgba(203,213,235,0.7)', cursor:'pointer', fontSize:14 }}>›</button>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', padding:'8px 12px 4px', gap:2 }}>
            {DIAS_SEMANA.map(d => (
              <div key={d} style={{ textAlign:'center', fontSize:9, fontWeight:700, color:'rgba(203,213,235,0.4)' }}>{d}</div>
            ))}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', padding:'0 12px 12px', gap:2 }}>
            {celulas.map((dia, i) => {
              if (!dia) return <div key={i} />
              const ds    = toDataStr(dia)
              const evs   = eventosNoDia(ds)
              const isH   = ds === hojeStr
              const isSel = ds === diaSel
              return (
                <button key={i} onClick={() => setDiaSel(ds)}
                  style={{
                    display:'flex', flexDirection:'column', alignItems:'center', padding:'4px 2px',
                    borderRadius:10, border:'none', cursor:'pointer',
                    background: isSel ? '#1d4ed8' : isH ? 'rgba(37,99,235,0.16)' : 'transparent',
                    color:      isSel ? '#fff'    : isH ? '#60a5fa' : 'rgba(235,240,255,0.85)',
                  }}>
                  <span style={{ fontSize:12, fontWeight:isSel||isH ? 700 : 500 }}>{dia}</span>
                  <div style={{ display:'flex', gap:2, marginTop:2, minHeight:6 }}>
                    {evs.slice(0,3).map(e => (
                      <div key={e.id} style={{ width:4, height:4, borderRadius:'50%', background: isSel ? 'rgba(255,255,255,0.8)' : (e._local ? '#34d399' : e.cor) }} />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Eventos do dia ── */}
        <div style={{ marginTop:16 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, marginBottom:10 }}>
            <div style={{ minWidth:0, flex:1 }}>
              <p style={{ fontSize:13, fontWeight:700, color:'#fff', margin:0, textTransform:'capitalize' }}>{diaSelecionadoLabel}</p>
              <p style={{ fontSize:11, color:'rgba(203,213,235,0.45)', margin:0 }}>{eventosDia.length} evento{eventosDia.length !== 1 ? 's' : ''}</p>
            </div>
            {podeMarcar && (
              <button onClick={() => setModalAbrir(true)}
                className="agenda-publica-add-btn"
                style={{ display:'none', alignItems:'center', gap:6, background:'linear-gradient(135deg,#1d4ed8,#1e40af)', border:'none', borderRadius:12, padding:'10px 16px', color:'#fff', fontWeight:700, fontSize:12, cursor:'pointer', boxShadow:'0 4px 12px rgba(29,78,216,0.4)', flexShrink:0, minHeight:44 }}>
                <Plus size={15} /> Adicionar
              </button>
            )}
          </div>

          {eventosDia.length === 0 ? (
            <div style={{ background:'rgba(13,17,28,0.7)', border:'1px dashed rgba(255,255,255,0.10)', borderRadius:16, padding:'28px 20px', textAlign:'center' }}>
              <CalendarDays size={28} color="rgba(203,213,235,0.2)" style={{ margin:'0 auto 8px', display:'block' }} />
              <p style={{ fontSize:13, color:'rgba(203,213,235,0.4)', margin:0 }}>Nenhum evento neste dia</p>
              {filtroNome === 'meus' && (
                <p style={{ fontSize:11, color:'rgba(203,213,235,0.3)', marginTop:6 }}>Troque para &quot;Toda a equipe&quot; para ver mais</p>
              )}
              {podeMarcar && (
                <button onClick={() => setModalAbrir(true)}
                  style={{ marginTop:16, background:'linear-gradient(135deg,#1d4ed8,#1e40af)', border:'none', borderRadius:12, padding:'10px 20px', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>
                  <Plus size={14} style={{ verticalAlign:'middle', marginRight:6 }} /> Adicionar evento
                </button>
              )}
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {eventosDia.map(ev => {
                const cat = CATEGORIAS[ev.categoria] || CATEGORIAS.outro
                const cor = ev._local ? '#34d399' : (ev.cor || cat.cor)
                const rep = ev.representantes?.find(r => r.data === diaSel)?.nome || ev.representantes?.[0]?.nome || ''
                const marcado = marcacoes[ev.id]?.confirmado
                const ehMeu = ev._local || (membro && eventoEhDoMembro(ev, membro))
                return (
                  <div key={ev.id} style={{ background:'rgba(13,17,28,0.95)', border:`1px solid rgba(255,255,255,0.07)`, borderLeft:`3px solid ${marcado ? '#34d399' : cor}`, borderRadius:14, padding:'12px 14px', opacity: marcado ? 0.92 : 1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap' }}>
                      {podeMarcar && !ev._local && (
                        <button onClick={() => toggleMarcacao(ev)} title={marcado ? 'Desmarcar' : 'Marcar como confirmado'}
                          style={{ background:'none', border:'none', cursor:'pointer', padding:4, display:'flex', flexShrink:0, minWidth:44, minHeight:44, alignItems:'center', justifyContent:'center' }}>
                          {marcado
                            ? <CheckCircle size={20} color="#34d399" />
                            : <Circle size={20} color="rgba(203,213,235,0.35)" />}
                        </button>
                      )}
                      <span style={{ fontSize:10, fontWeight:700, background:`${cor}18`, color:cor, borderRadius:6, padding:'2px 8px' }}>
                        {ev._local ? 'MEU EVENTO' : marcado ? 'CONFIRMADO' : cat.label.toUpperCase()}
                      </span>
                      {ehMeu && !ev._local && (
                        <span style={{ fontSize:9, fontWeight:700, color:'#93c5fd', background:'rgba(59,130,246,0.15)', borderRadius:6, padding:'2px 6px' }}>
                          MEU
                        </span>
                      )}
                      {ev.horaInicio && (
                        <span style={{ fontSize:11, color:'rgba(203,213,235,0.55)', display:'flex', alignItems:'center', gap:3 }}>
                          <Clock size={10} /> {ev.horaInicio}{ev.horaFim ? ` → ${ev.horaFim}` : ''}
                        </span>
                      )}
                      {podeMarcar && ev._local && (
                        <button onClick={() => excluirMeuEvento(ev)} title="Excluir meu evento"
                          style={{ marginLeft:'auto', background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:10, padding:'8px 10px', cursor:'pointer', display:'flex', alignItems:'center', gap:4, minHeight:44, minWidth:44, justifyContent:'center' }}>
                          <Trash2 size={14} color="#f87171" />
                        </button>
                      )}
                    </div>
                    <p style={{ fontSize:14, fontWeight:700, color:'#fff', margin:'0 0 4px', textDecoration: marcado ? 'line-through' : 'none', opacity: marcado ? 0.75 : 1 }}>{ev.titulo}</p>
                    {ev.local && <AgendaLocalMapa local={ev.local} cor={cor} className="mb-1" />}
                    {rep && (
                      <p style={{ fontSize:12, color:'rgba(203,213,235,0.55)', margin:0, display:'flex', alignItems:'center', gap:4 }}>
                        <User size={10} /> {rep}
                      </p>
                    )}
                    {(ev.observacoes || ev.obs) && (
                      <p style={{ fontSize:11, color:'rgba(203,213,235,0.4)', margin:'6px 0 0', fontStyle:'italic' }}>{ev.observacoes || ev.obs}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {podeMarcar && (
          <p style={{ fontSize:10, color:'rgba(203,213,235,0.35)', textAlign:'center', marginTop:20 }}>
            Toque no círculo para confirmar · Use o botão + para adicionar · Lixeira só nos seus eventos
          </p>
        )}

      {/* ── Botão flutuante (celular/tablet) ── */}
      {podeMarcar && (
        <button
          type="button"
          onClick={() => setModalAbrir(true)}
          aria-label="Adicionar evento"
          style={{
            position:'fixed',
            right: 20,
            bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
            zIndex: 90,
            width: 60,
            height: 60,
            borderRadius: 30,
            border:'none',
            cursor:'pointer',
            display:'flex',
            alignItems:'center',
            justifyContent:'center',
            background:'linear-gradient(135deg,#1d4ed8,#1e40af)',
            color:'#fff',
            boxShadow:'0 8px 28px rgba(29,78,216,0.55)',
            WebkitTapHighlightColor:'transparent',
          }}
        >
          <Plus size={28} strokeWidth={2.5} />
        </button>
      )}

        {/* ── Rodapé ── */}
        <div style={{ textAlign:'center', marginTop:32, paddingTop:20, borderTop:'1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginBottom:4 }}>
            <div style={{ width:20, height:20, borderRadius:6, background:'linear-gradient(135deg,#fbbf24,#f97316)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Flag size={10} color="#000" />
            </div>
            <span style={{ fontSize:12, fontWeight:700, color:'rgba(203,213,235,0.55)' }}>Sistema de Campanha</span>
          </div>
          <p style={{ fontSize:10, color:'rgba(203,213,235,0.3)', margin:0 }}>
            {data.geradoEm ? `Gerado em ${new Date(data.geradoEm).toLocaleDateString('pt-BR')}` : 'Acesso compartilhado'}
          </p>
        </div>
      </div>

      {/* ── Modal: Adicionar evento ── */}
      {modalAbrir && (
        <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center', background: 'var(--scrim)', backdropFilter:'blur(6px)' }}>
          <div style={{ width:'100%', maxWidth:480, background:'#0d111c', borderRadius:'20px 20px 0 0', border:'1px solid rgba(255,255,255,0.10)', padding:'20px', paddingBottom:32 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <p style={{ fontWeight:800, fontSize:16, margin:0, color:'#fff' }}>Adicionar Evento</p>
              <button onClick={() => setModalAbrir(false)} style={{ background:'rgba(255,255,255,0.10)', border:'none', borderRadius:10, padding:'6px 8px', cursor:'pointer', color:'rgba(203,213,235,0.7)', display:'flex' }}>
                <X size={14} />
              </button>
            </div>

            <p style={{ fontSize:11, color:'rgba(203,213,235,0.45)', marginBottom:14 }}>
              Adicionando em: <strong style={{ color:'rgba(203,213,235,0.75)', textTransform:'capitalize' }}>{diaSelecionadoLabel}</strong>
              {membro && <> · <strong style={{ color:'#93c5fd' }}>{membro}</strong></>}
            </p>

            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div>
                <label style={{ fontSize:11, color:'rgba(203,213,235,0.50)', fontWeight:600, display:'block', marginBottom:4 }}>Título *</label>
                <input value={formNovo.titulo} onChange={e => setFormNovo(p => ({ ...p, titulo: e.target.value }))}
                  placeholder="Nome do evento"
                  style={{ width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(255,255,255,0.12)', borderRadius:12, padding:'9px 12px', fontSize:13, color:'#fff', outline:'none' }} />
              </div>
              <div>
                <label style={{ fontSize:11, color:'rgba(203,213,235,0.50)', fontWeight:600, display:'block', marginBottom:4 }}>Local</label>
                <AgendaLocalBusca
                  compact
                  value={formNovo.local}
                  onChange={v => setFormNovo(p => ({ ...p, local: v }))}
                  placeholder="Busque pelo nome da igreja ou endereço…"
                />
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {[['horaInicio','Início'], ['horaFim','Fim']].map(([key, label]) => (
                  <div key={key}>
                    <label style={{ fontSize:11, color:'rgba(203,213,235,0.50)', fontWeight:600, display:'block', marginBottom:4 }}>{label}</label>
                    <input type="time" value={formNovo[key]} onChange={e => setFormNovo(p => ({ ...p, [key]: e.target.value }))}
                      style={{ width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(255,255,255,0.12)', borderRadius:12, padding:'9px 12px', fontSize:13, color:'#fff', outline:'none', colorScheme:'dark' }} />
                  </div>
                ))}
              </div>

              <div>
                <label style={{ fontSize:11, color:'rgba(203,213,235,0.50)', fontWeight:600, display:'block', marginBottom:4 }}>Observações</label>
                <textarea value={formNovo.obs} onChange={e => setFormNovo(p => ({ ...p, obs: e.target.value }))}
                  placeholder="Detalhes extras..." rows={2}
                  style={{ width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(255,255,255,0.12)', borderRadius:12, padding:'9px 12px', fontSize:13, color:'#fff', outline:'none', resize:'none' }} />
              </div>

              <button onClick={salvarNovoEvento} disabled={!formNovo.titulo.trim()}
                style={{ background:'linear-gradient(135deg,#1d4ed8,#1e40af)', border:'none', borderRadius:14, padding:'12px', fontSize:14, fontWeight:800, color:'#fff', cursor:'pointer', opacity: formNovo.titulo.trim() ? 1 : 0.45, boxShadow:'0 4px 16px rgba(29,78,216,0.4)' }}>
                Salvar Evento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
