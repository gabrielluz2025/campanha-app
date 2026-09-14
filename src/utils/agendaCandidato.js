/** Helpers da Agenda do candidato / equipe */

export const AGENDA_TIPOS = [
  { id: 'candidato', label: 'Candidato', cor: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  { id: 'equipe',    label: 'Equipe',    cor: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  { id: 'ambos',     label: 'Ambos',     cor: '#a78bfa', bg: 'rgba(167,139,246,0.14)' },
]

export const CATEGORIAS_AGENDA = [
  { id: 'visita',      label: 'Visita',       cor: '#1d4ed8' },
  { id: 'reuniao',     label: 'Reunião',      cor: '#7c3aed' },
  { id: 'culto',       label: 'Culto',        cor: '#059669' },
  { id: 'palestra',    label: 'Palestra',     cor: '#d97706' },
  { id: 'entrevista',  label: 'Entrevista',   cor: '#dc2626' },
  { id: 'gabinete',    label: 'Gabinete',     cor: '#0ea5e9' },
  { id: 'porta_porta', label: 'Porta a porta', cor: '#f97316' },
  { id: 'carreata',    label: 'Carreata',     cor: '#e11d48' },
  { id: 'live',        label: 'Live / Mídia', cor: '#8b5cf6' },
  { id: 'outro',       label: 'Outro',        cor: '#64748b' },
]

export const RECORRENCIAS = [
  { id: 'nenhuma', label: 'Não repetir' },
  { id: 'diaria',  label: 'Diária' },
  { id: 'semanal', label: 'Semanal' },
  { id: 'mensal',  label: 'Mensal' },
]

export function ehAgendaCandidato(ev) {
  const t = ev?.agendaTipo || 'equipe'
  return t === 'candidato' || t === 'ambos'
}

export function passaFiltroAgendaTipo(ev, filtro) {
  if (!filtro || filtro === 'todas') return true
  const t = ev?.agendaTipo || 'equipe'
  if (filtro === 'candidato') return t === 'candidato' || t === 'ambos'
  if (filtro === 'equipe') return t === 'equipe' || t === 'ambos'
  return true
}

export function metaAgendaTipo(ev) {
  const t = ev?.agendaTipo || 'equipe'
  return AGENDA_TIPOS.find(x => x.id === t) || AGENDA_TIPOS[1]
}

/** Normaliza eventos antigos sem os novos campos */
export function normalizarEventoAgenda(ev) {
  if (!ev || typeof ev !== 'object') return ev
  return {
    ...ev,
    agendaTipo: ev.agendaTipo || 'equipe',
    candidatoPresente: ev.candidatoPresente !== false,
    assessorId: ev.assessorId || '',
    privado: !!ev.privado,
    recorrencia: ev.recorrencia || 'nenhuma',
    recorrenciaAte: ev.recorrenciaAte || '',
    serieId: ev.serieId || '',
  }
}

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function addMonths(iso, n) {
  const d = new Date(iso + 'T12:00:00')
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Gera ocorrências de recorrência (inclui a primeira).
 * Limite de segurança: 60 ocorrências.
 */
export function gerarOcorrencias(form, uidFn) {
  const serieId = form.serieId || uidFn()
  const base = {
    ...form,
    serieId,
    recorrencia: form.recorrencia || 'nenhuma',
  }
  const tipo = base.recorrencia
  if (!tipo || tipo === 'nenhuma' || !base.recorrenciaAte) {
    return [{ ...base, id: uidFn(), serieId: tipo !== 'nenhuma' ? serieId : '' }]
  }

  const out = []
  let di = base.dataInicio
  let df = base.dataFim || base.dataInicio
  const span = Math.max(0, Math.round(
    (new Date(df + 'T12:00') - new Date(di + 'T12:00')) / 86400000
  ))
  const ate = base.recorrenciaAte
  let guard = 0

  while (di <= ate && guard < 60) {
    const repsSync = []
    for (let i = 0; i <= span; i++) {
      const data = addDays(di, i)
      const prev = (base.representantes || []).find(r => r.data === addDays(base.dataInicio, i))
      repsSync.push({ data, nome: prev?.nome || '' })
    }
    out.push({
      ...base,
      id: uidFn(),
      serieId,
      dataInicio: di,
      dataFim: addDays(di, span),
      representantes: repsSync.length ? repsSync : [{ data: di, nome: '' }],
    })
    if (tipo === 'diaria') di = addDays(di, 1)
    else if (tipo === 'semanal') di = addDays(di, 7)
    else if (tipo === 'mensal') di = addMonths(di, 1)
    else break
    guard++
  }
  return out.length ? out : [{ ...base, id: uidFn() }]
}

/** Texto de briefing matinal (WhatsApp) — só agenda do candidato no dia */
export function textoBriefingCandidato(eventos, dataIso, assessores = []) {
  const dia = new Date(dataIso + 'T12:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  })
  const lista = eventos
    .filter(e => ehAgendaCandidato(e) && e.dataInicio <= dataIso && (e.dataFim || e.dataInicio) >= dataIso)
    .filter(e => !e.privado)
    .sort((a, b) => (a.horaInicio || '').localeCompare(b.horaInicio || ''))

  const linhas = [
    `📋 *Briefing — Agenda do candidato*`,
    `📅 ${dia}`,
    '',
  ]
  if (!lista.length) {
    linhas.push('_Nenhum compromisso do candidato neste dia._')
  } else {
    lista.forEach((e, i) => {
      const ass = assessores.find(a => a.id === e.assessorId)
      const cat = CATEGORIAS_AGENDA.find(c => c.id === e.categoria)?.label || e.categoria
      linhas.push(`${i + 1}. *${e.horaInicio}–${e.horaFim}* · ${e.titulo}`)
      if (e.local) linhas.push(`   📍 ${e.local}`)
      linhas.push(`   ${cat}${e.candidatoPresente === false ? ' · sem presença do candidato' : ''}${ass ? ` · Assessor: ${ass.nome}` : ''}`)
      linhas.push('')
    })
  }
  linhas.push('_Gerado pelo sistema de campanha_')
  return linhas.join('\n')
}

/** Parse simples: título;data;horaInicio;horaFim;local (uma linha por evento) */
export function parseImportAgenda(texto, defaults = {}) {
  const linhas = String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const out = []
  for (const linha of linhas) {
    if (/^t[ií]tulo/i.test(linha)) continue
    const parts = linha.includes('\t') ? linha.split('\t') : linha.split(';')
    const [titulo, data, horaInicio, horaFim, local] = parts.map(p => (p || '').trim())
    if (!titulo || !data) continue
    const dataNorm = data.includes('/')
      ? data.split('/').reverse().map((x, i) => (i === 0 ? x.padStart(4, '20') : x.padStart(2, '0'))).join('-')
      : data
    out.push({
      titulo,
      dataInicio: dataNorm,
      dataFim: dataNorm,
      horaInicio: horaInicio || '09:00',
      horaFim: horaFim || '10:00',
      local: local || '',
      categoria: defaults.categoria || 'reuniao',
      agendaTipo: defaults.agendaTipo || 'candidato',
      candidatoPresente: true,
      assessorId: '',
      privado: false,
      indicadoPor: '',
      contato: '',
      observacoes: 'Importado',
      representantes: [{ data: dataNorm, nome: '' }],
      cor: defaults.cor || '#f59e0b',
      recorrencia: 'nenhuma',
      recorrenciaAte: '',
      serieId: '',
    })
  }
  return out
}

/** Segunda-feira da semana da data ISO */
export function inicioSemana(iso) {
  const d = new Date(iso + 'T12:00:00')
  const day = d.getDay() // 0=dom
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

export function diasDaSemana(isoInicio) {
  return Array.from({ length: 7 }, (_, i) => addDays(isoInicio, i))
}
