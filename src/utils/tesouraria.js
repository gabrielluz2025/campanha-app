/** Tesouraria — caixa eleitoral da campanha. */

import { readStorage, writeStorage } from './persist'
import {
  parseValor, fmtMoeda, fmtData, fmtTamanho, hojeIso, lerArquivoBase64, uidFin,
  TIPOS_PAGAMENTO,
} from './equipeFinanceiro'
import { calcularPrevisaoCompleta } from './previsaoCalculo'

export const TESOURARIA_KEY = 'tesouraria_movimentos'
export const TESOURARIA_CONTA_KEY = 'tesouraria_conta'

export const TIPOS_MOVIMENTO = [
  { id: 'entrada', label: 'Entrada', cor: '#34d399' },
  { id: 'saida', label: 'Saída', cor: '#f87171' },
]

export const STATUS_MOVIMENTO = [
  { id: 'confirmado', label: 'Confirmado', cor: '#34d399' },
  { id: 'previsto', label: 'Previsto', cor: '#fbbf24' },
  { id: 'cancelado', label: 'Cancelado', cor: '#94a3b8' },
]

/** Fontes de recurso (entradas) — natureza eleitoral */
export const FONTES_RECURSO = [
  'Recursos próprios do candidato',
  'Doação de pessoa física',
  'Fundo Eleitoral / FEFC',
  'Fundo partidário',
  'Financiamento coletivo',
  'Transferência de comitê / partido',
  'Evento / jantar / arrecadação',
  'Reembolso',
  'Outras receitas',
]

/** Destinos de gasto (saídas) — tipificação operacional */
export const DESTINOS_GASTO = [
  'Propaganda / gráfica',
  'Marketing digital / mídia',
  'Pessoal / equipe',
  'Comitê / aluguel',
  'Combustível / deslocamento',
  'Eventos / alimentação',
  'Pesquisa eleitoral',
  'Material de expediente',
  'Serviços jurídicos / contábeis',
  'Serviços / fornecedor',
  'Taxas / tarifas bancárias',
  'Outros gastos eleitorais',
]

export const CATEGORIAS_ENTRADA = FONTES_RECURSO
export const CATEGORIAS_SAIDA = DESTINOS_GASTO

export const FORMAS_PAGAMENTO = [
  ...TIPOS_PAGAMENTO,
  'Boleto',
  'Cartão',
]

export const BANCOS_SUGERIDOS = [
  'Banco do Brasil',
  'Caixa Econômica Federal',
  'Bradesco',
  'Itaú',
  'Santander',
  'Sicoob',
  'Sicredi',
  'Nubank',
  'Inter',
  'Outro',
]

export const CARGOS_CAMPANHA = [
  'Deputado Federal',
  'Deputado Estadual',
  'Senador',
  'Governador',
  'Prefeito',
  'Vereador',
  'Outro',
]

export { parseValor, fmtMoeda, fmtData, fmtTamanho, hojeIso, lerArquivoBase64, uidFin }

/* ── Conta de campanha ───────────────────────────────────── */

export function contaVazia() {
  return {
    cnpj: '',
    razaoSocial: '',
    banco: '',
    agencia: '',
    conta: '',
    tipoConta: 'Corrente',
    pix: '',
    titular: '',
    responsavelFinanceiro: '',
    telefoneResponsavel: '',
    emailResponsavel: '',
    cargo: 'Deputado Estadual',
    uf: 'SC',
    municipio: 'Blumenau',
    dataInicio: '',
    dataFim: '',
    limiteGastos: '',
    protocoloTse: '',
    observacoes: '',
    atualizadoEm: '',
  }
}

export function loadConta() {
  const raw = readStorage(TESOURARIA_CONTA_KEY, null)
  return { ...contaVazia(), ...(raw && typeof raw === 'object' ? raw : {}) }
}

export function saveConta(conta) {
  writeStorage(TESOURARIA_CONTA_KEY, {
    ...contaVazia(),
    ...(conta || {}),
    atualizadoEm: new Date().toISOString(),
  })
}

export function contaPreenchida(conta) {
  const c = conta || {}
  return Boolean(
    String(c.cnpj || '').trim()
    || String(c.banco || '').trim()
    || String(c.conta || '').trim()
    || String(c.pix || '').trim(),
  )
}

export function formatarCnpj(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

export function formatarCpfCnpj(v) {
  const d = String(v || '').replace(/\D/g, '')
  if (d.length <= 11) {
    const x = d.slice(0, 11)
    if (x.length <= 3) return x
    if (x.length <= 6) return `${x.slice(0, 3)}.${x.slice(3)}`
    if (x.length <= 9) return `${x.slice(0, 3)}.${x.slice(3, 6)}.${x.slice(6)}`
    return `${x.slice(0, 3)}.${x.slice(3, 6)}.${x.slice(6, 9)}-${x.slice(9)}`
  }
  return formatarCnpj(d)
}

/* ── Movimentos ──────────────────────────────────────────── */

export function loadMovimentos() {
  const raw = readStorage(TESOURARIA_KEY, [])
  return Array.isArray(raw) ? raw : []
}

export function saveMovimentos(lista) {
  writeStorage(TESOURARIA_KEY, Array.isArray(lista) ? lista : [])
}

export function categoriasDoTipo(tipo) {
  return tipo === 'entrada' ? FONTES_RECURSO : DESTINOS_GASTO
}

export function movimentoVazio(tipo = 'saida') {
  return {
    id: '',
    tipo,
    valor: '',
    data: hojeIso(),
    categoria: categoriasDoTipo(tipo)[0],
    forma: 'PIX',
    descricao: '',
    contraparte: '',
    documentoContraparte: '',
    status: 'confirmado',
    naContaCampanha: true,
    comprovante: null,
    vinculoTipo: '',
    vinculoId: '',
    vinculoNome: '',
  }
}

export function normalizarMovimento(m) {
  if (!m || typeof m !== 'object') return null
  const tipo = m.tipo === 'entrada' ? 'entrada' : 'saida'
  const status = STATUS_MOVIMENTO.some(s => s.id === m.status) ? m.status : 'confirmado'
  const cats = categoriasDoTipo(tipo)
  let categoria = String(m.categoria || cats[0])
  if (!cats.includes(categoria)) {
    const mapa = {
      Doação: 'Doação de pessoa física',
      'Evento / jantar': 'Evento / jantar / arrecadação',
      'Transferência de comitê': 'Transferência de comitê / partido',
      'Outras receitas': 'Outras receitas',
      Reembolso: 'Reembolso',
      'Pessoal / equipe': 'Pessoal / equipe',
      'Material de campanha': 'Propaganda / gráfica',
      'Aluguel / comitê': 'Comitê / aluguel',
      'Combustível / deslocamento': 'Combustível / deslocamento',
      'Marketing / mídia': 'Marketing digital / mídia',
      'Alimentação / evento': 'Eventos / alimentação',
      'Serviços / fornecedor': 'Serviços / fornecedor',
      'Taxas / tarifas': 'Taxas / tarifas bancárias',
      'Outras despesas': 'Outros gastos eleitorais',
    }
    categoria = mapa[categoria] || cats[cats.length - 1]
  }
  return {
    id: String(m.id || uidFin()),
    tipo,
    valor: m.valor ?? '',
    data: String(m.data || hojeIso()).slice(0, 10),
    categoria,
    forma: String(m.forma || 'PIX'),
    descricao: String(m.descricao || ''),
    contraparte: String(m.contraparte || m.vinculoNome || ''),
    documentoContraparte: String(m.documentoContraparte || ''),
    status,
    naContaCampanha: m.naContaCampanha !== false,
    comprovante: m.comprovante && m.comprovante.dados ? m.comprovante : null,
    vinculoTipo: m.vinculoTipo === 'membro' || m.vinculoTipo === 'empresa' ? m.vinculoTipo : '',
    vinculoId: m.vinculoId != null ? String(m.vinculoId) : '',
    vinculoNome: String(m.vinculoNome || ''),
    criadoEm: m.criadoEm || new Date().toISOString(),
    atualizadoEm: m.atualizadoEm || m.criadoEm || new Date().toISOString(),
  }
}

export function filtrarMovimentos(lista, {
  tipo = 'todos',
  status = 'todos',
  categoria = '',
  busca = '',
  de = '',
  ate = '',
  soContaCampanha = false,
  semComprovante = false,
} = {}) {
  const q = String(busca || '').toLowerCase().trim()
  return (lista || []).filter(m => {
    if (!m) return false
    if (tipo !== 'todos' && m.tipo !== tipo) return false
    if (status !== 'todos' && m.status !== status) return false
    if (categoria && m.categoria !== categoria) return false
    if (de && String(m.data) < de) return false
    if (ate && String(m.data) > ate) return false
    if (soContaCampanha && m.naContaCampanha === false) return false
    if (semComprovante && m.comprovante) return false
    if (q) {
      const blob = `${m.descricao} ${m.contraparte} ${m.categoria} ${m.forma} ${m.documentoContraparte} ${m.vinculoNome}`.toLowerCase()
      if (!blob.includes(q)) return false
    }
    return true
  })
}

export function resumirCaixa(lista = []) {
  let entradas = 0
  let saidas = 0
  let aReceber = 0
  let aPagar = 0
  let cancelados = 0
  let entradasConta = 0
  let saidasConta = 0
  let semComprovante = 0

  for (const m of lista || []) {
    const v = parseValor(m.valor)
    if (m.status === 'cancelado') {
      cancelados += 1
      continue
    }
    if (m.status === 'previsto') {
      if (m.tipo === 'entrada') aReceber += v
      else aPagar += v
      continue
    }
    if (m.tipo === 'entrada') {
      entradas += v
      if (m.naContaCampanha !== false) entradasConta += v
    } else {
      saidas += v
      if (m.naContaCampanha !== false) saidasConta += v
    }
    if (!m.comprovante && m.status === 'confirmado') semComprovante += 1
  }

  return {
    entradas,
    saidas,
    saldo: entradas - saidas,
    saldoConta: entradasConta - saidasConta,
    aReceber,
    aPagar,
    cancelados,
    semComprovante,
    qtd: (lista || []).length,
    disponivel: (entradas - saidas) - aPagar + aReceber,
  }
}

export function totaisPorCategoria(lista = [], { soConfirmados = true } = {}) {
  const map = {}
  for (const m of lista || []) {
    if (soConfirmados && m.status !== 'confirmado') continue
    if (m.status === 'cancelado') continue
    const key = `${m.tipo}|${m.categoria || '—'}`
    if (!map[key]) {
      map[key] = { tipo: m.tipo, categoria: m.categoria || '—', total: 0, qtd: 0 }
    }
    map[key].total += parseValor(m.valor)
    map[key].qtd += 1
  }
  return Object.values(map).sort((a, b) => b.total - a.total)
}

export function periodoMesAtual() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const de = `${y}-${String(m + 1).padStart(2, '0')}-01`
  const last = new Date(y, m + 1, 0).getDate()
  const ate = `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  return { de, ate }
}

export function labelStatus(id) {
  return STATUS_MOVIMENTO.find(s => s.id === id)?.label || id
}

export function corStatus(id) {
  return STATUS_MOVIMENTO.find(s => s.id === id)?.cor || '#94a3b8'
}

export function labelTipo(id) {
  return TIPOS_MOVIMENTO.find(t => t.id === id)?.label || id
}

export function corTipo(id) {
  return TIPOS_MOVIMENTO.find(t => t.id === id)?.cor || '#94a3b8'
}

export function loadPrevisaoResumo() {
  try {
    const c = calcularPrevisaoCompleta()
    return {
      totalGeral: c.totalGeral,
      orcDisponivel: c.orcDisponivel,
      saldoFinal: c.saldoFinal,
      pctUtilizado: c.pctUtilizado,
      temOrcamento: c.temOrcamento,
      totalEmpresas: c.totalEmpresas,
      categorias: c.categorias,
      dataInicio: c.dataInicio,
      dataFim: c.dataFim,
      atualizadoEm: c.atualizadoEm,
    }
  } catch {
    const r = readStorage('previsao_resumo', null)
    return r && typeof r === 'object' ? r : null
  }
}

export function compararOrcadoRealizado(movimentos = [], previsaoResumo = null) {
  const r = resumirCaixa(movimentos)
  const orcado = Number(previsaoResumo?.totalGeral) || 0
  const orcDisponivel = Number(previsaoResumo?.orcDisponivel) || 0
  const realizado = r.saidas
  const limite = parseValor(previsaoResumo?.limiteGastos)
  return {
    orcado,
    orcDisponivel,
    realizado,
    diff: orcado - realizado,
    pctDoOrcado: orcado > 0 ? Math.min(999, (realizado / orcado) * 100) : 0,
    temOrcamento: !!previsaoResumo?.temOrcamento || orcDisponivel > 0 || orcado > 0,
    categoriasPrevisao: Array.isArray(previsaoResumo?.categorias) ? previsaoResumo.categorias : [],
    limite,
  }
}

export function montarChecklist(conta, movimentos = []) {
  const lista = (movimentos || []).filter(m => m && m.status !== 'cancelado')
  const confirmados = lista.filter(m => m.status === 'confirmado')
  const semComp = confirmados.filter(m => !m.comprovante)
  const semDoc = confirmados.filter(m => {
    const precisaDoc = m.tipo === 'entrada'
      ? /doação|pessoa física|financiamento/i.test(m.categoria)
      : /fornecedor|serviço|propaganda|pesquisa/i.test(m.categoria)
    return precisaDoc && !String(m.documentoContraparte || '').replace(/\D/g, '')
  })
  const foraConta = confirmados.filter(m => m.naContaCampanha === false)
  const previstos = lista.filter(m => m.status === 'previsto')
  const cnpjOk = String(conta?.cnpj || '').replace(/\D/g, '').length >= 14

  const itens = [
    {
      id: 'cnpj',
      ok: cnpjOk,
      titulo: 'CNPJ da campanha cadastrado',
      detalhe: conta?.cnpj ? formatarCnpj(conta.cnpj) : 'Preencha na aba Conta de Campanha',
    },
    {
      id: 'banco',
      ok: !!(String(conta?.banco || '').trim() && String(conta?.conta || '').trim()),
      titulo: 'Conta bancária de campanha',
      detalhe: conta?.banco && conta?.conta
        ? `${conta.banco} · ag ${conta.agencia || '—'} · cc ${conta.conta}`
        : 'Informe banco, agência e conta',
    },
    {
      id: 'pix',
      ok: !!String(conta?.pix || '').trim(),
      titulo: 'PIX da campanha',
      detalhe: conta?.pix || 'Recomendado para doações',
    },
    {
      id: 'responsavel',
      ok: !!String(conta?.responsavelFinanceiro || '').trim(),
      titulo: 'Responsável financeiro',
      detalhe: conta?.responsavelFinanceiro || 'Quem opera o caixa',
    },
    {
      id: 'periodo',
      ok: !!(conta?.dataInicio && conta?.dataFim),
      titulo: 'Período da campanha',
      detalhe: conta?.dataInicio && conta?.dataFim
        ? `${fmtData(conta.dataInicio)} → ${fmtData(conta.dataFim)}`
        : 'Defina início e fim',
    },
    {
      id: 'comprovantes',
      ok: semComp.length === 0,
      titulo: 'Comprovantes anexados',
      detalhe: semComp.length
        ? `${semComp.length} lançamento(s) confirmado(s) sem comprovante`
        : 'Todos os confirmados têm comprovante',
      qtd: semComp.length,
    },
    {
      id: 'documentos',
      ok: semDoc.length === 0,
      titulo: 'CPF/CNPJ da contraparte',
      detalhe: semDoc.length
        ? `${semDoc.length} lançamento(s) sensíveis sem documento`
        : 'Documentos ok nos lançamentos sensíveis',
      qtd: semDoc.length,
    },
    {
      id: 'conta_campanha',
      ok: foraConta.length === 0,
      titulo: 'Movimentos na conta de campanha',
      detalhe: foraConta.length
        ? `${foraConta.length} fora da conta (revise)`
        : 'Todos marcados na conta de campanha',
      qtd: foraConta.length,
    },
    {
      id: 'previstos',
      ok: previstos.length === 0,
      titulo: 'Sem lançamentos só previstos',
      detalhe: previstos.length
        ? `${previstos.length} ainda previstos — confirme ou cancele`
        : 'Nenhum previsto em aberto',
      qtd: previstos.length,
    },
  ]

  const okCount = itens.filter(i => i.ok).length
  return {
    itens,
    okCount,
    total: itens.length,
    pct: Math.round((okCount / itens.length) * 100),
    pendencias: itens.filter(i => !i.ok),
  }
}

export function loadOpcoesVinculo() {
  const membros = readStorage('equipe_membros', [])
  const empresas = readStorage('empresas_lista', [])
  return {
    membros: (Array.isArray(membros) ? membros : [])
      .filter(m => m && m.nome)
      .map(m => ({
        id: String(m.id),
        nome: m.nome,
        doc: m.cpf || '',
        extra: m.cargo || '',
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    empresas: (Array.isArray(empresas) ? empresas : [])
      .filter(e => e && e.status !== 'inativa' && (e.nomeFantasia || e.razaoSocial || e.nome))
      .map(e => ({
        id: String(e.id),
        nome: (e.nomeFantasia || e.razaoSocial || e.nome || '').trim(),
        doc: e.cnpj || '',
        extra: e.categoria || '',
        valor: e.valor,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  }
}
