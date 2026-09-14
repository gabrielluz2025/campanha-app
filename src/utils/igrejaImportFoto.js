/**
 * OCR de foto de ficha / placa da igreja → culto, pastor, telefone.
 */
import { redimensionarImagem, normalizarHora } from './agendaImportFoto'
import { parseCulto, formatCultoString } from './cultoParse'

const DIA_RX = /\b(dom(?:ingo)?|seg(?:unda)?|ter(?:ça|ca)?|qua(?:rta)?|qui(?:nta)?|sex(?:ta)?|s[aá]b(?:ado)?)\b\.?\s*(?:[àa]s\s*)?(\d{1,2}(?::\d{2})?\s*h?(?:\s*horas?)?|\d{1,2}h\d{0,2})/gi

const PASTOR_RX = /(?:pastor|pr\.?|pb\.?|presidente|dirigente)\s*[:\-]?\s*([A-Za-zÀ-ú][A-Za-zÀ-ú\s.'-]{2,40})/gi

const TEL_RX = /(?:\(?\d{2}\)?\s*)?\d{4,5}[\s.-]?\d{4}/g

function tituloNome(s) {
  return String(s || '').trim().replace(/\s+/g, ' ')
    .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

function extrairCultoDoTexto(text) {
  const slots = []
  let m
  const map = new Map()
  const alias = {
    dom: 'dom', domingo: 'dom',
    seg: 'seg', segunda: 'seg',
    ter: 'ter', terca: 'ter', terça: 'ter',
    qua: 'qua', quarta: 'qua',
    qui: 'qui', quinta: 'qui',
    sex: 'sex', sexta: 'sex',
    sab: 'sab', sábado: 'sab', sabado: 'sab',
  }
  while ((m = DIA_RX.exec(text)) !== null) {
    const dia = alias[m[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')]
    const hora = normalizarHora(m[2])
    if (!dia || !hora) continue
    if (!map.has(dia)) map.set(dia, [])
    map.get(dia).push(hora)
  }
  for (const [dia, horarios] of map) {
    slots.push({ dia, horarios: [...new Set(horarios)] })
  }
  if (slots.length) return formatCultoString(slots)
  const parsed = parseCulto(text)
  return parsed.length ? formatCultoString(parsed) : ''
}

function extrairPastorDoTexto(text) {
  const found = []
  let m
  while ((m = PASTOR_RX.exec(text)) !== null) {
    const nome = tituloNome(m[1].replace(/\s+(tel|fone|telefone|cel).*$/i, ''))
    if (nome.length >= 4 && !found.includes(nome)) found.push(nome)
  }
  return found
}

function extrairTelefoneDoTexto(text) {
  const m = text.match(TEL_RX)
  if (!m?.length) return ''
  const tel = m.find(t => t.replace(/\D/g, '').length >= 10) || m[0]
  return tel.trim()
}

/** Extrai campos editáveis a partir de texto OCR. */
export function extrairDadosIgrejaDoTexto(texto) {
  const text = String(texto || '').replace(/\r/g, '\n')
  const culto = extrairCultoDoTexto(text)
  const pastores = extrairPastorDoTexto(text)
  const telefone = extrairTelefoneDoTexto(text)
  return {
    culto,
    telefone,
    pastor1: pastores[0] || '',
    pastor2: pastores[1] || '',
    textoBruto: text.slice(0, 2000),
  }
}

/** OCR de foto → dados da ficha. */
export async function lerIgrejaFoto(file, { onProgress } = {}) {
  const imagem = await redimensionarImagem(file)
  const Tesseract = await import('tesseract.js')
  const result = await Tesseract.recognize(imagem, 'por', {
    logger: m => {
      if (m.status === 'recognizing text' && typeof onProgress === 'function') {
        onProgress(Math.round((m.progress || 0) * 100))
      }
    },
  })
  const texto = result?.data?.text || ''
  const dados = extrairDadosIgrejaDoTexto(texto)
  return { ...dados, confidence: result?.data?.confidence }
}
