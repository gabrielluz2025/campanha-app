import { radarLabel } from './eleitoralRadar'

function safeTxt(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E\n\r\t]/g, '?')
}

/**
 * Exporta plano territorial em PDF (A4).
 */
export async function exportarPlanoEleitoralPdf({
  planoAcao = [],
  totais = {},
  cidadeAtiva = 'BLUMENAU',
  candidato = '',
} = {}) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true })
  const pageW = pdf.internal.pageSize.getWidth()
  const margin = 14
  const maxW = pageW - margin * 2
  let y = margin

  const novaPagina = () => {
    pdf.addPage()
    y = margin
  }
  const precisa = (h) => {
    if (y + h > pdf.internal.pageSize.getHeight() - margin) novaPagina()
  }
  const linha = (txt, { size = 10, bold = false, gap = 1.4 } = {}) => {
    const t = safeTxt(txt)
    if (!t.trim()) { y += 2; return }
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(size)
    pdf.setTextColor(30, 30, 30)
    const lines = pdf.splitTextToSize(t, maxW)
    const lh = size * 0.45
    precisa(lines.length * lh + gap)
    pdf.text(lines, margin, y)
    y += lines.length * lh + gap
  }

  linha('Plano territorial — Radar Eleitoral', { size: 16, bold: true, gap: 2 })
  linha(`${cidadeAtiva} · ${new Date().toLocaleDateString('pt-BR')}`, { size: 10, gap: 1 })
  if (candidato) linha(`Candidato: ${candidato}`, { size: 10, gap: 2 })

  linha(
    `Votos: ${totais.votos ?? 0} · Radar médio: ${totais.radarMedio ?? 0} · Críticos: ${totais.criticos ?? 0} · Sem voto: ${totais.semVoto ?? 0}`,
    { size: 9, gap: 3 },
  )

  pdf.setDrawColor(200, 200, 200)
  precisa(2)
  pdf.line(margin, y, pageW - margin, y)
  y += 5

  if (!planoAcao.length) {
    linha('Nenhuma prioridade calculada. Importe o PDF do TRE na aba Eleitores.', { size: 10 })
  }

  planoAcao.forEach((p, idx) => {
    linha(
      `${idx + 1}. ${p.bairro} — Radar ${p.score}/100 (${radarLabel(p.score)})`,
      { size: 11, bold: true, gap: 0.8 },
    )
    if (p.resumo) {
      linha(
        `   Votos: ${p.resumo.votosObtidos ?? 0} · Seções: ${p.resumo.secoes ?? 0} · Sem voto: ${p.resumo.semVoto ?? 0}`,
        { size: 9, gap: 0.6 },
      )
    }
    for (const ac of p.acoes || []) {
      linha(`   • ${ac}`, { size: 9, gap: 0.5 })
    }
    y += 1.5
  })

  y += 4
  linha('Gerado em campanha.space', { size: 8, gap: 0 })

  const slug = cidadeAtiva.replace(/\s+/g, '-').toLowerCase()
  pdf.save(`plano-territorial-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`)
}
