import { Instagram, Facebook, MessageCircle } from 'lucide-react'
import { linksContatoIgreja } from '../utils/igrejaDetalhe'

/**
 * Ícones clicáveis de WhatsApp / Instagram / Facebook.
 * O clique não seleciona a linha (stopPropagation).
 */
export default function IgrejaRedesIcons({ ig, size = 13, className = '' }) {
  const links = linksContatoIgreja(ig)
  const items = []
  if (links.waHref) {
    items.push({ href: links.waHref, label: 'WhatsApp', kind: 'wa' })
  }
  if (links.instagram) {
    items.push({ href: links.instagram, label: 'Instagram', kind: 'ig' })
  }
  if (links.facebook) {
    items.push({ href: links.facebook, label: 'Facebook', kind: 'fb' })
  }
  if (!items.length) return null

  return (
    <span
      className={`igreja-redes ${className}`.trim()}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      {items.map(it => (
        <a
          key={it.kind}
          href={it.href}
          target="_blank"
          rel="noopener noreferrer"
          title={it.label}
          aria-label={it.label}
          className={`igreja-redes__btn igreja-redes__btn--${it.kind}`}
        >
          {it.kind === 'wa' && <MessageCircle size={size} />}
          {it.kind === 'ig' && <Instagram size={size} />}
          {it.kind === 'fb' && <Facebook size={size} />}
        </a>
      ))}
    </span>
  )
}
