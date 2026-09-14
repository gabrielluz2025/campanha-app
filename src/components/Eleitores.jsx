import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Users, Search, X, Link2, Target, Award, MapPin, Layers, Percent, Upload,
} from 'lucide-react'
import {
  EleitoresKpiStrip, MetaGlobalPanel, PenetracaoPanel, ZonaVotosChart,
  TopLocaisChart, BairroVotosChart, DistribuicaoSecoesChart, MetasZonaPanel, AlertasMetaStrip,
  EleitoresCommandHeader, InteligenciaStrip, EleitoresViewTabs, CidadeFiltroBar,
  ImportPanel, EmptyEleitores, LocaisPanel, SecoesPanel, BairrosAtribuicaoPanel,
  MetaVsVotosChart, calcInteligencia, baixarCsv,
} from './EleitoresUI'
import { confirmAction } from '../utils/confirm'
import SaveButton from './SaveButton'
import { ModuleWrap } from './ui'
import { saveToCloud, writeStorage, flushAfterSave, readEleitoresData } from '../utils/persist'
import { SYNC_STORAGE_EVENT, SYNC_EVENT } from '../lib/cloudSync'
import { BAIRROS_BLUMENAU, COLEGIO_BAIRRO, normStr } from '../utils/constants'
import {
  cidadeFocoPadrao, isCargoMunicipal, usesMetaPorCidade, buildSecIndex,
  sugerirMetasPorZona, ajustarMetasAoTotal, autoAssignBairros, municipioZona,
  loadMetasCidade, loadMetasZona, getMetaCidade, setMetaCidade, getMetaZona, setMetaZona,
  mergeMetasZonaCidade, zonaPertenceCidade, buildScLookup, buildScBySecao,
  resolverBairroParaLocal, sanitizarDadosEleitores,
  lerFiltroCidade, gravarFiltroCidade, listarCidadesEleitores,
} from '../utils/eleitoresHelpers'
import { normalizarBairro } from '../utils/bairroMapa'
import { imprimirRankBairrosEleitores } from '../utils/eleitoresBairroReport'
import { getDocument } from 'pdfjs-dist'
import { configurarPdfWorker } from '../utils/pdfWorker'
configurarPdfWorker()

const STORAGE_KEY = 'eleitores_data'
const STORAGE_KEY_METAS_ZONA = 'metas_zona'

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

function totalLocal(local) { return (local.secoes || []).reduce((s, c) => s + (Number(c.votos) || 0), 0) }
function totalZona(zona)   { return (zona.locais || []).reduce((s, l) => s + totalLocal(l), 0) }

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
  const [dados, setDados] = useState(() => sanitizarDadosEleitores(readEleitoresData(null)))
  const [scDataFull, setScDataFull] = useState([])
  const [scDataReady, setScDataReady] = useState(false)
  const [candDb, setCandDb] = useState([])
  const [candLoaded, setCandLoaded] = useState(false)
  const [buscaCand, setBuscaCand] = useState('')
  const [filtroCargo, setFiltroCargo] = useState('')
  const [filtroAno, setFiltroAno] = useState('')
  const [modalBuscaCand, setModalBuscaCand] = useState(false)
  const [tseLoading, setTseLoading] = useState(false)
  const [tseErro, setTseErro] = useState('')
  const [view, setView] = useState('geral')
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [filtroZona, setFiltroZona] = useState(null)
  const [filtroBairro, setFiltroBairro] = useState(null)
  const [filtroCidade, setFiltroCidade] = useState(() => lerFiltroCidade('BLUMENAU'))
  const [busca, setBusca] = useState('')
  const [expandido, setExpandido] = useState({})
  const [modalSetor, setModalSetor] = useState(null)
  const [mostrarTodosBairros, setMostrarTodosBairros] = useState(false)
  const [bairroMsg, setBairroMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [nomeArq, setNomeArq] = useState('')
  const fileRef = useRef(null)
  const tseAbortRef = useRef(null)
  const [metasZona, setMetasZona] = useState(() => loadMetasZona())
  const [metasCidade, setMetasCidade] = useState(() => loadMetasCidade())
  const bairroMsgTimer = useRef(null)
  const cidadeInitRef = useRef('')

  const escolherCidade = (v) => {
    setFiltroCidade(v || '')
    setFiltroZona(null)
    gravarFiltroCidade(v || '')
  }

  useEffect(() => {
    const onExt = (e) => {
      const c = e?.detail?.cidade
      if (c === undefined) return
      setFiltroCidade(c || '')
      setFiltroZona(null)
    }
    window.addEventListener('eleitores-filtro-cidade', onExt)
    return () => window.removeEventListener('eleitores-filtro-cidade', onExt)
  }, [])

  // Remove lixo (ex.: ESCOLA TESTE) já gravado no navegador
  useEffect(() => {
    const raw = readEleitoresData(null)
    if (!raw) return
    const limpo = sanitizarDadosEleitores(raw)
    if (limpo === raw) return
    if (Number(limpo.votosTotal) === Number(raw.votosTotal) && limpo.zonas === raw.zonas) return
    writeStorage(STORAGE_KEY, limpo)
    setDados(limpo)
    flushAfterSave()
  }, [])

  const cidadesDisponiveis = useMemo(() => listarCidadesEleitores(dados), [dados])

  const cidadeMatch = filtroCidade || cidadeFocoPadrao(dados, cidadesDisponiveis) || 'BLUMENAU'

  const scData = useMemo(() => {
    if (!scDataFull.length || !filtroCidade) return []
    const nf = normStr(filtroCidade)
    return scDataFull.filter(r => normStr(r.municipio) === nf)
  }, [scDataFull, filtroCidade])

  const scDataMatch = useMemo(() => {
    if (!scDataFull.length) return []
    const nf = normStr(cidadeMatch)
    return scDataFull.filter(r => normStr(r.municipio) === nf)
  }, [scDataFull, cidadeMatch])

  const secIdx = useMemo(() => buildSecIndex(scDataMatch), [scDataMatch])
  const cargoMunicipal = isCargoMunicipal(dados?.cargo)
  const cargoAmplo = usesMetaPorCidade(dados?.cargo)
  const cidadeMeta = filtroCidade || cidadeFocoPadrao(dados, cidadesDisponiveis) || dados?.municipio || 'BLUMENAU'
  const metaCidade = getMetaCidade(metasCidade, cidadeMeta)

  const _norms = useMemo(() =>
    Object.entries(COLEGIO_BAIRRO).map(([k, v]) => ({ n: normStr(k), b: v })), [])

  const _scLookup = useMemo(() => buildScLookup(scDataMatch), [scDataMatch])
  const _scBySecao = useMemo(() => buildScBySecao(_scLookup), [_scLookup])
  const _scLookupFull = useMemo(() => buildScLookup(scDataFull), [scDataFull])
  const _scBySecaoFull = useMemo(() => buildScBySecao(_scLookupFull), [_scLookupFull])

  const bairrosDaCidade = useMemo(() => {
    const cidade = filtroCidade || cidadeMatch || (cidadesDisponiveis.length === 1 ? cidadesDisponiveis[0] : null)
    if (!cidade || normStr(cidade) === normStr('BLUMENAU')) return BAIRROS_BLUMENAU
    const bairros = [...new Set(
      scData.filter(r => normStr(r.municipio) === normStr(cidade)).map(r => r.bairro),
    )].filter(Boolean).sort()
    return bairros.length > 0 ? bairros : BAIRROS_BLUMENAU
  }, [scData, filtroCidade, cidadesDisponiveis, cidadeMatch])

  const zonasFiltradas = useMemo(() => {
    if (!dados?.zonas) return []
    if (!filtroCidade) return dados.zonas
    return dados.zonas.filter(z => zonaPertenceCidade(z, dados, filtroCidade))
  }, [dados, filtroCidade])

  /* locais TRE: só carrega quando há dados importados */
  useEffect(() => {
    if (!dados) {
      setScDataFull([])
      setScDataReady(false)
      return
    }
    let cancelled = false
    setScDataReady(false)
    fetch('/locais_tre.json')
      .then(r => r.json())
      .then(data => {
        if (!cancelled) {
          setScDataFull(data)
          setScDataReady(true)
        }
      })
      .catch(() => { if (!cancelled) setScDataReady(true) })
    return () => { cancelled = true }
  }, [dados])

  useEffect(() => {
    if (!modalBuscaCand || candLoaded) return
    let cancelled = false
    const controller = new AbortController()
    fetch('/candidatos_sc.json', { signal: controller.signal })
      .then(r => r.json())
      .then(data => { if (!cancelled) { setCandDb(data); setCandLoaded(true) } })
      .catch(() => { if (!cancelled) setCandLoaded(true) })
    return () => { cancelled = true; controller.abort() }
  }, [modalBuscaCand, candLoaded])

  useEffect(() => {
    if (!dados?.zonas?.length) return
    const chave = `${dados.numero || ''}-${dados.ano || ''}-${dados.cargo || ''}`
    if (cidadeInitRef.current === chave) return
    cidadeInitRef.current = chave
    const salva = lerFiltroCidade('')
    const salvaOk = salva && cidadesDisponiveis.some(c => normStr(c) === normStr(salva))
    const padrao = salvaOk ? salva : cidadeFocoPadrao(dados, cidadesDisponiveis)
    if (padrao) {
      setFiltroCidade(padrao)
      gravarFiltroCidade(padrao)
    }
  }, [dados, cidadesDisponiveis])

  const bairroAutoRef = useRef('')

  useEffect(() => {
    bairroAutoRef.current = ''
  }, [dados?.numero, dados?.ano, dados?.cargo])

  useEffect(() => {
    if (!scDataReady || !_scLookupFull.length || !dados?.zonas?.length) return
    const cidade = filtroCidade || cidadeFocoPadrao(dados, cidadesDisponiveis) || 'BLUMENAU'
    const sig = `${dados.numero || ''}|${dados.ano || ''}|${cidade}|${_scLookupFull.length}`
    if (bairroAutoRef.current === sig) return
    bairroAutoRef.current = sig
    const atualizado = autoAssignBairros(dados, _scLookupFull, _scBySecaoFull, _norms, cidade, bairrosDaCidade)
    if (atualizado !== dados) salvar(atualizado)
  }, [scDataReady, _scLookupFull, _scBySecaoFull, _norms, filtroCidade, dados, bairrosDaCidade, cidadesDisponiveis])

  useEffect(() => {
    function recarregar(e) {
      const fromServer = e?.type === SYNC_EVENT && (e?.detail?.fromServer || e?.detail?.syncNow)
      const external = e?.detail?.external || fromServer
      if (e?.type === SYNC_STORAGE_EVENT && !external) return
      if (e?.type === SYNC_STORAGE_EVENT && e.detail.key && e.detail.key !== STORAGE_KEY) return
      try {
        const raw = readEleitoresData(null)
        if (raw) setDados(raw)
      } catch { /* ignore */ }
    }
    window.addEventListener(SYNC_STORAGE_EVENT, recarregar)
    window.addEventListener(SYNC_EVENT, recarregar)
    return () => {
      window.removeEventListener(SYNC_STORAGE_EVENT, recarregar)
      window.removeEventListener(SYNC_EVENT, recarregar)
    }
  }, [])

  function preencherBairrosAutomaticamente() {
    if (!dados) return
    const cidade = filtroCidade || cidadeFocoPadrao(dados, cidadesDisponiveis) || 'BLUMENAU'
    const antes = dados.zonas.reduce((s, z) => s + z.locais.filter(l => !l.setor).length, 0)
    const atualizado = autoAssignBairros(dados, _scLookupFull, _scBySecaoFull, _norms, cidade, bairrosDaCidade)
    const depois = atualizado.zonas.reduce((s, z) => s + z.locais.filter(l => !l.setor).length, 0)
    salvar(atualizado)
    const preenchidos = Math.max(0, antes - depois)
    setBairroMsg(preenchidos > 0
      ? `${preenchidos} colégio${preenchidos > 1 ? 's' : ''} com bairro gravado`
      : depois > 0 ? `${depois} colégio${depois > 1 ? 's' : ''} ainda sem bairro` : 'Todos os colégios já têm bairro')
    clearTimeout(bairroMsgTimer.current)
    bairroMsgTimer.current = setTimeout(() => setBairroMsg(''), 4000)
  }

  /* persistência */
  function salvar(d) {
    const limpo = sanitizarDadosEleitores(d)
    setDados(limpo)
    writeStorage(STORAGE_KEY, limpo)
    flushAfterSave()
  }
  function salvarMetasZona(m) { setMetasZona(m); writeStorage(STORAGE_KEY_METAS_ZONA, m) }
  function salvarMetaCidade(val) {
    const m = setMetaCidade(metasCidade, cidadeMeta, val)
    setMetasCidade(m)
    writeStorage('metas_cidade', m)
    if (normStr(cidadeMeta) === normStr('BLUMENAU')) {
      writeStorage('meta_global_votos', String(val))
    }
  }

  function aplicarSugestaoMetas(modo) {
    const sugestoes = sugerirMetasPorZona(zonasComMeta, { metaGlobal: metaCidade, modo })
    const ajustadas = modo === 'proporcional' && metaCidade > 0
      ? ajustarMetasAoTotal(sugestoes, metaCidade, zonasComMeta)
      : sugestoes
    salvarMetasZona(mergeMetasZonaCidade(metasZona, cidadeMeta, ajustadas))
  }

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
      salvar(autoAssignBairros(d, _scLookupFull, _scBySecaoFull, _norms, filtroCidade, bairrosDaCidade))
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
      writeStorage(STORAGE_KEY, null)
      flushAfterSave().catch(() => {})
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
    const bairro = setor ? normalizarBairro(setor, bairrosDaCidade) : null
    const novo = {
      ...dados,
      zonas: dados.zonas.map(z => ({
        ...z, locais: z.locais.map(l => l.id === localId ? { ...l, setor: bairro } : l),
      })),
    }
    salvar(novo)
    setModalSetor(null)
  }

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
    writeStorage(STORAGE_KEY, base)
    setDados(base)
    setModalBuscaCand(false)
    setBuscaCand('')
    setTseErro('')
    cidadeInitRef.current = ''
    const padrao = cidadeFocoPadrao(base, [])
    if (padrao) escolherCidade(padrao)
    setFiltroZona(null)
    // Só busca TSE para cargos suportados
    const cargosSuportados = ['DEPUTADO FEDERAL','DEPUTADO ESTADUAL','SENADOR','GOVERNADOR','VEREADOR','PREFEITO']
    if (!cargosSuportados.includes((cand.c||'').toUpperCase())) return
    setTseLoading(true)
    tseAbortRef.current?.abort()
    const controller = new AbortController()
    tseAbortRef.current = controller
    try {
      const params = new URLSearchParams({ numero: cand.n, cargo: cand.c, ano: cand.a })
      const API_URL = import.meta.env.VITE_HOSTINGER_API_URL || 'https://campanha.space/api/tse.php'
      const res = await fetch(`${API_URL}?${params}`, { signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const tseData = await res.json()
      if (tseData.error) throw new Error(tseData.error)
      let completo = {
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
      completo = sanitizarDadosEleitores(completo)
      const cids = [...new Set((completo.zonas || []).map(z => z.municipio || completo.municipio).filter(Boolean))]
      const foco = cidadeFocoPadrao(completo, cids)
      completo = autoAssignBairros(completo, _scLookupFull, _scBySecaoFull, _norms, foco, bairrosDaCidade)
      salvar(completo)
      if (foco) escolherCidade(foco)
    } catch (err) {
      if (err.name === 'AbortError') return
      console.error('Erro ao buscar TSE:', err)
      setTseErro(`Não foi possível buscar dados do TSE: ${err.message}`)
    } finally {
      setTseLoading(false)
    }
  }

  /* derivados */
  const locaisFlat = useMemo(() => {
    return zonasFiltradas.flatMap(z => {
      const mun   = municipioZona(z, dados, filtroCidade)
      const zNorm = String(parseInt(z.zona, 10) || 0)
      return z.locais.map(l => {
        const resolved = resolverBairroParaLocal(l, {
          mun, zNorm, secIdx, colegioNorms: _norms, bairrosLista: bairrosDaCidade,
        })
        const setorPersistido = l.setor ? (normalizarBairro(l.setor, bairrosDaCidade) || l.setor) : ''
        return {
          ...l,
          nome: resolved.nome || l.nome,
          setor: setorPersistido || resolved.setor || '',
          endereco: resolved.endereco || l.endereco || '',
          cep: resolved.cep || l.cep || '',
          zonaNum: z.zona,
          municipio: z.municipio || dados?.municipio,
          totalVotos: totalLocal(l),
          numSecoes: (l.secoes || []).length,
        }
      })
    }).sort((a, b) => b.totalVotos - a.totalVotos)
  }, [zonasFiltradas, dados, secIdx, filtroCidade, bairrosDaCidade, _norms])

  const votosPorZona = useMemo(() => {
    return zonasFiltradas.map(z => ({
      zona: z.zona, name: `Zona ${z.zona}`,
      totalVotos: totalZona(z), numLocais: z.locais.length,
      numSecoes: z.locais.reduce((s, l) => s + (l.secoes || []).length, 0),
    })).sort((a, b) => b.totalVotos - a.totalVotos)
  }, [zonasFiltradas])

  const locaisFiltrados = useMemo(() =>
    locaisFlat
      .filter(l => !filtroZona || l.zonaNum === filtroZona)
      .filter(l => !busca || l.nome.toLowerCase().includes(busca.toLowerCase())),
    [locaisFlat, filtroZona, busca])

  const todasSecoes = useMemo(() =>
    locaisFlat
      .flatMap(l => (l.secoes || []).map(s => ({
        ...s,
        local: l.nome,
        zonaNum: l.zonaNum,
        localId: l.id,
        bairro: l.setor || '—',
        cidade: l.municipio || dados?.municipio || '—',
        endereco: l.endereco || '',
      })))
      .sort((a, b) => b.votos - a.votos),
    [locaisFlat, dados])

  const todasSecoesFiltradas = useMemo(() =>
    filtroBairro ? todasSecoes.filter(s => s.bairro === filtroBairro) : todasSecoes,
    [todasSecoes, filtroBairro])

  const totalVotos = locaisFlat.reduce((s, l) => s + l.totalVotos, 0)
  const totalVotosGeral = useMemo(() => {
    const header = Number(dados?.votosTotal) || 0
    if (!dados?.zonas?.length) return header
    const soma = dados.zonas.reduce((s, z) => s + totalZona(z), 0)
    // Prefere o total oficial do TSE quando existir; senão a soma das seções
    return header > 0 ? header : soma
  }, [dados])
  const eleitoresAptos = useMemo(() => {
    if (filtroCidade && scData.length > 0) {
      const nf = normStr(filtroCidade)
      return scData.filter(r => normStr(r.municipio) === nf).reduce((s, r) => s + (r.total_eleitores || 0), 0)
    }
    return dados?.eleitoresAptos || 0
  }, [filtroCidade, scData, dados])
  const numSemSetor = useMemo(() => {
    const ids = new Set(locaisFlat.map(l => l.id))
    let n = 0
    for (const z of zonasFiltradas) {
      for (const l of z.locais) {
        if (!ids.has(l.id)) continue
        if (!l.setor) n++
      }
    }
    return n
  }, [zonasFiltradas, locaisFlat])

  // Zone goals comparison
  const zonasComMeta = useMemo(() => {
    if (!dados) return []
    return zonasFiltradas.map(z => {
      const votos = totalZona(z)
      const meta = getMetaZona(metasZona, cidadeMeta, z.zona)
      const pct = meta > 0 ? (votos / meta) * 100 : 0
      const status = meta === 0 ? 'sem_meta' : pct >= 100 ? 'atingida' : pct >= 80 ? 'boa' : pct >= 50 ? 'alerta' : 'critica'
      return { zona: z.zona, votos, meta, pct, status }
    }).sort((a, b) => b.votos - a.votos)
  }, [dados, metasZona, zonasFiltradas, cidadeMeta])

  const metaCidadePct = useMemo(() => {
    if (metaCidade === 0) return 0
    return (totalVotos / metaCidade) * 100
  }, [totalVotos, metaCidade])

  const alertas = useMemo(() => {
    const alerts = []
    const rotuloMeta = cargoAmplo ? `Meta em ${cidadeMeta}` : 'Meta global'
    if (metaCidade > 0 && metaCidadePct < 50) {
      alerts.push({ tipo: 'critico', msg: `${rotuloMeta} (${fmt(metaCidade)} votos) com menos de 50% atingida` })
    } else if (metaCidade > 0 && metaCidadePct < 80) {
      alerts.push({ tipo: 'alerta', msg: `${rotuloMeta} (${fmt(metaCidade)} votos) com menos de 80% atingida` })
    }
    zonasComMeta.forEach(z => {
      if (z.meta > 0 && z.pct < 50) {
        alerts.push({ tipo: 'critico', msg: `Zona ${z.zona}: apenas ${z.pct.toFixed(1)}% da meta (${fmt(z.meta)} votos)` })
      } else if (z.meta > 0 && z.pct < 80) {
        alerts.push({ tipo: 'alerta', msg: `Zona ${z.zona}: ${z.pct.toFixed(1)}% da meta (${fmt(z.meta)} votos)` })
      }
    })
    return alerts.slice(0, 5)
  }, [metaCidade, metaCidadePct, zonasComMeta, cargoAmplo, cidadeMeta])
  const top10          = locaisFlat.slice(0, 10)

  const votosPorBairro = useMemo(() => {
    const map = {}
    locaisFlat.filter(l => l.setor).forEach(l => {
      if (!map[l.setor]) map[l.setor] = { votos: 0, locais: 0 }
      map[l.setor].votos  += l.totalVotos
      map[l.setor].locais += 1
    })
    return Object.entries(map)
      .sort((a, b) => b[1].votos - a[1].votos)
      .map(([name, v]) => ({ name, votos: v.votos, locais: v.locais }))
  }, [locaisFlat])

  const locaisAtribuicao = useMemo(() => {
    if (mostrarTodosBairros) return locaisFlat
    const pendentes = locaisFlat.filter(l => !l.setor)
    return pendentes.length > 0 ? pendentes : locaisFlat.slice(0, 24)
  }, [locaisFlat, mostrarTodosBairros])

  const VIEWS = [
    { id: 'geral', label: 'Visão Geral', icon: Layers },
    { id: 'locais', label: 'Por Local', icon: MapPin },
    { id: 'secoes', label: 'Por Seção', icon: Target },
    { id: 'importar', label: 'Importar', icon: Upload },
  ]

  const penetração = eleitoresAptos > 0 ? (totalVotos / eleitoresAptos) * 100 : 0

  const insights = useMemo(() => {
    if (!dados) return []
    return calcInteligencia({
      locaisFlat, todasSecoes, votosPorZona, votosPorBairro, totalVotos, numSemSetor,
    })
  }, [dados, locaisFlat, todasSecoes, votosPorZona, votosPorBairro, totalVotos, numSemSetor])

  const bairrosUniq = useMemo(
    () => [...new Set(todasSecoes.map(s => s.bairro).filter(b => b && b !== '—'))].sort(),
    [todasSecoes],
  )

  const mediaSecao = todasSecoes.length > 0 ? totalVotos / todasSecoes.length : 0

  function exportLocaisCsv() {
    baixarCsv(`locais-${filtroCidade || 'todos'}.csv`, locaisFiltrados.map((l, i) => ({
      ranking: i + 1,
      local: l.nome,
      zona: l.zonaNum,
      bairro: l.setor || '',
      endereco: l.endereco || '',
      secoes: l.numSecoes,
      votos: l.totalVotos,
      pct: totalVotos > 0 ? ((l.totalVotos / totalVotos) * 100).toFixed(2) : '0',
    })))
  }

  function exportSecoesCsv() {
    baixarCsv(`secoes-${filtroCidade || 'todos'}.csv`, todasSecoesFiltradas.map((s, i) => ({
      ranking: i + 1,
      secao: s.secao,
      zona: s.zonaNum,
      cidade: s.cidade,
      local: s.local,
      bairro: s.bairro === '—' ? '' : s.bairro,
      endereco: s.endereco || '',
      votos: s.votos,
    })))
  }

  function imprimirRankBairros() {
    const res = imprimirRankBairrosEleitores({
      dados,
      locaisFlat,
      scData,
      filtroCidade,
      candidato: dados?.candidato,
      numero: dados?.numero,
      partido: dados?.partido,
      cargo: dados?.cargo,
      ano: dados?.ano,
    })
    if (res?.ok === false && res.erro === 'popup') {
      alert('Permita pop-ups neste site para abrir a impressão do relatório.')
    }
  }

  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-base)' }}>

      {/* ── Modal: atribuir setor ──────────────────────────── */}
      {modalSetor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-sm rounded-3xl overflow-hidden"
            style={{ background: 'var(--bg-surface)', border: '1px solid rgba(212,175,95,0.25)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
            <div className="flex items-center justify-between px-6 py-4"
              style={{ background: 'linear-gradient(135deg, rgba(212,175,95,0.2), rgba(168,132,46,0.08))', borderBottom: '1px solid rgba(212,175,95,0.2)' }}>
              <div className="flex items-center gap-2">
                <Link2 size={17} style={{ color: 'var(--gold-bright)' }} />
                <h3 className="font-bold text-white" style={{ fontSize: 14 }}>Atribuir Bairro</h3>
              </div>
              <button onClick={() => setModalSetor(null)} className="p-1.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
                <X size={16} />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="mb-4" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                Selecione o bairro onde fica este local de votação.
              </p>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                <button onClick={() => atribuirSetor(modalSetor, null)}
                  className="w-full text-left px-4 py-2.5 rounded-xl font-semibold"
                  style={{ fontSize: 13, color: 'var(--text-faint)', border: '1px solid var(--border-subtle)' }}>
                  Sem bairro atribuído
                </button>
                {bairrosDaCidade.map(b => (
                  <button key={b} onClick={() => atribuirSetor(modalSetor, b)}
                    className="w-full text-left px-4 py-2.5 rounded-xl font-semibold"
                    style={{ fontSize: 13, color: 'var(--gold-bright)', border: '1px solid rgba(212,175,95,0.28)', background: 'rgba(212,175,95,0.06)' }}>
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
            style={{ background: 'var(--bg-surface)', border: '1px solid rgba(212,175,95,0.22)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
            <div className="flex items-center justify-between px-5 py-4"
              style={{ background: 'linear-gradient(135deg, rgba(212,175,95,0.2), rgba(168,132,46,0.08))', borderBottom: '1px solid rgba(212,175,95,0.2)' }}>
              <div className="flex items-center gap-2">
                <Search size={15} style={{ color: 'var(--gold-bright)' }} />
                <h3 className="font-bold text-white" style={{ fontSize: 14 }}>Buscar Candidato — SC 2022 / 2024</h3>
              </div>
              <button onClick={() => setModalBuscaCand(false)} className="p-1.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <X size={14} className="text-white" />
              </button>
            </div>
            <div className="px-5 py-4">
              <div className="flex gap-2 mb-3">
                <select value={filtroAno} onChange={e => setFiltroAno(e.target.value)}
                  className="rounded-xl px-3 py-2 text-xs font-semibold outline-none"
                  style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', color: 'var(--gold-bright)' }}>
                  <option value="">Todos os anos</option>
                  {anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select value={filtroCargo} onChange={e => setFiltroCargo(e.target.value)}
                  className="flex-1 rounded-xl px-3 py-2 text-xs font-semibold outline-none"
                  style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', color: 'var(--gold-bright)' }}>
                  <option value="">Todos os cargos</option>
                  {cargosDisponiveis.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2 px-3 rounded-xl mb-3"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', height: 40 }}>
                <Search size={13} style={{ color: 'var(--text-faint)' }} />
                <input autoFocus value={buscaCand} onChange={e => setBuscaCand(e.target.value)}
                  placeholder="Nome, nome de urna ou número…"
                  className="flex-1 bg-transparent outline-none"
                  style={{ fontSize: 13, color: '#e2e8f0' }} />
                {buscaCand && <button onClick={() => setBuscaCand('')}><X size={11} style={{ color: 'var(--text-faint)' }} /></button>}
              </div>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {candFiltrados.length === 0 && (buscaCand.trim() || filtroCargo || filtroAno) && (
                  <p className="text-center py-6" style={{ fontSize: 12, color: 'var(--text-faint)' }}>Nenhum candidato encontrado</p>
                )}
                {candFiltrados.length === 0 && !buscaCand.trim() && !filtroCargo && !filtroAno && (
                  <p className="text-center py-6" style={{ fontSize: 12, color: 'var(--text-faint)' }}>Digite o nome ou número para buscar</p>
                )}
                {candFiltrados.map((c, i) => (
                  <button key={i} onClick={() => aplicarCandidato(c)}
                    className="w-full text-left px-4 py-3 rounded-2xl transition-all"
                    style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold" style={{ fontSize: 13, color: '#e2e8f0' }}>{c.nm}</p>
                        <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>
                          {c.u && c.u !== c.nm ? `"${c.u}" · ` : ''}{c.c} · {c.m} · {c.a}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="font-black" style={{ fontSize: 14, color: 'var(--gold-bright)' }}>Nº {c.n}</p>
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

      {tseLoading && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl"
          style={{ background: 'rgba(20,20,32,0.95)', border: '1px solid rgba(212,175,95,0.4)', minWidth: 260 }}>
          <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin flex-shrink-0"
            style={{ borderColor: 'var(--gold-bright)', borderTopColor: 'transparent' }} />
          <span className="font-semibold" style={{ fontSize: 13, color: 'var(--gold-bright)' }}>Buscando dados do TSE…</span>
        </div>
      )}
      {tseErro && !tseLoading && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl"
          style={{ background: '#7f1d1d', border: '1px solid rgba(239,68,68,0.5)', minWidth: 260, maxWidth: 400 }}>
          <span className="text-white" style={{ fontSize: 12 }}>{tseErro}</span>
          <button onClick={() => setTseErro('')} className="ml-auto flex-shrink-0"><X size={13} className="text-white" /></button>
        </div>
      )}

      <ModuleWrap className="pb-10 space-y-5">
        <EleitoresCommandHeader
          dados={dados}
          cidade={filtroCidade || null}
          totalVotos={totalVotos}
          totalVotosGeral={totalVotosGeral}
          eleitoresAptos={eleitoresAptos}
          metaCidade={metaCidade}
          metaPct={metaCidadePct}
          penetração={penetração}
          onBuscar={() => setModalBuscaCand(true)}
          onImportar={() => setView('importar')}
          onLimpar={limpar}
          onImprimirRankBairros={imprimirRankBairros}
          saveSlot={dados ? (
            <SaveButton
              variant="ghost"
              onSave={() => saveToCloud({
                eleitores_data: dados,
                metas_zona: metasZona,
                metas_cidade: metasCidade,
                meta_global_votos: getMetaCidade(metasCidade, cidadeMeta),
              })}
            />
          ) : null}
        />

        {dados && (
          <EleitoresKpiStrip stats={[
            ...(filtroCidade && totalVotosGeral > 0 && totalVotosGeral !== totalVotos
              ? [{ label: 'Votos totais', raw: totalVotosGeral, icon: Award, cor: 'var(--gold-bright)',
                  sub: dados.municipio === 'SANTA CATARINA' ? 'Santa Catarina (TSE)' : 'Todos os municípios' }]
              : []),
            { label: filtroCidade ? `Votos · ${filtroCidade}` : 'Votos', raw: totalVotos, icon: Award, cor: 'var(--gold)',
              sub: eleitoresAptos > 0 ? `${fmtPct(totalVotos, eleitoresAptos)} dos aptos` : 'no recorte atual' },
            { label: 'Aptos', raw: eleitoresAptos, icon: Users, cor: '#34d399',
              sub: filtroCidade || (dados.municipio === 'SANTA CATARINA' ? 'SC · sem aptos no TSE' : dados.municipio) || 'Território' },
            { label: 'Penetração', value: penetração.toFixed(2), suffix: '%', icon: Percent, cor: '#22d3ee',
              sub: 'votos / eleitores aptos' },
            { label: 'Locais', raw: locaisFlat.length, icon: MapPin, cor: '#fb923c',
              sub: `${zonasFiltradas.length} zonas`, onClick: () => setView('locais') },
            { label: 'Seções', raw: todasSecoes.length, icon: Target, cor: '#a78bfa',
              sub: `média ${mediaSecao.toFixed(1)}`, onClick: () => setView('secoes') },
            { label: 'Meta', value: filtroCidade && metaCidade > 0 ? `${metaCidadePct.toFixed(0)}%` : '—', icon: Target, cor: '#fbbf24',
              sub: filtroCidade && metaCidade > 0 ? `meta ${fmt(metaCidade)}` : 'selecione a cidade da meta' },
          ]} />
        )}

        {dados && (cidadesDisponiveis.length > 1 || cargoMunicipal || cargoAmplo) && (
          <CidadeFiltroBar
            cargoMunicipal={cargoMunicipal}
            cargoAmplo={cargoAmplo}
            filtroCidade={filtroCidade}
            cidadeMeta={cidadeMeta}
            cidadesDisponiveis={cidadesDisponiveis}
            municipio={dados.municipio}
            totalVotosGeral={totalVotosGeral}
            totalVotosCidade={totalVotos}
            onChange={escolherCidade}
          />
        )}

        <EleitoresViewTabs views={VIEWS} active={view} onChange={setView} />

        {view === 'importar' && (
          <ImportPanel
            loading={loading}
            nomeArq={nomeArq}
            texto={texto}
            erro={erro}
            fileRef={fileRef}
            onPick={handlePDF}
            onDrop={handlePDF}
            onTexto={v => { setTexto(v); setErro('') }}
            onClear={() => { setTexto(''); setErro(''); setNomeArq('') }}
            onImport={importar}
          />
        )}

        {view !== 'importar' && !dados && (
          <EmptyEleitores
            onImportar={() => setView('importar')}
            onBuscar={() => setModalBuscaCand(true)}
          />
        )}

        {view === 'geral' && dados && (
          <div className="space-y-5">
            <InteligenciaStrip insights={insights} />
            <AlertasMetaStrip alertas={alertas} />

            <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-5">
              <MetaGlobalPanel
                metaGlobal={metaCidade}
                totalVotos={totalVotos}
                metaGlobalPct={metaCidadePct}
                onMetaChange={salvarMetaCidade}
                cidade={cidadeMeta}
                escopoCidade={cargoAmplo || cargoMunicipal}
                fmt={fmt}
              />
              <PenetracaoPanel totalVotos={totalVotos} eleitoresAptos={eleitoresAptos} fmtPct={fmtPct} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ZonaVotosChart
                data={votosPorZona}
                totalVotos={totalVotos}
                onZonaClick={(z) => { setFiltroZona(z); setView('locais') }}
              />
              <TopLocaisChart locais={top10} totalVotos={totalVotos} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <DistribuicaoSecoesChart secoes={todasSecoes} />
              {votosPorBairro.length > 0 ? (
                <BairroVotosChart
                  data={votosPorBairro}
                  filtroBairro={filtroBairro}
                  onImprimir={imprimirRankBairros}
                  onBairroClick={(b) => {
                    setFiltroBairro(prev => prev === b ? null : b)
                    setView('secoes')
                  }}
                />
              ) : (
                <div className="rounded-2xl p-6 flex items-center justify-center"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                    Atribua bairros aos colégios para ver a força territorial
                  </p>
                </div>
              )}
            </div>

            <MetaVsVotosChart zonas={zonasComMeta} fmt={fmt} />

            <MetasZonaPanel
              zonas={zonasComMeta}
              metasZona={metasZona}
              metaGlobal={metaCidade}
              cidade={cidadeMeta}
              escopoCidade={cargoAmplo || cargoMunicipal}
              onMetaChange={(zona, val) => salvarMetasZona(setMetaZona(metasZona, cidadeMeta, zona, val))}
              onSugerirMetas={aplicarSugestaoMetas}
              fmt={fmt}
            />

            {locaisFlat.length > 0 && (
              <BairrosAtribuicaoPanel
                numSemSetor={numSemSetor}
                locais={locaisAtribuicao}
                bairrosDaCidade={bairrosDaCidade}
                mostrarTodos={mostrarTodosBairros}
                onToggleTodos={() => setMostrarTodosBairros(v => !v)}
                totalLocais={locaisFlat.length}
                onAutoFill={preencherBairrosAutomaticamente}
                bairroMsg={bairroMsg}
                onAtribuir={atribuirSetor}
                fmt={fmt}
                normalizarBairro={normalizarBairro}
              />
            )}
          </div>
        )}

        {view === 'locais' && dados && (
          <LocaisPanel
            locais={locaisFiltrados}
            totalVotos={totalVotos}
            busca={busca}
            onBusca={setBusca}
            filtroZona={filtroZona}
            onFiltroZona={setFiltroZona}
            zonas={zonasFiltradas}
            expandido={expandido}
            onToggle={id => setExpandido(p => ({ ...p, [id]: !p[id] }))}
            onAtribuir={setModalSetor}
            onExport={exportLocaisCsv}
            fmt={fmt}
          />
        )}

        {view === 'secoes' && dados && (
          <SecoesPanel
            secoes={todasSecoesFiltradas}
            filtroBairro={filtroBairro}
            onFiltroBairro={setFiltroBairro}
            bairros={bairrosUniq}
            onExport={exportSecoesCsv}
            fmt={fmt}
          />
        )}
      </ModuleWrap>
    </div>
  )
}
