const fs = require('fs')
const path = require('path')

const montarPath = path.join(__dirname, '../src/components/MontarRotas.jsx')
const retPath = path.join(__dirname, '../src/components/montarRotas/_returnFragment.txt')

let content = fs.readFileSync(montarPath, 'utf8')
const ret = fs.readFileSync(retPath, 'utf8')

const anchor = "  const bairrosChip = setores.filter(s => s !== 'Todos' && !String(s).startsWith('—'))"
const idx = content.indexOf(anchor)
if (idx === -1) {
  console.error('anchor not found')
  process.exit(1)
}
const lineEnd = content.indexOf('\n', idx + anchor.length)
const logic = content.slice(0, lineEnd + 1)

const imports = `import MontarRotasView from './montarRotas/MontarRotasView'
import PainelExtras from './montarRotas/PainelExtras'
import PainelHistorico from './montarRotas/PainelHistorico'
`

if (!content.includes('MontarRotasView')) {
  content = content.replace(
    "import { limitarPinsMapa, MAX_PINS_MAPA } from '../utils/mapaPins'",
    imports + "import { limitarPinsMapa, MAX_PINS_MAPA } from '../utils/mapaPins'",
  )
}

const newContent = logic + '\n' + ret + '\n}\n'
fs.writeFileSync(montarPath, newContent)
console.log('MontarRotas.jsx updated, lines:', newContent.split('\n').length)
