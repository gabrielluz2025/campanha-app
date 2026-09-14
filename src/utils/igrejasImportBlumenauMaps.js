/** Importação da planilha Igrejas_Blumenau_Organizado_por_Bairro.xlsx (Google Maps). */

import { formatarCep, montarEnderecoIgreja } from './agendaLocal'
import { eIgrejaCrista } from './igrejaCrista'
import { gerarIdIgrejaCustom } from './igrejaCustomId'
import { chaveEnderecoIgreja, matchPorEndereco } from './igrejaMatch'
import {
  invalidateIgrejasCatalogCache,
  loadIgrejasCatalog,
  readIgrejasCustom,
  IGREJAS_ATUALIZADAS_EVENT,
} from './igrejasCatalog'
import { readStorage, writeStorage, flushAfterSave } from './persist'
import { pushChurchCatalogToServer, marcarCadastroIgrejasAtivoNoServidor } from '../lib/cloudSync'
import { igrejaSemCep } from './igrejasImportConsolidado'

async function loadXlsx() {
  return import('xlsx')
}

function fmtTel(v) {
  const d = String(v || '').replace(/\D/g, '')
  if (d.length < 8) return ''
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return String(v || '').trim()
}

function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

export function extrairGooglePlaceId(link) {
  const m = String(link || '').match(/query_place_id=([^&]+)/i)
  return m ? decodeURIComponent(m[1]) : ''
}

function inferDenom(nome, categoria = '') {
  const blob = `${nome} ${categoria}`.toUpperCase()
  if (/ASSEMBLEIA|ADBLU|\bAD\b/.test(blob)) return 'Assembleia de Deus'
  if (/BATISTA/.test(blob)) return 'Batista'
  if (/UNIVERSAL/.test(blob)) return 'Universal'
  if (/QUADRANGULAR/.test(blob)) return 'Quadrangular'
  if (/LUTERAN/.test(blob)) return 'Luterana'
  if (/ADVENTIST/.test(blob)) return 'Adventista'
  if (/CATOLIC|PAROQUIA/.test(blob)) return 'Católica'
  if (/METODIST/.test(blob)) return 'Metodista'
  if (/PRESBITER/.test(blob)) return 'Presbiteriana'
  if (/TESTEMUNHA|JEOVA/.test(blob)) return 'Testemunhas de Jeová'
  if (/EVANGEL|GOSPEL|CRIST/.test(blob)) return 'Evangélica'
  return 'Outra'
}

function parseSiteRede(raw) {
  const s = String(raw || '').trim()
  if (!s) return { website: '', instagram: '', facebook: '' }
  const sl = s.toLowerCase()
  if (sl.includes('instagram.com')) return { website: '', instagram: s, facebook: '' }
  if (sl.includes('facebook.com') || sl.includes('fb.com')) return { website: '', instagram: '', facebook: s }
  return { website: s, instagram: '', facebook: '' }
}

function extrairNumeroLogradouro(rua) {
  const s = String(rua || '').trim()
  const m = s.match(/,\s*(\d{1,6})\s*$/)
  return m ? m[1] : ''
}

function limparLogradouro(rua) {
  return String(rua || '').replace(/,\s*\d{1,6}\s*$/, '').trim()
}

function colMap(headerRow) {
  const map = {}
  headerRow.forEach((h, i) => {
    const key = String(h || '').trim().toLowerCase()
    if (key) map[key] = i
  })
  return map
}

function val(row, cols, ...keys) {
  for (const k of keys) {
    const idx = cols[k.toLowerCase()]
    if (idx == null) continue
    const v = row[idx]
    if (v != null && String(v).trim() !== '') return v
  }
  return ''
}

/** Detecta planilha Blumenau (Google Maps) vs consolidado a partir de linhas AOA. */
export function detectarFormatoFromAoa(aoa = []) {
  const flat = aoa.flat().map(c => String(c || '').toLowerCase())
  if (flat.some(c => c.includes('link no google maps') || c === 'nome da igreja')) {
    return 'blumenau_maps'
  }
  const headerObj = aoa.find(r => r && (String(r[0] || '').toUpperCase() === 'IGREJA' || String(r[0] || '').toUpperCase() === 'LOGRADOURO'))
  if (headerObj) return 'consolidado'
  return null
}

/** Normaliza linha da planilha Blumenau/Google Maps. */
export function normalizarLinhaBlumenauMaps(row, cols, idx = 0) {
  const bairro = String(val(row, cols, 'bairro') || '').trim()
  const nome = String(val(row, cols, 'nome da igreja', 'nome') || '').trim()
  const categoria = String(val(row, cols, 'categoria principal', 'categoria') || '').trim()
  const enderecoCompleto = String(val(row, cols, 'endereço completo', 'endereco completo') || '').trim()
  const ruaRaw = String(val(row, cols, 'rua/logradouro', 'rua', 'logradouro') || '').trim()
  const cep = formatarCep(val(row, cols, 'cep'))
  const telefone = fmtTel(val(row, cols, 'telefone'))
  const siteRaw = val(row, cols, 'site / rede social', 'site')
  const notaGoogle = Number(val(row, cols, 'nota (avaliação)', 'nota'))
  const numAvaliacoes = Number(val(row, cols, 'nº de avaliações', 'num avaliacoes'))
  const linkMaps = String(val(row, cols, 'link no google maps', 'google maps') || '').trim()
  const googlePlaceId = extrairGooglePlaceId(linkMaps)
  const numero = extrairNumeroLogradouro(ruaRaw || enderecoCompleto)
  const logradouro = limparLogradouro(ruaRaw || enderecoCompleto)
  const { website, instagram, facebook } = parseSiteRede(siteRaw)
  const endereco = enderecoCompleto || montarEnderecoIgreja({
    logradouro,
    numero,
    bairro: bairro.replace(/^não informado.*$/i, ''),
    setor: bairro,
    cidade: 'Blumenau',
    uf: 'SC',
    cep,
  })

  return {
    key: `bnu-maps-${idx}-${googlePlaceId || norm(nome)}-${chaveEnderecoIgreja(endereco) || idx}`,
    nome,
    categoria,
    bairro: bairro.replace(/^não informado.*$/i, '') || '—',
    setor: bairro.replace(/^não informado.*$/i, '') || '—',
    logradouro,
    numero,
    cidade: 'Blumenau',
    uf: 'SC',
    cep,
    endereco,
    telefone,
    whatsapp: '',
    website,
    instagram,
    facebook,
    notaGoogle: Number.isFinite(notaGoogle) ? notaGoogle : null,
    numAvaliacoes: Number.isFinite(numAvaliacoes) ? numAvaliacoes : null,
    googleMaps: linkMaps,
    googlePlaceId,
    denominacao: inferDenom(nome, categoria),
    culto: '',
    pastor: '',
    semCep: igrejaSemCep({ cep }),
    selecionada: true,
    formato: 'blumenau_maps',
  }
}

/** Lê XLSX Blumenau por bairro (cabeçalho na linha "Bairro"). */
export async function lerArquivoBlumenauMapsXlsx(file) {
  if (!file) throw new Error('Selecione um arquivo .xlsx')
  const XLSX = await loadXlsx()
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: false })
  const sheetName = wb.SheetNames[0]
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' })
  const headerIdx = aoa.findIndex(r => String(r?.[0] || '').trim().toLowerCase() === 'bairro')
  if (headerIdx < 0) throw new Error('Planilha Blumenau não reconhecida (falta coluna Bairro).')
  const cols = colMap(aoa[headerIdx])
  const linhas = []
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const row = aoa[i]
    if (!row || !String(row[0] || '').trim()) continue
    const linha = normalizarLinhaBlumenauMaps(row, cols, i)
    if (linha.nome.length >= 2) linhas.push(linha)
  }
  if (!linhas.length) throw new Error('Nenhuma igreja encontrada na planilha.')
  return deduplicarLinhasBlumenauMaps(linhas)
}

function scoreLinhaBlumenau(l) {
  let s = 0
  if (l.googlePlaceId) s += 100
  if (l.telefone) s += 20
  if (l.cep && !l.semCep) s += 10
  if (l.website || l.instagram || l.facebook) s += 5
  if (l.notaGoogle != null) s += 3
  s += Math.min(Number(l.numAvaliacoes) || 0, 100) / 20
  s += Math.min(String(l.nome || '').length, 60) / 60
  return s
}

function mesclarLinhasBlumenau(a, b) {
  const primary = scoreLinhaBlumenau(a) >= scoreLinhaBlumenau(b) ? a : b
  const other = primary === a ? b : a
  const cep = primary.cep || other.cep
  return {
    ...primary,
    telefone: primary.telefone || other.telefone,
    cep,
    semCep: igrejaSemCep({ cep }),
    website: primary.website || other.website,
    instagram: primary.instagram || other.instagram,
    facebook: primary.facebook || other.facebook,
    googlePlaceId: primary.googlePlaceId || other.googlePlaceId,
    googleMaps: primary.googleMaps || other.googleMaps,
    notaGoogle: primary.notaGoogle ?? other.notaGoogle ?? null,
    numAvaliacoes: primary.numAvaliacoes ?? other.numAvaliacoes ?? null,
    endereco: primary.endereco || other.endereco,
    logradouro: primary.logradouro || other.logradouro,
    numero: primary.numero || other.numero,
    nome: String(primary.nome || '').length >= String(other.nome || '').length ? primary.nome : other.nome,
    dedupeMesclada: (primary.dedupeMesclada || 1) + (other.dedupeMesclada || 1),
  }
}

function chaveDedupeLinha(linha) {
  if (linha.googlePlaceId) return `pid:${linha.googlePlaceId}`
  const ch = chaveEnderecoIgreja(linha.endereco)
  if (ch) return `end:${ch}`
  const nb = norm(linha.bairro)
  const nn = norm(linha.nome)
  const nr = norm(linha.logradouro || linha.endereco)
  const num = String(linha.numero || extrairNumeroLogradouro(linha.endereco) || '').trim()
  if (nn && (nr || num)) return `nome-end:${nn}|${nb}|${nr}|${num}`
  return `row:${linha.key}`
}

/** Remove duplicatas da planilha (Place ID → endereço → nome+bairro+rua). */
export function deduplicarLinhasBlumenauMaps(linhas = []) {
  const map = new Map()
  let duplicatasRemovidas = 0

  for (const linha of linhas) {
    const key = chaveDedupeLinha(linha)
    const prev = map.get(key)
    if (!prev) {
      map.set(key, { ...linha, dedupeMesclada: 1 })
      continue
    }
    map.set(key, mesclarLinhasBlumenau(prev, linha))
    duplicatasRemovidas++
  }

  return {
    linhas: [...map.values()],
    duplicatasRemovidas,
  }
}

function itemCrista(linha) {
  return eIgrejaCrista({
    nome: linha.nome,
    denominacao: linha.denominacao,
    alt_name: linha.categoria,
  })
}

function enrichAtual(ig, enrichMap) {
  const en = enrichMap?.[ig.id] || {}
  return {
    telefone: ig.telefone || en.telefone || '',
    whatsapp: ig.whatsapp || en.whatsapp || '',
    website: ig.website || en.website || '',
    instagram: ig.instagram || en.instagram || '',
    facebook: ig.facebook || en.facebook || '',
    googlePlaceId: ig.googlePlaceId || en.googlePlaceId || '',
    googleMaps: ig.googleMaps || en.googleMaps || '',
    notaGoogle: ig.notaGoogle ?? en.notaGoogle ?? null,
  }
}

function camposEnriquecimento(linha, ig, enrichMap) {
  const cur = enrichAtual(ig, enrichMap)
  const out = []
  if (linha.telefone && !cur.telefone) out.push('telefone')
  if (linha.website && !cur.website) out.push('site')
  if (linha.instagram && !cur.instagram) out.push('instagram')
  if (linha.facebook && !cur.facebook) out.push('facebook')
  if (linha.googlePlaceId && !cur.googlePlaceId) out.push('Google Place ID')
  if (linha.googleMaps && !cur.googleMaps) out.push('link Maps')
  if (linha.notaGoogle != null && cur.notaGoogle == null) out.push('nota Google')
  return out
}

function acharMatchCatalogo(linha, catalog, enrichMap) {
  if (linha.googlePlaceId) {
    const porPlace = catalog.find(c => String(c.googlePlaceId || enrichMap?.[c.id]?.googlePlaceId || '') === linha.googlePlaceId)
    if (porPlace) return { igreja: porPlace, motivo: 'googlePlaceId' }
  }
  const endMatch = matchPorEndereco(linha, catalog)
  if (endMatch?.igreja) return { igreja: endMatch.igreja, motivo: endMatch.motivo || 'endereço' }
  const ch = chaveEnderecoIgreja(linha.endereco)
  if (ch) {
    const hit = catalog.find(c => chaveEnderecoIgreja(c.endereco) === ch)
    if (hit) return { igreja: hit, motivo: 'endereco-chave' }
  }
  const nn = norm(linha.nome)
  const nb = norm(linha.bairro)
  const porNome = catalog.find(c => norm(c.nome) === nn && (!nb || norm(c.setor) === nb || norm(c.bairro) === nb))
  if (porNome) return { igreja: porNome, motivo: 'nome+bairro' }
  return null
}

/** Classifica linhas contra o cadastro atual (overlap / de-para). */
export function classificarLinhasBlumenau(linhas, catalog) {
  const cat = catalog || loadIgrejasCatalog()
  const enrichMap = readStorage('igrejas_enrich', {}) || {}
  return (linhas || []).map((linha) => {
    const crista = itemCrista(linha)
    const matchHit = acharMatchCatalogo(linha, cat, enrichMap)
    if (!matchHit) {
      return {
        ...linha,
        status: 'nova',
        crista,
        selecionada: crista && linha.selecionada !== false,
        matchId: null,
        matchNome: '',
        matchMotivo: '',
        enrichCampos: [],
      }
    }
    const enrichCampos = camposEnriquecimento(linha, matchHit.igreja, enrichMap)
    const status = enrichCampos.length ? 'enriquecer' : 'existe'
    return {
      ...linha,
      status,
      crista,
      selecionada: status === 'enriquecer' && crista,
      matchId: matchHit.igreja.id,
      matchNome: matchHit.igreja.nome,
      matchMotivo: matchHit.motivo,
      enrichCampos,
    }
  })
}

export function resumoClassificacaoBlumenau(linhas = []) {
  const total = linhas.length
  const novas = linhas.filter(l => l.status === 'nova').length
  const existentes = linhas.filter(l => l.status === 'existe').length
  const enriquecer = linhas.filter(l => l.status === 'enriquecer').length
  const comCep = linhas.filter(l => !l.semCep).length
  const semCep = total - comCep
  const naoCristas = linhas.filter(l => l.crista === false).length
  const selecionadas = linhas.filter(l => l.selecionada).length
  const mescladasPlanilha = linhas.filter(l => (l.dedupeMesclada || 1) > 1).length
  return {
    total, novas, existentes, enriquecer, comCep, semCep, naoCristas, selecionadas, mescladasPlanilha,
  }
}

function linhaParaIgreja(linha, idExistente = null) {
  return {
    id: idExistente ?? gerarIdIgrejaCustom(),
    nome: linha.nome,
    setor: linha.setor || linha.bairro || '—',
    bairro: linha.bairro || '',
    denominacao: linha.denominacao || inferDenom(linha.nome, linha.categoria),
    endereco: linha.endereco,
    logradouro: linha.logradouro || '',
    numero: linha.numero || '',
    cep: linha.cep || '',
    cidade: linha.cidade || 'Blumenau',
    uf: linha.uf || 'SC',
    culto: '',
    telefone: linha.telefone || '',
    whatsapp: '',
    website: linha.website || '',
    instagram: linha.instagram || '',
    facebook: linha.facebook || '',
    googlePlaceId: linha.googlePlaceId || '',
    googleMaps: linha.googleMaps || '',
    notaGoogle: linha.notaGoogle,
    pastor1: '', esposa1: '', pastor2: '', esposa2: '',
    foto: '/fotos/sem-foto.jpg',
    lat: null,
    lng: null,
    fonte: 'manual',
    manter: true,
    triagemOk: true,
    importPlanilha: 'blumenau_maps',
    atualizadoEm: new Date().toISOString(),
  }
}

function mergeEnrich(id, linha, enrich) {
  const prev = enrich[id] || {}
  return {
    ...prev,
    ...(linha.telefone ? { telefone: linha.telefone } : {}),
    ...(linha.website ? { website: linha.website } : {}),
    ...(linha.instagram ? { instagram: linha.instagram } : {}),
    ...(linha.facebook ? { facebook: linha.facebook } : {}),
    ...(linha.googlePlaceId ? { googlePlaceId: linha.googlePlaceId } : {}),
    ...(linha.googleMaps ? { googleMaps: linha.googleMaps } : {}),
    ...(linha.notaGoogle != null ? { notaGoogle: linha.notaGoogle, numAvaliacoesGoogle: linha.numAvaliacoes } : {}),
  }
}

/** Importa linhas selecionadas (novas + enriquecimento). */
export async function aplicarImportBlumenauMaps(linhas, { enviarSite = true } = {}) {
  const brutas = (linhas || []).filter(l => l.selecionada !== false && l.nome)
  if (!brutas.length) throw new Error('Nenhuma igreja selecionada.')

  const { linhas: selecionadas, duplicatasRemovidas } = deduplicarLinhasBlumenauMaps(brutas)
  if (!selecionadas.length) throw new Error('Nenhuma igreja após remover duplicatas.')

  let custom = readIgrejasCustom()
  let enrich = readStorage('igrejas_enrich', {}) || {}

  let novas = 0
  let atualizadas = 0
  let enriquecidas = 0
  let ignoradas = 0
  let jaExistiam = 0

  for (const linha of selecionadas) {
    if (!itemCrista(linha)) {
      ignoradas++
      continue
    }

    if (linha.status === 'existe') {
      jaExistiam++
      continue
    }

    if (linha.status === 'enriquecer' && linha.matchId) {
      const idx = custom.findIndex(c => String(c.id) === String(linha.matchId))
      const base = idx >= 0 ? custom[idx] : null
      if (base) {
        const patch = linhaParaIgreja(linha, base.id)
        custom[idx] = {
          ...base,
          telefone: base.telefone || patch.telefone,
          website: base.website || patch.website,
          instagram: base.instagram || patch.instagram,
          facebook: base.facebook || patch.facebook,
          googlePlaceId: base.googlePlaceId || patch.googlePlaceId,
          googleMaps: base.googleMaps || patch.googleMaps,
          notaGoogle: base.notaGoogle ?? patch.notaGoogle,
          cep: base.cep || patch.cep,
          endereco: base.endereco || patch.endereco,
          fonte: base.fonte || 'manual',
          manter: true,
        }
        enrich[base.id] = mergeEnrich(base.id, linha, enrich)
        enriquecidas++
        continue
      }
    }

    const dup = custom.find(c => String(c.id) === String(linha.matchId))
      || (() => {
        const m = acharMatchCatalogo(linha, custom, enrich)
        return m?.igreja
      })()

    if (dup) {
      const idx = custom.findIndex(c => String(c.id) === String(dup.id))
      const base = custom[idx]
      custom[idx] = {
        ...base,
        ...linhaParaIgreja(linha, base.id),
        id: base.id,
        culto: base.culto || '',
        pastor1: base.pastor1 || '',
        fonte: base.fonte || 'manual',
        manter: true,
      }
      enrich[base.id] = mergeEnrich(base.id, linha, enrich)
      atualizadas++
    } else {
      const patch = linhaParaIgreja(linha)
      custom.push(patch)
      enrich[patch.id] = mergeEnrich(patch.id, linha, enrich)
      novas++
    }
  }

  writeStorage('igrejas_custom', custom, { force: true })
  writeStorage('igrejas_enrich', enrich, { force: true })
  invalidateIgrejasCatalogCache()

  let nuvem = { ok: true }
  if (enviarSite) {
    await marcarCadastroIgrejasAtivoNoServidor().catch(() => {})
    await flushAfterSave()
    nuvem = await pushChurchCatalogToServer({ custom, enrich })
  }

  try { window.dispatchEvent(new CustomEvent(IGREJAS_ATUALIZADAS_EVENT)) } catch { /* ignore */ }

  return {
    novas,
    atualizadas,
    enriquecidas,
    ignoradas,
    jaExistiam,
    duplicatasRemovidas,
    totalCustom: custom.length,
    semCep: custom.filter(igrejaSemCep).length,
    nuvemOk: Boolean(nuvem?.ok),
    server: nuvem?.server ?? custom.length,
  }
}

/** Auto-detecta formato e lê arquivo. */
export async function lerArquivoPlanilhaIgrejas(file) {
  if (!file) throw new Error('Selecione um arquivo .xlsx')
  const XLSX = await loadXlsx()
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: false })
  const sheetName = wb.SheetNames[0]
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' })
  const formato = detectarFormatoFromAoa(aoa)
  if (formato === 'blumenau_maps') {
    const pack = await lerArquivoBlumenauMapsXlsx(file)
    return { formato, linhas: pack.linhas, duplicatasRemovidas: pack.duplicatasRemovidas }
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
  if (rows.length && (rows[0].IGREJA || rows[0].Igreja || rows[0].LOGRADOURO || rows[0].logradouro)) {
    const { normalizarLinhaConsolidado } = await import('./igrejasImportConsolidado')
    const linhas = rows.map((r, i) => ({ ...normalizarLinhaConsolidado(r, i), formato: 'consolidado' }))
      .filter(l => l.nome.length >= 2)
    return { formato: 'consolidado', linhas }
  }
  throw new Error('Formato não reconhecido. Use a planilha Consolidado ou Blumenau por Bairro (Google Maps).')
}
