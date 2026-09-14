import { Lock, MessageCircle, Users } from 'lucide-react'
import { normalizeLeadFormConfig } from '../utils/leadFormConfig'
import { LogoMark } from './ImagePositionEditor'
import CampaignPoster, { LandingFooter } from './CampaignPoster'

/**
 * Prévia visual do formulário público (somente leitura).
 * Usado no editor para ver alterações em tempo real.
 */
export default function LeadFormPreview({ config, campanhaNome = 'Sua campanha', compact = false }) {
  const cfg = normalizeLeadFormConfig(config)
  const campos = cfg.campos.filter(c => c.ativo !== false)
  const interesses = cfg.interesses.filter(i => i.ativo !== false)
  const sub = (cfg.subtitulo || '').replace('{campanha}', campanhaNome)

  const pageStyle = {
    background:
      cfg.layout === 'split'
        ? `linear-gradient(165deg, ${cfg.corPrimaria} 0%, #061428 55%, ${cfg.corPrimaria} 100%)`
        : `linear-gradient(165deg, ${cfg.corPrimaria} 0%, ${cfg.corPrimaria}cc 45%, ${cfg.corAcento} 100%)`,
    fontFamily: "'Manrope', system-ui, sans-serif",
    borderRadius: compact ? 16 : 0,
    overflow: 'hidden',
    minHeight: compact ? 320 : undefined,
  }

  const formCard = (embedded = false) => (
    <div className={`overflow-hidden bg-white w-full h-full ${embedded ? '' : 'rounded-2xl shadow-xl'}`}>
      <div className="px-4 pt-5 pb-3 text-center" style={{ borderBottom: '1px solid #e2e8f0' }}>
        {cfg.logo && cfg.layout !== 'split' ? (
          <LogoMark
            src={cfg.logo}
            x={cfg.logoX}
            y={cfg.logoY}
            maxH={compact ? 40 : 52}
            maxW={compact ? 160 : 200}
            className="mb-2"
          />
        ) : (
          <div
            className="mx-auto mb-2 rounded-xl flex items-center justify-center"
            style={{
              width: compact ? 36 : 48,
              height: compact ? 36 : 48,
              background: `linear-gradient(135deg,${cfg.corPrimaria},${cfg.corAcento})`,
            }}
          >
            <Users size={compact ? 16 : 22} color="#fff" />
          </div>
        )}
        <h2
          className="font-extrabold text-slate-900"
          style={{ fontFamily: "'Sora', system-ui, sans-serif", fontSize: compact ? 14 : 18 }}
        >
          {cfg.titulo || 'Título'}
        </h2>
        {sub && (
          <p className="mt-1.5 text-slate-500" style={{ fontSize: compact ? 11 : 13, lineHeight: 1.4 }}>
            {sub}
          </p>
        )}
      </div>

      <div className="px-4 py-4 space-y-2.5 pointer-events-none select-none">
        {campos.map(campo => (
          <PreviewCampo key={campo.id} campo={campo} compact={compact} />
        ))}

        {interesses.length > 0 && (
          <div className="pt-0.5">
            <p
              className="font-extrabold mb-1.5 uppercase"
              style={{ fontSize: 10, color: cfg.corPrimaria, letterSpacing: '0.04em' }}
            >
              {cfg.secaoInteressesTitulo}
            </p>
            <div className="space-y-1.5">
              {interesses.map(item => (
                <div key={item.id} className="flex items-start gap-2">
                  <span
                    className="mt-0.5 w-3.5 h-3.5 rounded border flex-shrink-0"
                    style={{
                      borderColor: '#94a3b8',
                      background: item.padrao ? cfg.corAcento : '#fff',
                    }}
                  />
                  <span className="text-slate-700" style={{ fontSize: compact ? 11 : 13, lineHeight: 1.3 }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {cfg.mostrarLgpd && (
          <div className="flex items-start gap-2 pt-0.5">
            <span className="mt-0.5 w-3.5 h-3.5 rounded border border-slate-400 flex-shrink-0 bg-white" />
            <span className="text-slate-600" style={{ fontSize: 10, lineHeight: 1.35 }}>
              {cfg.textoLgpd}
            </span>
          </div>
        )}

        <div
          className="w-full rounded-xl font-extrabold text-white flex items-center justify-center gap-1.5"
          style={{
            background: `linear-gradient(135deg,${cfg.corAcento},${cfg.corAcento}dd)`,
            fontSize: compact ? 12 : 14,
            padding: compact ? '10px 12px' : '12px 14px',
          }}
        >
          <MessageCircle size={compact ? 14 : 16} />
          {cfg.cta || 'Enviar'}
        </div>

        <p className="flex items-center justify-center gap-1 pt-0.5 text-[10px] text-slate-400">
          <Lock size={10} /> Dados protegidos
        </p>
      </div>
    </div>
  )

  return (
    <div style={pageStyle}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Sora:wght@600;700;800&display=swap');`}</style>

      {cfg.layout === 'hero' && (
        <div className="w-full relative" style={{ height: compact ? 88 : 140, overflow: 'hidden', background: 'rgba(0,0,0,0.25)' }}>
          {cfg.foto ? (
            <>
              <div className="absolute inset-0 overflow-hidden">
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url(${cfg.foto})`,
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: 'cover',
                    backgroundPosition: `${cfg.fotoX ?? 50}% ${cfg.fotoY ?? 50}%`,
                    transform: (cfg.fotoZoom || 100) > 100 ? `scale(${(cfg.fotoZoom || 100) / 100})` : undefined,
                    transformOrigin: `${cfg.fotoX ?? 50}% ${cfg.fotoY ?? 50}%`,
                  }}
                />
              </div>
              <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent)' }}
              />
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/50 text-[11px] px-4 text-center">
              Foto no topo — carregue a foto principal
            </div>
          )}
        </div>
      )}

      <div className={`mx-auto ${compact ? 'px-3 py-3' : 'px-4 py-5'} ${cfg.layout === 'split' ? 'max-w-full' : 'max-w-sm'}`}>
        {cfg.layout !== 'split' && (
          <header className="mb-3">
            {cfg.slogan && (
              <p
                className="font-extrabold tracking-wide uppercase mb-1"
                style={{
                  fontFamily: "'Sora', system-ui, sans-serif",
                  fontSize: compact ? 9 : 11,
                  color: cfg.corDestaque,
                  letterSpacing: '0.08em',
                }}
              >
                {cfg.slogan}
              </p>
            )}
            <h1
              className="font-extrabold text-white leading-tight"
              style={{ fontFamily: "'Sora', system-ui, sans-serif", fontSize: compact ? 15 : 18 }}
            >
              {campanhaNome}
            </h1>
            {cfg.valores && (
              <div
                className="mt-2 inline-flex px-2.5 py-1 rounded-full font-bold text-white"
                style={{ background: cfg.corAcento, fontSize: compact ? 9 : 10, letterSpacing: '0.04em' }}
              >
                {cfg.valores}
              </div>
            )}
          </header>
        )}

        {cfg.layout === 'split' ? (
          <div
            className="overflow-hidden"
            style={{
              background: `linear-gradient(155deg, ${cfg.corPrimaria} 0%, #021018 100%)`,
            }}
          >
            <div className="relative w-full overflow-hidden" style={{ aspectRatio: '3 / 4' }}>
              <CampaignPoster cfg={cfg} campanhaNome={campanhaNome} compact={compact} embedded />
            </div>
            <div className="bg-white">{formCard(true)}</div>
            <LandingFooter cfg={cfg} embedded />
          </div>
        ) : (
          formCard()
        )}
      </div>
    </div>
  )
}

function PreviewCampo({ campo, compact }) {
  return (
    <div>
      <div
        className="font-bold mb-0.5"
        style={{ fontSize: 10, color: '#1e3a8a', letterSpacing: '0.03em' }}
      >
        {String(campo.label || '').replace(/\s*\[?\s*opcional\s*\]?/gi, '').replace(/\s*\(opcional\)/gi, '').trim()}
        {campo.obrigatorio ? (
          <span style={{ color: '#dc2626' }}> *</span>
        ) : (
          <span className="font-semibold normal-case" style={{ color: '#94a3b8' }}> (opcional)</span>
        )}
      </div>
      <div
        className="w-full rounded-lg text-slate-400"
        style={{
          background: '#f8fafc',
          border: '1px solid #cbd5e1',
          fontSize: compact ? 11 : 12,
          padding: compact ? '7px 10px' : '9px 12px',
        }}
      >
        {campo.placeholder || '…'}
      </div>
    </div>
  )
}
