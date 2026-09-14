/** Rank de bairros — eleitores aptos × votos (impressão / PDF) */

import { abrirJanelaImpressao, escHtml, fmtN, dataHojeLabel } from './relatoriosHub'
import { coberturaEleitoradoPorBairro } from './forcaPorBairro'
import { sanitizarDadosEleitores } from './eleitoresHelpers'
import { isZonaBlumenau } from './bairroMapa'
import { normStr } from './constants'

function isBlumenauContext(dados, filtroCidade) {
  if (filtroCidade && normStr(filtroCidade).includes('blumenau')) return true
  const mun = normStr(dados?.municipio || '')
  if (mun.includes('blumenau')) return true
  return (dados?.zonas || []).some(z => isZonaBlumenau(z, dados))
}

function locaisPorBairro(locaisFlat = []) {
  const map = {}
  for (const l of locaisFlat) {
    const b = String(l.setor || '').trim()
    if (!b) continue
    map[b] = (map[b] || 0) + 1
  }
  return map
}

function buildRowsGeneric(locaisFlat = [], scData = [], filtroCidade = null) {
  const map = {}
  for (const l of locaisFlat) {
    const b = String(l.setor || '').trim()
    if (!b) continue
    if (!map[b]) map[b] = { votos: 0, locais: 0, secoes: 0 }
    map[b].votos += Number(l.totalVotos) || 0
    map[b].locais += 1
    map[b].secoes += Number(l.numSecoes) || 0
  }

  const aptosMap = {}
  if (scData?.length && filtroCidade) {
    const nf = normStr(filtroCidade)
    for (const r of scData) {
      if (normStr(r.municipio) !== nf) continue
      const b = String(r.bairro || '').trim()
      if (!b) continue
      aptosMap[b] = (aptosMap[b] || 0) + (Number(r.total_eleitores) || 0)
    }
  }

  const rows = Object.entries(map)
    .sort((a, b) => b[1].votos - a[1].votos || a[0].localeCompare(b[0], 'pt-BR'))
    .map(([bairro, v], i) => {
      const eleitores = aptosMap[bairro] || 0
      const pct = eleitores > 0 ? Math.round((v.votos / eleitores) * 1000) / 10 : null
      return {
        rank: i + 1,
        bairro,
        eleitores,
        votos: v.votos,
        pct,
        locais: v.locais,
        secoes: v.secoes,
      }
    })

  const totalVotos = rows.reduce((s, r) => s + r.votos, 0)
  const totalAptos = rows.reduce((s, r) => s + r.eleitores, 0)
  const penetracao = totalAptos > 0 ? Math.round((totalVotos / totalAptos) * 1000) / 10 : 0
  return { rows, totalVotos, totalAptos, penetracao }
}

export function montarRankBairrosRows({
  dados = null,
  locaisFlat = [],
  scData = [],
  filtroCidade = null,
} = {}) {
  if (isBlumenauContext(dados, filtroCidade)) {
    const cov = coberturaEleitoradoPorBairro(sanitizarDadosEleitores(dados))
    const locaisMap = locaisPorBairro(locaisFlat)
    const rows = cov.porBairro
      .filter(b => b.temSecao)
      .sort((a, b) => b.votos - a.votos || b.aptos - a.aptos || a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((b, i) => ({
        rank: i + 1,
        bairro: b.nome,
        eleitores: b.aptos,
        votos: b.votos,
        pct: b.qtd,
        locais: locaisMap[b.nome] || 0,
        secoes: b.secoes,
      }))
    return {
      rows,
      totalVotos: cov.totalVotos,
      totalAptos: cov.totalAptos,
      penetracao: cov.coberturaPct,
    }
  }
  return buildRowsGeneric(locaisFlat, scData, filtroCidade)
}

function pctLabel(pct) {
  if (pct == null || !Number.isFinite(Number(pct))) return '—'
  return `${Number(pct).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

export function montarHtmlRankBairros(opts = {}) {
  const {
    dados = null,
    locaisFlat = [],
    scData = [],
    filtroCidade = null,
    candidato = '',
    numero = '',
    partido = '',
    cargo = '',
    ano = '',
  } = opts

  const { rows, totalVotos, totalAptos, penetracao } = montarRankBairrosRows({
    dados, locaisFlat, scData, filtroCidade,
  })

  const cidadeLabel = filtroCidade
    || dados?.municipio
    || 'Território'

  const cabecalho = [
    candidato || dados?.candidato || dados?.urna || 'Candidato',
    numero || dados?.numero ? `Nº ${numero || dados.numero}` : '',
    partido || dados?.partido || '',
    cargo || dados?.cargo || '',
    ano || dados?.ano || '',
    cidadeLabel,
  ].filter(Boolean).join(' · ')

  const linhas = rows.map(r => `
    <tr>
      <td style="text-align:center;font-weight:700">${r.rank}</td>
      <td>${escHtml(r.bairro)}</td>
      <td style="text-align:right">${fmtN(r.eleitores)}</td>
      <td style="text-align:right;font-weight:700">${fmtN(r.votos)}</td>
      <td style="text-align:right">${pctLabel(r.pct)}</td>
      <td style="text-align:center">${fmtN(r.locais)}</td>
      <td style="text-align:center">${fmtN(r.secoes)}</td>
    </tr>`).join('')

  return `
    <h1>Rank de Bairros — Força de Votos</h1>
    <p class="meta">${escHtml(cabecalho)}</p>
    <p class="meta">Gerado em ${escHtml(dataHojeLabel())} · ${rows.length} bairro${rows.length !== 1 ? 's' : ''} no ranking</p>
    <div class="kpis">
      <div class="kpi"><b>${fmtN(totalVotos)}</b><span>Votos</span></div>
      <div class="kpi"><b>${fmtN(totalAptos)}</b><span>Eleitores aptos</span></div>
      <div class="kpi"><b>${pctLabel(penetracao)}</b><span>Penetração</span></div>
      <div class="kpi"><b>${rows.length}</b><span>Bairros</span></div>
    </div>
    <h2>Ranking por bairro</h2>
    <p class="meta">Ordenado por votos obtidos (maior força primeiro). Penetração = votos ÷ eleitores aptos no bairro.</p>
    ${rows.length ? `
    <table>
      <thead>
        <tr>
          <th style="width:36px">#</th>
          <th>Bairro</th>
          <th style="text-align:right">Eleitores</th>
          <th style="text-align:right">Votos</th>
          <th style="text-align:right">Penetr.</th>
          <th style="text-align:center">Locais</th>
          <th style="text-align:center">Seções</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
      <tfoot>
        <tr>
          <td colspan="2"><strong>Total</strong></td>
          <td style="text-align:right"><strong>${fmtN(totalAptos)}</strong></td>
          <td style="text-align:right"><strong>${fmtN(totalVotos)}</strong></td>
          <td style="text-align:right"><strong>${pctLabel(penetracao)}</strong></td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table>` : '<p>Nenhum bairro mapeado. Atribua bairros aos colégios eleitorais na aba Eleitores.</p>'}
    <p class="rodape">Campanha · Relatório eleitoral · ${escHtml(dataHojeLabel())}</p>`
}

export function imprimirRankBairrosEleitores(opts = {}) {
  const cidadeLabel = opts.filtroCidade || opts.dados?.municipio || 'Eleitores'
  const titulo = `Rank de Bairros — ${cidadeLabel}`
  const html = montarHtmlRankBairros(opts)
  return abrirJanelaImpressao(html, titulo)
}

export function formatarRankBairrosTexto(opts = {}) {
  const { rows, totalVotos, totalAptos, penetracao } = montarRankBairrosRows(opts)
  const linhas = [
    'RANK DE BAIRROS — FORÇA DE VOTOS',
    dataHojeLabel(),
    `Total: ${fmtN(totalVotos)} votos · ${fmtN(totalAptos)} eleitores · ${pctLabel(penetracao)} penetração`,
    '',
    '#\tBairro\tEleitores\tVotos\tPenetr.\tLocais\tSeções',
  ]
  rows.forEach(r => {
    linhas.push([
      r.rank,
      r.bairro,
      r.eleitores,
      r.votos,
      pctLabel(r.pct),
      r.locais,
      r.secoes,
    ].join('\t'))
  })
  return linhas.join('\n')
}
