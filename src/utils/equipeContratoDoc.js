/** Contrato de prestação de serviços — config global + geração do documento */

import { readStorage, writeStorage } from './persist'
import { parseValor, fmtMoeda } from './equipeFinanceiro'
import { ehCargoSemRemuneracao } from './equipeSync'
import { formatarEnderecoExibicao } from './equipeContratoReport'

export const CONTRATOS_CONFIG_KEY = 'equipe_contratos_config'

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export const CONTRATOS_CONFIG_DEFAULT = {
  tituloTipo: '',
  ano: '2026',
  candidatoNome: '',
  candidatoCnpj: '',
  candidatoEndereco: '',
  objetoTexto: '',
  regiaoRotulo: '',
  horasPadrao: '8 horas diárias',
  valorComplemento: 'correspondente a {horas}.',
  dataInicioPadrao: '2026-08-16',
  dataFimPadrao: '2026-10-03',
  clausulaQuarta: '',
  clausulaQuintaIntro: '',
  paragrafoRescisao: '',
  paragrafoDanos: '',
  paragrafoExclusividade: 'O CONTRATADO(A) deverá prestar serviços exclusivamente para a campanha eleitoral do CONTRATANTE. Multa: {multa}.',
  multaExclusividade: '1 (um) salário-mínimo',
  paragrafoJornada: '',
  foro: 'BLUMENAU/SC',
  cidadeAssinatura: 'BLUMENAU',
}

/** Datas fixas da campanha (início/fim do contrato). */
export const CONTRATO_DATA_INICIO_FIXA = '2026-08-16'
export const CONTRATO_DATA_FIM_FIXA = '2026-10-03'

/** Números por extenso (pt-BR) para valores monetários inteiros/com centavos. */
export function valorPorExtenso(n) {
  const num = typeof n === 'number' ? n : parseValor(n)
  if (!Number.isFinite(num) || num < 0) return ''
  const inteiro = Math.floor(num + 1e-9)
  const centavos = Math.round((num - inteiro) * 100)

  const u = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
    'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
  const d = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
  const c = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
    'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

  function ate999(x) {
    if (x === 0) return ''
    if (x === 100) return 'cem'
    if (x < 20) return u[x]
    if (x < 100) {
      const de = Math.floor(x / 10)
      const un = x % 10
      return d[de] + (un ? ` e ${u[un]}` : '')
    }
    const ce = Math.floor(x / 100)
    const rest = x % 100
    return c[ce] + (rest ? ` e ${ate999(rest)}` : '')
  }

  function grupo(x, singular, plural) {
    if (x === 0) return ''
    if (x === 1) return `${ate999(x)} ${singular}`
    return `${ate999(x)} ${plural}`
  }

  if (inteiro === 0 && centavos === 0) return 'zero reais'

  const mi = Math.floor(inteiro / 1_000_000)
  const mil = Math.floor((inteiro % 1_000_000) / 1000)
  const rest = inteiro % 1000

  const partes = []
  if (mi) partes.push(grupo(mi, 'milhão', 'milhões'))
  if (mil) {
    if (mil === 1) partes.push('mil')
    else partes.push(`${ate999(mil)} mil`)
  }
  if (rest) partes.push(ate999(rest))

  let texto = partes.join(' e ')
  if (inteiro === 0) texto = ''
  else if (inteiro === 1) texto += ' real'
  else texto += ' reais'

  if (centavos > 0) {
    const centTxt = ate999(centavos) + (centavos === 1 ? ' centavo' : ' centavos')
    texto = texto ? `${texto} e ${centTxt}` : centTxt
  }

  return texto
}

export function loadContratosConfig() {
  const raw = readStorage(CONTRATOS_CONFIG_KEY, null)
  if (!raw || typeof raw !== 'object') return { ...CONTRATOS_CONFIG_DEFAULT }
  const merged = { ...CONTRATOS_CONFIG_DEFAULT, ...raw }
  // Remove resíduos do modelo PDF Gabriel Luz 2024 (não usamos mais)
  if (/GABRIEL\s+LUZ/i.test(String(merged.candidatoNome || ''))) {
    merged.candidatoNome = ''
    merged.candidatoCnpj = ''
    merged.candidatoEndereco = ''
    if (String(merged.ano) === '2024') merged.ano = String(new Date().getFullYear())
  }
  return merged
}

export function saveContratosConfig(cfg) {
  const merged = { ...CONTRATOS_CONFIG_DEFAULT, ...(cfg || {}) }
  writeStorage(CONTRATOS_CONFIG_KEY, merged)
  return merged
}

export function membroElegivelContrato(m) {
  if (!m) return false
  if (ehCargoSemRemuneracao(m.cargo, m)) return false
  return parseValor(m.salario) > 0
}

export function formatarEnderecoContrato(m) {
  return formatarEnderecoExibicao(m) || ''
}

/** Próximo nº sequencial (01, 02…) com base nos contratos existentes. */
export function proximoNumeroContrato(membros = []) {
  let max = 0
  for (const m of membros) {
    const n = parseInt(String(m.contrato || '').replace(/\D/g, ''), 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return String(max + 1).padStart(2, '0')
}

/** Garante nº de contrato ao criar/editar remunerado. */
export function garantirNumeroContrato(membro, membros = []) {
  if (!membroElegivelContrato(membro)) return membro
  if (String(membro.contrato || '').trim()) return membro
  const outros = (membros || []).filter(x => String(x.id) !== String(membro.id))
  return { ...membro, contrato: proximoNumeroContrato(outros) }
}

function parseIsoParts(iso) {
  const s = String(iso || '').trim().slice(0, 10)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return { y: +m[1], mo: +m[2], d: +m[3] }
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) return { y: +br[3], mo: +br[2], d: +br[1] }
  return null
}

export function dataPorExtenso(iso) {
  const p = parseIsoParts(iso)
  if (!p) return String(iso || '').trim()
  return `${String(p.d).padStart(2, '0')} de ${MESES[p.mo - 1]} de ${p.y}`
}

export function dataAssinaturaExtenso(iso, cidade) {
  const p = parseIsoParts(iso)
  const cidadeUp = String(cidade || '').trim().toUpperCase() || 'BLUMENAU'
  if (!p) {
    const hoje = new Date()
    return `${cidadeUp} ${String(hoje.getDate()).padStart(2, '0')} DE ${MESES[hoje.getMonth()].toUpperCase()} DE ${hoje.getFullYear()}`
  }
  return `${cidadeUp} ${String(p.d).padStart(2, '0')} DE ${MESES[p.mo - 1].toUpperCase()} DE ${p.y}`
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Dados mesclados (config global + membro) para o contrato. */
export function montarDadosContrato(membro, config = loadContratosConfig(), { dataAssinatura } = {}) {
  const cfg = { ...CONTRATOS_CONFIG_DEFAULT, ...(config || {}) }
  const m = membro || {}
  const doc = m.contratoDoc && typeof m.contratoDoc === 'object' ? m.contratoDoc : {}

  const valorNum = parseValor(doc.valor != null && doc.valor !== '' ? doc.valor : m.salario)
  const horas = String(doc.horas || m.horasContratado || cfg.horasPadrao || '8 horas diárias').trim()
  const regiao = String(
    doc.regiao
    || (Array.isArray(m.bairros) && m.bairros.length ? m.bairros.join(', ') : '')
    || m.cidadeAtuacao
    || '',
  ).trim()
  const dataInicio = String(doc.dataInicio || m.dataInicio || cfg.dataInicioPadrao || '').trim()
  const dataFim = String(doc.dataFim || m.dataFimContrato || cfg.dataFimPadrao || '').trim()
  const numero = String(m.contrato || doc.numero || '').trim() || '—'
  const endereco = formatarEnderecoContrato(m)
  const assinaturaIso = dataAssinatura || doc.dataAssinatura || dataInicio || new Date().toISOString().slice(0, 10)

  const valorComplemento = String(cfg.valorComplemento || '')
    .replace(/\{horas\}/gi, horas)
  const paragrafoExclusividade = String(cfg.paragrafoExclusividade || '')
    .replace(/\{multa\}/gi, cfg.multaExclusividade || '1 (um) salário-mínimo')

  return {
    numero,
    ano: cfg.ano,
    tituloTipo: cfg.tituloTipo,
    prestadorNome: String(m.nome || '').trim(),
    prestadorCpf: String(m.cpf || '').trim(),
    prestadorTelefone: String(m.telefone || '').trim(),
    prestadorEndereco: endereco,
    candidatoNome: cfg.candidatoNome,
    candidatoCnpj: cfg.candidatoCnpj,
    candidatoEndereco: cfg.candidatoEndereco,
    objetoTexto: cfg.objetoTexto,
    regiaoRotulo: cfg.regiaoRotulo,
    regiao,
    valorFmt: fmtMoeda(valorNum),
    valorExtenso: valorPorExtenso(valorNum),
    valorNum,
    horas,
    valorComplemento,
    dataInicioExtenso: dataPorExtenso(dataInicio) || '___ de ___________ de ______',
    dataFimExtenso: dataPorExtenso(dataFim) || '___ de ___________ de ______',
    dataInicio,
    dataFim,
    clausulaQuarta: cfg.clausulaQuarta,
    clausulaQuintaIntro: cfg.clausulaQuintaIntro,
    paragrafoRescisao: cfg.paragrafoRescisao,
    paragrafoDanos: cfg.paragrafoDanos,
    paragrafoExclusividade,
    paragrafoJornada: cfg.paragrafoJornada,
    foro: cfg.foro,
    cidadeAssinatura: cfg.cidadeAssinatura,
    dataAssinaturaTexto: dataAssinaturaExtenso(assinaturaIso, cfg.cidadeAssinatura),
    faltas: [
      !m.nome && 'Nome',
      !m.cpf && 'CPF',
      !endereco && 'Endereço',
      !(valorNum > 0) && 'Remuneração',
      !dataInicio && 'Data de início',
      !dataFim && 'Data de término',
      !regiao && 'Região de atuação',
      !cfg.candidatoNome && 'Nome do candidato (config)',
      !cfg.candidatoCnpj && 'CNPJ (config)',
    ].filter(Boolean),
  }
}

/** HTML para impressão / Salvar como PDF (layout claro A4). */
export function montarHtmlContrato(membro, config, opts = {}) {
  const d = montarDadosContrato(membro, config, opts)
  const titulo = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS (${escHtml(d.tituloTipo)} Nº (${escHtml(d.numero)}) - ${escHtml(d.ano)})`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Contrato ${escHtml(d.numero)} — ${escHtml(d.prestadorNome)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Times New Roman", Times, serif;
    color: #111;
    background: #fff;
    padding: 22mm 18mm;
    font-size: 12.5px;
    line-height: 1.45;
  }
  h1 {
    text-align: center;
    font-size: 14px;
    font-weight: bold;
    margin-bottom: 18px;
    text-transform: uppercase;
  }
  .bloco { margin-bottom: 14px; text-align: justify; }
  .rotulo { font-weight: bold; text-transform: uppercase; margin-bottom: 4px; }
  .clausula-titulo {
    font-weight: bold;
    text-transform: uppercase;
    margin: 14px 0 6px;
  }
  .paragrafo { margin-top: 8px; text-align: justify; }
  .assinaturas {
    margin-top: 36px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 28px;
  }
  .assina {
    text-align: center;
    padding-top: 40px;
  }
  .assina .linha {
    border-top: 1px solid #111;
    margin: 0 auto 8px;
    width: 90%;
  }
  .assina .nome { font-size: 11px; font-weight: bold; text-transform: uppercase; }
  .assina .doc { font-size: 10px; margin-top: 2px; }
  .local-data {
    text-align: center;
    margin-top: 28px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .aviso {
    margin-bottom: 12px;
    padding: 8px 10px;
    border: 1px solid #f59e0b;
    background: #fffbeb;
    color: #92400e;
    font-family: "Segoe UI", sans-serif;
    font-size: 11px;
  }
  @media print {
    body { padding: 12mm 14mm; }
    .aviso { display: none; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  ${d.faltas.length ? `<div class="aviso no-print">Campos pendentes: ${escHtml(d.faltas.join(', '))}</div>` : ''}
  <h1>${titulo}</h1>

  <div class="bloco">
    <div class="rotulo">Prestador de serviço:</div>
    <div><strong>Nome:</strong> ${escHtml(d.prestadorNome || '________________')}</div>
    <div><strong>CPF:</strong> ${escHtml(d.prestadorCpf || '________________')} &nbsp;&nbsp; <strong>Telefone:</strong> ${escHtml(d.prestadorTelefone || '________________')}</div>
    <div><strong>Endereço:</strong> ${escHtml(d.prestadorEndereco || '________________')}</div>
  </div>

  <div class="bloco">
    <div class="rotulo">Candidato:</div>
    <div><strong>Nome:</strong> ${escHtml(d.candidatoNome || '________________')}</div>
    <div><strong>CNPJ:</strong> ${escHtml(d.candidatoCnpj || '________________')}</div>
    <div><strong>Endereço:</strong> ${escHtml(d.candidatoEndereco || '________________')}</div>
  </div>

  <p class="clausula-titulo">Cláusula primeira — Do objeto</p>
  <p class="bloco">${escHtml(d.objetoTexto)}</p>
  <p class="paragrafo"><strong>Parágrafo primeiro:</strong> ${escHtml(d.regiaoRotulo)} <strong>${escHtml(d.regiao || '________________')}</strong>.</p>

  <p class="clausula-titulo">Cláusula segunda — Do valor</p>
  <p class="bloco">
    Pelos serviços prestados, o PRESTADOR DE SERVIÇO receberá o valor de
    <strong>${escHtml(d.valorFmt)}</strong>
    (${escHtml(d.valorExtenso || '________________')}),
    ${escHtml(d.valorComplemento)}
  </p>

  <p class="clausula-titulo">Cláusula terceira — Do prazo</p>
  <p class="bloco">
    O presente contrato vigorará de <strong>${escHtml(d.dataInicioExtenso)}</strong>
    a <strong>${escHtml(d.dataFimExtenso)}</strong>, podendo ser prorrogado ou rescindido conforme as demais cláusulas.
  </p>

  <p class="clausula-titulo">Cláusula quarta — Da inexistência de vínculo empregatício</p>
  <p class="bloco">${escHtml(d.clausulaQuarta)}</p>

  <p class="clausula-titulo">Cláusula quinta — Das obrigações</p>
  <p class="bloco">${escHtml(d.clausulaQuintaIntro)}</p>
  <p class="paragrafo"><strong>Parágrafo primeiro:</strong> ${escHtml(d.paragrafoRescisao)}</p>
  <p class="paragrafo"><strong>Parágrafo segundo:</strong> ${escHtml(d.paragrafoDanos)}</p>
  <p class="paragrafo"><strong>Parágrafo terceiro:</strong> ${escHtml(d.paragrafoExclusividade)}</p>
  <p class="paragrafo"><strong>Parágrafo quarto:</strong> ${escHtml(d.paragrafoJornada)}</p>

  <p class="clausula-titulo">Cláusula sexta — Do foro</p>
  <p class="bloco">
    Fica eleito o foro da Comarca de <strong>${escHtml(d.foro)}</strong> para dirimir quaisquer dúvidas oriundas do presente instrumento.
  </p>

  <div class="assinaturas">
    <div class="assina">
      <div class="linha"></div>
      <div class="nome">${escHtml(d.candidatoNome || 'CONTRATANTE')}</div>
      <div class="doc">CNPJ nº ${escHtml(d.candidatoCnpj || '—')}</div>
    </div>
    <div class="assina">
      <div class="linha"></div>
      <div class="nome">${escHtml(d.prestadorNome || 'CONTRATADO(A)')}</div>
      <div class="doc">CPF: ${escHtml(d.prestadorCpf || '—')}</div>
    </div>
  </div>

  <p class="local-data">${escHtml(d.dataAssinaturaTexto)}</p>
</body>
</html>`
}

export function imprimirContrato(membro, config, opts = {}) {
  const html = montarHtmlContrato(membro, config, opts)
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return { ok: false, erro: 'popup' }
  try { win.opener = null } catch { /* ignore */ }
  win.document.open()
  win.document.write(html)
  win.document.close()
  const disparar = () => {
    try {
      win.focus()
      win.print()
    } catch { /* ignore */ }
  }
  if (win.document.readyState === 'complete') setTimeout(disparar, 250)
  else {
    win.onload = () => setTimeout(disparar, 250)
    setTimeout(disparar, 600)
  }
  return { ok: true }
}

export function listarMembrosComContrato(membros = []) {
  return (membros || [])
    .filter(membroElegivelContrato)
    .slice()
    .sort((a, b) => {
      const na = parseInt(String(a.contrato || '').replace(/\D/g, ''), 10) || 9999
      const nb = parseInt(String(b.contrato || '').replace(/\D/g, ''), 10) || 9999
      if (na !== nb) return na - nb
      return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
    })
}
