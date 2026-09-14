/** Formatação e links para ficha de igreja (mapa / popup). */

import { formatarEnderecoParada } from './rotasReport'
import { parseCulto, diaShort } from './cultoParse'

export function formatarCepExibicao(cep) {
  const d = String(cep || '').replace(/\D/g, '')
  if (d.length === 8) return `${d.slice(0, 5)}-${d.slice(5)}`
  return String(cep || '').trim()
}

export function normalizarUrlExterna(url, tipo = 'site') {
  const raw = String(url || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (tipo === 'instagram') {
    const h = raw.replace(/^@/, '')
    if (h.includes('instagram.com')) return `https://${h.replace(/^https?:\/\//, '')}`
    return `https://instagram.com/${h}`
  }
  if (tipo === 'facebook') {
    if (raw.includes('facebook.com') || raw.includes('fb.com')) {
      return `https://${raw.replace(/^https?:\/\//, '')}`
    }
    return `https://facebook.com/${raw.replace(/^@/, '')}`
  }
  return `https://${raw}`
}

export function formatarCultoExibicao(culto, filtroDia = 'Todos') {
  const txt = String(culto || '').trim()
  if (!txt) return ''
  const parsed = parseCulto(txt)
  if (!parsed.length) return txt
  const slots = filtroDia !== 'Todos'
    ? parsed.filter(p => p.dia === filtroDia)
    : parsed
  if (!slots.length) return txt
  return slots.map(p => `${diaShort(p.dia)} ${p.horarios.join('/')}`).join(' · ')
}

function waMe(digitos) {
  const d = String(digitos || '').replace(/\D/g, '')
  if (!d) return ''
  const full = d.startsWith('55') ? d : `55${d}`
  if (full.length < 12) return ''
  return `https://wa.me/${full}`
}

export function linksContatoIgreja(ig = {}) {
  const telefone = String(ig.telefone || '').trim()
  const whatsapp = String(ig.whatsapp || '').trim()
  const website = normalizarUrlExterna(ig.website, 'site')
  const instagram = normalizarUrlExterna(ig.instagram, 'instagram')
  const facebook = normalizarUrlExterna(ig.facebook, 'facebook')
  const telHref = telefone ? `tel:${telefone.replace(/[^\d+]/g, '')}` : ''
  let waHref = ''
  if (/wa\.me|whatsapp\.com/i.test(whatsapp)) {
    waHref = /^https?:\/\//i.test(whatsapp) ? whatsapp : `https://${whatsapp}`
  } else if (whatsapp.replace(/\D/g, '').length >= 10) {
    waHref = waMe(whatsapp)
  } else {
    const telD = telefone.replace(/\D/g, '')
    const local = telD.startsWith('55') ? telD.slice(2) : telD
    if (local.length === 11 && local[2] === '9') waHref = waMe(telD)
  }
  return { telefone, whatsapp, website, instagram, facebook, telHref, waHref }
}

export function resumoEnderecoIgreja(ig) {
  return formatarEnderecoParada(ig)
}
