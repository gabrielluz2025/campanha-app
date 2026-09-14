/* ─────────────────────────────────────────────────────────────
   MapaSC.jsx — Análise de eleitores por município / bairro de SC
   Fonte: CSV TRE-SC (3.466 locais, 295 municípios)
   Cross-reference com dados de votos importados (TRE PDF)
───────────────────────────────────────────────────────────── */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, BarChart2, X, ChevronRight, MapPin } from 'lucide-react'
import { normStr } from '../utils/constants'
import { readEleitoresData } from '../utils/persist'
import { municipioZona } from '../utils/eleitoresHelpers'
import { SYNC_EVENT, SYNC_STORAGE_EVENT } from '../lib/cloudSync'
import { useTabActive } from '../context/TabActiveContext'

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

function votosDeLocal(local) {
  return (local?.secoes || []).reduce((s, sec) => s + (Number(sec.votos) || 0), 0)
}

function totalVotosImportados(treData) {
  if (!treData) return 0
  const header = Number(treData.votosTotal) || 0
  let soma = 0
  ;(treData.zonas || []).forEach(z => {
    ;(z.locais || []).forEach(l => { soma += votosDeLocal(l) })
  })
  return header > 0 ? header : soma
}

/** Encontra o nome canônico do município em `municipios` (chave do mapa SC). */
function matchMunicipioKey(municipios, nome) {
  if (!nome) return null
  if (municipios[nome]) return nome
  const n = normStr(nome)
  for (const k of Object.keys(municipios)) {
    if (normStr(k) === n) return k
  }
  return null
}

/* ══════════════════════════════════════════════════════════ */
export default function MapaSC() {
  const tabActive = useTabActive()
  const [dados,    setDados]    = useState([])   // JSON rows [{m,b,z,e,n,s}]
  const [loading,  setLoading]  = useState(true)
  const [busca,    setBusca]    = useState('')
  const [ordenar,  setOrdenar]  = useState('eleitores')
  const [cidadeSel,setCidadeSel]= useState(null)
  const [treData,  setTreData]  = useState(null)

  const reloadTre = useCallback(() => {
    setTreData(readEleitoresData(null))
  }, [])

  useEffect(() => {
    fetch('/locais_sc.json').then(r => r.json()).then(d => { setDados(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!tabActive) return undefined
    reloadTre()
    const onSync = (e) => {
      const key = e.detail?.key || e.detail?.approvedKey
      if (key && key !== 'eleitores_data') return
      reloadTre()
    }
    window.addEventListener(SYNC_EVENT, onSync)
    window.addEventListener(SYNC_STORAGE_EVENT, onSync)
    window.addEventListener('storage', onSync)
    return () => {
      window.removeEventListener(SYNC_EVENT, onSync)
      window.removeEventListener(SYNC_STORAGE_EVENT, onSync)
      window.removeEventListener('storage', onSync)
    }
  }, [reloadTre, tabActive])

  /* ── Mapa local: (zona::nomeNorm) → {municipio, bairro} ─── */
  const localMap = useMemo(() => {
    const m = {}
    dados.forEach(r => { m[`${r.z}::${normStr(r.n)}`] = { municipio: r.m, bairro: r.b } })
    return m
  }, [dados])

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

  /* ── Votos por município/bairro (via TRE) ───────────────── */
  const votosMapa = useMemo(() => {
    if (!treData?.zonas?.length || Object.keys(municipios).length === 0) return {}
    const map = {}

    const bump = (munKey, bairro, v) => {
      if (!munKey || !v) return
      if (!map[munKey]) map[munKey] = { total: 0, bairros: {} }
      map[munKey].total += v
      if (bairro) {
        map[munKey].bairros[bairro] = (map[munKey].bairros[bairro] || 0) + v
      }
    }

    treData.zonas.forEach(z => {
      const munNorm = municipioZona(z, treData)
      const munKeyFallback = matchMunicipioKey(municipios, munNorm)
        || matchMunicipioKey(municipios, z.municipio)
        || matchMunicipioKey(municipios, treData.municipio)

      ;(z.locais || []).forEach(l => {
        const v = votosDeLocal(l)
        if (!v) return
        const info = localMap[`${z.zona}::${normStr(l.nome)}`]
        if (info) {
          const munKey = matchMunicipioKey(municipios, info.municipio) || info.municipio
          bump(munKey, info.bairro, v)
          return
        }
        // Sem match de local: ainda conta no município da zona
        bump(munKeyFallback, 'Outros / sem local', v)
      })
    })
    return map
  }, [localMap, treData, municipios])

  const totalVotosGeral = useMemo(() => totalVotosImportados(treData), [treData])
  const votosMapeados = useMemo(
    () => Object.values(votosMapa).reduce((s, v) => s + (v.total || 0), 0),
    [votosMapa],
  )
  const hasVotes = totalVotosGeral > 0 || votosMapeados > 0
  const totalSC = useMemo(() => dados.reduce((s, r) => s + (r.e || 0), 0), [dados])

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
  const maxVotos    = Math.max(1, ...lista.map(c => c.votos || 0))
  const cidadeDetail = cidadeSel ? municipios[cidadeSel] : null
  const bairrosDetail = cidadeDetail ? Object.values(cidadeDetail.bairros).map(b => ({
    ...b,
    votos: votosMapa[cidadeSel]?.bairros[b.nome] || 0,
    pct:   b.totalEleitores > 0 ? ((votosMapa[cidadeSel]?.bairros[b.nome] || 0) / b.totalEleitores * 100) : 0,
  })).sort((a, b) => hasVotes ? b.votos - a.votos : b.totalEleitores - a.totalEleitores) : []

  const extrasBairro = cidadeSel && votosMapa[cidadeSel]
    ? Object.entries(votosMapa[cidadeSel].bairros || {})
      .filter(([nome]) => !cidadeDetail?.bairros?.[nome])
      .map(([nome, votos]) => ({ nome, totalEleitores: 0, votos, pct: 0 }))
    : []

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg-base)', color: '#e2e8f0' }}>

      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0"
        style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="page-header-icon" style={{ width: 34, height: 34, borderRadius: 10 }}>
          <BarChart2 size={15} />
        </div>
        <div className="min-w-0">
          <p className="eyebrow" style={{ color: 'var(--gold)', fontSize: 9 }}>Análise</p>
          <span className="font-bold text-white" style={{ fontSize: 13 }}>Análise SC</span>
          <span className="hidden md:inline ml-2" style={{ fontSize: 10, color: 'var(--text-faint)' }}>Eleitores e votos por município · Santa Catarina</span>
        </div>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {[
            { label: 'Municípios', value: Object.keys(municipios).length, color: 'var(--gold-bright)' },
            { label: 'Eleitores SC', value: totalSC > 0 ? totalSC.toLocaleString('pt-BR') : '…', color: 'var(--text-secondary)' },
            {
              label: 'Votos feitos',
              value: hasVotes ? totalVotosGeral.toLocaleString('pt-BR') : '—',
              color: hasVotes ? '#34d399' : 'var(--text-faint)',
            },
            ...(hasVotes ? [
              { label: 'Cidades c/ votos', value: Object.keys(votosMapa).length, color: '#6ee7b7' },
            ] : []),
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl flex-shrink-0"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
              <span className="font-bold" style={{ fontSize: 12, color }}>{value}</span>
              <span style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {!hasVotes && !loading && (
        <div className="px-5 py-2 flex-shrink-0"
          style={{ background: 'rgba(251,191,36,0.08)', borderBottom: '1px solid rgba(251,191,36,0.2)', fontSize: 11, color: '#fbbf24' }}>
          Ainda sem votos importados. Em <strong>Eleitores</strong>, importe o PDF/TRE da eleição para ver “votos feitos” por cidade.
        </div>
      )}

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
              {busca && <button type="button" onClick={() => setBusca('')}><X size={10} style={{ color: 'rgba(203,213,235,0.4)' }} /></button>}
            </div>
            <select value={ordenar} onChange={e => setOrdenar(e.target.value)}
              className="outline-none rounded-xl px-2 text-xs font-semibold"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', color: '#5b9bff', height: 32 }}>
              <option value="eleitores">Por Eleitores</option>
              <option value="votos" disabled={!hasVotes}>Por Votos</option>
              <option value="pct" disabled={!hasVotes}>Por Penetração</option>
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
              const barPct = hasVotes && ordenar !== 'eleitores' && c.votos > 0
                ? (ordenar === 'pct'
                  ? Math.min(100, c.pct / maxPct * 100)
                  : Math.min(100, c.votos / maxVotos * 100))
                : Math.min(100, c.totalEleitores / maxEleit * 100)
              return (
                <button key={c.nome} type="button" onClick={() => setCidadeSel(isSel ? null : c.nome)}
                  className="w-full rounded-xl px-3 py-2 text-left transition-all flex items-center gap-2"
                  style={{ background: isSel ? 'rgba(212,175,95,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isSel ? 'rgba(212,175,95,0.35)' : 'rgba(255,255,255,0.055)'}` }}>
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
                      {hasVotes && (
                        <span style={{ fontSize: 9, color: c.votos > 0 ? '#6ee7b7' : 'rgba(203,213,235,0.25)', flexShrink: 0, fontWeight: 700 }}>
                          {c.votos > 0 ? `${c.votos.toLocaleString('pt-BR')} votos` : '0 votos'}
                        </span>
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
                <button type="button" onClick={() => setCidadeSel(null)} className="p-1.5 rounded-lg ml-4 flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <X size={12} style={{ color: 'rgba(203,213,235,0.6)' }} />
                </button>
              </div>
              <div className="flex gap-2 mt-2 flex-wrap">
                {[
                  {
                    label: 'Votos feitos',
                    value: hasVotes
                      ? (votosMapa[cidadeSel]?.total || 0).toLocaleString('pt-BR')
                      : '—',
                    color: '#34d399',
                  },
                  {
                    label: 'Penetração',
                    value: hasVotes && votosMapa[cidadeSel]
                      ? ((votosMapa[cidadeSel].total / cidadeDetail.totalEleitores) * 100).toFixed(2) + '%'
                      : '—',
                    color: '#10b981',
                  },
                  {
                    label: 'Eleitores',
                    value: cidadeDetail.totalEleitores.toLocaleString('pt-BR'),
                    color: '#a78bfa',
                  },
                ].map(({ label, value, color }) => (
                  <div key={label} className="px-3 py-1.5 rounded-xl text-center"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <p className="font-black" style={{ fontSize: 14, color }}>{value}</p>
                    <p style={{ fontSize: 8, color: 'rgba(203,213,235,0.35)', textTransform: 'uppercase' }}>{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Bairros */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <p className="font-bold mb-2" style={{ fontSize: 10, color: 'rgba(203,213,235,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Bairros / Localidades
              </p>
              <div className="space-y-1">
                {[...bairrosDetail, ...extrasBairro].map((b, i) => {
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
                              {b.totalEleitores > 0 && (
                                <span className="font-black" style={{ fontSize: 11, color: heatText(b.pct) }}>{b.pct.toFixed(2)}%</span>
                              )}
                              <span style={{ fontSize: 10, color: '#34d399', fontWeight: 700 }}>{b.votos.toLocaleString('pt-BR')} votos</span>
                            </>
                          )}
                          {b.totalEleitores > 0 && (
                            <span style={{ fontSize: 10, color: 'rgba(203,213,235,0.4)' }}>{b.totalEleitores.toLocaleString('pt-BR')} el</span>
                          )}
                        </div>
                      </div>
                      <div className="rounded-full overflow-hidden" style={{ height: 3, background: 'rgba(255,255,255,0.05)' }}>
                        <div className="h-full rounded-full"
                          style={{ width: `${Number.isFinite(barPct) ? barPct : 0}%`, background: hasVotes && b.votos > 0 ? heatColor(b.pct) : 'rgba(59,130,246,0.4)' }} />
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
            <p style={{ fontSize: 13 }}>Selecione uma cidade para ver votos e detalhe por bairro</p>
          </div>
        )}
      </div>
    </div>
  )
}
