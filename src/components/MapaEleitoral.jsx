/* ─────────────────────────────────────────────────────────────
   MapaEleitoral.jsx — Mapa eleitoral de Blumenau
   Camadas: votos por bairro (choropleth), eleitores, seções
   sem voto, igrejas AD e outras denominações
───────────────────────────────────────────────────────────── */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, Marker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  BarChart2, Plus, X, Church, Users, Layers, Pencil,
  Trash2, ChevronDown, ChevronUp, AlertTriangle, Info,
  Vote, CheckCircle, Map,
} from 'lucide-react'
import { BAIRROS_BLUMENAU, COLEGIO_BAIRRO, ELEITORES_POR_BAIRRO, normStr } from '../utils/constants'
import { IGREJAS_BASE, DENOMINACOES, COR_DENOMINACAO, MAX_ID_BASE } from './MapaIgrejas'
import { confirmAction } from '../utils/confirm'

/* ── Constantes ─────────────────────────────────────────── */
const STORAGE_KEY = 'mapa_eleitoral_secoes'
const BLUMENAU    = [-26.9194, -49.0661]

const SETOR_BAIRRO = {
  'Sede':             'Victor Konder',
  'Garcia':           'Garcia',
  'Badenfurt':        'Badenfurt',
  'Fortaleza':        'Fortaleza',
  'Escola Agrícola':  'Escola Agrícola',
  'Velha Central':    'Velha Central',
  'Itoupava Central': 'Itoupava Central',
  'Betânia':          'Ponta Aguda',
  'Nova Jerusalém':   'Fidélis',
  'Betesda':          'Itoupava Central',
  'Velha Grande':     'Velha Grande',
  'Progresso':        'Progresso',
  'Jerusalém':        'Água Verde',
  'Araranguá':        'Garcia',
  'Itoupava Norte':   'Itoupava Norte',
  'Morell':           'Testo Salto',
  'Vila Itoupava':    'Vila Itoupava',
  'Moriá':            'Fortaleza Alta',
  'Água Verde':       'Água Verde',
  'América do Sol':   'Vila Nova',
  'Missões':          'Centro',
  'Cidade Jardim':    'Velha',
  'Pérola do Vale':   'Salto Weissbach',
  'Ristow':           'Escola Agrícola',
  'Jordão':           'Itoupava Seca',
  'Pedro Krauss':     'Itoupavazinha',
  'Itoupavazinha':    'Itoupavazinha',
  'Pôr do Sol':       'Ribeirão Fresco',
  'Monte Hermom':     'Progresso',
  'Nova Esperança':   'Nova Esperança',
  'Frederico Jensen': 'Salto',
  'Via Moinho':       'Escola Agrícola',
}

function pctColor(pct) {
  if (pct === undefined || pct === null) return '#1a1a2e'
  if (pct === 0)   return '#7f1d1d'
  if (pct < 1)     return '#134e4a'
  if (pct < 2)     return '#065f46'
  if (pct < 4)     return '#047857'
  if (pct < 7)     return '#059669'
  if (pct < 10)    return '#10b981'
  return '#34d399'
}

const TOTAL_ELEITORES_BLUMENAU = Object.values(ELEITORES_POR_BAIRRO).reduce((s, v) => s + v, 0)

function votosColor(v) {
  if (!v || v === 0) return '#7f1d1d'
  if (v <   5) return '#1e3a8a'
  if (v <  15) return '#1d4ed8'
  if (v <  30) return '#2563eb'
  if (v <  60) return '#3b82f6'
  if (v < 100) return '#60a5fa'
  return '#93c5fd'
}

function inferBairro(nome) {
  const n = normStr(nome)
  const sorted = [...BAIRROS_BLUMENAU].sort((a, b) => b.length - a.length)
  for (const b of sorted) {
    if (n.includes(normStr(b))) return b
  }
  return null
}
const _colegioNorms = Object.entries(COLEGIO_BAIRRO).map(([k, v]) => ({ n: normStr(k), b: v }))
function resolveBairro(setor, nome) {
  if (SETOR_BAIRRO[setor]) return SETOR_BAIRRO[setor]
  if (setor && BAIRROS_BLUMENAU.includes(setor)) return setor
  const nN = normStr(nome)
  const hit = _colegioNorms.find(x => x.n === nN)
  if (hit) return hit.b
  return inferBairro(nome)
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }

function getCentroid(feature) {
  const coords  = feature.geometry.coordinates
  const isMulti = feature.geometry.type === 'MultiPolygon'
  const ring    = isMulti ? coords[0][0] : coords[0]
  const lats    = ring.map(p => p[1])
  const lngs    = ring.map(p => p[0])
  return [
    (Math.min(...lats) + Math.max(...lats)) / 2,
    (Math.min(...lngs) + Math.max(...lngs)) / 2,
  ]
}

function nomeIcon(nome) {
  return L.divIcon({
    html: `<div style="background:rgba(7,10,18,0.82);color:#e2e8ff;font-size:9px;font-weight:800;padding:2px 7px;border-radius:6px;white-space:nowrap;border:1px solid rgba(255,255,255,0.22);pointer-events:none;letter-spacing:0.03em;text-shadow:0 1px 3px rgba(0,0,0,0.9);backdrop-filter:blur(4px)">${nome}</div>`,
    className: '',
    iconSize:   [0, 0],
    iconAnchor: [Math.max(nome.length * 3.8, 30), 8],
  })
}

const FORM_VAZIO = {
  bairro: BAIRROS_BLUMENAU[0], colegio: '', secao: '', totalEleitores: '', votosObtidos: '',
}

const DENOMINACOES_OUTRAS = DENOMINACOES.filter(d => d !== 'Assembleia de Deus')

/* ══════════════════════════════════════════════════════════ */
export default function MapaEleitoral() {
  const [secoes,     setSecoes]     = useState(() => JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'))
  const [geoData,    setGeoData]    = useState(null)
  const [modal,      setModal]      = useState(null)   // null | 'novo' | id
  const [form,       setForm]       = useState(FORM_VAZIO)
  const [layers,     setLayers]     = useState({ nomes: true, votos: true, eleitores: false, semVoto: true, igrejasAD: true, igrejasOutras: true })
  const [colorBy,    setColorBy]    = useState('pct')   // 'pct' | 'votos'
  const [bairroSel,  setBairroSel]  = useState(null)   // nome do bairro clicado
  const [ranking,    setRanking]    = useState('pct')   // 'votos' | 'pct'
  const [panelOpen,  setPanelOpen]  = useState(true)

  /* ── Dados do TRE (aba Eleitores) ───────────────────────────── */
  const [dadosEleitores, setDadosEleitores] = useState(null)
  useEffect(() => {
    try { setDadosEleitores(JSON.parse(localStorage.getItem('eleitores_data') || 'null')) } catch {}
  }, [])

  const secoesFromEleitores = useMemo(() => {
    if (!dadosEleitores?.zonas) return []
    return dadosEleitores.zonas.flatMap(z =>
      z.locais.flatMap(l => {
        const bairro = resolveBairro(l.setor, l.nome)
        return l.secoes.map(s => ({
          id: `e-${l.id}-${s.secao}`, bairro,
          colegio: l.nome, secao: String(s.secao),
          totalEleitores: 0, votosObtidos: s.votos,
          zona: z.zona, semSetor: !l.setor,
        }))
      })
    )
  }, [dadosEleitores])

  const locaisSemSetor = useMemo(() => {
    if (!dadosEleitores?.zonas) return []
    return dadosEleitores.zonas.flatMap(z => z.locais)
      .filter(l => !resolveBairro(l.setor, l.nome))
  }, [dadosEleitores])

  const todasSecoes = useMemo(() => [
    ...secoesFromEleitores.filter(s => s.bairro),
    ...secoes,
  ], [secoesFromEleitores, secoes])

  /* ── Igrejas: base AD + customizadas do Mapa de Visitas ──────── */
  const { igrejasAD, igrejasOutras } = useMemo(() => {
    const coords  = JSON.parse(localStorage.getItem('geo_coords_igrejas') || '{}')
    const visitas = JSON.parse(localStorage.getItem('igrejas_visitas')   || '{}')
    const custom  = JSON.parse(localStorage.getItem('igrejas_custom')    || '[]')
    const base = IGREJAS_BASE.map(ig => ({
      ...ig, denominacao: 'Assembleia de Deus', visitado: !!visitas[ig.id],
      lat: coords[ig.id]?.lat ?? ig.lat, lng: coords[ig.id]?.lng ?? ig.lng,
    }))
    const extras = custom.map(ig => ({
      ...ig, visitado: !!visitas[ig.id],
      lat: coords[ig.id]?.lat ?? ig.lat, lng: coords[ig.id]?.lng ?? ig.lng,
    }))
    return {
      igrejasAD:     [...base, ...extras.filter(ig => !ig.denominacao || ig.denominacao === 'Assembleia de Deus')],
      igrejasOutras: extras.filter(ig => ig.denominacao && ig.denominacao !== 'Assembleia de Deus'),
    }
  }, [])

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(secoes)) }, [secoes])

  useEffect(() => {
    fetch('/bairros.geojson').then(r => r.json()).then(setGeoData).catch(() => {})
  }, [])

  /* ── Computed: resumo por bairro ────────────────────────── */
  const resumo = useMemo(() => {
    const map = {}
    BAIRROS_BLUMENAU.forEach(b => {
      map[b] = { bairro: b, totalEleitores: ELEITORES_POR_BAIRRO[b] || 0, votosObtidos: 0, secoes: 0, semVoto: 0 }
    })
    todasSecoes.forEach(s => {
      if (!map[s.bairro]) map[s.bairro] = { bairro: s.bairro, totalEleitores: ELEITORES_POR_BAIRRO[s.bairro] || 0, votosObtidos: 0, secoes: 0, semVoto: 0 }
      const r = map[s.bairro]
      r.votosObtidos += Number(s.votosObtidos) || 0
      r.secoes       += 1
      if (!(Number(s.votosObtidos) > 0)) r.semVoto += 1
    })
    Object.values(map).forEach(r => {
      r.pct = r.totalEleitores > 0 ? (r.votosObtidos / r.totalEleitores * 100) : null
    })
    return map
  }, [todasSecoes])

  const totais = useMemo(() => {
    const eleitores = TOTAL_ELEITORES_BLUMENAU
    const votos     = dadosEleitores?.votosTotal || Object.values(resumo).reduce((s, r) => s + r.votosObtidos, 0)
    const semVoto   = todasSecoes.filter(s => !(Number(s.votosObtidos) > 0)).length
    return {
      eleitores, votos,
      pct: eleitores > 0 ? (votos / eleitores * 100) : 0,
      semVoto,
      totalSecoes: secoesFromEleitores.length + secoes.length,
      fonte: dadosEleitores ? (dadosEleitores.candidato || 'TRE') : null,
    }
  }, [resumo, todasSecoes, secoesFromEleitores, secoes, dadosEleitores])

  /* Igrejas AD e outras por bairro */
  const igrejasADpBairro = useMemo(() => {
    const map = {}
    igrejasAD.forEach(ig => {
      const bairro = resolveBairro(ig.setor, ig.nome || '')
      if (!bairro) return
      if (!map[bairro]) map[bairro] = 0
      map[bairro]++
    })
    return map
  }, [igrejasAD])

  const igrejasOutrasPorBairro = useMemo(() => {
    const map = {}
    igrejasOutras.forEach(ig => {
      const bairro = resolveBairro(ig.setor, ig.nome || '')
      if (!bairro) return
      if (!map[bairro]) map[bairro] = 0
      map[bairro]++
    })
    return map
  }, [igrejasOutras])

  const rankingList = useMemo(() => {
    return Object.values(resumo)
      .filter(r => r.secoes > 0)
      .sort((a, b) => {
        if (ranking === 'votos')     return b.votosObtidos - a.votosObtidos
        if (ranking === 'pct')       return (b.pct || 0) - (a.pct || 0)
        if (ranking === 'eleitores') return b.totalEleitores - a.totalEleitores
        return 0
      })
  }, [resumo, ranking])

  /* ── GeoJSON style + interaction ─────────────────────────── */
  const geoStyle = useCallback((feature) => {
    const nome = feature.properties.name
    const r    = resumo[nome]
    const hasData = r && r.secoes > 0
    const isSel   = bairroSel === nome
    if (!layers.votos) {
      return {
        fillColor:   'transparent',
        fillOpacity: 0,
        color:       isSel ? '#fbbf24' : 'rgba(255,255,255,0.45)',
        weight:      isSel ? 2.5 : 1.5,
      }
    }
    const fillColor = hasData
      ? (colorBy === 'pct' ? pctColor(r.pct) : votosColor(r.votosObtidos))
      : 'rgba(255,255,255,0.04)'
    return {
      fillColor,
      fillOpacity: hasData ? 0.72 : 0.12,
      color:       isSel ? '#fbbf24' : 'rgba(255,255,255,0.42)',
      weight:      isSel ? 2.5 : 1.5,
    }
  }, [resumo, bairroSel, layers.votos, colorBy])

  const onEachFeature = useCallback((feature, layer) => {
    const nome   = feature.properties.name
    const r      = resumo[nome]
    const ad     = igrejasADpBairro[nome] || 0
    const outras = igrejasOutrasPorBairro[nome] || 0
    layer.on({
      click: () => setBairroSel(prev => prev === nome ? null : nome),
      mouseover: e => {
        e.target.setStyle({ fillOpacity: 0.92, weight: 2.5, color: 'rgba(255,255,255,0.7)' })
        const rows = r && r.secoes > 0 ? `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;margin-top:8px">
            <div style="text-align:center">
              <div style="font-size:16px;font-weight:900;color:#93c5fd">${r.votosObtidos}</div>
              <div style="font-size:9px;color:rgba(203,213,235,0.45);text-transform:uppercase;letter-spacing:.04em">Votos</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:16px;font-weight:900;color:#8b5cf6">${r.totalEleitores > 0 ? r.totalEleitores : '—'}</div>
              <div style="font-size:9px;color:rgba(203,213,235,0.45);text-transform:uppercase;letter-spacing:.04em">Eleitores</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:16px;font-weight:900;color:#2563eb">${ad}</div>
              <div style="font-size:9px;color:rgba(203,213,235,0.45);text-transform:uppercase;letter-spacing:.04em">Igrejas AD</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:16px;font-weight:900;color:#8b5cf6">${outras}</div>
              <div style="font-size:9px;color:rgba(203,213,235,0.45);text-transform:uppercase;letter-spacing:.04em">Outras igr.</div>
            </div>
          </div>
          ${r.pct != null ? `<div style="margin-top:8px;padding:4px 8px;border-radius:8px;background:rgba(251,191,36,0.12);text-align:center;font-size:10px;font-weight:700;color:#fbbf24">Penetração: ${r.pct.toFixed(2)}%</div>` : ''}
          ${r.semVoto > 0 ? `<div style="margin-top:6px;font-size:10px;color:#f87171;text-align:center">⚠ ${r.semVoto} seção(ões) sem voto</div>` : ''}
        ` : `<div style="margin-top:8px;font-size:11px;color:rgba(203,213,235,0.35);text-align:center">${ad > 0 ? `${ad} igr. AD` : 'Sem dados eleitorais'}</div>`
        layer.bindTooltip(`
          <div style="background:#0d111c;border:1px solid rgba(255,255,255,0.13);border-radius:12px;padding:10px 14px;font-family:Inter,sans-serif;min-width:170px">
            <div style="font-weight:900;color:#fff;font-size:14px">${nome}</div>
            ${rows}
          </div>
        `, { sticky: true, opacity: 1, className: '' }).openTooltip()
      },
      mouseout: e => {
        e.target.setStyle(geoStyle(feature))
        layer.unbindTooltip()
      },
    })
  }, [resumo, geoStyle, igrejasADpBairro, igrejasOutrasPorBairro])

  /* ── Form helpers ────────────────────────────────────────── */
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }))

  function abrirNovo() { setForm(FORM_VAZIO); setModal('novo') }
  function abrirEditar(s) { setForm({ ...s }); setModal(s.id) }

  function salvar() {
    if (!form.bairro || !form.colegio.trim() || !form.secao.trim()) return
    if (modal === 'novo') {
      setSecoes(p => [...p, { ...form, id: uid() }])
    } else {
      setSecoes(p => p.map(s => s.id === modal ? { ...form } : s))
    }
    setModal(null)
  }

  async function excluir(id) {
    const s = secoes.find(s => s.id === id)
    const ok = await confirmAction({ title: 'Excluir seção', message: `Excluir seção ${s?.secao} — ${s?.colegio}?` })
    if (ok) setSecoes(p => p.filter(s => s.id !== id))
  }

  /* Bairro selecionado detail */
  const bairroDetail      = bairroSel ? resumo[bairroSel] : null
  const secoesNoBairroSel = bairroSel ? todasSecoes.filter(s => s.bairro === bairroSel) : []

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div className="flex-1 relative overflow-hidden" style={{ background: '#070a12' }}>

      {/* ── Mapa full screen ─────────────────────────────── */}
      {geoData ? (
        <MapContainer center={BLUMENAU} zoom={12} style={{ width: '100%', height: '100%' }} zoomControl={false}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com">CARTO</a>'
            maxZoom={19}
          />
          <GeoJSON
            key={JSON.stringify(resumo) + bairroSel + layers.votos + colorBy}
            data={geoData}
            style={geoStyle}
            onEachFeature={onEachFeature}
          />
          {layers.nomes && geoData.features.map(feature => {
            const nome = feature.properties.name
            const centroid = getCentroid(feature)
            return <Marker key={`nome-${nome}`} position={centroid} icon={nomeIcon(nome)} interactive={false} zIndexOffset={500} />
          })}
        </MapContainer>
      ) : (
        <div className="flex items-center justify-center h-full" style={{ color: 'rgba(203,213,235,0.4)', fontSize: 13 }}>
          Carregando mapa...
        </div>
      )}

      {/* ── Barra superior flutuante ──────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-[1000] flex items-center gap-2.5 px-4 py-2.5"
        style={{ background: 'rgba(7,10,18,0.90)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Vote size={14} style={{ color: '#3b82f6' }} />
          <span className="font-bold text-white" style={{ fontSize: 13 }}>Mapa Eleitoral</span>
          {totais.fonte && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ background: 'rgba(16,185,129,0.13)', border: '1px solid rgba(16,185,129,0.3)', fontSize: 9, color: '#34d399', fontWeight: 700 }}>
              <CheckCircle size={8} /> TRE · {totais.fonte}
            </span>
          )}
        </div>
        <div className="h-4 w-px flex-shrink-0" style={{ background: 'rgba(255,255,255,0.12)' }} />
        <div className="flex items-center gap-2 flex-1 overflow-x-auto">
          {[
            { label: 'Votos',     value: totais.votos.toLocaleString('pt-BR'),                                  color: '#60a5fa' },
            { label: 'Eleitores', value: totais.eleitores > 0 ? totais.eleitores.toLocaleString('pt-BR') : '—', color: '#a78bfa' },
            { label: 'Penetr.',   value: totais.pct > 0 ? `${totais.pct.toFixed(1)}%` : '—',                   color: '#22d3ee' },
            { label: 'Seções',    value: totais.totalSecoes,                                                    color: '#fbbf24' },
            { label: 'Igrejas AD',value: igrejasAD.length,                                                     color: '#93c5fd' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.09)' }}>
              <span className="font-bold" style={{ fontSize: 12, color }}>{value}</span>
              <span style={{ fontSize: 9, color: 'rgba(203,213,235,0.4)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
            </div>
          ))}
        </div>
        {totais.semVoto > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-xl flex-shrink-0"
            style={{ background: 'rgba(239,68,68,0.13)', border: '1px solid rgba(239,68,68,0.3)', fontSize: 10, color: '#f87171', fontWeight: 600 }}>
            <AlertTriangle size={9} /> {totais.semVoto} sem voto
          </div>
        )}
        {locaisSemSetor.length > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-xl flex-shrink-0"
            style={{ background: 'rgba(245,158,11,0.13)', border: '1px solid rgba(245,158,11,0.3)', fontSize: 10, color: '#fbbf24', fontWeight: 600 }}>
            <AlertTriangle size={9} /> {locaisSemSetor.length} sem setor
          </div>
        )}
        {!dadosEleitores && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-xl flex-shrink-0"
            style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)', fontSize: 10, color: '#fbbf24' }}>
            Importe PDF na aba <b className="ml-1">Eleitores</b>
          </div>
        )}
        <button onClick={() => setPanelOpen(p => !p)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl flex-shrink-0 transition-all"
          style={{ background: panelOpen ? 'rgba(37,99,235,0.25)' : 'rgba(255,255,255,0.08)', border: `1px solid ${panelOpen ? 'rgba(37,99,235,0.5)' : 'rgba(255,255,255,0.12)'}`, fontSize: 11, color: '#fff', fontWeight: 600 }}>
          <Layers size={12} /> Camadas
        </button>
        <button onClick={abrirNovo}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-bold text-white flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', fontSize: 11, boxShadow: '0 2px 10px rgba(29,78,216,0.4)' }}>
          <Plus size={12} /> Seção
        </button>
      </div>

      {/* ── Camadas dropdown ──────────────────────────────── */}
      {panelOpen && (
        <div className="absolute z-[1000] rounded-2xl overflow-hidden"
          style={{ top: 52, right: 16, minWidth: 210, background: 'rgba(13,17,28,0.97)', border: '1px solid rgba(255,255,255,0.11)', backdropFilter: 'blur(14px)', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
          <div className="px-3 pt-3 pb-2">
            <p className="font-bold text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(203,213,235,0.4)' }}>Camadas</p>
            <div className="space-y-1">
              {[
                { key: 'nomes', label: 'Nomes dos bairros', color: '#e2e8ff', icon: '🏷' },
                { key: 'votos', label: 'Colorir bairros',   color: '#3b82f6', icon: '🗺' },
              ].map(({ key, label, color, icon }) => {
                const on = layers[key]
                return (
                  <button key={key} type="button"
                    onClick={() => setLayers(p => ({ ...p, [key]: !p[key] }))}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl transition-all"
                    style={{ background: on ? `${color}18` : 'rgba(255,255,255,0.04)', border: `1px solid ${on ? color + '35' : 'rgba(255,255,255,0.07)'}` }}>
                    <span style={{ fontSize: 11 }}>{icon}</span>
                    <span className="flex-1 text-left font-semibold" style={{ fontSize: 11, color: on ? '#fff' : 'rgba(203,213,235,0.5)' }}>{label}</span>
                    <div className="w-3.5 h-3.5 rounded flex items-center justify-center"
                      style={{ background: on ? color : 'transparent', border: `1.5px solid ${on ? color : 'rgba(255,255,255,0.2)'}` }}>
                      {on && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />}
                    </div>
                  </button>
                )
              })}
              {layers.votos && (
                <div className="flex gap-1 mt-1">
                  {[{ v: 'pct', label: 'Penetração %', color: '#10b981' }, { v: 'votos', label: 'Votos', color: '#3b82f6' }].map(({ v, label, color }) => (
                    <button key={v} onClick={() => setColorBy(v)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
                      style={{
                        background: colorBy === v ? `${color}28` : 'rgba(255,255,255,0.04)',
                        color: colorBy === v ? color : 'rgba(203,213,235,0.35)',
                        border: `1px solid ${colorBy === v ? color + '55' : 'rgba(255,255,255,0.07)'}`,
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {layers.votos && colorBy === 'votos' && (
            <div className="px-3 pb-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 10 }}>
              <p className="font-bold text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(203,213,235,0.4)' }}>Legenda — Votos</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {[
                  { cor: 'rgba(255,255,255,0.07)', label: 'Sem dados' },
                  { cor: '#7f1d1d', label: '0 votos' },
                  { cor: '#1e3a8a', label: '1–4' },
                  { cor: '#1d4ed8', label: '5–14' },
                  { cor: '#2563eb', label: '15–29' },
                  { cor: '#3b82f6', label: '30–59' },
                  { cor: '#60a5fa', label: '60–99' },
                  { cor: '#93c5fd', label: '100+' },
                ].map(({ cor, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: cor }} />
                    <span style={{ fontSize: 9.5, color: 'rgba(203,213,235,0.55)' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {layers.votos && colorBy === 'pct' && (
            <div className="px-3 pb-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 10 }}>
              <p className="font-bold text-xs uppercase tracking-widest mb-2" style={{ color: 'rgba(203,213,235,0.4)' }}>Legenda — Penetração</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {[
                  { cor: 'rgba(255,255,255,0.07)', label: 'Sem dados' },
                  { cor: '#7f1d1d', label: '0%' },
                  { cor: '#134e4a', label: '<1%' },
                  { cor: '#065f46', label: '1–2%' },
                  { cor: '#047857', label: '2–4%' },
                  { cor: '#059669', label: '4–7%' },
                  { cor: '#10b981', label: '7–10%' },
                  { cor: '#34d399', label: '10%+' },
                ].map(({ cor, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: cor }} />
                    <span style={{ fontSize: 9.5, color: 'rgba(203,213,235,0.55)' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {rankingList.length > 0 && (
            <div className="px-3 pb-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 10, maxHeight: 200, overflowY: 'auto' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-xs uppercase tracking-widest" style={{ color: 'rgba(203,213,235,0.4)' }}>Ranking</p>
                <select value={ranking} onChange={e => setRanking(e.target.value)}
                  className="bg-transparent text-xs font-semibold outline-none"
                  style={{ color: '#5b9bff', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 6, padding: '1px 4px' }}>
                  <option value="votos">Votos</option>
                  <option value="pct">Penetração</option>
                  <option value="eleitores">Eleitores</option>
                </select>
              </div>
              <div className="space-y-0.5">
                {rankingList.slice(0, 8).map((r, i) => {
                  const val = ranking === 'votos' ? r.votosObtidos : ranking === 'pct' ? (r.pct != null ? r.pct.toFixed(2) + '%' : '—') : r.totalEleitores
                  const numVal = ranking === 'pct' ? (r.pct || 0) : (ranking === 'votos' ? r.votosObtidos : r.totalEleitores)
                  const max = ranking === 'pct' ? (rankingList[0]?.pct || 1) : (ranking === 'votos' ? rankingList[0]?.votosObtidos : rankingList[0]?.totalEleitores)
                  const barPct = max > 0 ? numVal / max * 100 : 0
                  return (
                    <button key={r.bairro} onClick={() => { setBairroSel(r.bairro); setPanelOpen(false) }}
                      className="w-full flex items-center gap-2 px-1.5 py-1 rounded-lg"
                      style={{ background: bairroSel === r.bairro ? 'rgba(37,99,235,0.2)' : 'transparent' }}>
                      <span style={{ fontSize: 9, color: 'rgba(203,213,235,0.3)', width: 12, textAlign: 'right', flexShrink: 0 }}>{i+1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between mb-0.5">
                          <span className="truncate font-semibold" style={{ fontSize: 10, color: '#e2e8f0' }}>{r.bairro}</span>
                          <span style={{ fontSize: 10, color: '#5b9bff', fontWeight: 700, flexShrink: 0 }}>{val}</span>
                        </div>
                        <div className="w-full rounded-full overflow-hidden" style={{ height: 2.5, background: 'rgba(255,255,255,0.07)' }}>
                          <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: '#2563eb' }} />
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Card bairro selecionado (flutuante esquerda) ─── */}
      {bairroSel && bairroDetail && (
        <div className="absolute z-[1000] w-60 rounded-2xl overflow-hidden"
          style={{ top: 52, left: 16, background: 'rgba(13,17,28,0.97)', border: '1px solid rgba(37,99,235,0.35)', backdropFilter: 'blur(14px)', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
          <div className="flex items-center justify-between px-4 py-3"
            style={{ background: 'linear-gradient(135deg,rgba(29,78,216,0.55),rgba(30,64,175,0.55))', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="font-black text-white truncate" style={{ fontSize: 13 }}>{bairroSel}</span>
            <button onClick={() => setBairroSel(null)} className="p-1 rounded-lg flex-shrink-0 ml-2"
              style={{ background: 'rgba(255,255,255,0.12)' }}>
              <X size={11} style={{ color: 'rgba(203,213,235,0.7)' }} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 px-3 py-3">
            {[
              { label: 'Votos',      value: bairroDetail.votosObtidos,                              color: '#60a5fa' },
              { label: 'Eleitores',  value: (bairroDetail.totalEleitores || 0).toLocaleString('pt-BR'),  color: '#a78bfa' },
              { label: 'Penetração', value: bairroDetail.pct != null ? bairroDetail.pct.toFixed(2) + '%' : '—', color: '#10b981' },
              { label: 'Seções',     value: bairroDetail.secoes,                                    color: '#22d3ee' },
              { label: 'Sem voto',   value: bairroDetail.semVoto, color: bairroDetail.semVoto > 0 ? '#f87171' : '#34d399' },
              { label: 'Igrejas AD', value: igrejasADpBairro[bairroSel] || 0,                      color: '#93c5fd' },
              { label: 'Outras igr.',value: igrejasOutrasPorBairro[bairroSel] || 0,                 color: '#c4b5fd' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl px-2 py-2 text-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <p className="font-bold" style={{ fontSize: 15, color }}>{value}</p>
                <p style={{ fontSize: 8.5, color: 'rgba(203,213,235,0.4)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
              </div>
            ))}
          </div>
          {secoesNoBairroSel.length > 0 && (
            <div className="px-3 pb-3 space-y-1"
              style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 8, maxHeight: 220, overflowY: 'auto' }}>
              <p className="font-bold text-xs uppercase tracking-widest mb-1.5" style={{ color: 'rgba(203,213,235,0.3)' }}>Seções</p>
              {secoesNoBairroSel.slice(0, 15).map(s => (
                <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                  style={{ background: Number(s.votosObtidos) > 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${Number(s.votosObtidos) > 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 10, color: '#fff', fontWeight: 700 }}>Seção {s.secao}</p>
                    <p style={{ fontSize: 8.5, color: 'rgba(203,213,235,0.4)' }} className="truncate">{s.colegio}</p>
                    {s.zona && <p style={{ fontSize: 8, color: 'rgba(203,213,235,0.27)' }}>Zona {s.zona}</p>}
                  </div>
                  <p style={{ fontSize: 13, color: Number(s.votosObtidos) > 0 ? '#34d399' : '#f87171', fontWeight: 800, flexShrink: 0 }}>{s.votosObtidos || 0}</p>
                  {!String(s.id).startsWith('e-') && (
                    <div className="flex gap-0.5 flex-shrink-0">
                      <button onClick={() => abrirEditar(s)} className="p-0.5 rounded hov-srf">
                        <Pencil size={9} style={{ color: 'rgba(203,213,235,0.5)' }} />
                      </button>
                      <button onClick={() => excluir(s.id)} className="p-0.5 rounded">
                        <Trash2 size={9} style={{ color: '#f87171' }} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {secoesNoBairroSel.length > 15 && (
                <p style={{ fontSize: 9, color: 'rgba(203,213,235,0.3)', textAlign: 'center', paddingTop: 4 }}>
                  +{secoesNoBairroSel.length - 15} seções
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Modal: Adicionar / Editar seção ─────────────────── */}
      {modal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(7,10,18,0.75)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-md rounded-3xl overflow-hidden"
            style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>

            <div className="flex items-center justify-between px-6 py-4"
              style={{ background: 'linear-gradient(135deg,#1e3a8a,#1e40af)' }}>
              <div className="flex items-center gap-3">
                <Vote size={16} className="text-white" />
                <h3 className="font-bold text-white" style={{ fontSize: 15 }}>
                  {modal === 'novo' ? 'Nova Seção Eleitoral' : 'Editar Seção'}
                </h3>
              </div>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                <X size={16} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Bairro */}
              <div>
                <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Bairro *</label>
                <select value={form.bairro} onChange={e => upd('bairro', e.target.value)}
                  className="input-dark w-full px-3 py-2" style={{ fontSize: 13, background: 'var(--bg-raised)' }}>
                  {BAIRROS_BLUMENAU.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              {/* Colégio eleitoral */}
              <div>
                <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Colégio eleitoral *</label>
                <input value={form.colegio} onChange={e => upd('colegio', e.target.value)}
                  placeholder="Ex: EEB Adolfo Konder" className="input-dark w-full px-3 py-2" style={{ fontSize: 13 }} />
              </div>

              {/* Seção */}
              <div>
                <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Número da seção *</label>
                <input value={form.secao} onChange={e => upd('secao', e.target.value)}
                  placeholder="Ex: 0001" className="input-dark w-full px-3 py-2" style={{ fontSize: 13 }} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Total de eleitores</label>
                  <input type="number" min="0" value={form.totalEleitores} onChange={e => upd('totalEleitores', e.target.value)}
                    placeholder="0" className="input-dark w-full px-3 py-2" style={{ fontSize: 13 }} />
                </div>
                <div>
                  <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Votos obtidos</label>
                  <input type="number" min="0" value={form.votosObtidos} onChange={e => upd('votosObtidos', e.target.value)}
                    placeholder="0" className="input-dark w-full px-3 py-2" style={{ fontSize: 13 }} />
                </div>
              </div>

              {/* Resumo */}
              {form.totalEleitores > 0 && form.votosObtidos >= 0 && (
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl"
                  style={{ background: Number(form.votosObtidos) > 0 ? 'rgba(16,185,129,0.09)' : 'rgba(239,68,68,0.09)', border: `1px solid ${Number(form.votosObtidos) > 0 ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
                  {Number(form.votosObtidos) > 0
                    ? <CheckCircle size={14} color="#34d399" />
                    : <AlertTriangle size={14} color="#f87171" />}
                  <span style={{ fontSize: 12, color: Number(form.votosObtidos) > 0 ? '#6ee7b7' : '#f87171' }}>
                    {Number(form.votosObtidos) > 0
                      ? `Penetração: ${(Number(form.votosObtidos) / Number(form.totalEleitores) * 100).toFixed(2)}%`
                      : 'Seção sem voto — será destacada no mapa'
                    }
                  </span>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => setModal(null)}
                  className="px-5 py-2.5 rounded-2xl font-semibold text-sm"
                  style={{ border: '1px solid var(--border-soft)', color: 'var(--text-secondary)' }}>
                  Cancelar
                </button>
                <button onClick={salvar} disabled={!form.bairro || !form.colegio.trim() || !form.secao.trim()}
                  className="flex-1 py-2.5 rounded-2xl font-bold text-white text-sm disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)', boxShadow: '0 4px 14px rgba(29,78,216,0.35)' }}>
                  Salvar Seção
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
