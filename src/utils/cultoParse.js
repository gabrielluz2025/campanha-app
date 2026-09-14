/** Parser e resumos de horários de culto (texto livre: "Dom 18:30 · Ter 19:30"). */

import { buscarAdbluPorLocal } from './igrejasAdbluNome'

export const DIAS_CULTO = [
  { id: 'dom', label: 'Domingo', short: 'Dom' },
  { id: 'seg', label: 'Segunda', short: 'Seg' },
  { id: 'ter', label: 'Terça', short: 'Ter' },
  { id: 'qua', label: 'Quarta', short: 'Qua' },
  { id: 'qui', label: 'Quinta', short: 'Qui' },
  { id: 'sex', label: 'Sexta', short: 'Sex' },
  { id: 'sab', label: 'Sábado', short: 'Sáb' },
]

const DIA_ALIASES = {
  dom: 'dom', domingo: 'dom',
  seg: 'seg', segunda: 'seg', 'segunda-feira': 'seg',
  ter: 'ter', terca: 'ter', 'terça': 'ter', 'terça-feira': 'ter',
  qua: 'qua', quarta: 'qua', 'quarta-feira': 'qua',
  qui: 'qui', quinta: 'qui', 'quinta-feira': 'qui',
  sex: 'sex', sexta: 'sex', 'sexta-feira': 'sex',
  sab: 'sab', sabado: 'sab', 'sábado': 'sab',
}

function normToken(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/**
 * @returns {{ dia: string, horarios: string[] }[]}
 */
function normalizarHorario(t) {
  let s = String(t || '').trim()
  if (!s) return ''
  const soHoras = s.match(/^(\d{1,2})\s*h(?:oras?)?$/i)
  if (soHoras) return `${String(soHoras[1]).padStart(2, '0')}:00`
  s = s
    .replace(/(\d{1,2})\s*h\s*(\d{2})/i, '$1:$2')
    .replace(/(\d{1,2})h(\d{0,2})/i, (_, h, mm) => `${h}:${mm || '00'}`)
    .replace(/^(\d):/, '0$1:')
  if (/^\d{1,2}:\d{2}/.test(s)) {
    const [hh, mm] = s.split(':')
    return `${String(hh).padStart(2, '0')}:${String(mm).slice(0, 2)}`
  }
  return ''
}

/** Horário vindo do Google Places (opening_hours.weekday_text). */
export function pareceHorarioGoogle(text) {
  const t = String(text || '').toLowerCase()
  if (!t.includes(':')) return false
  return /(segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)(-feira)?\s*:/.test(t)
}

function parseCultoPadrao(text) {
  const slots = text
    .split(/\s*[·•|;]\s*|\s*,\s*(?=[A-Za-zÀ-ú])|\s{2,}|\s+e\s+/i)
    .map(s => s.trim())
    .filter(Boolean)
  const byDia = new Map()

  for (const slot of slots) {
    const m = slot.match(/^([A-Za-zÀ-úçÇ]+)\.?\s+(?:às|as)?\s*(.+)$/iu)
    if (!m) continue
    const diaId = DIA_ALIASES[normToken(m[1])]
    if (!diaId) continue
    const timesRaw = m[2]
    const horarios = timesRaw
      .split(/\s*\/\s*/)
      .map(normalizarHorario)
      .filter(Boolean)

    if (!horarios.length) {
      const fallback = (timesRaw.match(/\d{1,2}:\d{2}|\d{1,2}\s*h(?:oras?)?/gi) || [])
        .map(normalizarHorario)
        .filter(Boolean)
      if (!fallback.length) continue
      const prev = byDia.get(diaId) || []
      byDia.set(diaId, [...prev, ...fallback])
      continue
    }
    const prev = byDia.get(diaId) || []
    byDia.set(diaId, [...prev, ...horarios])
  }

  return DIAS_CULTO
    .filter(d => byDia.has(d.id))
    .map(d => ({
      dia: d.id,
      horarios: [...new Set(byDia.get(d.id))],
    }))
}

/** "segunda-feira: 08:00 – 12:00, 19:00 – 21:00" (Google weekday_text). */
function parseCultoGoogle(text) {
  if (!pareceHorarioGoogle(text)) return []

  const byDia = new Map()
  const parts = String(text).split(/;\s*/).filter(Boolean)

  for (const part of parts) {
    const m = part.match(/^([^:]+):\s*(.+)$/i)
    if (!m) continue
    const diaId = DIA_ALIASES[normToken(m[1])]
    if (!diaId) continue
    const body = m[2].trim()
    if (/^(fechado|closed)\s*$/i.test(body)) continue

    const horarios = []
    for (const seg of body.split(/\s*,\s*/)) {
      const range = seg.match(/(\d{1,2}:\d{2})\s*[–\-—]\s*(\d{1,2}:\d{2})/)
      if (range) {
        const h = normalizarHorario(range[1])
        if (h) horarios.push(h)
        continue
      }
      const single = seg.match(/(\d{1,2}:\d{2})/)
      if (single) {
        const h = normalizarHorario(single[1])
        if (h) horarios.push(h)
      }
    }
    if (!horarios.length) continue
    const prev = byDia.get(diaId) || []
    byDia.set(diaId, [...prev, ...horarios])
  }

  return DIAS_CULTO
    .filter(d => byDia.has(d.id))
    .map(d => ({
      dia: d.id,
      horarios: [...new Set(byDia.get(d.id))],
    }))
}

export function parseCulto(raw) {
  const text = String(raw || '').trim()
  if (!text) return []

  const padrao = parseCultoPadrao(text)
  if (padrao.length) return padrao
  return parseCultoGoogle(text)
}

/** Prefere culto oficial ADBLU quando o cadastro tem horário comercial do Google. */
export function resolverCultoIgreja(ig) {
  const culto = String(ig?.culto || '').trim()
  if (!culto) {
    const adblu = buscarAdbluPorLocal({
      endereco: ig?.endereco,
      bairro: ig?.setor || ig?.bairro,
      nomeGoogle: ig?.nome,
      nomePlanilha: ig?.nome,
    })
    return adblu?.culto || ''
  }

  const parsed = parseCulto(culto)
  if (!parsed.length || pareceHorarioGoogle(culto)) {
    const adblu = buscarAdbluPorLocal({
      endereco: ig?.endereco,
      bairro: ig?.setor || ig?.bairro,
      nomeGoogle: ig?.nome,
      nomePlanilha: ig?.nome,
    })
    if (adblu?.culto && parseCulto(adblu.culto).length) return adblu.culto
  }
  return culto
}

export function diaLabel(id) {
  return DIAS_CULTO.find(d => d.id === id)?.label || id
}

export function diaShort(id) {
  return DIAS_CULTO.find(d => d.id === id)?.short || id
}

/** Modelos comuns de horário — escolha e ajuste os dias/horas. */
export const CULTOS_TEMPLATES = [
  { id: 'ad-padrao', label: 'AD · Dom + Qua', culto: 'Dom 18:30 · Qua 19:30' },
  { id: 'ad-duplo', label: 'AD · Dom manhã/noite', culto: 'Dom 10:00/19:00 · Qua 19:30' },
  { id: 'ad-semana', label: 'AD · Dom + Ter + Qui', culto: 'Dom 18:30 · Ter 19:30 · Qui 19:30' },
  { id: 'dom-noite', label: 'Só domingo', culto: 'Dom 19:00' },
  { id: 'dom-manha', label: 'Domingo manhã', culto: 'Dom 10:00' },
]

/** Converte slots parseados em texto de culto (Dom 18:30 · Qua 19:30). */
export function formatCultoString(parsed) {
  if (!Array.isArray(parsed) || !parsed.length) return ''
  return parsed
    .map(s => `${diaShort(s.dia)} ${(s.horarios || []).join('/')}`)
    .join(' · ')
}

/** Slots vazios para editor visual (todos os dias). */
export function cultoSlotsVazios() {
  return DIAS_CULTO.map(d => ({ dia: d.id, horarios: [] }))
}

/** Texto → slots para editor; preenche dias sem horário. */
export function cultoTextoParaEditor(text) {
  const parsed = parseCulto(text)
  const map = new Map(parsed.map(s => [s.dia, [...(s.horarios || [])]]))
  return DIAS_CULTO.map(d => ({ dia: d.id, horarios: map.get(d.id) || [] }))
}

/** Slots do editor → texto de culto. */
export function editorParaCultoTexto(slots) {
  const parsed = (slots || [])
    .filter(s => s?.horarios?.length)
    .map(s => ({ dia: s.dia, horarios: s.horarios.filter(Boolean) }))
  return formatCultoString(parsed)
}

/** id do dia (dom…sab) a partir de YYYY-MM-DD local. */
export function diaSemanaDeData(ymd) {
  const s = String(ymd || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (Number.isNaN(dt.getTime())) return ''
  return ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'][dt.getDay()] || ''
}

/**
 * Texto do culto focado no dia da rota (ex.: "Ter 19:30").
 * Sem culto naquele dia → string vazia (não lista a semana inteira).
 */
export function cultoParaData(cultoRaw, dataYmd) {
  const raw = String(cultoRaw || '').trim()
  if (!raw) return ''
  const parsed = parseCulto(raw)
  if (!parsed.length) return ''
  const dia = diaSemanaDeData(dataYmd)
  if (!dia) {
    return parsed.map(s => `${diaShort(s.dia)} ${(s.horarios || []).join('/')}`).join(' · ')
  }
  const slot = parsed.find(s => s.dia === dia)
  if (!slot?.horarios?.length) return ''
  return `${diaShort(dia)} ${slot.horarios.join('/')}`
}

/** Primeiro horário de culto no dia da data (para sugerir horaPrevista). */
export function horaInicioCultoNaData(cultoRaw, dataYmd) {
  const dia = diaSemanaDeData(dataYmd)
  if (!dia) return ''
  const slot = parseCulto(cultoRaw).find(s => s.dia === dia)
  return String(slot?.horarios?.[0] || '')
}

/** Períodos do dia para filtrar horários de culto. */
export const PERIODOS_CULTO = [
  { id: 'todos', label: 'Qualquer horário' },
  { id: 'manha', label: 'Manhã', hint: 'até 11:59' },
  { id: 'tarde', label: 'Tarde', hint: '12:00–17:59' },
  { id: 'noite', label: 'Noite', hint: 'a partir de 18:00' },
]

/** Converte "HH:MM" em minutos desde meia-noite; NaN se inválido. */
export function horarioEmMinutos(hhmm) {
  const m = String(hhmm || '').trim().match(/^(\d{1,2}):(\d{2})/)
  if (!m) return NaN
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return NaN
  return h * 60 + min
}

/** manha < 12h | tarde 12–18h | noite >= 18h */
export function periodoDoHorario(hhmm) {
  const n = horarioEmMinutos(hhmm)
  if (!Number.isFinite(n)) return null
  if (n < 12 * 60) return 'manha'
  if (n < 18 * 60) return 'tarde'
  return 'noite'
}

/**
 * True se a igreja tem culto no dia (opcional) e período (opcional).
 * @param {string} cultoRaw
 * @param {{ dia?: string, periodo?: string }} opts  periodo: todos|manha|tarde|noite
 */
export function temCultoFiltro(cultoRaw, { dia = '', periodo = 'todos' } = {}) {
  const parsed = parseCulto(cultoRaw)
  if (!parsed.length) return false
  const diaId = String(dia || '').trim()
  const per = String(periodo || 'todos').trim() || 'todos'
  const slots = diaId ? parsed.filter(s => s.dia === diaId) : parsed
  if (!slots.length) return false
  if (per === 'todos') return true
  return slots.some(s => (s.horarios || []).some(h => periodoDoHorario(h) === per))
}

/** Horários de um dia que caem no período. */
export function horariosNoPeriodo(cultoRaw, dia, periodo = 'todos') {
  const slot = parseCulto(cultoRaw).find(s => s.dia === dia)
  if (!slot) return []
  if (!periodo || periodo === 'todos') return [...(slot.horarios || [])]
  return (slot.horarios || []).filter(h => periodoDoHorario(h) === periodo)
}

/**
 * Conta cultos (horários) e igrejas por dia da semana.
 * @param {object[]} igrejas
 * @param {{ bairroDe?: (ig) => string }} opts
 */
function pushIgrejaItem(bucket, item, n) {
  bucket.cultos += n
  if (!bucket.igrejaIds.has(item.id)) {
    bucket.igrejaIds.add(item.id)
    bucket.igrejas += 1
    bucket.lista.push({ ...item })
  } else {
    const prev = bucket.lista.find(x => x.id === item.id)
    if (prev) {
      prev.horarios = [...new Set([...(prev.horarios || []), ...(item.horarios || [])])]
      if (item.culto) prev.culto = item.culto
    }
  }
}

export function resumoCultosPorDia(igrejas, { bairroDe } = {}) {
  const porDia = Object.fromEntries(
    DIAS_CULTO.map(d => [d.id, {
      dia: d.id,
      label: d.label,
      short: d.short,
      cultos: 0,
      igrejas: 0,
      igrejaIds: new Set(),
      lista: [],
      porBairro: {},
    }]),
  )
  const porRegiao = {}

  let comHorario = 0
  let semHorario = 0
  let comHorarioAd = 0
  let comHorarioOutras = 0
  let cultosAd = 0
  let cultosOutras = 0

  for (const ig of igrejas || []) {
    if (!ig) continue
    const parsed = parseCulto(ig.culto)
    if (!parsed.length) {
      semHorario += 1
      continue
    }
    comHorario += 1
    const isAd = (ig.denominacao || 'Assembleia de Deus') === 'Assembleia de Deus'
    if (isAd) comHorarioAd += 1
    else comHorarioOutras += 1
    const bairro = (bairroDe?.(ig) || ig.setor || ig.bairro || 'Sem bairro').trim() || 'Sem bairro'
    const regiao = String(ig.setor || '').trim() || 'Sem região'

    if (!porRegiao[regiao]) {
      porRegiao[regiao] = {
        setor: regiao,
        cultos: 0,
        igrejas: 0,
        igrejaIds: new Set(),
        lista: [],
        porDia: Object.fromEntries(
          DIAS_CULTO.map(d => [d.id, {
            dia: d.id, label: d.label, short: d.short,
            cultos: 0, igrejas: 0, igrejaIds: new Set(), lista: [],
          }]),
        ),
      }
    }
    const regBucket = porRegiao[regiao]

    for (const slot of parsed) {
      const bucket = porDia[slot.dia]
      if (!bucket) continue
      const n = Math.max(1, slot.horarios.length)
      if (isAd) cultosAd += n
      else cultosOutras += n
      const item = {
        id: ig.id,
        nome: ig.nome || 'Igreja',
        endereco: ig.endereco || '',
        setor: ig.setor || '',
        denominacao: ig.denominacao || 'Assembleia de Deus',
        bairro,
        horarios: slot.horarios,
        culto: ig.culto || '',
        visitado: !!ig.visitado,
        lat: ig.lat,
        lng: ig.lng,
      }
      pushIgrejaItem(bucket, item, n)

      if (!bucket.porBairro[bairro]) {
        bucket.porBairro[bairro] = { cultos: 0, igrejas: 0, igrejaIds: new Set(), lista: [] }
      }
      pushIgrejaItem(bucket.porBairro[bairro], item, n)

      // região: conta slots da semana + lista com culto completo (uma entrada por igreja)
      regBucket.cultos += n
      if (!regBucket.igrejaIds.has(ig.id)) {
        regBucket.igrejaIds.add(ig.id)
        regBucket.igrejas += 1
        regBucket.lista.push({
          id: ig.id,
          nome: ig.nome || 'Igreja',
          endereco: ig.endereco || '',
          setor: regiao,
          denominacao: ig.denominacao || 'Assembleia de Deus',
          bairro,
          culto: ig.culto || '',
          horarios: slot.horarios,
          visitado: !!ig.visitado,
          lat: ig.lat,
          lng: ig.lng,
          dias: [{ dia: slot.dia, label: diaLabel(slot.dia), horarios: [...slot.horarios] }],
        })
      } else {
        const prevR = regBucket.lista.find(x => x.id === ig.id)
        if (prevR) {
          const dPrev = prevR.dias.find(x => x.dia === slot.dia)
          if (dPrev) {
            dPrev.horarios = [...new Set([...dPrev.horarios, ...slot.horarios])]
          } else {
            prevR.dias.push({ dia: slot.dia, label: diaLabel(slot.dia), horarios: [...slot.horarios] })
          }
        }
      }
      pushIgrejaItem(regBucket.porDia[slot.dia], item, n)
    }
  }

  function sortIgrejas(a, c) {
    const aAd = (a.denominacao || 'Assembleia de Deus') === 'Assembleia de Deus' ? 0 : 1
    const cAd = (c.denominacao || 'Assembleia de Deus') === 'Assembleia de Deus' ? 0 : 1
    return aAd - cAd
      || (a.bairro || '').localeCompare(c.bairro || '', 'pt-BR')
      || (a.nome || '').localeCompare(c.nome || '', 'pt-BR')
  }

  const dias = DIAS_CULTO.map(d => {
    const b = porDia[d.id]
    const lista = [...b.lista].sort(sortIgrejas)
    const bairros = Object.entries(b.porBairro)
      .map(([nome, v]) => ({
        bairro: nome,
        cultos: v.cultos,
        igrejas: v.igrejas,
        lista: [...v.lista].sort(sortIgrejas),
      }))
      .sort((a, b2) => b2.cultos - a.cultos || a.bairro.localeCompare(b2.bairro, 'pt-BR'))
    return {
      dia: d.id,
      label: d.label,
      short: d.short,
      cultos: b.cultos,
      igrejas: b.igrejas,
      lista,
      bairros,
    }
  })

  const regioes = Object.values(porRegiao)
    .map(r => ({
      setor: r.setor,
      cultos: r.cultos,
      igrejas: r.igrejas,
      lista: [...r.lista].sort(sortIgrejas),
      dias: DIAS_CULTO
        .map(d => {
          const dd = r.porDia[d.id]
          return {
            dia: d.id,
            label: d.label,
            short: d.short,
            cultos: dd.cultos,
            igrejas: dd.igrejas,
            lista: [...dd.lista].sort(sortIgrejas),
          }
        })
        .filter(d => d.cultos > 0),
    }))
    .sort((a, b) => b.cultos - a.cultos || a.setor.localeCompare(b.setor, 'pt-BR'))

  return {
    dias,
    regioes,
    totalCultos: dias.reduce((s, d) => s + d.cultos, 0),
    totalIgrejasComHorario: comHorario,
    comHorarioAd,
    comHorarioOutras,
    cultosAd,
    cultosOutras,
    semHorario,
    diaPico: dias.reduce((best, d) => (!best || d.cultos > best.cultos ? d : best), null),
    regiaoPico: regioes[0] || null,
  }
}

/** Mapa igrejaId → nome do bairro geo (a partir de igrejasPorBairro). */
export function mapaBairroPorIgreja(igrejasPorBairro) {
  const map = new Map()
  if (!igrejasPorBairro || typeof igrejasPorBairro !== 'object') return map
  for (const [bairro, lista] of Object.entries(igrejasPorBairro)) {
    for (const ig of lista || []) {
      if (ig?.id != null) map.set(ig.id, bairro)
    }
  }
  return map
}
