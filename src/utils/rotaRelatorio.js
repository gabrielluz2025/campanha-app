import { fmtDataBR } from './rotaUtils'
import { resumoExecucao, detalheParada } from './rotaShare'

export function gerarRelatorioRotaTexto({
  rota = {},
  exec = null,
  paradas = [],
  membro = null,
} = {}) {
  const res = exec ? resumoExecucao(exec, paradas) : null
  const linhas = [
    `📋 Relatório — ${rota.nome || 'Rota'}`,
    `📅 ${fmtDataBR(rota.data)}`,
    membro?.nome ? `👤 ${membro.nome}` : '',
    '',
    res
      ? `✅ Visitadas: ${res.visitadas}/${paradas.length} (${res.pct ?? Math.round((res.visitadas / Math.max(1, paradas.length)) * 100)}%)`
      : `📍 Paradas: ${paradas.length}`,
    rota.status ? `Status: ${rota.status}` : '',
    rota.resultadoMotivo ? `Motivo: ${rota.resultadoMotivo}` : '',
    '',
    'Paradas:',
  ].filter(Boolean)

  for (let i = 0; i < paradas.length; i++) {
    const p = paradas[i]
    const st = exec ? (detalheParada(exec, p.key).status || 'pendente') : (p.status || 'pendente')
    const icon = st === 'concluido' ? '✓' : st === 'nao_visitou' ? '✗' : '○'
    linhas.push(`${icon} ${i + 1}. ${p.nome || p.key}${p.horaPrevista ? ` (${p.horaPrevista})` : ''}`)
  }

  linhas.push('', '— Campanha · Montar Rotas')
  return linhas.join('\n')
}

export function gerarRelatorioRotaWhatsApp(opts) {
  return gerarRelatorioRotaTexto(opts)
}

export async function copiarRelatorioRota(opts) {
  const txt = gerarRelatorioRotaTexto(opts)
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(txt)
    return true
  }
  return false
}

export function abrirWhatsAppRelatorio(opts, telefone = '') {
  const txt = encodeURIComponent(gerarRelatorioRotaTexto(opts))
  const tel = String(telefone || '').replace(/\D/g, '')
  const url = tel
    ? `https://wa.me/55${tel}?text=${txt}`
    : `https://wa.me/?text=${txt}`
  if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener')
}
