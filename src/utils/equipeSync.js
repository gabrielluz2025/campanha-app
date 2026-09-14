import { writeStorage, flushAfterSave, readStorage } from './persist'

export const EQUIPE_KEY = 'equipe_membros'
export const PREVISAO_KEY = 'previsao_data'
export const EQUIPE_PREVISAO_EVENT = 'equipe-previsao-sync'
export const EQUIPE_REMOVIDOS_KEY = 'equipe_removidos'

export const CARGOS = [
  'Coordenador',
  'Administrativo',
  'Cabo Eleitoral',
  'Comunicação',
  'Pessoal de Rua',
  'Multiplicador',
  'Igreja',
  'Apoiador',
  'Comunidade WhatsApp',
  'Outro',
]

export const CARGO_ORDEM = Object.fromEntries(CARGOS.map((c, i) => [c, i]))

/** Cargo padrão de quem se cadastra pelo link público / comunidade WhatsApp. */
export const CARGO_COMUNIDADE_WHATSAPP = 'Comunidade WhatsApp'

export const CARGO_CORES = {
  'Coordenador':    '#3b82f6',
  'Apoiador':       '#10b981',
  'Assessor':       '#10b981', // legado → Apoiador
  'Comunicação':    '#ef4444',
  'Administrativo': '#ec4899',
  'Secretária':     '#ec4899', // legado → Administrativo
  'Cabo Eleitoral': '#06b6d4',
  'Motorista':      '#94a3b8', // legado → Outro
  'Pessoal de Rua': '#a855f7',
  'Voluntário':     '#10b981', // legado → Apoiador
  'Multiplicador':  '#ea580c',
  'Igreja':         '#22d3ee',
  'Comunidade WhatsApp': '#25D366',
  'Outro':          '#94a3b8',
}

/** Cor do balão de cargo (sempre uma cor sólida válida). */
export function corCargo(cargo) {
  return CARGO_CORES[normalizarCargo(cargo)] || '#94a3b8'
}

const LEGADO_CARGO_MAP = {
  Comunicacao: 'Comunicação',
  'Pessoal de rua': 'Pessoal de Rua',
  Assessor: 'Apoiador',
  Voluntário: 'Apoiador',
  Apoiadores: 'Apoiador',
  Secretária: 'Administrativo',
  Secretaria: 'Administrativo',
  Motorista: 'Outro',
}

const LISTA_KEYS = {
  cabos: 'cabosPessoas',
  rua: 'ruaPessoas',
  admin: 'adminPessoas',
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export function normalizarCargo(cargo) {
  if (!cargo) return 'Apoiador'
  return LEGADO_CARGO_MAP[cargo] || cargo
}

export function parseArea(v) {
  if (Array.isArray(v)) return v
  if (typeof v === 'string' && v.trim()) return v.split(',').map(s => s.trim()).filter(Boolean)
  return []
}

export function cargoParaCategoria(cargo) {
  const c = normalizarCargo(cargo)
  if (c === 'Cabo Eleitoral') return 'cabos'
  if (c === 'Pessoal de Rua') return 'rua'
  // Apoiador / comunidade: sem remuneração — lista de rua (card próprio)
  if (c === 'Apoiador' || c === 'Comunidade WhatsApp' || c === 'Multiplicador' || c === 'Igreja') return 'rua'
  return 'admin'
}

export function categoriaPrevisaoLabel(cargo) {
  const c = normalizarCargo(cargo)
  if (c === 'Cabo Eleitoral') return 'Cabos Eleitorais'
  if (c === 'Pessoal de Rua') return 'Pessoal de Rua'
  if (c === 'Apoiador') return 'Apoiadores'
  if (c === 'Comunidade WhatsApp') return 'Comunidade WhatsApp'
  if (c === 'Multiplicador') return 'Multiplicadores'
  if (c === 'Igreja') return 'Igreja'
  return 'Equipe Administrativa'
}

export function defaultCargoPorTipo(tipo) {
  return {
    cabo: 'Cabo Eleitoral',
    rua: 'Pessoal de Rua',
    voluntario: 'Apoiador',
    apoiador: 'Apoiador',
    multiplicador: 'Multiplicador',
    admin: 'Coordenador',
  }[tipo] || 'Apoiador'
}

export function cargosAdmin() {
  return ['Coordenador', 'Comunicação', 'Administrativo', 'Outro']
}

/** Converte cargos legados (Assessor/Voluntário/Secretária/Motorista…) e zera remun. de Apoiador. */
export function migrarMembroParaApoiador(m) {
  if (!m) return m
  const raw = String(m.cargo || '')
  let next = { ...m }

  if (raw === 'Assessor' || raw === 'Voluntário' || raw === 'Apoiadores') {
    next = {
      ...next,
      cargo: 'Apoiador',
      salario: '',
      vinculo: next.vinculo || 'Voluntário',
    }
  } else {
    const norm = normalizarCargo(raw || 'Apoiador')
    if (norm !== raw) next = { ...next, cargo: norm }
  }

  return next
}

export function migrarListaParaApoiador(lista = []) {
  let changed = false
  const next = (lista || []).map(m => {
    const migrated = migrarMembroParaApoiador(m)
    if (
      migrated.cargo !== m.cargo
      || String(migrated.salario ?? '') !== String(m.salario ?? '')
    ) changed = true
    return migrated
  })
  return { lista: next, changed }
}

function migrarPessoaPrevisaoParaApoiador(p) {
  if (!p) return p
  const raw = String(p.cargo || '')
  const norm = normalizarCargo(raw)
  if (raw === 'Assessor' || raw === 'Voluntário' || raw === 'Apoiadores') {
    return { ...p, cargo: 'Apoiador', valor: 0 }
  }
  if (norm !== raw) return { ...p, cargo: norm }
  return p
}

export function pessoaId(p) {
  return p?.equipeId || p?.id
}

function notifyEquipePrevisao(key = PREVISAO_KEY) {
  try {
    window.dispatchEvent(new CustomEvent(EQUIPE_PREVISAO_EVENT, { detail: { key } }))
  } catch { /* ignore */ }
}

function parseSalario(valor) {
  if (valor === '' || valor == null) return ''
  const n = parseFloat(String(valor).replace(',', '.'))
  return Number.isFinite(n) ? n : ''
}

/** Prefere valor > 0; não deixa 0/vazio da Equipe apagar valor da Previsão (comum em Voluntários). */
function escolherValorFinanceiro(valorEquipe, valorPrevisao) {
  const e = parseSalario(valorEquipe)
  const p = parseSalario(valorPrevisao)
  const ePos = e !== '' && Number(e) > 0
  const pPos = p !== '' && Number(p) > 0
  if (ePos) return e
  if (pPos) return p
  if (e !== '') return e
  if (p !== '') return p
  return ''
}

/** Apoiador / comunidade / leads — nunca entram como remunerados. */
export function ehCargoSemRemuneracao(cargo, membro = null) {
  const c = normalizarCargo(cargo)
  if (c === 'Apoiador' || c === CARGO_COMUNIDADE_WHATSAPP) return true
  if (membro?.origem === 'cadastro_publico') return true
  if (String(membro?.id || '').startsWith('lead-')) return true
  if (String(membro?.vinculo || '') === CARGO_COMUNIDADE_WHATSAPP) return true
  return false
}

/** Comunidade WhatsApp / leads do formulário — fora das listas financeiras da previsão. */
export function ehMembroRedeLevePrevisao(membro) {
  if (!membro) return false
  const c = normalizarCargo(membro.cargo)
  if (c === CARGO_COMUNIDADE_WHATSAPP) return true
  if (membro.origem === 'cadastro_publico') return true
  if (String(membro.id || '').startsWith('lead-')) return true
  if (String(membro.vinculo || '') === CARGO_COMUNIDADE_WHATSAPP) return true
  return false
}

function protegeCargoComunidade(membro) {
  return ehMembroRedeLevePrevisao(membro)
    || !!membro?.apoiadorRedeId
    || normalizarCargo(membro?.cargo) === CARGO_COMUNIDADE_WHATSAPP
}

function clonePrevisao(obj) {
  try { return JSON.parse(JSON.stringify(obj || {})) } catch { return {} }
}

function totalPessoas(data) {
  if (!data) return 0
  return (data.cabosPessoas?.length || 0) + (data.ruaPessoas?.length || 0) + (data.adminPessoas?.length || 0)
}

export function loadEquipe() {
  let lista = []
  try { lista = JSON.parse(localStorage.getItem(EQUIPE_KEY) || '[]') } catch { lista = [] }
  if (!Array.isArray(lista)) lista = []
  const removidos = loadEquipeRemovidos()
  if (removidos.size) {
    lista = lista.filter(m => m?.id == null || !removidos.has(String(m.id)))
  }
  const { lista: migrada, changed } = migrarListaParaApoiador(lista)
  if (changed) {
    writeStorage(EQUIPE_KEY, migrada)
    flushAfterSave().catch(() => {})
  }
  return migrada
}

export function loadEquipeRemovidos() {
  const raw = readStorage(EQUIPE_REMOVIDOS_KEY, [])
  return new Set((Array.isArray(raw) ? raw : []).map(String).filter(Boolean))
}

export function marcarEquipeRemovido(id) {
  if (id == null || id === '') return loadEquipeRemovidos()
  const set = loadEquipeRemovidos()
  set.add(String(id))
  writeStorage(EQUIPE_REMOVIDOS_KEY, [...set])
  return set
}

export function desmarcarEquipeRemovido(id) {
  if (id == null || id === '') return loadEquipeRemovidos()
  const set = loadEquipeRemovidos()
  set.delete(String(id))
  writeStorage(EQUIPE_REMOVIDOS_KEY, [...set])
  return set
}

function preferMembroEquipeLocal(a, b) {
  if (!a) return b
  if (!b) return a
  const out = { ...a, ...b, id: a.id || b.id }
  for (const k of Object.keys(a)) {
    const bv = out[k]
    const av = a[k]
    if (bv === '' || bv == null || (Array.isArray(bv) && bv.length === 0)) {
      if (av !== '' && av != null && !(Array.isArray(av) && av.length === 0)) out[k] = av
    }
  }
  return out
}

/**
 * Grava equipe. Por padrão faz união com a lista atual para não perder membros
 * (bug: sync/LWW ou estado React encolhido apagava gente até editar outro).
 * Exclusão intencional: marque com marcarEquipeRemovido(id) antes.
 */
export function saveEquipe(membros) {
  if (Array.isArray(membros) && membros.length === 0) {
    const atual = loadEquipe()
    if (atual.length > 0) return atual
  }
  const removidos = loadEquipeRemovidos()
  const { lista: incoming } = migrarListaParaApoiador(Array.isArray(membros) ? membros : [])
  const map = new Map()

  // Base: o que já está salvo (exceto removidos)
  let atualRaw = []
  try { atualRaw = JSON.parse(localStorage.getItem(EQUIPE_KEY) || '[]') } catch { atualRaw = [] }
  if (!Array.isArray(atualRaw)) atualRaw = []
  for (const m of atualRaw) {
    if (!m?.id || removidos.has(String(m.id))) continue
    map.set(String(m.id), m)
  }

  // Aplica a lista nova (edits / adds)
  for (const m of incoming) {
    if (!m?.id) continue
    const id = String(m.id)
    if (removidos.has(id)) {
      // Reinclusão explícita na lista → tira da quarentena
      desmarcarEquipeRemovido(id)
      removidos.delete(id)
    }
    map.set(id, preferMembroEquipeLocal(map.get(id), m))
  }

  // Remove explicitamente quem veio de fora da incoming E está em removidos — já filtrado
  // Quem está em removidos não entra. Quem sumiu da incoming sem estar em removidos: mantém (união).

  const lista = [...map.values()]
  writeStorage(EQUIPE_KEY, lista)
  flushAfterSave().catch(() => {})
  notifyEquipePrevisao(EQUIPE_KEY)
  return lista
}

export function loadPrevisao() {
  try {
    const atual = localStorage.getItem(PREVISAO_KEY)
    let data = atual ? JSON.parse(atual) : null
    if (!data) {
      const legado = localStorage.getItem('previsao_gasto')
      data = legado ? JSON.parse(legado) : {}
    }
    return migrarPrevisaoParaApoiador(data)
  } catch { return {} }
}

/**
 * Grava previsão mesclando com o que já existe.
 * Array vazio explícito = remoção intencional (não restaura a lista antiga).
 */
export function savePrevisaoSeguro(patch) {
  const atual = loadPrevisao()
  const merged = migrarPrevisaoParaApoiador({ ...atual, ...patch })

  for (const key of Object.values(LISTA_KEYS)) {
    const novo = patch?.[key]
    const antigo = atual?.[key]
    // Só preserva lista antiga se a chave não veio no patch
    if (novo === undefined && Array.isArray(antigo)) {
      merged[key] = antigo
    }
  }

  writeStorage(PREVISAO_KEY, merged)
  flushAfterSave().catch(() => {})
  return merged
}

function tipoPrevisaoDaPessoa(pessoa, fallback = 'rua') {
  const c = normalizarCargo(pessoa?.cargo)
  if (c === 'Cabo Eleitoral') return 'cabo'
  if (c === 'Apoiador' || c === 'Comunidade WhatsApp') return 'voluntario'
  if (c === 'Multiplicador') return 'multiplicador'
  if (c === 'Pessoal de Rua') return 'rua'
  if (cargoParaCategoria(c) === 'admin') return 'admin'
  return fallback
}

function migrarPrevisaoParaApoiador(data) {
  if (!data || typeof data !== 'object') return data || {}
  let changed = false
  const next = { ...data }
  for (const key of Object.values(LISTA_KEYS)) {
    if (!Array.isArray(next[key])) continue
    const lista = next[key].map(p => {
      const m = migrarPessoaPrevisaoParaApoiador(p)
      if (m !== p) changed = true
      // também normaliza rótulo se já era Apoiador via alias
      if (m.cargo && normalizarCargo(m.cargo) === 'Apoiador' && m.cargo !== 'Apoiador') {
        changed = true
        return { ...m, cargo: 'Apoiador' }
      }
      return m
    })
    next[key] = lista
  }
  if (changed) {
    try {
      writeStorage(PREVISAO_KEY, next)
      flushAfterSave().catch(() => {})
    } catch { /* ignore */ }
  }
  return next
}

function extrairPessoasPrevisao(previsao = loadPrevisao()) {
  const data = clonePrevisao(previsao)
  return [
    ...(data.cabosPessoas || []).map(p => ({ pessoa: p, tipo: tipoPrevisaoDaPessoa(p, 'cabo') })),
    ...(data.ruaPessoas || []).map(p => ({ pessoa: p, tipo: tipoPrevisaoDaPessoa(p, 'rua') })),
    ...(data.adminPessoas || []).map(p => ({ pessoa: p, tipo: tipoPrevisaoDaPessoa(p, 'admin') })),
  ]
}

/** Importa/atualiza equipe_membros a partir da Previsão (inclui recuperar salário zerado). */
export function sincronizarEquipeComPrevisao({ gravar = true } = {}) {
  const equipe = [...loadEquipe()]
  const ids = new Set(equipe.map(m => String(m.id)))
  const removidos = loadEquipeRemovidos()
  let changed = false

  for (const { pessoa, tipo } of extrairPessoasPrevisao()) {
    const equipeId = pessoaId(pessoa)
    if (!equipeId || !pessoa.nome?.trim()) continue
    if (removidos.has(String(equipeId))) continue

    if (ids.has(String(equipeId))) {
      const idx = equipe.findIndex(m => String(m.id) === String(equipeId))
      if (idx < 0) continue
      const atual = equipe[idx]
      // Formulário / comunidade WhatsApp: cargo e salário não voltam via previsão
      const protegeCargo = protegeCargoComunidade(atual)
      const protegeSalario = protegeCargo || ehCargoSemRemuneracao(atual.cargo, atual)
        || ehCargoSemRemuneracao(pessoa.cargo, pessoa)
      const valor = escolherValorFinanceiro(atual.salario, pessoa.valor)
      const salarioStr = protegeSalario ? '' : (valor === '' ? '' : String(valor))
      const precisaSalario = !protegeSalario
        && salarioStr !== ''
        && String(atual.salario ?? '') !== salarioStr
        && (parseSalario(atual.salario) === '' || Number(parseSalario(atual.salario)) === 0)
      const cargoNovo = normalizarCargo(pessoa.cargo || atual.cargo)
      const precisaCargo = !protegeCargo && cargoNovo && cargoNovo !== normalizarCargo(atual.cargo)
      // Completa telefone/nome vazios sem apagar cadastro rico
      const precisaTel = !!(pessoa.telefone && !String(atual.telefone || '').trim())
      const precisaNome = !!(pessoa.nome && !String(atual.nome || '').trim())
      if (precisaSalario || precisaCargo || precisaTel || precisaNome) {
        equipe[idx] = {
          ...atual,
          ...(precisaCargo ? { cargo: cargoNovo } : {}),
          ...(precisaSalario ? { salario: salarioStr } : {}),
          ...(precisaTel ? { telefone: pessoa.telefone } : {}),
          ...(precisaNome ? { nome: pessoa.nome } : {}),
        }
        changed = true
      }
      continue
    }

    if (ehMembroRedeLevePrevisao({ ...pessoa, id: equipeId, cargo: pessoa.cargo })) continue
    equipe.push(pessoaPrevisaoParaMembro({ ...pessoa, equipeId }, tipo))
    ids.add(String(equipeId))
    changed = true
  }

  if (changed && gravar) saveEquipe(equipe)
  return { equipe, changed }
}

export function membroParaPessoaPrevisao(membro) {
  const cargo = normalizarCargo(membro.cargo)
  const semRem = ehCargoSemRemuneracao(cargo, membro)
  return {
    id: membro.id,
    equipeId: membro.id,
    nome: membro.nome || '',
    telefone: membro.telefone || '',
    email: membro.email || '',
    cpf: membro.cpf || '',
    contrato: membro.contrato || '',
    vinculo: membro.vinculo || 'Voluntário',
    dataInicio: membro.dataInicio || '',
    cidadeAtuacao: membro.cidadeAtuacao || '',
    areaAtuacao: Array.isArray(membro.bairros) ? membro.bairros : parseArea(membro.bairro),
    valor: semRem ? 0 : parseSalario(membro.salario),
    diasContratado: membro.diasContratado || '',
    horasContratado: membro.horasContratado || '',
    cargo,
  }
}

export const COMBUSTIVEL_VAZIO = { ativo: false, veiculo: '', litrosMes: '' }

function parseNumComb(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export function gerarCedenciaId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

/** Normaliza cedências de combustível; migra litrosMes legado se necessário. */
export function normalizarCedencias(carro, { dataInicio = '', dataFim = '' } = {}) {
  if (Array.isArray(carro?.cedencias) && carro.cedencias.length) {
    return carro.cedencias.map(c => ({
      id: c.id || gerarCedenciaId(),
      dataInicio: c.dataInicio || '',
      dataFim: c.dataFim || '',
      litros: c.litros ?? '',
    }))
  }
  const litrosLegado = parseNumComb(carro?.litrosMes)
  const km = parseNumComb(carro?.kmMes)
  const aut = parseNumComb(carro?.autonomia)
  const litrosKm = km > 0 && aut > 0 ? km / aut : 0
  const litros = litrosLegado > 0 ? litrosLegado : litrosKm
  if (litros > 0 || carro?.litrosMes !== undefined) {
    return [{
      id: gerarCedenciaId(),
      dataInicio: dataInicio || '',
      dataFim: dataFim || '',
      litros: carro?.litrosMes ?? litros,
    }]
  }
  return [{
    id: gerarCedenciaId(),
    dataInicio: dataInicio || '',
    dataFim: dataFim || '',
    litros: '',
  }]
}

export function normalizarCarroCombustivel(carro, opts = {}) {
  const cedencias = normalizarCedencias(carro, opts)
  const { litrosMes, kmMes, autonomia, ...rest } = carro || {}
  return { ...rest, cedencias }
}

/** Total de litros cedidos (soma das cedências). */
export function litrosTotalDoCarro(carro) {
  if (!carro) return 0
  if (Array.isArray(carro.cedencias) && carro.cedencias.length) {
    return carro.cedencias.reduce((s, c) => s + parseNumComb(c.litros), 0)
  }
  const litros = parseNumComb(carro.litrosMes)
  if (litros > 0) return litros
  const km = parseNumComb(carro.kmMes)
  const aut = parseNumComb(carro.autonomia)
  if (km > 0 && aut > 0) return km / aut
  return 0
}

/** Alias legado — retorna total de litros cedidos. */
export function litrosMesDoCarro(carro) {
  return litrosTotalDoCarro(carro)
}

export function normalizarCombustivelMembro(membro) {
  const c = membro?.combustivel
  if (!c || typeof c !== 'object') return { ...COMBUSTIVEL_VAZIO }
  const litros = c.litrosMes ?? ''
  const litrosMes = litros !== '' && litros != null
    ? litros
    : (parseNumComb(c.kmMes) > 0 && parseNumComb(c.autonomia) > 0
      ? parseNumComb(c.kmMes) / parseNumComb(c.autonomia)
      : '')
  return {
    ativo: Boolean(c.ativo),
    veiculo: c.veiculo || '',
    litrosMes,
  }
}

export function membroTemCombustivel(membro) {
  return normalizarCombustivelMembro(membro).ativo
}

export function nomeVeiculoMembro(membro) {
  const c = normalizarCombustivelMembro(membro)
  if (c.veiculo.trim()) return c.veiculo.trim()
  return `Veículo — ${membro.nome || 'Membro'}`
}

export function carroDeMembro(membro, { dataInicio = '', dataFim = '' } = {}) {
  const c = normalizarCombustivelMembro(membro)
  const litros = c.litrosMes || ''
  return {
    id: `eq-${membro.id}`,
    equipeId: membro.id,
    nome: nomeVeiculoMembro(membro),
    cedencias: [{
      id: gerarCedenciaId(),
      dataInicio,
      dataFim,
      litros,
    }],
  }
}

export function combustivelDeCarro(carro) {
  const nome = carro.nome || ''
  const veiculo = nome.startsWith('Veículo — ') ? '' : nome
  return {
    ativo: true,
    veiculo,
    litrosMes: litrosTotalDoCarro(carro) || '',
  }
}

/** Sincroniza veículos da previsão com membros que têm combustível vinculado. */
export function sincronizarCombustivelEquipeCarros(equipeLista = loadEquipe(), previsao = loadPrevisao()) {
  const data = clonePrevisao(previsao)
  const datas = { dataInicio: data.dataInicio || '', dataFim: data.dataFim || '' }
  const carros = (Array.isArray(data.carros) ? data.carros : []).map(c => normalizarCarroCombustivel(c, datas))
  const idsComComb = new Set()

  for (const m of equipeLista) {
    if (!membroTemCombustivel(m)) continue
    idsComComb.add(m.id)
    const novo = carroDeMembro(m, datas)
    const idx = carros.findIndex(c => c.equipeId === m.id)
    if (idx >= 0) {
      const existente = carros[idx]
      const cedencias = Array.isArray(existente.cedencias) && existente.cedencias.length
        ? existente.cedencias
        : novo.cedencias
      carros[idx] = { ...existente, nome: novo.nome, equipeId: novo.equipeId, cedencias, id: existente.id ?? novo.id }
    } else {
      carros.push(novo)
    }
  }

  data.carros = carros.filter(c => !c.equipeId || idsComComb.has(c.equipeId))
  return data
}

/** Grava carros na previsão a partir da equipe. */
export function sincronizarCombustivelNaPrevisao(equipeLista = loadEquipe()) {
  const merged = sincronizarCombustivelEquipeCarros(equipeLista, loadPrevisao())
  savePrevisaoSeguro(merged)
  notifyEquipePrevisao(PREVISAO_KEY)
  return merged
}

/** Atualiza combustível do membro a partir de um veículo da previsão. */
export function sincronizarCombustivelCarroParaMembro(carro) {
  if (!carro?.equipeId) return loadEquipe()
  const equipe = [...loadEquipe()]
  const idx = equipe.findIndex(m => m.id === carro.equipeId)
  if (idx < 0) return equipe
  equipe[idx] = { ...equipe[idx], combustivel: combustivelDeCarro(carro) }
  saveEquipe(equipe)
  return equipe
}

/** Importa dados de combustível dos carros vinculados para a equipe. */
export function sincronizarCombustivelCarrosParaEquipe(previsao = loadPrevisao()) {
  const equipe = [...loadEquipe()]
  let changed = false
  for (const carro of previsao.carros || []) {
    if (!carro.equipeId) continue
    const idx = equipe.findIndex(m => m.id === carro.equipeId)
    if (idx < 0) continue
    const novo = combustivelDeCarro(carro)
    const atual = normalizarCombustivelMembro(equipe[idx])
    if (JSON.stringify(atual) !== JSON.stringify(novo)) {
      equipe[idx] = { ...equipe[idx], combustivel: novo }
      changed = true
    }
  }
  if (changed) saveEquipe(equipe)
  return { equipe, changed }
}

export function mesclarPrevisaoCompleta(previsao = loadPrevisao(), equipeLista = null) {
  // Recupera salário na Equipe a partir da Previsão (ex.: voluntários com valor só na previsão)
  if (equipeLista == null) {
    sincronizarEquipeComPrevisao({ gravar: true })
  }
  const equipe = equipeLista ?? loadEquipe()
  const mesclado = sincronizarCombustivelEquipeCarros(equipe, mesclarEquipeNasListas(previsao, equipe))
  // Garante que valores recuperados voltem às listas da previsão
  return mesclarEquipeNasListas(mesclado, loadEquipe())
}

export function pessoaPrevisaoParaMembro(pessoa, tipo) {
  const equipeId = pessoaId(pessoa) || uid()
  const cargo = normalizarCargo(pessoa.cargo || defaultCargoPorTipo(tipo))
  const semRem = tipo === 'voluntario' || ehCargoSemRemuneracao(cargo, pessoa)
  return {
    id: equipeId,
    nome: pessoa.nome || '',
    cargo,
    telefone: pessoa.telefone || '',
    email: pessoa.email || '',
    cpf: pessoa.cpf || '',
    cidadeAtuacao: pessoa.cidadeAtuacao || '',
    bairros: parseArea(pessoa.areaAtuacao),
    observacoes: pessoa.observacoes || '',
    foto: pessoa.foto || '',
    fotoX: pessoa.fotoX ?? 50,
    fotoY: pessoa.fotoY ?? 50,
    vinculo: pessoa.vinculo || 'Voluntário',
    salario: semRem ? '' : (pessoa.valor !== '' && pessoa.valor != null ? String(pessoa.valor) : ''),
    dataInicio: pessoa.dataInicio || '',
    contrato: pessoa.contrato || '',
    diasContratado: pessoa.diasContratado || '',
    horasContratado: pessoa.horasContratado || '',
  }
}

function listaPrevisao(previsao, categoria) {
  const key = LISTA_KEYS[categoria]
  if (!Array.isArray(previsao[key])) previsao[key] = []
  return previsao[key]
}

function removerDeTodasListas(previsao, equipeId) {
  for (const key of Object.values(LISTA_KEYS)) {
    if (!Array.isArray(previsao[key])) continue
    previsao[key] = previsao[key].filter(p => pessoaId(p) !== equipeId)
  }
}

function mergePessoaPrevisao(existente, convertido) {
  const areaEq = parseArea(convertido.areaAtuacao)
  const areaPrev = parseArea(existente?.areaAtuacao)
  const semRem = ehCargoSemRemuneracao(convertido.cargo, convertido)
    || ehCargoSemRemuneracao(existente?.cargo, existente)
  return {
    ...existente,
    ...convertido,
    valor: semRem ? 0 : escolherValorFinanceiro(convertido.valor, existente?.valor),
    diasContratado: convertido.diasContratado || existente?.diasContratado || '',
    horasContratado: convertido.horasContratado || existente?.horasContratado || '',
    contrato: convertido.contrato || existente?.contrato || '',
    telefone: convertido.telefone || existente?.telefone || '',
    email: convertido.email || existente?.email || '',
    cpf: convertido.cpf || existente?.cpf || '',
    vinculo: convertido.vinculo || existente?.vinculo || '',
    dataInicio: convertido.dataInicio || existente?.dataInicio || '',
    cidadeAtuacao: convertido.cidadeAtuacao || existente?.cidadeAtuacao || '',
    areaAtuacao: areaEq.length ? areaEq : areaPrev,
  }
}

/** Mescla equipe nas listas da previsão SEM gravar (só para exibir/carregar). */
export function mesclarEquipeNasListas(previsao = loadPrevisao(), equipeLista = null) {
  const data = clonePrevisao(previsao)
  const equipe = (equipeLista ?? loadEquipe()).map(m => ({ ...m, cargo: normalizarCargo(m.cargo) }))

  for (const membro of equipe) {
    // Comunidade / leads não poluem listas financeiras da previsão
    if (ehMembroRedeLevePrevisao(membro)) {
      removerDeTodasListas(data, membro.id)
      continue
    }
    const cat = cargoParaCategoria(membro.cargo)
    const convertido = membroParaPessoaPrevisao(membro)
    if (ehCargoSemRemuneracao(membro.cargo, membro)) convertido.valor = 0
    let existente = null
    for (const key of Object.values(LISTA_KEYS)) {
      const found = (data[key] || []).find(p => pessoaId(p) === membro.id)
      if (found) { existente = found; break }
    }
    removerDeTodasListas(data, membro.id)
    listaPrevisao(data, cat).push(
      existente ? mergePessoaPrevisao(existente, convertido) : convertido,
    )
  }

  return data
}

/** Lista unificada: todos os membros da equipe com valores financeiros. */
export function listaEquipeCompleta(previsao = loadPrevisao()) {
  const mesclado = mesclarEquipeNasListas(previsao)
  const todas = [
    ...(mesclado.cabosPessoas || []),
    ...(mesclado.ruaPessoas || []),
    ...(mesclado.adminPessoas || []),
  ]
  const equipe = loadEquipe()
  const vistos = new Set()

  const out = equipe.map(m => {
    const p = todas.find(x => pessoaId(x) === m.id)
    vistos.add(m.id)
    return p ? { ...p, cargo: normalizarCargo(m.cargo) } : membroParaPessoaPrevisao(m)
  })

  for (const p of todas) {
    const id = pessoaId(p)
    if (id && !vistos.has(id)) out.push(p)
  }

  return out.sort((a, b) => (CARGO_ORDEM[normalizarCargo(a.cargo)] ?? 99) - (CARGO_ORDEM[normalizarCargo(b.cargo)] ?? 99))
}

export function atualizarMembroEmPrevisao(membro, equipeLista = null) {
  let lista = equipeLista ?? loadEquipe()
  if (membro?.id) {
    const m = { ...membro, cargo: normalizarCargo(membro.cargo) }
    const idx = lista.findIndex(x => x.id === m.id)
    lista = idx >= 0
      ? lista.map(x => x.id === m.id ? { ...x, ...m } : x)
      : [...lista, m]
  }
  const data = mesclarEquipeNasListas(loadPrevisao(), lista)
  savePrevisaoSeguro(data)
  // Evita ciclo de import com previsaoCalculo — republica resumo em background
  import('./previsaoCalculo')
    .then(m => m.publicarPrevisaoResumo(data, { mesclarEquipe: false }))
    .catch(() => {})
  notifyEquipePrevisao()
  return data
}

export function upsertMembroEmPrevisao(membro) {
  return atualizarMembroEmPrevisao(membro)
}

export function removerMembroDaPrevisao(equipeId) {
  const data = clonePrevisao(loadPrevisao())
  removerDeTodasListas(data, equipeId)
  savePrevisaoSeguro(data)
  import('./previsaoCalculo')
    .then(m => m.publicarPrevisaoResumo(data, { mesclarEquipe: false }))
    .catch(() => {})
  notifyEquipePrevisao()
  return data
}

export function upsertPessoaNaEquipe(pessoa, tipo) {
  const lista = [...loadEquipe()]
  const equipeId = pessoaId(pessoa) || uid()
  const convertido = pessoaPrevisaoParaMembro({ ...pessoa, equipeId }, tipo)
  const semRem = tipo === 'voluntario' || ehCargoSemRemuneracao(convertido.cargo, convertido)
  const idx = lista.findIndex(m => m.id === equipeId)
  if (idx >= 0) {
    const prev = lista[idx]
    const protege = protegeCargoComunidade(prev) || ehCargoSemRemuneracao(prev.cargo, prev)
    const salario = (semRem || protege)
      ? ''
      : escolherValorFinanceiro(convertido.salario, prev.salario)
    lista[idx] = {
      ...prev,
      ...convertido,
      cargo: protege ? normalizarCargo(prev.cargo) : convertido.cargo,
      salario: salario === '' ? '' : String(salario),
      foto: prev.foto || convertido.foto,
      email: convertido.email || prev.email || '',
      cpf: convertido.cpf || prev.cpf || '',
      observacoes: convertido.observacoes || prev.observacoes || '',
      vinculo: convertido.vinculo || prev.vinculo || 'Voluntário',
      dataInicio: convertido.dataInicio || prev.dataInicio || '',
    }
  } else {
    if (semRem) convertido.salario = ''
    lista.push(convertido)
  }
  saveEquipe(lista)
  notifyEquipePrevisao(EQUIPE_KEY)
  return lista
}

export function removerPessoaDaEquipe(equipeId) {
  const id = typeof equipeId === 'object' && equipeId != null
    ? (equipeId.equipeId || equipeId.id)
    : equipeId
  if (!id) return loadEquipe()
  marcarEquipeRemovido(id)
  const lista = loadEquipe().filter(m => String(m.id) !== String(id))
  // loadEquipe já filtra removidos; grava a lista explícita
  writeStorage(EQUIPE_KEY, lista)
  flushAfterSave().catch(() => {})
  notifyEquipePrevisao(EQUIPE_KEY)
  return lista
}

/** @deprecated use mesclarEquipeNasListas — não grava mais automaticamente */
export function reconciliarEquipePrevisao() {
  const mesclado = mesclarEquipeNasListas()
  const tinha = totalPessoas(loadPrevisao())
  const tem = totalPessoas(mesclado)
  if (tem > tinha) {
    savePrevisaoSeguro(mesclado)
    notifyEquipePrevisao()
    return { equipe: loadEquipe(), previsao: mesclado, changed: true }
  }
  return { equipe: loadEquipe(), previsao: mesclado, changed: false }
}

export function agruparPorCargo(membros) {
  const map = {}
  for (const m of membros) {
    const cargo = normalizarCargo(m.cargo)
    if (!map[cargo]) map[cargo] = []
    map[cargo].push(m)
  }
  return CARGOS
    .filter(c => map[c]?.length)
    .map(c => ({ cargo: c, membros: map[c] }))
}

/** Resumo financeiro por cargo — lista os 9 cargos mesmo vazios. */
export function resumoCargos(membros = []) {
  const map = {}
  for (const m of membros) {
    const cargo = normalizarCargo(m.cargo)
    if (!map[cargo]) map[cargo] = []
    map[cargo].push(m)
  }
  return CARGOS.map(cargo => {
    const lista = map[cargo] || []
    return {
      cargo,
      membros: lista,
      qtd: lista.length,
      total: lista.reduce((s, p) => s + (Number(p.valor) || 0), 0),
      categoria: categoriaPrevisaoLabel(cargo),
    }
  })
}
