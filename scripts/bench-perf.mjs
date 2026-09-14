/**
 * Benchmark rápido de operações pesadas do mapa (rode: node scripts/bench-perf.mjs)
 */
import { performance } from 'node:perf_hooks'
import { agruparIgrejasProximas } from '../src/utils/rotaUtils.js'

function bench(label, fn) {
  const t0 = performance.now()
  const out = fn()
  const ms = Math.round((performance.now() - t0) * 10) / 10
  console.log(`${label}: ${ms} ms`)
  return out
}

const n = 576
const igrejas = Array.from({ length: n }, (_, i) => ({
  id: i,
  lat: -26.9 + (i % 40) * 0.005,
  lng: -49.1 + Math.floor(i / 40) * 0.008,
  setor: ['Garcia', 'Velha', 'Fortaleza', 'Itoupava Central'][i % 4],
}))

bench(`agruparIgrejasProximas (${n} igrejas, painel proximas)`, () =>
  agruparIgrejasProximas(igrejas, { maxKm: 3, maxParesPorGrupo: 500 }),
)

bench(`filtrar ADBLU simulado (${n})`, () => {
  let c = 0
  for (const ig of igrejas) {
    if (String(ig.nome || '').toLowerCase().includes('adblu')) c++
  }
  return c
})

console.log('\nNo navegador, após trocar de aba, rode no console:')
console.log('  window.__tabPerf        // último tempo por aba (ms até paint)')
console.log('  window.__tabPerfLog     // histórico das últimas trocas')
