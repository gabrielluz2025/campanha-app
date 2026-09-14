/** Sincroniza endereços ADBLU (sem CEP) a partir de igrejasBase.js */
const fs = require('fs')
const path = require('path')

function parseBase(text) {
  const start = text.indexOf('export const IGREJAS_BASE = [')
  const end = text.indexOf('export const IGREJAS_EXTERNAS = [')
  const block = text.slice(start, end)
  const out = {}
  const re = /\{\s*id:(\d+),[\s\S]*?nome:'((?:\\'|[^'])*)'[\s\S]*?endereco:'((?:\\'|[^'])*)'/g
  let m
  while ((m = re.exec(block))) {
    const nome = m[2].replace(/\\'/g, "'")
    const endereco = m[3].replace(/\\'/g, "'").replace(/, CEP [^']+$/, '')
    out[nome] = endereco
  }
  return out
}

const mapaPath = path.join(__dirname, '../src/data/igrejasBase.js')
const adbluPath = path.join(__dirname, '../src/data/igrejasListaAdblu.js')
const base = parseBase(fs.readFileSync(mapaPath, 'utf8'))
let adblu = fs.readFileSync(adbluPath, 'utf8')
let n = 0

for (const [cong, endereco] of Object.entries(base)) {
  const escCong = cong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escEnd = endereco.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const rx = new RegExp(`(congregacao: '${escCong}', bairro:[^,]+, endereco: ')(?:\\\\'|[^'])*'`)
  if (rx.test(adblu)) {
    adblu = adblu.replace(rx, `$1${escEnd}'`)
    n++
  }
}

fs.writeFileSync(adbluPath, adblu)
console.log(`ADBLU: ${n} endereços sincronizados`)
