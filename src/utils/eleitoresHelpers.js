import { normStr, BAIRROS_BLUMENAU, COLEGIO_BAIRRO } from './constants'
import { normalizarBairro } from './bairroMapa'

export const CARGOS_ESTADUAIS = [
  'DEPUTADO FEDERAL', 'DEPUTADO ESTADUAL', 'SENADOR', 'GOVERNADOR', 'PRESIDENTE',
]

export const CARGOS_MUNICIPAIS = [
  'VEREADOR', 'PREFEITO', 'VICE-PREFEITO', 'VICE PREFEITO',
]

export function isCargoEstadual(cargo) {
  const c = (cargo || '').toUpperCase().trim()
  return CARGOS_ESTADUAIS.some(x => c.includes(x))
}

export function isCargoMunicipal(cargo) {
  const c = (cargo || '').toUpperCase().trim()
  return CARGOS_MUNICIPAIS.some(x => c.includes(x))
}

/** Deputado/Senador/Governador: meta é por cidade, não pelo estado inteiro. */
export function usesMetaPorCidade(cargo) {
  return isCargoEstadual(cargo)
}

/** Locais de teste/lixo que não devem entrar na contagem de votos. */
export function isLocalVotoTeste(local) {
  const l = String(local || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  if (!l) return false
  return /\b(TESTE|TEST|DUMMY|FAKE|SAMPLE)\b/.test(l) || l.includes('ESCOLA TESTE')
}

/**
 * Remove seções/locais de teste e recalcula votosTotal.
 * Retorna o mesmo objeto se nada mudou.
 */
export function sanitizarDadosEleitores(dados) {
  if (!dados?.zonas?.length) return dados
  let mudou = false
  let votosTotal = 0
  const zonas = []

  for (const z of dados.zonas) {
    const locais = []
    for (const l of (z.locais || [])) {
      if (isLocalVotoTeste(l.nome || l.local)) {
        mudou = true
        continue
      }
      const secoes = []
      for (const s of (l.secoes || [])) {
        if (isLocalVotoTeste(s.local)) {
          mudou = true
          continue
        }
        secoes.push(s)
        votosTotal += Number(s.votos) || 0
      }
      if (!secoes.length) {
        mudou = true
        continue
      }
      if (secoes.length !== (l.secoes || []).length) mudou = true
      locais.push({ ...l, secoes })
    }
    if (!locais.length) {
      mudou = true
      continue
    }
    if (locais.length !== (z.locais || []).length) mudou = true
    zonas.push({ ...z, locais })
  }

  if (!mudou && Number(dados.votosTotal) === votosTotal) return dados
  return { ...dados, zonas, votosTotal }
}

export function chaveCidadeMeta(cidade) {
  return normStr(cidade || 'BLUMENAU')
}

export function loadMetasCidade() {
  try {
    const stored = JSON.parse(localStorage.getItem('metas_cidade') || 'null')
    if (stored && typeof stored === 'object' && Object.keys(stored).length) return stored
    const legado = parseInt(localStorage.getItem('meta_global_votos') || '0', 10)
    if (legado > 0) {
      const migrated = { [chaveCidadeMeta('BLUMENAU')]: legado }
      localStorage.setItem('metas_cidade', JSON.stringify(migrated))
      return migrated
    }
    return {}
  } catch {
    return {}
  }
}

export function loadMetasZona() {
  try {
    const raw = JSON.parse(localStorage.getItem('metas_zona') || '{}')
    if (!raw || typeof raw !== 'object') return {}
    const first = Object.values(raw)[0]
    if (typeof first === 'number') {
      return { [chaveCidadeMeta('BLUMENAU')]: raw }
    }
    return raw
  } catch {
    return {}
  }
}

export function getMetaCidade(metasCidade, cidade) {
  if (!cidade) return 0
  const ck = chaveCidadeMeta(cidade)
  return Number(metasCidade[ck] ?? metasCidade[cidade] ?? 0) || 0
}

export function setMetaCidade(metasCidade, cidade, valor) {
  const ck = chaveCidadeMeta(cidade)
  return { ...metasCidade, [ck]: valor }
}

export function getMetaZona(metasZona, cidade, zona) {
  if (!cidade) {
    return Number(metasZona[zona] ?? metasZona[String(zona)] ?? 0) || 0
  }
  const ck = chaveCidadeMeta(cidade)
  const nested = metasZona[ck] || metasZona[cidade]
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return Number(nested[zona] ?? nested[String(zona)] ?? 0) || 0
  }
  return Number(metasZona[zona] ?? metasZona[String(zona)] ?? 0) || 0
}

export function setMetaZona(metasZona, cidade, zona, valor) {
  const ck = chaveCidadeMeta(cidade)
  const prev = (metasZona[ck] && typeof metasZona[ck] === 'object') ? metasZona[ck] : {}
  return { ...metasZona, [ck]: { ...prev, [String(zona)]: valor } }
}

export function mergeMetasZonaCidade(metasZona, cidade, parcial) {
  const ck = chaveCidadeMeta(cidade)
  const prev = (metasZona[ck] && typeof metasZona[ck] === 'object') ? metasZona[ck] : {}
  const merged = { ...prev }
  for (const [zona, val] of Object.entries(parcial || {})) {
    merged[String(zona)] = val
  }
  return { ...metasZona, [ck]: merged }
}

/** Zonas que pertencem à cidade (inclui zonas 3/88 de Blumenau sem município no PDF). */
export function zonaPertenceCidade(zona, dados, cidade) {
  const nf = normStr(cidade)
  const mun = normStr(zona.municipio || dados?.municipio || '')
  if (mun === nf) return true
  if (!zona.municipio && !dados?.municipio) {
    const z = parseInt(zona.zona, 10) || 0
    if (nf === normStr('BLUMENAU') && ZONAS_BLUMENAU.has(z)) return true
  }
  return false
}

/** Chave compartilhada entre aba Eleitores e Mapa Eleitoral */
export const FILTRO_CIDADE_KEY = 'eleitores_filtro_cidade'

export function lerFiltroCidade(fallback = 'BLUMENAU') {
  try {
    const v = localStorage.getItem(FILTRO_CIDADE_KEY)
    if (v == null || v === '') return fallback
    return v
  } catch {
    return fallback
  }
}

export function gravarFiltroCidade(cidade) {
  try {
    if (cidade == null || cidade === '') localStorage.removeItem(FILTRO_CIDADE_KEY)
    else localStorage.setItem(FILTRO_CIDADE_KEY, String(cidade))
  } catch { /* ignore */ }
  try {
    window.dispatchEvent(new CustomEvent('eleitores-filtro-cidade', { detail: { cidade: cidade || null } }))
  } catch { /* ignore */ }
}

/** Lista de municípios presentes nos dados TRE importados */
export function listarCidadesEleitores(dados) {
  if (!dados?.zonas?.length) return []
  const set = new Set(
    dados.zonas.map(z => z.municipio || dados.municipio || 'BLUMENAU').filter(Boolean),
  )
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** Cidade padrão ao abrir a aba, conforme o cargo do candidato. */
export function cidadeFocoPadrao(dados, cidadesDisponiveis = []) {
  if (!dados) return null

  if (isCargoMunicipal(dados.cargo)) {
    const mun = dados.municipio || cidadesDisponiveis[0]
    if (mun) {
      const match = cidadesDisponiveis.find(c => normStr(c) === normStr(mun))
      return match || mun
    }
    return cidadesDisponiveis[0] || null
  }

  // Cargos estaduais/federais: foco em Blumenau (base da campanha)
  const blu = cidadesDisponiveis.find(c => normStr(c) === normStr('BLUMENAU'))
  return blu || 'BLUMENAU'
}

/** Filtra locais TRE para a cidade em foco (reduz processamento). */
export function filtrarScPorCidade(scData, cidade) {
  if (!cidade || !scData?.length) return scData || []
  const nf = normStr(cidade)
  return scData.filter(r => normStr(r.municipio) === nf)
}

/** Índice secao → local (memoizado por referência do array). */
let _secIdxCache = { ref: null, idx: {} }

export function buildSecIndex(scData) {
  if (_secIdxCache.ref === scData) return _secIdxCache.idx
  const idx = {}
  for (const r of scData || []) {
    const m = normStr(r.municipio || '')
    const z = String(parseInt(r.zona_eleitoral, 10) || 0)
    const entry = {
      nOrig: r.nome_local_votacao || '',
      b: r.bairro || '',
      end: r.endereco || '',
      cep: String(r.cep || ''),
    }
    const secStr = r.secoes_aptos || ''
    for (const match of secStr.matchAll(/(\d+)\s*\(/g)) {
      const sec = normalizeSecao(match[1])
      idx[`${m}:${z}:${sec}`] = entry
      idx[`${m}::${sec}`] = entry
    }
  }
  _secIdxCache = { ref: scData, idx }
  return idx
}

/** Sugere metas por zona com base na meta global ou no histórico de votos. */
export function sugerirMetasPorZona(zonas, { metaGlobal = 0, modo = 'proporcional', fatorCrescimento = 1.2 } = {}) {
  const out = {}
  const totalVotos = zonas.reduce((s, z) => s + (z.votos || 0), 0)
  if (totalVotos <= 0) return out

  zonas.forEach(z => {
    if (modo === 'crescimento') {
      out[z.zona] = Math.max(1, Math.round((z.votos || 0) * fatorCrescimento))
    } else if (metaGlobal > 0) {
      out[z.zona] = Math.max(1, Math.round(metaGlobal * ((z.votos || 0) / totalVotos)))
    }
  })
  return out
}

/** Ajusta metas para somar exatamente à meta global (corrige arredondamento). */
export function ajustarMetasAoTotal(metas, metaGlobal, zonas) {
  if (!metaGlobal || !zonas.length) return metas
  const sum = Object.values(metas).reduce((s, v) => s + (Number(v) || 0), 0)
  const diff = metaGlobal - sum
  if (diff === 0) return metas
  const maior = [...zonas].sort((a, b) => (b.votos || 0) - (a.votos || 0))[0]
  if (!maior) return metas
  return { ...metas, [maior.zona]: Math.max(0, (metas[maior.zona] || 0) + diff) }
}

const ZONAS_BLUMENAU = new Set([3, 88])

/** Município usado para cruzar com locais_tre.json (zonas 3/88 → Blumenau). */
export function municipioZona(zona, dados, cidadeFoco = null) {
  if (zona?.municipio) return normStr(zona.municipio)
  const z = parseInt(zona?.zona, 10) || 0
  if (ZONAS_BLUMENAU.has(z)) return normStr('BLUMENAU')
  if (cidadeFoco) return normStr(cidadeFoco)
  if (dados?.municipio) return normStr(dados.municipio)
  return normStr('BLUMENAU')
}

/** Número de seção normalizado (TSE pode vir como "0604" ou 604). */
export function normalizeSecao(sec) {
  return parseInt(sec, 10) || 0
}

export function buildScLookup(scData) {
  return (scData || []).map(r => {
    const secoes = []
    const secStr = r.secoes_aptos || ''
    for (const match of secStr.matchAll(/(\d+)\s*\(/g)) {
      secoes.push({ secao: normalizeSecao(match[1]) })
    }
    return {
      n: normStr(r.nome_local_votacao || ''),
      nOrig: r.nome_local_votacao || '',
      m: normStr(r.municipio || ''),
      z: String(normalizeSecao(r.zona_eleitoral)),
      b: r.bairro || '',
      end: r.endereco || '',
      cep: String(r.cep || ''),
      secoes,
    }
  })
}

export function buildScBySecao(scLookup) {
  const idx = {}
  for (const r of scLookup || []) {
    for (const s of r.secoes) {
      const sec = normalizeSecao(s.secao)
      if (!sec) continue
      const k1 = `${r.m}:${r.z}:${sec}`
      const k2 = `${r.m}::${sec}`
      if (!idx[k1]) idx[k1] = r
      if (!idx[k2]) idx[k2] = r
    }
  }
  return idx
}

/** Busca bairro no mapa COLEGIO_BAIRRO (match exato ou aproximado). */
export function findColegioBairro(nome, colegioNorms) {
  const nN = normStr(nome)
  if (!nN || !colegioNorms?.length) return null

  let hit = colegioNorms.find(x => x.n === nN)
  if (hit) return hit.b

  hit = colegioNorms.find(x =>
    nN.length >= 18 && (x.n.startsWith(nN.slice(0, 18)) || nN.startsWith(x.n.slice(0, 18))),
  )
  if (hit) return hit.b

  hit = colegioNorms.find(x =>
    (nN.length >= 14 && x.n.includes(nN.slice(0, 14)))
    || (x.n.length >= 14 && nN.includes(x.n.slice(0, 14))),
  )
  if (hit) return hit.b

  return null
}

function findScRecord(scLookup, scBySecao, { nome, mun, zNorm, secoes }) {
  const nN = normStr(nome)
  const muns = [...new Set([mun, normStr('BLUMENAU')].filter(Boolean))]

  for (const m of muns) {
    let hit = scLookup.find(r => r.n === nN && r.m === m && (r.z === zNorm || !r.z || !zNorm))
    if (hit) return hit
    hit = scLookup.find(r => r.n === nN && r.m === m)
    if (hit) return hit
  }

  for (const m of muns) {
    for (let i = 0; i < Math.min(secoes?.length || 0, 12); i++) {
      const sec = normalizeSecao(secoes[i].secao)
      if (!sec) continue
      const hit = scBySecao[`${m}:${zNorm}:${sec}`] || scBySecao[`${m}::${sec}`]
      if (hit) return hit
    }
  }

  for (const m of muns) {
    const hit = scLookup.find(r => r.m === m && (
      r.n === nN
      || (nN.length >= 18 && (r.n.startsWith(nN.slice(0, 18)) || nN.startsWith(r.n.slice(0, 18))))
      || (nN.length >= 12 && r.n.includes(nN.slice(0, 12)))
      || (r.n.length >= 12 && nN.includes(r.n.slice(0, 12)))
    ))
    if (hit) return hit
  }

  const blu = normStr('BLUMENAU')
  return scLookup.find(r => r.m === blu && (
    r.n === nN
    || (nN.length >= 18 && (r.n.startsWith(nN.slice(0, 18)) || nN.startsWith(r.n.slice(0, 18))))
  )) || null
}

function isEnderecoComoNome(nome) {
  return /^(RUA|AV(ENIDA)?|R\.?\s|TRAV(ESSA)?|AL(AMEDA)?|ROD(OVIA)?|EST(RADA)?|PC|PRACA|PRAÇA)\b/i.test(nome || '')
}

/**
 * Resolve bairro/nome/endereço de um local de votação.
 */
export function resolverBairroParaLocal(local, { mun, zNorm, secIdx, colegioNorms, bairrosLista = null }) {
  let nome = local.nome || ''
  let setor = local.setor || ''
  let endereco = local.endereco || ''
  let cep = local.cep || ''
  const lista = bairrosLista || undefined

  if (local.secoes?.length > 0 && secIdx) {
    let hit = null
    for (let i = 0; i < Math.min(local.secoes.length, 12); i++) {
      const sec = normalizeSecao(local.secoes[i].secao)
      if (!sec) continue
      hit = secIdx[`${mun}:${zNorm}:${sec}`]
        || secIdx[`${normStr('BLUMENAU')}:${zNorm}:${sec}`]
        || secIdx[`${mun}::${sec}`]
        || secIdx[`${normStr('BLUMENAU')}::${sec}`]
      if (hit) break
    }
    if (hit) {
      if (hit.nOrig && !nome) nome = hit.nOrig
      if (hit.b && !setor) setor = normalizarBairro(hit.b, lista)
      if (hit.end && !endereco) endereco = hit.end
      if (hit.cep && !cep) cep = hit.cep
    }
  }

  if (!setor) {
    const mapa = findColegioBairro(nome, colegioNorms)
    if (mapa) setor = normalizarBairro(mapa, lista)
  }

  if (setor) setor = normalizarBairro(setor, lista) || setor
  return { nome, setor, endereco, cep }
}

/**
 * Atribui bairros (setor) aos locais via TRE + mapa COLEGIO_BAIRRO.
 * Retorna novo objeto de dados se houve alteração, senão o mesmo.
 */
export function autoAssignBairros(dados, scLookup, scBySecao, colegioNorms, cidadeFoco = null, bairrosLista = null) {
  if (!dados?.zonas?.length) return dados
  let changed = false
  const secIdx = buildSecIndexFromLookup(scLookup, scBySecao)

  const novo = {
    ...dados,
    zonas: dados.zonas.map(z => {
      const mun = municipioZona(z, dados, cidadeFoco)
      const zNorm = String(parseInt(z.zona, 10) || 0)
      return {
        ...z,
        municipio: z.municipio || (ZONAS_BLUMENAU.has(parseInt(z.zona, 10)) ? 'BLUMENAU' : (dados.municipio || cidadeFoco || '')),
        locais: (z.locais || []).map(l => {
          const resolved = resolverBairroParaLocal(l, {
            mun, zNorm,
            secIdx,
            colegioNorms,
            bairrosLista,
          })
          const hit = findScRecord(scLookup, scBySecao, { nome: l.nome, mun, zNorm, secoes: l.secoes })
          const nomeReal = hit?.nOrig || resolved.nome
          const needsNameFix = nomeReal && nomeReal !== l.nome
            && (/^zona\s+\d+\s*[—\-]/i.test(l.nome || '') || isEnderecoComoNome(l.nome))

          const setorNovo = resolved.setor || null
          const patch = {}
          if (needsNameFix) patch.nome = nomeReal
          if (setorNovo && setorNovo !== l.setor) patch.setor = setorNovo
          if (resolved.endereco && resolved.endereco !== l.endereco) patch.endereco = resolved.endereco
          if (resolved.cep && resolved.cep !== l.cep) patch.cep = resolved.cep

          if (Object.keys(patch).length) {
            changed = true
            return { ...l, ...patch }
          }
          return l
        }),
      }
    }),
  }

  return changed ? novo : dados
}

/** Índice secao→{b,nOrig,...} a partir do lookup já carregado. */
function buildSecIndexFromLookup(scLookup, scBySecao) {
  const idx = {}
  for (const r of scLookup || []) {
    const entry = { nOrig: r.nOrig, b: r.b, end: r.end, cep: r.cep }
    for (const s of r.secoes || []) {
      const sec = normalizeSecao(s.secao)
      if (!sec) continue
      idx[`${r.m}:${r.z}:${sec}`] = entry
      idx[`${r.m}::${sec}`] = entry
    }
  }
  return idx
}

const _colegioNormsCache = { ref: null, norms: [] }

export function getColegioNorms() {
  if (_colegioNormsCache.ref === COLEGIO_BAIRRO) return _colegioNormsCache.norms
  const norms = Object.entries(COLEGIO_BAIRRO).map(([k, v]) => ({ n: normStr(k), b: v }))
  _colegioNormsCache.ref = COLEGIO_BAIRRO
  _colegioNormsCache.norms = norms
  return norms
}

/** Contexto TRE para resolver bairro (mapa + eleitores). */
export function buildTreCtx(scDataFull = []) {
  const scLookup = buildScLookup(scDataFull)
  const scBySecao = buildScBySecao(scLookup)
  return {
    scLookup,
    scBySecao,
    secIdx: buildSecIndexFromLookup(scLookup, scBySecao),
    colegioNorms: getColegioNorms(),
  }
}

/**
 * Resolve bairro canônico de um local de votação (mesma lógica da aba Eleitores).
 * setorIgrejaMap: nomes de setor internos (ex. igrejas) → bairro.
 */
export function resolveBairroVotacao(local, zona, dados, treCtx, { setorIgrejaMap = {} } = {}) {
  const bairrosLista = BAIRROS_BLUMENAU
  const colegioNorms = treCtx?.colegioNorms || getColegioNorms()

  if (local?.setor) {
    const canon = normalizarBairro(local.setor, bairrosLista)
    if (bairrosLista.includes(canon)) return canon
    if (setorIgrejaMap[local.setor]) {
      const mapped = normalizarBairro(setorIgrejaMap[local.setor], bairrosLista)
      if (bairrosLista.includes(mapped)) return mapped
    }
  }

  if (treCtx?.scLookup?.length) {
    const mun = municipioZona(zona, dados)
    const zNorm = String(parseInt(zona?.zona, 10) || 0)
    const resolved = resolverBairroParaLocal(local, {
      mun, zNorm,
      secIdx: treCtx.secIdx,
      colegioNorms,
      bairrosLista,
    })
    if (resolved.setor) return resolved.setor
  }

  const mapa = findColegioBairro(local?.nome, colegioNorms)
  if (mapa) return normalizarBairro(mapa, bairrosLista)

  const n = normStr(local?.nome || '')
  const sorted = [...bairrosLista].sort((a, b) => b.length - a.length)
  for (const b of sorted) {
    if (n.includes(normStr(b))) return b
  }

  return null
}
