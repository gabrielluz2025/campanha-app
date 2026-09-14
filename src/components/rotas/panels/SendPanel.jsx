import { MessageCircle, Copy, Link2, Radio, Loader2, ExternalLink } from 'lucide-react'
import MembroSearchPicker from '../../MembroSearchPicker'
import { fmtDataBR } from '../../../utils/rotaUtils'
import { useRotasCtx } from '../RotasContext'
import SendChecklist from './SendChecklist'
import RouteResultPanel from './RouteResultPanel'

export default function SendPanel() {
  const {
    rotaAtiva,
    paradasDetalhes,
    qtdParadas,
    concluidas,
    membros,
    enviarPara,
    setEnviarPara,
    definirResponsavel,
    abrirModalEnviar,
    abrirWhatsApp,
    enviarLoad,
    shareLink,
    shareCopiado,
    copiarShareLink,
    mapsUrl,
    wazePrimeira,
    shareAtivoNaRota,
    aoVivoAtivoNaRota,
    encerrarAoVivoDaRotaAtiva,
    goStep,
    equipeDaRota,
    rotaCalc,
  } = useRotasCtx()

  const membroId = enviarPara || rotaAtiva?.responsavelId || ''
  const membro = membros.find(m => String(m.id) === String(membroId))
  const pct = qtdParadas ? Math.round((concluidas / qtdParadas) * 100) : 0

  return (
    <div>
      <div className="rt-stats">
        <div className="rt-stat">
          <p className="rt-stat__val">{concluidas}/{qtdParadas}</p>
          <p className="rt-stat__lbl">Visitas ({pct}%)</p>
        </div>
        <div className="rt-stat">
          <p className="rt-stat__val">{rotaCalc?.distancia || '—'}</p>
          <p className="rt-stat__lbl">km</p>
        </div>
        <div className="rt-stat">
          <p className="rt-stat__val">{fmtDataBR(rotaAtiva?.data)}</p>
          <p className="rt-stat__lbl">Data</p>
        </div>
      </div>

      <SendChecklist />

      <div className="rt-send-card">
        <label>Enviar para (membro da equipe)</label>
        <MembroSearchPicker
          membros={membros}
          value={membroId}
          onChange={(id) => {
            setEnviarPara(id)
            definirResponsavel(id)
          }}
          placeholder="Quem vai executar no campo?"
        />
        {membro && !membro.telefone && (
          <p style={{ fontSize: 11, color: '#f87171', marginTop: 8 }}>
            Cadastre o telefone deste membro na aba Equipe para enviar WhatsApp.
          </p>
        )}
        {equipeDaRota?.length > 0 && (
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
            Equipe na rota: {equipeDaRota.map(m => m.nome).join(', ')}
          </p>
        )}
      </div>

      {!paradasDetalhes.length ? (
        <p className="rt-empty">Adicione paradas antes de enviar.</p>
      ) : (
        <>
          <button
            type="button"
            className="rt-cta rt-cta--success"
            disabled={enviarLoad || !membro?.telefone}
            onClick={() => void abrirWhatsApp()}
          >
            {enviarLoad ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
            Enviar rota no WhatsApp
          </button>

          <div className="rt-cta-row" style={{ marginTop: 8 }}>
            <button type="button" className="rt-cta rt-cta--ghost" onClick={() => void abrirModalEnviar()}>
              <Link2 size={14} /> Gerar link
            </button>
            {shareLink && (
              <button type="button" className="rt-cta rt-cta--ghost" onClick={copiarShareLink}>
                <Copy size={14} /> {shareCopiado ? 'Copiado!' : 'Copiar'}
              </button>
            )}
          </div>

          {shareLink && (
            <div className="rt-link-box">{shareLink}</div>
          )}

          <div className="rt-cta-row" style={{ marginTop: 12 }}>
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="rt-cta rt-cta--ghost" style={{ textDecoration: 'none' }}>
                <ExternalLink size={14} /> Google Maps
              </a>
            )}
            {wazePrimeira && (
              <a href={wazePrimeira} target="_blank" rel="noopener noreferrer" className="rt-cta rt-cta--ghost" style={{ textDecoration: 'none' }}>
                Waze
              </a>
            )}
          </div>

          {(shareAtivoNaRota || aoVivoAtivoNaRota) && (
            <div className="rt-send-card" style={{ marginTop: 14, borderColor: 'rgba(52,211,153,0.25)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span className="rt-live-dot" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#6ee7b7' }}>
                  {aoVivoAtivoNaRota ? 'Equipe ao vivo no GPS' : 'Link ativo — aguardando GPS'}
                </span>
              </div>
              <div className="rt-cta-row">
                <button type="button" className="rt-cta rt-cta--ghost" onClick={() => goStep('live')}>
                  <Radio size={14} /> Ver no mapa
                </button>
                <button type="button" className="rt-cta rt-cta--ghost" onClick={encerrarAoVivoDaRotaAtiva} style={{ color: '#f87171' }}>
                  Encerrar ao vivo
                </button>
              </div>
            </div>
          )}

          <RouteResultPanel />
        </>
      )}
    </div>
  )
}
