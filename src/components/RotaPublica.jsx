/* RotaPublica.jsx — Execução de rota no celular com mapa ao vivo */
import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  Route, MapPin, ExternalLink, CheckCircle2,
  Clock, Package, ChevronRight, Loader2, Flag, Camera, AlertTriangle, X,
  ChevronDown, ChevronUp, RefreshCw, ImagePlus,
} from 'lucide-react'
import CampaignOsmMap from './google/CampaignOsmMap'
import { useGeofence, DWELL_TIME_MS } from '../hooks/useGeofence'
import {
  decodeRotaToken, loadExecucao, saveExecucao, criarExecucaoVazia,
  MOTIVOS_NAO_VISITA, detalheParada, resumoExecucao,
  fetchSharePublica, mergeExecucao, shareIdOk, execucaoEstaEncerrada,
  salvarPosicaoAoVivo, GPS_ENVIO_INTERVALO_MS, GPS_ENVIO_MOVIMENTO_MS, GPS_MOVIMENTO_METROS,
  aplicarChegadaAutomaticaGps, postRotaFoto, postPosicaoAoVivo,
} from '../utils/rotaShare'
import { appendTrilhaPonto } from '../utils/rotaLiveStream'
import { installGpsQueueAutoFlush } from '../utils/rotaGpsQueue'
import {
  linkGoogleMapsDaLocalizacao, labelTipoParada, corTipoParada,
  STATUS_PARADA, formatEnderecoParada, coordValida,
} from '../utils/rotaUtils'
import { compressImageFile } from '../utils/leadFormConfig'
import { buscarRotaOsrm } from '../utils/osrmRoute'

function MapaRota({ gpsCoords, paradas, detalhesFn, proximaIdx, pontosRota }) {
  const [rotaMapa, setRotaMapa] = useState(null)
  const pontosKey = pontosRota.map(p => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join('|')

  useEffect(() => {
    if (pontosRota.length < 2) {
      setRotaMapa(null)
      return undefined
    }
    let cancel = false
    buscarRotaOsrm(pontosRota).then((r) => {
      if (cancel) return
      if (r?.linha?.length >= 2) setRotaMapa(r)
      else setRotaMapa({ linha: pontosRota, distancia: null, duracao: null })
    })
    return () => { cancel = true }
  }, [pontosKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const center = gpsCoords
    || (() => {
      const p = paradas.find(item => coordValida(item.lat, item.lng))
      return p ? { lat: Number(p.lat), lng: Number(p.lng) } : { lat: -26.9194, lng: -49.0661 }
    })()

  const pontosFit = []
  if (gpsCoords) pontosFit.push([gpsCoords.lat, gpsCoords.lng])
  paradas.forEach(p => {
    if (coordValida(p.lat, p.lng)) {
      pontosFit.push([Number(p.lat), Number(p.lng)])
    }
  })
  const fitBounds = pontosFit.length >= 2
    ? [
      [Math.min(...pontosFit.map(p => p[0])), Math.min(...pontosFit.map(p => p[1]))],
      [Math.max(...pontosFit.map(p => p[0])), Math.max(...pontosFit.map(p => p[1]))],
    ]
    : null

  const linhaRota = rotaMapa?.linha?.length >= 2 ? rotaMapa.linha : null

  return (
    <CampaignOsmMap center={center} zoom={13} fitBounds={fitBounds} note="">
      {gpsCoords && (
        <span position={{ lat: gpsCoords.lat, lng: gpsCoords.lng }} cor="#22c55e" />
      )}
      {paradas.map((p, idx) => {
        if (!coordValida(p.lat, p.lng)) return null
        const det = detalhesFn(p.key)
        const done = det.status === 'concluido' || det.status === 'nao_visitou' || det.status === 'reagendar'
        const isProxima = idx === proximaIdx
        return (
          <span
            key={p.key}
            position={{ lat: Number(p.lat), lng: Number(p.lng) }}
            cor={done ? '#10b981' : isProxima ? '#f59e0b' : '#6366f1'}
          />
        )
      })}
      {linhaRota && (
        <span path={linhaRota} options={{ strokeColor: '#3b82f6', strokeWeight: 5, strokeOpacity: 0.9 }} />
      )}
    </CampaignOsmMap>
  )
}

export default function RotaPublica({ token }) {
  const decoded = useMemo(() => decodeRotaToken(token), [token])
  const [share, setShare] = useState(() => (decoded && !decoded._idOnly ? decoded : null))
  const [execucao, setExecucao] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [paradaAtiva, setParadaAtiva] = useState(0)
  const [modal, setModal] = useState(null)
  const [fotoPreview, setFotoPreview] = useState('')
  const [motivoId, setMotivoId] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [gpsStatus, setGpsStatus] = useState('idle')
  const [mapaExpandido, setMapaExpandido] = useState(true)
  const execRef = useRef(null)
  execRef.current = execucao
  const trailLastRef = useRef('')
  const chegadaGeofenceRef = useRef(false)

  const shareId = decoded?.shareId || (shareIdOk(token) ? String(token).trim() : '')
  const data = share || decoded
  const paradas = useMemo(() => {
    const raw = data?.paradas || []
    return raw.map(p => ({
      ...p,
      endereco: formatEnderecoParada(p) || p.endereco || p.local || '',
    }))
  }, [data?.paradas])
  const encerrada = execucaoEstaEncerrada(execucao, data)

  useEffect(() => {
    if (!shareId || (share?.paradas || []).length) return undefined
    let cancel = false
    fetchSharePublica(shareId).then((s) => {
      if (!cancel && s && typeof s === 'object') setShare(s)
    })
    return () => { cancel = true }
  }, [shareId, share])

  useEffect(() => {
    if (!shareId) return undefined
    let cancel = false
    const poll = () => {
      fetchSharePublica(shareId).then((s) => {
        if (cancel || !s || typeof s !== 'object') return
        setShare(s)
        if (s.encerrada) setGpsStatus('encerrada')
      })
    }
    poll()
    const t = setInterval(poll, 12000)
    return () => { cancel = true; clearInterval(t) }
  }, [shareId])

  const carregar = useCallback(async () => {
    if (!shareId) return
    setSyncing(true)
    const remoto = await loadExecucao(shareId)
    const vazio = criarExecucaoVazia({
      shareId,
      rotaId: data?.rotaId,
      membroId: data?.membroId,
      membroNome: data?.membro,
    })
    const merged = mergeExecucao(remoto, execRef.current, vazio)
    if (merged) {
      execRef.current = merged
      setExecucao(merged)
    }
    setSyncing(false)
  }, [shareId, data?.rotaId, data?.membroId, data?.membro])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    if (!shareId) return undefined
    return installGpsQueueAutoFlush((sid, pos) => postPosicaoAoVivo(sid, pos))
  }, [shareId])
  useEffect(() => {
    if (!shareId) return
    const t = setInterval(carregar, 10000)
    return () => clearInterval(t)
  }, [shareId, carregar])

  const enviarGps = useCallback((coords) => {
    if (!shareId || !coords || encerrada || execRef.current?.rotaStatus === 'encerrada') return
    const prev = execRef.current || criarExecucaoVazia({
      shareId, rotaId: data?.rotaId, membroId: data?.membroId, membroNome: data?.membro,
    })
    const posicao = salvarPosicaoAoVivo(shareId, coords, prev)
    if (!posicao) return
    const next = { ...prev, posicao, atualizadoEm: posicao.atualizadoEm }
    execRef.current = next
    setExecucao(next)
    setGpsStatus('ok')
    const lat = Number(posicao.lat)
    const lng = Number(posicao.lng)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const trailKey = `${lat.toFixed(4)},${lng.toFixed(4)}`
      if (trailKey !== trailLastRef.current) {
        trailLastRef.current = trailKey
        void appendTrilhaPonto(shareId, {
          lat, lng, t: posicao.atualizadoEm || new Date().toISOString(),
        })
      }
    }
  }, [shareId, data?.rotaId, data?.membroId, data?.membro, encerrada])

  function metrosEntreCoords(a, b) {
    const R = 6371000
    const toRad = (x) => x * Math.PI / 180
    const dLat = toRad(b.latitude - a.latitude)
    const dLng = toRad(b.longitude - a.longitude)
    const lat1 = toRad(a.latitude), lat2 = toRad(b.latitude)
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
  }

  const pedirGps = useCallback(() => {
    if (!shareId || !navigator.geolocation) { setGpsStatus('sem-gps'); return }
    setGpsStatus((prev) => (prev === 'ok' ? prev : 'pedindo'))
    navigator.geolocation.getCurrentPosition(
      (pos) => enviarGps(pos.coords),
      (err) => { if (err?.code === 1) setGpsStatus('negado'); else setGpsStatus(p => p === 'ok' ? p : 'pedindo') },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    )
  }, [shareId, enviarGps])

  useEffect(() => {
    if (!shareId || !navigator.geolocation || encerrada) return undefined
    pedirGps()
    let wakeLock = null
    if (navigator.wakeLock?.request) {
      navigator.wakeLock.request('screen').then(l => { wakeLock = l }).catch(() => {})
    }
    let lastSent = 0, lastCoords = null
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now()
        const coords = pos.coords
        const moved = lastCoords && metrosEntreCoords(lastCoords, coords) >= GPS_MOVIMENTO_METROS
        if (!moved && now - lastSent < GPS_ENVIO_MOVIMENTO_MS && lastCoords) return
        lastSent = now
        lastCoords = { latitude: coords.latitude, longitude: coords.longitude }
        enviarGps(coords)
      },
      (err) => { if (err?.code === 1) setGpsStatus('negado'); else setGpsStatus(p => p === 'ok' ? p : 'pedindo') },
      { enableHighAccuracy: true, maximumAge: 500, timeout: 12000 },
    )
    const heartbeat = setInterval(() => {
      if (encerrada) return
      navigator.geolocation.getCurrentPosition(
        (pos) => enviarGps(pos.coords),
        () => {},
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 },
      )
    }, GPS_ENVIO_INTERVALO_MS)
    function onVis() { if (document.visibilityState === 'visible') pedirGps() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(heartbeat)
      navigator.geolocation.clearWatch(watch)
      document.removeEventListener('visibilitychange', onVis)
      wakeLock?.release?.().catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId, enviarGps, pedirGps, encerrada])

  function detalhe(key) { return detalheParada(execucao, key) }
  function statusDe(key) { return detalhe(key).status || 'pendente' }

  async function persistir(novo) {
    execRef.current = novo
    setExecucao(novo)
    if (shareId) await saveExecucao(shareId, novo)
  }

  async function atualizarStatus(key, status) {
    const base = execRef.current || execucao
    const detalhes = { ...(base.detalhes || {}) }
    detalhes[key] = { ...(detalhes[key] || {}), status, atualizadoEm: new Date().toISOString() }
    await persistir({
      ...base,
      statusParadas: { ...(base.statusParadas || {}), [key]: status },
      detalhes,
    })
  }

  async function onFoto(file) {
    setErro('')
    if (!file) return
    try {
      const img = await compressImageFile(file, { maxW: 1280, maxH: 1280, quality: 0.7, maxBytes: 380000 })
      setFotoPreview(img.dataUrl)
    } catch (e) { setErro(e?.message || 'Não foi possível ler a foto.') }
  }

  async function gravarVisita(key, fotoDataUrl = '') {
    const base = execRef.current || execucao
    let foto = fotoDataUrl || ''
    if (foto.startsWith('data:image') && shareId) {
      const url = await postRotaFoto(shareId, key, foto)
      if (url) foto = url
    }
    const agora = new Date().toISOString()
    const detalhes = { ...(base.detalhes || {}) }
    detalhes[key] = {
      ...(detalhes[key] || {}),
      status: 'concluido',
      foto: foto || detalhes[key]?.foto || '',
      confirmadoEm: agora,
      confirmadoPor: data?.membro || '',
      justificativa: '',
      motivoId: '',
      atualizadoEm: agora,
    }
    const next = {
      ...base,
      statusParadas: { ...(base.statusParadas || {}), [key]: 'concluido' },
      detalhes,
    }
    const resumoNext = resumoExecucao(next, paradas)
    await persistir({
      ...next,
      rotaStatus: resumoNext.resolvidas >= resumoNext.total
        ? (resumoNext.justificadas ? 'parcial' : 'concluida')
        : 'em_andamento',
    })
  }

  async function confirmarVisita() {
    if (!modal?.key) return
    setSalvando(true); setErro('')
    try {
      await gravarVisita(modal.key, fotoPreview)
      fecharModal()
    } catch (e) { setErro(e?.message || 'Falha ao salvar.') } finally { setSalvando(false) }
  }

  async function confirmarVisitaRapida(key) {
    setSalvando(true); setErro('')
    try { await gravarVisita(key, '') }
    catch (e) { setErro(e?.message || 'Falha ao salvar.') }
    finally { setSalvando(false) }
  }

  async function confirmarNaoVisita() {
    const motivo = MOTIVOS_NAO_VISITA.find(m => m.id === motivoId)
    const texto = String(justificativa || '').trim()
    if (!motivoId) { setErro('Escolha o motivo.'); return }
    if (motivoId === 'outro' && texto.length < 3) { setErro('Descreva o motivo (mín. 3 caracteres).'); return }
    setSalvando(true); setErro('')
    try {
      const agora = new Date().toISOString()
      const status = motivoId === 'reagendar' ? 'reagendar' : 'nao_visitou'
      const base = execRef.current || execucao
      const detalhes = { ...(base.detalhes || {}) }
      detalhes[modal.key] = { status, foto: '', confirmadoEm: agora, confirmadoPor: data?.membro || '', motivoId, justificativa: texto || motivo?.label || '', atualizadoEm: agora }
      const resumo = resumoExecucao({ ...base, detalhes }, paradas)
      await persistir({
        ...base,
        statusParadas: { ...(execucao.statusParadas || {}), [modal.key]: status },
        detalhes,
        rotaStatus: resumo.resolvidas >= resumo.total ? 'parcial' : 'em_andamento',
      })
      fecharModal()
    } catch (e) { setErro(e?.message || 'Falha ao salvar.') } finally { setSalvando(false) }
  }

  function abrirModal(key, tipo) {
    setModal({ key, tipo }); setFotoPreview(''); setMotivoId(''); setJustificativa(''); setErro('')
  }
  function fecharModal() { setModal(null); setFotoPreview(''); setErro('') }

  const resumo = resumoExecucao(execucao, paradas)
  const proximaIdx = paradas.findIndex(p => {
    const st = statusDe(p.key)
    return st !== 'concluido' && st !== 'nao_visitou' && st !== 'reagendar' && st !== 'cancelado'
  })
  const proxima = proximaIdx >= 0 ? paradas[proximaIdx] : null
  const proximaStatus = proxima ? statusDe(proxima.key) : ''
  const proximaCoords = proxima && coordValida(proxima.lat, proxima.lng)
    ? { lat: Number(proxima.lat), lng: Number(proxima.lng) } : null
  const posicaoGps = execucao?.posicao
  const gpsCoords = posicaoGps && coordValida(posicaoGps.lat, posicaoGps.lng)
    ? { lat: Number(posicaoGps.lat), lng: Number(posicaoGps.lng) } : null
  const geofenceAtivo = proxima && proximaCoords && !encerrada
    && proximaStatus !== 'no_local' && proximaStatus !== 'concluido' && proximaStatus !== 'nao_visitou'
    && proximaStatus !== 'reagendar' && proximaStatus !== 'cancelado'
  const { isConfirming, timeLeft, hasArrived } = useGeofence(
    geofenceAtivo ? proximaCoords : null, gpsCoords, posicaoGps?.acc ?? posicaoGps?.accuracy,
  )
  const dwellTotalSec = DWELL_TIME_MS / 1000
  const confirmProgress = isConfirming ? Math.min(100, Math.max(0, (timeLeft / dwellTotalSec) * 100)) : 0

  useEffect(() => { chegadaGeofenceRef.current = false }, [proxima?.key])
  useEffect(() => {
    if (!hasArrived || !proxima || !shareId || encerrada || chegadaGeofenceRef.current) return
    const prev = execRef.current
    const posicao = prev?.posicao
    if (!posicao) return
    const next = aplicarChegadaAutomaticaGps(prev, paradas, posicao, { geofenceConfirmado: true })
    if (next === prev) return
    chegadaGeofenceRef.current = true
    saveExecucao(shareId, next).catch(() => {})
    execRef.current = next; setExecucao(next)
  }, [hasArrived, proxima, shareId, encerrada, paradas])

  const restantes = paradas.filter(p => {
    const st = statusDe(p.key)
    return st !== 'concluido' && st !== 'nao_visitou' && st !== 'reagendar' && st !== 'cancelado'
  })
  const mapsUrl = proxima ? linkGoogleMapsDaLocalizacao([proxima]) : linkGoogleMapsDaLocalizacao(restantes.length ? restantes : paradas)
  const pontosRota = useMemo(() => {
    const pts = []
    if (gpsCoords) pts.push([gpsCoords.lat, gpsCoords.lng])
    const alvo = restantes.length ? restantes : paradas
    alvo.forEach(p => {
      if (coordValida(p.lat, p.lng)) {
        pts.push([Number(p.lat), Number(p.lng)])
      }
    })
    if (pts.length < 2 && proximaCoords) {
      return gpsCoords
        ? [[gpsCoords.lat, gpsCoords.lng], [proximaCoords.lat, proximaCoords.lng]]
        : []
    }
    return pts
  }, [gpsCoords, restantes, paradas, proximaCoords])

  if (!shareId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-base)' }}>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Link de rota inválido ou expirado.</p>
      </div>
    )
  }

  const paradaModal = modal ? paradas.find(p => p.key === modal.key) : null

  return (
    <div className="rota-publica min-h-screen flex flex-col" style={{ background: '#060810' }}>
      <style>{`
        @keyframes gpsPulse {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes rotaLivePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(52,211,153,0.5); }
          50% { box-shadow: 0 0 0 6px rgba(52,211,153,0); }
        }
      `}</style>

      {/* ─── MAPA HERO (sempre visível, estilo Uber) ─── */}
      <div className="relative flex-shrink-0 overflow-hidden"
        style={{ height: mapaExpandido ? 'clamp(260px, 44vh, 420px)' : '64px', transition: 'height 0.35s ease' }}>
        {mapaExpandido && (
          <>
            <MapaRota gpsCoords={gpsCoords} paradas={paradas} detalhesFn={detalhe} proximaIdx={proximaIdx} pontosRota={pontosRota}/>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 z-[5]"
              style={{ background: 'linear-gradient(to bottom, rgba(6,8,16,0.85) 0%, transparent 100%)' }}/>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 z-[5]"
              style={{ background: 'linear-gradient(to top, rgba(6,8,16,0.9) 0%, transparent 100%)' }}/>
          </>
        )}

        {/* Header flutuante sobre o mapa */}
        <div className="absolute top-0 left-0 right-0 z-10 px-4 pt-3 pb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(59,130,246,0.25)', border: '1px solid rgba(59,130,246,0.35)', backdropFilter: 'blur(8px)' }}>
              <Route size={18} style={{ color: '#93c5fd' }}/>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-extrabold truncate" style={{ fontSize: 15, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                {data?.nome || 'Minha rota'}
              </h1>
              <p style={{ fontSize: 10.5, color: 'rgba(148,163,184,0.85)' }}>
                {data?.data?.split('-').reverse().join('/')}
                {data?.membro ? ` · ${data.membro}` : ''}
              </p>
            </div>
            {/* Anel de progresso */}
            <div className="relative flex-shrink-0 w-11 h-11">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3"/>
                <circle cx="18" cy="18" r="15" fill="none"
                  stroke={resumo.pct >= 100 ? '#10b981' : '#3b82f6'} strokeWidth="3"
                  strokeDasharray={`${resumo.pct * 0.942} 100`} strokeLinecap="round"/>
              </svg>
              <span className="absolute inset-0 flex items-center justify-center font-black" style={{ fontSize: 9, color: '#e2e8f0' }}>
                {resumo.pct}%
              </span>
            </div>
            {syncing && <RefreshCw size={14} className="animate-spin flex-shrink-0" style={{ color: '#3b82f6' }}/>}
          </div>
        </div>

        {/* GPS status pill */}
        {!encerrada && mapaExpandido && (
          <div className="absolute top-[72px] left-4 z-10">
            {gpsStatus === 'ok' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold"
                style={{ fontSize: 10, color: '#6ee7b7', background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(52,211,153,0.35)', backdropFilter: 'blur(8px)' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#34d399', animation: 'rotaLivePulse 1.5s infinite' }}/>
                GPS ao vivo
              </span>
            ) : (
              <button type="button" onClick={pedirGps}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold"
                style={{
                  fontSize: 10,
                  background: gpsStatus === 'negado' ? 'rgba(248,113,113,0.2)' : 'rgba(59,130,246,0.2)',
                  color: gpsStatus === 'negado' ? '#fca5a5' : '#93c5fd',
                  border: `1px solid ${gpsStatus === 'negado' ? 'rgba(248,113,113,0.35)' : 'rgba(59,130,246,0.35)'}`,
                  backdropFilter: 'blur(8px)',
                }}>
                📍 {gpsStatus === 'negado' ? 'Permitir GPS' : gpsStatus === 'pedindo' ? 'Buscando…' : 'Ativar GPS'}
              </button>
            )}
          </div>
        )}

        {/* Mini-card da próxima parada sobre o mapa */}
        {mapaExpandido && proxima && (
          <div className="absolute bottom-3 left-3 right-3 z-10 rounded-2xl px-3 py-2.5 flex items-center gap-2.5"
            style={{ background: 'rgba(15,20,30,0.88)', border: '1.5px solid rgba(245,158,11,0.4)', backdropFilter: 'blur(12px)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-white"
              style={{ background: 'linear-gradient(135deg,#d97706,#f59e0b)', fontSize: 14 }}>
              {proximaIdx + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold truncate" style={{ fontSize: 13, color: '#f1f5f9' }}>{proxima.nome}</p>
              <p className="truncate" style={{ fontSize: 10, color: '#64748b' }}>
                {proxima.endereco || 'Sem endereço'}
              </p>
            </div>
            <Flag size={16} style={{ color: '#f59e0b', flexShrink: 0 }}/>
          </div>
        )}

        {/* Toggle mapa */}
        <button type="button" onClick={() => setMapaExpandido(v => !v)}
          className="absolute z-20 flex items-center justify-center gap-1 rounded-full px-3 py-1.5 font-bold"
          style={{
            top: mapaExpandido ? 12 : '50%', right: 12,
            transform: mapaExpandido ? 'none' : 'translateY(-50%)',
            fontSize: 10, color: '#94a3b8',
            background: 'rgba(15,20,30,0.85)', border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(8px)',
          }}>
          {mapaExpandido ? <><ChevronUp size={11}/> Recolher</> : <><ChevronDown size={11}/> Mapa</>}
        </button>

        {encerrada && (
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 z-10 px-4 py-3 rounded-2xl text-center font-bold"
            style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)', color: '#fca5a5', fontSize: 12 }}>
            Rota encerrada pela coordenação
          </div>
        )}
      </div>

      {/* ─── AÇÕES DA PRÓXIMA PARADA ─── */}
      {proxima && !encerrada && (
        <div className="flex-shrink-0 px-3 py-3 space-y-2.5"
          style={{ background: '#0c1018', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {proximaStatus === 'no_local' && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#f59e0b' }}/>
              <p style={{ fontSize: 12, color: '#fbbf24', fontWeight: 700 }}>Você chegou! Confirme a visita abaixo.</p>
            </div>
          )}

          <a href={proxima ? linkGoogleMapsDaLocalizacao([proxima]) : mapsUrl || '#'} target="_blank" rel="noopener noreferrer"
            className={`flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-extrabold text-white ${!proxima && !mapsUrl ? 'opacity-40 pointer-events-none' : ''}`}
            style={{ background: 'linear-gradient(135deg,#1a56db,#4285F4)', boxShadow: '0 4px 14px rgba(66,133,244,0.3)' }}>
            <ExternalLink size={16}/> Abrir no Google Maps
          </a>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => atualizarStatus(proxima.key, 'em_deslocamento')}
              className="py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
              style={{
                background: proximaStatus === 'em_deslocamento' ? 'rgba(6,182,212,0.35)' : 'rgba(6,182,212,0.1)',
                color: '#67e8f9',
                border: `2px solid ${proximaStatus === 'em_deslocamento' ? 'rgba(6,182,212,0.6)' : 'rgba(6,182,212,0.2)'}`,
              }}>
              🚗 A caminho
            </button>
            <button type="button" onClick={() => atualizarStatus(proxima.key, 'no_local')}
              className="py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
              style={{
                background: proximaStatus === 'no_local' ? 'rgba(245,158,11,0.35)' : 'rgba(245,158,11,0.1)',
                color: '#fbbf24',
                border: `2px solid ${proximaStatus === 'no_local' ? 'rgba(245,158,11,0.6)' : 'rgba(245,158,11,0.2)'}`,
              }}>
              📍 Cheguei
            </button>
          </div>

          <button type="button" disabled={salvando} onClick={() => confirmarVisitaRapida(proxima.key)}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-extrabold text-white"
            style={{ background: 'linear-gradient(135deg,#047857,#10b981)', boxShadow: '0 4px 16px rgba(16,185,129,0.35)' }}>
            <CheckCircle2 size={18}/> {salvando ? 'Salvando…' : 'Confirmar visita'}
          </button>
          <button type="button" onClick={() => abrirModal(proxima.key, 'visita')}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold"
            style={{ background: 'rgba(59,130,246,0.12)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.28)' }}>
            <Camera size={15}/> Confirmar com foto
          </button>
          <button type="button" onClick={() => abrirModal(proxima.key, 'nao')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold"
            style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <AlertTriangle size={13}/> Não consegui visitar
          </button>
        </div>
      )}

      {!proxima && mapsUrl && (
        <div className="mx-3 mt-2 mb-1">
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold text-white"
            style={{ background: 'rgba(37,99,235,0.35)', border: '1px solid rgba(59,130,246,0.35)' }}>
            <Route size={13}/> Rota completa no Maps
          </a>
        </div>
      )}

      {/* ─── TIMELINE DE PARADAS ─── */}
      <div className={`flex-1 overflow-y-auto px-3 py-3 ${isConfirming ? 'pb-28' : 'pb-8'}`}>
        <p className="font-bold mb-3 px-1" style={{ fontSize: 11, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Todas as paradas · {resumo.visitadas}/{resumo.total}
        </p>
        <div className="relative">
          {paradas.length > 1 && (
            <div className="absolute left-[13px] z-0" style={{ top: 20, bottom: 20, width: 2, background: 'linear-gradient(to bottom, #10b981, #3b82f6, #6366f1)', opacity: 0.4 }}/>
          )}
          {paradas.map((p, idx) => {
            const d = detalhe(p.key)
            const st = d.status || 'pendente'
            const stMeta = STATUS_PARADA.find(s => s.id === st)
              || (st === 'nao_visitou' ? { id: 'nao_visitou', label: 'Não visitada', cor: '#f87171' } : STATUS_PARADA[0])
            const tipoCor = corTipoParada(p.tipoParada)
            const ativa = paradaAtiva === idx
            const resolvida = st === 'concluido' || st === 'nao_visitou' || st === 'reagendar'
            const isProxima = idx === proximaIdx
            const dotCor = st === 'concluido' ? '#10b981' : st === 'nao_visitou' ? '#f87171' : isProxima ? '#f59e0b' : tipoCor
            return (
              <div key={p.key} className="flex gap-3 mb-2.5 relative z-10">
                <div className="flex-shrink-0 w-7 h-7 mt-2.5 rounded-full flex items-center justify-center font-bold text-white z-10 overflow-hidden"
                  style={{ fontSize: 10, background: dotCor, border: '3px solid #060810', boxShadow: `0 0 0 2px ${dotCor}55` }}>
                  {d.foto ? <img src={d.foto} alt="" className="w-full h-full object-cover"/> : (st === 'concluido' ? '✓' : idx + 1)}
                </div>
                <div className="flex-1 min-w-0 rounded-2xl overflow-hidden"
                  style={{
                    background: isProxima ? 'rgba(30,42,58,0.95)' : 'rgba(15,20,28,0.9)',
                    border: isProxima ? '1.5px solid rgba(245,158,11,0.4)' : '1px solid rgba(255,255,255,0.07)',
                    opacity: resolvida && !isProxima ? 0.7 : 1,
                  }}>
                  <button type="button" className="w-full px-3 py-2.5 flex items-start gap-2 text-left"
                    onClick={() => setParadaAtiva(ativa ? -1 : idx)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className="font-bold truncate" style={{ fontSize: 13, color: '#e2e8f0', textDecoration: st === 'concluido' ? 'line-through' : 'none' }}>
                          {p.nome}
                        </p>
                        <span className="flex-shrink-0 px-1.5 py-0.5 rounded-lg font-bold"
                          style={{ fontSize: 9, color: stMeta.cor, background: `${stMeta.cor}22` }}>
                          {stMeta.label}
                        </span>
                      </div>
                      <p className="truncate" style={{ fontSize: 10, color: '#64748b' }}>
                        {labelTipoParada(p.tipoParada)}{p.horaPrevista ? ` · ${p.horaPrevista}` : ''}
                      </p>
                      {p.endereco && <p className="truncate" style={{ fontSize: 9.5, color: '#475569' }}>{p.endereco}</p>}
                      {p.material && (
                        <p className="flex items-center gap-1 mt-0.5" style={{ fontSize: 10, color: '#f59e0b' }}>
                          <Package size={9}/> {p.material.quantidade}x {p.material.nome}
                        </p>
                      )}
                      {d.justificativa && <p className="mt-1 truncate" style={{ fontSize: 10, color: '#fca5a5' }}>{d.justificativa}</p>}
                    </div>
                    <ChevronRight size={13} className="flex-shrink-0 mt-1 transition-transform" style={{ color: '#334155', transform: ativa ? 'rotate(90deg)' : 'none' }}/>
                  </button>

                  {ativa && !resolvida && !isProxima && (
                    <div className="px-3 pb-3 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <button type="button" onClick={() => atualizarStatus(p.key, 'em_deslocamento')}
                          className="py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
                          style={{ background: 'rgba(6,182,212,0.12)', color: '#67e8f9' }}>
                          🚗 A caminho
                        </button>
                        <button type="button" onClick={() => atualizarStatus(p.key, 'no_local')}
                          className="py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
                          style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24' }}>
                          📍 Cheguei
                        </button>
                      </div>
                      <button type="button" onClick={() => abrirModal(p.key, 'visita')}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold text-white"
                        style={{ background: 'linear-gradient(135deg,#047857,#10b981)' }}>
                        <Camera size={14}/> Confirmar visita
                      </button>
                      <button type="button" onClick={() => abrirModal(p.key, 'nao')}
                        className="w-full py-2 rounded-xl text-xs font-bold"
                        style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)' }}>
                        Não consegui visitar
                      </button>
                      <a href={linkGoogleMapsDaLocalizacao([p])} target="_blank" rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-bold text-white"
                        style={{ background: '#4285F4' }}>
                        <ExternalLink size={12}/> Abrir no Google Maps
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Geofence progress bar */}
      {isConfirming && (
        <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pointer-events-none"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}>
          <div className="relative overflow-hidden rounded-2xl" style={{ background: '#1e293b', border: '1px solid rgba(59,130,246,0.3)' }}>
            <div className="flex items-center gap-2.5 px-3.5 py-3">
              <MapPin size={15} style={{ color: '#93c5fd', flexShrink: 0 }}/>
              <p className="font-medium" style={{ fontSize: 13, color: '#e2e8f0' }}>
                Confirmando chegada… {timeLeft}s
              </p>
            </div>
            <div className="h-1.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full transition-all rounded-full" style={{ width: `${confirmProgress}%`, background: 'linear-gradient(90deg,#1d4ed8,#3b82f6)' }}/>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar visita / não-visita */}
      {modal && paradaModal && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          onClick={fecharModal}>
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 space-y-3"
            style={{ background: 'linear-gradient(180deg,#111827,#0c1018)', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto mb-1 sm:hidden" style={{ background: 'rgba(255,255,255,0.15)' }}/>
            <div className="flex items-center justify-between">
              <p className="font-extrabold" style={{ fontSize: 16, color: '#f1f5f9' }}>
                {modal.tipo === 'visita' ? '📸 Confirmar visita' : '⚠️ Não visitei'}
              </p>
              <button type="button" onClick={fecharModal} className="p-2 rounded-xl" style={{ color: '#64748b', background: 'rgba(255,255,255,0.05)' }}>
                <X size={17}/>
              </button>
            </div>
            <p className="px-1 py-2 rounded-xl" style={{ fontSize: 12, color: '#94a3b8', background: 'rgba(255,255,255,0.03)' }}>{paradaModal.nome}</p>

            {modal.tipo === 'visita' ? (
              <div className="space-y-2">
                <div className="rounded-2xl overflow-hidden"
                  style={{ border: `2px dashed ${fotoPreview ? '#10b981' : 'rgba(59,130,246,0.45)'}`, background: 'rgba(255,255,255,0.02)' }}>
                  {fotoPreview
                    ? <img src={fotoPreview} alt="Fachada" className="w-full h-52 object-cover"/>
                    : (
                      <div className="h-32 flex flex-col items-center justify-center gap-1.5" style={{ color: '#64748b' }}>
                        <Camera size={26} style={{ color: '#3b82f6' }}/>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>Foto da fachada (opcional)</span>
                      </div>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-bold cursor-pointer"
                    style={{ background: 'rgba(59,130,246,0.16)', color: '#93c5fd' }}>
                    <Camera size={14}/> Tirar foto
                    <input type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={e => onFoto(e.target.files?.[0])}/>
                  </label>
                  <label className="flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-bold cursor-pointer"
                    style={{ background: 'rgba(212,175,95,0.14)', color: '#f0d48a' }}>
                    <ImagePlus size={14}/> Galeria
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => onFoto(e.target.files?.[0])}/>
                  </label>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {MOTIVOS_NAO_VISITA.map(m => (
                    <button key={m.id} type="button" onClick={() => setMotivoId(m.id)}
                      className="px-3 py-2 rounded-xl text-xs font-bold"
                      style={{
                        background: motivoId === m.id ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.05)',
                        color: motivoId === m.id ? '#fca5a5' : '#94a3b8',
                        border: `1.5px solid ${motivoId === m.id ? 'rgba(248,113,113,0.4)' : 'transparent'}`,
                      }}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={justificativa}
                  onChange={e => setJustificativa(e.target.value)}
                  rows={3}
                  placeholder="Detalhe (obrigatório se Outro)"
                  className="w-full rounded-xl px-3 py-2.5 text-sm resize-none"
                  style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', outline: 'none' }}
                />
              </>
            )}

            {erro && <p className="px-3 py-2 rounded-xl" style={{ fontSize: 12, color: '#fca5a5', background: 'rgba(248,113,113,0.1)' }}>{erro}</p>}

            <button type="button" disabled={salvando}
              onClick={modal.tipo === 'visita' ? confirmarVisita : confirmarNaoVisita}
              className="w-full py-4 rounded-2xl font-extrabold text-white"
              style={{
                background: modal.tipo === 'visita' ? 'linear-gradient(135deg,#047857,#10b981)' : 'linear-gradient(135deg,#92400e,#b45309)',
                opacity: salvando ? 0.5 : 1, fontSize: 15,
                boxShadow: modal.tipo === 'visita' ? '0 4px 16px rgba(16,185,129,0.3)' : 'none',
              }}>
              {salvando ? 'Salvando…' : modal.tipo === 'visita' ? '✓ Registrar visita' : 'Enviar justificativa'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
