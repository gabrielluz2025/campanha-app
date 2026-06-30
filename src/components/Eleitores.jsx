import { useState, useEffect, useMemo, useRef } from 'react'
import { IGREJAS_BASE } from './MapaIgrejas'
import {
  Users, Upload, Search, X, Trash2, Link2,
  ChevronDown, ChevronUp, TrendingUp, Target,
  Award, FileText, MapPin, AlertCircle, BarChart2, Loader2,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell,
} from 'recharts'
import { confirmAction } from '../utils/confirm'
import { BAIRROS_BLUMENAU, COLEGIO_BAIRRO, normStr } from '../utils/constants'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href

const STORAGE_KEY = 'eleitores_data'
const STORAGE_KEY_METAS_ZONA = 'metas_zona'
const PALETA = ['#3b82f6','#06b6d4','#ec4899','#f97316','#10b981','#06b6d4','#f59e0b','#ef4444','#2563eb','#84cc16']
const SETORES = [...new Set(IGREJAS_BASE.map(ig => ig.setor))].sort()

function uid() { return Math.random().toString(36).slice(2, 10) }

async function extractTextFromPDF(file) {
  const buffer = await file.arrayBuffer()
  const pdf    = await getDocument({ data: new Uint8Array(buffer) }).promise
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map(item => item.str).join(' ') + '\n'
  }
  return text
}
function fmt(n) { return Number(n).toLocaleString('pt-BR') }
function fmtPct(v, t) { return t > 0 ? `${((v / t) * 100).toFixed(2)}%` : '0%' }

function totalLocal(local) { return local.secoes.reduce((s, c) => s + c.votos, 0) }
function totalZona(zona)   { return zona.locais.reduce((s, l) => s + totalLocal(l), 0) }

/* ─── Parser de texto do TRE ─────────────────────────────────── */
function parseTRE(text) {
  const linhas = text.split('\n').map(l => l.trim()).filter(Boolean)
  const d = { candidato: '', numero: '', partido: '', municipio: '',
               eleitoresAptos: 0, votosTotal: 0, municipios: [], zonas: [] }

  let zonaAtual   = null
  let localAtual  = null
  let municipioAtual = ''

  for (const linha of linhas) {
    // Candidato + número
    let m = linha.match(/CANDIDATO:\s*(.+?)\s{2,}N[ÚU]MERO:\s*(\d+)/i)
    if (m) { d.candidato = m[1].trim(); d.numero = m[2]; continue }

    // Partido
    m = linha.match(/^PARTIDO:\s*(.+)$/i)
    if (m) { d.partido = m[1].trim(); continue }

    // Município — atualiza o município corrente
    m = linha.match(/^MUNIC[ÍI]PIO:\s*(.+)$/i)
    if (m) {
      municipioAtual = m[1].trim()
      if (!d.municipios.includes(municipioAtual)) d.municipios.push(municipioAtual)
      if (!d.municipio) d.municipio = municipioAtual
      continue
    }

    // Eleitores aptos
    m = linha.match(/ELEITORES APTOS:\s*([\d.,]+)/i)
    if (m) { d.eleitoresAptos = parseInt(m[1].replace(/[.,]/g, '')); }

    // Votos recebidos
    m = linha.match(/VOTOS RECEBIDOS[^:]*:\s*([\d.,]+)/i)
    if (m) { d.votosTotal = parseInt(m[1].replace(/[.,]/g, '')); continue }

    // ZONA + LOCAL na mesma linha
    m = linha.match(/^ZONA:\s*(\d+)\s+LOCAL:\s*(.+)$/i)
    if (m) {
      const num = parseInt(m[1])
      let zona = d.zonas.find(z => z.zona === num)
      if (!zona) { zona = { zona: num, municipio: municipioAtual, locais: [] }; d.zonas.push(zona) }
      zonaAtual = zona
      localAtual = { id: uid(), nome: m[2].trim(), setor: null, secoes: [] }
      zonaAtual.locais.push(localAtual)
      continue
    }

    // Seções (VOTOS)
    m = linha.match(/^SEÇÕES?\s*\(VOTOS\):\s*(.+)$/i)
    if (m && localAtual) {
      for (const p of m[1].matchAll(/(\d+)\s*\((\d+)\)/g)) {
        localAtual.secoes.push({ secao: parseInt(p[1]), votos: parseInt(p[2]) })
      }
      continue
    }

    // Linha de continuação (só pares secao(votos))
    if (localAtual) {
      const pares = [...linha.matchAll(/(\d+)\s*\((\d+)\)/g)]
      if (pares.length > 0) {
        for (const p of pares) localAtual.secoes.push({ secao: parseInt(p[1]), votos: parseInt(p[2]) })
      }
    }
  }

  if (!d.municipio) d.municipio = 'BLUMENAU'
  if (d.municipios.length === 0) d.municipios.push(d.municipio)
  d.zonas.sort((a, b) => a.zona - b.zona)
  return d
}

/* ─── Componente principal ───────────────────────────────────── */
export default function Eleitores() {
  const [scData,       setScData]       = useState([])
  const [candDb,        setCandDb]        = useState([])
  const [buscaCand,     setBuscaCand]     = useState('')
  const [filtroCargo,   setFiltroCargo]   = useState('')
  const [filtroAno,     setFiltroAno]     = useState('')
  const [modalBuscaCand,setModalBuscaCand]= useState(false)
  const [tseLoading,    setTseLoading]    = useState(false)
  const [tseErro,       setTseErro]       = useState('')
  useEffect(() => {
    fetch('/locais_sc.json').then(r => r.json()).then(setScData).catch(() => {})
    fetch('/candidatos_sc.json').then(r => r.json()).then(setCandDb).catch(() => {})
  }, [])

  const [dados, setDados]         = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') } catch { return null }
  })
  const [view, setView]           = useState('geral')       // geral | locais | secoes | importar
  const [texto, setTexto]         = useState('')
  const [erro, setErro]           = useState('')
  const [filtroZona,   setFiltroZona]   = useState(null)
  const [filtroCidade, setFiltroCidade] = useState(null)
  const [busca, setBusca]         = useState('')
  const [expandido, setExpandido] = useState({})
  const [modalSetor, setModalSetor] = useState(null)        // id do local
  const [loading, setLoading]         = useState(false)
  const [nomeArq, setNomeArq]         = useState('')
  const fileRef                       = useRef(null)
  const [metasZona, setMetasZona]     = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_METAS_ZONA) || '{}') } catch { return {} }
  })
  const [metaGlobal, setMetaGlobal]   = useState(() => {
    try { return parseInt(localStorage.getItem('meta_global_votos') || '0') } catch { return 0 }
  })

  /* ── Auto-atribuição de bairros pelo lookup COLEGIO_BAIRRO ── */
  const _norms = useMemo(() =>
    Object.entries(COLEGIO_BAIRRO).map(([k, v]) => ({ n: normStr(k), b: v })), [])

  function autoAssign(d) {
    if (!d) return d
    let changed = false
    const novo = {
      ...d,
      zonas: d.zonas.map(z => {
        const mun = normStr(z.municipio || d.municipio || '')
        if (mun && mun !== normStr('BLUMENAU')) return z
        return {
          ...z,
          locais: z.locais.map(l => {
            if (l.setor) return l
            const nN = normStr(l.nome)
            const hit = _norms.find(x => x.n === nN)
            if (hit) { changed = true; return { ...l, setor: hit.b } }
            return l
          }),
        }
      }),
    }
    return changed ? novo : d
  }

  /* auto-atribuir quando dados carregam pela primeira vez */
  useEffect(() => {
    setDados(prev => {
      const atualizado = autoAssign(prev)
      if (atualizado !== prev) localStorage.setItem(STORAGE_KEY, JSON.stringify(atualizado))
      return atualizado
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* persistência */
  function salvar(d) { setDados(d); localStorage.setItem(STORAGE_KEY, JSON.stringify(d)) }
  function salvarMetasZona(m) { setMetasZona(m); localStorage.setItem(STORAGE_KEY_METAS_ZONA, JSON.stringify(m)) }
  function salvarMetaGlobal(m) { setMetaGlobal(m); localStorage.setItem('meta_global_votos', m.toString()) }

  function importar() {
    setErro('')
    try {
      const d = parseTRE(texto)
      if (d.zonas.length === 0) {
        setErro('Nenhum dado encontrado. Verifique se o texto está no formato do TRE (Votação por Seção).')
        return
      }
      // preservar setores já atribuídos
      if (dados) {
        for (const z of d.zonas) {
          for (const l of z.locais) {
            const ze = dados.zonas?.find(x => x.zona === z.zona)
            const le = ze?.locais?.find(x => x.nome === l.nome)
            if (le?.setor) l.setor = le.setor
          }
        }
      }
      salvar(autoAssign(d))
      setTexto('')
      setView('geral')
    } catch (e) {
      setErro('Erro ao processar: ' + e.message)
    }
  }

  async function limpar() {
    const ok = await confirmAction({
      title: 'Apagar dados eleitorais',
      message: 'Apagar TODOS os dados eleitorais importados? Esta ação não pode ser desfeita.',
      confirmLabel: 'Apagar tudo',
    })
    if (ok) {
      setDados(null)
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  async function handlePDF(file) {
    if (!file || file.type !== 'application/pdf') return
    setLoading(true)
    setErro('')
    setNomeArq(file.name)
    try {
      const txt = await extractTextFromPDF(file)
      setTexto(txt)
    } catch (e) {
      setErro('Erro ao ler o PDF: ' + e.message)
      setNomeArq('')
    } finally {
      setLoading(false)
    }
  }

  function atribuirSetor(localId, setor) {
    const novo = {
      ...dados,
      zonas: dados.zonas.map(z => ({
        ...z, locais: z.locais.map(l => l.id === localId ? { ...l, setor } : l),
      })),
    }
    salvar(novo)
    setModalSetor(null)
  }

  /* ── Cidades disponíveis nos dados importados ─────────────── */
  const cidadesDisponiveis = useMemo(() => {
    if (!dados?.zonas) return []
    const set = new Set(dados.zonas.map(z => z.municipio || dados.municipio || 'BLUMENAU').filter(Boolean))
    return [...set].sort()
  }, [dados])

  /* ── Bairros disponíveis para a cidade filtrada ─────────────── */
  const bairrosDaCidade = useMemo(() => {
    const cidade = filtroCidade || (cidadesDisponiveis.length === 1 ? cidadesDisponiveis[0] : null)
    if (!cidade) return BAIRROS_BLUMENAU
    if (normStr(cidade) === normStr('BLUMENAU')) return BAIRROS_BLUMENAU
    const bairros = [...new Set(
      scData.filter(r => normStr(r.m) === normStr(cidade)).map(r => r.b)
    )].filter(Boolean).sort()
    return bairros.length > 0 ? bairros : []
  }, [scData, filtroCidade, cidadesDisponiveis])

  /* ── Zonas filtradas por cidade ─────────────────────────────── */
  const zonasFiltradas = useMemo(() => {
    if (!dados?.zonas) return []
    if (!filtroCidade) return dados.zonas
    return dados.zonas.filter(z => (z.municipio || dados.municipio || '') === filtroCidade)
  }, [dados, filtroCidade])

  const cargosDisponiveis = useMemo(() => [...new Set(candDb.map(c => c.c))].filter(Boolean).sort(), [candDb])
  const anosDisponiveis   = useMemo(() => [...new Set(candDb.map(c => String(c.a)))].sort((a,b)=>b-a), [candDb])

  const candFiltrados = useMemo(() => {
    if (!buscaCand.trim() && !filtroCargo && !filtroAno) return []
    const q = buscaCand.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    return candDb.filter(c => {
      if (filtroCargo && c.c !== filtroCargo) return false
      if (filtroAno  && String(c.a) !== filtroAno) return false
      if (q) {
        const nm = (c.nm||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        const ur = (c.u||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        const nu = (c.n||'')
        if (!nm.includes(q) && !ur.includes(q) && !nu.includes(q)) return false
      }
      return true
    }).slice(0, 50)
  }, [candDb, buscaCand, filtroCargo, filtroAno])

  async function aplicarCandidato(cand) {
    const base = {
      candidato:      cand.nm,
      numero:         cand.n,
      partido:        cand.p,
      partidoCompleto: cand.mp,
      cargo:          cand.c,
      municipio:      cand.m,
      urna:           cand.u,
      situacao:       cand.s,
      ano:            cand.a,
      foto:           cand.foto || null,
      zonas:          [],
      eleitoresAptos: 0,
      votosTotal:     0,
      municipios:     [],
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(base))
    setDados(base)
    setModalBuscaCand(false)
    setBuscaCand('')
    setTseErro('')
    // Só busca TSE para cargos suportados
    const cargosSuportados = ['DEPUTADO FEDERAL','DEPUTADO ESTADUAL','SENADOR','GOVERNADOR','VEREADOR','PREFEITO']
    if (!cargosSuportados.includes((cand.c||'').toUpperCase())) return
    setTseLoading(true)
    try {
      const params = new URLSearchParams({ numero: cand.n, cargo: cand.c, ano: cand.a })
      const res = await fetch(`/.netlify/functions/tse-proxy?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const tseData = await res.json()
      if (tseData.error) throw new Error(tseData.error)
      const completo = {
        ...base,
        candidato:      tseData.candidato || base.candidato,
        urna:           tseData.urna      || base.urna,
        partido:        tseData.partido   || base.partido,
        situacao:       tseData.situacao  || base.situacao,
        municipio:      tseData.municipio || base.municipio,
        municipios:     tseData.municipios || [],
        zonas:          tseData.zonas      || [],
        eleitoresAptos: tseData.eleitoresAptos || 0,
        votosTotal:     tseData.votosTotal || 0,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(completo))
      setDados(completo)
    } catch (err) {
      console.error('Erro ao buscar TSE:', err)
      setTseErro(`Não foi possível buscar dados do TSE: ${err.message}`)
    } finally {
      setTseLoading(false)
    }
  }

  /* derivados */
  const locaisFlat = useMemo(() => {
    return zonasFiltradas.flatMap(z =>
      z.locais.map(l => ({ ...l, zonaNum: z.zona, municipio: z.municipio || dados?.municipio, totalVotos: totalLocal(l), numSecoes: l.secoes.length }))
    ).sort((a, b) => b.totalVotos - a.totalVotos)
  }, [zonasFiltradas, dados])

  const votosPorZona = useMemo(() => {
    return zonasFiltradas.map(z => ({
      zona: z.zona, name: `Zona ${z.zona}`,
      totalVotos: totalZona(z), numLocais: z.locais.length,
      numSecoes: z.locais.reduce((s, l) => s + l.secoes.length, 0),
    })).sort((a, b) => b.totalVotos - a.totalVotos)
  }, [zonasFiltradas])

  const locaisFiltrados = useMemo(() =>
    locaisFlat
      .filter(l => !filtroZona || l.zonaNum === filtroZona)
      .filter(l => !busca || l.nome.toLowerCase().includes(busca.toLowerCase())),
    [locaisFlat, filtroZona, busca])

  const todasSecoes = useMemo(() =>
    locaisFlat
      .flatMap(l => l.secoes.map(s => ({ ...s, local: l.nome, zonaNum: l.zonaNum, localId: l.id })))
      .sort((a, b) => b.votos - a.votos),
    [locaisFlat])

  const totalVotos     = locaisFlat.reduce((s, l) => s + l.totalVotos, 0)
  const eleitoresAptos = useMemo(() => {
    if (filtroCidade && scData.length > 0) {
      const nf = normStr(filtroCidade)
      return scData.filter(r => normStr(r.m) === nf).reduce((s, r) => s + (r.e || 0), 0)
    }
    return dados?.eleitoresAptos || 0
  }, [filtroCidade, scData, dados])
  const numSemSetor    = locaisFlat.filter(l => !l.setor).length

  // Zone goals comparison
  const zonasComMeta = useMemo(() => {
    if (!dados) return []
    return zonasFiltradas.map(z => {
      const votos = totalZona(z)
      const meta = metasZona[z.zona] || 0
      const pct = meta > 0 ? (votos / meta) * 100 : 0
      const status = meta === 0 ? 'sem_meta' : pct >= 100 ? 'atingida' : pct >= 80 ? 'boa' : pct >= 50 ? 'alerta' : 'critica'
      return { zona: z.zona, votos, meta, pct, status }
    }).sort((a, b) => b.pct - a.pct)
  }, [dados, metasZona])

  // Global goal comparison
  const metaGlobalPct = useMemo(() => {
    if (metaGlobal === 0) return 0
    return (totalVotos / metaGlobal) * 100
  }, [totalVotos, metaGlobal])

  // Alerts
  const alertas = useMemo(() => {
    const alerts = []
    if (metaGlobal > 0 && metaGlobalPct < 50) {
      alerts.push({ tipo: 'critico', msg: `Meta global (${fmt(metaGlobal)} votos) com menos de 50% atingida` })
    } else if (metaGlobal > 0 && metaGlobalPct < 80) {
      alerts.push({ tipo: 'alerta', msg: `Meta global (${fmt(metaGlobal)} votos) com menos de 80% atingida` })
    }
    zonasComMeta.forEach(z => {
      if (z.meta > 0 && z.pct < 50) {
        alerts.push({ tipo: 'critico', msg: `Zona ${z.zona}: apenas ${z.pct.toFixed(1)}% da meta (${fmt(z.meta)} votos)` })
      } else if (z.meta > 0 && z.pct < 80) {
        alerts.push({ tipo: 'alerta', msg: `Zona ${z.zona}: ${z.pct.toFixed(1)}% da meta (${fmt(z.meta)} votos)` })
      }
    })
    return alerts.slice(0, 5) // mostrar no máximo 5 alertas
  }, [metaGlobal, metaGlobalPct, zonasComMeta])
  const top10          = locaisFlat.slice(0, 10)

  const VIEWS = [
    { id: 'geral',    label: 'Visão Geral' },
    { id: 'locais',   label: 'Por Local'   },
    { id: 'secoes',   label: 'Por Seção'   },
    { id: 'importar', label: 'Importar'    },
  ]

  return (
    <div className="flex-1 overflow-auto" style={{ background: '#08080d' }}>

      {/* ── Modal: atribuir setor ──────────────────────────── */}
      {modalSetor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-sm rounded-3xl overflow-hidden srf"
            style={{ boxShadow: '0 24px 80px rgba(0,0,0,0.28)' }}>
            <div className="flex items-center justify-between px-6 py-4"
              style={{ background: 'linear-gradient(135deg,#1e3a8a,#1e40af)' }}>
              <div className="flex items-center gap-2">
                <Link2 size={17} className="text-white" />
                <h3 className="font-bold text-white" style={{ fontSize: 14 }}>Atribuir Bairro</h3>
              </div>
              <button onClick={() => setModalSetor(null)} className="p-1.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                <X size={16} />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="txt-3 mb-4" style={{ fontSize: 12 }}>
                Selecione o bairro de Blumenau onde fica este local de votação.
              </p>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                <button onClick={() => atribuirSetor(modalSetor, null)}
                  className="w-full text-left px-4 py-2.5 rounded-xl font-semibold hov-srf transition-all"
                  style={{ fontSize: 13, color: 'rgba(203,213,235,0.45)', border: '1.5px solid rgba(255,255,255,0.12)' }}>
                  Sem bairro atribuído
                </button>
                {bairrosDaCidade.map(b => (
                  <button key={b} onClick={() => atribuirSetor(modalSetor, b)}
                    className="w-full text-left px-4 py-2.5 rounded-xl font-semibold hov-srf transition-all"
                    style={{ fontSize: 13, color: 'var(--accent-bright)', border: '1.5px solid rgba(91,155,255,0.25)' }}>
                    {b}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: busca de candidato ──────────────────── */}
      {modalBuscaCand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-lg rounded-3xl overflow-hidden"
            style={{ background: '#141420', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
            <div className="flex items-center justify-between px-5 py-4"
              style={{ background: 'linear-gradient(135deg,#1e3a8a,#1e40af)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-2">
                <Search size={15} className="text-white" />
                <h3 className="font-bold text-white" style={{ fontSize: 14 }}>Buscar Candidato — SC 2022 / 2024</h3>
              </div>
              <button onClick={() => setModalBuscaCand(false)} className="p-1.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.15)' }}>
                <X size={14} className="text-white" />
              </button>
            </div>
            <div className="px-5 py-4">
              <div className="flex gap-2 mb-3">
                <select value={filtroAno} onChange={e => setFiltroAno(e.target.value)}
                  className="rounded-xl px-3 py-2 text-xs font-semibold outline-none"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#60a5fa' }}>
                  <option value="">Todos os anos</option>
                  {anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select value={filtroCargo} onChange={e => setFiltroCargo(e.target.value)}
                  className="flex-1 rounded-xl px-3 py-2 text-xs font-semibold outline-none"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#60a5fa' }}>
                  <option value="">Todos os cargos</option>
                  {cargosDisponiveis.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2 px-3 rounded-xl mb-3"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', height: 40 }}>
                <Search size={13} style={{ color: 'rgba(203,213,235,0.4)' }} />
                <input autoFocus value={buscaCand} onChange={e => setBuscaCand(e.target.value)}
                  placeholder="Nome, nome de urna ou número…"
                  className="flex-1 bg-transparent outline-none"
                  style={{ fontSize: 13, color: '#e2e8f0' }} />
                {buscaCand && <button onClick={() => setBuscaCand('')}><X size={11} style={{ color: 'rgba(203,213,235,0.4)' }} /></button>}
              </div>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {candFiltrados.length === 0 && (buscaCand.trim() || filtroCargo || filtroAno) && (
                  <p className="text-center py-6" style={{ fontSize: 12, color: 'rgba(203,213,235,0.3)' }}>Nenhum candidato encontrado</p>
                )}
                {candFiltrados.length === 0 && !buscaCand.trim() && !filtroCargo && !filtroAno && (
                  <p className="text-center py-6" style={{ fontSize: 12, color: 'rgba(203,213,235,0.3)' }}>Digite o nome ou número para buscar</p>
                )}
                {candFiltrados.map((c, i) => (
                  <button key={i} onClick={() => aplicarCandidato(c)}
                    className="w-full text-left px-4 py-3 rounded-2xl transition-all"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                    onMouseEnter={e => e.currentTarget.style.background='rgba(37,99,235,0.2)'}
                    onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.05)'}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold" style={{ fontSize: 13, color: '#e2e8f0' }}>{c.nm}</p>
                        <p style={{ fontSize: 10, color: 'rgba(203,213,235,0.45)', marginTop: 1 }}>
                          {c.u && c.u !== c.nm ? `"${c.u}" · ` : ''}{c.c} · {c.m} · {c.a}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="font-black" style={{ fontSize: 14, color: '#60a5fa' }}>Nº {c.n}</p>
                        <p className="font-semibold" style={{ fontSize: 10, color: '#a78bfa' }}>{c.p}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Banner: carregando TSE ─────────────────────────── */}
      {tseLoading && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl"
          style={{ background: '#1e40af', border: '1px solid rgba(99,102,241,0.5)', minWidth: 260 }}>
          <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin flex-shrink-0" />
          <span className="text-white font-semibold" style={{ fontSize: 13 }}>Buscando dados do TSE...</span>
        </div>
      )}
      {tseErro && !tseLoading && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl"
          style={{ background: '#7f1d1d', border: '1px solid rgba(239,68,68,0.5)', minWidth: 260, maxWidth: 400 }}>
          <span className="text-white" style={{ fontSize: 12 }}>{tseErro}</span>
          <button onClick={() => setTseErro('')} className="ml-auto flex-shrink-0"><X size={13} className="text-white" /></button>
        </div>
      )}

      {/* ── Hero Header ───────────────────────────────────── */}
      <div className="px-4 md:px-6 pt-7 pb-16"
        style={{ background: 'linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 60%,#1e40af 100%)' }}>
        <div className="max-w-7xl mx-auto">

          <div className="flex items-center justify-between mb-7">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.18)', width: 52, height: 52 }}>
                {dados?.candidato ? (
                  <div className="w-full h-full flex items-center justify-center font-black text-white"
                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', fontSize: 18 }}>
                    {dados.candidato.split(' ').filter(Boolean).slice(0,2).map(n => n[0]).join('').toUpperCase()}
                  </div>
                ) : (
                  <Users size={26} className="text-white" />
                )}
              </div>
              <div>
                <h1 className="font-black text-white" style={{ fontSize: 24 }}>Eleitores</h1>
                <p className="text-blue-200 mt-0.5" style={{ fontSize: 12 }}>
                  {dados
                    ? `${dados.candidato || '—'} · Nº ${dados.numero || '—'} · ${dados.partido || '—'}${dados.cargo ? ` · ${dados.cargo}` : ''}${dados.ano ? ` · ${dados.ano}` : ''}${dados.urna && dados.urna !== dados.candidato ? ` · "${dados.urna}"` : ''}${dados.situacao ? ` · ${dados.situacao}` : ''}${filtroCidade ? ` · ${filtroCidade}` : dados.municipios?.length > 1 ? ` · ${dados.municipios.length} cidades` : ` · ${dados.municipio}`}`
                    : 'Importe os dados do TRE para análise e cruzamento'}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <button onClick={() => setModalBuscaCand(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-white"
                style={{ background: 'rgba(99,102,241,0.35)', border: '1px solid rgba(99,102,241,0.55)', fontSize: 12 }}>
                <Search size={14} /> Buscar Candidato
              </button>
              {dados && (
                <button onClick={limpar}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-semibold text-white"
                  style={{ background: 'rgba(239,68,68,0.28)', border: '1px solid rgba(239,68,68,0.4)', fontSize: 12 }}>
                  <Trash2 size={14} /> Limpar
                </button>
              )}
              <button onClick={() => setView('importar')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-white"
                style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', fontSize: 13 }}>
                <Upload size={15} /> Importar Dados
              </button>
            </div>
          </div>

          {/* KPIs */}
          {dados ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Votos Recebidos', value: fmt(totalVotos),          icon: Award,     cor: '#60a5fa',
                  sub: `${fmtPct(totalVotos, eleitoresAptos)} dos aptos` },
                { label: 'Eleitores Aptos', value: fmt(eleitoresAptos),      icon: Users,     cor: '#34d399',
                  sub: filtroCidade || (dados.municipios?.length > 1 ? `${dados.municipios.length} cidades` : dados.municipio) },
                { label: 'Locais de Votação', value: fmt(locaisFlat.length), icon: MapPin,    cor: '#fb923c',
                  sub: `${dados.zonas.length} zonas eleitorais` },
                { label: 'Seções Eleitorais', value: fmt(todasSecoes.length), icon: Target,   cor: '#a78bfa',
                  sub: 'seções com votos' },
              ].map(({ label, value, icon: Icon, cor, sub }) => (
                <div key={label} className="rounded-2xl px-4 py-4"
                  style={{ background: 'rgba(255,255,255,0.11)', border: '1px solid rgba(255,255,255,0.14)' }}>
                  <div className="w-8 h-8 rounded-xl mb-3 flex items-center justify-center"
                    style={{ backgroundColor: cor + '33' }}>
                    <Icon size={15} style={{ color: cor }} />
                  </div>
                  <p className="font-black text-white" style={{ fontSize: 26, lineHeight: 1 }}>{value}</p>
                  <p className="text-blue-200 mt-1" style={{ fontSize: 11 }}>{label}</p>
                  <p className="text-blue-300" style={{ fontSize: 10 }}>{sub}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl px-6 py-10 text-center"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.14)' }}>
              <FileText size={34} className="mx-auto mb-3 text-blue-300" />
              <p className="font-bold text-white" style={{ fontSize: 15 }}>Nenhum dado importado ainda</p>
              <p className="text-blue-200 mt-1" style={{ fontSize: 12 }}>
                Abra o PDF do TRE · "Votação do Candidato por Seção" · copie o texto e importe aqui
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 pb-10 -mt-10 space-y-5">

        {/* ── Filtro de cidade ─────────────────────────────── */}
        {dados && cidadesDisponiveis.length > 1 && (
          <div className="srf rounded-3xl px-3 py-2 flex gap-2 overflow-x-auto"
            style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
            <button onClick={() => { setFiltroCidade(null); setFiltroZona(null) }}
              className="px-3 py-2 rounded-xl font-semibold flex-shrink-0 transition-all"
              style={{ fontSize: 12, background: !filtroCidade ? '#1d4ed8' : 'rgba(255,255,255,0.07)', color: !filtroCidade ? '#fff' : 'rgba(203,213,235,0.6)' }}>
              Todas ({cidadesDisponiveis.length})
            </button>
            {cidadesDisponiveis.map(c => (
              <button key={c} onClick={() => { setFiltroCidade(c); setFiltroZona(null) }}
                className="px-3 py-2 rounded-xl font-semibold flex-shrink-0 transition-all"
                style={{ fontSize: 12, background: filtroCidade === c ? '#1d4ed8' : 'rgba(255,255,255,0.07)', color: filtroCidade === c ? '#fff' : 'rgba(203,213,235,0.6)' }}>
                {c}
              </button>
            ))}
          </div>
        )}

        {/* Tab bar */}
        <div className="srf rounded-3xl p-2 flex gap-2"
          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
          {VIEWS.map(t => (
            <button key={t.id} onClick={() => setView(t.id)}
              className="flex-1 py-2.5 rounded-2xl font-bold transition-all"
              style={{
                fontSize: 13,
                background: view === t.id ? '#1d4ed8' : 'transparent',
                color:      view === t.id ? '#fff'    : 'rgba(203,213,235,0.60)',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ─── IMPORTAR ──────────────────────────────────── */}
        {view === 'importar' && (
          <div className="srf rounded-3xl p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
            <div className="flex items-center gap-2 mb-5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.16)' }}>
                <Upload size={16} style={{ color: '#1d4ed8' }} />
              </div>
              <div>
                <h2 className="font-bold txt-1" style={{ fontSize: 14 }}>Importar Dados do TRE</h2>
                <p className="txt-3" style={{ fontSize: 11 }}>Cole o texto do PDF "Votação do Candidato por Seção"</p>
              </div>
            </div>

            {/* Input de arquivo oculto */}
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={e => { if (e.target.files[0]) handlePDF(e.target.files[0]); e.target.value = '' }}
            />

            {/* Zona de upload */}
            <div
              className="rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all mb-5"
              style={{ border: '2px dashed #bfdbfe', background: loading ? 'rgba(37,99,235,0.16)' : '#f0f9ff',
                       minHeight: 130, padding: '24px 16px' }}
              onClick={() => !loading && fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handlePDF(f) }}
            >
              {loading ? (
                <>
                  <Loader2 size={30} className="text-blue-400 mb-2 animate-spin" />
                  <p className="font-bold text-blue-700" style={{ fontSize: 13 }}>Lendo o PDF...</p>
                  <p className="text-blue-400 mt-0.5" style={{ fontSize: 11 }}>{nomeArq}</p>
                </>
              ) : nomeArq ? (
                <>
                  <FileText size={30} className="text-blue-500 mb-2" />
                  <p className="font-bold text-blue-700 text-center" style={{ fontSize: 13 }}>{nomeArq}</p>
                  <p className="text-blue-400 mt-0.5" style={{ fontSize: 11 }}>Texto extraído ✓  · clique para trocar o arquivo</p>
                </>
              ) : (
                <>
                  <Upload size={30} className="text-blue-300 mb-2" />
                  <p className="font-bold text-blue-700" style={{ fontSize: 14 }}>Clique ou arraste o PDF aqui</p>
                  <p className="text-blue-400 mt-1" style={{ fontSize: 11 }}>
                    PDF &quot;Votação do Candidato por Seção&quot; do TRE-SC
                  </p>
                </>
              )}
            </div>

            {/* Divisor */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1" style={{ height: 1, background: 'rgba(255,255,255,0.12)' }} />
              <span className="font-semibold txt-3" style={{ fontSize: 11 }}>ou cole o texto manualmente</span>
              <div className="flex-1" style={{ height: 1, background: 'rgba(255,255,255,0.12)' }} />
            </div>

            <textarea
              value={texto}
              onChange={e => { setTexto(e.target.value); setErro('') }}
              placeholder="O texto do PDF aparece aqui automaticamente após o upload.&#10;Você também pode colar manualmente (Ctrl+C no PDF → Ctrl+V aqui)."
              rows={8}
              className="w-full rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
              style={{ fontSize: 12, border: '1.5px solid rgba(255,255,255,0.12)', fontFamily: 'monospace' }}
            />

            {erro && (
              <div className="mt-3 flex items-start gap-2 px-4 py-3 rounded-2xl"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1.5px solid #fecaca' }}>
                <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-red-600" style={{ fontSize: 12 }}>{erro}</p>
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button onClick={() => { setTexto(''); setErro(''); setNomeArq('') }}
                className="px-5 py-2.5 rounded-2xl font-semibold text-sm"
                style={{ border: '1.5px solid rgba(255,255,255,0.12)', color: 'rgba(203,213,235,0.60)' }}>
                Limpar
              </button>
              <button onClick={importar} disabled={!texto.trim()}
                className="flex-1 py-2.5 rounded-2xl font-bold text-white disabled:opacity-40 transition-all"
                style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)',
                         boxShadow: '0 4px 14px rgba(79,70,229,0.35)' }}>
                Processar e Importar
              </button>
            </div>
          </div>
        )}

        {/* ─── Sem dados (views não-importar) ─────────────── */}
        {view !== 'importar' && !dados && (
          <div className="srf rounded-3xl p-14 text-center"
            style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
            <FileText size={40} className="mx-auto mb-4 text-blue-200" />
            <p className="font-bold txt-2" style={{ fontSize: 16 }}>Nenhum dado eleitoral importado</p>
            <p className="txt-3 mt-2 mb-5" style={{ fontSize: 13 }}>
              Importe o relatório "Votação por Seção" do TRE para análise
            </p>
            <button onClick={() => setView('importar')}
              className="inline-flex items-center gap-2 font-bold text-white px-6 py-3 rounded-2xl"
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)',
                       boxShadow: '0 4px 14px rgba(79,70,229,0.35)', fontSize: 13 }}>
              <Upload size={16} /> Importar Dados do TRE
            </button>
          </div>
        )}

        {/* ─── VISÃO GERAL ────────────────────────────────── */}
        {view === 'geral' && dados && (
          <>
            {/* Alerts */}
            {alertas.length > 0 && (
              <div className="srf rounded-3xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.16)' }}>
                    <AlertCircle size={16} style={{ color: '#d97706' }} />
                  </div>
                  <div>
                    <h3 className="font-bold txt-1" style={{ fontSize: 14 }}>Alertas de Meta</h3>
                    <p className="txt-3" style={{ fontSize: 11 }}>{alertas.length} alerta{alertas.length > 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {alertas.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 rounded-xl"
                      style={{ background: a.tipo === 'critico' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)', border: `1px solid ${a.tipo === 'critico' ? '#fecaca' : 'rgba(245,158,11,0.30)'}` }}>
                      <AlertCircle size={14} style={{ color: a.tipo === 'critico' ? '#ef4444' : '#f59e0b', flexShrink: 0, marginTop: 1 }} />
                      <p className="txt-2" style={{ fontSize: 12 }}>{a.msg}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Global Goal Input */}
            <div className="srf rounded-3xl p-5" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.22)' }}>
                  <Target size={16} style={{ color: '#1d4ed8' }} />
                </div>
                <div>
                  <h3 className="font-bold txt-1" style={{ fontSize: 14 }}>Meta Global de Votos</h3>
                  <p className="txt-3" style={{ fontSize: 11 }}>Defina a meta total para a eleição</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'rgba(203,213,235,0.60)' }}>Meta total</label>
                  <input
                    type="number"
                    value={metaGlobal || ''}
                    onChange={e => salvarMetaGlobal(parseInt(e.target.value) || 0)}
                    className="w-full rounded-xl px-3 py-2 font-bold"
                    style={{ fontSize: 13, border: '1.5px solid rgba(255,255,255,0.12)' }}
                  />
                </div>
                <div className="flex-1">
                  <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'rgba(203,213,235,0.60)' }}>Progresso</label>
                  <div className="rounded-xl px-3 py-2 font-bold"
                    style={{ fontSize: 13, background: metaGlobalPct >= 100 ? 'rgba(16,185,129,0.18)' : metaGlobalPct >= 80 ? 'rgba(37,99,235,0.22)' : metaGlobalPct >= 50 ? 'rgba(245,158,11,0.16)' : 'rgba(239,68,68,0.22)', color: metaGlobalPct >= 100 ? '#6ee7b7' : metaGlobalPct >= 80 ? '#1e40af' : metaGlobalPct >= 50 ? '#fcd34d' : '#fca5a5' }}>
                    {metaGlobal > 0 ? `${metaGlobalPct.toFixed(1)}% (${fmt(totalVotos)} / ${fmt(metaGlobal)})` : 'Defina uma meta'}
                  </div>
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* Votos por zona */}
              <div className="srf rounded-3xl p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.16)' }}>
                    <BarChart2 size={16} style={{ color: '#1d4ed8' }} />
                  </div>
                  <div>
                    <h2 className="font-bold txt-1" style={{ fontSize: 14 }}>Votos por Zona Eleitoral</h2>
                    <p className="txt-3" style={{ fontSize: 11 }}>{dados.zonas.length} zonas · total {fmt(totalVotos)} votos</p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={votosPorZona} barCategoryGap="40%">
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'rgba(203,213,235,0.45)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'rgba(203,213,235,0.45)' }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v) => [fmt(v), 'Votos']}
                      contentStyle={{ borderRadius: 12, border: 'none',
                                      boxShadow: '0 4px 20px rgba(0,0,0,0.15)', fontSize: 12 }} />
                    <Bar dataKey="totalVotos" radius={[8, 8, 0, 0]}>
                      {votosPorZona.map((_, i) => <Cell key={i} fill={PALETA[i % PALETA.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-3 space-y-1.5">
                  {votosPorZona.map((z, i) => (
                    <div key={z.zona} className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: 'rgba(203,213,235,0.60)' }}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PALETA[i % PALETA.length] }} />
                        {z.name}
                      </span>
                      <span className="font-bold" style={{ fontSize: 12, color: PALETA[i % PALETA.length] }}>
                        {fmt(z.totalVotos)} votos · {fmtPct(z.totalVotos, totalVotos)} · {z.numLocais} locais · {z.numSecoes} seções
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top 10 locais */}
              <div className="srf rounded-3xl p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.16)' }}>
                    <Award size={16} style={{ color: '#1d4ed8' }} />
                  </div>
                  <div>
                    <h2 className="font-bold txt-1" style={{ fontSize: 14 }}>Top 10 Locais por Votos</h2>
                    <p className="txt-3" style={{ fontSize: 11 }}>Locais que mais renderam votos</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {top10.map((l, i) => {
                    const pct = totalVotos > 0 ? (l.totalVotos / totalVotos) * 100 : 0
                    const cor = PALETA[i % PALETA.length]
                    return (
                      <div key={l.id}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="flex items-center gap-1.5 truncate pr-2" style={{ fontSize: 11, color: 'rgba(235,240,255,0.92)' }}>
                            <span className="font-black flex-shrink-0" style={{ color: cor, fontSize: 12, minWidth: 18 }}>{i + 1}</span>
                            {l.nome.length > 38 ? l.nome.slice(0, 38) + '…' : l.nome}
                          </span>
                          <span className="font-bold flex-shrink-0" style={{ fontSize: 11, color: cor }}>{fmt(l.totalVotos)}</span>
                        </div>
                        <div className="w-full rounded-full" style={{ height: 5, background: 'rgba(255,255,255,0.07)' }}>
                          <div className="h-full rounded-full"
                            style={{ width: `${(pct / top10[0] ? (l.totalVotos / top10[0].totalVotos) * 100 : pct)}%`,
                                     background: `linear-gradient(90deg,${cor},${cor}bb)` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Atribuição de bairros — todos os locais com select inline */}
            {locaisFlat.length > 0 && (
              <div className="srf rounded-3xl p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ background: numSemSetor > 0 ? '#fff7ed' : 'rgba(16,185,129,0.12)' }}>
                      <Link2 size={16} style={{ color: numSemSetor > 0 ? '#f97316' : '#10b981' }} />
                    </div>
                    <div>
                      <h2 className="font-bold txt-1" style={{ fontSize: 14 }}>Atribuição de Bairros</h2>
                      <p className="txt-3" style={{ fontSize: 11 }}>
                        Selecione o bairro de cada colégio para exibir no Mapa Eleitoral
                      </p>
                    </div>
                  </div>
                  {numSemSetor > 0 && (
                    <span className="px-3 py-1 rounded-full font-bold"
                      style={{ fontSize: 11, background: '#fff7ed', color: '#f97316' }}>
                      {numSemSetor} sem bairro
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto pr-1">
                  {locaisFlat.map(l => (
                    <div key={l.id} className="rounded-2xl px-3 pt-2 pb-2.5"
                      style={{
                        border: l.setor
                          ? '1.5px solid rgba(16,185,129,0.3)'
                          : '1.5px dashed rgba(249,115,22,0.6)',
                        background: l.setor ? 'rgba(16,185,129,0.05)' : 'rgba(249,115,22,0.04)',
                      }}>
                      <p className="font-semibold txt-1 truncate" style={{ fontSize: 11 }}>{l.nome}</p>
                      <p className="mb-1.5" style={{ fontSize: 10, color: 'rgba(203,213,235,0.45)' }}>
                        Zona {l.zonaNum} · {fmt(l.totalVotos)} votos · {l.numSecoes} seções
                      </p>
                      <select
                        value={l.setor || ''}
                        onChange={e => atribuirSetor(l.id, e.target.value || null)}
                        className="w-full text-xs rounded-lg px-2 py-1.5 font-semibold"
                        style={{
                          background: '#0d111c',
                          color: l.setor ? '#34d399' : '#fb923c',
                          border: `1px solid ${l.setor ? 'rgba(52,211,153,0.3)' : 'rgba(251,146,60,0.4)'}`,
                          outline: 'none',
                        }}>
                        <option value="">— Selecionar bairro —</option>
                        {bairrosDaCidade.map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Locais com setor atribuído: resumo por setor */}
            {locaisFlat.filter(l => l.setor).length > 0 && (
              <div className="srf rounded-3xl p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.12)' }}>
                    <TrendingUp size={16} style={{ color: '#16a34a' }} />
                  </div>
                  <div>
                    <h2 className="font-bold txt-1" style={{ fontSize: 14 }}>Votos por Bairro (Cruzamento)</h2>
                    <p className="txt-3" style={{ fontSize: 11 }}>Locais já vinculados a bairros · aparece no Mapa Eleitoral</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {(() => {
                    const setoresMap = {}
                    locaisFlat.filter(l => l.setor).forEach(l => {
                      if (!setoresMap[l.setor]) setoresMap[l.setor] = { votos: 0, locais: 0, secoes: 0 }
                      setoresMap[l.setor].votos  += l.totalVotos
                      setoresMap[l.setor].locais += 1
                      setoresMap[l.setor].secoes += l.numSecoes
                    })
                    return Object.entries(setoresMap).sort((a, b) => b[1].votos - a[1].votos).map(([setor, s], i) => {
                      const cor = PALETA[i % PALETA.length]
                      const pct = totalVotos > 0 ? (s.votos / totalVotos) * 100 : 0
                      return (
                        <div key={setor}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold txt-2" style={{ fontSize: 12 }}>{setor}</span>
                            <span className="font-bold" style={{ fontSize: 12, color: cor }}>
                              {fmt(s.votos)} votos · {pct.toFixed(1)}% · {s.locais} locais · {s.secoes} seções
                            </span>
                          </div>
                          <div className="w-full rounded-full" style={{ height: 7, background: 'rgba(255,255,255,0.07)' }}>
                            <div className="h-full rounded-full"
                              style={{ width: `${pct}%`, background: `linear-gradient(90deg,${cor},${cor}bb)` }} />
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>
            )}

            {/* Metas por Zona */}
            <div className="srf rounded-3xl p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
              <div className="flex items-center gap-2 mb-5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.22)' }}>
                  <Target size={16} style={{ color: '#1d4ed8' }} />
                </div>
                <div>
                  <h2 className="font-bold txt-1" style={{ fontSize: 14 }}>Metas por Zona</h2>
                  <p className="txt-3" style={{ fontSize: 11 }}>Defina e acompanhe metas de votos por zona</p>
                </div>
              </div>
              <div className="space-y-3">
                {zonasComMeta.map(z => {
                  const statusColor = z.status === 'atingida' ? 'rgba(16,185,129,0.18)' : z.status === 'boa' ? 'rgba(37,99,235,0.22)' : z.status === 'alerta' ? 'rgba(245,158,11,0.16)' : 'rgba(239,68,68,0.22)'
                  const statusTextColor = z.status === 'atingida' ? '#6ee7b7' : z.status === 'boa' ? '#1e40af' : z.status === 'alerta' ? '#fcd34d' : '#fca5a5'
                  return (
                    <div key={z.zona} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)' }}>
                      <span className="font-bold" style={{ fontSize: 13, color: 'rgba(235,240,255,0.92)', minWidth: 80 }}>Zona {z.zona}</span>
                      <div className="flex-1">
                        <input
                          type="number"
                          value={z.meta || ''}
                          onChange={e => salvarMetasZona({ ...metasZona, [z.zona]: parseInt(e.target.value) || 0 })}
                          placeholder="Meta"
                          className="w-24 rounded-lg px-2 py-1 font-bold text-center"
                          style={{ fontSize: 12, border: '1.5px solid rgba(255,255,255,0.12)' }}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span style={{ fontSize: 11, color: 'rgba(203,213,235,0.60)' }}>Progresso</span>
                          <span className="font-bold" style={{ fontSize: 11, color: statusTextColor }}>{z.pct.toFixed(1)}%</span>
                        </div>
                        <div className="w-full rounded-full" style={{ height: 6, background: 'rgba(255,255,255,0.12)' }}>
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${Math.min(z.pct, 100)}%`, background: statusTextColor }} />
                        </div>
                      </div>
                      <span className="font-bold" style={{ fontSize: 12, color: 'rgba(235,240,255,0.92)', minWidth: 80, textAlign: 'right' }}>
                        {fmt(z.votos)} / {z.meta > 0 ? fmt(z.meta) : '-'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* ─── POR LOCAL ──────────────────────────────────── */}
        {view === 'locais' && dados && (
          <div className="srf rounded-3xl p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'rgba(203,213,235,0.45)' }} />
                <input value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar local de votação…"
                  className="w-full rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  style={{ fontSize: 13, border: '1.5px solid rgba(255,255,255,0.12)' }} />
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setFiltroZona(null)}
                  className="px-3 py-2 rounded-xl font-semibold"
                  style={{ fontSize: 12,
                    background: !filtroZona ? '#1d4ed8' : 'rgba(255,255,255,0.07)',
                    color:      !filtroZona ? '#fff'    : 'rgba(203,213,235,0.60)' }}>
                  Todos
                </button>
                {dados.zonas.map(z => (
                  <button key={z.zona} onClick={() => setFiltroZona(filtroZona === z.zona ? null : z.zona)}
                    className="px-3 py-2 rounded-xl font-semibold"
                    style={{ fontSize: 12,
                      background: filtroZona === z.zona ? '#1d4ed8' : 'rgba(255,255,255,0.07)',
                      color:      filtroZona === z.zona ? '#fff'    : 'rgba(203,213,235,0.60)' }}>
                    Zona {z.zona}
                  </button>
                ))}
              </div>
            </div>

            <p className="txt-3 mb-3" style={{ fontSize: 11 }}>
              {locaisFiltrados.length} local{locaisFiltrados.length !== 1 ? 'is' : ''} encontrado{locaisFiltrados.length !== 1 ? 's' : ''}
            </p>

            <div className="space-y-2">
              {locaisFiltrados.map((l, idx) => {
                const pct    = totalVotos > 0 ? (l.totalVotos / totalVotos) * 100 : 0
                const isOpen = expandido[l.id]
                return (
                  <div key={l.id} className="rounded-2xl overflow-hidden"
                    style={{ border: '1.5px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex items-center gap-3 p-3 cursor-pointer hov-srf transition-colors"
                      onClick={() => setExpandido(p => ({ ...p, [l.id]: !p[l.id] }))}>
                      <span className="font-black txt-4 w-7 text-right flex-shrink-0" style={{ fontSize: 12 }}>
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold txt-1 truncate" style={{ fontSize: 12 }}>{l.nome}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span style={{ fontSize: 10, color: 'rgba(203,213,235,0.45)' }}>Zona {l.zonaNum}</span>
                          <span style={{ fontSize: 10, color: 'rgba(203,213,235,0.45)' }}>·</span>
                          <span style={{ fontSize: 10, color: 'rgba(203,213,235,0.45)' }}>{l.numSecoes} seções</span>
                          {l.setor && (
                            <span className="px-2 py-0.5 rounded-full font-bold"
                              style={{ fontSize: 9, background: 'rgba(91,155,255,0.16)', color: 'var(--accent-bright)' }}>
                              {l.setor}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 mr-1">
                        <p className="font-black" style={{ fontSize: 15, color: 'var(--accent-bright)' }}>{fmt(l.totalVotos)}</p>
                        <p className="txt-3" style={{ fontSize: 10 }}>{pct.toFixed(2)}%</p>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setModalSetor(l.id) }}
                        className="p-1.5 rounded-lg hov-srf transition-colors flex-shrink-0"
                        title="Atribuir setor">
                        <Link2 size={12} style={{ color: l.setor ? 'var(--accent-bright)' : 'rgba(203,213,235,0.40)' }} />
                      </button>
                      <div className="flex-shrink-0" style={{ color: 'rgba(203,213,235,0.45)' }}>
                        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </div>
                    </div>
                    {isOpen && (
                      <div className="px-4 pb-3 pt-1" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <p className="font-semibold txt-3 mb-2" style={{ fontSize: 10 }}>
                          SEÇÃO (VOTOS)
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {l.secoes.map(s => (
                            <div key={s.secao} className="px-2.5 py-1 rounded-xl"
                              style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.12)', fontSize: 11 }}>
                              <span className="font-bold txt-2">{s.secao}</span>
                              <span className="txt-3 ml-1">({s.votos})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ─── POR SEÇÃO ──────────────────────────────────── */}
        {view === 'secoes' && dados && (
          <div className="srf rounded-3xl p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
            <div className="flex items-center gap-2 mb-5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.16)' }}>
                <Target size={16} style={{ color: '#1d4ed8' }} />
              </div>
              <div>
                <h2 className="font-bold txt-1" style={{ fontSize: 14 }}>Seções Eleitorais</h2>
                <p className="txt-3" style={{ fontSize: 11 }}>
                  {todasSecoes.length} seções · ordenadas por votos (top 200)
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1.5px solid rgba(255,255,255,0.07)' }}>
                    {['#', 'Seção', 'Zona', 'Local de Votação', 'Votos'].map(h => (
                      <th key={h} className={`py-2 px-3 font-bold txt-3 ${h === 'Votos' ? 'text-right' : 'text-left'}`}
                        style={{ fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {todasSecoes.slice(0, 200).map((s, i) => (
                    <tr key={`${s.localId}-${s.secao}`} className="hov-srf transition-colors"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td className="py-1.5 px-3 txt-4 font-bold" style={{ fontSize: 11 }}>{i + 1}</td>
                      <td className="py-1.5 px-3 font-bold txt-2" style={{ fontSize: 12 }}>{s.secao}</td>
                      <td className="py-1.5 px-3 txt-3" style={{ fontSize: 12 }}>{s.zonaNum}</td>
                      <td className="py-1.5 px-3 txt-2 max-w-xs" style={{ fontSize: 11 }}>
                        <span className="truncate block">{s.local}</span>
                      </td>
                      <td className="py-1.5 px-3 text-right font-black" style={{ fontSize: 13, color: '#1d4ed8' }}>
                        {s.votos}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {todasSecoes.length > 200 && (
                <p className="text-center mt-4 txt-3" style={{ fontSize: 12 }}>
                  Exibindo top 200 de {fmt(todasSecoes.length)} seções
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
