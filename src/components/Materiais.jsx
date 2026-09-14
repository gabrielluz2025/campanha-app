import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Package, Plus, Trash2, Minus, AlertTriangle, CheckCircle2,
  X, Edit3, MapPin, TrendingDown, Box, User, Route,
  Search, Users, ClipboardList, Link2, Eye, EyeOff, RotateCcw, Printer, Clock,
  ImagePlus, ZoomIn, SlidersHorizontal, FileSpreadsheet,
} from 'lucide-react'
import { confirmAction } from '../utils/confirm'
import SaveButton from './SaveButton'
import { flushAfterSave, writeStorage, readStorage } from '../utils/persist'
import { PageHeader, ModuleWrap, KpiStrip, Button } from './ui'
import { BAIRROS_BLUMENAU } from '../utils/constants'
import { loadEquipeMembros } from '../utils/rotaUtils'
import {
  itensComSaldo, loadCoordenadores, loadRetiradas, loadCfg,
  recuperarSaidasDeRetiradasValidadas,
} from '../utils/materiaisRetirada'
import { sincronizarInboxRetiradas, agendarPublicacaoRetirada } from '../utils/materiaisRetiradaShare'
import { materiaisPadraoFaltantes, criarItensPadrao, filtrarEstoqueRemovido, marcarMaterialRemovido, desmarcarMaterialRemovido, recuperarEstoqueDeHistorico } from '../utils/materiaisCatalog'
import { imprimirEstoqueMateriais, imprimirAgendaRetiradas, imprimirRelatorioEstoqueCompleto, imprimirHistoricoMovimentos } from '../utils/materiaisRetiradaReport'
import {
  listarCategorias, mapaCoresCategorias, adicionarCategoria,
} from '../utils/materiaisCategorias'
import {
  loadEntradas, registrarEntrada, marcarDistribuicoesRemovidas, filtrarDistribuicoesRemovidas,
  labelUsuarioSistema, labelQuemRetirou, enriquecerSaidaComRetirada, saveEntradas,
} from '../utils/materiaisMovimentos'
import { compressImageFile } from '../utils/leadFormConfig'
import { SYNC_EVENT, SYNC_STORAGE_EVENT, syncMateriaisFromServer, getSyncStatus } from '../lib/cloudSync'
import { deferHeavyUiWork, shouldDeferSyncUi } from '../utils/syncUiGate'
import {
  ensureRemoteFoto, lastUploadError, isDataUrl, isUsableFoto, migrarFotosParaUrl,
} from '../utils/mediaUpload'
import ImagePositionEditor, { FramedCoverPhoto } from './ImagePositionEditor'
import MateriaisRetiradaAdmin from './MateriaisRetiradaAdmin'
import MateriaisImportEntradas from './MateriaisImportEntradas'
import { getMateriaisHistoricoLimpoEm } from '../utils/materiaisResetCore'
import {
  limparTodosDadosMateriais,
  limparHistoricoMateriais,
  desmarcarMateriaisLimposPeloUsuario,
  reabrirMateriaisAposEdicao,
  publicarMateriaisImportacao,
  repararMateriaisEstoqueDoHistorico,
  usuarioOptouPorMateriaisVazio,
} from '../utils/materiaisReset'

const STORAGE_KEY = 'materiais_estoque'
const DIST_KEY = 'materiais_distribuicao'

function gerarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function stampItem(item) {
  if (!item || typeof item !== 'object') return item
  return { ...item, atualizadoEm: new Date().toISOString() }
}

function fmtDataHora(iso) {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function labelUsuarioCurto(email = '') {
  const e = String(email || '').trim()
  if (!e) return ''
  const local = e.split('@')[0] || e
  return local.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || e
}

function StatusPill({ status }) {
  const map = {
    ok: { label: 'OK', bg: 'rgba(16,185,129,0.15)', color: '#34d399', border: 'rgba(16,185,129,0.35)' },
    baixo: { label: 'Estoque baixo', bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: 'rgba(245,158,11,0.35)' },
    esgotado: { label: 'Esgotado', bg: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'rgba(239,68,68,0.35)' },
  }
  const s = map[status] || map.ok
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold"
      style={{ fontSize: 10, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {status === 'ok' ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
      {s.label}
    </span>
  )
}

export default function Materiais({ userEmail = '' }) {
  const usuarioEmail = String(userEmail || '').trim()
  const usuarioNome = labelUsuarioCurto(usuarioEmail)

  const [itens, setItens] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
  })
  const [distribuicoes, setDistribuicoes] = useState(() => {
    try {
      return filtrarDistribuicoesRemovidas(JSON.parse(localStorage.getItem(DIST_KEY) || '[]'))
    } catch { return [] }
  })
  const [entradas, setEntradas] = useState(() => loadEntradas())
  const [catTick, setCatTick] = useState(0)
  const categorias = useMemo(() => listarCategorias(), [catTick, itens])
  const coresCat = useMemo(() => mapaCoresCategorias(), [catTick, itens])
  const [novaCatNome, setNovaCatNome] = useState('')
  const [coordenadores, setCoordenadores] = useState(() => loadCoordenadores())
  const [retiradas, setRetiradas] = useState(() => loadRetiradas())
  const [cfg, setCfg] = useState(() => loadCfg())
  const [subAba, setSubAba] = useState('estoque') // estoque | coordenadores | retiradas | link
  const [modal, setModal] = useState(null)
  const [distModal, setDistModal] = useState(null)
  const [entradaModal, setEntradaModal] = useState(null) // item
  const [entradaQtd, setEntradaQtd] = useState('')
  const [form, setForm] = useState({
    nome: '', categoria: 'Adesivos', quantidade: '', estoqueMinimo: '', noFormulario: true,
    foto: '', fotoX: 50, fotoY: 50, fotoZoom: 100,
  })
  const [fotoUploading, setFotoUploading] = useState(false)
  const [fotoPreview, setFotoPreview] = useState(null) // { src, nome, x, y, zoom }
  const [fotoAjusteAberto, setFotoAjusteAberto] = useState(false)
  const [distForm, setDistForm] = useState({
    itemId: '', quantidade: '', bairro: '', evento: '', responsavel: '', coordenadorId: '',
  })
  const [buscaDist, setBuscaDist] = useState('')
  const [filtroCat, setFiltroCat] = useState('Todas')
  const [importAberto, setImportAberto] = useState(false)
  const fotoInputRef = useRef(null)

  const faltantesPadrao = useMemo(() => materiaisPadraoFaltantes(itens), [itens])

  const membros = useMemo(() => loadEquipeMembros(), [])
  const skipPersistItens = useRef(true)
  const skipPersistDist = useRef(true)
  const lastLocalEdit = useRef(0)

  function markLocalEdit() {
    lastLocalEdit.current = Date.now()
  }

  function materiaisPendingSync() {
    const st = getSyncStatus()
    if (!st?.pending) return false
    return st.pending > 0
  }

  useEffect(() => {
    if (skipPersistItens.current) {
      skipPersistItens.current = false
      return
    }
    writeStorage(STORAGE_KEY, itens)
  }, [itens])

  useEffect(() => {
    if (skipPersistDist.current) {
      skipPersistDist.current = false
      return
    }
    writeStorage(DIST_KEY, distribuicoes)
  }, [distribuicoes])

  function garantirMateriaisPadrao(listaBase, { autoAdicionar = false } = {}) {
    const limpa = filtrarEstoqueRemovido(Array.isArray(listaBase) ? listaBase : [])
    if (!autoAdicionar) {
      return { lista: limpa, adicionou: 0 }
    }
    if (usuarioOptouPorMateriaisVazio() && !limpa.length) {
      return { lista: limpa, adicionou: 0 }
    }
    const faltantes = materiaisPadraoFaltantes(limpa)
    if (!faltantes.length) return { lista: limpa, adicionou: 0 }
    const add = criarItensPadrao(gerarId).filter(n =>
      faltantes.some(f => f.nome === n.nome),
    )
    if (!add.length) return { lista: limpa, adicionou: 0 }
    return { lista: [...limpa, ...add], adicionou: add.length }
  }

  // Sync de materiais: abertura + eventos que alteram chaves de materiais
  useEffect(() => {
    syncMateriaisFromServer().catch(() => {})

    const onSync = (e) => {
      if (e?.type === SYNC_STORAGE_EVENT && !e?.detail?.external) return
      if (e?.detail?.syncNow) return
      const d = e?.detail || {}
      const key = d.approvedKey || d.key || ''
      const materiaisKey = String(key).startsWith('materiais_')
      if (d.materiaisPartial || materiaisKey || (d.fromServer && d.forceReload)) {
        syncMateriaisFromServer().catch(() => {})
      }
    }
    window.addEventListener(SYNC_EVENT, onSync)
    window.addEventListener(SYNC_STORAGE_EVENT, onSync)
    return () => {
      window.removeEventListener(SYNC_EVENT, onSync)
      window.removeEventListener(SYNC_STORAGE_EVENT, onSync)
    }
  }, [])

  // Garante os 8 materiais (ao abrir e após sync da nuvem)
  useEffect(() => {
    function aplicar() {
      if (Date.now() - lastLocalEdit.current < 2500) return
      if (materiaisPendingSync()) return
      setItens(prev => {
        const fromStore = readStorage(STORAGE_KEY, prev)
        let atual = Array.isArray(fromStore) ? fromStore : prev

        const distsRaw = filtrarDistribuicoesRemovidas(readStorage(DIST_KEY, []))
        const retsRaw = loadRetiradas()
        const entradasRaw = loadEntradas()
        let atualPosRec = atual
        let nRec = 0
        const estoqueVazio = !Array.isArray(atual) || atual.length === 0
        const temHistorico = (entradasRaw?.length || 0) > 0 || (distsRaw?.length || 0) > 0
        if (getMateriaisHistoricoLimpoEm() <= 0 && temHistorico && estoqueVazio) {
          desmarcarMateriaisLimposPeloUsuario()
          const rec = recuperarEstoqueDeHistorico({
            estoque: atual,
            distribuicoes: distsRaw,
            entradas: entradasRaw,
            retiradas: retsRaw,
          })
          nRec = rec.recuperados
          if (rec.lista.length > (atual?.length || 0) || nRec > 0) {
            atualPosRec = rec.lista
            writeStorage(STORAGE_KEY, rec.lista, { force: true })
          }
        }

        const { lista, adicionou } = usuarioOptouPorMateriaisVazio()
          ? { lista: filtrarEstoqueRemovido(atualPosRec), adicionou: 0 }
          : garantirMateriaisPadrao(atualPosRec)
        const mudouLen = lista.length !== (atualPosRec?.length || 0)
        const mudouIds = mudouLen || lista.some((it, i) => it?.id !== atualPosRec[i]?.id)
        if (adicionou > 0 || mudouIds || nRec > 0) {
          queueMicrotask(() => {
            flushAfterSave()
            agendarPublicacaoRetirada()
          })
          return lista
        }
        // Sempre aplica dado novo do servidor (qtde, nome, foto) — compara valor, não referência
        const prevJson = JSON.stringify(Array.isArray(prev) ? prev : [])
        const nextJson = JSON.stringify(Array.isArray(lista) ? lista : [])
        if (nextJson !== prevJson) return lista
        return prev
      })

      const distsAtual = filtrarDistribuicoesRemovidas(readStorage(DIST_KEY, []))
      const retsAtual = loadRetiradas()
      if (getMateriaisHistoricoLimpoEm() <= 0 && !usuarioOptouPorMateriaisVazio()) {
        const { lista: distsOk, recuperados } = recuperarSaidasDeRetiradasValidadas(
          distsAtual,
          retsAtual,
          readStorage(STORAGE_KEY, []),
        )
        if (recuperados > 0) {
          writeStorage(DIST_KEY, distsOk)
          setDistribuicoes(prev => {
            const next = filtrarDistribuicoesRemovidas(distsOk)
            return JSON.stringify(prev) === JSON.stringify(next) ? prev : next
          })
          queueMicrotask(() => flushAfterSave())
        } else {
          setDistribuicoes(prev => {
            const next = Array.isArray(distsAtual) ? distsAtual : []
            return JSON.stringify(prev) === JSON.stringify(next) ? prev : next
          })
        }
      } else {
        setDistribuicoes(prev => {
          const next = Array.isArray(distsAtual) ? distsAtual : []
          return JSON.stringify(prev) === JSON.stringify(next) ? prev : next
        })
      }
      setEntradas(loadEntradas())
      setCatTick(t => t + 1)
      setCoordenadores(loadCoordenadores())
      setRetiradas(retsAtual)
      setCfg(loadCfg())
    }

    aplicar()
    const onMateriaisLimpos = () => aplicar()
    const onHistoricoLimpo = () => aplicar()
    const onSync = (e) => {
      if (e?.type === SYNC_STORAGE_EVENT && !e?.detail?.external) return
      const run = () => aplicar()
      if (shouldDeferSyncUi()) {
        deferHeavyUiWork(run, { minDelay: 700 })
        return
      }
      run()
    }
    window.addEventListener(SYNC_EVENT, onSync)
    window.addEventListener(SYNC_STORAGE_EVENT, onSync)
    window.addEventListener('campanha:materiais-limpos', onMateriaisLimpos)
    window.addEventListener('campanha:materiais-historico-limpo', onHistoricoLimpo)
    return () => {
      window.removeEventListener(SYNC_EVENT, onSync)
      window.removeEventListener(SYNC_STORAGE_EVENT, onSync)
      window.removeEventListener('campanha:materiais-limpos', onMateriaisLimpos)
      window.removeEventListener('campanha:materiais-historico-limpo', onHistoricoLimpo)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Base64 → URL no servidor (estoque leve; sync não carrega megabytes de foto)
  useEffect(() => {
    let cancelled = false
    async function migrar() {
      const atual = Array.isArray(itens) ? itens : []
      if (!atual.some(i => isDataUrl(i?.foto))) return
      const { lista, migrados } = await migrarFotosParaUrl(atual, { scope: 'materiais' })
      if (cancelled || !migrados) return
      setItens(lista)
      writeStorage(STORAGE_KEY, lista)
      flushAfterSave()
    }
    const t = setTimeout(migrar, 1200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [itens])

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      if (document.visibilityState === 'hidden') return
      const res = await sincronizarInboxRetiradas()
      if (cancelled) return
      if (res.adicionados > 0) setRetiradas(loadRetiradas())
    }
    tick()
    const id = setInterval(tick, 5000)
    const onVis = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  useEffect(() => {
    agendarPublicacaoRetirada({ delay: 400 })
  }, [])

  const itensComStatus = useMemo(() => {
    return itensComSaldo({ itens, distribuicoes, retiradas })
  }, [itens, distribuicoes, retiradas])

  const stats = useMemo(() => {
    const totalTipos = itensComStatus.length
    const totalDisponivel = itensComStatus.reduce((s, i) => s + i.disponivel, 0)
    const totalReservado = itensComStatus.reduce((s, i) => s + (i.reservado || 0), 0)
    const totalCadastrado = itensComStatus.reduce((s, i) => s + (Number(i.quantidade) || 0), 0)
    const alertas = itensComStatus.filter(i => i.status !== 'ok').length
    const totalDist = distribuicoes.reduce((s, d) => s + (Number(d.quantidade) || 0), 0)
    const orfas = distribuicoes.filter(d => !itens.some(i => i.id === d.itemId)).length
    const pendentes = retiradas.filter(r => r.status === 'pendente').length
    return { totalTipos, totalDisponivel, totalReservado, totalCadastrado, alertas, totalDist, orfas, pendentes }
  }, [itensComStatus, distribuicoes, itens, retiradas])

  const itensFiltrados = useMemo(() => {
    if (filtroCat === 'Todas') return itensComStatus
    return itensComStatus.filter(i => i.categoria === filtroCat)
  }, [itensComStatus, filtroCat])

  const historico = useMemo(() => {
    const q = buscaDist.trim().toLowerCase()
    const retById = new Map(retiradas.map(r => [String(r.id), r]))
    const saidas = distribuicoes.map(d => {
      const ret = d.retiradaId != null ? retById.get(String(d.retiradaId)) : null
      return enriquecerSaidaComRetirada({
        ...d,
        _tipo: 'saida',
        _ts: d.data,
        // Quem do sistema deu a baixa (novos) ou quem validou a retirada (legado)
        registradoPor: d.registradoPor || ret?.registradoPor || ret?.validadoPor || '',
        registradoPorEmail: d.registradoPorEmail || ret?.registradoPorEmail || '',
        validadoPor: d.validadoPor || ret?.validadoPor || '',
      }, ret)
    })
    const ents = entradas.map(e => ({ ...e, _tipo: 'entrada', _ts: e.data }))
    return [...saidas, ...ents]
      .sort((a, b) => new Date(b._ts || 0) - new Date(a._ts || 0))
      .filter(d => {
        if (!q) return true
        const item = itens.find(i => i.id === d.itemId)
        const nome = (item?.nome || d.itemNome || 'item removido').toLowerCase()
        const quem = labelUsuarioSistema(d).toLowerCase()
        const quemRetirou = labelQuemRetirou(d, d.retiradaId != null ? retById.get(String(d.retiradaId)) : null).toLowerCase()
        return nome.includes(q)
          || String(d.bairro || '').toLowerCase().includes(q)
          || String(d.evento || '').toLowerCase().includes(q)
          || String(d.responsavel || '').toLowerCase().includes(q)
          || String(d.coordenadorNome || '').toLowerCase().includes(q)
          || quemRetirou.includes(q)
          || quem.includes(q)
          || String(d.registradoPorEmail || '').toLowerCase().includes(q)
      })
  }, [distribuicoes, entradas, itens, buscaDist, retiradas])

  function criarCategoriaNoModal() {
    const res = adicionarCategoria(novaCatNome)
    if (!res.ok) {
      window.alert(res.erro || 'Não foi possível criar a categoria.')
      return
    }
    setForm(prev => ({ ...prev, categoria: res.nome }))
    setNovaCatNome('')
    setCatTick(t => t + 1)
  }

  function novoItem() {
    setForm({
      nome: '', categoria: 'Adesivos', quantidade: '0', estoqueMinimo: '0', noFormulario: true,
      foto: '', fotoX: 50, fotoY: 50, fotoZoom: 100,
    })
    setModal('novo')
  }

  function editarItem(item) {
    setForm({
      nome: item.nome,
      categoria: item.categoria,
      quantidade: item.quantidade,
      estoqueMinimo: item.estoqueMinimo,
      noFormulario: item.noFormulario !== false,
      foto: item.foto || '',
      fotoX: Number(item.fotoX) || 50,
      fotoY: Number(item.fotoY) || 50,
      fotoZoom: Number(item.fotoZoom) || 100,
    })
    setModal(item.id)
  }

  async function onEscolherFoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setFotoUploading(true)
    try {
      const result = await compressImageFile(file, {
        maxW: 900,
        maxH: 900,
        quality: 0.78,
        maxBytes: 220000,
        keepAlpha: false,
      })
      setForm(prev => ({
        ...prev,
        foto: result.dataUrl,
        fotoX: 50,
        fotoY: 42,
        fotoZoom: 100,
      }))
      setFotoAjusteAberto(true)
    } catch (err) {
      window.alert(err?.message || 'Não foi possível carregar a foto.')
    } finally {
      setFotoUploading(false)
    }
  }

  async function salvarItem() {
    if (!form.nome.trim()) return
    const itemId = modal === 'novo' ? gerarId() : modal
    if (modal === 'novo') {
      reabrirMateriaisAposEdicao()
      desmarcarMaterialRemovido({ id: itemId, nome: form.nome.trim() })
    }
    const qtd = parseInt(form.quantidade, 10)
    const min = parseInt(form.estoqueMinimo, 10) || 0
    const quantidade = Number.isFinite(qtd) && qtd >= 0 ? qtd : 0
    const noFormulario = form.noFormulario !== false
    setFotoUploading(true)
    let foto = ''
    let fotoUploadFalhou = false
    try {
      const raw = String(form.foto || '').trim()
      if (isUsableFoto(raw)) {
        const result = await ensureRemoteFoto(itemId, raw, 'materiais')
        if (result && !result.startsWith('data:')) {
          foto = result // URL remota — vai sincronizar com todos os dispositivos
        } else if (result && result.startsWith('data:')) {
          // Upload falhou — base64 só existe localmente, não sincroniza
          foto = result
          fotoUploadFalhou = true
        }
      }
    } finally {
      setFotoUploading(false)
    }
    if (fotoUploadFalhou) {
      const errDetail = lastUploadError ? ` (${lastUploadError})` : ''
      window.alert(`⚠️ A foto foi salva apenas neste dispositivo${errDetail}.\nOutros usuários não a verão até que a conexão seja restabelecida e você salve novamente.\n\nSe o problema persistir, tente salvar novamente em alguns segundos.`)
    }
    const fotoX = Number(form.fotoX) || 50
    const fotoY = Number(form.fotoY) || 50
    const fotoZoom = Number(form.fotoZoom) || 100
    let next
    if (modal === 'novo') {
      const novo = stampItem({
        id: itemId,
        nome: form.nome.trim(),
        categoria: form.categoria,
        quantidade,
        estoqueMinimo: min,
        noFormulario,
        foto,
        fotoX,
        fotoY,
        fotoZoom,
        criadoEm: new Date().toISOString(),
      })
      desmarcarMaterialRemovido(novo)
      next = [...itens, novo]
      if (quantidade > 0) {
        registrarEntrada({
          itemId: novo.id,
          itemNome: novo.nome,
          quantidade,
          registradoPor: usuarioNome,
          registradoPorEmail: usuarioEmail,
        })
        setEntradas(loadEntradas())
      }
    } else {
      const anterior = itens.find(i => i.id === modal)
      const antQtd = Number(anterior?.quantidade) || 0
      next = itens.map(i => i.id === modal
        ? stampItem({
            ...i,
            nome: form.nome.trim(),
            categoria: form.categoria,
            quantidade,
            estoqueMinimo: min,
            noFormulario,
            foto,
            fotoX,
            fotoY,
            fotoZoom,
          })
        : i)
      if (quantidade > antQtd) {
        registrarEntrada({
          itemId: modal,
          itemNome: form.nome.trim(),
          quantidade: quantidade - antQtd,
          registradoPor: usuarioNome,
          registradoPorEmail: usuarioEmail,
        })
        setEntradas(loadEntradas())
      }
    }
    markLocalEdit()
    writeStorage(STORAGE_KEY, next)
    setItens(next)
    setModal(null)
    await flushAfterSave()
    agendarPublicacaoRetirada()
  }

  function cadastrarMateriaisPadrao() {
    desmarcarMateriaisLimposPeloUsuario()
    const faltantes = materiaisPadraoFaltantes(itens, [])
    if (!faltantes.length) return
    faltantes.forEach(f => desmarcarMaterialRemovido(f))
    const { lista, adicionou } = garantirMateriaisPadrao(itens, { autoAdicionar: true })
    if (!adicionou) return
    setItens(lista)
    writeStorage(STORAGE_KEY, lista)
    flushAfterSave()
    agendarPublicacaoRetirada()
  }

  function imprimirEstoque() {
    const res = imprimirEstoqueMateriais({ itens: itensComStatus, historico })
    if (!res?.ok) {
      window.alert('Permita pop-ups neste site para imprimir o relatório.')
    }
  }

  function imprimirRelatorioCompleto() {
    const res = imprimirRelatorioEstoqueCompleto({
      itens: itensComStatus,
      historico,
      retiradas,
      filtroBusca: buscaDist.trim(),
    })
    if (!res?.ok) {
      window.alert('Permita pop-ups neste site para imprimir o relatório.')
    }
  }

  function imprimirHistorico() {
    const res = imprimirHistoricoMovimentos({
      historico,
      itens,
      retiradas,
      filtroBusca: buscaDist.trim(),
    })
    if (!res?.ok) {
      window.alert('Permita pop-ups neste site para imprimir o relatório.')
    }
  }

  async function aoImportarEntradas(res) {
    if (!res?.ok) return
    skipPersistItens.current = true
    const itensNovos = res.itens || []
    const entradasNovas = res.entradas || loadEntradas()
    setItens(itensNovos)
    setEntradas(entradasNovas)
    setCatTick(t => t + 1)
    let pub = { synced: false }
    try {
      pub = await publicarMateriaisImportacao({ itens: itensNovos, entradas: entradasNovas })
    } catch { /* ignore */ }
    agendarPublicacaoRetirada()
    const r = res.resumo || {}
    window.alert(
      `Importação concluída!\n\n`
      + `${r.entradas || 0} entrada(s) registrada(s)\n`
      + `${r.materiaisCriados || 0} material(is) novo(s) criado(s)\n`
      + `${(r.unidades || 0).toLocaleString('pt-BR')} unidades adicionadas ao estoque`
      + (pub.synced ? '\n\nSincronizado com a equipe.' : '\n\nAviso: verifique a internet e clique em Salvar se a equipe não receber.'),
    )
  }

  function toggleNoFormulario(item) {
    const next = itens.map(i => i.id === item.id
      ? { ...i, noFormulario: i.noFormulario === false }
      : i)
    setItens(next)
    writeStorage(STORAGE_KEY, next)
    flushAfterSave()
    agendarPublicacaoRetirada()
  }

  function abrirEntrada(item) {
    setEntradaModal(item)
    setEntradaQtd('')
  }

  function salvarEntrada({ zerar = false } = {}) {
    if (!entradaModal) return
    if (zerar) {
      const next = itens.map(i => i.id === entradaModal.id
        ? stampItem({ ...i, quantidade: 0 })
        : i)
      markLocalEdit()
      writeStorage(STORAGE_KEY, next)
      setItens(next)
      setEntradaModal(null)
      setEntradaQtd('')
      flushAfterSave()
      agendarPublicacaoRetirada()
      return
    }
    const add = parseInt(entradaQtd, 10)
    if (!Number.isFinite(add) || add <= 0) return
    const next = itens.map(i => i.id === entradaModal.id
      ? stampItem({ ...i, quantidade: (Number(i.quantidade) || 0) + add })
      : i)
    markLocalEdit()
    writeStorage(STORAGE_KEY, next)
    setItens(next)
    registrarEntrada({
      itemId: entradaModal.id,
      itemNome: entradaModal.nome,
      quantidade: add,
      registradoPor: usuarioNome,
      registradoPorEmail: usuarioEmail,
    })
    setEntradas(loadEntradas())
    setEntradaModal(null)
    setEntradaQtd('')
    flushAfterSave()
    agendarPublicacaoRetirada()
  }

  async function confirmarZerarEntrada() {
    if (!entradaModal) return
    const ok = await confirmAction({
      title: 'Zerar cadastro',
      message: `Zerar a quantidade cadastrada de "${entradaModal.nome}"? Você poderá lançar novas entradas depois. Saídas e reservas já registradas continuam no histórico.`,
      danger: true,
    })
    if (!ok) return
    salvarEntrada({ zerar: true })
  }

  async function excluirItem(id) {
    const item = itens.find(i => i.id === id)
    const ok = await confirmAction({
      title: 'Excluir material',
      message: `Excluir ${item?.nome || 'este item'} e todas as suas saídas? Esta ação não pode ser desfeita.`,
    })
    if (!ok) return
    markLocalEdit()
    marcarMaterialRemovido(item)
    const distIds = distribuicoes.filter(d => d.itemId === id).map(d => d.id)
    if (distIds.length) marcarDistribuicoesRemovidas(distIds)
    const nextEntradas = loadEntradas().filter(e => String(e.itemId) !== String(id))
    saveEntradas(nextEntradas)
    const nextItens = itens.filter(i => i.id !== id)
    const nextDist = distribuicoes.filter(d => d.itemId !== id)
    setItens(nextItens)
    setDistribuicoes(nextDist)
    setEntradas(nextEntradas)
    writeStorage(STORAGE_KEY, nextItens, { force: true })
    writeStorage(DIST_KEY, nextDist, { force: true })
    await flushAfterSave()
    agendarPublicacaoRetirada()
  }

  function novaDistribuicao(itemId) {
    setDistForm({
      itemId: itemId || itens[0]?.id || '',
      quantidade: '',
      bairro: '',
      evento: '',
      responsavel: '',
      coordenadorId: '',
    })
    setDistModal(true)
  }

  async function salvarDistribuicao() {
    if (!distForm.itemId || !distForm.quantidade) return
    const qtd = parseInt(distForm.quantidade) || 0
    if (qtd <= 0) return
    const item = itens.find(i => i.id === distForm.itemId)
    const disponivel = itensComStatus.find(i => i.id === distForm.itemId)?.disponivel
      ?? itensComStatus.find(i => i.id === distForm.itemId)?.restante
      ?? 0
    if (qtd > disponivel) {
      window.alert(`Só há ${disponivel.toLocaleString()} unidades disponíveis deste material (já descontando reservas).`)
      return
    }
    const coord = coordenadores.find(c => String(c.id) === String(distForm.coordenadorId))
    const responsavel = (coord?.nome || distForm.responsavel || '').trim()
    const next = [...distribuicoes, {
      id: gerarId(),
      itemId: distForm.itemId,
      itemNome: item?.nome || '',
      quantidade: qtd,
      bairro: String(distForm.bairro || '').trim(),
      evento: distForm.evento.trim(),
      responsavel,
      coordenadorId: coord?.id || '',
      coordenadorNome: coord?.nome || '',
      data: new Date().toISOString(),
      registradoPor: usuarioNome,
      registradoPorEmail: usuarioEmail,
    }]
    markLocalEdit()
    writeStorage(DIST_KEY, next)
    setDistribuicoes(next)
    setDistModal(null)
    await flushAfterSave()
    agendarPublicacaoRetirada()
  }

  async function excluirDistribuicao(id) {
    const ok = await confirmAction({
      title: 'Remover saída',
      message: 'Remover este registro de saída? O estoque disponível será recalculado.',
    })
    if (!ok) return
    marcarDistribuicoesRemovidas([id])
    const nextDist = distribuicoes.filter(d => d.id !== id)
    setDistribuicoes(nextDist)
    writeStorage(DIST_KEY, nextDist)
    await flushAfterSave()
    agendarPublicacaoRetirada()
  }

  async function limparOrfas() {
    const orfas = distribuicoes.filter(d => !itens.some(i => i.id === d.itemId))
    if (!orfas.length) return
    const ok = await confirmAction({
      title: 'Limpar saídas órfãs',
      message: `Há ${orfas.length} saída(s) de materiais que já não existem no estoque. Remover esses registros?`,
    })
    if (!ok) return
    marcarDistribuicoesRemovidas(orfas.map(d => d.id))
    const next = distribuicoes.filter(d => itens.some(i => i.id === d.itemId))
    setDistribuicoes(next)
    writeStorage(DIST_KEY, next)
    await flushAfterSave()
    agendarPublicacaoRetirada()
  }

  async function limparHistorico() {
    const movimentos = historico.length
    const retiradasTotal = retiradas.length
    if (movimentos === 0 && retiradasTotal === 0) return
    const ok = await confirmAction({
      title: 'Limpar histórico de materiais',
      message: `Apagar ${movimentos} registro(s) de entradas/saídas${retiradasTotal ? ` e ${retiradasTotal} retirada(s)` : ''}? Os materiais cadastrados permanecem; o estoque será ajustado para o saldo disponível atual. Esta ação é irreversível e sincroniza com a nuvem.`,
      confirmLabel: 'Sim, limpar histórico',
      danger: true,
    })
    if (!ok) return
    const res = await limparHistoricoMateriais()
    if (!res?.synced) {
      window.alert('Histórico apagado neste aparelho, mas a nuvem não confirmou. Verifique a internet e clique em Salvar para sincronizar.')
    }
    skipPersistItens.current = true
    skipPersistDist.current = true
    setItens(res.itens || [])
    setDistribuicoes([])
    setEntradas([])
    setRetiradas([])
    flushAfterSave()
    agendarPublicacaoRetirada()
  }

  async function limparTodosMateriais() {
    const ok = await confirmAction({
      title: 'Limpar todos os dados de Materiais',
      message: 'Apagar estoque, entradas, saídas, retiradas, coordenadores, histórico e configuração do formulário? Esta ação é irreversível e sincroniza com a nuvem.',
      confirmLabel: 'Sim, limpar tudo',
      danger: true,
    })
    if (!ok) return
    const res = await limparTodosDadosMateriais()
    if (!res?.synced) {
      window.alert('Dados apagados neste aparelho, mas a nuvem não confirmou. Verifique a internet e clique em Salvar para sincronizar.')
    }
    skipPersistItens.current = true
    skipPersistDist.current = true
    setItens([])
    setDistribuicoes([])
    setEntradas([])
    setCoordenadores([])
    setRetiradas([])
    setCfg(loadCfg())
    setCatTick(t => t + 1)
    setSubAba('estoque')
  }

  const BAIRROS = BAIRROS_BLUMENAU?.length
    ? BAIRROS_BLUMENAU
    : [
        'Centro', 'Garcia', 'Velha', 'Ponta Aguda', 'Vorstadt', 'Victor Konder',
        'Itoupava Norte', 'Itoupava Central', 'Badenfurt', 'Fortaleza',
        'Progresso', 'Escola Agrícola', 'Água Verde', 'Ribeirão Fresco',
      ]

  return (
    <div className="flex-1 overflow-auto">
      <ModuleWrap className="pb-10 space-y-5">
        <PageHeader
          icon={Package}
          title="Materiais de Campanha"
          subtitle="Estoque, retiradas de coordenadores e saídas"
          actions={
            <>
              <SaveButton variant="ghost" />
              {subAba === 'estoque' && (
                <>
                  {faltantesPadrao.length > 0 && !usuarioOptouPorMateriaisVazio() && (
                    <Button icon={Package} variant="ghost" onClick={cadastrarMateriaisPadrao}>
                      Cadastrar lista ({faltantesPadrao.length})
                    </Button>
                  )}
                  <Button icon={Printer} variant="ghost" onClick={imprimirRelatorioCompleto}>
                    Relatório completo
                  </Button>
                  <Button icon={Printer} variant="ghost" onClick={imprimirEstoque}>Só estoque</Button>
                  <Button icon={Minus} variant="ghost" onClick={() => novaDistribuicao()}>Registrar Saída</Button>
                  <Button icon={Plus} onClick={novoItem}>Novo Material</Button>
                  <Button icon={FileSpreadsheet} variant="ghost" onClick={() => setImportAberto(true)}>
                    Importar planilha
                  </Button>
                </>
              )}
              {subAba === 'retiradas' && (
                <Button
                  icon={Printer}
                  variant="ghost"
                  onClick={() => {
                    const res = imprimirAgendaRetiradas({
                      retiradas,
                      itens,
                      filtroLabel: 'Todas',
                    })
                    if (!res?.ok) window.alert('Permita pop-ups neste site para imprimir o relatório.')
                  }}
                >
                  Imprimir agenda
                </Button>
              )}
              <Button icon={Trash2} variant="danger" onClick={limparTodosMateriais}>
                Limpar tudo
              </Button>
            </>
          }
        />

        <div className="flex flex-wrap gap-2">
          {[
            { id: 'estoque', label: 'Estoque', icon: Package },
            { id: 'coordenadores', label: 'Coordenadores', icon: Users },
            { id: 'retiradas', label: `Retiradas${stats.pendentes ? ` (${stats.pendentes})` : ''}`, icon: ClipboardList },
            { id: 'link', label: 'Link formulário', icon: Link2 },
          ].map(t => {
            const Icon = t.icon
            const ativo = subAba === t.id
            return (
              <button key={t.id} type="button" onClick={() => setSubAba(t.id)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold"
                style={{
                  fontSize: 12,
                  background: ativo ? 'rgba(13,148,136,0.22)' : 'rgba(255,255,255,0.05)',
                  color: ativo ? '#5eead4' : 'var(--text-tertiary)',
                  border: `1px solid ${ativo ? 'rgba(13,148,136,0.4)' : 'transparent'}`,
                }}>
                <Icon size={13} /> {t.label}
              </button>
            )
          })}
        </div>

        {subAba !== 'estoque' ? (
          <MateriaisRetiradaAdmin
            subAba={subAba}
            itens={itens}
            coordenadores={coordenadores}
            setCoordenadores={setCoordenadores}
            retiradas={retiradas}
            setRetiradas={setRetiradas}
            cfg={cfg}
            setCfg={setCfg}
            userEmail={usuarioEmail}
            onEstoqueChange={(dists) => {
              setDistribuicoes(filtrarDistribuicoesRemovidas(dists))
              setEntradas(loadEntradas())
              agendarPublicacaoRetirada()
            }}
          />
        ) : (
        <>
        <KpiStrip
          columns={5}
          items={[
            { label: 'Tipos', value: stats.totalTipos, hint: 'cadastrados' },
            { label: 'Disponível', value: stats.totalDisponivel, gold: true, hint: `de ${stats.totalCadastrado.toLocaleString('pt-BR')} cadastrados` },
            { label: 'Reservado', value: stats.totalReservado, hint: 'aguardando validação' },
            { label: 'Distribuído', value: stats.totalDist, hint: 'saídas confirmadas' },
            { label: 'Alertas', value: stats.alertas, hint: stats.alertas ? 'precisa repor' : 'tudo ok' },
          ]}
        />

        {faltantesPadrao.length > 0 && !usuarioOptouPorMateriaisVazio() && (
          <div className="rounded-2xl px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3"
            style={{ background: 'rgba(13,148,136,0.14)', border: '1px solid rgba(45,212,191,0.35)' }}>
            <div className="flex-1 min-w-0">
              <p className="font-bold" style={{ fontSize: 14, color: '#5eead4' }}>
                Faltam {faltantesPadrao.length} materiais da lista
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                Parachoque, Botton, Perfurado, Parabrisa, Wind banner, Bandeira…
              </p>
            </div>
            <button type="button" onClick={cadastrarMateriaisPadrao}
              className="px-5 py-2.5 rounded-xl font-bold text-white flex-shrink-0"
              style={{ fontSize: 13, background: 'linear-gradient(135deg,#0d9488,#14b8a6)' }}>
              Cadastrar agora
            </button>
          </div>
        )}

        {stats.orfas > 0 && (
          <div className="rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
            style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}>
            <div className="flex-1 min-w-0">
              <p className="font-bold" style={{ fontSize: 13, color: '#fbbf24' }}>
                {stats.orfas} saída(s) de materiais que não existem mais no estoque
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {itens.length === 0
                  ? 'O cadastro de estoque sumiu, mas o histórico ainda tem as saídas. Restaure os materiais a partir desse histórico.'
                  : 'Aparecem como “Item removido” no histórico e inflavam o total distribuído.'}
              </p>
            </div>
            {itens.length === 0 ? (
              <button type="button" onClick={async () => {
                const res = await repararMateriaisEstoqueDoHistorico()
                if (!res?.ok) {
                  const { lista, recuperados } = recuperarEstoqueDeHistorico({
                    estoque: itens,
                    distribuicoes,
                    entradas,
                    retiradas,
                  })
                  if (!recuperados && !lista.length) return
                  desmarcarMateriaisLimposPeloUsuario()
                  writeStorage(STORAGE_KEY, lista, { force: true })
                  setItens(filtrarEstoqueRemovido(lista))
                  await flushAfterSave()
                  agendarPublicacaoRetirada()
                  return
                }
                setItens(readStorage(STORAGE_KEY, []))
              }}
                className="px-4 py-2 rounded-xl font-bold flex-shrink-0"
                style={{ fontSize: 12, background: 'rgba(37,99,235,0.25)', color: '#93c5fd' }}>
                Restaurar estoque
              </button>
            ) : (
              <button type="button" onClick={limparOrfas}
                className="px-4 py-2 rounded-xl font-bold flex-shrink-0"
                style={{ fontSize: 12, background: 'rgba(245,158,11,0.2)', color: '#fbbf24' }}>
                Limpar órfãs
              </button>
            )}
          </div>
        )}

        {itensComStatus.filter(i => i.status !== 'ok').length > 0 && (
          <div className="rounded-3xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <h3 className="font-bold flex items-center gap-2 mb-3" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
              <AlertTriangle size={16} style={{ color: '#f87171' }} /> Alertas de Estoque
            </h3>
            <div className="space-y-2">
              {itensComStatus.filter(i => i.status !== 'ok').map(item => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                  style={item.status === 'esgotado'
                    ? { background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.22)' }
                    : { background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.22)' }}>
                  <AlertTriangle size={14} style={{ color: item.status === 'esgotado' ? '#f87171' : '#fbbf24', flexShrink: 0 }} />
                  <span className="text-sm font-semibold flex-1" style={{ color: 'var(--text-secondary)' }}>{item.nome}</span>
                  <StatusPill status={item.status} />
                  <button type="button" onClick={() => novaDistribuicao(item.id)}
                    className="text-xs font-bold px-2.5 py-1 rounded-lg"
                    style={{ color: '#93c5fd', background: 'rgba(37,99,235,0.15)' }}>
                    Saída
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filtro categorias — sempre mostra as da lista de materiais + as em uso */}
        {itensComStatus.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {['Todas', ...categorias.filter(c =>
              itensComStatus.some(i => i.categoria === c)
              || ['Parachoque', 'Botton', 'Perfurado', 'Parabrisa', 'Wind banner', 'Bandeira', 'Carta'].includes(c),
            )].map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setFiltroCat(c)}
                className="px-3 py-1.5 rounded-xl font-semibold transition-all"
                style={{
                  fontSize: 11,
                  background: filtroCat === c ? 'rgba(37,99,235,0.25)' : 'rgba(255,255,255,0.05)',
                  color: filtroCat === c ? '#93c5fd' : 'var(--text-tertiary)',
                  border: filtroCat === c ? '1px solid rgba(59,130,246,0.4)' : '1px solid transparent',
                }}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {/* Grid de itens */}
        {itensFiltrados.length === 0 ? (
          <div className="rounded-3xl p-10 text-center"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <Package size={48} className="mx-auto mb-4" style={{ color: 'var(--text-faint)' }} />
            <p className="font-bold" style={{ fontSize: 16, color: 'var(--text-tertiary)' }}>
              {itensComStatus.length === 0 ? 'Nenhum material cadastrado' : 'Nenhum item nesta categoria'}
            </p>
            <p className="mt-1" style={{ fontSize: 13, color: 'var(--text-faint)' }}>
              {itensComStatus.length === 0
                ? 'Use “Cadastrar lista” para Parachoque, Botton, Bandeira… ou adicione um a um'
                : 'Troque o filtro acima'}
            </p>
            {itensComStatus.length === 0 && faltantesPadrao.length > 0 && !usuarioOptouPorMateriaisVazio() && (
              <button type="button" onClick={cadastrarMateriaisPadrao}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-white"
                style={{ fontSize: 13, background: 'linear-gradient(135deg,#059669,#10b981)' }}>
                <Package size={14} /> Cadastrar materiais da lista
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {itensFiltrados.map(item => {
              const cor = coresCat[item.categoria] || '#94a3b8'
              const pct = item.quantidade > 0
                ? Math.min(100, Math.round((item.restante / item.quantidade) * 100))
                : 0
              const noForm = item.noFormulario !== false
              return (
                <div key={item.id} className="rounded-3xl overflow-hidden flex flex-col"
                  style={{
                    background: 'var(--bg-surface)',
                    border: `1px solid ${item.status === 'esgotado' ? 'rgba(239,68,68,0.35)' : 'var(--border-subtle)'}`,
                    boxShadow: `0 8px 28px ${cor}10`,
                  }}>
                  <button
                    type="button"
                    onClick={() => item.foto
                      ? setFotoPreview({
                          src: item.foto,
                          nome: item.nome,
                          x: Number(item.fotoX) || 50,
                          y: Number(item.fotoY) || 50,
                          zoom: Number(item.fotoZoom) || 100,
                        })
                      : editarItem(item)}
                    className="relative w-full aspect-[4/3] overflow-hidden group"
                    style={{
                      background: item.foto
                        ? '#020617'
                        : `radial-gradient(ellipse at 30% 20%, ${cor}55, transparent 55%), linear-gradient(160deg, #0f172a, #020617)`,
                    }}
                    title={item.foto ? 'Ampliar foto' : 'Adicionar foto'}
                  >
                    {item.foto ? (
                      <>
                        <FramedCoverPhoto
                          src={item.foto}
                          x={Number(item.fotoX) || 50}
                          y={Number(item.fotoY) || 50}
                          zoom={Number(item.fotoZoom) || 100}
                          alt={item.nome}
                        />
                        <span
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            background: 'linear-gradient(180deg, transparent 55%, rgba(2,6,23,0.55) 100%)',
                          }}
                        />
                        <span
                          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ background: 'rgba(2,6,23,0.28)' }}
                        >
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold"
                            style={{ fontSize: 11, background: 'rgba(15,23,42,0.9)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.12)' }}>
                            <ZoomIn size={14} /> Ver foto
                          </span>
                        </span>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                          style={{ background: `linear-gradient(145deg, ${cor}, ${cor}99)`, boxShadow: `0 8px 22px ${cor}40` }}>
                          <Box size={24} style={{ color: '#fff' }} />
                        </div>
                        <span className="inline-flex items-center gap-1.5 font-semibold"
                          style={{ fontSize: 12, color: 'rgba(226,232,240,0.75)' }}>
                          <ImagePlus size={13} /> Adicionar foto
                        </span>
                      </div>
                    )}
                  </button>

                  <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-start justify-between gap-2 mb-4">
                    <div className="min-w-0">
                      <p className="font-bold truncate" style={{ fontSize: 14, color: 'var(--text-primary)' }}>{item.nome}</p>
                      <span className="inline-flex mt-1 px-2 py-0.5 rounded-full font-bold"
                        style={{ fontSize: 9, background: `${cor}22`, color: cor }}>
                        {item.categoria}
                      </span>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button type="button" onClick={() => toggleNoFormulario(item)} className="p-1.5 rounded-lg hov-srf"
                        title={noForm ? 'Ocultar do formulário' : 'Mostrar no formulário'}>
                        {noForm
                          ? <Eye size={12} style={{ color: '#5eead4' }} />
                          : <EyeOff size={12} style={{ color: 'var(--text-tertiary)' }} />}
                      </button>
                      <button type="button" onClick={() => editarItem(item)} className="p-1.5 rounded-lg hov-srf" title="Editar">
                        <Edit3 size={12} style={{ color: 'var(--text-tertiary)' }} />
                      </button>
                      <button type="button" onClick={() => excluirItem(item.id)} className="p-1.5 rounded-lg hov-srf" title="Excluir">
                        <Trash2 size={12} style={{ color: '#f87171' }} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {[
                      { l: 'Cadastro', v: item.quantidade, c: 'var(--text-secondary)' },
                      { l: 'Saídas', v: item.saido ?? item.distribuido, c: '#67e8f9' },
                      { l: 'Reserv.', v: item.reservado || 0, c: '#fbbf24' },
                      { l: 'Disp.', v: item.disponivel ?? item.restante, c: cor },
                    ].map(cell => (
                      <div key={cell.l} className="rounded-xl px-1.5 py-2 text-center"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <p className="font-black tnum" style={{ fontSize: 14, color: cell.c }}>{Number(cell.v).toLocaleString('pt-BR')}</p>
                        <p style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>{cell.l}</p>
                      </div>
                    ))}
                  </div>

                  <div className="h-2 rounded-full overflow-hidden mb-3" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: item.status === 'esgotado'
                          ? 'linear-gradient(90deg,#ef4444,#dc2626)'
                          : item.status === 'baixo'
                            ? 'linear-gradient(90deg,#f59e0b,#d97706)'
                            : `linear-gradient(90deg, ${cor}99, ${cor})`,
                      }} />
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-auto flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StatusPill status={item.status} />
                      {!noForm && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold"
                          style={{ fontSize: 9, background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>
                          <EyeOff size={9} /> Fora do form
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => abrirEntrada(item)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl font-bold"
                        style={{ fontSize: 11, background: 'rgba(37,99,235,0.15)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.3)' }}>
                        <Plus size={12} /> Entrada
                      </button>
                      <button type="button" onClick={() => novaDistribuicao(item.id)}
                        disabled={(item.disponivel ?? item.restante) <= 0}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl font-bold disabled:opacity-40"
                        style={{ fontSize: 11, background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }}>
                        <Minus size={12} /> Saída
                      </button>
                    </div>
                  </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Histórico — sempre visível */}
        <div className="rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, var(--bg-surface) 40%)',
            border: '1px solid rgba(34,211,238,0.12)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
          }}>
          <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3"
            style={{
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              background: 'linear-gradient(90deg, rgba(6,182,212,0.08), transparent 55%)',
            }}>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: 'linear-gradient(145deg, rgba(6,182,212,0.35), rgba(14,165,233,0.12))',
                  border: '1px solid rgba(34,211,238,0.25)',
                }}>
                <TrendingDown size={18} style={{ color: '#22d3ee' }} />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold tracking-tight" style={{ fontSize: 15, color: 'var(--text-primary)' }}>
                  Histórico de estoque
                </h3>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {historico.length} registro{historico.length !== 1 ? 's' : ''} · entradas e saídas
                  {stats.pendentes > 0 ? ` · ${stats.pendentes} retirada(s) aguardando` : ''}
                </p>
              </div>
            </div>
            <div className="relative w-full sm:w-auto flex flex-wrap gap-2 sm:ml-auto">
              {(historico.length > 0 || retiradas.length > 0) && (
                <button
                  type="button"
                  onClick={limparHistorico}
                  title="Apagar todo o histórico de entradas, saídas e retiradas"
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl flex-shrink-0 font-bold"
                  style={{
                    fontSize: 11,
                    background: 'rgba(239,68,68,0.12)',
                    color: '#fca5a5',
                    border: '1px solid rgba(248,113,113,0.35)',
                  }}
                >
                  <Trash2 size={13} />
                  Limpar histórico
                </button>
              )}
              <button
                type="button"
                onClick={imprimirHistorico}
                title="Imprimir histórico de entradas e saídas"
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl flex-shrink-0 font-bold"
                style={{
                  fontSize: 11,
                  background: 'rgba(212,175,95,0.12)',
                  color: 'var(--gold-bright)',
                  border: '1px solid rgba(212,175,95,0.28)',
                }}
              >
                <Printer size={13} />
                Imprimir
              </button>
              <div className="relative flex-1 min-w-[180px] sm:w-72">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
              <input
                value={buscaDist}
                onChange={e => setBuscaDist(e.target.value)}
                placeholder="Buscar material, quem deu baixa…"
                className="input-dark w-full pl-8 pr-3 py-2.5 rounded-xl"
                style={{ fontSize: 12 }}
              />
              </div>
            </div>
          </div>

          <div className="p-3 sm:p-4 space-y-2.5 max-h-[640px] overflow-y-auto">
            {historico.length === 0 ? (
              <div className="px-5 py-10 text-center space-y-2 rounded-2xl"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)' }}>
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                  Nenhuma movimentação registrada ainda
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                  Use “Entrada”, “Registrar Saída” ou valide uma retirada na aba Retiradas.
                </p>
              </div>
            ) : historico.map(dist => {
                const isEntrada = dist._tipo === 'entrada'
                const item = itens.find(i => i.id === dist.itemId)
                const nome = item?.nome || dist.itemNome || 'Item removido'
                const orfao = !item
                const cor = item ? (coresCat[item.categoria] || '#94a3b8') : (isEntrada ? '#34d399' : '#f87171')
                const quemBaixa = labelUsuarioSistema(dist)
                const temBaixa = quemBaixa && quemBaixa !== '—'
                const quemRetirou = !isEntrada ? labelQuemRetirou(dist) : '—'
                const fotoItem = item?.foto || ''
                return (
                  <div
                    key={`${dist._tipo}-${dist.id}`}
                    className="relative flex gap-3 sm:gap-4 p-3.5 sm:p-4 rounded-2xl transition-colors"
                    style={{
                      background: isEntrada
                        ? 'linear-gradient(135deg, rgba(16,185,129,0.07), rgba(255,255,255,0.02))'
                        : 'linear-gradient(135deg, rgba(239,68,68,0.06), rgba(255,255,255,0.02))',
                      border: `1px solid ${isEntrada ? 'rgba(16,185,129,0.18)' : 'rgba(248,113,113,0.14)'}`,
                    }}
                  >
                    <div
                      className="absolute left-0 top-3 bottom-3 w-1 rounded-full"
                      style={{ background: isEntrada ? '#34d399' : '#f87171' }}
                      aria-hidden
                    />
                    {fotoItem ? (
                      <button
                        type="button"
                        onClick={() => setFotoPreview({
                          src: fotoItem,
                          nome,
                          x: Number(item.fotoX) || 50,
                          y: Number(item.fotoY) || 50,
                          zoom: Number(item.fotoZoom) || 100,
                        })}
                        className="relative w-12 h-12 rounded-2xl overflow-hidden flex-shrink-0 ml-1"
                        style={{ border: '1px solid rgba(255,255,255,0.12)' }}
                        title="Ver foto"
                      >
                        <FramedCoverPhoto
                          src={fotoItem}
                          x={Number(item.fotoX) || 50}
                          y={Number(item.fotoY) || 50}
                          zoom={Number(item.fotoZoom) || 100}
                          alt=""
                        />
                      </button>
                    ) : (
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 font-black ml-1"
                        style={{
                          fontSize: Number(dist.quantidade) >= 1000 ? 10 : 12,
                          color: '#fff',
                          background: isEntrada
                            ? 'linear-gradient(145deg, #34d399, #059669)'
                            : `linear-gradient(145deg, ${cor}, ${cor}99)`,
                          boxShadow: isEntrada
                            ? '0 6px 16px rgba(16,185,129,0.25)'
                            : '0 6px 16px rgba(0,0,0,0.2)',
                        }}
                      >
                        {isEntrada ? '+' : '−'}{Number(dist.quantidade).toLocaleString('pt-BR')}
                      </div>
                    )}

                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold truncate" style={{ fontSize: 14, color: orfao ? '#fca5a5' : 'var(--text-primary)' }}>
                          {nome}
                        </p>
                        <span
                          className="px-2 py-0.5 rounded-md font-bold uppercase tracking-wide"
                          style={{
                            fontSize: 9,
                            letterSpacing: '0.04em',
                            background: isEntrada ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.18)',
                            color: isEntrada ? '#6ee7b7' : '#fca5a5',
                          }}
                        >
                          {isEntrada ? 'Entrada' : 'Saída'}
                        </span>
                        {orfao && (
                          <span className="px-2 py-0.5 rounded-md font-bold"
                            style={{ fontSize: 9, background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                            órfão
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        <div
                          className="flex items-start gap-2 px-2.5 py-2 rounded-xl"
                          style={{
                            background: temBaixa ? 'rgba(234,179,8,0.1)' : 'rgba(148,163,184,0.08)',
                            border: `1px solid ${temBaixa ? 'rgba(234,179,8,0.28)' : 'rgba(148,163,184,0.15)'}`,
                          }}
                          title={dist.registradoPorEmail || ''}
                        >
                          <User size={12} className="mt-0.5 flex-shrink-0" style={{ color: temBaixa ? '#fbbf24' : '#94a3b8' }} />
                          <div className="min-w-0">
                            <p className="font-bold uppercase" style={{ fontSize: 9, letterSpacing: '0.05em', color: temBaixa ? '#fbbf24' : '#94a3b8' }}>
                              {isEntrada ? 'Lançou no sistema' : 'Deu baixa no sistema'}
                            </p>
                            <p className="font-semibold truncate" style={{ fontSize: 12, color: temBaixa ? '#fde68a' : 'var(--text-tertiary)' }}>
                              {temBaixa ? quemBaixa : 'Não registrado (lançamento antigo)'}
                            </p>
                          </div>
                        </div>

                        {!isEntrada && (
                          <div
                            className="flex items-start gap-2 px-2.5 py-2 rounded-xl"
                            style={{
                              background: 'rgba(16,185,129,0.08)',
                              border: '1px solid rgba(16,185,129,0.2)',
                            }}
                          >
                            <Package size={12} className="mt-0.5 flex-shrink-0" style={{ color: '#6ee7b7' }} />
                            <div className="min-w-0">
                              <p className="font-bold uppercase" style={{ fontSize: 9, letterSpacing: '0.05em', color: '#6ee7b7' }}>
                                Retirou / recebeu
                              </p>
                              <p className="font-semibold truncate" style={{ fontSize: 12, color: '#a7f3d0' }}>
                                {quemRetirou}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {(!isEntrada && (dist.bairro || dist.evento)) && (
                        <div className="flex flex-wrap gap-1.5">
                          {dist.bairro && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg"
                              style={{ fontSize: 10, background: 'rgba(59,130,246,0.12)', color: '#93c5fd' }}>
                              <MapPin size={9} /> {dist.bairro}
                            </span>
                          )}
                          {dist.evento && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg"
                              style={{ fontSize: 10, background: 'rgba(139,92,246,0.12)', color: '#c4b5fd' }}>
                              <Route size={9} /> {dist.evento}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end justify-between gap-2 flex-shrink-0">
                      <div className="text-right px-2.5 py-1.5 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <p className="inline-flex items-center gap-1 font-medium" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          <Clock size={11} style={{ color: '#22d3ee' }} />
                          {fmtDataHora(dist.data)}
                        </p>
                        <p className="tnum font-black mt-0.5" style={{ fontSize: 12, color: isEntrada ? '#6ee7b7' : '#fca5a5' }}>
                          {isEntrada ? '+' : '−'}{Number(dist.quantidade).toLocaleString('pt-BR')} un.
                        </p>
                      </div>
                      {!isEntrada && (
                        <button
                          type="button"
                          onClick={() => excluirDistribuicao(dist.id)}
                          className="p-1.5 rounded-lg hov-srf"
                          title="Remover saída"
                          style={{ border: '1px solid rgba(248,113,113,0.2)' }}
                        >
                          <Trash2 size={12} style={{ color: '#f87171' }} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
        </>
        )}
      </ModuleWrap>

      {/* Modal material */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
          <div className="rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: '0 20px 60px rgba(0,0,0,0.45)' }}>
            <div className="px-6 py-4 flex items-center justify-between sticky top-0 z-10"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'var(--bg-surface)' }}>
              <h2 className="font-bold" style={{ fontSize: 18, color: 'var(--text-primary)' }}>
                {modal === 'novo' ? 'Novo Material' : 'Editar Material'}
              </h2>
              <button type="button" onClick={() => setModal(null)} className="p-2 rounded-xl hov-srf">
                <X size={18} style={{ color: 'var(--text-tertiary)' }} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="font-bold block mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Foto do material</label>
                <input
                  ref={fotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onEscolherFoto}
                />
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{ border: '1px solid rgba(255,255,255,0.1)', background: '#020617' }}
                >
                  <button
                    type="button"
                    onClick={() => form.foto
                      ? setFotoAjusteAberto(true)
                      : fotoInputRef.current?.click()}
                    className="relative w-full aspect-[4/3] overflow-hidden"
                    title={form.foto ? 'Ajustar enquadramento' : 'Escolher foto'}
                  >
                    {form.foto ? (
                      <FramedCoverPhoto
                        src={form.foto}
                        x={Number(form.fotoX) || 50}
                        y={Number(form.fotoY) || 50}
                        zoom={Number(form.fotoZoom) || 100}
                        alt=""
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                        style={{ background: 'radial-gradient(ellipse at 40% 30%, rgba(59,130,246,0.18), transparent 60%)' }}>
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                          style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(147,197,253,0.25)' }}>
                          <ImagePlus size={22} style={{ color: '#93c5fd' }} />
                        </div>
                        <span className="font-semibold" style={{ fontSize: 12, color: '#93c5fd' }}>
                          {fotoUploading ? 'Processando…' : 'Clique para adicionar foto'}
                        </span>
                      </div>
                    )}
                  </button>
                  <div className="flex flex-wrap gap-2 p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <button
                      type="button"
                      disabled={fotoUploading}
                      onClick={() => fotoInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-bold disabled:opacity-50"
                      style={{
                        fontSize: 11,
                        background: 'rgba(37,99,235,0.18)',
                        color: '#93c5fd',
                        border: '1px solid rgba(59,130,246,0.35)',
                      }}
                    >
                      <ImagePlus size={13} />
                      {fotoUploading ? 'Processando…' : (form.foto ? 'Trocar' : 'Adicionar')}
                    </button>
                    {form.foto && (
                      <button
                        type="button"
                        onClick={() => setFotoAjusteAberto(true)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-bold"
                        style={{
                          fontSize: 11,
                          background: 'rgba(234,179,8,0.14)',
                          color: '#fbbf24',
                          border: '1px solid rgba(234,179,8,0.3)',
                        }}
                      >
                        <SlidersHorizontal size={13} /> Ajustar
                      </button>
                    )}
                    {form.foto && (
                      <button
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, foto: '', fotoX: 50, fotoY: 50, fotoZoom: 100 }))}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-semibold ml-auto"
                        style={{ fontSize: 11, color: '#f87171', background: 'rgba(239,68,68,0.1)' }}
                      >
                        <Trash2 size={12} /> Remover
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-1.5" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                  Arraste e use o zoom para enquadrar. O recorte é o que aparece no card.
                </p>
              </div>
              <div>
                <label className="font-bold block mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Nome *</label>
                <input value={form.nome} onChange={e => setForm(prev => ({ ...prev, nome: e.target.value }))}
                  className="input-dark w-full px-3 py-2.5" style={{ fontSize: 13 }}
                  placeholder="Ex: Parachoque, Botton…" />
              </div>
              <div>
                <label className="font-bold block mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Categoria</label>
                <select value={form.categoria} onChange={e => setForm(prev => ({ ...prev, categoria: e.target.value }))}
                  className="input-dark w-full px-3 py-2.5" style={{ fontSize: 13 }}>
                  {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="mt-2 flex gap-2">
                  <input
                    value={novaCatNome}
                    onChange={e => setNovaCatNome(e.target.value)}
                    className="input-dark flex-1 px-3 py-2"
                    style={{ fontSize: 12 }}
                    placeholder="Nova categoria…"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); criarCategoriaNoModal() } }}
                  />
                  <button
                    type="button"
                    onClick={criarCategoriaNoModal}
                    className="px-3 py-2 rounded-xl font-bold flex items-center gap-1"
                    style={{ fontSize: 11, background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.35)' }}
                  >
                    <Plus size={12} /> Criar
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Qtd. cadastrada</label>
                  <input type="number" value={form.quantidade} onChange={e => setForm(prev => ({ ...prev, quantidade: e.target.value }))}
                    className="input-dark w-full px-3 py-2.5" style={{ fontSize: 13 }} placeholder="0" min="0" />
                  <p className="mt-1" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                    Pode começar em 0 e usar Entrada depois
                  </p>
                </div>
                <div>
                  <label className="font-bold block mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Estoque mínimo</label>
                  <input type="number" value={form.estoqueMinimo} onChange={e => setForm(prev => ({ ...prev, estoqueMinimo: e.target.value }))}
                    className="input-dark w-full px-3 py-2.5" style={{ fontSize: 13 }} placeholder="0" min="0" />
                </div>
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer px-3 py-2.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <input
                  type="checkbox"
                  checked={form.noFormulario !== false}
                  onChange={e => setForm(prev => ({ ...prev, noFormulario: e.target.checked }))}
                />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Aparecer no formulário de retirada
                </span>
              </label>
            </div>
            <div className="px-6 py-4 flex justify-end gap-3"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button type="button" onClick={() => setModal(null)}
                className="px-5 py-2.5 rounded-xl font-bold hov-srf"
                style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                Cancelar
              </button>
              <button type="button" onClick={salvarItem}
                disabled={!form.nome.trim() || fotoUploading}
                className="px-5 py-2.5 rounded-xl font-bold text-white disabled:opacity-50"
                style={{ fontSize: 13, background: 'linear-gradient(135deg,#059669,#10b981)' }}>
                {fotoUploading ? 'Enviando foto…' : (modal === 'novo' ? 'Cadastrar' : 'Salvar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal saída */}
      {distModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
          <div className="rounded-3xl w-full max-w-md"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: '0 20px 60px rgba(0,0,0,0.45)' }}>
            <div className="px-6 py-4 flex items-center justify-between"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h2 className="font-bold" style={{ fontSize: 18, color: 'var(--text-primary)' }}>Registrar Saída</h2>
              <button type="button" onClick={() => setDistModal(null)} className="p-2 rounded-xl hov-srf">
                <X size={18} style={{ color: 'var(--text-tertiary)' }} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="font-bold block mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Material *</label>
                <select value={distForm.itemId} onChange={e => setDistForm(prev => ({ ...prev, itemId: e.target.value }))}
                  className="input-dark w-full px-3 py-2.5" style={{ fontSize: 13 }}>
                  {itensComStatus.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.nome} — disp. {i.restante.toLocaleString('pt-BR')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Quantidade *</label>
                <input type="number" value={distForm.quantidade} onChange={e => setDistForm(prev => ({ ...prev, quantidade: e.target.value }))}
                  className="input-dark w-full px-3 py-2.5" style={{ fontSize: 13 }} placeholder="0" min="1" />
              </div>
              <div>
                <label className="font-bold block mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Bairro (opcional)</label>
                <select value={distForm.bairro} onChange={e => setDistForm(prev => ({ ...prev, bairro: e.target.value }))}
                  className="input-dark w-full px-3 py-2.5" style={{ fontSize: 13 }}>
                  <option value="">Selecione...</option>
                  {BAIRROS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  Coordenador
                </label>
                <select
                  value={distForm.coordenadorId}
                  onChange={e => {
                    const id = e.target.value
                    const c = coordenadores.find(x => String(x.id) === String(id))
                    setDistForm(prev => ({
                      ...prev,
                      coordenadorId: id,
                      responsavel: c?.nome || (id ? prev.responsavel : prev.responsavel),
                    }))
                  }}
                  className="input-dark w-full px-3 py-2.5"
                  style={{ fontSize: 13 }}
                >
                  <option value="">Selecione o coordenador…</option>
                  {coordenadores
                    .filter(c => c.ativo !== false)
                    .slice()
                    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
                    .map(c => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                </select>
                {coordenadores.filter(c => c.ativo !== false).length === 0 && (
                  <p style={{ fontSize: 11, color: '#fbbf24', marginTop: 6 }}>
                    Nenhum coordenador cadastrado — vá em Coordenadores ou preencha o nome abaixo.
                  </p>
                )}
              </div>
              <div>
                <label className="font-bold block mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  Quem retirou / responsável
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  value={distForm.responsavel}
                  onChange={e => setDistForm(prev => ({ ...prev, responsavel: e.target.value }))}
                  className="input-dark w-full px-3 py-2.5"
                  style={{ fontSize: 13 }}
                  placeholder="Digite o nome da pessoa (campo livre)"
                />
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6 }}>
                  Campo livre — pode escrever qualquer nome, mesmo sem cadastro.
                </p>
                {(coordenadores.filter(c => c.ativo !== false).length > 0 || membros.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {coordenadores
                      .filter(c => c.ativo !== false && c.nome)
                      .slice()
                      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
                      .slice(0, 8)
                      .map(c => (
                        <button
                          key={`coord-${c.id}`}
                          type="button"
                          onClick={() => setDistForm(prev => ({
                            ...prev,
                            responsavel: c.nome,
                            coordenadorId: prev.coordenadorId || String(c.id),
                          }))}
                          className="px-2 py-1 rounded-lg font-semibold"
                          style={{
                            fontSize: 10,
                            background: distForm.responsavel === c.nome ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)',
                            color: distForm.responsavel === c.nome ? '#6ee7b7' : 'var(--text-tertiary)',
                            border: '1px solid rgba(255,255,255,0.08)',
                          }}
                        >
                          {c.nome}
                        </button>
                      ))}
                    {membros
                      .filter(m => m.nome && !coordenadores.some(c => String(c.nome).toLowerCase() === String(m.nome).toLowerCase()))
                      .slice(0, 6)
                      .map(m => (
                        <button
                          key={`mem-${m.id}`}
                          type="button"
                          onClick={() => setDistForm(prev => ({ ...prev, responsavel: m.nome }))}
                          className="px-2 py-1 rounded-lg font-semibold"
                          style={{
                            fontSize: 10,
                            background: distForm.responsavel === m.nome ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                            color: distForm.responsavel === m.nome ? '#93c5fd' : 'var(--text-faint)',
                            border: '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          {m.nome}
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <div>
                <label className="font-bold block mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  Evento / rota / local
                </label>
                <input value={distForm.evento} onChange={e => setDistForm(prev => ({ ...prev, evento: e.target.value }))}
                  className="input-dark w-full px-3 py-2.5" style={{ fontSize: 13 }}
                  placeholder="Ex: Caminhada no Garcia, Rota 24/07…" />
              </div>
            </div>
            <div className="px-6 py-4 flex justify-end gap-3"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button type="button" onClick={() => setDistModal(null)}
                className="px-5 py-2.5 rounded-xl font-bold hov-srf"
                style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                Cancelar
              </button>
              <button type="button" onClick={salvarDistribuicao}
                disabled={!distForm.itemId || !distForm.quantidade}
                className="px-5 py-2.5 rounded-xl font-bold text-white disabled:opacity-50"
                style={{ fontSize: 13, background: 'linear-gradient(135deg,#059669,#10b981)' }}>
                Registrar Saída
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal entrada (soma cadastro) */}
      {entradaModal && (() => {
        const itemLive = itens.find(i => i.id === entradaModal.id) || entradaModal
        const cadastroAtual = Number(itemLive.quantidade) || 0
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
          <div className="rounded-3xl w-full max-w-md"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: '0 20px 60px rgba(0,0,0,0.45)' }}>
            <div className="px-6 py-4 flex items-center justify-between"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <h2 className="font-bold" style={{ fontSize: 18, color: 'var(--text-primary)' }}>Entrada de estoque</h2>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{itemLive.nome}</p>
              </div>
              <button type="button" onClick={() => setEntradaModal(null)} className="p-2 rounded-xl hov-srf">
                <X size={18} style={{ color: 'var(--text-tertiary)' }} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="rounded-2xl px-4 py-3"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Cadastro atual</p>
                <p className="font-black tnum" style={{ fontSize: 22, color: 'var(--text-primary)' }}>
                  {cadastroAtual.toLocaleString('pt-BR')}
                </p>
              </div>
              <div>
                <label className="font-bold block mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  Quantidade que entrou *
                </label>
                <input
                  type="number"
                  autoFocus
                  value={entradaQtd}
                  onChange={e => setEntradaQtd(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && salvarEntrada()}
                  className="input-dark w-full px-3 py-2.5"
                  style={{ fontSize: 13 }}
                  placeholder="Ex: 3000"
                  min="1"
                />
                <p className="mt-1.5" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                  Soma ao cadastro. Pode lançar várias vezes.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 flex flex-wrap justify-between gap-3"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button type="button" onClick={confirmarZerarEntrada}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold"
                style={{ fontSize: 12, background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
                <RotateCcw size={13} /> Zerar cadastro
              </button>
              <div className="flex gap-2 ml-auto">
                <button type="button" onClick={() => setEntradaModal(null)}
                  className="px-5 py-2.5 rounded-xl font-bold hov-srf"
                  style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                  Cancelar
                </button>
                <button type="button" onClick={() => salvarEntrada()}
                  disabled={!entradaQtd || parseInt(entradaQtd, 10) <= 0}
                  className="px-5 py-2.5 rounded-xl font-bold text-white disabled:opacity-50"
                  style={{ fontSize: 13, background: 'linear-gradient(135deg,#2563eb,#3b82f6)' }}>
                  Somar entrada
                </button>
              </div>
            </div>
          </div>
        </div>
        )
      })()}

      {fotoPreview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(2,6,23,0.88)', backdropFilter: 'blur(10px)' }}
          onClick={() => setFotoPreview(null)}
          role="presentation"
        >
          <div
            className="relative w-full max-w-lg rounded-3xl overflow-hidden"
            style={{ background: '#020617', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 80px rgba(0,0,0,0.55)' }}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-label={`Foto de ${fotoPreview.nome}`}
          >
            <div className="px-4 py-3 flex items-center justify-between"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="font-bold truncate pr-2" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                {fotoPreview.nome}
              </p>
              <button type="button" onClick={() => setFotoPreview(null)} className="p-2 rounded-xl hov-srf">
                <X size={18} style={{ color: 'var(--text-tertiary)' }} />
              </button>
            </div>
            <div className="relative w-full aspect-[4/3] overflow-hidden">
              <FramedCoverPhoto
                src={fotoPreview.src}
                x={Number(fotoPreview.x) || 50}
                y={Number(fotoPreview.y) || 50}
                zoom={Number(fotoPreview.zoom) || 100}
                alt={fotoPreview.nome}
              />
            </div>
          </div>
        </div>
      )}

      <ImagePositionEditor
        open={fotoAjusteAberto && !!form.foto}
        src={form.foto || ''}
        x={Number(form.fotoX) || 50}
        y={Number(form.fotoY) || 50}
        zoom={Number(form.fotoZoom) || 100}
        aspect="card"
        title="Enquadrar foto do material"
        onCancel={() => setFotoAjusteAberto(false)}
        onConfirm={({ x, y, zoom }) => {
          setForm(prev => ({ ...prev, fotoX: x, fotoY: y, fotoZoom: zoom }))
          setFotoAjusteAberto(false)
        }}
      />

      <MateriaisImportEntradas
        aberto={importAberto}
        onFechar={() => setImportAberto(false)}
        itens={itens}
        usuarioNome={usuarioNome}
        usuarioEmail={usuarioEmail}
        onAplicado={aoImportarEntradas}
      />
    </div>
  )
}
