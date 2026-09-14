/**
 * Pré-visualiza de-para das fichas de papel contra o catálogo fixo ADBLU.
 * Uso: node scripts/preview-depara-papel.cjs
 */
const { IGREJAS_LISTA_PAPEL, TOTAL_LISTA_PAPEL } = require('../src/data/igrejasListaPapel.js')
const { IGREJAS_LISTA_ADBLU } = require('../src/data/igrejasListaAdblu.js')

function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

function extrairNumero(end) {
  const m = String(end || '').match(/(\d{1,6})\s*$/)
  return m ? m[1] : ''
}

function chaveEndereco(end) {
  const n = extrairNumero(end)
  if (!n) return ''
  const rua = norm(end).replace(/\s+\d+$/, '').trim()
  return `${rua}|${n}`
}

const catalogo = [...IGREJAS_LISTA_ADBLU]
let existe = 0
let nova = 0

console.log(`\nFichas de papel: ${TOTAL_LISTA_PAPEL} igrejas\n`)
console.log('—'.repeat(72))

for (const item of IGREJAS_LISTA_PAPEL) {
  const ch = chaveEndereco(item.endereco)
  const hit = catalogo.find(c => chaveEndereco(c.endereco) === ch)
    || catalogo.find(c => norm(c.bairro) === norm(item.bairro) && norm(c.nome).includes(norm(item.nome).split(' ')[0]))
  if (hit) {
    existe++
    console.log(`✓ DE-PARA  ${item.nome.slice(0, 40).padEnd(42)} → ${hit.congregacao || hit.nome}`)
  } else {
    nova++
    console.log(`+ NOVA     ${item.nome.slice(0, 40).padEnd(42)}   ${item.bairro} · ${item.endereco}`)
  }
}

console.log('—'.repeat(72))
console.log(`Resumo: ${existe} casadas (de-para) · ${nova} novas · total ${TOTAL_LISTA_PAPEL}\n`)
