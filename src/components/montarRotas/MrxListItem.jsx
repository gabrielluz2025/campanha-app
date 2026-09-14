import { Plus, CheckCircle2, Radar, X, Church } from 'lucide-react'
import IgrejaRedesIcons from '../IgrejaRedesIcons'
import MembroAvatar from '../MembroAvatar'
import { RecordCard, StatusPill } from '../ui'
import { DENOMINACAO_PADRAO } from '../../constants/igrejasTheme'
import { enderecoLinhaParada, formatDistanciaKm } from '../../utils/rotaUtils'

export default function MrxListItem({
  p,
  naRota,
  ordem,
  cor,
  modoEquipe = false,
  km = null,
  destaqueAncora = false,
  isAncora = false,
  semCoords = false,
  visitado = false,
  cultoTxt = '',
  membros = [],
  onToggle,
  onRadar,
  onFly,
  useRecordCard = false,
}) {
  const secondary = modoEquipe
    ? (naRota ? `Na rota · ${p.cargo || 'Integrante'}` : (p.cargo || 'Integrante'))
    : [(enderecoLinhaParada(p) || p.setor), cultoTxt].filter(Boolean).join(' · ')

  const metaParts = []
  if (km != null && Number.isFinite(km)) metaParts.push(formatDistanciaKm(km))
  if (semCoords) metaParts.push('sem GPS')

  if (useRecordCard) {
    return (
      <div style={destaqueAncora || isAncora ? { borderRadius: 12, outline: '1px solid rgba(234,179,8,0.35)' } : undefined}>
        <RecordCard
          primary={p.nome}
          secondary={secondary}
          meta={metaParts.length ? metaParts.join(' · ') : null}
          lead={modoEquipe ? (
            <MembroAvatar
              membro={membros.find(m => String(m.id) === String(p.id)) || p}
              size={34}
              ring={naRota}
            />
          ) : undefined}
          icon={!modoEquipe ? Church : undefined}
          onClick={() => { if (modoEquipe || !semCoords || p.endereco) { onToggle(); onFly?.() } }}
          status={
            <StatusPill
              variant={visitado || naRota ? 'visitada' : 'pendente'}
              label={visitado ? 'Visitada' : naRota ? `Parada ${ordem + 1}` : 'Pendente'}
              bordered={false}
            />
          }
          actions={(
            <div className="flex items-center gap-1">
              {!modoEquipe && onRadar && (
                <button type="button" onClick={e => { e.stopPropagation(); onRadar() }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{
                    background: isAncora ? 'rgba(234,179,8,0.2)' : 'rgba(255,255,255,0.05)',
                    color: isAncora ? '#fbbf24' : 'rgba(203,213,225,0.5)',
                  }}
                  title="Igrejas próximas">
                  <Radar size={13} />
                </button>
              )}
              <button type="button"
                className={`w-9 h-9 rounded-full flex items-center justify-center ${naRota ? '' : ''}`}
                style={{
                  background: naRota ? 'linear-gradient(145deg,#f0d48a,#a8842e)' : 'rgba(255,255,255,0.06)',
                  color: naRota ? '#1a1408' : 'var(--text-tertiary)',
                }}
                onClick={e => { e.stopPropagation(); onToggle(); onFly?.() }}>
                {naRota ? <CheckCircle2 size={16} /> : <Plus size={16} />}
              </button>
            </div>
          )}
        />
        {!modoEquipe && (
          <div className="px-3 pb-1 -mt-1">
            <IgrejaRedesIcons ig={p} size={12} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`mrx-item ${naRota ? 'is-on-route' : ''}`}
      style={destaqueAncora || isAncora ? { borderColor: 'rgba(234,179,8,0.45)', background: 'rgba(234,179,8,0.08)' } : undefined}>
      <div className="mrx-item-inner" style={{ opacity: semCoords ? 0.55 : 1 }}>
        {modoEquipe ? (
          <button type="button" className="flex-shrink-0" onClick={onToggle}>
            <MembroAvatar
              membro={membros.find(m => String(m.id) === String(p.id)) || p}
              size={34}
              ring={naRota}/>
          </button>
        ) : (
          <button type="button" className="mrx-item-num"
            style={{ backgroundColor: naRota ? '#2563eb' : cor }}
            onClick={() => { if (!semCoords || p.endereco) { onToggle(); onFly?.() } }}
            title={naRota ? 'Remover' : 'Adicionar'}>
            {naRota ? (ordem + 1) : (p.denominacao !== DENOMINACAO_PADRAO ? '✝' : '')}
          </button>
        )}

        <button type="button" className="mrx-item-body"
          onClick={() => { if (modoEquipe || !semCoords || p.endereco) { onToggle(); onFly?.() } }}>
          <div className="flex items-center gap-1.5">
            <span className="mrx-item-name">{p.nome}</span>
            {km != null && Number.isFinite(km) && (
              <span style={{ fontSize: 9, fontWeight: 800, color: '#93c5fd', flexShrink: 0 }}>
                {formatDistanciaKm(km)}
              </span>
            )}
            {visitado && <CheckCircle2 size={11} style={{ color: '#86efac', flexShrink: 0 }}/>}
            {semCoords && (
              <span style={{ fontSize: 9, fontWeight: 700, color: '#fbbf24', flexShrink: 0 }}>sem GPS</span>
            )}
          </div>
          <p className="mrx-item-sub">{secondary}</p>
        </button>

        <div className="flex items-center gap-1 flex-shrink-0">
          {!modoEquipe && onRadar && (
            <button type="button" onClick={e => { e.stopPropagation(); onRadar() }}
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: isAncora ? 'rgba(234,179,8,0.2)' : 'rgba(255,255,255,0.05)',
                color: isAncora ? '#fbbf24' : 'rgba(203,213,225,0.5)',
              }}
              title="Igrejas próximas">
              <Radar size={13}/>
            </button>
          )}
          <button type="button"
            className={`mrx-item-add ${naRota ? 'is-on' : ''}`}
            onClick={() => { onToggle(); onFly?.() }}>
            {naRota ? <CheckCircle2 size={18}/> : <Plus size={18}/>}
          </button>
        </div>
      </div>
      {!modoEquipe && (
        <div className="px-3 pb-2">
          <IgrejaRedesIcons ig={p} size={12}/>
        </div>
      )}
    </div>
  )
}

export function MrxAnchorBanner({
  igrejaAncora,
  proxIgrejaKm,
  setProxIgrejaKm,
  count,
  onClose,
  onAddAll,
}) {
  return (
    <div className="mx-3 mb-2 p-3 rounded-xl space-y-2"
      style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p style={{ fontSize: 11, fontWeight: 800, color: '#fbbf24' }}>Próximas de</p>
          <p className="font-bold truncate" style={{ fontSize: 13 }}>{igrejaAncora.nome}</p>
          <p style={{ fontSize: 10, color: 'var(--mrx-muted)' }}>{count} em {proxIgrejaKm} km</p>
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded-lg" style={{ color: 'var(--mrx-muted)' }}>
          <X size={14}/>
        </button>
      </div>
      <input type="range" min="1" max="10" step="0.5" value={proxIgrejaKm}
        onChange={e => setProxIgrejaKm(Number(e.target.value))}
        className="w-full" style={{ accentColor: '#eab308' }}/>
      <button type="button" onClick={onAddAll}
        className="w-full py-2 rounded-xl font-bold text-xs"
        style={{ background: 'rgba(37,99,235,0.35)', color: '#93c5fd' }}>
        + Âncora e próximas
      </button>
    </div>
  )
}
