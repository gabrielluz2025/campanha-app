import { Search, Plus, Check, CalendarDays, Layers, Target, ListPlus, Sparkles, Package, Bookmark } from 'lucide-react'
import { paradaKey } from '../../../utils/rotaUtils'
import { SETORES } from '../../../constants/igrejasTheme'
import { DIAS_CULTO } from '../../../utils/cultoParse'
import { PERIODOS_CULTO } from '../../../utils/rotaFilters'
import MembroSearchPicker from '../../MembroSearchPicker'
import { useRotasCtx } from '../RotasContext'
import ProximityPanel from './ProximityPanel'
import AnchorPanel from './AnchorPanel'
import MaterialsPanel from './MaterialsPanel'
import RotaDiaPanel from './RotaDiaPanel'

export default function PlanPanel() {
  const {
    painel, setPainel,
    busca, setBusca,
    filtroSetor, setFiltroSetor,
    filtroDenom, setFiltroDenom,
    filtroVisita, setFiltroVisita,
    filtroDiaCulto, setFiltroDiaCulto,
    filtroPeriodoCulto, setFiltroPeriodoCulto,
    filtroSomenteVerificadas, setFiltroSomenteVerificadas,
    bairrosChip,
    igrejasVisiveis,
    keysNaRota,
    paradaOrdemMap,
    toggleParada,
    resumoCultoIgreja,
    eventosHoje,
    importarAgenda,
    rotaAtiva,
    membros,
    equipeIds,
    definirResponsavel,
    toggleEquipeNaRota,
    setFlyToPoint,
    adicionarTodasFiltradas,
    setIgrejaAncoraId,
    routeHealth,
    camadaMapa,
    setCamadaMapa,
    rotaTemplates,
    salvarTemplateAtivo,
    aplicarTemplateAtivo,
    removerRotaTemplate,
  } = useRotasCtx()

  const sources = [
    { id: 'assistente', label: 'Rota do dia', icon: Sparkles },
    { id: 'igrejas', label: 'Lista', icon: Search },
    { id: 'bairro', label: 'Bairro', icon: Layers },
    { id: 'vizinhanca', label: 'Vizinhança', icon: Target },
    { id: 'materiais', label: 'Material', icon: Package },
    { id: 'hoje', label: 'Agenda', icon: CalendarDays },
    { id: 'equipe', label: 'Equipe', icon: Plus },
  ]

  const filtradasFora = igrejasVisiveis.filter(ig => !keysNaRota.has(paradaKey('igreja', ig.id))).length

  if (painel === 'assistente') {
    return (
      <div>
        <SourceTabs sources={sources} painel={painel} setPainel={setPainel} />
        <RotaDiaPanel />
      </div>
    )
  }

  if (painel === 'bairro') {
    return (
      <div>
        <SourceTabs sources={sources} painel={painel} setPainel={setPainel} />
        <ProximityPanel />
      </div>
    )
  }

  if (painel === 'vizinhanca') {
    return (
      <div>
        <SourceTabs sources={sources} painel={painel} setPainel={setPainel} />
        <AnchorPanel />
      </div>
    )
  }

  if (painel === 'materiais') {
    return (
      <div>
        <SourceTabs sources={sources} painel={painel} setPainel={setPainel} />
        <MaterialsPanel />
      </div>
    )
  }

  if (painel === 'hoje') {
    return (
      <div>
        <SourceTabs sources={sources} painel={painel} setPainel={setPainel} />
        <button type="button" className="rt-cta rt-cta--primary" onClick={importarAgenda}>
          <CalendarDays size={16} />
          Importar agenda ({eventosHoje.length})
        </button>
        <div className="rt-list" style={{ marginTop: 12 }}>
          {eventosHoje.length === 0 ? (
            <p className="rt-empty">Nenhum evento para {rotaAtiva?.data?.split('-').reverse().join('/')}</p>
          ) : eventosHoje.map(ev => {
            const key = paradaKey('agenda', ev.id)
            const on = keysNaRota.has(key)
            return (
              <button
                key={key}
                type="button"
                className={`rt-item${on ? ' is-on-route' : ''}`}
                onClick={() => toggleParada(key, { tipoParada: 'evento', agendaEventoId: ev.id })}
              >
                <div className="rt-item__body">
                  <p className="rt-item__name">{ev.titulo}</p>
                  <p className="rt-item__sub">{ev.horaInicio} · {ev.local || 'Sem local'}</p>
                </div>
                <span className="rt-item__action">{on ? <Check size={18} /> : <Plus size={18} />}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (painel === 'equipe') {
    return (
      <div>
        <SourceTabs sources={sources} painel={painel} setPainel={setPainel} />
        <div className="rt-send-card">
          <label>Responsável pela rota</label>
          <MembroSearchPicker
            membros={membros}
            value={rotaAtiva?.responsavelId || ''}
            onChange={definirResponsavel}
            placeholder="Quem lidera esta rota?"
          />
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>
          Marque quem acompanha na rota:
        </p>
        <div className="rt-list">
          {membros.map(m => {
            const on = equipeIds.includes(String(m.id))
            return (
              <button
                key={m.id}
                type="button"
                className={`rt-item${on ? ' is-on-route' : ''}`}
                onClick={() => toggleEquipeNaRota(m.id)}
              >
                <div className="rt-item__body">
                  <p className="rt-item__name">{m.nome}</p>
                  <p className="rt-item__sub">{m.cargo || m.telefone || '—'}</p>
                </div>
                <span className="rt-item__action">{on ? <Check size={18} /> : <Plus size={18} />}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div>
      <SourceTabs sources={sources} painel={painel} setPainel={setPainel} />

      {rotaTemplates?.length > 0 && (
        <div className="rt-templates">
          <p className="rt-templates__label"><Bookmark size={12} /> Templates</p>
          <div className="rt-chips">
            {rotaTemplates.slice(0, 6).map(t => (
              <button key={t.id} type="button" className="rt-chip" onClick={() => aplicarTemplateAtivo(t.id)}>
                {t.nome}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rt-search">
        <Search size={16} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
        <input
          type="search"
          placeholder="Buscar igreja, bairro ou pastor…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
      </div>

      <div className="rt-chips">
        <button
          type="button"
          className={`rt-chip${filtroDenom === 'ad' ? ' is-active' : ''}`}
          onClick={() => setFiltroDenom(filtroDenom === 'ad' ? 'todas' : 'ad')}
        >
          AD
        </button>
        <button
          type="button"
          className={`rt-chip${filtroDenom === 'outras' ? ' is-active' : ''}`}
          onClick={() => setFiltroDenom(filtroDenom === 'outras' ? 'todas' : 'outras')}
        >
          Outras
        </button>
        <button
          type="button"
          className={`rt-chip${filtroVisita === 'pendentes' ? ' is-active' : ''}`}
          onClick={() => setFiltroVisita(filtroVisita === 'pendentes' ? 'todas' : 'pendentes')}
        >
          Não visitadas
        </button>
        <button
          type="button"
          className={`rt-chip${filtroSomenteVerificadas ? ' is-active' : ''}`}
          onClick={() => setFiltroSomenteVerificadas(!filtroSomenteVerificadas)}
        >
          Só verificadas
        </button>
      </div>

      <div className="rt-chips">
        <button
          type="button"
          className={`rt-chip${filtroSetor === 'Todos' ? ' is-active' : ''}`}
          onClick={() => setFiltroSetor('Todos')}
        >
          Todos bairros
        </button>
        {bairrosChip.slice(0, 8).map(b => (
          <button
            key={b}
            type="button"
            className={`rt-chip${filtroSetor === b ? ' is-active' : ''}`}
            onClick={() => setFiltroSetor(filtroSetor === b ? 'Todos' : b)}
          >
            {b}
          </button>
        ))}
      </div>

      <div className="rt-filters-row">
        <select
          value={filtroDiaCulto}
          onChange={e => setFiltroDiaCulto(e.target.value)}
          className="rt-select"
        >
          <option value="Todos">Culto — todos os dias</option>
          {DIAS_CULTO.map(d => (
            <option key={d.id} value={d.short}>{d.label}</option>
          ))}
        </select>
        <select
          value={filtroPeriodoCulto}
          onChange={e => setFiltroPeriodoCulto(e.target.value)}
          className="rt-select"
        >
          {PERIODOS_CULTO.map(p => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>

      <div className="rt-chips" style={{ marginBottom: 8 }}>
        <button
          type="button"
          className={`rt-chip${camadaMapa === 'candidatas' ? ' is-active' : ''}`}
          onClick={() => setCamadaMapa('candidatas')}
        >
          Mapa: candidatas
        </button>
        <button
          type="button"
          className={`rt-chip${camadaMapa === 'igrejas' ? ' is-active' : ''}`}
          onClick={() => setCamadaMapa('igrejas')}
        >
          Mapa: todas
        </button>
      </div>

      <div className="rt-plan-meta">
        <p>{igrejasVisiveis.length} igrejas · catálogo {routeHealth?.igrejasComPin ?? '—'} com GPS</p>
        {filtradasFora > 0 && (
          <button type="button" className="rt-cta rt-cta--ghost" onClick={adicionarTodasFiltradas}>
            <ListPlus size={14} />
            Adicionar {filtradasFora} filtrada{filtradasFora !== 1 ? 's' : ''}
          </button>
        )}
        <button type="button" className="rt-health__link" onClick={() => salvarTemplateAtivo()}>
          Salvar rota como template
        </button>
      </div>

      <div className="rt-list rt-list--scroll">
        {igrejasVisiveis.map(ig => {
          const key = paradaKey('igreja', ig.id)
          const on = keysNaRota.has(key)
          const ord = paradaOrdemMap.get(key)
          const setorCor = SETORES[ig.setor] || '#3b82f6'
          return (
            <div key={key} className={`rt-item-row${on ? ' is-on-route' : ''}`}>
              <button
                type="button"
                className="rt-item rt-item--flex"
                onClick={() => {
                  toggleParada(key)
                  if (ig.lat && ig.lng) {
                    setFlyToPoint({ coords: [ig.lat, ig.lng], ts: Date.now(), panOnly: true })
                  }
                }}
              >
                {on && ord != null ? (
                  <span className="rt-item__ord">{ord + 1}</span>
                ) : (
                  <span className="rt-item__ord" style={{ background: `${setorCor}33`, color: setorCor }}>·</span>
                )}
                <div className="rt-item__body">
                  <p className="rt-item__name">
                    {ig.nome}
                    {ig.visitado && !on && (
                      <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: '#34d399' }}>✓ visitada</span>
                    )}
                  </p>
                  <p className="rt-item__sub">
                    {ig.setor || '—'}
                    {resumoCultoIgreja(ig.culto, filtroDiaCulto) ? ` · ${resumoCultoIgreja(ig.culto, filtroDiaCulto)}` : ''}
                    {!ig.lat && <span style={{ color: '#fbbf24' }}> · sem GPS</span>}
                  </p>
                </div>
                <span className="rt-item__action">{on ? <Check size={18} /> : <Plus size={18} />}</span>
              </button>
              {!on && ig.lat && (
                <button
                  type="button"
                  className="rt-anchor-btn"
                  title="Usar como âncora (vizinhança)"
                  onClick={() => {
                    setIgrejaAncoraId(ig.id)
                    setPainel('vizinhanca')
                    setFlyToPoint({ coords: [ig.lat, ig.lng], ts: Date.now(), panOnly: true })
                  }}
                >
                  <Target size={12} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SourceTabs({ sources, painel, setPainel }) {
  return (
    <div className="rt-source-tabs rt-source-tabs--wrap">
      {sources.map(s => {
        const Icon = s.icon
        return (
          <button
            key={s.id}
            type="button"
            className={`rt-source-tab${painel === s.id ? ' is-active' : ''}`}
            onClick={() => setPainel(s.id)}
          >
            <Icon size={13} />
            {s.label}
          </button>
        )
      })}
    </div>
  )
}
