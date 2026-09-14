import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Flag, X, ChevronRight, LogOut, Search,
  Users, Sun, Moon, ClipboardCheck, PanelLeftClose, ArrowLeftRight,
  Cloud, CloudOff, Loader2, RefreshCw, CheckCircle2, AlertCircle,
} from 'lucide-react'
import { useTheme } from '../theme/ThemeContext'
import { getDetailedSyncStatus, SYNC_DETAIL_EVENT, getChurchSyncError } from '../lib/cloudSync'
import { usePresence, presenceDisplayName } from '../hooks/usePresence'
import { useMobileLayout } from '../hooks/useViewportMode'
import { APP_VERSION } from '../constants/appVersion'

const NAV_GROUPS = [
  { id: 'operacao', label: 'Operação', ids: ['dashboard', 'agenda', 'previsao', 'tesouraria'] },
  { id: 'campo', label: 'Campo', ids: ['equipe', 'campovisitas', 'eleitores', 'mapaeleitoral', 'mapasc'] },
  { id: 'rede', label: 'Rede', ids: ['apoiadores', 'empresas', 'materiais'] },
  { id: 'analise', label: 'Análise', ids: ['pesquisas', 'relatorio'] },
  { id: 'sistema', label: 'Sistema', ids: ['configuracoes'] },
]

const STATUS_LABEL = {
  synced: 'Sincronizado',
  pending: 'Pendente',
  syncing: 'Sincronizando…',
  error: 'Erro',
}

function statusMeta(status) {
  if (status === 'error') return { color: '#f87171', Icon: AlertCircle }
  if (status === 'pending' || status === 'syncing') return { color: '#fbbf24', Icon: Loader2 }
  return { color: '#34d399', Icon: CheckCircle2 }
}

function autoSaveLabel({ cloudSyncError, cloudPending, cloudFlushing, lastAutoSaveAt, teamSyncActive = false }) {
  if (teamSyncActive) return 'Sincronizando com a equipe…'
  if (cloudSyncError) return 'Falha na sincronização'
  if (cloudFlushing) return 'Enviando dados…'
  if (cloudPending > 0) return `Na fila (${cloudPending})…`
  if (lastAutoSaveAt) {
    const sec = Math.floor((Date.now() - lastAutoSaveAt) / 1000)
    if (sec < 20) return 'Salvo agora'
    if (sec < 60) return `Salvo há ${sec}s`
    const min = Math.floor(sec / 60)
    if (min < 60) return `Salvo há ${min} min`
    return 'Sincronizado'
  }
  return 'Sincronização ativa'
}

function autoSaveColor({ cloudSyncError, cloudPending, cloudFlushing, teamSyncActive = false }) {
  if (cloudSyncError) return 'var(--danger)'
  if (teamSyncActive || cloudFlushing || cloudPending > 0) return 'var(--warning)'
  return 'var(--success)'
}

function initialsFrom(name, email) {
  const src = String(name || email || 'C').trim()
  const parts = src.split(/[\s@._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

function useIsMobileNav() {
  return useMobileLayout()
}

function SyncDiagnosticPopover({
  open,
  onClose,
  cloudSyncError,
  onForceSync,
  syncingForce,
  anchorRef,
}) {
  const [detail, setDetail] = useState(() => getDetailedSyncStatus())
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    setDetail(getDetailedSyncStatus())
    const onDetail = (e) => setDetail(e.detail || getDetailedSyncStatus())
    window.addEventListener(SYNC_DETAIL_EVENT, onDetail)
    const t = setInterval(() => setDetail(getDetailedSyncStatus()), 1500)
    return () => {
      window.removeEventListener(SYNC_DETAIL_EVENT, onDetail)
      clearInterval(t)
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    function onDoc(e) {
      if (panelRef.current?.contains(e.target)) return
      if (anchorRef?.current?.contains(e.target)) return
      onClose()
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  // Erro de igrejas é isolado — não conta como falha crítica do sync principal
  const criticalError = Boolean(cloudSyncError || detail.lastSyncError || detail.keys?.some(k => k.status === 'error'))
  const churchError = getChurchSyncError()
  const hasError = criticalError
  const HeaderIcon = hasError ? CloudOff : Cloud

  return (
    <div
      ref={panelRef}
      className="absolute left-0 bottom-full mb-2 z-[120] w-[280px] overflow-hidden"
      style={{
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: 8,
        boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
      }}
      role="dialog"
      aria-label="Status da Nuvem"
    >
      <div className="flex items-center gap-2.5 px-3.5 py-3" style={{ borderBottom: '1px solid #1e293b' }}>
        <HeaderIcon size={16} className="flex-shrink-0" style={{ color: hasError ? '#f87171' : '#94a3b8' }} />
        <div className="min-w-0 flex-1">
          <p className="text-white font-medium" style={{ fontSize: 13 }}>Status da Nuvem</p>
          {detail.lastSyncError && (
            <p className="truncate mt-0.5" style={{ fontSize: 10, color: '#f87171' }}>{detail.lastSyncError}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded"
          style={{ color: '#64748b', background: 'transparent', border: 'none' }}
          aria-label="Fechar"
        >
          <X size={14} />
        </button>
      </div>

      <ul className="px-2 py-2 space-y-0.5">
        {(detail.keys || []).map((row) => {
          const meta = statusMeta(row.status)
          const Icon = meta.Icon
          return (
            <li
              key={row.key}
              className="flex items-start gap-2.5 px-2 py-2 rounded"
              style={{ background: row.status === 'error' ? 'rgba(248,113,113,0.06)' : 'transparent' }}
            >
              <Icon
                size={14}
                className={`flex-shrink-0 mt-0.5 ${row.status === 'syncing' ? 'animate-spin' : ''}`}
                style={{ color: meta.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-200 font-medium" style={{ fontSize: 12 }}>{row.label}</span>
                  <span style={{ fontSize: 11, color: meta.color, fontWeight: 500 }}>
                    {STATUS_LABEL[row.status] || row.status}
                  </span>
                </div>
                {row.error && (
                  <p className="mt-0.5 truncate" style={{ fontSize: 10, color: '#94a3b8' }}>{row.error}</p>
                )}
              </div>
            </li>
          )
        })}
        {churchError && (
          <li className="flex items-start gap-2.5 px-2 py-2 rounded" style={{ background: 'rgba(148,163,184,0.04)' }}>
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#94a3b8' }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400 font-medium" style={{ fontSize: 12 }}>Mapa de Igrejas</span>
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>Pendente</span>
              </div>
              <p className="mt-0.5 truncate" style={{ fontSize: 10, color: '#64748b' }}>Será sincronizado em breve</p>
            </div>
          </li>
        )}
      </ul>

      <div className="px-3 pb-3 pt-1">
        <button
          type="button"
          disabled={syncingForce}
          onClick={() => onForceSync?.()}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-white font-medium"
          style={{
            background: syncingForce ? '#1e293b' : '#1e3a5f',
            border: '1px solid #334155',
            borderRadius: 6,
            fontSize: 12.5,
            opacity: syncingForce ? 0.75 : 1,
            cursor: syncingForce ? 'wait' : 'pointer',
          }}
        >
          {syncingForce
            ? <><Loader2 size={14} className="animate-spin" /> Sincronizando...</>
            : <><RefreshCw size={14} /> Forçar Sincronização</>}
        </button>
      </div>
    </div>
  )
}

export default function Sidebar({
  tabs, activeTab, onTabChange, open, onClose, badgeCounts = {},
  userEmail, tenantName, onLogout, onOpenAccess, onOpenApprovals,
  pendingApprovals = 0, onSearch, cloudPending = 0, cloudFlushing = false, cloudSyncError = null,
  lastAutoSaveAt = null, onSyncNow,
  tenants = [], onSwitchTenant,
}) {
  const [expanded, setExpanded] = useState(true)
  const [, timeTick] = useState(0)
  const [syncPanelOpen, setSyncPanelOpen] = useState(false)
  const [syncingForce, setSyncingForce] = useState(false)
  const [teamSyncActive, setTeamSyncActive] = useState(false)
  const syncAnchorRef = useRef(null)
  const { toggleTheme, isLight } = useTheme()
  const isMobile = useIsMobileNav()
  const showExpanded = isMobile ? true : expanded

  useEffect(() => {
    const applyDetail = (d) => {
      setTeamSyncActive(Boolean(d?.teamSyncActive))
    }
    applyDetail(getDetailedSyncStatus())
    const onDetail = (e) => applyDetail(e.detail || getDetailedSyncStatus())
    window.addEventListener(SYNC_DETAIL_EVENT, onDetail)
    const t = setInterval(() => applyDetail(getDetailedSyncStatus()), 1500)
    return () => {
      window.removeEventListener(SYNC_DETAIL_EVENT, onDetail)
      clearInterval(t)
    }
  }, [])

  useEffect(() => {
    if (!lastAutoSaveAt || cloudPending > 0 || cloudSyncError) return undefined
    const t = setInterval(() => timeTick(n => n + 1), 10000)
    return () => clearInterval(t)
  }, [lastAutoSaveAt, cloudPending, cloudSyncError])

  useEffect(() => {
    if (!cloudSyncError && cloudPending === 0 && syncingForce) {
      setSyncingForce(false)
    }
  }, [cloudSyncError, cloudPending, syncingForce])

  useEffect(() => {
    if (!isMobile || !open) return undefined
    const html = document.documentElement
    const body = document.body
    const prevHtml = html.style.overflow
    const prevBody = body.style.overflow
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    return () => {
      html.style.overflow = prevHtml
      body.style.overflow = prevBody
    }
  }, [isMobile, open])

  const grouped = useMemo(() => {
    const byId = Object.fromEntries(tabs.map(t => [t.id, t]))
    const used = new Set()
    const groups = NAV_GROUPS.map(g => {
      const items = g.ids.map(id => byId[id]).filter(Boolean)
      items.forEach(t => used.add(t.id))
      return { ...g, items }
    }).filter(g => g.items.length > 0)
    const orphan = tabs.filter(t => !used.has(t.id))
    if (orphan.length) groups.push({ id: 'outros', label: 'Outros', items: orphan })
    return groups
  }, [tabs])

  const syncLabel = autoSaveLabel({ cloudSyncError, cloudPending, cloudFlushing, lastAutoSaveAt, teamSyncActive })
  const syncColor = autoSaveColor({ cloudSyncError, cloudPending, cloudFlushing, teamSyncActive })
  const avatar = initialsFrom(tenantName, userEmail)
  const presence = usePresence(userEmail)

  function handleSelect(tab) {
    if (!tab.available) return
    onTabChange(tab.id)
    onClose()
  }

  function handleSearch() {
    onSearch?.()
    onClose()
  }

  async function handleForceSync() {
    if (!onSyncNow || syncingForce) return
    setSyncingForce(true)
    try {
      await Promise.resolve(onSyncNow())
    } catch {
      /* status via eventos */
    } finally {
      setTimeout(() => setSyncingForce(false), 500)
    }
  }

  function openSyncPanel() {
    setSyncPanelOpen(v => !v)
  }

  const desktopW = expanded ? 'w-[260px]' : 'w-[78px]'

  const shell = (
    <aside
      className={`
        sb-shell
        flex flex-col overflow-hidden
        ${isMobile
          ? `fixed inset-y-0 left-0 h-[100svh] w-[min(260px,86vw)] ${open
            ? 'translate-x-0 pointer-events-auto'
            : '-translate-x-full pointer-events-none'}`
          : `relative static h-full ${desktopW}`}
      `}
      style={{
        zIndex: isMobile ? 10050 : undefined,
        transition: isMobile ? 'transform 0.28s cubic-bezier(0.16,1,0.3,1)' : undefined,
        willChange: isMobile ? 'transform' : undefined,
        visibility: isMobile && !open ? 'hidden' : undefined,
      }}
      aria-hidden={isMobile && !open ? true : undefined}
    >
      <style>{`
        @media (min-width: 1024px), (pointer: fine) {
          html[data-layout="web"] aside.sb-shell,
          aside.sb-shell {
            width: ${expanded ? 256 : 72}px !important;
            transform: none !important;
            visibility: visible !important;
            pointer-events: auto !important;
          }
          html[data-layout="web"] aside.sb-shell {
            position: static !important;
            height: 100% !important;
          }
        }
        .sb-item { position: relative; }
        .sb-tooltip {
          position: absolute;
          left: calc(100% + 10px);
          top: 50%; transform: translateY(-50%) translateX(-4px);
          background: var(--bg-overlay);
          color: var(--text-primary);
          font-size: 11px; font-weight: 600;
          padding: 5px 10px;
          border-radius: 8px;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.12s, transform 0.12s;
          border: 1px solid var(--border-subtle);
          box-shadow: var(--shadow-md);
          z-index: 100;
        }
        .sb-item:hover .sb-tooltip { opacity: 1; transform: translateY(-50%) translateX(0); }
        .sb-foot-link {
          display: flex;
          align-items: center;
          gap: 9px;
          width: 100%;
          padding: 8px 10px;
          border-radius: 8px;
          font-size: 12.5px;
          font-weight: 500;
          color: var(--text-secondary);
          background: transparent;
          border: none;
          text-align: left;
          transition: background 0.15s, color 0.15s;
        }
        .sb-foot-link:hover {
          background: var(--nav-hover);
          color: var(--text-primary);
        }
        .sb-icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border-radius: 7px;
          color: var(--text-tertiary);
          background: transparent;
          border: none;
          transition: background 0.15s, color 0.15s;
        }
        .sb-icon-btn:hover {
          background: var(--nav-hover);
          color: var(--text-primary);
        }
      `}</style>

      <button
        type="button"
        onClick={onClose}
        className={`absolute top-3 right-3 p-1.5 rounded-lg z-10${isMobile ? '' : ' hidden'}`}
        style={{ color: 'var(--text-tertiary)' }}
        aria-label="Fechar menu"
      >
        <X size={16} />
      </button>

      <div className={`flex-shrink-0 ${showExpanded ? 'px-4 pt-5 pb-3' : 'px-2 pt-5 pb-3'}`}>
        <div className={`flex items-center ${showExpanded ? 'gap-3' : 'justify-center'}`}>
          <div
            className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(145deg, var(--gold-bright), var(--gold-deep))',
              boxShadow: '0 2px 8px color-mix(in srgb, var(--gold) 28%, transparent)',
            }}
          >
            <Flag size={15} style={{ color: 'var(--ink-on-gold)' }} />
          </div>
          {showExpanded && (
            <div className="min-w-0 overflow-hidden">
              <p style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text-primary)', lineHeight: 1.15 }}>
                Campanha
              </p>
              <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--gold)', marginTop: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Sala de comando
              </p>
            </div>
          )}
        </div>
      </div>

      {onSearch && (
        <div className={`flex-shrink-0 pb-3 ${showExpanded ? 'px-3' : 'px-2'}`}>
          <button
            type="button"
            onClick={handleSearch}
            className={`sb-item w-full flex items-center rounded-[10px] transition-colors group relative
              ${showExpanded ? 'gap-2.5 px-3 py-2.5' : 'justify-center py-2.5'}`}
            style={{
              background: 'var(--bg-raised)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <Search size={15} strokeWidth={1.75} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
            {showExpanded && (
              <>
                <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-tertiary)' }}>Buscar…</span>
                <span
                  className="ml-auto hidden lg:inline"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--text-faint)',
                    letterSpacing: '0.02em',
                  }}
                >
                  Ctrl K
                </span>
              </>
            )}
            {!showExpanded && <div className="sb-tooltip">Buscar (Ctrl K)</div>}
          </button>
        </div>
      )}

      <nav
        className={`scroll-y-smooth flex-1 min-h-0 pb-4 ${showExpanded ? 'px-2.5' : 'px-1.5'}`}
        style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}
      >
        {grouped.map(group => (
          <div key={group.id} className="mb-0.5">
            {showExpanded && <div className="sb-nav-group">{group.label}</div>}
            {!showExpanded && (
              <div className="my-2 mx-2.5" style={{ height: 1, background: 'var(--border-subtle)' }} />
            )}
            {group.items.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              const badge = badgeCounts[tab.id] || 0

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleSelect(tab)}
                  className={`sb-item sb-nav-item w-full flex items-center rounded-[10px] mb-px group
                    ${isActive ? 'active' : ''}
                    ${showExpanded ? 'gap-2.5 px-2.5 py-[9px]' : 'justify-center px-0 py-2'}`}
                >
                  <div className="relative flex-shrink-0 flex items-center justify-center" style={{ width: 20, height: 20 }}>
                    <Icon
                      size={16}
                      strokeWidth={isActive ? 2.2 : 1.75}
                      style={{ color: isActive ? 'var(--gold)' : 'var(--text-faint)' }}
                    />
                    {badge > 0 && (
                      <span
                        className="absolute -top-1.5 -right-2.5 min-w-[14px] h-3.5 px-0.5 flex items-center justify-center rounded-full text-[8px] font-bold"
                        style={{ background: 'var(--danger)', color: '#fff' }}
                      >
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                  </div>

                  {showExpanded && (
                    <span
                      className="truncate"
                      style={{
                        fontSize: 13,
                        fontWeight: isActive ? 600 : 500,
                        color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      }}
                    >
                      {tab.label}
                    </span>
                  )}

                  {!showExpanded && <div className="sb-tooltip">{tab.label}</div>}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      <div
        className="flex-shrink-0 mt-auto"
        style={{
          borderTop: '1px solid var(--border-subtle)',
          paddingBottom: 'max(8px, env(safe-area-inset-bottom, 0px))',
        }}
      >
        {showExpanded ? (
          <div className="p-3 space-y-1">
            <div className="relative mb-1" ref={syncAnchorRef}>
              <button
                type="button"
                onClick={openSyncPanel}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
                title="Ver status da nuvem"
                style={{
                  background: syncPanelOpen ? 'var(--nav-hover)' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <span className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: syncColor }} />
                <span style={{ fontSize: 11, fontWeight: 500, color: cloudSyncError ? 'var(--danger)' : 'var(--text-faint)' }}>
                  {syncLabel}
                </span>
              </button>
              <SyncDiagnosticPopover
                open={syncPanelOpen}
                onClose={() => setSyncPanelOpen(false)}
                cloudSyncError={cloudSyncError}
                onForceSync={handleForceSync}
                syncingForce={syncingForce}
                anchorRef={syncAnchorRef}
              />
            </div>

            {(onOpenAccess || onOpenApprovals) && (
              <div className="pb-1">
                {onOpenAccess && (
                  <button type="button" onClick={() => { onOpenAccess(); onClose() }} className="sb-foot-link">
                    <Users size={14} strokeWidth={1.75} />
                    <span className="flex-1 truncate">Acesso da equipe</span>
                  </button>
                )}
                {onOpenApprovals && (
                  <button type="button" onClick={() => { onOpenApprovals(); onClose() }} className="sb-foot-link">
                    <ClipboardCheck size={14} strokeWidth={1.75} />
                    <span className="flex-1 truncate">Aprovações</span>
                    {pendingApprovals > 0 && (
                      <span
                        className="min-w-[18px] h-[18px] px-1 rounded-md flex items-center justify-center text-[10px] font-bold"
                        style={{
                          background: 'color-mix(in srgb, var(--warning) 20%, transparent)',
                          color: 'var(--warning)',
                        }}
                      >
                        {pendingApprovals > 99 ? '99+' : pendingApprovals}
                      </span>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Presença: quem está ativo agora */}
            {presence.count > 0 && (
              <div
                className="px-2.5 py-2 rounded-lg"
                style={{ background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.18)' }}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span
                    className="rounded-full flex-shrink-0 animate-pulse"
                    style={{ width: 6, height: 6, background: '#34d399' }}
                  />
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: '#34d399' }}>
                    {presence.count === 1 ? '1 pessoa online' : `${presence.count} pessoas online`}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {presence.users.slice(0, 5).map(u => (
                    <div key={u.email} className="flex items-center gap-1.5">
                      <div
                        className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(52,211,153,0.18)', fontSize: 8, fontWeight: 700, color: '#34d399' }}
                      >
                        {(u.nome || u.email || '?').slice(0, 1).toUpperCase()}
                      </div>
                      <span
                        className="truncate"
                        style={{
                          fontSize: 10.5,
                          color: u.email === presence.selfEmail ? '#a7f3d0' : 'var(--text-secondary)',
                          fontWeight: u.email === presence.selfEmail ? 600 : 400,
                        }}
                      >
                        {presenceDisplayName(u, presence.selfEmail)}
                      </span>
                    </div>
                  ))}
                  {presence.count > 5 && (
                    <p style={{ fontSize: 10, color: 'var(--text-faint)', paddingLeft: 20 }}>
                      +{presence.count - 5} outros
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Trocar de campanha — aparece quando o usuário tem acesso a mais de 1 */}
            {tenants.length > 1 && onSwitchTenant && (
              <button
                type="button"
                onClick={() => { onSwitchTenant(); onClose?.() }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }}
              >
                <ArrowLeftRight size={13} strokeWidth={1.75} />
                <span className="flex-1 truncate text-left">Trocar de campanha</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(99,102,241,0.25)' }}>
                  {tenants.length}
                </span>
              </button>
            )}

            <div
              className="flex items-center gap-2.5 px-2 py-2 rounded-[10px]"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  background: 'color-mix(in srgb, var(--gold) 16%, transparent)',
                  color: 'var(--gold)',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {avatar}
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="truncate" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                  {tenantName || 'Coordenação'}
                </p>
                <p className="truncate" style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-faint)', marginTop: 2 }}>
                  {userEmail || 'Sessão ativa'}
                </p>
                <p style={{ fontSize: 9, color: 'var(--text-faint)', opacity: 0.5, marginTop: 1 }}>v{APP_VERSION}</p>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button type="button" className="sb-icon-btn" onClick={toggleTheme} title={isLight ? 'Modo escuro' : 'Modo claro'}>
                  {isLight ? <Moon size={14} strokeWidth={1.75} /> : <Sun size={14} strokeWidth={1.75} />}
                </button>
                {onLogout && (
                  <button type="button" className="sb-icon-btn" onClick={onLogout} title="Sair">
                    <LogOut size={14} strokeWidth={1.75} />
                  </button>
                )}
                <button
                  type="button"
                  className="sb-icon-btn hidden lg:inline-flex"
                  onClick={() => setExpanded(false)}
                  title="Recolher"
                >
                  <PanelLeftClose size={14} strokeWidth={1.75} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-1.5 py-3 flex flex-col items-center gap-1">
            <div className="relative" ref={syncAnchorRef}>
              <button
                type="button"
                onClick={openSyncPanel}
                className="sb-item sb-icon-btn relative group"
                title={syncLabel}
              >
                <span className="rounded-full block" style={{ width: 6, height: 6, background: syncColor }} />
                <div className="sb-tooltip">{syncLabel}</div>
              </button>
              <SyncDiagnosticPopover
                open={syncPanelOpen}
                onClose={() => setSyncPanelOpen(false)}
                cloudSyncError={cloudSyncError}
                onForceSync={handleForceSync}
                syncingForce={syncingForce}
                anchorRef={syncAnchorRef}
              />
            </div>
            {tenants.length > 1 && onSwitchTenant && (
              <button type="button" onClick={() => { onSwitchTenant(); onClose?.() }} className="sb-item sb-icon-btn relative group" title="Trocar de campanha">
                <ArrowLeftRight size={15} strokeWidth={1.75} />
                <div className="sb-tooltip">Trocar campanha</div>
              </button>
            )}
            {onOpenAccess && (
              <button type="button" onClick={onOpenAccess} className="sb-item sb-icon-btn relative group" title="Acesso da equipe">
                <Users size={15} strokeWidth={1.75} />
                <div className="sb-tooltip">Acesso da equipe</div>
              </button>
            )}
            {onOpenApprovals && (
              <button type="button" onClick={onOpenApprovals} className="sb-item sb-icon-btn relative group" title="Aprovações">
                <ClipboardCheck size={15} strokeWidth={1.75} />
                {pendingApprovals > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--warning)' }} />
                )}
                <div className="sb-tooltip">Aprovações</div>
              </button>
            )}
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center my-1"
              style={{
                background: 'color-mix(in srgb, var(--gold) 16%, transparent)',
                color: 'var(--gold)',
                fontSize: 10,
                fontWeight: 700,
              }}
              title={tenantName || 'Coordenação'}
            >
              {avatar}
            </div>
            <button type="button" className="sb-item sb-icon-btn relative group" onClick={toggleTheme} title={isLight ? 'Modo escuro' : 'Modo claro'}>
              {isLight ? <Moon size={14} strokeWidth={1.75} /> : <Sun size={14} strokeWidth={1.75} />}
              <div className="sb-tooltip">{isLight ? 'Modo escuro' : 'Modo claro'}</div>
            </button>
            {onLogout && (
              <button type="button" className="sb-item sb-icon-btn relative group" onClick={onLogout} title="Sair">
                <LogOut size={14} strokeWidth={1.75} />
                <div className="sb-tooltip">Sair</div>
              </button>
            )}
            <button type="button" className="sb-icon-btn hidden lg:inline-flex" onClick={() => setExpanded(true)} title="Expandir">
              <ChevronRight size={14} strokeWidth={1.75} />
            </button>
          </div>
        )}
      </div>
    </aside>
  )

  const overlay = isMobile && open ? (
    <div
      role="presentation"
      className="fixed inset-0"
      style={{
        zIndex: 10040,
        background: 'rgba(0,0,0,0.55)',
      }}
      onClick={onClose}
    />
  ) : null

  if (isMobile && typeof document !== 'undefined') {
    return (
      <>
        <div className="hidden lg:block" aria-hidden />
        {createPortal(
          <>
            {overlay}
            {shell}
          </>,
          document.body,
        )}
      </>
    )
  }

  return (
    <>
      {overlay}
      {shell}
    </>
  )
}

