import { CARGO_CORES, normalizarCargo, corCargo } from '../utils/equipeSync'

/**
 * Balão visual de cargo — cor própria por função, sempre visível.
 */
export default function CargoBalao({ cargo, size = 'sm', filled = true, className = '' }) {
  const nome = normalizarCargo(cargo)
  const cor = corCargo(nome)
  const lg = size === 'lg'

  if (filled) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-bold uppercase tracking-wide flex-shrink-0 ${className}`}
        style={{
          fontSize: lg ? 10 : 9,
          padding: lg ? '5px 11px' : '3px 9px',
          borderRadius: 999,
          color: '#fff',
          background: `linear-gradient(135deg, ${cor} 0%, ${cor}cc 100%)`,
          boxShadow: `0 2px 10px ${cor}45`,
          letterSpacing: '0.05em',
          lineHeight: 1.2,
        }}
        title={nome}
      >
        <span
          aria-hidden
          style={{
            width: lg ? 6 : 5,
            height: lg ? 6 : 5,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.9)',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.25)',
            flexShrink: 0,
          }}
        />
        {nome}
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-bold flex-shrink-0 ${className}`}
      style={{
        fontSize: lg ? 11 : 10,
        padding: lg ? '5px 11px' : '3px 9px',
        borderRadius: 999,
        color: cor,
        background: `${cor}18`,
        border: `1px solid ${cor}40`,
        letterSpacing: '0.02em',
        lineHeight: 1.2,
      }}
      title={nome}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: cor,
          boxShadow: `0 0 6px ${cor}88`,
          flexShrink: 0,
        }}
      />
      {nome}
    </span>
  )
}

/** Legenda compacta de todos os cargos com balões. */
export function LegendaCargos({ className = '' }) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {Object.keys(CARGO_CORES).map(cargo => (
        <CargoBalao key={cargo} cargo={cargo} size="sm" />
      ))}
    </div>
  )
}
