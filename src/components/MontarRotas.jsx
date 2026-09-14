import { RotasProvider } from '../context/RotasProvider'
import RotasLayout from './rotas/RotasLayout'

/** Montar Rotas v2 — shell fino; lógica em RotasProvider. */
export default function MontarRotas(props) {
  return (
    <RotasProvider {...props}>
      <RotasLayout />
    </RotasProvider>
  )
}
