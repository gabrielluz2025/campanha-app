import {
  MapPin, Phone, Globe, Clock, Church,
} from 'lucide-react'
import {
  formatarCepExibicao,
  formatarCultoExibicao,
  linksContatoIgreja,
  resumoEnderecoIgreja,
} from '../utils/igrejaDetalhe'
import IgrejaRedesIcons from './IgrejaRedesIcons'
import { streetViewUrlIgreja, streetViewUrlIgrejaAsync } from '../utils/rotaUtils'

export default function PopupIgrejaMapa({
  ig,
  naRota,
  onToggle,
  onVerRua,
  markerCor,
  filtroDiaCulto = 'Todos',
}) {
  const endereco = resumoEnderecoIgreja(ig)
  const cepFmt = formatarCepExibicao(ig.cep)
  const cultoTxt = formatarCultoExibicao(ig.culto, filtroDiaCulto)
  const links = linksContatoIgreja(ig)
  const pastor = [ig.pastor1, ig.pastor2].filter(Boolean).join(' · ')

  const temContato = links.telefone || links.waHref || links.website
    || links.instagram || links.facebook

  return (
    <div className="popup-igreja-mapa">
      <p className="popup-igreja-mapa__nome">{ig.nome}</p>
      {ig.denominacao && ig.denominacao !== 'Assembleia de Deus' && (
        <p className="popup-igreja-mapa__meta" style={{ color: markerCor }}>
          {ig.denominacao}
        </p>
      )}
      {ig.setor && (
        <p className="popup-igreja-mapa__meta">{ig.setor}</p>
      )}

      {endereco !== '—' && (
        <div className="popup-igreja-mapa__row">
          <MapPin size={12} className="popup-igreja-mapa__ico"/>
          <p className="popup-igreja-mapa__txt">{endereco}</p>
        </div>
      )}

      {cepFmt && !endereco.includes(cepFmt) && (
        <p className="popup-igreja-mapa__cep">CEP {cepFmt}</p>
      )}

      {cultoTxt && (
        <div className="popup-igreja-mapa__row">
          <Clock size={12} className="popup-igreja-mapa__ico"/>
          <p className="popup-igreja-mapa__txt">{cultoTxt}</p>
        </div>
      )}

      {pastor && (
        <div className="popup-igreja-mapa__row">
          <Church size={12} className="popup-igreja-mapa__ico"/>
          <p className="popup-igreja-mapa__txt">{pastor}</p>
        </div>
      )}

      {temContato && (
        <div className="popup-igreja-mapa__links">
          {links.telefone && links.telHref && (
            <a href={links.telHref} className="popup-igreja-mapa__link">
              <Phone size={11}/> {links.telefone}
            </a>
          )}
          {links.website && (
            <a href={links.website} target="_blank" rel="noopener noreferrer" className="popup-igreja-mapa__link">
              <Globe size={11}/> Site
            </a>
          )}
          <IgrejaRedesIcons ig={ig} />
        </div>
      )}

      {!endereco && !cultoTxt && !temContato && (
        <p className="popup-igreja-mapa__vazio">
          Sem endereço ou contato no cadastro. Edite no mapa de igrejas ou busque no sistema.
        </p>
      )}

      {streetViewUrlIgreja(ig) && (
        <button type="button"
          onClick={async () => {
            if (onVerRua) {
              onVerRua()
              return
            }
            const url = await streetViewUrlIgrejaAsync(ig)
            if (url) window.open(url, '_blank', 'noopener,noreferrer')
          }}
          className="popup-igreja-mapa__acao"
          style={{ background: 'linear-gradient(135deg,#facc15,#eab308)', color: '#1a1408', marginBottom: 6 }}>
          Ver rua (Street View)
        </button>
      )}

      <button type="button" onClick={onToggle}
        className="popup-igreja-mapa__acao"
        style={naRota
          ? { background: 'rgba(239,68,68,0.15)', color: '#f87171' }
          : { background: 'rgba(37,99,235,0.16)', color: '#3b82f6' }}>
        {naRota ? 'Remover da rota' : 'Adicionar à rota'}
      </button>
    </div>
  )
}
