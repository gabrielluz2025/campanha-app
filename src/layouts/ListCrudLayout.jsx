import { ModuleWrap, CommandHeader, KpiStrip } from '../components/ui'

/**
 * List/CRUD archetype — header, optional KPIs, scrollable record list, sticky footer.
 */
export default function ListCrudLayout({
  eyebrow,
  title,
  subtitle,
  icon,
  headerActions,
  kpis,
  kpiColumns,
  toolbar,
  children,
  footer,
  maxWidth,
  className = '',
  wrapClassName = '',
}) {
  return (
    <div className={`layout-list-crud ${className}`}>
      <ModuleWrap className={`flex flex-col flex-1 min-h-0 py-4 lg:py-6 ${wrapClassName}`} style={maxWidth ? { maxWidth } : undefined}>
        <CommandHeader
          eyebrow={eyebrow}
          title={title}
          subtitle={subtitle}
          icon={icon}
          actions={headerActions}
          className="mb-4 lg:mb-5 flex-shrink-0"
        />

        {kpis?.length > 0 && (
          <KpiStrip items={kpis} columns={kpiColumns} className="mb-4 flex-shrink-0" />
        )}

        {toolbar && <div className="layout-list-crud__toolbar">{toolbar}</div>}

        <div className="layout-list-crud__scroll">
          <div className="layout-list-crud__list">{children}</div>
        </div>

        {footer && <div className="layout-list-crud__footer">{footer}</div>}
      </ModuleWrap>
    </div>
  )
}
