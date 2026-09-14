/**
 * Sincroniza membros da Equipe com cargo Apoiador → Rede de Apoiadores.
 * Também hidrata cadastros públicos antigos (dados que estavam só na observação).
 */

import { writeStorage, flushAfterSave } from './persist'
import { loadEquipe, saveEquipe, normalizarCargo, CARGO_COMUNIDADE_WHATSAPP } from './equipeSync'
import { VOTOS_POR_APOIADOR } from './forcaPorBairro'

export const APOIADORES_KEY = 'apoiadores_lista'
export { VOTOS_POR_APOIADOR }

function gerarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function bairroDeMembro(m) {
  if (Array.isArray(m?.bairros) && m.bairros[0]) return String(m.bairros[0]).trim()
  if (m?.bairroResidencia) return String(m.bairroResidencia).trim()
  if (m?.bairro) return String(m.bairro).trim()
  if (m?.cidadeAtuacao) return String(m.cidadeAtuacao).trim()
  return 'A definir'
}

function chavePessoa(nome, telefone) {
  const n = String(nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  const t = String(telefone || '').replace(/\D/g, '')
  return `${n}|${t}`
}

function nomeNorm(n) {
  return String(n || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function nomesIguais(a, b) {
  const na = nomeNorm(a)
  const nb = nomeNorm(b)
  if (!na || !nb) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

function extraVal(extras, id) {
  if (!extras || typeof extras !== 'object') return ''
  const ex = extras[id]
  if (ex == null) return ''
  if (typeof ex === 'object') return String(ex.value || '').trim()
  return String(ex).trim()
}

function pareceDataBr(raw) {
  const s = String(raw || '').trim()
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return true
  const d = s.replace(/\D/g, '')
  return d.length === 8
}

function formatDataBrDigits(raw) {
  const s = String(raw || '').trim()
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-')
    return `${d}/${m}/${y}`
  }
  const d = s.replace(/\D/g, '')
  if (d.length !== 8) return s
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

/**
 * Extrai campos estruturados de observação antiga no formato:
 * "Cidade: X — Profissão: Y — Interesses: A; B — Label: val — Origem: cadastro público"
 */
export function parseObsDump(obs) {
  const text = String(obs || '').trim()
  if (!text) return null
  const isDump = /Origem:\s*cadastro público/i.test(text) || /^Cidade:/i.test(text) || /Interesses:/i.test(text)
  if (!isDump) return null

  const parts = text.split(/\s*[—–-]{1,3}\s*/).map(p => p.trim()).filter(Boolean)
  const out = {
    cidade: '',
    profissao: '',
    interesses: [],
    dataNascimento: '',
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    cpf: '',
    extras: {},
  }

  for (const part of parts) {
    const m = part.match(/^([^:]+):\s*(.+)$/s)
    if (!m) continue
    const lab = m[1].trim().toLowerCase()
    const val = m[2].trim()
    if (!val) continue
    if (lab.startsWith('cidade')) out.cidade = val
    else if (lab.startsWith('profiss')) {
      if (pareceDataBr(val) && !out.dataNascimento) out.dataNascimento = formatDataBrDigits(val)
      else out.profissao = val
    }
    else if (lab.startsWith('interesse')) {
      out.interesses = val.split(/;\s*/).map(s => s.trim()).filter(Boolean)
    }
    else if (/nasciment|data de nasc/.test(lab)) out.dataNascimento = formatDataBrDigits(val)
    else if (lab === 'cep') out.cep = val
    else if (/logradouro|^rua\b|endere/.test(lab)) out.logradouro = val
    else if (/^n[uú]mero|^n[º°.]?$/.test(lab)) out.numero = val
    else if (/complemento|apto/.test(lab)) out.complemento = val
    else if (lab === 'cpf') out.cpf = val
    else if (lab.startsWith('origem')) continue
    else out.extras[lab] = { label: m[1].trim(), value: val }
  }
  return out
}

/** Garante campos estruturados + votosEstimados; limpa dump antigo da observação. */
export function hidratarApoiador(ap) {
  if (!ap || typeof ap !== 'object') return ap
  const next = { ...ap }
  let changed = false

  const fromExtra = (id) => extraVal(next.extras, id)

  if (!next.dataNascimento && fromExtra('data_nascimento')) {
    next.dataNascimento = formatDataBrDigits(fromExtra('data_nascimento'))
    changed = true
  }
  if (!next.cep && fromExtra('cep')) { next.cep = fromExtra('cep'); changed = true }
  if (!next.logradouro && fromExtra('logradouro')) { next.logradouro = fromExtra('logradouro'); changed = true }
  if (!next.numero && fromExtra('numero')) { next.numero = fromExtra('numero'); changed = true }
  if (!next.complemento && fromExtra('complemento')) { next.complemento = fromExtra('complemento'); changed = true }
  if (!next.cpf && fromExtra('cpf')) { next.cpf = fromExtra('cpf'); changed = true }

  if (!next.dataNascimento && pareceDataBr(next.profissao) && !/[a-zA-ZÀ-ú]/.test(String(next.profissao || ''))) {
    next.dataNascimento = formatDataBrDigits(next.profissao)
    next.profissao = ''
    changed = true
  }

  const parsed = parseObsDump(next.observacao)
  if (parsed) {
    if (!next.cidade && parsed.cidade) { next.cidade = parsed.cidade; changed = true }
    if ((!next.profissao || pareceDataBr(next.profissao)) && parsed.profissao) {
      next.profissao = parsed.profissao
      changed = true
    }
    if (!next.dataNascimento && parsed.dataNascimento) { next.dataNascimento = parsed.dataNascimento; changed = true }
    if (!next.cep && parsed.cep) { next.cep = parsed.cep; changed = true }
    if (!next.logradouro && parsed.logradouro) { next.logradouro = parsed.logradouro; changed = true }
    if (!next.numero && parsed.numero) { next.numero = parsed.numero; changed = true }
    if (!next.complemento && parsed.complemento) { next.complemento = parsed.complemento; changed = true }
    if (!next.cpf && parsed.cpf) { next.cpf = parsed.cpf; changed = true }
    if ((!Array.isArray(next.interesses) || !next.interesses.length) && parsed.interesses.length) {
      next.interesses = parsed.interesses
      changed = true
    }
    next.observacao = ''
    changed = true
  }

  const votos = Number(next.votosEstimados)
  if (!Number.isFinite(votos) || votos <= 0) {
    next.votosEstimados = VOTOS_POR_APOIADOR
    changed = true
  } else {
    next.votosEstimados = Math.min(VOTOS_POR_APOIADOR, Math.round(votos))
  }

  return changed ? next : ap
}

export function normalizarListaApoiadores(lista, { persist = false } = {}) {
  let changed = false
  const removed = loadRemovidosSet()
  const next = []
  for (const a of (Array.isArray(lista) ? lista : [])) {
    if (estaRemovido(a?.id, a?.telefone, removed)) {
      changed = true
      continue
    }
    const n = hidratarApoiador(a)
    if (n !== a) changed = true
    next.push(n)
  }
  if (persist && changed) {
    writeStorage(APOIADORES_KEY, next)
    flushAfterSave().catch(() => {})
  }
  return next
}

/** Converte membro da equipe (cargo Apoiador) para registro da Rede. */
export function membroEquipeParaApoiador(m) {
  const obsParts = []
  if (m.vinculo) obsParts.push(`Vínculo: ${m.vinculo}`)
  if (m.observacoes) obsParts.push(m.observacoes)
  return {
    id: m.id ? `eq-${m.id}` : gerarId(),
    equipeId: m.id || '',
    nome: String(m.nome || '').trim(),
    telefone: String(m.telefone || '').trim(),
    bairro: bairroDeMembro(m),
    cidade: String(m.cidadeAtuacao || m.cidade || '').trim(),
    nivel: 'apoiador',
    observacao: obsParts.join(' — '),
    origem: 'equipe',
    votosEstimados: VOTOS_POR_APOIADOR,
    criadoEm: m.criadoEm || m.dataInicio || new Date().toISOString(),
  }
}

function loadApoiadoresListaRaw() {
  try {
    const raw = JSON.parse(localStorage.getItem(APOIADORES_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

export function loadApoiadoresLista() {
  return normalizarListaApoiadores(loadApoiadoresListaRaw(), { persist: false })
}

/**
 * Importa/atualiza na Rede todos os Apoiadores da Equipe.
 * Não remove registros manuais da Rede.
 */
export function sincronizarApoiadoresDaEquipe({ gravar = true } = {}) {
  const equipe = loadEquipe()
  const atuais = normalizarListaApoiadores(loadApoiadoresListaRaw(), { persist: false })
  const porEquipeId = new Map()
  const porChave = new Map()
  const porId = new Map()

  atuais.forEach(a => {
    if (a.id) porId.set(String(a.id), a)
    if (a.equipeId) porEquipeId.set(String(a.equipeId), a)
    porChave.set(chavePessoa(a.nome, a.telefone), a)
  })

  let imported = 0
  let updated = 0
  let touched = false
  const next = [...atuais]

  for (const m of equipe) {
    if (normalizarCargo(m.cargo) !== 'Apoiador') continue
    if (!String(m.nome || '').trim()) continue
    // Já está na Rede via formulário — não duplicar como eq-
    if (m.origem === 'cadastro_publico' || String(m.id || '').startsWith('lead-')) continue

    const convertido = membroEquipeParaApoiador(m)
    const existente =
      (m.id && porEquipeId.get(String(m.id)))
      || porId.get(`eq-${m.id}`)
      || porChave.get(chavePessoa(m.nome, m.telefone))

    if (existente) {
      const idx = next.findIndex(a => a.id === existente.id)
      if (idx < 0) continue
      const prev = next[idx]
      const merged = {
        ...prev,
        ...convertido,
        id: prev.id,
        nivel: prev.nivel || 'apoiador',
        observacao: prev.observacao || convertido.observacao,
        cidade: prev.cidade || convertido.cidade || '',
        votosEstimados: prev.votosEstimados || VOTOS_POR_APOIADOR,
        criadoEm: prev.criadoEm || convertido.criadoEm,
        origem: prev.origem || 'equipe',
        equipeId: m.id || prev.equipeId || '',
      }
      if (
        merged.nome !== prev.nome
        || merged.telefone !== prev.telefone
        || merged.bairro !== prev.bairro
        || merged.equipeId !== prev.equipeId
      ) {
        next[idx] = merged
        updated += 1
        touched = true
      }
      continue
    }

    next.unshift(convertido)
    imported += 1
    touched = true
    porEquipeId.set(String(m.id), convertido)
    porId.set(convertido.id, convertido)
    porChave.set(chavePessoa(convertido.nome, convertido.telefone), convertido)
  }

  const hydrated = normalizarListaApoiadores(next, { persist: false })
  if (hydrated.some((a, i) => a !== next[i])) touched = true

  if (gravar && touched) {
    writeStorage(APOIADORES_KEY, hydrated)
    flushAfterSave().catch(() => {})
  }

  return {
    lista: hydrated,
    imported,
    updated,
    totalEquipe: equipe.filter(m => normalizarCargo(m.cargo) === 'Apoiador').length,
  }
}

/** Votos estimados de um apoiador (máx. 5). */
export function votosDoApoiador(ap) {
  const n = Number(ap?.votosEstimados)
  if (Number.isFinite(n) && n > 0) return Math.min(VOTOS_POR_APOIADOR, Math.round(n))
  return VOTOS_POR_APOIADOR
}

function phonesMatch(a, b) {
  const da = String(a || '').replace(/\D/g, '')
  const db = String(b || '').replace(/\D/g, '')
  if (da.length < 8 || db.length < 8) return false
  const na = da.startsWith('55') && da.length >= 12 ? da.slice(2) : da
  const nb = db.startsWith('55') && db.length >= 12 ? db.slice(2) : db
  return na.slice(-9) === nb.slice(-9)
}

function telRemovidoKey(telefone) {
  const dig = String(telefone || '').replace(/\D/g, '')
  if (dig.length < 8) return null
  const norm = dig.startsWith('55') && dig.length >= 12 ? dig.slice(2) : dig
  return `tel:${norm.slice(-9)}`
}

export const APOIADORES_REMOVIDOS_KEY = 'apoiadores_removidos'

function loadRemovidosSet() {
  try {
    const raw = JSON.parse(localStorage.getItem(APOIADORES_REMOVIDOS_KEY) || '[]')
    return new Set((Array.isArray(raw) ? raw : []).map(String))
  } catch {
    return new Set()
  }
}

function estaRemovido(id, telefone, removed = null) {
  const set = removed || loadRemovidosSet()
  if (id != null && id !== '' && set.has(String(id))) return true
  const telKey = telRemovidoKey(telefone)
  if (telKey && set.has(telKey)) return true
  return false
}

/**
 * Exclui de verdade: Apoiadores + lista de removidos + Equipe.
 * Impede o sync de ressuscitar cadastros de teste / comunidade.
 */
export function excluirPessoaCompleta({ id, telefone, apoiadorRedeId } = {}, { flush = true } = {}) {
  const ids = [id, apoiadorRedeId].filter(v => v != null && String(v) !== '').map(String)
  const telKey = telRemovidoKey(telefone)
  const removed = loadRemovidosSet()
  ids.forEach(i => removed.add(i))
  if (telKey) removed.add(telKey)
  writeStorage(APOIADORES_REMOVIDOS_KEY, [...removed])

  const apo = loadApoiadoresListaRaw().filter(a => {
    if (!a) return false
    if (ids.some(i => String(a.id) === i)) return false
    if (telKey && telRemovidoKey(a.telefone) === telKey) return false
    return true
  })
  writeStorage(APOIADORES_KEY, apo)

  const equipe = loadEquipe().filter(m => {
    if (!m) return false
    if (ids.some(i => String(m.id) === i || String(m.apoiadorRedeId || '') === i)) return false
    if (telKey && telRemovidoKey(m.telefone) === telKey) return false
    return true
  })
  saveEquipe(equipe)

  if (flush) flushAfterSave().catch(() => {})
  return { apoiadores: apo, equipe }
}

function ehRegistroComunidade(m) {
  if (!m) return false
  if (m.origem === 'cadastro_publico') return true
  if (String(m.id || '').startsWith('lead-')) return true
  if (m.apoiadorRedeId && String(m.apoiadorRedeId).startsWith('lead-')) return true
  if (normalizarCargo(m.cargo) === CARGO_COMUNIDADE_WHATSAPP) return true
  if (String(m.vinculo || '') === CARGO_COMUNIDADE_WHATSAPP) return true
  return false
}

/** Converte cadastro do formulário → membro da Equipe (Comunidade WhatsApp). */
export function apoiadorFormularioParaMembro(ap) {
  const dataNasc = String(ap.dataNascimento || '').trim()
  return {
    id: ap.id,
    nome: String(ap.nome || '').trim(),
    cargo: CARGO_COMUNIDADE_WHATSAPP,
    telefone: String(ap.telefone || '').trim(),
    email: String(ap.email || '').trim(),
    cpf: String(ap.cpf || '').trim(),
    dataNascimento: dataNasc,
    bairroResidencia: String(ap.bairro || '').trim(),
    cidadeAtuacao: String(ap.cidade || '').trim(),
    cidade: String(ap.cidade || '').trim(),
    estado: 'SC',
    cep: String(ap.cep || '').trim(),
    logradouro: String(ap.logradouro || '').trim(),
    numero: String(ap.numero || '').trim(),
    complemento: String(ap.complemento || '').trim(),
    bairros: ap.bairro ? [String(ap.bairro).trim()] : [],
    valor: 0,
    salario: '',
    vinculo: CARGO_COMUNIDADE_WHATSAPP,
    origem: 'cadastro_publico',
    apoiadorRedeId: ap.id,
    observacoes: Array.isArray(ap.interesses) && ap.interesses.length
      ? `Interesses: ${ap.interesses.join('; ')}`
      : '',
    criadoEm: ap.criadoEm || new Date().toISOString(),
    atualizadoEm: ap.atualizadoEm || new Date().toISOString(),
  }
}

function forcarComunidade(m, patch = {}) {
  return {
    ...m,
    ...patch,
    cargo: CARGO_COMUNIDADE_WHATSAPP,
    valor: 0,
    salario: '',
    vinculo: CARGO_COMUNIDADE_WHATSAPP,
    origem: 'cadastro_publico',
  }
}

/**
 * Coloca na pirâmide quem veio do formulário, com cargo "Comunidade WhatsApp".
 * Corrige quem ficou preso como Cabo Eleitoral (vinculo comunidade + cargo cabo).
 */
export function sincronizarFormularioNaEquipe({ gravar = true } = {}) {
  const removed = loadRemovidosSet()
  const apoiadores = normalizarListaApoiadores(loadApoiadoresListaRaw(), { persist: false })
  const doForm = apoiadores.filter(a =>
    a.origem === 'cadastro_publico'
    && String(a.nome || '').trim()
    && !estaRemovido(a.id, a.telefone, removed)
  )
  let equipe = loadEquipe()
  // Tira da Equipe quem está marcado como removido (não deixa voltar no reload)
  const equipeLimpa = equipe.filter(m => !estaRemovido(m.id, m.telefone, removed)
    && !estaRemovido(m.apoiadorRedeId, m.telefone, removed))
  let imported = 0
  let updated = 0
  let purged = equipe.length - equipeLimpa.length
  const next = [...equipeLimpa]

  for (const ap of doForm) {
    const convertido = apoiadorFormularioParaMembro(ap)

    let idx = next.findIndex(m =>
      String(m.id) === String(ap.id)
      || String(m.apoiadorRedeId) === String(ap.id)
    )

    if (idx < 0) {
      // Mesmo nome + telefone (caso misturou com Cabo)
      idx = next.findIndex(m =>
        phonesMatch(m.telefone, ap.telefone) && nomesIguais(m.nome, ap.nome)
      )
    }

    if (idx < 0) {
      idx = next.findIndex(m =>
        phonesMatch(m.telefone, ap.telefone) && ehRegistroComunidade(m)
      )
    }

    if (idx >= 0) {
      const prev = next[idx]
      const merged = forcarComunidade(prev, {
        ...convertido,
        id: ehRegistroComunidade(prev) || nomesIguais(prev.nome, ap.nome)
          ? (String(prev.id || '').startsWith('lead-') ? prev.id : (prev.apoiadorRedeId || convertido.id || prev.id))
          : convertido.id,
        apoiadorRedeId: ap.id,
        criadoEm: prev.criadoEm || convertido.criadoEm,
      })
      // Se misturou num Cabo com outro id, usa o id do lead
      if (!String(merged.id || '').startsWith('lead-') && String(ap.id || '').startsWith('lead-')) {
        merged.id = ap.id
      }
      const mudou =
        merged.nome !== prev.nome
        || merged.telefone !== prev.telefone
        || merged.bairroResidencia !== prev.bairroResidencia
        || merged.cidadeAtuacao !== prev.cidadeAtuacao
        || merged.email !== prev.email
        || String(merged.dataNascimento || '') !== String(prev.dataNascimento || '')
        || String(merged.cep || '') !== String(prev.cep || '')
        || String(merged.logradouro || '') !== String(prev.logradouro || '')
        || normalizarCargo(prev.cargo) !== CARGO_COMUNIDADE_WHATSAPP
        || prev.origem !== 'cadastro_publico'
        || String(prev.vinculo || '') !== CARGO_COMUNIDADE_WHATSAPP
      if (mudou) {
        next[idx] = merged
        updated += 1
      }
    } else {
      next.unshift(convertido)
      imported += 1
    }
  }

  // Corrige qualquer um que já tenha marca de comunidade mas cargo errado (ex.: Cabo)
  for (let i = 0; i < next.length; i++) {
    const m = next[i]
    if (!m) continue
    if (!ehRegistroComunidade(m) && !doForm.some(ap => nomesIguais(ap.nome, m.nome) && phonesMatch(ap.telefone, m.telefone))) {
      continue
    }
    if (normalizarCargo(m.cargo) === CARGO_COMUNIDADE_WHATSAPP
      && m.origem === 'cadastro_publico'
      && String(m.vinculo || '') === CARGO_COMUNIDADE_WHATSAPP) {
      continue
    }
    const ap = doForm.find(a =>
      String(a.id) === String(m.id)
      || String(a.id) === String(m.apoiadorRedeId)
      || (nomesIguais(a.nome, m.nome) && phonesMatch(a.telefone, m.telefone))
    )
    next[i] = forcarComunidade(m, ap ? {
      apoiadorRedeId: ap.id,
      id: String(m.id || '').startsWith('lead-') ? m.id : ap.id,
      nome: ap.nome || m.nome,
      telefone: ap.telefone || m.telefone,
      email: ap.email || m.email,
      dataNascimento: ap.dataNascimento || m.dataNascimento || '',
      bairroResidencia: ap.bairro || m.bairroResidencia,
      cidadeAtuacao: ap.cidade || m.cidadeAtuacao,
      cidade: ap.cidade || m.cidade || '',
      estado: m.estado || 'SC',
      cep: ap.cep || m.cep || '',
      logradouro: ap.logradouro || m.logradouro || '',
      numero: ap.numero || m.numero || '',
      complemento: ap.complemento || m.complemento || '',
    } : {})
    updated += 1
  }

  if (gravar && (imported > 0 || updated > 0 || purged > 0)) {
    saveEquipe(next)
  }

  return { imported, updated, purged, lista: next }
}
