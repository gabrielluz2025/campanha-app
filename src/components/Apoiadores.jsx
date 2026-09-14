import { useState, useEffect, useMemo } from 'react'
import {
  UserPlus, Users, Search, Trash2, Edit3, X, Phone, MapPin,
  MessageSquare, Plus, UserCheck, RefreshCw, Copy,
  SlidersHorizontal, Globe, Heart, Shield, Award, ExternalLink,
  MessageCircle, History, Check, Radio, ArrowRightLeft, Eye,
  UserPlus2, Percent, MousePointerClick, Link2,
} from 'lucide-react'
import { confirmAction } from '../utils/confirm'
import SaveButton from './SaveButton'
import { flushAfterSave, writeStorage, readStorage } from '../utils/persist'
import { PageHeader, ModuleWrap, KpiStrip, Button, EmptyState, Card, IconBadge } from './ui'
import { sincronizarApoiadoresDaEquipe, sincronizarFormularioNaEquipe, APOIADORES_KEY, VOTOS_POR_APOIADOR, normalizarListaApoiadores, excluirPessoaCompleta } from '../utils/apoiadoresSync'
import { EQUIPE_PREVISAO_EVENT } from '../utils/equipeSync'
import { supabase, usePhpSync } from '../lib/supabase'
import { getStoredTenantId, getLeadFormLink, updateLeadFormLink } from '../lib/tenant'
import { pullAll, SYNC_EVENT, mergeApoiadoresLista } from '../lib/cloudSync'
import LeadFormBuilder from './LeadFormBuilder'
import { normalizeLeadFormConfig } from '../utils/leadFormConfig'
import { formatTelefoneInput, formatDataBrInput } from '../utils/telefoneBr'

const NIVEIS = {
  simpatizante: { label: 'Simpatizante', cor: '#3b82f6', icon: Heart },
  apoiador: { label: 'Apoiador', cor: '#10b981', icon: UserCheck },
  cabo_eleitoral: { label: 'Cabo Eleitoral', cor: '#f59e0b', icon: Shield },
  lider: { label: 'Líder Comunitário', cor: '#06b6d4', icon: Award },
}

const BAIRROS = [
  'Centro', 'Garcia', 'Velha', 'Ponta Aguda', 'Vorstadt', 'Victor Konder',
  'Itoupava Norte', 'Itoupava Central', 'Badenfurt', 'Fortaleza',
  'Progresso', 'Escola Agrícola', 'Água Verde', 'Ribeirão Fresco',
  'Salto Norte', 'Itoupavazinha', 'Vila Nova', 'Fidélis', 'Testo Salto',
]

const STORAGE_KEY = APOIADORES_KEY
const INTERACOES_KEY = 'apoiadores_interacoes'

function gerarId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }

function waHref(tel) {
  const d = String(tel || '').replace(/\D/g, '')
  if (d.length < 10) return null
  const full = d.startsWith('55') ? d : `55${d}`
  return `https://wa.me/${full}`
}

function iniciais(nome) {
  return String(nome || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'
}

/** Lead do formulário público = Comunidade WhatsApp (não mistura com a rede de apoiadores). */
function ehComunidadeForm(ap) {
  if (!ap) return false
  if (ap.origem === 'cadastro_publico') return true
  return String(ap.id || '').startsWith('lead-')
}

function querCanalWhatsapp(ap) {
  const ints = Array.isArray(ap?.interesses) ? ap.interesses : []
  return ints.some(i => {
    const s = String(i || '').toLowerCase()
    return s.includes('canal') || s.includes('comunidade') || s.includes('whatsapp')
  })
}

const TIPO_INTER = {
  contato: { label: 'Contato', cor: '#3b82f6' },
  visita: { label: 'Visita', cor: '#10b981' },
  evento: { label: 'Evento', cor: '#f59e0b' },
  material: { label: 'Material', cor: '#06b6d4' },
  indicacao: { label: 'Indicação', cor: '#ec4899' },
  outro: { label: 'Outro', cor: '#94a3b8' },
}

function reloadApoiadoresFromStorage({ gravarEquipe = false } = {}) {
  const sync = sincronizarApoiadoresDaEquipe({ gravar: gravarEquipe })
  const lista = normalizarListaApoiadores(sync.lista, { persist: true })
  // Quem veio do formulário entra na pirâmide da Equipe (cargo Apoiador)
  sincronizarFormularioNaEquipe({ gravar: true })
  return lista
}

const FORM_VAZIO = {
  nome: '',
  telefone: '',
  email: '',
  cidade: '',
  bairro: '',
  dataNascimento: '',
  profissao: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  nivel: 'simpatizante',
  votosEstimados: VOTOS_POR_APOIADOR,
  observacao: '',
}

export default function Apoiadores() {
  const [apoiadores, setApoiadores] = useState(() => reloadApoiadoresFromStorage({ gravarEquipe: true }))
  const [interacoes, setInteracoes] = useState(() => JSON.parse(localStorage.getItem(INTERACOES_KEY) || '{}'))
  const [modal, setModal] = useState(null)
  const [interModal, setInterModal] = useState(null)
  const [detalheId, setDetalheId] = useState(null)
  const [busca, setBusca] = useState('')
  const [filtroNivel, setFiltroNivel] = useState('Todos')
  const [filtroBairro, setFiltroBairro] = useState('Todos')
  const [filtroOrigem, setFiltroOrigem] = useState('Todos')
  const [abaLista, setAbaLista] = useState('rede') // rede | comunidade
  const [form, setForm] = useState({ ...FORM_VAZIO })
  const [interForm, setInterForm] = useState({ tipo: 'contato', descricao: '' })
  const [syncMsg, setSyncMsg] = useState('')
  const [linkMsg, setLinkMsg] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  const [pullBusy, setPullBusy] = useState(false)
  const [leadUrl, setLeadUrl] = useState('')
  const [leadSlug, setLeadSlug] = useState('')
  const [waCampanha, setWaCampanha] = useState('')
  const [leadConfig, setLeadConfig] = useState(null)
  const [leadStats, setLeadStats] = useState(null)
  const [funilPeriodo, setFunilPeriodo] = useState('7d') // hoje | 7d | 30d | total
  const [funilSerieMetric, setFunilSerieMetric] = useState('views') // views | cadastros | canal | envios
  const [builderOpen, setBuilderOpen] = useState(false)
  const phpSync = usePhpSync()

  function aplicarLeadLink(res) {
    if (!res) return
    setLeadUrl(res.url || '')
    setLeadSlug(res.slug || '')
    setWaCampanha(res.whatsapp || '')
    if (res.config) setLeadConfig(normalizeLeadFormConfig(res.config))
    if (res.stats) setLeadStats(res.stats)
  }

  useEffect(() => { writeStorage(STORAGE_KEY, apoiadores) }, [apoiadores])
  useEffect(() => { writeStorage(INTERACOES_KEY, interacoes) }, [interacoes])

  async function puxarCadastrosPublicos({ silent = false } = {}) {
    if (!phpSync) return
    setPullBusy(true)
    try {
      const before = readStorage(STORAGE_KEY, [])
      const beforeIds = new Set((Array.isArray(before) ? before : []).map(a => a?.id).filter(Boolean))
      await pullAll(getStoredTenantId() || 'local')
      const afterRaw = localStorage.getItem(STORAGE_KEY)
      const mergedStr = mergeApoiadoresLista(JSON.stringify(before), afterRaw)
      writeStorage(STORAGE_KEY, JSON.parse(mergedStr))
      const lista = reloadApoiadoresFromStorage()
      setApoiadores(lista)
      const novos = lista.filter(a => ehComunidadeForm(a) && !beforeIds.has(a.id)).length
      const doSite = lista.filter(a => ehComunidadeForm(a)).length
      if (!silent) {
        if (novos > 0 || doSite > 0) setAbaLista('comunidade')
        setSyncMsg(
          novos > 0
            ? `${novos} novo(s) na Comunidade WhatsApp · ${doSite} no total pelo formulário`
            : doSite > 0
              ? `Comunidade atualizada · ${doSite} cadastro(s) do formulário`
              : 'Nenhum cadastro novo do formulário por enquanto',
        )
        setTimeout(() => setSyncMsg(''), 5000)
      }
      await flushAfterSave()
      await atualizarStatsFormulario()
    } catch (e) {
      if (!silent) {
        setSyncMsg(e.message || 'Falha ao buscar cadastros do formulário')
        setTimeout(() => setSyncMsg(''), 4000)
      }
    } finally {
      setPullBusy(false)
    }
  }

  // Cadastros públicos já vêm no pullAll do login — não repetir pull completo ao abrir a aba.
  useEffect(() => {
    if (!phpSync) return
    if (sessionStorage.getItem('apoiadores_pull_v1')) return
    sessionStorage.setItem('apoiadores_pull_v1', '1')
    puxarCadastrosPublicos({ silent: true })
  }, [phpSync])

  useEffect(() => {
    function onSync(ev) {
      if (!ev.detail?.fromServer) return
      setApoiadores(reloadApoiadoresFromStorage())
      setInteracoes(JSON.parse(localStorage.getItem(INTERACOES_KEY) || '{}'))
    }
    window.addEventListener(SYNC_EVENT, onSync)
    return () => window.removeEventListener(SYNC_EVENT, onSync)
  }, [])

  useEffect(() => {
    if (!phpSync) return
    let cancel = false
    ;(async () => {
      try {
        if (!supabase) return
        const { data: { session } } = await supabase.auth.getSession()
        const tid = getStoredTenantId()
        if (!session?.access_token || !tid) return
        const res = await getLeadFormLink(session.access_token, tid)
        if (!cancel) aplicarLeadLink(res)
      } catch { /* ignore */ }
    })()
    return () => { cancel = true }
  }, [phpSync])

  async function copiarLinkCadastro() {
    if (!phpSync || !supabase) {
      setLinkMsg('Cadastro público disponível só na versão online.')
      setTimeout(() => setLinkMsg(''), 3500)
      return
    }
    setLinkBusy(true)
    setLinkMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const tid = getStoredTenantId()
      if (!session?.access_token || !tid) throw new Error('Faça login na campanha.')
      const res = await getLeadFormLink(session.access_token, tid)
      aplicarLeadLink(res)
      const url = res.url || ''
      if (!url) throw new Error('Não foi possível gerar o link.')
      await navigator.clipboard.writeText(url)
      setLinkMsg('Link copiado! Cole no WhatsApp, Instagram ou QR Code.')
      setTimeout(() => setLinkMsg(''), 4500)
    } catch (e) {
      setLinkMsg(e.message || 'Falha ao copiar link.')
      setTimeout(() => setLinkMsg(''), 4000)
    } finally {
      setLinkBusy(false)
    }
  }

  async function salvarSlugCampanha() {
    if (!phpSync || !supabase) return
    const clean = String(leadSlug || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
    if (clean.length < 3) {
      setLinkMsg('O link curto precisa ter pelo menos 3 caracteres (ex: ismael).')
      setTimeout(() => setLinkMsg(''), 3500)
      return
    }
    setLinkBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const tid = getStoredTenantId()
      if (!session?.access_token || !tid) throw new Error('Faça login na campanha.')
      const res = await updateLeadFormLink(session.access_token, tid, { slug: clean })
      aplicarLeadLink(res)
      setLinkMsg(`Link atualizado: ${res.url}`)
      setTimeout(() => setLinkMsg(''), 4500)
    } catch (e) {
      setLinkMsg(e.message || 'Falha ao salvar link curto.')
      setTimeout(() => setLinkMsg(''), 4000)
    } finally {
      setLinkBusy(false)
    }
  }

  async function salvarWhatsAppCampanha() {
    if (!phpSync || !supabase) return
    setLinkBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const tid = getStoredTenantId()
      if (!session?.access_token || !tid) throw new Error('Faça login na campanha.')
      const digits = String(waCampanha || '').replace(/\D/g, '').slice(0, 13)
      const res = await updateLeadFormLink(session.access_token, tid, { whatsapp: digits })
      aplicarLeadLink({ ...res, whatsapp: res.whatsapp || '' })
      setLinkMsg(digits ? 'WhatsApp da campanha salvo.' : 'WhatsApp da campanha removido.')
      setTimeout(() => setLinkMsg(''), 3500)
    } catch (e) {
      setLinkMsg(e.message || 'Falha ao salvar WhatsApp.')
      setTimeout(() => setLinkMsg(''), 4000)
    } finally {
      setLinkBusy(false)
    }
  }

  async function removerWhatsAppCampanha() {
    if (!phpSync || !supabase) return
    const ok = await confirmAction({
      title: 'Remover WhatsApp',
      message: 'Remover o WhatsApp da campanha do formulário público? O botão de contato após o cadastro deixará de aparecer.',
    })
    if (!ok) return
    setWaCampanha('')
    setLinkBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const tid = getStoredTenantId()
      if (!session?.access_token || !tid) throw new Error('Faça login na campanha.')
      const res = await updateLeadFormLink(session.access_token, tid, { whatsapp: '' })
      aplicarLeadLink(res)
      setLinkMsg('WhatsApp da campanha removido.')
      setTimeout(() => setLinkMsg(''), 3500)
    } catch (e) {
      setLinkMsg(e.message || 'Falha ao remover WhatsApp.')
      setTimeout(() => setLinkMsg(''), 4000)
    } finally {
      setLinkBusy(false)
    }
  }

  async function salvarConfigFormulario(config) {
    if (!supabase) throw new Error('Faça login.')
    const { data: { session } } = await supabase.auth.getSession()
    const tid = getStoredTenantId()
    if (!session?.access_token || !tid) throw new Error('Faça login na campanha.')
    const res = await updateLeadFormLink(session.access_token, tid, {
      config,
      titulo: config.titulo,
      whatsapp: waCampanha || undefined,
    })
    aplicarLeadLink({ ...res, config: res.config || config })
    setLinkMsg('Formulário público atualizado!')
    setTimeout(() => setLinkMsg(''), 4000)
  }

  async function atualizarStatsFormulario() {
    if (!phpSync || !supabase) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const tid = getStoredTenantId()
      if (!session?.access_token || !tid) return
      const res = await getLeadFormLink(session.access_token, tid)
      if (res?.stats) setLeadStats(res.stats)
      if (res?.url) setLeadUrl(res.url)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    function onEquipeSync() {
      const { lista, imported, updated } = sincronizarApoiadoresDaEquipe({ gravar: true })
      setApoiadores(lista)
      if (imported > 0 || updated > 0) {
        setSyncMsg(`${imported} importado(s) da Equipe` + (updated ? ` · ${updated} atualizado(s)` : ''))
        setTimeout(() => setSyncMsg(''), 4000)
      }
    }
    window.addEventListener(EQUIPE_PREVISAO_EVENT, onEquipeSync)
    window.addEventListener('storage', onEquipeSync)
    return () => {
      window.removeEventListener(EQUIPE_PREVISAO_EVENT, onEquipeSync)
      window.removeEventListener('storage', onEquipeSync)
    }
  }, [])

  function sincronizarAgora() {
    const { lista, imported, updated, totalEquipe } = sincronizarApoiadoresDaEquipe({ gravar: true })
    setApoiadores(lista)
    setSyncMsg(
      totalEquipe === 0
        ? 'Nenhum Apoiador na Equipe para importar'
        : `Sincronizado · ${imported} novo(s) · ${updated} atualizado(s) · ${totalEquipe} na Equipe`
    )
    setTimeout(() => setSyncMsg(''), 4500)
    flushAfterSave()
  }

  const stats = useMemo(() => {
    const rede = apoiadores.filter(a => !ehComunidadeForm(a))
    const comunidade = apoiadores.filter(a => ehComunidadeForm(a))
    const base = abaLista === 'comunidade' ? comunidade : rede
    const porNivel = {}
    Object.keys(NIVEIS).forEach(n => { porNivel[n] = base.filter(a => a.nivel === n).length })
    const bairrosAtivos = new Set(base.map(a => a.bairro).filter(Boolean)).size
    const comCanal = comunidade.filter(querCanalWhatsapp).length
    const votosPrevistos = rede.reduce((s, a) => {
      const n = Number(a.votosEstimados)
      return s + (Number.isFinite(n) && n > 0 ? Math.min(VOTOS_POR_APOIADOR, n) : VOTOS_POR_APOIADOR)
    }, 0)
    const agora = Date.now()
    const inicioHoje = new Date()
    inicioHoje.setHours(0, 0, 0, 0)
    const tsCriado = (a) => {
      const t = Date.parse(a.criadoEm || a.atualizadoEm || '')
      return Number.isFinite(t) ? t : 0
    }
    const formHoje = comunidade.filter(a => tsCriado(a) >= inicioHoje.getTime()).length
    const form7d = comunidade.filter(a => tsCriado(a) >= agora - 7 * 86400000).length
    return {
      total: base.length,
      totalRede: rede.length,
      totalComunidade: comunidade.length,
      porNivel,
      bairrosAtivos,
      doFormulario: comunidade.length,
      comCanal,
      votosPrevistos,
      formHoje,
      form7d,
    }
  }, [apoiadores, abaLista])

  const funilPeriodoOpts = [
    { id: 'hoje', label: 'Hoje' },
    { id: '7d', label: '7 dias' },
    { id: '30d', label: '30 dias' },
    { id: 'total', label: 'Tudo' },
  ]

  const funilPeriodoData = useMemo(() => {
    const p = leadStats?.periodos?.[funilPeriodo]
    if (p) return p
    // fallback enquanto stats não carregam
    if (funilPeriodo === 'hoje') {
      return {
        views: leadStats?.viewsHoje ?? 0,
        cadastros: stats.formHoje,
        canal: leadStats?.canalClicksHoje ?? 0,
        envios: leadStats?.enviosHoje ?? 0,
        conversaoPct: null,
        canalConversaoPct: null,
      }
    }
    if (funilPeriodo === '7d') {
      return {
        views: leadStats?.views7d ?? 0,
        cadastros: leadStats?.cadastros7d ?? stats.form7d,
        canal: leadStats?.canalClicks7d ?? 0,
        envios: leadStats?.envios7d ?? 0,
        conversaoPct: null,
        canalConversaoPct: null,
      }
    }
    if (funilPeriodo === '30d') {
      return {
        views: leadStats?.views30d ?? 0,
        cadastros: leadStats?.cadastros30d ?? 0,
        canal: leadStats?.canalClicks30d ?? 0,
        envios: leadStats?.envios30d ?? 0,
        conversaoPct: null,
        canalConversaoPct: null,
      }
    }
    return {
      views: leadStats?.viewsTotal ?? 0,
      cadastros: leadStats?.cadastros ?? stats.totalComunidade,
      canal: leadStats?.canalClicks ?? 0,
      envios: leadStats?.enviosTotal ?? 0,
      conversaoPct: leadStats?.conversaoPct ?? null,
      canalConversaoPct: leadStats?.canalConversaoPct ?? null,
    }
  }, [leadStats, funilPeriodo, stats])

  const funilSerie = useMemo(() => {
    const raw = Array.isArray(leadStats?.serie) ? leadStats.serie : []
    if (funilPeriodo === 'hoje') return raw.slice(-1)
    if (funilPeriodo === '7d') return raw.slice(-7)
    if (funilPeriodo === '30d') return raw
    return raw
  }, [leadStats, funilPeriodo])

  const funilSerieMax = useMemo(() => {
    const key = funilSerieMetric
    let max = 0
    for (const d of funilSerie) {
      const v = Number(d?.[key] || 0)
      if (v > max) max = v
    }
    return Math.max(max, 1)
  }, [funilSerie, funilSerieMetric])

  const filtered = useMemo(() => {
    let lista = apoiadores.filter(a =>
      abaLista === 'comunidade' ? ehComunidadeForm(a) : !ehComunidadeForm(a)
    )
    if (busca) {
      const q = busca.toLowerCase()
      lista = lista.filter(a =>
        a.nome.toLowerCase().includes(q)
        || a.telefone.includes(q)
        || (a.bairro || '').toLowerCase().includes(q)
        || (a.cidade || '').toLowerCase().includes(q)
        || (a.email || '').toLowerCase().includes(q)
      )
    }
    if (filtroNivel !== 'Todos') lista = lista.filter(a => a.nivel === filtroNivel)
    if (filtroBairro !== 'Todos') lista = lista.filter(a => a.bairro === filtroBairro)
    if (abaLista === 'rede') {
      if (filtroOrigem === 'equipe') lista = lista.filter(a => a.origem === 'equipe')
      if (filtroOrigem === 'manual') lista = lista.filter(a => a.origem !== 'equipe')
    }
    return lista
  }, [apoiadores, busca, filtroNivel, filtroBairro, filtroOrigem, abaLista])

  function promoverParaRede(ap) {
    if (!ap?.id) return
    setApoiadores(prev => prev.map(a =>
      a.id === ap.id
        ? {
            ...a,
            origem: 'manual',
            nivel: a.nivel === 'simpatizante' ? 'apoiador' : a.nivel,
            observacao: [a.observacao, 'Promovido da Comunidade WhatsApp'].filter(Boolean).join(' · '),
          }
        : a
    ))
    flushAfterSave()
    setSyncMsg(`${ap.nome.split(' ')[0]} movido para a rede de apoiadores`)
    setTimeout(() => setSyncMsg(''), 3500)
  }

  const bairrosFiltro = useMemo(
    () => [...new Set([...BAIRROS, ...apoiadores.map(a => a.bairro).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [apoiadores],
  )
  const bairrosModal = useMemo(
    () => [...new Set([...BAIRROS, form.bairro].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [form.bairro],
  )

  function novoApoiador() {
    setForm({ ...FORM_VAZIO })
    setModal('novo')
  }

  function editarApoiador(ap) {
    setForm({
      nome: ap.nome || '',
      telefone: ap.telefone || '',
      email: ap.email || '',
      cidade: ap.cidade || '',
      bairro: ap.bairro || '',
      dataNascimento: ap.dataNascimento || '',
      profissao: ap.profissao || '',
      cep: ap.cep || '',
      logradouro: ap.logradouro || '',
      numero: ap.numero || '',
      complemento: ap.complemento || '',
      nivel: ap.nivel || 'simpatizante',
      votosEstimados: Number(ap.votosEstimados) > 0 ? Number(ap.votosEstimados) : VOTOS_POR_APOIADOR,
      observacao: ap.observacao || '',
    })
    setModal(ap.id)
  }

  function salvarApoiador() {
    if (!form.nome.trim()) return
    const bairro = form.bairro.trim() || 'A definir'
    const votosEstimados = Math.min(
      VOTOS_POR_APOIADOR,
      Math.max(1, Number(form.votosEstimados) || VOTOS_POR_APOIADOR),
    )
    const payload = {
      ...form,
      bairro,
      votosEstimados,
      nome: form.nome.trim(),
      telefone: form.telefone.trim(),
      email: (form.email || '').trim(),
      cidade: (form.cidade || '').trim(),
    }
    if (modal === 'novo') {
      setApoiadores(prev => [{
        id: gerarId(),
        ...payload,
        origem: 'manual',
        criadoEm: new Date().toISOString(),
      }, ...prev])
    } else {
      setApoiadores(prev => prev.map(a => a.id === modal ? { ...a, ...payload } : a))
    }
    setModal(null)
    flushAfterSave()
  }

  async function excluirApoiador(id) {
    const ap = apoiadores.find(a => a.id === id)
    const ok = await confirmAction({
      title: 'Excluir apoiador',
      message: `Excluir ${ap?.nome || 'este apoiador'} e todo o histórico de interações? Esta ação não pode ser desfeita.`,
    })
    if (!ok) return
    const nextInteracoes = { ...interacoes }
    delete nextInteracoes[id]
    setInteracoes(nextInteracoes)
    writeStorage(INTERACOES_KEY, nextInteracoes)

    const { apoiadores: lista } = excluirPessoaCompleta(
      { id, telefone: ap?.telefone },
      { flush: false },
    )
    setApoiadores(normalizarListaApoiadores(lista, { persist: false }))
    await flushAfterSave()
    setSyncMsg('Excluído e sincronizado — não deve voltar no sync.')
    setTimeout(() => setSyncMsg(''), 4000)
  }

  function abrirInteracao(id) {
    setInterForm({ tipo: 'contato', descricao: '' })
    setInterModal(id)
  }

  function salvarInteracao() {
    if (!interForm.descricao.trim()) return
    const nova = { id: gerarId(), ...interForm, data: new Date().toISOString() }
    setInteracoes(prev => ({
      ...prev,
      [interModal]: [...(prev[interModal] || []), nova]
    }))
    setInterModal(null)
    flushAfterSave()
  }

  const detalheAp = apoiadores.find(a => a.id === detalheId)
  const detalheInter = interacoes[detalheId] || []

  return (
    <div className="flex-1 overflow-auto">
      <ModuleWrap className="pb-10">
        <PageHeader
          eyebrow="Rede eleitoral"
          icon={Users}
          title="Apoiadores"
          subtitle="Cadastros do formulário público, da Equipe e manuais — com histórico de contato"
          actions={
            <>
              {phpSync && (
                <Button icon={SlidersHorizontal} variant="ghost" onClick={() => setBuilderOpen(true)}>
                  Formulário
                </Button>
              )}
              <Button icon={RefreshCw} variant="ghost" onClick={sincronizarAgora}>
                Sync Equipe
              </Button>
              <SaveButton variant="ghost" />
              <Button icon={UserPlus} onClick={novoApoiador}>Novo apoiador</Button>
            </>
          }
        />

        {phpSync && (
          <Card className="mb-5 p-0 overflow-hidden">
            {/* Cabeçalho */}
            <div
              className="relative px-5 py-5 sm:px-6 overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(21,128,61,0.16) 0%, rgba(212,175,95,0.08) 48%, rgba(15,23,42,0.4) 100%)',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <div
                className="pointer-events-none absolute -right-8 -top-10 w-40 h-40 rounded-full opacity-30"
                style={{ background: 'radial-gradient(circle, rgba(34,197,94,0.45), transparent 70%)' }}
              />
              <div className="relative flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3.5 min-w-0">
                  <IconBadge icon={Globe} from="#15803d" to="#22c55e" soft size={42} />
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#4ade80' }}>
                      Formulário público
                    </p>
                    <h3 className="font-black txt-1 text-lg leading-tight mt-0.5">Prospecção & comunidade</h3>
                    <p className="text-xs txt-3 mt-1.5 max-w-xl leading-relaxed">
                      Acompanhe quem abriu o link, se cadastrou e entrou no canal do WhatsApp.
                      Cadastros novos ficam em <span className="font-semibold" style={{ color: '#4ade80' }}>Comunidade WhatsApp</span>.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    icon={SlidersHorizontal}
                    variant="ghost"
                    onClick={() => setBuilderOpen(true)}
                  >
                    Editar formulário
                  </Button>
                  <Button
                    icon={RefreshCw}
                    onClick={() => puxarCadastrosPublicos()}
                    disabled={pullBusy}
                  >
                    {pullBusy ? 'Atualizando…' : 'Atualizar dados'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Funil de métricas */}
            <div className="px-5 sm:px-6 py-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] txt-3">Acompanhamento</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <div
                    className="inline-flex rounded-xl p-0.5 gap-0.5"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)' }}
                  >
                    {funilPeriodoOpts.map(opt => {
                      const on = funilPeriodo === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setFunilPeriodo(opt.id)}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors"
                          style={{
                            background: on ? 'rgba(212,175,95,0.22)' : 'transparent',
                            color: on ? 'var(--gold-bright)' : 'var(--text-tertiary)',
                          }}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => atualizarStatsFormulario()}
                    className="text-[10px] font-bold txt-3 hover:opacity-80"
                  >
                    Recarregar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  {
                    icon: Eye,
                    label: 'Abriram o form',
                    value: funilPeriodoData.views ?? '—',
                    sub: funilPeriodo === 'total'
                      ? 'Desde o início'
                      : `No período: ${funilPeriodoOpts.find(o => o.id === funilPeriodo)?.label || ''}`,
                    accent: '#60a5fa',
                    metric: 'views',
                  },
                  {
                    icon: UserPlus2,
                    label: 'Cadastros',
                    value: funilPeriodoData.cadastros ?? '—',
                    sub: 'Quem completou o formulário',
                    accent: 'var(--gold-bright)',
                    metric: 'cadastros',
                  },
                  {
                    icon: Percent,
                    label: 'Conversão',
                    value: funilPeriodoData.conversaoPct != null ? `${funilPeriodoData.conversaoPct}%` : '—',
                    sub: 'Cadastros ÷ aberturas',
                    accent: '#a78bfa',
                    metric: null,
                  },
                  {
                    icon: MousePointerClick,
                    label: 'Clicaram no canal',
                    value: funilPeriodoData.canal ?? '—',
                    sub: funilPeriodoData.canalConversaoPct != null
                      ? `${funilPeriodoData.canalConversaoPct}% dos cadastros`
                      : 'Botão “Entrar no canal”',
                    accent: '#4ade80',
                    highlight: true,
                    metric: 'canal',
                  },
                ].map(k => {
                  const Icon = k.icon
                  const selected = k.metric && funilSerieMetric === k.metric
                  return (
                    <button
                      key={k.label}
                      type="button"
                      onClick={() => { if (k.metric) setFunilSerieMetric(k.metric) }}
                      className="rounded-2xl p-3.5 min-w-0 text-left transition-opacity"
                      style={{
                        background: k.highlight ? 'rgba(37,211,102,0.07)' : 'rgba(255,255,255,0.03)',
                        border: selected
                          ? `1px solid ${k.accent}`
                          : k.highlight ? '1px solid rgba(74,222,128,0.28)' : '1px solid var(--border-subtle)',
                        opacity: k.metric && !selected ? 0.92 : 1,
                        cursor: k.metric ? 'pointer' : 'default',
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="inline-flex items-center justify-center rounded-lg"
                          style={{ width: 28, height: 28, background: `${k.accent}22`, color: k.accent }}
                        >
                          <Icon size={14} />
                        </span>
                        <p className="text-[10px] font-bold uppercase tracking-wider txt-3 truncate">{k.label}</p>
                      </div>
                      <p className="text-2xl font-black tabular-nums leading-none" style={{ color: k.accent }}>
                        {k.value}
                      </p>
                      <p className="text-[10px] txt-3 mt-1.5 leading-snug">{k.sub}</p>
                    </button>
                  )
                })}
              </div>

              {/* Série diária */}
              <div
                className="mt-4 rounded-2xl p-4"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border-subtle)' }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] txt-3">
                      Evolução diária
                    </p>
                    <p className="text-[11px] txt-3 mt-0.5">
                      {funilSerieMetric === 'views' && 'Aberturas do formulário por dia'}
                      {funilSerieMetric === 'cadastros' && 'Cadastros concluídos por dia'}
                      {funilSerieMetric === 'canal' && 'Cliques no canal por dia'}
                      {funilSerieMetric === 'envios' && 'Envios recebidos por dia'}
                    </p>
                  </div>
                  <div
                    className="inline-flex rounded-lg p-0.5 gap-0.5"
                    style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-subtle)' }}
                  >
                    {[
                      { id: 'views', label: 'Aberturas' },
                      { id: 'cadastros', label: 'Cadastros' },
                      { id: 'canal', label: 'Canal' },
                      { id: 'envios', label: 'Envios' },
                    ].map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setFunilSerieMetric(m.id)}
                        className="px-2 py-1 rounded-md text-[10px] font-bold"
                        style={{
                          background: funilSerieMetric === m.id ? 'rgba(212,175,95,0.2)' : 'transparent',
                          color: funilSerieMetric === m.id ? 'var(--gold-bright)' : 'var(--text-tertiary)',
                        }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {funilSerie.length === 0 ? (
                  <p className="text-xs txt-3 py-6 text-center">Sem dados neste período ainda.</p>
                ) : (
                  <>
                    <div className="flex items-end gap-1 sm:gap-1.5 h-28">
                      {funilSerie.map(d => {
                        const v = Number(d[funilSerieMetric] || 0)
                        const h = Math.round((v / funilSerieMax) * 100)
                        const cor = funilSerieMetric === 'canal'
                          ? '#4ade80'
                          : funilSerieMetric === 'cadastros'
                            ? 'var(--gold-bright)'
                            : funilSerieMetric === 'envios'
                              ? '#a78bfa'
                              : '#60a5fa'
                        return (
                          <div key={d.dia} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full gap-1 group relative">
                            <span
                              className="absolute -top-5 text-[9px] font-bold opacity-0 group-hover:opacity-100 transition-opacity tabular-nums"
                              style={{ color: cor }}
                            >
                              {v}
                            </span>
                            <div
                              className="w-full rounded-t-md transition-all"
                              title={`${d.label}: ${v}`}
                              style={{
                                height: `${Math.max(h, v > 0 ? 8 : 2)}%`,
                                background: v > 0 ? cor : 'rgba(255,255,255,0.06)',
                                opacity: v > 0 ? 0.9 : 0.5,
                              }}
                            />
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex gap-1 sm:gap-1.5 mt-1.5">
                      {funilSerie.map((d, i) => {
                        const show = funilSerie.length <= 7
                          || i === 0
                          || i === funilSerie.length - 1
                          || i === Math.floor(funilSerie.length / 2)
                        return (
                          <div key={`l-${d.dia}`} className="flex-1 min-w-0 text-center">
                            <span className="text-[8px] sm:text-[9px] txt-3 tabular-nums">
                              {show ? d.label : ''}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
                {[
                  { label: 'Quer canal (interesse)', value: stats.comCanal, hint: 'Marcou no formulário' },
                  {
                    label: 'Envios no período',
                    value: funilPeriodoData.envios ?? '—',
                    hint: 'Inclui atualizações de cadastro',
                  },
                  { label: 'Na comunidade agora', value: stats.totalComunidade, hint: 'Ainda não movidos p/ rede' },
                ].map(k => (
                  <div
                    key={k.label}
                    className="rounded-xl px-3.5 py-3 flex items-center justify-between gap-2"
                    style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border-subtle)' }}
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider txt-3 truncate">{k.label}</p>
                      <p className="text-[10px] txt-3 mt-0.5 truncate">{k.hint}</p>
                    </div>
                    <p className="text-lg font-black tabular-nums txt-1 flex-shrink-0">{k.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Link + WhatsApp */}
            <div className="grid lg:grid-cols-2 gap-0" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div className="p-5 sm:p-6 space-y-3.5" style={{ borderRight: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Link2 size={14} style={{ color: 'var(--gold-bright)' }} />
                    <label className="text-[10px] font-bold uppercase tracking-wider txt-3">Link profissional</label>
                  </div>
                  {leadUrl && (
                    <a
                      href={leadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-bold inline-flex items-center gap-1"
                      style={{ color: 'var(--gold-bright)' }}
                    >
                      Abrir <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                <p className="text-[11px] txt-3 leading-relaxed -mt-1">
                  Divulgue este endereço curto em stories, bio e cartões.
                </p>
                <div
                  className="flex items-stretch gap-0 rounded-xl overflow-hidden"
                  style={{ border: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.2)' }}
                >
                  <span
                    className="px-3 py-2.5 text-xs font-semibold flex items-center flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-tertiary)' }}
                  >
                    campanha.space/c/
                  </span>
                  <input
                    value={leadSlug}
                    onChange={e => setLeadSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40))}
                    placeholder="ismael"
                    className="input-dark flex-1 px-3 py-2.5 text-sm rounded-none border-0 font-semibold"
                    style={{ boxShadow: 'none', background: 'transparent' }}
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="ghost" onClick={salvarSlugCampanha} disabled={linkBusy}>
                    Salvar link
                  </Button>
                  <Button icon={Copy} onClick={copiarLinkCadastro} disabled={linkBusy}>
                    Copiar link
                  </Button>
                </div>
                {leadUrl && (
                  <p className="text-[10px] txt-3 truncate font-mono opacity-80" title={leadUrl}>{leadUrl}</p>
                )}
              </div>

              <div className="p-5 sm:p-6 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MessageCircle size={14} style={{ color: '#4ade80' }} />
                    <label className="text-[10px] font-bold uppercase tracking-wider txt-3">
                      WhatsApp da campanha
                    </label>
                  </div>
                  {waCampanha ? (
                    <span className="text-[10px] font-bold inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
                      style={{ color: '#4ade80', background: 'rgba(74,222,128,0.12)' }}>
                      <Check size={10} /> Ativo
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold txt-3">Opcional</span>
                  )}
                </div>
                <p className="text-[11px] txt-3 leading-relaxed -mt-1">
                  Número exibido após o cadastro (botão “Falar com a campanha”). O canal do WhatsApp é configurado em <strong>Editar formulário</strong>.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={waCampanha}
                    onChange={e => setWaCampanha(e.target.value.replace(/\D/g, '').slice(0, 13))}
                    placeholder="5547999999999"
                    className="input-dark flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold"
                  />
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={salvarWhatsAppCampanha} disabled={linkBusy}>
                      Salvar
                    </Button>
                    {waCampanha && (
                      <Button
                        icon={Trash2}
                        variant="ghost"
                        onClick={removerWhatsAppCampanha}
                        disabled={linkBusy}
                        title="Remover WhatsApp"
                      >
                        Remover
                      </Button>
                    )}
                  </div>
                </div>
                {leadConfig?.whatsappCanalUrl ? (
                  <div
                    className="rounded-xl px-3 py-2.5 flex items-start gap-2"
                    style={{ background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(74,222,128,0.22)' }}
                  >
                    <Radio size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#4ade80' }} />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold" style={{ color: '#4ade80' }}>
                        Canal configurado — cliques são contados
                      </p>
                      <p className="text-[10px] txt-3 truncate mt-0.5" title={leadConfig.whatsappCanalUrl}>
                        {leadConfig.whatsappCanalTitulo || 'Canal oficial'} · {leadConfig.whatsappCanalUrl}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] txt-3 leading-snug">
                    Para contar cliques no canal, configure o link do Canal em <strong>Editar formulário → Interesses</strong>.
                  </p>
                )}
              </div>
            </div>
          </Card>
        )}

        {(syncMsg || linkMsg) && (
          <div
            className="mb-4 px-4 py-2.5 rounded-xl text-center text-xs font-semibold"
            style={{
              background: 'rgba(212,175,95,0.10)',
              border: '1px solid rgba(212,175,95,0.28)',
              color: 'var(--gold-bright)',
            }}
          >
            {linkMsg || syncMsg}
          </div>
        )}

        <LeadFormBuilder
          open={builderOpen}
          onClose={() => setBuilderOpen(false)}
          initialConfig={leadConfig}
          onSave={salvarConfigFormulario}
        />

        <div className="flex gap-1 p-1 mb-4 rounded-2xl" style={{ background: 'rgba(0,0,0,0.28)', border: '1px solid var(--border-subtle)' }}>
          {[
            { id: 'rede', label: 'Apoiadores', icon: Users, count: stats.totalRede },
            { id: 'comunidade', label: 'Comunidade WhatsApp', icon: Radio, count: stats.totalComunidade },
          ].map(t => {
            const Icon = t.icon
            const on = abaLista === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => { setAbaLista(t.id); setFiltroOrigem('Todos'); setBusca('') }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold transition-colors"
                style={{
                  fontSize: 12,
                  background: on
                    ? (t.id === 'comunidade'
                      ? 'linear-gradient(135deg, rgba(37,211,102,0.22), rgba(22,163,74,0.1))'
                      : 'linear-gradient(135deg, rgba(212,175,95,0.28), rgba(168,132,46,0.12))')
                    : 'transparent',
                  color: on
                    ? (t.id === 'comunidade' ? '#4ade80' : 'var(--gold-bright)')
                    : 'var(--text-faint)',
                  border: on
                    ? (t.id === 'comunidade' ? '1px solid rgba(74,222,128,0.35)' : '1px solid rgba(212,175,95,0.35)')
                    : '1px solid transparent',
                }}
              >
                <Icon size={14} />
                <span className="truncate">{t.label}</span>
                <span
                  className="tnum px-1.5 py-0.5 rounded-md font-extrabold"
                  style={{
                    fontSize: 10,
                    background: on ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.05)',
                  }}
                >
                  {t.count}
                </span>
              </button>
            )
          })}
        </div>

        <KpiStrip
          columns={abaLista === 'comunidade' ? 4 : 6}
          className="mb-5"
          items={abaLista === 'comunidade'
            ? [
                { label: 'Na comunidade', value: stats.totalComunidade, gold: true },
                { label: 'Hoje', value: stats.formHoje },
                { label: 'Últimos 7 dias', value: stats.form7d },
                { label: 'Quer canal', value: stats.comCanal },
              ]
            : [
                { label: 'Apoiadores', value: stats.totalRede, gold: true },
                { label: 'Comunidade WA', value: stats.totalComunidade },
                { label: 'Votos rede (×5)', value: stats.votosPrevistos },
                { label: 'Bairros', value: stats.bairrosAtivos },
                ...Object.entries(NIVEIS).slice(0, 2).map(([key, val]) => ({
                  label: val.label,
                  value: stats.porNivel[key] || 0,
                })),
              ]}
        />

        <div
          className="mb-4 p-3.5 rounded-2xl flex flex-col sm:flex-row gap-2.5 flex-wrap items-stretch"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="flex-1 relative min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 txt-3 pointer-events-none" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="input-dark w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
              placeholder={abaLista === 'comunidade'
                ? 'Buscar na comunidade…'
                : 'Buscar nome, telefone ou bairro…'}
            />
          </div>
          <select
            value={filtroNivel}
            onChange={e => setFiltroNivel(e.target.value)}
            className="input-dark px-3 py-2.5 rounded-xl text-sm font-semibold min-w-[140px]"
          >
            <option value="Todos">Todos os níveis</option>
            {Object.entries(NIVEIS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select
            value={filtroBairro}
            onChange={e => setFiltroBairro(e.target.value)}
            className="input-dark px-3 py-2.5 rounded-xl text-sm font-semibold min-w-[140px]"
          >
            <option value="Todos">Todos os bairros</option>
            {bairrosFiltro.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          {abaLista === 'rede' && (
            <select
              value={filtroOrigem}
              onChange={e => setFiltroOrigem(e.target.value)}
              className="input-dark px-3 py-2.5 rounded-xl text-sm font-semibold min-w-[140px]"
            >
              <option value="Todos">Todas as origens</option>
              <option value="equipe">Equipe</option>
              <option value="manual">Manual</option>
            </select>
          )}
        </div>

        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-xs font-semibold txt-3">
            {abaLista === 'comunidade'
              ? (filtered.length === stats.totalComunidade
                ? `${stats.totalComunidade} na comunidade`
                : `${filtered.length} de ${stats.totalComunidade} na comunidade`)
              : (filtered.length === stats.totalRede
                ? `${stats.totalRede} apoiador${stats.totalRede === 1 ? '' : 'es'}`
                : `${filtered.length} de ${stats.totalRede} apoiadores`)}
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="list-panel">
            <EmptyState
              icon={abaLista === 'comunidade' ? Radio : Users}
              title={abaLista === 'comunidade'
                ? (stats.totalComunidade === 0 ? 'Ninguém na comunidade ainda' : 'Nenhum resultado')
                : (stats.totalRede === 0 ? 'Nenhum apoiador ainda' : 'Nenhum resultado')}
              subtitle={abaLista === 'comunidade'
                ? (stats.totalComunidade === 0
                  ? 'Quem se cadastrar pelo formulário aparece aqui, separado da rede'
                  : 'Ajuste os filtros ou limpe a busca')
                : (stats.totalRede === 0
                  ? 'Cadastre manualmente ou importe da Equipe. O formulário vai para Comunidade WhatsApp.'
                  : 'Ajuste os filtros ou limpe a busca')}
              action={abaLista === 'rede' && stats.totalRede === 0 ? (
                <div className="flex flex-wrap gap-2 justify-center">
                  {phpSync && (
                    <Button icon={Globe} variant="ghost" onClick={() => puxarCadastrosPublicos()} disabled={pullBusy}>
                      Buscar do formulário
                    </Button>
                  )}
                  <Button icon={RefreshCw} variant="ghost" onClick={sincronizarAgora}>Importar da Equipe</Button>
                  <Button icon={UserPlus} onClick={novoApoiador}>Novo apoiador</Button>
                </div>
              ) : (abaLista === 'comunidade' && phpSync ? (
                <Button icon={Globe} variant="ghost" onClick={() => puxarCadastrosPublicos()} disabled={pullBusy}>
                  Atualizar do formulário
                </Button>
              ) : null)}
            />
          </div>
        ) : (
          <div className="list-panel overflow-hidden">
            {filtered.map(ap => {
              const nivel = NIVEIS[ap.nivel] || NIVEIS.simpatizante
              const NivelIcon = nivel.icon
              const inters = (interacoes[ap.id] || []).length
              const linkWa = waHref(ap.telefone)
              return (
                <div
                  key={ap.id}
                  className="list-row group cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetalheId(ap.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setDetalheId(ap.id)
                    }
                  }}
                >
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-white font-bold text-xs"
                    style={{
                      background: `linear-gradient(145deg, ${nivel.cor}, ${nivel.cor}bb)`,
                      boxShadow: `0 6px 16px ${nivel.cor}33`,
                    }}
                  >
                    {iniciais(ap.nome)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold txt-1 text-sm truncate">{ap.nome}</p>
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold flex-shrink-0"
                        style={{ background: `${nivel.cor}18`, color: nivel.cor }}
                      >
                        <NivelIcon size={10} /> {nivel.label}
                      </span>
                      {ap.origem === 'equipe' && (
                        <span
                          className="px-1.5 py-0.5 rounded-md text-[9px] font-bold flex-shrink-0"
                          style={{ background: 'rgba(212,175,95,0.14)', color: 'var(--gold-bright)' }}
                        >
                          EQUIPE
                        </span>
                      )}
                      {ehComunidadeForm(ap) && (
                        <span
                          className="px-1.5 py-0.5 rounded-md text-[9px] font-bold flex-shrink-0"
                          style={{ background: 'rgba(34,197,94,0.14)', color: '#4ade80' }}
                        >
                          {querCanalWhatsapp(ap) ? 'CANAL WA' : 'COMUNIDADE'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs txt-3 flex-wrap">
                      {ap.telefone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone size={10} /> {formatTelefoneInput(ap.telefone) || ap.telefone}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={10} />
                        {[ap.cidade, ap.bairro].filter(Boolean).join(' · ') || 'A definir'}
                      </span>
                      {abaLista === 'rede' && (
                        <span className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--gold)' }}>
                          {Number(ap.votosEstimados) > 0 ? ap.votosEstimados : VOTOS_POR_APOIADOR} votos
                        </span>
                      )}
                      {inters > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare size={10} /> {inters}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    {abaLista === 'comunidade' && (
                      <button
                        type="button"
                        onClick={() => promoverParaRede(ap)}
                        className="p-2 rounded-xl hov-srf"
                        title="Mover para rede de apoiadores"
                      >
                        <ArrowRightLeft size={14} style={{ color: 'var(--gold-bright)' }} />
                      </button>
                    )}
                    {linkWa && (
                      <a
                        href={linkWa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-xl hov-srf"
                        title="Abrir WhatsApp"
                      >
                        <MessageCircle size={14} style={{ color: '#25D366' }} />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setDetalheId(ap.id)}
                      className="p-2 rounded-xl hov-srf"
                      title="Ver dados"
                    >
                      <History size={14} className="txt-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => abrirInteracao(ap.id)}
                      className="p-2 rounded-xl hov-srf"
                      title="Nova interação"
                    >
                      <Plus size={14} className="txt-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => editarApoiador(ap)}
                      className="p-2 rounded-xl hov-srf"
                      title="Editar"
                    >
                      <Edit3 size={14} className="txt-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => excluirApoiador(ap.id)}
                      className="p-2 rounded-xl hov-srf"
                      title="Excluir"
                    >
                      <Trash2 size={14} className="text-red-400" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </ModuleWrap>

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
        >
          <div
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid rgba(212,175,95,0.22)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
            }}
          >
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--gold)' }}>Rede</p>
                <h2 className="font-bold txt-1" style={{ fontSize: 17 }}>
                  {modal === 'novo' ? 'Novo apoiador' : 'Editar apoiador'}
                </h2>
              </div>
              <button type="button" onClick={() => setModal(null)} className="p-2 rounded-xl hov-srf">
                <X size={18} className="txt-3" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider txt-3 block mb-1.5">Nome completo *</label>
                <input
                  value={form.nome}
                  onChange={e => setForm(prev => ({ ...prev, nome: e.target.value }))}
                  className="input-dark w-full px-3 py-2.5 rounded-xl text-sm font-semibold"
                  placeholder="Nome do apoiador"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider txt-3 block mb-1.5">Telefone / WhatsApp</label>
                  <input
                    value={form.telefone}
                    onChange={e => setForm(prev => ({ ...prev, telefone: formatTelefoneInput(e.target.value) }))}
                    className="input-dark w-full px-3 py-2.5 rounded-xl text-sm font-semibold"
                    placeholder="(47) 99999-9999"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider txt-3 block mb-1.5">E-mail</label>
                  <input
                    value={form.email}
                    onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                    className="input-dark w-full px-3 py-2.5 rounded-xl text-sm font-semibold"
                    placeholder="email@exemplo.com"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider txt-3 block mb-1.5">Cidade</label>
                  <input
                    value={form.cidade}
                    onChange={e => setForm(prev => ({ ...prev, cidade: e.target.value }))}
                    className="input-dark w-full px-3 py-2.5 rounded-xl text-sm font-semibold"
                    placeholder="Blumenau"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider txt-3 block mb-1.5">Bairro</label>
                  <select
                    value={form.bairro}
                    onChange={e => setForm(prev => ({ ...prev, bairro: e.target.value }))}
                    className="input-dark w-full px-3 py-2.5 rounded-xl text-sm font-semibold"
                  >
                    <option value="">Selecione…</option>
                    {bairrosModal.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider txt-3 block mb-1.5">CEP</label>
                  <input
                    value={form.cep}
                    onChange={e => setForm(prev => ({ ...prev, cep: e.target.value }))}
                    className="input-dark w-full px-3 py-2.5 rounded-xl text-sm font-semibold"
                    placeholder="89000-000"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider txt-3 block mb-1.5">Rua</label>
                  <input
                    value={form.logradouro}
                    onChange={e => setForm(prev => ({ ...prev, logradouro: e.target.value }))}
                    className="input-dark w-full px-3 py-2.5 rounded-xl text-sm font-semibold"
                    placeholder="Rua / avenida"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider txt-3 block mb-1.5">Nº</label>
                  <input
                    value={form.numero}
                    onChange={e => setForm(prev => ({ ...prev, numero: e.target.value }))}
                    className="input-dark w-full px-3 py-2.5 rounded-xl text-sm font-semibold"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider txt-3 block mb-1.5">Complemento</label>
                  <input
                    value={form.complemento}
                    onChange={e => setForm(prev => ({ ...prev, complemento: e.target.value }))}
                    className="input-dark w-full px-3 py-2.5 rounded-xl text-sm font-semibold"
                    placeholder="Apto…"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider txt-3 block mb-1.5">Nascimento</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="bday"
                    maxLength={10}
                    value={form.dataNascimento}
                    onChange={e => setForm(prev => ({ ...prev, dataNascimento: formatDataBrInput(e.target.value) }))}
                    className="input-dark w-full px-3 py-2.5 rounded-xl text-sm font-semibold"
                    placeholder="00/00/0000"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider txt-3 block mb-1.5">Profissão</label>
                  <input
                    value={form.profissao}
                    onChange={e => setForm(prev => ({ ...prev, profissao: e.target.value }))}
                    className="input-dark w-full px-3 py-2.5 rounded-xl text-sm font-semibold"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider txt-3 block mb-1.5">Nível de engajamento</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(NIVEIS).map(([key, val]) => {
                    const Icon = val.icon
                    const active = form.nivel === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, nivel: key }))}
                        className="flex items-center gap-2 p-3 rounded-xl text-sm font-bold transition-all"
                        style={active
                          ? { border: `1.5px solid ${val.cor}`, background: `${val.cor}14`, color: val.cor }
                          : { border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                      >
                        <Icon size={14} /> {val.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider txt-3 block mb-1.5">
                  Votos estimados (máx. {VOTOS_POR_APOIADOR} — casa)
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, votosEstimados: n }))}
                      className="flex-1 py-2 rounded-xl text-sm font-bold"
                      style={Number(form.votosEstimados) === n
                        ? { border: '1.5px solid var(--gold)', background: 'rgba(212,175,95,0.14)', color: 'var(--gold)' }
                        : { border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider txt-3 block mb-1.5">Observação</label>
                <textarea
                  value={form.observacao}
                  onChange={e => setForm(prev => ({ ...prev, observacao: e.target.value }))}
                  className="input-dark w-full px-3 py-2.5 rounded-xl text-sm resize-none"
                  rows={2}
                  placeholder="Anotações internas…"
                />
              </div>
            </div>
            <div className="px-5 py-4 flex justify-end gap-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button>
              <Button onClick={salvarApoiador}>{modal === 'novo' ? 'Cadastrar' : 'Salvar'}</Button>
            </div>
          </div>
        </div>
      )}

      {interModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
        >
          <div
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid rgba(212,175,95,0.22)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
            }}
          >
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--gold)' }}>CRM</p>
                <h2 className="font-bold txt-1" style={{ fontSize: 17 }}>Nova interação</h2>
              </div>
              <button type="button" onClick={() => setInterModal(null)} className="p-2 rounded-xl hov-srf">
                <X size={18} className="txt-3" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider txt-3 block mb-1.5">Tipo</label>
                <select
                  value={interForm.tipo}
                  onChange={e => setInterForm(prev => ({ ...prev, tipo: e.target.value }))}
                  className="input-dark w-full px-3 py-2.5 rounded-xl text-sm font-semibold"
                >
                  <option value="contato">Contato telefônico</option>
                  <option value="visita">Visita presencial</option>
                  <option value="evento">Participou de evento</option>
                  <option value="material">Recebeu material</option>
                  <option value="indicacao">Fez indicação</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider txt-3 block mb-1.5">Descrição *</label>
                <textarea
                  value={interForm.descricao}
                  onChange={e => setInterForm(prev => ({ ...prev, descricao: e.target.value }))}
                  className="input-dark w-full px-3 py-2.5 rounded-xl text-sm resize-none"
                  rows={3}
                  placeholder="O que aconteceu neste contato…"
                />
              </div>
            </div>
            <div className="px-5 py-4 flex justify-end gap-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <Button variant="ghost" onClick={() => setInterModal(null)}>Cancelar</Button>
              <Button onClick={salvarInteracao} disabled={!interForm.descricao.trim()}>
                Salvar interação
              </Button>
            </div>
          </div>
        </div>
      )}

      {detalheId && detalheAp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid rgba(212,175,95,0.22)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
            }}
          >
            <div
              className="sticky top-0 z-10 px-5 py-4 flex items-center justify-between"
              style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--gold)' }}>Rede</p>
                <h2 className="font-bold txt-1" style={{ fontSize: 17 }}>Ficha do apoiador</h2>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  icon={Edit3}
                  variant="ghost"
                  onClick={() => {
                    const ap = detalheAp
                    setDetalheId(null)
                    editarApoiador(ap)
                  }}
                >
                  Editar
                </Button>
                <button type="button" onClick={() => setDetalheId(null)} className="p-2 rounded-xl hov-srf">
                  <X size={18} className="txt-3" />
                </button>
              </div>
            </div>
            <div className="px-5 py-5">
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-sm"
                  style={{ background: NIVEIS[detalheAp.nivel]?.cor || '#64748b' }}
                >
                  {iniciais(detalheAp.nome)}
                </div>
                <div className="min-w-0">
                  <p className="font-bold txt-1 truncate">{detalheAp.nome}</p>
                  <p className="text-xs txt-3">
                    {NIVEIS[detalheAp.nivel]?.label}
                    {detalheAp.cidade ? ` · ${detalheAp.cidade}` : ''}
                    {detalheAp.bairro ? ` · ${detalheAp.bairro}` : ''}
                  </p>
                  {detalheAp.telefone && (
                    <p className="text-xs txt-3 mt-0.5 flex items-center gap-1">
                      <Phone size={10} /> {formatTelefoneInput(detalheAp.telefone) || detalheAp.telefone}
                    </p>
                  )}
                  {detalheAp.email && (
                    <p className="text-xs txt-3 mt-0.5">{detalheAp.email}</p>
                  )}
                </div>
              </div>

              <div
                className="mb-4 p-3 rounded-xl grid grid-cols-2 gap-2 text-xs"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}
              >
                {detalheAp.dataNascimento && (
                  <p className="txt-3"><span className="txt-2 font-semibold">Nascimento:</span> {detalheAp.dataNascimento}</p>
                )}
                {detalheAp.profissao && (
                  <p className="txt-3"><span className="txt-2 font-semibold">Profissão:</span> {detalheAp.profissao}</p>
                )}
                {(detalheAp.logradouro || detalheAp.cep) && (
                  <p className="txt-3 col-span-2">
                    <span className="txt-2 font-semibold">Endereço:</span>{' '}
                    {[detalheAp.logradouro, detalheAp.numero, detalheAp.complemento, detalheAp.cep].filter(Boolean).join(', ')}
                  </p>
                )}
                <p className="txt-3">
                  <span className="txt-2 font-semibold">Votos estimados:</span>{' '}
                  {Number(detalheAp.votosEstimados) > 0 ? detalheAp.votosEstimados : VOTOS_POR_APOIADOR}
                  <span className="txt-3"> / {VOTOS_POR_APOIADOR}</span>
                </p>
                {ehComunidadeForm(detalheAp) && (
                  <p className="txt-3"><span className="txt-2 font-semibold">Origem:</span> Comunidade WhatsApp (formulário)</p>
                )}
                {Array.isArray(detalheAp.interesses) && detalheAp.interesses.length > 0 && (
                  <p className="txt-3 col-span-2">
                    <span className="txt-2 font-semibold">Interesses:</span> {detalheAp.interesses.join('; ')}
                  </p>
                )}
              </div>

              {ehComunidadeForm(detalheAp) && (
                <Button
                  icon={ArrowRightLeft}
                  className="w-full mb-4"
                  onClick={() => {
                    promoverParaRede(detalheAp)
                    setDetalheId(null)
                    setAbaLista('rede')
                  }}
                >
                  Mover para rede de apoiadores
                </Button>
              )}

              {detalheAp.observacao && (
                <p className="text-sm txt-3 mb-4 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
                  {detalheAp.observacao}
                </p>
              )}
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-bold uppercase tracking-wider txt-3">
                  Interações ({detalheInter.length})
                </h3>
                <Button icon={Plus} variant="ghost" onClick={() => { setDetalheId(null); abrirInteracao(detalheAp.id) }}>
                  Registrar
                </Button>
              </div>
              {detalheInter.length === 0 ? (
                <p className="text-sm txt-3 text-center py-8">Nenhuma interação registrada</p>
              ) : (
                <div className="space-y-3">
                  {[...detalheInter].reverse().map(inter => {
                    const meta = TIPO_INTER[inter.tipo] || TIPO_INTER.outro
                    return (
                      <div key={inter.id} className="flex gap-3">
                        <div
                          className="w-2 h-2 rounded-full mt-2 flex-shrink-0"
                          style={{ backgroundColor: meta.cor }}
                        />
                        <div className="flex-1 min-w-0 pb-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold" style={{ color: meta.cor }}>{meta.label}</span>
                            <span className="text-[10px] txt-4">
                              {new Date(inter.data).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                          <p className="text-sm txt-2 mt-0.5">{inter.descricao}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
