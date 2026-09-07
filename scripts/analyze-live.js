import https from 'https'

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let d = ''
      res.on('data', (c) => (d += c))
      res.on('end', () => resolve(d))
    }).on('error', reject)
  })
}

const js = await get('https://campanha.space/assets/index-verrua.js')

const needles = [
  'getStreetView()',
  'streetViewControl',
  'google-map-host',
  'streetview-exit',
  'false&&r.jsx(kpe',
  'false&&r.jsxs("button"',
  'j(V)',
  'j(!1)',
  'OverlayView',
  'OVERLAY_MOUSE_TARGET',
  'InfoWindow',
  'MidiaIgreja',
  'svembed',
  'iframe',
  'position:"fixed"',
  'inset:0',
  'zIndex:1e4',
  'zIndex:9999',
]

for (const p of needles) {
  console.log(p, (js.split(p).length - 1))
}

const pos = js.indexOf('function iH(')
if (pos >= 0) console.log('\n=== iH ===\n', js.slice(pos, pos + 3500))
