import { useMemo, useState } from 'react'
import {
  Search, Pencil, Church, Briefcase, Users, Phone, AlertTriangle, MapPin, CheckCircle2,
} from 'lucide-react'
import { CARGOS, CARGO_CORES, normalizarCargo } from '../utils/equipeSync'
import { getAllIgrejasCatalog } from '../utils/igrejasCatalog'
import {
  nomeIgrejaMembro, cargoEclesiastico, temVinculoIgreja, temCargoEclesiastico,
} from '../utils/equipeIgrejasReport'
import { DENOMINACAO_PADRAO, COR_DENOMINACAO, SETORES } from '../constants/igrejasTheme'

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function isAd(ig) {
  const d = ig?.denominacao || DENOMINACAO_PADRAO
  return d === DENOMINACAO_PADRAO || norm(d).includes('assembleia')
}

/** Compat: igreja nome/id (cobertura) — mais restrito que temVinculoIgreja */
function temIgrejaCatalogada(m) {
  return Boolean(nomeIgrejaMembro(m) || m?.igrejaId != null)
}

function resolverIgreja(m, catalog, byId, byNome) {
  if (m?.igrejaId != null && byId.has(String(m.igrejaId))) return byId.get(String(m.igrejaId))
  const nome = nomeIgrejaMembro(m)
  if (nome && byNome.has(norm(nome))) return byNome.get(norm(nome))
  return null
}

/**
 * Sub-aba: cobertura de igrejas (AD vs outras), pessoas por igreja e por bairro.
 */
export default function EquipeIgrejas({
  membros = [],
  onEditar,
}) {
  const [busca, setBusca] = useState('')
  const [visao, setVisao] = useState('cobertura') // cobertura | bairros | pessoas
  const [filtroDenom, setFiltroDenom] = useState('todas') // todas | ad | outras
  const [filtroCobertura, setFiltroCobertura] = useState('todas') // todas | cobertas | descobertas
  const [filtro, setFiltro] = useState('cargo_igreja') // cargo_igreja | com_igreja | sem_igreja | todos
  const [grupoPessoas, setGrupoPessoas] = useState('cargo_igreja') // igreja | cargo | cargo_igreja
  const [filtroCargo, setFiltroCargo] = useState('Todos')
  const [filtroCargoIgreja, setFiltroCargoIgreja] = useState('Todos')
  const [filtroIgreja, setFiltroIgreja] = useState('Todas')

  const catalog = useMemo(() => {
    return getAllIgrejasCatalog().map(ig => ({
      ...ig,
      denominacao: ig.denominacao || (Number(ig.id) > 88 && Number(ig.id) <= 1999 ? 'Outra' : DENOMINACAO_PADRAO),
      setor: ig.setor || '—',
    }))
  }, [])

  const indices = useMemo(() => {
    const byId = new Map()
    const byNome = new Map()
    catalog.forEach(ig => {
      byId.set(String(ig.id), ig)
      byNome.set(norm(ig.nome), ig)
    })
    return { byId, byNome }
  }, [catalog])

  const membrosPorIgreja = useMemo(() => {
    const map = new Map() // igrejaId -> membros[]
    const orfaos = []
    membros.forEach(m => {
      const ig = resolverIgreja(m, catalog, indices.byId, indices.byNome)
      if (ig) {
        const k = String(ig.id)
        if (!map.has(k)) map.set(k, [])
        map.get(k).push(m)
      } else if (temIgrejaCatalogada(m)) {
        orfaos.push(m)
      }
    })
    return { map, orfaos }
  }, [membros, catalog, indices])

  const cobertura = useMemo(() => {
    const linhas = catalog.map(ig => {
      const pessoas = membrosPorIgreja.map.get(String(ig.id)) || []
      return {
        ...ig,
        pessoas,
        qtd: pessoas.length,
        coberta: pessoas.length > 0,
        ad: isAd(ig),
      }
    })
    const ad = linhas.filter(l => l.ad)
    const outras = linhas.filter(l => !l.ad)
    const adCobertas = ad.filter(l => l.coberta).length
    const outrasCobertas = outras.filter(l => l.coberta).length
    return {
      linhas,
      total: linhas.length,
      adTotal: ad.length,
      outrasTotal: outras.length,
      adCobertas,
      outrasCobertas,
      cobertas: adCobertas + outrasCobertas,
      pessoasVinculadas: membros.filter(temVinculoIgreja).length,
      comCargoIgreja: membros.filter(temCargoEclesiastico).length,
      orfaos: membrosPorIgreja.orfaos.length,
    }
  }, [catalog, membrosPorIgreja, membros])

  const porBairro = useMemo(() => {
    const map = new Map()
    cobertura.linhas.forEach(ig => {
      const setor = ig.setor || '—'
      if (!map.has(setor)) {
        map.set(setor, {
          setor,
          total: 0,
          cobertas: 0,
          ad: 0,
          outras: 0,
          adCobertas: 0,
          outrasCobertas: 0,
          pessoas: 0,
          igrejas: [],
        })
      }
      const row = map.get(setor)
      row.total++
      row.pessoas += ig.qtd
      row.igrejas.push(ig)
      if (ig.ad) {
        row.ad++
        if (ig.coberta) row.adCobertas++
      } else {
        row.outras++
        if (ig.coberta) row.outrasCobertas++
      }
      if (ig.coberta) row.cobertas++
    })
    return [...map.values()]
      .map(r => ({
        ...r,
        pct: r.total > 0 ? Math.round((r.cobertas / r.total) * 100) : 0,
      }))
      .sort((a, b) => {
        if (b.cobertas !== a.cobertas) return b.cobertas - a.cobertas
        return a.setor.localeCompare(b.setor, 'pt-BR')
      })
  }, [cobertura])

  const linhasCobertura = useMemo(() => {
    const q = busca.trim()
    const nq = norm(q)
    return cobertura.linhas
      .filter(ig => {
        if (filtroDenom === 'ad' && !ig.ad) return false
        if (filtroDenom === 'outras' && ig.ad) return false
        if (filtroCobertura === 'cobertas' && !ig.coberta) return false
        if (filtroCobertura === 'descobertas' && ig.coberta) return false
        if (!nq) return true
        return norm(ig.nome).includes(nq)
          || norm(ig.setor).includes(nq)
          || norm(ig.denominacao).includes(nq)
          || ig.pessoas.some(m => norm(m.nome).includes(nq))
      })
      .sort((a, b) => {
        if (b.qtd !== a.qtd) return b.qtd - a.qtd
        return a.nome.localeCompare(b.nome, 'pt-BR')
      })
  }, [cobertura, busca, filtroDenom, filtroCobertura])

  const bairrosFiltrados = useMemo(() => {
    const q = busca.trim()
    const nq = norm(q)
    return porBairro.filter(b => {
      if (filtroDenom === 'ad' && b.ad === 0) return false
      if (filtroDenom === 'outras' && b.outras === 0) return false
      if (filtroCobertura === 'cobertas' && b.cobertas === 0) return false
      if (filtroCobertura === 'descobertas' && b.cobertas === b.total) return false
      if (!nq) return true
      return norm(b.setor).includes(nq)
        || b.igrejas.some(ig => norm(ig.nome).includes(nq))
    })
  }, [porBairro, busca, filtroDenom, filtroCobertura])

  const igrejasOpts = useMemo(() => {
    const set = new Set()
    membros.forEach(m => {
      const n = nomeIgrejaMembro(m)
      if (n) set.add(n)
    })
    return ['Todas', ...[...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))]
  }, [membros])

  const cargosOpts = useMemo(() => {
    const usados = CARGOS.filter(c => membros.some(m => normalizarCargo(m.cargo) === c))
    return ['Todos', ...usados]
  }, [membros])

  const cargosIgrejaOpts = useMemo(() => {
    const set = new Set()
    membros.forEach(m => {
      const c = cargoEclesiastico(m)
      if (c) set.add(c)
    })
    return ['Todos', ...[...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))]
  }, [membros])

  const statsPessoas = useMemo(() => {
    const com = membros.filter(temVinculoIgreja).length
    const comCargoIg = membros.filter(temCargoEclesiastico).length
    const porCargo = {}
    const porCargoIgreja = {}
    membros.filter(temVinculoIgreja).forEach(m => {
      const c = normalizarCargo(m.cargo)
      porCargo[c] = (porCargo[c] || 0) + 1
    })
    membros.filter(temCargoEclesiastico).forEach(m => {
      const c = cargoEclesiastico(m)
      porCargoIgreja[c] = (porCargoIgreja[c] || 0) + 1
    })
    return {
      total: membros.length,
      comIgreja: com,
      comCargoIgreja: comCargoIg,
      semIgreja: membros.length - com,
      porCargo,
      porCargoIgreja,
    }
  }, [membros])

  const filtradosPessoas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return membros.filter(m => {
      const ig = nomeIgrejaMembro(m)
      const cargoIg = cargoEclesiastico(m)
      const com = temVinculoIgreja(m)
      if (filtro === 'cargo_igreja' && !temCargoEclesiastico(m)) return false
      if (filtro === 'com_igreja' && !com) return false
      if (filtro === 'sem_igreja' && com) return false
      if (filtroCargo !== 'Todos' && normalizarCargo(m.cargo) !== filtroCargo) return false
      if (filtroCargoIgreja !== 'Todos' && cargoIg !== filtroCargoIgreja) return false
      if (filtroIgreja !== 'Todas' && ig !== filtroIgreja) return false
      if (filtroDenom !== 'todas') {
        const ref = resolverIgreja(m, catalog, indices.byId, indices.byNome)
        if (ref) {
          if (filtroDenom === 'ad' && !isAd(ref)) return false
          if (filtroDenom === 'outras' && isAd(ref)) return false
        } else if (filtroDenom === 'ad' || filtroDenom === 'outras') {
          if (filtro !== 'sem_igreja') return false
        }
      }
      if (!q) return true
      return (m.nome || '').toLowerCase().includes(q)
        || ig.toLowerCase().includes(q)
        || cargoIg.toLowerCase().includes(q)
        || normalizarCargo(m.cargo).toLowerCase().includes(q)
        || (m.telefone || '').includes(q)
    })
  }, [membros, busca, filtro, filtroCargo, filtroCargoIgreja, filtroIgreja, filtroDenom, catalog, indices])

  const gruposPessoas = useMemo(() => {
    const map = new Map()
    filtradosPessoas.forEach(m => {
      let key
      if (grupoPessoas === 'cargo') key = normalizarCargo(m.cargo)
      else if (grupoPessoas === 'cargo_igreja') key = cargoEclesiastico(m) || 'Sem cargo na igreja'
      else key = nomeIgrejaMembro(m) || 'Sem igreja vinculada'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(m)
    })
    return [...map.entries()]
      .map(([titulo, lista]) => ({
        titulo,
        lista: lista.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')),
      }))
      .sort((a, b) => {
        const last = t => t.startsWith('Sem ')
        if (last(a.titulo) !== last(b.titulo)) return last(a.titulo) ? 1 : -1
        return a.titulo.localeCompare(b.titulo, 'pt-BR')
      })
  }, [filtradosPessoas, grupoPessoas])

  const pctAd = cobertura.adTotal > 0 ? Math.round((cobertura.adCobertas / cobertura.adTotal) * 100) : 0
  const pctOutras = cobertura.outrasTotal > 0 ? Math.round((cobertura.outrasCobertas / cobertura.outrasTotal) * 100) : 0
  const pctGeral = cobertura.total > 0 ? Math.round((cobertura.cobertas / cobertura.total) * 100) : 0

  const secoesCobertura = useMemo(() => {
    const ad = linhasCobertura.filter(ig => ig.ad)
    const outras = linhasCobertura.filter(ig => !ig.ad)
    if (filtroDenom === 'ad') {
      return [{ id: 'ad', titulo: 'AD / ADBLU', cor: '#60a5fa', lista: ad }]
    }
    if (filtroDenom === 'outras') {
      return [{ id: 'outras', titulo: 'Outras denominações', cor: '#c4b5fd', lista: outras }]
    }
    return [
      { id: 'ad', titulo: 'AD / ADBLU', cor: '#60a5fa', lista: ad },
      { id: 'outras', titulo: 'Outras denominações', cor: '#c4b5fd', lista: outras },
    ]
  }, [linhasCobertura, filtroDenom])

  function renderIgrejaCard(ig) {
    const cor = ig.ad
      ? (COR_DENOMINACAO[DENOMINACAO_PADRAO] || '#3b82f6')
      : (COR_DENOMINACAO[ig.denominacao] || '#8b5cf6')
    return (
      <div key={ig.id} className="rounded-2xl p-4"
        style={{
          background: 'var(--bg-surface)',
          border: `1px solid ${ig.coberta ? 'rgba(16,185,129,0.25)' : 'var(--border-subtle)'}`,
        }}>
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold truncate" style={{ fontSize: 14, color: 'var(--text-primary)' }}>{ig.nome}</p>
              {ig.coberta
                ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold"
                    style={{ fontSize: 9, background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>
                    <CheckCircle2 size={9} /> Coberta
                  </span>
                : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold"
                    style={{ fontSize: 9, background: 'rgba(245,158,11,0.12)', color: '#fbbf24' }}>
                    <AlertTriangle size={9} /> Sem cobertura
                  </span>}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span className="px-2 py-0.5 rounded-full font-bold"
                style={{ fontSize: 10, background: cor + '22', color: cor }}>
                {ig.ad ? 'AD / ADBLU' : (ig.denominacao || 'Outra')}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
                style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                <MapPin size={9} /> {ig.setor}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold"
                style={{ fontSize: 10, background: 'rgba(37,99,235,0.15)', color: '#93c5fd' }}>
                <Users size={9} /> {ig.qtd} pessoa{ig.qtd !== 1 ? 's' : ''}
              </span>
            </div>
            {ig.pessoas.length > 0 && (
              <div className="mt-2 space-y-1">
                {ig.pessoas.map(m => {
                  const cargo = normalizarCargo(m.cargo)
                  const cargoCor = CARGO_CORES[cargo] || '#94a3b8'
                  const cargoIg = String(m.cargoIgreja || '').trim()
                  return (
                    <div key={m.id} className="flex items-center justify-between gap-2 py-1">
                      <div className="min-w-0">
                        <p className="truncate font-semibold" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.nome}</p>
                        <span className="inline-flex items-center gap-1 mt-0.5"
                          style={{ fontSize: 10, color: cargoCor }}>
                          <Briefcase size={9} /> {cargo}
                          {cargoIg ? ` · ${cargoIg}` : ''}
                        </span>
                      </div>
                      <button type="button" onClick={() => onEditar?.(m)}
                        className="px-2.5 py-1 rounded-lg font-bold flex-shrink-0"
                        style={{ fontSize: 10, background: 'rgba(37,99,235,0.14)', color: '#93c5fd' }}>
                        Editar
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPIs do sistema */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Igrejas no sistema', valor: cobertura.total, cor: 'var(--text-primary)' },
          { label: 'AD / ADBLU', valor: cobertura.adTotal, cor: '#60a5fa' },
          { label: 'Outras denominações', valor: cobertura.outrasTotal, cor: '#c4b5fd' },
          { label: 'Cobertas (geral)', valor: `${cobertura.cobertas}/${cobertura.total}`, sub: `${pctGeral}%`, cor: '#34d399' },
          { label: 'AD cobertas', valor: `${cobertura.adCobertas}/${cobertura.adTotal}`, sub: `${pctAd}%`, cor: '#93c5fd' },
          { label: 'Outras cobertas', valor: `${cobertura.outrasCobertas}/${cobertura.outrasTotal}`, sub: `${pctOutras}%`, cor: '#f0abfc' },
        ].map(c => (
          <div key={c.label} className="rounded-2xl px-3 py-3"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <p className="font-black truncate" style={{ fontSize: 18, color: c.cor }}>{c.valor}</p>
            {c.sub && <p className="font-bold" style={{ fontSize: 10, color: c.cor }}>{c.sub}</p>}
            <p style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Membros na equipe', valor: statsPessoas.total, cor: 'var(--text-primary)' },
          { label: 'Com cargo na igreja', valor: statsPessoas.comCargoIgreja, cor: '#67e8f9' },
          { label: 'Rede (igreja/cargo)', valor: statsPessoas.comIgreja, cor: '#a78bfa' },
          { label: 'Fora da rede', valor: statsPessoas.semIgreja, cor: statsPessoas.semIgreja ? '#fbbf24' : 'var(--text-primary)' },
          { label: 'Bairros com cobertura', valor: porBairro.filter(b => b.cobertas > 0).length, cor: '#34d399' },
        ].map(c => (
          <div key={c.label} className="rounded-2xl px-4 py-3"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <p className="font-black" style={{ fontSize: 20, color: c.cor }}>{c.valor}</p>
            <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{c.label}</p>
          </div>
        ))}
      </div>

      {/* Visão + filtros */}
      <div className="rounded-3xl p-4 space-y-3"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'cobertura', label: 'Por igreja', icon: Church },
            { id: 'bairros', label: 'Por bairro', icon: MapPin },
            { id: 'pessoas', label: 'Pessoas & cargos', icon: Users },
          ].map(v => {
            const Icon = v.icon
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setVisao(v.id)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold transition-all"
                style={{
                  fontSize: 11,
                  background: visao === v.id ? 'rgba(37,99,235,0.28)' : 'rgba(255,255,255,0.05)',
                  color: visao === v.id ? '#93c5fd' : 'var(--text-tertiary)',
                  border: visao === v.id ? '1px solid rgba(59,130,246,0.45)' : '1px solid transparent',
                }}
              >
                <Icon size={12} /> {v.label}
              </button>
            )
          })}
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-tertiary)' }} />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder={visao === 'bairros' ? 'Buscar bairro ou igreja...' : 'Buscar membro, igreja ou cargo...'}
            className="input-dark w-full pl-9 pr-3 py-2.5"
            style={{ fontSize: 13 }}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { id: 'todas', label: 'Separadas (AD + outras)' },
            { id: 'ad', label: 'Só AD / ADBLU' },
            { id: 'outras', label: 'Só outras' },
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltroDenom(f.id)}
              className="px-3 py-1.5 rounded-xl font-semibold transition-all"
              style={{
                fontSize: 11,
                background: filtroDenom === f.id ? 'rgba(37,99,235,0.25)' : 'rgba(255,255,255,0.05)',
                color: filtroDenom === f.id ? '#93c5fd' : 'var(--text-tertiary)',
                border: filtroDenom === f.id ? '1px solid rgba(59,130,246,0.4)' : '1px solid transparent',
              }}
            >
              {f.label}
            </button>
          ))}
          {visao !== 'pessoas' && (
            <>
              <span className="w-px self-stretch" style={{ background: 'rgba(255,255,255,0.1)' }} />
              {[
                { id: 'todas', label: 'Todas' },
                { id: 'cobertas', label: 'Cobertas' },
                { id: 'descobertas', label: 'Sem cobertura' },
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltroCobertura(f.id)}
                  className="px-3 py-1.5 rounded-xl font-semibold transition-all"
                  style={{
                    fontSize: 11,
                    background: filtroCobertura === f.id ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)',
                    color: filtroCobertura === f.id ? '#34d399' : 'var(--text-tertiary)',
                    border: filtroCobertura === f.id ? '1px solid rgba(16,185,129,0.4)' : '1px solid transparent',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </>
          )}
        </div>

        {visao === 'pessoas' && (
          <>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'cargo_igreja', label: 'Cargos na igreja' },
                { id: 'com_igreja', label: 'Rede (igreja/cargo)' },
                { id: 'sem_igreja', label: 'Fora da rede' },
                { id: 'todos', label: 'Todos membros' },
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltro(f.id)}
                  className="px-3 py-1.5 rounded-xl font-semibold transition-all"
                  style={{
                    fontSize: 11,
                    background: filtro === f.id ? 'rgba(14,116,144,0.35)' : 'rgba(255,255,255,0.05)',
                    color: filtro === f.id ? '#67e8f9' : 'var(--text-tertiary)',
                    border: filtro === f.id ? '1px solid rgba(34,211,238,0.45)' : '1px solid transparent',
                  }}
                >
                  {f.label}
                </button>
              ))}
              <span className="w-px self-stretch" style={{ background: 'rgba(255,255,255,0.1)' }} />
              {[
                { id: 'cargo_igreja', label: 'Por cargo na igreja', icon: Church },
                { id: 'igreja', label: 'Por igreja', icon: Church },
                { id: 'cargo', label: 'Por cargo campanha', icon: Briefcase },
              ].map(g => {
                const Icon = g.icon
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGrupoPessoas(g.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl font-semibold transition-all"
                    style={{
                      fontSize: 11,
                      background: grupoPessoas === g.id ? 'rgba(37,99,235,0.25)' : 'rgba(255,255,255,0.05)',
                      color: grupoPessoas === g.id ? '#93c5fd' : 'var(--text-tertiary)',
                      border: grupoPessoas === g.id ? '1px solid rgba(59,130,246,0.4)' : '1px solid transparent',
                    }}
                  >
                    <Icon size={11} /> {g.label}
                  </button>
                )
              })}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select value={filtroIgreja} onChange={e => setFiltroIgreja(e.target.value)}
                className="input-dark w-full px-3 py-2" style={{ fontSize: 12, background: 'var(--bg-raised)' }}>
                {igrejasOpts.map(i => <option key={i} value={i}>{i === 'Todas' ? 'Todas as igrejas' : i}</option>)}
              </select>
              <select value={filtroCargoIgreja} onChange={e => setFiltroCargoIgreja(e.target.value)}
                className="input-dark w-full px-3 py-2" style={{ fontSize: 12, background: 'var(--bg-raised)' }}>
                {cargosIgrejaOpts.map(c => (
                  <option key={c} value={c}>{c === 'Todos' ? 'Todos os cargos na igreja' : c}</option>
                ))}
              </select>
              <select value={filtroCargo} onChange={e => setFiltroCargo(e.target.value)}
                className="input-dark w-full px-3 py-2" style={{ fontSize: 12, background: 'var(--bg-raised)' }}>
                {cargosOpts.map(c => <option key={c} value={c}>{c === 'Todos' ? 'Todos os cargos campanha' : c}</option>)}
              </select>
            </div>
          </>
        )}
      </div>

      {/* VISÃO: COBERTURA POR IGREJA — AD e outras em blocos separados */}
      {visao === 'cobertura' && (
        linhasCobertura.length === 0 ? (
          <div className="rounded-3xl p-10 text-center"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <Church size={28} className="mx-auto mb-2" style={{ color: 'var(--text-faint)' }} />
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Nenhuma igreja neste filtro</p>
          </div>
        ) : (
          <div className="space-y-6">
            {secoesCobertura.map(sec => (
              <section key={sec.id} className="space-y-2">
                <div className="flex items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: sec.cor }} />
                    <h3 className="font-black truncate" style={{ fontSize: 13, color: sec.cor }}>{sec.titulo}</h3>
                  </div>
                  <span className="font-bold flex-shrink-0" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {sec.lista.length} igreja{sec.lista.length !== 1 ? 's' : ''}
                    {' · '}
                    {sec.lista.filter(i => i.coberta).length} coberta{sec.lista.filter(i => i.coberta).length !== 1 ? 's' : ''}
                  </span>
                </div>
                {sec.lista.length === 0 ? (
                  <div className="rounded-2xl px-4 py-6 text-center"
                    style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-subtle)' }}>
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Nenhuma igreja neste grupo</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sec.lista.map(renderIgrejaCard)}
                  </div>
                )}
              </section>
            ))}
          </div>
        )
      )}

      {/* VISÃO: POR BAIRRO */}
      {visao === 'bairros' && (
        bairrosFiltrados.length === 0 ? (
          <div className="rounded-3xl p-10 text-center"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <MapPin size={28} className="mx-auto mb-2" style={{ color: 'var(--text-faint)' }} />
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Nenhum bairro neste filtro</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bairrosFiltrados.map(b => {
              const corSetor = SETORES[b.setor] || '#64748b'
              const igrejasVisiveis = b.igrejas.filter(ig => {
                if (filtroDenom === 'ad' && !ig.ad) return false
                if (filtroDenom === 'outras' && ig.ad) return false
                if (filtroCobertura === 'cobertas' && !ig.coberta) return false
                if (filtroCobertura === 'descobertas' && ig.coberta) return false
                return true
              }).sort((a, c) => c.qtd - a.qtd || a.nome.localeCompare(c.nome, 'pt-BR'))
              return (
                <div key={b.setor} className="rounded-3xl overflow-hidden"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                  <div className="px-4 py-3"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: corSetor + '14' }}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin size={14} style={{ color: corSetor }} />
                        <p className="font-bold" style={{ fontSize: 14, color: corSetor }}>{b.setor}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="font-bold" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          {b.cobertas}/{b.total} cobertas · {b.pct}%
                        </span>
                        <span className="font-bold" style={{ fontSize: 11, color: '#93c5fd' }}>
                          {b.pessoas} pessoa{b.pessoas !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <div className="h-full rounded-full" style={{ width: `${b.pct}%`, background: corSetor }} />
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                      <span>AD: {b.adCobertas}/{b.ad}</span>
                      <span>Outras: {b.outrasCobertas}/{b.outras}</span>
                    </div>
                  </div>
                  <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    {(() => {
                      const adList = igrejasVisiveis.filter(ig => ig.ad)
                      const outrasList = igrejasVisiveis.filter(ig => !ig.ad)
                      const blocos = filtroDenom === 'ad'
                        ? [{ id: 'ad', titulo: 'AD / ADBLU', cor: '#60a5fa', lista: adList }]
                        : filtroDenom === 'outras'
                          ? [{ id: 'outras', titulo: 'Outras', cor: '#c4b5fd', lista: outrasList }]
                          : [
                              { id: 'ad', titulo: 'AD / ADBLU', cor: '#60a5fa', lista: adList },
                              { id: 'outras', titulo: 'Outras denominações', cor: '#c4b5fd', lista: outrasList },
                            ]
                      return blocos.filter(bl => bl.lista.length > 0 || filtroDenom === 'todas').map(bl => (
                        <div key={bl.id}>
                          {filtroDenom === 'todas' && (
                            <div className="px-4 py-2 flex items-center justify-between"
                              style={{ background: 'rgba(255,255,255,0.03)' }}>
                              <span className="font-bold" style={{ fontSize: 10, color: bl.cor }}>{bl.titulo}</span>
                              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{bl.lista.length}</span>
                            </div>
                          )}
                          {bl.lista.length === 0 ? (
                            <p className="px-4 py-3" style={{ fontSize: 11, color: 'var(--text-faint)' }}>Nenhuma neste bairro</p>
                          ) : bl.lista.map(ig => (
                            <div key={ig.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold truncate" style={{ fontSize: 12, color: 'var(--text-primary)' }}>{ig.nome}</p>
                                <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                  {ig.ad ? 'AD / ADBLU' : ig.denominacao}
                                  {' · '}
                                  {ig.coberta ? `${ig.qtd} na equipe` : 'sem cobertura'}
                                </p>
                              </div>
                              <span className="font-black flex-shrink-0" style={{
                                fontSize: 14,
                                color: ig.coberta ? '#34d399' : 'var(--text-faint)',
                              }}>
                                {ig.qtd}
                              </span>
                            </div>
                          ))}
                        </div>
                      ))
                    })()}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* VISÃO: PESSOAS */}
      {visao === 'pessoas' && (
        filtradosPessoas.length === 0 ? (
          <div className="rounded-3xl p-10 text-center"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <Users size={28} className="mx-auto mb-2" style={{ color: 'var(--text-faint)' }} />
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              {membros.length === 0
                ? 'Cadastre membros na aba Membros'
                : filtro === 'cargo_igreja'
                  ? 'Ninguém com cargo na igreja. Edite o membro e preencha “Cargo na igreja”.'
                  : filtro === 'com_igreja'
                    ? 'Nenhum membro na rede. Preencha igreja e/ou cargo na igreja no cadastro.'
                    : 'Nenhum membro neste filtro'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.keys(statsPessoas.porCargoIgreja).length > 0 && (
              <div className="rounded-3xl p-4"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <p className="font-bold mb-3 flex items-center gap-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  <Church size={12} /> Cargos eclesiásticos na equipe
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(statsPessoas.porCargoIgreja)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cargo, qtd]) => (
                      <button
                        key={cargo}
                        type="button"
                        onClick={() => { setFiltro('cargo_igreja'); setFiltroCargoIgreja(cargo); setGrupoPessoas('cargo_igreja') }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-bold"
                        style={{
                          fontSize: 11,
                          background: 'rgba(14,116,144,0.22)',
                          color: '#67e8f9',
                          border: filtroCargoIgreja === cargo ? '1px solid #22d3ee' : '1px solid transparent',
                        }}
                      >
                        {cargo} <span style={{ opacity: 0.8 }}>{qtd}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {gruposPessoas.map(({ titulo, lista }) => {
              const corTitulo = grupoPessoas === 'cargo'
                ? (CARGO_CORES[titulo] || '#94a3b8')
                : grupoPessoas === 'cargo_igreja'
                  ? (titulo.startsWith('Sem ') ? '#fbbf24' : '#67e8f9')
                  : (titulo.startsWith('Sem ') ? '#fbbf24' : '#a78bfa')
              return (
                <div key={titulo} className="rounded-3xl overflow-hidden"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                  <div className="px-4 py-3 flex items-center justify-between gap-2"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: corTitulo + '12' }}>
                    <div className="flex items-center gap-2 min-w-0">
                      {grupoPessoas === 'cargo'
                        ? <Briefcase size={14} style={{ color: corTitulo, flexShrink: 0 }} />
                        : <Church size={14} style={{ color: corTitulo, flexShrink: 0 }} />}
                      <p className="font-bold truncate" style={{ fontSize: 13, color: corTitulo }}>{titulo}</p>
                    </div>
                    <span className="flex items-center gap-1 flex-shrink-0 font-bold"
                      style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      <Users size={11} /> {lista.length}
                    </span>
                  </div>
                  <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    {lista.map(m => {
                      const cargo = normalizarCargo(m.cargo)
                      const cargoCor = CARGO_CORES[cargo] || '#94a3b8'
                      const ig = nomeIgrejaMembro(m)
                      const cargoIg = cargoEclesiastico(m)
                      return (
                        <div key={m.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold truncate" style={{ fontSize: 13, color: 'var(--text-primary)' }}>{m.nome}</p>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {cargoIg && grupoPessoas !== 'cargo_igreja' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold"
                                  style={{ fontSize: 10, background: 'rgba(14,116,144,0.22)', color: '#67e8f9' }}>
                                  <Church size={9} /> {cargoIg}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold"
                                style={{ fontSize: 10, background: cargoCor + '18', color: cargoCor }}>
                                <Briefcase size={9} /> {cargo}
                              </span>
                              {grupoPessoas !== 'igreja' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold"
                                  style={{
                                    fontSize: 10,
                                    background: ig ? 'rgba(167,139,250,0.15)' : 'rgba(245,158,11,0.12)',
                                    color: ig ? '#c4b5fd' : '#fbbf24',
                                  }}>
                                  {ig ? <><Church size={9} /> {ig}</> : <><AlertTriangle size={9} /> Sem igreja</>}
                                </span>
                              )}
                              {m.telefone && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
                                  style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                  <Phone size={9} /> {m.telefone}
                                </span>
                              )}
                            </div>
                          </div>
                          <button type="button" onClick={() => onEditar?.(m)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold flex-shrink-0 self-start sm:self-center"
                            style={{ fontSize: 11, background: 'rgba(37,99,235,0.16)', color: '#93c5fd' }}>
                            <Pencil size={12} /> Editar
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
