import { useState, useEffect, useRef } from 'react'

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
            {Math.round(animated)}<span style={{ fontSize: size * 0.13, opacity: 0.5 }}>%</span>
          </span>
        )}
        {label && <span className="eyebrow" style={{ marginTop: 2 }}>{label}</span>}
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
      className={`w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 anim-fade ${className}`}
      style={{ maxWidth: 1400, ...style }}
    >
      {children}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   PageHeader — consistent module header with icon, title, actions
═══════════════════════════════════════════════════════════ */
export function PageHeader({
  eyebrow, title, subtitle, icon: Icon,
  iconFrom = '#2563eb', iconTo = '#06b6d4',
  glow = 'rgba(37,99,235,0.14)', actions, className = '',
}) {
  return (
    <div className={`relative mb-6 lg:mb-8 anim-fade-up ${className}`}>
      <div
        aria-hidden
        style={{
          position: 'absolute', top: -40, left: -20, width: 320, height: 160,
          background: `radial-gradient(60% 80% at 20% 30%, ${glow}, transparent 70%)`,
          pointerEvents: 'none', filter: 'blur(8px)',
        }}
      />
      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          {Icon && (
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 52, height: 52, borderRadius: 16,
                background: `linear-gradient(135deg, ${iconFrom}, ${iconTo})`,
                boxShadow: `0 8px 24px ${iconFrom}55`,
              }}
            >
              <Icon size={24} style={{ color: '#fff' }} />
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
            <h1 className="text-display font-black truncate" style={{ fontSize: 26, color: 'var(--text-primary)', lineHeight: 1.1 }}>{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap flex-shrink-0">{actions}</div>}
      </div>
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
