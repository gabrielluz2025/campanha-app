/* EquipeContratosPublica — relatório de contratos via link + PIN
   Acesso: /#/equipe-contratos/{token}
*/
import { useEffect, useMemo, useState } from 'react'
import { FileText, Copy, Check, Loader2, AlertTriangle } from 'lucide-react'
import AgendaPinGate from './AgendaPinGate'
import {
  decodeContratoToken, carregarSnapshotContrato,
} from '../utils/equipeContratoShare'
import {
  formatarMembroTexto, formatarRelatorioTexto, camposFaltando,
  formatarDataExibicao, formatarSalarioExibicao, formatarEnderecoExibicao,
  copiarTexto,
} from '../utils/equipeContratoReport'
import {
  pinConfigurado, sessaoAuthValida,
} from '../utils/agendaPin'

function Linha({ label, value }) {
  return (
    <div>
      <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 1 }}>{label}</p>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', wordBreak: 'break-word' }}>{value || '—'}</p>
    </div>
  )
}

function CardPublico({ m, onCopiar, copiadoId }) {
  const faltas = camposFaltando(m)
  const end = formatarEnderecoExibicao(m)
  return (
    <div className="rounded-2xl p-4"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-bold" style={{ fontSize: 16, color: 'var(--text-primary)' }}>{m.nome || '—'}</p>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {[m.cargo, m.vinculo].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
        <button type="button" onClick={() => onCopiar(m)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold"
          style={{
            fontSize: 11,
            background: copiadoId === m.id ? 'rgba(16,185,129,0.18)' : 'rgba(37,99,235,0.15)',
            color: copiadoId === m.id ? '#34d399' : 'var(--accent-bright)',
          }}>
          {copiadoId === m.id ? <Check size={12} /> : <Copy size={12} />}
          {copiadoId === m.id ? 'Copiado' : 'Copiar'}
        </button>
      </div>

      {faltas.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3 px-2 py-1.5 rounded-lg"
          style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <AlertTriangle size={12} style={{ color: '#fbbf24', flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: '#fcd34d' }}>Falta: {faltas.join(', ')}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
        <Linha label="CPF" value={m.cpf} />
        <Linha label="Nascimento" value={m.dataNascimento ? formatarDataExibicao(m.dataNascimento) : ''} />
        <Linha label="Telefone" value={m.telefone} />
        <Linha label="Remuneração" value={m.salario ? formatarSalarioExibicao(m.salario) : ''} />
        <Linha label="Início" value={m.dataInicio ? formatarDataExibicao(m.dataInicio) : ''} />
        <Linha label="Nº contrato" value={m.contrato} />
        <div className="sm:col-span-2"><Linha label="Endereço" value={end} /></div>
        {m.observacoes && (
          <div className="sm:col-span-2"><Linha label="Observações" value={m.observacoes} /></div>
        )}
      </div>
    </div>
  )
}

export default function EquipeContratosPublica({ token }) {
  const data = useMemo(() => decodeContratoToken(token), [token])
  const shareId = data?.shareId || null

  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [autenticado, setAutenticado] = useState(() => shareId ? sessaoAuthValida(shareId) : false)
  const [temPin, setTemPin] = useState(true)
  const [copiadoId, setCopiadoId] = useState(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!shareId) {
      setLoading(false)
      return undefined
    }
    let cancel = false
    ;(async () => {
      setLoading(true)
      const [snap, pinOk] = await Promise.all([
        carregarSnapshotContrato(shareId),
        pinConfigurado(shareId),
      ])
      if (cancel) return
      setSnapshot(snap)
      setTemPin(pinOk)
      if (sessaoAuthValida(shareId)) setAutenticado(true)
      setLoading(false)
    })()
    return () => { cancel = true }
  }, [shareId])

  const membros = snapshot?.membros || []
  const geradoEm = snapshot?.geradoEm || data?.geradoEm || ''

  async function copiarUm(m) {
    const ok = await copiarTexto(formatarMembroTexto(m))
    setCopiadoId(m.id)
    setMsg(ok ? 'Copiado!' : 'Não foi possível copiar')
    setTimeout(() => { setCopiadoId(null); setMsg('') }, 2000)
  }

  async function copiarTodos() {
    const ok = await copiarTexto(formatarRelatorioTexto(membros))
    setCopiadoId('all')
    setMsg(ok ? `${membros.length} membro(s) copiado(s)` : 'Não foi possível copiar')
    setTimeout(() => { setCopiadoId(null); setMsg('') }, 2000)
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#08080d' }}>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Link inválido ou expirado.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: '#08080d' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Carregando relatório…</p>
      </div>
    )
  }

  if (!snapshot?.membros?.length) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#08080d' }}>
        <p className="text-sm text-center" style={{ color: 'var(--text-tertiary)' }}>
          Relatório não encontrado. Peça um novo link ao coordenador.
        </p>
      </div>
    )
  }

  if (!autenticado) {
    return (
      <div className="min-h-screen" style={{ background: '#08080d' }}>
        <div className="max-w-md mx-auto pt-10 pb-6 px-4">
          <div className="flex items-center gap-3 mb-6 px-1">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e40af)' }}>
              <FileText size={20} className="text-white" />
            </div>
            <div>
              <h1 className="font-black text-white" style={{ fontSize: 18 }}>Dados para Contratos</h1>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                {membros.length} membro{membros.length !== 1 ? 's' : ''} · acesso protegido
              </p>
            </div>
          </div>
          <AgendaPinGate
            shareId={shareId}
            membro="Contratos"
            semPin={!temPin}
            onAutenticado={() => setAutenticado(true)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-10" style={{ background: '#08080d' }}>
      <div className="sticky top-0 z-10 px-4 py-4"
        style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.18)' }}>
              <FileText size={17} className="text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-white truncate" style={{ fontSize: 15 }}>Dados para Contratos</h1>
              <p className="text-blue-200 truncate" style={{ fontSize: 11 }}>
                {membros.length} membro{membros.length !== 1 ? 's' : ''}
                {geradoEm ? ` · gerado em ${formatarDataExibicao(geradoEm)}` : ''}
              </p>
            </div>
          </div>
          <button type="button" onClick={copiarTodos}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-white flex-shrink-0"
            style={{ fontSize: 12, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)' }}>
            {copiadoId === 'all' ? <Check size={13} /> : <Copy size={13} />}
            Copiar todos
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-3">
        {membros.map(m => (
          <CardPublico key={m.id || m.nome} m={m} onCopiar={copiarUm} copiadoId={copiadoId} />
        ))}

        {msg && (
          <p className="text-center" style={{ fontSize: 12, color: '#34d399' }}>{msg}</p>
        )}

        <p className="text-center pt-4" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
          Snapshot gerado em {geradoEm ? formatarDataExibicao(geradoEm) : '—'}.
          Alterações posteriores no sistema não atualizam este link.
        </p>
      </div>
    </div>
  )
}
