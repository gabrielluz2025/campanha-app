import { DENOMINACAO_PADRAO, COR_DENOMINACAO, SETORES } from '../constants/igrejasTheme'

function darkenHex(hex, amount = 0.15) {
  const h = String(hex || '#888').replace('#', '')
  if (h.length !== 6) return hex
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
  const mix = v => Math.max(0, Math.round(v * (1 - amount)))
  return `#${[mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export function toGoogleMapsIcon(svg, w, h, anchorX = w / 2, anchorY = h - 2) {
  const url = svgDataUrl(svg)
  if (typeof window !== 'undefined' && window.google?.maps) {
    return {
      url,
      scaledSize: new window.google.maps.Size(w, h),
      anchor: new window.google.maps.Point(anchorX, anchorY),
    }
  }
  return { url, scaledSize: { width: w, height: h }, anchor: { x: anchorX, y: anchorY } }
}

function lightenHex(hex, amount = 0.2) {
  const h = String(hex || '#888').replace('#', '')
  if (h.length !== 6) return hex
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
  const mix = v => Math.min(255, Math.round(v + (255 - v) * amount))
  return `#${[mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

/** Pin clássico de igreja — formato gota (ADBLU). */
export function googlePinIconAdblu(
  label,
  color,
  selecionado = false,
  visitado = false,
  prioridade = 'media',
  setor = '',
  compact = false,
  visitCount = 0,
) {
  return googlePinIconShape({
    shape: 'teardrop',
    label,
    color,
    selecionado,
    visitado,
    prioridade,
    setor,
    compact,
    visitCount,
    innerMark: 'cross',
  })
}

/** Pin clássico (gota simples) — outras denominações, sem cruz ADBLU. */
export function googlePinIconOutras(
  label,
  color,
  selecionado = false,
  visitado = false,
  prioridade = 'media',
  compact = false,
  visitCount = 0,
) {
  return googlePinIconShape({
    shape: 'teardrop',
    label,
    color,
    selecionado,
    visitado,
    prioridade,
    compact,
    visitCount,
    innerMark: 'dot',
    outras: true,
  })
}

/** @deprecated Use googlePinIconAdblu / googlePinIconOutras — mantido para compat. */
export function googlePinIcon(
  label,
  color,
  selecionado = false,
  visitado = false,
  denominacao = DENOMINACAO_PADRAO,
  prioridade = 'media',
  setor = '',
  compact = false,
  visitCount = 0,
  pinVariant,
) {
  const isAd = pinVariant
    ? pinVariant === 'adblu'
    : denominacao === DENOMINACAO_PADRAO
  if (isAd) {
    return googlePinIconAdblu(label, color, selecionado, visitado, prioridade, setor, compact, visitCount)
  }
  return googlePinIconOutras(label, color, selecionado, visitado, prioridade, compact, visitCount)
}

function googlePinIconShape({
  shape,
  label,
  color,
  selecionado,
  visitado,
  prioridade = 'media',
  setor = '',
  compact = false,
  visitCount = 0,
  innerMark = 'dot',
  outras = false,
}) {
  const isAlta = prioridade === 'alta' && !visitado
  const base = color || (outras
    ? '#38bdf8'
    : (shape === 'teardrop'
      ? (SETORES[setor] || COR_DENOMINACAO[DENOMINACAO_PADRAO] || '#2563eb')
      : '#38bdf8'))

  const fillA = visitado ? '#f8e08e' : lightenHex(base, 0.18)
  const fillB = visitado ? '#b8860b' : darkenHex(base, 0.28)
  const stroke = selecionado
    ? (outras ? '#7dd3fc' : '#f0d48a')
    : (isAlta ? '#fbbf24' : 'rgba(255,255,255,0.82)')
  const strokeW = selecionado ? 2.4 : (isAlta ? 2 : 1.4)
  const scale = compact ? 0.72 : (selecionado ? 1.22 : 1)

  const vezes = Number(visitCount) || 0
  const mark = label && String(label).trim()
    ? String(label).slice(0, 2)
    : (vezes > 1 ? String(vezes > 9 ? '9+' : vezes) : (visitado ? '✓' : ''))

  const innerFill = visitado ? '#1a1408' : 'rgba(8,12,20,0.38)'
  const innerInk = visitado ? '#f0d48a' : '#ffffff'
  const gid = `pin${shape}${visitado ? 'v' : 'p'}${selecionado ? 's' : ''}${isAlta ? 'a' : ''}${compact ? 'c' : ''}`

  if (shape === 'circle') {
    const w = Math.round(30 * scale)
    const h = Math.round(30 * scale)
    const cx = 15
    const cy = 15
    const innerSvg = mark
      ? `<text x="${cx}" y="${cy + 3.8}" text-anchor="middle" fill="${innerInk}" font-size="${String(mark).length > 1 ? 7 : 9}" font-weight="800" font-family="system-ui,sans-serif">${mark}</text>`
      : (innerMark === 'cross'
        ? `<path d="M${cx} ${cy - 4}v8M${cx - 4} ${cy}h8" stroke="${innerInk}" stroke-width="1.8" stroke-linecap="round"/>`
        : `<circle cx="${cx}" cy="${cy}" r="3.2" fill="${innerInk}" opacity="0.92"/>`)
    const svg = `<svg width="${w}" height="${h}" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${gid}" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stop-color="${fillA}"/>
          <stop offset="100%" stop-color="${fillB}"/>
        </linearGradient>
      </defs>
      <ellipse cx="${cx}" cy="${cy + 12}" rx="5" ry="1.8" fill="rgba(0,0,0,0.32)"/>
      <circle cx="${cx}" cy="${cy}" r="12.5" fill="url(#${gid})" stroke="${stroke}" stroke-width="${strokeW}"/>
      <circle cx="${cx}" cy="${cy}" r="7.2" fill="${innerFill}"/>
      ${innerSvg}
    </svg>`
    return toGoogleMapsIcon(svg, w, h, w / 2, h / 2 + 2)
  }

  const w = Math.round(28 * scale)
  const h = Math.round(38 * scale)
  const innerSvg = mark
    ? `<text x="14" y="14.4" text-anchor="middle" fill="${innerInk}" font-size="${String(mark).length > 1 ? 7 : 9}" font-weight="800" font-family="system-ui,sans-serif">${mark}</text>`
    : (innerMark === 'cross'
      ? `<path d="M14 8.5v7M10.5 12h7" stroke="${innerInk}" stroke-width="1.8" stroke-linecap="round"/>`
      : `<circle cx="14" cy="12.1" r="2.1" fill="${innerInk}" opacity="0.92"/>`)

  const badge = vezes > 0 && !label
    ? `<circle cx="22" cy="6" r="6" fill="#0b1220" stroke="${fillA}" stroke-width="1.3"/>
       <text x="22" y="8.6" text-anchor="middle" fill="${fillA}" font-size="7" font-weight="900" font-family="system-ui,sans-serif">${vezes > 9 ? '9+' : vezes}</text>`
    : ''

  const tipRx = outras ? 3.6 : 4.2
  const svg = `<svg width="${w}" height="${h}" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${gid}" x1="0.2" y1="0" x2="0.8" y2="1">
        <stop offset="0%" stop-color="${fillA}"/>
        <stop offset="100%" stop-color="${fillB}"/>
      </linearGradient>
    </defs>
    <ellipse cx="15" cy="35.2" rx="${tipRx}" ry="1.6" fill="rgba(0,0,0,0.38)"/>
    <path d="M14 1.6C8.2 1.6 3.5 6.3 3.5 12.1c0 8.4 9.2 21.4 10.1 22.6a.7.7 0 0 0 1.1 0C15.6 33.5 24.5 20.5 24.5 12.1 24.5 6.3 19.8 1.6 14 1.6z"
      fill="url(#${gid})" stroke="${stroke}" stroke-width="${strokeW}"/>
    <circle cx="14" cy="12.1" r="5.6" fill="${innerFill}"/>
    ${innerSvg}
    ${badge}
  </svg>`
  return toGoogleMapsIcon(svg, w, h, w / 2, h - 2)
}

export function streetViewMapsUrl(lat, lng, endereco) {
  const end = String(endereco || '').trim()
  if (end) {
    return `https://www.google.com/maps/@?api=1&map_action=pano&query=${encodeURIComponent(end)}`
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return ''
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`
}

/** Marcador quadrado (equipe / parada agenda) */
export function googleSquareIcon(label, cor, selecionado = false) {
  const glow = selecionado ? '#f0d48a' : 'rgba(255,255,255,0.9)'
  const w = 32
  const h = 32
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="28" height="28" rx="9" fill="${cor}" stroke="${glow}" stroke-width="2.5"/>
    <text x="16" y="20" text-anchor="middle" fill="#fff" font-size="11" font-weight="800" font-family="system-ui,sans-serif">${label}</text>
  </svg>`
  return toGoogleMapsIcon(svg, w, h, 16, 16)
}

/** Ponto ao vivo da equipe em campo */
export function googleLiveTeamIcon(inicial = '') {
  const mark = String(inicial || '•').slice(0, 1).toUpperCase()
  const svg = `<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <circle cx="20" cy="20" r="18" fill="rgba(16,185,129,0.18)"/>
    <circle cx="20" cy="20" r="11" fill="rgba(16,185,129,0.35)" stroke="#6ee7b7" stroke-width="1.5"/>
    <circle cx="20" cy="20" r="7" fill="#059669" stroke="#ecfdf5" stroke-width="2"/>
    <text x="20" y="23.2" text-anchor="middle" fill="#fff" font-size="8" font-weight="800" font-family="system-ui,sans-serif">${mark}</text>
  </svg>`
  return toGoogleMapsIcon(svg, 40, 40, 20, 20)
}

/** Círculo para colégios (mapa eleitoral) */
export function googleCircleIcon(radiusPx, fillColor, strokeColor, strokeWeight = 2) {
  const d = Math.max(radiusPx * 2, 16)
  const r = d / 2
  const svg = `<svg width="${d}" height="${d}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${r}" cy="${r}" r="${r - strokeWeight}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWeight}"/>
  </svg>`
  return toGoogleMapsIcon(svg, d, d, r, r)
}

/** Label de bairro */
export function googleBairroLabelIcon(nome) {
  const text = String(nome || '').slice(0, 24)
  const w = Math.max(text.length * 7 + 16, 48)
  const h = 20
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${w}" height="${h}" rx="6" fill="rgba(7,10,18,0.82)" stroke="rgba(255,255,255,0.22)"/>
    <text x="${w / 2}" y="13" text-anchor="middle" fill="#e2e8ff" font-size="9" font-weight="800" font-family="system-ui,sans-serif">${text}</text>
  </svg>`
  return toGoogleMapsIcon(svg, w, h, w / 2, h / 2)
}
