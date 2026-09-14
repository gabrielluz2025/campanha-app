/** Código de autenticidade + conferência pública dos contratos. */

import { fetchApiKey, postApiKey } from './agendaShare'
import { loadContratosConfig } from './equipeContratoDoc'
import { qrSvgMarkup } from './qrSvg'

export const GOVBR_ASSINADOR = 'https://assinador.iti.br/'
export const AUTH_KEY_PREFIX = 'contrato_auth_'

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function limparCodigo(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function formatarCodigo(s) {
  const raw = limparCodigo(s)
  if (raw.length < 12) return raw
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
}

export function gerarCodigoContrato() {
  let raw = ''
  const bytes = new Uint8Array(12)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
    for (let i = 0; i < 12; i++) raw += ALFABETO[bytes[i] % ALFABETO.length]
  } else {
    for (let i = 0; i < 12; i++) {
      raw += ALFABETO[Math.floor(Math.random() * ALFABETO.length)]
    }
  }
  return formatarCodigo(raw)
}

export function authStorageKey(codigo) {
  return `${AUTH_KEY_PREFIX}${limparCodigo(codigo)}`
}

export function urlVerificacao(codigo, origin) {
  const base = origin
    || (typeof window !== 'undefined' ? window.location.origin : 'https://campanha.space')
  return `${base}/verificar.html?c=${encodeURIComponent(formatarCodigo(codigo))}`
}

export function urlAssinatura(codigo, origin) {
  const base = origin
    || (typeof window !== 'undefined' ? window.location.origin : 'https://campanha.space')
  return `${base}/assinar.html?c=${encodeURIComponent(formatarCodigo(codigo))}`
}

export function urlPdfContrato(codigo, origin) {
  const base = origin
    || (typeof window !== 'undefined' ? window.location.origin : 'https://campanha.space')
  return `${base}/contrato-pdf.html?c=${encodeURIComponent(formatarCodigo(codigo))}`
}

export function ehAssinaturaGovbr(v) {
  return String(v || '').toLowerCase() === 'govbr'
}

export function mensagemEnvioContrato({ nome, titulo, urlAssinar, codigo, modo = 'govbr' }) {
  const primeiro = String(nome || '').trim().split(/\s+/)[0] || ''
  if (modo === 'mao') {
    const linhas = [
      primeiro ? `Olá, ${primeiro}!` : 'Olá!',
      '',
      `A campanha liberou a assinatura à mão livre do seu contrato${titulo ? ` (${titulo})` : ''}.`,
      '',
      'COMO ASSINAR À MÃO',
      '1) Abra o link abaixo (pode ler o contrato na página).',
      '2) No quadro da DIREITA, desenhe sua assinatura com o dedo ou o mouse.',
      '3) Digite o seu CPF completo para confirmar que é você.',
      '4) Toque em “Assinar à mão e enviar”.',
      '',
      urlAssinar,
    ]
    if (codigo) linhas.push('', `Código do documento: ${codigo}`)
    return linhas.join('\n')
  }
  const linhas = [
    primeiro ? `Olá, ${primeiro}!` : 'Olá!',
    '',
    `Segue o PDF do seu contrato${titulo ? ` (${titulo})` : ''} e o passo a passo para assinar no Gov.br — é o jeito oficial.`,
    '',
    'COMO ASSINAR NO GOV.BR',
    '1) Salve o PDF que veio nesta mensagem (toque no arquivo → Salvar).',
    '2) Abra o portal oficial: https://assinador.iti.br/',
    '3) Entre com sua conta Gov.br. Precisa ser nível Prata ou Ouro (no app Gov.br dá para ver o nível).',
    '4) Toque em “Escolher arquivo” e envie o PDF que você salvou.',
    '5) No documento, clique no quadro da DIREITA (é o seu) e assine.',
    '6) Baixe o PDF já assinado e guarde no celular.',
    '7) Abra o link abaixo, confira o contrato e toque em “Já assinei no Gov.br”, digitando o seu CPF:',
    '',
    urlAssinar,
  ]
  if (codigo) {
    linhas.push('', `Código do documento: ${codigo}`)
  }
  linhas.push(
    '',
    'Não conseguiu? Avise a campanha. Aí enviamos o link para assinar à mão livre.',
  )
  return linhas.join('\n')
}

export async function hashCpf(cpf) {
  const d = String(cpf || '').replace(/\D/g, '')
  if (d.length < 11) return ''
  return hashTexto(`cpf:${d}`)
}

export async function hashTexto(texto) {
  const s = String(texto || '').replace(/\r\n/g, '\n').trim()
  return hashBytes(new TextEncoder().encode(s))
}

export async function hashBytes(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || [])
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    let h = 0
    for (let i = 0; i < data.length; i++) h = ((h << 5) - h + data[i]) | 0
    return `local${Math.abs(h).toString(16).padStart(8, '0')}`
  }
  const buf = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export function hashCurto(hash) {
  const h = String(hash || '')
  if (h.length < 12) return h.toUpperCase()
  return `${h.slice(0, 8)}…${h.slice(-4)}`.toUpperCase()
}

export function mascararCpf(cpf) {
  const d = String(cpf || '').replace(/\D/g, '')
  if (d.length < 2) return '—'
  return `***.***.***-${d.slice(-2)}`
}

export function statusAssinatura(doc = {}) {
  const a = Boolean(doc.assinadoContratadoEm)
  const b = Boolean(doc.assinadoDeputadoEm)
  if (a && b) return 'completo'
  if (a) return 'contratado'
  if (b) return 'deputado'
  return 'gerado'
}

export function rotuloStatusAssinatura(st) {
  if (st === 'completo') return 'Assinado pelos dois'
  if (st === 'contratado') return 'Assinado pelo contratado'
  if (st === 'deputado') return 'Assinado pelo deputado'
  return 'Aguardando assinaturas'
}

export function registroPublicoDe({ rascunho, membro, config, hash, cpfHash = '' }) {
  const cfg = config || loadContratosConfig()
  const codigo = formatarCodigo(rascunho?.codigoAutenticidade)
  const st = statusAssinatura(rascunho)
  return {
    tipo: 'contrato-auth',
    codigo,
    hash: hash || rascunho?.hashCorpo || '',
    titulo: rascunho?.titulo || 'Contrato',
    corpo: rascunho?.corpo || '',
    contratadoNome: membro?.nome || rascunho?.contratadoNome || '',
    contratadoCpfMask: mascararCpf(membro?.cpf || rascunho?.contratadoCpf || ''),
    cpfHash: cpfHash || rascunho?.cpfHash || '',
    contratanteNome: cfg.candidatoNome || '',
    contratanteCnpj: cfg.candidatoCnpj || '',
    status: st,
    assinadoContratadoEm: rascunho?.assinadoContratadoEm || '',
    assinadoDeputadoEm: rascunho?.assinadoDeputadoEm || '',
    assinaturaContratado: rascunho?.assinaturaContratado || '',
    assinaturaDeputado: rascunho?.assinaturaDeputado || '',
    metodoAssinaturaContratado: rascunho?.metodoAssinaturaContratado || '',
    metodoAssinaturaDeputado: rascunho?.metodoAssinaturaDeputado || '',
    permitirAssinaturaMaoLivre: Boolean(rascunho?.permitirAssinaturaMaoLivre),
    arquivoNome: rascunho?.pdfAssinadoNome || '',
    arquivoHash: rascunho?.pdfAssinadoHash || '',
    criadoEm: rascunho?.criadoEm || new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  }
}

export async function publicarRegistroContrato(registro) {
  const codigo = formatarCodigo(registro?.codigo)
  if (!limparCodigo(codigo)) return { ok: false }
  const atual = await carregarRegistroContrato(codigo)
  const merged = {
    ...(atual || {}),
    ...registro,
    codigo,
    assinaturaContratado: registro.assinaturaContratado !== undefined
      ? registro.assinaturaContratado
      : (atual?.assinaturaContratado || ''),
    assinaturaDeputado: registro.assinaturaDeputado !== undefined
      ? registro.assinaturaDeputado
      : (atual?.assinaturaDeputado || ''),
    assinadoContratadoEm: registro.assinadoContratadoEm !== undefined
      ? registro.assinadoContratadoEm
      : (atual?.assinadoContratadoEm || ''),
    assinadoDeputadoEm: registro.assinadoDeputadoEm !== undefined
      ? registro.assinadoDeputadoEm
      : (atual?.assinadoDeputadoEm || ''),
    cpfHash: registro.cpfHash || atual?.cpfHash || '',
    corpo: registro.corpo || atual?.corpo || '',
    metodoAssinaturaContratado: registro.metodoAssinaturaContratado !== undefined
      ? registro.metodoAssinaturaContratado
      : (atual?.metodoAssinaturaContratado || ''),
    metodoAssinaturaDeputado: registro.metodoAssinaturaDeputado !== undefined
      ? registro.metodoAssinaturaDeputado
      : (atual?.metodoAssinaturaDeputado || ''),
    permitirAssinaturaMaoLivre: registro.permitirAssinaturaMaoLivre !== undefined
      ? Boolean(registro.permitirAssinaturaMaoLivre)
      : Boolean(atual?.permitirAssinaturaMaoLivre),
    atualizadoEm: new Date().toISOString(),
  }
  merged.status = statusAssinatura(merged)
  const key = authStorageKey(codigo)
  try { localStorage.setItem(key, JSON.stringify(merged)) } catch { /* */ }
  const ok = await postApiKey(key, merged)
  return { ok, key, codigo }
}

export async function carregarRegistroContrato(codigo) {
  const key = authStorageKey(codigo)
  let local = null
  try { local = JSON.parse(localStorage.getItem(key) || 'null') } catch { /* */ }
  try {
    const raw = limparCodigo(codigo)
    const res = await fetch(`/api.php?action=contrato_info&c=${encodeURIComponent(raw)}`)
    if (res.ok) {
      const data = await res.json()
      if (data && data.codigo && !data.error) {
        try { localStorage.setItem(key, JSON.stringify(data)) } catch { /* */ }
        return data
      }
    }
  } catch { /* */ }
  const remoto = await fetchApiKey(key)
  return remoto || local
}

export async function garantirAutenticidade(rascunho, { membro = null, config = null } = {}) {
  const next = { ...(rascunho || {}) }
  if (!limparCodigo(next.codigoAutenticidade)) {
    next.codigoAutenticidade = gerarCodigoContrato()
  } else {
    next.codigoAutenticidade = formatarCodigo(next.codigoAutenticidade)
  }
  next.hashCorpo = await hashTexto(next.corpo || '')
  if (membro?.nome) next.contratadoNome = membro.nome
  if (membro?.cpf) next.contratadoCpf = membro.cpf
  const cpfHash = await hashCpf(membro?.cpf || next.contratadoCpf || '')
  if (cpfHash) next.cpfHash = cpfHash
  const remoto = await carregarRegistroContrato(next.codigoAutenticidade)
  if (next.resetarAssinaturaContratado) {
    next.assinadoContratadoEm = ''
    next.assinaturaContratado = ''
    next.metodoAssinaturaContratado = ''
    next.assinaturaContratadoLimpaEm = new Date().toISOString()
    delete next.resetarAssinaturaContratado
  } else if (remoto?.assinadoContratadoEm && !next.assinadoContratadoEm
    && assinaturaRemotaMaisNovaQueLimpeza(remoto.assinadoContratadoEm, next.assinaturaContratadoLimpaEm)) {
    next.assinadoContratadoEm = remoto.assinadoContratadoEm
    next.assinaturaContratado = remoto.assinaturaContratado || next.assinaturaContratado
    next.metodoAssinaturaContratado = remoto.metodoAssinaturaContratado || next.metodoAssinaturaContratado
    next.assinaturaContratadoLimpaEm = ''
  }
  if (next.resetarAssinaturaDeputado) {
    next.assinadoDeputadoEm = ''
    next.assinaturaDeputado = ''
    next.metodoAssinaturaDeputado = ''
    next.assinaturaDeputadoLimpaEm = new Date().toISOString()
    delete next.resetarAssinaturaDeputado
  } else if (remoto?.assinadoDeputadoEm && !next.assinadoDeputadoEm
    && assinaturaRemotaMaisNovaQueLimpeza(remoto.assinadoDeputadoEm, next.assinaturaDeputadoLimpaEm)) {
    next.assinadoDeputadoEm = remoto.assinadoDeputadoEm
    next.assinaturaDeputado = remoto.assinaturaDeputado || next.assinaturaDeputado
    next.metodoAssinaturaDeputado = remoto.metodoAssinaturaDeputado || next.metodoAssinaturaDeputado
    next.assinaturaDeputadoLimpaEm = ''
  }
  const registro = registroPublicoDe({
    rascunho: next, membro, config, hash: next.hashCorpo, cpfHash: next.cpfHash,
  })
  const pub = await publicarRegistroContrato(registro)
  next.publicadoOk = !!pub.ok
  if (pub.ok) next.publicadoEm = new Date().toISOString()
  return next
}

function assinaturaRemotaMaisNovaQueLimpeza(remotoEm, limpaEm) {
  if (!limpaEm) return true
  if (!remotoEm) return false
  const a = new Date(remotoEm).getTime()
  const b = new Date(limpaEm).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return true
  return a > b
}

export function mesclarAssinaturaRemota(rascunho, remoto) {
  if (!remoto) return rascunho
  const next = { ...rascunho }
  let mudou = false
  if (remoto.assinadoContratadoEm && remoto.assinadoContratadoEm !== rascunho.assinadoContratadoEm
    && assinaturaRemotaMaisNovaQueLimpeza(remoto.assinadoContratadoEm, rascunho.assinaturaContratadoLimpaEm)) {
    next.assinadoContratadoEm = remoto.assinadoContratadoEm
    next.assinaturaContratado = remoto.assinaturaContratado || rascunho.assinaturaContratado || ''
    next.metodoAssinaturaContratado = remoto.metodoAssinaturaContratado || rascunho.metodoAssinaturaContratado || ''
    next.assinaturaContratadoLimpaEm = ''
    mudou = true
  }
  if (remoto.assinadoDeputadoEm && remoto.assinadoDeputadoEm !== rascunho.assinadoDeputadoEm
    && assinaturaRemotaMaisNovaQueLimpeza(remoto.assinadoDeputadoEm, rascunho.assinaturaDeputadoLimpaEm)) {
    next.assinadoDeputadoEm = remoto.assinadoDeputadoEm
    next.assinaturaDeputado = remoto.assinaturaDeputado || rascunho.assinaturaDeputado || ''
    next.metodoAssinaturaDeputado = remoto.metodoAssinaturaDeputado || rascunho.metodoAssinaturaDeputado || ''
    next.assinaturaDeputadoLimpaEm = ''
    mudou = true
  }
  return mudou ? next : rascunho
}

export function qrUrl(codigo) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=110x110&ecc=M&margin=2&data=${encodeURIComponent(urlVerificacao(codigo))}`
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function htmlCaixaAssinatura({ papel, nome, doc, lado, imagem = '' }) {
  const titulo = lado === 'direita'
    ? 'Assine somente neste quadro — CONTRATADO'
    : 'Assine somente neste quadro — CONTRATANTE'
  const img = ehAssinaturaGovbr(imagem)
    ? `<div class="selo-gov"><strong>Gov.br</strong><span>Assinado digitalmente</span></div>`
    : (imagem && String(imagem).startsWith('data:')
      ? `<img src="${esc(imagem)}" alt="Assinatura" />`
      : '')
  return `<div class="assina">
    <p class="hint">${esc(titulo)}</p>
    <div class="caixa-assina" aria-label="${esc(titulo)}">${img}</div>
    <p class="nome">${esc(nome || '')}</p>
    <p class="doc">${esc(doc || '')}</p>
    <p class="papel">${esc(papel || '')}</p>
  </div>`
}

export function htmlRodapeAutenticidade(auth) {
  if (!auth?.codigo) return ''
  const codigo = formatarCodigo(auth.codigo)
  const url = urlVerificacao(codigo)
  const hash = hashCurto(auth.hash || auth.hashCorpo || '')
  const qr = qrSvgMarkup(url, 88)
  return `<div class="autenticidade">
    ${qr}
    <div class="auth-txt">
      <p class="auth-t">Documento autenticado pela campanha</p>
      <p><strong>Código:</strong> ${esc(codigo)}</p>
      ${hash ? `<p><strong>Hash:</strong> ${esc(hash)}</p>` : ''}
      <p>Confira em ${esc(url)}</p>
      <p class="auth-n">O selo Gov.br deve ser colocado <strong>somente</strong> nos quadros de assinatura acima — nunca no meio do texto.</p>
    </div>
  </div>`
}

export const CSS_ASSINATURA_AUTH = `
  .bloco-final {
    page-break-inside: avoid;
    break-inside: avoid-page;
    break-inside: avoid;
  }
  .assinaturas {
    margin-top: 28px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 28px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .assina { text-align: center; }
  .assina .hint {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 8.5px;
    letter-spacing: .04em;
    text-transform: uppercase;
    color: #444;
    margin-bottom: 6px;
  }
  .caixa-assina {
    min-height: 112px;
    border: 1.6px dashed #333;
    background: #fafafa;
    margin: 0 auto 10px;
    width: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .caixa-assina img { max-width: 96%; max-height: 104px; object-fit: contain; }
  .selo-gov {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: #1351b4; font-family: Arial, Helvetica, sans-serif; padding: 8px;
  }
  .selo-gov strong { font-size: 16px; letter-spacing: .03em; }
  .selo-gov span { font-size: 9px; text-transform: uppercase; letter-spacing: .04em; }
  .assina .nome { font-weight: bold; font-size: 12px; margin-bottom: 4px; }
  .assina .doc { font-size: 11px; margin-bottom: 4px; }
  .assina .papel { font-size: 10px; color: #333; text-transform: uppercase; }
  .autenticidade {
    margin-top: 22px;
    padding-top: 12px;
    border-top: 1px solid #bbb;
    display: flex;
    gap: 14px;
    align-items: center;
    page-break-inside: avoid;
    break-inside: avoid;
    font-family: Arial, Helvetica, sans-serif;
  }
  .autenticidade .qr { width: 88px; height: 88px; flex-shrink: 0; display: block; }
  .auth-txt { font-size: 9.5px; line-height: 1.45; color: #222; }
  .auth-t { font-weight: 700; font-size: 10.5px; margin-bottom: 4px; text-transform: uppercase; }
  .auth-n { margin-top: 4px; color: #444; }
  @media print {
    .caixa-assina { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .autenticidade .qr { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .bloco-final, .assinaturas, .autenticidade, .fechamento { page-break-inside: avoid; break-inside: avoid-page; break-inside: avoid; }
  }
`
