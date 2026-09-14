/**
 * Valida e corrige endereços de igrejas via CEP (ViaCEP / BrasilAPI / Nominatim).
 * Uso: node scripts/validar-enderecos-igrejas.cjs [--apply-base] [--limit N]
 */
const fs = require('fs')
const path = require('path')

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function formatarCep(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

function extrairCepDoTexto(s) {
  const m = String(s || '').match(/\b(\d{5})-?(\d{3})\b/)
  return m ? `${m[1]}${m[2]}` : ''
}

function parseEnderecoIgreja(raw = '') {
  let s = String(raw || '').trim().replace(/,\s*$/, '')
  if (!s) return null
  const cep = extrairCepDoTexto(s)
  if (cep) s = s.replace(/\b\d{5}-?\d{3}\b/, '').replace(/CEP\s*/i, '').trim()
  let uf = 'SC'
  let cidade = 'Blumenau'
  let bairro = ''
  let logradouro = s
  let numero = ''
  const ufMatch = s.match(/,\s*([A-Za-zÀ-ú\s.]+)\s*-\s*(SC|PR|RS|SP|RJ|MG|ES|BA|CE|PE|GO|DF|MT|MS|PA|AM|RO|AC|AP|RR|TO|MA|PI|RN|PB|SE|AL)\s*$/i)
  if (ufMatch) {
    cidade = ufMatch[1].trim()
    uf = ufMatch[2].toUpperCase()
    s = s.slice(0, ufMatch.index).trim()
  }
  const commaBairro = s.match(/^(.+),\s*([^,]+)$/)
  if (commaBairro && !commaBairro[2].match(/\d{5}-?\d{3}/)) {
    logradouro = commaBairro[1].trim()
    bairro = commaBairro[2].trim()
  } else {
    const dashParts = s.split(/\s*-\s*/)
    if (dashParts.length >= 2) {
      bairro = dashParts.pop().trim()
      logradouro = dashParts.join(' - ').trim()
    } else {
      logradouro = s
    }
  }
  const sn = /\b(S\/N|S\.?\s*N\.?|SN)\b/i
  const numMatch = logradouro.match(/,\s*(\d+[A-Za-z]?)\s*$/) || logradouro.match(/\s+(\d+[A-Za-z]?)\s*$/)
  if (numMatch) {
    numero = numMatch[1]
    logradouro = logradouro.slice(0, numMatch.index).replace(/,\s*$/, '').trim()
  } else if (sn.test(logradouro)) {
    numero = 'S/N'
    logradouro = logradouro.replace(sn, '').replace(/,\s*$/, '').trim()
  } else {
    const inlineNum = logradouro.match(/^(.+?)\s+(\d+[A-Za-z]?)\s*$/)
    if (inlineNum && !/^\d/.test(inlineNum[1])) {
      logradouro = inlineNum[1].trim()
      numero = inlineNum[2]
    }
  }
  logradouro = logradouro
    .replace(/^R\.\s*/i, 'Rua ')
    .replace(/^AV\.\s*/i, 'Avenida ')
    .replace(/^DR\.\s*/i, 'Dr. ')
    .replace(/^PROF\.\s*/i, 'Prof. ')
    .trim()
  return { cep, logradouro, numero, bairro, cidade, uf, enderecoOriginal: raw }
}

function montarEndereco(campos) {
  const log = String(campos.logradouro || '').trim()
  const num = String(campos.numero || '').trim()
  const bairro = String(campos.bairro || '').trim()
  const cidade = String(campos.cidade || '').trim()
  const uf = String(campos.uf || 'SC').trim()
  const cepFmt = formatarCep(campos.cep || '')
  const partes = []
  if (log) partes.push(num ? `${log}, ${num}` : log)
  const loc = [bairro, cidade && uf ? `${cidade} - ${uf}` : cidade].filter(Boolean).join(', ')
  if (loc) partes.push(loc)
  if (cepFmt.length === 9) partes.push(`CEP ${cepFmt}`)
  return partes.join(', ')
}

function normTxt(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

const CORRECOES_LOGRADOURO = [
  [/\brudiger\b/gi, 'Ruediger'],
  [/\bherman kr?atz\b/gi, 'Hermann Kratz'],
  [/\bherman\b(?!\s*kratz)/gi, 'Hermann'],
  [/\bzimer?mann\b/gi, 'Zimmermann'],
  [/\bzimermann\b/gi, 'Zimmermann'],
  [/\bsasche\b/gi, 'Sachse'],
  [/\bjesen\b/gi, 'Jensen'],
  [/\bvaldiehk\b/gi, 'Valdiek'],
  [/\b02 de setembro\b/gi, 'Dois de Setembro'],
  [/\bsete de setembro\b/gi, 'Sete de Setembro'],
  [/\bs[aã]o paulo\b/gi, 'São Paulo'],
  [/\bmarcone\b/gi, 'Marconi'],
  [/\blurders\b/gi, 'Lueders'],
  [/\blions club\b/gi, 'Lions Clube'],
  [/\bpref\.\s*/gi, 'Prefeito '],
  [/\bschraiber\b/gi, 'Schreiber'],
  [/\blidia correa tobias\b/gi, 'Lídia Corrêa Tobias'],
  [/\bperola do vale\b/gi, 'Pérola do Vale'],
]

function limparLogradouroBusca(log) {
  let s = String(log || '').trim()
  s = s.replace(/^(rua|av\.?|avenida|travessa|alameda|rodovia|estrada)\.?\s+/i, '')
  s = s.replace(/\s*\([^)]*\)/g, ' ').replace(/\s*ao lado[^,]*/gi, ' ')
  s = s.replace(/\s*esquina[^,]*/gi, ' ').replace(/\s*lote[^,]*/gi, ' ')
  s = s.replace(/\s*sala\s*\d+/gi, ' ').replace(/\s+/g, ' ').trim()
  for (const [re, rep] of CORRECOES_LOGRADOURO) s = s.replace(re, rep)
  return s
}

function prepararEnderecoParaBusca(parsed) {
  let log = String(parsed.logradouro || '').trim()
  if (log && !/^(rua|av\.?|avenida|travessa|alameda|rodovia|estrada)\b/i.test(log)) {
    log = `Rua ${log}`
  }
  for (const [re, rep] of CORRECOES_LOGRADOURO) log = log.replace(re, rep)
  return { ...parsed, logradouro: log.replace(/\s+/g, ' ').trim() }
}

function escolherCepDaLista(lista, numero) {
  if (!Array.isArray(lista) || !lista.length) return null
  const num = parseInt(String(numero || '').replace(/\D/g, ''), 10)
  if (Number.isFinite(num)) {
    const par = num % 2 === 0
    const lado = lista.find(r => {
      const c = String(r.complemento || '').toLowerCase()
      if (par && c.includes('par')) return true
      if (!par && (c.includes('ímpar') || c.includes('impar'))) return true
      return false
    })
    if (lado) return lado
  }
  return lista[0]
}

async function buscarCepPorLogradouro(parsed) {
  const uf = String(parsed.uf || 'SC').trim()
  const cidade = String(parsed.cidade || 'Blumenau').trim()
  const logBusca = limparLogradouroBusca(parsed.logradouro)
  if (!logBusca || logBusca.length < 3) return null
  const url = `https://viacep.com.br/ws/${encodeURIComponent(uf)}/${encodeURIComponent(cidade)}/${encodeURIComponent(logBusca)}/json/`
  try {
    const raw = await fetchJson(url)
    if (!Array.isArray(raw) || !raw.length || raw[0]?.erro) return null
    const pick = escolherCepDaLista(raw, parsed.numero)
    if (!pick?.cep) return null
    const digits = String(pick.cep).replace(/\D/g, '').slice(0, 8)
    return {
      cep: digits,
      logradouro: String(pick.logradouro || parsed.logradouro).trim(),
      bairro: String(pick.bairro || parsed.bairro || '').trim(),
      localidade: String(pick.localidade || cidade).trim(),
      uf: String(pick.uf || uf).trim().toUpperCase().slice(0, 2),
    }
  } catch { return null }
}

async function reverseGeocodeNominatim(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`
  const j = await fetchJson(url)
  if (!j?.address) return null
  const addr = j.address
  const cep = String(addr.postcode || '').replace(/\D/g, '').slice(0, 8)
  return {
    lat: Number(lat),
    lng: Number(lng),
    cep,
    logradouro: addr.road || addr.street || '',
    bairro: addr.suburb || addr.neighbourhood || addr.quarter || '',
    localidade: addr.city || addr.town || addr.municipality || addr.village || '',
    uf: (addr['ISO3166-2-lvl4'] || addr.state || '').replace(/^BR-/, '').slice(0, 2),
    display: j.display_name,
  }
}

function ruasCompat(a, b) {
  const na = normTxt(a)
  const nb = normTxt(b)
  if (!na || !nb) return true
  if (na === nb || na.includes(nb) || nb.includes(na)) return true
  const wa = na.split(' ').filter(w => w.length > 2)
  const wb = nb.split(' ').filter(w => w.length > 2)
  return wa.filter(w => wb.includes(w)).length >= Math.min(2, Math.min(wa.length, wb.length))
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'campanha-validar-cep/1.0 (campanha.space)' },
  })
  if (!res.ok) return null
  return res.json()
}

async function buscarCep(digits) {
  const urls = [
    `https://viacep.com.br/ws/${digits}/json/`,
    `https://brasilapi.com.br/api/cep/v2/${digits}`,
    `https://opencep.com/v1/${digits}`,
  ]
  for (const url of urls) {
    try {
      const raw = await fetchJson(url)
      if (!raw || raw.erro || raw.error) continue
      return {
        cep: digits,
        logradouro: String(raw.logradouro || raw.street || '').trim(),
        bairro: String(raw.bairro || raw.neighborhood || '').trim(),
        localidade: String(raw.localidade || raw.city || '').trim(),
        uf: String(raw.uf || raw.state || '').trim().toUpperCase().slice(0, 2),
      }
    } catch { /* ignore */ }
  }
  return null
}

async function geocodeNominatim(q) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&countrycodes=br&limit=1`
  const j = await fetchJson(url)
  if (!j?.[0]) return null
  const addr = j[0].address || {}
  const cep = String(addr.postcode || '').replace(/\D/g, '').slice(0, 8)
  return {
    lat: Number(j[0].lat),
    lng: Number(j[0].lon),
    cep,
    logradouro: addr.road || addr.street || '',
    bairro: addr.suburb || addr.neighbourhood || addr.quarter || '',
    localidade: addr.city || addr.town || addr.municipality || addr.village || '',
    uf: (addr['ISO3166-2-lvl4'] || addr.state || '').replace(/^BR-/, '').slice(0, 2),
    display: j[0].display_name,
  }
}

function parseIgrejasArray(text, marker) {
  const start = text.indexOf(marker)
  if (start < 0) return []
  const slice = text.slice(start)
  const end = slice.indexOf('\n]')
  const block = end > 0 ? slice.slice(0, end + 2) : slice
  const out = []
  const re = /\{\s*id:(\d+),[\s\S]*?lat:([-\d.]+),[\s\S]*?lng:([-\d.]+),[\s\S]*?nome:'((?:\\'|[^'])*)'[\s\S]*?endereco:'((?:\\'|[^'])*)'/g
  let m
  while ((m = re.exec(block))) {
    out.push({
      id: Number(m[1]),
      lat: Number(m[2]),
      lng: Number(m[3]),
      nome: m[4].replace(/\\'/g, "'"),
      endereco: m[5].replace(/\\'/g, "'"),
    })
  }
  return out
}

async function validarIgreja(ig, relatorioAvisos) {
  const parsedRaw = parseEnderecoIgreja(ig.endereco)
  if (!parsedRaw) return { id: ig.id, nome: ig.nome, ok: false, motivo: 'sem endereço' }
  const parsed = prepararEnderecoParaBusca(parsedRaw)

  let cep = parsed.cep
  let geo = null
  let cepData = null

  if (cep) {
    cepData = await buscarCep(cep)
    await sleep(200)
  }

  if (cepData && parsed.cep && cepData.logradouro) {
    const corrigido = {
      cep: cepData.cep,
      logradouro: cepData.logradouro || parsed.logradouro,
      numero: parsed.numero || '',
      bairro: parsed.bairro || cepData.bairro || '',
      cidade: cepData.localidade || parsed.cidade,
      uf: cepData.uf || parsed.uf,
      lat: Number.isFinite(ig.lat) ? ig.lat : geo?.lat,
      lng: Number.isFinite(ig.lng) ? ig.lng : geo?.lng,
    }
    corrigido.endereco = montarEndereco(corrigido)
    const mudou = normTxt(corrigido.endereco) !== normTxt(ig.endereco)
    return {
      id: ig.id,
      nome: ig.nome,
      ok: true,
      mudou,
      enderecoOriginal: ig.endereco,
      ...corrigido,
    }
  }

  if (!cepData && parsed.logradouro) {
    cepData = await buscarCepPorLogradouro(parsed)
    await sleep(400)
    if (cepData?.cep) cep = cepData.cep
  }

  if (!cep) {
    const q = [
      parsed.logradouro,
      parsed.numero && parsed.numero !== 'S/N' ? parsed.numero : '',
      parsed.bairro,
      parsed.cidade,
      parsed.uf,
      'Brasil',
    ].filter(Boolean).join(', ')
    geo = await geocodeNominatim(q)
    await sleep(1100)
    if (geo?.cep) cep = geo.cep
    if (!cep && geo?.lat && geo?.lng) {
      const rev = await reverseGeocodeNominatim(geo.lat, geo.lng)
      await sleep(1100)
      if (rev?.cep) {
        cep = rev.cep
        geo = { ...geo, ...rev }
      }
    }
  }

  if (!cep && parsed.logradouro) {
    geo = geo || await geocodeNominatim(`${parsed.logradouro}, ${parsed.cidade}, ${parsed.uf}, Brasil`)
    await sleep(1100)
    cep = geo?.cep || ''
    if (!cep && geo?.lat && geo?.lng) {
      const rev = await reverseGeocodeNominatim(geo.lat, geo.lng)
      await sleep(1100)
      if (rev?.cep) {
        cep = rev.cep
        geo = { ...geo, ...rev }
      }
    }
  }

  if (!cep && Number.isFinite(ig.lat) && Number.isFinite(ig.lng)) {
    const rev = await reverseGeocodeNominatim(ig.lat, ig.lng)
    await sleep(1100)
    if (rev?.cep) {
      cep = rev.cep
      geo = { lat: ig.lat, lng: ig.lng, ...rev }
    }
  }

  if (!cep) {
    return {
      id: ig.id,
      nome: ig.nome,
      ok: false,
      motivo: 'CEP não encontrado',
      enderecoOriginal: ig.endereco,
    }
  }

  if (!cepData) {
    cepData = await buscarCep(cep)
    await sleep(350)
  }

  if (!cepData) {
    cepData = await buscarCepPorLogradouro(parsed)
    await sleep(400)
  }

  if (!cepData) {
    return { id: ig.id, nome: ig.nome, ok: false, motivo: 'CEP inválido', cep, enderecoOriginal: ig.endereco }
  }

  if (String(cepData.cep).replace(/\D/g, '') !== String(cep).replace(/\D/g, '')) {
    cep = cepData.cep
  }

  if (parsed.logradouro && cepData.logradouro && !ruasCompat(parsed.logradouro, cepData.logradouro)) {
    relatorioAvisos.push({
      id: ig.id,
      nome: ig.nome,
      aviso: 'logradouro ajustado pelo CEP',
      ruaCadastro: parsed.logradouro,
      ruaCep: cepData.logradouro,
    })
  }

  const corrigido = {
    cep: cepData.cep,
    logradouro: cepData.logradouro || parsed.logradouro,
    numero: parsed.numero || '',
    bairro: parsed.bairro || cepData.bairro || '',
    cidade: cepData.localidade || parsed.cidade,
    uf: cepData.uf || parsed.uf,
    lat: geo?.lat,
    lng: geo?.lng,
  }
  corrigido.endereco = montarEndereco(corrigido)
  const mudou = normTxt(corrigido.endereco) !== normTxt(ig.endereco)

  return {
    id: ig.id,
    nome: ig.nome,
    ok: true,
    mudou,
    enderecoOriginal: ig.endereco,
    ...corrigido,
  }
}

async function main() {
  const applyBase = process.argv.includes('--apply-base')
  const onlyFailures = process.argv.includes('--only-failures')
  const onlyMissing = process.argv.includes('--only-missing')
  const merge = process.argv.includes('--merge')
  const limitArg = process.argv.find(a => a.startsWith('--limit='))
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 0

  const mapaPath = path.join(__dirname, '../src/data/igrejasBase.js')
  const text = fs.readFileSync(mapaPath, 'utf8')
  const base = parseIgrejasArray(text, 'export const IGREJAS_BASE = [')
  const ext = parseIgrejasArray(text, 'export const IGREJAS_EXTERNAS = [')
  let lista = [...base, ...ext]

  const outJson = path.join(__dirname, '../src/data/igrejasEnderecosValidados.json')
  const relPath = path.join(__dirname, '../src/data/igrejasEnderecosValidados-relatorio.json')
  let resultados = {}
  if (merge && fs.existsSync(outJson)) {
    try { resultados = JSON.parse(fs.readFileSync(outJson, 'utf8')) } catch { /* ignore */ }
  }

  if (onlyMissing) {
    const idsOk = new Set(Object.keys(resultados))
    lista = lista.filter(ig => !idsOk.has(String(ig.id)))
    console.log(`Validando ${lista.length} igrejas ainda sem CEP confirmado…`)
  } else if (onlyFailures && fs.existsSync(relPath)) {
    const rel = JSON.parse(fs.readFileSync(relPath, 'utf8'))
    const ids = new Set((rel.falhas || []).map(f => f.id))
    lista = lista.filter(ig => ids.has(ig.id))
    console.log(`Revalidando ${lista.length} igrejas com falha anterior…`)
  } else if (limit > 0) {
    lista = lista.slice(0, limit)
    console.log(`Validando ${lista.length} igrejas do catálogo…`)
  } else {
    console.log(`Validando ${lista.length} igrejas do catálogo…`)
  }
  const relatorio = []
  const avisos = []
  let ok = 0
  let corrigidas = 0
  let falhas = 0

  for (let i = 0; i < lista.length; i++) {
    const ig = lista[i]
    process.stdout.write(`[${i + 1}/${lista.length}] ${ig.id} ${ig.nome.slice(0, 28).padEnd(28)} `)
    try {
      const r = await validarIgreja(ig, avisos)
      if (r.ok) {
        ok++
        resultados[String(r.id)] = {
          cep: r.cep,
          logradouro: r.logradouro,
          numero: r.numero,
          bairro: r.bairro,
          cidade: r.cidade,
          uf: r.uf,
          endereco: r.endereco,
          ...(Number.isFinite(r.lat) ? { lat: r.lat, lng: r.lng } : {}),
          validadoEm: new Date().toISOString().slice(0, 10),
        }
        if (r.mudou) corrigidas++
        console.log(r.mudou ? 'CORRIGIDO' : 'OK')
      } else {
        falhas++
        relatorio.push(r)
        console.log(`FALHA (${r.motivo})`)
      }
    } catch (e) {
      falhas++
      console.log(`ERRO (${e.message})`)
      relatorio.push({ id: ig.id, nome: ig.nome, ok: false, motivo: e.message })
    }
  }

  fs.writeFileSync(outJson, JSON.stringify(resultados, null, 2))

  let falhasFinal = relatorio
  let avisosFinal = avisos
  if (onlyMissing) {
    const todas = [...base, ...ext]
    falhasFinal = todas
      .filter(ig => !resultados[String(ig.id)])
      .map(ig => relatorio.find(r => r.id === ig.id) || { id: ig.id, nome: ig.nome, ok: false, motivo: 'CEP não encontrado', enderecoOriginal: ig.endereco })
    avisosFinal = avisos
  } else if (onlyFailures && merge) {
    const prev = fs.existsSync(relPath) ? JSON.parse(fs.readFileSync(relPath, 'utf8')) : { falhas: [], avisos: [] }
    const failedNow = new Map(relatorio.map(f => [f.id, f]))
    falhasFinal = (prev.falhas || [])
      .filter(f => !resultados[String(f.id)])
      .map(f => failedNow.get(f.id) || f)
    for (const f of relatorio) {
      if (!resultados[String(f.id)] && !falhasFinal.some(x => x.id === f.id)) falhasFinal.push(f)
    }
    avisosFinal = [...(prev.avisos || []), ...avisos]
  }
  fs.writeFileSync(relPath, JSON.stringify({ falhas: falhasFinal, avisos: avisosFinal }, null, 2))

  console.log(`\nConcluído: ${ok} ok, ${corrigidas} corrigidas, ${falhas} falhas`)
  console.log(`Salvo: ${outJson}`)

  if (applyBase) {
    let novo = fs.readFileSync(mapaPath, 'utf8')
    const todasAtual = [
      ...parseIgrejasArray(novo, 'export const IGREJAS_BASE = ['),
      ...parseIgrejasArray(novo, 'export const IGREJAS_EXTERNAS = ['),
    ]
    let alterados = 0
    for (const ig of todasAtual) {
      const r = resultados[String(ig.id)]
      if (!r?.endereco || r.endereco === ig.endereco) continue
      const esc = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      const oldNeedle = `endereco:'${esc(ig.endereco)}'`
      const newNeedle = `endereco:'${esc(r.endereco)}'`
      if (novo.includes(oldNeedle)) {
        novo = novo.replace(oldNeedle, newNeedle)
        alterados++
      }
    }
    if (alterados > 0) {
      fs.writeFileSync(mapaPath, novo)
      console.log(`igrejasBase.js atualizado (${alterados} endereços)`)
    }
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
