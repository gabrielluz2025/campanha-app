import { Component } from 'react'
import { AlertTriangle, RefreshCw, Wrench } from 'lucide-react'
import { isCampoLengthCrashError, recoverFromCampoStorageCrash } from '../utils/campoStorageSanitize'

export default class ErrorBoundary extends Component {
  state = { error: null, recovering: false, recoveredKeys: [] }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Erro na interface:', error, info)
    if (isCampoLengthCrashError(error)) {
      try {
        const fixedKeys = recoverFromCampoStorageCrash()
        if (fixedKeys.length) {
          console.warn('[ErrorBoundary] Arrays de campo reparados:', fixedKeys)
        }
      } catch (e) {
        console.warn('[ErrorBoundary] Auto-recuperação falhou:', e)
      }
    }
  }

  handleRecoverAndRetry = () => {
    this.setState({ recovering: true })
    try {
      const fixedKeys = recoverFromCampoStorageCrash()
      this.setState({ error: null, recovering: false, recoveredKeys: fixedKeys })
    } catch {
      this.setState({ recovering: false })
      window.location.reload()
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    const msg = this.state.error?.message || 'Erro desconhecido'
    const showRecover = isCampoLengthCrashError(this.state.error)

    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center"
        style={{ background: 'var(--bg-base)', color: 'var(--text-secondary)' }}>
        <AlertTriangle size={36} style={{ color: '#f87171' }} />
        <h1 className="text-lg font-bold text-white/80">Algo deu errado ao carregar o sistema</h1>
        <p className="text-sm max-w-md" style={{ color: 'var(--text-tertiary)' }}>
          {msg}
        </p>
        {showRecover && (
          <p className="text-xs max-w-md text-amber-200/80">
            Dados locais de rotas ou equipe podem estar corrompidos. Use &quot;Reparar e tentar de novo&quot; antes de recarregar.
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-2 items-center">
          {showRecover && (
            <button
              type="button"
              disabled={this.state.recovering}
              onClick={this.handleRecoverAndRetry}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-semibold text-sm text-white disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}
            >
              <Wrench size={14} />
              {this.state.recovering ? 'Reparando…' : 'Reparar e tentar de novo'}
            </button>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-semibold text-sm text-white"
            style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)' }}
          >
            <RefreshCw size={14} /> Recarregar página
          </button>
        </div>
      </div>
    )
  }
}
