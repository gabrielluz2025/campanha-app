/** Relatório imprimível de cultos (Mapa de Visitas) — com filtros. */

import { DIAS_CULTO, PERIODOS_CULTO, parseCulto, resumoCultosPorDia, temCultoFiltro } from './cultoParse'

const DENOM_PADRAO = 'Assembleia de Deus'

export const FILTROS_CULTOS_PADRAO = {
  denom: 'todas',       // todas | ad | outras
  visita: 'todas',      // todas | visitadas | pendentes
  dias: [],             // [] = todos; senão ids: dom, seg...
  periodo: 'todos',     // todos | manha | tarde | noite
  regioes: [],          // [] = todas; senão nomes de setor
  secoes: {
    resumoDia: true,
    resumoRegiao: true,
    grade: true,
    detalheDia: true,
    detalheRegiao: true,
    catalogo: true,
    anexoSemHorario: false,
  },
}

function dataHoje() {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })
}

function horaAgora() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isAd(ig) {
  return (ig?.denominacao || DENOM_PADRAO) === DENOM_PADRAO
}

function pastoresTxt(ig) {
  const parts = []
  if (ig.pastor1) parts.push(ig.esposa1 ? `${ig.pastor1} / ${ig.esposa1}` : ig.pastor1)
  if (ig.pastor2) parts.push(ig.esposa2 ? `${ig.pastor2} / ${ig.esposa2}` : ig.pastor2)
  return parts.join(' · ')
}

function prioridadeLabel(p) {
  if (p === 'alta') return 'Alta'
  if (p === 'baixa') return 'Baixa'
  return 'Média'
}

function enrichFromMap(item, byId) {
  const full = byId.get(item.id) || {}
  return { ...full, ...item, denominacao: item.denominacao || full.denominacao || DENOM_PADRAO }
}

function temCultoNosDias(ig, diasFiltro, periodo = 'todos') {
  if (!diasFiltro?.length && (!periodo || periodo === 'todos')) return true
  if (!parseCulto(ig.culto).length) return false
  if (!diasFiltro?.length) {
    return temCultoFiltro(ig.culto, { periodo })
  }
  return diasFiltro.some(dia => temCultoFiltro(ig.culto, { dia, periodo }))
}

/** Filtra lista de igrejas conforme opções do relatório. */
export function filtrarIgrejasCultos(igrejas = [], filtros = {}) {
  const f = { ...FILTROS_CULTOS_PADRAO, ...filtros }
  const dias = Array.isArray(f.dias) ? f.dias : []
  const regioes = Array.isArray(f.regioes) ? f.regioes : []
  const periodo = f.periodo || 'todos'

  return (igrejas || []).filter(ig => {
    if (!ig) return false
    if (f.denom === 'ad' && !isAd(ig)) return false
    if (f.denom === 'outras' && isAd(ig)) return false
    if (f.visita === 'visitadas' && !ig.visitado) return false
    if (f.visita === 'pendentes' && ig.visitado) return false
    if (regioes.length) {
      const setor = String(ig.setor || '').trim()
      if (!regioes.includes(setor)) return false
    }
    // dias/período: só restringe quem TEM culto; sem culto passa se anexo estiver ligado (filtrado depois)
    if ((dias.length || (periodo && periodo !== 'todos')) && parseCulto(ig.culto).length
      && !temCultoNosDias(ig, dias, periodo)) return false
    return true
  })
}

export function descricaoFiltrosCultos(filtros = {}) {
  const f = { ...FILTROS_CULTOS_PADRAO, ...filtros }
  const parts = []
  if (f.denom === 'ad') parts.push('só AD Blu')
  else if (f.denom === 'outras') parts.push('só outras denominações')
  else parts.push('AD Blu + outras')
  if (f.visita === 'visitadas') parts.push('só visitadas')
  else if (f.visita === 'pendentes') parts.push('só pendentes')
  if (f.dias?.length) {
    const labels = f.dias.map(id => DIAS_CULTO.find(d => d.id === id)?.short || id)
    parts.push(`dias: ${labels.join(', ')}`)
  } else parts.push('todos os dias')
  if (f.periodo && f.periodo !== 'todos') {
    const pl = PERIODOS_CULTO.find(p => p.id === f.periodo)?.label || f.periodo
    parts.push(`período: ${pl}`)
  }
  if (f.regioes?.length) parts.push(`regiões: ${f.regioes.join(', ')}`)
  else parts.push('todas as regiões')
  return parts.join(' · ')
}

function fichaIgreja(ig, { destaqueDia = '' } = {}) {
  const ad = isAd(ig)
  const badge = ad ? 'AD Blu' : 'Outra'
  const cls = ad ? 'ad' : 'outra'
  const horariosDia = destaqueDia
    ? (parseCulto(ig.culto).find(s => s.dia === destaqueDia)?.horarios || []).join(' · ')
    : ''
  const pastores = pastoresTxt(ig)
  return `
    <article class="ficha ${cls}">
      <div class="ficha-top">
        <span class="badge ${cls}">${esc(badge)}</span>
        <h3>${esc(ig.nome || 'Igreja')}</h3>
        ${ig.visitado ? '<span class="pill ok">Visitada</span>' : '<span class="pill pend">Pendente</span>'}
        ${ig.prioridade === 'alta' && !ig.visitado ? '<span class="pill alta">Prioridade alta</span>' : ''}
      </div>
      <table class="campos"><tbody>
        <tr><td>Denominação</td><td>${esc(ad ? 'Assembleia de Deus (AD Blu)' : (ig.denominacao || 'Outra'))}</td></tr>
        <tr><td>Região / setor</td><td>${esc(ig.setor || '—')}</td></tr>
        <tr><td>Bairro</td><td>${esc(ig.bairro || ig.setor || '—')}</td></tr>
        <tr><td>Endereço</td><td>${esc(ig.endereco || '—')}</td></tr>
        <tr><td>Cultos (semana)</td><td class="culto">${esc(ig.culto || '—')}</td></tr>
        ${horariosDia ? `<tr><td>Horário neste dia</td><td class="culto">${esc(horariosDia)}</td></tr>` : ''}
        <tr><td>Pastores</td><td>${esc(pastores || '—')}</td></tr>
        <tr><td>Telefone</td><td>${esc(ig.telefone || '—')}</td></tr>
        <tr><td>Prioridade</td><td>${esc(prioridadeLabel(ig.prioridade))}</td></tr>
        ${ig.nota ? `<tr><td>Nota</td><td>${esc(ig.nota)}</td></tr>` : ''}
        ${ig.lat && ig.lng ? `<tr><td>Coordenadas</td><td>${Number(ig.lat).toFixed(5)}, ${Number(ig.lng).toFixed(5)}</td></tr>` : ''}
      </tbody></table>
    </article>`
}

function sortIgrejas(a, b) {
  const aAd = isAd(a) ? 0 : 1
  const bAd = isAd(b) ? 0 : 1
  return aAd - bAd
    || String(a.setor || '').localeCompare(String(b.setor || ''), 'pt-BR')
    || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
}

/**
 * @param {{ igrejas?: object[], filtros?: object, titulo?: string, cultosResumo?: object }} opts
 */
export function montarHtmlImpressaoCultos({
  igrejas = [],
  filtros: filtrosIn = {},
  titulo = 'Relatório de Cultos — Mapa de Visitas',
} = {}) {
  const filtros = {
    ...FILTROS_CULTOS_PADRAO,
    ...filtrosIn,
    secoes: { ...FILTROS_CULTOS_PADRAO.secoes, ...(filtrosIn.secoes || {}) },
  }
  const secoes = filtros.secoes
  const diasFiltro = Array.isArray(filtros.dias) ? filtros.dias : []
  const diasGrade = diasFiltro.length
    ? DIAS_CULTO.filter(d => diasFiltro.includes(d.id))
    : DIAS_CULTO

  const filtradas = filtrarIgrejasCultos(igrejas, filtros)
  const byId = new Map(filtradas.map(ig => [ig.id, ig]))

  const comCulto = filtradas.filter(ig => parseCulto(ig.culto).length > 0).sort(sortIgrejas)
  const semCulto = filtradas.filter(ig => !parseCulto(ig.culto).length).sort(sortIgrejas)

  // Recalcula resumo só com quem tem culto (e filtros aplicados)
  const r = resumoCultosPorDia(comCulto)
  // Se filtrou dias, ajusta visualização dos dias
  const diasVis = diasFiltro.length
    ? (r.dias || []).filter(d => diasFiltro.includes(d.dia))
    : (r.dias || [])
  const regioesVis = (r.regioes || [])

  const visitadasCom = comCulto.filter(i => i.visitado).length
  const pendentesCom = comCulto.length - visitadasCom
  const filtroTxt = descricaoFiltrosCultos(filtros)
  const totalCultosVis = diasVis.reduce((s, d) => s + d.cultos, 0)
  const comHorarioAdVis = comCulto.filter(isAd).length
  const comHorarioOutrasVis = comCulto.length - comHorarioAdVis
  let cultosAdVis = 0
  let cultosOutrasVis = 0
  for (const d of diasVis) {
    for (const item of d.lista || []) {
      const n = Math.max(1, (item.horarios || []).length)
      if (isAd(item)) cultosAdVis += n
      else cultosOutrasVis += n
    }
  }

  const diasRows = diasVis.map(d => {
    const adN = (d.lista || []).filter(isAd).length
    const outN = (d.lista || []).length - adN
    return `<tr>
      <td>${esc(d.label)}</td>
      <td class="num">${d.cultos}</td>
      <td class="num">${d.igrejas}</td>
      <td class="num ad-c">${adN}</td>
      <td class="num out-c">${outN}</td>
    </tr>`
  }).join('')

  const regRows = regioesVis.map(reg => {
    const adN = (reg.lista || []).filter(isAd).length
    const outN = (reg.lista || []).length - adN
    return `<tr>
      <td>${esc(reg.setor)}</td>
      <td class="num">${reg.cultos}</td>
      <td class="num">${reg.igrejas}</td>
      <td class="num ad-c">${adN}</td>
      <td class="num out-c">${outN}</td>
    </tr>`
  }).join('')

  const porDiaDetalhe = diasVis.filter(d => d.cultos > 0).map(d => {
    const fichas = (d.lista || []).map(item => {
      const ig = enrichFromMap(item, byId)
      return fichaIgreja(ig, { destaqueDia: d.dia })
    }).join('')
    const bairros = (d.bairros || []).map(b =>
      `<li><strong>${esc(b.bairro)}</strong> — ${b.cultos} culto${b.cultos === 1 ? '' : 's'} · ${b.igrejas} igrejas</li>`
    ).join('')
    return `
      <section class="sec">
        <h2>${esc(d.label)} <span>${d.cultos} cultos · ${d.igrejas} igrejas</span></h2>
        ${bairros ? `<ul class="bairros">${bairros}</ul>` : ''}
        <div class="grid">${fichas}</div>
      </section>`
  }).join('')

  const porRegiaoDetalhe = regioesVis.map(reg => {
    let lista = reg.lista || []
    // se filtrou dias, só igrejas que cultuam nesses dias
    if (diasFiltro.length) {
      lista = lista.filter(item => temCultoNosDias(enrichFromMap(item, byId), diasFiltro))
    }
    if (!lista.length) return ''
    const fichas = lista.map(item => fichaIgreja(enrichFromMap(item, byId))).join('')
    const diasMini = (reg.dias || [])
      .filter(d => !diasFiltro.length || diasFiltro.includes(d.dia))
      .map(d => `<span class="chip">${esc(d.short || d.label)}: ${d.cultos}c / ${d.igrejas}ig</span>`)
      .join('')
    return `
      <section class="sec">
        <h2>${esc(reg.setor)} <span>${lista.length} igrejas</span></h2>
        <div class="chips">${diasMini}</div>
        <div class="grid">${fichas}</div>
      </section>`
  }).join('')

  const catalogo = comCulto.map(ig => fichaIgreja({ ...ig, bairro: ig.setor })).join('')

  const semCultoRows = semCulto.map(ig => {
    const ad = isAd(ig)
    return `<tr class="${ad ? 'ad' : 'outra'}">
      <td><span class="badge ${ad ? 'ad' : 'outra'}">${ad ? 'AD' : 'OUT'}</span> ${esc(ig.nome)}</td>
      <td>${esc(ig.setor || '—')}</td>
      <td>${esc(ig.endereco || '—')}</td>
      <td>${esc(ad ? 'AD Blu' : (ig.denominacao || 'Outra'))}</td>
      <td>${ig.visitado ? 'Sim' : 'Não'}</td>
      <td>${esc(ig.telefone || '—')}</td>
    </tr>`
  }).join('')

  const gradeHead = diasGrade.map(d => `<th>${esc(d.short)}</th>`).join('')
  const gradeBody = comCulto.map(ig => {
    const parsed = parseCulto(ig.culto)
    const byDia = Object.fromEntries(parsed.map(s => [s.dia, s.horarios.join(' / ')]))
    const cells = diasGrade.map(d => {
      const h = byDia[d.id]
      return `<td class="${h ? 'tem' : ''}">${h ? esc(h) : '·'}</td>`
    }).join('')
    const ad = isAd(ig)
    return `<tr class="${ad ? 'ad' : 'outra'}">
      <td class="nome-cell"><span class="badge ${ad ? 'ad' : 'outra'}">${ad ? 'AD' : 'OUT'}</span> ${esc(ig.nome)}<br/><small>${esc(ig.setor || '')}</small></td>
      ${cells}
    </tr>`
  }).join('')

  const blocos = []
  let precisaPagebreak = false
  const page = () => {
    if (precisaPagebreak) return '<div class="pagebreak"></div>'
    precisaPagebreak = true
    return ''
  }

  if (secoes.resumoDia) {
    blocos.push(`
      <h2>Resumo por dia da semana</h2>
      <table class="resumo">
        <thead><tr>
          <th>Dia</th><th>Cultos</th><th>Igrejas</th><th>AD Blu</th><th>Outras</th>
        </tr></thead>
        <tbody>${diasRows || '<tr><td colspan="5">Sem dados no filtro</td></tr>'}</tbody>
      </table>`)
  }
  if (secoes.resumoRegiao) {
    blocos.push(`
      <h2>Resumo por região (setor)</h2>
      <table class="resumo">
        <thead><tr>
          <th>Região</th><th>Cultos</th><th>Igrejas</th><th>AD Blu</th><th>Outras</th>
        </tr></thead>
        <tbody>${regRows || '<tr><td colspan="5">Sem dados no filtro</td></tr>'}</tbody>
      </table>`)
  }
  if (secoes.grade) {
    blocos.push(`${page()}
      <h2>Grade semanal de horários</h2>
      <p class="meta" style="margin-bottom:8px">Igrejas com culto no filtro · células destacadas = há culto naquele dia</p>
      <table class="grade">
        <thead><tr><th>Igreja / região</th>${gradeHead}</tr></thead>
        <tbody>${gradeBody || `<tr><td colspan="${diasGrade.length + 1}">Nenhuma igreja com horário</td></tr>`}</tbody>
      </table>`)
  }
  if (secoes.detalheDia) {
    blocos.push(`${page()}
      <h2>Detalhamento por dia</h2>
      ${porDiaDetalhe || '<p>Nenhum culto no filtro.</p>'}`)
  }
  if (secoes.detalheRegiao) {
    blocos.push(`${page()}
      <h2>Detalhamento por região</h2>
      ${porRegiaoDetalhe || '<p>Nenhuma região no filtro.</p>'}`)
  }
  if (secoes.catalogo) {
    blocos.push(`${page()}
      <h2>Catálogo — igrejas com horário <span>${comCulto.length}</span></h2>
      <div class="grid">${catalogo || '<p>Nenhuma.</p>'}</div>`)
  }
  if (secoes.anexoSemHorario && semCulto.length) {
    blocos.push(`${page()}
      <h2>Anexo — igrejas sem horário cadastrado <span>${semCulto.length}</span></h2>
      <table class="lista">
        <thead><tr>
          <th>Nome</th><th>Região</th><th>Endereço</th><th>Denominação</th><th>Visitada</th><th>Telefone</th>
        </tr></thead>
        <tbody>${semCultoRows}</tbody>
      </table>`)
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>${esc(titulo)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
    color: #1a1a1a; background: #fff;
    padding: 22px 28px; font-size: 12px; line-height: 1.45;
  }
  .capa {
    border-bottom: 3px solid #a8842e;
    padding-bottom: 14px; margin-bottom: 18px;
  }
  .capa .brand { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #a8842e; font-weight: 700; }
  h1 { font-size: 22px; margin: 6px 0 4px; color: #111; }
  .meta { color: #555; font-size: 12px; }
  .filtros-box {
    background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
    padding: 8px 12px; margin-top: 10px; font-size: 11px; color: #334155;
  }
  .kpis {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
    margin: 16px 0 12px;
  }
  .kpi {
    border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px 12px;
    background: #fafafa;
  }
  .kpi strong { display: block; font-size: 20px; line-height: 1.1; color: #111; }
  .kpi span { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.04em; }
  .kpi.gold strong { color: #8a6a1a; }
  .kpi.ad strong { color: #8a6a1a; }
  .kpi.out strong { color: #0369a1; }
  .legenda { display: flex; gap: 16px; flex-wrap: wrap; margin: 8px 0 18px; font-size: 11px; }
  .legenda i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: middle; }
  .legenda .ad i { background: #c9a227; }
  .legenda .out i { background: #0284c7; }
  h2 {
    font-size: 15px; margin: 22px 0 10px; padding: 6px 0 6px 10px;
    border-left: 4px solid #a8842e; color: #1a1408;
    page-break-after: avoid;
  }
  h2 span { color: #666; font-weight: 500; font-size: 12px; margin-left: 6px; }
  .sec { margin-bottom: 8px; page-break-inside: auto; }
  table.resumo, table.grade, table.lista {
    width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px;
  }
  table.resumo th, table.grade th, table.lista th {
    background: #1a1408; color: #f0d48a; text-align: left; padding: 7px 8px; font-weight: 600;
  }
  table.resumo td, table.grade td, table.lista td {
    padding: 6px 8px; border-bottom: 1px solid #e8e8e8; vertical-align: top;
  }
  table.resumo tr:nth-child(even), table.lista tr:nth-child(even) { background: #fafafa; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  td.ad-c { color: #8a6a1a; }
  td.out-c { color: #0369a1; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .ficha {
    border: 1px solid #ddd; border-radius: 8px; padding: 10px 12px;
    page-break-inside: avoid; break-inside: avoid;
    border-left: 4px solid #ccc;
  }
  .ficha.ad { border-left-color: #c9a227; background: #fffcf3; }
  .ficha.outra { border-left-color: #0284c7; background: #f0f9ff; }
  .ficha-top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
  .ficha h3 { font-size: 13px; flex: 1; min-width: 120px; }
  .badge {
    font-size: 9px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase;
    padding: 2px 6px; border-radius: 4px;
  }
  .badge.ad { background: #c9a227; color: #1a1408; }
  .badge.outra { background: #0284c7; color: #fff; }
  .pill { font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 999px; }
  .pill.ok { background: #d1fae5; color: #065f46; }
  .pill.pend { background: #fef3c7; color: #92400e; }
  .pill.alta { background: #fee2e2; color: #991b1b; }
  table.campos { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  table.campos td { padding: 2px 4px; border-bottom: 1px solid #eee; vertical-align: top; }
  table.campos td:first-child { width: 34%; color: #555; font-weight: 600; }
  td.culto { font-weight: 700; color: #6b5210; }
  .bairros { margin: 0 0 10px 18px; color: #444; font-size: 11px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .chip {
    background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 999px;
    padding: 2px 8px; font-size: 10px; font-weight: 600; color: #374151;
  }
  table.grade th { text-align: center; font-size: 10px; }
  table.grade td { text-align: center; font-size: 9.5px; color: #999; }
  table.grade td.tem { color: #1a1408; font-weight: 700; background: #fff8e7; }
  table.grade td.nome-cell { text-align: left; color: #111; font-weight: 600; min-width: 140px; }
  table.grade td.nome-cell small { font-weight: 400; color: #666; }
  table.grade tr.outra td.tem { background: #e0f2fe; color: #0c4a6e; }
  .destaque {
    background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;
    padding: 10px 12px; margin: 10px 0 16px; font-size: 12px;
  }
  .rodape {
    margin-top: 24px; padding-top: 10px; border-top: 1px solid #ddd;
    color: #666; font-size: 10px;
  }
  .pagebreak { page-break-before: always; break-before: page; }
  @media print {
    body { padding: 8mm 10mm; }
    .ficha { box-shadow: none; }
  }
  @page { margin: 12mm 10mm; }
</style>
</head>
<body>
  <header class="capa">
    <p class="brand">Campanha · Mapa de Visitas</p>
    <h1>${esc(titulo)}</h1>
    <p class="meta">${esc(dataHoje())} · gerado às ${esc(horaAgora())}</p>
    <p class="filtros-box"><strong>Filtros:</strong> ${esc(filtroTxt)}</p>
  </header>

  <div class="kpis">
    <div class="kpi gold"><strong>${totalCultosVis}</strong><span>Cultos / filtro</span></div>
    <div class="kpi"><strong>${comCulto.length}</strong><span>Com horário</span></div>
    <div class="kpi ad"><strong>${comHorarioAdVis}</strong><span>AD Blu c/ culto</span></div>
    <div class="kpi out"><strong>${comHorarioOutrasVis}</strong><span>Outras c/ culto</span></div>
  </div>
  <div class="kpis">
    <div class="kpi"><strong>${secoes.anexoSemHorario ? semCulto.length : '—'}</strong><span>Sem horário</span></div>
    <div class="kpi"><strong>${cultosAdVis}</strong><span>Slots AD Blu</span></div>
    <div class="kpi"><strong>${cultosOutrasVis}</strong><span>Slots outras</span></div>
    <div class="kpi"><strong>${visitadasCom}/${pendentesCom}</strong><span>Visitadas / pendentes*</span></div>
  </div>

  <div class="legenda">
    <span class="ad"><i></i>AD Blu — Assembleia de Deus</span>
    <span class="out"><i></i>Outras denominações</span>
    <span>* entre igrejas com horário no filtro</span>
  </div>

  ${(r.diaPico?.cultos > 0 || r.regiaoPico) ? `
  <div class="destaque">
    ${r.diaPico?.cultos > 0 ? `<strong>Dia pico:</strong> ${esc(r.diaPico.label)} — ${r.diaPico.cultos} cultos em ${r.diaPico.igrejas} igrejas. ` : ''}
    ${r.regiaoPico ? `<strong>Região pico:</strong> ${esc(r.regiaoPico.setor)} — ${r.regiaoPico.cultos} cultos · ${r.regiaoPico.igrejas} igrejas.` : ''}
  </div>` : ''}

  ${blocos.join('\n')}

  <p class="rodape">
    Relatório gerado automaticamente · ${esc(titulo)} · ${esc(dataHoje())} ${esc(horaAgora())}
    · ${comCulto.length} com culto · ${semCulto.length} sem culto · ${filtradas.length} igrejas no filtro
    · de ${(igrejas || []).length} no mapa
  </p>
</body>
</html>`
}

export function imprimirRelatorioCultos(opts) {
  const html = montarHtmlImpressaoCultos(opts)
  const win = window.open('', '_blank', 'width=960,height=720')
  if (!win) return { ok: false, erro: 'popup' }
  try { win.opener = null } catch { /* ignore */ }
  win.document.open()
  win.document.write(html)
  win.document.close()
  const disparar = () => {
    try { win.focus(); win.print() } catch { /* ignore */ }
  }
  if (win.document.readyState === 'complete') setTimeout(disparar, 300)
  else {
    win.onload = () => setTimeout(disparar, 300)
    setTimeout(disparar, 700)
  }
  return { ok: true }
}
