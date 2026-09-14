import { ModuleWrap, CommandHeader, KpiStrip, StatGrid } from '../components/ui'

/**
 * Executive/Dashboard archetype — KPIs + optional sidebar on desktop.
 */
export default function ExecutiveLayout({
  eyebrow,
  title,
  subtitle,
  icon,
  headerActions,
  kpis,
  kpiColumns,
  stats,
  statColumns,
  sidebar,
  children,
  className = '',
  wrapClassName = '',
}) {
  const hasSidebar = Boolean(sidebar)

  return (
    <div className={`layout-executive ${className}`}>
      <ModuleWrap className={wrapClassName}>
        <CommandHeader
          eyebrow={eyebrow}
          title={title}
          subtitle={subtitle}
          icon={icon}
          actions={headerActions}
        />

        {stats?.length > 0 && (
          <StatGrid stats={stats} columns={statColumns} className="layout-executive__kpis" />
        )}

        {kpis?.length > 0 && !stats?.length && (
          <KpiStrip items={kpis} columns={kpiColumns} className="layout-executive__kpis" />
        )}

        <div className={`layout-executive__grid${hasSidebar ? ' has-sidebar' : ''}`}>
          <main className="layout-executive__main">{children}</main>
          {hasSidebar && <aside className="layout-executive__sidebar">{sidebar}</aside>}
        </div>
      </ModuleWrap>
    </div>
  )
}
