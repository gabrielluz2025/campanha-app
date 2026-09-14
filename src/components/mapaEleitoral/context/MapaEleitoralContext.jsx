import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { SYNC_EVENT, SYNC_STORAGE_EVENT } from '../../../lib/cloudSync'
import { deferHeavyUiWork, shouldDeferSyncUi } from '../../../utils/syncUiGate'
import {
  BAIRROS_BLUMENAU, ELEITORES_POR_BAIRRO, REGIOES, normStr,
  eleitoresDoBairro, eleitoresBairroEhEstimado,
} from '../../../utils/constants'
import { bairroCanon } from '../../../utils/bairroMapa'
import {
  buildTreCtx, resolveBairroVotacao, sanitizarDadosEleitores, zonaPertenceCidade,
  lerFiltroCidade, gravarFiltroCidade, listarCidadesEleitores, cidadeFocoPadrao,
} from '../../../utils/eleitoresHelpers'
import { carregarBairrosGeo } from '../../../utils/bairrosGeo'
import {
  carregarLimiteBlumenau, getLimiteBlumenauCache, contornoParaMapa,
} from '../../../utils/blumenauLimit'
import { buildColegiosFromEleitores, COLEGIO_COORDS_KEY, offsetPorId } from '../../../utils/colegiosGeo'
import { geocodeEndereco, sleep } from '../../../utils/geocode'
import {
  quantidadePorBairro, planejamentoEquipePorBairro,
  VOTOS_POR_MEMBRO, VOTOS_POR_MEMBRO_OPCOES,
} from '../../../utils/forcaPorBairro'
import { readEleitoresData, readStorage, writeStorage } from '../../../utils/persist'
import { SETOR_BAIRRO, STORAGE_SECOES_KEY } from '../constants'
import { buildRadarMap, gerarPlanoAcao } from '../utils/eleitoralRadar'
import { boundsFromFeature, findFeatureByBairro } from '../utils/eleitoralGeo'
import {
  carregarIgrejasEleitoral, filtrarIgrejasMapa, bairroEleitoralIgreja, IGREJAS_ATUALIZADAS_EVENT,
} from '../utils/eleitoralIgrejas'
import { limitarPinsMapa, MAX_PINS_MAPA } from '../../../utils/mapaPins'

const MapaEleitoralContext = createContext(null)

const TOTAL_ELEITORES_BLUMENAU = Object.values(ELEITORES_POR_BAIRRO).reduce((s, v) => s + v, 0)

export function MapaEleitoralProvider({ children }) {
  const [secoes, setSecoes] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_SECOES_KEY) || '[]') } catch { return [] }
  })
  const [geoData, setGeoData] = useState(null)
  const [geoFonte, setGeoFonte] = useState('')
  const [geoErro, setGeoErro] = useState('')
  const [limiteBlu, setLimiteBlu] = useState(() => getLimiteBlumenauCache())
  const [showContornoBlu, setShowContornoBlu] = useState(true)
  const [layers, setLayers] = useState({ nomes: true, choropleth: true, colegios: true, igrejas: false })
  const [igrejasModo, setIgrejasModo] = useState('todas')
  const [igrejasLista, setIgrejasLista] = useState([])
  const [igrejasLoading, setIgrejasLoading] = useState(false)
  const [lente, setLente] = useState('radar')
  const [bairroSel, setBairroSel] = useState(null)
  const [filtroBairros, setFiltroBairros] = useState([])
  const [buscaBairro, setBuscaBairro] = useState('')
  const [rankingSort, setRankingSort] = useState('radar')
  const [focusBounds, setFocusBounds] = useState(null)
  const [colegioSel, setColegioSel] = useState(null)
  const [flyTarget, setFlyTarget] = useState(null)
  const [filtroCidade, setFiltroCidade] = useState(() => lerFiltroCidade('BLUMENAU'))
  const [votosPorMembro, setVotosPorMembro] = useState(() => {
    try {
      const n = Number(localStorage.getItem('forca_votos_por_membro'))
      return VOTOS_POR_MEMBRO_OPCOES.includes(n) ? n : VOTOS_POR_MEMBRO
    } catch {
      return VOTOS_POR_MEMBRO
    }
  })
  const [tickForca, setTickForca] = useState(0)
  const [colegiosCoords, setColegiosCoords] = useState(() => {
    try { return JSON.parse(localStorage.getItem(COLEGIO_COORDS_KEY) || '{}') } catch { return {} }
  })
  const [geoColegios, setGeoColegios] = useState({ done: 0, total: 0 })
  const [dadosEleitores, setDadosEleitores] = useState(null)
  const [scDataFull, setScDataFull] = useState([])

  const reloadEleitores = useCallback(() => {
    setDadosEleitores(sanitizarDadosEleitores(readEleitoresData(null)))
    setTickForca(t => t + 1)
  }, [])

  useEffect(() => {
    reloadEleitores()
    const scheduleReload = () => {
      if (shouldDeferSyncUi()) {
        deferHeavyUiWork(reloadEleitores, { minDelay: 700 })
        return
      }
      reloadEleitores()
    }
    const onSync = (e) => {
      if (e?.detail?.materiaisPartial) return
      scheduleReload()
    }
    const onStorage = (e) => {
      if (!e?.detail?.external) return
      const k = e.detail.key
      if (k && !['eleitores_data', 'equipe_membros', 'metas_campanha', 'materiais_distribuicao', 'apoiadores_lista'].includes(k)) return
      scheduleReload()
    }
    const onCidade = (e) => {
      const c = e?.detail?.cidade
      if (c === undefined) return
      setFiltroCidade(c || '')
      setFiltroBairros([])
      setBairroSel(null)
      setColegioSel(null)
    }
    window.addEventListener(SYNC_EVENT, onSync)
    window.addEventListener(SYNC_STORAGE_EVENT, onStorage)
    window.addEventListener('eleitores-filtro-cidade', onCidade)
    return () => {
      window.removeEventListener(SYNC_EVENT, onSync)
      window.removeEventListener(SYNC_STORAGE_EVENT, onStorage)
      window.removeEventListener('eleitores-filtro-cidade', onCidade)
    }
  }, [reloadEleitores])

  useEffect(() => { writeStorage(STORAGE_SECOES_KEY, secoes) }, [secoes])

  const reloadIgrejas = useCallback(async () => {
    setIgrejasLoading(true)
    try {
      const list = await carregarIgrejasEleitoral()
      setIgrejasLista(list)
    } catch {
      setIgrejasLista([])
    } finally {
      setIgrejasLoading(false)
    }
  }, [])

  useEffect(() => {
    reloadIgrejas()
    let reloadTimer = null
    const bump = (e) => {
      if (e?.detail?.localEdit) return
      if (e?.type === SYNC_STORAGE_EVENT && !e?.detail?.external) return
      if (shouldDeferSyncUi()) {
        deferHeavyUiWork(() => reloadIgrejas(), { minDelay: 1400 })
        return
      }
      clearTimeout(reloadTimer)
      reloadTimer = setTimeout(() => reloadIgrejas(), 1400)
    }
    window.addEventListener(IGREJAS_ATUALIZADAS_EVENT, bump)
    window.addEventListener(SYNC_STORAGE_EVENT, bump)
    return () => {
      clearTimeout(reloadTimer)
      window.removeEventListener(IGREJAS_ATUALIZADAS_EVENT, bump)
      window.removeEventListener(SYNC_STORAGE_EVENT, bump)
    }
  }, [reloadIgrejas])

  useEffect(() => {
    let cancelled = false
    fetch('/locais_tre.json')
      .then(r => r.json())
      .then(data => { if (!cancelled) setScDataFull(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const cidadesDisponiveis = useMemo(() => listarCidadesEleitores(dadosEleitores), [dadosEleitores])
  const cidadeAtiva = useMemo(() => {
    if (filtroCidade) return filtroCidade
    return cidadeFocoPadrao(dadosEleitores, cidadesDisponiveis) || 'BLUMENAU'
  }, [filtroCidade, dadosEleitores, cidadesDisponiveis])
  const isBlumenau = normStr(cidadeAtiva) === normStr('BLUMENAU')

  useEffect(() => {
    if (!isBlumenau) return undefined
    let cancelled = false
    void carregarLimiteBlumenau().then(lim => { if (!cancelled) setLimiteBlu(lim) })
    return () => { cancelled = true }
  }, [isBlumenau])

  useEffect(() => {
    if (!dadosEleitores?.zonas?.length || filtroCidade) return
    const padrao = cidadeFocoPadrao(dadosEleitores, cidadesDisponiveis)
    if (padrao) {
      setFiltroCidade(padrao)
      gravarFiltroCidade(padrao)
    }
  }, [dadosEleitores, cidadesDisponiveis, filtroCidade])

  useEffect(() => {
    let cancel = false
    setGeoErro('')
    setGeoData(null)
    carregarBairrosGeo(cidadeAtiva)
      .then(({ data, label, bounds }) => {
        if (cancel) return
        setGeoData(data)
        setGeoFonte(label)
        if (bounds) setFocusBounds(bounds)
      })
      .catch((err) => {
        if (cancel) return
        setGeoData(null)
        setGeoFonte('')
        setGeoErro(err?.code === 'NO_GEO'
          ? `Sem polígonos de bairro para ${cidadeAtiva}. Colégios ainda aparecem no mapa.`
          : `Não foi possível carregar o mapa de ${cidadeAtiva}.`)
      })
    return () => { cancel = true }
  }, [cidadeAtiva])

  const escolherCidade = useCallback((v) => {
    const next = v || ''
    setFiltroCidade(next)
    gravarFiltroCidade(next)
    setFiltroBairros([])
    setBairroSel(null)
    setColegioSel(null)
    setFocusBounds(null)
    if (next && normStr(next) !== normStr('BLUMENAU') && (lente === 'radar' || lente === 'forca')) {
      setLente('resultado')
      setRankingSort('votos')
    }
  }, [lente])

  const forca = useMemo(() => {
    const membros = readStorage('equipe_membros', [])
    const metas = readStorage('metas_campanha', { metaVotos: 50000 })
    const dist = readStorage('materiais_distribuicao', [])
    const materiais = dist.map(d => ({ nome: d.bairro, qtd: Number(d.quantidade) || 0 }))
    const qt = quantidadePorBairro({
      membros,
      materiais,
      dadosEleitores: sanitizarDadosEleitores(dadosEleitores || {}),
      metaVotos: metas.metaVotos || 0,
      votosPorMembro,
      apoiadores: readStorage('apoiadores_lista', []),
    })
    const apoiadoresPorBairro = Object.fromEntries((qt.lista || []).map(b => [b.nome, b.apoiadores || 0]))
    const votosApoiadoresPorBairro = Object.fromEntries((qt.lista || []).map(b => [b.nome, b.votosApoiadores || 0]))
    const plano = planejamentoEquipePorBairro(qt.lista || [], {
      metaVotos: metas.metaVotos || 0,
      votosPorMembro,
      pessoasTemTotal: Number(qt.planejamento?.pessoasTem) || Number(qt.membrosOperacionais) || 0,
      apoiadoresPorBairro,
      votosApoiadoresPorBairro,
      votosApoiadoresTotal: qt.planejamento?.votosApoiadores || 0,
    })
    const byNome = Object.fromEntries((plano.lista || []).map(b => {
      const pessoasMeta = Number(b.pessoasMeta) || 0
      const pessoasTem = Number(b.pessoasTem ?? b.atuacao) || 0
      const pessoasFaltamMeta = Number(b.pessoasFaltamMeta) || 0
      const coberto = !!b.cobertoMeta || (pessoasMeta > 0 && pessoasFaltamMeta <= 0 && pessoasTem >= pessoasMeta)
      return [b.nome, {
        ...b,
        temSecao: !!b.temSecao,
        semPessoas: !(Number(b.atuacao) > 0) && !(Number(b.moradia) > 0),
        pessoasTem,
        pessoasMeta,
        pessoasFaltamMeta,
        pessoasManter: Number(b.pessoasManter) || 0,
        coberto,
        metaVotos: Number(b.metaVotos) || 0,
      }]
    }))
    return {
      byNome,
      plano,
      votosPorMembro,
      metaVotos: metas.metaVotos || 0,
      cobertos: Object.values(byNome).filter(b => b.coberto).length,
      semPessoasN: Object.values(byNome).filter(b => b.semPessoas).length,
    }
  }, [dadosEleitores, votosPorMembro, tickForca])

  const treCtx = useMemo(() => buildTreCtx(scDataFull), [scDataFull])

  const secoesFromEleitores = useMemo(() => {
    if (!dadosEleitores?.zonas) return []
    return dadosEleitores.zonas
      .filter(z => zonaPertenceCidade(z, dadosEleitores, cidadeAtiva))
      .flatMap(z =>
        (z.locais || []).flatMap(l => {
          const bairro = resolveBairroVotacao(l, z, dadosEleitores, treCtx, { setorIgrejaMap: SETOR_BAIRRO })
          return (l.secoes || []).map(s => ({
            id: `e-${l.id}-${s.secao}`, bairro,
            colegio: l.nome, secao: String(s.secao),
            totalEleitores: 0, votosObtidos: s.votos,
            zona: z.zona, semSetor: !bairro,
          }))
        }),
      )
  }, [dadosEleitores, treCtx, cidadeAtiva])

  const locaisSemSetor = useMemo(() => {
    if (!dadosEleitores?.zonas) return []
    return dadosEleitores.zonas
      .filter(z => zonaPertenceCidade(z, dadosEleitores, cidadeAtiva))
      .flatMap(z => (z.locais || []).filter(l =>
        !resolveBairroVotacao(l, z, dadosEleitores, treCtx, { setorIgrejaMap: SETOR_BAIRRO }),
      ))
  }, [dadosEleitores, treCtx, cidadeAtiva])

  const colegiosLista = useMemo(
    () => buildColegiosFromEleitores(dadosEleitores, scDataFull, treCtx, SETOR_BAIRRO, cidadeAtiva),
    [dadosEleitores, scDataFull, treCtx, cidadeAtiva],
  )

  const getBairroCentroid = useCallback((bairro) => {
    const feat = findFeatureByBairro(geoData, bairro)
    if (!feat) return null
    const c = boundsFromFeature(feat)
    if (!c) return null
    return [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2]
  }, [geoData])

  useEffect(() => {
    if (!colegiosLista.length) return
    let cached = {}
    try { cached = JSON.parse(localStorage.getItem(COLEGIO_COORDS_KEY) || '{}') } catch { /* ignore */ }
    const pendentes = colegiosLista.filter(c => !cached[c.id] && c.enderecoCompleto)
    if (!pendentes.length) return
    let cancelled = false
    setGeoColegios({ done: 0, total: pendentes.length })
    ;(async () => {
      for (let i = 0; i < pendentes.length; i++) {
        if (cancelled) break
        if (i > 0) await sleep(1150)
        const c = pendentes[i]
        const coords = await geocodeEndereco(c.enderecoCompleto)
        if (coords && !cancelled) {
          cached[c.id] = coords
          writeStorage(COLEGIO_COORDS_KEY, cached)
          setColegiosCoords(prev => ({ ...prev, [c.id]: coords }))
        }
        if (!cancelled) setGeoColegios({ done: i + 1, total: pendentes.length })
      }
      if (!cancelled) setGeoColegios({ done: 0, total: 0 })
    })()
    return () => { cancelled = true }
  }, [colegiosLista])

  const colegiosNoMapa = useMemo(() => {
    return colegiosLista
      .filter(c => !filtroBairros.length || (c.bairro && filtroBairros.includes(c.bairro)))
      .map(c => {
        const cached = colegiosCoords[c.id]
        if (cached?.lat != null) return { ...c, lat: cached.lat, lng: cached.lng, posSource: 'geo' }
        const centroid = getBairroCentroid(c.bairro)
        if (centroid) {
          const [dLat, dLng] = offsetPorId(c.id)
          return { ...c, lat: centroid[0] + dLat, lng: centroid[1] + dLng, posSource: 'bairro' }
        }
        return null
      })
      .filter(Boolean)
  }, [colegiosLista, colegiosCoords, filtroBairros, getBairroCentroid])

  const igrejasNoMapa = useMemo(() => {
    if (!layers.igrejas) return []
    const filtradas = filtrarIgrejasMapa(igrejasLista, {
      filtroBairros,
      modo: igrejasModo,
      setorIgrejaMap: SETOR_BAIRRO,
    })
    const { pins } = limitarPinsMapa(filtradas, { max: MAX_PINS_MAPA })
    return pins
  }, [layers.igrejas, igrejasLista, filtroBairros, igrejasModo])

  const igrejasStats = useMemo(() => {
    const comPin = igrejasLista.filter(ig => ig.lat != null && ig.lng != null)
    return {
      total: comPin.length,
      visitadas: comPin.filter(ig => ig.visitado).length,
      pendentes: comPin.filter(ig => !ig.visitado).length,
    }
  }, [igrejasLista])

  const todasSecoes = useMemo(() => [
    ...secoesFromEleitores.filter(s => s.bairro),
    ...(isBlumenau ? secoes : []),
  ], [secoesFromEleitores, secoes, isBlumenau])

  const bairrosCidadeLista = useMemo(() => {
    if (isBlumenau) return BAIRROS_BLUMENAU
    const fromGeo = (geoData?.features || [])
      .map(f => bairroCanon(f.properties?.name || ''))
      .filter(Boolean)
    const fromSecoes = todasSecoes.map(s => s.bairro).filter(Boolean)
    return [...new Set([...fromGeo, ...fromSecoes])].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [isBlumenau, geoData, todasSecoes])

  const resumo = useMemo(() => {
    const map = {}
    const seed = isBlumenau ? BAIRROS_BLUMENAU : bairrosCidadeLista
    seed.forEach(b => {
      const f = isBlumenau ? (forca.byNome[b] || {}) : {}
      map[b] = {
        bairro: b,
        totalEleitores: isBlumenau ? eleitoresDoBairro(b) : 0,
        eleitoresEstimado: isBlumenau ? eleitoresBairroEhEstimado(b) : false,
        votosObtidos: 0, secoes: 0, semVoto: 0,
        aptos: Number(f.aptos) || (isBlumenau ? eleitoresDoBairro(b) : 0) || 0,
        votosForca: Number(f.votos) || 0,
        atuacao: Number(f.atuacao) || 0,
        moradia: Number(f.moradia) || 0,
        pessoasManter: Number(f.pessoasManter) || 0,
        pessoasMeta: Number(f.pessoasMeta) || 0,
        pessoasTem: Number(f.pessoasTem) || 0,
        pessoasFaltamMeta: Number(f.pessoasFaltamMeta) || 0,
        previsaoVotos: Number(f.previsaoVotos) || ((Number(f.pessoasTem) || 0) * (forca.votosPorMembro || 50)),
        metaVotos: Number(f.metaVotos) || 0,
        temSecaoForca: f.temSecao !== false,
        semPessoas: isBlumenau ? !!f.semPessoas : true,
        coberto: !!f.coberto,
      }
    })
    todasSecoes.forEach(s => {
      if (!s.bairro) return
      if (!map[s.bairro]) {
        map[s.bairro] = {
          bairro: s.bairro,
          totalEleitores: isBlumenau ? eleitoresDoBairro(s.bairro) : 0,
          eleitoresEstimado: false,
          votosObtidos: 0, secoes: 0, semVoto: 0,
          aptos: isBlumenau ? eleitoresDoBairro(s.bairro) || 0 : 0,
          votosForca: 0, atuacao: 0, moradia: 0,
          pessoasManter: 0, pessoasMeta: 0, pessoasTem: 0, pessoasFaltamMeta: 0,
          previsaoVotos: 0, metaVotos: 0,
          temSecaoForca: true, semPessoas: true, coberto: false,
        }
      }
      const r = map[s.bairro]
      r.votosObtidos += Number(s.votosObtidos) || 0
      r.secoes += 1
      if (Number(s.totalEleitores) > 0) {
        r.totalEleitores = Math.max(r.totalEleitores || 0, 0) + Number(s.totalEleitores)
        if (r.aptos < r.totalEleitores) r.aptos = r.totalEleitores
      }
      if (!(Number(s.votosObtidos) > 0)) r.semVoto += 1
    })
    Object.values(map).forEach(r => {
      r.pct = r.totalEleitores > 0 ? (r.votosObtidos / r.totalEleitores * 100) : null
      if (r.votosForca > 0 && r.votosObtidos === 0) r.votosObtidos = r.votosForca
      if (!r.aptos) r.aptos = r.totalEleitores
    })
    return map
  }, [todasSecoes, forca.byNome, forca.votosPorMembro, isBlumenau, bairrosCidadeLista])

  const radarMap = useMemo(() => buildRadarMap(resumo), [resumo])
  const planoAcao = useMemo(() => gerarPlanoAcao(resumo, radarMap), [resumo, radarMap])

  const totais = useMemo(() => {
    const votos = Object.values(resumo).reduce((s, r) => s + (r.votosObtidos || 0), 0)
    const eleitores = isBlumenau
      ? TOTAL_ELEITORES_BLUMENAU
      : Object.values(resumo).reduce((s, r) => s + (r.totalEleitores || r.aptos || 0), 0)
    const semVoto = todasSecoes.filter(s => !(Number(s.votosObtidos) > 0)).length
    const radarMedio = Object.values(radarMap).length
      ? Math.round(Object.values(radarMap).reduce((a, b) => a + b, 0) / Object.values(radarMap).length)
      : 0
    return {
      eleitores, votos,
      pct: eleitores > 0 ? (votos / eleitores * 100) : 0,
      semVoto,
      totalSecoes: secoesFromEleitores.length + (isBlumenau ? secoes.length : 0),
      fonte: dadosEleitores ? (dadosEleitores.candidato || 'TRE') : null,
      cobertos: isBlumenau ? forca.cobertos : 0,
      semPessoasN: isBlumenau ? forca.semPessoasN : 0,
      pessoasMeta: isBlumenau ? (forca.plano?.pessoasMeta || 0) : 0,
      pessoasTem: isBlumenau ? (forca.plano?.pessoasTem || 0) : 0,
      pessoasFaltamMeta: isBlumenau ? (forca.plano?.pessoasFaltamMeta || 0) : 0,
      previsaoVotos: isBlumenau ? (forca.plano?.previsaoVotos || 0) : 0,
      previsaoPctMeta: isBlumenau ? (forca.plano?.previsaoPctMeta || 0) : 0,
      metaVotos: isBlumenau ? (forca.metaVotos || 0) : 0,
      radarMedio,
      criticos: planoAcao.filter(p => p.score >= 55).length,
    }
  }, [resumo, radarMap, planoAcao, todasSecoes, secoesFromEleitores, secoes, dadosEleitores, forca, isBlumenau])

  const bairroPassaFiltro = useCallback((canon) => {
    if (!filtroBairros.length) return true
    return filtroBairros.includes(canon)
  }, [filtroBairros])

  const rankingList = useMemo(() => {
    const list = Object.values(resumo)
      .filter(r => r.secoes > 0 || r.aptos > 0 || r.votosObtidos > 0)
      .sort((a, b) => {
        if (rankingSort === 'radar') return (radarMap[b.bairro] || 0) - (radarMap[a.bairro] || 0)
        if (rankingSort === 'votos') return b.votosObtidos - a.votosObtidos
        if (rankingSort === 'pct') return (b.pct || 0) - (a.pct || 0)
        if (rankingSort === 'faltam') return (b.pessoasFaltamMeta || 0) - (a.pessoasFaltamMeta || 0)
        if (rankingSort === 'semVoto') return (b.semVoto || 0) - (a.semVoto || 0)
        return 0
      })
    if (!filtroBairros.length) return list
    return list.filter(r => filtroBairros.includes(r.bairro))
  }, [resumo, radarMap, rankingSort, filtroBairros])

  const bairrosComDados = useMemo(() =>
    bairrosCidadeLista.filter(b =>
      (resumo[b]?.secoes || 0) > 0
      || (resumo[b]?.totalEleitores || 0) > 0
      || (resumo[b]?.aptos || 0) > 0
      || (resumo[b]?.votosObtidos || 0) > 0,
    ).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [resumo, bairrosCidadeLista],
  )

  const bairrosFiltradosLista = useMemo(() => {
    const q = normStr(buscaBairro)
    return bairrosComDados.filter(b => !q || normStr(b).includes(q))
  }, [bairrosComDados, buscaBairro])

  const selecionarColegio = useCallback((c) => {
    if (!c) return
    setColegioSel(c.id)
    setFlyTarget({ lat: c.lat, lng: c.lng, zoom: 16, t: Date.now() })
    if (c.bairro) setBairroSel(c.bairro)
  }, [])

  const selecionarIgreja = useCallback((ig) => {
    if (!ig) return
    setColegioSel(null)
    setFocusBounds(null)
    if (ig.lat != null && ig.lng != null) {
      setFlyTarget({ lat: ig.lat, lng: ig.lng, zoom: 17, t: Date.now() })
    }
    const bairro = bairroEleitoralIgreja(ig, SETOR_BAIRRO)
    if (bairro) setBairroSel(bairro)
  }, [])

  const selecionarBairro = useCallback((canon) => {
    setColegioSel(null)
    setBairroSel(canon)
    const feat = findFeatureByBairro(geoData, canon)
    const b = boundsFromFeature(feat)
    if (b) setFocusBounds(b)
  }, [geoData])

  const toggleFiltroBairro = useCallback((canon) => {
    const ativo = filtroBairros.includes(canon)
    setFiltroBairros(prev => ativo ? prev.filter(x => x !== canon) : [...prev, canon])
    if (!ativo) selecionarBairro(canon)
    else if (bairroSel === canon) { setBairroSel(null); setColegioSel(null); setFocusBounds(null) }
  }, [filtroBairros, bairroSel, selecionarBairro])

  const limparFiltros = useCallback(() => {
    setFiltroBairros([])
    setBairroSel(null)
    setColegioSel(null)
    setBuscaBairro('')
    setFocusBounds(null)
  }, [])

  const filtrarRegiao = useCallback((bairros) => {
    const lista = bairros.map(b => bairroCanon(b)).filter(b => resumo[b]?.secoes > 0)
    setFiltroBairros(lista)
    if (lista.length === 1) selecionarBairro(lista[0])
  }, [resumo, selecionarBairro])

  const bairroDetail = bairroSel ? resumo[bairroSel] : null
  const colegioDetail = colegioSel ? colegiosNoMapa.find(c => c.id === colegioSel) : null
  const secoesNoBairroSel = bairroSel ? todasSecoes.filter(s => s.bairro === bairroSel) : []
  const secoesNoColegio = useMemo(() => {
    if (!colegioSel) return []
    const prefix = `e-${colegioSel}-`
    return todasSecoes
      .filter(s => String(s.id).startsWith(prefix) || (colegioDetail && s.colegio === colegioDetail.nome))
      .sort((a, b) => Number(a.secao) - Number(b.secao))
  }, [colegioSel, colegioDetail, todasSecoes])

  const semDadosEleitores = !dadosEleitores?.zonas?.length

  const value = {
    secoes, setSecoes,
    geoData, geoFonte, geoErro,
    limiteBlu, showContornoBlu, setShowContornoBlu,
    layers, setLayers,
    igrejasModo, setIgrejasModo,
    igrejasLista, igrejasNoMapa, igrejasStats, igrejasLoading, reloadIgrejas,
    lente, setLente,
    bairroSel, setBairroSel,
    filtroBairros, setFiltroBairros,
    buscaBairro, setBuscaBairro,
    rankingSort, setRankingSort,
    focusBounds, setFocusBounds,
    colegioSel, setColegioSel,
    flyTarget, setFlyTarget,
    filtroCidade, cidadeAtiva, cidadesDisponiveis, escolherCidade, isBlumenau,
    votosPorMembro, setVotosPorMembro,
    geoColegios, colegiosNoMapa, colegiosLista,
    dadosEleitores, semDadosEleitores,
    candidatoNome: dadosEleitores?.candidato || dadosEleitores?.numero || '',
    locaisSemSetor,
    resumo, radarMap, planoAcao, totais,
    rankingList, bairrosComDados, bairrosFiltradosLista,
    bairroPassaFiltro,
    selecionarColegio, selecionarIgreja, selecionarBairro, toggleFiltroBairro, limparFiltros, filtrarRegiao,
    bairroDetail, colegioDetail, secoesNoBairroSel, secoesNoColegio,
    todasSecoes, REGIOES,
    contornoMunicipal: isBlumenau && showContornoBlu ? contornoParaMapa(limiteBlu, geoData) : null,
  }

  return (
    <MapaEleitoralContext.Provider value={value}>
      {children}
    </MapaEleitoralContext.Provider>
  )
}

export function useMapaEleitoral() {
  const ctx = useContext(MapaEleitoralContext)
  if (!ctx) throw new Error('useMapaEleitoral must be used within MapaEleitoralProvider')
  return ctx
}
