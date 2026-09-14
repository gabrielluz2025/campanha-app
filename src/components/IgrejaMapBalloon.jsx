import { MapPin, Clock, User, Phone, History } from 'lucide-react'
import { formatarCultoExibicao, resumoEnderecoIgreja } from '../utils/igrejaDetalhe'
import IgrejaRedesIcons from './IgrejaRedesIcons'
import { streetViewUrlIgreja } from '../utils/rotaUtils'

function fmtDataBR(iso) {
  const s = String(iso || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || ''
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

function nomesVisitantes(h) {
  if (Array.isArray(h?.visitantes) && h.visitantes.length) return h.visitantes
  const s = String(h?.visitadoPor || '').trim()
  if (!s) return []
  return s.split(/\s*(?:·|,|;|\be\b)\s*/i).map(n => n.trim()).filter(Boolean)
}

export function IgrejaBalloonContent({
  ig,
  markerCor,
  pinned = false,
  interactive = false,
  naRota = false,
  inPopup = false,
  overlay = false,
  onToggleRota,
  onVerRua,
  onMouseEnter,
  onMouseLeave,
}) {
  const visita = ig.visita || null
  const historico = Array.isArray(visita?.historico) ? visita.historico : []
  const vezes = historico.length || Number(visita?.vezes) || 0
  const ultima = historico[0] || (visita?.data ? visita : null)
  const ultimaNomes = ultima ? nomesVisitantes(ultima) : []
  const pastor = [ig.pastor1, ig.pastor2].filter(Boolean).join(' · ')
  const endereco = resumoEnderecoIgreja(ig)
  const culto = formatarCultoExibicao(ig.culto)
  const acento = markerCor || (ig.visitado ? '#d4af5f' : '#60a5fa')

  return (
      <div
        className={`igreja-balloon${interactive || pinned ? ' is-interactive' : ''}${inPopup ? ' igreja-balloon--in-popup' : ''}${overlay ? ' igreja-balloon--overlay' : ''}`}
        onMouseEnter={interactive || pinned ? onMouseEnter : undefined}
        onMouseLeave={interactive || pinned ? onMouseLeave : undefined}
        onClick={interactive || pinned ? (e => e.stopPropagation()) : undefined}
      >
        <div className="igreja-balloon__tip" style={{ borderTopColor: acento }} />

        <div className="igreja-balloon__top" style={{ borderLeftColor: acento }}>
          <div className="igreja-balloon__badges">
            <span className={`igreja-balloon__st ${ig.visitado ? 'ok' : 'pend'}`}>
              {ig.visitado ? 'Visitada' : 'Pendente'}
            </span>
            {naRota && <span className="igreja-balloon__st rota">Na rota</span>}
            {ig.prioridade === 'alta' && !ig.visitado && (
              <span className="igreja-balloon__st alta">Prioridade</span>
            )}
          </div>
          <p className="igreja-balloon__nome">{ig.nome}</p>
          <p className="igreja-balloon__sub" style={{ color: acento }}>
            {ig.denominacao || 'Igreja'}
            {ig.setor && ig.setor !== '—' ? ` · ${ig.setor}` : ''}
          </p>
        </div>

        <div className="igreja-balloon__stats">
          <div>
            <strong>{vezes}</strong>
            <span>{vezes === 1 ? 'visita' : 'visitas'}</span>
          </div>
          <div>
            <strong>{ultima ? (fmtDataBR(ultima.data) || '—') : '—'}</strong>
            <span>última</span>
          </div>
          <div>
            <strong>{ultimaNomes[0] ? ultimaNomes[0].split(' ')[0] : '—'}</strong>
            <span>por quem</span>
          </div>
        </div>

        {ultimaNomes.length > 1 && (
          <p className="igreja-balloon__who">
            <History size={11} />
            {ultimaNomes.join(', ')}
          </p>
        )}

        <div className="igreja-balloon__rows">
          {endereco && endereco !== '—' && (
            <p><MapPin size={11} /> {endereco}</p>
          )}
          {culto && (
            <p><Clock size={11} /> {culto}</p>
          )}
          {pastor && (
            <p><User size={11} /> {pastor}</p>
          )}
          {ig.telefone && (
            <p><Phone size={11} /> {ig.telefone}</p>
          )}
        </div>

        <IgrejaRedesIcons ig={ig} className="igreja-balloon__redes" />

        <div className="igreja-balloon__actions">
          {streetViewUrlIgreja(ig) && (
            <button type="button" className="igreja-balloon__btn rua" onClick={() => onVerRua?.(ig)}>
              Ver rua
            </button>
          )}
          {onToggleRota && (
            <button
              type="button"
              className={`igreja-balloon__btn ${naRota ? 'off' : 'on'}`}
              onClick={() => onToggleRota()}
            >
              {naRota ? 'Tirar da rota' : 'Colocar na rota'}
            </button>
          )}
        </div>

        {!pinned && !onToggleRota && (
          <p className="igreja-balloon__hint">Clique no pin para abrir a ficha</p>
        )}
      </div>
  )
}
