import { useState, useEffect, useCallback, useMemo, useRef, startTransition, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import Auth from './components/Auth'
import TenantGate from './components/TenantGate'
import TenantAccess from './components/TenantAccess'
import Aprovacoes from './components/Aprovacoes'
import { supabase, isAuthConfigured, usePhpSync, clearSupabaseAuthStorage } from './lib/supabase'
import {
  pullAll, pushAllLocal, installSyncHook, teardownSync, flush, getSyncStatus, syncNow,
  setPhpAuthContext, wipeLocalAppKeys,
  SYNC_EVENT, SYNC_OK_EVENT, SYNC_ERR_EVENT, SYNC_PENDING_EVENT, SYNC_STORAGE_EVENT, SYNC_DETAIL_EVENT, APPROVAL_EVENT,
} from './lib/cloudSync'
import {
  fetchMyTenants, storeActiveTenant, getStoredTenantId, clearStoredTenant,
  listPendingChanges, listAccessRequests,
} from './lib/tenant'
import { filterTabsByAccess, parseAllowedTabs, parseCanViewFinance } from './utils/acessoAbas'
import { AccessProvider } from './context/AccessContext'
import { ChurchVisitProvider } from './context/ChurchVisitContext'
import { TabActiveProvider } from './context/TabActiveContext'
import { Loader2 } from 'lucide-react'
import Sidebar from './components/Sidebar'
import { markTabSwitch, measureTabPaint } from './utils/tabPerf'
import { markUiQuiet, markSyncPaused, deferHeavyUiWork, shouldDeferSyncUi } from './utils/syncUiGate'
const Dashboard = lazy(() => import('./components/Dashboard'))
const PrevisaoGasto = lazy(() => import('./components/PrevisaoGasto'))
const Agenda = lazy(() => import('./components/Agenda'))
const Equipe = lazy(() => import('./components/Equipe'))
const Eleitores = lazy(() => import('./components/Eleitores'))
const Pesquisas = lazy(() => import('./components/Pesquisas'))
const Materiais = lazy(() => import('./components/Materiais'))
const Apoiadores = lazy(() => import('./components/Apoiadores'))
const Empresas = lazy(() => import('./components/Empresas'))
const Relatorio = lazy(() => import('./components/Relatorio'))
const Configuracoes = lazy(() => import('./components/Configuracoes'))
const Tesouraria = lazy(() => import('./components/Tesouraria'))
const MapaEleitoral = lazy(() => import('./components/MapaEleitoral'))
const MapaSC = lazy(() => import('./components/MapaSC'))
const CampoVisitas = lazy(() => import('./components/CampoVisitas'))
import GlobalSearch from './components/GlobalSearch'
import PwaReloadPrompt from './components/PwaReloadPrompt'
import AgendaPublica from './components/AgendaPublica'
import RotaPublica from './components/RotaPublica'
import CadastroPublico from './components/CadastroPublico'
import MateriaisRetiradaPublica from './components/MateriaisRetiradaPublica'
import ContratoVerificarPublico from './components/ContratoVerificarPublico'
import { ConfirmHost } from './utils/confirm'
import InstallIos from './components/InstallIos'
import { useViewportModeSync } from './hooks/useViewportMode'
import { getMapaBadgeCountFast } from './utils/igrejasCatalog'
import { LayoutDashboard, TrendingUp, CalendarDays, Users, MapPin, Menu, Bell, AlertTriangle, X, ClipboardList, Package, Heart, FileText, Search, BarChart2, Globe, Route, Building2, Settings, Wallet, CheckCheck, Footprints } from 'lucide-react'

import { buscaIgrejasEmAndamento } from './utils/igrejasBuscaJob'
import { readStorage, readEleitoresData, sanitizeCorruptedStorage } from './utils/persist'
import { loadMetasZona, getMetaZona, cidadeFocoPadrao, zonaPertenceCidade } from './utils/eleitoresHelpers'
import { NAV_TAB_EVENT } from './utils/navigateAppTab'
import { filtrarTabsModulosCampo, TAB_IDS_MODULOS_DESATIVADOS, MODULO_MAPA_VISITAS_ATIVO, MODULO_CAMPO_VISITAS_ATIVO } from './constants/campanhaModulos'

const NOTIF_LIDAS_KEY = 'campanha_notifs_lidas'
const NOTIF_TIPOS = ['agenda', 'equipe', 'mapa', 'eleitores']

function loadNotifLidas() {
  try { return JSON.parse(localStorage.getItem(NOTIF_LIDAS_KEY) || '{}') } catch { return {} }
}

function saveNotifLidas(map) {
  try { localStorage.setItem(NOTIF_LIDAS_KEY, JSON.stringify(map || {})) } catch { /* ignore */ }
}

function isNotifLida(map, tipo, count) {
  const c = Number(count) || 0
  if (c <= 0) return true
  return Number(map?.[tipo]?.count) === c
}

function marcarNotifsLidas(items) {
  const map = loadNotifLidas()
  for (const it of items || []) {
    if (!it?.tipo) continue
    map[it.tipo] = { count: Number(it.count) || 0, at: Date.now() }
  }
  saveNotifLidas(map)
}

function TabLoader() {
  return (
    <div className="flex flex-1 items-center justify-center min-h-0 py-16">
      <Loader2 className="w-8 h-8 animate-spin text-white/30" aria-hidden />
    </div>
  )
}

/** Monta só a aba ativa — evita dezenas de listeners + mapas rodando em paralelo. */
function ActiveTabShell({ activeTab, children }) {
  useEffect(() => {
    measureTabPaint(activeTab)
  }, [activeTab])
  return (
    <TabActiveProvider active>
      <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
        {children}
      </div>
    </TabActiveProvider>
  )
}

const CHURCH_HOT_TABS = new Set(['mapaeleitoral', ...(MODULO_CAMPO_VISITAS_ATIVO ? ['campovisitas'] : [])])

const tabsBase = [
  { id: 'dashboard',   label: 'Dashboard',         icon: LayoutDashboard, available: true  },
  { id: 'previsao',    label: 'Previsão de Gasto',  icon: TrendingUp,      available: true  },
  { id: 'tesouraria',  label: 'Tesouraria',         icon: Wallet,          available: true  },
  { id: 'agenda',      label: 'Agenda',             icon: CalendarDays,    available: true  },
  { id: 'equipe',      label: 'Equipe',             icon: Users,           available: true  },
  ...(MODULO_CAMPO_VISITAS_ATIVO ? [{ id: 'campovisitas', label: 'Visitas de Campo', icon: Footprints, available: true }] : []),
  { id: 'eleitores',   label: 'Eleitores',          icon: Users,           available: true  },
  { id: 'mapa',        label: 'Mapa de Visitas',    icon: MapPin,          available: true  },
  { id: 'rotas',       label: 'Montar Rotas',       icon: Route,           available: true  },
  { id: 'mapaeleitoral', label: 'Mapa Eleitoral',   icon: BarChart2,       available: true  },
  { id: 'mapasc',        label: 'Análise SC',        icon: Globe,           available: true  },
  { id: 'pesquisas',   label: 'Pesquisa de Rua',    icon: ClipboardList,   available: true  },
  { id: 'materiais',   label: 'Materiais',           icon: Package,         available: true  },
  { id: 'apoiadores',  label: 'Apoiadores',          icon: Heart,           available: true  },
  { id: 'empresas',    label: 'Empresas',            icon: Building2,       available: true  },
  { id: 'relatorio',   label: 'Relatório',            icon: FileText,        available: true  },
  { id: 'configuracoes', label: 'Configurações',      icon: Settings,        available: true  },
]

const tabs = filtrarTabsModulosCampo(tabsBase)

function changeTab(setActiveTab, tabId) {
  if (TAB_IDS_MODULOS_DESATIVADOS.includes(tabId)) tabId = 'dashboard'
  markTabSwitch(tabId)
  markUiQuiet(12000)
  markSyncPaused(10000)
  startTransition(() => setActiveTab(tabId))
}

export default function App() {
  const isMobileLayout = useViewportModeSync()
  const [activeTab, setActiveTab]     = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [badgeCounts, setBadgeCounts] = useState({ agenda: 0, equipe: 0, mapa: 0, eleitores: 0 })
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [notifEpoch, setNotifEpoch] = useState(0)
  const rawBadgeRef = useRef({ agenda: 0, equipe: 0, mapa: 0, eleitores: 0 })
  const cloudStateRef = useRef({ pending: 0, flushing: false, error: null, lastAt: null })
  const churchHot = CHURCH_HOT_TABS.has(activeTab)
  const [searchOpen, setSearchOpen] = useState(false)
  const notifPanelRef = useRef(null)

  // Atalho global Ctrl/Cmd+K para abrir a busca
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setSearchOpen(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (TAB_IDS_MODULOS_DESATIVADOS.includes(activeTab)) {
      changeTab(setActiveTab, 'dashboard')
    }
  }, [activeTab])

  useEffect(() => {
    function onNavTab(e) {
      const tab = e?.detail?.tab
      if (!tab) return
      changeTab(setActiveTab, tab)
      setSidebarOpen(false)
    }
    window.addEventListener(NAV_TAB_EVENT, onNavTab)
    return () => window.removeEventListener(NAV_TAB_EVENT, onNavTab)
  }, [])

  const phpSync = usePhpSync()
  // Login via Supabase mesmo quando os dados sincronizam pelo PHP (campanha.space)
  const needsSupabaseAuth = isAuthConfigured
  const needsCloudSync = phpSync || needsSupabaseAuth

  const [syncing, setSyncing]   = useState(phpSync && !needsSupabaseAuth)
  const [synced, setSynced]     = useState(!needsCloudSync)
  const [syncSkipped, setSyncSkipped] = useState(false)
  const [cloudPending, setCloudPending] = useState(0)
  const [cloudFlushing, setCloudFlushing] = useState(false)
  const [cloudSyncError, setCloudSyncError] = useState(null)
  const [lastAutoSaveAt, setLastAutoSaveAt] = useState(null)
  const [dataEpoch, setDataEpoch] = useState(0)
  const [session, setSession]   = useState(null)
  const [authReady, setAuthReady] = useState(!needsSupabaseAuth)
  const [tenantReady, setTenantReady] = useState(!phpSync || !needsSupabaseAuth)
  const [tenantInfo, setTenantInfo] = useState(null) // { tenants, canClaimLegacy }
  const [activeTenant, setActiveTenant] = useState(null)
  const [accessOpen, setAccessOpen] = useState(false)
  const [aprovacoesOpen, setAprovacoesOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [approvalToast, setApprovalToast] = useState('')

  const activateTenant = useCallback((tenant, { wipe = true } = {}) => {
    if (!tenant?.id) return
    const prev = getStoredTenantId()
    if (wipe && prev && prev !== tenant.id) wipeLocalAppKeys()
    if (wipe && !prev) wipeLocalAppKeys()
    const role = tenant.role || 'member'
    const allowedTabs = parseAllowedTabs(tenant.allowedTabs ?? tenant.allowed_tabs)
    const normalized = {
      ...tenant,
      role,
      allowedTabs,
      canViewFinance: parseCanViewFinance(
        tenant.canViewFinance ?? tenant.can_view_finance,
        role,
        allowedTabs,
      ),
    }
    storeActiveTenant(normalized)
    setActiveTenant(normalized)
    const token = session?.access_token || null
    setPhpAuthContext({ accessToken: token, tenantId: tenant.id, role: role })
    installSyncHook(tenant.id)
  }, [session?.access_token])

  const canViewFinance = activeTenant
    ? parseCanViewFinance(activeTenant.canViewFinance, activeTenant.role, activeTenant.allowedTabs)
    : true

  const visibleTabs = useMemo(
    () => filterTabsByAccess(tabs, {
      role: activeTenant?.role,
      allowedTabs: activeTenant?.allowedTabs,
      canViewFinance,
    }),
    [activeTenant?.role, activeTenant?.allowedTabs, canViewFinance],
  )

  useEffect(() => {
    if (!visibleTabs.length) return
    if (!visibleTabs.some(t => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id)
    }
  }, [visibleTabs, activeTab])

  const approvalToastTimer = useRef(null)
  useEffect(() => {
    function onApproval(e) {
      setApprovalToast(e.detail?.message || 'Aguardando aprovação do dono.')
      if (approvalToastTimer.current) clearTimeout(approvalToastTimer.current)
      approvalToastTimer.current = setTimeout(() => setApprovalToast(''), 4500)
    }
    window.addEventListener(APPROVAL_EVENT, onApproval)
    return () => {
      window.removeEventListener(APPROVAL_EVENT, onApproval)
      if (approvalToastTimer.current) clearTimeout(approvalToastTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!phpSync || !session?.access_token || !activeTenant?.id) return
    if (activeTenant.role !== 'owner') return
    let cancel = false
    async function tick() {
      try {
        const [changes, access] = await Promise.all([
          listPendingChanges(session.access_token, activeTenant.id),
          listAccessRequests(session.access_token, activeTenant.id).catch(() => ({ count: 0 })),
        ])
        const nChanges = changes.count || (changes.pending || []).length || 0
        const nAccess = access.count || (access.requests || []).length || 0
        if (!cancel) setPendingCount(nChanges + nAccess)
      } catch { /* ignore */ }
    }
    tick()
    const id = setInterval(tick, 25000)
    return () => { cancel = true; clearInterval(id) }
  }, [phpSync, session?.access_token, activeTenant?.id, activeTenant?.role, aprovacoesOpen, accessOpen])

  useEffect(() => {
    function bumpEpoch() {
      deferHeavyUiWork(() => setDataEpoch(n => n + 1), { minDelay: 900 })
    }
    function onSynced(e) {
      if (buscaIgrejasEmAndamento()) return
      if (shouldDeferSyncUi()) return
      if (e.detail?.forceReload && e.detail?.fromServer) bumpEpoch()
    }
    function onStorageChanged(e) {
      if (buscaIgrejasEmAndamento()) return
      if (shouldDeferSyncUi()) return
      if (e.detail?.external) bumpEpoch()
    }
    function onCrossTabStorage(ev) {
      if (buscaIgrejasEmAndamento()) return
      if (shouldDeferSyncUi()) return
      if (ev.key && ev.newValue != null) bumpEpoch()
    }
    window.addEventListener(SYNC_EVENT, onSynced)
    window.addEventListener(SYNC_STORAGE_EVENT, onStorageChanged)
    window.addEventListener('storage', onCrossTabStorage)
    return () => {
      window.removeEventListener(SYNC_EVENT, onSynced)
      window.removeEventListener(SYNC_STORAGE_EVENT, onStorageChanged)
      window.removeEventListener('storage', onCrossTabStorage)
    }
  }, [])

  function refreshCloudStatus() {
    const st = getSyncStatus()
    const next = {
      pending: st.pending,
      flushing: Boolean(st.flushing),
      error: st.lastSyncError,
      lastAt: st.lastSyncAt,
    }
    const prev = cloudStateRef.current
    if (
      prev.pending === next.pending
      && prev.flushing === next.flushing
      && prev.error === next.error
      && prev.lastAt === next.lastAt
    ) return
    cloudStateRef.current = next
    setCloudPending(next.pending)
    setCloudFlushing(next.flushing)
    setCloudSyncError(next.error)
    if (next.lastAt) setLastAutoSaveAt(next.lastAt)
  }

  useEffect(() => {
    refreshCloudStatus()
    window.addEventListener(SYNC_OK_EVENT, refreshCloudStatus)
    window.addEventListener(SYNC_ERR_EVENT, refreshCloudStatus)
    window.addEventListener(SYNC_PENDING_EVENT, refreshCloudStatus)
    window.addEventListener(SYNC_DETAIL_EVENT, refreshCloudStatus)
    const t = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      if (shouldDeferSyncUi()) return
      refreshCloudStatus()
    }, 12000)
    return () => {
      window.removeEventListener(SYNC_OK_EVENT, refreshCloudStatus)
      window.removeEventListener(SYNC_ERR_EVENT, refreshCloudStatus)
      window.removeEventListener(SYNC_PENDING_EVENT, refreshCloudStatus)
      window.removeEventListener(SYNC_DETAIL_EVENT, refreshCloudStatus)
      clearInterval(t)
    }
  }, [])

  // ── Autenticação (gate de acesso) ─────────────────────────
  useEffect(() => {
    if (!needsSupabaseAuth) return
    let cancel = false
    const authTimeout = setTimeout(() => {
      if (!cancel) setAuthReady(true)
    }, 5000)

    supabase.auth.getSession()
      .then(({ data }) => {
        if (!cancel) {
          setSession(data.session ?? null)
          setAuthReady(true)
        }
      })
      .catch(err => {
        console.error('Erro ao verificar sessão:', err.message)
        if (!cancel) setAuthReady(true)
      })
      .finally(() => clearTimeout(authTimeout))

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess)
      if (!sess) {
        teardownSync()
        wipeLocalAppKeys()
        clearStoredTenant()
        setActiveTenant(null)
        setTenantInfo(null)
        setTenantReady(false)
        setSynced(false)
        setSyncing(false)
      }
    })
    return () => { cancel = true; clearTimeout(authTimeout); sub.subscription.unsubscribe() }
  }, [needsSupabaseAuth])

  // ── Resolver campanha (tenant) após login PHP ─────────────
  useEffect(() => {
    if (!phpSync || !needsSupabaseAuth) {
      setTenantReady(true)
      return
    }
    if (!session?.access_token) {
      setTenantReady(false)
      setActiveTenant(null)
      return
    }
    let cancel = false
    setTenantReady(false)
    ;(async () => {
      try {
        const me = await fetchMyTenants(session.access_token)
        if (cancel) return
        setTenantInfo(me)
        const stored = getStoredTenantId()
        const allTenants = me.tenants || []
        const defaultId = me.defaultTenantId || ''
        const defaultTenant = allTenants.find(t => t.id === defaultId)
        const storedTenant = allTenants.find(t => t.id === stored)
        const forceDefault = Boolean(me.forceDefaultTenant) && defaultTenant

        // Se o servidor sinaliza que este usuário deve ir direto para a
        // Campanha principal (BOOTSTRAP_OWNER_EMAILS) → ignora o tenant salvo
        if (forceDefault && stored !== defaultId) {
          clearStoredTenant()
          activateTenant(defaultTenant, { wipe: true })
          setTenantReady(true)
        } else if (storedTenant) {
          activateTenant(storedTenant, { wipe: false })
          setTenantReady(true)
        } else if (allTenants.length === 1) {
          activateTenant(allTenants[0], { wipe: true })
          setTenantReady(true)
        } else {
          setActiveTenant(null)
          setTenantReady(true)
        }
      } catch (err) {
        console.error('Erro ao carregar campanhas:', err.message)
        if (!cancel) {
          setTenantInfo({ tenants: [], canClaimLegacy: false })
          setTenantReady(true)
        }
      }
    })()
    return () => { cancel = true }
  }, [phpSync, needsSupabaseAuth, session?.access_token, activateTenant])

  // ── Sincronização MySQL — após campanha escolhida ─────────
  useEffect(() => {
    if (!phpSync) return
    if (needsSupabaseAuth && (!session || !activeTenant?.id)) return
    let cancel = false
    setSyncing(true)
    setSynced(false)

    const token = session?.access_token || null
    const tid = activeTenant?.id || 'local'
    setPhpAuthContext({
      accessToken: token,
      tenantId: tid,
      role: activeTenant?.role || null,
    })

    const timeout = setTimeout(() => {
      if (!cancel) {
        installSyncHook(tid)
        setSynced(true)
        setSyncing(false)
      }
    }, 8000)

    ;(async () => {
      try {
        const { isHeavyStoreReady, initHeavyStore } = await import('./utils/persist')
        if (!isHeavyStoreReady()) {
          await Promise.race([
            initHeavyStore(),
            new Promise((resolve) => setTimeout(resolve, 12000)),
          ])
        }
        installSyncHook(tid)
        await flush()
        const isMember = (activeTenant?.role || 'member') === 'member'
        await pullAll(tid, isMember ? { forceFull: true } : {})
        sanitizeCorruptedStorage()
        if (!cancel) {
          setSynced(true)
          // Backup diário automático (nuvem + local) — não bloqueia a UI
          import('./utils/backup').then(m => m.garantirBackupDiario()).catch(() => {})
        }
      } catch (err) {
        console.error('Erro ao carregar nuvem:', err.message)
        installSyncHook(tid)
        if (!cancel) setSynced(true)
      } finally {
        clearTimeout(timeout)
        if (!cancel) setSyncing(false)
      }
    })()
    return () => { cancel = true; clearTimeout(timeout) }
  }, [phpSync, needsSupabaseAuth, session?.access_token, activeTenant?.id, activeTenant?.role])

  // Sync Supabase Storage (quando NÃO usa PHP)
  useEffect(() => {
    if (phpSync) return
    if (!needsSupabaseAuth || !session) return
    installSyncHook(session.user.id)
  }, [session, needsSupabaseAuth, phpSync])

  useEffect(() => {
    if (phpSync) return
    if (!needsSupabaseAuth || !session || synced) return
    let cancel = false
    setSyncing(true)
    ;(async () => {
      try {
        const n = await pullAll(session.user.id)
        if (n === 0) await pushAllLocal(session.user.id)
        installSyncHook(session.user.id)
        if (!cancel) setSynced(true)
      } catch (err) {
        console.error('Erro na sincronização:', err.message)
        installSyncHook(session.user.id)
        if (!cancel) setSynced(true)
      } finally {
        if (!cancel) setSyncing(false)
      }
    })()
    return () => { cancel = true }
  }, [session, synced, phpSync, needsSupabaseAuth])

  async function handleLogout() {
    try { await flush() } catch { /* ignore */ }
    teardownSync()
    setPhpAuthContext({ accessToken: null, tenantId: null, role: null })
    wipeLocalAppKeys()
    clearStoredTenant()
    setActiveTenant(null)
    setTenantInfo(null)
    setSynced(false)
    setSyncing(false)
    setTenantReady(false)
    setSession(null)

    try {
      if (supabase) {
        await supabase.auth.signOut({ scope: 'global' })
      }
    } catch (err) {
      console.warn('Erro ao encerrar sessão:', err?.message || err)
    }
    clearSupabaseAuthStorage()

    // Recarrega a página para não ficar preso no TenantGate com sessão fantasma
    const cleanUrl = `${window.location.origin}${window.location.pathname || '/'}`
    window.location.replace(cleanUrl)
  }

  function handleTenantPicked(tenant) {
    activateTenant(tenant, { wipe: true })
    setDataEpoch(n => n + 1)
  }

  // Badges + notificações (adiado — não bloqueia troca de aba)
  useEffect(() => {
    let cancelled = false
    deferHeavyUiWork(() => {
      if (cancelled) return
    try {
    const agendaEventos = JSON.parse(localStorage.getItem('agenda_eventos') || '[]')
    const today = new Date().toISOString().split('T')[0]
    const agendaCount = agendaEventos.filter(e => {
      const ini = e.dataInicio || e.data
      const fim = e.dataFim || e.dataInicio || e.data
      return ini && ini <= today && fim >= today
    }).length

    const tarefas = JSON.parse(localStorage.getItem('equipe_tarefas') || '[]')
    const equipeCount = tarefas.filter(t => t.status === 'pendente').length

    const mapaCount = MODULO_MAPA_VISITAS_ATIVO ? (getMapaBadgeCountFast() ?? 0) : 0

    const metasZona = loadMetasZona()
    const dadosEleitores = readEleitoresData({})
    let eleitoresCount = 0
    if (dadosEleitores?.zonas) {
      const cidades = [...new Set(
        dadosEleitores.zonas.map(z => z.municipio || dadosEleitores.municipio).filter(Boolean),
      )]
      const foco = cidadeFocoPadrao(dadosEleitores, cidades)
      dadosEleitores.zonas.forEach(z => {
        if (foco && !zonaPertenceCidade(z, dadosEleitores, foco)) return
        const meta = getMetaZona(metasZona, foco, z.zona)
        if (meta > 0) {
          const votos = z.locais.reduce((s, l) => s + l.secoes.reduce((s2, s) => s2 + s.votos, 0), 0)
          const pct = (votos / meta) * 100
          if (pct < 80) eleitoresCount++
        }
      })
    }

    const raw = {
      agenda: agendaCount,
      equipe: equipeCount,
      mapa: mapaCount,
      eleitores: eleitoresCount,
    }
    rawBadgeRef.current = raw

    const lidas = loadNotifLidas()
    setBadgeCounts({
      agenda: isNotifLida(lidas, 'agenda', raw.agenda) ? 0 : raw.agenda,
      equipe: isNotifLida(lidas, 'equipe', raw.equipe) ? 0 : raw.equipe,
      mapa: isNotifLida(lidas, 'mapa', raw.mapa) ? 0 : raw.mapa,
      eleitores: isNotifLida(lidas, 'eleitores', raw.eleitores) ? 0 : raw.eleitores,
    })

    const notifs = []
    if (raw.agenda > 0 && !isNotifLida(lidas, 'agenda', raw.agenda)) {
      notifs.push({
        tipo: 'agenda', tab: 'agenda', count: raw.agenda,
        msg: `${raw.agenda} evento${raw.agenda > 1 ? 's' : ''} hoje`, tempo: 'hoje',
      })
    }
    if (raw.equipe > 0 && !isNotifLida(lidas, 'equipe', raw.equipe)) {
      notifs.push({
        tipo: 'equipe', tab: 'equipe', count: raw.equipe,
        msg: `${raw.equipe} tarefa${raw.equipe > 1 ? 's' : ''} pendente${raw.equipe > 1 ? 's' : ''}`, tempo: 'pendente',
      })
    }
    if (raw.mapa > 0 && !isNotifLida(lidas, 'mapa', raw.mapa)) {
      notifs.push({
        tipo: 'mapa', tab: 'mapa', count: raw.mapa,
        msg: `${raw.mapa} igreja${raw.mapa > 1 ? 's' : ''} não visitada${raw.mapa > 1 ? 's' : ''}`, tempo: 'pendente',
      })
    }
    if (raw.eleitores > 0 && !isNotifLida(lidas, 'eleitores', raw.eleitores)) {
      notifs.push({
        tipo: 'eleitores', tab: 'eleitores', count: raw.eleitores,
        msg: `${raw.eleitores} zona${raw.eleitores > 1 ? 's' : ''} abaixo da meta`, tempo: 'alerta',
      })
    }
    setNotifications(notifs.slice(0, 8))
    } catch (e) {
      console.warn('notificações', e)
    }
    }, { minDelay: 500 })
    return () => { cancelled = true }
  }, [notifEpoch, dataEpoch])

  // Abrir aba = marcar alerta daquela aba como lido (sem recalcular catálogo)
  useEffect(() => {
    if (!NOTIF_TIPOS.includes(activeTab)) return
    const raw = rawBadgeRef.current
    const count = Number(raw[activeTab]) || 0
    if (count <= 0) return
    const lidas = loadNotifLidas()
    if (isNotifLida(lidas, activeTab, count)) return
    marcarNotifsLidas([{ tipo: activeTab, count }])
    setNotifEpoch(x => x + 1)
  }, [activeTab])

  useEffect(() => {
    if (!notificationsOpen) return
    function onDoc(e) {
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target)) {
        const btn = e.target.closest?.('[aria-label="Notificações"]')
        if (!btn) setNotificationsOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [notificationsOpen])

  function marcarNotificacaoLida(n) {
    if (!n) return
    marcarNotifsLidas([n])
    setNotifEpoch(x => x + 1)
    if (n.tab) setActiveTab(n.tab)
    setNotificationsOpen(false)
  }

  function marcarTodasNotificacoesLidas() {
    if (!notifications.length) return
    marcarNotifsLidas(notifications)
    setNotifEpoch(x => x + 1)
    setNotificationsOpen(false)
  }

  const activeLabel = visibleTabs.find(t => t.id === activeTab)?.label
    ?? tabs.find(t => t.id === activeTab)?.label
    ?? 'Dashboard'
  const ActiveIcon  = visibleTabs.find(t => t.id === activeTab)?.icon
    ?? tabs.find(t => t.id === activeTab)?.icon
    ?? LayoutDashboard

  // ── Rotas públicas (path limpo ou hash legado) ───────────
  const pathVal = (typeof window !== 'undefined' ? window.location.pathname : '') || ''
  const hashVal = typeof window !== 'undefined' ? window.location.hash : ''

  // Se o PWA/SW entregou o SPA em /retirada.html?id=..., abre o formulário (nunca o login)
  if (/retirada\.html$/i.test(pathVal)) {
    const id = new URLSearchParams(window.location.search).get('id')
      || new URLSearchParams(window.location.search).get('shareId')
    if (id) {
      return <MateriaisRetiradaPublica token={decodeURIComponent(id)} />
    }
  }
  if (/verificar\.html$/i.test(pathVal)) {
    const c = new URLSearchParams(window.location.search).get('c') || ''
    return <ContratoVerificarPublico codigo={c} />
  }

  const pathCadastro = pathVal.match(/^\/c\/([a-z0-9][a-z0-9-]{1,39})$/i)
  if (pathCadastro) {
    return <CadastroPublico token={decodeURIComponent(pathCadastro[1])} />
  }
  if (hashVal.startsWith('#/c/')) {
    const slug = decodeURIComponent(hashVal.replace('#/c/', '').split('?')[0])
    return <CadastroPublico token={slug} />
  }
  if (hashVal.startsWith('#/agenda-equipe/')) {
    const token = hashVal.replace('#/agenda-equipe/', '')
    return <AgendaPublica token={token} />
  }
  if (hashVal.startsWith('#/rota-equipe/')) {
    const token = hashVal.replace('#/rota-equipe/', '')
    return <RotaPublica token={token} />
  }
  if (hashVal.startsWith('#/retirada-material/')) {
    const token = hashVal.replace('#/retirada-material/', '').split('?')[0]
    return <MateriaisRetiradaPublica token={decodeURIComponent(token)} />
  }
  if (hashVal.startsWith('#/cadastro/')) {
    const token = decodeURIComponent(hashVal.replace('#/cadastro/', '').split('?')[0])
    return <CadastroPublico token={token} />
  }
  if (hashVal.startsWith('#/verificar/')) {
    const codigo = decodeURIComponent(hashVal.replace('#/verificar/', '').split('?')[0])
    return <ContratoVerificarPublico codigo={codigo} />
  }

  // ── Login (sempre que Supabase estiver configurado) ─────────
  if (needsSupabaseAuth) {
    if (!authReady) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: 'var(--bg-base)' }}>
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Verificando acesso...</p>
        </div>
      )
    }
    if (!session) return <Auth />
  }

  // ── Escolha de campanha (multi-tenant PHP) ─────────────────
  if (phpSync && needsSupabaseAuth && session) {
    if (!tenantReady) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: 'var(--bg-base)' }}>
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Carregando suas campanhas...</p>
        </div>
      )
    }
    if (!activeTenant) {
      return (
        <TenantGate
          accessToken={session.access_token}
          userEmail={session.user?.email}
          tenants={tenantInfo?.tenants || []}
          canClaimLegacy={Boolean(tenantInfo?.canClaimLegacy)}
          canCreateTenant={Boolean(tenantInfo?.canCreateTenant)}
          defaultTenantName={tenantInfo?.defaultTenantName || 'Campanha principal'}
          accessRequest={tenantInfo?.accessRequest || null}
          onSelect={handleTenantPicked}
          onCreated={handleTenantPicked}
          onLogout={handleLogout}
          onRefresh={async (prefetched) => {
            try {
              const me = prefetched || await fetchMyTenants(session.access_token)
              setTenantInfo(me)
              if ((me.tenants || []).length === 1) {
                handleTenantPicked(me.tenants[0])
              } else if ((me.tenants || []).length > 1) {
                setActiveTenant(null)
              }
            } catch { /* ignore */ }
          }}
        />
      )
    }
  }

  // ── Sync de dados (PHP ou Supabase) após autenticar ─────────
  if (!syncSkipped && (syncing || !synced)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: 'var(--bg-base)' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          {phpSync ? 'Carregando dados da nuvem...' : 'Sincronizando seus dados...'}
        </p>
        {phpSync && (
          <button
            type="button"
            onClick={() => {
              installSyncHook(activeTenant?.id || 'local')
              setSynced(true)
              setSyncing(false)
              setSyncSkipped(true)
            }}
            className="mt-2 px-4 py-2 rounded-xl text-xs font-semibold"
            style={{ color: 'var(--text-tertiary)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            Continuar sem aguardar
          </button>
        )}
      </div>
    )
  }

  return (
    <AccessProvider
      canViewFinance={canViewFinance}
      role={activeTenant?.role}
      allowedTabs={activeTenant?.allowedTabs ?? null}
    >
    <ChurchVisitProvider
      userEmail={session?.user?.email}
      active={tenantReady}
      hot={churchHot}
    >
    <div className="app-shell flex h-full w-full max-h-[100svh] overflow-hidden min-h-0 min-w-0">

      <Sidebar
        tabs={visibleTabs}
        activeTab={activeTab}
        onTabChange={(tab) => changeTab(setActiveTab, tab)}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        badgeCounts={badgeCounts}
        userEmail={session?.user?.email}
        tenantName={activeTenant?.name}
        onLogout={needsSupabaseAuth ? handleLogout : null}
        onOpenAccess={phpSync && activeTenant?.role === 'owner' ? () => setAccessOpen(true) : null}
        onOpenApprovals={phpSync && activeTenant?.role === 'owner' ? () => setAprovacoesOpen(true) : null}
        pendingApprovals={pendingCount}
        onSearch={() => setSearchOpen(true)}
        cloudPending={cloudPending}
        cloudFlushing={cloudFlushing}
        cloudSyncError={cloudSyncError}
        lastAutoSaveAt={lastAutoSaveAt}
        onSyncNow={() => syncNow(phpSync ? (activeTenant?.id || 'local') : (session?.user?.id || 'local'))}
        tenants={tenantInfo?.tenants || []}
        onSwitchTenant={phpSync && (tenantInfo?.tenants || []).length > 1 ? () => {
          clearStoredTenant()   // limpa tenant salvo para forçar o seletor
          setActiveTenant(null)
          setTenantReady(true)  // já tem tenants carregados, vai para o TenantGate
        } : null}
      />

      {phpSync && activeTenant?.role === 'owner' && session && (
        <TenantAccess
          open={accessOpen}
          onClose={() => setAccessOpen(false)}
          accessToken={session.access_token}
          tenant={activeTenant}
          userEmail={session.user?.email}
          isPlatformAdmin={Boolean(
            tenantInfo?.defaultTenantId
            && activeTenant?.id === tenantInfo.defaultTenantId,
          )}
        />
      )}

      {phpSync && activeTenant?.role === 'owner' && session && (
        <Aprovacoes
          open={aprovacoesOpen}
          onClose={() => setAprovacoesOpen(false)}
          accessToken={session.access_token}
          tenant={activeTenant}
        />
      )}

      {approvalToast && createPortal(
        <div
          role="status"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 24,
            transform: 'translateX(-50%)',
            zIndex: 9999,
            width: 'min(360px, calc(100vw - 32px))',
            padding: '12px 16px',
            borderRadius: 14,
            fontSize: 13,
            fontWeight: 600,
            textAlign: 'center',
            lineHeight: 1.45,
            background: '#1e3a5f',
            border: '1px solid rgba(96,165,250,0.45)',
            color: '#dbeafe',
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
            pointerEvents: 'none',
          }}
        >
          {approvalToast}
        </div>,
        document.body,
      )}

      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={(tab) => { changeTab(setActiveTab, tab); setSidebarOpen(false) }}
      />

      <ConfirmHost />
      <InstallIos />

      {/* Right column: topbar (mobile) + content */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">

        {/* Topbar só em celular/tablet touch — desktop web usa sidebar fixa */}
        {isMobileLayout && (
        <header className="flex items-center gap-3 px-4 py-3 text-white flex-shrink-0"
          style={{
            borderBottom: '1px solid var(--border-subtle)',
            borderRadius: 0,
            background: 'var(--bg-surface)',
          }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <ActiveIcon size={15} className="flex-shrink-0" style={{ color: 'var(--accent-bright)' }} />
            <span className="text-display font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{activeLabel}</span>
          </div>
          <button
            onClick={() => setSearchOpen(true)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
            aria-label="Buscar"
          >
            <Search size={18} className="text-white/50" />
          </button>
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0 relative"
            aria-label="Notificações"
          >
            <Bell size={18} className="text-white/50" />
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4.5 h-4.5 rounded-full text-[10px] font-black flex items-center justify-center"
                style={{ background: '#ef4444', boxShadow: '0 0 8px rgba(239,68,68,0.5)', minWidth: 18, height: 18 }}>
                {notifications.length}
              </span>
            )}
          </button>
        </header>
        )}

        {/* Notifications panel */}
        {notificationsOpen && (
          <div ref={notifPanelRef} className="fixed top-14 right-4 z-50 w-80 rounded-2xl overflow-hidden"
            style={{ background: '#141420', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            <div className="flex items-center justify-between gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <Bell size={14} className="text-white/40 flex-shrink-0" />
                <span className="font-bold text-white/70 text-sm">Notificações</span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={marcarTodasNotificacoesLidas}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/10 text-white/50 hover:text-white/80"
                    style={{ fontSize: 10, fontWeight: 700 }}
                    title="Marcar todas como lidas"
                  >
                    <CheckCheck size={12} />
                    Marcar todas
                  </button>
                )}
                <button type="button" onClick={() => setNotificationsOpen(false)} className="p-1 rounded-lg hover:bg-white/10">
                  <X size={14} className="text-white/40" />
                </button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-white/20 text-sm">
                  Nenhuma notificação
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.tipo}
                    type="button"
                    onClick={() => marcarNotificacaoLida(n)}
                    className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: n.tempo === 'alerta' ? '#ef4444' : '#2563eb', boxShadow: '0 0 6px ' + (n.tempo === 'alerta' ? '#ef4444' : '#2563eb') }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white/70 font-medium">{n.msg}</p>
                        <p className="text-xs text-white/25 mt-0.5">Toque para marcar como lida · {n.tempo}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="app-main flex-1 overflow-hidden min-w-0 min-h-0 flex flex-col">
          <ActiveTabShell activeTab={activeTab}>
            <Suspense fallback={<TabLoader />}>
            {activeTab === 'dashboard' && (
              <Dashboard
                onNavigate={(tab) => changeTab(setActiveTab, tab)}
                tenants={tenantInfo?.tenants || []}
                onSwitchTenant={(tenantInfo?.tenants || []).length > 1 ? () => {
                  clearStoredTenant()
                  setActiveTenant(null)
                  setTenantReady(true)
                } : null}
              />
            )}
            {activeTab === 'previsao' && <PrevisaoGasto />}
            {activeTab === 'tesouraria' && <Tesouraria />}
            {activeTab === 'mapaeleitoral' && <MapaEleitoral />}
            {activeTab === 'mapasc' && <MapaSC />}
            {activeTab === 'agenda' && <Agenda />}
            {activeTab === 'equipe' && <Equipe />}
            {activeTab === 'campovisitas' && <CampoVisitas />}
            {activeTab === 'eleitores' && <Eleitores />}
            {activeTab === 'pesquisas' && <Pesquisas />}
            {activeTab === 'materiais' && <Materiais userEmail={session?.user?.email} />}
            {activeTab === 'apoiadores' && <Apoiadores />}
            {activeTab === 'empresas' && <Empresas />}
            {activeTab === 'relatorio' && <Relatorio />}
            {activeTab === 'configuracoes' && <Configuracoes />}
            </Suspense>
          </ActiveTabShell>
        </main>
      </div>
    </div>
    <PwaReloadPrompt />
    </ChurchVisitProvider>
    </AccessProvider>
  )
}
