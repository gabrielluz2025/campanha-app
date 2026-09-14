import { useCallback, useEffect, useState } from 'react'
import { X, Loader2, MapPin } from 'lucide-react'
import { buscarDadosPorCep, geocodificarFormularioIgreja } from '../utils/geoServices'

const INPUT =
  'w-full rounded-lg px-3 py-2 text-sm bg-black/25 border border-white/10 focus:border-indigo-400/50 outline-none'

export default function CampoNovaIgrejaModal({ open, onClose, onSave, busy }) {
  const [nome, setNome] = useState('')
  const [setor, setSetor] = useState('')
  const [cep, setCep] = useState('')
  const [endereco, setEndereco] = useState('')
  const [numero, setNumero] = useState('')
  const [bairro, setBairro] = useState('')
  const [geoLoad, setGeoLoad] = useState(false)
  const [geoHint, setGeoHint] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!open) return
    setNome('')
    setSetor('')
    setCep('')
    setEndereco('')
    setNumero('')
    setBairro('')
    setGeoHint('')
    setErro('')
  }, [open])

  const rodarGeocode = useCallback(async (formPartial) => {
    setGeoLoad(true)
    setGeoHint('')
    try {
      const coords = await geocodificarFormularioIgreja(formPartial)
      if (coords?.lat && coords?.lng) {
        setGeoHint(`GPS: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}${coords.aproximado ? ' (aprox.)' : ''}`)
        return coords
      }
      setGeoHint('Não foi possível obter coordenadas — salve e geocodifique depois.')
      return null
    } finally {
      setGeoLoad(false)
    }
  }, [])

  useEffect(() => {
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8) return undefined
    let cancelled = false
    ;(async () => {
      const data = await buscarDadosPorCep(digits)
      if (cancelled || !data || data.erro) return
      if (data.logradouro) setEndereco(data.logradouro)
      if (data.bairro) setBairro(prev => prev || data.bairro)
      if (data.bairro && !setor) setSetor(data.bairro)
      await rodarGeocode({
        cep: digits,
        logradouro: data.logradouro || endereco,
        bairro: data.bairro || bairro,
        setor: setor || data.bairro,
        numero,
        cidade: data.localidade || 'Blumenau',
        uf: data.uf || 'SC',
      })
    })()
    return () => { cancelled = true }
  }, [cep]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e) {
    e.preventDefault()
    setErro('')
    if (!String(nome).trim()) {
      setErro('Informe o nome da igreja.')
      return
    }
    const form = {
      nome: nome.trim(),
      setor: (setor || bairro).trim(),
      cep: cep.replace(/\D/g, ''),
      logradouro: endereco.trim(),
      endereco: [endereco, numero, bairro].filter(Boolean).join(', '),
      numero: numero.trim(),
      bairro: bairro.trim(),
      cidade: 'Blumenau',
      uf: 'SC',
    }
    await onSave(form)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-white/10"
        style={{ background: 'rgba(15,18,28,0.96)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-300/80">Cadastro rápido</p>
            <h2 className="font-black text-lg">Nova igreja</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <label className="block">
            <span className="text-[10px] font-semibold text-white/50 uppercase">Nome *</span>
            <input className={`${INPUT} mt-1`} value={nome} onChange={e => setNome(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold text-white/50 uppercase">Setor / região</span>
            <input className={`${INPUT} mt-1`} value={setor} onChange={e => setSetor(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold text-white/50 uppercase">CEP</span>
            <input className={`${INPUT} mt-1`} value={cep} onChange={e => setCep(e.target.value)} placeholder="89010-000" />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="block col-span-2">
              <span className="text-[10px] font-semibold text-white/50 uppercase">Endereço</span>
              <input className={`${INPUT} mt-1`} value={endereco} onChange={e => setEndereco(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold text-white/50 uppercase">Nº</span>
              <input className={`${INPUT} mt-1`} value={numero} onChange={e => setNumero(e.target.value)} />
            </label>
          </div>
          <label className="block">
            <span className="text-[10px] font-semibold text-white/50 uppercase">Bairro</span>
            <input className={`${INPUT} mt-1`} value={bairro} onChange={e => setBairro(e.target.value)} />
          </label>
          {(geoLoad || geoHint) && (
            <p className="text-xs flex items-center gap-2 text-indigo-200/90">
              {geoLoad ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
              {geoLoad ? 'Geocodificando…' : geoHint}
            </p>
          )}
          {erro && <p className="text-xs text-amber-300">{erro}</p>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-bold hover:bg-white/10">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl text-sm font-black text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)' }}
            >
              {busy ? 'Salvando…' : 'Salvar igreja'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
