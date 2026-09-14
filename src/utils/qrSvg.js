import QRCode from 'qrcode'

/** QR em SVG inline — entra no PDF sem depender de site externo. */
export function qrSvgMarkup(texto, size = 88) {
  const data = String(texto || '').trim() || ' '
  const qr = QRCode.create(data, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const quiet = 1
  const dim = n + quiet * 2
  const parts = []
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules.get(y, x)) {
        parts.push(`M${x + quiet} ${y + quiet}h1v1h-1z`)
      }
    }
  }
  return `<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true"><rect width="${dim}" height="${dim}" fill="#ffffff"/><path fill="#000000" d="${parts.join('')}"/></svg>`
}
