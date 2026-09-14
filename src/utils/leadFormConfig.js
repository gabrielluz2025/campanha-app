/** Config padrão e helpers do formulário público de cadastro */

export const LAYOUTS = [
  { id: 'card', label: 'Cartão central', desc: 'Formulário em card branco no centro' },
  { id: 'hero', label: 'Foto no topo', desc: 'Foto grande em cima + formulário abaixo' },
  { id: 'split', label: 'Landing (foto + formulário)', desc: 'Foto preenche o painel com textos por cima + formulário' },
]

export const TIPOS_CAMPO = [
  { id: 'text', label: 'Texto' },
  { id: 'email', label: 'E-mail' },
  { id: 'tel', label: 'Telefone' },
  { id: 'cep', label: 'CEP' },
  { id: 'date', label: 'Data' },
  { id: 'textarea', label: 'Texto longo' },
  { id: 'cidade', label: 'Cidade (SC)' },
  { id: 'bairro', label: 'Bairro' },
  { id: 'select', label: 'Lista de opções' },
]

/**
 * Campos alinhados ao cadastro de membro/apoiador.
 * Já vêm no formulário — basta ligar/desligar e ordenar.
 * catalogo: true → não apaga (só oculta).
 */
export const CATALOGO_CAMPOS = [
  { id: 'nome', tipo: 'text', label: 'Nome completo', placeholder: 'Seu nome completo', obrigatorio: true, ativo: true, sistema: true, catalogo: true },
  { id: 'email', tipo: 'email', label: 'E-mail', placeholder: 'seu@email.com', obrigatorio: false, ativo: true, sistema: true, catalogo: true },
  { id: 'telefone', tipo: 'tel', label: 'Celular / WhatsApp', placeholder: '(00) 00000-0000', obrigatorio: true, ativo: true, sistema: true, catalogo: true },
  { id: 'cpf', tipo: 'text', label: 'CPF', placeholder: '000.000.000-00', obrigatorio: false, ativo: false, sistema: false, catalogo: true },
  { id: 'data_nascimento', tipo: 'date', label: 'Data de nascimento', placeholder: '00/00/0000', obrigatorio: false, ativo: false, sistema: false, catalogo: true },
  // Endereço: cidade+bairro são a base territorial; CEP é atalho; rua/nº completam o endereço
  { id: 'cidade', tipo: 'cidade', label: 'Cidade', placeholder: 'Digite para buscar a cidade', obrigatorio: true, ativo: true, sistema: true, catalogo: true },
  { id: 'bairro', tipo: 'bairro', label: 'Bairro', placeholder: 'Buscar ou digitar bairro novo', obrigatorio: true, ativo: true, sistema: true, catalogo: true },
  { id: 'cep', tipo: 'cep', label: 'CEP', placeholder: '00000-000', obrigatorio: false, ativo: true, sistema: false, catalogo: true },
  { id: 'logradouro', tipo: 'text', label: 'Rua / Logradouro', placeholder: 'Rua, avenida…', obrigatorio: true, ativo: true, sistema: false, catalogo: true },
  { id: 'numero', tipo: 'text', label: 'Número', placeholder: 'Nº', obrigatorio: true, ativo: true, sistema: false, catalogo: true },
  { id: 'complemento', tipo: 'text', label: 'Apto / Complemento', placeholder: 'Apto, bloco…', obrigatorio: false, ativo: true, sistema: false, catalogo: true },
  { id: 'profissao', tipo: 'text', label: 'Profissão', placeholder: 'Sua profissão', obrigatorio: false, ativo: false, sistema: true, catalogo: true },
]

/** Ordem e regras fixas do bloco de endereço no formulário público. */
export const ENDERECO_REGRAS = {
  cidade: { ativo: true, obrigatorio: true },
  bairro: { ativo: true, obrigatorio: true },
  cep: { ativo: true, obrigatorio: false, label: 'CEP' },
  logradouro: { ativo: true, obrigatorio: true },
  numero: { ativo: true, obrigatorio: true },
  complemento: { ativo: true, obrigatorio: false },
}

const ORDEM_ENDERECO = ['cidade', 'bairro', 'cep', 'logradouro', 'numero', 'complemento']

const CATALOGO_IDS = new Set(CATALOGO_CAMPOS.map(c => c.id))

const LABEL_ALIASES = {
  nome: [/^nome/i],
  email: [/^e-?mail/i],
  telefone: [/whatsapp|celular|telefone|fone/i],
  cpf: [/^cpf$/i],
  data_nascimento: [/nasciment|data de nasc/i],
  cep: [/^cep\b/i],
  cidade: [/^cidade/i],
  bairro: [/^bairro/i],
  logradouro: [/logradouro|^rua\b|endere[cç]o/i],
  numero: [/^n[uú]mero|^n[º°.]?\s*$/i],
  complemento: [/complemento|apto|apartamento/i],
  profissao: [/profiss/i],
}

export function defaultLeadFormConfig() {
  return {
    layout: 'card',
    slogan: 'Juntos por um Brasil mais forte e por você!',
    titulo: 'Cadastre-se e faça parte do nosso time!',
    subtitulo: 'Entre para a comunidade oficial e receba notícias, novidades e convites em primeira mão.',
    valores: 'FÉ · FAMÍLIA · LIBERDADE · TRABALHO',
    cta: 'Quero participar!',
    cargo: 'Deputado Federal',
    nomeCandidato: '',
    partido: '',
    posterPilares: 'Trabalho por quem mais precisa\nCompromisso com o desenvolvimento\nFé, família e liberdade',
    posterRodape: 'Juntos por um Brasil melhor',
    redesHandle: '',
    redesSociais: [],
    corPrimaria: '#0b1f4d',
    corAcento: '#15803d',
    corDestaque: '#facc15',
    corTexto: '#ffffff',
    corSloganDestaque: '#4ade80',
    foto: '',
    logo: '',
    fotoX: 50,
    fotoY: 50,
    logoX: 50,
    logoY: 50,
    fotoZoom: 100,
    logoZoom: 100,
    fotoMeta: null,
    logoMeta: null,
    mostrarLgpd: true,
    textoLgpd: 'Declaro que li e aceito a Política de Privacidade e autorizo o tratamento dos meus dados pessoais conforme a LGPD.',
    campos: CATALOGO_CAMPOS.map(c => ({ ...c })),
    interesses: [
      { id: 'comunidade_whatsapp', label: 'Quero entrar no canal oficial do WhatsApp', ativo: true, padrao: true },
      { id: 'noticias', label: 'Quero receber notícias e ações do mandato', ativo: true, padrao: true },
      { id: 'voluntario', label: 'Quero participar como voluntário', ativo: true, padrao: false },
      { id: 'eventos', label: 'Quero receber convites para eventos', ativo: true, padrao: false },
    ],
    secaoInteressesTitulo: 'Tenho interesse em:',
    /** Link do Canal do WhatsApp (https://whatsapp.com/channel/...) */
    whatsappCanalUrl: '',
    whatsappCanalTitulo: 'Canal oficial no WhatsApp',
  }
}

export function normalizeLeadFormConfig(raw) {
  const base = defaultLeadFormConfig()
  if (!raw || typeof raw !== 'object') return base

  const camposIn = Array.isArray(raw.campos) ? raw.campos : base.campos
  const camposMapped = camposIn
    .filter(c => c && c.id)
    .map(c => {
      const catalogHit = CATALOGO_CAMPOS.find(cat => cat.id === c.id)
        || CATALOGO_CAMPOS.find(cat => (LABEL_ALIASES[cat.id] || []).some(re => re.test(String(c.label || ''))))
      const id = catalogHit ? catalogHit.id : String(c.id).slice(0, 64)
      const isCatalog = CATALOGO_IDS.has(id)
      const baseCat = catalogHit || null
      return {
        id,
        tipo: TIPOS_CAMPO.some(t => t.id === c.tipo)
          ? c.tipo
          : (baseCat?.tipo || 'text'),
        label: String(c.label || baseCat?.label || 'Campo').slice(0, 80),
        placeholder: String(c.placeholder ?? baseCat?.placeholder ?? '').slice(0, 120),
        obrigatorio: c.obrigatorio != null ? !!c.obrigatorio : !!baseCat?.obrigatorio,
        ativo: c.ativo !== false,
        sistema: isCatalog ? !!baseCat?.sistema : !!c.sistema,
        catalogo: isCatalog || !!c.catalogo,
        opcoes: Array.isArray(c.opcoes)
          ? c.opcoes.map(o => String(o).slice(0, 80)).filter(Boolean).slice(0, 30)
          : [],
      }
    })

  // Dedupa por id (preferindo o primeiro / ativo)
  const seen = new Set()
  const campos = []
  for (const c of camposMapped) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    campos.push(c)
  }

  // Garante catálogo completo (campos do membro) — faltantes entram ocultos
  for (const cat of CATALOGO_CAMPOS) {
    if (seen.has(cat.id)) {
      const cur = campos.find(c => c.id === cat.id)
      if (cur) {
        cur.catalogo = true
        cur.sistema = !!cat.sistema
        if (cat.id === 'nome' || cat.id === 'telefone') {
          cur.ativo = true
          cur.obrigatorio = true
        }
        if (cat.id === 'telefone') cur.tipo = 'tel'
        if (cat.id === 'cep') cur.tipo = 'cep'
        if (cat.id === 'cidade') cur.tipo = 'cidade'
        if (cat.id === 'bairro') cur.tipo = 'bairro'
        if (ENDERECO_REGRAS[cat.id]) {
          const r = ENDERECO_REGRAS[cat.id]
          cur.ativo = true
          cur.obrigatorio = !!r.obrigatorio
          if (r.label) cur.label = r.label
          // remove "(opcional)" antigo de labels salvos
          cur.label = String(cur.label || cat.label).replace(/\s*\(opcional\)\s*$/i, '').trim() || cat.label
        }
        if (cat.id === 'data_nascimento') {
          cur.tipo = 'date'
          if (!cur.placeholder || /dd\/mm/i.test(cur.placeholder)) cur.placeholder = '00/00/0000'
        }
      }
      continue
    }
    campos.push({ ...cat, ativo: false })
    seen.add(cat.id)
  }

  // Nome + telefone sempre presentes e ativos
  const hasNome = campos.some(c => c.id === 'nome')
  const hasTel = campos.some(c => c.id === 'telefone')
  if (!hasNome) campos.unshift({ ...CATALOGO_CAMPOS.find(c => c.id === 'nome') })
  if (!hasTel) {
    const afterNome = campos.findIndex(c => c.id === 'nome')
    campos.splice(afterNome + 1, 0, { ...CATALOGO_CAMPOS.find(c => c.id === 'telefone') })
  }

  // Bloco endereço na ordem: cidade → bairro → CEP → rua → nº → apto
  const enderecoSet = new Set(ORDEM_ENDERECO)
  const semEndereco = campos.filter(c => !enderecoSet.has(c.id))
  const blocoEndereco = ORDEM_ENDERECO
    .map(id => campos.find(c => c.id === id))
    .filter(Boolean)
  // Insere o bloco após telefone (ou data_nascimento/cpf se ativos logo após)
  const idxTel = semEndereco.findIndex(c => c.id === 'telefone')
  let insertAt = idxTel >= 0 ? idxTel + 1 : 2
  while (
    insertAt < semEndereco.length
    && ['cpf', 'data_nascimento', 'email'].includes(semEndereco[insertAt]?.id)
  ) {
    insertAt += 1
  }
  const camposOrdenados = [
    ...semEndereco.slice(0, insertAt),
    ...blocoEndereco,
    ...semEndereco.slice(insertAt),
  ]

  const interesses = (Array.isArray(raw.interesses) ? raw.interesses : base.interesses)
    .filter(i => i && (i.id || i.label))
    .map(i => ({
      id: String(i.id || uidLocal()).slice(0, 64),
      label: String(i.label || '').slice(0, 160),
      ativo: i.ativo !== false,
      padrao: !!i.padrao,
    }))

  const layout = LAYOUTS.some(l => l.id === raw.layout) ? raw.layout : 'card'

  return {
    ...base,
    ...raw,
    layout,
    slogan: String(raw.slogan ?? base.slogan).slice(0, 160),
    titulo: String(raw.titulo ?? base.titulo).slice(0, 160),
    subtitulo: String(raw.subtitulo ?? base.subtitulo).slice(0, 400),
    valores: String(raw.valores ?? base.valores).slice(0, 120),
    cta: String(raw.cta ?? base.cta).slice(0, 60),
    cargo: String(raw.cargo ?? base.cargo).slice(0, 80),
    nomeCandidato: String(raw.nomeCandidato ?? base.nomeCandidato).slice(0, 80),
    partido: String(raw.partido ?? base.partido).slice(0, 20),
    posterPilares: String(raw.posterPilares ?? base.posterPilares).slice(0, 400),
    posterRodape: String(raw.posterRodape ?? base.posterRodape).slice(0, 120),
    redesHandle: String(raw.redesHandle ?? base.redesHandle).slice(0, 80),
    redesSociais: normalizeRedesSociais(raw),
    corPrimaria: sanitizeColor(raw.corPrimaria, base.corPrimaria),
    corAcento: sanitizeColor(raw.corAcento, base.corAcento),
    corDestaque: sanitizeColor(raw.corDestaque, base.corDestaque),
    corTexto: sanitizeColor(raw.corTexto, base.corTexto),
    corSloganDestaque: sanitizeColor(raw.corSloganDestaque, base.corSloganDestaque),
    foto: typeof raw.foto === 'string' ? raw.foto.slice(0, 900000) : '',
    logo: typeof raw.logo === 'string' ? raw.logo.slice(0, 400000) : '',
    fotoX: clampPct(raw.fotoX, 50),
    fotoY: clampPct(raw.fotoY, 50),
    logoX: clampPct(raw.logoX, 50),
    logoY: clampPct(raw.logoY, 50),
    fotoZoom: clampZoom(raw.fotoZoom, 100),
    logoZoom: clampZoom(raw.logoZoom, 100),
    fotoMeta: normalizeMeta(raw.fotoMeta),
    logoMeta: normalizeMeta(raw.logoMeta),
    mostrarLgpd: raw.mostrarLgpd !== false,
    textoLgpd: String(raw.textoLgpd ?? base.textoLgpd).slice(0, 500),
    secaoInteressesTitulo: String(raw.secaoInteressesTitulo ?? base.secaoInteressesTitulo).slice(0, 80),
    whatsappCanalUrl: normalizeWhatsappCanalUrl(raw.whatsappCanalUrl ?? base.whatsappCanalUrl),
    whatsappCanalTitulo: String(raw.whatsappCanalTitulo ?? base.whatsappCanalTitulo).slice(0, 80),
    campos: camposOrdenados,
    interesses,
  }
}

/** Aceita URL de Canal WhatsApp ou ID; devolve URL limpa ou ''. */
export function normalizeWhatsappCanalUrl(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  // já é URL completa
  const m = s.match(/whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/i)
  if (m) return `https://www.whatsapp.com/channel/${m[1]}`
  // só o ID do canal
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return `https://www.whatsapp.com/channel/${s}`
  // outras URLs (convite legado) — mantém se http(s)
  if (/^https?:\/\//i.test(s)) return s.slice(0, 300)
  return ''
}

/** Interesse padrão que pede o canal. */
export function interesseQuerCanal(interessesSel = [], interessesCfg = []) {
  const ids = new Set((interessesSel || []).map(String))
  if (ids.has('comunidade_whatsapp') || ids.has('canal_whatsapp')) return true
  // fallback: label contendo "canal" + whatsapp
  for (const it of interessesCfg || []) {
    if (!ids.has(String(it.id))) continue
    const lab = String(it.label || '').toLowerCase()
    if (lab.includes('canal') && lab.includes('whatsapp')) return true
  }
  return false
}

function sanitizeColor(v, fallback) {
  const s = String(v || '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s
  return fallback
}

/** Tipos de rede disponíveis no editor */
export const TIPOS_REDE = [
  { id: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/seu.perfil ou @seu.perfil' },
  { id: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/sua.pagina' },
  { id: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@seu.canal' },
  { id: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@seu.perfil' },
  { id: 'twitter', label: 'X / Twitter', placeholder: 'https://x.com/seu.perfil' },
  { id: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/seu.perfil' },
  { id: 'telegram', label: 'Telegram', placeholder: 'https://t.me/seu.canal' },
  { id: 'threads', label: 'Threads', placeholder: 'https://threads.net/@seu.perfil' },
  { id: 'kwai', label: 'Kwai', placeholder: 'https://kwai.com/@seu.perfil' },
  { id: 'site', label: 'Site / outro', placeholder: 'https://seusite.com.br' },
]

export function newRedeSocial(tipo = 'instagram') {
  const t = TIPOS_REDE.some(x => x.id === tipo) ? tipo : 'site'
  return {
    id: 'rede_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    tipo: t,
    url: '',
  }
}

function normalizeRedesSociais(raw) {
  const fromList = Array.isArray(raw?.redesSociais)
    ? raw.redesSociais
      .filter(r => r && (r.url || r.tipo))
      .map(r => ({
        id: String(r.id || uidLocal()).slice(0, 64),
        tipo: TIPOS_REDE.some(t => t.id === r.tipo) ? r.tipo : 'site',
        url: sanitizeUrl(r.url),
      }))
      .filter(r => r.url)
      .slice(0, 12)
    : []

  if (fromList.length > 0) return fromList

  // Migra campos antigos (Instagram / Facebook / YouTube fixos)
  const legacy = []
  if (raw?.linkInstagram) legacy.push({ id: 'legacy_ig', tipo: 'instagram', url: sanitizeUrl(raw.linkInstagram) })
  if (raw?.linkFacebook) legacy.push({ id: 'legacy_fb', tipo: 'facebook', url: sanitizeUrl(raw.linkFacebook) })
  if (raw?.linkYoutube) legacy.push({ id: 'legacy_yt', tipo: 'youtube', url: sanitizeUrl(raw.linkYoutube) })
  return legacy.filter(r => r.url).slice(0, 12)
}

/** Aceita URL completa ou @usuario / usuario — normaliza para https */
export function sanitizeUrl(v) {
  const s = String(v || '').trim().slice(0, 300)
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  if (s.startsWith('www.')) return `https://${s}`
  return s
}

/** Monta URL clicável a partir do valor digitado (perfil ou link) */
export function socialHref(platform, raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  if (/^https?:\/\//i.test(s)) return s
  if (s.startsWith('www.')) return `https://${s}`
  const handle = s.replace(/^@/, '').replace(/^\//, '').trim()
  if (!handle) return null

  const alreadyHasDomain = /[./]/.test(handle) && /\.(com|net|br|me|org)/i.test(handle)
  if (alreadyHasDomain) return handle.startsWith('http') ? handle : `https://${handle}`

  const map = {
    instagram: `https://instagram.com/${handle}`,
    facebook: `https://facebook.com/${handle}`,
    youtube: `https://youtube.com/@${handle}`,
    tiktok: `https://tiktok.com/@${handle}`,
    twitter: `https://x.com/${handle}`,
    linkedin: `https://linkedin.com/in/${handle}`,
    telegram: `https://t.me/${handle}`,
    threads: `https://threads.net/@${handle}`,
    kwai: `https://www.kwai.com/@${handle}`,
    site: handle.includes('.') ? `https://${handle}` : null,
  }
  return map[platform] || (handle.includes('.') ? `https://${handle}` : null)
}

/** Lista pronta para o rodapé: só itens com link válido */
export function resolveRedesSociais(cfg) {
  const list = Array.isArray(cfg?.redesSociais) ? cfg.redesSociais : []
  return list
    .map(r => {
      const tipo = TIPOS_REDE.find(t => t.id === r.tipo) || TIPOS_REDE.find(t => t.id === 'site')
      const href = socialHref(r.tipo || 'site', r.url)
      if (!href) return null
      return { id: r.id, tipo: r.tipo || 'site', href, label: tipo?.label || 'Rede' }
    })
    .filter(Boolean)
}

function clampPct(v, fallback = 50) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, Math.round(n)))
}

function clampZoom(v, fallback = 100) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(70, Math.min(250, Math.round(n)))
}

function normalizeMeta(m) {
  if (!m || typeof m !== 'object') return null
  const width = Number(m.width) || 0
  const height = Number(m.height) || 0
  const bytes = Number(m.bytes) || 0
  if (!width && !height && !bytes) return null
  return { width, height, bytes, name: String(m.name || '').slice(0, 120) }
}

function uidLocal() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function newCustomField() {
  return {
    id: 'custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    tipo: 'text',
    label: 'Novo campo',
    placeholder: '',
    obrigatorio: false,
    ativo: true,
    sistema: false,
    catalogo: false,
    opcoes: [],
  }
}

export function newInteresse() {
  return {
    id: 'int_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    label: 'Novo interesse',
    ativo: true,
    padrao: false,
  }
}

function estimateDataUrlBytes(dataUrl) {
  const i = String(dataUrl || '').indexOf(',')
  if (i < 0) return 0
  return Math.round((dataUrl.length - i - 1) * 0.75)
}

/** Reduz imagem para caber no JSON do formulário.
 *  keepAlpha: true → mantém PNG transparente (foto sem fundo).
 *  forceJpeg: true → sempre JPEG (ideal para avatares).
 *  Resolve { dataUrl, width, height, bytes, name }
 */
export function compressImageFile(file, {
  maxW = 1200,
  maxH = 1200,
  quality = 0.72,
  maxBytes = 450000,
  keepAlpha = false,
  forceJpeg = false,
  jpegFill = '#ffffff',
} = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) {
      reject(new Error('Selecione uma imagem.'))
      return
    }
    const preferPng = !forceJpeg
      && (keepAlpha || file.type === 'image/png' || /\.png$/i.test(file.name || ''))
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Falha ao ler a imagem.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Imagem inválida.'))
      img.onload = () => {
        let w = img.width
        let h = img.height
        const scale = Math.min(1, maxW / w, maxH / h)
        w = Math.max(1, Math.round(w * scale))
        h = Math.max(1, Math.round(h * scale))

        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        function draw(wd, hd, { png = false } = {}) {
          canvas.width = wd
          canvas.height = hd
          if (png) ctx.clearRect(0, 0, wd, hd)
          else {
            ctx.fillStyle = jpegFill
            ctx.fillRect(0, 0, wd, hd)
          }
          ctx.drawImage(img, 0, 0, wd, hd)
        }

        function encodeJpeg(wd, hd) {
          draw(wd, hd, { png: false })
          let q = quality
          let data = canvas.toDataURL('image/jpeg', q)
          while (estimateDataUrlBytes(data) > maxBytes && q > 0.32) {
            q -= 0.07
            data = canvas.toDataURL('image/jpeg', q)
          }
          return { data, bytes: estimateDataUrlBytes(data), w: wd, h: hd }
        }

        if (preferPng) {
          draw(w, h, { png: true })
          let data = canvas.toDataURL('image/png')
          let bytes = estimateDataUrlBytes(data)
          for (let i = 0; i < 6 && bytes > maxBytes && (w > 180 || h > 180); i++) {
            const ratio = Math.sqrt(maxBytes / bytes) * 0.9
            w = Math.max(180, Math.round(w * ratio))
            h = Math.max(180, Math.round(h * ratio))
            draw(w, h, { png: true })
            data = canvas.toDataURL('image/png')
            bytes = estimateDataUrlBytes(data)
          }
          if (bytes <= maxBytes * 1.12) {
            resolve({
              dataUrl: data,
              width: w,
              height: h,
              bytes,
              name: String(file.name || 'imagem').slice(0, 120),
            })
            return
          }
        }

        let curW = w
        let curH = h
        let best = encodeJpeg(curW, curH)
        for (let i = 0; i < 5 && best.bytes > maxBytes && curW > 160; i++) {
          const ratio = Math.sqrt(maxBytes / best.bytes) * 0.88
          curW = Math.max(160, Math.round(curW * ratio))
          curH = Math.max(160, Math.round(curH * ratio))
          best = encodeJpeg(curW, curH)
        }

        if (best.bytes > maxBytes * 1.25) {
          reject(new Error('Imagem muito grande. Tente outra foto ou um recorte menor.'))
          return
        }

        resolve({
          dataUrl: best.data,
          width: best.w,
          height: best.h,
          bytes: best.bytes,
          name: String(file.name || 'imagem').slice(0, 120),
        })
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

export function formatBytes(n) {
  const b = Number(n) || 0
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}

/** Sugestão de tamanho conforme layout / uso */
export function fotoHint(layout, kind = 'foto') {
  if (kind === 'logo') return 'Sugestão: 400×400 px (quadrada)'
  if (layout === 'hero') return 'Sugestão: 1200×600 px (paisagem)'
  if (layout === 'split') return 'JPG/PNG · preenche o painel · sugestão 900×1200 px'
  return 'Sugestão: 1200×800 px'
}
