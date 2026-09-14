/**
 * Radar Territorial — score 0–100 por bairro.
 * Combina tamanho do eleitorado, gap de resultado, déficit de equipe e seções sem voto.
 */
export function calcularRadarScore(resumoItem, maxAptos) {
  const r = resumoItem
  if (!r) return 0

  const aptos = Number(r.aptos || r.totalEleitores) || 0
  const aptosNorm = maxAptos > 0 ? aptos / maxAptos : 0

  const pct = r.pct ?? (aptos > 0 ? (r.votosObtidos / aptos) * 100 : 0)
  const gapResultado = Math.max(0, 1 - Math.min(pct / 12, 1))

  let deficitEquipe = 0
  if (r.pessoasMeta > 0) {
    deficitEquipe = Math.min(1, (Number(r.pessoasFaltamMeta) || 0) / Math.max(r.pessoasMeta, 1))
  } else if (r.semPessoas) {
    deficitEquipe = 0.65
  } else {
    deficitEquipe = 0.2
  }

  const secoes = Number(r.secoes) || 0
  const semVoto = Number(r.semVoto) || 0
  const urgenciaSemVoto = secoes > 0 ? semVoto / secoes : (semVoto > 0 ? 0.5 : 0)

  const raw =
    aptosNorm * 0.22 +
    gapResultado * 0.28 +
    deficitEquipe * 0.32 +
    urgenciaSemVoto * 0.18

  return Math.round(Math.min(100, Math.max(0, raw * 100)))
}

export function buildRadarMap(resumoMap) {
  const maxAptos = Math.max(
    1,
    ...Object.values(resumoMap).map(r => Number(r.aptos || r.totalEleitores) || 0),
  )
  const out = {}
  for (const [bairro, r] of Object.entries(resumoMap)) {
    out[bairro] = calcularRadarScore(r, maxAptos)
  }
  return out
}

function sugerirAcoes(r) {
  if (!r) return ['Revisar dados do bairro']
  const acoes = []
  if (Number(r.pessoasFaltamMeta) > 0) {
    acoes.push(`Reforçar equipe: faltam ${r.pessoasFaltamMeta} pessoa(s) para a meta`)
  } else if (r.semPessoas) {
    acoes.push('Cadastrar membros com atuação neste bairro')
  }
  if (Number(r.semVoto) > 0) {
    acoes.push(`Priorizar ${r.semVoto} seção(ões) ainda sem voto`)
  }
  const pct = r.pct ?? 0
  if (pct < 2 && (r.aptos || r.totalEleitores) > 800) {
    acoes.push('Eleitorado grande com baixo % — blitz de rua e igrejas')
  }
  if (Number(r.previsaoVotos) > 0 && Number(r.metaVotos) > 0 && r.previsaoVotos < r.metaVotos * 0.6) {
    acoes.push('Previsão abaixo de 60% da meta local — ajustar materiais e apoiadores')
  }
  if (!acoes.length) acoes.push('Manter presença e monitorar evolução semanal')
  return acoes.slice(0, 3)
}

/** Top bairros para o plano de ação da semana */
export function gerarPlanoAcao(resumoMap, radarMap, limit = 10) {
  return Object.entries(radarMap)
    .map(([bairro, score]) => ({
      bairro,
      score,
      resumo: resumoMap[bairro],
      acoes: sugerirAcoes(resumoMap[bairro]),
    }))
    .filter(row => row.resumo && (row.resumo.secoes > 0 || row.resumo.aptos > 0 || row.score >= 25))
    .sort((a, b) => b.score - a.score || (b.resumo?.aptos || 0) - (a.resumo?.aptos || 0))
    .slice(0, limit)
}

export function radarLabel(score) {
  if (score >= 75) return 'Crítico'
  if (score >= 55) return 'Alta'
  if (score >= 35) return 'Média'
  return 'Estável'
}
