/** Parse, consulta CEP e montagem de endereço canônico para igrejas. */

export function formatarCep(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

export function extrairCepDoTexto(s) {
  const m = String(s || '').match(/\b(\d{5})-?(\d{3})\b/)
  return m ? `${m[1]}${m[2]}` : ''
}

/** Parse endereço brasileiro comum em fichas de igreja. */
export function parseEnderecoIgreja(raw = '') {
  let s = String(raw || '').trim().replace(/,\s*$/, '')
  if (!s) return null

  const cep = extrairCepDoTexto(s)
  if (cep) s = s.replace(/\b\d{5}-?\d{3}\b/, '').replace(/CEP\s*/i, '').trim()

  let uf = 'SC'
  let cidade = 'Blumenau'
  let bairro = ''
  let logradouro = s
  let numero = ''

  const ufMatch = s.match(/,\s*([A-Za-zÀ-ú\s]+)\s*-\s*(SC|PR|RS|SP|RJ|MG|ES|BA|CE|PE|GO|DF|MT|MS|PA|AM|RO|AC|AP|RR|TO|MA|PI|RN|PB|SE|AL|RN)\s*$/i)
  if (ufMatch) {
    cidade = ufMatch[1].trim()
    uf = ufMatch[2].toUpperCase()
    s = s.slice(0, ufMatch.index).trim()
  }

  const dashParts = s.split(/\s*-\s*/)
  if (dashParts.length >= 2) {
    bairro = dashParts.pop().trim()
    logradouro = dashParts.join(' - ').trim()
  } else {
    logradouro = s
  }

  const sn = /\b(S\/N|S\.?\s*N\.?|SN)\b/i
  const numMatch = logradouro.match(/,\s*(\d+[A-Za-z]?)\s*$/)
    || logradouro.match(/\s+(\d+[A-Za-z]?)\s*$/)
  if (numMatch) {
    numero = numMatch[1]
    logradouro = logradouro.slice(0, numMatch.index).replace(/,\s*$/, '').trim()
  } else if (sn.test(logradouro)) {
    numero = 'S/N'
    logradouro = logradouro.replace(sn, '').replace(/,\s*$/, '').trim()
  }

  logradouro = logradouro
    .replace(/^R\.\s*/i, 'Rua ')
    .replace(/^AV\.\s*/i, 'Avenida ')
    .replace(/^AL\.\s*/i, 'Alameda ')
    .replace(/^DR\.\s*/i, 'Dr. ')
    .replace(/^PROF\.\s*/i, 'Prof. ')
    .trim()

  if (!bairro && logradouro.includes(',')) {
    const bits = logradouro.split(',').map(x => x.trim())
    if (bits.length >= 2) {
      logradouro = bits[0]
      if (!numero && /^\d/.test(bits[1])) numero = bits[1]
      else bairro = bits[1]
    }
  }

  return { cep, logradouro, numero, bairro, cidade, uf, enderecoOriginal: raw }
}

export function montarEnderecoIgrejaCampos(form = {}) {
  const log = String(form.logradouro || '').trim()
  const num = String(form.numero || '').trim()
  const bairro = String(form.bairro || form.setor || '').trim()
  const cidade = String(form.cidade || 'Blumenau').trim()
  const uf = String(form.uf || 'SC').trim().toUpperCase().slice(0, 2)
  const cepFmt = formatarCep(form.cep || '')

  const partes = []
  if (log) partes.push(num ? `${log}, ${num}` : log)
  const loc = [bairro, cidade && uf ? `${cidade} - ${uf}` : cidade].filter(Boolean).join(', ')
  if (loc) partes.push(loc)
  if (cepFmt.length === 9) partes.push(`CEP ${cepFmt}`)
  return partes.filter(Boolean).join(', ')
}

export function mergeCepEmCampos(parsed, cepData) {
  if (!parsed || !cepData) return parsed
  const bairroCep = cepData.bairro || ''
  const bairro = parsed.bairro || bairroCep || ''
  const next = {
    ...parsed,
    cep: cepData.cep || parsed.cep || '',
    logradouro: cepData.logradouro || parsed.logradouro || '',
    bairro,
    cidade: cepData.localidade || parsed.cidade || 'Blumenau',
    uf: cepData.uf || parsed.uf || 'SC',
  }
  next.endereco = montarEnderecoIgrejaCampos(next)
  return next
}

function normTxt(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Ruas compatíveis o suficiente para confiar no CEP encontrado. */
export function ruasCompativelCep(a, b) {
  const na = normTxt(a)
  const nb = normTxt(b)
  if (!na || !nb) return true
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  const wa = na.split(' ').filter(w => w.length > 2)
  const wb = nb.split(' ').filter(w => w.length > 2)
  const comum = wa.filter(w => wb.includes(w))
  return comum.length >= Math.min(2, Math.min(wa.length, wb.length))
}

export async function buscarEnderecoPorCepClient(cep, fetchImpl = fetch) {
  const digits = String(cep || '').replace(/\D/g, '')
  if (digits.length !== 8) return null
  const urls = [
    `https://viacep.com.br/ws/${digits}/json/`,
    `https://brasilapi.com.br/api/cep/v2/${digits}`,
    `https://opencep.com/v1/${digits}`,
  ]
  for (const url of urls) {
    try {
      const res = await fetchImpl(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) continue
      const raw = await res.json()
      if (raw?.erro || raw?.error) continue
      const out = {
        cep: digits,
        logradouro: String(raw.logradouro || raw.street || '').trim(),
        bairro: String(raw.bairro || raw.neighborhood || '').trim(),
        localidade: String(raw.localidade || raw.city || '').trim(),
        uf: String(raw.uf || raw.state || '').trim().toUpperCase().slice(0, 2),
      }
      if (out.localidade || out.logradouro) return out
    } catch { /* próxima fonte */ }
  }
  return null
}
