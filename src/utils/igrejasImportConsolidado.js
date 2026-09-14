/** Importação da planilha Consolidado_Igrejas_Final_Com_Todos_CEPs.xlsx */

import { formatarCep, montarEnderecoIgreja } from './agendaLocal'
import { eIgrejaCrista } from './igrejaCrista'
import { gerarIdIgrejaCustom } from './igrejaCustomId'
import { chaveEnderecoIgreja } from './igrejaMatch'
import { invalidateIgrejasCatalogCache, readIgrejasCustom, IGREJAS_ATUALIZADAS_EVENT } from './igrejasCatalog'
import { readStorage, writeStorage, flushAfterSave } from './persist'
import { pushChurchCatalogToServer, marcarCadastroIgrejasAtivoNoServidor } from '../lib/cloudSync'
import { eAssembleiaDeDeus } from './igrejasAdbluNome'
import { buscarCepPorEndereco } from './igrejasImportLista'

const DIA_MAP = {
  SEG: 'Seg', TER: 'Ter', QUA: 'Qua', QUI: 'Qui', SEX: 'Sex',
  SAB: 'Sáb', SÁB: 'Sáb', DOM: 'Dom',
}

async function loadXlsx() {
  return import('xlsx')
}

function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

function fmtTel(v) {
  const d = String(v || '').replace(/\D/g, '')
  if (d.length < 8) return ''
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return String(v || '').trim()
}

/** Converte "Ter: 19:00:00 | Qui: 19:00:00" → "Ter 19:00 · Qui 19:00" */
export function parseCultoConsolidado(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  if (!s.includes('|') && !/:\s*\d/.test(s)) return s
  return s.split('|').map((part) => {
    const p = part.trim()
    const m = p.match(/^([^:]+):\s*(\d{1,2}:\d{2})/)
    if (!m) return p
    const diaKey = norm(m[1]).slice(0, 3)
    const dia = DIA_MAP[diaKey] || m[1].trim().slice(0, 3)
    return `${dia} ${m[2].slice(0, 5)}`
  }).filter(Boolean).join(' · ')
}

function inferDenom(nome) {
  const n = String(nome || '').toUpperCase()
  if (/ASSEMBLEIA|ADBLU|\bAD\b/.test(n)) return 'Assembleia de Deus'
  if (/BATISTA/.test(n)) return 'Batista'
  if (/UNIVERSAL/.test(n)) return 'Universal'
  if (/QUADRANGULAR/.test(n)) return 'Quadrangular'
  return 'Outra'
}

function montarLogradouro(log, num) {
  let l = String(log || '').trim()
  const n = String(num || '').trim()
  if (!l) return n ? `S/N ${n}` : ''
  if (!/^(RUA|R\.|AV\.?|AVENIDA|TRAVESSA|TV\.?|ROD\.?|ESTRADA|AL\.?|ALAMEDA)/i.test(l)) {
    l = `Rua ${l}`
  }
  return n ? `${l}, ${n}` : l
}

export function igrejaSemCep(ig) {
  return String(ig?.cep || '').replace(/\D/g, '').length !== 8
}

/** Normaliza uma linha da planilha consolidada. */
export function normalizarLinhaConsolidado(row, idx = 0) {
  const nome = String(row.IGREJA || row.Igreja || row.nome || '').trim()
  const logradouro = montarLogradouro(row.LOGRADOURO || row.logradouro, row.NUMERO || row.numero)
  const bairro = String(row.BAIRRO || row.bairro || '').trim()
  const cidade = String(row.CIDADE || row.cidade || 'Blumenau').trim()
  const uf = String(row.ESTADO || row.estado || row.UF || 'SC').trim().toUpperCase().slice(0, 2)
  const cep = formatarCep(row.CEP || row.cep || '')
  const culto = parseCultoConsolidado(row['DIAS DE CULTO'] || row.culto || '')
  const pastor = String(row.PASTOR_NOME || row.pastor || '').trim()
  const tel1 = fmtTel(row.TELEFONE_1 || row.telefone || '')
  const tel2 = fmtTel(row.TELEFONE_2 || row.telefone2 || '')
  const telefone = tel1 || tel2
  const whatsapp = tel2 && tel2 !== tel1 ? tel2 : ''
  const form = {
    cep,
    logradouro: String(row.LOGRADOURO || '').trim(),
    numero: String(row.NUMERO || '').trim(),
    bairro,
    setor: bairro || '—',
    cidade,
    uf,
  }
  const endereco = montarEnderecoIgreja({
    ...form,
    endereco: logradouro ? `${logradouro}, ${bairro}, ${cidade} - ${uf}` : '',
  })

  return {
    key: `cons-${idx}-${norm(nome)}-${chaveEnderecoIgreja(endereco) || idx}`,
    nome,
    logradouro: form.logradouro,
    numero: form.numero,
    bairro,
    setor: bairro || '—',
    cidade,
    uf,
    cep,
    endereco,
    culto,
    pastor,
    telefone,
    whatsapp,
    denominacao: inferDenom(nome),
    fontePlanilha: String(row.FONTE || '').trim(),
    statusDePara: String(row.STATUS_DE_PARA || '').trim(),
    igrejaCorrespondente: String(row.IGREJA_CORRESPONDENTE || '').trim(),
    semCep: igrejaSemCep({ cep }),
    selecionada: true,
  }
}

/** Lê arquivo XLSX da planilha consolidada. */
export async function lerArquivoConsolidadoXlsx(file) {
  if (!file) throw new Error('Selecione um arquivo .xlsx')
  const XLSX = await loadXlsx()
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: false })
  const sheetName = wb.SheetNames.find(n => /base/i.test(n)) || wb.SheetNames[0]
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
  if (!rows.length) throw new Error('Planilha vazia')
  return rows.map((r, i) => normalizarLinhaConsolidado(r, i)).filter(l => l.nome.length >= 2)
}

export function resumoImportConsolidado(linhas = []) {
  const total = linhas.length
  const comCep = linhas.filter(l => !l.semCep).length
  const semCep = total - comCep
  const comCulto = linhas.filter(l => l.culto).length
  const comPastor = linhas.filter(l => l.pastor).length
  return { total, comCep, semCep, comCulto, comPastor }
}

function acharDuplicata(custom, linha) {
  const ch = chaveEnderecoIgreja(linha.endereco)
  if (ch) {
    const hit = custom.find(c => chaveEnderecoIgreja(c.endereco) === ch)
    if (hit) return hit
  }
  const nn = norm(linha.nome)
  const nb = norm(linha.bairro)
  return custom.find(c => norm(c.nome) === nn && (!nb || norm(c.setor) === nb || norm(c.bairro) === nb)) || null
}

function linhaParaIgreja(linha, idExistente = null) {
  return {
    id: idExistente ?? gerarIdIgrejaCustom(),
    nome: linha.nome,
    setor: linha.setor || linha.bairro || '—',
    bairro: linha.bairro || '',
    denominacao: linha.denominacao || inferDenom(linha.nome),
    endereco: linha.endereco,
    logradouro: linha.logradouro || '',
    numero: linha.numero || '',
    cep: linha.cep || '',
    cidade: linha.cidade || 'Blumenau',
    uf: linha.uf || 'SC',
    culto: linha.culto || '',
    telefone: linha.telefone || '',
    whatsapp: linha.whatsapp || '',
    pastor1: linha.pastor || '',
    esposa1: '', pastor2: '', esposa2: '',
    foto: '/fotos/sem-foto.jpg',
    lat: null,
    lng: null,
    fonte: 'manual',
    manter: true,
    triagemOk: true,
    importPlanilha: 'consolidado',
    statusDePara: linha.statusDePara || '',
    igrejaCorrespondente: linha.igrejaCorrespondente || '',
    atualizadoEm: new Date().toISOString(),
  }
}

/**
 * Importa linhas selecionadas para igrejas_custom.
 * @param {object[]} linhas
 * @param {{ substituir?: boolean, enviarSite?: boolean }} opts
 */
export async function aplicarImportConsolidado(linhas, {
  substituir = false,
  enviarSite = true,
} = {}) {
  const selecionadas = (linhas || []).filter(l => l.selecionada !== false && l.nome)
  if (!selecionadas.length) throw new Error('Nenhuma igreja selecionada.')

  let custom = substituir ? [] : readIgrejasCustom()
  let pastores = readStorage('pastores_igrejas', {}) || {}
  let enrich = readStorage('igrejas_enrich', {}) || {}

  let novas = 0
  let atualizadas = 0
  let ignoradas = 0

  for (const linha of selecionadas) {
    if (!eIgrejaCrista({ nome: linha.nome, denominacao: linha.denominacao })) {
      ignoradas++
      continue
    }
    const dup = acharDuplicata(custom, linha)
    const patch = linhaParaIgreja(linha, dup?.id)

    if (dup) {
      const idx = custom.findIndex(c => String(c.id) === String(dup.id))
      custom[idx] = { ...dup, ...patch, id: dup.id, fonte: 'manual', manter: true }
      if (linha.pastor) pastores = { ...pastores, [dup.id]: { ...(pastores[dup.id] || {}), pastor1: linha.pastor } }
      if (linha.telefone || linha.whatsapp) {
        enrich = {
          ...enrich,
          [dup.id]: {
            ...(enrich[dup.id] || {}),
            ...(linha.telefone ? { telefone: linha.telefone } : {}),
            ...(linha.whatsapp ? { whatsapp: linha.whatsapp } : {}),
          },
        }
      }
      atualizadas++
    } else {
      custom.push(patch)
      if (linha.pastor) pastores = { ...pastores, [patch.id]: { pastor1: linha.pastor } }
      if (linha.telefone || linha.whatsapp) {
        enrich = {
          ...enrich,
          [patch.id]: {
            ...(linha.telefone ? { telefone: linha.telefone } : {}),
            ...(linha.whatsapp ? { whatsapp: linha.whatsapp } : {}),
          },
        }
      }
      novas++
    }
  }

  writeStorage('igrejas_custom', custom, { force: true })
  writeStorage('pastores_igrejas', pastores, { force: true })
  writeStorage('igrejas_enrich', enrich, { force: true })
  if (substituir) {
    writeStorage('igrejas_visitas', {}, { force: true })
  }
  invalidateIgrejasCatalogCache()

  let nuvem = { ok: true }
  if (enviarSite) {
    await marcarCadastroIgrejasAtivoNoServidor().catch(() => {})
    await flushAfterSave()
    nuvem = await pushChurchCatalogToServer({ custom, enrich, pastores })
  }

  try { window.dispatchEvent(new CustomEvent(IGREJAS_ATUALIZADAS_EVENT)) } catch { /* ignore */ }

  return {
    novas,
    atualizadas,
    ignoradas,
    totalCustom: custom.length,
    semCep: custom.filter(igrejaSemCep).length,
    nuvemOk: Boolean(nuvem?.ok),
    server: nuvem?.server ?? custom.length,
  }
}

/** Preenche CEP vazio via ViaCEP (logradouro). */
export async function enriquecerCepsConsolidado(linhas, { onProgress, signal } = {}) {
  const out = []
  for (let i = 0; i < linhas.length; i++) {
    if (signal?.aborted) break
    const row = { ...linhas[i] }
    if (row.semCep && row.endereco) {
      const cep = await buscarCepPorEndereco(row.endereco, { signal })
      row.cep = cep
      row.semCep = igrejaSemCep(row)
      const form = {
        cep: row.cep,
        logradouro: row.logradouro,
        numero: row.numero,
        bairro: row.bairro,
        setor: row.setor,
        cidade: row.cidade,
        uf: row.uf,
      }
      row.endereco = montarEnderecoIgreja(form)
      if (onProgress) onProgress(i + 1, linhas.length, row)
      await new Promise(r => setTimeout(r, 350))
    }
    out.push(row)
  }
  return out
}

export { eAssembleiaDeDeus }
