import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { ThemeProvider } from './theme/ThemeContext.jsx'
import { ensureSyncInstalled } from './lib/cloudSync'
import { sanitizeCorruptedStorage, initHeavyStore } from './utils/persist'
import { resetIgrejasMapaSePreciso } from './utils/igrejasReset'
import { installCampoFotoRetryListeners, repararFilaCampoFotosPendentes, processCampoFotoUploadQueue } from './utils/campoFotoUploadQueue'
import './index.css'

// Captura o prompt nativo do Android o mais cedo possível
window.__pwaDeferredPrompt = null
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.__pwaDeferredPrompt = e
})

async function bootstrap() {
  const rootEl = document.getElementById('root')
  if (!rootEl) throw new Error('Elemento #root não encontrado')

  // Monta a UI primeiro — evita tela presa em "Carregando…" se IndexedDB demorar
  ReactDOM.createRoot(rootEl).render(
    <ErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>,
  )
  window.__campanhaBooted = true

  try {
    await Promise.race([
      initHeavyStore(),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ])
  } catch (e) {
    console.warn('initHeavyStore:', e)
  }
  ensureSyncInstalled('local')
  sanitizeCorruptedStorage()
  resetIgrejasMapaSePreciso()
  installCampoFotoRetryListeners()
  repararFilaCampoFotosPendentes()
  processCampoFotoUploadQueue({ limit: 2 }).catch(() => {})
}

function showBootError(err) {
  const root = document.getElementById('root')
  if (!root) return
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;background:#07090e;color:#94a3b8;font-family:system-ui,sans-serif;text-align:center">
      <p style="color:#f87171;font-weight:600">Erro ao iniciar o sistema</p>
      <p style="font-size:14px;max-width:420px">${String(err?.message || err || 'desconhecido').replace(/</g, '&lt;')}</p>
      <button type="button" onclick="location.href='/reset-app.html'" style="margin-top:8px;padding:10px 18px;border-radius:12px;border:none;background:#1d4ed8;color:#fff;font-weight:600;cursor:pointer">Limpar cache e tentar de novo</button>
    </div>`
}

bootstrap().catch(showBootError)
