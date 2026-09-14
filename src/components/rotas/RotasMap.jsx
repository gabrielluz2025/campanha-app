import RotaMapCanvas from '../montarRotas/RotaMapCanvas'
import { useRotasCtx } from './RotasContext'

export default function RotasMap({ fieldMobile = false }) {
  const { center, mapProps } = useRotasCtx()
  return (
    <RotaMapCanvas
      center={center}
      fieldMobile={fieldMobile}
      hidePanelToggle={!fieldMobile}
      {...mapProps}
    />
  )
}
