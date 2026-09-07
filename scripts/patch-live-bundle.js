import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const src = path.join(root, 'tmp-live.js')
const outDir = path.join(root, 'deploy-hostinger', 'assets')
const out = path.join(outDir, 'index-DhnYuIz6.js')
const indexOut = path.join(root, 'deploy-hostinger', 'index.html')
const indexSrc = path.join(root, 'tmp-live-index.html')

let js = fs.readFileSync(src, 'utf8')

function openUrl(v) {
  return `window.open(\`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=\${${v}.lat},\${${v}.lng}\`, "_blank", "noopener,noreferrer")`
}

function replaceAll(from, to, label) {
  if (!js.includes(from)) return false
  js = js.split(from).join(to)
  console.log('patched:', label || from.slice(0, 70))
  return true
}

let count = 0

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
  [
    'onClick:()=>l==null?void 0:l(t),children:"Ver rua"',
    `onClick:()=>${openUrl('t')},children:"Ver rua"`,
  ],
]

for (const [from, to] of reps) {
  if (replaceAll(from, to)) count++
}

// Desativa o panorama embutido (caixa preta vazia)
const kpeNeedle =
  '(d==null?void 0:d.lat)&&(d==null?void 0:d.lng)&&r.jsx(kpe,{options:{position:{lat:d.lat,lng:d.lng},visible:!0'
const kpePatch =
  'false&&r.jsx(kpe,{options:{position:{lat:0,lng:0},visible:!1'
if (replaceAll(kpeNeedle, kpePatch, 'disable embedded StreetView panorama')) count++

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(out, js)

// index.html com cache-bust + limpeza unica do service worker
let html = fs.readFileSync(indexSrc, 'utf8')
html = html.replace(
  '<script type="module" crossorigin src="/assets/index-DhnYuIz6.js"></script>',
  `<script>
      (function () {
        var key = 'campanha_sw_cleared_v3'
        if (sessionStorage.getItem(key)) return
        sessionStorage.setItem(key, '1')
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(function (regs) {
            regs.forEach(function (r) { r.unregister() })
          })
        }
        if ('caches' in window) {
          caches.keys().then(function (keys) {
            keys.forEach(function (k) { caches.delete(k) })
          })
        }
      })()
    </script>
    <script type="module" crossorigin src="/assets/index-DhnYuIz6.js?v=verrua3"></script>`
)
fs.writeFileSync(indexOut, html)

console.log(`\nWrote ${out} (${js.length} bytes, ${count} patches)`)
console.log(`Wrote ${indexOut}`)

// sanity
const checks = [
  ['_e({lat', false],
  ['onClick:()=>l==null?void 0:l(t),children:"Ver rua"', false],
  ['false&&r.jsx(kpe,{options:{position:{lat:0,lng:0},visible:!1', true],
  ['map_action=pano', true],
]
for (const [needle, want] of checks) {
  const ok = js.includes(needle) === want
  console.log(`${ok ? 'OK' : 'FAIL'}: ${needle}`)
}
