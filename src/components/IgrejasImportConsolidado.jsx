import { useMemo, useRef, useState } from 'react'
import { X, FileSpreadsheet, Loader2, MapPin, Upload, Sparkles, AlertTriangle, GitMerge } from 'lucide-react'
import {
  lerArquivoConsolidadoXlsx,
  resumoImportConsolidado,
  aplicarImportConsolidado,
  enriquecerCepsConsolidado,
} from '../utils/igrejasImportConsolidado'
import {
  classificarLinhasBlumenau,
  resumoClassificacaoBlumenau,
  aplicarImportBlumenauMaps,
  lerArquivoPlanilhaIgrejas,
} from '../utils/igrejasImportBlumenauMaps'
import { loadIgrejasCatalog } from '../utils/igrejasCatalog'

const FILTROS_CONSOLIDADO = [
  { id: 'todas', label: 'Todas' },
  { id: 'com_cep', label: 'Com CEP' },
  { id: 'sem_cep', label: 'Sem CEP' },
]

const FILTROS_BLUMENAU = [
  { id: 'todas', label: 'Todas' },
  { id: 'nova', label: 'Novas' },
  { id: 'enriquecer', label: 'Enriquecer' },
  { id: 'existe', label: 'Já existem' },
  { id: 'sem_cep', label: 'Sem CEP' },
  { id: 'nao_crista', label: 'Não cristãs' },
]

function statusBadge(l) {
  if (l.status === 'nova') return { t: 'Nova', bg: 'rgba(34,197,94,0.18)', c: '#86efac' }
  if (l.status === 'enriquecer') return { t: 'Enriquecer', bg: 'rgba(59,130,246,0.18)', c: '#93c5fd' }
  if (l.status === 'existe') return { t: 'Já existe', bg: 'rgba(148,163,184,0.15)', c: '#94a3b8' }
  return null
}

/** Importação unificada: Consolidado ou Blumenau por Bairro (Google Maps). */
export default function IgrejasImportConsolidado({ aberto, onFechar, onAplicado }) {
  const [linhas, setLinhas] = useState([])
  const [formato, setFormato] = useState('')
  const [arquivo, setArquivo] = useState('')
  const [lendo, setLendo] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [progressoCep, setProgressoCep] = useState({ done: 0, total: 0 })
  const [aplicando, setAplicando] = useState(false)
  const [substituir, setSubstituir] = useState(false)
  const [filtro, setFiltro] = useState('todas')
  const [msg, setMsg] = useState('')
  const [duplicatasRemovidas, setDuplicatasRemovidas] = useState(0)
  const fileRef = useRef(null)
  const abortRef = useRef(null)

  const ehBlumenau = formato === 'blumenau_maps'

  const resumo = useMemo(() => (
    ehBlumenau ? resumoClassificacaoBlumenau(linhas) : resumoImportConsolidado(linhas)
  ), [linhas, ehBlumenau])

  const visiveis = useMemo(() => {
    if (ehBlumenau) {
      if (filtro === 'nova') return linhas.filter(l => l.status === 'nova')
      if (filtro === 'existe') return linhas.filter(l => l.status === 'existe')
      if (filtro === 'enriquecer') return linhas.filter(l => l.status === 'enriquecer')
      if (filtro === 'sem_cep') return linhas.filter(l => l.semCep)
      if (filtro === 'nao_crista') return linhas.filter(l => l.crista === false)
      return linhas
    }
    if (filtro === 'sem_cep') return linhas.filter(l => l.semCep)
    if (filtro === 'com_cep') return linhas.filter(l => !l.semCep)
    return linhas
  }, [linhas, filtro, ehBlumenau])

  const selecionadas = linhas.filter(l => l.selecionada)
  const filtros = ehBlumenau ? FILTROS_BLUMENAU : FILTROS_CONSOLIDADO

  function toggle(key) {
    setLinhas(prev => prev.map(l => l.key === key ? { ...l, selecionada: !l.selecionada } : l))
  }

  function toggleTodas(val) {
    const keys = new Set(visiveis.map(v => v.key))
    setLinhas(prev => prev.map(l => keys.has(l.key) ? { ...l, selecionada: val } : l))
  }

  async function handleArquivo(file) {
    if (!file) return
    setLendo(true)
    setMsg('')
    setFiltro('todas')
    try {
      let parsed
      let fmt = ''
      let dupRem = 0
      try {
        const pack = await lerArquivoPlanilhaIgrejas(file)
        fmt = pack.formato
        parsed = pack.linhas
        dupRem = pack.duplicatasRemovidas || 0
      } catch {
        parsed = await lerArquivoConsolidadoXlsx(file)
        fmt = 'consolidado'
      }

      if (fmt === 'blumenau_maps') {
        const cat = loadIgrejasCatalog()
        parsed = classificarLinhasBlumenau(parsed, cat)
        const r = resumoClassificacaoBlumenau(parsed)
        setDuplicatasRemovidas(dupRem)
        setMsg(
          `Blumenau/Google Maps: ${r.total} igrejas`
          + (dupRem ? ` · ${dupRem} duplicata(s) da planilha unificada` : '')
          + ` · ${r.novas} novas · ${r.existentes} já no cadastro · ${r.enriquecer} para enriquecer`
          + (r.naoCristas ? ` · ${r.naoCristas} filtradas (não cristãs)` : ''),
        )
      } else {
        setDuplicatasRemovidas(0)
        const r = resumoImportConsolidado(parsed)
        setMsg(`Consolidado: ${r.total} igrejas · ${r.comCep} com CEP · ${r.semCep} sem CEP`)
      }

      setLinhas(parsed)
      setFormato(fmt)
      setArquivo(file.name)
    } catch (e) {
      setMsg(e?.message || 'Não foi possível ler a planilha.')
      setLinhas([])
      setFormato('')
    } finally {
      setLendo(false)
    }
  }

  async function buscarCeps() {
    if (ehBlumenau) {
      setMsg('Esta planilha já traz CEP na maioria das linhas.')
      return
    }
    const alvo = linhas.filter(l => l.semCep)
    if (!alvo.length) {
      setMsg('Todas as linhas já têm CEP.')
      return
    }
    setBuscandoCep(true)
    setMsg('')
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const map = new Map(linhas.map(l => [l.key, l]))
      const next = await enriquecerCepsConsolidado(alvo, {
        signal: ac.signal,
        onProgress: (done, total) => setProgressoCep({ done, total }),
      })
      for (const row of next) map.set(row.key, row)
      const merged = [...map.values()]
      setLinhas(merged)
      const r = resumoImportConsolidado(merged)
      setMsg(`CEP preenchido: ${r.comCep}/${r.total} · ainda faltam ${r.semCep}`)
    } catch {
      setMsg('Busca de CEP interrompida.')
    } finally {
      setBuscandoCep(false)
      abortRef.current = null
    }
  }

  async function aplicar() {
    if (!selecionadas.length) {
      setMsg('Selecione ao menos uma igreja.')
      return
    }
    setAplicando(true)
    setMsg('Importando…')
    try {
      const res = ehBlumenau
        ? await aplicarImportBlumenauMaps(selecionadas)
        : await aplicarImportConsolidado(selecionadas, { substituir })
      let texto = ehBlumenau
        ? `Importado: ${res.novas} nova(s), ${res.enriquecidas} enriquecida(s)`
          + (res.atualizadas ? `, ${res.atualizadas} atualizada(s)` : '')
          + (res.duplicatasRemovidas ? ` · ${res.duplicatasRemovidas} dup. unificada(s)` : '')
          + (res.ignoradas ? ` · ${res.ignoradas} ignorada(s)` : '')
          + ` · total ${res.totalCustom} no mapa`
        : `Importado: ${res.novas} nova(s), ${res.atualizadas} atualizada(s)`
          + (res.ignoradas ? ` · ${res.ignoradas} ignorada(s)` : '')
          + ` · total ${res.totalCustom}`
          + (res.semCep ? ` · ${res.semCep} sem CEP no cadastro` : '')
      if (ehBlumenau && !res.nuvemOk) {
        texto += ' · Nuvem não confirmou — confira o sync'
      }
      setMsg(texto)
      onAplicado?.(res)
      setTimeout(() => onFechar?.(), 1400)
    } catch (e) {
      setMsg(e?.message || 'Falha ao importar.')
    } finally {
      setAplicando(false)
    }
  }

  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-[3100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(7,10,18,0.88)', backdropFilter: 'blur(8px)' }}
      onClick={onFechar}>
      <div
        className="w-full sm:max-w-3xl rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[94vh] flex flex-col"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 flex items-center justify-between gap-3"
          style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e3a8a)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.15)' }}>
              <FileSpreadsheet size={17} className="text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-white truncate" style={{ fontSize: 15 }}>
                Importar planilha de igrejas
              </h3>
              <p className="truncate" style={{ fontSize: 11, color: 'rgba(191,219,254,0.95)' }}>
                {ehBlumenau
                  ? 'Blumenau por Bairro (Google Maps) · de-para automático'
                  : 'Consolidado ou Blumenau por Bairro (.xlsx)'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onFechar} className="p-1.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-3 space-y-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => handleArquivo(e.target.files?.[0])} />
          <button type="button" disabled={lendo} onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold disabled:opacity-50"
            style={{ fontSize: 12, background: 'rgba(59,130,246,0.18)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.35)' }}>
            {lendo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {arquivo ? `Trocar arquivo (${arquivo})` : 'Escolher planilha .xlsx'}
          </button>

          {ehBlumenau && resumo.total > 0 && (
            <div className="rounded-xl px-3 py-2 flex items-start gap-2"
              style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)' }}>
              <GitMerge size={14} className="text-blue-300 shrink-0 mt-0.5" />
              <p style={{ fontSize: 11, color: '#bfdbfe', lineHeight: 1.45 }}>
                <strong>De-para:</strong> {resumo.novas} novas · {resumo.existentes} já no cadastro ·{' '}
                {resumo.enriquecer} com dados extras.
                {duplicatasRemovidas > 0 && (
                  <> Duplicatas da planilha (mesmo Place ID/endereço): <strong>{duplicatasRemovidas} unificadas</strong>.</>
                )}
                {' '}Novas e enriquecíveis vêm marcadas.
              </p>
            </div>
          )}

          {resumo.total > 0 && (
            <div className="flex flex-wrap gap-2">
              {filtros.map(f => {
                const count = (() => {
                  if (!ehBlumenau) {
                    if (f.id === 'com_cep') return resumo.comCep
                    if (f.id === 'sem_cep') return resumo.semCep
                    return resumo.total
                  }
                  if (f.id === 'nova') return resumo.novas
                  if (f.id === 'existe') return resumo.existentes
                  if (f.id === 'enriquecer') return resumo.enriquecer
                  if (f.id === 'sem_cep') return resumo.semCep
                  if (f.id === 'nao_crista') return resumo.naoCristas
                  return resumo.total
                })()
                return (
                  <button key={f.id} type="button" onClick={() => setFiltro(f.id)}
                    className="px-3 py-1.5 rounded-xl font-bold"
                    style={{
                      fontSize: 11,
                      background: filtro === f.id ? 'rgba(59,130,246,0.22)' : 'rgba(255,255,255,0.04)',
                      color: filtro === f.id ? '#93c5fd' : 'var(--text-tertiary)',
                      border: `1px solid ${filtro === f.id ? 'rgba(59,130,246,0.4)' : 'transparent'}`,
                    }}>
                    {f.label} ({count})
                  </button>
                )
              })}
            </div>
          )}

          {!ehBlumenau && (
            <label className="flex items-center gap-2" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={substituir} onChange={e => setSubstituir(e.target.checked)} />
              Substituir cadastro atual (em vez de mesclar)
            </label>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {!linhas.length && !lendo && (
            <p className="text-center py-10" style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              Planilha Consolidado (IGREJA, LOGRADOURO, BAIRRO…) ou Blumenau por Bairro (Google Maps).
            </p>
          )}
          {visiveis.map(l => {
            const badge = ehBlumenau ? statusBadge(l) : null
            return (
              <label key={l.key}
                className="flex gap-3 rounded-2xl px-3 py-2.5 cursor-pointer"
                style={{
                  background: l.selecionada ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${l.selecionada ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.06)'}`,
                  opacity: l.crista === false ? 0.55 : 1,
                }}>
                <input type="checkbox" checked={l.selecionada} onChange={() => toggle(l.key)} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold" style={{ fontSize: 13, color: 'var(--text-primary)' }}>{l.nome}</p>
                    {badge && (
                      <span className="inline-flex px-1.5 py-0.5 rounded-md font-bold"
                        style={{ fontSize: 10, background: badge.bg, color: badge.c }}>
                        {badge.t}
                      </span>
                    )}
                    {l.dedupeMesclada > 1 && (
                      <span className="inline-flex px-1.5 py-0.5 rounded-md font-bold"
                        style={{ fontSize: 10, background: 'rgba(168,85,247,0.18)', color: '#c4b5fd' }}>
                        {l.dedupeMesclada}× planilha
                      </span>
                    )}
                    {l.semCep && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-bold"
                        style={{ fontSize: 10, background: 'rgba(251,191,36,0.18)', color: '#fbbf24' }}>
                        <AlertTriangle size={10} /> sem CEP
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {l.bairro} · {l.endereco || `${l.logradouro}${l.numero ? `, ${l.numero}` : ''}`}
                    {l.cep ? ` · CEP ${l.cep}` : ''}
                  </p>
                  {l.matchNome && (
                    <p style={{ fontSize: 11, color: '#93c5fd' }}>
                      ↔ {l.matchNome} ({l.matchMotivo})
                      {l.enrichCampos?.length ? ` · +${l.enrichCampos.join(', ')}` : ''}
                    </p>
                  )}
                  {l.culto && <p style={{ fontSize: 11, color: '#5eead4' }}>{l.culto}</p>}
                  {l.categoria && ehBlumenau && (
                    <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>{l.categoria}</p>
                  )}
                </div>
              </label>
            )
          })}
        </div>

        {msg && (
          <p className="mx-5 mb-2 rounded-xl px-3 py-2 font-semibold"
            style={{ fontSize: 12, background: 'rgba(34,197,94,0.12)', color: '#86efac' }}>
            {msg}
          </p>
        )}

        <div className="px-5 py-4 flex flex-wrap gap-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <button type="button" onClick={() => toggleTodas(true)} className="px-2 py-1 rounded-lg font-semibold"
            style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Marcar visíveis</button>
          <button type="button" onClick={() => toggleTodas(false)} className="px-2 py-1 rounded-lg font-semibold"
            style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Desmarcar visíveis</button>
          {!ehBlumenau && (
            <button type="button" onClick={buscarCeps} disabled={buscandoCep || !linhas.some(l => l.semCep)}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl font-bold disabled:opacity-50"
              style={{ fontSize: 12, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
              {buscandoCep
                ? <><Loader2 size={14} className="animate-spin" /> CEP {progressoCep.done}/{progressoCep.total}</>
                : <><MapPin size={14} /> Buscar CEPs (ViaCEP)</>}
            </button>
          )}
          <button type="button" onClick={aplicar} disabled={aplicando || !selecionadas.length}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-white disabled:opacity-45"
            style={{ fontSize: 12, background: 'linear-gradient(135deg,#2563eb,#3b82f6)' }}>
            {aplicando ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Importar ({selecionadas.length})
          </button>
          <button type="button" onClick={onFechar}
            className="ml-auto px-3 py-2.5 rounded-xl font-semibold"
            style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
