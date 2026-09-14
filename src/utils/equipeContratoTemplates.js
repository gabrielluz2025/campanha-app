/** Preenche e gera contratos a partir dos modelos da advogada */

import { CONTRATO_TEMPLATES, CONTRATO_CATEGORIAS } from './contratoTemplatesCatalog'
import {
  loadContratosConfig,
  valorPorExtenso,
  dataPorExtenso,
  dataAssinaturaExtenso,
  formatarEnderecoContrato,
  CONTRATOS_CONFIG_DEFAULT,
  CONTRATO_DATA_INICIO_FIXA,
  CONTRATO_DATA_FIM_FIXA,
  membroElegivelContrato,
} from './equipeContratoDoc'
import { parseValor, fmtMoeda } from './equipeFinanceiro'
import { readStorage, writeStorage } from './persist'
import {
  CSS_ASSINATURA_AUTH, htmlCaixaAssinatura, htmlRodapeAutenticidade,
  formatarCodigo, urlVerificacao, hashCurto, ehAssinaturaGovbr,
} from './contratoAutenticidade'

export { CONTRATO_TEMPLATES, CONTRATO_CATEGORIAS }

export const RASCUNHOS_KEY = 'equipe_contratos_rascunhos'

/** Campos mínimos do contratado para gerar contrato. */
export function pendenciasContratoMembro(membro) {
  const m = membro || {}
  const faltas = []
  if (!String(m.nome || '').trim()) faltas.push('Nome')
  if (!String(m.cpf || '').trim()) faltas.push('CPF')
  if (!String(m.telefone || '').trim()) faltas.push('Telefone')
  const end = formatarEnderecoContrato(m)
  if (!end) faltas.push('Endereço')
  if (!String(m.dataNascimento || '').trim()) faltas.push('Data de nascimento')
  if (!membroElegivelContrato(m)) faltas.push('Remuneração')
  return faltas
}

/** Campos da campanha necessários no contrato. */
export function pendenciasContratoCampanha(config = null) {
  const cfg = { ...CONTRATOS_CONFIG_DEFAULT, ...(config || loadContratosConfig()) }
  const faltas = []
  if (!String(cfg.candidatoNome || '').trim()) faltas.push('Nome do candidato (campanha)')
  if (!String(cfg.candidatoCnpj || '').trim()) faltas.push('CNPJ da campanha')
  return faltas
}

export function podeGerarContrato(membro, config = null) {
  return {
    ok: pendenciasContratoMembro(membro).length === 0
      && pendenciasContratoCampanha(config).length === 0,
    membro: pendenciasContratoMembro(membro),
    campanha: pendenciasContratoCampanha(config),
  }
}

export function listarTemplates(categoria = '') {
  const all = CONTRATO_TEMPLATES
  if (!categoria) return all
  return all.filter(t => t.categoria === categoria)
}

export function getTemplate(id) {
  return CONTRATO_TEMPLATES.find(t => t.id === id) || null
}

function brDate(iso) {
  const s = String(iso || '').trim()
  if (!s) return ''
  const mbr = s.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (mbr) return `${mbr[3]}/${mbr[2]}/${mbr[1]}`
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s.slice(0, 10)
  return s
}

function valorUtil(v) {
  const s = String(v ?? '').trim()
  if (!s) return ''
  if (/^[_….\-\s]+$/.test(s)) return ''
  if (/^_{3,}/.test(s)) return ''
  return s
}

/** Monta só as opções preenchidas: a), ou a)+b), etc. */
export function montarListaObjeto(...itens) {
  const preenchidos = itens.map(valorUtil).filter(Boolean)
  if (!preenchidos.length) return 'a) ________________'
  return preenchidos.map((t, i) => `${String.fromCharCode(97 + i)}) ${t}`).join('\n')
}

function padLinha(texto, largura) {
  const s = String(texto ?? '')
  if (s.length >= largura) return s.slice(0, largura)
  return s + ' '.repeat(largura - s.length)
}

/** Rodapé alinhado: linha → nome → CPF/CNPJ → rótulo. */
export function montarBlocoAssinaturas(vars = {}) {
  const L = 38
  const gap = '     '
  const esqNome = vars.candidatoNome || '________________'
  const dirNome = vars.prestadorNome || '________________'
  const esqDoc = `CNPJ: ${vars.candidatoCnpj || '________________'}`
  const dirDoc = `CPF: ${vars.prestadorCpf || '________________'}`
  const esqTit = 'CONTRATANTE / ADM. FINANCEIRO'
  const dirTit = 'CONTRATADO'
  const linha = '_'.repeat(L)
  return [
    `${linha}${gap}${linha}`,
    `${padLinha(esqNome, L)}${gap}${dirNome}`,
    `${padLinha(esqDoc, L)}${gap}${dirDoc}`,
    `${padLinha(esqTit, L)}${gap}${dirTit}`,
  ].join('\n')
}

/** Variáveis disponíveis para {{chave}} e preenchimento inteligente. */
export function montarVariaveisContrato(membro = null, config = null, extras = {}) {
  const cfg = { ...CONTRATOS_CONFIG_DEFAULT, ...(config || loadContratosConfig()) }
  const m = membro || {}
  const doc = m.contratoDoc && typeof m.contratoDoc === 'object' ? m.contratoDoc : {}
  const valorNum = parseValor(
    extras.valor != null && extras.valor !== ''
      ? extras.valor
      : (doc.valor != null && doc.valor !== '' ? doc.valor : m.salario),
  )
  // Datas fixas da campanha (não usam data do membro)
  const dataInicio = CONTRATO_DATA_INICIO_FIXA
  const dataFim = CONTRATO_DATA_FIM_FIXA
  const horasRaw = String(extras.horas || doc.horas || m.horasContratado || cfg.horasPadrao || '').trim()
  const horas = horasRaw || '____ horas'
  const diasSemana = String(extras.diasSemana || doc.diasSemana || '').trim()
  const regiao = String(
    extras.regiao
    || doc.regiao
    || (Array.isArray(m.bairros) && m.bairros.length ? m.bairros.join(', ') : '')
    || m.cidadeAtuacao
    || '',
  ).trim()
  const endereco = formatarEnderecoContrato(m)
  const assinaturaIso = dataInicio
  const valorComplemento = String(cfg.valorComplemento || '').replace(/\{horas\}/gi, horas)
  const paragrafoExclusividade = String(cfg.paragrafoExclusividade || '')
    .replace(/\{multa\}/gi, cfg.multaExclusividade || '1 (um) salário-mínimo')

  const nasc = m.dataNascimento
    ? (brDate(m.dataNascimento) || String(m.dataNascimento))
    : ''

  const objetoA = valorUtil(extras.objetoA || doc.objetoA || m.cargo || '')
  const objetoB = valorUtil(extras.objetoB || doc.objetoB || '')
  const objetoC = valorUtil(extras.objetoC || doc.objetoC || '')
  const listaObjeto = montarListaObjeto(objetoA, objetoB, objetoC)

  const base = {
    numeroContrato: String(extras.numero || m.contrato || '').trim() || '01',
    ano: String(extras.ano || cfg.ano || '2026'),
    tituloTipo: cfg.tituloTipo || '',
    candidatoNome: String(cfg.candidatoNome || '').trim(),
    candidatoCnpj: String(cfg.candidatoCnpj || '').trim(),
    candidatoEndereco: String(cfg.candidatoEndereco || '').trim(),
    foro: String(cfg.foro || '').trim() || '________________ - SC',
    cidadeAssinatura: String(cfg.cidadeAssinatura || '').trim() || '________________',
    dataAssinatura: dataAssinaturaExtenso(assinaturaIso, cfg.cidadeAssinatura),
    dataAssinaturaCurta: brDate(assinaturaIso),
    prestadorNome: String(m.nome || extras.prestadorNome || '').trim(),
    prestadorCpf: String(m.cpf || extras.prestadorCpf || '').trim(),
    prestadorRg: String(m.rg || extras.prestadorRg || '').trim(),
    prestadorNascimento: nasc,
    prestadorTelefone: String(m.telefone || '').trim(),
    prestadorEmail: String(m.email || '').trim(),
    prestadorEndereco: endereco,
    prestadorLogradouro: String(m.logradouro || '').trim(),
    prestadorNumero: String(m.numero || '').trim(),
    prestadorBairro: String(m.bairroResidencia || '').trim(),
    prestadorCidade: String(m.cidade || m.cidadeAtuacao || '').trim(),
    prestadorCep: String(m.cep || '').trim(),
    prestadorBanco: String(m.banco || '').trim(),
    prestadorAgencia: String(m.agencia || '').trim(),
    prestadorConta: String(m.conta || '').trim(),
    prestadorPix: String(m.pix || '').trim(),
    valor: valorNum > 0 ? fmtMoeda(valorNum) : '',
    valorNumero: valorNum > 0 ? String(valorNum) : '',
    valorExtenso: valorNum > 0 ? valorPorExtenso(valorNum) : '',
    dataInicio: dataPorExtenso(dataInicio) || brDate(dataInicio),
    dataFim: dataPorExtenso(dataFim) || brDate(dataFim),
    dataInicioCurta: brDate(dataInicio),
    dataFimCurta: brDate(dataFim),
    horas,
    diasSemana,
    regiao: regiao || '________________',
    objetoA,
    objetoB,
    objetoC,
    listaObjeto,
    objetoTexto: cfg.objetoTexto || '',
    regiaoRotulo: cfg.regiaoRotulo || '',
    valorComplemento,
    clausulaQuarta: cfg.clausulaQuarta || '',
    clausulaQuintaIntro: cfg.clausulaQuintaIntro || '',
    paragrafoRescisao: cfg.paragrafoRescisao || '',
    paragrafoDanos: cfg.paragrafoDanos || '',
    paragrafoExclusividade,
    paragrafoJornada: cfg.paragrafoJornada || '',
    atividades: String(extras.atividades || doc.atividades || m.cargo || '').trim(),
    ...(extras.vars || {}),
  }
  base.blocoAssinaturas = montarBlocoAssinaturas(base)
  return base
}

function blankFor(key) {
  if (/data|Data|Curta|Assinatura/.test(key)) return '___/___/______'
  if (key === 'valor' || key === 'valorExtenso') return '____________'
  if (key === 'candidatoCnpj' || key === 'prestadorCpf') return '___xxx.xxx.xxx-xx___'
  return '________________'
}

function fillLabeled(text, label, value) {
  if (!value) return text
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // LABEL:   ou LABEL: |  ou LABEL: ____
  const re = new RegExp(`(${esc}\\s*[:：]?\\s*)(\\|\\s*)?([_.…\\-]{2,}|\\.{3,})?\\s*(?=\\n|$)`, 'i')
  return text.replace(re, `$1${value}`)
}

/** Aplica {{placeholders}} + preenchimento em linhas em branco comuns. */
export function aplicarTemplate(corpo, vars = {}) {
  let t = String(corpo || '')

  t = t.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = vars[key]
    if (v == null || String(v).trim() === '') return blankFor(key)
    return String(v)
  })

  // Ano genérico nos títulos (só se ainda houver 2020-2029 fixo)
  if (vars.ano) {
    t = t.replace(/ELEI[ÇC][ÕO]ES\s+202[0-9]/gi, `ELEIÇÕES ${vars.ano}`)
    t = t.replace(/ELEI[ÇC][ÃA]O\s+202[0-9]/gi, `ELEIÇÃO ${vars.ano}`)
  }

  if (vars.candidatoNome) {
    t = t.replace(
      /(CONTRATANTE:\s*ELEI[ÇC][ÃA]O\s+\d{4}\s*)[_.\s]{5,}/i,
      `$1${vars.candidatoNome} `,
    )
    t = t.replace(
      /(favor de ELEI[ÇC][ÃA]O\s+\d{4}\s*)[_.\s]{5,}/i,
      `$1${vars.candidatoNome} `,
    )
  }
  if (vars.candidatoCnpj) {
    t = t.replace(/(CNPJ\s*(sob\s*)?n\.?[ºo°]?\s*)[_.\s]{5,}/i, `$1${vars.candidatoCnpj}`)
  }

  // Bloco CONTRATADO (tabelas mal convertidas: "CONTRATADO: |" / "CPF: |")
  if (vars.prestadorNome) {
    t = t.replace(/(CONTRATADO:\s*)(?:\|\s*)?(?=\n|$)/gi, `$1${vars.prestadorNome}`)
    t = t.replace(/(CONTRATADO:\s*)[_.\s]{5,}/i, `$1${vars.prestadorNome}`)
  }

  const labeled = [
    ['Nome', vars.prestadorNome],
    ['CPF', vars.prestadorCpf],
    ['RG', vars.prestadorRg],
    ['Data de nascimento', vars.prestadorNascimento],
    ['Telefone', vars.prestadorTelefone],
    ['E-mail', vars.prestadorEmail],
    ['Email', vars.prestadorEmail],
    ['Endereço', vars.prestadorEndereco],
    ['Bairro', vars.prestadorBairro],
    ['Cidade', vars.prestadorCidade],
    ['CEP', vars.prestadorCep],
    ['Banco', vars.prestadorBanco],
    ['Agência', vars.prestadorAgencia],
    ['Conta', vars.prestadorConta],
    ['PIX', vars.prestadorPix],
  ]
  for (const [lab, val] of labeled) {
    if (!val) continue
    // "CPF: |" ou "CPF:" no fim da linha
    const esc = lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    t = t.replace(
      new RegExp(`(${esc}\\s*:\\s*)(?:\\|\\s*)?(?=\n|$)`, 'gi'),
      `$1${val}`,
    )
    t = fillLabeled(t, lab, val)
  }

  // Inf. Bancárias numa linha
  if (vars.prestadorBanco || vars.prestadorPix) {
    t = t.replace(
      /Inf\.?\s*Banc[áa]rias[^\n]*/i,
      `Inf. Bancárias — Banco: ${vars.prestadorBanco || '____'}  Agência: ${vars.prestadorAgencia || '____'}  Conta: ${vars.prestadorConta || '____'}  PIX: ${vars.prestadorPix || '____'}`,
    )
  }

  if (vars.valor) {
    const v = String(vars.valor).replace(/^R\$\s*/, '')
    t = t.replace(/(R\$\s*)[_.\s]{3,}/, `$1${v}`)
    t = t.replace(/(será de\s*)R?\$?\s*[_.\s]{3,}/i, `$1${vars.valor}`)
  }
  if (vars.foro && !String(vars.foro).includes('___')) {
    t = t.replace(/(Foro da Comarca de\s*)[_.\s]{5,}/i, `$1${vars.foro}`)
  }
  if (vars.cidadeAssinatura && !String(vars.cidadeAssinatura).includes('___')) {
    t = t.replace(/(Município de\s*)[_.\s]{5,}/i, `$1${vars.cidadeAssinatura}`)
  }
  if (vars.objetoA) t = t.replace(/(a\)\s*)[_.\s]{5,}/, `$1${vars.objetoA}`)
  if (vars.objetoB) t = t.replace(/(b\)\s*)[_.\s]{5,}/, `$1${vars.objetoB}`)
  if (vars.objetoC) t = t.replace(/(c\)\s*)[_.\s]{5,}/, `$1${vars.objetoC}`)
  if (vars.atividades) {
    t = t.replace(/\[COLOCA AQUI AS ATIVIDADES DO CONTRATO[^\]]*\]/i, vars.atividades)
  }
  if (vars.dataInicioCurta && vars.dataFimCurta
    && !vars.dataInicioCurta.includes('___') && !vars.dataFimCurta.includes('___')) {
    t = t.replace(
      /a contar de\s*[_./\d\s]{3,}até o dia\s*[_./\d\s]{3,}/i,
      `a contar de ${vars.dataInicioCurta} até o dia ${vars.dataFimCurta}`,
    )
  }
  if (vars.regiao && !String(vars.regiao).includes('___')) {
    t = t.replace(/(especialmente nos bairros:\s*)[_.\s]{3,}/i, `$1${vars.regiao}`)
    t = t.replace(/(XXXX HORAS)/i, vars.horas || '$1')
    t = t.replace(/(por XXXX DIAS)/i, `por ${vars.diasSemana || '____'} DIAS`)
  }
  if (vars.horas && !/____/.test(vars.horas)) {
    t = t.replace(/XXXX\s*HORAS/gi, vars.horas)
  }
  if (vars.diasSemana && !/____/.test(String(vars.diasSemana))) {
    t = t.replace(/XXXX\s*DIAS/gi, `${vars.diasSemana} DIAS`)
  }

  // Remove opções b)/c) (e a)) vazias na cláusula objeto
  t = t.replace(/^[bc]\)\s*([_\s.…]*|________________)?\s*$/gim, '')
  t = t.replace(/^a\)\s*([_\s.…]*|________________)\s*$/gim, 'a) ________________')
  // Colapsa linhas em branco extras criadas pela remoção
  t = t.replace(/\n{3,}/g, '\n\n')

  return t
}

export function gerarCorpoContrato(templateId, membro, config, extras = {}) {
  const tpl = getTemplate(templateId)
  if (!tpl) return ''
  const vars = montarVariaveisContrato(membro, config, extras)
  return removerChequeDoTexto(aplicarTemplate(tpl.corpo, vars))
}

export function removerChequeDoTexto(texto) {
  return String(texto || '')
    .replace(/mediante o cheque nominal ou transferência bancária/gi, 'mediante transferência bancária')
    .replace(/por meio de cheque nominal ou transferência bancária/gi, 'por meio de transferência bancária')
    .replace(/cheque nominal ou /gi, '')
}

export function loadRascunhos() {
  const raw = readStorage(RASCUNHOS_KEY, [])
  const lista = Array.isArray(raw) ? raw : []
  let mudou = false
  const next = lista.map(r => {
    if (!r || typeof r.corpo !== 'string' || !/cheque/i.test(r.corpo)) return r
    mudou = true
    return { ...r, corpo: removerChequeDoTexto(r.corpo) }
  })
  if (mudou) saveRascunhos(next)
  return next
}

export function saveRascunhos(lista) {
  writeStorage(RASCUNHOS_KEY, Array.isArray(lista) ? lista : [])
  return lista
}

export function uidRascunho() {
  return `ctr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** HTML de impressão a partir do texto livre (já editado). */
export function montarHtmlTextoContrato(titulo, corpo, auth = null) {
  const texto = removerChequeDoTexto(String(corpo || ''))
  // Separa o bloco final de assinaturas (linha com muitos _) para renderizar em 2 colunas
  const linhas = texto.split('\n')
  let idxAss = -1
  for (let i = linhas.length - 1; i >= 0; i--) {
    if (/_{20,}/.test(linhas[i]) && /_{20,}.+_{20,}/.test(linhas[i].replace(/\s{2,}/g, '  '))) {
      idxAss = i
      break
    }
    // também: linha só com underscores separados
    if ((linhas[i].match(/_/g) || []).length >= 40 && linhas[i].includes('     ')) {
      idxAss = i
      break
    }
  }

  let corpoHtml = ''
  let assinHtml = ''

  if (idxAss >= 0 && idxAss + 3 < linhas.length) {
    const antesLinhas = linhas.slice(0, idxAss)
    const bloco = linhas.slice(idxAss, idxAss + 4)
    const cols = bloco.map(ln => {
      const parts = ln.split(/\s{3,}/)
      return { e: (parts[0] || '').trim(), d: (parts[1] || '').trim() }
    })

    // Mantém bloco final CONTRATADO + assinaturas juntos (evita “sobrinha” na 2ª folha)
    let idxFecha = -1
    for (let i = antesLinhas.length - 1; i >= 0; i--) {
      if (/^CONTRATADO\s*:/i.test(antesLinhas[i].trim())) {
        idxFecha = i
        break
      }
    }
    let corpoAntes = antesLinhas
    let fechamentoTxt = ''
    if (idxFecha >= 0 && idxFecha > 5) {
      corpoAntes = antesLinhas.slice(0, idxFecha)
      fechamentoTxt = antesLinhas.slice(idxFecha).join('\n')
    }

    corpoHtml = formatarParasHtml(corpoAntes.join('\n'))
    const fechaHtml = fechamentoTxt
      ? `<div class="fechamento">${formatarParasHtml(fechamentoTxt)}</div>`
      : ''
    assinHtml = `<div class="bloco-final">${fechaHtml}<div class="assinaturas">
      ${htmlCaixaAssinatura({
        lado: 'esquerda',
        nome: cols[1]?.e || '',
        doc: cols[2]?.e || '',
        papel: cols[3]?.e || 'CONTRATANTE',
        imagem: auth?.assinaturaDeputado || '',
      })}
      ${htmlCaixaAssinatura({
        lado: 'direita',
        nome: cols[1]?.d || '',
        doc: cols[2]?.d || '',
        papel: cols[3]?.d || 'CONTRATADO(A)',
        imagem: auth?.assinaturaContratado || '',
      })}
    </div>${htmlRodapeAutenticidade(auth)}</div>`
  } else {
    corpoHtml = formatarParasHtml(texto)
    assinHtml = `<div class="bloco-final"><div class="assinaturas">
      ${htmlCaixaAssinatura({ lado: 'esquerda', nome: '', doc: '', papel: 'CONTRATANTE', imagem: auth?.assinaturaDeputado || '' })}
      ${htmlCaixaAssinatura({ lado: 'direita', nome: '', doc: '', papel: 'CONTRATADO(A)', imagem: auth?.assinaturaContratado || '' })}
    </div>${htmlRodapeAutenticidade(auth)}</div>`
  }

  // Só aperta quando o texto é realmente longo; o padrão fica legível em A4
  const chars = texto.length
  const dens = chars > 6800 ? 'denso' : chars > 4800 ? 'compacto' : 'normal'

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>${escHtml(titulo || 'Contrato')}</title>
<style>
  @page { size: A4; margin: 16mm 18mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: auto; }
  body {
    font-family: "Times New Roman", Times, serif;
    color: #111;
    background: #fff;
    padding: 0;
    font-size: 13px;
    line-height: 1.48;
  }
  body.compacto { font-size: 12px; line-height: 1.4; }
  body.denso { font-size: 11.5px; line-height: 1.36; }
  h1 {
    text-align: center;
    font-size: 14.5px;
    font-weight: bold;
    margin-bottom: 16px;
    text-transform: uppercase;
    line-height: 1.4;
  }
  body.compacto h1 { font-size: 13.5px; margin-bottom: 12px; }
  body.denso h1 { font-size: 13px; margin-bottom: 10px; }
  p { margin-bottom: 10px; text-align: justify; white-space: pre-wrap; }
  body.compacto p { margin-bottom: 8px; }
  body.denso p { margin-bottom: 6px; }
  p.clausula { font-weight: bold; margin-top: 12px; margin-bottom: 6px; }
  body.compacto p.clausula { margin-top: 10px; }
  body.denso p.clausula { margin-top: 8px; margin-bottom: 4px; }
  .fechamento {
    page-break-inside: avoid;
    break-inside: avoid;
    margin-top: 14px;
  }
  .fechamento + .assinaturas { margin-top: 22px; }
  ${CSS_ASSINATURA_AUTH}
  @media print {
    body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    svg, img, .caixa-assina { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    * { -webkit-font-smoothing: antialiased; }
  }
</style>
</head>
<body class="${dens}">
${corpoHtml}
${assinHtml}
</body>
</html>`
}

function linhaTituloContrato(ln) {
  const t = String(ln || '').trim()
  if (!t || t.length > 160) return false
  if (!/CONTRATO|TERMO|RECIBO|AUTORIZAÇ|AUTORIZAC/i.test(t)) return false
  // Aceita maiúsculas + números/pontuação típicos do cabeçalho
  return t === t.toUpperCase() || /^CONTRATO\b/i.test(t)
}

function formatarParasHtml(texto) {
  const linhas = String(texto || '').split('\n')
  const titulos = []
  let i = 0
  while (i < linhas.length) {
    const raw = linhas[i]
    const t = raw.trim()
    if (!t) {
      if (titulos.length) { i += 1; break }
      i += 1
      continue
    }
    if (linhaTituloContrato(t)) {
      titulos.push(t)
      i += 1
      continue
    }
    break
  }

  const resto = linhas.slice(i).join('\n')
  const tituloHtml = titulos.length
    ? `<h1>${titulos.map(escHtml).join('<br/>')}</h1>`
    : ''

  const corpo = String(resto || '')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => {
      const lines = escHtml(p).replace(/\n/g, '<br/>')
      if (/^CL[ÁA]USULA|^Cl[áa]usula|^Par[áa]grafo/i.test(p.trim())) {
        return `<p class="clausula">${lines}</p>`
      }
      return `<p>${lines}</p>`
    })
    .join('\n')

  return `${tituloHtml}\n${corpo}`.trim()
}

export function imprimirTextoContrato(titulo, corpo, auth = null) {
  const html = montarHtmlTextoContrato(titulo, corpo, auth)
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
  if (win.document.readyState === 'complete') setTimeout(disparar, 900)
  else {
    win.onload = () => setTimeout(disparar, 900)
    setTimeout(disparar, 1400)
  }
  return { ok: true }
}

function textoPdfSeguro(s) {
  return String(s ?? '')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00A0/g, ' ')
    .replace(/\r/g, '')
}

function separarCorpoAssinatura(corpo) {
  const texto = removerChequeDoTexto(String(corpo || ''))
  const linhas = texto.split('\n')
  let idxAss = -1
  for (let i = linhas.length - 1; i >= 0; i--) {
    if (/_{20,}/.test(linhas[i]) && /_{20,}.+_{20,}/.test(linhas[i].replace(/\s{2,}/g, '  '))) {
      idxAss = i
      break
    }
    if ((linhas[i].match(/_/g) || []).length >= 40 && linhas[i].includes('     ')) {
      idxAss = i
      break
    }
  }
  if (idxAss < 0 || idxAss + 3 >= linhas.length) {
    return { linhasCorpo: linhas, fechamento: [], cols: null }
  }
  const antes = linhas.slice(0, idxAss)
  const bloco = linhas.slice(idxAss, idxAss + 4)
  const cols = bloco.map(ln => {
    const parts = ln.split(/\s{3,}/)
    return { e: (parts[0] || '').trim(), d: (parts[1] || '').trim() }
  })
  let idxFecha = -1
  for (let i = antes.length - 1; i >= 0; i--) {
    if (/^CONTRATADO\s*:/i.test(antes[i].trim())) {
      idxFecha = i
      break
    }
  }
  if (idxFecha >= 0 && idxFecha > 5) {
    return {
      linhasCorpo: antes.slice(0, idxFecha),
      fechamento: antes.slice(idxFecha),
      cols,
    }
  }
  return { linhasCorpo: antes, fechamento: [], cols }
}

function nomeArquivoPdfContrato(titulo, codigo) {
  const base = String(titulo || 'contrato')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'contrato'
  const cod = String(codigo || '').replace(/[^A-Z0-9]/gi, '')
  return `${base}${cod ? `-${cod}` : ''}.pdf`
}

export function baixarBlobArquivo(blob, filename) {
  const a = document.createElement('a')
  const url = URL.createObjectURL(blob)
  a.href = url
  a.download = filename || 'contrato.pdf'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/**
 * PDF com texto vetorial (Times) — nítido na impressão.
 * Não usa html2canvas (que gerava aparência de papel escaneado).
 */
export async function gerarPdfBlobContrato(titulo, corpo, auth = null) {
  try {
    const { jsPDF } = await import('jspdf')
    const QRCode = (await import('qrcode')).default
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const margin = 16
    const maxW = pageW - margin * 2
    let y = margin

    const novaPagina = () => {
      pdf.addPage()
      y = margin
    }
    const precisa = (h) => {
      if (y + h > pageH - margin) novaPagina()
    }
    const escrever = (txt, { size = 11, bold = false, align = 'left', gap = 1.2 } = {}) => {
      const t = textoPdfSeguro(txt)
      if (!t.trim()) {
        y += 2
        return
      }
      pdf.setFont('times', bold ? 'bold' : 'normal')
      pdf.setFontSize(size)
      pdf.setTextColor(17, 17, 17)
      const lines = pdf.splitTextToSize(t, maxW)
      const lineH = size * 0.42
      precisa(lines.length * lineH + gap)
      pdf.text(lines, align === 'center' ? pageW / 2 : margin, y, {
        align: align === 'center' ? 'center' : 'left',
        baseline: 'top',
      })
      y += lines.length * lineH + gap
    }

    const { linhasCorpo, fechamento, cols } = separarCorpoAssinatura(corpo)

    // Títulos iniciais (linhas CONTRATO…)
    const titulos = []
    let i = 0
    while (i < linhasCorpo.length) {
      const raw = linhasCorpo[i]
      const t = raw.trim()
      if (!t) {
        if (titulos.length) { i += 1; break }
        i += 1
        continue
      }
      if (linhaTituloContrato(t)) {
        titulos.push(t)
        i += 1
        continue
      }
      break
    }
    if (!titulos.length && titulo) titulos.push(String(titulo))
    for (const t of titulos) {
      escrever(t, { size: 12, bold: true, align: 'center', gap: 2.2 })
    }
    y += 2

    // Corpo: agrupa linhas em blocos (parágrafos)
    const resto = linhasCorpo.slice(i)
    let bloco = []
    const flushBloco = () => {
      const p = bloco.join('\n').trim()
      bloco = []
      if (!p) return
      const isClausula = /^CL[ÁA]USULA|^Cl[áa]usula|^Par[áa]grafo/i.test(p)
      escrever(p.replace(/\n/g, ' '), {
        size: isClausula ? 11 : 10.5,
        bold: isClausula,
        gap: isClausula ? 2.4 : 2.8,
      })
    }
    for (const ln of resto) {
      if (!String(ln).trim()) {
        flushBloco()
        continue
      }
      bloco.push(ln)
    }
    flushBloco()

    if (fechamento.length) {
      y += 2
      for (const ln of fechamento) {
        if (!String(ln).trim()) { y += 1.5; continue }
        escrever(ln, { size: 10.5, bold: /^CONTRATADO/i.test(ln.trim()), gap: 1.6 })
      }
    }

    // Assinaturas — bloco inteiro na mesma página se possível
    const boxH = 28
    const colGap = 10
    const colW = (maxW - colGap) / 2
    const assinH = 8 + boxH + 18
    const authH = auth?.codigo ? 32 : 0
    precisa(assinH + authH + 4)
    y += 4

    const left = {
      hint: 'Assine somente neste quadro — CONTRATANTE',
      nome: cols?.[1]?.e || auth?.contratanteNome || '',
      doc: cols?.[2]?.e || '',
      papel: cols?.[3]?.e || 'CONTRATANTE',
      img: auth?.assinaturaDeputado || '',
    }
    const right = {
      hint: 'Assine somente neste quadro — CONTRATADO',
      nome: cols?.[1]?.d || auth?.contratadoNome || '',
      doc: cols?.[2]?.d || '',
      papel: cols?.[3]?.d || 'CONTRATADO(A)',
      img: auth?.assinaturaContratado || '',
    }

    const desenharCaixa = (x, info) => {
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)
      pdf.setTextColor(68, 68, 68)
      pdf.text(textoPdfSeguro(info.hint).toUpperCase(), x + colW / 2, y, { align: 'center', baseline: 'top' })
      const boxY = y + 5
      pdf.setDrawColor(51, 51, 51)
      pdf.setLineDashPattern([1.2, 1.2], 0)
      pdf.setLineWidth(0.35)
      pdf.rect(x, boxY, colW, boxH)
      pdf.setLineDashPattern([], 0)

      if (ehAssinaturaGovbr(info.img)) {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(12)
        pdf.setTextColor(19, 81, 180)
        pdf.text('Gov.br', x + colW / 2, boxY + boxH / 2 - 2, { align: 'center' })
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(7)
        pdf.text('ASSINADO DIGITALMENTE', x + colW / 2, boxY + boxH / 2 + 4, { align: 'center' })
      } else if (info.img && String(info.img).startsWith('data:')) {
        try {
          const fmt = String(info.img).includes('image/jpeg') ? 'JPEG' : 'PNG'
          pdf.addImage(info.img, fmt, x + 4, boxY + 2, colW - 8, boxH - 4, undefined, 'FAST')
        } catch { /* ignore */ }
      }

      let ty = boxY + boxH + 3
      pdf.setTextColor(17, 17, 17)
      if (info.nome) {
        pdf.setFont('times', 'bold')
        pdf.setFontSize(9)
        pdf.text(textoPdfSeguro(info.nome), x + colW / 2, ty, { align: 'center', baseline: 'top' })
        ty += 4
      }
      if (info.doc) {
        pdf.setFont('times', 'normal')
        pdf.setFontSize(8)
        pdf.text(textoPdfSeguro(info.doc), x + colW / 2, ty, { align: 'center', baseline: 'top' })
        ty += 3.5
      }
      if (info.papel) {
        pdf.setFont('times', 'normal')
        pdf.setFontSize(8)
        pdf.setTextColor(51, 51, 51)
        pdf.text(textoPdfSeguro(info.papel).toUpperCase(), x + colW / 2, ty, { align: 'center', baseline: 'top' })
      }
    }

    desenharCaixa(margin, left)
    desenharCaixa(margin + colW + colGap, right)
    y += 5 + boxH + 16

    if (auth?.codigo) {
      precisa(30)
      pdf.setDrawColor(187, 187, 187)
      pdf.setLineWidth(0.3)
      pdf.line(margin, y, pageW - margin, y)
      y += 4
      const codigo = formatarCodigo(auth.codigo)
      const url = urlVerificacao(codigo)
      const hash = hashCurto(auth.hash || auth.hashCorpo || '')
      try {
        const qrData = await QRCode.toDataURL(url, {
          width: 160,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#000000', light: '#ffffff' },
        })
        pdf.addImage(qrData, 'PNG', margin, y, 22, 22)
      } catch { /* ignore */ }
      const tx = margin + 26
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(9)
      pdf.setTextColor(17, 17, 17)
      pdf.text('DOCUMENTO AUTENTICADO PELA CAMPANHA', tx, y + 2, { baseline: 'top' })
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.text(`Código: ${textoPdfSeguro(codigo)}`, tx, y + 7, { baseline: 'top' })
      if (hash) pdf.text(`Hash: ${textoPdfSeguro(hash)}`, tx, y + 11, { baseline: 'top' })
      const confira = pdf.splitTextToSize(`Confira em ${url}`, maxW - 28)
      pdf.text(confira, tx, y + 15, { baseline: 'top' })
      y += 26
    }

    const blob = pdf.output('blob')
    return { ok: true, blob, filename: nomeArquivoPdfContrato(titulo, auth?.codigo) }
  } catch (err) {
    return { ok: false, erro: err?.message || 'pdf' }
  }
}
