const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs')
const dest = path.join(__dirname, '..', 'public', 'pdf.worker.min.js')

fs.copyFileSync(src, dest)
console.log('PDF worker → public/pdf.worker.min.js')
