/** Agrupa igrejas por bairro e abre relatório para impressão / PDF. */

import { BAIRROS_BLUMENAU, normStr } from './constants'
import { normalizarBairro, bairroCanon, isBairroBlumenau } from './bairroMapa'
import { bairroGeoDaCoordenada } from './igrejaMatch'
import { extrairCidadeIgreja } from './igrejaCidade'
import { imprimirListaIgrejas } from './igrejasProximasReport'

function bairroDoEndereco(endereco = '') {
  const end = String(endereco || '').trim()
  if (!end || !end.includes(' - ')) return ''
  const chunk = end.split(' - ')[1]
  if (!chunk) return ''
  return chunk.split(',')[0].trim()
}

/** Rótulo de bairro para listagem e impressão (prioriza GPS → campo bairro → endereço). */
export function bairroRotuloIgreja(ig, geoData = null) {
  if (!ig) return 'Sem bairro'

  const lat = Number(ig.lat)
  const lng = Number(ig.lng)
  if (geoData && Number.isFinite(lat) && Number.isFinite(lng)) {
    const geo = bairroGeoDaCoordenada(lat, lng, geoData)
    if (geo) {
      const canon = normalizarBairro(bairroCanon(geo) || geo)
      if (canon) return canon
    }
  }

  const bairroCampo = String(ig.bairro || '').trim()
  if (bairroCampo) {
    const canon = normalizarBairro(bairroCampo)
    if (canon) return canon
  }

  const doEnd = bairroDoEndereco(ig.endereco)
  if (doEnd) {
    const canon = normalizarBairro(doEnd)
    if (canon) {
      const cidade = extrairCidadeIgreja(ig)
      if (cidade && normStr(cidade) !== normStr('Blumenau') && !isBairroBlumenau(canon)) {
        return `${cidade} · ${canon}`
      }
      return canon
    }
  }

  const setor = String(ig.setor || '').trim()
  if (setor) {
    if (isBairroBlumenau(setor)) return normalizarBairro(setor)
    const cidade = extrairCidadeIgreja(ig)
    if (cidade && normStr(cidade) !== normStr('Blumenau')) {
      return `${cidade} · ${setor}`
    }
    return setor
  }

  const cidade = extrairCidadeIgreja(ig)
  if (cidade && normStr(cidade) !== normStr('Blumenau')) return cidade

  return 'Sem bairro'
}

function ordemBairro(nome) {
  if (!nome || nome === 'Sem bairro') return 9000
  const canon = bairroCanon(nome) || nome
  const idx = BAIRROS_BLUMENAU.indexOf(canon)
  if (idx >= 0) return idx
  if (String(nome).includes('·')) return 500 + normStr(nome).charCodeAt(0)
  return 800 + normStr(nome).charCodeAt(0)
}

/** @returns {{ setor: string, bairro: string, igrejas: object[] }[]} */
export function agruparIgrejasPorBairro(igrejas, geoData = null) {
  const map = new Map()
  for (const ig of igrejas || []) {
    const rotulo = bairroRotuloIgreja(ig, geoData)
    if (!map.has(rotulo)) map.set(rotulo, [])
    map.get(rotulo).push(ig)
  }

  return [...map.entries()]
    .map(([bairro, lista]) => ({
      bairro,
      setor: bairro,
      igrejas: [...lista].sort((a, b) =>
        String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR'),
      ),
    }))
    .sort((a, b) => {
      const oa = ordemBairro(a.bairro)
      const ob = ordemBairro(b.bairro)
      if (oa !== ob) return oa - ob
      return a.bairro.localeCompare(b.bairro, 'pt-BR')
    })
}

export function imprimirIgrejasPorBairro(opts = {}) {
  const igrejas = Array.isArray(opts.igrejas) ? opts.igrejas : []
  const grupos = agruparIgrejasPorBairro(igrejas, opts.geoData)
  const total = igrejas.length
  const filtros = opts.filtrosResumo ? ` · ${opts.filtrosResumo}` : ''
  const subtitulo = opts.subtitulo || [
    `${total} igreja${total !== 1 ? 's' : ''}`,
    `${grupos.length} bairro${grupos.length !== 1 ? 's' : ''}`,
    filtros,
    'V = visitada',
  ].filter(Boolean).join(' · ')

  return imprimirListaIgrejas({
    grupos,
    titulo: opts.titulo || 'Igrejas por bairro',
    subtitulo,
    colunasExtras: opts.colunasExtras ?? ['culto', 'visitado'],
    rodapeEsquerda: opts.rodapeEsquerda || 'Campanha · Mapa de Visitas',
    rodapeDireita: opts.rodapeDireita || 'Blumenau, Gaspar e Indaial',
  })
}
