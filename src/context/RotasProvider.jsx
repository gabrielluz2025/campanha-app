import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { RotasProvider as RotasContextBridge } from '../components/rotas/RotasContext'
import PainelHistorico from '../components/montarRotas/PainelHistorico'
import { BAIRROS_MAT } from '../components/montarRotas/constants'
import { writeStorage, flushAfterSave } from '../utils/persist'
import {
  DENOMINACAO_PADRAO, COR_DENOMINACAO,
  BLUMENAU, SETORES,
} from '../constants/igrejasTheme'
import {
  ROTAS_LOGISTICA_STORAGE, ROTAS_ATIVA_STORAGE,
  loadRotasLogistica, loadRotaAtivaId, saveRotasLogistica, marcarRotaRemovida,
  criarRotaVazia, criarParadaBase, resolverParadas, paradaKey, gerarId,
  linkGoogleMaps, linkGoogleMapsDaLocalizacao, linkWaze, linkWazeLista, mensagemRota, linkWhatsApp,
  CARGO_CORES, TIPOS_PARADA, STATUS_PARADA,
  corTipoParada, labelTipoParada, corStatusParada,
  otimizarOrdemParadas, calcularHorariosParadas,
  eventosAgendaDoDia, agendaParaParada, materialParaParada,
  materiaisComSaldo, resumoCargaRota, registrarEntregaMaterial,
  marcarIgrejaVisitada, desmarcarIgrejaVisitada, getBairrosCoords, loadEquipeMembros,
  isParadaEquipe, normalizarRota,
  agruparIgrejasProximas, formatDistanciaKm, haversineKm,
  vizinhosDaIgreja,
  dataLocalHoje, fmtDataBR, statusRotaMeta, statusRotaExigeMotivo,
  patchDataRota, STATUS_ROTA,
  resolverMembroRota,
  paradaTemDestinoRota,
  resolverCoordsRotaParadas,
} from '../utils/rotaUtils'
import {
  criarShareRota, persistirCompartilhamentoRota,
  loadCompartilhamentosRotas, loadExecucao, detalheParada,
  igrejaIdDaParadaKey, jaAplicouExecucao, marcarAplicouExecucao,
  publicarExecucaoRota, urlRotaEquipe, criarExecucaoVazia, gpsEstaAoVivo, gpsPosicaoVisivel,
  encerrarAoVivoRota, compartilhamentoDaRota, removerCompartilhamentoRota, execucaoEstaEncerrada,
  listarCompartilhamentosAtivos, limparSharesRotasFinalizadas, rotaSaiDoCampoAoVivo,
  mergeExecucao, pollExecucaoAoVivo, pollPosicaoRapida,
  postSharePublica, fetchSharePublica, registrarCompartilhamentoRota,
} from '../utils/rotaShare'
import { filtrarRotasRelatorio } from '../utils/rotasReport'
import { sugerirRotaDoDia, criarParadasSugeridas } from '../utils/rotaAssistente'
import { loadRotaTemplates, saveRotaTemplate, aplicarRotaTemplate, removerRotaTemplate } from '../utils/rotaTemplates'
import { alertasCultoParadas } from '../utils/rotaCultoAlertas'
import { fetchLiveSessions, subscribePosicaoAoVivo, closeAllPosicaoStreams, appendTrilhaPonto } from '../utils/rotaLiveStream'
import { copiarRelatorioRota } from '../utils/rotaRelatorio'
import { TOTAL_LISTA_ADBLU, IGREJAS_ATUALIZADAS_EVENT } from '../utils/igrejasCatalog'
import { useChurchVisit } from '../context/ChurchVisitContext'
import { contarIgrejasAdbluOutras, eIgrejaAdblu } from '../utils/igrejasAdbluNome'
import { filterChurchesForRota, OUTRAS_DENOM } from '../utils/rotaFilters'
import { calcularSaudeRota, paradasNovasDeIgrejas, mesclarParadasIgreja } from '../utils/rotaPlanHelpers'
import { carregarBairrosGeo } from '../utils/bairrosGeo'
import {
  carregarLimiteBlumenau,
  coresBairrosMapa,
  getLimiteBlumenauCache,
  mergeBoundary,
  listarBairrosOficiais,
  contornoParaMapa,
} from '../utils/blumenauLimit'
import { filtrarIgrejasMapaCampanha } from '../utils/igrejaCidade'
import { bairroCanon } from '../utils/bairroMapa'
import { SYNC_EVENT, SYNC_STORAGE_EVENT, SYNC_OK_EVENT } from '../lib/cloudSync'
import { DIAS_CULTO, PERIODOS_CULTO, parseCulto, diaShort, temCultoFiltro } from '../utils/cultoParse'
import { useTabActive } from '../context/TabActiveContext'
import { limitarPinsMapa, MAX_PINS_MAPA } from '../utils/mapaPins'
import { buscarRotaOsrm, buscarRotaTripOsrm } from '../utils/osrmRoute'

const BLUMENAU_COORD = { lat: BLUMENAU[0], lng: BLUMENAU[1] }
const LIVE_TRAIL_MAX = 100
const LIVE_TRAIL_MIN_M = 6

/** Garante rota ativa alinhada ao array (evita rotaAtivaId vazio com rota rascunho). */
function bootstrapRotasLogistica() {
  const lista = loadRotasLogistica().map(normalizarRota)
  if (lista.length) {
    const saved = loadRotaAtivaId()
    const ativa = saved && lista.some(r => String(r.id) === String(saved))
      ? saved
      : lista[0].id
    return { rotas: lista, rotaAtivaId: ativa }
  }
  const r = criarRotaVazia()
  return { rotas: [r], rotaAtivaId: r.id }
}

async function buscarRota(waypoints) {
  return buscarRotaOsrm(waypoints)
}

/** TSP: reordena paradas e devolve o traçado mais curto (OSRM escolhe início e fim). */
async function buscarRotaMaisRapida(waypoints) {
  return buscarRotaTripOsrm(waypoints)
}

function normStr(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function fmtDataVisitaCurta(isoOrYmd) {
  const s = String(isoOrYmd || '').trim()
  if (!s) return ''
  try {
    const d = s.length <= 10 ? new Date(`${s}T12:00:00`) : new Date(s)
    if (Number.isNaN(d.getTime())) return s
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return s
  }
}

function resumoCultoIgreja(culto, filtroDia = 'Todos') {
  const parsed = parseCulto(culto)
  if (!parsed.length) return ''
  const slots = filtroDia !== 'Todos'
    ? parsed.filter(p => p.dia === filtroDia)
    : parsed
  if (!slots.length) return String(culto || '').slice(0, 40)
  return slots
    .map(p => `${diaShort(p.dia)} ${p.horarios.join('/')}`)
    .join(' Â· ')
}

export function RotasProvider({ children, userEmail = '' }) {
  const tabActive = useTabActive()
  const tabActiveRef = useRef(tabActive)
  tabActiveRef.current = tabActive
  const { churches: igrejas, refresh: refreshChurches, markVisited, unmarkVisited, userEmail: ctxEmail, userName: ctxName } = useChurchVisit()
  const usuarioEmail = String(userEmail || ctxEmail || '').trim()
  const usuarioNome = ctxName || (usuarioEmail
    ? (usuarioEmail.split('@')[0] || usuarioEmail).replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : '')
  const [limiteBlu, setLimiteBlu] = useState(() => getLimiteBlumenauCache())
  const [membros, setMembros] = useState(loadEquipeMembros)
  const [bairrosCoords, setBairrosCoords] = useState(null)
  const [bairrosGeoPack, setBairrosGeoPack] = useState(null)
  const [bairroCoresMapa, setBairroCoresMapa] = useState({})
  const [showBairrosMapa, setShowBairrosMapa] = useState(true)
  const [showContornoMapa, setShowContornoMapa] = useState(true)
  const [showBairroNomes, setShowBairroNomes] = useState(true)

  const boundaryEff = useMemo(
    () => mergeBoundary(limiteBlu, bairrosGeoPack?.data),
    [limiteBlu, bairrosGeoPack],
  )

  const igrejasBlumenau = useMemo(
    () => filtrarIgrejasMapaCampanha(igrejas, { boundary: boundaryEff }),
    [igrejas, boundaryEff],
  )
  const bootRotas = useMemo(() => bootstrapRotasLogistica(), [])
  const [rotas, setRotas] = useState(bootRotas.rotas)
  const [rotaAtivaId, setRotaAtivaId] = useState(bootRotas.rotaAtivaId)
  const [rotaCalc, setRotaCalc] = useState(null)
  const [rotaLoad, setRotaLoad] = useState(false)
  const [filtroSetor, setFiltroSetor] = useState('Todos')
  const [filtroDenom, setFiltroDenom] = useState('todas') // todas | ad | outras
  const [filtroDiaCulto, setFiltroDiaCulto] = useState('Todos')
  const [filtroPeriodoCulto, setFiltroPeriodoCulto] = useState('todos') // todos | manha | tarde | noite
  const [filtroVisita, setFiltroVisita] = useState('todas') // todas | visitadas | pendentes
  const [filtroSomenteVerificadas, setFiltroSomenteVerificadas] = useState(false) // oculta hits Google nÃ£o-verificados
  const [igrejaAncoraId, setIgrejaAncoraId] = useState(null)
  const [proxIgrejaKm, setProxIgrejaKm] = useState(3)
  const [busca, setBusca] = useState('')
  const [painel, setPainel] = useState('assistente') // assiste | hoje | igrejas | ...
  const [camadaMapa, setCamadaMapa] = useState('igrejas') // igrejas | rota | equipe
  const [enviarAberto, setEnviarAberto] = useState(false)
  const [enviarLoad, setEnviarLoad] = useState(false)
  const [wizardStep, setWizardStep] = useState('plan') // plan | itinerary | send | live | history
  const [sideTab, setSideTab] = useState('adicionar') // rota | adicionar | busca | aovivo | historico
  const [fotoAmpliada, setFotoAmpliada] = useState(null)
  const [motivoDraft, setMotivoDraft] = useState('')
  const [novaRotaOpen, setNovaRotaOpen] = useState(false)
  const [encerrarModal, setEncerrarModal] = useState({ open: false, membroId: '', preselect: [] })
  const [encerrarLoad, setEncerrarLoad] = useState(false)
  // Guard local para nÃ£o recarregar rotas encerradas antes de o servidor confirmar
  const encerradasGuardRef = useRef(new Set())
  const sharesLimposRef = useRef(false)

  function removerExecucaoLocal(rotaId) {
    setExecucoes(prev => {
      const next = { ...prev }
      delete next[rotaId]
      delete next[String(rotaId)]
      return next
    })
  }

  function encerrarAoVivoDaRotaSilencioso(rotaId) {
    const comp = compartilhamentoDaRota(rotaId)
    if (!comp?.shareId || comp.encerrada) return
    encerradasGuardRef.current.add(String(comp.shareId))
    removerExecucaoLocal(rotaId)
    void encerrarAoVivoRota(comp.shareId).then(() => setExecTick(t => t + 1))
  }
  const [novaRotaMembroId, setNovaRotaMembroId] = useState('')
  const [novaRotaData, setNovaRotaData] = useState(() => dataLocalHoje())
  const [fitBounds, setFitBounds] = useState(null)
  const [flyToPoint, setFlyToPoint] = useState(null)
  const [enviarPara, setEnviarPara] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [shareCopiado, setShareCopiado] = useState(false)
  const [matForm, setMatForm] = useState({ itemId: '', bairro: BAIRROS_MAT[0], quantidade: '' })
  const [proxMaxKm, setProxMaxKm] = useState(3)
  const [proxSetor, setProxSetor] = useState('Todos')
  const [proxDenom, setProxDenom] = useState('ad') // todas | ad | outras
  const [proxExpandido, setProxExpandido] = useState(null)
  const [proxModo, setProxModo] = useState('lista') // lista | pares
  const [panelAberto, setPanelAberto] = useState(true)
  const [resultadoAberto, setResultadoAberto] = useState(false)
  const [filtrosIgrejasAberto, setFiltrosIgrejasAberto] = useState(false)
  const [paradaExpandidaKey, setParadaExpandidaKey] = useState(null)
  const [mapInfoKey, setMapInfoKey] = useState(null)
  const [hoverKey, setHoverKey] = useState(null)
  const hoverTimer = useRef(null)
  const rotasMountedRef = useRef(true)
  const rotasSyncProntaRef = useRef(false)
  const rotasEditadasRef = useRef(false)
  const execucoesRef = useRef({})
  const livePollTickRef = useRef(0)
  const pollInFlightRef = useRef(false)
  const liveTrailsRef = useRef({})
  const shareRefreshTimerRef = useRef(null)
  const [liveTrails, setLiveTrails] = useState({})
  const [liveSeguir, setLiveSeguir] = useState(true)
  const [commandMode, setCommandMode] = useState(false)
  const trailPersistRef = useRef({})

  // Cleanup no unmount
  useEffect(() => {
    rotasMountedRef.current = true
    return () => { rotasMountedRef.current = false; clearTimeout(hoverTimer.current) }
  }, [])
  const [hoverCapable] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches,
  )
  const [streetView, setStreetView] = useState(null)
  const [execucoes, setExecucoes] = useState({})
  const [execTick, setExecTick] = useState(0)
  const [liveDir, setLiveDir] = useState(null)

  function abrirHoverRota(key) {
    if (!hoverCapable) return
    clearTimeout(hoverTimer.current)
    setHoverKey(key)
  }
  function fecharHoverRota() {
    if (!hoverCapable) return
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHoverKey(null), 180)
  }
  const [relMembroId, setRelMembroId] = useState('')
  const [relDataDe, setRelDataDe] = useState('')
  const [relDataAte, setRelDataAte] = useState('')
  const [relStatus, setRelStatus] = useState('')
  const [agoraLive, setAgoraLive] = useState(() => Date.now())

  const hojeStr = dataLocalHoje()

  useEffect(() => {
    if (!tabActive) return undefined
    const sharesAtivos = loadCompartilhamentosRotas().some(s => !s.encerrada)
    const fast = sideTab === 'aovivo' || commandMode
    const ms = fast ? 800 : (sharesAtivos ? 1500 : 8000)
    const t = setInterval(() => setAgoraLive(Date.now()), ms)
    return () => clearInterval(t)
  }, [tabActive, sideTab, commandMode])

  // Recarrega rotas quando storage/sync altera rotas ou remove igrejas do cadastro
  useEffect(() => {
    let reloadTimer = null
    function onStorage(e) {
      if (!tabActiveRef.current) return
      const key = e?.detail?.key || e?.detail?.approvedKey
      if (key === ROTAS_LOGISTICA_STORAGE) {
        setRotas(loadRotasLogistica().map(normalizarRota))
        setRotaCalc(null)
      }
      if (key === 'rotas_compartilhamentos') {
        setExecTick(t => t + 1)
      }
    }
    function onIgrejasEvent(e) {
      if (e?.detail?.removed != null || e?.detail?.removedBulk) {
        setRotas(loadRotasLogistica().map(normalizarRota))
        setRotaCalc(null)
      }
    }
    function onSync(e) {
      if (!tabActiveRef.current) return
      if (!e.detail?.forceReload || !e.detail?.fromServer) return
      const key = e.detail?.approvedKey
      if (key === ROTAS_LOGISTICA_STORAGE) {
        setRotas(loadRotasLogistica().map(normalizarRota))
        setRotaCalc(null)
      }
      if (key === 'rotas_compartilhamentos') {
        setExecTick(t => t + 1)
      }
    }
    window.addEventListener(SYNC_STORAGE_EVENT, onStorage)
    window.addEventListener(SYNC_EVENT, onSync)
    window.addEventListener(IGREJAS_ATUALIZADAS_EVENT, onIgrejasEvent)
    return () => {
      window.removeEventListener(SYNC_STORAGE_EVENT, onStorage)
      window.removeEventListener(SYNC_EVENT, onSync)
      window.removeEventListener(IGREJAS_ATUALIZADAS_EVENT, onIgrejasEvent)
      clearTimeout(reloadTimer)
    }
  }, [])

  useEffect(() => {
    execucoesRef.current = execucoes
  }, [execucoes])

  useEffect(() => {
    if (sharesLimposRef.current) return
    sharesLimposRef.current = true
    const lista = loadRotasLogistica().map(normalizarRota)
    void limparSharesRotasFinalizadas(lista).then((n) => {
      if (n > 0) setExecTick(t => t + 1)
    })
  }, [])

  useEffect(() => {
    if (!tabActive || document.visibilityState === 'hidden') return undefined
    let cancelled = false
    async function tick() {
      if (document.visibilityState === 'hidden') return
      const guard = encerradasGuardRef.current
      const rotasAtuais = loadRotasLogistica().map(normalizarRota)
      const shares = loadCompartilhamentosRotas().filter(s => !s.encerrada && !guard.has(String(s.shareId)))
      if (!shares.length) return

      const fastLive = sideTab === 'aovivo' || commandMode
      const pollRapido = true
      const tickN = livePollTickRef.current++
      const fullPoll = fastLive ? (tickN % 7 === 0) : (tickN % 20 === 0)

      if (pollInFlightRef.current && !fastLive) return
      pollInFlightRef.current = true
      try {
      const next = {}
      await Promise.all(shares.map(async (s) => {
        if (!s.shareId || !s.rotaId) return
        const rota = rotasAtuais.find(r => String(r.id) === String(s.rotaId))
        if (rota && rotaSaiDoCampoAoVivo(rota)) {
          guard.add(String(s.shareId))
          void encerrarAoVivoRota(s.shareId)
          return
        }
        const prevExec = execucoesRef.current[s.rotaId]?.exec
          || execucoesRef.current[String(s.rotaId)]?.exec
        let exec
        if (pollRapido) {
          exec = fullPoll
            ? await pollExecucaoAoVivo(s.shareId, prevExec)
            : await pollPosicaoRapida(s.shareId, prevExec)
        } else {
          exec = await pollPosicaoRapida(s.shareId, prevExec)
        }
        if (!exec) {
          exec = criarExecucaoVazia({
            shareId: s.shareId,
            rotaId: s.rotaId,
            membroId: s.membroId,
            membroNome: s.membro,
          })
        }
        // Ignora se o servidor confirmou encerramento ou rota já foi finalizada
        if (execucaoEstaEncerrada(exec, s, rota)) {
          if (!s.encerrada && ['concluida', 'parcial'].includes(String(exec?.rotaStatus || ''))) {
            guard.add(String(s.shareId))
            void encerrarAoVivoRota(s.shareId)
          }
          return
        }
        next[s.rotaId] = { share: s, exec }
      }))
      if (!cancelled) {
        let mudou = false
        const prevAll = execucoesRef.current
        const keys = new Set([...Object.keys(prevAll), ...Object.keys(next)])
        for (const rid of keys) {
          const prev = prevAll[rid] || prevAll[String(rid)]
          const val = next[rid]
          if (!prev && !val) continue
          if (!prev || !val) { mudou = true; break }
          const pa = prev.exec?.posicao
          const pb = val.exec?.posicao
          if (pa?.atualizadoEm !== pb?.atualizadoEm
            || Number(pa?.lat) !== Number(pb?.lat)
            || Number(pa?.lng) !== Number(pb?.lng)) {
            mudou = true
            break
          }
          if (prev.exec?.atualizadoEm !== val.exec?.atualizadoEm) { mudou = true; break }
          if (JSON.stringify(prev.exec?.statusParadas || {}) !== JSON.stringify(val.exec?.statusParadas || {})) {
            mudou = true
            break
          }
          if (JSON.stringify(prev.exec?.detalhes || {}) !== JSON.stringify(val.exec?.detalhes || {})) {
            mudou = true
            break
          }
        }
        if (mudou) setExecucoes(prev => ({ ...prev, ...next }))
      }
      } finally {
        pollInFlightRef.current = false
      }
    }
    tick()
    const sharesAtivos = loadCompartilhamentosRotas().filter(s => !s.encerrada).length
    const fastLive = sideTab === 'aovivo' || commandMode
    const pollMs = fastLive ? 450 : (sharesAtivos > 0 ? 2000 : 20000)
    const t = setInterval(tick, pollMs)
    return () => { cancelled = true; clearInterval(t) }
  }, [tabActive, execTick, sideTab, commandMode])

  useEffect(() => {
    const packs = Object.values(execucoes)
    if (!packs.length) return
    let mudouIgreja = false
    for (const pack of packs) {
      const detalhes = pack.exec?.detalhes || {}
      for (const [key, d] of Object.entries(detalhes)) {
        if (!d || typeof d !== 'object') continue
        const stamp = d.confirmadoEm || d.atualizadoEm || ''
        if (!stamp || jaAplicouExecucao(pack.share.shareId, key, stamp)) continue
        const igrejaId = igrejaIdDaParadaKey(key)
        if (d.status === 'concluido' && igrejaId) {
          marcarIgrejaVisitada(igrejaId, {
            rotaId: `${pack.share.shareId}:${key}`,
            data: d.data || hojeStr,
            visitadoPor: d.confirmadoPor || pack.share.membro || usuarioNome,
            foto: d.foto || '',
            obs: 'Confirmado no campo com foto',
            concluidoEm: d.confirmadoEm,
          })
          mudouIgreja = true
        }
        marcarAplicouExecucao(pack.share.shareId, key, stamp)
      }
    }
    if (mudouIgreja) refreshChurches()

    setRotas(prev => {
      let any = false
      const next = prev.map(r => {
        const pack = execucoes[r.id] || execucoes[String(r.id)]
        if (!pack?.exec) return r
        const detalhes = pack.exec.detalhes || {}
        let changed = false
        const paradasNext = (r.paradas || []).map(p => {
          const d = detalhes[p.key]
          if (!d) return p
          let st = p.status
          if (d.status === 'concluido') st = 'concluido'
          else if (d.status === 'nao_visitou') st = 'cancelado'
          else if (d.status === 'reagendar') st = 'reagendar'
          if (st !== p.status) {
            changed = true
            return { ...p, status: st, motivo: d.justificativa || p.motivo }
          }
          return p
        })
        const novoStatus = pack.exec.rotaStatus
        const travaAdmin = ['concluida', 'parcial', 'cancelada'].includes(r.status)
        const statusOk = novoStatus && novoStatus !== r.status
          && ['concluida', 'parcial', 'em_andamento'].includes(novoStatus)
          && !(travaAdmin && novoStatus === 'em_andamento')
        if (!changed && !statusOk) return r
        any = true
        return { ...r, paradas: changed ? paradasNext : r.paradas, status: statusOk ? novoStatus : r.status }
      })
      return any ? next : prev
    })
  }, [execucoes, usuarioNome])

  const rotaAtiva = useMemo(
    () => rotas.find(r => String(r.id) === String(rotaAtivaId)) || rotas[0],
    [rotas, rotaAtivaId],
  )

  // Corrige sessões antigas em que a rota rascunho existia mas rotaAtivaId ficou ''.
  useEffect(() => {
    if (!rotas.length) return
    if (rotaAtivaId && rotas.some(r => String(r.id) === String(rotaAtivaId))) return
    setRotaAtivaId(rotas[0].id)
  }, [rotas, rotaAtivaId])

  // Aguarda sync inicial antes de gravar rascunho vazio em outro aparelho
  useEffect(() => {
    const marcarPronta = () => { rotasSyncProntaRef.current = true }
    const t = setTimeout(marcarPronta, 3500)
    const onReady = (e) => {
      if (e?.detail?.fromServer || e?.detail?.forceReload) marcarPronta()
    }
    window.addEventListener(SYNC_EVENT, onReady)
    window.addEventListener(SYNC_OK_EVENT, marcarPronta)
    return () => {
      clearTimeout(t)
      window.removeEventListener(SYNC_EVENT, onReady)
      window.removeEventListener(SYNC_OK_EVENT, marcarPronta)
    }
  }, [])

  // Recarrega do storage apÃ³s sync â€” respeita rotas_logistica_removidos
  useEffect(() => {
    function aplicarDoStorage() {
      if (rotasEditadasRef.current) return
      rotasSyncProntaRef.current = true
      const lista = loadRotasLogistica().map(normalizarRota)
      setRotas(prev => {
        if (!lista.length) {
          const temParadas = prev.some(r => (r.paradas || []).some(p => !isParadaEquipe(p)))
          if (temParadas) return prev
          return prev.length ? prev : [criarRotaVazia()]
        }
        return lista
      })
      setRotaAtivaId(prev => {
        if (prev && lista.some(r => String(r.id) === String(prev))) return prev
        return lista[0]?.id || prev || ''
      })
      setRotaCalc(null)
      if (lista.length) {
        saveRotasLogistica(lista, lista.find(r => String(r.id) === String(loadRotaAtivaId()))?.id || lista[0]?.id || '')
      }
    }
    const onSync = (e) => {
      if (e?.type === SYNC_STORAGE_EVENT && !e?.detail?.external) return
      const key = e?.detail?.key || e?.detail?.approvedKey
      if (key && key !== ROTAS_LOGISTICA_STORAGE && key !== ROTAS_ATIVA_STORAGE) return
      aplicarDoStorage()
    }
    window.addEventListener(SYNC_EVENT, onSync)
    window.addEventListener(SYNC_STORAGE_EVENT, onSync)
    return () => {
      window.removeEventListener(SYNC_EVENT, onSync)
      window.removeEventListener(SYNC_STORAGE_EVENT, onSync)
    }
  }, [])

  useEffect(() => {
    setMotivoDraft(rotaAtiva?.resultadoMotivo || '')
  }, [rotaAtiva?.id, rotaAtiva?.resultadoMotivo])

  const atualizarRota = useCallback((patch) => {
    rotasEditadasRef.current = true
    setRotas(prev => prev.map(r => String(r.id) === String(rotaAtivaId)
      ? { ...r, ...patch, atualizadoEm: new Date().toISOString() }
      : r))
    if ('paradas' in patch || 'data' in patch) setRotaCalc(null)
  }, [rotaAtivaId])

  const atualizarRotaPorId = useCallback((rotaId, patch) => {
    rotasEditadasRef.current = true
    setRotas(prev => prev.map(r => String(r.id) === String(rotaId)
      ? { ...r, ...patch, atualizadoEm: new Date().toISOString() }
      : r))
    if (String(rotaId) === String(rotaAtivaId) && ('paradas' in patch || 'data' in patch)) {
      setRotaCalc(null)
    }
  }, [rotaAtivaId])

  const rotasOrdenadas = useMemo(() => {
    return [...rotas].sort((a, b) => {
      const da = String(b.data || '')
      const db = String(a.data || '')
      if (da !== db) return da.localeCompare(db)
      return String(b.atualizadoEm || '').localeCompare(String(a.atualizadoEm || ''))
    })
  }, [rotas])

  const rotasFiltradasRel = useMemo(
    () => filtrarRotasRelatorio(rotasOrdenadas, {
      membroId: relMembroId,
      dataDe: relDataDe,
      dataAte: relDataAte,
      status: relStatus,
    }),
    [rotasOrdenadas, relMembroId, relDataDe, relDataAte, relStatus],
  )

  function alterarDataRota(novaData) {
    if (!novaData) return
    atualizarRota(patchDataRota(rotaAtiva, novaData))
  }

  function concluirRotaPorId(rotaId, { status = 'concluida', motivo = '' } = {}) {
    const rota = rotas.find(r => String(r.id) === String(rotaId))
    if (!rota) return
    const precisaMotivo = statusRotaExigeMotivo(status)
    if (precisaMotivo && motivo.length < 3) {
      window.alert('Informe o motivo (mÃ­n. 3 caracteres) para este status.')
      return false
    }
    const agora = new Date().toISOString()
    const respNome = membros.find(m => String(m.id) === String(rota.responsavelId))?.nome
      || usuarioNome
    const visitantes = (rota.equipeIds || [])
      .map(id => membros.find(m => String(m.id) === String(id))?.nome)
      .filter(Boolean)

    if (status === 'concluida') {
      const novasParadas = (rota.paradas || []).map(p => {
        if (isParadaEquipe(p)) return p
        if (p.status === 'concluido' || p.status === 'cancelado') return p
        return { ...p, status: 'concluido', concluidoEm: p.concluidoEm || agora }
      })
      const detalhes = resolverParadas(novasParadas, igrejas, membros, bairrosCoords || {})
      for (const par of detalhes) {
        if (par?.tipo !== 'igreja' || !par.id) continue
        if (isParadaEquipe(par)) continue
        marcarIgrejaVisitada(par.id, {
          rotaId: `${rotaId}:${par.id}`,
          data: rota.data || hojeStr,
          horaInicio: par.horaPrevista || '',
          duracaoMin: par.duracaoMin || 20,
          concluidoEm: agora,
          visitadoPor: respNome,
          visitadoPorEmail: usuarioEmail,
          visitantes: visitantes.length ? visitantes : undefined,
          obs: motivo || `Rota concluÃ­da: ${rota.nome || ''}`,
        })
      }
      refreshChurches()
      atualizarRotaPorId(rotaId, {
        status,
        paradas: novasParadas,
        resultadoMotivo: motivo,
        resultadoEm: agora,
        resultadoPor: usuarioNome || usuarioEmail || '',
      })
      encerrarAoVivoDaRotaSilencioso(rotaId)
      return true
    }

    if (status === 'parcial') {
      const detalhes = resolverParadas(rota.paradas || [], igrejas, membros, bairrosCoords || {})
      let marcou = false
      for (const par of detalhes) {
        if (par?.tipo !== 'igreja' || !par.id) continue
        if (par.status !== 'concluido') continue
        marcarIgrejaVisitada(par.id, {
          rotaId: `${rotaId}:${par.id}`,
          data: rota.data || hojeStr,
          horaInicio: par.horaPrevista || '',
          duracaoMin: par.duracaoMin || 20,
          concluidoEm: agora,
          visitadoPor: respNome,
          visitadoPorEmail: usuarioEmail,
          obs: motivo || `Rota parcial: ${rota.nome || ''}`,
        })
        marcou = true
      }
      if (marcou) refreshChurches()
    }

    atualizarRotaPorId(rotaId, {
      status,
      resultadoMotivo: motivo,
      resultadoEm: agora,
      resultadoPor: usuarioNome || usuarioEmail || '',
    })
    if (['concluida', 'parcial', 'cancelada'].includes(status)) {
      encerrarAoVivoDaRotaSilencioso(rotaId)
    }
    return true
  }

  function registrarResultado(status) {
    const precisaMotivo = statusRotaExigeMotivo(status)
    const motivo = String(motivoDraft || '').trim()
    if (precisaMotivo && motivo.length < 3) {
      window.alert('Informe o motivo (mÃ­n. 3 caracteres) para este status.')
      return
    }

    // Ao concluir: marca paradas de igreja como concluÃ­das e visitadas
    if (status === 'concluida') {
      const agora = new Date().toISOString()
      const respNome = membros.find(m => String(m.id) === String(rotaAtiva?.responsavelId))?.nome
        || usuarioNome
      const visitantes = (rotaAtiva?.equipeIds || [])
        .map(id => membros.find(m => String(m.id) === String(id))?.nome)
        .filter(Boolean)
      const novasParadas = (rotaAtiva?.paradas || []).map(p => {
        if (isParadaEquipe(p)) return p
        if (p.status === 'concluido' || p.status === 'cancelado') return p
        return { ...p, status: 'concluido', concluidoEm: p.concluidoEm || agora }
      })
      const detalhes = resolverParadas(novasParadas, igrejas, membros, bairrosCoords || {})
      for (const par of detalhes) {
        if (par?.tipo !== 'igreja' || !par.id) continue
        if (isParadaEquipe(par)) continue
        marcarIgrejaVisitada(par.id, {
          rotaId: `${rotaAtivaId}:${par.id}`,
          data: rotaAtiva?.data || hojeStr,
          horaInicio: par.horaPrevista || '',
          duracaoMin: par.duracaoMin || 20,
          concluidoEm: agora,
          visitadoPor: respNome,
          visitadoPorEmail: usuarioEmail,
          visitantes: visitantes.length ? visitantes : undefined,
          obs: motivo || `Rota concluÃ­da: ${rotaAtiva?.nome || ''}`,
        })
      }
      refreshChurches()
      atualizarRota({
        status,
        paradas: novasParadas,
        resultadoMotivo: motivo,
        resultadoEm: agora,
        resultadoPor: usuarioNome || usuarioEmail || '',
      })
      encerrarAoVivoDaRotaSilencioso(rotaAtivaId)
      voltarMapaIgrejas()
      return
    }

    // Parcial: marca como visitadas sÃ³ as igrejas jÃ¡ concluÃ­das na rota
    if (status === 'parcial') {
      const detalhes = resolverParadas(rotaAtiva?.paradas || [], igrejas, membros, bairrosCoords || {})
      const agora = new Date().toISOString()
      const respNome = membros.find(m => String(m.id) === String(rotaAtiva?.responsavelId))?.nome
        || usuarioNome
      let marcou = false
      for (const par of detalhes) {
        if (par?.tipo !== 'igreja' || !par.id) continue
        if (par.status !== 'concluido') continue
        marcarIgrejaVisitada(par.id, {
          rotaId: `${rotaAtivaId}:${par.id}`,
          data: rotaAtiva?.data || hojeStr,
          horaInicio: par.horaPrevista || '',
          duracaoMin: par.duracaoMin || 20,
          concluidoEm: agora,
          visitadoPor: respNome,
          visitadoPorEmail: usuarioEmail,
          obs: motivo || `Rota parcial: ${rotaAtiva?.nome || ''}`,
        })
        marcou = true
      }
      if (marcou) refreshChurches()
    }

    atualizarRota({
      status,
      resultadoMotivo: motivo,
      resultadoEm: new Date().toISOString(),
      resultadoPor: usuarioNome || usuarioEmail || '',
    })
    if (['concluida', 'parcial', 'cancelada'].includes(status)) {
      encerrarAoVivoDaRotaSilencioso(rotaAtivaId)
    }
    if (status === 'parcial' || status === 'nao_realizada' || status === 'com_problema') {
      voltarMapaIgrejas()
    }
  }

  const paradas = rotaAtiva?.paradas || []
  const equipeIds = useMemo(
    () => (rotaAtiva?.equipeIds || []).map(String),
    [rotaAtiva?.equipeIds],
  )
  const equipeIdsSet = useMemo(() => new Set(equipeIds), [equipeIds])
  const equipeDaRota = useMemo(
    () => membros.filter(m => equipeIdsSet.has(String(m.id))),
    [membros, equipeIdsSet],
  )

  useEffect(() => {
    const temParadas = rotas.some(r => (r.paradas || []).some(p => !isParadaEquipe(p)))
    if (!rotasSyncProntaRef.current && !rotasEditadasRef.current && !temParadas) return undefined
    const t = setTimeout(() => {
      saveRotasLogistica(rotas, rotaAtivaId)
      flushAfterSave().catch(() => {})
    }, 450)
    return () => clearTimeout(t)
  }, [rotas, rotaAtivaId, paradas])

  useEffect(() => {
    const enviar = () => {
      if (!rotasEditadasRef.current && !rotas.some(r => (r.paradas || []).length)) return
      saveRotasLogistica(rotas, rotaAtivaId)
      flushAfterSave().catch(() => {})
    }
    window.addEventListener('pagehide', enviar)
    window.addEventListener('beforeunload', enviar)
    return () => {
      window.removeEventListener('pagehide', enviar)
      window.removeEventListener('beforeunload', enviar)
    }
  }, [rotas, rotaAtivaId])

  useEffect(() => {
    let cancelled = false
    void carregarLimiteBlumenau().then(lim => { if (!cancelled) setLimiteBlu(lim) })
    getBairrosCoords().then(data => { if (!cancelled) setBairrosCoords(data) })
    carregarBairrosGeo('BLUMENAU')
      .then(pack => {
        if (cancelled) return
        setBairrosGeoPack(pack)
        if (pack?.data?.features?.length) {
          setBairroCoresMapa(coresBairrosMapa(pack.data.features))
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const bairrosOficiais = useMemo(() => listarBairrosOficiais(), [])

  const setores = useMemo(
    () => ['Todos', ...bairrosOficiais, OUTRAS_DENOM],
    [bairrosOficiais],
  )

  useEffect(() => {
    setFiltroSetor('Todos')
  }, [filtroDenom])

  const paradasDetalhes = useMemo(
    () => resolverParadas(paradas, igrejas, membros, bairrosCoords || {}).filter(p => !isParadaEquipe(p)),
    [paradas, igrejas, membros, bairrosCoords],
  )

  const routeHealth = useMemo(
    () => calcularSaudeRota({ igrejas: igrejasBlumenau, paradasDetalhes, rotaCalc }),
    [igrejasBlumenau, paradasDetalhes, rotaCalc],
  )

  // MantÃ©m o link ao vivo com endereÃ§os e GPS atualizados do catÃ¡logo.
  useEffect(() => {
    if (!rotaAtiva?.id || !paradasDetalhes.length) return undefined
    const ja = loadCompartilhamentosRotas().find(s => String(s.rotaId) === String(rotaAtiva.id))
    if (!ja?.shareId) return undefined
    if (shareRefreshTimerRef.current) clearTimeout(shareRefreshTimerRef.current)
    shareRefreshTimerRef.current = setTimeout(() => {
      const membro = membros.find(m => String(m.id) === String(ja.membroId))
      const share = criarShareRota({
        rota: { ...rotaAtiva, paradas: paradasDetalhes, id: rotaAtiva.id },
        membro: ja.membro || membro?.nome || '',
        membroId: ja.membroId || membro?.id || '',
      })
      share.shareId = ja.shareId
      void postSharePublica(ja.shareId, { ...share, encerrada: ja.encerrada || false })
      void persistirCompartilhamentoRota({
        rotaId: rotaAtiva.id,
        shareId: ja.shareId,
        link: ja.link || urlRotaEquipe(ja.shareId),
        membro: share.membro,
        membroId: share.membroId,
        nome: rotaAtiva.nome,
        paradas: share.paradas,
      })
    }, 4000)
    return () => {
      if (shareRefreshTimerRef.current) clearTimeout(shareRefreshTimerRef.current)
    }
  }, [paradasDetalhes, rotaAtiva, membros])

  const paradasComDestino = useMemo(
    () => paradasDetalhes.filter(p => !isParadaEquipe(p) && paradaTemDestinoRota(p)),
    [paradasDetalhes],
  )
  const paradasComCoords = paradasComDestino
  const mapsUrl = useMemo(() => linkGoogleMapsDaLocalizacao(paradasDetalhes), [paradasDetalhes])
  const wazeLinks = useMemo(() => linkWazeLista(paradasComDestino), [paradasComDestino])
  const wazePrimeira = paradasComDestino[0] ? linkWaze(paradasComDestino[0]) : ''
  const carga = useMemo(() => resumoCargaRota(paradasDetalhes), [paradasDetalhes])
  const concluidas = paradas.filter(p => !isParadaEquipe(p) && p.status === 'concluido').length
  const qtdParadas = paradas.filter(p => !isParadaEquipe(p)).length
  const liveCount = Object.values(execucoes).filter(p =>
    !execucaoEstaEncerrada(p?.exec, p?.share)
    && gpsPosicaoVisivel(p?.exec?.posicao, agoraLive),
  ).length
  const liveSharesAtivos = Object.values(execucoes).filter(p =>
    !execucaoEstaEncerrada(p?.exec, p?.share),
  ).length
  const livePulseCount = Object.values(execucoes).filter(p =>
    !execucaoEstaEncerrada(p?.exec, p?.share)
    && gpsEstaAoVivo(p?.exec?.posicao, agoraLive),
  ).length

  const liveMembroIds = useMemo(() => {
    const ids = new Set()
    for (const pack of Object.values(execucoes)) {
      if (execucaoEstaEncerrada(pack?.exec, pack?.share)) continue
      if (!gpsPosicaoVisivel(pack?.exec?.posicao, agoraLive)) continue
      const mid = pack.share?.membroId || pack.exec?.membroId
      if (mid) ids.add(String(mid))
    }
    return ids
  }, [execucoes, agoraLive])

  const liveFollowTarget = useMemo(() => {
    if (!liveSeguir) return null
    const packs = Object.values(execucoes).filter(p =>
      !execucaoEstaEncerrada(p?.exec, p?.share)
      && gpsPosicaoVisivel(p?.exec?.posicao, agoraLive),
    )
    if (!packs.length) return null
    let pack = execucoes[rotaAtivaId] || execucoes[String(rotaAtivaId)]
    if (!pack || execucaoEstaEncerrada(pack?.exec, pack?.share)
      || !gpsPosicaoVisivel(pack?.exec?.posicao, agoraLive)) {
      pack = packs.sort((a, b) =>
        new Date(b.exec?.posicao?.atualizadoEm || 0) - new Date(a.exec?.posicao?.atualizadoEm || 0),
      )[0]
    }
    const pos = pack?.exec?.posicao
    const lat = Number(pos?.lat)
    const lng = Number(pos?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return {
      rotaId: String(pack.share?.rotaId || pack.exec?.rotaId || ''),
      lat,
      lng,
      ts: pos.atualizadoEm,
    }
  }, [liveSeguir, rotaAtivaId, execucoes, agoraLive])

  useEffect(() => {
    let changed = false
    const next = { ...liveTrailsRef.current }
    const liveIds = new Set()

    for (const pack of Object.values(execucoes)) {
      const rid = String(pack.share?.rotaId || pack.exec?.rotaId || '')
      if (!rid) continue
      if (execucaoEstaEncerrada(pack?.exec, pack?.share)) {
        if (next[rid]) {
          delete next[rid]
          changed = true
        }
        continue
      }
      const pos = pack?.exec?.posicao
      if (!gpsPosicaoVisivel(pos, agoraLive)) continue
      const lat = Number(pos.lat)
      const lng = Number(pos.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      liveIds.add(rid)

      const trail = next[rid] ? [...next[rid]] : []
      const last = trail[trail.length - 1]
      if (last) {
        const metros = haversineKm({ lat: last.lat, lng: last.lng }, { lat, lng }) * 1000
        if (metros < LIVE_TRAIL_MIN_M) continue
      }
      trail.push({ lat, lng })
      if (trail.length > LIVE_TRAIL_MAX) trail.splice(0, trail.length - LIVE_TRAIL_MAX)
      next[rid] = trail
      changed = true
      const sid = pack.share?.shareId || pack.exec?.shareId
      if (sid) {
        const pk = `${sid}:${lat.toFixed(5)},${lng.toFixed(5)}`
        if (trailPersistRef.current[pk] !== true) {
          trailPersistRef.current[pk] = true
          void appendTrilhaPonto(sid, { lat, lng, t: pos.atualizadoEm || new Date().toISOString() })
        }
      }
    }

    for (const rid of Object.keys(next)) {
      if (!liveIds.has(rid)) {
        delete next[rid]
        changed = true
      }
    }

    if (changed) {
      liveTrailsRef.current = next
      setLiveTrails(next)
    }
  }, [execucoes, agoraLive])

  useEffect(() => {
    if (!liveSeguir || !liveFollowTarget) return
    setFlyToPoint({
      coords: [liveFollowTarget.lat, liveFollowTarget.lng],
      ts: Date.now(),
      panOnly: true,
    })
  }, [liveSeguir, liveFollowTarget?.ts, liveFollowTarget?.lat, liveFollowTarget?.lng])

  // SSE GPS — rotas ativas (Campo, torre de controle ou qualquer aba com share ao vivo)
  useEffect(() => {
    if (!tabActive) {
      closeAllPosicaoStreams()
      return undefined
    }
    const shares = loadCompartilhamentosRotas().filter(s => s?.shareId && !s.encerrada)
    if (!shares.length) {
      closeAllPosicaoStreams()
      return undefined
    }
    const unsubs = shares.map(s => subscribePosicaoAoVivo(s.shareId, (pos) => {
      if (!pos?.lat) return
      setExecucoes(prev => {
        const rid = String(s.rotaId)
        const pack = prev[rid] || prev[s.rotaId]
        if (!pack) return prev
        const exec = mergeExecucao(pack.exec, { posicao: pos, atualizadoEm: pos.atualizadoEm })
        return { ...prev, [rid]: { ...pack, exec } }
      })
    }))
    return () => {
      unsubs.forEach(u => u())
      closeAllPosicaoStreams()
    }
  }, [tabActive, sideTab, commandMode, execTick])

  // Descobre sessões ao vivo no servidor (multi-operador)
  useEffect(() => {
    if (!tabActive) return undefined
    let cancel = false
    async function sync() {
      const sessions = await fetchLiveSessions()
      if (cancel || !sessions.length) return
      for (const s of sessions) {
        if (!s.shareId || s.encerrada) continue
        const exists = loadCompartilhamentosRotas().some(x => x.shareId === s.shareId)
        if (!exists) {
          registrarCompartilhamentoRota({
            shareId: s.shareId,
            rotaId: s.rotaId || '',
            nome: s.nome || 'Rota',
            membro: s.membro || '',
            membroId: s.membroId || '',
            encerrada: false,
          })
        }
      }
      setExecTick(t => t + 1)
    }
    sync()
    const iv = setInterval(sync, 5000)
    return () => { cancel = true; clearInterval(iv) }
  }, [tabActive])

  const liveGpsDestino = useMemo(() => {
    if (sideTab !== 'aovivo' && !commandMode) return null
    const pack = execucoes[rotaAtivaId] || execucoes[String(rotaAtivaId)]
    const pos = pack?.exec?.posicao
    if (!gpsPosicaoVisivel(pos, agoraLive)) return null
    const proxima = paradasDetalhes.find(p => {
      const st = (pack.exec ? detalheParada(pack.exec, p.key).status : null) || p.status
      return st !== 'concluido' && st !== 'nao_visitou' && st !== 'reagendar' && st !== 'cancelado'
        && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))
    })
    if (!proxima) return null
    const lat = Number(pos.lat)
    const lng = Number(pos.lng)
    return {
      from: [lat, lng],
      to: [Number(proxima.lat), Number(proxima.lng)],
      chave: `${lat.toFixed(3)},${lng.toFixed(3)}>${proxima.key}`,
    }
  }, [sideTab, commandMode, execucoes, rotaAtivaId, paradasDetalhes, agoraLive])

  const liveDirChave = liveGpsDestino?.chave || ''

  useEffect(() => {
    if (!liveGpsDestino) {
      setLiveDir(null)
      return undefined
    }
    const { from, to, chave } = liveGpsDestino
    let cancel = false
    buscarRota([from, to]).then((r) => {
      if (cancel || !r?.linha?.length) return
      setLiveDir({
        chave,
        path: r.linha.map(([lat, lng]) => ({ lat, lng })),
        distancia: r.distancia,
        duracao: r.duracao,
      })
    }).catch(() => {})
    return () => { cancel = true }
  }, [liveDirChave])

  const eventosHoje = useMemo(() => eventosAgendaDoDia(rotaAtiva?.data || hojeStr), [rotaAtiva?.data, hojeStr])
  const materiaisDisp = useMemo(() => materiaisComSaldo(), [agoraLive])
  const { adblu: adbluCount, outras: outrasDenomCount } = useMemo(
    () => contarIgrejasAdbluOutras(igrejasBlumenau),
    [igrejasBlumenau],
  )

  function isIgrejaAdBlu(ig) {
    return eIgrejaAdblu(ig)
  }

  const igrejasVisiveis = useMemo(
    () => filterChurchesForRota(igrejasBlumenau, {
      busca,
      filtroVisita,
      filtroDenom,
      filtroSetor,
      filtroDiaCulto,
      filtroPeriodoCulto,
      filtroSomenteVerificadas,
      bairrosGeoData: bairrosGeoPack?.data || null,
    }),
    [
      igrejasBlumenau, filtroSetor, filtroDenom, filtroDiaCulto, filtroPeriodoCulto,
      filtroVisita, filtroSomenteVerificadas, busca, bairrosGeoPack,
    ],
  )

  const igrejaAncora = useMemo(
    () => (igrejaAncoraId != null
      ? igrejasBlumenau.find(ig => String(ig.id) === String(igrejaAncoraId))
      : null),
    [igrejasBlumenau, igrejaAncoraId],
  )

  const igrejasProximasDaAncora = useMemo(() => {
    if (!igrejaAncora) return []
    return vizinhosDaIgreja(igrejaAncora, igrejasVisiveis, { maxKm: proxIgrejaKm })
  }, [igrejaAncora, igrejasVisiveis, proxIgrejaKm])

  const igrejasParaProximas = useMemo(() => {
    return igrejasBlumenau.filter(ig => {
      if (!Number(ig?.lat) || !Number(ig?.lng)) return false
      if (proxDenom === 'ad') return isIgrejaAdBlu(ig)
      if (proxDenom === 'outras') return !isIgrejaAdBlu(ig)
      return true
    })
  }, [igrejasBlumenau, proxDenom])

  const proximidade = useMemo(() => {
    if (painel !== 'proximas' && painel !== 'bairro') return { grupos: [], topPares: [], totalComGps: 0 }
    return agruparIgrejasProximas(igrejasParaProximas, { maxKm: proxMaxKm, maxParesPorGrupo: 500 })
  }, [painel, igrejasParaProximas, proxMaxKm])

  const gruposProximos = useMemo(() => {
    const q = normStr(busca.trim())
    return proximidade.grupos.filter(g => {
      if (proxSetor !== 'Todos' && g.setor !== proxSetor) return false
      if (!g.pares.length) return false
      if (!q) return true
      return normStr(g.setor).includes(q)
        || g.pares.some(p => normStr(p.a.nome).includes(q) || normStr(p.b.nome).includes(q))
        || (g.igrejas || []).some(ig => normStr(ig.nome).includes(q))
    })
  }, [proximidade.grupos, proxSetor, busca])

  /** Todos os bairros com igrejas do filtro (inclui quem nÃ£o tem par prÃ³ximo) â€” para impressÃ£o completa. */
  const gruposParaImprimir = useMemo(() => {
    const q = normStr(busca.trim())
    return proximidade.grupos
      .filter(g => {
        if (proxSetor !== 'Todos' && g.setor !== proxSetor) return false
        const lista = g.igrejas || []
        if (!lista.length) return false
        if (!q) return true
        return normStr(g.setor).includes(q)
          || lista.some(ig => normStr(ig.nome).includes(q) || normStr(ig.endereco).includes(q))
          || (g.pares || []).some(p => normStr(p.a?.nome).includes(q) || normStr(p.b?.nome).includes(q))
      })
      .map(g => ({
        ...g,
        // ImpressÃ£o traz todos os pares do bairro (sem teto baixo)
        pares: [...(g.pares || [])].sort((a, b) => a.km - b.km),
        igrejas: [...(g.igrejas || [])].sort((a, b) =>
          String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR'),
        ),
      }))
      .sort((a, b) => a.setor.localeCompare(b.setor, 'pt-BR'))
  }, [proximidade.grupos, proxSetor, busca])

  const keysNaRota = useMemo(() => new Set(paradas.map(p => p.key).filter(k => !isParadaEquipe(k))), [paradas])

  const paradaOrdemMap = useMemo(() => {
    const m = new Map()
    paradas.forEach((p, i) => m.set(p.key, i))
    return m
  }, [paradas])

  const mostrarTodasIgrejas = camadaMapa === 'igrejas'
  const mostrarCandidatas = camadaMapa === 'candidatas'
  const mostrarEquipeMapa = camadaMapa === 'equipe'

  /** Igrejas visíveis no mapa (filtros do painel + limite de performance). */
  const igrejasNoMapaAll = useMemo(() => {
    if (mostrarCandidatas) {
      return igrejasVisiveis.filter(ig => ig.lat && ig.lng)
    }
    if (mostrarTodasIgrejas) {
      return igrejasVisiveis.filter(ig => ig.lat && ig.lng)
    }
    const out = []
    const seen = new Set()
    for (const p of paradasDetalhes) {
      if (!p.key?.startsWith('igreja:') || !p.lat || !p.lng) continue
      const id = igrejaIdDaParadaKey(p.key)
      if (!id || seen.has(String(id))) continue
      seen.add(String(id))
      const ig = igrejas.find(i => String(i.id) === String(id))
      out.push(ig
        ? { ...ig, lat: ig.lat ?? p.lat, lng: ig.lng ?? p.lng }
        : {
          id,
          nome: p.nome || 'Igreja',
          lat: p.lat,
          lng: p.lng,
          setor: p.setor,
          denominacao: p.denominacao,
          visitado: p.visitado,
          culto: p.culto,
          prioridade: p.prioridade,
        })
    }
    return out
  }, [mostrarTodasIgrejas, mostrarCandidatas, paradasDetalhes, igrejas, igrejasVisiveis])

  const igrejasNoMapaPack = useMemo(() => {
    const routeIds = paradasDetalhes
      .filter(p => p.key?.startsWith('igreja:'))
      .map(p => igrejaIdDaParadaKey(p.key))
      .filter(Boolean)
    return limitarPinsMapa(igrejasNoMapaAll, { prioridadeIds: routeIds, max: MAX_PINS_MAPA })
  }, [igrejasNoMapaAll, paradasDetalhes])

  const igrejasNoMapa = igrejasNoMapaPack.pins

  const hoverMapaAtivo = hoverCapable && igrejasNoMapa.length <= 60

  function adicionarParIgrejas(a, b) {
    const keys = [paradaKey('igreja', a.id), paradaKey('igreja', b.id)]
    const existentes = new Set(paradas.map(p => p.key))
    const novas = keys
      .filter(k => !existentes.has(k))
      .map(key => criarParadaBase({ key, tipoParada: 'visita' }))
    if (!novas.length) return
    atualizarRota({ paradas: [...paradas.filter(p => !isParadaEquipe(p)), ...novas] })
  }

  function verParNoMapa(a, b) {
    setCamadaMapa('igrejas')
    // setMobilePane removido â€” funÃ§Ã£o nÃ£o existe; apenas foca no mapa
    if (a?.lat && b?.lat) {
      const mid = [(a.lat + b.lat) / 2, (a.lng + b.lng) / 2]
      setFlyToPoint({ coords: mid, ts: Date.now() })
      const pad = Math.max(haversineKm(a, b) * 0.008, 0.002)
      setFitBounds([
        [Math.min(a.lat, b.lat) - pad, Math.min(a.lng, b.lng) - pad],
        [Math.max(a.lat, b.lat) + pad, Math.max(a.lng, b.lng) + pad],
      ])
    } else if (a?.lat) {
      setFlyToPoint({ coords: [a.lat, a.lng], ts: Date.now() })
    }
  }

  function adicionarTodasDoBairro(grupo) {
    const ids = grupo.igrejas?.length
      ? grupo.igrejas.map(ig => ig.id)
      : [...new Set((grupo.pares || []).flatMap(p => [p.a.id, p.b.id]))]
    const novas = paradasNovasDeIgrejas(ids, paradas)
    if (!novas.length) return
    atualizarRota({ paradas: mesclarParadasIgreja(paradas, novas) })
  }

  function adicionarTodasFiltradas() {
    const ids = igrejasVisiveis.map(ig => ig.id)
    const novas = paradasNovasDeIgrejas(ids, paradas)
    if (!novas.length) return
    atualizarRota({ paradas: mesclarParadasIgreja(paradas, novas) })
  }

  function adicionarParada(key, extras = {}) {
    if (isParadaEquipe(key)) {
      toggleEquipeNaRota(key.slice('equipe:'.length))
      return
    }
    if (keysNaRota.has(key)) return
    const tipo = key.startsWith('material:') ? 'entrega' : key.startsWith('agenda:') ? 'evento' : 'visita'
    atualizarRota({ paradas: [...paradas.filter(p => !isParadaEquipe(p)), criarParadaBase({ key, tipoParada: extras.tipoParada || tipo, ...extras })] })
  }

  function removerParada(key) {
    if (isParadaEquipe(key)) {
      toggleEquipeNaRota(key.slice('equipe:'.length), false)
      return
    }
    atualizarRota({ paradas: paradas.filter(p => p.key !== key) })
  }

  function toggleParada(key, extras = {}) {
    if (isParadaEquipe(key)) {
      toggleEquipeNaRota(key.slice('equipe:'.length))
      return
    }
    rotasEditadasRef.current = true
    setRotas(prev => prev.map(r => {
      if (String(r.id) !== String(rotaAtivaId)) return r
      const list = (r.paradas || []).filter(p => !isParadaEquipe(p))
      const exists = list.some(p => p.key === key)
      if (exists) {
        return {
          ...r,
          paradas: list.filter(p => p.key !== key),
          atualizadoEm: new Date().toISOString(),
        }
      }
      const tipo = key.startsWith('material:') ? 'entrega' : key.startsWith('agenda:') ? 'evento' : 'visita'
      return {
        ...r,
        paradas: [...list, criarParadaBase({ key, tipoParada: extras.tipoParada || tipo, ...extras })],
        atualizadoEm: new Date().toISOString(),
      }
    }))
    setRotaCalc(null)
  }

  function toggleEquipeNaRota(membroId, forcar) {
    const id = String(membroId || '')
    if (!id) return
    const ja = equipeIdsSet.has(id)
    const incluir = forcar === undefined ? !ja : Boolean(forcar)
    const next = incluir
      ? [...new Set([...equipeIds, id])]
      : equipeIds.filter(x => x !== id)
    // tambÃ©m limpa qualquer parada legada equipe:
    const paradasLimpas = paradas.filter(p => !isParadaEquipe(p))
    atualizarRota({ equipeIds: next, paradas: paradasLimpas })
  }

  function atualizarParada(key, patch) {
    atualizarRota({
      paradas: paradas.map(p => p.key === key ? { ...p, ...patch } : p),
    })
  }

  function moverParada(key, dir) {
    const detIdx = paradasDetalhes.findIndex(p => p.key === key)
    if (detIdx < 0) return
    const trocaIdx = detIdx + dir
    if (trocaIdx < 0 || trocaIdx >= paradasDetalhes.length) return
    const keyTroca = paradasDetalhes[trocaIdx].key
    const arr = [...paradas]
    const iA = arr.findIndex(p => p.key === key)
    const iB = arr.findIndex(p => p.key === keyTroca)
    if (iA < 0 || iB < 0) return
    ;[arr[iA], arr[iB]] = [arr[iB], arr[iA]]
    atualizarRota({ paradas: arr })
  }

  function aplicarOrdemParadas(keys) {
    const reordenadas = keys.map(k => paradas.find(p => p.key === k)).filter(Boolean)
    const resto = paradas.filter(p => !keys.includes(p.key))
    const comHorarios = calcularHorariosParadas(
      resolverParadas(reordenadas, igrejas, membros, bairrosCoords || {}),
    )
    atualizarRota({
      paradas: [...reordenadas, ...resto].map(p => {
        const h = comHorarios.find(x => x.key === p.key)
        return h ? { ...p, horaPrevista: h.horaPrevista } : p
      }),
    })
    return reordenadas
  }

  async function aplicarSugestaoRotaDia({ bairro = 'Todos', maxParadas = 12, filtroVisita = 'pendentes' } = {}) {
    const sug = sugerirRotaDoDia({
      igrejas: igrejasVisiveis,
      bairro,
      maxParadas,
      filtroVisita,
    })
    if (!sug.ids.length) {
      window.alert(sug.motivo || 'Nenhuma igreja para sugerir.')
      return
    }
    const novas = criarParadasSugeridas(sug.ids, paradas)
    atualizarRota({ paradas: mesclarParadasIgreja(paradas, novas), status: 'em_andamento' })
    goStep('itinerary')
    await organizarECalcularRota()
  }

  function salvarTemplateAtivo(nome) {
    const tpl = saveRotaTemplate({ nome: nome || rotaAtiva?.nome, paradas })
    window.alert(`Template "${tpl.nome}" salvo (${tpl.paradaKeys.length} paradas).`)
  }

  function aplicarTemplateAtivo(templateId) {
    const tpl = loadRotaTemplates().find(t => String(t.id) === String(templateId))
    if (!tpl) return
    const merged = aplicarRotaTemplate(tpl, paradas)
    atualizarRota({ paradas: merged })
    goStep('itinerary')
  }

  async function gerarRelatorio() {
    const pack = execucoes[rotaAtivaId] || execucoes[String(rotaAtivaId)]
    const membro = membros.find(m => String(m.id) === String(rotaAtiva?.responsavelId))
    const ok = await copiarRelatorioRota({
      rota: rotaAtiva,
      exec: pack?.exec,
      paradas: paradasDetalhes,
      membro,
    })
    if (ok) window.alert('Relatório copiado — cole no WhatsApp.')
  }

  const alertasCulto = useMemo(
    () => alertasCultoParadas(paradasDetalhes, rotaAtiva?.data),
    [paradasDetalhes, rotaAtiva?.data],
  )

  const rotaTemplates = useMemo(() => loadRotaTemplates(), [rotas, rotaAtivaId])

  function otimizarRota() {
    const keys = otimizarOrdemParadas(paradasDetalhes)
    aplicarOrdemParadas(keys)
  }

  function boundsDePontos(pts) {
    if (!pts.length) return null
    return pts.reduce(
      (b, p) => [[Math.min(b[0][0], p[0]), Math.min(b[0][1], p[1])], [Math.max(b[1][0], p[0]), Math.max(b[1][1], p[1])]],
      [[90, 180], [-90, -180]],
    )
  }

  function voltarMapaIgrejas() {
    setCamadaMapa('igrejas')
    setRotaCalc(null)
    goStep('plan')
    setPanelAberto(false)
    const pts = igrejasBlumenau.filter(ig => ig.lat && ig.lng).map(ig => [ig.lat, ig.lng])
    const b = boundsDePontos(pts)
    if (b) setFitBounds(b)
  }

  async function calcularRota() {
    if (paradasComDestino.length < 2) return
    setRotaLoad(true)
    try {
      const coordsRota = await resolverCoordsRotaParadas(paradasComDestino)
      if (coordsRota.length < 2) {
        window.alert('Não foi possível localizar os endereços das paradas. Verifique o endereço cadastrado em cada igreja.')
        return
      }
      const resultado = await buscarRota(coordsRota.map(c => [c.lat, c.lng]))
      if (resultado) {
        setRotaCalc(resultado)
        goStep('itinerary')
        const b = boundsDePontos(resultado.linha)
        if (b) setFitBounds(b)
      }
    } catch {
      setRotaCalc(null)
    } finally {
      setRotaLoad(false)
    }
  }

  async function organizarECalcularRota() {
    if (paradasComDestino.length < 2) {
      window.alert('Adicione pelo menos duas paradas com endereço cadastrado para calcular a rota.')
      return
    }
    setRotaLoad(true)
    try {
      const coordsRota = await resolverCoordsRotaParadas(paradasComDestino)
      if (coordsRota.length < 2) {
        window.alert('Não foi possível localizar os endereços das paradas. Verifique o endereço cadastrado em cada igreja.')
        return
      }
      const pts = coordsRota.map(c => [c.lat, c.lng])
      const otimizada = await buscarRotaMaisRapida(pts)
      let resultado = null
      if (otimizada?.ordemIndices?.length) {
        const ordenadas = otimizada.ordemIndices
          .map(i => coordsRota[i])
          .filter(Boolean)
        const keysOrd = ordenadas.map(c => c.key)
        aplicarOrdemParadas(keysOrd)
        resultado = {
          linha: otimizada.linha,
          distancia: otimizada.distancia,
          duracao: otimizada.duracao,
        }
      } else {
        const keys = otimizarOrdemParadas(paradasDetalhes, { fixarInicio: false })
        aplicarOrdemParadas(keys)
        const reord = keys
          .map(k => paradasComDestino.find(p => p.key === k))
          .filter(Boolean)
        const coordsOrd = await resolverCoordsRotaParadas(reord)
        resultado = coordsOrd.length >= 2
          ? await buscarRota(coordsOrd.map(c => [c.lat, c.lng]))
          : null
      }
      if (resultado) {
        setRotaCalc(resultado)
        goStep('itinerary')
        const b = boundsDePontos(resultado.linha)
        if (b) setFitBounds(b)
      }
    } catch {
      setRotaCalc(null)
    } finally {
      setRotaLoad(false)
    }
  }

  function importarAgenda() {
    if (!bairrosCoords) return
    const existentes = new Set(paradas.map(p => p.key))
    const novas = eventosHoje
      .filter(ev => !existentes.has(paradaKey('agenda', ev.id)))
      .map(ev => agendaParaParada(ev, bairrosCoords))
    if (!novas.length) return
    atualizarRota({ paradas: [...paradas, ...novas] })
  }

  function adicionarMaterial() {
    if (!matForm.itemId || !matForm.bairro || !matForm.quantidade || !bairrosCoords) return
    const item = materiaisDisp.find(i => i.id === matForm.itemId)
    if (!item) return
    const qtd = parseInt(matForm.quantidade) || 0
    if (qtd <= 0 || qtd > item.restante) return
    const par = materialParaParada(item, matForm.bairro, qtd, bairrosCoords)
    atualizarRota({ paradas: [...paradas, par] })
    setMatForm(f => ({ ...f, quantidade: '' }))
  }

  function marcarConcluida(key) {
    const par = paradasDetalhes.find(p => p.key === key)
    const concluidoEm = new Date().toISOString()
    atualizarParada(key, { status: 'concluido', concluidoEm })
    if (par?.tipo === 'igreja' && par.id) {
      marcarIgrejaVisitada(par.id, {
        rotaId: `${rotaAtivaId}:${key}`,
        data: rotaAtiva?.data || hojeStr,
        horaInicio: par.horaPrevista || '',
        duracaoMin: par.duracaoMin || 20,
        concluidoEm,
        visitadoPor: membros.find(m => m.id === rotaAtiva?.responsavelId)?.nome || usuarioNome,
        visitadoPorEmail: usuarioEmail,
      })
      refreshChurches()
    }
    if (par?.material) {
      const resp = membros.find(m => m.id === rotaAtiva?.responsavelId)?.nome || ''
      registrarEntregaMaterial(par.material, resp)
    }
    const todas = paradas.every(p => p.key === key || p.status === 'concluido')
    if (todas) atualizarRota({ status: 'concluida' })
    else if (rotaAtiva?.status === 'rascunho') atualizarRota({ status: 'em_andamento' })
  }

  function desfazerVisitaParada(key) {
    const par = paradasDetalhes.find(p => p.key === key)
    atualizarParada(key, { status: 'pendente', concluidoEm: '' })
    if (par?.tipo === 'igreja' && par.id) {
      desmarcarIgrejaVisitada(par.id)
      refreshChurches()
    }
    if (rotaAtiva?.status === 'concluida') atualizarRota({ status: 'em_andamento' })
  }

  function selecionarAncoraIgreja(ig) {
    if (!ig) return
    setIgrejaAncoraId(ig.id)
    setPainel('igrejas')
    setCamadaMapa('igrejas')
    if (ig.lat) {
      setFlyToPoint({ coords: [ig.lat, ig.lng], ts: Date.now() })
      const pad = Math.max(proxIgrejaKm * 0.009, 0.004)
      setFitBounds([
        [ig.lat - pad, ig.lng - pad],
        [ig.lat + pad, ig.lng + pad],
      ])
    }
  }

  function adicionarAncoraEProximas() {
    if (!igrejaAncora) return
    const ids = [igrejaAncora.id, ...igrejasProximasDaAncora.map(v => v.igreja.id)]
    const existentes = new Set(paradas.map(p => p.key))
    const novas = ids
      .map(id => paradaKey('igreja', id))
      .filter(k => !existentes.has(k))
      .map(key => criarParadaBase({ key, tipoParada: 'visita' }))
    if (!novas.length) return
    atualizarRota({ paradas: [...paradas.filter(p => !isParadaEquipe(p)), ...novas] })
  }

  function novaRota(opts = {}) {
    const data = opts.data || hojeStr
    const responsavelId = opts.responsavelId || ''
    const membro = membros.find(m => String(m.id) === String(responsavelId))
    const nomeBase = membro?.nome
      ? `Rota ${membro.nome.split(' ')[0]} Â· ${fmtDataBR(data)}`
      : `Rota ${fmtDataBR(data)}`
    const r = criarRotaVazia({
      data,
      responsavelId,
      nome: opts.nome || nomeBase,
    })
    if (responsavelId) {
      r.equipeIds = [String(responsavelId)]
    }
    rotasEditadasRef.current = true
    setRotas(prev => [...prev, r])
    setRotaAtivaId(r.id)
    setRotaCalc(null)
    setEnviarAberto(false)
    setNovaRotaOpen(false)
    setNovaRotaMembroId('')
    setNovaRotaData(hojeStr)
    goStep('plan')
  }

  function abrirNovaRota() {
    setNovaRotaData(hojeStr)
    setNovaRotaMembroId(rotaAtiva?.responsavelId || '')
    setNovaRotaOpen(true)
  }

  function excluirRota(id, e) {
    e?.stopPropagation?.()
    e?.preventDefault?.()
    const alvo = rotas.find(r => String(r.id) === String(id))
    if (!alvo) return
    const n = (alvo.paradas || []).filter(p => !isParadaEquipe(p)).length
    const ok = window.confirm(
      n > 0
        ? `Apagar a rota "${alvo.nome}" (${n} parada${n !== 1 ? 's' : ''})?\n\nIsso remove do histÃ³rico e nÃ£o pode ser desfeito.`
        : `Apagar a rota "${alvo.nome}"?\n\nEla sai do histÃ³rico.`,
    )
    if (!ok) return

    marcarRotaRemovida(alvo.id)
    const compAoVivo = compartilhamentoDaRota(alvo.id)
    if (compAoVivo?.shareId && !compAoVivo.encerrada) {
      void encerrarAoVivoRota(compAoVivo.shareId)
    }
    removerCompartilhamentoRota(alvo.id)
    rotasEditadasRef.current = true
    const restantes = rotas.filter(r => String(r.id) !== String(alvo.id))
    setRotaCalc(null)
    setEnviarAberto(false)

    if (!restantes.length) {
      const r = criarRotaVazia()
      setRotas([r])
      setRotaAtivaId(r.id)
      saveRotasLogistica([r], r.id)
      goStep('history')
    } else {
      const novaAtiva = String(rotaAtivaId) === String(alvo.id) ? restantes[0].id : rotaAtivaId
      saveRotasLogistica(restantes, novaAtiva)
      setRotas(restantes)
      if (String(rotaAtivaId) === String(alvo.id)) setRotaAtivaId(restantes[0].id)
    }
    flushAfterSave()
  }

  function duplicarRota(id) {
    const origem = rotas.find(r => r.id === id)
    if (!origem) return
    const copia = {
      ...normalizarRota(origem),
      id: gerarId(),
      nome: `${origem.nome} (cÃ³pia)`,
      status: 'rascunho',
      resultadoMotivo: '',
      resultadoEm: '',
      resultadoPor: '',
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
      paradas: (origem.paradas || []).map(p => ({ ...p })),
      equipeIds: [...(origem.equipeIds || [])],
    }
    rotasEditadasRef.current = true
    setRotas(prev => [...prev, copia])
    setRotaAtivaId(copia.id)
    setRotaCalc(null)
    goStep('itinerary')
  }

  function abrirRotaParaEditar(id) {
    setRotaAtivaId(id)
    setRotaCalc(null)
    setPanelAberto(true)
    const r = rotas.find(x => String(x.id) === String(id))
    const n = (r?.paradas || []).filter(p => !isParadaEquipe(p)).length
    goStep(n > 0 ? 'itinerary' : 'plan')
  }

  function abrirEnvioDaRota(id) {
    const r = rotas.find(x => String(x.id) === String(id))
    if (!r) return
    setRotaAtivaId(id)
    setRotaCalc(null)
    goStep('send')
    if (r.responsavelId) setEnviarPara(String(r.responsavelId))
    setEnviarLoad(true)
    void (async () => {
      try {
        await garantirLinkAoVivo(r)
        setEnviarAberto(true)
      } finally {
        setEnviarLoad(false)
      }
    })()
  }

  function definirResponsavel(membroId) {
    const membro = membros.find(m => String(m.id) === String(membroId))
    const patch = { responsavelId: membroId || '' }
    const data = rotaAtiva?.data || hojeStr
    const nomeAtual = String(rotaAtiva?.nome || '')
    const eraPadrao = !nomeAtual
      || /^Rota \d{2}\/\d{2}\/\d{4}$/.test(nomeAtual)
      || /^Rota .+ Â· \d{2}\/\d{2}\/\d{4}$/.test(nomeAtual)
      || nomeAtual === `Rota ${fmtDataBR(data)}`
    if (eraPadrao) {
      patch.nome = membro
        ? `Rota ${membro.nome.split(' ')[0]} Â· ${fmtDataBR(data)}`
        : `Rota ${fmtDataBR(data)}`
    }
    const eqs = new Set((rotaAtiva?.equipeIds || []).map(String))
    if (membroId) eqs.add(String(membroId))
    patch.equipeIds = [...eqs]
    atualizarRota(patch)
  }

  function fitParadas() {
    const b = boundsDePontos(paradasComCoords.map(p => [p.lat, p.lng]))
    if (b) setFitBounds(b)
  }

  function abrirModalEncerrarAoVivo({ membroId = '', rotaIdsPreselect = [] } = {}) {
    setEncerrarModal({
      open: true,
      membroId: membroId || enviarPara || rotaAtiva?.responsavelId || '',
      preselect: (rotaIdsPreselect || []).map(String),
    })
  }

  async function aplicarEncerrarAoVivo({ rotaIds, concluir, status = 'concluida', motivo = '' }) {
    if (!rotaIds?.length) return
    if (concluir && statusRotaExigeMotivo(status) && motivo.length < 3) {
      window.alert('Informe o motivo (mÃ­n. 3 caracteres) para conclusÃ£o parcial.')
      return
    }
    setEncerrarLoad(true)
    try {
      // 1. Marca guard local imediatamente (impede poll de re-adicionar antes do servidor confirmar)
      const shareIds = []
      for (const rotaId of rotaIds) {
        const comp = compartilhamentoDaRota(rotaId)
        if (comp?.shareId) {
          encerradasGuardRef.current.add(comp.shareId)
          shareIds.push(comp.shareId)
        }
      }

      // 2. Remove do estado imediatamente (sem esperar servidor)
      setExecucoes(prev => {
        const next = { ...prev }
        for (const rotaId of rotaIds) {
          delete next[rotaId]
          delete next[String(rotaId)]
        }
        return next
      })

      // 3. Fecha modal jÃ¡
      setEncerrarModal({ open: false, membroId: '', preselect: [] })

      // 4. Envia ao servidor e conclui rotas (background)
      for (const rotaId of rotaIds) {
        const shareId = compartilhamentoDaRota(rotaId)?.shareId
          || shareIds.find((sid, i) => String(rotaIds[i]) === String(rotaId))
        if (shareId) await encerrarAoVivoRota(shareId)
        if (concluir) concluirRotaPorId(rotaId, { status, motivo })
      }

      setExecTick(t => t + 1)
      // Aguarda um pouco para servidor confirmar antes de fazer flush (evita restaurar estado antigo)
      setTimeout(() => flushAfterSave(), 3000)
    } finally {
      setEncerrarLoad(false)
    }
  }

  function encerrarAoVivo(shareId, rota) {
    abrirModalEncerrarAoVivo({
      membroId: rota?.responsavelId || enviarPara || '',
      rotaIdsPreselect: rota?.id ? [rota.id] : [],
    })
  }

  function encerrarAoVivoDaRotaAtiva() {
    const ativos = listarCompartilhamentosAtivos()
    if (!ativos.length) {
      window.alert('Nenhuma rota ao vivo ativa no momento.')
      return
    }
    abrirModalEncerrarAoVivo({
      membroId: enviarPara || rotaAtiva?.responsavelId || '',
      rotaIdsPreselect: rotaAtivaId ? [rotaAtivaId] : [],
    })
  }

  const compartilhamentoAtivo = useMemo(
    () => compartilhamentoDaRota(rotaAtivaId),
    [rotaAtivaId, execTick, rotas],
  )

  const aoVivoAtivoNaRota = Boolean(
    compartilhamentoAtivo?.shareId
    && !compartilhamentoAtivo?.encerrada
    && Object.values(execucoes).some(p =>
      String(p.share?.rotaId) === String(rotaAtivaId)
      && !execucaoEstaEncerrada(p.exec, p.share)
      && gpsEstaAoVivo(p.exec?.posicao, agoraLive),
    ),
  )

  const shareAtivoNaRota = Boolean(
    compartilhamentoAtivo?.shareId && !compartilhamentoAtivo?.encerrada,
  )

  async function garantirLinkAoVivo(rotaOverride) {
    const rota = rotaOverride || rotaAtiva
    const det = rotaOverride
      ? resolverParadas(rota.paradas || [], igrejas, membros, bairrosCoords || {}).filter(p => !isParadaEquipe(p))
      : paradasDetalhes
    const id = enviarPara || rota?.responsavelId
    const membro = membros.find(m => String(m.id) === String(id))
    if (!rota) return ''
    if (!det.length) {
      window.alert('Adicione pelo menos uma parada antes de enviar.')
      return ''
    }
    const ja = loadCompartilhamentosRotas().find(s => String(s.rotaId) === String(rota.id))
    const share = criarShareRota({
      rota: { ...rota, paradas: det, id: rota.id },
      membro: membro?.nome || ja?.membro || '',
      membroId: membro?.id || id || ja?.membroId || '',
    })
    if (ja?.shareId) share.shareId = ja.shareId
    const url = urlRotaEquipe(share.shareId)
    setShareLink(url)
    await persistirCompartilhamentoRota({
      rotaId: rota.id,
      shareId: share.shareId,
      link: url,
      membro: share.membro,
      membroId: share.membroId,
      nome: rota.nome,
      paradas: share.paradas,
    })
    await publicarExecucaoRota(share)
    const remoto = await fetchSharePublica(share.shareId)
    if (!remoto?.paradas?.length) {
      window.alert('O link foi gerado neste aparelho, mas o servidor ainda nÃ£o confirmou. Copie o link e, se a equipe nÃ£o ver as paradas, toque em Enviar de novo.')
    }
    flushAfterSave()
    return url
  }

  async function copiarLinkEquipe(url) {
    const link = url || shareLink
    if (!link) return false
    try {
      await navigator.clipboard.writeText(link)
      setShareCopiado(true)
      setTimeout(() => setShareCopiado(false), 2500)
      return true
    } catch {
      return false
    }
  }

  async function abrirModalEnviar() {
    if (!paradas.length) {
      window.alert('Adicione pelo menos uma parada antes de enviar.')
      return
    }
    setEnviarLoad(true)
    try {
      await garantirLinkAoVivo()
      setEnviarAberto(true)
    } finally {
      setEnviarLoad(false)
    }
  }

  async function abrirWhatsApp() {
    const id = enviarPara || rotaAtiva?.responsavelId
    const membro = membros.find(m => String(m.id) === String(id))
    if (!membro?.telefone) {
      window.alert('Selecione um membro com telefone cadastrado na Equipe.')
      return false
    }
    const liveUrl = await garantirLinkAoVivo()
    if (!liveUrl) return false
    const url = linkWhatsApp(
      membro.telefone,
      mensagemRota(paradasDetalhes, mapsUrl, rotaAtiva?.nome, equipeDaRota.map(m => m.nome), {
        wazeUrl: wazePrimeira,
        data: rotaAtiva?.data || hojeStr,
        liveUrl,
      }),
    )
    goStep('live')
    if (url) window.open(url, '_blank', 'noopener')
    return true
  }

  function copiarShareLink() {
    copiarLinkEquipe(shareLink)
  }

  function liveDetalhe(key) {
    const pack = execucoes[rotaAtivaId] || execucoes[String(rotaAtivaId)]
    return pack?.exec ? detalheParada(pack.exec, key) : null
  }

  function focarEquipeLive(rotaId, gps) {
    if (rotaId) setRotaAtivaId(rotaId)
    goStep('live')
    if (Number.isFinite(gps?.lat) && Number.isFinite(gps?.lng)) {
      setFlyToPoint({ coords: [gps.lat, gps.lng], ts: Date.now(), zoom: 17 })
    }
  }

  function corParada(p) {
    const live = liveDetalhe(p.key)?.status
    if (live === 'concluido' || p.status === 'concluido') return '#10b981'
    if (live === 'nao_visitou') return '#f87171'
    if (live === 'em_deslocamento') return '#22d3ee'
    if (live === 'no_local') return '#fbbf24'
    if (p.tipoParada) return corTipoParada(p.tipoParada)
    if (p.tipo === 'equipe') return p.cor || CARGO_CORES[p.cargo] || '#10b981'
    const isOutra = p.denominacao !== DENOMINACAO_PADRAO
    return isOutra ? (COR_DENOMINACAO[p.denominacao] || '#8b5cf6') : (SETORES[p.setor] || '#3b82f6')
  }

  function selecionarPainel(id) {
    setPainel(id)
    setWizardStep('plan')
    setSideTab('adicionar')
    setPanelAberto(true)
    if (id === 'igrejas' || id === 'proximas' || id === 'bairro' || id === 'vizinhanca') setCamadaMapa('igrejas')
    if (id === 'equipe') setCamadaMapa('equipe')
  }

  function irAdicionar(id = 'igrejas') {
    selecionarPainel(id)
  }

  function abrirPessoas() {
    setPainel('equipe')
    setWizardStep('plan')
    setSideTab('adicionar')
    setPanelAberto(true)
    setCamadaMapa('equipe')
  }

  const respHead = membros.find(m => String(m.id) === String(rotaAtiva?.responsavelId))
  const filtrosIgrejaAtivos = [
    filtroDenom !== 'todas',
    filtroDiaCulto !== 'Todos',
    filtroPeriodoCulto !== 'todos',
    filtroVisita !== 'todas',
    filtroSetor !== 'Todos',
    filtroSomenteVerificadas,
  ].filter(Boolean).length
  const bairrosChip = bairrosOficiais

  function goStep(step) {
    const sideMap = {
      plan: 'adicionar',
      itinerary: 'rota',
      send: 'rota',
      live: 'aovivo',
      history: 'historico',
    }
    const valid = ['plan', 'itinerary', 'send', 'live', 'history']
    const s = valid.includes(step) ? step : 'plan'
    setWizardStep(s)
    setSideTab(sideMap[s] || 'adicionar')
    setPanelAberto(true)
    if (s === 'plan') {
      setCamadaMapa('candidatas')
    }
    if (s === 'itinerary' || s === 'send') setCamadaMapa('rota')
    if (s === 'live') {
      setLiveSeguir(true)
      setCommandMode(true)
      setPanelAberto(false)
      setCamadaMapa('rota')
    }
  }

  const rotasCtx = {
    center: BLUMENAU_COORD,
    rotas,
    rotasOrdenadas,
    rotaAtivaId,
    setRotaAtivaId,
    setRotaCalc,
    qtdParadas,
    routeHealth,
    respHead,
    rotaAtiva,
    sideTab,
    setSideTab,
    wizardStep,
    goStep,
    setPanelAberto,
    painel,
    setPainel,
    setLiveSeguir,
    liveCount,
    liveSharesAtivos,
    livePulseCount,
    liveSeguir,
    abrirNovaRota,
    panelAberto,
    busca,
    setBusca,
    filtroSetor,
    setFiltroSetor,
    filtroDenom,
    setFiltroDenom,
    filtroVisita,
    setFiltroVisita,
    filtroDiaCulto,
    setFiltroDiaCulto,
    filtroPeriodoCulto,
    setFiltroPeriodoCulto,
    filtroSomenteVerificadas,
    setFiltroSomenteVerificadas,
    filtrosIgrejaAtivos,
    camadaMapa,
    setCamadaMapa,
    mostrarCandidatas,
    adbluCount,
    outrasDenomCount,
    igrejasVisiveis,
    adicionarTodasFiltradas,
    adicionarTodasDoBairro,
    adicionarParIgrejas,
    adicionarAncoraEProximas,
    verParNoMapa,
    igrejaAncora,
    setIgrejaAncoraId,
    igrejasProximasDaAncora,
    proxIgrejaKm,
    setProxIgrejaKm,
    proxModo,
    setProxModo,
    proxDenom,
    setProxDenom,
    proxMaxKm,
    setProxMaxKm,
    proxSetor,
    setProxSetor,
    proxExpandido,
    setProxExpandido,
    proximidade,
    gruposProximos,
    gruposParaImprimir,
    keysNaRota,
    paradaOrdemMap,
    toggleParada,
    resumoCultoIgreja,
    eventosHoje,
    importarAgenda,
    membros,
    equipeIds,
    equipeDaRota,
    definirResponsavel,
    toggleEquipeNaRota,
    setFlyToPoint,
    selecionarPainel,
    paradasDetalhes,
    rotaCalc,
    rotaLoad,
    organizarECalcularRota,
    moverParada,
    removerParada,
    marcarConcluida,
    corParada,
    liveDetalhe,
    enviarPara,
    setEnviarPara,
    abrirModalEnviar,
    abrirWhatsApp,
    enviarLoad,
    shareLink,
    shareCopiado,
    copiarShareLink,
    mapsUrl,
    wazePrimeira,
    shareAtivoNaRota,
    aoVivoAtivoNaRota,
    encerrarAoVivoDaRotaAtiva,
    paradas,
    concluidas,
    agoraLive,
    commandMode,
    setCommandMode,
    materiaisDisp,
    matForm,
    setMatForm,
    adicionarMaterial,
    carga,
    registrarResultado,
    motivoDraft,
    setMotivoDraft,
    resultadoAberto,
    setResultadoAberto,
    aplicarOrdemParadas,
    aplicarSugestaoRotaDia,
    salvarTemplateAtivo,
    aplicarTemplateAtivo,
    removerRotaTemplate,
    rotaTemplates,
    alertasCulto,
    gerarRelatorio,
    bairrosChip,
    execucoes,
    igrejas,
    bairrosCoords,
    focarEquipeLive,
    encerrarAoVivo,
    abrirModalEncerrarAoVivo,
    panelHistorico: (
      <PainelHistorico
        relMembroId={relMembroId}
        setRelMembroId={setRelMembroId}
        relDataDe={relDataDe}
        setRelDataDe={setRelDataDe}
        relDataAte={relDataAte}
        setRelDataAte={setRelDataAte}
        relStatus={relStatus}
        setRelStatus={setRelStatus}
        membros={membros}
        rotasFiltradasRel={rotasFiltradasRel}
        rotasOrdenadas={rotasOrdenadas}
        rotaAtivaId={rotaAtivaId}
        abrirNovaRota={abrirNovaRota}
        abrirRotaParaEditar={abrirRotaParaEditar}
        abrirEnvioDaRota={abrirEnvioDaRota}
        duplicarRota={duplicarRota}
        excluirRota={excluirRota}
      />
    ),
    mapProps: {
      fitBounds,
      flyToPoint,
      streetView,
      onStreetViewClose: () => setStreetView(null),
      onMapClick: () => {
        setMapInfoKey(null)
        setHoverKey(null)
        if (sideTab === 'aovivo') setLiveSeguir(false)
      },
      camadaMapa,
      setCamadaMapa,
      panelAberto,
      setPanelAberto,
      igrejasNoMapa,
      igrejasNoMapaOmitidas: igrejasNoMapaPack.omitidas,
      igrejasNoMapaTotal: igrejasNoMapaPack.total,
      keysNaRota,
      mostrarTodasIgrejas,
      mostrarCandidatas,
      paradaOrdemMap,
      paradasDetalhes,
      corParada,
      hoverMapaAtivo,
      abrirHoverRota,
      fecharHoverRota,
      setMapInfoKey,
      setHoverKey,
      setFlyToPoint,
      toggleParada,
      toggleEquipeNaRota,
      setStreetView,
      mapInfoKey,
      hoverKey,
      igrejas,
      bairrosCoords,
      membros,
      liveMembroIds,
      equipeIdsSet,
      mostrarEquipeMapa,
      rotaCalc,
      fitParadas,
      paradasComCoords,
      organizarECalcularRota,
      rotaLoad,
      qtdParadas,
      liveCount,
      liveSharesAtivos,
      livePulseCount,
      liveTrails,
      rotaAtivaId,
      execucoes,
      agoraLive,
      focarEquipeLive,
      sideTab,
      liveDir,
      liveGpsDestino,
      liveFollowTarget,
      liveSeguir,
      setLiveSeguir,
      goStep,
      setSideTab,
      bairrosOverlay: showBairrosMapa && bairrosGeoPack?.data ? {
        data: bairrosGeoPack.data,
        bairroCores: bairroCoresMapa,
        layerKey: 'rotas-bairros',
      } : null,
      contornoMunicipal: showContornoMapa ? contornoParaMapa(limiteBlu, bairrosGeoPack?.data) : null,
      showBairrosMapa,
      setShowBairrosMapa,
      showContornoMapa,
      setShowContornoMapa,
      showBairroNomes,
      setShowBairroNomes,
      bairrosGeoData: bairrosGeoPack?.data || null,
      filtroDenom,
    },
    modals: {
      nova: {
        open: novaRotaOpen,
        onClose: () => setNovaRotaOpen(false),
        novaRotaData,
        setNovaRotaData,
        novaRotaMembroId,
        setNovaRotaMembroId,
        membros,
        hojeStr,
        onCriar: novaRota,
      },
      enviar: {
        open: enviarAberto,
        onClose: () => setEnviarAberto(false),
        enviarPara,
        setEnviarPara,
        rotaAtiva,
        membros,
        enviarLoad,
        onWhatsApp: async () => { if (await abrirWhatsApp()) setEnviarAberto(false) },
        shareLink,
        shareCopiado,
        onCopiarShare: copiarShareLink,
        mapsUrl,
        wazePrimeira,
        shareAtivoNaRota,
        aoVivoAtivoNaRota,
        onEncerrarAoVivo: encerrarAoVivoDaRotaAtiva,
        onGerarLink: () => garantirLinkAoVivo(),
        qtdParadas,
        paradasComCoords: paradasComCoords.length,
      },
      fotoAmpliada,
      onCloseFoto: () => setFotoAmpliada(null),
      encerrar: {
        open: encerrarModal.open,
        onClose: () => setEncerrarModal({ open: false, membroId: '', preselect: [] }),
        membros,
        rotas,
        execucoes,
        sharesAtivos: listarCompartilhamentosAtivos(),
        membroIdInicial: encerrarModal.membroId,
        rotaIdsPreselect: encerrarModal.preselect,
        onConfirm: aplicarEncerrarAoVivo,
        loading: encerrarLoad,
      },
    },
  }

  return (
    <RotasContextBridge value={rotasCtx}>
      {children}
    </RotasContextBridge>
  )
}
