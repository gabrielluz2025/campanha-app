import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Erro na interface:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center"
        style={{ background: 'var(--bg-base)', color: 'var(--text-secondary)' }}>
        <AlertTriangle size={36} style={{ color: '#f87171' }} />
        <h1 className="text-lg font-bold text-white/80">Algo deu errado ao carregar o sistema</h1>
        <p className="text-sm max-w-md" style={{ color: 'var(--text-tertiary)' }}>
          {this.state.error?.message || 'Erro desconhecido'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-semibold text-sm text-white"
          style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)' }}
        >
          <RefreshCw size={14} /> Recarregar página
        </button>
      </div>
    )
  }
}
