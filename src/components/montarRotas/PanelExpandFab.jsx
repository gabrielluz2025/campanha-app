import { PanelRightClose } from 'lucide-react'

const glass = {
  bg: 'linear-gradient(165deg, rgba(16,22,34,0.97), rgba(8,12,20,0.96))',
  border: '1px solid rgba(212,175,95,0.22)',
  shadow: '0 24px 64px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)',
}

export default function PanelExpandFab({ onExpand, visitadas, pendentes }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl anim-fade-up"
      style={{
        background: glass.bg,
        border: glass.border,
        boxShadow: glass.shadow,
        backdropFilter: 'blur(18px)',
        color: 'var(--gold-bright)',
      }}
    >
      <PanelRightClose size={15} />
      <span className="font-bold" style={{ fontSize: 12 }}>Painel</span>
      <span className="tnum font-extrabold" style={{ fontSize: 12, color: 'var(--gold-bright)' }}>{visitadas}</span>
      <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>/</span>
      <span className="tnum font-extrabold" style={{ fontSize: 12, color: '#fbbf24' }}>{pendentes}</span>
    </button>
  )
}
