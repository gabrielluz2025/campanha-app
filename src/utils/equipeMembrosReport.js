/** Relatório de membros remunerados — PDF/impressão e XLSX */

import { normalizarCargo } from './equipeSync'
import { labelIndicacao } from './equipeCadastro'
import { parseValor } from './equipeFinanceiro'
import { copiarTexto } from './equipeContratoReport'

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function dataHoje() {
  return new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

function bairrosAtuacao(m) {
  if (Array.isArray(m?.bairros)) return m.bairros.filter(Boolean).join(', ')
  return String(m?.bairros || m?.bairroAtuacao || '').trim()
}

function bairroMora(m) {
  return String(m?.bairroResidencia || '').trim()
}

function temVinculoIgrejaMembro(m) {
  return Boolean(
    m?.igrejaId != null
    || String(m?.igrejaNome || '').trim()
    || String(m?.cargoIgreja || '').trim()
    || normalizarCargo(m?.cargo) === 'Igreja',
  )
}

function valorOuTraco(v) {
  const s = String(v ?? '').trim()
  return s || '—'
}

/** Quem tem remuneração cadastrada (> 0). */
export function membroTemRemuneracao(m) {
  return parseValor(m?.salario) > 0
}

export function filtrarRemunerados(lista = []) {
  return (lista || []).filter(membroTemRemuneracao)
}

const CAMPOS_AMARELOS = new Set(['Telefone', 'Qual igreja'])

/** Campos do relatório de membros (PDF / impressão / texto). */
export function camposMembroCompleto(m, membros = []) {
  const igreja = String(m?.igrejaNome || '').trim()
  const deIgreja = temVinculoIgrejaMembro(m)
  const cargoIgreja = String(m?.cargoIgreja || '').trim()
  return [
    ['Telefone', valorOuTraco(m?.telefone)],
    ['Cargo', valorOuTraco(normalizarCargo(m?.cargo))],
    ['Bairro de atuação', valorOuTraco(bairrosAtuacao(m))],
    ['Bairro que mora', valorOuTraco(bairroMora(m))],
    ['É de igreja?', deIgreja ? 'Sim' : 'Não'],
    ['Qual igreja', deIgreja ? valorOuTraco(igreja) : '—'],
    ['Cargo na igreja', deIgreja ? valorOuTraco(cargoIgreja) : '—'],
    ['Indicado por', valorOuTraco(labelIndicacao(m, membros))],
  ]
}

export function ordenarMembros(lista = []) {
  return [...lista].sort((a, b) => {
    const ca = normalizarCargo(a?.cargo).localeCompare(normalizarCargo(b?.cargo), 'pt-BR')
    if (ca) return ca
    return String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR')
  })
}

export function formatarRelatorioMembrosTexto(membros = [], { titulo = 'RELATÓRIO DE MEMBROS' } = {}) {
  const lista = ordenarMembros(filtrarRemunerados(membros))
  const linhas = [
    titulo,
    dataHoje(),
    `Total: ${lista.length} membro${lista.length !== 1 ? 's' : ''} remunerado${lista.length !== 1 ? 's' : ''}`,
    '',
  ]
  lista.forEach((m, i) => {
    linhas.push(`${i + 1}. ${m.nome || 'Sem nome'}`)
    camposMembroCompleto(m, membros).forEach(([k, v]) => {
      linhas.push(`   ${k}: ${v}`)
    })
    linhas.push('')
  })
  return linhas.join('\n')
}

export function montarHtmlImpressaoMembros({
  membros = [],
  titulo = 'Relatório de Membros',
  subtitulo = '',
} = {}) {
  const lista = ordenarMembros(filtrarRemunerados(membros))
  const fichas = lista.map(m => {
    const rows = camposMembroCompleto(m, membros).map(([k, v]) => {
      const amarelo = CAMPOS_AMARELOS.has(k)
      return `<tr><td>${escHtml(k)}</td><td class="${amarelo ? 'amarelo' : ''}">${escHtml(v)}</td></tr>`
    }).join('')
    return `
      <div class="ficha">
        <div class="nome amarelo">${escHtml(m.nome || 'Sem nome')}</div>
        <table class="campos">${rows || '<tr><td colspan="2" class="vazio">Sem dados adicionais</td></tr>'}</table>
      </div>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escHtml(titulo)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
    color: #111; background: #fff;
    padding: 24px 28px; font-size: 13px; line-height: 1.45;
  }
  h1 { font-size: 18px; margin: 0 0 6px; }
  .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
  .ficha {
    border: 1px solid #ccc; border-radius: 8px;
    padding: 12px 14px; margin-bottom: 12px;
    page-break-inside: avoid; break-inside: avoid;
  }
  .nome {
    font-weight: 700; font-size: 15px; margin-bottom: 8px; color: #0f172a;
    padding: 4px 8px; border-radius: 4px;
  }
  table.campos { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.campos td { padding: 3px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
  table.campos td:first-child { width: 32%; color: #555; font-weight: 600; }
  .amarelo {
    background: #ffe566 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .vazio { color: #888; }
  .rodape { margin-top: 14px; color: #666; font-size: 11px; }
  @media print {
    body { padding: 8mm; }
    .no-print { display: none !important; }
    .amarelo {
      background: #ffe566 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style>
</head>
<body>
  <h1>${escHtml(titulo)}</h1>
  <p class="meta">${escHtml(dataHoje())}${subtitulo ? ` · ${escHtml(subtitulo)}` : ''} · ${lista.length} membro${lista.length !== 1 ? 's' : ''} remunerado${lista.length !== 1 ? 's' : ''}</p>
  ${fichas || '<p class="vazio">Nenhum membro remunerado neste filtro.</p>'}
  <p class="rodape">Gerado em ${escHtml(dataHoje())} · Campanha</p>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 300); };</script>
</body>
</html>`
}

export function imprimirRelatorioMembros(opts) {
  const html = montarHtmlImpressaoMembros(opts)
  // Blob URL evita about:blank em branco em alguns navegadores
  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank', 'width=960,height=720')
    if (!win) {
      URL.revokeObjectURL(url)
      return { ok: false, erro: 'popup' }
    }
    try { win.opener = null } catch { /* ignore */ }
    setTimeout(() => URL.revokeObjectURL(url), 60000)
    return { ok: true }
  } catch {
    const win = window.open('', '_blank', 'width=960,height=720')
    if (!win) return { ok: false, erro: 'popup' }
    try { win.opener = null } catch { /* ignore */ }
    win.document.open()
    win.document.write(html)
    win.document.close()
    return { ok: true }
  }
}

export async function baixarXlsxMembros(membros = [], { nomeArquivo } = {}) {
  const XLSX = await import('xlsx')
  const lista = ordenarMembros(filtrarRemunerados(membros))
  const colunas = [
    'Nome',
    'Telefone',
    'Cargo',
    'Bairro de atuacao',
    'Bairro que mora',
    'E de igreja',
    'Qual igreja',
    'Cargo na igreja',
    'Indicado por',
  ]
  const linhas = lista.map(m => {
    const deIgreja = temVinculoIgrejaMembro(m)
    return [
      m.nome || '',
      m.telefone || '',
      normalizarCargo(m.cargo),
      bairrosAtuacao(m),
      bairroMora(m),
      deIgreja ? 'Sim' : 'Nao',
      deIgreja ? (m.igrejaNome || '') : '',
      deIgreja ? (m.cargoIgreja || '') : '',
      labelIndicacao(m, membros),
    ]
  })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([colunas, ...linhas])
  ws['!cols'] = colunas.map((h, i) => {
    const maxLen = Math.min(48, Math.max(
      String(h).length,
      ...linhas.slice(0, 80).map(r => String(r[i] ?? '').length),
    ))
    return { wch: Math.max(10, maxLen + 2) }
  })
  XLSX.utils.book_append_sheet(wb, ws, 'Membros')

  // Resumo por cargo
  const porCargo = {}
  lista.forEach(m => {
    const c = normalizarCargo(m.cargo) || '—'
    porCargo[c] = (porCargo[c] || 0) + 1
  })
  const resumo = Object.entries(porCargo)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
  const ws2 = XLSX.utils.aoa_to_sheet([['Cargo', 'Quantidade'], ...resumo])
  ws2['!cols'] = [{ wch: 28 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Por cargo')

  const nome = (nomeArquivo || `equipe-membros-${new Date().toISOString().slice(0, 10)}`).replace(/\.xlsx$/i, '') + '.xlsx'
  XLSX.writeFile(wb, nome)
  return { ok: true, nome }
}

export { copiarTexto }
