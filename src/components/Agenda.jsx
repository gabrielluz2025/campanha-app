/* ─────────────────────────────────────────────────────────────
   Agenda.jsx — Gerenciamento de eventos e compromissos
   Padrões:
     • Constantes globais: SCREAMING_SNAKE_CASE
     • Estado do formulário: camelCase com prefixo descritivo
     • Funções utilitárias puras: camelCase fora do componente
     • Funções de UI: verbos em português (abrir*, fechar*, salvar*)
     • Estilos inline compartilhados: constantes INPUT_CLS / INPUT_STY
───────────────────────────────────────────────────────────── */
import { useState, useEffect, useRef, useMemo } from 'react'
import {
  CalendarDays, Plus, X, Clock, MapPin, User, Phone,
  ChevronLeft, ChevronRight, AlertTriangle, Pencil,
  Trash2, Users, Search, Church, Share2, Copy, Check,
  History, CheckCircle2, UserCheck, Star, MessageSquare, Upload, Camera, Loader2, FileText, FileUp,
} from 'lucide-react'
import { IGREJAS_BASE } from '../data/igrejasBase'
import { dataLocalHoje } from '../utils/rotaUtils'
import { getAllIgrejasCatalog } from '../utils/igrejasCatalog'
import { confirmAction } from '../utils/confirm'
import SaveButton from './SaveButton'
import AgendaLocalMapa from './AgendaLocalMapa'
import AgendaImportPreview from './AgendaImportPreview'
import { flushAfterSave, writeStorage } from '../utils/persist'
import { SYNC_EVENT, SYNC_STORAGE_EVENT } from '../lib/cloudSync'
import {
  shareUid, encodeShareToken, loadCompartilhamentos, persistirCompartilhamento,
  loadColaboracao, eventoEhDoMembro,
} from '../utils/agendaShare'
import {
  CATEGORIAS_AGENDA, AGENDA_TIPOS, RECORRENCIAS,
  ehAgendaCandidato, passaFiltroAgendaTipo, metaAgendaTipo,
  normalizarEventoAgenda, gerarOcorrencias, textoBriefingCandidato,
  parseImportAgenda, inicioSemana, diasDaSemana,
} from '../utils/agendaCandidato'
import { lerAgendaArquivo, ehArquivoPdf, extrairEventosDoOcr, isoHoje } from '../utils/agendaImportFoto'

/* ── Constantes de domínio ────────────────────────────────── */
const MESES        = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS_SEMANA  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const STORAGE_KEY  = 'agenda_eventos'
const FILTRO_TODA_EQUIPE = '__toda_equipe__'
const CORES_EVENTO = [
  '#3b82f6','#06b6d4','#ec4899','#f97316','#10b981',
  '#06b6d4','#f59e0b','#ef4444','#2563eb','#84cc16',
]
const CATEGORIAS = CATEGORIAS_AGENDA

/* Formulário vazio — todos os campos padronizados */
const FORM_VAZIO = {
  titulo:         '',
  categoria:      'visita',
  dataInicio:     '',
  dataFim:        '',
  horaInicio:     '08:00',
  horaFim:        '09:00',
  local:          '',
  representantes: [{ data: '', nome: '' }],
  indicadoPor:    '',
  contato:        '',
  observacoes:    '',
  cor:            CORES_EVENTO[0],
  agendaTipo:     'equipe',
  candidatoPresente: true,
  assessorId:     '',
  privado:        false,
  recorrencia:    'nenhuma',
  recorrenciaAte: '',
  serieId:        '',
}

/* ── Estilos compartilhados de input ──────────────────────── */
const INPUT_CLS = 'w-full rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300'
const INPUT_STY = { fontSize: 13, border: '1.5px solid rgba(255,255,255,0.12)', textTransform: 'capitalize' }

/* ── Funções utilitárias puras ────────────────────────────── */
function uid()       { return Date.now().toString(36) + Math.random().toString(36).slice(2) }
function toMin(h)    { if (!h || typeof h !== 'string') return 0; const [hh, mm] = h.split(':').map(Number); return (hh * 60 + mm) || 0 }
function normStr(s)  { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') }
function addDaysIso(iso, n) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return dataLocalHoje(d)
}

/** Retorna array de strings 'YYYY-MM-DD' para cada dia entre di e df (inclusive) */
function diasEntre(di, df) {
  if (!di || !df || di > df) return di ? [di] : []
  const result = []
  for (let d = new Date(di + 'T12:00'); d <= new Date(df + 'T12:00'); d.setDate(d.getDate() + 1)) {
    result.push(d.toISOString().slice(0, 10))
  }
  return result
}

/** Sincroniza array de representantes ao mudar o intervalo de datas */
function syncRepresentantes(dataInicio, dataFim, repsAtuais) {
  const dias = diasEntre(dataInicio, dataFim)
  if (!dias.length) return [{ data: dataInicio || '', nome: '' }]
  return dias.map(d => repsAtuais.find(r => r.data === d) || { data: d, nome: '' })
}

/** Normaliza eventos antigos (com campo .data) para o novo formato */
function normalizeEvento(ev) {
  let base = ev
  if (!ev.dataInicio) {
    const data = ev.data || ''
    base = {
      ...ev,
      dataInicio:     data,
      dataFim:        data,
      representantes: ev.representante
        ? [{ data, nome: ev.representante }]
        : [{ data, nome: '' }],
    }
  }
  return normalizarEventoAgenda(base)
}

/** Verifica se dois eventos conflitam (intervalos de data E hora sobrepostos) */
function conflita(a, b) {
  if (a.id === b.id) return false
  const adi = a.dataInicio, adf = a.dataFim || a.dataInicio
  const bdi = b.dataInicio, bdf = b.dataFim || b.dataInicio
  if (adi > bdf || adf < bdi) return false
  return toMin(a.horaInicio) < toMin(b.horaFim) &&
         toMin(a.horaFim)    > toMin(b.horaInicio)
}

function fimEventoDate(ev) {
  const data = ev.dataFim || ev.dataInicio
  const [hh = 23, mm = 59] = (ev.horaFim || '23:59').split(':').map(Number)
  return new Date(`${data}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`)
}

/** passado | agora | hoje | futuro */
function statusEvento(ev, agora = new Date()) {
  const inicio = new Date(`${ev.dataInicio}T${ev.horaInicio || '00:00'}:00`)
  const fim = fimEventoDate(ev)
  if (fim < agora) return 'passado'
  if (inicio <= agora && fim >= agora) return 'agora'
  const hoje = dataLocalHoje(agora)
  if (ev.dataInicio <= hoje && (ev.dataFim || ev.dataInicio) >= hoje) return 'hoje'
  return 'futuro'
}

function eventoNoMes(ev, ano, mes) {
  const mesStr = `${ano}-${String(mes + 1).padStart(2, '0')}`
  const ultimoDia = new Date(ano, mes + 1, 0).getDate()
  const mesInicio = `${mesStr}-01`
  const mesFim = `${mesStr}-${String(ultimoDia).padStart(2, '0')}`
  const df = ev.dataFim || ev.dataInicio
  return ev.dataInicio <= mesFim && df >= mesInicio
}

function passaFiltroPeriodo(ev, periodo, hojeStr, agora = new Date()) {
  const st = statusEvento(ev, agora)
  if (periodo === 'todos') return true
  if (periodo === 'passados') return st === 'passado'
  if (periodo === 'futuros') return st === 'futuro' || st === 'hoje' || st === 'agora'
  if (periodo === 'hoje') return ev.dataInicio <= hojeStr && (ev.dataFim || ev.dataInicio) >= hojeStr
  return true
}

const STATUS_META = {
  passado: { label: 'Realizado', cor: 'rgba(203,213,235,0.55)', bg: 'rgba(148,163,184,0.12)' },
  agora:   { label: 'Agora', cor: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  hoje:    { label: 'Hoje', cor: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  futuro:  { label: 'Próximo', cor: '#06b6d4', bg: 'rgba(6,182,212,0.15)' },
}

/* ── Sub-componentes reutilizáveis ────────────────────────── */
function Field({ label, children }) {
  return (
    <div>
      <label className="block font-semibold mb-1" style={{ fontSize: 11, color: 'rgba(203,213,235,0.60)', textTransform: 'capitalize' }}>{label}</label>
      {children}
    </div>
  )
}

function InfoRow({ icon, cor, text }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span style={{ color: cor, flexShrink: 0 }}>{icon}</span>
      <span className="truncate" style={{ fontSize: 12, color: 'rgba(203,213,235,0.62)' }}>{text}</span>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Componente principal
══════════════════════════════════════════════════════════ */
export default function Agenda() {
  const hoje    = new Date()
  const hojeStr = dataLocalHoje(hoje)

  /* ── Estado principal ────────────────────────────────── */
  const [eventos,    setEventos]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').map(normalizeEvento) } catch { return [] }
  })
  const [mes,        setMes]        = useState(hoje.getMonth())
  const [ano,        setAno]        = useState(hoje.getFullYear())
  const [diaSel,     setDiaSel]     = useState(hojeStr)
  const [modal,      setModal]      = useState(null)   // null | 'novo' | eventId
  const [form,       setForm]       = useState(FORM_VAZIO)
  const [cfAviso,    setCfAviso]    = useState([])
  const [localQuery, setLocalQuery] = useState('')
  const [localFocus, setLocalFocus] = useState(false)
  const localRef = useRef(null)
  const [categoriaFiltro, setCategoriaFiltro] = useState('todas')
  const [agendaTipoFiltro, setAgendaTipoFiltro] = useState('todas') // todas | candidato | equipe
  const [periodoFiltro, setPeriodoFiltro] = useState('todos') // todos | futuros | passados | hoje
  const [viewMode, setViewMode] = useState('dia') // dia | semana | mes | historico
  const [buscaHistorico, setBuscaHistorico] = useState('')
  const [membrosEquipe, setMembrosEquipe] = useState(() => {
    try { return JSON.parse(localStorage.getItem('equipe_membros') || '[]') } catch { return [] }
  })
  const [repFocusIdx, setRepFocusIdx] = useState(null)
  const [modalShare,  setModalShare]  = useState(false)
  const [shareMembro, setShareMembro] = useState('')
  const [shareCats,   setShareCats]   = useState(['todas'])
  const [sharePode,   setSharePode]   = useState(true)
  const [shareSoCandidato, setShareSoCandidato] = useState(false)
  const [shareTitulo, setShareTitulo] = useState('Agenda da Equipe')
  const [linkGerado,  setLinkGerado]  = useState('')
  const [copiado,     setCopiado]     = useState(false)
  const [modalImport, setModalImport] = useState(false)
  const [importAba, setImportAba] = useState('foto') // foto | texto
  const [importTexto, setImportTexto] = useState('')
  const [importDataPadrao, setImportDataPadrao] = useState(() => dataLocalHoje())
  const [ocrProgresso, setOcrProgresso] = useState(0)
  const [ocrRodando, setOcrRodando] = useState(false)
  const [ocrErro, setOcrErro] = useState('')
  const [importPreview, setImportPreview] = useState(null) // { linhas, imagemUrl, arquivoNome, textoOcr }
  const [importConfirmando, setImportConfirmando] = useState(false)
  const importFileRef = useRef(null)
  const [briefingOk, setBriefingOk] = useState(false)
  const [cfForte, setCfForte] = useState(false)
  const [compartilhamentos, setCompartilhamentos] = useState(() => loadCompartilhamentos())
  const [filtroCompartilhado, setFiltroCompartilhado] = useState('')
  const [colaboracoes, setColaboracoes] = useState({})

  useEffect(() => { writeStorage(STORAGE_KEY, eventos) }, [eventos])

  useEffect(() => {
    if (!compartilhamentos.length) return
    let ativo = true
    async function atualizar() {
      const map = {}
      for (const s of compartilhamentos) {
        const col = await loadColaboracao(s.shareId)
        if (col) map[s.shareId] = col
      }
      if (ativo) setColaboracoes(map)
    }
    atualizar()
    const t = setInterval(atualizar, 10000)
    return () => { ativo = false; clearInterval(t) }
  }, [compartilhamentos])

  useEffect(() => {
    function recarregar(e) {
      if (e?.type === SYNC_STORAGE_EVENT && !e?.detail?.external) return
      if (e?.type === SYNC_STORAGE_EVENT && e.detail?.key && e.detail.key !== STORAGE_KEY && e.detail.key !== 'equipe_membros') return
      if (modal) return // não sobrescreve formulário aberto
      try {
        setEventos(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').map(normalizeEvento))
        setMembrosEquipe(JSON.parse(localStorage.getItem('equipe_membros') || '[]'))
        setCompartilhamentos(loadCompartilhamentos())
      } catch { /* ignore */ }
    }
    window.addEventListener(SYNC_EVENT, recarregar)
    window.addEventListener(SYNC_STORAGE_EVENT, recarregar)
    return () => {
      window.removeEventListener(SYNC_EVENT, recarregar)
      window.removeEventListener(SYNC_STORAGE_EVENT, recarregar)
    }
  }, [modal])

  /* ── Helpers de calendário ───────────────────────────── */
  const primeiroDia = new Date(ano, mes, 1).getDay()
  const diasNoMes   = new Date(ano, mes + 1, 0).getDate()
  const celulas     = [...Array(primeiroDia).fill(null),
                       ...Array.from({ length: diasNoMes }, (_, i) => i + 1)]

  function toDataStr(d) {
    return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  /** Eventos visíveis — agenda própria, toda equipe ou filtrada por membro */
  const eventosParaExibicao = useMemo(() => {
    if (!filtroCompartilhado) return eventos

    if (filtroCompartilhado === FILTRO_TODA_EQUIPE) {
      const ids = new Set(eventos.map(e => e.id))
      const resultado = [...eventos]
      for (const s of compartilhamentos) {
        const col = colaboracoes[s.shareId]
        for (const ev of col?.eventosAdicionados || []) {
          if (ids.has(ev.id)) continue
          ids.add(ev.id)
          resultado.push({
            ...ev,
            _colaborativo: true,
            _shareMembro: s.membroNome,
            cor: ev.cor || '#10b981',
          })
        }
      }
      return resultado
    }

    const share = compartilhamentos.find(s => s.shareId === filtroCompartilhado)
    if (!share) return eventos
    const nome = share.membroNome
    const col = colaboracoes[filtroCompartilhado]
    const atribuidos = eventos.filter(ev => eventoEhDoMembro(ev, nome))
    const adicionados = (col?.eventosAdicionados || []).map(ev => ({
      ...ev,
      _colaborativo: true,
      _shareMembro: nome,
      cor: ev.cor || '#10b981',
    }))
    const ids = new Set()
    return [...atribuidos, ...adicionados].filter(ev => {
      if (ids.has(ev.id)) return false
      ids.add(ev.id)
      return true
    })
  }, [eventos, filtroCompartilhado, compartilhamentos, colaboracoes])

  const totalAcoesEquipe = useMemo(() => {
    let n = 0
    for (const s of compartilhamentos) {
      const col = colaboracoes[s.shareId]
      if (!col) continue
      n += (col.eventosAdicionados?.length || 0) + Object.keys(col.marcacoes || {}).length
    }
    return n
  }, [compartilhamentos, colaboracoes])

  function marcacaoDoEvento(evId) {
    if (filtroCompartilhado && filtroCompartilhado !== FILTRO_TODA_EQUIPE) {
      return colaboracoes[filtroCompartilhado]?.marcacoes?.[evId] || null
    }
    if (filtroCompartilhado === FILTRO_TODA_EQUIPE) {
      for (const s of compartilhamentos) {
        const m = colaboracoes[s.shareId]?.marcacoes?.[evId]
        if (m?.confirmado) return { ...m, _membro: s.membroNome }
      }
    }
    return null
  }

  /** Retorna eventos que cobrem o dia informado (suporta multi-dia) */
  function eventosNoDia(data) {
    return eventosParaExibicao
      .filter(e => {
        if (categoriaFiltro !== 'todas' && e.categoria !== categoriaFiltro) return false
        if (!passaFiltroAgendaTipo(e, agendaTipoFiltro)) return false
        if (!passaFiltroPeriodo(e, periodoFiltro, hojeStr)) return false
        return e.dataInicio <= data && (e.dataFim || e.dataInicio) >= data
      })
      .sort((a, b) => toMin(a.horaInicio) - toMin(b.horaInicio))
  }

  function eventosFiltradosBase() {
    return eventosParaExibicao.filter(e => {
      if (categoriaFiltro !== 'todas' && e.categoria !== categoriaFiltro) return false
      if (!passaFiltroAgendaTipo(e, agendaTipoFiltro)) return false
      return passaFiltroPeriodo(e, periodoFiltro, hojeStr)
    })
  }

  function navMes(delta) {
    const d = new Date(ano, mes + delta, 1)
    setMes(d.getMonth()); setAno(d.getFullYear())
  }

  /* ── Helpers do modal ────────────────────────────────── */
  const updForm = (k, v) => setForm(p => ({ ...p, [k]: v }))

  function abrirNovo(tipo = 'equipe') {
    const cor = tipo === 'candidato'
      ? '#f59e0b'
      : CORES_EVENTO[eventos.length % CORES_EVENTO.length]
    setForm({
      ...FORM_VAZIO,
      dataInicio: diaSel,
      dataFim: diaSel,
      representantes: [{ data: diaSel, nome: '' }],
      cor,
      agendaTipo: tipo,
      candidatoPresente: tipo !== 'equipe',
      categoria: tipo === 'candidato' ? 'gabinete' : 'visita',
    })
    setLocalQuery(''); setCfAviso([]); setCfForte(false)
    setModal('novo')
  }

  function abrirEditar(ev) {
    setForm(normalizarEventoAgenda({ ...ev }))
    setLocalQuery(ev.local || ''); setCfAviso([]); setCfForte(false)
    setModal(ev.id)
  }

  function fechar() { setModal(null); setCfAviso([]); setCfForte(false); setLocalQuery('') }

  function getConflitos(ev) {
    return eventos.filter(e => conflita(ev, e))
  }

  function getConflitosCandidato(ev) {
    if (!ehAgendaCandidato(ev)) return []
    return eventos.filter(e => ehAgendaCandidato(e) && conflita(ev, e))
  }

  function salvar() {
    const formNorm = normalizarEventoAgenda({ ...form })
    const evParaVerificar = { ...formNorm, id: modal === 'novo' ? '__novo__' : modal }
    const cfCand = getConflitosCandidato(evParaVerificar)
    const cf = getConflitos(evParaVerificar)
    if (cfCand.length > 0 && !cfForte) {
      setCfAviso(cfCand)
      setCfForte(true)
      return
    }
    if (cf.length > 0 && cfAviso.length === 0) {
      setCfAviso(cf)
      setCfForte(false)
      return
    }
    if (modal === 'novo') {
      const ocorrencias = gerarOcorrencias(formNorm, uid)
      setEventos(p => [...p, ...ocorrencias.map(o => normalizarEventoAgenda(o))])
    } else {
      setEventos(p => p.map(e => e.id === modal ? { ...formNorm, id: modal } : e))
    }
    setDiaSel(formNorm.dataInicio)
    fechar()
    flushAfterSave()
  }

  function copiarBriefing() {
    const txt = textoBriefingCandidato(eventos, diaSel === hojeStr ? hojeStr : diaSel, membrosEquipe)
    navigator.clipboard.writeText(txt).then(() => {
      setBriefingOk(true)
      setTimeout(() => setBriefingOk(false), 2500)
    })
  }

  function fecharImport() {
    if (ocrRodando) return
    if (importPreview?.imagemUrl) URL.revokeObjectURL(importPreview.imagemUrl)
    setModalImport(false)
    setImportTexto('')
    setOcrErro('')
    setOcrProgresso(0)
    setImportPreview(null)
  }

  function abrirPreviewImport({ linhas, imagemUrl, arquivoNome, textoOcr }) {
    setModalImport(false)
    setImportPreview({
      linhas: linhas || [],
      imagemUrl: imagemUrl || null,
      arquivoNome: arquivoNome || '',
      textoOcr: textoOcr || '',
    })
  }

  function prepararImportTexto() {
    const parsed = parseImportAgenda(importTexto, {
      agendaTipo: 'candidato',
      cor: '#f59e0b',
      categoria: 'reuniao',
    })
    if (!parsed.length) {
      // tenta parser OCR (linhas livres com horário)
      const doOcr = extrairEventosDoOcr(importTexto, { dataPadrao: importDataPadrao || isoHoje() })
      if (!doOcr.length) {
        alert('Nenhum evento válido. Use: título;data;horaInicio;horaFim;local — ou cole o texto da agenda com horários.')
        return
      }
      abrirPreviewImport({ linhas: doOcr, arquivoNome: 'Texto colado', textoOcr: importTexto })
      return
    }
    abrirPreviewImport({
      linhas: parsed.map(e => ({ ...e, confianca: 'ok' })),
      arquivoNome: 'Texto colado',
      textoOcr: importTexto,
    })
  }

  async function processarArquivoAgenda(file) {
    if (!file) return
    setOcrErro('')
    setOcrRodando(true)
    setOcrProgresso(0)
    const isPdf = ehArquivoPdf(file)
    const localPreview = isPdf ? null : URL.createObjectURL(file)
    try {
      const { texto, eventos, previewUrl } = await lerAgendaArquivo(file, {
        dataPadrao: importDataPadrao || isoHoje(),
        onProgress: pct => setOcrProgresso(pct),
      })
      const imagemUrl = previewUrl || localPreview
      if (previewUrl && localPreview) URL.revokeObjectURL(localPreview)
      abrirPreviewImport({
        linhas: eventos,
        imagemUrl,
        arquivoNome: file.name || (isPdf ? 'agenda.pdf' : 'foto-agenda.jpg'),
        textoOcr: texto,
      })
    } catch (err) {
      if (localPreview) URL.revokeObjectURL(localPreview)
      console.error(err)
      setOcrErro(err?.message || (isPdf
        ? 'Falha ao ler o PDF. Tente outro arquivo ou exporte as páginas como imagem.'
        : 'Falha ao ler a foto. Tente outra imagem mais nítida.'))
    } finally {
      setOcrRodando(false)
      setOcrProgresso(0)
      if (importFileRef.current) importFileRef.current.value = ''
    }
  }

  function confirmarImportPreview(lista) {
    setImportConfirmando(true)
    try {
      setEventos(p => [...p, ...lista.map(e => ({ ...normalizarEventoAgenda(e), id: uid() }))])
      if (importPreview?.imagemUrl) URL.revokeObjectURL(importPreview.imagemUrl)
      setImportPreview(null)
      setImportTexto('')
      setAgendaTipoFiltro('candidato')
      setViewMode('dia')
      flushAfterSave()
    } finally {
      setImportConfirmando(false)
    }
  }

  async function gerarLink() {
    if (!shareMembro) {
      alert('Selecione um membro da equipe para compartilhar a agenda.')
      return
    }
    const membro = membrosEquipe.find(m => m.id === shareMembro)
    const cats   = shareCats.includes('todas') ? null : shareCats
    const evsFiltrados = eventos.filter(ev => {
      if (ev.privado) return false
      if (shareSoCandidato && !ehAgendaCandidato(ev)) return false
      if (cats && !cats.includes(ev.categoria)) return false
      const dataFim = ev.dataFim || ev.dataInicio
      return dataFim >= dataLocalHoje()
    }).slice(0, 150)
    const shareId = shareUid()
    const payload = {
      v: 2,
      shareId,
      membroId:   membro?.id || '',
      membro:     membro?.nome || '',
      titulo:     shareTitulo || (shareSoCandidato ? 'Agenda do Candidato' : 'Agenda da Equipe'),
      podeMarcar: sharePode,
      podeAdicionar: sharePode,
      categorias: shareCats,
      soCandidato: shareSoCandidato,
      eventos:    evsFiltrados,
      geradoEm:   new Date().toISOString(),
    }
    const token   = encodeShareToken(payload)
    const baseUrl = import.meta.env.VITE_APP_URL || `${window.location.origin}${window.location.pathname}`
    const link    = `${baseUrl}#/agenda-equipe/${token}`
    setLinkGerado(link)
    const lista = await persistirCompartilhamento({
      shareId,
      membroId: membro?.id || '',
      membroNome: membro?.nome || '',
      titulo: shareTitulo || 'Agenda da Equipe',
      geradoEm: payload.geradoEm,
      podeMarcar: sharePode,
      podeAdicionar: sharePode,
      categorias: shareCats,
    })
    setCompartilhamentos(lista)
    setFiltroCompartilhado(shareId)
  }

  function copiarLink() {
    navigator.clipboard.writeText(linkGerado).then(() => {
      setCopiado(true); setTimeout(() => setCopiado(false), 2500)
    })
  }

  async function excluir(id) {
    const ev = eventos.find(e => e.id === id)
    const ok = await confirmAction({
      title: 'Excluir evento',
      message: `Excluir "${ev?.titulo || 'este evento'}" da agenda? Esta ação não pode ser desfeita.`,
    })
    if (ok) setEventos(p => p.filter(e => e.id !== id))
  }

  /* ── Autocomplete de local ───────────────────────────── */
  const catalogoAgenda = useMemo(() => {
    try { return getAllIgrejasCatalog() } catch { return IGREJAS_BASE }
  }, [])
  const localSugestoes = localQuery.length >= 1
    ? catalogoAgenda.filter(ig =>
        normStr(ig.nome).includes(normStr(localQuery)) ||
        normStr(ig.endereco || '').includes(normStr(localQuery))
      ).slice(0, 8)
    : []

  function selecionarLocal(ig) {
    const texto = `${ig.nome} — ${ig.endereco}`
    updForm('local', texto); setLocalQuery(texto); setLocalFocus(false)
  }

  /* ── Dados derivados ─────────────────────────────────── */
  const eventosDoDia = eventosNoDia(diaSel)
  const eventosCandidatoDia = eventosDoDia.filter(ehAgendaCandidato)
  const eventosEquipeSoDia = eventosDoDia.filter(e => (e.agendaTipo || 'equipe') === 'equipe')
  const proximoCandidato = useMemo(() => {
    const agora = new Date()
    return eventos
      .filter(ehAgendaCandidato)
      .filter(e => fimEventoDate(e) >= agora)
      .sort((a, b) => `${a.dataInicio}${a.horaInicio}`.localeCompare(`${b.dataInicio}${b.horaInicio}`))[0] || null
  }, [eventos])
  const semanaInicio = inicioSemana(diaSel)
  const semanaDias = diasDaSemana(semanaInicio)
  const diaPassado   = diaSel < hojeStr
  const diaFuturo    = diaSel > hojeStr

  const stats = useMemo(() => ({
    total: eventos.length,
    realizados: eventos.filter(e => statusEvento(e) === 'passado').length,
    proximos: eventos.filter(e => ['futuro', 'hoje', 'agora'].includes(statusEvento(e))).length,
    esteMes: eventos.filter(e => eventoNoMes(e, ano, mes)).length,
  }), [eventos, ano, mes])

  const eventosHistorico = useMemo(() => {
    const q = normStr(buscaHistorico.trim())
    return eventosFiltradosBase()
      .filter(ev => {
        if (!q) return true
        return normStr(ev.titulo).includes(q)
          || normStr(ev.local || '').includes(q)
          || normStr(ev.observacoes || '').includes(q)
      })
      .sort((a, b) => {
        const sa = statusEvento(a)
        const sb = statusEvento(b)
        const aPass = sa === 'passado'
        const bPass = sb === 'passado'
        if (aPass && bPass) return fimEventoDate(b) - fimEventoDate(a)
        if (!aPass && !bPass) return a.dataInicio.localeCompare(b.dataInicio) || toMin(a.horaInicio) - toMin(b.horaInicio)
        return aPass ? 1 : -1
      })
  }, [eventos, categoriaFiltro, periodoFiltro, buscaHistorico, hojeStr])

  const eventosAgrupados = useMemo(() => {
    const grupos = { agora: [], hoje: [], futuro: [], passado: [] }
    for (const ev of eventosHistorico) {
      const st = statusEvento(ev)
      if (st === 'agora') grupos.agora.push(ev)
      else if (st === 'hoje') grupos.hoje.push(ev)
      else if (st === 'futuro') grupos.futuro.push(ev)
      else grupos.passado.push(ev)
    }
    return grupos
  }, [eventosHistorico])

  /* ── Renderização de datas do evento no card ─────────── */
  function labelPeriodo(ev) {
    if (!ev.dataFim || ev.dataFim === ev.dataInicio) {
      return new Date(ev.dataInicio + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    }
    const di = new Date(ev.dataInicio + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    const df = new Date(ev.dataFim    + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    return `${di} → ${df}`
  }

  /** Representante do dia selecionado para eventos multi-dia */
  function repDoDia(ev, data) {
    const r = (ev.representantes || []).find(r => r.data === data)
    return r?.nome || ''
  }

  function renderEventoCard(ev, diaCtx = diaSel) {
    const cfs      = getConflitos(ev)
    const repHoje  = repDoDia(ev, diaCtx)
    const multiDia = ev.dataFim && ev.dataFim !== ev.dataInicio
    const st       = statusEvento(ev)
    const meta     = STATUS_META[st]
    const opaco    = st === 'passado'
    const marcacao = marcacaoDoEvento(ev.id)

    return (
      <div key={ev.id} className="rounded-2xl overflow-hidden transition-opacity"
        style={{
          background: 'var(--bg-surface)',
          border: `1.5px solid ${ev.cor}${opaco ? '22' : '30'}`,
          borderLeft: `5px solid ${marcacao?.confirmado ? '#10b981' : opaco ? 'rgba(148,163,184,0.45)' : ev.cor}`,
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          opacity: opaco ? 0.88 : 1,
        }}>

        {cfs.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2"
            style={{ background: 'rgba(245,158,11,0.12)', borderBottom: '1px solid rgba(245,158,11,0.30)' }}>
            <AlertTriangle size={13} style={{ color: '#d97706', flexShrink: 0 }} />
            <p style={{ fontSize: 11, color: '#fcd34d' }}>
              <strong>Conflito</strong> com:{' '}
              {cfs.map(e => `${e.titulo} (${e.horaInicio}–${e.horaFim})`).join(', ')}
            </p>
          </div>
        )}

        <div className="px-4 py-3">
          <div className="flex items-start justify-between gap-2 mb-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: opaco ? 'rgba(148,163,184,0.5)' : ev.cor, boxShadow: opaco ? 'none' : `0 1px 4px ${ev.cor}88` }} />
                <h4 className="font-bold txt-1" style={{ fontSize: 15 }}>{ev.titulo}</h4>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold"
                  style={{ fontSize: 9, color: meta.cor, background: meta.bg }}>
                  {st === 'passado' && <CheckCircle2 size={9} />}
                  {meta.label}
                </span>
                {ev._colaborativo && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold"
                    style={{ fontSize: 9, color: '#34d399', background: 'rgba(16,185,129,0.15)' }}>
                    <UserCheck size={9} /> {ev._shareMembro ? `Por ${ev._shareMembro.split(' ')[0]}` : 'Adicionado'}
                  </span>
                )}
                {marcacao?.confirmado && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold"
                    style={{ fontSize: 9, color: '#34d399', background: 'rgba(16,185,129,0.15)' }}>
                    <CheckCircle2 size={9} />
                    {marcacao._membro ? `Confirmado · ${marcacao._membro.split(' ')[0]}` : 'Confirmado'}
                  </span>
                )}
                {(() => {
                  const metaT = metaAgendaTipo(ev)
                  return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold"
                      style={{ fontSize: 9, color: metaT.cor, background: metaT.bg }}>
                      {ehAgendaCandidato(ev) && <Star size={9} />}
                      {metaT.label}
                    </span>
                  )
                })()}
                {ev.privado && (
                  <span className="px-2 py-0.5 rounded-full font-bold"
                    style={{ fontSize: 9, color: 'rgba(203,213,235,0.55)', background: 'rgba(148,163,184,0.12)' }}>
                    Privado
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 ml-5 flex-wrap">
                <span className="font-semibold rounded-full px-2 py-0.5"
                  style={{ fontSize: 10, background: `${ev.cor}18`, color: ev.cor }}>
                  {labelPeriodo(ev)}
                </span>
                {multiDia && (
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>vários dias</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {!ev._colaborativo && (
                <>
                  <button onClick={() => abrirEditar(ev)}
                    className="p-1.5 rounded-xl hov-srf transition-colors">
                    <Pencil size={13} style={{ color: 'rgba(203,213,235,0.60)' }} />
                  </button>
                  <button onClick={() => excluir(ev.id)}
                    className="p-1.5 rounded-xl hover:bg-red-50 transition-colors">
                    <Trash2 size={13} style={{ color: '#f87171' }} />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
            <InfoRow icon={<Clock size={12}/>}  cor={ev.cor} text={`${ev.horaInicio} – ${ev.horaFim}`} />
            {ev.local && (
              <div className="sm:col-span-2">
                <AgendaLocalMapa local={ev.local} cor={ev.cor} />
              </div>
            )}
            {repHoje        && <InfoRow icon={<User size={12}/>}   cor={ev.cor} text={repHoje} />}
            {ev.indicadoPor && <InfoRow icon={<Users size={12}/>}  cor={ev.cor} text={`Ind. por ${ev.indicadoPor}`} />}
            {ev.contato     && <InfoRow icon={<Phone size={12}/>}  cor={ev.cor} text={ev.contato} />}
          </div>

          {multiDia && ev.representantes?.some(r => r.nome) && (
            <div className="mt-2.5 pt-2.5 space-y-1" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="font-bold txt-3 mb-1" style={{ fontSize: 10 }}>REPRESENTANTES POR DIA</p>
              {ev.representantes.filter(r => r.nome).map(r => (
                <div key={r.data} className="flex items-center gap-2">
                  <span className="font-mono rounded-lg px-1.5 py-0.5 flex-shrink-0"
                    style={{ fontSize: 10, background: `${ev.cor}18`, color: ev.cor }}>
                    {new Date(r.data + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </span>
                  <span style={{ fontSize: 12, color: 'rgba(203,213,235,0.62)' }}>{r.nome}</span>
                </div>
              ))}
            </div>
          )}

          {ev.observacoes && (
            <p className="mt-2.5 italic"
              style={{ fontSize: 11, color: 'rgba(203,213,235,0.45)', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 8 }}>
              {ev.observacoes}
            </p>
          )}
        </div>
      </div>
    )
  }

  function renderGrupoHistorico(titulo, lista, corTitulo = 'var(--text-tertiary)') {
    if (!lista.length) return null
    return (
      <div className="mb-6">
        <p className="font-bold uppercase tracking-wide mb-3" style={{ fontSize: 11, color: corTitulo }}>
          {titulo} ({lista.length})
        </p>
        <div className="space-y-3">{lista.map(ev => renderEventoCard(ev, ev.dataInicio))}</div>
      </div>
    )
  }

  /* ════════════════════════════════════════════════════════
     JSX principal
  ════════════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col md:flex-row flex-1 overflow-hidden" >

      {/* ── Painel esquerdo: Calendário ──────────────────── */}
      <div className="w-full md:w-80 flex flex-col srf flex-shrink-0 min-w-0"
        style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>

        {/* Header */}
        <div className="flex-shrink-0 px-4 py-4"
          style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="page-header-rule" style={{ marginBottom: 12 }} aria-hidden />
          <div className="flex items-center gap-3 mb-3">
            <div className="page-header-icon" style={{ width: 40, height: 40, borderRadius: 12 }}>
              <CalendarDays size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-white truncate" style={{ fontSize: 14 }}>Agenda</h2>
              <p className="txt-3 truncate" style={{ fontSize: 11 }}>Eventos e compromissos</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            <SaveButton variant="ghost" compact label="Salvar" className="flex-1 justify-center !px-2 !py-1.5 min-w-[72px]" />
            <button type="button" onClick={() => { setModalShare(true); setLinkGerado('') }}
              className="btn-ghost flex-1 flex items-center justify-center gap-1 font-bold rounded-xl px-2 py-1.5 transition-all min-w-0"
              style={{ fontSize: 11 }}
              title="Compartilhar agenda">
              <Share2 size={13} className="flex-shrink-0" />
              <span className="truncate">Share</span>
            </button>
            <button type="button" onClick={copiarBriefing}
              className="btn-primary flex items-center justify-center gap-1 font-bold rounded-xl px-2 py-1.5"
              style={{ fontSize: 11 }}
              title="Copiar briefing do candidato (WhatsApp)">
              <MessageSquare size={13} />
              {briefingOk ? 'OK' : 'Brief'}
            </button>
            <button type="button" onClick={() => setModalImport(true)}
              className="btn-ghost flex items-center justify-center gap-1 font-bold rounded-xl px-2 py-1.5"
              style={{ fontSize: 11 }}
              title="Importar foto ou texto da agenda">
              <Upload size={13} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Total', value: stats.total },
              { label: 'Realizados', value: stats.realizados },
              { label: 'Próximos', value: stats.proximos },
              { label: 'Este mês', value: stats.esteMes },
            ].map(({ label, value }) => (
                <div key={label} className="rounded-xl px-2 py-2 text-center min-w-0"
                  style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
                  <p className="text-white font-bold leading-none tnum" style={{ fontSize: 18, color: label === 'Total' ? 'var(--gold-bright)' : undefined }}>{value}</p>
                  <p className="txt-3 mt-0.5 truncate" style={{ fontSize: 10 }}>{label}</p>
                </div>
              ))}
          </div>
        </div>

        {/* Navegação de mês */}
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <button onClick={() => navMes(-1)} className="p-1.5 rounded-xl hov-srf transition-colors">
            <ChevronLeft size={16} style={{ color: 'rgba(203,213,235,0.60)' }} />
          </button>
          <span className="font-bold txt-1" style={{ fontSize: 13 }}>{MESES[mes]} {ano}</span>
          <button onClick={() => navMes(1)} className="p-1.5 rounded-xl hov-srf transition-colors">
            <ChevronRight size={16} style={{ color: 'rgba(203,213,235,0.60)' }} />
          </button>
        </div>

        {/* Filtros + View Toggle */}
        <div className="px-4 py-2 flex-shrink-0 space-y-2"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex rounded-lg overflow-hidden w-full" style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
            {[
              { id: 'todas', label: 'Todas' },
              { id: 'candidato', label: 'Candidato' },
              { id: 'equipe', label: 'Equipe' },
            ].map(v => (
              <button key={v.id} type="button" onClick={() => setAgendaTipoFiltro(v.id)}
                className="flex-1 px-2 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  background: agendaTipoFiltro === v.id
                    ? (v.id === 'candidato' ? 'rgba(245,158,11,0.35)' : 'rgba(37,99,235,0.35)')
                    : 'transparent',
                  color: agendaTipoFiltro === v.id
                    ? (v.id === 'candidato' ? '#fcd34d' : '#fff')
                    : 'var(--text-tertiary)',
                }}>
                {v.label}
              </button>
            ))}
          </div>
          <select
            value={categoriaFiltro}
            onChange={e => setCategoriaFiltro(e.target.value)}
            className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-soft)', color: 'var(--text-secondary)' }}
          >
            <option value="todas">Todas categorias</option>
            {CATEGORIAS.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1">
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'futuros', label: 'Futuros' },
              { id: 'passados', label: 'Passados' },
              { id: 'hoje', label: 'Hoje' },
            ].map(p => (
              <button key={p.id} type="button" onClick={() => setPeriodoFiltro(p.id)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  background: periodoFiltro === p.id ? 'rgba(37,99,235,0.22)' : 'var(--bg-raised)',
                  color: periodoFiltro === p.id ? '#93c5fd' : 'var(--text-tertiary)',
                  border: periodoFiltro === p.id ? '1px solid rgba(59,130,246,0.35)' : '1px solid var(--border-soft)',
                }}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg overflow-hidden w-full" style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
            {[
              { id: 'dia', label: 'Dia' },
              { id: 'semana', label: 'Semana' },
              { id: 'mes', label: 'Mês' },
              { id: 'historico', label: 'Hist.' },
            ].map(v => (
              <button
                key={v.id}
                type="button"
                onClick={() => setViewMode(v.id)}
                className={`flex-1 px-1.5 py-1 text-xs font-semibold transition-colors ${
                  viewMode === v.id ? 'bg-blue-500 text-white' : 'srf txt-2 hov-srf'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Compartilhado com — só pessoas que receberam link */}
        {compartilhamentos.length > 0 && (
          <div className="px-4 py-2 flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <label className="block font-semibold mb-1.5" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
              Compartilhado com
            </label>
            <select
              value={filtroCompartilhado}
              onChange={e => setFiltroCompartilhado(e.target.value)}
              className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-soft)', color: 'var(--text-secondary)' }}
            >
              <option value="">Minha agenda (só meus eventos)</option>
              <option value={FILTRO_TODA_EQUIPE}>
                Toda a equipe{totalAcoesEquipe > 0 ? ` (+${totalAcoesEquipe} da equipe)` : ''}
              </option>
              {compartilhamentos.map(s => {
                const col = colaboracoes[s.shareId]
                const nAcoes = (col?.eventosAdicionados?.length || 0) + Object.keys(col?.marcacoes || {}).length
                return (
                  <option key={s.shareId} value={s.shareId}>
                    {s.membroNome}{nAcoes > 0 ? ` (${nAcoes} ações)` : ''}
                  </option>
                )
              })}
            </select>
            {filtroCompartilhado === FILTRO_TODA_EQUIPE && (
              <p className="mt-1.5" style={{ fontSize: 10, color: '#93c5fd' }}>
                Sua agenda + eventos adicionados por toda a equipe
              </p>
            )}
            {filtroCompartilhado && filtroCompartilhado !== FILTRO_TODA_EQUIPE && (
              <p className="mt-1.5" style={{ fontSize: 10, color: '#93c5fd' }}>
                Exibindo eventos e marcações desta pessoa
              </p>
            )}
          </div>
        )}

        {/* Calendário — visível em Dia e Histórico */}
        {(viewMode === 'dia' || viewMode === 'historico') && (
          <>
            <div className="grid grid-cols-7 px-3 pt-2 pb-1 flex-shrink-0">
              {DIAS_SEMANA.map(d => (
                <div key={d} className="text-center font-bold" style={{ fontSize: 9, color: 'rgba(203,213,235,0.45)' }}>{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 px-3 pb-3 gap-y-0.5 flex-shrink-0">
              {celulas.map((dia, i) => {
                if (!dia) return <div key={i} />
                const ds     = toDataStr(dia)
                const evsDia = eventosNoDia(ds)
                const isHoje   = ds === hojeStr
                const isSel    = ds === diaSel
                const isPass   = ds < hojeStr
                const temCf    = evsDia.length > 1 && evsDia.some(a => evsDia.some(b => conflita(a, b)))
                return (
                  <button key={i} onClick={() => { setDiaSel(ds); if (viewMode === 'historico') setViewMode('dia') }}
                    className="flex flex-col items-center py-1 rounded-xl transition-all"
                    style={{
                      background: isSel ? '#1d4ed8' : isHoje ? 'rgba(37,99,235,0.16)' : isPass ? 'rgba(148,163,184,0.06)' : 'transparent',
                      color: isSel ? '#fff' : isHoje ? '#1d4ed8' : isPass ? 'rgba(203,213,235,0.45)' : 'rgba(235,240,255,0.92)',
                    }}>
                    <span className="font-semibold" style={{ fontSize: 12 }}>{dia}</span>
                    <div className="flex gap-0.5 mt-0.5 min-h-[6px]">
                      {evsDia.slice(0, 3).map(e => (
                        <div key={e.id} className="w-1 h-1 rounded-full"
                          style={{ background: isSel ? 'rgba(255,255,255,0.8)' : statusEvento(e) === 'passado' ? 'rgba(148,163,184,0.55)' : e.cor }} />
                      ))}
                      {temCf && !isSel && <div className="w-1 h-1 rounded-full" style={{ background: '#f59e0b' }} />}
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* Month view — lista de todos os eventos do mês */}
        {viewMode === 'mes' && (
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {(() => {
              const eventosMes = eventosFiltradosBase()
                .filter(e => eventoNoMes(e, ano, mes))
                .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio) || toMin(a.horaInicio) - toMin(b.horaInicio))

              if (eventosMes.length === 0) {
                return (
                  <div className="text-center py-12">
                    <CalendarDays size={32} style={{ color: 'rgba(203,213,235,0.40)', marginBottom: 8 }} />
                    <p className="txt-3" style={{ fontSize: 12 }}>Nenhum evento este mês</p>
                  </div>
                )
              }

              return eventosMes.map(ev => {
                const cat = CATEGORIAS.find(c => c.id === ev.categoria) || CATEGORIAS[5]
                const st = statusEvento(ev)
                const meta = STATUS_META[st]
                return (
                  <button key={ev.id} type="button"
                    onClick={() => { setDiaSel(ev.dataInicio); setViewMode('dia') }}
                    className="w-full rounded-xl p-3 flex items-center gap-3 text-left transition-colors hov-srf"
                    style={{ background: 'var(--bg-surface)', border: '1.5px solid rgba(255,255,255,0.07)', opacity: st === 'passado' ? 0.85 : 1 }}>
                    <div className="w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0"
                      style={{ background: cat.cor + '15', border: `1.5px solid ${cat.cor}30` }}>
                      <span className="font-bold" style={{ fontSize: 14, color: cat.cor }}>
                        {new Date(ev.dataInicio + 'T12:00').getDate()}
                      </span>
                      <span style={{ fontSize: 8, color: cat.cor + 'cc', textTransform: 'uppercase' }}>
                        {MESES[mes].slice(0, 3)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold txt-1 truncate" style={{ fontSize: 12 }}>{ev.titulo}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background: cat.cor + '15', color: cat.cor }}>
                          {cat.label}
                        </span>
                        <span className="txt-3" style={{ fontSize: 11 }}>{ev.horaInicio} – {ev.horaFim}</span>
                        <span className="px-1.5 py-0.5 rounded-full font-bold"
                          style={{ fontSize: 9, color: meta.cor, background: meta.bg }}>{meta.label}</span>
                      </div>
                      {ev.local && <p className="txt-3 truncate mt-0.5" style={{ fontSize: 10 }}>📍 {ev.local}</p>}
                    </div>
                  </button>
                )
              })
            })()}
          </div>
        )}

        {/* Botão "Hoje" */}
        {(viewMode === 'dia' || viewMode === 'historico') && (
          <div className="px-4 pb-4 mt-auto flex-shrink-0">
            <button onClick={() => { setDiaSel(hojeStr); setMes(hoje.getMonth()); setAno(hoje.getFullYear()); setPeriodoFiltro('hoje'); setViewMode('dia') }}
              className="w-full py-2 rounded-2xl font-semibold transition-all"
              style={{ fontSize: 12, background: 'rgba(37,99,235,0.16)', color: '#1d4ed8', border: '1.5px solid #bfdbfe' }}>
              Ir para hoje
            </button>
          </div>
        )}
      </div>

      {/* ── Painel direito: Eventos do dia — só na visão de dia ───────────────── */}
      {viewMode === 'dia' && (
        <div className="flex-1 flex flex-col md:overflow-hidden">

        {/* Cabeçalho do dia */}
        <div className="flex-shrink-0 px-4 md:px-6 py-4 srf flex items-center justify-between gap-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold txt-1 capitalize truncate" style={{ fontSize: 16 }}>
                {new Date(diaSel + 'T12:00').toLocaleDateString('pt-BR', {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                })}
              </h3>
              {diaPassado && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold"
                  style={{ fontSize: 10, background: 'rgba(148,163,184,0.15)', color: 'rgba(203,213,235,0.65)' }}>
                  <History size={10} /> Passado
                </span>
              )}
              {diaSel === hojeStr && (
                <span className="px-2 py-0.5 rounded-full font-bold"
                  style={{ fontSize: 10, background: 'rgba(59,130,246,0.18)', color: '#93c5fd' }}>Hoje</span>
              )}
              {diaFuturo && (
                <span className="px-2 py-0.5 rounded-full font-bold"
                  style={{ fontSize: 10, background: 'rgba(6,182,212,0.15)', color: '#22d3ee' }}>Futuro</span>
              )}
            </div>
            <p style={{ fontSize: 12, color: 'rgba(203,213,235,0.45)', marginTop: 2 }}>
              {eventosDoDia.length === 0
                ? (diaPassado ? 'Nenhum evento registrado neste dia' : 'Nenhum evento')
                : `${eventosDoDia.length} evento${eventosDoDia.length > 1 ? 's' : ''}${diaPassado ? ' realizados' : ''}`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => abrirNovo('candidato')}
              className="flex items-center gap-1.5 font-bold px-3 py-2.5 rounded-2xl transition-all"
              style={{ background: 'rgba(245,158,11,0.2)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.45)', fontSize: 12 }}>
              <Star size={14} /> <span className="hidden sm:inline">Agenda candidato</span>
            </button>
            <button onClick={() => abrirNovo('equipe')}
              className="flex items-center gap-2 text-white font-bold px-3 sm:px-4 py-2.5 rounded-2xl transition-all"
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)', fontSize: 13,
                       boxShadow: '0 4px 14px rgba(79,70,229,0.35)' }}>
              <Plus size={16} /> <span className="hidden sm:inline">Equipe</span>
            </button>
          </div>
        </div>

        {proximoCandidato && diaSel === hojeStr && (
          <div className="md:hidden mx-3 mt-3 rounded-2xl px-3 py-2.5 flex items-center gap-3"
            style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)' }}>
            <Star size={16} style={{ color: '#fbbf24', flexShrink: 0 }} />
            <div className="min-w-0 flex-1">
              <p className="font-bold truncate" style={{ fontSize: 12, color: '#fcd34d' }}>Próximo do candidato</p>
              <p className="truncate txt-2" style={{ fontSize: 11 }}>
                {proximoCandidato.horaInicio} · {proximoCandidato.titulo}
              </p>
            </div>
            <button type="button" onClick={() => setDiaSel(proximoCandidato.dataInicio)}
              className="text-xs font-bold px-2 py-1 rounded-lg"
              style={{ color: '#fbbf24', background: 'rgba(245,158,11,0.2)' }}>Ver</button>
          </div>
        )}

        {/* Lista de eventos */}
        <div className="flex-1 overflow-y-auto px-3 md:px-6 py-5">
          {eventosDoDia.length === 0 ? (
            <div className="text-center py-24">
              <div className="w-20 h-20 rounded-3xl mx-auto mb-5 flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.07)' }}>
                <CalendarDays size={36} style={{ color: 'rgba(203,213,235,0.40)' }} />
              </div>
              <p className="font-bold txt-3" style={{ fontSize: 16 }}>
                {diaPassado ? 'Nenhum evento registrado neste dia' : 'Nenhum evento neste dia'}
              </p>
              <p style={{ fontSize: 13, color: 'rgba(203,213,235,0.45)', marginTop: 6 }}>
                {diaPassado
                  ? 'Selecione outro dia no calendário ou use a aba Histórico'
                  : 'Use "Agenda candidato" ou "Equipe" para adicionar'}
              </p>
            </div>
          ) : (
            <div className="space-y-5 max-w-3xl mx-auto">
              {eventosCandidatoDia.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Star size={14} style={{ color: '#fbbf24' }} />
                    <p className="font-bold uppercase tracking-wide" style={{ fontSize: 11, color: '#fcd34d' }}>
                      {diaSel === hojeStr ? 'Hoje com o candidato' : 'Com o candidato'} ({eventosCandidatoDia.length})
                    </p>
                  </div>
                  <div className="space-y-3">
                    {eventosCandidatoDia.map(ev => renderEventoCard(ev, diaSel))}
                  </div>
                </div>
              )}
              {eventosEquipeSoDia.length > 0 && (
                <div>
                  {eventosCandidatoDia.length > 0 && (
                    <p className="font-bold uppercase tracking-wide mb-3" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      Equipe ({eventosEquipeSoDia.length})
                    </p>
                  )}
                  <div className="space-y-3">
                    {eventosEquipeSoDia.map(ev => renderEventoCard(ev, diaSel))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {/* ── Vista Semana ──────────────────────────────────── */}
      {viewMode === 'semana' && (
        <div className="flex-1 flex flex-col md:overflow-hidden">
          <div className="flex-shrink-0 px-4 md:px-6 py-4 srf flex items-center justify-between gap-3"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
            <div>
              <h3 className="font-bold txt-1" style={{ fontSize: 16 }}>Semana</h3>
              <p className="txt-3" style={{ fontSize: 12 }}>
                {new Date(semanaInicio + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                {' — '}
                {new Date(semanaDias[6] + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDiaSel(addDaysIso(semanaInicio, -7))}
                className="p-2 rounded-xl hov-srf"><ChevronLeft size={16} /></button>
              <button type="button" onClick={() => setDiaSel(hojeStr)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold"
                style={{ background: 'rgba(37,99,235,0.2)', color: '#93c5fd' }}>Hoje</button>
              <button type="button" onClick={() => setDiaSel(addDaysIso(semanaInicio, 7))}
                className="p-2 rounded-xl hov-srf"><ChevronRight size={16} /></button>
            </div>
          </div>
          <div className="flex-1 overflow-auto px-2 md:px-4 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-7 gap-2 min-w-0">
              {semanaDias.map(ds => {
                const evs = eventosNoDia(ds)
                const isHoje = ds === hojeStr
                const isSel = ds === diaSel
                return (
                  <button key={ds} type="button" onClick={() => { setDiaSel(ds); setViewMode('dia') }}
                    className="rounded-2xl p-2.5 text-left min-h-[120px] transition-colors"
                    style={{
                      background: isSel ? 'rgba(37,99,235,0.18)' : 'var(--bg-surface)',
                      border: isHoje ? '1.5px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.08)',
                    }}>
                    <p className="font-bold mb-2" style={{ fontSize: 11, color: isHoje ? '#93c5fd' : 'var(--text-secondary)' }}>
                      {new Date(ds + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' })}
                    </p>
                    <div className="space-y-1">
                      {evs.slice(0, 5).map(e => (
                        <div key={e.id} className="rounded-lg px-1.5 py-1 truncate"
                          style={{
                            fontSize: 10,
                            background: ehAgendaCandidato(e) ? 'rgba(245,158,11,0.15)' : `${e.cor}18`,
                            color: ehAgendaCandidato(e) ? '#fcd34d' : e.cor,
                            borderLeft: `3px solid ${ehAgendaCandidato(e) ? '#f59e0b' : e.cor}`,
                          }}>
                          {e.horaInicio} {e.titulo}
                        </div>
                      ))}
                      {evs.length > 5 && (
                        <p className="txt-3" style={{ fontSize: 10 }}>+{evs.length - 5}</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {viewMode === 'historico' && (
        <div className="flex-1 flex flex-col md:overflow-hidden">
          <div className="flex-shrink-0 px-4 md:px-6 py-4 srf flex items-center justify-between gap-3 flex-wrap"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div>
              <h3 className="font-bold txt-1 flex items-center gap-2" style={{ fontSize: 16 }}>
                <History size={18} style={{ color: '#93c5fd' }} />
                Histórico de eventos
              </h3>
              <p style={{ fontSize: 12, color: 'rgba(203,213,235,0.45)', marginTop: 2 }}>
                {eventosHistorico.length} evento{eventosHistorico.length !== 1 ? 's' : ''} · {stats.realizados} realizados
              </p>
            </div>
            <button onClick={abrirNovo}
              className="flex items-center gap-2 text-white font-bold px-3 sm:px-5 py-2.5 rounded-2xl transition-all flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)', fontSize: 13,
                       boxShadow: '0 4px 14px rgba(79,70,229,0.35)' }}>
              <Plus size={16} /> <span className="hidden sm:inline">Novo Evento</span>
            </button>
          </div>

          <div className="px-4 md:px-6 py-3 srf flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="relative max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
              <input value={buscaHistorico} onChange={e => setBuscaHistorico(e.target.value)}
                placeholder="Buscar por título, local ou observação..."
                className="w-full pl-9 pr-3 py-2 rounded-xl text-sm input-dark focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 md:px-6 py-5">
            {eventosHistorico.length === 0 ? (
              <div className="text-center py-24">
                <History size={40} style={{ color: 'rgba(203,213,235,0.35)', margin: '0 auto 12px' }} />
                <p className="font-bold txt-3" style={{ fontSize: 16 }}>Nenhum evento encontrado</p>
                <p style={{ fontSize: 13, color: 'rgba(203,213,235,0.45)', marginTop: 6 }}>
                  Ajuste os filtros ou cadastre um novo evento
                </p>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto">
                {renderGrupoHistorico('Acontecendo agora', eventosAgrupados.agora, '#10b981')}
                {renderGrupoHistorico('Hoje', eventosAgrupados.hoje, '#3b82f6')}
                {renderGrupoHistorico('Próximos', eventosAgrupados.futuro, '#06b6d4')}
                {renderGrupoHistorico('Realizados', eventosAgrupados.passado, 'rgba(203,213,235,0.55)')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal Novo / Editar ────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-lg rounded-3xl overflow-hidden"
            style={{ background: 'var(--bg-surface)', boxShadow: '0 24px 80px rgba(0,0,0,0.28)' }}>

            {/* Cabeçalho do modal */}
            <div className="flex items-center justify-between px-6 py-4"
              style={{ background: 'linear-gradient(135deg,#1e3a8a,#1e40af)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.18)' }}>
                  <CalendarDays size={17} className="text-white" />
                </div>
                <h3 className="font-bold text-white" style={{ fontSize: 15 }}>
                  {modal === 'novo'
                    ? (form.agendaTipo === 'candidato' ? 'Agenda do candidato' : 'Novo Evento')
                    : 'Editar Evento'}
                </h3>
              </div>
              <button onClick={fechar} className="p-1.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                <X size={16} />
              </button>
            </div>

            {/* Aviso de conflito */}
            {cfAviso.length > 0 && (
              <div className="flex items-start gap-3 px-5 py-3"
                style={{
                  background: cfForte ? 'rgba(239,68,68,0.14)' : 'rgba(245,158,11,0.12)',
                  borderBottom: `1.5px solid ${cfForte ? 'rgba(239,68,68,0.35)' : 'rgba(245,158,11,0.30)'}`,
                }}>
                <AlertTriangle size={16} style={{ color: cfForte ? '#f87171' : '#d97706', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p className="font-bold" style={{ fontSize: 12, color: cfForte ? '#fca5a5' : '#fcd34d' }}>
                    {cfForte ? 'Conflito na agenda do candidato!' : 'Conflito de horário!'}
                  </p>
                  <p style={{ fontSize: 11, color: cfForte ? '#f87171' : '#b45309', marginTop: 2 }}>
                    Conflita com: <strong>{cfAviso.map(e => `${e.titulo} (${e.horaInicio}–${e.horaFim})`).join(', ')}</strong>.
                    {cfForte
                      ? ' O candidato não pode estar em dois lugares. Confirme só se for intencional.'
                      : ' Clique em "Salvar mesmo assim" para confirmar.'}
                  </p>
                </div>
              </div>
            )}

            {/* Corpo do formulário */}
            <div className="px-6 py-4 space-y-3.5 overflow-y-auto" style={{ maxHeight: '60vh' }}>

              {/* Tipo de agenda */}
              <Field label="Agenda">
                <div className="flex flex-wrap gap-1.5">
                  {AGENDA_TIPOS.map(t => (
                    <button key={t.id} type="button"
                      onClick={() => {
                        setForm(p => ({
                          ...p,
                          agendaTipo: t.id,
                          candidatoPresente: t.id !== 'equipe' ? p.candidatoPresente !== false : false,
                          cor: t.id === 'candidato' ? '#f59e0b' : p.cor,
                        }))
                        setCfAviso([]); setCfForte(false)
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                      style={{
                        background: form.agendaTipo === t.id ? t.bg : 'rgba(255,255,255,0.04)',
                        color: form.agendaTipo === t.id ? t.cor : 'var(--text-tertiary)',
                        border: `1.5px solid ${form.agendaTipo === t.id ? t.cor + '66' : 'rgba(255,255,255,0.08)'}`,
                      }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Título + cor */}
              <div className="flex gap-3 items-end">
                <Field label="Título *">
                  <input value={form.titulo}
                    onChange={e => { updForm('titulo', e.target.value); setCfAviso([]); setCfForte(false) }}
                    placeholder={form.agendaTipo === 'candidato' ? 'Ex: Gabinete com líderes' : 'Ex: Visita à AD Garcia'}
                    className={INPUT_CLS} style={INPUT_STY} />
                </Field>
                <div>
                  <label className="block font-semibold mb-1" style={{ fontSize: 11, color: 'rgba(203,213,235,0.60)', textTransform: 'capitalize' }}>Cor</label>
                  <div className="flex flex-wrap gap-1" style={{ width: 88 }}>
                    {CORES_EVENTO.map(c => (
                      <button key={c} onClick={() => updForm('cor', c)} className="rounded-lg transition-all"
                        style={{ width: 22, height: 22, backgroundColor: c,
                                 transform: form.cor === c ? 'scale(1.35)' : 'scale(1)',
                                 outline: form.cor === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Categoria */}
              <Field label="Categoria">
                <select
                  value={form.categoria}
                  onChange={e => updForm('categoria', e.target.value)}
                  className={INPUT_CLS} style={INPUT_STY}
                >
                  {CATEGORIAS.map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </Field>

              {/* Datas de início e fim + horários */}
              <div className="grid grid-cols-2 gap-2">
                <Field label="Data de início *">
                  <input type="date" value={form.dataInicio}
                    onChange={e => {
                      const di = e.target.value
                      const df = form.dataFim && form.dataFim >= di ? form.dataFim : di
                      const reps = syncRepresentantes(di, df, form.representantes)
                      setForm(p => ({ ...p, dataInicio: di, dataFim: df, representantes: reps }))
                      setCfAviso([])
                    }}
                    className={INPUT_CLS} style={{ ...INPUT_STY, fontSize: 12 }} />
                </Field>
                <Field label="Data de fim *">
                  <input type="date" value={form.dataFim}
                    min={form.dataInicio}
                    onChange={e => {
                      const df = e.target.value
                      const reps = syncRepresentantes(form.dataInicio, df, form.representantes)
                      setForm(p => ({ ...p, dataFim: df, representantes: reps }))
                      setCfAviso([])
                    }}
                    className={INPUT_CLS} style={{ ...INPUT_STY, fontSize: 12 }} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Horário de início *">
                  <input type="time" value={form.horaInicio}
                    onChange={e => { updForm('horaInicio', e.target.value); setCfAviso([]); setCfForte(false) }}
                    className={INPUT_CLS} style={{ ...INPUT_STY, fontSize: 12 }} />
                </Field>
                <Field label="Horário de fim *">
                  <input type="time" value={form.horaFim}
                    onChange={e => { updForm('horaFim', e.target.value); setCfAviso([]); setCfForte(false) }}
                    className={INPUT_CLS} style={{ ...INPUT_STY, fontSize: 12 }} />
                </Field>
              </div>

              {/* Local — autocomplete */}
              <div>
                <label className="block font-semibold mb-1" style={{ fontSize: 11, color: 'rgba(203,213,235,0.60)' }}>Local</label>
                <div className="relative" ref={localRef}>
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: 'rgba(203,213,235,0.45)' }} />
                    <input value={localQuery}
                      onChange={e => { setLocalQuery(e.target.value); updForm('local', e.target.value); setLocalFocus(true) }}
                      onFocus={() => setLocalFocus(true)}
                      onBlur={() => setTimeout(() => setLocalFocus(false), 150)}
                      placeholder="Busque pelo nome da igreja ou endereço…"
                      className={INPUT_CLS} style={{ ...INPUT_STY, paddingLeft: 32 }} />
                    {localQuery && (
                      <button type="button" onClick={() => { setLocalQuery(''); updForm('local', '') }}
                        className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(203,213,235,0.45)' }}>
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  {localFocus && localSugestoes.length > 0 && (
                    <div className="absolute z-50 left-0 right-0 mt-1 rounded-2xl overflow-hidden"
                      style={{ background: 'var(--bg-surface)', border: '1.5px solid rgba(255,255,255,0.12)',
                               boxShadow: '0 8px 32px rgba(0,0,0,0.14)', maxHeight: 220, overflowY: 'auto' }}>
                      {localSugestoes.map(ig => (
                        <button key={ig.id} type="button" onMouseDown={() => selecionarLocal(ig)}
                          className="w-full flex items-start gap-3 px-4 py-2.5 text-left hov-srf transition-colors">
                          <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ background: 'rgba(37,99,235,0.16)' }}>
                            <Church size={13} style={{ color: '#1d4ed8' }} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold txt-1 truncate" style={{ fontSize: 12 }}>{ig.nome}</p>
                            <p className="txt-3 truncate" style={{ fontSize: 10 }}>{ig.endereco}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {localFocus && localQuery.length >= 1 && localSugestoes.length === 0 && (
                    <div className="absolute z-50 left-0 right-0 mt-1 rounded-2xl overflow-hidden"
                      style={{ background: 'var(--bg-surface)', border: '1.5px solid rgba(255,255,255,0.12)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
                      <button type="button" onMouseDown={() => { updForm('local', localQuery); setLocalFocus(false) }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hov-srf transition-colors">
                        <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: 'rgba(16,185,129,0.12)' }}>
                          <MapPin size={13} style={{ color: '#059669' }} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold txt-2 truncate" style={{ fontSize: 12 }}>Usar como local personalizado</p>
                          <p className="txt-3 truncate" style={{ fontSize: 10 }}>{localQuery}</p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Representantes por dia */}
              <div>
                <label className="block font-semibold mb-2" style={{ fontSize: 11, color: 'rgba(203,213,235,0.60)', textTransform: 'capitalize' }}>
                  {form.dataFim && form.dataFim !== form.dataInicio
                    ? 'Representantes por dia'
                    : 'Representante'}
                </label>
                <div className="space-y-1.5 rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.07)' }}>
                  {form.representantes.map((rep, idx) => {
                    const labelData = rep.data
                      ? new Date(rep.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
                      : '—'
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        {form.dataFim && form.dataFim !== form.dataInicio && (
                          <span className="font-mono font-bold rounded-xl px-2 py-1.5 flex-shrink-0 text-center"
                            style={{ fontSize: 10, background: `${form.cor}18`, color: form.cor, minWidth: 72 }}>
                            {labelData}
                          </span>
                        )}
                        <div className="relative flex-1">
                          <input
                            value={rep.nome}
                            onChange={e => {
                              const reps = form.representantes.map((r, i) =>
                                i === idx ? { ...r, nome: e.target.value } : r
                              )
                              updForm('representantes', reps)
                              setRepFocusIdx(idx)
                            }}
                            onFocus={() => setRepFocusIdx(idx)}
                            onBlur={() => setTimeout(() => setRepFocusIdx(null), 150)}
                            placeholder="Quem vai representar"
                            className={INPUT_CLS} style={{ ...INPUT_STY, fontSize: 12 }} />
                          {repFocusIdx === idx && membrosEquipe.length > 0 && (() => {
                            const q = rep.nome.toLowerCase()
                            const filtrados = membrosEquipe.filter(m =>
                              !q || m.nome.toLowerCase().includes(q)
                            )
                            if (!filtrados.length) return null
                            return (
                              <div className="absolute z-50 left-0 right-0 mt-1 rounded-xl overflow-hidden"
                                style={{ background:'var(--bg-overlay)', border:'1px solid rgba(255,255,255,0.12)', boxShadow:'0 8px 32px rgba(0,0,0,0.55)', top:'100%' }}>
                                {filtrados.slice(0, 8).map(m => (
                                  <button key={m.id} type="button"
                                    onMouseDown={() => {
                                      const reps = form.representantes.map((r, i) =>
                                        i === idx ? { ...r, nome: m.nome } : r
                                      )
                                      updForm('representantes', reps)
                                      setRepFocusIdx(null)
                                    }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hov-srf transition-colors">
                                    <div className="w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-white font-bold"
                                      style={{ fontSize: 9, background: `hsl(${(m.id.charCodeAt(0) * 37) % 360},55%,45%)` }}>
                                      {m.nome.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold txt-1 truncate">{m.nome}</p>
                                      <p className="txt-3 truncate" style={{fontSize:10}}>{m.cargo}</p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Presença + assessor (candidato) */}
              {ehAgendaCandidato(form) && (
                <div className="space-y-3 rounded-2xl p-3"
                  style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold txt-1" style={{ fontSize: 12 }}>Candidato presente</p>
                      <p className="txt-3" style={{ fontSize: 10 }}>Desmarque se for só representação</p>
                    </div>
                    <button type="button" onClick={() => updForm('candidatoPresente', !form.candidatoPresente)}
                      className="relative rounded-full flex-shrink-0 transition-all"
                      style={{ width: 42, height: 24, background: form.candidatoPresente !== false ? '#f59e0b' : 'rgba(255,255,255,0.12)' }}>
                      <div className="absolute top-1 rounded-full transition-all"
                        style={{ width: 16, height: 16, background: '#fff', left: form.candidatoPresente !== false ? 22 : 4 }} />
                    </button>
                  </div>
                  <Field label="Assessor responsável">
                    <select value={form.assessorId || ''} onChange={e => updForm('assessorId', e.target.value)}
                      className={INPUT_CLS} style={{ ...INPUT_STY, fontSize: 12, background: 'var(--bg-raised)' }}>
                      <option value="">— Nenhum —</option>
                      {membrosEquipe.map(m => (
                        <option key={m.id} value={m.id}>{m.nome} — {m.cargo}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}

              {/* Recorrência */}
              {modal === 'novo' && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Repetir">
                    <select value={form.recorrencia || 'nenhuma'}
                      onChange={e => updForm('recorrencia', e.target.value)}
                      className={INPUT_CLS} style={{ ...INPUT_STY, fontSize: 12 }}>
                      {RECORRENCIAS.map(r => (
                        <option key={r.id} value={r.id}>{r.label}</option>
                      ))}
                    </select>
                  </Field>
                  {form.recorrencia && form.recorrencia !== 'nenhuma' && (
                    <Field label="Até">
                      <input type="date" value={form.recorrenciaAte || ''}
                        min={form.dataInicio}
                        onChange={e => updForm('recorrenciaAte', e.target.value)}
                        className={INPUT_CLS} style={{ ...INPUT_STY, fontSize: 12 }} />
                    </Field>
                  )}
                </div>
              )}

              {/* Indicado por + Contato */}
              <div className="grid grid-cols-2 gap-2">
                <Field label="Indicado por">
                  <input value={form.indicadoPor} onChange={e => updForm('indicadoPor', e.target.value)}
                    placeholder="Quem indicou"
                    className={INPUT_CLS} style={{ ...INPUT_STY, fontSize: 12 }} />
                </Field>
                <Field label="Contato">
                  <input value={form.contato} onChange={e => updForm('contato', e.target.value)}
                    placeholder="Telefone / WhatsApp"
                    className={INPUT_CLS} style={{ ...INPUT_STY, fontSize: 12 }} />
                </Field>
              </div>

              {/* Privado */}
              <div className="flex items-center justify-between rounded-2xl px-3 py-2.5"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div>
                  <p className="font-semibold txt-1" style={{ fontSize: 12 }}>Evento privado</p>
                  <p className="txt-3" style={{ fontSize: 10 }}>Não entra no link compartilhado</p>
                </div>
                <button type="button" onClick={() => updForm('privado', !form.privado)}
                  className="relative rounded-full flex-shrink-0 transition-all"
                  style={{ width: 42, height: 24, background: form.privado ? '#64748b' : 'rgba(255,255,255,0.12)' }}>
                  <div className="absolute top-1 rounded-full transition-all"
                    style={{ width: 16, height: 16, background: '#fff', left: form.privado ? 22 : 4 }} />
                </button>
              </div>

              {/* Observações */}
              <Field label="Observações">
                <textarea value={form.observacoes} onChange={e => updForm('observacoes', e.target.value)}
                  placeholder="Notas adicionais…" rows={2}
                  className={`${INPUT_CLS} resize-none`} style={{ ...INPUT_STY, fontSize: 12 }} />
              </Field>
            </div>

            {/* Rodapé do modal */}
            <div className="px-6 py-4 flex gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <button onClick={fechar} className="px-5 py-2.5 rounded-2xl font-semibold transition-all"
                style={{ border: '1.5px solid rgba(255,255,255,0.12)', color: 'rgba(203,213,235,0.60)', fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={salvar}
                disabled={!form.titulo.trim() || !form.dataInicio || !form.horaInicio || !form.horaFim}
                className="flex-1 py-2.5 rounded-2xl font-bold text-white transition-all disabled:opacity-50"
                style={{
                  background: cfForte
                    ? 'linear-gradient(135deg,#b91c1c,#ef4444)'
                    : cfAviso.length > 0
                    ? 'linear-gradient(135deg,#d97706,#f59e0b)'
                    : 'linear-gradient(135deg,#1d4ed8,#1e4fd6)',
                  fontSize: 13,
                  boxShadow: cfAviso.length > 0
                    ? '0 4px 14px rgba(217,119,6,0.35)'
                    : '0 4px 14px rgba(79,70,229,0.35)',
                }}>
                {cfForte ? '⚠ Confirmar conflito do candidato' : cfAviso.length > 0 ? '⚠ Salvar mesmo assim' : 'Salvar Evento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Importar (foto / texto → prévia) ─────────── */}
      {modalImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'var(--scrim)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-md rounded-3xl overflow-hidden"
            style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.10)' }}>
            <div className="flex items-center justify-between px-6 py-4"
              style={{ background: 'linear-gradient(135deg,#92400e,#d97706)' }}>
              <div>
                <h3 className="font-bold text-white" style={{ fontSize: 15 }}>Importar agenda do candidato</h3>
                <p className="text-amber-100" style={{ fontSize: 11 }}>Foto ou texto · prévia editável antes de gravar</p>
              </div>
              <button onClick={fecharImport} disabled={ocrRodando} className="p-1.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', opacity: ocrRodando ? 0.5 : 1 }}>
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
                {[
                  { id: 'foto', label: 'Foto / PDF', Icon: FileUp },
                  { id: 'texto', label: 'Texto', Icon: FileText },
                ].map(({ id, label, Icon }) => (
                  <button key={id} type="button" disabled={ocrRodando}
                    onClick={() => setImportAba(id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold transition-colors"
                    style={{
                      background: importAba === id ? 'rgba(245,158,11,0.25)' : 'transparent',
                      color: importAba === id ? '#fcd34d' : 'var(--text-tertiary)',
                    }}>
                    <Icon size={13} /> {label}
                  </button>
                ))}
              </div>

              <div>
                <label className="block font-semibold mb-1" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  Data padrão (se o arquivo não tiver dia)
                </label>
                <input type="date" value={importDataPadrao} disabled={ocrRodando}
                  onChange={e => setImportDataPadrao(e.target.value)}
                  className={INPUT_CLS} style={{ ...INPUT_STY, fontSize: 12 }} />
              </div>

              {importAba === 'foto' && (
                <div className="space-y-3">
                  <p className="txt-3" style={{ fontSize: 12 }}>
                    Envie foto, print ou <strong style={{ color: '#fcd34d' }}>PDF</strong> da agenda.
                    PDF com texto é lido direto; PDF escaneado usa OCR. Você confere tudo na prévia.
                  </p>
                  <input ref={importFileRef} type="file"
                    accept="image/*,application/pdf,.pdf"
                    className="hidden"
                    onChange={e => processarArquivoAgenda(e.target.files?.[0])} />
                  <button type="button" disabled={ocrRodando}
                    onClick={() => importFileRef.current?.click()}
                    className="w-full py-8 rounded-2xl flex flex-col items-center gap-2 font-bold transition-all disabled:opacity-60"
                    style={{
                      background: 'rgba(245,158,11,0.1)',
                      border: '1.5px dashed rgba(245,158,11,0.45)',
                      color: '#fcd34d',
                      fontSize: 13,
                    }}>
                    {ocrRodando ? (
                      <>
                        <Loader2 size={28} className="animate-spin" />
                        Lendo arquivo… {ocrProgresso}%
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <Camera size={26} />
                          <FileText size={26} />
                        </div>
                        Foto, print ou PDF
                      </>
                    )}
                  </button>
                  {ocrRodando && (
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${ocrProgresso}%`, background: 'linear-gradient(90deg,#d97706,#fbbf24)' }} />
                    </div>
                  )}
                  {ocrErro && (
                    <p className="rounded-xl px-3 py-2" style={{ fontSize: 12, color: '#fca5a5', background: 'rgba(239,68,68,0.12)' }}>
                      {ocrErro}
                    </p>
                  )}
                </div>
              )}

              {importAba === 'texto' && (
                <div className="space-y-3">
                  <p className="txt-3" style={{ fontSize: 12 }}>
                    Formato: <code style={{ color: '#fcd34d' }}>título;data;horaInicio;horaFim;local</code>
                    <br />Ou cole o texto da agenda com horários (ex.: 09:00 Visita…).
                  </p>
                  <textarea value={importTexto} onChange={e => setImportTexto(e.target.value)}
                    rows={7} disabled={ocrRodando}
                    placeholder={"Gabinete lideranças;2026-08-01;09:00;10:30;Assembleia\n09:00 Visita AD Garcia\n14h30 Reunião com lideranças"}
                    className={`${INPUT_CLS} resize-none font-mono`} style={{ ...INPUT_STY, fontSize: 11, textTransform: 'none' }} />
                  <button type="button" onClick={prepararImportTexto}
                    disabled={!importTexto.trim() || ocrRodando}
                    className="w-full py-2.5 rounded-2xl font-bold text-white disabled:opacity-45"
                    style={{ background: 'linear-gradient(135deg,#b45309,#f59e0b)', fontSize: 13 }}>
                    Revisar na prévia
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {importPreview && (
        <AgendaImportPreview
          linhasIniciais={importPreview.linhas}
          imagemUrl={importPreview.imagemUrl}
          arquivoNome={importPreview.arquivoNome}
          textoOcr={importPreview.textoOcr}
          confirmando={importConfirmando}
          onCancelar={() => {
            if (importPreview.imagemUrl) URL.revokeObjectURL(importPreview.imagemUrl)
            setImportPreview(null)
            setModalImport(true)
          }}
          onConfirmar={confirmarImportPreview}
        />
      )}

      {/* ── Modal: Compartilhar Agenda ─────────────────────── */}
      {modalShare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'var(--scrim)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-md rounded-3xl overflow-hidden"
            style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4"
              style={{ background: 'linear-gradient(135deg,#1e3a8a,#1e40af)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.18)' }}>
                  <Share2 size={16} className="text-white" />
                </div>
                <h3 className="font-bold text-white" style={{ fontSize: 15 }}>Compartilhar Agenda</h3>
              </div>
              <button onClick={() => setModalShare(false)} className="p-1.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                <X size={16} />
              </button>
            </div>

            {/* Corpo */}
            <div className="px-6 py-5 space-y-4">

              {/* Título personalizado */}
              <div>
                <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Título da agenda</label>
                <input value={shareTitulo} onChange={e => setShareTitulo(e.target.value)}
                  placeholder="Ex: Agenda Semana — Equipe Norte"
                  className={INPUT_CLS} style={{ ...INPUT_STY }} />
              </div>

              {/* Membro */}
              <div>
                <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  Membro da equipe <span style={{ color: '#f87171' }}>*</span>
                </label>
                <select value={shareMembro} onChange={e => setShareMembro(e.target.value)}
                  className={INPUT_CLS} style={{ ...INPUT_STY, background: 'var(--bg-raised)' }}>
                  <option value="">— Selecione quem receberá o link —</option>
                  {membrosEquipe.map(m => (
                    <option key={m.id} value={m.id}>{m.nome} — {m.cargo}</option>
                  ))}
                </select>
              </div>

              {/* Categorias */}
              <div>
                <label className="block font-semibold mb-2" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Categorias visíveis</label>
                <div className="flex flex-wrap gap-1.5">
                  {[{ id: 'todas', label: 'Todas', cor: 'var(--accent-bright)' }, ...CATEGORIAS].map(cat => {
                    const sel = shareCats.includes(cat.id)
                    return (
                      <button key={cat.id} type="button"
                        onClick={() => {
                          if (cat.id === 'todas') { setShareCats(['todas']); return }
                          const sem = shareCats.filter(c => c !== 'todas')
                          setShareCats(sel ? (sem.filter(c => c !== cat.id) || ['todas']) : [...sem, cat.id])
                        }}
                        className="px-2.5 py-1 rounded-lg font-semibold transition-all"
                        style={{
                          fontSize: 11,
                          background: sel ? `${cat.cor}22` : 'rgba(255,255,255,0.06)',
                          color:      sel ? cat.cor        : 'rgba(203,213,235,0.50)',
                          border:     `1.5px solid ${sel ? cat.cor + '55' : 'rgba(255,255,255,0.08)'}`,
                        }}>
                        {cat.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Só candidato */}
              <div className="flex items-center justify-between rounded-2xl px-4 py-3"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <div>
                  <p className="font-semibold txt-1" style={{ fontSize: 13 }}>Só agenda do candidato</p>
                  <p className="txt-3" style={{ fontSize: 11 }}>Exclui eventos só da equipe e os privados</p>
                </div>
                <button type="button" onClick={() => {
                  setShareSoCandidato(p => {
                    const next = !p
                    if (next) setShareTitulo(t => t === 'Agenda da Equipe' ? 'Agenda do Candidato' : t)
                    return next
                  })
                }}
                  className="relative rounded-full flex-shrink-0 transition-all"
                  style={{ width: 42, height: 24, background: shareSoCandidato ? '#f59e0b' : 'rgba(255,255,255,0.12)' }}>
                  <div className="absolute top-1 rounded-full transition-all"
                    style={{ width: 16, height: 16, background: '#fff', left: shareSoCandidato ? 22 : 4 }} />
                </button>
              </div>

              {/* Pode marcar */}
              <div className="flex items-center justify-between rounded-2xl px-4 py-3"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div>
                  <p className="font-semibold txt-1" style={{ fontSize: 13 }}>Pode marcar e adicionar eventos</p>
                  <p className="txt-3" style={{ fontSize: 11 }}>O membro poderá confirmar eventos e criar novos na agenda dele</p>
                </div>
                <button onClick={() => setSharePode(p => !p)}
                  className="relative rounded-full flex-shrink-0 transition-all"
                  style={{ width: 42, height: 24, background: sharePode ? '#1d4ed8' : 'rgba(255,255,255,0.12)' }}>
                  <div className="absolute top-1 rounded-full transition-all"
                    style={{ width: 16, height: 16, background: '#fff', left: sharePode ? 22 : 4, boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
                </button>
              </div>

              {/* Info */}
              <p className="txt-3 rounded-xl px-3 py-2" style={{ fontSize: 11, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)', color: '#fbbf24' }}>
                O integrante verá só a agenda dele por padrão, poderá adicionar e apagar apenas o que criar. Gere um novo link após mudanças na agenda.
              </p>

              {/* Gerar link */}
              <button onClick={gerarLink}
                disabled={!shareMembro}
                className="w-full py-3 rounded-2xl font-bold text-white transition-all disabled:opacity-45"
                style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', fontSize: 14, boxShadow: '0 4px 16px rgba(29,78,216,0.4)' }}>
                Gerar Link
              </button>

              {/* Link gerado */}
              {linkGerado && (
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(16,185,129,0.25)', background: 'rgba(16,185,129,0.07)' }}>
                  <div className="px-3 pt-3 pb-2">
                    <p className="font-semibold mb-1.5" style={{ fontSize: 11, color: '#34d399' }}>✓ Link gerado com sucesso!</p>
                    <p className="break-all font-mono" style={{ fontSize: 10, color: 'rgba(203,213,235,0.55)', wordBreak:'break-all' }}>
                      {linkGerado.slice(0, 80)}…
                    </p>
                  </div>
                  <button onClick={copiarLink}
                    className="w-full flex items-center justify-center gap-2 py-2.5 font-bold transition-all"
                    style={{ fontSize: 13, background: copiado ? 'rgba(16,185,129,0.20)' : 'rgba(255,255,255,0.06)', color: copiado ? '#34d399' : 'rgba(203,213,235,0.80)', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                    {copiado ? <><Check size={13} /> Copiado!</> : <><Copy size={13} /> Copiar link</>}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
