import { useRotasCtx } from '../RotasContext'

/** Histórico — reutiliza painel existente via slot. */
export default function HistoryPanel() {
  const { panelHistorico } = useRotasCtx()
  return <div className="rt-history-wrap">{panelHistorico}</div>
}
