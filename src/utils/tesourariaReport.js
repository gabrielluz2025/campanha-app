/** Relatório imprimível da Tesouraria (caixa eleitoral). */

import {
  filtrarMovimentos, resumirCaixa, totaisPorCategoria, loadConta,
  formatarCnpj, fmtMoeda, fmtData, labelStatus, labelTipo, parseValor,
  montarChecklist, compararOrcadoRealizado, loadPrevisaoResumo,
} from './tesouraria'

function dataHoje() {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function montarHtmlTesouraria({
  movimentos = [],
  filtros = {},
  conta: contaIn = null,
  titulo = 'Relatório de Tesouraria — Caixa Eleitoral',
  subtitulo = '',
} = {}) {
  const conta = contaIn || loadConta()
  const lista = filtrarMovimentos(movimentos, filtros)
    .slice()
    .sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')))

  const r = resumirCaixa(lista)
  const cats = totaisPorCategoria(lista)
  const cmp = compararOrcadoRealizado(lista, loadPrevisaoResumo())
  const check = montarChecklist(conta, movimentos)
  const limite = parseValor(conta.limiteGastos)

  const rows = lista.map(m => `
    <tr class="${m.tipo}">
      <td>${esc(fmtData(m.data))}</td>
      <td><span class="badge ${m.tipo}">${esc(labelTipo(m.tipo))}</span></td>
      <td>${esc(m.categoria)}</td>
      <td>${esc(m.descricao || '—')}</td>
      <td>${esc(m.contraparte || '—')}${m.documentoContraparte ? `<br/><small>${esc(m.documentoContraparte)}</small>` : ''}</td>
      <td>${esc(m.forma)}</td>
      <td>${esc(labelStatus(m.status))}${m.naContaCampanha === false ? '<br/><small>fora da conta</small>' : ''}</td>
      <td>${m.comprovante ? 'Sim' : 'Não'}</td>
      <td class="num ${m.tipo}">${m.tipo === 'saida' ? '−' : '+'}${esc(fmtMoeda(parseValor(m.valor)))}</td>
    </tr>`).join('')

  const catRows = cats.map(c => `
    <tr>
      <td><span class="badge ${c.tipo}">${esc(labelTipo(c.tipo))}</span></td>
      <td>${esc(c.categoria)}</td>
      <td class="num">${c.qtd}</td>
      <td class="num ${c.tipo}">${esc(fmtMoeda(c.total))}</td>
    </tr>`).join('')

  const checkRows = check.itens.map(i => `
    <tr>
      <td>${i.ok ? 'OK' : 'PENDENTE'}</td>
      <td>${esc(i.titulo)}</td>
      <td>${esc(i.detalhe)}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>${esc(titulo)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; color: #111; background: #fff; padding: 24px 28px; font-size: 12px; line-height: 1.45; }
  .capa { border-bottom: 3px solid #a8842e; padding-bottom: 12px; margin-bottom: 16px; }
  .brand { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #a8842e; font-weight: 700; }
  h1 { font-size: 20px; margin: 4px 0; }
  .meta { color: #555; font-size: 12px; }
  .conta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin: 12px 0; font-size: 11px; }
  .conta-box strong { display: inline-block; min-width: 120px; color: #475569; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0; }
  .kpi { border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px 12px; background: #fafafa; }
  .kpi strong { display: block; font-size: 18px; }
  .kpi span { font-size: 10px; color: #666; text-transform: uppercase; }
  .kpi.ok strong { color: #047857; }
  .kpi.bad strong { color: #b91c1c; }
  h2 { font-size: 14px; margin: 18px 0 8px; padding-left: 8px; border-left: 4px solid #a8842e; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 12px; }
  th { background: #1a1408; color: #f0d48a; text-align: left; padding: 7px 8px; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  tr:nth-child(even) { background: #fafafa; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; }
  td.num.entrada { color: #047857; }
  td.num.saida { color: #b91c1c; }
  .badge { font-size: 9px; font-weight: 800; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; }
  .badge.entrada { background: #d1fae5; color: #047857; }
  .badge.saida { background: #fee2e2; color: #b91c1c; }
  .rodape { margin-top: 18px; padding-top: 8px; border-top: 1px solid #ddd; color: #666; font-size: 10px; }
  .pagebreak { page-break-before: always; }
  @media print { body { padding: 8mm 10mm; } }
  @page { margin: 12mm 10mm; }
</style>
</head>
<body>
  <header class="capa">
    <p class="brand">Campanha · Tesouraria</p>
    <h1>${esc(titulo)}</h1>
    <p class="meta">${esc(dataHoje())}${subtitulo ? ` · ${esc(subtitulo)}` : ''}</p>
  </header>

  <div class="conta-box">
    <div><strong>CNPJ</strong> ${esc(conta.cnpj ? formatarCnpj(conta.cnpj) : '—')}</div>
    <div><strong>Razão social</strong> ${esc(conta.razaoSocial || '—')}</div>
    <div><strong>Banco</strong> ${esc(conta.banco || '—')} · Ag ${esc(conta.agencia || '—')} · Conta ${esc(conta.conta || '—')} (${esc(conta.tipoConta || 'Corrente')})</div>
    <div><strong>PIX</strong> ${esc(conta.pix || '—')}</div>
    <div><strong>Responsável</strong> ${esc(conta.responsavelFinanceiro || '—')}</div>
    <div><strong>Cargo / local</strong> ${esc(conta.cargo || '—')} · ${esc(conta.municipio || '')}/${esc(conta.uf || '')}</div>
    ${limite > 0 ? `<div><strong>Limite de gastos</strong> ${esc(fmtMoeda(limite))} · realizado ${esc(fmtMoeda(r.saidas))} (${limite > 0 ? Math.round((r.saidas / limite) * 100) : 0}%)</div>` : ''}
  </div>

  <div class="kpis">
    <div class="kpi ok"><strong>${esc(fmtMoeda(r.entradas))}</strong><span>Entradas</span></div>
    <div class="kpi bad"><strong>${esc(fmtMoeda(r.saidas))}</strong><span>Saídas</span></div>
    <div class="kpi"><strong style="color:${r.saldoConta >= 0 ? '#047857' : '#b91c1c'}">${esc(fmtMoeda(r.saldoConta))}</strong><span>Saldo conta campanha</span></div>
    <div class="kpi"><strong>${lista.length}</strong><span>Lançamentos</span></div>
  </div>
  <div class="kpis">
    <div class="kpi"><strong>${esc(fmtMoeda(r.aReceber))}</strong><span>A receber</span></div>
    <div class="kpi"><strong>${esc(fmtMoeda(r.aPagar))}</strong><span>A pagar</span></div>
    <div class="kpi"><strong>${esc(fmtMoeda(r.disponivel))}</strong><span>Disponível projetado</span></div>
    <div class="kpi"><strong>${esc(fmtMoeda(cmp.orcado))}</strong><span>Orçado (Previsão)</span></div>
  </div>

  <h2>Checklist pré-prestação · ${check.okCount}/${check.total} (${check.pct}%)</h2>
  <table>
    <thead><tr><th>Status</th><th>Item</th><th>Detalhe</th></tr></thead>
    <tbody>${checkRows}</tbody>
  </table>

  <h2>Por fonte / destino</h2>
  <table>
    <thead><tr><th>Tipo</th><th>Categoria</th><th>Qtd</th><th>Total</th></tr></thead>
    <tbody>${catRows || '<tr><td colspan="4">Sem dados</td></tr>'}</tbody>
  </table>

  <div class="pagebreak"></div>
  <h2>Extrato detalhado</h2>
  <table>
    <thead><tr>
      <th>Data</th><th>Tipo</th><th>Fonte/Destino</th><th>Descrição</th><th>Contraparte</th><th>Forma</th><th>Status</th><th>Comp.</th><th>Valor</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="9">Nenhum lançamento no filtro</td></tr>'}</tbody>
  </table>

  <p class="rodape">Relatório operacional da campanha · não substitui a prestação de contas oficial · ${esc(dataHoje())}</p>
</body>
</html>`
}

export function imprimirRelatorioTesouraria(opts) {
  const html = montarHtmlTesouraria(opts)
  const win = window.open('', '_blank', 'width=960,height=720')
  if (!win) return { ok: false, erro: 'popup' }
  try { win.opener = null } catch { /* ignore */ }
  win.document.open()
  win.document.write(html)
  win.document.close()
  const go = () => { try { win.focus(); win.print() } catch { /* ignore */ } }
  if (win.document.readyState === 'complete') setTimeout(go, 300)
  else {
    win.onload = () => setTimeout(go, 300)
    setTimeout(go, 700)
  }
  return { ok: true }
}
