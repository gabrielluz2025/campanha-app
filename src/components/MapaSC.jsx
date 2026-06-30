/* ─────────────────────────────────────────────────────────────
   MapaSC.jsx — Análise de eleitores por município / bairro de SC
   Fonte: CSV TRE-SC (3.466 locais, 295 municípios)
   Cross-reference com dados de votos importados (TRE PDF)
───────────────────────────────────────────────────────────── */
import { useState, useEffect, useMemo } from 'react'
import { Search, BarChart2, X, ChevronRight, Building2, Users, TrendingUp, MapPin } from 'lucide-react'
import { normStr } from '../utils/constants'

/* ── Cores de penetração ─────────────────────────────────── */
function heatColor(pct) {
  if (!pct || pct === 0) return '#1a1a2e'
  if (pct < 0.5) return '#134e4a'
  if (pct < 1)   return '#065f46'
  if (pct < 2)   return '#047857'
  if (pct < 4)   return '#059669'
  if (pct < 7)   return '#10b981'
  return '#34d399'
}
function heatText(pct) {
  if (!pct || pct === 0) return 'rgba(203,213,235,0.25)'
  if (pct < 1)   return '#6ee7b7'
  if (pct < 3)   return '#34d399'
  return '#10b981'
}

/* ══════════════════════════════════════════════════════════ */
export default function MapaSC() {
  const [dados,    setDados]    = useState([])   // JSON rows [{m,b,z,e,n,s}]
  const [loading,  setLoading]  = useState(true)
  const [busca,    setBusca]    = useState('')
  const [ordenar,  setOrdenar]  = useState('eleitores')
  const [cidadeSel,setCidadeSel]= useState(null)
  const [treData,  setTreData]  = useState(null)

  useEffect(() => {
    fetch('/locais_sc.json').then(r => r.json()).then(d => { setDados(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    try { setTreData(JSON.parse(localStorage.getItem('eleitores_data') || 'null')) } catch {}
  }, [])

  /* ── Mapa local: (zona::nomeNorm) → {municipio, bairro} ─── */
  const localMap = useMemo(() => {
    const m = {}
    dados.forEach(r => { m[`${r.z}::${normStr(r.n)}`] = { municipio: r.m, bairro: r.b } })
    return m
  }, [dados])

  /* ── Votos por município/bairro (via TRE) ───────────────── */
  const votosMapa = useMemo(() => {
    if (!treData?.zonas || dados.length === 0) return {}
    const map = {}
    treData.zonas.forEach(z => {
      z.locais.forEach(l => {
        const info = localMap[`${z.zona}::${normStr(l.nome)}`]
        if (!info) return
        const v = l.secoes.reduce((s, sec) => s + (sec.votos || 0), 0)
        if (!map[info.municipio]) map[info.municipio] = { total: 0, bairros: {} }
        map[info.municipio].total += v
        map[info.municipio].bairros[info.bairro] = (map[info.municipio].bairros[info.bairro] || 0) + v
      })
    })
    return map
  }, [localMap, treData, dados])

  /* ── Agrupamento por município ───────────────────────────── */
  const municipios = useMemo(() => {
    const map = {}
    dados.forEach(r => {
      if (!map[r.m]) map[r.m] = { nome: r.m, totalEleitores: 0, bairros: {} }
      map[r.m].totalEleitores += r.e || 0
      if (!map[r.m].bairros[r.b]) map[r.m].bairros[r.b] = { nome: r.b, totalEleitores: 0 }
      map[r.m].bairros[r.b].totalEleitores += r.e || 0
    })
    return map
  }, [dados])

  const hasVotes = Object.keys(votosMapa).length > 0
  const totalSC   = useMemo(() => dados.reduce((s, r) => s + (r.e || 0), 0), [dados])
  const totalVotosGeral = useMemo(() => Object.values(votosMapa).reduce((s, v) => s + v.total, 0), [votosMapa])

  /* ── Lista ordenada + filtrada ───────────────────────────── */
  const lista = useMemo(() => {
    const arr = Object.values(municipios).map(m => ({
      ...m,
      votos: votosMapa[m.nome]?.total || 0,
      pct:   m.totalEleitores > 0 ? ((votosMapa[m.nome]?.total || 0) / m.totalEleitores * 100) : 0,
    }))
    arr.sort((a, b) => ordenar === 'votos' ? b.votos - a.votos : ordenar === 'pct' ? b.pct - a.pct : b.totalEleitores - a.totalEleitores)
    if (!busca) return arr
    const q = busca.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return arr.filter(c => c.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q))
  }, [municipios, votosMapa, ordenar, busca])

  const maxPct      = lista.find(c => c.pct > 0)?.pct || 1
  const maxEleit    = lista[0]?.totalEleitores || 1
  const cidadeDetail = cidadeSel ? municipios[cidadeSel] : null
  const bairrosDetail = cidadeDetail ? Object.values(cidadeDetail.bairros).map(b => ({
    ...b,
    votos: votosMapa[cidadeSel]?.bairros[b.nome] || 0,
    pct:   b.totalEleitores > 0 ? ((votosMapa[cidadeSel]?.bairros[b.nome] || 0) / b.totalEleitores * 100) : 0,
  })).sort((a, b) => hasVotes ? b.votos - a.votos : b.totalEleitores - a.totalEleitores) : []

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#07080f', color: '#e2e8f0' }}>

      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-2.5 flex-shrink-0"
        style={{ background: 'rgba(13,17,28,0.97)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <BarChart2 size={14} style={{ color: '#3b82f6' }} />
        <span className="font-bold text-white" style={{ fontSize: 13 }}>Análise SC</span>
        <span style={{ fontSize: 10, color: 'rgba(203,213,235,0.3)' }}>Eleitores por município · Santa Catarina</span>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {[
            { label: 'Municípios', value: Object.keys(municipios).length, color: '#60a5fa' },
            { label: 'Eleitores SC', value: totalSC > 0 ? totalSC.toLocaleString('pt-BR') : '…', color: '#a78bfa' },
            ...(hasVotes ? [
              { label: 'Cidades c/ votos', value: Object.keys(votosMapa).length, color: '#34d399' },
              { label: 'Total votos', value: totalVotosGeral.toLocaleString('pt-BR'), color: '#34d399' },
            ] : []),
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="font-bold" style={{ fontSize: 12, color }}>{value}</span>
              <span style={{ fontSize: 9, color: 'rgba(203,213,235,0.35)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Lista de cidades ──────────────────────────── */}
        <div className="flex flex-col overflow-hidden flex-shrink-0"
          style={{ width: cidadeSel ? 360 : '100%', borderRight: cidadeSel ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>

          {/* Controles */}
          <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex items-center gap-1.5 flex-1 px-2.5 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', height: 32 }}>
              <Search size={11} style={{ color: 'rgba(203,213,235,0.35)' }} />
              <input value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Buscar cidade…" className="flex-1 bg-transparent outline-none"
                style={{ fontSize: 11, color: '#e2e8f0' }} />
              {busca && <button onClick={() => setBusca('')}><X size={10} style={{ color: 'rgba(203,213,235,0.4)' }} /></button>}
            </div>
            <select value={ordenar} onChange={e => setOrdenar(e.target.value)}
              className="outline-none rounded-xl px-2 text-xs font-semibold"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', color: '#5b9bff', height: 32 }}>
              <option value="eleitores">Por Eleitores</option>
              {hasVotes && <option value="votos">Por Votos</option>}
              {hasVotes && <option value="pct">Por Penetração</option>}
            </select>
          </div>

          {/* Cards */}
          <div className="flex-1 overflow-y-auto px-2 py-2" style={{ gap: 4, display: 'flex', flexDirection: 'column' }}>
            {loading ? (
              <div className="text-center py-12" style={{ color: 'rgba(203,213,235,0.25)', fontSize: 12 }}>Carregando dados…</div>
            ) : lista.length === 0 ? (
              <div className="text-center py-12" style={{ color: 'rgba(203,213,235,0.25)', fontSize: 12 }}>Nenhuma cidade encontrada</div>
            ) : lista.map((c, i) => {
              const isSel = cidadeSel === c.nome
              const barPct = hasVotes && c.votos > 0
                ? Math.min(100, c.pct / maxPct * 100)
                : Math.min(100, c.totalEleitores / maxEleit * 100)
              return (
                <button key={c.nome} onClick={() => setCidadeSel(isSel ? null : c.nome)}
                  className="w-full rounded-xl px-3 py-2 text-left transition-all flex items-center gap-2"
                  style={{ background: isSel ? 'rgba(37,99,235,0.18)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isSel ? 'rgba(37,99,235,0.45)' : 'rgba(255,255,255,0.055)'}` }}>
                  <span style={{ fontSize: 9, color: 'rgba(203,213,235,0.2)', width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold truncate" style={{ fontSize: 11.5, color: isSel ? '#fff' : '#cbd5e1' }}>{c.nome}</span>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        {hasVotes && c.votos > 0 && (
                          <span className="font-black" style={{ fontSize: 11, color: heatText(c.pct) }}>{c.pct.toFixed(2)}%</span>
                        )}
                        <span style={{ fontSize: 10, color: 'rgba(203,213,235,0.35)' }}>{c.totalEleitores.toLocaleString('pt-BR')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 2.5, background: 'rgba(255,255,255,0.05)' }}>
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${barPct}%`, background: hasVotes && c.votos > 0 ? heatColor(c.pct) : 'rgba(59,130,246,0.45)' }} />
                      </div>
                      {hasVotes && c.votos > 0 && (
                        <span style={{ fontSize: 9, color: '#6ee7b7', flexShrink: 0 }}>{c.votos.toLocaleString('pt-BR')} v</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={11} style={{ color: 'rgba(203,213,235,0.2)', flexShrink: 0 }} />
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Detalhe da cidade ──────────────────────────── */}
        {cidadeSel && cidadeDetail && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* City header */}
            <div className="px-5 py-3 flex-shrink-0"
              style={{ background: 'rgba(13,17,28,0.85)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-black text-white" style={{ fontSize: 15 }}>{cidadeSel}</h2>
                  <p style={{ fontSize: 10, color: 'rgba(203,213,235,0.4)', marginTop: 1 }}>
                    {cidadeDetail.totalEleitores.toLocaleString('pt-BR')} eleitores · {Object.keys(cidadeDetail.bairros).length} bairros/localidades
                  </p>
                </div>
                <button onClick={() => setCidadeSel(null)} className="p-1.5 rounded-lg ml-4 flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <X size={12} style={{ color: 'rgba(203,213,235,0.6)' }} />
                </button>
              </div>
              {hasVotes && votosMapa[cidadeSel] && (
                <div className="flex gap-2 mt-2">
                  {[
                    { label: 'Votos', value: votosMapa[cidadeSel].total.toLocaleString('pt-BR'), color: '#34d399' },
                    { label: 'Penetração', value: (votosMapa[cidadeSel].total / cidadeDetail.totalEleitores * 100).toFixed(2) + '%', color: '#10b981' },
                    { label: 'Eleitores', value: cidadeDetail.totalEleitores.toLocaleString('pt-BR'), color: '#a78bfa' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="px-3 py-1.5 rounded-xl text-center"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <p className="font-black" style={{ fontSize: 14, color }}>{value}</p>
                      <p style={{ fontSize: 8, color: 'rgba(203,213,235,0.35)', textTransform: 'uppercase' }}>{label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bairros */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <p className="font-bold mb-2" style={{ fontSize: 10, color: 'rgba(203,213,235,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Bairros / Localidades
              </p>
              <div className="space-y-1">
                {bairrosDetail.map((b, i) => {
                  const maxB = bairrosDetail[0]?.totalEleitores || 1
                  const barPct = hasVotes && b.votos > 0
                    ? Math.min(100, b.pct / (bairrosDetail.find(x => x.pct > 0)?.pct || 1) * 100)
                    : Math.min(100, b.totalEleitores / maxB * 100)
                  return (
                    <div key={b.nome} className="rounded-xl px-3 py-2"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.055)' }}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 9, color: 'rgba(203,213,235,0.2)', width: 14 }}>{i + 1}</span>
                          <span className="font-semibold truncate" style={{ fontSize: 11, color: '#cbd5e1', maxWidth: 200 }}>{b.nome}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {hasVotes && b.votos > 0 && (
                            <>
                              <span className="font-black" style={{ fontSize: 11, color: heatText(b.pct) }}>{b.pct.toFixed(2)}%</span>
                              <span style={{ fontSize: 10, color: '#34d399', fontWeight: 700 }}>{b.votos.toLocaleString('pt-BR')} v</span>
                            </>
                          )}
                          <span style={{ fontSize: 10, color: 'rgba(203,213,235,0.4)' }}>{b.totalEleitores.toLocaleString('pt-BR')} el</span>
                        </div>
                      </div>
                      <div className="rounded-full overflow-hidden" style={{ height: 3, background: 'rgba(255,255,255,0.05)' }}>
                        <div className="h-full rounded-full"
                          style={{ width: `${barPct}%`, background: hasVotes && b.votos > 0 ? heatColor(b.pct) : 'rgba(59,130,246,0.4)' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Empty state ────────────────────────────────── */}
        {!cidadeSel && !loading && lista.length > 0 && (
          <div className="hidden lg:flex flex-col items-center justify-center flex-1 gap-3"
            style={{ color: 'rgba(203,213,235,0.2)' }}>
            <MapPin size={32} />
            <p style={{ fontSize: 13 }}>Selecione uma cidade para ver o detalhe por bairro</p>
          </div>
        )}
      </div>
    </div>
  )
}
