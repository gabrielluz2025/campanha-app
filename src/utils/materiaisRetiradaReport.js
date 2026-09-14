/** Relatórios imprimíveis: agenda de retiradas + estoque + histórico de movimentações. */

import { abrirJanelaImpressao, escHtml } from './relatoriosHub'
import { labelUsuarioSistema, labelQuemRetirou, enriquecerSaidaComRetirada } from './materiaisMovimentos'
import {
  STATUS_PENDENTE, STATUS_VALIDADO, STATUS_RECUSADO, STATUS_CANCELADO,
} from './materiaisRetirada'

const STATUS_LABEL = {
  [STATUS_PENDENTE]: 'Pendente',
  [STATUS_VALIDADO]: 'Validado',
  [STATUS_RECUSADO]: 'Recusado',
  [STATUS_CANCELADO]: 'Cancelado',
}

function fmtDataBr(iso) {
  if (!iso) return '—'
  try {
    const d = String(iso).length <= 10
      ? new Date(`${iso}T12:00:00`)
      : new Date(iso)
    return d.toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    })
  } catch {
    return String(iso)
  }
}

function nomeItem(it, itens = []) {
  return it.itemNome
    || itens.find(i => String(i.id) === String(it.itemId))?.nome
    || 'Material'
}

function chaveData(r) {
  const raw = String(r?.dataPrevista || '').slice(0, 10)
  return raw || 'sem-data'
}

/** Agrupa retiradas por data prevista (crescente). */
export function agruparAgendaRetiradas(retiradas = []) {
  const map = new Map()
  for (const r of retiradas || []) {
    const k = chaveData(r)
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(r)
  }
  const dias = [...map.entries()].sort((a, b) => {
    if (a[0] === 'sem-data') return 1
    if (b[0] === 'sem-data') return -1
    return a[0].localeCompare(b[0])
  })
  for (const [, lista] of dias) {
    lista.sort((a, b) => String(a.coordenadorNome || '').localeCompare(String(b.coordenadorNome || ''), 'pt-BR'))
  }
  return dias
}

export function montarHtmlAgendaRetiradas({
  retiradas = [],
  itens = [],
  filtroLabel = 'Todas',
} = {}) {
  const grupos = agruparAgendaRetiradas(retiradas)
  const nPend = retiradas.filter(r => r.status === STATUS_PENDENTE).length
  const nVal = retiradas.filter(r => r.status === STATUS_VALIDADO).length
  const gerado = new Date().toLocaleString('pt-BR')

  const secoes = grupos.length === 0
    ? '<p class="meta">Nenhuma retirada neste filtro.</p>'
    : grupos.map(([dia, lista]) => {
      const tituloDia = dia === 'sem-data' ? 'Sem data prevista' : fmtDataBr(dia)
      const linhas = lista.map(r => {
        const materiais = (r.itens || [])
          .map(it => `${escHtml(nomeItem(it, itens))}: <b>${Number(it.quantidade || 0).toLocaleString('pt-BR')}</b>`)
          .join('<br/>')
        return `<tr>
          <td>${escHtml(r.coordenadorNome || '—')}${r.isOutros ? ' <span class="meta">(Outros)</span>' : ''}</td>
          <td>${STATUS_LABEL[r.status] || r.status}</td>
          <td>${materiais || '—'}</td>
          <td>${escHtml(r.obs || '—')}</td>
          <td>${r.origem === 'formulario' ? 'Formulário' : 'Painel'}</td>
        </tr>`
      }).join('')
      return `<h2>${escHtml(tituloDia)} · ${lista.length} retirada(s)</h2>
        <table>
          <thead><tr>
            <th>Coordenador</th><th>Status</th><th>Materiais</th><th>Obs.</th><th>Origem</th>
          </tr></thead>
          <tbody>${linhas}</tbody>
        </table>`
    }).join('')

  return `
    <h1>Agenda de retirada de material</h1>
    <p class="meta">Filtro: ${escHtml(filtroLabel)} · Gerado em ${escHtml(gerado)}</p>
    <div class="kpis">
      <div class="kpi"><b>${retiradas.length}</b><span>Total</span></div>
      <div class="kpi"><b>${nPend}</b><span>Pendentes</span></div>
      <div class="kpi"><b>${nVal}</b><span>Validados</span></div>
      <div class="kpi"><b>${grupos.length}</b><span>Dias</span></div>
    </div>
    ${secoes}
    <p class="rodape">Sistema de Campanha · Relatório de agenda de materiais</p>
  `
}

export function imprimirAgendaRetiradas(opts) {
  const html = montarHtmlAgendaRetiradas(opts)
  return abrirJanelaImpressao(html, 'Agenda de retirada de material')
}

export function montarHtmlEstoque({ itens = [], historico = null } = {}) {
  const gerado = new Date().toLocaleString('pt-BR')
  const totalCad = itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0)
  const totalDisp = itens.reduce((s, i) => s + (Number(i.disponivel ?? i.restante) || 0), 0)
  const totalSaid = itens.reduce((s, i) => s + (Number(i.saido ?? i.distribuido) || 0), 0)
  const totalRes = itens.reduce((s, i) => s + (Number(i.reservado) || 0), 0)
  const alertas = itens.filter(i => i.status && i.status !== 'ok').length

  const statusTxt = (st) => {
    if (st === 'esgotado') return '<span class="falta">Esgotado</span>'
    if (st === 'baixo') return '<span class="falta">Estoque baixo</span>'
    return 'OK'
  }

  const rows = [...itens]
    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
    .map(i => `<tr>
      <td>${escHtml(i.nome || '—')}</td>
      <td>${escHtml(i.categoria || '—')}</td>
      <td>${Number(i.quantidade || 0).toLocaleString('pt-BR')}</td>
      <td>${Number(i.saido ?? i.distribuido ?? 0).toLocaleString('pt-BR')}</td>
      <td>${Number(i.reservado || 0).toLocaleString('pt-BR')}</td>
      <td><b>${Number(i.disponivel ?? i.restante ?? 0).toLocaleString('pt-BR')}</b></td>
      <td>${statusTxt(i.status)}</td>
      <td>${i.noFormulario === false ? 'Não' : 'Sim'}</td>
    </tr>`).join('')

  return `
    <h1>Relatório de estoque de materiais</h1>
    <p class="meta">Gerado em ${escHtml(gerado)} · ${itens.length} tipo(s)</p>
    <div class="kpis">
      <div class="kpi"><b>${itens.length}</b><span>Tipos</span></div>
      <div class="kpi"><b>${totalCad.toLocaleString('pt-BR')}</b><span>Cadastrado</span></div>
      <div class="kpi"><b>${totalSaid.toLocaleString('pt-BR')}</b><span>Saídas</span></div>
      <div class="kpi"><b>${totalRes.toLocaleString('pt-BR')}</b><span>Reservado</span></div>
      <div class="kpi"><b>${totalDisp.toLocaleString('pt-BR')}</b><span>Disponível</span></div>
      <div class="kpi"><b>${alertas}</b><span>Alertas</span></div>
    </div>
    <h2>Estoque por material</h2>
    <table>
      <thead><tr>
        <th>Material</th><th>Categoria</th><th>Cadastro</th><th>Saídas</th>
        <th>Reserv.</th><th>Disp.</th><th>Status</th><th>No form.</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="8">Nenhum material cadastrado.</td></tr>'}</tbody>
      <tfoot><tr style="font-weight:700;background:#f8fafc">
        <td colspan="2">Total geral</td>
        <td style="text-align:right">${totalCad.toLocaleString('pt-BR')}</td>
        <td style="text-align:right">${totalSaid.toLocaleString('pt-BR')}</td>
        <td style="text-align:right">${totalRes.toLocaleString('pt-BR')}</td>
        <td style="text-align:right">${totalDisp.toLocaleString('pt-BR')}</td>
        <td colspan="2">—</td>
      </tr></tfoot>
    </table>
    ${Array.isArray(historico) ? montarTabelaTotaisPorMaterial(historico, itens) : ''}
    <p class="rodape">Sistema de Campanha · Relatório de estoque</p>
  `
}

export function imprimirEstoqueMateriais(opts) {
  const html = montarHtmlEstoque(opts)
  return abrirJanelaImpressao(html, 'Relatório de estoque de materiais')
}

function fmtDataHoraBr(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function nomeMaterial(reg, itens = []) {
  const item = itens.find(i => String(i.id) === String(reg.itemId))
  return item?.nome || reg.itemNome || 'Item removido'
}

function categoriaMaterial(reg, itens = []) {
  const item = itens.find(i => String(i.id) === String(reg.itemId))
  return item?.categoria || '—'
}

/** Agrega entradas/saídas do histórico por material (+ estoque atual quando existir). */
function totaisPorMaterial(historico = [], itens = []) {
  const map = new Map()

  function ensure(key, nome, categoria) {
    const k = String(key || nome || 'sem-id')
    if (!map.has(k)) {
      map.set(k, {
        key: k,
        nome: nome || 'Item removido',
        categoria: categoria || '—',
        entradas: 0,
        saidas: 0,
        movimentos: 0,
      })
    }
    return map.get(k)
  }

  for (const i of itens || []) {
    ensure(i.id, i.nome, i.categoria)
  }

  for (const r of historico || []) {
    const nome = nomeMaterial(r, itens)
    const cat = categoriaMaterial(r, itens)
    const row = ensure(r.itemId || nome, nome, cat)
    const q = Number(r.quantidade) || 0
    if (r._tipo === 'entrada') row.entradas += q
    else if (r._tipo === 'saida') row.saidas += q
    row.movimentos += 1
  }

  const itemById = new Map((itens || []).map(i => [String(i.id), i]))

  return [...map.values()]
    .map(row => {
      const item = itemById.get(String(row.key)) || itemById.get(String(row.key).replace(/^id:/, ''))
      const cadastro = Number(item?.quantidade) || 0
      const disponivel = Number(item?.disponivel ?? item?.restante) || 0
      const saidoEstoque = Number(item?.saido ?? item?.distribuido) || 0
      return {
        ...row,
        saldo: row.entradas - row.saidas,
        cadastro,
        disponivel,
        saidoEstoque,
      }
    })
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
}

function montarTabelaTotaisPorMaterial(historico = [], itens = []) {
  const rows = totaisPorMaterial(historico, itens)
  if (!rows.length) {
    return '<p class="meta">Nenhum material no histórico.</p>'
  }

  const sumEnt = rows.reduce((s, r) => s + r.entradas, 0)
  const sumSai = rows.reduce((s, r) => s + r.saidas, 0)
  const sumCad = rows.reduce((s, r) => s + r.cadastro, 0)
  const sumDisp = rows.reduce((s, r) => s + r.disponivel, 0)

  const body = rows.map(r => `<tr>
    <td>${escHtml(r.nome)}</td>
    <td>${escHtml(r.categoria)}</td>
    <td style="text-align:right;color:#15803d">${r.entradas.toLocaleString('pt-BR')}</td>
    <td style="text-align:right;color:#b91c1c">${r.saidas.toLocaleString('pt-BR')}</td>
    <td style="text-align:right;font-weight:700">${r.saldo.toLocaleString('pt-BR')}</td>
    <td style="text-align:right">${r.cadastro.toLocaleString('pt-BR')}</td>
    <td style="text-align:right;font-weight:700">${r.disponivel.toLocaleString('pt-BR')}</td>
    <td style="text-align:center">${r.movimentos.toLocaleString('pt-BR')}</td>
  </tr>`).join('')

  return `
    <h2>Totais por material</h2>
    <p class="meta">Entradas e saídas somadas no histórico · cadastro/disponível do estoque atual</p>
    <table>
      <thead><tr>
        <th>Material</th><th>Categoria</th>
        <th style="text-align:right">Entradas</th>
        <th style="text-align:right">Saídas</th>
        <th style="text-align:right">Saldo mov.</th>
        <th style="text-align:right">Cadastro</th>
        <th style="text-align:right">Disponível</th>
        <th style="text-align:center">Movim.</th>
      </tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr style="font-weight:700;background:#f8fafc">
        <td colspan="2">Total geral</td>
        <td style="text-align:right;color:#15803d">${sumEnt.toLocaleString('pt-BR')}</td>
        <td style="text-align:right;color:#b91c1c">${sumSai.toLocaleString('pt-BR')}</td>
        <td style="text-align:right">${(sumEnt - sumSai).toLocaleString('pt-BR')}</td>
        <td style="text-align:right">${sumCad.toLocaleString('pt-BR')}</td>
        <td style="text-align:right">${sumDisp.toLocaleString('pt-BR')}</td>
        <td style="text-align:center">—</td>
      </tr></tfoot>
    </table>`
}

/** Histórico de entradas e saídas (ordenado do mais recente ao mais antigo). */
export function montarHtmlHistoricoMovimentos({
  historico = [],
  itens = [],
  retiradas = [],
  titulo = 'Histórico de entradas e saídas',
  filtroBusca = '',
  comEstoque = false,
} = {}) {
  const gerado = new Date().toLocaleString('pt-BR')
  const retById = new Map((retiradas || []).map(r => [String(r.id), r]))
  const lista = [...(historico || [])]
    .map(r => {
      if (r._tipo !== 'saida') return r
      const ret = r.retiradaId != null ? retById.get(String(r.retiradaId)) : null
      return enriquecerSaidaComRetirada(r, ret)
    })
    .sort(
      (a, b) => new Date(b._ts || b.data || 0) - new Date(a._ts || a.data || 0),
    )
  const entradas = lista.filter(r => r._tipo === 'entrada')
  const saidas = lista.filter(r => r._tipo === 'saida')
  const totalEnt = entradas.reduce((s, r) => s + (Number(r.quantidade) || 0), 0)
  const totalSai = saidas.reduce((s, r) => s + (Number(r.quantidade) || 0), 0)

  const rows = lista.map(r => {
    const isEntrada = r._tipo === 'entrada'
    const qtd = Number(r.quantidade) || 0
    const quem = labelUsuarioSistema(r)
    const quemRetirou = !isEntrada
      ? labelQuemRetirou(r, r.retiradaId != null ? retById.get(String(r.retiradaId)) : null)
      : '—'
    const local = !isEntrada
      ? [r.bairro, r.evento].filter(Boolean).join(' · ') || '—'
      : '—'
    return `<tr>
      <td>${fmtDataHoraBr(r.data || r._ts)}</td>
      <td>${isEntrada ? 'Entrada' : 'Saída'}</td>
      <td>${escHtml(nomeMaterial(r, itens))}</td>
      <td>${escHtml(categoriaMaterial(r, itens))}</td>
      <td style="text-align:right;font-weight:700;color:${isEntrada ? '#15803d' : '#b91c1c'}">${isEntrada ? '+' : '−'}${qtd.toLocaleString('pt-BR')}</td>
      <td>${escHtml(quem)}</td>
      <td>${escHtml(quemRetirou)}</td>
      <td>${escHtml(local)}</td>
    </tr>`
  }).join('')

  const filtroTxt = filtroBusca ? ` · Filtro: “${escHtml(filtroBusca)}”` : ''

  return `
    <div class="secao-historico" style="${comEstoque ? 'page-break-before:always;margin-top:28px' : ''}">
      <h1>${escHtml(titulo)}</h1>
      <p class="meta">Gerado em ${escHtml(gerado)}${escHtml(filtroTxt)} · ${lista.length} registro(s)</p>
      <div class="kpis">
        <div class="kpi"><b>${lista.length}</b><span>Registros</span></div>
        <div class="kpi"><b>${saidas.length}</b><span>Saídas</span></div>
        <div class="kpi"><b>${entradas.length}</b><span>Entradas</span></div>
        <div class="kpi"><b>${totalSai.toLocaleString('pt-BR')}</b><span>Un. saídas</span></div>
        <div class="kpi"><b>${totalEnt.toLocaleString('pt-BR')}</b><span>Un. entradas</span></div>
      </div>
      ${comEstoque ? '' : montarTabelaTotaisPorMaterial(lista, itens)}
      <h2>Movimentações (mais recente primeiro)</h2>
      <table>
        <thead><tr>
          <th>Data/hora</th><th>Tipo</th><th>Material</th><th>Categoria</th>
          <th style="text-align:right">Qtd.</th><th>Lançado por</th><th>Retirou/recebeu</th><th>Bairro/evento</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="8">Nenhuma movimentação registrada.</td></tr>'}</tbody>
      </table>
    </div>`
}

export function imprimirHistoricoMovimentos(opts) {
  const html = montarHtmlHistoricoMovimentos(opts)
  return abrirJanelaImpressao(html, 'Histórico de materiais')
}

/** Relatório completo: estoque atual + histórico de movimentações. */
export function montarHtmlRelatorioEstoqueCompleto({
  itens = [],
  historico = [],
  retiradas = [],
  filtroBusca = '',
} = {}) {
  return `${montarHtmlEstoque({ itens, historico })}${montarHtmlHistoricoMovimentos({ historico, itens, retiradas, filtroBusca, comEstoque: true })}`
}

export function imprimirRelatorioEstoqueCompleto(opts) {
  const html = montarHtmlRelatorioEstoqueCompleto(opts)
  return abrirJanelaImpressao(html, 'Estoque e histórico de materiais')
}
