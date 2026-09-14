/** Relatório e impressão de rotas de campo */

import { isParadaEquipe, statusRotaMeta, fmtDataBR, labelTipoParada } from './rotaUtils'
import { cultoParaData, horaInicioCultoNaData } from './cultoParse'

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function dataHojeExtenso() {
  return new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

function horaAgora() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function stampRota(r) {
  return String(r?.data || '')
}

/** Monta endereço completo para impressão (rua, nº, bairro, CEP, cidade). */
export function formatarEnderecoParada(p) {
  if (!p || typeof p !== 'object') return '—'

  const cepRaw = String(p.cep || '').replace(/\D/g, '')
  const cepFmt = cepRaw.length === 8
    ? `${cepRaw.slice(0, 5)}-${cepRaw.slice(5)}`
    : String(p.cep || '').trim()

  const logradouro = String(p.logradouro || p.rua || '').trim()
  const numero = String(p.numero || p.num || '').trim()
  const complemento = String(p.complemento || '').trim()
  const bairro = String(p.bairro || '').trim()
  const setor = String(p.setor || '').trim()
  const cidade = String(p.cidade || '').trim()
  const uf = String(p.uf || p.estado || '').trim()
  const enderecoLivre = String(p.endereco || p.local || '').trim()

  const linhas = []

  // 1) Preferir partes estruturadas (apoiadores / cadastros com rua/nº)
  if (logradouro || numero) {
    let linha1 = logradouro
    if (numero) linha1 = linha1 ? `${linha1}, ${numero}` : `nº ${numero}`
    if (complemento) linha1 = `${linha1} — ${complemento}`
    linhas.push(linha1)
    const bair = bairro || setor
    if (bair) linhas.push(bair)
    const cidadeUf = [cidade || 'Blumenau', uf || 'SC'].filter(Boolean).join(' - ')
    if (cidadeUf) linhas.push(cidadeUf)
  } else if (enderecoLivre) {
    // 2) Endereço já montado (igrejas: "Rua X, 123 - Bairro, Cidade - UF")
    linhas.push(enderecoLivre)
    if (setor && !enderecoLivre.toLowerCase().includes(setor.toLowerCase())) {
      linhas.push(`Setor: ${setor}`)
    }
  } else if (bairro || setor) {
    linhas.push(bairro || setor)
    const cidadeUf = [cidade || 'Blumenau', uf || 'SC'].filter(Boolean).join(' - ')
    if (cidadeUf) linhas.push(cidadeUf)
  }

  if (cepFmt) {
    const jaTemCep = linhas.some(l => l.replace(/\D/g, '').includes(cepRaw) || /cep/i.test(l))
    if (!jaTemCep) linhas.push(`CEP ${cepFmt}`)
  }

  return linhas.length ? linhas.join('\n') : '—'
}

function enderecoHtmlParada(p) {
  const txt = formatarEnderecoParada(p)
  if (txt === '—') return '—'
  return escHtml(txt).replace(/\n/g, '<br/>')
}

export function filtrarRotasRelatorio(rotas = [], {
  membroId = '',
  dataDe = '',
  dataAte = '',
  status = '',
} = {}) {
  const mid = String(membroId || '').trim()
  const st = String(status || '').trim()
  const de = String(dataDe || '').slice(0, 10)
  const ate = String(dataAte || '').slice(0, 10)

  return (rotas || [])
    .filter(r => {
      if (!r) return false
      const data = stampRota(r)
      if (de && data < de) return false
      if (ate && data > ate) return false
      if (st && String(r.status || '') !== st) return false
      if (mid) {
        const resp = String(r.responsavelId || '')
        const eqs = (r.equipeIds || []).map(String)
        if (resp !== mid && !eqs.includes(mid)) return false
      }
      return true
    })
    .sort((a, b) => {
      const da = stampRota(b).localeCompare(stampRota(a))
      if (da) return da
      return String(b.atualizadoEm || '').localeCompare(String(a.atualizadoEm || ''))
    })
}

function labelMembro(id, membros = []) {
  const m = (membros || []).find(x => String(x.id) === String(id))
  return m?.nome || '—'
}

function paradasDaRota(rota) {
  return (rota?.paradas || []).filter(p => !isParadaEquipe(p))
}

function resumoFiltros({ membroId, dataDe, dataAte, status }, membros = []) {
  const bits = []
  if (dataDe || dataAte) {
    bits.push(`Período: ${dataDe ? fmtDataBR(dataDe) : '…'} → ${dataAte ? fmtDataBR(dataAte) : '…'}`)
  }
  if (membroId) bits.push(`Membro: ${labelMembro(membroId, membros)}`)
  if (status) bits.push(`Status: ${statusRotaMeta(status).label}`)
  if (!bits.length) bits.push('Todas as rotas')
  return bits.join(' · ')
}

function abrirHtml(html) {
  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank', 'width=980,height=740')
    if (!win) {
      URL.revokeObjectURL(url)
      return { ok: false, erro: 'popup' }
    }
    try { win.opener = null } catch { /* */ }
    setTimeout(() => URL.revokeObjectURL(url), 60000)
    return { ok: true }
  } catch {
    const win = window.open('', '_blank', 'width=980,height=740')
    if (!win) return { ok: false, erro: 'popup' }
    try { win.opener = null } catch { /* */ }
    win.document.open()
    win.document.write(html)
    win.document.close()
    return { ok: true }
  }
}

function cssBase() {
  return `
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 12mm 11mm 16mm;
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    color: #0f172a; background: #fff; font-size: 13px; line-height: 1.4;
  }
  .barra {
    position: sticky; top: 0; z-index: 5;
    display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
    margin: -12mm -11mm 12px; padding: 10px 12px;
    background: #0f172a; color: #e2e8f0;
  }
  .barra button {
    border: 0; border-radius: 8px; padding: 8px 14px;
    font-weight: 700; font-size: 13px; cursor: pointer;
  }
  .btn-print { background: #c9a227; color: #1a1408; }
  .btn-close { background: #334155; color: #e2e8f0; }
  .barra span { font-size: 12px; color: #94a3b8; }
  header {
    display: flex; justify-content: space-between; align-items: flex-end;
    gap: 12px; border-bottom: 2px solid #a8842e;
    padding-bottom: 8px; margin-bottom: 10px;
  }
  header h1 { margin: 0; font-size: 18px; }
  header .meta { text-align: right; color: #64748b; font-size: 11px; }
  .sub { margin: 0 0 14px; color: #475569; font-size: 12px; }
  .card {
    border: 1px solid #e2e8f0; border-radius: 10px;
    padding: 12px 14px; margin-bottom: 12px; break-inside: avoid;
  }
  .card h2 { margin: 0 0 6px; font-size: 14px; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 999px;
    font-size: 10px; font-weight: 700; margin-left: 6px;
    background: #f1f5f9; color: #334155;
  }
  .meta-line { color: #64748b; font-size: 11px; margin-bottom: 8px; }
  .motivo {
    background: #fff7ed; border-left: 3px solid #f59e0b;
    padding: 6px 8px; margin: 6px 0 8px; font-size: 12px;
  }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border-bottom: 1px solid #e2e8f0; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
  td.end { font-size: 11px; line-height: 1.35; max-width: 280px; }
  .kpi {
    display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 14px;
  }
  .kpi div {
    border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; min-width: 90px;
  }
  .kpi strong { display: block; font-size: 16px; }
  .kpi span { font-size: 10px; color: #64748b; text-transform: uppercase; }
  .rodape { margin-top: 16px; color: #94a3b8; font-size: 11px; }
  @media print {
    .barra { display: none !important; }
    body { padding: 8mm; }
  }`
}

function blocoRota(rota, membros = [], { detalheParadas = true } = {}) {
  const st = statusRotaMeta(rota.status)
  const pars = paradasDaRota(rota)
  const feitas = pars.filter(p => p.status === 'concluido').length
  const resp = labelMembro(rota.responsavelId, membros)
  const equipe = (rota.equipeIds || [])
    .map(id => labelMembro(id, membros))
    .filter(n => n && n !== '—')
  const rows = detalheParadas
    ? pars.map((p, i) => {
        const cultoTxt = p.culto ? cultoParaData(p.culto, rota.data) : ''
        const horaSug = p.horaPrevista || (p.culto ? horaInicioCultoNaData(p.culto, rota.data) : '') || '—'
        return `
        <tr>
          <td>${i + 1}</td>
          <td>${escHtml(p.nome || p.key || '—')}${cultoTxt ? `<br/><span style="color:#64748b;font-size:10px">⛪ ${escHtml(cultoTxt)}</span>` : ''}</td>
          <td>${escHtml(labelTipoParada(p.tipoParada))}</td>
          <td>${escHtml(horaSug)}${!p.horaPrevista && cultoTxt ? '<br/><span style="color:#64748b;font-size:9px">início culto</span>' : ''}</td>
          <td>${escHtml(p.status || 'pendente')}</td>
          <td class="end">${enderecoHtmlParada(p)}</td>
        </tr>`
      }).join('')
    : ''

  return `
  <section class="card">
    <h2>
      ${escHtml(rota.nome || 'Rota')}
      <span class="badge">${escHtml(st.label)}</span>
    </h2>
    <p class="meta-line">
      Data: <strong>${escHtml(fmtDataBR(rota.data))}</strong>
      · Responsável: <strong>${escHtml(resp)}</strong>
      ${equipe.length ? `· Equipe: ${escHtml(equipe.join(', '))}` : ''}
      · ${pars.length} parada${pars.length !== 1 ? 's' : ''}
      · ${feitas} concluída${feitas !== 1 ? 's' : ''}
    </p>
    ${rota.resultadoMotivo ? `<div class="motivo"><strong>Motivo / observação:</strong> ${escHtml(rota.resultadoMotivo)}</div>` : ''}
    ${detalheParadas && pars.length ? `
      <table>
        <thead>
          <tr>
            <th>#</th><th>Local</th><th>Tipo</th><th>Horário</th><th>Status</th><th>Endereço</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>` : (detalheParadas ? '<p class="meta-line">Sem paradas nesta rota.</p>' : '')}
  </section>`
}

export function imprimirRelatorioRotas({
  rotas = [],
  membros = [],
  filtros = {},
  titulo = 'Relatório de rotas',
} = {}) {
  const lista = filtrarRotasRelatorio(rotas, filtros)
  const totalParadas = lista.reduce((n, r) => n + paradasDaRota(r).length, 0)
  const concluidas = lista.filter(r => r.status === 'concluida').length
  const problemas = lista.filter(r => ['com_problema', 'nao_realizada', 'parcial'].includes(r.status)).length

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escHtml(titulo)}</title>
<style>${cssBase()}</style>
</head>
<body>
  <div class="barra">
    <button class="btn-print" onclick="window.print()">Imprimir / PDF</button>
    <button class="btn-close" onclick="window.close()">Fechar</button>
    <span>${escHtml(dataHojeExtenso())} · ${escHtml(horaAgora())}</span>
  </div>
  <header>
    <div>
      <h1>${escHtml(titulo)}</h1>
      <p class="sub">${escHtml(resumoFiltros(filtros, membros))}</p>
    </div>
    <div class="meta">Campanha · Sala de Comando<br/>Gerado em ${escHtml(dataHojeExtenso())}</div>
  </header>
  <div class="kpi">
    <div><strong>${lista.length}</strong><span>Rotas</span></div>
    <div><strong>${totalParadas}</strong><span>Paradas</span></div>
    <div><strong>${concluidas}</strong><span>Concluídas</span></div>
    <div><strong>${problemas}</strong><span>Parcial / problema</span></div>
  </div>
  ${lista.length
    ? lista.map(r => blocoRota(r, membros, { detalheParadas: true })).join('')
    : '<p class="sub">Nenhuma rota neste filtro.</p>'}
  <p class="rodape">Relatório de rotas · ${lista.length} registro${lista.length !== 1 ? 's' : ''}</p>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 350); };</script>
</body>
</html>`

  return abrirHtml(html)
}

export function imprimirRotaIndividual({
  rota,
  membros = [],
  paradasDetalhe = null,
} = {}) {
  if (!rota) return { ok: false, erro: 'sem_rota' }
  const enriquecida = paradasDetalhe
    ? { ...rota, paradas: paradasDetalhe }
    : rota
  const st = statusRotaMeta(rota.status)
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escHtml(rota.nome || 'Rota')}</title>
<style>${cssBase()}</style>
</head>
<body>
  <div class="barra">
    <button class="btn-print" onclick="window.print()">Imprimir / PDF</button>
    <button class="btn-close" onclick="window.close()">Fechar</button>
    <span>${escHtml(fmtDataBR(rota.data))} · ${escHtml(st.label)}</span>
  </div>
  <header>
    <div>
      <h1>Roteiro de campo</h1>
      <p class="sub">${escHtml(rota.nome || 'Rota')} · ${escHtml(fmtDataBR(rota.data))}</p>
    </div>
    <div class="meta">Campanha · Sala de Comando<br/>${escHtml(dataHojeExtenso())}</div>
  </header>
  ${blocoRota(enriquecida, membros, { detalheParadas: true })}
  <p class="rodape">Leve este roteiro no campo · confira horários e status das paradas</p>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 350); };</script>
</body>
</html>`
  return abrirHtml(html)
}
