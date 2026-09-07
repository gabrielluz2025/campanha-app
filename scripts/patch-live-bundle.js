import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const src = path.join(root, 'tmp-live.js')
const outDir = path.join(root, 'deploy-hostinger', 'assets')
const out = path.join(outDir, 'index-DhnYuIz6.js')

let js = fs.readFileSync(src, 'utf8')

function openUrl(v) {
  return `window.open(\`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=\${${v}.lat},\${${v}.lng}\`, "_blank", "noopener,noreferrer")`
}

const reps = [
  ['onVerRua:Ae=>{pe(null),_e({lat:Ae.lat,lng:Ae.lng})}', `onVerRua:Ae=>{pe(null),${openUrl('Ae')}}`],
  ['onVerRua:lt=>{Se(null),pe(null),_e({lat:lt.lat,lng:lt.lng})}', `onVerRua:lt=>{Se(null),pe(null),${openUrl('lt')}}`],
  ['onVerRua:Ae=>_e({lat:Ae.lat,lng:Ae.lng})', `onVerRua:Ae=>${openUrl('Ae')}`],
  ['onVerRua:()=>{k(null),I(null),$({lat:ut.lat,lng:ut.lng})}', `onVerRua:()=>{k(null),I(null),${openUrl('ut')}}`],
  ['onVerRua:()=>{k(null),$({lat:Qe.lat,lng:Qe.lng})}', `onVerRua:()=>{k(null),${openUrl('Qe')}}`],
  [
    'onClick:()=>{j?j(t):window.open(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${t.lat},${t.lng}`,"_blank")}',
    `onClick:()=>${openUrl('t')}`,
  ],
]

let count = 0
for (const [from, to] of reps) {
  if (js.includes(from)) {
    js = js.split(from).join(to)
    count++
    console.log('patched:', from.slice(0, 60))
  } else {
    console.log('MISSING:', from.slice(0, 60))
  }
}

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(out, js)
console.log(`\nWrote ${out} (${js.length} bytes, ${count} patches)`)
