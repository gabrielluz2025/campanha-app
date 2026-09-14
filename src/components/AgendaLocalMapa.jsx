import { MapPin, Navigation2, ExternalLink } from 'lucide-react'
import { linkGoogleMapsEndereco, linkWazeEndereco } from '../utils/rotaUtils'

/** Local do evento com atalhos para Google Maps e Waze */
export default function AgendaLocalMapa({ local, cor = '#3b82f6', className = '' }) {
  const texto = String(local || '').trim()
  if (!texto) return null

  const gmaps = linkGoogleMapsEndereco(texto)
  const waze = linkWazeEndereco(texto)

  return (
    <div className={className}>
      <div className="flex items-start gap-1.5 min-w-0">
        <span style={{ color: cor, flexShrink: 0, marginTop: 2 }}><MapPin size={12} /></span>
        <span style={{ fontSize: 12, color: 'rgba(203,213,235,0.62)', lineHeight: 1.4 }}>{texto}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-1.5 ml-5">
        <a href={gmaps} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-semibold transition-colors hov-srf"
          style={{ fontSize: 10, color: '#93c5fd', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}>
          <ExternalLink size={10} /> Maps
        </a>
        <a href={waze} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-semibold transition-colors hov-srf"
          style={{ fontSize: 10, color: '#67e8f9', background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.25)' }}>
          <Navigation2 size={10} /> Waze
        </a>
      </div>
    </div>
  )
}
