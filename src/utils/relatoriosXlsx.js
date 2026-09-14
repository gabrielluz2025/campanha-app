/**
 * Exportação XLSX dos relatórios — planilhas com colunas e dados completos.
 */
import { CATALOGO } from './relatoriosHub'
import { normalizarCargo, loadPrevisao, ehMembroRedeLevePrevisao } from './equipeSync'
import { pendenciasCadastro, cadastroCompleto } from './equipeCadastro'
import {
  coletarTodasLinhas, filtrarCargosGastos, resumoPorCargo, resumoPorCategoria, totaisLinhas,
} from './cargosGastosReport'
import { calcularPrevisaoCompleta } from './previsaoCalculo'

async function loadXlsx() {
  return import('xlsx')
}

function sheetName(nome) {
  return String(nome || 'Planilha')
    .replace(/[\\/?*[\]]/g, ' ')
    .trim()
    .slice(0, 31) || 'Planilha'
}

function uniqueSheetNames(names) {
  const used = new Set()
  return names.map((raw) => {
    let base = sheetName(raw)
    let name = base
    let i = 2
    while (used.has(name.toLowerCase())) {
      const suf = `_${i++}`
      name = `${base.slice(0, 31 - suf.length)}${suf}`
    }
    used.add(name.toLowerCase())
    return name
  })
}

const MONEY_HEADER_RE = /^(valor|total|pago|saldo|or[cç]amento|previsto|dispon[ií]vel|m[eé]dia|contrato|custo|pre[cç]o)/i
const PCT_HEADER_RE = /^(%|percent|pct|utiliza)/i

function detectColFormats(colunas = []) {
  const money = []
  const pct = []
  colunas.forEach((h, i) => {
    const label = String(h || '').trim()
    if (PCT_HEADER_RE.test(label) || /%/.test(label)) pct.push(i)
    else if (MONEY_HEADER_RE.test(label)) money.push(i)
  })
  return { money, pct }
}

function applySheetExtras(XLSX, ws, sheet, headerRow = 0) {
  const cols = sheet.colunas || []
  const rows = [...(sheet.linhas || []), ...(sheet.rodape || [])]
  const dataLen = (sheet.linhas || []).length
  const formats = sheet.formatos || detectColFormats(cols)
  const moneySet = new Set(formats.money || [])
  const pctSet = new Set(formats.pct || [])

  for (let r = 0; r < rows.length; r++) {
    for (const c of moneySet) {
      const addr = XLSX.utils.encode_cell({ r: headerRow + 1 + r, c })
      const cell = ws[addr]
      if (!cell || cell.v == null || cell.v === '') continue
      const n = typeof cell.v === 'number' ? cell.v : Number(cell.v)
      if (!Number.isFinite(n)) continue
      cell.t = 'n'
      cell.v = n
      cell.z = '"R$"#,##0.00'
    }
    for (const c of pctSet) {
      const addr = XLSX.utils.encode_cell({ r: headerRow + 1 + r, c })
      const cell = ws[addr]
      if (!cell || cell.v == null || cell.v === '') continue
      let n = typeof cell.v === 'number' ? cell.v : Number(String(cell.v).replace(',', '.').replace('%', ''))
      if (!Number.isFinite(n)) continue
      // Se veio 85.17 (percentual 0-100), grava como fração p/ formato %
      if (n > 1.5) n = n / 100
      cell.t = 'n'
      cell.v = n
      cell.z = '0.0%'
    }
  }

  const lastCol = Math.max(0, cols.length - 1)
  // Autofilter só nas linhas de dados (sem a linha TOTAL do rodapé)
  const lastDataRow = headerRow + Math.max(dataLen, 0)
  if (cols.length && dataLen > 0) {
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: lastDataRow, c: lastCol } }),
    }
  }
  ws['!views'] = [{
    state: 'frozen',
    xSplit: 0,
    ySplit: headerRow + 1,
    topLeftCell: XLSX.utils.encode_cell({ r: headerRow + 1, c: 0 }),
    activePane: 'bottomLeft',
  }]
}

/** @param {{ nome: string, colunas: string[], linhas: any[][], titulo?: string, rodape?: any[][], formatos?: { money?: number[], pct?: number[] } }[]} sheets */
export async function baixarXlsx(sheets, nomeArquivo) {
  const XLSX = await loadXlsx()
  const wb = XLSX.utils.book_new()
  const lista = (sheets || []).filter(s => s && Array.isArray(s.colunas))
  if (!lista.length) {
    lista.push({ nome: 'Vazio', colunas: ['Info'], linhas: [['Sem dados neste relatório']] })
  }
  const names = uniqueSheetNames(lista.map(s => s.nome || 'Dados'))
  lista.forEach((s, idx) => {
    const aoa = []
    let headerRow = 0
    if (s.titulo) {
      aoa.push([s.titulo])
      if (s.subtitulo) aoa.push([s.subtitulo])
      aoa.push([])
      headerRow = aoa.length
    }
    aoa.push(s.colunas)
    for (const row of (s.linhas || [])) {
      aoa.push(s.colunas.map((_, i) => (row[i] == null || row[i] === '' ? '' : row[i])))
    }
    for (const row of (s.rodape || [])) {
      aoa.push(s.colunas.map((_, i) => (row[i] == null || row[i] === '' ? '' : row[i])))
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    if (s.titulo) {
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, s.colunas.length - 1) } }]
    }
    const allRows = [...(s.linhas || []), ...(s.rodape || [])]
    ws['!cols'] = s.colunas.map((h, i) => {
      const maxLen = Math.min(52, Math.max(
        String(h).length,
        String(s.titulo || '').length / Math.max(1, s.colunas.length),
        ...allRows.slice(0, 100).map(r => String(r[i] ?? '').length),
      ))
      return { wch: Math.max(12, maxLen + 2) }
    })
    applySheetExtras(XLSX, ws, s, headerRow)
    XLSX.utils.book_append_sheet(wb, ws, names[idx])
  })
  const nome = nomeArquivo.endsWith('.xlsx') ? nomeArquivo : `${nomeArquivo}.xlsx`
  XLSX.writeFile(wb, nome)
}

function bairrosAtuacao(m) {
  if (Array.isArray(m.bairros)) return m.bairros.filter(Boolean).join(', ')
  return String(m.bairros || m.bairroAtuacao || '').trim()
}

function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (v == null || v === '') return 0
  const s = String(v).trim().replace(/R\$\s?/i, '').replace(/\s/g, '')
  // 1.234,56 → 1234.56 | 1234.56 permanece
  const normalized = s.includes(',')
    ? s.replace(/\./g, '').replace(',', '.')
    : s
  const n = parseFloat(normalized)
  return Number.isFinite(n) ? n : 0
}

function isoDate(v) {
  if (!v) return ''
  const s = String(v)
  return s.length >= 10 ? s.slice(0, 10) : s
}

/** Soma percentual (0–1) para formatação Excel. */
function pctDo(valor, base) {
  return base > 0 ? Math.round((num(valor) / base) * 1000) / 1000 : 0
}

/**
 * Monta planilha(s) com dados completos e tipados para um relatório.
 * @returns {{ titulo: string, sheets: { nome: string, colunas: string[], linhas: any[][] }[] }}
 */
export function montarPlanilhasCompletas(id, snap, filtros = {}) {
  const s = snap
  const builders = {
    semanal: () => planilhasSemanal(s),
    eleitores: () => planilhasEleitores(s),
    equipe: () => planilhasEquipe(s),
    indicacoes: () => planilhasIndicacoes(s, filtros),
    contratos: () => planilhasContratos(s),
    igrejas: () => planilhasIgrejas(s),
    agenda: () => planilhasAgenda(s),
    materiais: () => planilhasMateriais(s),
    apoiadores: () => planilhasApoiadores(s),
    empresas: () => planilhasEmpresas(s),
    previsao: () => planilhasPrevisao(s),
    'cargos-gastos': () => planilhasCargosGastos(s, filtros),
    rotas: () => planilhasRotas(s),
    pesquisas: () => planilhasPesquisas(s),
  }
  const fn = builders[id] || builders.semanal
  const meta = CATALOGO.find(c => c.id === id)
  const result = fn()
  return {
    titulo: result.titulo || meta?.titulo || id,
    sheets: result.sheets,
  }
}

export async function baixarRelatorioXlsx(id, snap, filtros = {}, nomeArquivo) {
  const pacote = montarPlanilhasCompletas(id, snap, filtros)
  await baixarXlsx(pacote.sheets, nomeArquivo || `relatorio-${id}.xlsx`)
  return pacote
}

/** Um arquivo XLSX com uma aba por tipo de relatório (só a planilha principal de cada um). */
export async function baixarTodosRelatoriosXlsx(snap, { filtrosCG = {}, filtrosInd = {}, semana = '' } = {}) {
  const sheets = []
  for (const cat of CATALOGO) {
    const filtros = cat.id === 'cargos-gastos'
      ? filtrosCG
      : cat.id === 'indicacoes'
        ? filtrosInd
        : {}
    const pacote = montarPlanilhasCompletas(cat.id, snap, filtros)
    const principal = pacote.sheets[0]
    if (!principal) continue
    sheets.push({
      nome: cat.titulo,
      colunas: principal.colunas,
      linhas: principal.linhas,
      formatos: principal.formatos,
      titulo: principal.titulo,
      subtitulo: principal.subtitulo,
      rodape: principal.rodape,
    })
  }
  const nome = `relatorios-completos-${semana || new Date().toISOString().slice(0, 10)}.xlsx`
  await baixarXlsx(sheets, nome)
  return { qtd: sheets.length, nome }
}

/* ─── Builders ─── */

function planilhasSemanal(s) {
  const pctMeta = s.metaGlobal > 0 ? Math.round((s.totalVotos / s.metaGlobal) * 1000) / 10 : 0
  const resumo = {
    nome: 'Resumo',
    colunas: ['Indicador', 'Valor'],
    linhas: [
      ['Periodo inicio', isoDate(s.weekStart?.toISOString?.() || s.weekStart)],
      ['Periodo fim', isoDate(s.weekEnd?.toISOString?.() || s.weekEnd)],
      ['Eventos na semana', s.eventosSemana.length],
      ['Materiais distribuidos (semana)', s.distSemana.reduce((a, d) => a + num(d.quantidade), 0)],
      ['Interacoes na rede', s.interacoesSemana],
      ['Respostas de pesquisa', s.respostasSemana],
      ['Tarefas concluidas', s.tarefas.filter(t => t.status === 'concluida').length],
      ['Tarefas pendentes', s.tarefas.filter(t => t.status === 'pendente' || t.status === 'em_andamento').length],
      ['Votos (cidade foco)', s.totalVotos],
      ['Meta votos', s.metaGlobal],
      ['% meta', pctMeta],
      ['Igrejas visitadas', s.visitadas],
      ['Igrejas total catalogo', s.catalogIgrejas.length],
      ['Membros equipe', s.membros.length],
      ['Apoiadores', s.apoiadores.length],
    ],
  }
  const eventos = {
    nome: 'Eventos semana',
    colunas: ['Data inicio', 'Data fim', 'Hora inicio', 'Hora fim', 'Titulo', 'Local', 'Bairro', 'Categoria', 'Status'],
    linhas: s.eventosSemana.map(e => [
      isoDate(e.dataInicio || e.data),
      isoDate(e.dataFim),
      e.horaInicio || '',
      e.horaFim || '',
      e.titulo || e.nome || '',
      e.local || '',
      e.bairro || '',
      e.categoria || e.tipo || '',
      e.status || '',
    ]),
  }
  const dist = {
    nome: 'Distribuicao semana',
    colunas: ['Data', 'Item', 'Bairro', 'Quantidade', 'Responsavel', 'Observacao'],
    linhas: s.distSemana.map(d => [
      isoDate(d.data),
      d.itemNome || d.nome || d.itemId || '',
      d.bairro || '',
      num(d.quantidade),
      d.responsavel || d.quem || '',
      d.observacao || d.obs || '',
    ]),
  }
  return { titulo: 'Resumo semanal', sheets: [resumo, eventos, dist] }
}

function planilhasEleitores(s) {
  const pct = s.metaGlobal > 0 ? Math.round((s.totalVotos / s.metaGlobal) * 1000) / 10 : 0
  const pen = s.totalAptos > 0 ? Math.round((s.totalVotos / s.totalAptos) * 1000) / 10 : 0
  return {
    titulo: 'Eleitores & metas',
    sheets: [
      {
        nome: 'Resumo',
        colunas: ['Campo', 'Valor'],
        linhas: [
          ['Cidade foco', s.cidadeFoco || ''],
          ['Votos', s.totalVotos],
          ['Aptos', s.totalAptos],
          ['Meta', s.metaGlobal],
          ['% meta', pct],
          ['Penetracao %', pen],
          ['Zonas', s.topZonas.length],
        ],
      },
      {
        nome: 'Zonas',
        colunas: ['#', 'Zona', 'Votos', 'Aptos', 'Penetracao %'],
        linhas: s.topZonas.map((z, i) => [
          i + 1,
          z.nome,
          num(z.votos),
          num(z.aptos),
          z.aptos ? Math.round((z.votos / z.aptos) * 1000) / 10 : '',
        ]),
      },
    ],
  }
}

function planilhasEquipe(s) {
  const membros = [...s.membros].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
  return {
    titulo: 'Equipe & tarefas',
    sheets: [
      {
        nome: 'Membros',
        colunas: [
          'Nome', 'Cargo', 'Tipo', 'Vinculo', 'Telefone', 'CPF', 'E-mail',
          'Bairro residencia', 'Cidade', 'Estado', 'Bairros atuacao',
          'Remuneracao', 'Data inicio', 'Contrato', 'Banco', 'Agencia', 'Conta', 'PIX',
          'Indicacao por', 'Cadastro completo', 'Pendencias', 'Observacoes',
        ],
        linhas: membros.map(m => {
          const pend = pendenciasCadastro(m, s.membros)
          const rede = ehMembroRedeLevePrevisao(m)
          return [
            m.nome || '',
            normalizarCargo(m.cargo),
            rede ? 'Comunidade WhatsApp' : 'Operacional',
            m.vinculo || '',
            m.telefone || '',
            m.cpf || '',
            m.email || '',
            m.bairroResidencia || '',
            m.cidade || '',
            m.estado || '',
            bairrosAtuacao(m),
            rede ? 0 : num(m.salario ?? m.remuneracao),
            isoDate(m.dataInicio),
            m.contrato || m.numeroContrato || '',
            m.banco || '',
            m.agencia || '',
            m.conta || '',
            m.pix || '',
            m.indicacaoPorNome || m.indicacaoPor || '',
            rede ? '—' : (cadastroCompleto(m, s.membros) ? 'Sim' : 'Nao'),
            rede ? '' : pend.join('; '),
            m.observacoes || '',
          ]
        }),
      },
      {
        nome: 'Por cargo',
        colunas: ['Cargo', 'Quantidade'],
        linhas: s.cargosLista.map(([c, q]) => [c, q]),
      },
      {
        nome: 'Tarefas',
        colunas: ['Titulo', 'Status', 'Responsavel', 'Prazo', 'Prioridade', 'Descricao'],
        linhas: (s.tarefas || []).map(t => [
          t.titulo || t.nome || '',
          t.status || '',
          t.responsavelNome || t.responsavel || '',
          isoDate(t.prazo || t.dataPrazo),
          t.prioridade || '',
          t.descricao || t.obs || '',
        ]),
      },
    ],
  }
}

function planilhasIndicacoes(s, filtros = {}) {
  const indicadorId = String(filtros.indicadorId || '').trim()
  const soPendencias = !!filtros.soPendencias
  let grupos = s.indicadores || []
  if (indicadorId) grupos = grupos.filter(g => g.id === indicadorId)

  const linhas = []
  grupos.forEach(g => {
    const lista = soPendencias
      ? g.indicados.filter(m => pendenciasCadastro(m, s.membros).length > 0)
      : g.indicados
    lista.forEach(m => {
      const pend = pendenciasCadastro(m, s.membros)
      linhas.push([
        g.nome,
        g.id,
        m.nome || '',
        m.id || '',
        normalizarCargo(m.cargo),
        m.telefone || '',
        m.cpf || '',
        m.bairroResidencia || '',
        bairrosAtuacao(m),
        pend.length ? 'Pendencia' : 'Completo',
        pend.join('; '),
      ])
    })
  })

  return {
    titulo: 'Indicacoes & pendencias',
    sheets: [{
      nome: 'Indicados',
      colunas: [
        'Quem indicou', 'ID indicador', 'Indicado', 'ID indicado', 'Cargo',
        'Telefone', 'CPF', 'Bairro residencia', 'Bairros atuacao', 'Status cadastro', 'Pendencias',
      ],
      linhas,
    }],
  }
}

function planilhasContratos(s) {
  return {
    titulo: 'Contratos & financeiro',
    sheets: [
      {
        nome: 'Resumo',
        colunas: ['Campo', 'Valor'],
        linhas: [
          ['Saldo a pagar', num(s.saldoEquipe)],
          ['Ja pago', num(s.pagoEquipe)],
          ['Linhas com movimento', s.financeiroLinhas.length],
        ],
      },
      {
        nome: 'Financeiro',
        colunas: ['Nome', 'Cargo', 'Pago', 'Saldo'],
        linhas: s.financeiroLinhas.map(l => [
          l.nome || '',
          l.cargo || '',
          num(l.pago),
          num(l.saldo),
        ]),
      },
    ],
  }
}

function planilhasIgrejas(s) {
  return {
    titulo: 'Igrejas & cobertura',
    sheets: [
      {
        nome: 'Setores',
        colunas: ['Setor', 'Igrejas', 'Visitadas'],
        linhas: (s.setores || []).map(x => [
          x.nome || x.setor || '',
          num(x.total ?? x.qtd ?? x.igrejas),
          num(x.visitadas),
        ]),
      },
      {
        nome: 'Cargos eclesiasticos',
        colunas: ['Nome', 'Cargo equipe', 'Cargo igreja', 'Igreja', 'Denominacao', 'Telefone', 'Bairro'],
        linhas: (s.cargosIgreja || []).map(m => [
          m.nome || '',
          normalizarCargo(m.cargo),
          m.cargoIgreja || m.funcaoIgreja || '',
          m.igreja || m.igrejaNome || '',
          m.denominacao || '',
          m.telefone || '',
          m.bairroResidencia || '',
        ]),
      },
      {
        nome: 'Rede igreja',
        colunas: ['Nome', 'Cargo', 'Igreja', 'Telefone'],
        linhas: (s.redeIgreja || []).map(m => [
          m.nome || '',
          normalizarCargo(m.cargo),
          m.igreja || m.igrejaNome || '',
          m.telefone || '',
        ]),
      },
    ],
  }
}

function planilhasAgenda(s) {
  const cols = ['Data inicio', 'Data fim', 'Hora inicio', 'Hora fim', 'Titulo', 'Local', 'Bairro', 'Categoria', 'Status', 'Descricao']
  const mapEv = e => [
    isoDate(e.dataInicio || e.data),
    isoDate(e.dataFim),
    e.horaInicio || '',
    e.horaFim || '',
    e.titulo || e.nome || '',
    e.local || '',
    e.bairro || '',
    e.categoria || e.tipo || '',
    e.status || '',
    e.descricao || e.observacao || '',
  ]
  return {
    titulo: 'Agenda',
    sheets: [
      {
        nome: 'Semana',
        colunas: cols,
        linhas: s.eventosSemana.map(mapEv),
      },
      {
        nome: 'Todos eventos',
        colunas: cols,
        linhas: (s.eventos || []).map(mapEv),
      },
    ],
  }
}

function planilhasMateriais(s) {
  return {
    titulo: 'Materiais',
    sheets: [
      {
        nome: 'Estoque',
        colunas: ['Item', 'Categoria', 'Quantidade inicial', 'Distribuido', 'Restante', 'Estoque minimo', 'Status'],
        linhas: s.materiaisStatus.map(i => [
          i.nome || '',
          i.categoria || '',
          num(i.quantidade),
          num(i.distribuido),
          num(i.restante),
          num(i.estoqueMinimo),
          i.status || '',
        ]),
      },
      {
        nome: 'Distribuicoes',
        colunas: ['Data', 'Item', 'Bairro', 'Quantidade', 'Responsavel', 'Observacao'],
        linhas: (s.distribuicoes || []).map(d => [
          isoDate(d.data),
          d.itemNome || d.nome || d.itemId || '',
          d.bairro || '',
          num(d.quantidade),
          d.responsavel || '',
          d.observacao || '',
        ]),
      },
      {
        nome: 'Por bairro (semana)',
        colunas: ['Bairro', 'Quantidade'],
        linhas: Object.entries(s.distPorBairro || {})
          .sort((a, b) => b[1] - a[1])
          .map(([b, q]) => [b, num(q)]),
      },
    ],
  }
}

function planilhasApoiadores(s) {
  return {
    titulo: 'Apoiadores',
    sheets: [
      {
        nome: 'Apoiadores',
        colunas: ['Nome', 'Nivel', 'Bairro', 'Telefone', 'Cidade', 'Origem', 'Votos previstos', 'Observacao', 'Criado em'],
        linhas: [...s.apoiadores]
          .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
          .map(a => [
            a.nome || '',
            a.nivel || '',
            a.bairro || '',
            a.telefone || '',
            a.cidade || '',
            a.origem === 'cadastro_publico' ? 'Formulario'
              : a.origem === 'equipe' ? 'Equipe'
                : (a.origem || 'Manual'),
            Math.min(5, Number(a.votosEstimados) || 0),
            a.observacao || a.obs || '',
            isoDate(a.criadoEm || a.createdAt),
          ]),
      },
      {
        nome: 'Por nivel',
        colunas: ['Nivel', 'Quantidade'],
        linhas: Object.entries(s.porNivel || {}).map(([n, q]) => [n, num(q)]),
      },
      {
        nome: 'Interacoes',
        colunas: ['Data', 'Tipo', 'Apoiador', 'Descricao'],
        linhas: (s.interacoesFlat || []).map(i => [
          isoDate(i.data || i.createdAt),
          i.tipo || i.canal || '',
          i.apoiadorNome || i.nome || '',
          i.descricao || i.texto || i.obs || '',
        ]),
      },
    ],
  }
}

function planilhasEmpresas(s) {
  return {
    titulo: 'Empresas',
    sheets: [{
      nome: 'Empresas',
      colunas: [
        'Nome fantasia', 'Razao social', 'CNPJ', 'Categoria', 'Status',
        'Valor', 'Contato', 'Telefone', 'Email', 'Cidade', 'Observacao',
      ],
      linhas: s.empresas.map(e => [
        e.nomeFantasia || '',
        e.razaoSocial || '',
        e.cnpj || '',
        e.categoria || '',
        e.status || '',
        num(parseFloat(String(e.valor ?? '').replace(',', '.')) || 0),
        e.contato || e.responsavel || '',
        e.telefone || '',
        e.email || '',
        e.cidade || '',
        e.observacao || e.obs || '',
      ]),
    }],
  }
}

function planilhasPrevisao(s) {
  // Só Resumo + Categorias (igual à prévia do relatório escolhido)
  const calc = calcularPrevisaoCompleta()
  const prev = loadPrevisao() || {}
  const r = s.previsaoResumo || {}
  const orcamento = calc.orcDisponivel
  const totalGeral = calc.totalGeral
  const saldo = calc.saldoFinal
  const pctUso = calc.pctUtilizado
  const totalAdmin = calc.totalAdmin
  const admin = Array.isArray(prev.adminPessoas) ? prev.adminPessoas : []
  const categorias = calc.categorias || []
  const catsComValor = categorias.filter(c => c.valor > 0 || c.qtd > 0)
  const somaCats = catsComValor.reduce((a, c) => a + c.valor, 0)

  const geradoEm = new Date().toLocaleString('pt-BR')
  const periodoInicio = r.dataInicio || prev.dataInicio || calc.dataInicio || ''
  const periodoFim = r.dataFim || prev.dataFim || calc.dataFim || ''
  const status = !orcamento
    ? 'Orçamento não definido'
    : saldo < 0
      ? 'Orçamento estourado'
      : pctUso >= 90
        ? 'Atenção — uso acima de 90%'
        : pctUso >= 75
          ? 'Monitorar — uso acima de 75%'
          : 'Dentro do orçamento'

  return {
    titulo: 'Previsão de gasto',
    sheets: [
      {
        nome: 'Resumo',
        titulo: 'Previsão de gasto da campanha',
        subtitulo: `Gerado em ${geradoEm}${periodoInicio || periodoFim ? ` · Período ${periodoInicio || '—'} a ${periodoFim || '—'}` : ''}`,
        colunas: ['Indicador', 'Valor R$', 'Percentual', 'Observação'],
        formatos: { money: [1], pct: [2] },
        linhas: [
          ['Total previsto', totalGeral, orcamento ? pctDo(totalGeral, orcamento) : '', status],
          ['Orçamento disponível', orcamento || '', '', orcamento ? '' : 'Defina o orçamento na aba Previsão'],
          ['Utilização do orçamento', '', orcamento ? pctUso / 100 : '', orcamento ? `${pctUso.toFixed(1)}% do teto` : '—'],
          ['Saldo', orcamento ? saldo : '', '', !orcamento ? '' : (saldo < 0 ? 'Déficit' : 'Livre')],
          ['Equipe Adm. (soma)', totalAdmin, pctDo(totalAdmin, totalGeral), `${admin.length} pessoa(s)`],
          ['Conferência categorias', somaCats, '', Math.abs(somaCats - totalGeral) < 0.01 ? 'OK — bate com o total' : 'Diferença — revisar'],
        ],
      },
      {
        nome: 'Categorias',
        titulo: 'Mesma prévia do relatório Previsão de gasto',
        colunas: ['Categoria', 'Qtd', 'Valor', 'Grupo', '% do previsto'],
        formatos: { money: [2], pct: [4] },
        linhas: catsComValor.map(c => [
          c.nome,
          c.qtd != null && c.qtd > 0 ? c.qtd : '',
          c.valor,
          c.grupo || '',
          pctDo(c.valor, totalGeral),
        ]),
        rodape: [[
          'TOTAL',
          catsComValor.reduce((a, c) => a + (Number(c.qtd) || 0), 0),
          totalGeral,
          '',
          1,
        ]],
      },
    ],
  }
}

function planilhasCargosGastos(_s, filtros = {}) {
  const todas = coletarTodasLinhas()
  const filtradas = filtrarCargosGastos(todas, filtros)
  const totais = totaisLinhas(filtradas)
  const porCargo = resumoPorCargo(filtradas)
  const porCat = resumoPorCategoria(filtradas)
  const detRows = filtradas.map(l => [
    l.nome || '',
    l.cargo || '',
    l.categoria || '',
    num(l.valor),
    num(l.pago),
    num(l.saldo),
    l.tipo || '',
  ])
  return {
    titulo: 'Cargos & gastos',
    sheets: [
      {
        nome: 'Resumo',
        colunas: ['Campo', 'Valor'],
        formatos: { money: [1] },
        linhas: [
          ['Itens', totais.qtd],
          ['Total', num(totais.total)],
          ['Pago', num(totais.pago)],
          ['Saldo', num(totais.saldo)],
        ],
      },
      {
        nome: 'Detalhamento',
        colunas: ['Nome / item', 'Cargo', 'Categoria', 'Valor', 'Pago', 'Saldo', 'Tipo'],
        formatos: { money: [3, 4, 5] },
        linhas: detRows,
        rodape: [[
          'TOTAL',
          '',
          `${filtradas.length} item(ns)`,
          num(totais.total),
          num(totais.pago),
          num(totais.saldo),
          '',
        ]],
      },
      {
        nome: 'Por cargo',
        colunas: ['Cargo', 'Qtd', 'Total', 'Pago', 'Saldo'],
        formatos: { money: [2, 3, 4] },
        linhas: porCargo.map(r => [r.cargo, num(r.qtd), num(r.total), num(r.pago), num(r.saldo)]),
        rodape: [[
          'TOTAL',
          porCargo.reduce((a, r) => a + num(r.qtd), 0),
          porCargo.reduce((a, r) => a + num(r.total), 0),
          porCargo.reduce((a, r) => a + num(r.pago), 0),
          porCargo.reduce((a, r) => a + num(r.saldo), 0),
        ]],
      },
      {
        nome: 'Por categoria',
        colunas: ['Categoria', 'Qtd', 'Total'],
        formatos: { money: [2] },
        linhas: porCat.map(r => [r.categoria, num(r.qtd), num(r.total)]),
        rodape: [[
          'TOTAL',
          porCat.reduce((a, r) => a + num(r.qtd), 0),
          porCat.reduce((a, r) => a + num(r.total), 0),
        ]],
      },
    ],
  }
}

function planilhasRotas(s) {
  const paradas = []
  ;(s.rotas || []).forEach(r => {
    ;(r.paradas || []).forEach((p, i) => {
      const obj = typeof p === 'string' ? { nome: p } : (p || {})
      paradas.push([
        r.nome || r.titulo || 'Rota',
        i + 1,
        obj.nome || obj.titulo || obj.label || '',
        obj.bairro || '',
        obj.status || 'pendente',
        obj.endereco || '',
        obj.tipo || '',
      ])
    })
  })
  return {
    titulo: 'Rotas de campo',
    sheets: [
      {
        nome: 'Rotas',
        colunas: ['Rota', 'Status', 'Paradas', 'Cidade', 'Observacao'],
        linhas: (s.rotas || []).map(r => [
          r.nome || r.titulo || 'Rota',
          r.status || '',
          (r.paradas || []).length,
          r.cidade || r.cidadeAtuacao || '',
          r.observacao || r.obs || '',
        ]),
      },
      {
        nome: 'Paradas',
        colunas: ['Rota', '#', 'Parada', 'Bairro', 'Status', 'Endereco', 'Tipo'],
        linhas: paradas,
      },
    ],
  }
}

function planilhasPesquisas(s) {
  const resp = (s.respostasFlat || []).map(r => [
    isoDate(r.data || r.createdAt || r.timestamp),
    r.enqueteTitulo || r.enqueteId || '',
    r.pergunta || r.questao || '',
    r.resposta ?? r.valor ?? r.texto ?? '',
    r.respondente || r.nome || '',
    r.bairro || '',
  ])
  return {
    titulo: 'Pesquisas',
    sheets: [
      {
        nome: 'Enquetes',
        colunas: ['Titulo', 'Status', 'Perguntas', 'Respostas', 'Criada em'],
        linhas: (s.enquetes || []).map(e => {
          const nResp = (s.respostasFlat || []).filter(r =>
            String(r.enqueteId) === String(e.id) || r.enqueteTitulo === e.titulo,
          ).length
          return [
            e.titulo || e.nome || '',
            e.status || '',
            (e.perguntas || e.questoes || []).length,
            nResp,
            isoDate(e.criadoEm || e.createdAt),
          ]
        }),
      },
      {
        nome: 'Respostas',
        colunas: ['Data', 'Enquete', 'Pergunta', 'Resposta', 'Respondente', 'Bairro'],
        linhas: resp,
      },
    ],
  }
}
