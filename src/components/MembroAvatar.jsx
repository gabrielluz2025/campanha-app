import { corCargo } from '../utils/equipeSync'

export default function MembroAvatar({
  membro,
  size = 32,
  className = '',
  ring = false,
}) {
  const nome = String(membro?.nome || '').trim()
  const inicial = nome.charAt(0).toUpperCase() || '?'
  const cor = corCargo(membro?.cargo)
  const s = Number(size) || 32
  const foto = membro?.foto
  return (
    <span
      className={`membro-avatar ${foto ? 'has-photo' : ''} ${ring ? 'has-ring' : ''} ${className}`.trim()}
      style={{
        width: s,
        height: s,
        fontSize: Math.max(10, Math.round(s * 0.38)),
        background: foto ? 'rgba(255,255,255,0.08)' : `${cor}33`,
        color: foto ? undefined : cor,
        boxShadow: ring ? `0 0 0 2px ${cor}55` : undefined,
      }}
      title={nome || 'Sem nome'}
    >
      {foto
        ? (
          <img
            src={foto}
            alt=""
            style={{ objectPosition: `${membro?.fotoX ?? 50}% ${membro?.fotoY ?? 50}%` }}
          />
        )
        : inicial}
    </span>
  )
}
