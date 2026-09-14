/** Agrupa indicações e formata relatório de pendências de cadastro */

import {
  labelIndicacao, pendenciasCadastro, pctCadastro, checklistCadastroIndicacoes,
} from './equipeCadastro'
import { parseValor } from './equipeFinanceiro'
import { ehCargoSemRemuneracao } from './equipeSync'

/** Remuneração do membro (campo salário do cadastro). */
export function valorRemuneracaoMembro(m) {
  return parseValor(m?.salario)
}

function chaveIndicacao(membro, membros = []) {
  const mid = membro?.indicacaoMembroId
  if (mid && mid !== '__outro__') return `id:${mid}`
  const nome = labelIndicacao(membro, membros)
  if (nome) return `nome:${nome.toLowerCase()}`
  return ''
}

/** Lista quem indicou + indicados + telefone do indicador (quando for membro).
 *  Só remunerados — ignora Apoiador, Comunidade WhatsApp e formulário. */
export function listarIndicadores(membros = []) {
  const map = new Map()
  const operacionais = membros.filter(m => !ehCargoSemRemuneracao(m.cargo, m))

  for (const m of operacionais) {
    const key = chaveIndicacao(m, membros)
    if (!key) continue
    const nome = labelIndicacao(m, membros)
    if (!map.has(key)) {
      let telefone = ''
      let indicadorId = ''
      if (key.startsWith('id:')) {
        indicadorId = key.slice(3)
        const ref = membros.find(x => String(x.id) === String(indicadorId))
        telefone = String(ref?.telefone || '').trim()
      }
      map.set(key, {
        id: key,
        nome,
        indicadorId,
        telefone,
        indicados: [],
      })
    }
    map.get(key).indicados.push(m)
  }

  return [...map.values()]
    .map(g => {
      const comPend = g.indicados.filter(m => pendenciasCadastro(m, membros).length > 0)
      const valorTotal = g.indicados.reduce((acc, m) => acc + valorRemuneracaoMembro(m), 0)
      return {
        ...g,
        total: g.indicados.length,
        valorTotal,
        comPendencias: comPend.length,
        indicados: g.indicados
          .slice()
          .sort((a, b) => {
            const pa = pctCadastro(a, membros)
            const pb = pctCadastro(b, membros)
            if (pa !== pb) return pa - pb
            return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
          }),
      }
    })
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total
      if (b.valorTotal !== a.valorTotal) return b.valorTotal - a.valorTotal
      return a.nome.localeCompare(b.nome, 'pt-BR')
    })
}

export function filtrarIndicados(indicados = [], membros = [], { soPendencias = true } = {}) {
  const lista = soPendencias
    ? indicados.filter(m => pendenciasCadastro(m, membros).length > 0)
    : indicados.slice()
  return lista.sort((a, b) => {
    const pa = pctCadastro(a, membros)
    const pb = pctCadastro(b, membros)
    if (pa !== pb) return pa - pb
    return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
  })
}

function dataHoje() {
  return new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

/** Texto para WhatsApp / copiar — pedido de dados faltantes */
export function formatarMensagemPendencias({
  indicadorNome = '',
  indicados = [],
  membros = [],
  soPendencias = true,
} = {}) {
  const lista = filtrarIndicados(indicados, membros, { soPendencias })
  const primeiroNome = String(indicadorNome || '').trim().split(/\s+/)[0] || 'tudo bem'
  const linhas = []

  linhas.push(`Olá ${primeiroNome}, tudo bem?`)
  linhas.push('')
  if (lista.length === 0) {
    linhas.push('No momento não há pendências de cadastro nos indicados por você. Obrigado!')
    return linhas.join('\n')
  }

  linhas.push(
    soPendencias
      ? 'Segue a relação dos indicados por você que ainda precisam completar o cadastro. Pode me ajudar a solicitar esses dados?'
      : 'Segue a relação dos indicados por você e a situação do cadastro de cada um:'
  )
  linhas.push('')

  lista.forEach((m, i) => {
    const check = checklistCadastroIndicacoes(m, membros)
    const pend = check.filter(c => c.falta)
    const cargo = [m.cargo, m.vinculo].filter(Boolean).join(' · ')
    linhas.push(`${i + 1}. ${m.nome || '—'}${cargo ? ` (${cargo})` : ''}`)
    if (pend.length) {
      linhas.push('   Falta preencher:')
      pend.forEach(c => linhas.push(`   • ${c.label}`))
    } else {
      linhas.push('   Cadastro completo')
    }
    linhas.push('')
  })

  linhas.push('Quando tiver os dados, me avise para atualizarmos no sistema.')
  linhas.push('Obrigado!')
  return linhas.join('\n').trim()
}

/** Texto consolidado (vários indicadores) para cópia / PDF textual */
export function formatarRelatorioIndicacoesTexto({
  grupos = [],
  membros = [],
  soPendencias = true,
} = {}) {
  const linhas = []
  linhas.push('RELATÓRIO DE INDICAÇÕES — PENDÊNCIAS DE CADASTRO')
  linhas.push(`Data: ${dataHoje()}`)
  linhas.push('')

  let algum = false
  for (const g of grupos) {
    const lista = filtrarIndicados(g.indicados, membros, { soPendencias })
    if (!lista.length) continue
    algum = true
    linhas.push(`── Indicação de: ${g.nome} ──`)
    linhas.push(`Indicados nesta lista: ${lista.length}`)
    linhas.push('')
    lista.forEach((m, i) => {
      const check = checklistCadastroIndicacoes(m, membros)
      linhas.push(`${i + 1}. ${m.nome || '—'}`)
      check.forEach(c => {
        if (c.opcional && !c.valor) return
        linhas.push(`   ${c.label}: ${c.valor || 'FALTA'}`)
      })
      linhas.push('')
    })
    linhas.push('')
  }

  if (!algum) {
    linhas.push(soPendencias
      ? 'Nenhuma pendência encontrada para o filtro selecionado.'
      : 'Nenhum indicado encontrado para o filtro selecionado.')
  }

  return linhas.join('\n').trim()
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** HTML completo (fundo claro) para imprimir / salvar PDF numa janela nova */
export function montarHtmlImpressaoIndicacoes({
  grupos = [],
  membros = [],
  soPendencias = true,
  indicadorNome = '',
} = {}) {
  const blocos = []
  let total = 0
  let totalPend = 0

  for (const g of grupos) {
    const lista = filtrarIndicados(g.indicados, membros, { soPendencias })
    if (!lista.length) continue
    const mostrarTituloGrupo = !indicadorNome || grupos.length > 1
    if (mostrarTituloGrupo) {
      blocos.push(`<h2 class="grupo">Indicação de ${escHtml(g.nome)}</h2>`)
    }
    for (const m of lista) {
      total += 1
      const check = checklistCadastroIndicacoes(m, membros)
      const pend = check.filter(c => c.falta)
      if (pend.length) totalPend += 1
      const pct = pctCadastro(m, membros)
      const sub = [m.cargo, m.vinculo].filter(Boolean).join(' · ') || 'Sem cargo/vínculo'
      const rows = check
        .filter(c => !(c.opcional && !c.valor && !c.falta))
        .map(c => {
          const cls = c.falta ? 'falta' : 'ok-val'
          const val = c.falta ? 'FALTA' : (c.valor || '—')
          return `<tr class="${cls}"><td>${escHtml(c.label)}</td><td>${escHtml(val)}</td></tr>`
        })
        .join('')
      blocos.push(`
        <div class="ficha">
          <div class="ficha-top">
            <div>
              <p class="nome">${escHtml(m.nome || '—')}</p>
              <p class="meta">${escHtml(sub)}</p>
            </div>
            <span class="pct">${pct}%</span>
          </div>
          <table class="campos">
            <tbody>${rows}</tbody>
          </table>
          ${pend.length
            ? `<p class="resumo-falta">Solicitar: ${escHtml(pend.map(p => p.label).join(', '))}</p>`
            : `<p class="ok">Cadastro completo</p>`}
        </div>`)
    }
  }

  const subtitulo = indicadorNome
    ? `Indicador: ${escHtml(indicadorNome)}`
    : 'Todos os indicadores'
  const intro = soPendencias
    ? 'Solicitamos o preenchimento dos dados abaixo para completar o cadastro de cada indicado.'
    : 'Situação do cadastro dos indicados listados abaixo.'
  const corpo = blocos.length
    ? blocos.join('\n')
    : `<p class="vazio">${soPendencias
      ? 'Nenhuma pendência no filtro selecionado.'
      : 'Nenhum indicado no filtro selecionado.'}</p>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Relatório de Indicações</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
    color: #111;
    background: #fff;
    padding: 28px 32px;
    font-size: 13px;
    line-height: 1.45;
  }
  h1 { font-size: 18px; margin-bottom: 6px; }
  .meta-top { color: #555; font-size: 12px; margin-bottom: 10px; }
  .intro { color: #333; margin-bottom: 18px; font-size: 12px; }
  .grupo {
    font-size: 14px;
    margin: 18px 0 10px;
    padding-bottom: 4px;
    border-bottom: 1px solid #ddd;
    color: #854d0e;
  }
  .ficha {
    border: 1px solid #ccc;
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 10px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .ficha-top { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  .nome { font-weight: 700; font-size: 14px; }
  .meta { color: #555; font-size: 11px; margin-top: 2px; }
  .pct { color: #666; font-size: 11px; font-weight: 700; white-space: nowrap; }
  table.campos { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 11px; }
  table.campos td { padding: 4px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
  table.campos td:first-child { width: 38%; color: #555; font-weight: 600; }
  table.campos tr.falta td:last-child { color: #b45309; font-weight: 700; }
  table.campos tr.ok-val td:last-child { color: #111; }
  .resumo-falta {
    margin-top: 8px;
    font-size: 11px;
    color: #92400e;
    font-weight: 600;
  }
  .ok { margin-top: 8px; color: #047857; font-weight: 600; font-size: 11px; }
  .vazio { color: #666; }
  .rodape { margin-top: 16px; color: #666; font-size: 11px; }
  @media print {
    body { padding: 10mm; }
  }
</style>
</head>
<body>
  <h1>Relatório de Indicações — Pendências de Cadastro</h1>
  <p class="meta-top">${escHtml(dataHoje())} · ${subtitulo}</p>
  <p class="intro">${escHtml(intro)}</p>
  ${corpo}
  <p class="rodape">Total nesta lista: ${total}${soPendencias ? ` · ${totalPend} com pendências` : ''}</p>
</body>
</html>`
}

/** Abre janela e dispara impressão / Salvar como PDF */
export function imprimirRelatorioIndicacoes(opts) {
  const html = montarHtmlImpressaoIndicacoes(opts)
  // Não usar "noopener" aqui: o Chrome devolve null e impede document.write
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) {
    return { ok: false, erro: 'popup' }
  }
  try { win.opener = null } catch { /* ignore */ }
  win.document.open()
  win.document.write(html)
  win.document.close()
  // Aguarda o documento renderizar antes de imprimir
  const disparar = () => {
    try {
      win.focus()
      win.print()
    } catch { /* ignore */ }
  }
  if (win.document.readyState === 'complete') {
    setTimeout(disparar, 250)
  } else {
    win.onload = () => setTimeout(disparar, 250)
    setTimeout(disparar, 600)
  }
  return { ok: true }
}

export { dataHoje }
