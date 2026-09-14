import { useMemo, useRef, useState } from 'react'
import {
  Search, Church, Upload, RefreshCw, Loader2, Plus, X, Download, FileText, Trash2, MapPin, Printer,
} from 'lucide-react'
import { useChurchVisit, useFilteredChurches } from '../../context/ChurchVisitContext'
import { useMobileLayout } from '../../hooks/useViewportMode'
import ChurchVisitMap from './ChurchVisitMap'
import ChurchVisitList from './ChurchVisitList'
import ChurchVisitDetail from './ChurchVisitDetail'
import IgrejasImportConsolidado from '../IgrejasImportConsolidado'
import IgrejaFormEndereco from '../IgrejaFormEndereco'
import CultoHorariosEditor from '../CultoHorariosEditor'
import { Field, fieldInput } from '../IgrejaFormEdicao'
import { DENOMINACOES, SETORES } from '../../constants/igrejasTheme'
import { DIAS_CULTO } from '../../utils/cultoParse'
import { bairrosFromChurches } from '../../utils/churchVisitFilters'
import {
  exportarCatalogoIgrejasTxt,
  exportarCatalogoIgrejasXlsx,
} from '../../utils/igrejasExport'
import { igrejaSemPinMapa } from '../../utils/igrejasGeocodeFix'
import { imprimirIgrejasPorBairro } from '../../utils/igrejasBairroReport'
import { listarDuplicatasIgrejasCadastro } from '../../utils/churchVisitMutations'
import { APP_VERSION } from '../../constants/appVersion'

const NOVO_FORM_VAZIO = {
  nome: '',
  denominacao: DENOMINACOES[0] || 'Assembleia de Deus',
  culto: 'Dom 18:30 · Qua 19:30',
  setor: '',
  endereco: '',
  cep: '',
  logradouro: '',
  numero: '',
  bairro: '',
  cidade: 'Blumenau',
  uf: 'SC',
  pastor1: '',
  esposa1: '',
  pastor2: '',
  esposa2: '',
  telefone: '',
  whatsapp: '',
}

function MapaVisitasShell() {
  const mobile = useMobileLayout()
  const {
    churches, loading, loadError, stats, refresh, selected, setSelectedId,
    addChurch, clearVisits, clearChurches, geocodeAllMissing,
    purgeOutsideCities, foraCidadesCount, cidadesIgrejasMapa,
    duplicatasCount, mergeDuplicates, purifyAdbluCatalog,
  } = useChurchVisit()
  const [busca, setBusca] = useState('')
  const [filtroVisita, setFiltroVisita] = useState('todas')
  const [filtroDenom, setFiltroDenom] = useState('todas')
  const [filtroBairro, setFiltroBairro] = useState('Todos')
  const [filtroDiaCulto, setFiltroDiaCulto] = useState('Todos')
  const [semGps, setSemGps] = useState(false)
  const [importAberto, setImportAberto] = useState(false)
  const [mostrarNovo, setMostrarNovo] = useState(false)
  const [novoForm, setNovoForm] = useState(NOVO_FORM_VAZIO)
  const [novoErro, setNovoErro] = useState('')
  const [exportLoad, setExportLoad] = useState(false)
  const [geoBatch, setGeoBatch] = useState(null)
  const geoAbortRef = useRef(null)

  const pinsNoMapa = useMemo(
    () => churches.filter(ig => !igrejaSemPinMapa(ig)).length,
    [churches],
  )
  const semPin = Math.max(0, stats.total - pinsNoMapa)

  const filtros = useMemo(() => ({
    busca,
    filtroVisita,
    filtroDenom,
    filtroBairro,
    filtroDiaCulto,
    semGps,
  }), [busca, filtroVisita, filtroDenom, filtroBairro, filtroDiaCulto, semGps])

  const filtradas = useFilteredChurches(filtros)

  const bairrosOpts = useMemo(() => bairrosFromChurches(), [])
  const setoresOpcoes = useMemo(
    () => ['—', ...Object.keys(SETORES).sort((a, b) => a.localeCompare(b, 'pt-BR'))],
    [],
  )

  const filtrosVisita = [
    { id: 'todas', label: 'Todas' },
    { id: 'pendentes', label: 'Pendentes' },
    { id: 'visitadas', label: 'Visitadas' },
  ]

  async function salvarNova() {
    setNovoErro('')
    try {
      const nova = await addChurch(novoForm)
      setMostrarNovo(false)
      setNovoForm(NOVO_FORM_VAZIO)
      setSelectedId(nova.id)
    } catch (e) {
      setNovoErro(e?.message || 'Não foi possível cadastrar.')
    }
  }

  async function exportarTxt() {
    exportarCatalogoIgrejasTxt(churches)
  }

  async function exportarXlsx() {
    setExportLoad(true)
    try {
      await exportarCatalogoIgrejasXlsx(churches)
    } finally {
      setExportLoad(false)
    }
  }

  function imprimirPorBairro() {
    if (!filtradas.length) {
      window.alert('Nenhuma igreja neste filtro para imprimir.')
      return
    }
    const partes = []
    if (filtroVisita === 'visitadas') partes.push('visitadas')
    if (filtroVisita === 'pendentes') partes.push('pendentes')
    if (filtroDenom === 'ad') partes.push('AD')
    if (filtroDenom === 'outras') partes.push('outras denom.')
    if (filtroBairro && filtroBairro !== 'Todos') partes.push(`bairro ${filtroBairro}`)
    if (filtroDiaCulto && filtroDiaCulto !== 'Todos') partes.push(`culto ${filtroDiaCulto}`)
    if (semGps) partes.push('sem GPS')
    if (busca.trim()) partes.push(`busca “${busca.trim()}”`)

    const res = imprimirIgrejasPorBairro({
      igrejas: filtradas,
      filtrosResumo: partes.length ? partes.join(' · ') : 'lista completa',
    })
    if (!res?.ok) {
      window.alert('Permita pop-ups neste site para imprimir ou salvar em PDF.')
    }
  }

  async function limparVisitas() {
    if (!window.confirm('Limpar TODAS as visitas registradas? Esta ação não apaga igrejas.')) return
    await clearVisits()
  }

  async function limparCadastro() {
    if (!window.confirm('Zerar TODO o cadastro de igrejas? Visitas e coordenadas também serão apagadas.')) return
    if (!window.confirm('Confirma novamente: apagar cadastro completo de igrejas?')) return
    const result = await clearChurches()
    if (result?.nuvemOk === false) {
      window.alert(
        'Cadastro zerado neste aparelho, mas a nuvem ainda tinha cópia antiga.\n\n'
        + 'Com internet, abra o Mapa de Visitas de novo — o sistema tentará limpar o servidor automaticamente.\n\n'
        + (result?.nuvemError ? `Detalhe: ${result.nuvemError}` : ''),
      )
    }
  }

  async function validarAdblu() {
    if (!window.confirm(
      'Validar cadastro com a lista oficial ADBLU (adblu.org)?\n\n'
      + '• Mesmo endereço → só atualiza nome/setor/culto\n'
      + '• Remove capela mortuária, mercado, endereço vazio e fora da lista\n'
      + '• Funde duplicatas\n'
      + '• Inclui congregações oficiais que faltarem (88)\n\n'
      + 'Visitas migram para a ficha mantida. Continuar?',
    )) return
    const result = await purifyAdbluCatalog({ force: true, adicionarFaltantes: true, somenteOficial: true })
    const msg = [
      `Antes: ${result.antes} → Depois: ${result.depois} (oficial: ${result.totalOficial})`,
      result.depara?.atualizadas ? `Nomes/dados atualizados: ${result.depara.atualizadas}` : '',
      result.depara?.adicionadas ? `Congregações incluídas: ${result.depara.adicionadas}` : '',
      result.removidasInvalidas ? `Removidas (inválidas): ${result.removidasInvalidas}` : '',
      result.removidasForaLista ? `Removidas (fora ADBLU): ${result.removidasForaLista}` : '',
      result.dedupe ? `Duplicatas fundidas: ${result.dedupe}` : '',
      result.nuvemOk === false ? `\nNuvem: ${result.nuvemError || 'não confirmou'}` : '',
    ].filter(Boolean).join('\n')
    window.alert(msg || 'Nada a alterar.')
  }

  async function fundirDuplicatas() {
    if (duplicatasCount <= 0) return
    const preview = listarDuplicatasIgrejasCadastro()
    const linhas = (preview.removidos || []).slice(0, 8).map(r =>
      `• ${r.nome || r.id} → ${r.keeperNome || r.keeperId}`,
    ).join('\n')
    const mais = (preview.removidos?.length || 0) > 8
      ? `\n… e mais ${preview.removidos.length - 8}.`
      : ''
    if (!window.confirm(
      `Encontramos ${duplicatasCount} igreja(s) repetida(s) (mesmo endereço, Google ou ADBLU).\n\n`
      + `De-para (mantém a ficha mais completa):\n${linhas || '—'}${mais}\n\n`
      + 'Fundir agora? Visitas e pastores migram para a ficha mantida.',
    )) return
    const result = await mergeDuplicates()
    if (result?.removidas > 0) {
      window.alert(
        `${result.removidas} duplicata(s) fundida(s). Restam ${result.mantidas} igrejas.`
        + (result.nuvemOk === false ? '\n\nNão confirmou na nuvem — tente de novo com internet.' : ''),
      )
    }
  }

  async function apagarOutrasCidades() {
    if (foraCidadesCount <= 0) return
    const cidades = cidadesIgrejasMapa.join(', ')
    if (!window.confirm(
      `Apagar ${foraCidadesCount} igreja(s) de outras cidades?\n\n`
      + `Permanecem só: ${cidades}.`,
    )) return
    const result = await purgeOutsideCities()
    if (result?.removidas > 0) {
      window.alert(
        `${result.removidas} igreja(s) removidas. Restam ${result.mantidas} em ${cidades}.`
        + (result.nuvemOk === false ? '\n\nNão confirmou na nuvem — tente de novo com internet.' : ''),
      )
    }
  }

  function cancelarGeocodeLote() {
    geoAbortRef.current?.abort()
  }

  async function iniciarGeocodeLote() {
    if (geoBatch || semPin <= 0) return
    const minEst = Math.max(1, Math.ceil((semPin * 8) / 60))
    if (!window.confirm(
      `Localizar ${semPin} igreja(s) no mapa pelo endereço?\n\n`
      + `Pode levar cerca de ${minEst} minuto(s). Mantenha esta aba aberta e conectado à internet.`,
    )) return

    const ac = new AbortController()
    geoAbortRef.current = ac
    setGeoBatch({ done: 0, total: semPin, ok: 0, fail: 0 })

    try {
      const result = await geocodeAllMissing({
        signal: ac.signal,
        onProgress: (p) => setGeoBatch({
          done: p.done,
          total: p.total,
          ok: p.ok,
          fail: p.fail,
        }),
      })
      if (result.cancelled) {
        window.alert(`Localização interrompida. ${result.ok} igreja(s) colocadas no mapa.`)
      } else {
        window.alert(
          `Concluído: ${result.ok} no mapa`
          + (result.fail ? ` · ${result.fail} sem localização` : '')
          + '.',
        )
      }
    } catch (e) {
      window.alert(e?.message || 'Erro ao localizar igrejas no mapa.')
    } finally {
      geoAbortRef.current = null
      setGeoBatch(null)
    }
  }

  const geoPct = geoBatch?.total
    ? Math.min(100, Math.round((geoBatch.done / geoBatch.total) * 100))
    : 0

  return (
    <div className="relative flex flex-col flex-1 min-h-0 min-w-0 bg-[var(--bg-base)]">
      <header className="shrink-0 px-3 pt-2 pb-2 border-b border-[var(--border-subtle)] space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Church size={18} className="text-[var(--gold-bright)] shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm font-semibold truncate">Mapa de Visitas</h1>
              <p className="text-[10px] text-[var(--text-muted)]">
                {stats.total} na lista · {pinsNoMapa} no mapa · {stats.visitadas} visitadas
                {loading && stats.total > 0 ? ' · atualizando…' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
            <button type="button" title="Imprimir por bairro (PDF)" onClick={imprimirPorBairro} disabled={!filtradas.length}
              className="p-2 rounded-lg hover:bg-[var(--surface-hover)] disabled:opacity-40">
              <Printer size={16} />
            </button>
            <button type="button" title="Exportar Excel" onClick={exportarXlsx} disabled={exportLoad || !churches.length}
              className="p-2 rounded-lg hover:bg-[var(--surface-hover)] disabled:opacity-40">
              {exportLoad ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            </button>
            <button type="button" title="Exportar TXT" onClick={exportarTxt} disabled={!churches.length}
              className="p-2 rounded-lg hover:bg-[var(--surface-hover)] disabled:opacity-40">
              <FileText size={16} />
            </button>
            <button type="button" title="Importar planilha" onClick={() => setImportAberto(true)}
              className="p-2 rounded-lg hover:bg-[var(--surface-hover)]">
              <Upload size={16} />
            </button>
            <button type="button" title={mostrarNovo ? 'Fechar cadastro' : 'Cadastrar igreja'}
              onClick={() => setMostrarNovo(v => !v)}
              className="p-2 rounded-lg hover:bg-[var(--surface-hover)]">
              {mostrarNovo ? <X size={16} /> : <Plus size={16} />}
            </button>
            <button type="button" title="Limpar visitas" onClick={limparVisitas}
              className="p-2 rounded-lg hover:bg-[var(--surface-hover)] text-red-400/80">
              <Trash2 size={16} />
            </button>
            <button type="button" title="Atualizar lista" onClick={() => refresh()}
              className="p-2 rounded-lg hover:bg-[var(--surface-hover)]" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            </button>
          </div>
        </div>

        {(semPin > 0 || geoBatch) && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 space-y-2">
            {geoBatch ? (
              <>
                <div className="flex items-center justify-between gap-2 text-[11px] text-amber-100">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Loader2 size={13} className="animate-spin shrink-0" />
                    <span className="truncate">
                      Localizando no mapa… {geoBatch.done}/{geoBatch.total}
                      {geoBatch.ok > 0 ? ` · ${geoBatch.ok} ok` : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={cancelarGeocodeLote}
                    className="shrink-0 text-[10px] px-2 py-0.5 rounded border border-amber-500/40 hover:bg-amber-500/15"
                  >
                    Parar
                  </button>
                </div>
                <div className="h-1.5 rounded-full bg-black/20 overflow-hidden">
                  <div
                    className="h-full bg-amber-400 transition-all duration-300"
                    style={{ width: `${geoPct}%` }}
                  />
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-amber-100/90">
                  {semPin} igreja(s) na lista sem pin no mapa — a planilha não traz GPS.
                </p>
                <button
                  type="button"
                  onClick={iniciarGeocodeLote}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-amber-500 text-black hover:bg-amber-400"
                >
                  <MapPin size={13} />
                  Colocar no mapa (GPS)
                </button>
              </div>
            )}
          </div>
        )}

        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar igreja, bairro ou pastor…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)]"
          />
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          {filtrosVisita.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltroVisita(f.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] border ${
                filtroVisita === f.id
                  ? 'border-[var(--gold-bright)]/50 bg-[var(--gold-dim)]/20 text-[var(--gold-bright)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="w-px h-5 bg-[var(--border-subtle)] mx-0.5 self-center" />
          {[
            { id: 'todas', label: 'Denom. todas' },
            { id: 'ad', label: 'AD' },
            { id: 'outras', label: 'Outras' },
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltroDenom(f.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] border ${
                filtroDenom === f.id
                  ? 'border-[var(--gold-bright)]/50 bg-[var(--gold-dim)]/20'
                  : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
              }`}
            >
              {f.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSemGps(v => !v)}
            className={`px-2.5 py-1 rounded-full text-[11px] border ${
              semGps
                ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
            }`}
          >
            Sem GPS
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={filtroBairro}
            onChange={e => setFiltroBairro(e.target.value)}
            className="flex-1 min-w-[120px] text-[11px] rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1.5"
          >
            {bairrosOpts.map(b => (
              <option key={b} value={b}>{b === 'Todos' ? 'Bairro (todos)' : b}</option>
            ))}
          </select>
          <select
            value={filtroDiaCulto}
            onChange={e => setFiltroDiaCulto(e.target.value)}
            className="flex-1 min-w-[120px] text-[11px] rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-2 py-1.5"
          >
            <option value="Todos">Culto (todos os dias)</option>
            {DIAS_CULTO.map(d => (
              <option key={d.id} value={d.short}>{d.label}</option>
            ))}
          </select>
          {duplicatasCount > 0 && (
            <button
              type="button"
              title="Fundir igrejas duplicadas (de-para automático)"
              onClick={fundirDuplicatas}
              className="text-[10px] px-2 py-1.5 rounded-lg border border-violet-500/35 text-violet-200/90 hover:bg-violet-500/10"
            >
              Fundir duplicatas ({duplicatasCount})
            </button>
          )}
          <button
            type="button"
            title="De-para com adblu.org/congregacoes/print — remove lixo e duplicatas"
            onClick={validarAdblu}
            className="text-[10px] px-2 py-1.5 rounded-lg border border-emerald-500/35 text-emerald-200/90 hover:bg-emerald-500/10"
          >
            Validar ADBLU
          </button>
          {foraCidadesCount > 0 && (
            <button
              type="button"
              title="Apagar igrejas fora de Blumenau, Gaspar e Indaial"
              onClick={apagarOutrasCidades}
              className="text-[10px] px-2 py-1.5 rounded-lg border border-amber-500/35 text-amber-300/90 hover:bg-amber-500/10"
            >
              Apagar outras cidades ({foraCidadesCount})
            </button>
          )}
          <button
            type="button"
            title="Abrir lista para imprimir ou salvar PDF, agrupada por bairro"
            onClick={imprimirPorBairro}
            disabled={!filtradas.length}
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-40"
          >
            <Printer size={12} />
            Imprimir por bairro
          </button>
          <button
            type="button"
            title="Zerar cadastro"
            onClick={limparCadastro}
            className="text-[10px] px-2 py-1.5 rounded-lg border border-red-500/30 text-red-400/80 hover:bg-red-500/10"
          >
            Zerar cadastro
          </button>
        </div>

        {mostrarNovo && (
          <div className="rounded-xl p-3 space-y-2 border border-[var(--gold-bright)]/25 bg-[var(--gold-dim)]/10">
            <p className="text-xs font-semibold text-[var(--gold-bright)]">Nova igreja</p>
            <Field label="Nome *">
              <input
                value={novoForm.nome}
                onChange={e => setNovoForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Ex.: Assembleia de Deus — Centro"
                style={fieldInput}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Denominação">
                <select
                  value={novoForm.denominacao}
                  onChange={e => setNovoForm(f => ({ ...f, denominacao: e.target.value }))}
                  style={fieldInput}
                >
                  {DENOMINACOES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Horário de culto">
                <CultoHorariosEditor
                  compact
                  value={novoForm.culto}
                  onChange={c => setNovoForm(f => ({ ...f, culto: c }))}
                />
              </Field>
            </div>
            <IgrejaFormEndereco form={novoForm} onChange={setNovoForm} setoresOpcoes={setoresOpcoes} />
            {novoErro && <p className="text-[11px] text-red-400">{novoErro}</p>}
            <button
              type="button"
              onClick={salvarNova}
              className="w-full py-2 rounded-lg bg-[var(--gold-bright)] text-black text-xs font-semibold"
            >
              Salvar no mapa
            </button>
          </div>
        )}

        {loadError && (
          <p className="text-xs text-red-400">{loadError}</p>
        )}
      </header>

      <div className={`flex flex-1 min-h-0 ${mobile ? 'flex-col' : 'flex-row'}`}>
        <div className={`min-h-0 ${mobile ? 'h-[42vh] shrink-0' : 'flex-[1.2] border-r border-[var(--border-subtle)]'}`}>
          <ChurchVisitMap filters={filtros} height="100%" />
        </div>

        <div className={`flex flex-col min-h-0 min-w-0 ${mobile ? 'flex-1' : 'w-[min(420px,38%)]'}`}>
          {!mobile && (
            <ChurchVisitList filters={filtros} onSelect={setSelectedId} />
          )}
          {mobile && !selected && (
            <ChurchVisitList filters={filtros} onSelect={setSelectedId} />
          )}
        </div>
      </div>

      {selected && (
        <div className={`shrink-0 z-20 ${mobile ? 'fixed inset-x-0 bottom-0 px-0 pb-[env(safe-area-inset-bottom)]' : 'absolute right-4 top-20 w-[min(380px,calc(100%-2rem))]'}`}>
          <ChurchVisitDetail onClose={() => setSelectedId(null)} />
        </div>
      )}

      <IgrejasImportConsolidado
        aberto={importAberto}
        onFechar={() => setImportAberto(false)}
        onAplicado={() => refresh()}
      />

      <p className="shrink-0 px-3 py-1 text-[9px] text-[var(--text-faint)] text-center">
        Mapa de Visitas v2 · v{APP_VERSION}
      </p>
    </div>
  )
}

export default function MapaVisitasV2() {
  return <MapaVisitasShell />
}
