import { Facebook, Heart, Instagram, Linkedin, Link2, MapPin, MessageCircle, Music2, Send, Twitter, Users, Youtube } from 'lucide-react'
import { resolveRedesSociais } from '../utils/leadFormConfig'

/**
 * Coluna de marca do flyer: foto preenche o painel inteiro,
 * textos (slogan, cargo, nome, valores, pilares) por cima.
 */
export default function CampaignPoster({
  cfg,
  campanhaNome = '',
  compact = false,
  whatsapp = '',
  embedded = false,
  dense = false,
}) {
  const nome = (cfg.nomeCandidato || campanhaNome || 'Seu nome').trim()
  const cargo = (cfg.cargo || '').trim()
  const partido = (cfg.partido || '').trim()
  const pilares = parsePilares(cfg.posterPilares)
  const x = Number(cfg.fotoX) || 50
  const y = Number(cfg.fotoY) || 50
  const zoom = Math.max(100, Math.min(250, Number(cfg.fotoZoom) || 100))
  const corTexto = cfg.corTexto || '#ffffff'
  const corSloganDestaque = cfg.corSloganDestaque || cfg.corAcento || '#4ade80'
  const corValores = cfg.corDestaque || '#facc15'
  const tight = compact || dense
  // object-position: % menor = mais para o topo (rosto no celular)
  const posY = dense ? Math.min(Number(y) || 50, 32) : y
  const posX = x

  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col">
      {cfg.foto ? (
        <div className="absolute inset-0 overflow-hidden" aria-hidden style={{ background: cfg.corPrimaria || '#0b1f4d' }}>
          <img
            src={cfg.foto}
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full"
            style={{
              objectFit: 'cover',
              objectPosition: `${posX}% ${posY}%`,
              transform: zoom > 100 ? `scale(${zoom / 100})` : undefined,
              transformOrigin: `${posX}% ${posY}%`,
              userSelect: 'none',
            }}
          />
        </div>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 70% 55% at 40% 40%, ${cfg.corAcento}44, transparent 60%),
              linear-gradient(160deg, ${cfg.corPrimaria} 0%, #021018 100%)
            `,
          }}
        />
      )}

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: dense
            ? `
              linear-gradient(to bottom, rgba(2,8,20,0.45) 0%, transparent 35%),
              linear-gradient(to top, rgba(2,8,20,0.78) 0%, rgba(2,8,20,0.35) 40%, transparent 70%)
            `
            : `
              linear-gradient(to bottom, rgba(2,8,20,0.55) 0%, rgba(2,8,20,0.12) 26%, transparent 42%),
              linear-gradient(to top, rgba(2,8,20,0.88) 0%, rgba(2,8,20,0.45) 36%, transparent 62%)
            `,
        }}
      />

      <div
        className={`relative z-10 flex flex-col flex-1 justify-between ${dense ? 'p-3 sm:p-4 md:p-5' : ''}`}
        style={dense ? undefined : { padding: tight ? '14px 14px 16px' : '22px 22px 26px' }}
      >
        {cfg.slogan ? (
          <p
            className={`font-extrabold uppercase leading-snug ${dense ? 'line-clamp-2 md:line-clamp-none' : ''}`}
            style={{
              fontFamily: "'Sora', system-ui, sans-serif",
              fontSize: tight ? 10 : 12,
              letterSpacing: '0.06em',
              maxWidth: '100%',
              textShadow: '0 2px 14px rgba(0,0,0,0.55)',
            }}
          >
            {cfg.slogan.split(' ').map((word, i, arr) => {
              const highlight = /brasil|você|voce|forte/i.test(word)
              return (
                <span key={i} style={{ color: highlight ? corSloganDestaque : corTexto }}>
                  {word}{i < arr.length - 1 ? ' ' : ''}
                </span>
              )
            })}
          </p>
        ) : (
          <span />
        )}

        <div>
          {!cfg.foto && (
            <p
              className="mb-4 px-3 py-3 text-center rounded-xl border border-dashed"
              style={{ borderColor: 'rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.65)', fontSize: 12 }}
            >
              Envie a foto — ela preenche este painel e os textos ficam por cima
            </p>
          )}

          {cargo && (
            <p
              className="font-bold uppercase mb-1"
              style={{
                fontSize: tight ? 10 : 12,
                letterSpacing: '0.14em',
                color: corTexto,
                opacity: 0.92,
                textShadow: '0 1px 10px rgba(0,0,0,0.5)',
              }}
            >
              {cargo}
            </p>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <h1
              className="font-black uppercase"
              style={{
                fontFamily: "'Sora', system-ui, sans-serif",
                fontSize: tight ? 'clamp(1.25rem, 6vw, 1.7rem)' : 'clamp(1.75rem, 3.2vw, 2.6rem)',
                lineHeight: 0.92,
                letterSpacing: '-0.02em',
                color: corTexto,
                textShadow: '0 4px 28px rgba(0,0,0,0.55)',
              }}
            >
              {nome}
            </h1>
            {partido && (
              <span
                className="font-black rounded-md px-2.5 py-1 text-white mb-0.5"
                style={{ background: cfg.corAcento, fontSize: tight ? 12 : 15 }}
              >
                {partido}
              </span>
            )}
          </div>

          {cfg.valores && (
            <p
              className={`mt-1.5 font-extrabold uppercase ${dense ? 'hidden sm:block' : ''}`}
              style={{
                color: corValores,
                fontSize: tight ? 10 : 12,
                letterSpacing: '0.12em',
                textShadow: '0 2px 12px rgba(0,0,0,0.45)',
              }}
            >
              {cfg.valores}
            </p>
          )}

          {pilares.length > 0 && (
            <ul className={`mt-3 ${tight ? 'space-y-1.5' : 'space-y-2'} ${dense ? 'hidden md:block' : ''}`}>
              {pilares.slice(0, 3).map((p, i) => {
                const Icon = PILAR_ICONS[i] || Heart
                return (
                  <li key={i} className="flex items-center gap-2.5">
                    <span
                      className="rounded-full flex items-center justify-center flex-shrink-0 text-white"
                      style={{
                        width: tight ? 26 : 30,
                        height: tight ? 26 : 30,
                        background: cfg.corAcento,
                        boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
                      }}
                    >
                      <Icon size={tight ? 12 : 14} />
                    </span>
                    <span
                      className="font-bold leading-snug"
                      style={{
                        fontSize: tight ? 11 : 13,
                        color: corTexto,
                        textShadow: '0 2px 10px rgba(0,0,0,0.55)',
                      }}
                    >
                      {p}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export function LandingFooter({ cfg, whatsapp = '', embedded = false }) {
  const rodape = (cfg.posterRodape || '').trim()
  const redes = (cfg.redesHandle || '').trim()
  const waDigits = String(whatsapp || '').replace(/\D/g, '')
  const waLink = waDigits
    ? `https://wa.me/${waDigits.startsWith('55') ? waDigits : `55${waDigits}`}`
    : null

  const socials = resolveRedesSociais(cfg).map(s => ({
    ...s,
    Icon: SOCIAL_ICONS[s.tipo] || Link2,
    brand: SOCIAL_BRAND[s.tipo] || '#0f172a',
  }))

  // Se só tem @handle legado, vira link do Instagram
  const handleHref = (() => {
    if (socials.length > 0 || !redes) return null
    const handle = redes.replace(/^@/, '').trim()
    if (!handle) return null
    return `https://instagram.com/${handle}`
  })()

  return (
    <footer
      className="w-full flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 relative z-20"
      style={{
        background: embedded ? '#fff' : 'rgba(255,255,255,0.97)',
        borderTop: `3px solid ${cfg.corAcento}`,
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {waLink ? (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0 hover:opacity-90 hover:scale-105 transition-all cursor-pointer"
            style={{ background: cfg.corAcento }}
            title="WhatsApp"
            aria-label="Abrir WhatsApp"
          >
            <MessageCircle size={18} />
          </a>
        ) : (
          <span
            className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0"
            style={{ background: cfg.corAcento }}
            aria-hidden
          >
            <Heart size={16} />
          </span>
        )}
        <p className="font-bold text-slate-800 truncate" style={{ fontSize: 13 }}>
          {rodape || 'Juntos por um Brasil melhor'}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {(socials.length > 0 || redes) && (
          <span className="font-bold uppercase text-slate-500 hidden sm:inline" style={{ fontSize: 10, letterSpacing: '0.08em' }}>
            Me acompanhe nas redes
          </span>
        )}
        {socials.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {socials.map(({ id, href, Icon, label, brand }) => (
              <a
                key={id}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title={`Abrir ${label}`}
                aria-label={`Abrir ${label}`}
                className="group w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer hover:scale-110 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  background: '#f1f5f9',
                  color: '#475569',
                  outlineColor: brand,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = brand
                  e.currentTarget.style.color = '#fff'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = '#f1f5f9'
                  e.currentTarget.style.color = '#475569'
                }}
              >
                <Icon size={16} strokeWidth={2.2} />
              </a>
            ))}
          </div>
        )}
        {redes && (
          handleHref ? (
            <a
              href={handleHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline cursor-pointer transition-colors"
              style={{ fontSize: 12 }}
              title="Abrir Instagram"
            >
              {redes.startsWith('@') ? redes : `@${redes}`}
            </a>
          ) : (
            <span className="font-semibold text-slate-600" style={{ fontSize: 12 }}>
              {redes.startsWith('@') ? redes : `@${redes}`}
            </span>
          )
        )}
      </div>
    </footer>
  )
}

const SOCIAL_ICONS = {
  instagram: Instagram,
  facebook: Facebook,
  youtube: Youtube,
  tiktok: Music2,
  twitter: Twitter,
  linkedin: Linkedin,
  telegram: Send,
  threads: Instagram,
  kwai: Music2,
  site: Link2,
}

const SOCIAL_BRAND = {
  instagram: '#E1306C',
  facebook: '#1877F2',
  youtube: '#FF0000',
  tiktok: '#010101',
  twitter: '#0f172a',
  linkedin: '#0A66C2',
  telegram: '#229ED9',
  threads: '#000000',
  kwai: '#FF4906',
  site: '#0f172a',
}

const PILAR_ICONS = [Users, MapPin, Heart]

function parsePilares(raw) {
  if (Array.isArray(raw)) {
    return raw.map(s => String(s || '').trim()).filter(Boolean).slice(0, 3)
  }
  const s = String(raw || '').trim()
  if (!s) return []
  if (s.includes('\n')) return s.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 3)
  return s.split(/\n|;/).map(x => x.trim()).filter(Boolean).slice(0, 3)
}
