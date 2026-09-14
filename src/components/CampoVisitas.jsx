import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Search, Church, Loader2, MapPin, Camera, CheckCircle2, Users, Navigation,
  AlertTriangle, X, ExternalLink, Volume2, VolumeX, LayoutDashboard,
} from 'lucide-react'
import { useChurchVisit } from '../context/ChurchVisitContext'
import { useAccess } from '../context/AccessContext'
import { useMobileLayout } from '../hooks/useViewportMode'
import { compressImageFile } from '../utils/leadFormConfig'
import { isUsableFoto, finalizarFotoCheckInCampoBackground } from '../utils/mediaUpload'
import { readStorage } from '../utils/persist'
import { loadEquipeMembros } from '../utils/rotaUtils'
import { SYNC_EVENT, SYNC_STORAGE_EVENT } from '../lib/cloudSync'
import {
  dataLocalHoje,
  igrejaIdDoMembroLogado,
  listarCheckInsDoDia,
  obterGpsAtual,
  distanciaCheckinMetros,
  googleMapsDirUrl,
  labelDistanciaCheckin,
  foraDoRaioCheckin,
  checkInAlertaForaRaio,
  chaveCheckInTorre,
  RAIO_CHECKIN_CAMPO_M,
  syncCampoTorreFromServer,
} from '../utils/campoCheckIn'
import {
  lerSomTorreAtivo,
  salvarSomTorreAtivo,
  prepararAudioTorre,
  tocarAlertaForaRaio,
} from '../utils/alertaSonoro'
import {
  rotaDiariaDoMembro,
  readRotasDiariasRaw,
  rotasDiariasNaData,
  marcarParadaEmTransitoRota,
  marcarParadaConcluidaRota,
  progressoRotasEquipe,
  metricasDesempenhoEquipe,
  ROTAS_DIARIAS_EVENT,
  STATUS_PARADA,
  adicionarParadaRotaDiaria,
} from '../utils/rotasDiarias'
import CampoDespachoPanel from './CampoDespachoPanel'
import CampoTorreMap from './CampoTorreMap'
import CampoEnterpriseCentral from './CampoEnterpriseCentral'
import CampoNovaIgrejaModal from './CampoNovaIgrejaModal'
import {
  setoresUnicosCatalogo,
  filtrarProgressoTorre,
  filtrarCheckInsTorre,
  torreFiltrosAtivos,
  formatarDataBadgeBR,
} from '../utils/campoTorreFiltros'

const CAMPO_TORRE_POLL_MS = 25000

function normEmail(e) {
  return String(e || '').trim().toLowerCase()
}

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

const STATUS_LABEL = {
  pendente: 'Pendente',
  em_transito: 'Em trânsito',
  concluido: 'Concluído',
}

function StatusBadge({ status }) {
  const st = status || 'pendente'
  const colors = {
    pendente: 'bg-white/10 text-white/70',
    em_transito: 'bg-amber-500/20 text-amber-200',
    concluido: 'bg-emerald-500/25 text-emerald-200',
  }
  return (
    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${colors[st] || colors.pendente}`}>
      {STATUS_LABEL[st] || st}
    </span>
  )
}

function CheckInModal({ igreja, onClose, onConfirm, busy }) {
  const [obs, setObs] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [gps, setGps] = useState(null)
  const [gpsErro, setGpsErro] = useState('')
  const [gpsLoad, setGpsLoad] = useState(true)
  const [foto, setFoto] = useState('')
  const [fotoErro, setFotoErro] = useState('')
  const [erro, setErro] = useState('')
  const [semFotoMode, setSemFotoMode] = useState(false)
  const [motivoSemFoto, setMotivoSemFoto] = useState('')

  const distMetros = useMemo(() => {
    if (!gps || !igreja) return null
    const d = distanciaCheckinMetros(gps, igreja)
    return Number.isFinite(d) ? Math.round(d) : null
  }, [gps, igreja])

  const precisaJustificativa = distMetros != null && distMetros > RAIO_CHECKIN_CAMPO_M

  const capturarGps = useCallback(async () => {
    setGpsErro('')
    setGpsLoad(true)
    try {
      const pos = await obterGpsAtual()
      setGps(pos)
    } catch (e) {
      setGps(null)
      setGpsErro(e?.message || 'GPS indisponível.')
    } finally {
      setGpsLoad(false)
    }
  }, [])

  useEffect(() => {
    capturarGps()
  }, [capturarGps])

  async function onFotoChange(e) {
    setFotoErro('')
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await compressImageFile(file, { maxSide: 1280, quality: 0.82 })
      setFoto(result.dataUrl || '')
    } catch {
      setFotoErro('Não foi possível usar esta imagem.')
    }
  }

  async function confirmarComFoto() {
    setErro('')
    if (!gps?.lat || !gps?.lng) {
      setErro('GPS obrigatório. Toque em “Atualizar GPS” e permita a localização.')
      return
    }
    if (!isUsableFoto(foto)) {
      setErro('Selecione uma foto ou use “Confirmar sem foto”.')
      return
    }
    if (precisaJustificativa && !String(justificativa).trim()) {
      setErro(`Você está a mais de ${RAIO_CHECKIN_CAMPO_M}m da igreja. Informe o motivo.`)
      return
    }
    await onConfirm({
      obs,
      gps,
      foto,
      distanciaMetros: distMetros,
      justificativaDistancia: precisaJustificativa ? justificativa.trim() : '',
      semFoto: false,
    })
  }

  async function confirmarSemFoto() {
    setErro('')
    if (!gps?.lat || !gps?.lng) {
      setErro('GPS obrigatório.')
      return
    }
    const motivo = String(motivoSemFoto || '').trim()
    if (!motivo) {
      setErro('Informe o motivo para concluir sem foto.')
      return
    }
    if (precisaJustificativa && !String(justificativa).trim()) {
      setErro(`Você está a mais de ${RAIO_CHECKIN_CAMPO_M}m da igreja. Informe o motivo de distância.`)
      return
    }
    await onConfirm({
      obs: [obs, motivo].filter(Boolean).join(' · '),
      gps,
      foto: '',
      distanciaMetros: distMetros,
      justificativaDistancia: precisaJustificativa ? justificativa.trim() : '',
      semFoto: true,
      motivoSemFoto: motivo,
    })
  }

  if (!igreja) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/55">
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[92svh]"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-start gap-2 px-4 py-3 border-b border-[var(--border-subtle)]">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Check-in</p>
            <h3 className="font-bold text-base truncate">{igreja.nome}</h3>
            <p className="text-xs text-[var(--text-muted)] truncate">{igreja.setor} · {igreja.endereco}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-white/10" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4 text-sm">
          <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="font-semibold flex items-center gap-1.5">
                <Navigation size={16} className="text-emerald-400" />
                GPS (obrigatório)
              </span>
              <button type="button" disabled={gpsLoad || busy} onClick={capturarGps} className="text-xs font-bold px-2 py-1 rounded-lg hover:bg-white/10 disabled:opacity-50">
                Atualizar GPS
              </button>
            </div>
            {gpsLoad && (
              <p className="text-[var(--text-muted)] flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Obtendo localização…
              </p>
            )}
            {!gpsLoad && gps && (
              <>
                <p className="text-emerald-300/90 text-xs">
                  ✓ {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
                  {gps.accuracy ? ` · ±${Math.round(gps.accuracy)} m` : ''}
                </p>
                {distMetros != null && (
                  <p className={`text-xs mt-1 ${precisaJustificativa ? 'text-amber-300' : 'text-emerald-400/80'}`}>
                    {labelDistanciaCheckin(distMetros)}
                  </p>
                )}
              </>
            )}
            {!gpsLoad && gpsErro && (
              <p className="text-amber-300 text-xs flex items-start gap-1.5">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                {gpsErro}
              </p>
            )}
          </div>

          {precisaJustificativa && (
            <div className="rounded-xl p-3 border border-amber-500/40 bg-amber-500/10">
              <p className="text-xs font-bold text-amber-200 mb-2">Fora do raio de {RAIO_CHECKIN_CAMPO_M}m — justifique</p>
              <textarea
                value={justificativa}
                onChange={e => setJustificativa(e.target.value)}
                rows={2}
                disabled={busy}
                placeholder="Ex.: endereço da igreja desatualizado, visita na casa do pastor…"
                className="w-full rounded-lg px-3 py-2 text-sm resize-none bg-black/20 border border-amber-500/30"
              />
            </div>
          )}

          <div>
            <label className="font-semibold flex items-center gap-1.5 mb-2">
              <Camera size={16} className="text-sky-400" />
              {semFotoMode ? 'Check-in sem foto' : 'Foto do local'}
            </label>
            {!semFotoMode && (
              <>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={busy}
                  onChange={onFotoChange}
                  className="block w-full text-xs text-[var(--text-muted)] file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-600 file:text-white"
                />
                {fotoErro && <p className="text-amber-300 text-xs mt-1">{fotoErro}</p>}
                {foto && <img src={foto} alt="Prévia" className="mt-2 rounded-lg max-h-40 w-full object-cover border border-white/10" />}
              </>
            )}
            {semFotoMode && (
              <textarea
                value={motivoSemFoto}
                onChange={e => setMotivoSemFoto(e.target.value)}
                rows={2}
                disabled={busy}
                placeholder="Motivo (ex: local fechado, sem iluminação, câmera indisponível)"
                className="w-full rounded-lg px-3 py-2 text-sm resize-none bg-black/20 border border-amber-500/30"
              />
            )}
            {!semFotoMode ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => { setSemFotoMode(true); setErro('') }}
                className="mt-2 text-[11px] font-semibold text-amber-300 hover:underline"
              >
                ⚠️ Confirmar sem foto
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => { setSemFotoMode(false); setMotivoSemFoto('') }}
                className="mt-2 text-[11px] font-semibold text-white/60 hover:underline"
              >
                Voltar e usar foto
              </button>
            )}
          </div>

          <div>
            <label className="font-semibold block mb-1">Observação (opcional)</label>
            <textarea
              value={obs}
              onChange={e => setObs(e.target.value)}
              rows={2}
              disabled={busy}
              className="w-full rounded-xl px-3 py-2 text-sm resize-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)' }}
            />
          </div>

          {erro && (
            <p className="text-red-300 text-xs flex items-start gap-1.5">
              <AlertTriangle size={14} className="flex-shrink-0" />
              {erro}
            </p>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[var(--border-subtle)] flex flex-col gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-bold hover:bg-white/10 disabled:opacity-50">
            Cancelar
          </button>
          {semFotoMode ? (
            <button
              type="button"
              onClick={confirmarSemFoto}
              disabled={busy || gpsLoad}
              className="w-full py-2.5 rounded-xl text-sm font-black text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)' }}
            >
              {busy ? 'Salvando…' : 'Concluir sem foto'}
            </button>
          ) : (
            <button
              type="button"
              onClick={confirmarComFoto}
              disabled={busy || gpsLoad}
              className="w-full py-2.5 rounded-xl text-sm font-black text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}
            >
              {busy ? 'Salvando…' : '📷 Tirar Foto e Concluir'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ParadaRotaCard({ igreja, parada, onNavigate, onCheckIn, onACaminho, destaque }) {
  if (!igreja) return null
  const mapsUrl = googleMapsDirUrl(igreja)
  const pendente = (parada.status || STATUS_PARADA.PENDENTE) === STATUS_PARADA.PENDENTE
  return (
    <li
      className="rounded-xl px-3 py-3 flex flex-col gap-2"
      style={{
        border: '1px solid var(--border-subtle)',
        background: destaque ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.04)',
      }}
    >
      <div className="flex items-start gap-3">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black bg-emerald-500/20 text-emerald-300 flex-shrink-0">
          {parada.ordem}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-sm truncate">{igreja.nome}</p>
            <StatusBadge status={parada.status} />
          </div>
          <p className="text-xs text-[var(--text-muted)] truncate">{igreja.setor} · {igreja.endereco}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {pendente && onACaminho && (
          <button
            type="button"
            onClick={() => onACaminho(igreja)}
            className="w-full py-2 rounded-xl text-xs font-black text-slate-900"
            style={{ background: 'linear-gradient(135deg, #fde047, #facc15)' }}
          >
            🚚 A caminho
          </button>
        )}
        <div className="flex gap-2">
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onNavigate?.(igreja)}
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15"
        >
          <ExternalLink size={14} />
          Navegar até o local
        </a>
        {parada.status !== STATUS_PARADA.CONCLUIDO && (
          <button
            type="button"
            onClick={() => onCheckIn(igreja)}
            className="flex-1 py-2 rounded-xl text-xs font-black text-white"
            style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}
          >
            Check-in
          </button>
        )}
        </div>
      </div>
    </li>
  )
}

export default function CampoVisitas() {
  const mobile = useMobileLayout()
  const { role } = useAccess()
  const isAdmin = role === 'owner'
  const showEnterprise = isAdmin && !mobile
  const { churches, loading, loadError, markVisited, userEmail, addChurch, removeChurch } = useChurchVisit()
  const [busca, setBusca] = useState('')
  const [aba, setAba] = useState(() => (isAdmin && !mobile ? 'central' : 'minhas'))
  const [checkInIgreja, setCheckInIgreja] = useState(null)
  const [toast, setToast] = useState('')
  const [rotasTick, setRotasTick] = useState(0)
  const [feedTick, setFeedTick] = useState(0)
  const [mapMembroEmail, setMapMembroEmail] = useState('')
  const [dataFiltro, setDataFiltro] = useState(() => dataLocalHoje())
  const [statusFiltro, setStatusFiltro] = useState('todos')
  const [setorFiltro, setSetorFiltro] = useState('todos')
  const [dataRota, setDataRota] = useState(() => dataLocalHoje())
  const [dataRotaMinhas, setDataRotaMinhas] = useState(() => dataLocalHoje())
  const [emailRotaMinhas, setEmailRotaMinhas] = useState('')
  const [painelCentralTab, setPainelCentralTab] = useState('despacho')
  const [membroRotaEmail, setMembroRotaEmail] = useState('')
  const [novaIgrejaOpen, setNovaIgrejaOpen] = useState(false)
  const [igrejaSaveBusy, setIgrejaSaveBusy] = useState(false)
  const despachoRef = useRef(null)
  const [torreSomAtivo, setTorreSomAtivo] = useState(() => lerSomTorreAtivo())
  const [alertasTorre, setAlertasTorre] = useState([])
  const prevCheckInsRef = useRef(null)
  const torreDiffInicialRef = useRef(true)
  const hoje = dataLocalHoje()
  const emailAtivoMinhas = emailRotaMinhas || userEmail
  const showTorreMap = isAdmin && !mobile && aba === 'equipe'

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('view') !== 'minhas') return
      const membroId = params.get('membroId')
      if (!membroId) return
      const dataParam = String(params.get('data') || '').trim() || hoje
      const membros = loadEquipeMembros()
      const m = membros.find(x =>
        String(x.id) === String(membroId) || normEmail(x.email) === normEmail(membroId),
      )
      if (!m?.email) return
      setEmailRotaMinhas(normEmail(m.email))
      setDataRotaMinhas(dataParam)
      setAba('minhas')
      const url = new URL(window.location.href)
      url.searchParams.delete('view')
      url.searchParams.delete('membroId')
      url.searchParams.delete('data')
      const qs = url.searchParams.toString()
      window.history.replaceState({}, '', url.pathname + (qs ? `?${qs}` : '') + url.hash)
    } catch { /* ignore */ }
  }, [hoje])

  const membrosEquipe = useMemo(() => loadEquipeMembros(), [rotasTick])

  useEffect(() => {
    if (aba === 'central' || painelCentralTab === 'feed') {
      setDataFiltro(dataRota)
    }
  }, [aba, dataRota, painelCentralTab])

  useEffect(() => {
    const bump = () => setRotasTick(t => t + 1)
    window.addEventListener(ROTAS_DIARIAS_EVENT, bump)
    window.addEventListener(SYNC_EVENT, bump)
    window.addEventListener(SYNC_STORAGE_EVENT, bump)
    return () => {
      window.removeEventListener(ROTAS_DIARIAS_EVENT, bump)
      window.removeEventListener(SYNC_EVENT, bump)
      window.removeEventListener(SYNC_STORAGE_EVENT, bump)
    }
  }, [])

  const rotasRaw = useMemo(() => readRotasDiariasRaw(), [rotasTick])
  const minhaRota = useMemo(
    () => rotaDiariaDoMembro({ data: dataRotaMinhas, membroEmail: emailAtivoMinhas, rotas: rotasRaw }),
    [dataRotaMinhas, emailAtivoMinhas, rotasRaw],
  )

  const igById = useMemo(() => new Map(churches.map(ig => [String(ig.id), ig])), [churches])

  const paradasOrdenadas = useMemo(() => {
    if (!minhaRota?.igrejas?.length) return []
    return [...minhaRota.igrejas]
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
      .map(p => ({ parada: p, igreja: igById.get(String(p.igrejaId)) }))
      .filter(x => x.igreja)
  }, [minhaRota, igById])

  const proximaPendente = paradasOrdenadas.find(
    x => x.parada.status !== STATUS_PARADA.CONCLUIDO,
  )

  const minhaIgrejaId = useMemo(() => igrejaIdDoMembroLogado(userEmail), [userEmail])

  const listaExtra = useMemo(() => {
    const q = norm(busca)
    const idsRota = new Set(paradasOrdenadas.map(x => String(x.parada.igrejaId)))
    let arr = churches.filter(ig => !idsRota.has(String(ig.id)))
    if (q) {
      arr = arr.filter(ig =>
        norm(ig.nome).includes(q) || norm(ig.setor).includes(q) || norm(ig.endereco).includes(q),
      )
    }
    arr.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
    return arr.slice(0, 80)
  }, [churches, busca, paradasOrdenadas])

  const minhasHoje = useMemo(
    () => listarCheckInsDoDia({
      dataRef: dataRotaMinhas,
      catalog: churches,
      somenteEmail: emailAtivoMinhas,
    }),
    [churches, dataRotaMinhas, emailAtivoMinhas, rotasTick, feedTick],
  )

  const equipeCheckInsDia = useMemo(
    () => listarCheckInsDoDia({ dataRef: dataFiltro, catalog: churches }),
    [churches, dataFiltro, rotasTick, feedTick],
  )

  const checkInsHoje = useMemo(
    () => listarCheckInsDoDia({ dataRef: hoje, catalog: churches }),
    [churches, hoje, rotasTick, feedTick],
  )

  const checkInsByIgreja = useMemo(() => {
    const m = {}
    for (const item of equipeCheckInsDia) m[String(item.igrejaId)] = item
    return m
  }, [equipeCheckInsDia])

  const checkInsByIgrejaHoje = useMemo(() => {
    const m = {}
    for (const item of checkInsHoje) m[String(item.igrejaId)] = item
    return m
  }, [checkInsHoje])

  const equipeFeed = useMemo(
    () => filtrarCheckInsTorre(equipeCheckInsDia, { statusFiltro, setorFiltro, igById }),
    [equipeCheckInsDia, statusFiltro, setorFiltro, igById],
  )

  const setoresOpcoes = useMemo(() => setoresUnicosCatalogo(churches), [churches])

  const filtrosAtivos = torreFiltrosAtivos({ dataFiltro, hoje, statusFiltro, setorFiltro })

  const progressoHoje = useMemo(
    () => progressoRotasEquipe({
      data: hoje,
      rotas: rotasRaw,
      membros: loadEquipeMembros(),
    }),
    [hoje, rotasRaw, rotasTick],
  )

  const progresso = useMemo(() => {
    const base = progressoRotasEquipe({
      data: dataFiltro,
      rotas: rotasRaw,
      membros: loadEquipeMembros(),
    })
    return filtrarProgressoTorre(base, { statusFiltro, setorFiltro, igById, checkInsByIgreja })
  }, [dataFiltro, rotasRaw, rotasTick, statusFiltro, setorFiltro, igById, checkInsByIgreja])

  const metricas = useMemo(
    () => metricasDesempenhoEquipe({ progresso, checkIns: equipeFeed, raioMetros: RAIO_CHECKIN_CAMPO_M }),
    [progresso, equipeFeed],
  )

  const metricasSafe = useMemo(() => {
    const m = metricas
    return {
      resumo: m?.resumo || { total: 0, concluidas: 0, pct: 0 },
      agentes: Array.isArray(m?.agentes) ? m.agentes : [],
      membrosEmTransito: m?.membrosEmTransito ?? 0,
      membrosParados: m?.membrosParados ?? 0,
      totalEmTransito: m?.totalEmTransito ?? 0,
      conformidadePct: m?.conformidadePct ?? null,
      checkInsComDistancia: m?.checkInsComDistancia ?? 0,
      checkInsDentroRaio: m?.checkInsDentroRaio ?? 0,
    }
  }, [metricas])

  const paradasMinhaRota = minhaRota?.igrejas || []

  const foraRaioCountPorEmail = useMemo(() => {
    const m = new Map()
    for (const item of equipeCheckInsDia) {
      if (!checkInAlertaForaRaio(item)) continue
      const em = String(item.email || '').trim().toLowerCase()
      if (!em) continue
      m.set(em, (m.get(em) || 0) + 1)
    }
    return m
  }, [equipeCheckInsDia])

  const dismissAlertaTorre = useCallback((id) => {
    setAlertasTorre(prev => prev.filter(x => x.id !== id))
  }, [])

  const emitirAlertaTorreCheckIn = useCallback((item) => {
    const distNum = Number(item.distanciaMetros)
    const dist = Number.isFinite(distNum) ? `${Math.round(distNum)}m` : '—'
    const id = `${chaveCheckInTorre(item)}-${Date.now()}`
    setAlertasTorre(prev => [
      ...prev,
      {
        id,
        agente: item.visitadoPor || item.email || 'Agente',
        igreja: item.igrejaNome || 'Igreja',
        dist,
        justificativa: String(item.justificativaDistancia || '').trim() || '(sem texto)',
      },
    ])
    window.setTimeout(() => dismissAlertaTorre(id), 8000)
    tocarAlertaForaRaio()
  }, [dismissAlertaTorre])

  useEffect(() => {
    if (aba !== 'equipe' && aba !== 'central') {
      prevCheckInsRef.current = null
      torreDiffInicialRef.current = true
      return
    }
    if (aba === 'equipe' && dataFiltro !== hoje) {
      prevCheckInsRef.current = null
      torreDiffInicialRef.current = true
      return
    }
    if (aba === 'central' && dataRota !== hoje) {
      prevCheckInsRef.current = null
      torreDiffInicialRef.current = true
      return
    }
    const list = checkInsHoje
    const prev = prevCheckInsRef.current
    if (prev && !torreDiffInicialRef.current) {
      const prevKeys = new Set(prev.map(chaveCheckInTorre))
      for (const item of list) {
        const key = chaveCheckInTorre(item)
        if (prevKeys.has(key)) continue
        if (checkInAlertaForaRaio(item)) {
          emitirAlertaTorreCheckIn(item)
        }
      }
    }
    prevCheckInsRef.current = list
    torreDiffInicialRef.current = false
  }, [checkInsHoje, aba, dataFiltro, dataRota, hoje, emitirAlertaTorreCheckIn])

  useEffect(() => {
    const torreAtiva = (aba === 'equipe' && dataFiltro === hoje) || (aba === 'central' && dataRota === hoje)
    if (!torreAtiva) return undefined
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      syncCampoTorreFromServer()
        .then(() => {
          setRotasTick(t => t + 1)
          setFeedTick(t => t + 1)
        })
        .catch(() => {})
    }
    tick()
    const id = setInterval(tick, CAMPO_TORRE_POLL_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible' && (aba === 'equipe' || aba === 'central')) tick()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [aba, dataFiltro, dataRota, hoje])

  function toggleSomTorre() {
    prepararAudioTorre()
    setTorreSomAtivo(prev => {
      const next = !prev
      salvarSomTorreAtivo(next)
      return next
    })
  }

  const rotaMapaMembro = useMemo(() => {
    if (!mapMembroEmail) return null
    return rotaDiariaDoMembro({ data: dataFiltro, membroEmail: mapMembroEmail, rotas: rotasRaw })
  }, [mapMembroEmail, dataFiltro, rotasRaw])

  const rotaMapaDespacho = useMemo(() => {
    if (!mapMembroEmail) return null
    return rotaDiariaDoMembro({ data: hoje, membroEmail: mapMembroEmail, rotas: rotasRaw })
  }, [mapMembroEmail, hoje, rotasRaw])

  const rotaMapaCentral = useMemo(() => {
    if (!membroRotaEmail) return null
    return rotaDiariaDoMembro({ data: dataRota, membroEmail: membroRotaEmail, rotas: rotasRaw })
  }, [membroRotaEmail, dataRota, rotasRaw])

  const checkInsByIgrejaDataRota = useMemo(() => {
    const m = {}
    for (const item of listarCheckInsDoDia({ dataRef: dataRota, catalog: churches })) {
      m[String(item.igrejaId)] = item
    }
    return m
  }, [dataRota, churches, rotasTick, feedTick])

  async function salvarNovaIgreja(form) {
    setIgrejaSaveBusy(true)
    try {
      await addChurch(form)
      setNovaIgrejaOpen(false)
      setToast('Igreja cadastrada e sincronizada.')
      setTimeout(() => setToast(''), 3500)
    } catch (e) {
      setToast(e?.message || 'Não foi possível salvar a igreja.')
    } finally {
      setIgrejaSaveBusy(false)
    }
  }

  async function inativarIgrejaCampo(ig) {
    if (!ig) return
    await removeChurch(ig)
    setRotasTick(t => t + 1)
    setToast('Igreja inativada.')
    setTimeout(() => setToast(''), 3500)
  }

  function handleAddIgrejaRota(igrejaId, email) {
    const em = normEmail(email)
    if (!em || igrejaId == null) return
    const m = membrosEquipe.find(x => normEmail(x.email) === em)
    adicionarParadaRotaDiaria({
      data: dataRota,
      membroEmail: em,
      membroNome: m?.nome || '',
      igrejaId,
    })
    setMembroRotaEmail(em)
    setPainelCentralTab('despacho')
    setRotasTick(t => t + 1)
    setToast('Igreja adicionada à rota.')
    setTimeout(() => setToast(''), 3000)
  }

  function limparFiltrosTorre() {
    setDataFiltro(dataLocalHoje())
    setStatusFiltro('todos')
    setSetorFiltro('todos')
  }

  const autoMapInit = useRef(false)
  useEffect(() => {
    if (autoMapInit.current || !(progressoHoje?.length)) return
    autoMapInit.current = true
    setMapMembroEmail(progressoHoje[0].email)
  }, [progressoHoje])

  function aoNavegar(igreja) {
    marcarParadaEmTransitoRota({ data: dataRotaMinhas, membroEmail: emailAtivoMinhas, igrejaId: igreja.id })
    setRotasTick(t => t + 1)
  }

  function aoACaminho(igreja) {
    marcarParadaEmTransitoRota({ data: dataRotaMinhas, membroEmail: emailAtivoMinhas, igrejaId: igreja.id })
    setRotasTick(t => t + 1)
    setToast('Status: a caminho — torre atualizada.')
    setTimeout(() => setToast(''), 2500)
  }

  function executarCheckIn({
    obs, gps, foto, distanciaMetros, justificativaDistancia, semFoto, motivoSemFoto,
  }) {
    if (!checkInIgreja) return
    const ig = checkInIgreja
    const entityId = `campo-${ig.id}-${Date.now()}`
    const meta = {
      obs: String(obs || '').trim(),
      foto: semFoto ? '' : foto,
      semFoto: !!semFoto,
      motivoSemFoto: semFoto ? String(motivoSemFoto || '').trim() : '',
      fotoUrl: semFoto ? null : undefined,
      checkInLat: gps.lat,
      checkInLng: gps.lng,
      origem: 'campo',
      data: dataRotaMinhas,
      distanciaMetros,
      justificativaDistancia,
    }

    markVisited(ig.id, meta).then((reg) => {
      if (!semFoto && isUsableFoto(foto)) {
        const entradaId = reg?.historico?.[0]?.id
        finalizarFotoCheckInCampoBackground({
          igrejaId: ig.id,
          entradaId,
          entityId,
          fotoDataUrl: foto,
          onPatched: () => setFeedTick(t => t + 1),
        })
      }
    }).catch(() => {
      setToast('Não foi possível salvar localmente.')
    })

    marcarParadaConcluidaRota({ data: dataRotaMinhas, membroEmail: emailAtivoMinhas, igrejaId: ig.id })
    setCheckInIgreja(null)
    setToast('Visita registrada.')
    setRotasTick(t => t + 1)
    setFeedTick(t => t + 1)
    setTimeout(() => setToast(''), 3500)
  }

  const tabs = [
    { id: 'minhas', label: mobile ? 'Minhas' : 'Minhas hoje', Icon: CheckCircle2 },
    ...(showEnterprise
      ? [{ id: 'central', label: 'Central despacho', Icon: LayoutDashboard }]
      : [{ id: 'equipe', label: 'Equipe hoje', Icon: Users }]),
    ...(isAdmin && !showEnterprise ? [{ id: 'despacho', label: 'Despacho', Icon: MapPin }] : []),
    { id: 'extra', label: 'Buscar', Icon: Church },
  ]

  const feedCentralContent = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl p-2.5 border border-emerald-500/25 bg-emerald-500/10">
          <p className="text-[9px] font-bold uppercase text-white/45">Progresso</p>
          <p className="text-lg font-black text-emerald-300">{metricasSafe.resumo.pct}%</p>
        </div>
        <div className="rounded-xl p-2.5 border border-white/10 bg-white/[0.03]">
          <p className="text-[9px] font-bold uppercase text-white/45">Check-ins</p>
          <p className="text-lg font-black">{equipeFeed.length}</p>
        </div>
      </div>
      <div
        className="rounded-xl p-2 space-y-2 border border-white/10 bg-white/[0.02]"
        onClick={() => prepararAudioTorre()}
        role="presentation"
      >
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-bold text-white/45 uppercase">Data feed</span>
          <button type="button" onClick={e => { e.stopPropagation(); toggleSomTorre() }} className="p-1 rounded hover:bg-white/10">
            {torreSomAtivo ? <Volume2 size={14} className="text-emerald-400" /> : <VolumeX size={14} className="text-white/40" />}
          </button>
        </div>
        <input
          type="date"
          value={dataFiltro}
          onChange={e => {
            const v = e.target.value || hoje
            setDataFiltro(v)
            setDataRota(v)
          }}
          className="w-full rounded-lg px-2 py-1.5 text-xs bg-black/25 border border-white/10"
        />
      </div>
      <ul className="space-y-2 max-h-[50vh] overflow-y-auto">
        {equipeFeed.map(item => {
          const alertaRaio = checkInAlertaForaRaio(item)
          return (
            <li
              key={`${item.igrejaId}-${item.id}`}
              className={
                alertaRaio
                  ? 'rounded-lg px-2.5 py-2 border border-amber-500/35 border-l-4 border-l-amber-500 bg-amber-500/10 text-xs'
                  : 'rounded-lg px-2.5 py-2 border border-white/10 bg-white/[0.03] text-xs'
              }
            >
              <p className="font-bold truncate">{item.igrejaNome}</p>
              <p className="text-[10px] text-white/45 truncate">{item.hora} · {item.visitadoPor}</p>
            </li>
          )
        })}
        {!equipeFeed.length && (
          <li className="text-center text-white/40 py-6 text-xs">Nenhum check-in nesta data.</li>
        )}
      </ul>
    </div>
  )

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <div className="flex-shrink-0 px-4 py-3 border-b border-[var(--border-subtle)]" style={{ background: 'var(--bg-surface)' }}>
        <div className="flex items-center gap-2 mb-1">
          <MapPin size={18} className="text-emerald-400 flex-shrink-0" />
          <h1 className="text-display font-black text-lg">Visitas de Campo</h1>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          {showEnterprise
            ? 'Central enterprise · mapa + despacho · rotas por data'
            : 'Rotas do dia · check-in GPS + foto · navegação via Google Maps'}
        </p>
        {aba === 'equipe' && dataFiltro !== hoje && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-200/95 px-2.5 py-1 rounded-lg"
            style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)' }}>
            <AlertTriangle size={14} className="flex-shrink-0" />
            Exibindo histórico de {formatarDataBadgeBR(dataFiltro)}
          </p>
        )}

        <div className="flex gap-1 mt-3 p-1 rounded-xl overflow-x-auto" style={{ background: 'rgba(255,255,255,0.05)' }}>
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setAba(id)}
              className="flex-shrink-0 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-colors"
              style={{
                background: aba === id ? 'rgba(16,185,129,0.25)' : 'transparent',
                color: aba === id ? '#6ee7b7' : 'var(--text-muted)',
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {toast && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-xl text-xs font-semibold text-emerald-100"
          style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(52,211,153,0.35)' }}>
          {toast}
        </div>
      )}

      {loading && churches.length === 0 && (
        <div className="flex-shrink-0 mx-4 mt-2 px-3 py-2 rounded-lg text-xs text-[var(--text-muted)] flex items-center gap-2 bg-white/5">
          <Loader2 className="animate-spin" size={14} />
          Atualizando cadastro em segundo plano…
        </div>
      )}

      {loadError && <div className="p-4 text-amber-300 text-sm">{loadError}</div>}

      {aba === 'central' && showEnterprise && (
        <CampoEnterpriseCentral
          churches={churches}
          membros={membrosEquipe}
          dataRota={dataRota}
          onDataRotaChange={setDataRota}
          membroRotaEmail={membroRotaEmail}
          onMembroRotaEmailChange={setMembroRotaEmail}
          rotaMapa={rotaMapaCentral}
          checkInsByIgreja={checkInsByIgrejaDataRota}
          statusFiltro={statusFiltro}
          setorFiltro={setorFiltro}
          setStatusFiltro={setStatusFiltro}
          setSetorFiltro={setSetorFiltro}
          setoresOpcoes={setoresOpcoes}
          onAddIgrejaRota={handleAddIgrejaRota}
          onInativarIgreja={inativarIgrejaCampo}
          onNovaIgreja={() => setNovaIgrejaOpen(true)}
          despachoRef={despachoRef}
          painelTab={painelCentralTab}
          onPainelTabChange={setPainelCentralTab}
          feedContent={feedCentralContent}
        />
      )}

      {aba === 'despacho' && isAdmin && !showEnterprise && (
        <>
          {showTorreMap && (
            <div className="px-4 pt-3 space-y-2">
              <select
                value={mapMembroEmail}
                onChange={e => setMapMembroEmail(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-subtle)' }}
              >
                <option value="">Membro no mapa…</option>
                {progressoHoje.map(p => (
                  <option key={p.email} value={p.email}>{p.nome}</option>
                ))}
                {rotasDiariasNaData(hoje, rotasRaw).filter(r =>
                  !progressoHoje.some(p => p.email === r.membroEmail?.toLowerCase?.() || p.email === String(r.membroEmail || '').toLowerCase()),
                ).map(r => (
                  <option key={r.id} value={r.membroEmail}>{r.membroNome || r.membroEmail}</option>
                ))}
              </select>
              <CampoTorreMap
                membroEmail={mapMembroEmail}
                rota={rotaMapaDespacho}
                churches={churches}
                checkInsByIgreja={checkInsByIgrejaHoje}
                height={300}
              />
            </div>
          )}
          <CampoDespachoPanel churches={churches} dataRota={hoje} onDataRotaChange={() => {}} />
        </>
      )}

      {aba === 'minhas' && (
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
          {minhaRota ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">
                  {dataRotaMinhas === hoje ? 'Sua rota de hoje' : `Rota · ${formatarDataBadgeBR(dataRotaMinhas)}`}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {paradasMinhaRota.filter(p => p.status === STATUS_PARADA.CONCLUIDO).length}/{paradasMinhaRota.length} concluídas
                </p>
              </div>
              <ul className="space-y-2">
                {paradasOrdenadas.map(({ parada, igreja }) => (
                  <ParadaRotaCard
                    key={parada.igrejaId}
                    igreja={igreja}
                    parada={parada}
                    destaque={proximaPendente?.parada.igrejaId === parada.igrejaId}
                    onNavigate={aoNavegar}
                    onACaminho={aoACaminho}
                    onCheckIn={setCheckInIgreja}
                  />
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-[var(--text-muted)] py-4">
              Nenhuma rota atribuída para hoje. O coordenador pode montar em <strong>Despacho</strong>, ou use <strong>Buscar</strong> para visita avulsa.
            </p>
          )}

          {minhasHoje.length > 0 && (
            <div>
              <p className="text-xs font-bold text-[var(--text-muted)] uppercase mb-2">Check-ins de hoje</p>
              <ul className="space-y-2">
                {minhasHoje.map(item => (
                  <li key={`${item.igrejaId}-${item.id}`} className="rounded-xl px-3 py-2 text-xs border border-white/10">
                    <span className="font-semibold">{item.igrejaNome}</span>
                    <span className="text-[var(--text-muted)]"> · {item.hora}</span>
                    {item.distanciaMetros != null && (
                      <p className={foraDoRaioCheckin(item.distanciaMetros) ? 'text-amber-300 mt-0.5' : 'text-emerald-400/80 mt-0.5'}>
                        {labelDistanciaCheckin(item.distanciaMetros)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {(aba === 'equipe' || aba === 'central') && alertasTorre.length > 0 && (
        <div className="fixed top-3 right-3 z-[70] flex flex-col gap-2 max-w-[min(100vw-1.5rem,22rem)] pointer-events-none">
          {alertasTorre.map(a => (
            <div
              key={a.id}
              className="pointer-events-auto rounded-xl border border-amber-500/55 shadow-lg p-3 text-xs"
              style={{ background: 'rgba(28,22,12,0.96)' }}
            >
              <div className="flex gap-2">
                <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-amber-100 leading-snug">
                    ⚠️ Novo check-in fora do raio: {a.agente} na {a.igreja} ({a.dist})
                  </p>
                  <p className="text-white/70 mt-1.5">
                    Justificativa: &quot;{a.justificativa}&quot;
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => dismissAlertaTorre(a.id)}
                  className="flex-shrink-0 p-1 rounded-lg hover:bg-white/10 text-white/50"
                  aria-label="Fechar alerta"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {aba === 'equipe' && (
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-300/80">Dashboard — equipe hoje</p>

          <div
            className="rounded-xl p-3 space-y-2 border border-white/10"
            style={{ background: 'rgba(255,255,255,0.03)' }}
            onClick={() => prepararAudioTorre()}
            onKeyDown={() => {}}
            role="presentation"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase text-white/45 tracking-wide">Filtros da torre</p>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation()
                  toggleSomTorre()
                }}
                className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-white/55 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10"
                title={torreSomAtivo ? 'Silenciar alertas sonoros' : 'Ativar alertas sonoros'}
              >
                {torreSomAtivo ? <Volume2 size={14} className="text-emerald-400" /> : <VolumeX size={14} className="text-white/40" />}
                {torreSomAtivo ? 'Som alertas' : 'Som mudo'}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block min-w-0">
                <span className="text-[10px] text-[var(--text-muted)] block mb-1">Data</span>
                <input
                  type="date"
                  value={dataFiltro}
                  onChange={e => setDataFiltro(e.target.value || hoje)}
                  className="w-full rounded-lg px-2 py-1.5 text-sm"
                  style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-subtle)' }}
                />
              </label>
              <label className="block min-w-0">
                <span className="text-[10px] text-[var(--text-muted)] block mb-1">Status</span>
                <select
                  value={statusFiltro}
                  onChange={e => setStatusFiltro(e.target.value)}
                  className="w-full rounded-lg px-2 py-1.5 text-sm"
                  style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-subtle)' }}
                >
                  <option value="todos">Todos</option>
                  <option value="pendente">Pendente</option>
                  <option value="em_transito">Em trânsito</option>
                  <option value="concluido">Concluído</option>
                  <option value="fora_raio">Fora do raio (200m)</option>
                </select>
              </label>
              <label className="block min-w-0 sm:col-span-2 lg:col-span-1">
                <span className="text-[10px] text-[var(--text-muted)] block mb-1">Setor</span>
                <select
                  value={setorFiltro}
                  onChange={e => setSetorFiltro(e.target.value)}
                  className="w-full rounded-lg px-2 py-1.5 text-sm"
                  style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-subtle)' }}
                >
                  <option value="todos">Todos os setores</option>
                  {setoresOpcoes.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-end sm:col-span-2 lg:col-span-1">
                {filtrosAtivos && (
                  <button
                    type="button"
                    onClick={limparFiltrosTorre}
                    className="text-xs font-semibold text-indigo-200/90 hover:text-white px-2 py-1.5 rounded-lg hover:bg-white/10"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl p-3 border border-emerald-500/30" style={{ background: 'rgba(16,185,129,0.1)' }}>
              <p className="text-[10px] font-bold uppercase text-white/50">Progresso geral</p>
              <p className="text-xl font-black text-emerald-300 mt-1">
                {metricasSafe.resumo.pct}%
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {metricasSafe.resumo.concluidas}/{metricasSafe.resumo.total} paradas
              </p>
              {metricasSafe.resumo.total > 0 && (
                <div className="mt-2 h-1.5 rounded-full bg-black/30 overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${metricasSafe.resumo.pct}%` }} />
                </div>
              )}
            </div>
            <div className="rounded-xl p-3 border border-amber-500/30" style={{ background: 'rgba(245,158,11,0.08)' }}>
              <p className="text-[10px] font-bold uppercase text-white/50">Ritmo da equipe</p>
              <p className="text-xl font-black text-amber-200 mt-1">
                {metricasSafe.membrosEmTransito} em trânsito
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {metricasSafe.membrosParados} parado(s) · {metricasSafe.totalEmTransito} parada(s) ativas
              </p>
            </div>
            <div className="rounded-xl p-3 border border-sky-500/30" style={{ background: 'rgba(14,165,233,0.08)' }}>
              <p className="text-[10px] font-bold uppercase text-white/50">Conformidade raio</p>
              <p className="text-xl font-black text-sky-200 mt-1">
                {metricasSafe.conformidadePct != null ? `${metricasSafe.conformidadePct}%` : '—'}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {metricasSafe.checkInsDentroRaio}/{metricasSafe.checkInsComDistancia} dentro de {RAIO_CHECKIN_CAMPO_M}m
              </p>
            </div>
            <div className="rounded-xl p-3 border border-white/10 bg-white/[0.03]">
              <p className="text-[10px] font-bold uppercase text-white/50">Check-ins (filtro)</p>
              <p className="text-xl font-black mt-1">{equipeFeed.length}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {equipeCheckInsDia.length} no dia · feed abaixo
              </p>
            </div>
          </div>

          {(metricasSafe.agentes.length > 0) && (
            <div className="rounded-xl overflow-hidden border border-white/10">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[var(--text-muted)] border-b border-white/10 bg-white/[0.03]">
                      <th className="px-3 py-2 font-bold">Agente</th>
                      <th className="px-3 py-2 font-bold">Concluídas</th>
                      <th className="px-3 py-2 font-bold">Último check-in</th>
                      <th className="px-3 py-2 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metricasSafe.agentes.map(a => {
                      const em = String(a.email || '').trim().toLowerCase()
                      const nFora = foraRaioCountPorEmail.get(em) || 0
                      return (
                      <tr key={a.email} className="border-b border-white/5 hover:bg-white/[0.03]">
                        <td className="px-3 py-2 font-semibold truncate max-w-[120px]">{a.nome}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1.5 flex-wrap">
                            <span>{a.concluidas}/{a.total}</span>
                            {nFora > 0 && (
                              <span
                                className="inline-flex items-center gap-0.5 text-amber-400 font-bold"
                                title={`${nFora} check-in(s) fora do raio neste dia`}
                              >
                                <AlertTriangle size={14} />
                                {nFora}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[var(--text-muted)] truncate max-w-[140px]">{a.ultimoCheckIn}</td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded-full bg-white/10 font-bold text-[10px]">{a.status}</span>
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showTorreMap && (
            <div className="space-y-2">
              <select
                value={mapMembroEmail}
                onChange={e => setMapMembroEmail(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-subtle)' }}
              >
                <option value="">Mapa global (sem trajeto OSRM)…</option>
                {(progresso || []).map(p => (
                  <option key={p.email} value={p.email}>{p.nome} ({p.concluidas}/{p.total})</option>
                ))}
              </select>
              <CampoTorreMap
                membroEmail={mapMembroEmail}
                rota={rotaMapaMembro}
                churches={churches}
                checkInsByIgreja={checkInsByIgreja}
                height={340}
                statusFiltro={statusFiltro}
                setorFiltro={setorFiltro}
              />
              <p className="text-[10px] text-[var(--text-muted)]">
                Cinza = fora da rota · Azul = pendente · Amarelo = trânsito · Verde = concluída · Trajeto = OSRM.
              </p>
              <p className="text-[10px] text-[var(--text-muted)]">Atualização automática a cada 25s (aba visível).</p>
            </div>
          )}

          <p className="text-xs font-bold text-[var(--text-muted)] uppercase">Feed do dia</p>
          <ul className="space-y-2">
            {equipeFeed.map(item => {
              const alertaRaio = checkInAlertaForaRaio(item)
              const distNum = Number(item.distanciaMetros)
              const distLabel = Number.isFinite(distNum) ? `${Math.round(distNum)}m` : '—'
              return (
              <li
                key={`${item.igrejaId}-${item.id}`}
                className={
                  alertaRaio
                    ? 'rounded-xl px-3 py-3 border border-amber-500/35 border-l-4 border-l-amber-500 bg-amber-500/10'
                    : 'rounded-xl px-3 py-3 border border-[var(--border-subtle)] bg-white/[0.03]'
                }
              >
                <div className="flex gap-3">
                  {item.foto && isUsableFoto(item.foto) ? (
                    <img src={item.foto} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                      <Camera size={18} className="text-white/30" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm truncate">{item.igrejaNome}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">
                      {[item.hora, item.visitadoPor].filter(Boolean).join(' · ')}
                    </p>
                    {alertaRaio && (
                      <span className="inline-flex mt-1.5 text-[10px] font-black uppercase tracking-wide text-amber-950 bg-amber-400 px-2 py-0.5 rounded-md">
                        ⚠️ Fora do raio ({distLabel})
                      </span>
                    )}
                    {item.distanciaMetros != null && !alertaRaio && (
                      <p className="text-xs mt-1 text-emerald-400/80">
                        {labelDistanciaCheckin(item.distanciaMetros)}
                      </p>
                    )}
                    {alertaRaio && item.justificativaDistancia && (
                      <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-2">
                        <p className="text-[10px] font-bold uppercase text-amber-200/90 mb-0.5">Justificativa do agente</p>
                        <p className="text-xs text-amber-50/95 whitespace-pre-wrap">{item.justificativaDistancia}</p>
                      </div>
                    )}
                    {alertaRaio && !item.justificativaDistancia && item.distanciaMetros != null && (
                      <p className="text-xs mt-1 text-amber-300">{labelDistanciaCheckin(item.distanciaMetros)}</p>
                    )}
                  </div>
                </div>
              </li>
              )
            })}
            {!equipeFeed.length && (
              <li className="text-center text-sm text-[var(--text-muted)] py-8">
                {filtrosAtivos ? 'Nenhum check-in com estes filtros.' : 'Nenhum check-in nesta data.'}
              </li>
            )}
          </ul>
        </div>
      )}

      {aba === 'extra' && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="px-4 py-2">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Visita avulsa — buscar igreja…"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)' }}
              />
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
            {listaExtra.map(ig => {
              const isMine = minhaIgrejaId != null && String(ig.id) === String(minhaIgrejaId)
              return (
                <li key={ig.id}>
                  <div className="rounded-xl px-3 py-3 border border-[var(--border-subtle)] space-y-2">
                    <p className="font-semibold text-sm truncate">
                      {ig.nome}
                      {isMine && <span className="ml-2 text-[10px] text-amber-300">MINHA IGREJA</span>}
                    </p>
                    <div className="flex gap-2">
                      <a
                        href={googleMapsDirUrl(ig)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-center py-2 rounded-lg text-xs font-bold bg-white/10"
                      >
                        Navegar
                      </a>
                      <button
                        type="button"
                        onClick={() => setCheckInIgreja(ig)}
                        className="flex-1 py-2 rounded-lg text-xs font-black text-white bg-emerald-600"
                      >
                        Check-in
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {checkInIgreja && (
        <CheckInModal
          igreja={checkInIgreja}
          busy={false}
          onClose={() => setCheckInIgreja(null)}
          onConfirm={executarCheckIn}
        />
      )}

      <CampoNovaIgrejaModal
        open={novaIgrejaOpen}
        onClose={() => setNovaIgrejaOpen(false)}
        onSave={salvarNovaIgreja}
        busy={igrejaSaveBusy}
      />
    </div>
  )
}
