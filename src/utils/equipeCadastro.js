/** Qualidade de cadastro e indicações da equipe — alinhado ao formulário de membro */

export function labelIndicacao(membro, membros = []) {
  if (membro?.indicacaoMembroId && membro.indicacaoMembroId !== '__outro__') {
    const ref = membros.find(m => String(m.id) === String(membro.indicacaoMembroId))
    return (ref?.nome || membro.indicacaoPor || '').trim()
  }
  return String(membro?.indicacaoPor || '').trim()
}

export function cpfMembro(m) {
  return String(m?.cpf || '').trim()
}

export function rgMembro(m) {
  return String(m?.rg || '').trim()
}

function temTexto(v) {
  return Boolean(String(v ?? '').trim())
}

function temTelefone(m) {
  return Boolean(String(m?.telefone || '').replace(/\D/g, ''))
}

function temSalario(m) {
  const n = parseFloat(String(m?.salario ?? '').replace(',', '.'))
  return Number.isFinite(n) && n > 0
}

function temEndereco(m) {
  const logradouro = temTexto(m?.logradouro)
  const cidade = temTexto(m?.cidade)
  const bairro = temTexto(m?.bairroResidencia)
  const cep = Boolean(String(m?.cep || '').replace(/\D/g, '').length >= 8)
  // Considera preenchido se tiver logradouro+cidade, ou CEP+cidade, ou bairro+cidade
  return (logradouro && cidade) || (cep && cidade) || (bairro && cidade && (logradouro || cep))
}

function ehVoluntario(m) {
  return String(m?.vinculo || '').trim() === 'Voluntário'
}

/** Apoiador / Comunidade WhatsApp — sem remuneração. */
function ehSemRemuneracao(m) {
  if (ehVoluntario(m)) return true
  const c = String(m?.cargo || '')
  return c === 'Apoiador'
    || c === 'Assessor'
    || c === 'Voluntário'
    || c === 'Apoiadores'
    || c === 'Comunidade WhatsApp'
    || m?.origem === 'cadastro_publico'
    || String(m?.id || '').startsWith('lead-')
}

function okPagamentoCampo(m, campo) {
  return ehSemRemuneracao(m) || temTexto(m?.[campo])
}

/**
 * Campos do cadastro de membro usados na aba Indicações / relatório.
 * `ok` = preenchido. Campos condicionais usam `ok` que retorna true quando não se aplica.
 */
export const CAMPOS_CADASTRO = [
  { key: 'telefone', label: 'Telefone', ok: m => temTelefone(m) },
  { key: 'cpf', label: 'CPF', ok: m => Boolean(cpfMembro(m)) },
  { key: 'rg', label: 'RG', ok: m => Boolean(rgMembro(m)) },
  { key: 'email', label: 'E-mail', ok: m => temTexto(m?.email) },
  { key: 'dataNascimento', label: 'Data de nascimento', ok: m => temTexto(m?.dataNascimento) },
  { key: 'endereco', label: 'Endereço residencial', ok: m => temEndereco(m) },
  { key: 'cidadeAtuacao', label: 'Cidade de atuação', ok: m => temTexto(m?.cidadeAtuacao) },
  {
    key: 'bairros',
    label: 'Bairro de atuação',
    ok: m => Array.isArray(m?.bairros) && m.bairros.length > 0,
  },
  { key: 'vinculo', label: 'Tipo de vínculo', ok: m => temTexto(m?.vinculo) },
  {
    key: 'salario',
    label: 'Remuneração',
    ok: m => ehSemRemuneracao(m) || temSalario(m),
  },
  { key: 'dataInicio', label: 'Data de início', ok: m => temTexto(m?.dataInicio) },
  {
    // Nº do contrato só é liberado depois — não entra no % nem nas pendências
    key: 'contrato',
    label: 'Nº do contrato',
    ok: () => true,
    opcional: true,
  },
  { key: 'banco', label: 'Banco', ok: m => okPagamentoCampo(m, 'banco') },
  { key: 'agencia', label: 'Agência', ok: m => okPagamentoCampo(m, 'agencia') },
  { key: 'conta', label: 'Conta', ok: m => okPagamentoCampo(m, 'conta') },
  { key: 'pix', label: 'PIX', ok: m => okPagamentoCampo(m, 'pix') },
  {
    key: 'indicacao',
    label: 'Indicação',
    ok: (m, lista) => Boolean(labelIndicacao(m, lista)),
  },
  {
    key: 'igreja',
    label: 'Igreja',
    ok: m => String(m?.cargo || '') !== 'Igreja' || temTexto(m?.igrejaNome) || Boolean(m?.igrejaId),
  },
  {
    key: 'cargoIgreja',
    label: 'Cargo na igreja',
    ok: m => String(m?.cargo || '') !== 'Igreja' || temTexto(m?.cargoIgreja),
  },
]

export function pendenciasCadastro(m, membros = []) {
  return CAMPOS_CADASTRO.filter(c => !c.ok(m, membros)).map(c => c.label)
}

export function pctCadastro(m, membros = []) {
  const aplicaveis = CAMPOS_CADASTRO.filter(c => {
    if (c.opcional || c.key === 'contrato') return false
    // igreja só conta no percentual quando cargo é Igreja
    if (c.key === 'igreja' || c.key === 'cargoIgreja') {
      return String(m?.cargo || '') === 'Igreja'
    }
    return true
  })
  const total = aplicaveis.length || 1
  const ok = aplicaveis.filter(c => c.ok(m, membros)).length
  return Math.round((ok / total) * 100)
}

export function cadastroCompleto(m, membros = []) {
  return pendenciasCadastro(m, membros).length === 0
}

function fmtDataBr(raw) {
  if (!raw) return ''
  const s = String(raw).trim()
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [d, mo, y] = s.split('/')
    return `${d.padStart(2, '0')}/${mo.padStart(2, '0')}/${y}`
  }
  const [y, mo, d] = s.slice(0, 10).split('-')
  if (y && mo && d && y.length === 4) return `${d}/${mo}/${y}`
  const dig = s.replace(/\D/g, '')
  if (dig.length === 8) return `${dig.slice(0, 2)}/${dig.slice(2, 4)}/${dig.slice(4)}`
  return s
}

function fmtSalarioBr(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return v ? String(v) : ''
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarEnderecoLinha(m) {
  if (!m) return ''
  const partes = []
  const rua = [m.logradouro, m.numero].filter(Boolean).join(', ')
  if (rua) partes.push(rua)
  if (m.complemento) partes.push(m.complemento)
  if (m.bairroResidencia) partes.push(m.bairroResidencia)
  const cidadeUf = [m.cidade, m.estado].filter(Boolean).join('/')
  if (cidadeUf) partes.push(cidadeUf)
  if (m.cep) partes.push(`CEP ${m.cep}`)
  return partes.join(' — ')
}

/**
 * Lista campo a campo (como no formulário) com valor preenchido ou vazio.
 * Usado no relatório PDF / WhatsApp.
 * @param {{ omitirSalario?: boolean }} opts — omitirSalario: true no Relatório de Indicações
 */
export function checklistCadastro(m, membros = [], opts = {}) {
  const { omitirSalario = false } = opts
  const end = formatarEnderecoLinha(m)
  const bairros = Array.isArray(m?.bairros) ? m.bairros.join(', ') : ''
  const semRem = ehSemRemuneracao(m)

  const items = [
    { key: 'telefone', label: 'Telefone', valor: String(m?.telefone || '').trim() },
    { key: 'cpf', label: 'CPF', valor: cpfMembro(m) },
    { key: 'rg', label: 'RG', valor: rgMembro(m) },
    { key: 'email', label: 'E-mail', valor: String(m?.email || '').trim() },
    { key: 'dataNascimento', label: 'Data de nascimento', valor: fmtDataBr(m?.dataNascimento) },
    { key: 'endereco', label: 'Endereço residencial', valor: end },
    { key: 'cidadeAtuacao', label: 'Cidade de atuação', valor: String(m?.cidadeAtuacao || '').trim() },
    { key: 'bairros', label: 'Bairro de atuação', valor: bairros },
    { key: 'vinculo', label: 'Tipo de vínculo', valor: String(m?.vinculo || '').trim() },
    {
      key: 'salario',
      label: 'Remuneração',
      valor: temSalario(m) ? fmtSalarioBr(m.salario) : '',
      opcional: semRem,
    },
    { key: 'dataInicio', label: 'Data de início', valor: fmtDataBr(m?.dataInicio) },
    {
      key: 'contrato',
      label: 'Nº do contrato',
      valor: String(m?.contrato || '').trim(),
      opcional: true,
    },
    { key: 'banco', label: 'Banco', valor: String(m?.banco || '').trim(), opcional: semRem },
    { key: 'agencia', label: 'Agência', valor: String(m?.agencia || '').trim(), opcional: semRem },
    { key: 'conta', label: 'Conta', valor: String(m?.conta || '').trim(), opcional: semRem },
    { key: 'pix', label: 'PIX', valor: String(m?.pix || '').trim(), opcional: semRem },
    { key: 'indicacao', label: 'Indicação', valor: labelIndicacao(m, membros) },
  ]

  if (String(m?.cargo || '') === 'Igreja') {
    items.push(
      { key: 'igreja', label: 'Igreja', valor: String(m?.igrejaNome || '').trim() },
      { key: 'cargoIgreja', label: 'Cargo na igreja', valor: String(m?.cargoIgreja || '').trim() },
    )
  }

  return items
    .filter(it => !(omitirSalario && it.key === 'salario'))
    .map(it => {
      const def = CAMPOS_CADASTRO.find(c => c.key === it.key)
      const ok = def ? def.ok(m, membros) : Boolean(it.valor)
      return {
        ...it,
        ok,
        falta: !ok && !it.opcional,
      }
    })
}

/** Checklist do Relatório de Indicações — sem remuneração (valor sensível). */
export function checklistCadastroIndicacoes(m, membros = []) {
  return checklistCadastro(m, membros, { omitirSalario: true })
}
