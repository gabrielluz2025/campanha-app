/** Relatório e helpers da aba Igrejas */

import { normalizarCargo } from './equipeSync'
import { getAllIgrejasCatalog } from './igrejasCatalog'

const DENOMINACAO_PADRAO = 'Assembleia de Deus'

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function dataHoje() {
  return new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function nomeIgrejaMembro(m) {
  return String(m?.igrejaNome || '').trim()
}

export function cargoEclesiastico(m) {
  return String(m?.cargoIgreja || '').trim()
}

/** Tem vínculo com rede de igrejas (igreja, cargo eclesiástico ou cargo campanha Igreja) */
export function temVinculoIgreja(m) {
  return Boolean(
    nomeIgrejaMembro(m)
    || m?.igrejaId != null
    || cargoEclesiastico(m)
    || normalizarCargo(m?.cargo) === 'Igreja'
  )
}

export function temCargoEclesiastico(m) {
  return Boolean(cargoEclesiastico(m))
}

function isAd(ig) {
  const d = ig?.denominacao || DENOMINACAO_PADRAO
  return d === DENOMINACAO_PADRAO || norm(d).includes('assembleia')
}

function catalogIndices() {
  const catalog = getAllIgrejasCatalog().map(ig => ({
    ...ig,
    denominacao: ig.denominacao || (Number(ig.id) > 88 && Number(ig.id) <= 1999 ? 'Outra' : DENOMINACAO_PADRAO),
    setor: ig.setor || '—',
  }))
  const byId = new Map()
  const byNome = new Map()
  catalog.forEach(ig => {
    byId.set(String(ig.id), ig)
    byNome.set(norm(ig.nome), ig)
  })
  return { catalog, byId, byNome }
}

export function resolverIgrejaMembro(m) {
  const { byId, byNome } = catalogIndices()
  if (m?.igrejaId != null && byId.has(String(m.igrejaId))) return byId.get(String(m.igrejaId))
  const nome = nomeIgrejaMembro(m)
  if (nome && byNome.has(norm(nome))) return byNome.get(norm(nome))
  return null
}

/**
 * Lista pessoas da rede de igrejas com filtros.
 * escopo: rede | cargo_igreja | todos
 * agrupar: igreja | cargo_igreja | cargo_campanha
 */
export function listarPessoasIgreja(membros = [], {
  escopo = 'rede',
  denom = 'todas', // todas | ad | outras
  igrejaNome = '',
  cargoIgreja = '',
  agrupar = 'igreja',
} = {}) {
  const lista = (membros || []).filter(m => {
    if (escopo === 'rede' && !temVinculoIgreja(m)) return false
    if (escopo === 'cargo_igreja' && !temCargoEclesiastico(m)) return false
    if (igrejaNome && nomeIgrejaMembro(m) !== igrejaNome) return false
    if (cargoIgreja && cargoEclesiastico(m) !== cargoIgreja) return false
    if (denom !== 'todas') {
      const ref = resolverIgrejaMembro(m)
      if (ref) {
        if (denom === 'ad' && !isAd(ref)) return false
        if (denom === 'outras' && isAd(ref)) return false
      } else if (denom === 'ad' || denom === 'outras') {
        return false
      }
    }
    return true
  }).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))

  const gruposMap = new Map()
  for (const m of lista) {
    let key
    if (agrupar === 'cargo_igreja') key = cargoEclesiastico(m) || 'Sem cargo na igreja'
    else if (agrupar === 'cargo_campanha') key = normalizarCargo(m.cargo) || 'Sem cargo'
    else key = nomeIgrejaMembro(m) || 'Sem igreja vinculada'
    if (!gruposMap.has(key)) gruposMap.set(key, [])
    gruposMap.get(key).push(m)
  }

  const grupos = [...gruposMap.entries()]
    .map(([titulo, pessoas]) => ({ titulo, pessoas }))
    .sort((a, b) => {
      const last = t => t.startsWith('Sem ')
      if (last(a.titulo) !== last(b.titulo)) return last(a.titulo) ? 1 : -1
      return a.titulo.localeCompare(b.titulo, 'pt-BR')
    })

  return { lista, grupos }
}

export function formatarRelatorioIgrejasTexto({
  grupos = [],
  titulo = 'Relatório de Igrejas',
} = {}) {
  const linhas = [titulo, `Data: ${dataHoje()}`, '']
  let total = 0
  for (const g of grupos) {
    if (!g.pessoas?.length) continue
    linhas.push(`── ${g.titulo} (${g.pessoas.length}) ──`)
    g.pessoas.forEach((m, i) => {
      total += 1
      const cargoIg = cargoEclesiastico(m)
      const ig = nomeIgrejaMembro(m)
      linhas.push(`${i + 1}. ${m.nome || '—'}`)
      linhas.push(`   Cargo campanha: ${normalizarCargo(m.cargo) || '—'}`)
      if (cargoIg) linhas.push(`   Cargo na igreja: ${cargoIg}`)
      if (ig) linhas.push(`   Igreja: ${ig}`)
      if (m.telefone) linhas.push(`   Telefone: ${m.telefone}`)
      if (m.email) linhas.push(`   E-mail: ${m.email}`)
      linhas.push('')
    })
    linhas.push('')
  }
  if (!total) linhas.push('Nenhuma pessoa no filtro selecionado.')
  else linhas.push(`Total: ${total} pessoa${total !== 1 ? 's' : ''}`)
  return linhas.join('\n').trim()
}

export function montarHtmlImpressaoIgrejas({
  grupos = [],
  subtitulo = '',
  titulo = 'Relatório de Igrejas — Rede e cargos eclesiásticos',
} = {}) {
  const blocos = []
  let total = 0

  for (const g of grupos) {
    if (!g.pessoas?.length) continue
    blocos.push(`<h2 class="grupo">${escHtml(g.titulo)} <span>(${g.pessoas.length})</span></h2>`)
    for (const m of g.pessoas) {
      total += 1
      const cargoIg = cargoEclesiastico(m)
      const ig = nomeIgrejaMembro(m)
      const ref = resolverIgrejaMembro(m)
      const setor = ref?.setor || ''
      const denom = ref ? (isAd(ref) ? 'AD / ADBLU' : (ref.denominacao || 'Outra')) : ''
      blocos.push(`
        <div class="ficha">
          <p class="nome">${escHtml(m.nome || '—')}</p>
          <table class="campos"><tbody>
            <tr><td>Cargo na campanha</td><td>${escHtml(normalizarCargo(m.cargo) || '—')}</td></tr>
            <tr><td>Cargo na igreja</td><td class="${cargoIg ? '' : 'falta'}">${escHtml(cargoIg || 'FALTA')}</td></tr>
            <tr><td>Igreja</td><td class="${ig ? '' : 'falta'}">${escHtml(ig || 'FALTA')}</td></tr>
            ${denom ? `<tr><td>Denominação</td><td>${escHtml(denom)}</td></tr>` : ''}
            ${setor ? `<tr><td>Bairro / setor</td><td>${escHtml(setor)}</td></tr>` : ''}
            <tr><td>Telefone</td><td>${escHtml(m.telefone || '—')}</td></tr>
            <tr><td>E-mail</td><td>${escHtml(m.email || '—')}</td></tr>
          </tbody></table>
        </div>`)
    }
  }

  const corpo = blocos.length
    ? blocos.join('\n')
    : '<p class="vazio">Nenhuma pessoa no filtro selecionado.</p>'

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Relatório de Igrejas</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
    color: #111; background: #fff;
    padding: 28px 32px; font-size: 13px; line-height: 1.45;
  }
  h1 { font-size: 18px; margin-bottom: 6px; }
  .meta-top { color: #555; font-size: 12px; margin-bottom: 16px; }
  .grupo {
    font-size: 14px; margin: 18px 0 10px; padding-bottom: 4px;
    border-bottom: 1px solid #ddd; color: #0e7490;
  }
  .grupo span { color: #666; font-weight: 500; font-size: 12px; }
  .ficha {
    border: 1px solid #ccc; border-radius: 8px;
    padding: 12px 14px; margin-bottom: 10px;
    page-break-inside: avoid; break-inside: avoid;
  }
  .nome { font-weight: 700; font-size: 14px; margin-bottom: 6px; }
  table.campos { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.campos td { padding: 3px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
  table.campos td:first-child { width: 38%; color: #555; font-weight: 600; }
  table.campos td.falta { color: #b45309; font-weight: 700; }
  .vazio { color: #666; }
  .rodape { margin-top: 16px; color: #666; font-size: 11px; }
  @media print { body { padding: 10mm; } }
</style>
</head>
<body>
  <h1>${escHtml(titulo)}</h1>
  <p class="meta-top">${escHtml(dataHoje())}${subtitulo ? ` · ${escHtml(subtitulo)}` : ''}</p>
  ${corpo}
  <p class="rodape">Total: ${total} pessoa${total !== 1 ? 's' : ''}</p>
</body>
</html>`
}

export function imprimirRelatorioIgrejas(opts) {
  const html = montarHtmlImpressaoIgrejas(opts)
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return { ok: false, erro: 'popup' }
  try { win.opener = null } catch { /* ignore */ }
  win.document.open()
  win.document.write(html)
  win.document.close()
  const disparar = () => {
    try { win.focus(); win.print() } catch { /* ignore */ }
  }
  if (win.document.readyState === 'complete') setTimeout(disparar, 250)
  else {
    win.onload = () => setTimeout(disparar, 250)
    setTimeout(disparar, 600)
  }
  return { ok: true }
}

export { dataHoje }
