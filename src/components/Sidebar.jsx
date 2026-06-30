import { useState, useRef } from 'react'
import { Flag, X, ChevronLeft, ChevronRight, User, Download, Upload, LogOut, Search } from 'lucide-react'
import { exportarBackup, importarBackup } from '../utils/backup'

const ICON_COLORS = {
  dashboard: { from: '#2563eb', to: '#06b6d4' },
  previsao: { from: '#f59e0b', to: '#f97316' },
  agenda: { from: '#3b82f6', to: '#2563eb' },
  equipe: { from: '#10b981', to: '#059669' },
  eleitores: { from: '#ec4899', to: '#db2777' },
  mapa: { from: '#14b8a6', to: '#0d9488' },
  pesquisas: { from: '#06b6d4', to: '#0891b2' },
  materiais: { from: '#84cc16', to: '#65a30d' },
  apoiadores: { from: '#f43f5e', to: '#e11d48' },
  relatorio: { from: '#a78bfa', to: '#0891b2' },
}

export default function Sidebar({ tabs, activeTab, onTabChange, open, onClose, badgeCounts = {}, userEmail, onLogout, onSearch }) {
  const [expanded, setExpanded] = useState(true)
  const fileRef = useRef(null)

  function handleSelect(tab) {
    if (!tab.available) return
    onTabChange(tab.id)
    onClose()
  }

  function handleExport() {
    const n = exportarBackup()
    alert(`Backup gerado com sucesso (${n} conjuntos de dados).`)
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!confirm('Restaurar este backup vai SUBSTITUIR os dados atuais do sistema. Deseja continuar?')) return
    try {
      const n = await importarBackup(file)
      alert(`Backup restaurado (${n} conjuntos de dados). A página será recarregada.`)
      window.location.reload()
    } catch (err) {
      alert(err.message || 'Falha ao restaurar o backup.')
    }
  }

  const w = expanded ? 'w-[260px]' : 'w-[78px]'

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={onClose} />
      )}

      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          ${open ? 'w-[260px]' : 'w-0 -translate-x-full'}
          lg:translate-x-0 lg:${w}
          flex flex-col text-white
          transition-all duration-300 ease-in-out
          lg:h-screen overflow-hidden
        `}
        style={{
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-subtle)',
          width: undefined,
        }}
      >
        <style>{`
          @media (min-width: 1024px) {
            aside { width: ${expanded ? 260 : 78}px !important; transform: none !important; }
          }
          .sb-item { position: relative; }
          .sb-item::before {
            content: '';
            position: absolute;
            left: 0; top: 0; bottom: 0; width: 3px;
            border-radius: 0 4px 4px 0;
            background: transparent;
            transition: background 0.2s;
          }
          .sb-item.active::before {
            background: linear-gradient(180deg, #5b9bff, #2563eb);
            box-shadow: 0 0 12px rgba(91,155,255,0.5);
          }
          .sb-tooltip {
            position: absolute;
            left: calc(100% + 12px);
            top: 50%; transform: translateY(-50%) translateX(-4px);
            background: var(--bg-overlay);
            color: #fff;
            font-size: 12px; font-weight: 700;
            padding: 6px 12px;
            border-radius: 10px;
            white-space: nowrap;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.15s, transform 0.15s;
            border: 1px solid var(--border-soft);
            box-shadow: var(--shadow-md);
            z-index: 100;
          }
          .sb-item:hover .sb-tooltip { opacity: 1; transform: translateY(-50%) translateX(0); }
        `}</style>

        <button onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-white/40 hover:text-white hover:srf/10 transition-all lg:hidden z-10">
          <X size={16} />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-3 px-4 pt-5 pb-4 flex-shrink-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #fbbf24, #f97316)', boxShadow: '0 4px 20px rgba(251,191,36,0.35)' }}>
            <Flag size={18} className="text-black" />
          </div>
          {expanded && (
            <div className="overflow-hidden">
              <p className="text-display font-bold text-white leading-none" style={{ fontSize: 17 }}>Campanha</p>
              <p className="font-semibold" style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>Coordenação Eleitoral</p>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="mx-4 mb-2" style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)' }} />

        {/* Busca global */}
        {onSearch && (
          <div className="px-2.5 pb-1">
            <button onClick={onSearch}
              className={`sb-item w-full flex items-center rounded-xl transition-all group relative
                ${expanded ? 'gap-3 px-3 py-2' : 'px-0 py-2 justify-center'}`}
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
              <Search size={16} className="text-white/40 flex-shrink-0" />
              {expanded && (
                <>
                  <span className="font-medium text-white/45" style={{ fontSize: 12.5 }}>Buscar...</span>
                  <span className="ml-auto font-bold px-1.5 py-0.5 rounded-md text-white/35"
                    style={{ fontSize: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-subtle)' }}>
                    Ctrl K
                  </span>
                </>
              )}
              {!expanded && <div className="sb-tooltip">Buscar (Ctrl K)</div>}
            </button>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {tabs.map((tab, idx) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            const badge = badgeCounts[tab.id] || 0
            const colors = ICON_COLORS[tab.id] || { from: '#2563eb', to: '#06b6d4' }

            return (
              <button
                key={tab.id}
                onClick={() => handleSelect(tab)}
                className={`sb-item w-full flex items-center gap-3 rounded-xl mb-0.5 transition-all duration-200 group
                  ${isActive ? 'active' : ''}
                  ${expanded ? 'px-3 py-2.5' : 'px-0 py-2.5 justify-center'}`}
                style={{
                  background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                }}
              >
                <div className="relative flex-shrink-0">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300"
                    style={{
                      background: isActive
                        ? `linear-gradient(135deg, ${colors.from}, ${colors.to})`
                        : 'rgba(255,255,255,0.04)',
                      boxShadow: isActive ? `0 4px 16px ${colors.from}55` : 'none',
                    }}
                  >
                    <Icon size={17}
                      className={isActive ? 'text-white' : 'text-white/30 group-hover:text-white/60'}
                      style={{ transition: 'all 0.2s' }} />
                  </div>
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[9px] font-black text-white"
                      style={{ background: '#ef4444', boxShadow: '0 0 10px rgba(239,68,68,0.6)', border: '2px solid #0a0a0f' }}>
                      {badge}
                    </span>
                  )}
                </div>

                {expanded && (
                  <span className={`truncate font-semibold transition-colors duration-200
                    ${isActive ? 'text-white' : 'text-white/35 group-hover:text-white/70'}`}
                    style={{ fontSize: 13 }}>
                    {tab.label}
                  </span>
                )}

                {expanded && isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: colors.from, boxShadow: `0 0 8px ${colors.from}` }} />
                )}

                {!expanded && <div className="sb-tooltip">{tab.label}</div>}
              </button>
            )
          })}
        </nav>

        {/* User profile */}
        <div className={`px-3 pt-3 flex-shrink-0 ${expanded ? '' : 'flex justify-center'}`}>
          <div className={`flex items-center gap-3 rounded-xl ${expanded ? 'px-2.5 py-2.5' : 'p-2'}`}
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, var(--accent), #22d3ee)' }}>
              <User size={15} className="text-white" />
            </div>
            {expanded && (
              <div className="overflow-hidden flex-1 min-w-0">
                <p className="font-bold text-white truncate" style={{ fontSize: 12 }}>Coordenação</p>
                <p className="font-medium truncate" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                  {userEmail || 'Online agora'}
                </p>
              </div>
            )}
            {expanded && onLogout ? (
              <button onClick={onLogout} title="Sair"
                className="flex-shrink-0 p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--text-tertiary)' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#f87171' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)' }}>
                <LogOut size={14} />
              </button>
            ) : expanded ? (
              <span className="glow-pulse flex-shrink-0" style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--success)', color: 'var(--success)' }} />
            ) : null}
          </div>
        </div>

        {/* Sair (modo recolhido) */}
        {!expanded && onLogout && (
          <div className="px-3 pt-2 flex-shrink-0 flex justify-center">
            <button onClick={onLogout} title="Sair"
              className="sb-item p-2 rounded-xl transition-colors relative group"
              style={{ color: 'var(--text-tertiary)' }}>
              <LogOut size={15} />
              <div className="sb-tooltip">Sair</div>
            </button>
          </div>
        )}

        {/* Backup / Restaurar */}
        <input ref={fileRef} type="file" accept="application/json,.json"
          onChange={handleImportFile} style={{ display: 'none' }} />
        <div className={`px-3 pt-3 flex-shrink-0 ${expanded ? 'grid grid-cols-2 gap-2' : 'flex flex-col items-center gap-2'}`}>
          <button onClick={handleExport}
            title="Exportar backup"
            className="sb-item flex items-center justify-center gap-1.5 py-2 rounded-xl transition-all group relative"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
            <Download size={14} />
            {expanded && <span className="font-semibold" style={{ fontSize: 11 }}>Backup</span>}
            {!expanded && <div className="sb-tooltip">Exportar backup</div>}
          </button>
          <button onClick={() => fileRef.current?.click()}
            title="Restaurar backup"
            className="sb-item flex items-center justify-center gap-1.5 py-2 rounded-xl transition-all group relative"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
            <Upload size={14} />
            {expanded && <span className="font-semibold" style={{ fontSize: 11 }}>Restaurar</span>}
            {!expanded && <div className="sb-tooltip">Restaurar backup</div>}
          </button>
        </div>

        {/* Collapse toggle */}
        <div className="px-3 py-3 flex-shrink-0 hidden lg:block">
          <button onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl transition-all"
            style={{ fontSize: 11, color: 'var(--text-tertiary)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-raised)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)' }}>
            {expanded ? (
              <>
                <ChevronLeft size={14} />
                <span className="font-semibold">Recolher</span>
              </>
            ) : (
              <ChevronRight size={14} />
            )}
          </button>
        </div>
      </aside>
    </>
  )
}
