import { useState, useEffect, useRef, useCallback } from 'react'
import { Check, Clock, AlertTriangle, Navigation } from 'lucide-react'

/* ═══════════════════════════════════════════════════════════
   useCountUp — animated number counter (ease-out)
═══════════════════════════════════════════════════════════ */
export function useCountUp(target, duration = 1100, deps = []) {
  const [value, setValue] = useState(0)
  const rafRef = useRef(null)

  useEffect(() => {
    const end = Number(target) || 0
    if (end === 0) { setValue(0); return }
    const start = performance.now()
    function tick(now) {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setValue(end * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else setValue(end)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, ...deps])

  return value
}

/* AnimatedNumber — renders a count-up number with formatting */
export function AnimatedNumber({ value, decimals = 0, suffix = '', prefix = '', duration = 1100, className, style }) {
  const v = useCountUp(value, duration)
  const display = decimals > 0
    ? v.toFixed(decimals)
    : Math.round(v).toLocaleString('pt-BR')
  return <span className={className} style={style}>{prefix}{display}{suffix}</span>
}

/* ═══════════════════════════════════════════════════════════
   Card — premium surface with optional hover lift & spotlight
═══════════════════════════════════════════════════════════ */
export function Card({ children, className = '', hover = false, spotlight = false, style, ...rest }) {
  const ref = useRef(null)
  function onMove(e) {
    if (!spotlight || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    ref.current.style.setProperty('--mx', `${e.clientX - r.left}px`)
    ref.current.style.setProperty('--my', `${e.clientY - r.top}px`)
  }
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      className={`surface ${hover ? 'surface-hover' : ''} ${className}`}
      style={{
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
      {...rest}
    >
      {spotlight && (
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.6,
            background: 'radial-gradient(420px circle at var(--mx,-200px) var(--my,-200px), rgba(37,99,235,0.10), transparent 60%)',
          }}
        />
      )}
      {children}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   IconBadge — gradient icon container
═══════════════════════════════════════════════════════════ */
export function IconBadge({ icon: Icon, from = '#2563eb', to = '#06b6d4', size = 40, iconSize, soft = false, className = '' }) {
  return (
    <div
      className={`flex items-center justify-center flex-shrink-0 ${className}`}
      style={{
        width: size, height: size,
        borderRadius: size * 0.32,
        background: soft ? `${from}1f` : `linear-gradient(135deg, ${from}, ${to})`,
        boxShadow: soft ? 'none' : `0 6px 20px ${from}44`,
      }}
    >
      <Icon size={iconSize || size * 0.45} style={{ color: soft ? from : '#fff' }} />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   ProgressRing — animated circular progress
═══════════════════════════════════════════════════════════ */
export function ProgressRing({ pct = 0, size = 96, stroke = 8, from = '#2563eb', to = '#22d3ee', id, label, children }) {
  const gid = id || `ring-${Math.random().toString(36).slice(2, 8)}`
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const animated = useCountUp(pct, 1400)
  const offset = circ * (1 - animated / 100)
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none" stroke={`url(#${gid})`} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
        />
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children || (
          <span className="font-black text-white tnum" style={{ fontSize: size * 0.24 }}>
            {Math.round(animated)}<span style={{ fontSize: size * 0.13, opacity: 0.7 }}>%</span>
          </span>
        )}
        {label && (
          <span
            className="uppercase font-bold text-center leading-tight"
            style={{
              marginTop: 2,
              fontSize: Math.max(8, size * 0.095),
              letterSpacing: '0.06em',
              color: 'rgba(255,255,255,0.78)',
              maxWidth: size * 0.72,
            }}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Skeleton — shimmer loading block
═══════════════════════════════════════════════════════════ */
export function Skeleton({ w = '100%', h = 16, className = '', style }) {
  return <div className={`skeleton ${className}`} style={{ width: w, height: h, ...style }} />
}

/* ═══════════════════════════════════════════════════════════
   ModuleWrap — standard page container with max width + padding
═══════════════════════════════════════════════════════════ */
export function ModuleWrap({ children, className = '', style }) {
  return (
    <div
      className={`w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-9 anim-fade ${className}`}
      style={{ maxWidth: 1420, ...style }}
    >
      {children}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   PageHeader — Sala de Comando: quiet title + gold rule
═══════════════════════════════════════════════════════════ */
export function PageHeader({
  eyebrow = 'Sala de Comando',
  title,
  subtitle,
  icon: Icon,
  actions,
  children,
  className = '',
  // legacy props ignored (kept so old call sites don't break)
  iconFrom, iconTo, glow,
}) {
  void iconFrom; void iconTo; void glow
  return (
    <div className={`page-header mb-6 lg:mb-7 anim-fade-up ${className}`}>
      <div className="page-header-rule" aria-hidden />
      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          {Icon && (
            <div className="page-header-icon">
              <Icon size={22} />
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow mb-1.5" style={{ color: 'var(--gold)' }}>{eyebrow}</p>}
            <h1 className="font-extrabold truncate" style={{ fontSize: 22, color: 'var(--text-primary)', lineHeight: 1.2, letterSpacing: '-0.015em' }}>{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)', maxWidth: 560 }}>{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap flex-shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   KpiStrip — compact metrics row (no floating mini-cards)
═══════════════════════════════════════════════════════════ */
export function KpiStrip({ items = [], columns, className = '' }) {
  const cols = columns || Math.min(Math.max(items.length, 1), 5)
  return (
    <div
      className={`kpi-strip anim-fade-up ${className}`}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {items.map((it, i) => (
        <div key={i} className="kpi-cell">
          <p className="kpi-label">{it.label}</p>
          <p className={`kpi-value${it.gold ? ' is-gold' : ''}`}>
            {typeof it.value === 'number'
              ? <AnimatedNumber value={it.value} prefix={it.prefix || ''} suffix={it.suffix || ''} decimals={it.decimals || 0} />
              : it.value}
          </p>
          {it.hint && <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>{it.hint}</p>}
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   StatGrid — responsive KPI grid
═══════════════════════════════════════════════════════════ */
export function StatGrid({ stats = [], columns, className = '' }) {
  const cols = columns || Math.min(stats.length || 1, 4)
  const gridCls = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[cols] || 'sm:grid-cols-2 lg:grid-cols-4'
  return (
    <div className={`grid grid-cols-1 ${gridCls} gap-3 sm:gap-4 mb-6 ${className}`}>
      {stats.map((s, i) => {
        const Icon = s.icon
        const cor = s.cor || 'var(--accent)'
        return (
          <Card key={i} hover className={`p-5 anim-fade-up stagger-${Math.min(i + 1, 8)}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="eyebrow mb-2">{s.label}</p>
                <div className="font-black tnum" style={{ fontSize: 28, color: 'var(--text-primary)', lineHeight: 1 }}>
                  {typeof s.valor === 'number'
                    ? <AnimatedNumber value={s.valor} prefix={s.prefix || ''} suffix={s.suffix || ''} decimals={s.decimals || 0} />
                    : s.valor}
                </div>
                {s.hint && <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>{s.hint}</p>}
              </div>
              {Icon && <IconBadge icon={Icon} from={cor} to={cor} soft size={42} />}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Button — primary / ghost / danger variants
═══════════════════════════════════════════════════════════ */
export function Button({ children, icon: Icon, variant = 'primary', className = '', style, ...rest }) {
  const cls = variant === 'ghost' ? 'btn-ghost' : variant === 'danger' ? 'btn-danger' : 'btn-primary'
  return (
    <button
      className={`${cls} inline-flex items-center justify-center gap-2 font-bold ${className}`}
      style={{ padding: '9px 16px', fontSize: 13, ...style }}
      {...rest}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════
   EmptyState — friendly empty placeholder
═══════════════════════════════════════════════════════════ */
export function EmptyState({ icon: Icon, title, subtitle, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-16 px-6 anim-fade ${className}`}>
      {Icon && (
        <div
          className="flex items-center justify-center mb-4"
          style={{
            width: 64, height: 64, borderRadius: 20,
            background: 'var(--bg-raised)', border: '1px solid var(--border-soft)',
          }}
        >
          <Icon size={28} style={{ color: 'var(--text-tertiary)' }} />
        </div>
      )}
      {title && <h3 className="font-bold mb-1" style={{ fontSize: 16, color: 'var(--text-primary)' }}>{title}</h3>}
      {subtitle && <p className="text-sm mb-5" style={{ color: 'var(--text-tertiary)', maxWidth: 360 }}>{subtitle}</p>}
      {action}
    </div>
  )
}

/* selectDark — shared className for native <select> elements */
export const selectDark = 'input-dark px-3 py-2.5 rounded-xl text-sm focus:outline-none cursor-pointer'

/* ═══════════════════════════════════════════════════════════
   Pill — small status badge
═══════════════════════════════════════════════════════════ */
export function Pill({ children, color = '#2563eb', dot = false, glow = false, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-bold ${className}`}
      style={{
        fontSize: 11,
        padding: '4px 10px',
        borderRadius: 999,
        color,
        background: `${color}14`,
        border: `1px solid ${color}26`,
      }}
    >
      {dot && <span className={glow ? 'glow-pulse' : ''} style={{ width: 6, height: 6, borderRadius: 999, background: color, color, display: 'block' }} />}
      {children}
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════
   v2 Field Utility — StatusPill, RecordCard, SegmentedControl,
   BottomSheet, FieldHeader, CommandHeader
═══════════════════════════════════════════════════════════ */

const STATUS_VARIANTS = {
  visitada: { icon: Check, label: 'Visitada' },
  pendente: { icon: Clock, label: 'Pendente' },
  esgotado: { icon: AlertTriangle, label: 'Esgotado' },
  'em-rota': { icon: Navigation, label: 'Em rota' },
}

export function StatusPill({
  variant = 'pendente',
  label,
  pulse = false,
  bordered = true,
  className = '',
}) {
  const cfg = STATUS_VARIANTS[variant] || STATUS_VARIANTS.pendente
  const Icon = cfg.icon
  const text = label ?? cfg.label
  return (
    <span
      className={`status-pill status-pill--${variant}${bordered ? ' status-pill--bordered' : ''}${pulse ? ' status-pill--pulse' : ''} ${className}`}
    >
      {pulse ? (
        <span className="status-pill__dot" aria-hidden />
      ) : (
        <Icon size={12} className="status-pill__icon" aria-hidden />
      )}
      {text}
    </span>
  )
}

export function RecordCard({
  primary,
  secondary,
  meta,
  status,
  statusVariant,
  statusPulse = false,
  lead,
  icon: Icon,
  onClick,
  actions,
  children,
  className = '',
}) {
  const interactive = Boolean(onClick)
  const Comp = interactive ? 'button' : 'div'
  return (
    <Comp
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      className={`record-card${interactive ? ' record-card--interactive' : ''} w-full text-left ${className}`}
    >
      {(lead || Icon) && (
        <div className="record-card__lead">
          {lead || (Icon && <Icon size={18} style={{ color: 'var(--text-secondary)' }} />)}
        </div>
      )}
      <div className="record-card__body">
        {primary && <div className="record-card__primary">{primary}</div>}
        {secondary && <div className="record-card__secondary">{secondary}</div>}
        {meta && <div className="record-card__meta">{meta}</div>}
        {children}
      </div>
      {(status || statusVariant || actions) && (
        <div className="record-card__trail">
          {status}
          {!status && statusVariant && (
            <StatusPill variant={statusVariant} pulse={statusPulse} bordered={false} />
          )}
          {actions}
        </div>
      )}
    </Comp>
  )
}

export function SegmentedControl({
  options = [],
  value,
  onChange,
  fixedBottom = false,
  className = '',
  'aria-label': ariaLabel = 'Seções',
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`segmented-control${fixedBottom ? ' segmented-control--fixed-bottom' : ''} ${className}`}
    >
      {options.map(opt => {
        const active = value === opt.id
        const OptIcon = opt.icon
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`segmented-control__btn${active ? ' is-active' : ''}`}
            onClick={() => onChange?.(opt.id)}
          >
            {OptIcon && <OptIcon size={14} />}
            <span className="truncate">{opt.label}</span>
            {opt.badge != null && opt.badge > 0 && (
              <span
                className="font-bold tnum"
                style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 999,
                  background: active ? 'rgba(0,0,0,0.2)' : 'var(--bg-overlay)',
                  color: active ? 'inherit' : 'var(--text-tertiary)',
                }}
              >
                {opt.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

const SNAP_ORDER = ['closed', 'peek', 'half', 'full']

function snapIndex(snap) {
  const i = SNAP_ORDER.indexOf(snap)
  return i >= 0 ? i : 1
}

export function BottomSheet({
  snap = 'peek',
  onSnapChange,
  peekHeight,
  header,
  children,
  className = '',
  showScrim = true,
  bodyClassName = '',
}) {
  const sheetRef = useRef(null)
  const dragRef = useRef({ startY: 0, startSnap: 'peek', dragging: false })
  const [dragOffset, setDragOffset] = useState(0)

  const scrimVisible = showScrim && (snap === 'half' || snap === 'full')

  const finishDrag = useCallback((clientY) => {
    const { startY, startSnap, dragging } = dragRef.current
    if (!dragging) return
    dragRef.current.dragging = false
    setDragOffset(0)
    const delta = clientY - startY
    const idx = snapIndex(startSnap)
    if (delta > 70) {
      onSnapChange?.(SNAP_ORDER[Math.max(0, idx - 1)])
    } else if (delta < -70) {
      onSnapChange?.(SNAP_ORDER[Math.min(SNAP_ORDER.length - 1, idx + 1)])
    }
  }, [onSnapChange])

  useEffect(() => {
    function onMove(e) {
      if (!dragRef.current.dragging) return
      setDragOffset(Math.max(0, e.clientY - dragRef.current.startY))
    }
    function onUp(e) {
      finishDrag(e.clientY)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [finishDrag])

  function onHandleDown(e) {
    dragRef.current = { startY: e.clientY, startSnap: snap, dragging: true }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const style = {
    ...(peekHeight ? { '--sheet-peek-h': `${peekHeight}px` } : {}),
    ...(dragOffset ? { transform: `translateY(${dragOffset}px)`, transition: 'none' } : {}),
  }

  return (
    <>
      {showScrim && (
        <div
          className={`bottom-sheet-scrim${scrimVisible ? ' is-visible' : ''}`}
          aria-hidden
          onClick={() => onSnapChange?.('peek')}
        />
      )}
      <div
        ref={sheetRef}
        className={`bottom-sheet ${className}`}
        data-snap={snap}
        style={style}
        role="dialog"
        aria-modal={snap === 'full'}
      >
        <div className="bottom-sheet__handle-zone" onPointerDown={onHandleDown}>
          <div className="bottom-sheet__handle" aria-hidden />
        </div>
        {header && <div className="bottom-sheet__header">{header}</div>}
        <div className={`bottom-sheet__body${bodyClassName ? ` ${bodyClassName}` : ''}`}>{children}</div>
      </div>
    </>
  )
}

export function FieldHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'Voltar',
  action,
  className = '',
}) {
  return (
    <header className={`field-header ${className}`}>
      {onBack && (
        <button type="button" className="field-header__back" onClick={onBack} aria-label={backLabel}>
          ←
        </button>
      )}
      <div className="field-header__title-wrap">
        {title && <h1 className="field-header__title">{title}</h1>}
        {subtitle && <p className="field-header__subtitle">{subtitle}</p>}
      </div>
      {action && <div className="field-header__action">{action}</div>}
    </header>
  )
}

export function CommandHeader(props) {
  const { eyebrow = 'Sala de Comando', className = '', ...rest } = props
  return (
    <PageHeader
      eyebrow={eyebrow}
      className={`command-header ${className}`.trim()}
      {...rest}
    />
  )
}

export function FieldButton({ children, icon: Icon, className = '', ...rest }) {
  return (
    <button type="button" className={`btn-field ${className}`} {...rest}>
      {Icon && <Icon size={16} />}
      {children}
    </button>
  )
}
