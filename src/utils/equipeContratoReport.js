/** Formatação e normalização de dados de membros para relatório de contratos */

function fmtData(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  if (!y || !m || !d) return String(iso)
  return `${d}/${m}/${y}`
}

function fmtSalario(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return v ? String(v) : ''
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarEndereco(m) {
  if (!m) return ''
  const partes = []
  const rua = [m.logradouro, m.numero].filter(Boolean).join(', ')
  if (rua) partes.push(rua)
  if (m.bairroResidencia) partes.push(m.bairroResidencia)
  const cidadeUf = [m.cidade, m.estado].filter(Boolean).join('/')
  if (cidadeUf) partes.push(cidadeUf)
  if (m.cep) partes.push(`CEP ${m.cep}`)
  return partes.join(' — ')
}

/** Extrai apenas campos relevantes para contrato */
export function membroParaRelatorio(m) {
  if (!m) return null
  return {
    id: m.id || '',
    nome: m.nome || '',
    cpf: m.cpf || '',
    dataNascimento: m.dataNascimento || '',
    telefone: m.telefone || '',
    cep: m.cep || '',
    logradouro: m.logradouro || '',
    numero: m.numero || '',
    bairroResidencia: m.bairroResidencia || '',
    cidade: m.cidade || '',
    estado: m.estado || '',
    cargo: m.cargo || '',
    vinculo: m.vinculo || '',
    salario: m.salario || '',
    dataInicio: m.dataInicio || '',
    contrato: m.contrato || '',
    banco: m.banco || '',
    agencia: m.agencia || '',
    conta: m.conta || '',
    pix: m.pix || '',
    observacoes: m.observacoes || '',
  }
}

/** Lista campos obrigatórios ainda vazios (para aviso antes de enviar) */
export function camposFaltando(m) {
  const faltas = []
  if (!m?.cpf?.trim()) faltas.push('CPF')
  const temEndereco = Boolean(
    (m?.logradouro || '').trim() ||
    (m?.cep || '').trim() ||
    (m?.cidade || '').trim() ||
    (m?.bairroResidencia || '').trim()
  )
  if (!temEndereco) faltas.push('Endereço')
  if (!m?.vinculo?.trim()) faltas.push('Vínculo')
  return faltas
}

/** Bloco de texto de um membro (copiável) */
export function formatarMembroTexto(m, { indice, total } = {}) {
  const r = membroParaRelatorio(m)
  if (!r) return ''
  const linhas = []
  if (indice != null && total != null) {
    linhas.push(`MEMBRO ${indice}/${total}`)
  }
  linhas.push(`Nome: ${r.nome || '—'}`)
  linhas.push(`CPF: ${r.cpf || '—'}`)
  linhas.push(`Data de nascimento: ${r.dataNascimento ? fmtData(r.dataNascimento) : '—'}`)
  linhas.push(`Telefone: ${r.telefone || '—'}`)
  linhas.push(`Endereço: ${formatarEndereco(r) || '—'}`)
  if (r.cep) linhas.push(`CEP: ${r.cep}`)
  if (r.logradouro) linhas.push(`Logradouro: ${r.logradouro}${r.numero ? `, ${r.numero}` : ''}`)
  if (r.bairroResidencia) linhas.push(`Bairro: ${r.bairroResidencia}`)
  if (r.cidade || r.estado) linhas.push(`Cidade/UF: ${[r.cidade, r.estado].filter(Boolean).join('/')}`)
  linhas.push(`Cargo: ${r.cargo || '—'}`)
  linhas.push(`Vínculo: ${r.vinculo || '—'}`)
  linhas.push(`Remuneração: ${r.salario ? fmtSalario(r.salario) : '—'}`)
  linhas.push(`Data de início: ${r.dataInicio ? fmtData(r.dataInicio) : '—'}`)
  linhas.push(`Nº do contrato: ${r.contrato || '—'}`)
  linhas.push(`Banco: ${r.banco || '—'}`)
  linhas.push(`Agência: ${r.agencia || '—'}`)
  linhas.push(`Conta: ${r.conta || '—'}`)
  linhas.push(`PIX: ${r.pix || '—'}`)
  if (r.observacoes) linhas.push(`Observações: ${r.observacoes}`)
  return linhas.join('\n')
}

/** Relatório completo — membros separados por --- */
export function formatarRelatorioTexto(membros = []) {
  const lista = (membros || []).filter(Boolean)
  if (!lista.length) return ''
  return lista
    .map((m, i) => formatarMembroTexto(m, { indice: i + 1, total: lista.length }))
    .join('\n\n---\n\n')
}

export function formatarDataExibicao(iso) {
  return fmtData(iso)
}

export function formatarSalarioExibicao(v) {
  return fmtSalario(v)
}

export function formatarEnderecoExibicao(m) {
  return formatarEndereco(m)
}

/** Copia texto para a área de transferência */
export async function copiarTexto(texto) {
  const t = String(texto || '')
  if (!t) return false
  try {
    await navigator.clipboard.writeText(t)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = t
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}
