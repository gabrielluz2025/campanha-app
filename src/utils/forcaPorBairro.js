import { bairroCanon, isZonaBlumenau, normalizarBairro } from './bairroMapa'
import { bairrosDoMembro } from './rotaUtils'
import {
  BAIRROS_BLUMENAU,
  ELEITORES_POR_BAIRRO,
  ELEITORES_RESIDENCIAIS_POR_BAIRRO,
  eleitoresDoBairro,
  eleitoresBairroEhEstimado,
} from './constants'
import { resolveBairroVotacao, getColegioNorms } from './eleitoresHelpers'

/** Só aceita bairros oficiais de Blumenau (ignora Margem Esquerda, igrejas, etc.). */
export function bairroBlumenauValido(nome) {
  const raw = String(nome || '').trim()
  if (!raw) return null
  const canon = bairroCanon(raw)
  if (canon && BAIRROS_BLUMENAU.includes(canon)) return canon
  const norm = normalizarBairro(raw)
  if (norm && BAIRROS_BLUMENAU.includes(norm)) return norm
  return null
}

function rankingBlumenau(map, limite = 35) {
  const rows = BAIRROS_BLUMENAU.map(nome => ({
    nome,
    qtd: map.get(nome) || 0,
  })).sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome, 'pt-BR'))
  if (limite >= BAIRROS_BLUMENAU.length) return rows
  return rows.slice(0, limite)
}

function resumoEquipe(map, membrosLen, foraBlumenau = 0) {
  const cobertosSet = new Set(
    BAIRROS_BLUMENAU.filter(b => (map.get(b) || 0) > 0),
  )
  const descobertosNomes = BAIRROS_BLUMENAU.filter(b => !cobertosSet.has(b))
  const totalMarcacoes = BAIRROS_BLUMENAU.reduce((s, b) => s + (map.get(b) || 0), 0)
  return {
    ranking: rankingBlumenau(map, 35),
    bairrosCobertos: cobertosSet.size,
    bairrosDescobertos: descobertosNomes.length,
    descobertosNomes,
    totalMembros: membrosLen,
    totalMarcacoes,
    semBairro: map.get('Sem bairro') || 0,
    foraBlumenau,
  }
}

/** Conta membros da equipe por bairro de atuação (cada bairro do membro conta +1). */
export function forcaEquipePorAtuacao(membros = []) {
  const map = new Map()
  let foraBlumenau = 0
  for (const m of membros || []) {
    const bairros = bairrosDoMembro(m)
    if (!bairros.length) {
      map.set('Sem bairro', (map.get('Sem bairro') || 0) + 1)
      continue
    }
    const vistos = new Set()
    let algumValido = false
    for (const b of bairros) {
      const nome = bairroBlumenauValido(b)
      if (!nome) continue
      algumValido = true
      if (vistos.has(nome)) continue
      vistos.add(nome)
      map.set(nome, (map.get(nome) || 0) + 1)
    }
    if (!algumValido) foraBlumenau += 1
  }
  return resumoEquipe(map, (membros || []).length, foraBlumenau)
}

/** Conta membros da equipe por bairro de moradia (residência). */
export function forcaEquipePorMoradia(membros = []) {
  const map = new Map()
  let foraBlumenau = 0
  for (const m of membros || []) {
    const resid = String(m?.bairroResidencia || '').trim()
    if (!resid) {
      map.set('Sem bairro', (map.get('Sem bairro') || 0) + 1)
      continue
    }
    const nome = bairroBlumenauValido(resid)
    if (!nome) {
      foraBlumenau += 1
      continue
    }
    map.set(nome, (map.get(nome) || 0) + 1)
  }
  return resumoEquipe(map, (membros || []).length, foraBlumenau)
}

/**
 * Cobertura do eleitorado por bairro (votos importados / aptos TRE).
 * Bairros "descobertos" = têm eleitores estimados, mas sem seção/colégio TRE próprio.
 */
export function coberturaEleitoradoPorBairro(dadosEleitores) {
  const treCtx = { colegioNorms: getColegioNorms() }
  const votosPorBairro = Object.fromEntries(BAIRROS_BLUMENAU.map(b => [b, 0]))
  const secoesPorBairro = Object.fromEntries(BAIRROS_BLUMENAU.map(b => [b, 0]))
  let totalVotos = 0
  let secoesMapeadas = 0
  let secoesSemBairro = 0

  if (dadosEleitores?.zonas) {
    dadosEleitores.zonas
      .filter(z => isZonaBlumenau(z, dadosEleitores))
      .forEach(z => {
        ;(z.locais || []).forEach(l => {
          const bairro = resolveBairroVotacao(l, z, dadosEleitores, treCtx)
          const secoes = l.secoes || []
          secoes.forEach(s => {
            const v = Number(s.votos) || 0
            totalVotos += v
            if (!bairro || votosPorBairro[bairro] === undefined) {
              secoesSemBairro += 1
              return
            }
            votosPorBairro[bairro] += v
            secoesPorBairro[bairro] += 1
            secoesMapeadas += 1
          })
        })
      })
  }

  if (!totalVotos && Number(dadosEleitores?.votosTotal) > 0) {
    totalVotos = Number(dadosEleitores.votosTotal)
  }

  const comSecaoNomes = Object.keys(ELEITORES_POR_BAIRRO).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const semSecaoNomes = Object.keys(ELEITORES_RESIDENCIAIS_POR_BAIRRO).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  let totalAptos = 0
  let aptosComSecao = 0
  let aptosSemSecao = 0
  const porBairro = BAIRROS_BLUMENAU.map(nome => {
    const aptos = eleitoresDoBairro(nome) || 0
    totalAptos += aptos
    const votos = votosPorBairro[nome] || 0
    const secoes = secoesPorBairro[nome] || 0
    const temSecao = !!ELEITORES_POR_BAIRRO[nome]
    const estimado = eleitoresBairroEhEstimado(nome)
    if (temSecao) aptosComSecao += aptos
    else aptosSemSecao += aptos
    const pct = aptos > 0 ? Math.round((votos / aptos) * 1000) / 10 : 0
    return {
      nome,
      qtd: pct,
      votos,
      aptos,
      secoes,
      temSecao,
      estimado,
    }
  })

  const comVotos = porBairro.filter(b => b.temSecao && (b.votos > 0 || b.secoes > 0))
  const ranking = (comVotos.length
    ? [...comVotos].sort((a, b) => b.qtd - a.qtd || b.votos - a.votos)
    : [...porBairro].filter(b => b.temSecao).sort((a, b) => b.aptos - a.aptos).map(b => ({ ...b, qtd: 0 }))
  )

  const coberturaPct = totalAptos > 0
    ? Math.round((totalVotos / totalAptos) * 1000) / 10
    : 0

  const semSecaoDetalhe = semSecaoNomes
    .map(nome => ({
      nome,
      aptos: ELEITORES_RESIDENCIAIS_POR_BAIRRO[nome] || 0,
    }))
    .sort((a, b) => b.aptos - a.aptos)

  return {
    coberturaPct,
    totalVotos,
    totalAptos,
    aptosComSecao,
    aptosSemSecao,
    bairrosComSecao: comSecaoNomes.length,
    bairrosSemSecao: semSecaoNomes.length,
    bairrosTotal: BAIRROS_BLUMENAU.length,
    bairrosComVotos: comVotos.length,
    secoesMapeadas,
    secoesSemBairro,
    comSecaoNomes,
    semSecaoNomes,
    semSecaoDetalhe,
    ranking,
    porBairro,
  }
}

/** Premissa de planejamento: cada membro da equipe consegue N votos. */
export const VOTOS_POR_MEMBRO = 50
export const VOTOS_POR_MEMBRO_OPCOES = [50, 100, 150, 200]

/** Cada apoiador da rede (formulário / manual) = até 5 votos (casa). */
export const VOTOS_POR_APOIADOR = 5

/**
 * Membro “leve” da rede (formulário / Comunidade WhatsApp):
 * conta só até 5 votos — NÃO entra no multiplicador da equipe (50–200).
 */
export function ehMembroRedeLeve(m) {
  if (!m || typeof m !== 'object') return false
  if (m.origem === 'cadastro_publico') return true
  if (String(m.id || '').startsWith('lead-')) return true
  if (m.apoiadorRedeId && String(m.apoiadorRedeId).startsWith('lead-')) return true
  const cargo = String(m.cargo || '').trim()
  if (cargo === 'Comunidade WhatsApp') return true
  return false
}

/** Equipe operacional (previsão × votosPorMembro). */
export function membrosOperacionais(membros = []) {
  return (membros || []).filter(m => !ehMembroRedeLeve(m))
}

/**
 * Apoiadores que entram na previsão ×5.
 * Exclui origem "equipe" (já contam como membro operacional / Apoiador).
 */
export function apoiadoresParaPrevisao(apoiadores = []) {
  return (apoiadores || []).filter(a => a && a.origem !== 'equipe')
}

/**
 * Conta apoiadores por bairro (Blumenau) e soma votos estimados.
 * @returns {{ map: Map<string, number>, votosMap: Map<string, number>, total: number, votosTotal: number, foraBlumenau: number }}
 */
export function forcaApoiadoresPorBairro(apoiadores = [], votosPorApoiador = VOTOS_POR_APOIADOR) {
  const map = new Map()
  const votosMap = new Map()
  let foraBlumenau = 0
  let total = 0
  let votosTotal = 0
  const cap = Math.max(1, Number(votosPorApoiador) || VOTOS_POR_APOIADOR)

  for (const a of apoiadores || []) {
    if (!a || typeof a !== 'object') continue
    total += 1
    const rawVotos = Number(a.votosEstimados)
    const votos = Number.isFinite(rawVotos) && rawVotos > 0
      ? Math.min(cap, Math.round(rawVotos))
      : cap
    const nome = bairroBlumenauValido(a.bairro) || bairroBlumenauValido(a.cidade)
    if (!nome) {
      foraBlumenau += 1
      votosTotal += votos
      continue
    }
    map.set(nome, (map.get(nome) || 0) + 1)
    votosMap.set(nome, (votosMap.get(nome) || 0) + votos)
    votosTotal += votos
  }
  return { map, votosMap, total, votosTotal, foraBlumenau }
}

/**
 * Meta do bairro proporcional aos aptos + pessoas necessárias (manter votos / atingir meta).
 * `pessoasTem` = membros operacionais com atuação no bairro.
 * `previsaoVotos` = (pessoas × votosPorMembro) + votos dos apoiadores da rede (até 5 cada).
 */
export function planejamentoEquipePorBairro(lista = [], {
  metaVotos = 0,
  votosPorMembro = VOTOS_POR_MEMBRO,
  pessoasTemTotal = 0,
  apoiadoresPorBairro = null,
  votosApoiadoresPorBairro = null,
  votosApoiadoresTotal = 0,
  votosPorApoiador = VOTOS_POR_APOIADOR,
} = {}) {
  const vpm = Math.max(1, Number(votosPorMembro) || VOTOS_POR_MEMBRO)
  const vpa = Math.max(1, Number(votosPorApoiador) || VOTOS_POR_APOIADOR)
  const meta = Math.max(0, Number(metaVotos) || 0)
  const totalAptos = lista.reduce((s, b) => s + (Number(b.aptos) || 0), 0)
  const totalVotos = lista.reduce((s, b) => s + (Number(b.votos) || 0), 0)

  const enriquecida = lista.map(b => {
    const aptos = Number(b.aptos) || 0
    const votos = Number(b.votos) || 0
    const tem = Number(b.atuacao) || 0
    const metaBairro = meta > 0 && totalAptos > 0
      ? Math.round(meta * (aptos / totalAptos))
      : 0
    const apQtd = apoiadoresPorBairro
      ? (Number(apoiadoresPorBairro[b.nome]) || 0)
      : (Number(b.apoiadores) || 0)
    const votosAp = votosApoiadoresPorBairro
      ? (Number(votosApoiadoresPorBairro[b.nome]) || 0)
      : (Number(b.votosApoiadores) || apQtd * vpa)
    // Pessoas necessárias já descontando votos da rede (×5)
    const pessoasManter = Math.ceil(Math.max(0, votos - votosAp) / vpm)
    const pessoasMeta = Math.ceil(Math.max(0, metaBairro - votosAp) / vpm)
    const previsaoEquipe = tem * vpm
    const previsaoVotos = previsaoEquipe + votosAp
    return {
      ...b,
      metaVotos: metaBairro,
      pessoasManter,
      pessoasMeta,
      pessoasTem: tem,
      pessoasFaltamManter: Math.max(0, pessoasManter - tem),
      pessoasFaltamMeta: Math.max(0, pessoasMeta - tem),
      apoiadores: apQtd,
      votosApoiadores: votosAp,
      previsaoEquipe,
      previsaoVotos,
      previsaoPctMeta: metaBairro > 0 ? Math.min(999, (previsaoVotos / metaBairro) * 100) : 0,
      cobertoMeta: metaBairro > 0 && previsaoVotos >= metaBairro,
    }
  })

  const votosApTotal = Number(votosApoiadoresTotal) > 0
    ? Number(votosApoiadoresTotal)
    : enriquecida.reduce((s, b) => s + (Number(b.votosApoiadores) || 0), 0)
  const pessoasManter = Math.ceil(Math.max(0, totalVotos - votosApTotal) / vpm)
  const pessoasMeta = Math.ceil(Math.max(0, meta - votosApTotal) / vpm)
  const tem = Math.max(0, Number(pessoasTemTotal) || 0)
  const previsaoEquipe = tem * vpm
  const previsaoVotos = previsaoEquipe + votosApTotal
  const previsaoPctMeta = meta > 0 ? Math.min(999, (previsaoVotos / meta) * 100) : 0

  return {
    votosPorMembro: vpm,
    votosPorApoiador: vpa,
    metaVotos: meta,
    totalAptos,
    totalVotos,
    pessoasManter,
    pessoasMeta,
    pessoasTem: tem,
    pessoasFaltamManter: Math.max(0, pessoasManter - tem),
    pessoasFaltamMeta: Math.max(0, pessoasMeta - tem),
    apoiadoresTotal: enriquecida.reduce((s, b) => s + (Number(b.apoiadores) || 0), 0),
    votosApoiadores: votosApTotal,
    previsaoEquipe,
    previsaoVotos,
    previsaoPctMeta,
    previsaoFaltamVotos: Math.max(0, meta - previsaoVotos),
    lista: enriquecida,
  }
}

/**
 * Visão unificada: quantidade por bairro (aptos, votos, atuação, moradia, materiais, apoiadores).
 * Previsão: equipe operacional × VPM + rede (formulário/manual) × até 5 — sem contagem dupla.
 */
export function quantidadePorBairro({
  membros = [],
  materiais = [],
  dadosEleitores = null,
  metaVotos = 0,
  votosPorMembro = VOTOS_POR_MEMBRO,
  apoiadores = [],
  votosPorApoiador = VOTOS_POR_APOIADOR,
} = {}) {
  const el = coberturaEleitoradoPorBairro(dadosEleitores)
  const membrosVpm = membrosOperacionais(membros)
  const apoiadoresPrev = apoiadoresParaPrevisao(apoiadores)
  const at = forcaEquipePorAtuacao(membrosVpm)
  const mo = forcaEquipePorMoradia(membros)
  const ap = forcaApoiadoresPorBairro(apoiadoresPrev, votosPorApoiador)

  const atuacaoMap = Object.fromEntries((at.ranking || []).map(r => [r.nome, r.qtd]))
  const moradiaMap = Object.fromEntries((mo.ranking || []).map(r => [r.nome, r.qtd]))
  const materialMap = new Map()
  for (const r of materiais || []) {
    const nome = bairroBlumenauValido(r.nome)
    if (!nome) continue
    materialMap.set(nome, (materialMap.get(nome) || 0) + (Number(r.qtd) || 0))
  }
  const elMap = Object.fromEntries((el.porBairro || []).map(r => [r.nome, r]))
  const apoiadoresPorBairro = Object.fromEntries([...ap.map.entries()])
  const votosApoiadoresPorBairro = Object.fromEntries([...ap.votosMap.entries()])

  const listaBase = BAIRROS_BLUMENAU.map(nome => {
    const e = elMap[nome] || {}
    const atuacao = atuacaoMap[nome] || 0
    const moradia = moradiaMap[nome] || 0
    const materiaisQtd = materialMap.get(nome) || 0
    return {
      nome,
      aptos: e.aptos || 0,
      votos: e.votos || 0,
      cobertura: e.qtd || 0,
      secoes: e.secoes || 0,
      temSecao: !!e.temSecao,
      estimado: !!e.estimado,
      atuacao,
      moradia,
      materiais: materiaisQtd,
      apoiadores: apoiadoresPorBairro[nome] || 0,
      votosApoiadores: votosApoiadoresPorBairro[nome] || 0,
      qtd: e.aptos || 0,
    }
  })

  const plano = planejamentoEquipePorBairro(listaBase, {
    metaVotos,
    votosPorMembro,
    pessoasTemTotal: at.totalMembros || 0,
    apoiadoresPorBairro,
    votosApoiadoresPorBairro,
    votosApoiadoresTotal: ap.votosTotal,
    votosPorApoiador,
  })

  const lista = plano.lista
  const comAtuacao = lista.filter(b => b.atuacao > 0).length
  const comMoradia = lista.filter(b => b.moradia > 0).length
  const comMaterial = lista.filter(b => b.materiais > 0).length
  const comVotos = lista.filter(b => b.votos > 0).length
  const comApoiadores = lista.filter(b => b.apoiadores > 0).length

  return {
    total: BAIRROS_BLUMENAU.length,
    comSecao: el.bairrosComSecao,
    semSecao: el.bairrosSemSecao,
    comAtuacao,
    comMoradia,
    comMaterial,
    comVotos,
    comApoiadores,
    membrosOperacionais: membrosVpm.length,
    membrosRedeLeve: Math.max(0, (membros || []).length - membrosVpm.length),
    lista,
    planejamento: {
      votosPorMembro: plano.votosPorMembro,
      votosPorApoiador: plano.votosPorApoiador,
      metaVotos: plano.metaVotos,
      totalAptos: plano.totalAptos,
      totalVotos: plano.totalVotos,
      pessoasManter: plano.pessoasManter,
      pessoasMeta: plano.pessoasMeta,
      pessoasTem: plano.pessoasTem,
      pessoasFaltamManter: plano.pessoasFaltamManter,
      pessoasFaltamMeta: plano.pessoasFaltamMeta,
      apoiadoresTotal: plano.apoiadoresTotal,
      votosApoiadores: plano.votosApoiadores,
      previsaoEquipe: plano.previsaoEquipe,
      previsaoVotos: plano.previsaoVotos,
      previsaoPctMeta: plano.previsaoPctMeta,
      previsaoFaltamVotos: plano.previsaoFaltamVotos,
    },
  }
}
