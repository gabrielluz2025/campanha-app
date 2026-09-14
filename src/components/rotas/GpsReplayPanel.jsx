import { useState, useEffect } from 'react'
import { History, Play } from 'lucide-react'
import { fetchTrilha } from '../../utils/rotaLiveStream'
import { useRotasCtx } from './RotasContext'

export default function GpsReplayPanel() {
  const { execucoes, rotaAtivaId } = useRotasCtx()
  const [trilha, setTrilha] = useState([])
  const [loading, setLoading] = useState(false)

  const pack = execucoes[rotaAtivaId] || execucoes[String(rotaAtivaId)]
  const shareId = pack?.share?.shareId || pack?.exec?.shareId

  useEffect(() => {
    if (!shareId) {
      setTrilha([])
      return undefined
    }
    let cancel = false
    setLoading(true)
    fetchTrilha(shareId).then(pts => {
      if (!cancel) setTrilha(pts)
    }).finally(() => { if (!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [shareId])

  if (!shareId) return null

  return (
    <div className="rt-replay">
      <div className="rt-replay__head">
        <History size={14} />
        <span>Trilha GPS gravada</span>
        <strong>{trilha.length} pts</strong>
      </div>
      {loading ? (
        <p className="rt-empty rt-empty--sm">Carregando…</p>
      ) : trilha.length < 2 ? (
        <p className="rt-empty rt-empty--sm">Trilha ainda curta — aguarde movimento no campo.</p>
      ) : (
        <p className="rt-replay__hint">
          <Play size={11} />
          {' '}
          {new Date(trilha[0]?.t || trilha[0]?.atualizadoEm || 0).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          {' → '}
          {new Date(trilha[trilha.length - 1]?.t || trilha[trilha.length - 1]?.atualizadoEm || 0).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  )
}
