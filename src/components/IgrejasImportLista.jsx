import { useEffect, useMemo, useRef, useState } from 'react'
import { X, FileSpreadsheet, Loader2, MapPin, Sparkles } from 'lucide-react'
import {
  classificarListaBnu,
  enriquecerCeps,
  aplicarImportLista,
  resumoClassificacao,
} from '../utils/igrejasImportLista'
import { TOTAL_LISTA_UNIFICADA, RESUMO_LISTAS } from '../data/igrejasListaUnificada'
import { loadIgrejasCatalog } from '../utils/igrejasCatalog'

/**
 * De-para da planilha BNU com igrejas já no sistema (Google).
 */
export default function IgrejasImportLista({ aberto, onFechar, onAplicado }) {
  const [linhas, setLinhas] = useState([])
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [progressoCep, setProgressoCep] = useState({ done: 0, total: 0 })
  const [aplicando, setAplicando] = useState(false)
  const [atualizarCulto, setAtualizarCulto] = useState(true)
  const [filtro, setFiltro] = useState('depara')
  const [msg, setMsg] = useState('')
  const abortRef = useRef(null)

  useEffect(() => {
    if (!aberto) return
    const cat = loadIgrejasCatalog()
    setLinhas(classificarListaBnu(cat))
    setMsg('')
    setProgressoCep({ done: 0, total: 0 })
  }, [aberto])

  useEffect(() => () => {
    try { abortRef.current?.abort() } catch { /* ignore */ }
  }, [])

  const resumo = useMemo(() => resumoClassificacao(linhas), [linhas])
  const visiveis = useMemo(() => {
    if (filtro === 'existe') return linhas.filter(l => l.status === 'existe')
    if (filtro === 'nova') return linhas.filter(l => l.status === 'nova')
    if (filtro === 'depara') return linhas.filter(l => l.status === 'existe')
    return linhas
  }, [linhas, filtro])

  const selecionadas = linhas.filter(l => l.selecionada)

  function toggle(key) {
    setLinhas(prev => prev.map(l => l.key === key ? { ...l, selecionada: !l.selecionada } : l))
  }

  function toggleTodas(val) {
    const keys = new Set(visiveis.map(v => v.key))
    setLinhas(prev => prev.map(l => keys.has(l.key) ? { ...l, selecionada: val } : l))
  }

  async function buscarCeps() {
    if (buscandoCep) return
    setBuscandoCep(true)
    setMsg('')
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const next = await enriquecerCeps(linhas, {
        signal: ac.signal,
        onProgress: (done, total) => setProgressoCep({ done, total }),
      })
      setLinhas(next)
      const com = next.filter(l => l.cep).length
      setMsg(`CEP encontrado em ${com} de ${next.length} endereços.`)
    } catch {
      setMsg('Busca de CEP interrompida ou falhou.')
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
    setMsg('Gravando no site…')
    try {
      const res = await aplicarImportLista(selecionadas, { atualizarCulto, atualizarNome: true })
      setMsg(
        `No site: ${res.atualizadas} atualizada(s)`
        + (res.nomesCorrigidos ? ` · ${res.nomesCorrigidos} nome(s) corrigido(s)` : '')
        + (res.novas ? ` · ${res.novas} nova(s)` : '')
        + (res.totalSite != null ? ` · total ${res.totalSite}` : ''),
      )
      onAplicado?.(res)
      setTimeout(() => onFechar?.(), 1200)
    } catch (e) {
      setMsg(e?.message || 'Falha ao aplicar de-para.')
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
          style={{ background: 'linear-gradient(135deg,#0f766e,#134e4a)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.15)' }}>
              <FileSpreadsheet size={17} className="text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-white truncate" style={{ fontSize: 15 }}>
                De-para listas oficiais
              </h3>
              <p className="truncate" style={{ fontSize: 11, color: 'rgba(204,251,241,0.9)' }}>
                Match por endereço Google · nome ADBLU · pastor · culto · telefone
              </p>
            </div>
          </div>
          <button type="button" onClick={onFechar} className="p-1.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-3 flex flex-wrap gap-2 items-center"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          {[
            { id: 'depara', label: `De-para (${resumo.existe})` },
            { id: 'nova', label: `Só novas (${resumo.nova})` },
            { id: 'todas', label: `Todas (${resumo.total})` },
          ].map(f => (
            <button key={f.id} type="button" onClick={() => setFiltro(f.id)}
              className="px-3 py-1.5 rounded-xl font-bold"
              style={{
                fontSize: 11,
                background: filtro === f.id ? 'rgba(13,148,136,0.25)' : 'rgba(255,255,255,0.04)',
                color: filtro === f.id ? '#5eead4' : 'var(--text-tertiary)',
                border: `1px solid ${filtro === f.id ? 'rgba(45,212,191,0.4)' : 'transparent'}`,
              }}>
              {f.label}
            </button>
          ))}
          {resumo.nomesMudam > 0 && (
            <span className="px-2 py-1 rounded-lg font-semibold"
              style={{ fontSize: 10, color: '#fcd34d', background: 'rgba(251,191,36,0.12)' }}>
              {resumo.nomesMudam} nomes a corrigir
            </span>
          )}
          <div className="ml-auto flex gap-1.5">
            <button type="button" onClick={() => toggleTodas(true)} className="px-2 py-1 rounded-lg font-semibold"
              style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Marcar</button>
            <button type="button" onClick={() => toggleTodas(false)} className="px-2 py-1 rounded-lg font-semibold"
              style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Limpar</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          <label className="flex items-center gap-2 px-1 mb-2" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={atualizarCulto} onChange={e => setAtualizarCulto(e.target.checked)} />
            Atualizar horários de culto com a planilha
          </label>

          {visiveis.map(l => (
            <label key={l.key}
              className="flex gap-3 rounded-2xl px-3 py-2.5 cursor-pointer"
              style={{
                background: l.selecionada ? 'rgba(13,148,136,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${l.selecionada ? 'rgba(45,212,191,0.35)' : 'rgba(255,255,255,0.06)'}`,
              }}>
              <input type="checkbox" checked={l.selecionada} onChange={() => toggle(l.key)} className="mt-1" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2 flex-wrap">
                  <p className="font-bold" style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                    {l.nomeDepara && l.nomeMudou ? l.nomeDepara : l.nome}
                  </p>
                  <span className="px-1.5 py-0.5 rounded-md font-bold"
                    style={{
                      fontSize: 10,
                      background: l.status === 'nova' ? 'rgba(251,191,36,0.18)' : 'rgba(59,130,246,0.18)',
                      color: l.status === 'nova' ? '#fbbf24' : '#93c5fd',
                    }}>
                    {l.status === 'nova' ? 'NOVA' : 'DE-PARA'}
                  </span>
                  {l.nomeMudou && (
                    <span className="px-1.5 py-0.5 rounded-md font-bold"
                      style={{ fontSize: 10, background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>
                      renomear
                    </span>
                  )}
                </div>
                {l.status === 'existe' && l.matchNome && l.nomeMudou && (
                  <p style={{ fontSize: 10, color: '#fca5a5' }}>
                    Google: {l.matchNome}
                    {l.porEndereco ? ' · match por endereço' : ''}
                  </p>
                )}
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {l.bairro} · {l.endereco}
                  {l.fonteLista ? ` · ${l.fonteLista.toUpperCase()}` : ''}
                  {l.pastor ? ` · Pr. ${l.pastor}` : ''}
                  {l.telefone ? ` · ${l.telefone}` : ''}
                </p>
                {l.culto && (
                  <p style={{ fontSize: 11, color: '#5eead4' }}>Culto: {l.culto}</p>
                )}
                {l.status === 'existe' && (
                  <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                    Match por {l.matchMotivo}
                    {l.faltando.length ? ` · ${l.faltando.join(', ')}` : ''}
                  </p>
                )}
              </div>
            </label>
          ))}
        </div>

        {msg && (
          <p className="mx-5 mb-2 rounded-xl px-3 py-2 font-semibold"
            style={{ fontSize: 12, background: 'rgba(34,197,94,0.12)', color: '#86efac' }}>
            {msg}
          </p>
        )}

        <div className="px-5 py-4 flex flex-wrap gap-2"
          style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <button type="button" onClick={buscarCeps} disabled={buscandoCep}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl font-bold disabled:opacity-50"
            style={{ fontSize: 12, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
            {buscandoCep
              ? <><Loader2 size={14} className="animate-spin" /> CEP {progressoCep.done}/{progressoCep.total}</>
              : <><MapPin size={14} /> Buscar CEPs</>}
          </button>
          <button type="button" onClick={aplicar} disabled={aplicando || !selecionadas.length}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-white disabled:opacity-45"
            style={{ fontSize: 12, background: 'linear-gradient(135deg,#0d9488,#14b8a6)' }}>
            {aplicando ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Aplicar no site ({selecionadas.length})
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
