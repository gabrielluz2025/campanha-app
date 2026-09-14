import {
  Search, Filter, ChevronRight, Church, CalendarDays, Plus, CheckCircle2,
} from 'lucide-react'
import { SETORES } from '../../constants/igrejasTheme'
import { paradaKey } from '../../utils/rotaUtils'
import { DIAS_CULTO, PERIODOS_CULTO } from '../../utils/cultoParse'
import { TOTAL_LISTA_ADBLU } from '../../utils/igrejasCatalog'
import MembroSearchPicker from '../MembroSearchPicker'
import MrxListItem, { MrxAnchorBanner } from './MrxListItem'

export default function PainelMontar({
  painel,
  busca,
  setBusca,
  filtroSetor,
  setFiltroSetor,
  bairrosChip,
  filtrosIgrejasAberto,
  setFiltrosIgrejasAberto,
  filtroDenom,
  setFiltroDenom,
  filtroDiaCulto,
  setFiltroDiaCulto,
  filtroPeriodoCulto,
  setFiltroPeriodoCulto,
  filtroVisita,
  setFiltroVisita,
  filtroSomenteVerificadas,
  setFiltroSomenteVerificadas,
  setores,
  igrejas,
  adbluCount,
  outrasDenomCount,
  igrejaAncora,
  igrejaAncoraId,
  setIgrejaAncoraId,
  proxIgrejaKm,
  setProxIgrejaKm,
  igrejasProximasDaAncora,
  igrejasVisiveis,
  keysNaRota,
  paradaOrdemMap,
  eventosHoje,
  rotaAtiva,
  importarAgenda,
  toggleParada,
  membros,
  equipeIds,
  definirResponsavel,
  setSideTab,
  toggleEquipeNaRota,
  corParada,
  resumoCultoIgreja,
  filtroDiaCulto: filtroDia,
  selecionarAncoraIgreja,
  adicionarAncoraEProximas,
  setFlyToPoint,
  extrasPanel,
  useRecordCards = false,
}) {
  if (painel === 'hoje') {
    return (
      <div className="mrx-panel-scroll px-1 py-2 pb-8 space-y-2">
        <button type="button" onClick={importarAgenda} className="mrx-cta-primary mx-3">
          <CalendarDays size={14}/> Importar agenda ({eventosHoje.length})
        </button>
        {eventosHoje.length === 0 ? (
          <p className="mrx-empty">Nenhum evento para {rotaAtiva?.data?.split('-').reverse().join('/')}</p>
        ) : eventosHoje.map(ev => {
          const key = paradaKey('agenda', ev.id)
          const naRota = keysNaRota.has(key)
          return (
            <div key={key} onClick={() => toggleParada(key, { tipoParada: 'evento', agendaEventoId: ev.id })}
              className="mrx-item mx-3 cursor-pointer" style={naRota ? { borderColor: 'rgba(167,139,250,0.5)', background: 'rgba(124,58,237,0.12)' } : undefined}>
              <div className="mrx-item-inner">
                <div className="flex-1 min-w-0">
                  <p className="mrx-item-name">{ev.titulo}</p>
                  <p className="mrx-item-sub">{ev.horaInicio} · {ev.local || 'Sem local'}</p>
                </div>
                {naRota ? <CheckCircle2 size={16} style={{ color: '#a78bfa' }}/> : <Plus size={16} style={{ color: 'var(--mrx-muted)' }}/>}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (painel === 'equipe') {
    return (
      <div className="mrx-panel-scroll px-3 py-2 pb-8">
        <p className="mrx-panel-sub mb-3">Defina quem lidera e quem acompanha a rota.</p>
        <MembroSearchPicker
          membros={membros}
          value={rotaAtiva?.responsavelId || ''}
          onChange={id => { definirResponsavel(id); setSideTab('rota') }}
          equipeIds={equipeIds}
          onToggleEquipe={(id, on) => toggleEquipeNaRota(id, on)}
          autoFocus
          showCargoFilter
          placeholder="Buscar membro…"
        />
      </div>
    )
  }

  if (painel === 'proximas' || painel === 'materiais') {
    return extrasPanel
  }

  return (
    <>
      <div className="mrx-search">
        <Search size={14}/>
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar igreja…"/>
      </div>

      <div className="mrx-bairros">
        <p className="px-3 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--mrx-muted)' }}>
          Bairros de Blumenau (35)
        </p>
        <button type="button"
          className={`mrx-bairro ${filtroSetor === 'Todos' ? 'is-on' : ''}`}
          onClick={() => setFiltroSetor('Todos')}>
          Todos
        </button>
        {bairrosChip.map(s => (
          <button key={s} type="button"
            className={`mrx-bairro ${filtroSetor === s ? 'is-on' : ''}`}
            style={{ '--chip': SETORES[s] || '#94a3b8' }}
            onClick={() => setFiltroSetor(filtroSetor === s ? 'Todos' : s)}>
            {s}
          </button>
        ))}
        <button type="button"
          className={`mrx-bairro ${filtroSetor === '— Outras Denominações' ? 'is-on' : ''}`}
          onClick={() => setFiltroSetor(filtroSetor === '— Outras Denominações' ? 'Todos' : '— Outras Denominações')}>
          Outras
        </button>
      </div>

      <button type="button" className="mrx-filters-toggle"
        onClick={() => setFiltrosIgrejasAberto(v => !v)}>
        <span className="inline-flex items-center gap-1.5">
          <Filter size={12}/> Filtros avançados
        </span>
        <ChevronRight size={14} className={`transition-transform ${filtrosIgrejasAberto ? 'rotate-90' : ''}`}/>
      </button>

      {filtrosIgrejasAberto && (
        <div className="mrx-filters-box">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)' }}>
            {[
              { id: 'todas', label: `Todas (${igrejas.length})` },
              { id: 'ad', label: `AD (${adbluCount})` },
              { id: 'outras', label: `Outras (${outrasDenomCount})` },
            ].map(opt => (
              <button key={opt.id} type="button" onClick={() => setFiltroDenom(opt.id)}
                className="rounded-lg py-1.5 text-[11px] font-bold"
                style={{
                  background: filtroDenom === opt.id ? 'rgba(37,99,235,0.5)' : 'transparent',
                  color: filtroDenom === opt.id ? '#fff' : 'var(--mrx-muted)',
                }}>
                {opt.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={filtroDiaCulto} onChange={e => setFiltroDiaCulto(e.target.value)}
              className="text-xs rounded-lg px-2 py-2 srf" style={{ colorScheme: 'dark' }}>
              <option value="Todos">Dia culto</option>
              {DIAS_CULTO.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
            <select value={filtroPeriodoCulto} onChange={e => setFiltroPeriodoCulto(e.target.value)}
              className="text-xs rounded-lg px-2 py-2 srf" style={{ colorScheme: 'dark' }}>
              {PERIODOS_CULTO.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <select value={filtroVisita} onChange={e => setFiltroVisita(e.target.value)}
            className="text-xs rounded-lg px-2 py-2 srf w-full" style={{ colorScheme: 'dark' }}>
            <option value="todas">Todas visitas</option>
            <option value="pendentes">Não visitadas</option>
            <option value="visitadas">Visitadas</option>
          </select>
          <button type="button" onClick={() => setFiltroSomenteVerificadas(v => !v)}
            className="text-[11px] font-bold text-left px-2 py-1.5 rounded-lg"
            style={{
              background: filtroSomenteVerificadas ? 'rgba(52,211,153,0.15)' : 'transparent',
              color: filtroSomenteVerificadas ? '#86efac' : 'var(--mrx-muted)',
            }}>
            {filtroSomenteVerificadas ? '✓ ' : ''}Somente verificadas (ADBLU)
          </button>
        </div>
      )}

      <div className="mrx-panel-scroll pb-10">
        {igrejaAncora && (
          <MrxAnchorBanner
            igrejaAncora={igrejaAncora}
            proxIgrejaKm={proxIgrejaKm}
            setProxIgrejaKm={setProxIgrejaKm}
            count={igrejasProximasDaAncora.length}
            onClose={() => setIgrejaAncoraId(null)}
            onAddAll={adicionarAncoraEProximas}
          />
        )}

        {!igrejaAncora && (
          <p className="mrx-count">
            {igrejasVisiveis.length} igrejas
            {filtroSetor !== 'Todos' ? ` · ${filtroSetor.replace(/^—\s*/, '')}` : ''}
          </p>
        )}

        {igrejaAncora ? (
          <>
            <MrxListItem
              useRecordCard={useRecordCards}
              p={{
                key: paradaKey('igreja', igrejaAncora.id),
                id: igrejaAncora.id,
                nome: igrejaAncora.nome,
                setor: igrejaAncora.setor,
                endereco: igrejaAncora.endereco,
                lat: igrejaAncora.lat,
                lng: igrejaAncora.lng,
                culto: igrejaAncora.culto,
                visitado: igrejaAncora.visitado,
                visita: igrejaAncora.visita,
                denominacao: igrejaAncora.denominacao,
              }}
              naRota={keysNaRota.has(paradaKey('igreja', igrejaAncora.id))}
              ordem={paradaOrdemMap.get(paradaKey('igreja', igrejaAncora.id)) ?? -1}
              cor={corParada({ key: paradaKey('igreja', igrejaAncora.id), denominacao: igrejaAncora.denominacao, setor: igrejaAncora.setor })}
              destaqueAncora
              cultoTxt={resumoCultoIgreja(igrejaAncora.culto, filtroDia)}
              onToggle={() => toggleParada(paradaKey('igreja', igrejaAncora.id))}
              onFly={() => igrejaAncora.lat && setFlyToPoint({ coords: [igrejaAncora.lat, igrejaAncora.lng], ts: Date.now() })}
              onRadar={() => selecionarAncoraIgreja({ id: igrejaAncora.id, ...igrejaAncora, key: paradaKey('igreja', igrejaAncora.id) })}
            />
            {igrejasProximasDaAncora.map(({ igreja: ig, km }) => {
              const key = paradaKey('igreja', ig.id)
              return (
                <MrxListItem
              useRecordCard={useRecordCards}
                  key={key}
                  p={{ key, id: ig.id, nome: ig.nome, setor: ig.setor, endereco: ig.endereco, lat: ig.lat, lng: ig.lng, culto: ig.culto, visitado: ig.visitado, visita: ig.visita, denominacao: ig.denominacao }}
                  naRota={keysNaRota.has(key)}
                  ordem={paradaOrdemMap.get(key) ?? -1}
                  cor={corParada({ key, denominacao: ig.denominacao, setor: ig.setor })}
                  km={km}
                  cultoTxt={resumoCultoIgreja(ig.culto, filtroDia)}
                  onToggle={() => toggleParada(key)}
                  onFly={() => ig.lat && setFlyToPoint({ coords: [ig.lat, ig.lng], ts: Date.now() })}
                  onRadar={() => selecionarAncoraIgreja({ id: ig.id, ...ig, key })}
                />
              )
            })}
          </>
        ) : igrejasVisiveis.length === 0 ? (
          <div className="mrx-empty">
            <Church size={28}/>
            <strong>Nenhuma igreja</strong>
            <p>Troque o bairro ou limpe os filtros.</p>
            <button type="button" onClick={() => {
              setFiltroSetor('Todos'); setFiltroDenom('todas'); setFiltroDiaCulto('Todos')
              setFiltroPeriodoCulto('todos'); setFiltroVisita('todas'); setBusca('')
            }}>
              Ver todas
            </button>
          </div>
        ) : (
          igrejasVisiveis.map(ig => {
            const key = paradaKey('igreja', ig.id)
            const semCoords = !ig.lat && !ig.lng && !ig.geoOk
            return (
              <MrxListItem
              useRecordCard={useRecordCards}
                key={key}
                p={{ key, id: ig.id, nome: ig.nome, setor: ig.setor, endereco: ig.endereco, lat: ig.lat, lng: ig.lng, culto: ig.culto, visitado: ig.visitado, visita: ig.visita, denominacao: ig.denominacao }}
                naRota={keysNaRota.has(key)}
                ordem={paradaOrdemMap.get(key) ?? -1}
                cor={corParada({ key, denominacao: ig.denominacao, setor: ig.setor })}
                semCoords={semCoords}
                visitado={Boolean(ig.visitado || ig.visita?.visitado)}
                cultoTxt={resumoCultoIgreja(ig.culto, filtroDia)}
                isAncora={String(ig.id) === String(igrejaAncoraId)}
                onToggle={() => toggleParada(key)}
                onFly={() => ig.lat && setFlyToPoint({ coords: [ig.lat, ig.lng], ts: Date.now() })}
                onRadar={() => selecionarAncoraIgreja({ id: ig.id, ...ig, key })}
              />
            )
          })
        )}
      </div>
    </>
  )
}
