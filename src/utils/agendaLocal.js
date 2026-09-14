/** Utilitários de local/endereço para eventos da agenda */

export function formatarCep(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

export function montarEnderecoViaCep(data) {
  if (!data || data.erro) return ''
  const partes = []
  if (data.logradouro) partes.push(data.logradouro)
  const sufixo = [data.bairro, data.localidade && data.uf ? `${data.localidade}/${data.uf}` : data.localidade]
    .filter(Boolean)
    .join(' — ')
  if (sufixo) partes.push(sufixo)
  return partes.join(', ')
}

/** Monta endereço completo a partir dos campos do formulário de igreja. */
export function montarEnderecoIgreja(form = {}) {
  const manual = String(form.endereco || '').trim()
  const log = String(form.logradouro || '').trim()
  const num = String(form.numero || '').trim()
  const comp = String(form.complemento || '').trim()
  const bairro = String(form.bairro || form.setor || '').trim()
  const cidade = String(form.cidade || form.localidade || 'Blumenau').trim()
  const uf = String(form.uf || 'SC').trim().toUpperCase().slice(0, 2)
  const cepFmt = formatarCep(form.cep || '')

  if (!log && manual.length >= 8) return manual

  const partes = []
  if (log) partes.push(num ? `${log}, ${num}` : log)
  else if (manual && !log) {
    // endereço digitado manualmente sem logradouro separado
    if (num && !manual.includes(num)) partes.push(`${manual}, ${num}`)
    else partes.push(manual)
  }
  if (comp) partes.push(comp)
  const loc = [bairro, cidade && uf ? `${cidade} - ${uf}` : cidade].filter(Boolean).join(', ')
  if (loc) partes.push(loc)
  if (cepFmt.length === 9) partes.push(`CEP ${cepFmt}`)
  return partes.filter(Boolean).join(', ')
}

/** Preenche formulário de igreja com dados do CEP. */
export function mergeCepEmFormIgreja(form, cepData) {
  if (!cepData) return form
  const bairro = cepData.bairro || form.bairro || ''
  const next = {
    ...form,
    cep: cepData.cep || form.cep || '',
    logradouro: cepData.logradouro || form.logradouro || '',
    bairro,
    cidade: cepData.localidade || form.cidade || 'Blumenau',
    uf: cepData.uf || form.uf || 'SC',
    setor: form.setor || bairro || '',
  }
  next.endereco = montarEnderecoIgreja(next)
  return next
}

function normalizeCepClient(data) {
  if (!data || typeof data !== 'object') return null
  if (data.erro || data.error) return null

  const logradouro = String(data.logradouro || data.street || '').trim()
  const bairro = String(data.bairro || data.neighborhood || '').trim()
  const localidade = String(data.localidade || data.city || '').trim()
  const uf = String(data.uf || data.state || '').trim().toUpperCase().slice(0, 2)
  const cep = String(data.cep || '').replace(/\D/g, '')

  if (!localidade && !uf && !logradouro) return null

  const out = {
    cep,
    logradouro,
    bairro,
    localidade,
    uf,
    complemento: String(data.complemento || '').trim(),
    ibge: typeof data.ibge === 'object' ? String(data.ibge?.city || '') : String(data.ibge || ''),
  }
  return { ...out, endereco: montarEnderecoViaCep(out) }
}

async function fetchJsonCep(url, { signal, timeoutMs = 7000 } = {}) {
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  if (signal) {
    if (signal.aborted) ctrl.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onAbort)
  }
}

/**
 * Consulta CEP em qualquer cidade/UF do Brasil.
 * Tenta ViaCEP → BrasilAPI → OpenCEP → proxy do servidor (api.php).
 */
export async function buscarEnderecoPorCep(cep, { signal } = {}) {
  const digits = String(cep || '').replace(/\D/g, '')
  if (digits.length !== 8) return null

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const sources = [
    `https://viacep.com.br/ws/${digits}/json/`,
    `https://brasilapi.com.br/api/cep/v2/${digits}`,
    `https://opencep.com/v1/${digits}`,
    `${origin}/api.php?action=cep&cep=${digits}`,
  ]

  for (const url of sources) {
    if (signal?.aborted) return null
    const raw = await fetchJsonCep(url, { signal })
    const norm = normalizeCepClient(raw)
    if (norm) return norm
  }
  return null
}

/** Monta o melhor texto para Google Maps / Waze */
export function enderecoNavegacao(ev) {
  if (!ev) return ''
  const endereco = String(ev.endereco || '').trim()
  const cep = String(ev.cep || '').replace(/\D/g, '')
  const local = String(ev.local || '').trim()

  if (endereco && cep) return `${endereco}, CEP ${formatarCep(cep)}`
  if (endereco) return endereco

  // Legado: "Igreja — Rua X" no campo local
  if (local.includes(' — ')) {
    const partes = local.split(' — ')
    if (partes.length >= 2) return partes.slice(1).join(' — ').trim()
  }
  return local
}

export function dadosLocalIgreja(ig) {
  return {
    local: ig.nome || '',
    endereco: ig.endereco || '',
    cep: ig.cep || '',
  }
}

export function normalizarEventoLocal(ev) {
  if (!ev) return ev
  const local = ev.local || ''
  let endereco = ev.endereco || ''
  let cep = ev.cep || ''
  if (!endereco && local.includes(' — ')) {
    const idx = local.indexOf(' — ')
    endereco = local.slice(idx + 3).trim()
  }
  return { ...ev, local: local.includes(' — ') ? local.slice(0, local.indexOf(' — ')).trim() : local, endereco, cep }
}
