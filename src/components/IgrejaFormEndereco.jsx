import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MapPin } from 'lucide-react'
import {
  buscarEnderecoPorCep, formatarCep, montarEnderecoIgreja, mergeCepEmFormIgreja,
} from '../utils/agendaLocal'
import { buscarDadosPorCep, geocodificarFormularioIgreja } from '../utils/geoServices'
import { persistCoordsGeocodeForm } from '../utils/churchVisitMutations'

const inputStyle = {
  width: '100%',
  fontSize: 12,
  padding: '8px 10px',
  borderRadius: 10,
  background: 'rgba(0,0,0,0.25)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'inherit',
  colorScheme: 'dark',
}

const GEO_DEBOUNCE_MS = 750

/**
 * Campos de endereço com busca automática por CEP e geocodificação lat/lng.
 * form: { cep, logradouro, numero, endereco, bairro, setor, cidade, uf, lat?, lng?, gpsManual? }
 */
export default function IgrejaFormEndereco({
  form,
  onChange,
  showSetor = true,
  setoresOpcoes = [],
  compact = false,
  igrejaId = null,
  autoGeocode = true,
}) {
  const [loadingCep, setLoadingCep] = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoHint, setGeoHint] = useState('')
  const reqRef = useRef(0)
  const geoReqRef = useRef(0)
  const geoTimerRef = useRef(null)

  const runGeocode = useCallback(async (snapshot) => {
    if (!autoGeocode) return
    const endereco = montarEnderecoIgreja(snapshot) || String(snapshot.endereco || '').trim()
    if (!endereco || endereco.length < 8) {
      setGeoHint('')
      return
    }
    if (snapshot.gpsManual) {
      setGeoHint('Coordenadas manuais — altere abaixo ou limpe para buscar de novo.')
      return
    }

    const req = ++geoReqRef.current
    setGeoLoading(true)
    setGeoHint('')
    try {
      const geo = await geocodificarFormularioIgreja({ ...snapshot, endereco })
      if (req !== geoReqRef.current) return
      if (!geo) {
        setGeoHint('GPS não encontrado — ajuste o endereço ou informe lat/lng manualmente.')
        return
      }
      const next = {
        ...snapshot,
        endereco,
        lat: geo.lat,
        lng: geo.lng,
        gpsManual: false,
      }
      onChange(next)
      if (igrejaId != null) {
        persistCoordsGeocodeForm(igrejaId, next, geo)
      }
      setGeoHint(
        geo.aproximado
          ? `Pin aproximado: ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}`
          : `GPS ok: ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}`,
      )
    } finally {
      if (req === geoReqRef.current) setGeoLoading(false)
    }
  }, [autoGeocode, igrejaId, onChange])

  const scheduleGeocode = useCallback((snapshot) => {
    if (!autoGeocode) return
    if (geoTimerRef.current) clearTimeout(geoTimerRef.current)
    geoTimerRef.current = setTimeout(() => {
      geoTimerRef.current = null
      runGeocode(snapshot)
    }, GEO_DEBOUNCE_MS)
  }, [autoGeocode, runGeocode])

  useEffect(() => () => {
    if (geoTimerRef.current) clearTimeout(geoTimerRef.current)
  }, [])

  async function handleCep(raw) {
    const cep = formatarCep(raw)
    const base = { ...form, cep }
    onChange(base)
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8) return
    const req = ++reqRef.current
    setLoadingCep(true)
    try {
      let data = await buscarDadosPorCep(digits)
      if (!data || data.erro) {
        data = await buscarEnderecoPorCep(digits)
      } else {
        data = {
          cep: data.cep,
          logradouro: data.logradouro,
          bairro: data.bairro,
          localidade: data.localidade,
          uf: data.uf,
        }
      }
      if (req !== reqRef.current) return
      if (data) {
        const merged = mergeCepEmFormIgreja(base, data)
        onChange(merged)
        scheduleGeocode(merged)
      }
    } finally {
      if (req === reqRef.current) setLoadingCep(false)
    }
  }

  function patch(partial) {
    const next = { ...form, ...partial }
    if ('numero' in partial || 'logradouro' in partial || 'bairro' in partial || 'setor' in partial) {
      next.endereco = montarEnderecoIgreja(next)
    }
    if ('lat' in partial || 'lng' in partial) {
      if (partial.gpsManual !== false) next.gpsManual = true
    }
    onChange(next)
    if (!next.gpsManual) scheduleGeocode(next)
  }

  function patchEnderecoManual(value) {
    const next = { ...form, endereco: value, gpsManual: false }
    onChange(next)
    scheduleGeocode(next)
  }

  const lbl = compact
    ? { fontSize: 10, color: 'var(--text-faint)', marginBottom: 2, display: 'block' }
    : { fontSize: 11, fontWeight: 700, color: 'var(--mrx-muted)', marginBottom: 4, display: 'block' }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span style={lbl}>CEP</span>
          <div className="relative">
            <input
              value={form.cep || ''}
              onChange={e => handleCep(e.target.value)}
              placeholder="00000-000"
              inputMode="numeric"
              style={inputStyle}
            />
            {loadingCep && (
              <Loader2 size={12} className="animate-spin absolute right-2 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-faint)' }} />
            )}
          </div>
        </label>
        <label>
          <span style={lbl}>Número</span>
          <input
            value={form.numero || ''}
            onChange={e => patch({ numero: e.target.value, gpsManual: false })}
            placeholder="Ex.: 890"
            style={inputStyle}
          />
        </label>
      </div>
      <label>
        <span style={lbl}>Rua / logradouro</span>
        <input
          value={form.logradouro || ''}
          onChange={e => patch({ logradouro: e.target.value, gpsManual: false })}
          placeholder="Preenchido automaticamente pelo CEP"
          style={inputStyle}
        />
      </label>
      {showSetor && setoresOpcoes.length > 0 && (
        <label>
          <span style={lbl}>Bairro / setor (opcional)</span>
          <select
            value={form.setor || ''}
            onChange={e => patch({
              setor: e.target.value,
              bairro: e.target.value || form.bairro,
              gpsManual: false,
            })}
            style={inputStyle}
          >
            <option value="">Automático pelo CEP ou escolha…</option>
            {form.setor && !setoresOpcoes.includes(form.setor) && (
              <option value={form.setor}>{form.setor}</option>
            )}
            {setoresOpcoes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      )}
      <label>
        <span style={lbl}>Endereço completo *</span>
        <input
          value={form.endereco || ''}
          onChange={e => patchEnderecoManual(e.target.value)}
          placeholder="Rua, número, bairro — Blumenau/SC"
          style={inputStyle}
        />
      </label>

      {(autoGeocode || form.lat != null || form.lng != null) && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
            {geoLoading ? <Loader2 size={11} className="animate-spin" /> : <MapPin size={11} />}
            <span>
              {geoHint
                || (form.lat != null && form.lng != null && !geoLoading
                  ? `Coordenadas: ${Number(form.lat).toFixed(5)}, ${Number(form.lng).toFixed(5)}`
                  : 'Lat/lng atualizam ao preencher CEP ou endereço')}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span style={lbl}>Latitude (manual)</span>
              <input
                value={form.lat ?? ''}
                onChange={e => patch({ lat: e.target.value })}
                placeholder="-26.91940"
                inputMode="decimal"
                style={inputStyle}
              />
            </label>
            <label>
              <span style={lbl}>Longitude (manual)</span>
              <input
                value={form.lng ?? ''}
                onChange={e => patch({ lng: e.target.value })}
                placeholder="-49.06610"
                inputMode="decimal"
                style={inputStyle}
              />
            </label>
          </div>
          {form.gpsManual && igrejaId != null && (
            <button
              type="button"
              className="text-left underline"
              style={{ fontSize: 10, color: '#93c5fd' }}
              onClick={() => {
                const next = { ...form, gpsManual: false, lat: '', lng: '' }
                onChange(next)
                scheduleGeocode(next)
              }}
            >
              Buscar GPS automático de novo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
