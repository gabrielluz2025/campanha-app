/** Relatórios claros: lista de igrejas por bairro OU pares próximos */

import { formatDistanciaKm } from './rotaUtils'

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function dataHoje() {
  return new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

function horaAgora() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function igrejasDoGrupo(g) {
  if (Array.isArray(g?.igrejas) && g.igrejas.length) return g.igrejas
  const map = new Map()
  for (const p of g?.pares || []) {
    if (p?.a?.id != null) map.set(String(p.a.id), p.a)
    if (p?.b?.id != null) map.set(String(p.b.id), p.b)
  }
  return [...map.values()]
}

function htmlFaixaBairro(nome, qtd, cols) {
  const n = Number(qtd) || 0
  const qtdLabel = `${n} igreja${n !== 1 ? 's' : ''}`
  return `<tr class="sec-bairro"><td colspan="${cols}">
    <span class="bairro-badge">Bairro</span>
    <span class="bairro-nome">${escHtml(nome)}</span>
    <span class="bairro-qtd">${escHtml(qtdLabel)}</span>
  </td></tr>`
}

function htmlTituloBairroSecao(nome, qtd) {
  const n = Number(qtd) || 0
  return `<h2>
    <span class="bairro-badge">Bairro</span>
    <span class="bairro-nome">${escHtml(nome)}</span>
    <small>${n} igreja${n !== 1 ? 's' : ''}</small>
  </h2>`
}

function shellHtml({ titulo, subtitulo, corpo, rodapeEsquerda, rodapeDireita, compact = false }) {
  const footL = rodapeEsquerda || 'Campanha · Rotas'
  const footR = rodapeDireita || 'Distâncias em linha reta (GPS)'
  const bodyClass = compact ? 'modo-compacto' : ''
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escHtml(titulo)}</title>
<style>
  * { box-sizing: border-box; }
  @page { margin: ${compact ? '6mm 7mm' : '10mm'}; }
  body {
    margin: 0;
    padding: ${compact ? '4mm 5mm 6mm' : '12mm 11mm 16mm'};
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    color: #0f172a;
    background: #fff;
    font-size: ${compact ? '8.5pt' : '13px'};
    line-height: ${compact ? '1.22' : '1.4'};
  }
  .barra {
    position: sticky; top: 0; z-index: 5;
    display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
    margin: -12mm -11mm 12px; padding: 10px 12px;
    background: #0f172a; color: #e2e8f0;
  }
  body.modo-compacto .barra {
    margin: -4mm -5mm 6px; padding: 6px 8px;
  }
  .barra button {
    border: 0; border-radius: 8px; padding: 8px 14px;
    font-weight: 700; font-size: 13px; cursor: pointer;
  }
  body.modo-compacto .barra button { padding: 5px 10px; font-size: 11px; }
  .btn-print { background: #2563eb; color: #fff; }
  .btn-close { background: #334155; color: #e2e8f0; }
  .barra span { font-size: 12px; color: #94a3b8; }
  header {
    display: flex; justify-content: space-between; align-items: flex-end;
    gap: 12px; border-bottom: 2px solid #1e3a5f;
    padding-bottom: 8px; margin-bottom: 10px;
  }
  body.modo-compacto header {
    align-items: center; padding-bottom: 3px; margin-bottom: 3px;
    border-bottom-width: 1px; gap: 8px;
  }
  header h1 { margin: 0; font-size: 18px; color: #0f172a; }
  body.modo-compacto header h1 { font-size: 11pt; font-weight: 700; }
  header .meta { text-align: right; color: #64748b; font-size: 11px; }
  body.modo-compacto header .meta { font-size: 7.5pt; white-space: nowrap; }
  .sub { margin: 0 0 14px; color: #475569; font-size: 12px; }
  body.modo-compacto .sub { margin: 0 0 4px; font-size: 7.5pt; }
  .bairro { margin-bottom: 16px; break-inside: avoid; }
  body.modo-compacto .bairro { margin-bottom: 0; break-inside: auto; page-break-inside: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td {
    text-align: left; padding: 6px 8px;
    border-bottom: 1px solid #e2e8f0; vertical-align: top;
  }
  body.modo-compacto th, body.modo-compacto td {
    padding: 1px 3px; border-bottom-color: #d1d5db; vertical-align: top;
  }
  th {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em;
    color: #64748b; background: #f8fafc;
  }
  body.modo-compacto th {
    font-size: 7pt; padding: 2px 3px; background: #eef2f7;
  }
  td.num { width: 28px; color: #64748b; font-weight: 700; }
  body.modo-compacto td.num { width: 16px; font-size: 7.5pt; text-align: right; font-weight: 600; }
  td.nome { font-weight: 700; color: #0f172a; }
  body.modo-compacto td.nome { font-weight: 600; font-size: 8pt; }
  td.end { color: #64748b; font-size: 11px; }
  body.modo-compacto td.end { font-size: 7pt; color: #475569; }
  td.col-culto { font-size: 7pt; max-width: 22%; }
  td.col-vis { width: 14px; text-align: center; font-size: 7pt; font-weight: 700; }
  td.col-vis.ok { color: #15803d; }
  .cel-ig .nm { font-weight: 600; font-size: 8pt; line-height: 1.15; }
  .cel-ig .end { font-size: 7pt; color: #475569; line-height: 1.15; margin-top: 0; }
  tr.sec-bairro td {
    padding: 4px 6px 4px 5px;
    border-top: 2px solid #c9a227;
    border-bottom: 1px solid #d4a84a;
    background: linear-gradient(90deg, #fff4d6 0%, #fffbeb 42%, #ffffff 100%);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .bairro-badge {
    display: inline-block;
    font-size: 6.5pt;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #1a1408;
    background: #c9a227;
    padding: 1px 6px;
    border-radius: 3px;
    margin-right: 7px;
    vertical-align: middle;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .bairro-nome {
    display: inline;
    font-size: 10pt;
    font-weight: 800;
    color: #1e3a5f;
    letter-spacing: 0.02em;
    vertical-align: middle;
  }
  body.modo-compacto .bairro-nome { font-size: 9.5pt; }
  .bairro-qtd {
    display: inline;
    font-size: 7.5pt;
    font-weight: 600;
    color: #92400e;
    margin-left: 10px;
    vertical-align: middle;
  }
  .bairro h2 {
    margin: 0 0 8px; font-size: 14px; color: #0f172a;
    border-left: 4px solid #c9a227; padding: 6px 8px;
    display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
    background: linear-gradient(90deg, #fff4d6 0%, #fffbeb 50%, transparent 100%);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .bairro h2 .bairro-nome { font-size: 14px; color: #1e3a5f; }
  .bairro h2 small { font-weight: 600; color: #92400e; font-size: 11px; }
  table.lista-unica { margin-bottom: 4px; }
  td.dist {
    white-space: nowrap; font-weight: 800; color: #1d4ed8;
    background: #eff6ff; width: 72px; text-align: center;
  }
  .vazio { text-align: center; color: #94a3b8; padding: 18px; }
  body.modo-compacto .vazio { padding: 8px; }
  footer {
    margin-top: 18px; padding-top: 8px; border-top: 1px solid #e2e8f0;
    color: #94a3b8; font-size: 10px;
    display: flex; justify-content: space-between; gap: 12px;
  }
  body.modo-compacto footer {
    margin-top: 4px; padding-top: 3px; font-size: 6.5pt;
  }
  @media print {
    .barra { display: none !important; }
    body { padding: 0 !important; }
    body:not(.modo-compacto) .bairro { break-inside: avoid; page-break-inside: avoid; }
    body.modo-compacto tbody tr:not(.sec-bairro) {
      break-inside: avoid; page-break-inside: avoid;
    }
    tr.sec-bairro td, .bairro-badge, .bairro h2 {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
</style>
</head>
<body class="${bodyClass}">
  <div class="barra">
    <button type="button" class="btn-print" onclick="window.print()">Imprimir / salvar PDF</button>
    <button type="button" class="btn-close" onclick="window.close()">Fechar</button>
    <span>Confira e depois clique em Imprimir</span>
  </div>
  <header>
    <h1>${escHtml(titulo)}</h1>
    <div class="meta">
      <div>${escHtml(dataHoje())}</div>
      <div>${escHtml(horaAgora())}</div>
    </div>
  </header>
  <p class="sub">${escHtml(subtitulo)}</p>
  ${corpo}
  <footer>
    <span>${escHtml(footL)}</span>
    <span>${escHtml(footR)}</span>
  </footer>
</body>
</html>`
}

function celulaExtra(ig, col, compact = false) {
  if (col === 'culto') return ig?.culto || '—'
  if (col === 'visitado') {
    if (compact) return ig?.visitado ? 'V' : '·'
    return ig?.visitado ? 'Visitada' : 'Pendente'
  }
  if (col === 'denominacao') return ig?.denominacao || '—'
  if (col === 'pastor') return ig?.pastor1 || '—'
  return ''
}

/** Lista limpa: bairro → nome + endereço (sem pares). */
export function htmlRelatorioListaIgrejas(opts = {}) {
  const grupos = Array.isArray(opts.grupos) ? opts.grupos : []
  const extras = Array.isArray(opts.colunasExtras) ? opts.colunasExtras : []
  const compact = opts.compact !== false
  const titulo = opts.titulo || 'Lista de igrejas por bairro'
  const totalIgrejas = opts.totalIgrejas
    ?? grupos.reduce((n, g) => n + igrejasDoGrupo(g).length, 0)
  const subtitulo = opts.subtitulo || [
    `${totalIgrejas} igrejas`,
    `${grupos.length} bairro${grupos.length !== 1 ? 's' : ''}`,
  ].join(' · ')

  let corpo = ''

  if (compact) {
    const temCulto = extras.includes('culto')
    const temVisita = extras.includes('visitado')
    const cols = 2 + (temCulto ? 1 : 0) + (temVisita ? 1 : 0)
    const head = [
      '<th>#</th>',
      '<th>Igreja / endereço</th>',
      temCulto ? '<th>Culto</th>' : '',
      temVisita ? '<th>V</th>' : '',
    ].join('')
    const rows = []
    for (const g of grupos) {
      const lista = igrejasDoGrupo(g).slice().sort((a, b) =>
        String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR'),
      )
      if (!lista.length) continue
      const tituloBairro = g.bairro || g.setor || '—'
      rows.push(htmlFaixaBairro(tituloBairro, lista.length, cols))
      lista.forEach((ig, i) => {
        const visCell = ig?.visitado
          ? '<td class="col-vis ok">V</td>'
          : '<td class="col-vis">·</td>'
        rows.push(`<tr>
          <td class="num">${i + 1}</td>
          <td class="cel-ig"><div class="nm">${escHtml(ig?.nome || '—')}</div><div class="end">${escHtml(ig?.endereco || '—')}</div></td>
          ${temCulto ? `<td class="col-culto">${escHtml(celulaExtra(ig, 'culto', true))}</td>` : ''}
          ${temVisita ? visCell : ''}
        </tr>`)
      })
    }
    corpo = rows.length
      ? `<table class="lista-unica"><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table>`
      : '<p class="vazio">Nenhuma igreja com os filtros atuais.</p>'
  } else {
    const extraHead = extras.map(col => {
      if (col === 'culto') return '<th>Culto</th>'
      if (col === 'visitado') return '<th>Visita</th>'
      if (col === 'denominacao') return '<th>Denom.</th>'
      if (col === 'pastor') return '<th>Pastor</th>'
      return ''
    }).join('')

    const colSpan = 3 + extras.length

    corpo = grupos.map(g => {
      const lista = igrejasDoGrupo(g).slice().sort((a, b) =>
        String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR'),
      )
      const tituloBairro = g.bairro || g.setor || '—'
      const rows = lista.map((ig, i) => {
        const extraCells = extras.map(col => {
          const v = celulaExtra(ig, col, false)
          const cls = col === 'visitado' && ig?.visitado ? 'nome' : 'end'
          return `<td class="${cls}">${escHtml(v)}</td>`
        }).join('')
        return `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="nome">${escHtml(ig?.nome || '—')}</td>
        <td class="end">${escHtml(ig?.endereco || '—')}</td>
        ${extraCells}
      </tr>
    `
      }).join('')
      return `
      <section class="bairro">
        ${htmlTituloBairroSecao(tituloBairro, lista.length)}
        <table>
          <thead><tr><th>#</th><th>Igreja</th><th>Endereço</th>${extraHead}</tr></thead>
          <tbody>${rows || `<tr><td colspan="${colSpan}" class="vazio">Sem igrejas</td></tr>`}</tbody>
        </table>
      </section>`
    }).join('') || '<p class="vazio">Nenhuma igreja com os filtros atuais.</p>'
  }

  return shellHtml({
    titulo,
    subtitulo,
    corpo,
    rodapeEsquerda: opts.rodapeEsquerda,
    rodapeDireita: opts.rodapeDireita,
    compact,
  })
}

/** Pares próximos: uma linha por dupla (Igreja A · Igreja B · distância). */
export function htmlRelatorioParesIgrejas(opts = {}) {
  const grupos = Array.isArray(opts.grupos) ? opts.grupos : []
  const maxKm = opts.maxKm ?? 3
  const titulo = opts.titulo || 'Igrejas próximas (pares)'
  const totalPares = grupos.reduce((n, g) => n + (g.pares?.length || 0), 0)
  const subtitulo = opts.subtitulo || [
    `pares até ${maxKm} km`,
    `${totalPares} par${totalPares !== 1 ? 'es' : ''}`,
    `${grupos.length} bairro${grupos.length !== 1 ? 's' : ''}`,
  ].join(' · ')

  const corpo = grupos.filter(g => (g.pares || []).length).map(g => {
    const rows = (g.pares || []).map((p, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="nome">${escHtml(p.a?.nome || '—')}</td>
        <td class="nome">${escHtml(p.b?.nome || '—')}</td>
        <td class="dist">${escHtml(formatDistanciaKm(p.km))}</td>
      </tr>
    `).join('')
    return `
      <section class="bairro">
        <h2>
          <span>${escHtml(g.setor)}</span>
          <small>${g.pares.length} par${g.pares.length !== 1 ? 'es' : ''} ≤ ${escHtml(String(maxKm))} km</small>
        </h2>
        <table>
          <thead><tr><th>#</th><th>Igreja</th><th>Vizinha</th><th>Dist.</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`
  }).join('') || '<p class="vazio">Nenhum par próximo com a distância atual. Aumente o limite em km.</p>'

  return shellHtml({ titulo, subtitulo, corpo })
}

/** Compat: modo lista ou pares. */
export function htmlRelatorioIgrejasProximas(opts = {}) {
  if (opts.modo === 'pares') return htmlRelatorioParesIgrejas(opts)
  return htmlRelatorioListaIgrejas(opts)
}

function abrirHtml(html) {
  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (!win) {
      URL.revokeObjectURL(url)
      return { ok: false, error: 'popup' }
    }
    setTimeout(() => {
      try { URL.revokeObjectURL(url) } catch { /* ignore */ }
    }, 60_000)
    return { ok: true }
  } catch {
    const win = window.open('', '_blank', 'width=960,height=720')
    if (!win) return { ok: false, error: 'popup' }
    try { win.opener = null } catch { /* ignore */ }
    win.document.open()
    win.document.write(html)
    win.document.close()
    return { ok: true }
  }
}

export function imprimirRelatorioIgrejasProximas(opts) {
  return abrirHtml(htmlRelatorioIgrejasProximas(opts))
}

export function imprimirListaIgrejas(opts) {
  return abrirHtml(htmlRelatorioListaIgrejas(opts))
}

export function imprimirParesIgrejas(opts) {
  return abrirHtml(htmlRelatorioParesIgrejas(opts))
}
