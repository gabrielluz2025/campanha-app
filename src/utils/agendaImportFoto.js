/**
 * OCR + extração de compromissos a partir de foto da agenda do candidato.
 */

import { CATEGORIAS_AGENDA } from './agendaCandidato'

const MESES_PT = {
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
}

const DIAS_PT = /^(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo|seg|ter|qua|qui|sex|s[aá]b|dom)\b/i

function pad2(n) {
  return String(n).padStart(2, '0')
}

export function isoHoje() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export function normalizarHora(raw) {
  if (!raw) return ''
  let s = String(raw).trim().toLowerCase().replace(/[hH]/g, ':').replace(/\./g, ':')
  s = s.replace(/[^\d:]/g, '')
  const m = s.match(/^(\d{1,2}):?(\d{2})?$/)
  if (!m) return ''
  const hh = Math.min(23, parseInt(m[1], 10))
  const mm = m[2] != null ? Math.min(59, parseInt(m[2], 10)) : 0
  return `${pad2(hh)}:${pad2(mm)}`
}

/** Converte DD/MM[/YYYY] ou texto com mês para YYYY-MM-DD */
export function normalizarData(raw, anoRef = new Date().getFullYear()) {
  if (!raw) return ''
  const s = String(raw).trim().toLowerCase()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  let m = s.match(/(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/)
  if (m) {
    const d = parseInt(m[1], 10)
    const mo = parseInt(m[2], 10)
    let y = m[3] ? parseInt(m[3], 10) : anoRef
    if (y < 100) y += 2000
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      return `${y}-${pad2(mo)}-${pad2(d)}`
    }
  }

  m = s.match(/(\d{1,2})\s+de\s+([a-zçãé]+)(?:\s+de\s+(\d{4}))?/i)
  if (m) {
    const mo = MESES_PT[m[2].normalize('NFD').replace(/\u0300-\u036f/g, '').replace('ç', 'c')]
      || MESES_PT[m[2]]
    if (mo) {
      const d = parseInt(m[1], 10)
      const y = m[3] ? parseInt(m[3], 10) : anoRef
      return `${y}-${pad2(mo)}-${pad2(d)}`
    }
  }

  // "28 jul" / "28/jul"
  m = s.match(/(\d{1,2})\s*[\/\-\s]?\s*([a-zç]{3,9})(?:\s+(\d{4}))?/i)
  if (m) {
    const key = m[2].normalize('NFD').replace(/\u0300-\u036f/g, '').slice(0, 3)
    const mo = MESES_PT[m[2]] || MESES_PT[key]
    if (mo) {
      const d = parseInt(m[1], 10)
      const y = m[3] ? parseInt(m[3], 10) : anoRef
      return `${y}-${pad2(mo)}-${pad2(d)}`
    }
  }

  return ''
}

function addHour(hora, horas = 1) {
  const [hh, mm] = (hora || '09:00').split(':').map(Number)
  const total = hh * 60 + mm + horas * 60
  const h2 = Math.floor(total / 60) % 24
  const m2 = total % 60
  return `${pad2(h2)}:${pad2(m2)}`
}

function limparTitulo(s) {
  return String(s || '')
    .replace(/^[\-–—•·|*]+\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function detectarCategoria(titulo) {
  const t = (titulo || '').toLowerCase()
  if (/porta\s*a\s*porta|panfle|rua/.test(t)) return 'porta_porta'
  if (/carreat/.test(t)) return 'carreata'
  if (/live|m[ií]dia|entrevista|r[aá]dio|tv\b/.test(t)) return t.includes('entrev') ? 'entrevista' : 'live'
  if (/gabinete|assembleia|c[aâ]mara/.test(t)) return 'gabinete'
  if (/culto|igreja|missa/.test(t)) return 'culto'
  if (/palestra|palestr/.test(t)) return 'palestra'
  if (/reuni[aã]o|encont/.test(t)) return 'reuniao'
  if (/visita/.test(t)) return 'visita'
  return 'reuniao'
}

/**
 * Extrai eventos do texto OCR.
 * Mantém "data corrente" quando a foto lista horários sob um cabeçalho de dia.
 */
export function extrairEventosDoOcr(texto, { dataPadrao = isoHoje(), anoRef } = {}) {
  const ano = anoRef || (dataPadrao ? parseInt(dataPadrao.slice(0, 4), 10) : new Date().getFullYear())
  const linhas = String(texto || '')
    .split(/\r?\n/)
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  let dataAtual = dataPadrao
  const out = []

  for (const linha of linhas) {
    // Cabeçalho de data
    const dataLinha = normalizarData(linha, ano)
    if (dataLinha && (DIAS_PT.test(linha) || /^\d{1,2}[\/\-.]/.test(linha) || /\d{1,2}\s+de\s+/i.test(linha))) {
      // Se a linha é só (ou quase só) data, atualiza contexto
      const resto = linha
        .replace(DIAS_PT, '')
        .replace(/\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?/g, '')
        .replace(/\d{1,2}\s+de\s+[a-zçãé]+(?:\s+de\s+\d{4})?/gi, '')
        .replace(/[-–—|:·]/g, '')
        .trim()
      dataAtual = dataLinha
      if (resto.length < 4) continue
    } else if (dataLinha && linha.length < 28 && !/\d{1,2}\s*[:hH]/.test(linha)) {
      dataAtual = dataLinha
      continue
    }

    // Horários: 09:00, 9h, 09h30, 09:00-10:30, 09h às 10h
    const timeRe = /(\d{1,2})\s*[:hH]\s*(\d{2})?/g
    const times = []
    let tm
    while ((tm = timeRe.exec(linha)) !== null) {
      times.push({
        raw: tm[0],
        idx: tm.index,
        hora: normalizarHora(`${tm[1]}:${tm[2] || '00'}`),
      })
    }
    if (!times.length) continue

    const horaInicio = times[0].hora
    let horaFim = times[1]?.hora || ''
    if (!horaFim) horaFim = addHour(horaInicio, 1)

    // Título: texto após o(s) horário(s)
    let titulo = linha
    for (const t of times) {
      titulo = titulo.replace(t.raw, ' ')
    }
    titulo = titulo
      .replace(/\b(às|as|ate|até|a)\b/gi, ' ')
      .replace(/[-–—|/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    // Data embutida na mesma linha
    const dataNaLinha = normalizarData(linha, ano)
    const data = dataNaLinha || dataAtual || dataPadrao

    // Separar local se houver " - " ou " em "
    let local = ''
    let nome = limparTitulo(titulo)
    const sep = nome.split(/\s+[–\-]\s+|\s+em\s+/i)
    if (sep.length >= 2) {
      nome = limparTitulo(sep[0])
      local = limparTitulo(sep.slice(1).join(' - '))
    }

    if (!nome || nome.length < 2) {
      nome = `Compromisso ${horaInicio}`
    }

    out.push({
      titulo: nome,
      dataInicio: data,
      dataFim: data,
      horaInicio,
      horaFim,
      local,
      categoria: detectarCategoria(nome),
      confianca: times.length >= 1 && nome.length >= 4 ? 'ok' : 'baixa',
      _fonte: linha,
    })
  }

  // Dedup simples
  const seen = new Set()
  return out.filter(e => {
    const k = `${e.dataInicio}|${e.horaInicio}|${e.titulo.toLowerCase()}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Redimensiona imagem grande para OCR mais rápido */
export function redimensionarImagem(file, maxLado = 1800) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        let { width, height } = img
        if (width <= maxLado && height <= maxLado) {
          URL.revokeObjectURL(url)
          resolve(file)
          return
        }
        const scale = maxLado / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          blob => {
            URL.revokeObjectURL(url)
            if (!blob) {
              resolve(file)
              return
            }
            resolve(new File([blob], file.name || 'agenda.jpg', { type: 'image/jpeg' }))
          },
          'image/jpeg',
          0.92,
        )
      } catch (err) {
        URL.revokeObjectURL(url)
        reject(err)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não foi possível ler a imagem'))
    }
    img.src = url
  })
}

/**
 * Roda OCR (tesseract) e devolve { texto, eventos, progresso callback }.
 */
export async function ocrAgendaFoto(file, { onProgress, dataPadrao } = {}) {
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
  const eventos = extrairEventosDoOcr(texto, { dataPadrao: dataPadrao || isoHoje() })
  return { texto, eventos, confidence: result?.data?.confidence }
}

async function getPdfjs() {
  const pdfjs = await import('pdfjs-dist')
  const { configurarPdfWorker } = await import('./pdfWorker')
  configurarPdfWorker()
  return pdfjs
}

/** Agrupa itens do PDF em linhas (melhor para agenda com horários) */
function textContentParaTexto(content) {
  const items = (content.items || []).filter(i => i && typeof i.str === 'string' && i.str.length)
  if (!items.length) return ''

  const enriched = items.map(item => {
    const t = item.transform || [1, 0, 0, 1, 0, 0]
    return { str: item.str, x: t[4] || 0, y: t[5] || 0 }
  })
  enriched.sort((a, b) => (b.y - a.y) || (a.x - b.x))

  const lines = []
  let cur = []
  let lastY = null
  for (const it of enriched) {
    if (lastY != null && Math.abs(it.y - lastY) > 8) {
      lines.push(cur.map(c => c.str).join(' ').replace(/\s+/g, ' ').trim())
      cur = [it]
    } else {
      cur.push(it)
    }
    lastY = it.y
  }
  if (cur.length) lines.push(cur.map(c => c.str).join(' ').replace(/\s+/g, ' ').trim())
  return lines.filter(Boolean).join('\n')
}

async function renderPaginaPdfCanvas(page, scale = 1.6) {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas
}

function canvasParaBlob(canvas, type = 'image/jpeg', quality = 0.9) {
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), type, quality)
  })
}

/**
 * Lê PDF da agenda: texto embutido primeiro; se for scan, OCR nas páginas.
 * Retorna { texto, eventos, previewUrl, metodo: 'texto'|'ocr' }.
 */
export async function lerAgendaPdf(file, { onProgress, dataPadrao, maxPaginas = 8 } = {}) {
  const pdfjs = await getPdfjs()
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise
  const n = Math.min(pdf.numPages, maxPaginas)
  const dataRef = dataPadrao || isoHoje()

  let texto = ''
  let previewUrl = null

  for (let i = 1; i <= n; i++) {
    const page = await pdf.getPage(i)
    if (i === 1) {
      try {
        const canvas = await renderPaginaPdfCanvas(page, 1.2)
        const blob = await canvasParaBlob(canvas)
        if (blob) previewUrl = URL.createObjectURL(blob)
      } catch { /* preview opcional */ }
    }
    const content = await page.getTextContent()
    const pageText = textContentParaTexto(content)
    if (pageText) texto += (texto ? '\n\n' : '') + pageText
    if (onProgress) onProgress(Math.round((i / n) * 35))
  }

  let eventos = extrairEventosDoOcr(texto, { dataPadrao: dataRef })
  const textoCurto = texto.replace(/\s+/g, ' ').trim().length < 40
  const semHorario = !/\d{1,2}\s*[:hH]/.test(texto)

  // PDF escaneado / sem texto útil → OCR página a página
  if ((textoCurto || semHorario || eventos.length === 0) && n > 0) {
    const Tesseract = await import('tesseract.js')
    const partes = []
    for (let i = 1; i <= n; i++) {
      const page = await pdf.getPage(i)
      const canvas = await renderPaginaPdfCanvas(page, 1.8)
      const blob = await canvasParaBlob(canvas)
      if (!blob) continue
      const result = await Tesseract.recognize(blob, 'por', {
        logger: m => {
          if (m.status === 'recognizing text' && onProgress) {
            const base = 35 + ((i - 1) / n) * 65
            onProgress(Math.min(99, Math.round(base + (m.progress || 0) * (65 / n))))
          }
        },
      })
      if (result?.data?.text) partes.push(result.data.text)
    }
    texto = partes.join('\n\n')
    eventos = extrairEventosDoOcr(texto, { dataPadrao: dataRef })
    if (onProgress) onProgress(100)
    return { texto, eventos, previewUrl, metodo: 'ocr' }
  }

  if (onProgress) onProgress(100)
  return { texto, eventos, previewUrl, metodo: 'texto' }
}

export function ehArquivoPdf(file) {
  if (!file) return false
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')
}

/** Foto ou PDF → { texto, eventos, previewUrl } */
export async function lerAgendaArquivo(file, opts = {}) {
  if (ehArquivoPdf(file)) {
    return lerAgendaPdf(file, opts)
  }
  const { texto, eventos } = await ocrAgendaFoto(file, opts)
  return { texto, eventos, previewUrl: null, metodo: 'ocr' }
}

export function eventoPreviewParaAgenda(row, defaults = {}) {
  const data = row.dataInicio || defaults.dataPadrao || isoHoje()
  const titulo = limparTitulo(row.titulo) || 'Compromisso'
  const horaInicio = normalizarHora(row.horaInicio) || '09:00'
  const horaFim = normalizarHora(row.horaFim) || addHour(horaInicio, 1)
  const catOk = CATEGORIAS_AGENDA.some(c => c.id === row.categoria)
  return {
    titulo,
    dataInicio: data,
    dataFim: row.dataFim || data,
    horaInicio,
    horaFim,
    local: limparTitulo(row.local || ''),
    categoria: catOk ? row.categoria : detectarCategoria(titulo),
    agendaTipo: 'candidato',
    candidatoPresente: true,
    assessorId: '',
    privado: false,
    indicadoPor: '',
    contato: '',
    observacoes: row.observacoes || 'Importado da foto',
    representantes: [{ data, nome: '' }],
    cor: '#f59e0b',
    recorrencia: 'nenhuma',
    recorrenciaAte: '',
    serieId: '',
  }
}
