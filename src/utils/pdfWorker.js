/**
 * Worker do pdf.js em caminho estável (/pdf.worker.min.js no public).
 * Evita .mjs com hash no /assets (falha de MIME/import no Hostinger).
 */
import { GlobalWorkerOptions } from 'pdfjs-dist'

let configured = false

export function configurarPdfWorker() {
  if (configured) return
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
  GlobalWorkerOptions.workerSrc = `${base}pdf.worker.min.js`
  configured = true
}
