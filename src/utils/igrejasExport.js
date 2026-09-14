/** Exportação do cadastro completo de igrejas — TXT e planilha Excel. */

import { resolverCultoIgreja } from './cultoParse'
import { eIgrejaAdblu } from './igrejasAdbluNome'
import { igrejaSemCep } from './igrejasImportConsolidado'
import { igrejaSemPinMapa } from './igrejasGeocodeFix'
import { formatarCep } from './agendaLocal'

export const IGREJAS_EXPORT_COLUNAS = [
  'ID',
  'Nome',
  'Denominação',
  'Setor / Bairro',
  'Endereço completo',
  'Logradouro',
  'Número',
  'Complemento',
  'CEP',
  'Cidade',
  'UF',
  'Latitude',
  'Longitude',
  'GPS no mapa',
  'Culto',
  'Pastor 1',
  'Esposa 1',
  'Pastor 2',
  'Esposa 2',
  'Telefone',
  'WhatsApp',
  'Site',
  'Instagram',
  'Facebook',
  'Google Maps',
  'Visitado',
  'Data última visita',
  'Quem visitou',
  'Vezes visitado',
  'Histórico de visitas',
  'Prioridade',
  'Nota interna',
  'Avaliação Google',
  'Foto',
  'OSM ID',
  'ADBLU',
  'Congregação ADBLU',
  'Fonte cadastro',
]

function dataHoje() {
  return new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

function stampArquivo() {
  return new Date().toISOString().slice(0, 10)
}

function cel(v) {
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  return String(v).trim()
}

function fmtCoord(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return ''
  return x.toFixed(6)
}

function resumoVisitaExport(ig) {
  const v = ig?.visita
  const historico = Array.isArray(v?.historico) ? v.historico : []
  const ultima = historico[0] || (v?.data ? v : null)
  const visitantesUltima = ultima
    ? (Array.isArray(ultima.visitantes) && ultima.visitantes.length
      ? ultima.visitantes
      : [ultima.visitadoPor].filter(Boolean))
    : []
  const historicoTxt = historico.length
    ? historico.map((h) => {
      const quem = Array.isArray(h.visitantes) && h.visitantes.length
        ? h.visitantes.join(', ')
        : (h.visitadoPor || '—')
      const obs = h.observacao ? ` — ${h.observacao}` : ''
      return `${h.data || '?'}: ${quem}${obs}`
    }).join(' | ')
    : ''
  return {
    visitado: ig?.visitado ? 'Sim' : 'Não',
    dataUltima: ultima?.data || '',
    quemVisitou: visitantesUltima.join('; '),
    vezes: historico.length || Number(v?.vezes) || 0,
    historico: historicoTxt,
  }
}

function fonteCadastroIgreja(ig) {
  const partes = [
    ig?.fonte,
    ig?.fontePlanilha,
    ig?.importPlanilha,
    ig?.cadastroOrigem,
  ].map((s) => String(s || '').trim()).filter(Boolean)
  return partes.join(' · ') || (Number(ig?.id) <= 88 ? 'Catálogo ADBLU' : 'Cadastro manual')
}

/** Uma linha da planilha (mesma ordem de IGREJAS_EXPORT_COLUNAS). */
export function igrejaParaLinhaExport(ig) {
  if (!ig) return IGREJAS_EXPORT_COLUNAS.map(() => '')
  const vis = resumoVisitaExport(ig)
  const culto = resolverCultoIgreja(ig) || ig.culto || ''
  const gpsOk = !igrejaSemPinMapa(ig)
  return [
    ig.id,
    ig.nome,
    ig.denominacao,
    ig.setor || ig.bairro,
    ig.endereco,
    ig.logradouro || ig.rua,
    ig.numero,
    ig.complemento,
    formatarCep(ig.cep) || ig.cep,
    ig.cidade || 'Blumenau',
    ig.uf || 'SC',
    fmtCoord(ig.lat),
    fmtCoord(ig.lng),
    gpsOk ? 'Sim' : 'Não',
    culto,
    ig.pastor1,
    ig.esposa1,
    ig.pastor2,
    ig.esposa2,
    ig.telefone,
    ig.whatsapp,
    ig.website,
    ig.instagram,
    ig.facebook,
    ig.mapsUrl,
    vis.visitado,
    vis.dataUltima,
    vis.quemVisitou,
    vis.vezes || '',
    vis.historico,
    ig.prioridade,
    ig.nota,
    ig.rating ?? '',
    ig.foto,
    ig.osmId ?? '',
    eIgrejaAdblu(ig) ? 'Sim' : 'Não',
    ig.congregacaoAdblu || '',
    fonteCadastroIgreja(ig),
  ].map(cel)
}

/** Texto completo — uma ficha por bloco. */
export function formatarCatalogoIgrejasTexto(igrejas = [], { titulo = 'Cadastro de Igrejas — Sistema de Campanha' } = {}) {
  const lista = [...(igrejas || [])].sort((a, b) =>
    String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR'),
  )
  const visitadas = lista.filter((i) => i.visitado).length
  const semGps = lista.filter(igrejaSemPinMapa).length
  const semCep = lista.filter((i) => igrejaSemCep(i)).length

  const linhas = [
    titulo,
    `Exportado em: ${dataHoje()}`,
    `Total: ${lista.length} igreja(s) · ${visitadas} visitada(s) · ${semGps} sem GPS · ${semCep} sem CEP`,
    '',
    '='.repeat(72),
    '',
  ]

  lista.forEach((ig, idx) => {
    const cols = IGREJAS_EXPORT_COLUNAS
    const vals = igrejaParaLinhaExport(ig)
    linhas.push(`${idx + 1}. ${ig.nome || 'Sem nome'} (ID ${ig.id})`)
    cols.forEach((col, i) => {
      const v = vals[i]
      if (v) linhas.push(`   ${col}: ${v}`)
    })
    linhas.push('')
    linhas.push('-'.repeat(72))
    linhas.push('')
  })

  return linhas.join('\n').trim()
}

function downloadBlob(conteudo, nomeArquivo, mime) {
  const blob = new Blob([conteudo], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Baixa .txt com todas as igrejas. */
export function exportarCatalogoIgrejasTxt(igrejas = [], nomeArquivo) {
  const lista = Array.isArray(igrejas) ? igrejas : []
  if (!lista.length) return { ok: false, erro: 'Nenhuma igreja no cadastro.' }
  const nome = (nomeArquivo || `igrejas-campanha-${stampArquivo()}`).replace(/\.txt$/i, '') + '.txt'
  const texto = formatarCatalogoIgrejasTexto(lista)
  downloadBlob(texto, nome, 'text/plain;charset=utf-8')
  return { ok: true, nome, total: lista.length }
}

/** Baixa .xlsx com aba de detalhes + resumo. */
export async function exportarCatalogoIgrejasXlsx(igrejas = [], nomeArquivo) {
  const lista = [...(igrejas || [])].sort((a, b) =>
    String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR'),
  )
  if (!lista.length) return { ok: false, erro: 'Nenhuma igreja no cadastro.' }

  const XLSX = await import('xlsx')
  const linhas = lista.map(igrejaParaLinhaExport)
  const wb = XLSX.utils.book_new()

  const ws = XLSX.utils.aoa_to_sheet([IGREJAS_EXPORT_COLUNAS, ...linhas])
  ws['!cols'] = IGREJAS_EXPORT_COLUNAS.map((h, i) => {
    const maxLen = Math.min(52, Math.max(
      String(h).length,
      ...linhas.slice(0, 100).map((r) => String(r[i] ?? '').length),
    ))
    return { wch: Math.max(8, maxLen + 1) }
  })
  XLSX.utils.book_append_sheet(wb, ws, 'Igrejas')

  const visitadas = lista.filter((i) => i.visitado).length
  const semGps = lista.filter(igrejaSemPinMapa).length
  const semCep = lista.filter((i) => igrejaSemCep(i)).length
  const adblu = lista.filter((i) => eIgrejaAdblu(i)).length
  const resumo = [
    ['Indicador', 'Quantidade'],
    ['Total de igrejas', lista.length],
    ['Visitadas', visitadas],
    ['Pendentes de visita', lista.length - visitadas],
    ['Sem pin no mapa', semGps],
    ['Sem CEP', semCep],
    ['ADBLU / Assembleia', adblu],
    ['Exportado em', dataHoje()],
  ]
  const wsResumo = XLSX.utils.aoa_to_sheet(resumo)
  wsResumo['!cols'] = [{ wch: 28 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo')

  const nome = (nomeArquivo || `igrejas-campanha-${stampArquivo()}`).replace(/\.xlsx$/i, '') + '.xlsx'
  XLSX.writeFile(wb, nome)
  return { ok: true, nome, total: lista.length }
}
