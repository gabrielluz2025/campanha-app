/** Formatação e validação de telefone (BR + estrangeiro) para o formulário público */

/** DDDs válidos no Brasil (Anatel) */
export const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
])

/** Prefixos internacionais mais comuns → país */
const PAISES = [
  { code: '55', nome: 'Brasil', flag: '🇧🇷' },
  { code: '1', nome: 'EUA / Canadá', flag: '🇺🇸' },
  { code: '54', nome: 'Argentina', flag: '🇦🇷' },
  { code: '598', nome: 'Uruguai', flag: '🇺🇾' },
  { code: '595', nome: 'Paraguai', flag: '🇵🇾' },
  { code: '56', nome: 'Chile', flag: '🇨🇱' },
  { code: '57', nome: 'Colômbia', flag: '🇨🇴' },
  { code: '51', nome: 'Peru', flag: '🇵🇪' },
  { code: '593', nome: 'Equador', flag: '🇪🇨' },
  { code: '58', nome: 'Venezuela', flag: '🇻🇪' },
  { code: '351', nome: 'Portugal', flag: '🇵🇹' },
  { code: '34', nome: 'Espanha', flag: '🇪🇸' },
  { code: '39', nome: 'Itália', flag: '🇮🇹' },
  { code: '33', nome: 'França', flag: '🇫🇷' },
  { code: '49', nome: 'Alemanha', flag: '🇩🇪' },
  { code: '44', nome: 'Reino Unido', flag: '🇬🇧' },
  { code: '81', nome: 'Japão', flag: '🇯🇵' },
  { code: '86', nome: 'China', flag: '🇨🇳' },
  { code: '52', nome: 'México', flag: '🇲🇽' },
  { code: '244', nome: 'Angola', flag: '🇦🇴' },
  { code: '258', nome: 'Moçambique', flag: '🇲🇿' },
]

function detectarPais(digits) {
  const sorted = [...PAISES].sort((a, b) => b.code.length - a.code.length)
  for (const p of sorted) {
    if (digits.startsWith(p.code)) return p
  }
  return { code: digits.slice(0, 2), nome: 'Exterior', flag: '🌐' }
}

/**
 * Extrai dígitos nacionais BR (sem auto-inserir o 9).
 * Usado na máscara enquanto digita — NÃO inserir 9 no meio da digitação
 * (isso deslocava o cursor e “travava” o campo no celular).
 */
export function digitosNacionaisBr(rawDigits) {
  let d = String(rawDigits || '').replace(/\D/g, '')
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2)
  return d.slice(0, 11)
}

/**
 * Normaliza dígitos BR para validação/envio:
 * - remove DDI 55 se presente
 * - se celular antigo (8 dígitos após DDD começando em 6–9), acrescenta o 9
 */
export function normalizarDigitosBr(rawDigits) {
  let d = digitosNacionaisBr(rawDigits)

  if (d.length === 10) {
    const ddd = d.slice(0, 2)
    const local = d.slice(2)
    // Celular antigo sem o 9: DDD + 8 dígitos começando em 6–9
    if (/^[6-9]/.test(local)) {
      d = ddd + '9' + local
    }
  }
  return d
}

/** Máscara visual enquanto digita (sem auto-9) */
export function formatTelefoneInput(raw) {
  const s = String(raw || '')
  const hasPlus = s.trim().startsWith('+')
  let digits = s.replace(/\D/g, '')

  // Internacional explícito (+ ou 00)
  if (hasPlus || s.trim().startsWith('00')) {
    if (s.trim().startsWith('00')) digits = digits.replace(/^00/, '')
    // Se for +55… trata como BR
    if (digits.startsWith('55') && digits.length >= 4) {
      return formatBrMask(digitosNacionaisBr(digits))
    }
    // Mantém + e dígitos (até 15)
    const intl = digits.slice(0, 15)
    return intl ? `+${intl}` : '+'
  }

  return formatBrMask(digitosNacionaisBr(digits))
}

function formatBrMask(d) {
  if (!d) return ''
  if (d.length <= 2) return d.length === 2 ? `(${d}` : d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`
}

/** Máscara DD/MM/AAAA enquanto digita */
export function formatDataBrInput(raw) {
  const d = String(raw || '').replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

/**
 * Valida data BR (DD/MM/AAAA). Aceita também ISO YYYY-MM-DD (ex.: type=date antigo).
 * @returns {{ ok: boolean, formatted: string, iso: string, erro: string|null }}
 */
export function analisarDataBr(raw) {
  const s = String(raw || '').trim()
  if (!s) {
    return { ok: false, formatted: '', iso: '', erro: 'Informe a data de nascimento.' }
  }

  let dd
  let mm
  let yyyy
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    yyyy = isoMatch[1]
    mm = isoMatch[2]
    dd = isoMatch[3]
  } else {
    const digits = s.replace(/\D/g, '')
    if (digits.length !== 8) {
      return {
        ok: false,
        formatted: formatDataBrInput(s),
        iso: '',
        erro: 'Use o formato DD/MM/AAAA.',
      }
    }
    dd = digits.slice(0, 2)
    mm = digits.slice(2, 4)
    yyyy = digits.slice(4, 8)
  }

  const day = Number(dd)
  const month = Number(mm)
  const year = Number(yyyy)
  const formatted = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${yyyy}`

  if (year < 1900 || year > new Date().getFullYear()) {
    return { ok: false, formatted, iso: '', erro: 'Ano de nascimento inválido.' }
  }
  if (month < 1 || month > 12) {
    return { ok: false, formatted, iso: '', erro: 'Mês inválido. Use 01 a 12.' }
  }
  if (day < 1 || day > 31) {
    return { ok: false, formatted, iso: '', erro: 'Dia inválido.' }
  }

  const dt = new Date(year, month - 1, day)
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) {
    return { ok: false, formatted, iso: '', erro: 'Data de nascimento inválida.' }
  }
  if (dt > new Date()) {
    return { ok: false, formatted, iso: '', erro: 'A data não pode ser no futuro.' }
  }

  const iso = `${yyyy}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return { ok: true, formatted, iso, erro: null }
}

/**
 * Analisa o telefone para UI e validação no envio.
 * @returns {{
 *   ok: boolean,
 *   formatted: string,
 *   digits: string,
 *   erro: string|null,
 *   aviso: string|null,
 *   estrangeiro: boolean,
 *   pais: string|null,
 * }}
 */
export function analisarTelefone(raw) {
  const s = String(raw || '').trim()
  if (!s) {
    return { ok: false, formatted: '', digits: '', erro: 'Informe o celular / WhatsApp.', aviso: null, estrangeiro: false, pais: null }
  }

  const hasPlus = s.startsWith('+')
  const starts00 = s.startsWith('00')
  let digits = s.replace(/\D/g, '')
  if (starts00) digits = digits.replace(/^00/, '')

  // Estrangeiro: +xxx (não 55) ou 00xxx
  const looksIntl = (hasPlus || starts00) && digits.length >= 8
  const isBrIntl = digits.startsWith('55') && (digits.length === 12 || digits.length === 13)

  if (looksIntl && !isBrIntl && !digits.startsWith('55')) {
    const pais = detectarPais(digits)
    const formatted = `+${digits}`
    const ok = digits.length >= 8 && digits.length <= 15
    return {
      ok,
      formatted,
      digits,
      erro: ok ? null : 'Número internacional incompleto.',
      aviso: ok ? `${pais.flag} Contato estrangeiro: ${pais.nome} (+${pais.code})` : null,
      estrangeiro: true,
      pais: pais.nome,
    }
  }

  // Brasil
  const br = normalizarDigitosBr(digits)
  const formatted = formatBrMask(br)
  const ddd = Number(br.slice(0, 2))

  if (br.length < 10) {
    return {
      ok: false,
      formatted,
      digits: br,
      erro: br.length <= 2
        ? 'Informe o DDD e o número completo.'
        : `Número incompleto — faltam ${10 - br.length} dígito(s). Use DDD + número.`,
      aviso: null,
      estrangeiro: false,
      pais: 'Brasil',
    }
  }

  if (!DDDS_VALIDOS.has(ddd)) {
    return {
      ok: false,
      formatted,
      digits: br,
      erro: `DDD ${String(ddd).padStart(2, '0')} inválido. Confira o código de área.`,
      aviso: null,
      estrangeiro: false,
      pais: 'Brasil',
    }
  }

  const local = br.slice(2)
  const isMobile = local.length === 9 && local.startsWith('9')
  const isLandline = local.length === 8 && /^[2-5]/.test(local)

  if (local.length === 9 && !local.startsWith('9')) {
    return {
      ok: false,
      formatted,
      digits: br,
      erro: 'Celular deve começar com 9 após o DDD (ex.: (47) 9XXXX-XXXX).',
      aviso: null,
      estrangeiro: false,
      pais: 'Brasil',
    }
  }

  if (!isMobile && !isLandline) {
    return {
      ok: false,
      formatted,
      digits: br,
      erro: 'Use celular com 9 dígitos (9XXXX-XXXX) ou fixo com 8 dígitos.',
      aviso: null,
      estrangeiro: false,
      pais: 'Brasil',
    }
  }

  // Se usuário digitou 10 dígitos de celular antigo, já normalizamos — avisar
  const rawNational = digits.replace(/^55/, '')
  const addedNine = rawNational.length === 10 && /^[6-9]/.test(rawNational.slice(2)) && isMobile
  return {
    ok: true,
    formatted,
    digits: br,
    erro: null,
    aviso: addedNine
      ? 'Adicionamos o 9 do celular automaticamente.'
      : isMobile
        ? null
        : 'Número de telefone fixo detectado.',
    estrangeiro: false,
    pais: 'Brasil',
  }
}

/** Capitaliza cada palavra do nome (mantém de/da/do/dos/das/e em minúsculo no meio) */
export function capitalizarNome(raw) {
  const s = String(raw || '')
  if (!s) return ''
  const lower = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'di', 'du'])
  return s
    .split(/(\s+)/)
    .map((part, i, arr) => {
      if (/^\s+$/.test(part)) return part
      const word = part.toLocaleLowerCase('pt-BR')
      // Primeira palavra sempre capitaliza; conectores no meio ficam minúsculos
      const isFirst = arr.slice(0, i).every(p => /^\s*$/.test(p))
      if (!isFirst && lower.has(word)) return word
      if (!word) return word
      return word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1)
    })
    .join('')
}

export function isCampoCep(campo) {
  if (!campo) return false
  if (campo.tipo === 'cep') return true
  const id = String(campo.id || '').toLowerCase()
  const label = String(campo.label || '').toLowerCase()
  return id === 'cep' || /^cep\b/.test(label)
}

/** Data de nascimento (máscara DD/MM/AAAA) */
export function isCampoDataNascimento(campo) {
  if (!campo) return false
  if (campo.tipo === 'date') return true
  const id = String(campo.id || '').toLowerCase()
  const label = String(campo.label || '').toLowerCase()
  return id === 'data_nascimento' || id === 'nascimento' || id === 'datanascimento'
    || /nasciment|data\s*de\s*nasc/.test(label)
}

export function isCampoRua(campo) {
  if (!campo) return false
  const id = String(campo.id || '').toLowerCase()
  const label = String(campo.label || '').toLowerCase()
  return id === 'logradouro' || id === 'rua' || id === 'endereco'
    || /^(rua|logradouro|endereco|endereço)$/.test(id)
    || /\b(rua|logradouro|endere[cç]o)\b/.test(label)
}

export function formatCpfInput(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}
