import { useState, useEffect } from 'react'
import Auth from './components/Auth'
import { supabase, isCloudConfigured } from './lib/supabase'
import { pullAll, pushAllLocal, installSyncHook, teardownSync, flush } from './lib/cloudSync'
import { Loader2 } from 'lucide-react'
import Sidebar from './components/Sidebar'
import PrevisaoGasto from './components/PrevisaoGasto'
import MapaIgrejas from './components/MapaIgrejas'
import Agenda from './components/Agenda'
import Dashboard from './components/Dashboard'
import Equipe from './components/Equipe'
import Eleitores from './components/Eleitores'
import Pesquisas from './components/Pesquisas'
import Materiais from './components/Materiais'
import Apoiadores from './components/Apoiadores'
import Relatorio from './components/Relatorio'
import GlobalSearch from './components/GlobalSearch'
import AgendaPublica from './components/AgendaPublica'
import MapaEleitoral from './components/MapaEleitoral'
import MapaSC from './components/MapaSC'
import { ConfirmHost } from './utils/confirm'
import { LayoutDashboard, TrendingUp, CalendarDays, Users, MapPin, Menu, Bell, AlertTriangle, X, ClipboardList, Package, Heart, FileText, Search, BarChart2, Globe } from 'lucide-react'

const tabs = [
  { id: 'dashboard',   label: 'Dashboard',         icon: LayoutDashboard, available: true  },
  { id: 'previsao',    label: 'Previsão de Gasto',  icon: TrendingUp,      available: true  },
  { id: 'agenda',      label: 'Agenda',             icon: CalendarDays,    available: true  },
  { id: 'equipe',      label: 'Equipe',             icon: Users,           available: true  },
  { id: 'eleitores',   label: 'Eleitores',          icon: Users,           available: true  },
  { id: 'mapa',        label: 'Mapa de Visitas',    icon: MapPin,          available: true  },
  { id: 'mapaeleitoral', label: 'Mapa Eleitoral',   icon: BarChart2,       available: true  },
  { id: 'mapasc',        label: 'Análise SC',        icon: Globe,           available: true  },
  { id: 'pesquisas',   label: 'Pesquisa de Rua',    icon: ClipboardList,   available: true  },
  { id: 'materiais',   label: 'Materiais',           icon: Package,         available: true  },
  { id: 'apoiadores',  label: 'Apoiadores',          icon: Heart,           available: true  },
  { id: 'relatorio',   label: 'Relatório',            icon: FileText,        available: true  },
]

export default function App() {
  const [activeTab, setActiveTab]     = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [badgeCounts, setBadgeCounts] = useState({ agenda: 0, equipe: 0, mapa: 0, eleitores: 0 })
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [searchOpen, setSearchOpen] = useState(false)

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

  // ── Sincronização MySQL (modo sem Supabase) ────────────────
  useEffect(() => {
    if (isCloudConfigured) return // Supabase cuida disso
    let cancel = false
    ;(async () => {
      const n = await pullAll('local')
      if (n === 0) await pushAllLocal('local')
      if (!cancel) installSyncHook('local')
    })()
    return () => { cancel = true }
  }, [])

  // ── Autenticação + sincronização com a nuvem ──────────────
  const [session, setSession]   = useState(null)
  const [authReady, setAuthReady] = useState(!isCloudConfigured) // modo local = pronto
  const [syncing, setSyncing]   = useState(false)
  const [synced, setSynced]     = useState(!isCloudConfigured)

  useEffect(() => {
    if (!isCloudConfigured) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess)
      if (!sess) { teardownSync(); setSynced(false) }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!isCloudConfigured || !session || synced) return
    let cancel = false
    setSyncing(true)
    ;(async () => {
      try {
        const n = await pullAll(session.user.id)
        if (n === 0) await pushAllLocal(session.user.id) // 1ª vez: sobe dados locais
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
  }, [session, synced])

  async function handleLogout() {
    await flush()
    teardownSync()
    await supabase.auth.signOut()
  }

  // Calculate badge counts
  useEffect(() => {
    // Agenda: events today
    const agendaEventos = JSON.parse(localStorage.getItem('agenda_eventos') || '[]')
    const today = new Date().toISOString().split('T')[0]
    const agendaCount = agendaEventos.filter(e => {
      const ini = e.dataInicio || e.data
      const fim = e.dataFim || e.dataInicio || e.data
      return ini && ini <= today && fim >= today
    }).length

    // Equipe: pending tasks
    const tarefas = JSON.parse(localStorage.getItem('equipe_tarefas') || '[]')
    const equipeCount = tarefas.filter(t => t.status === 'pendente').length

    // Mapa: unvisited churches
    const visitas = JSON.parse(localStorage.getItem('igrejas_visitas') || '{}')
    const mapaCount = Object.keys(visitas).filter(k => !visitas[k]).length

    // Eleitores: alerts (zones below 80% goal)
    const metasZona = JSON.parse(localStorage.getItem('metas_zona') || '{}')
    const dadosEleitores = JSON.parse(localStorage.getItem('eleitores_data') || '{}')
    let eleitoresCount = 0
    if (dadosEleitores.zonas) {
      dadosEleitores.zonas.forEach(z => {
        const meta = metasZona[z.zona] || 0
        if (meta > 0) {
          const votos = z.locais.reduce((s, l) => s + l.secoes.reduce((s2, s) => s2 + s.votos, 0), 0)
          const pct = (votos / meta) * 100
          if (pct < 80) eleitoresCount++
        }
      })
    }

    setBadgeCounts({ agenda: agendaCount, equipe: equipeCount, mapa: mapaCount, eleitores: eleitoresCount })

    // Generate notifications
    const notifs = []
    if (agendaCount > 0) notifs.push({ tipo: 'agenda', msg: `${agendaCount} evento${agendaCount > 1 ? 's' : ''} hoje`, tempo: 'hoje' })
    if (equipeCount > 0) notifs.push({ tipo: 'equipe', msg: `${equipeCount} tarefa${equipeCount > 1 ? 's' : ''} pendente${equipeCount > 1 ? 's' : ''}`, tempo: 'pendente' })
    if (mapaCount > 0) notifs.push({ tipo: 'mapa', msg: `${mapaCount} igreja${mapaCount > 1 ? 's' : ''} não visitada${mapaCount > 1 ? 's' : ''}`, tempo: 'pendente' })
    if (eleitoresCount > 0) notifs.push({ tipo: 'eleitores', msg: `${eleitoresCount} zona${eleitoresCount > 1 ? 's' : ''} abaixo da meta`, tempo: 'alerta' })
    setNotifications(notifs.slice(0, 5))
  }, [activeTab])

  const activeLabel = tabs.find(t => t.id === activeTab)?.label ?? 'Dashboard'
  const ActiveIcon  = tabs.find(t => t.id === activeTab)?.icon ?? LayoutDashboard

  // ── Rota pública: agenda compartilhada via hash ───────────
  const hashVal = window.location.hash
  if (hashVal.startsWith('#/agenda-equipe/')) {
    const token = hashVal.replace('#/agenda-equipe/', '')
    return <AgendaPublica token={token} />
  }

  // ── Gates da nuvem (só quando configurada) ────────────────
  if (isCloudConfigured) {
    if (!authReady) {
      return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: '#08080d' }}>
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
        </div>
      )
    }
    if (!session) return <Auth />
    if (syncing || !synced) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: '#08080d' }}>
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Sincronizando seus dados...</p>
        </div>
      )
    }
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#08080d' }}>

      <Sidebar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        badgeCounts={badgeCounts}
        userEmail={session?.user?.email}
        onLogout={isCloudConfigured ? handleLogout : null}
        onSearch={() => setSearchOpen(true)}
      />

      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={(tab) => { setActiveTab(tab); setSidebarOpen(false) }}
      />

      <ConfirmHost />

      {/* Right column: topbar (mobile) + content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Mobile / tablet topbar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 text-white flex-shrink-0"
          style={{ background: '#0a0a0f', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <ActiveIcon size={15} className="flex-shrink-0 text-white/40" />
            <span className="font-bold text-sm truncate text-white/80">{activeLabel}</span>
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

        {/* Notifications panel */}
        {notificationsOpen && (
          <div className="fixed top-14 right-4 z-50 w-80 rounded-2xl overflow-hidden"
            style={{ background: '#141420', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-white/40" />
                <span className="font-bold text-white/70 text-sm">Notificações</span>
              </div>
              <button onClick={() => setNotificationsOpen(false)} className="p-1 rounded-lg hover:bg-white/10">
                <X size={14} className="text-white/40" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-white/20 text-sm">
                  Nenhuma notificação
                </div>
              ) : (
                notifications.map((n, i) => (
                  <div key={i} className="px-4 py-3 hover:bg-white/5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="flex items-start gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: n.tempo === 'alerta' ? '#ef4444' : '#2563eb', boxShadow: '0 0 6px ' + (n.tempo === 'alerta' ? '#ef4444' : '#2563eb') }} />
                      <div className="flex-1">
                        <p className="text-sm text-white/70 font-medium">{n.msg}</p>
                        <p className="text-xs text-white/25 mt-0.5">{n.tempo}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-hidden min-w-0 flex flex-col" style={{ background: '#08080d' }}>
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'previsao'  && <PrevisaoGasto />}
          {activeTab === 'mapa'      && <MapaIgrejas />}
          {activeTab === 'mapaeleitoral' && <MapaEleitoral />}
          {activeTab === 'mapasc'        && <MapaSC />}
          {activeTab === 'agenda'    && <Agenda />}
          {activeTab === 'equipe'    && <Equipe />}
          {activeTab === 'eleitores' && <Eleitores />}
          {activeTab === 'pesquisas' && <Pesquisas />}
          {activeTab === 'materiais' && <Materiais />}
          {activeTab === 'apoiadores' && <Apoiadores />}
          {activeTab === 'relatorio' && <Relatorio />}
        </main>
      </div>
    </div>
  )
}
