import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import {
  carregarRegistroContrato, formatarCodigo, hashCurto, rotuloStatusAssinatura, limparCodigo,
} from '../utils/contratoAutenticidade'

export default function ContratoVerificarPublico({ codigo: codigoProp }) {
  const inicial = formatarCodigo(codigoProp || new URLSearchParams(window.location.search).get('c') || '')
  const [codigo, setCodigo] = useState(inicial)
  const [reg, setReg] = useState(null)
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(Boolean(limparCodigo(inicial)))

  async function conferir(c) {
    setErro('')
    setReg(null)
    const raw = limparCodigo(c)
    if (raw.length < 8) {
      setErro('Código incompleto.')
      setLoading(false)
      return
    }
    setLoading(true)
    const data = await carregarRegistroContrato(raw)
    setLoading(false)
    if (!data?.codigo) {
      setErro('Código não encontrado.')
      return
    }
    setReg(data)
  }

  useEffect(() => {
    if (limparCodigo(inicial)) conferir(inicial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen flex items-start justify-center px-4 py-10" style={{ background: '#0f172a' }}>
      <div className="w-full max-w-md rounded-3xl p-6"
        style={{ background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(45,212,191,0.35)' }}>
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck size={20} style={{ color: '#5eead4' }} />
          <h1 className="font-bold text-white" style={{ fontSize: 20 }}>Conferir contrato</h1>
        </div>
        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
          Código impresso no rodapé do documento.
        </p>
        <input
          value={codigo}
          onChange={e => setCodigo(formatarCodigo(e.target.value))}
          onKeyDown={e => { if (e.key === 'Enter') conferir(codigo) }}
          className="w-full px-3 py-3 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', letterSpacing: '0.08em' }}
          placeholder="XXXX-XXXX-XXXX"
        />
        <button type="button" onClick={() => conferir(codigo)}
          className="mt-3 w-full py-3 rounded-xl font-bold text-white"
          style={{ background: '#0d9488' }}>
          {loading ? 'Consultando…' : 'Conferir'}
        </button>
        {erro && <p className="mt-3" style={{ color: '#f87171', fontSize: 13 }}>{erro}</p>}
        {reg && (
          <div className="mt-5 space-y-2" style={{ fontSize: 13 }}>
            <p className="font-bold" style={{ color: reg.status === 'completo' ? '#34d399' : '#fbbf24' }}>
              {rotuloStatusAssinatura(reg.status)}
            </p>
            <p style={{ color: '#94a3b8' }}>Código <span className="text-white">{formatarCodigo(reg.codigo)}</span></p>
            <p style={{ color: '#94a3b8' }}>Documento <span className="text-white">{reg.titulo || '—'}</span></p>
            <p style={{ color: '#94a3b8' }}>Contratante <span className="text-white">{reg.contratanteNome || '—'}</span></p>
            <p style={{ color: '#94a3b8' }}>Contratado <span className="text-white">{reg.contratadoNome || '—'}</span></p>
            <p style={{ color: '#94a3b8' }}>CPF <span className="text-white">{reg.contratadoCpfMask || '—'}</span></p>
            <p style={{ color: '#94a3b8' }}>Hash <span className="text-white">{hashCurto(reg.hash) || '—'}</span></p>
          </div>
        )}
      </div>
    </div>
  )
}
