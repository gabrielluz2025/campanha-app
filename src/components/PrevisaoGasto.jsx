import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import ListaPessoas from './ListaPessoas'
import {
  PieChart, Pie, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  TrendingUp, DollarSign, Users, UserCheck,
  Building2, Fuel, Briefcase, Info,
  Wallet, AlertTriangle,
  Plus, Trash2, Calendar, Download, Printer, MapPin, RefreshCw,
  ChevronDown, Church, Footprints,
} from 'lucide-react'
import SaveButton from './SaveButton'
import { saveToCloud, writeStorage, flushAfterSave } from '../utils/persist'
import { SYNC_STORAGE_EVENT, SYNC_EVENT } from '../lib/cloudSync'
import { reconciliarEquipePrevisao, EQUIPE_KEY, loadPrevisao, EQUIPE_PREVISAO_EVENT, mesclarEquipeNasListas, mesclarPrevisaoCompleta, savePrevisaoSeguro, listaEquipeCompleta, resumoCargos, categoriaPrevisaoLabel, CARGO_CORES, CARGOS, normalizarCargo, corCargo, pessoaId, loadEquipe, sincronizarCombustivelCarroParaMembro, nomeVeiculoMembro, litrosTotalDoCarro, normalizarCarroCombustivel, gerarCedenciaId, cargosAdmin, sincronizarEquipeComPrevisao } from '../utils/equipeSync'
import {
  totalRuaFreelancers, FREELANCER_CAT_NOME, qtdPessoasFreelancers,
} from '../utils/equipeRuaFreelancer'
import { publicarPrevisaoResumo } from '../utils/previsaoCalculo'
import EquipeRuaFreelancers from './EquipeRuaFreelancers'
import {
  PageHeader, ModuleWrap, Card, Button, Pill, StatGrid,
  ProgressRing, IconBadge,
} from './ui'
import CargoBalao, { LegendaCargos } from './CargoBalao'

const fmt = (v) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const num = (v) => {
  const n = parseFloat(String(v).replace(',', '.'))
  return isNaN(n) || n < 0 ? 0 : n
}

const CORES = ['#3b82f6', '#f59e0b', '#10b981', '#06b6d4', '#ec4899']
const EMPRESAS_KEY = 'empresas_lista'
const CARDS_COLLAPSED_KEY = 'previsao_cards_collapsed'

const EMPRESA_CAT_LABEL = {
  grafica: 'Gráfica / Material',
  comunicacao: 'Comunicação / Mídia',
  transporte: 'Transporte / Logística',
  alimentacao: 'Alimentação',
  juridico: 'Jurídico / Contábil',
  tecnologia: 'Tecnologia',
  evento: 'Eventos / Estrutura',
  outro: 'Outro',
}

function loadEmpresasPrevisao() {
  try {
    const lista = JSON.parse(localStorage.getItem(EMPRESAS_KEY) || '[]')
    if (!Array.isArray(lista)) return []
    return lista
      .filter(e => e && e.status !== 'inativa' && num(e.valor) > 0)
      .map(e => ({
        id: e.id,
        nome: (e.nomeFantasia || e.razaoSocial || 'Empresa').trim(),
        categoria: EMPRESA_CAT_LABEL[e.categoria] || e.categoria || 'Outro',
        valor: num(e.valor),
      }))
      .sort((a, b) => b.valor - a.valor)
  } catch {
    return []
  }
}

function loadCardsCollapsed() {
  try {
    const raw = JSON.parse(localStorage.getItem(CARDS_COLLAPSED_KEY) || '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function saveCardsCollapsed(map) {
  try { localStorage.setItem(CARDS_COLLAPSED_KEY, JSON.stringify(map)) } catch { /* ignore */ }
}

function CardCategoria({ cor, icon: Icon, titulo, descricao, children, total, defaultCollapsed = false }) {
  const [collapsed, setCollapsed] = useState(() => {
    const saved = loadCardsCollapsed()
    if (Object.prototype.hasOwnProperty.call(saved, titulo)) return Boolean(saved[titulo])
    return defaultCollapsed
  })

  function toggle() {
    setCollapsed(prev => {
      const next = !prev
      const map = loadCardsCollapsed()
      map[titulo] = next
      saveCardsCollapsed(map)
      return next
    })
  }

  return (
    <div className="cat-card anim-fade-up" style={{ '--cat-color': cor }}>
      <button
        type="button"
        onClick={toggle}
        className="cat-card-header w-full text-left cursor-pointer"
        aria-expanded={!collapsed}
        title={collapsed ? 'Mostrar lista' : 'Esconder lista'}
      >
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${cor}22` }}>
          <Icon size={18} style={{ color: cor }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold" style={{ fontSize: 13, color: 'var(--text-primary)' }}>{titulo}</p>
          <p className="truncate" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{descricao}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="eyebrow">Previsão</p>
          <p className="font-black tnum" style={{ fontSize: 17, color: cor }}>{fmt(total)}</p>
        </div>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ml-1"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <ChevronDown
            size={16}
            style={{
              color: 'var(--text-secondary)',
              transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 0.18s ease',
            }}
          />
        </div>
      </button>
      {!collapsed && <div className="cat-card-body space-y-3">{children}</div>}
      {collapsed && (
        <div className="px-4 pb-3">
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Lista escondida — clique no cabeçalho para expandir
          </p>
        </div>
      )}
    </div>
  )
}

function Campo({ label, hint, value, onChange, type = 'number', prefix, suffix, disabled }) {
  return (
    <div>
      <label className="flex items-center gap-1 mb-1.5 font-semibold" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
        {label}
        {hint && (
          <span className="group relative cursor-help">
            <Info size={11} style={{ color: 'var(--text-tertiary)' }} />
            <span className="hidden group-hover:block absolute left-4 -top-1 z-10 w-48 rounded-xl px-2.5 py-1.5 shadow-xl"
              style={{ background: 'var(--bg-overlay)', border: '1px solid var(--border-soft)', fontSize: 11, color: 'var(--text-secondary)' }}>
              {hint}
            </span>
          </span>
        )}
      </label>
      <div className="flex items-stretch rounded-xl overflow-hidden input-dark" style={{ padding: 0 }}>
        {prefix && (
          <span className={`text-xs px-3 flex items-center flex-shrink-0 ${disabled ? 'opacity-50' : ''}`}
            style={{ color: 'var(--text-tertiary)', borderRight: '1px solid var(--border-subtle)' }}>
            {prefix}
          </span>
        )}
        <input type={type} min="0" step="any" value={value} disabled={disabled}
          onChange={e => onChange(e.target.value)}
          className={`flex-1 px-3 py-2 text-sm text-right bg-transparent border-0 focus:outline-none focus:ring-0 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
        {suffix && (
          <span className={`text-xs px-3 flex items-center flex-shrink-0 ${disabled ? 'opacity-50' : ''}`}
            style={{ color: 'var(--text-tertiary)', borderLeft: '1px solid var(--border-subtle)' }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

function iniciaisNome(nome) {
  return String(nome || '?').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase() || '?'
}

function ResumoCargoChip({ cargo, qtd, total, cor, pctTotal }) {
  const ativo = qtd > 0
  return (
    <div className="relative rounded-2xl p-3 overflow-hidden transition-all duration-200 hover:scale-[1.02]"
      style={{
        background: ativo
          ? `linear-gradient(145deg, ${cor}22 0%, ${cor}0a 55%, rgba(255,255,255,0.02) 100%)`
          : 'rgba(255,255,255,0.03)',
        border: `1.5px solid ${ativo ? cor + '45' : 'rgba(255,255,255,0.08)'}`,
        opacity: ativo ? 1 : 0.55,
        boxShadow: ativo ? `0 6px 18px ${cor}14` : 'none',
      }}>
      <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full pointer-events-none"
        style={{ background: cor, opacity: 0.12 }}/>
      <div className="relative z-10 mb-2">
        <CargoBalao cargo={cargo} size="sm" />
      </div>
      <p className="font-black tnum relative z-10" style={{ fontSize: 15, color: 'var(--text-primary)' }}>
        {fmt(total)}
      </p>
      <div className="flex items-center justify-between mt-1.5 relative z-10">
        <span className="font-semibold" style={{ fontSize: 10, color: ativo ? cor : 'var(--text-tertiary)' }}>
          {qtd} {qtd === 1 ? 'pessoa' : 'pessoas'}
        </span>
        {ativo && pctTotal > 0 && (
          <span className="font-bold tnum px-1.5 py-0.5 rounded-full"
            style={{ fontSize: 9, color: cor, background: `${cor}18` }}>
            {pctTotal.toFixed(0)}%
          </span>
        )}
      </div>
      {ativo && (
        <div className="mt-2.5 h-1.5 rounded-full overflow-hidden relative z-10" style={{ background: `${cor}22` }}>
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, pctTotal)}%`, background: `linear-gradient(90deg, ${cor}99, ${cor})` }}/>
        </div>
      )}
    </div>
  )
}

function GrupoCargoMembros({ cargo, categoria, membros, total, cor, pctTotal }) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{
        background: 'var(--bg-surface)',
        border: `1.5px solid ${cor}30`,
        boxShadow: `0 8px 28px ${cor}12`,
      }}>
      <div className="px-4 py-3.5 flex items-center gap-3"
        style={{ background: `linear-gradient(135deg, ${cor}28 0%, ${cor}08 100%)`, borderBottom: `1px solid ${cor}22` }}>
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, ${cor}, ${cor}bb)`,
            boxShadow: `0 4px 14px ${cor}40`,
          }}>
          <Briefcase size={17} style={{ color: '#fff' }}/>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <CargoBalao cargo={cargo} size="lg" />
            <span className="px-2.5 py-1 rounded-full font-semibold"
              style={{ fontSize: 9, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              {categoria}
            </span>
          </div>
          <p className="mt-1.5" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            {membros.length} {membros.length === 1 ? 'integrante' : 'integrantes'}
            {pctTotal > 0 && <span> · {pctTotal.toFixed(1)}% do total</span>}
          </p>
        </div>
        <div className="text-right flex-shrink-0 pl-2">
          <p className="eyebrow" style={{ fontSize: 8, color: `${cor}99` }}>Subtotal</p>
          <p className="font-black tnum" style={{ fontSize: 16, color: cor }}>{fmt(total)}</p>
        </div>
      </div>
      <div className="p-2 space-y-1">
        {membros.map((p, i) => {
          const valor = p.valor !== '' && p.valor != null ? Number(p.valor) || 0 : null
          return (
            <div key={pessoaId(p) || p.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors hover:bg-white/[0.03]"
              style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'transparent' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold"
                style={{
                  fontSize: 12,
                  color: '#fff',
                  background: `linear-gradient(135deg, ${cor}, ${cor}bb)`,
                  boxShadow: `0 3px 10px ${cor}35`,
                }}>
                {iniciaisNome(p.nome)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold truncate" style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                    {p.nome}
                  </p>
                  <CargoBalao cargo={p.cargo || cargo} size="sm" />
                </div>
                {p.areaAtuacao?.length > 0 && (
                  <p className="flex items-center gap-1 mt-0.5 truncate" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                    <MapPin size={9} style={{ color: cor, flexShrink: 0, opacity: 0.85 }}/>
                    {Array.isArray(p.areaAtuacao) ? p.areaAtuacao.join(', ') : p.areaAtuacao}
                  </p>
                )}
              </div>
              <span className="font-bold tnum flex-shrink-0 px-2.5 py-1 rounded-xl"
                style={{
                  fontSize: 12,
                  color: valor != null && valor > 0 ? cor : 'var(--text-tertiary)',
                  background: valor != null && valor > 0 ? `${cor}14` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${valor != null && valor > 0 ? cor + '28' : 'rgba(255,255,255,0.06)'}`,
                }}>
                {valor != null && valor > 0 ? fmt(valor) : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LinhaCalculo({ label, value, destaque }) {
  return (
    <div className="flex justify-between items-center"
      style={{ fontSize: destaque ? 12 : 11, fontWeight: destaque ? 700 : 400,
               color: destaque ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
      <span>{label}</span>
      <span style={{ color: destaque ? 'var(--accent-bright)' : undefined }}>{fmt(value)}</span>
    </div>
  )
}

const PREVISAO_KEY = 'previsao_data'

function loadPrevisaoData() {
  try {
    const atual = localStorage.getItem(PREVISAO_KEY)
    if (atual) return JSON.parse(atual)
    const legado = localStorage.getItem('previsao_gasto')
    if (legado) {
      const parsed = JSON.parse(legado)
      writeStorage(PREVISAO_KEY, parsed)
      return parsed
    }
  } catch { /* ignore */ }
  return {}
}

function bootPrevisao() {
  sincronizarEquipeComPrevisao({ gravar: true })
  const mesclado = mesclarPrevisaoCompleta()
  // Persiste valores recuperados (voluntários etc.) para não zerar no próximo save
  savePrevisaoSeguro({
    cabosPessoas: mesclado.cabosPessoas,
    ruaPessoas: mesclado.ruaPessoas,
    adminPessoas: mesclado.adminPessoas,
  })
  return mesclado
}

export default function PrevisaoGasto() {
  const [saved] = useState(bootPrevisao)
  const skipSave = useRef(true)
  const [equipeTick, setEquipeTick] = useState(0)
  const [empresasTick, setEmpresasTick] = useState(0)

  const [dataInicio, setDataInicio] = useState(saved.dataInicio ?? '2026-08-16')
  const [dataFim, setDataFim]       = useState(saved.dataFim ?? '2026-10-03')
  const [orcDisponivel, setOrcDisponivel] = useState(saved.orcDisponivel ?? '')
  const [hoverCategoria, setHoverCategoria] = useState(null)

  const [cabosPessoas, setCabosPessoas] = useState(saved.cabosPessoas ?? [])
  const [ruaPessoas, setRuaPessoas] = useState(saved.ruaPessoas ?? [])
  const [comites, setComites] = useState(saved.comites ?? [
    { id: 1, nome: 'Comitê Central', contrato: '', locador: '', dias: '', valorMensal: 12000 },
  ])
  const [combPreco, setCombPreco] = useState(saved.combPreco ?? 6.20)
  const [carros, setCarros] = useState(() => {
    const lista = saved.carros ?? [{ id: 1, nome: 'Carro 1', litrosMes: 100 }]
    return lista.map(c => normalizarCarroCombustivel(c, { dataInicio: saved.dataInicio, dataFim: saved.dataFim }))
  })
  const [adminPessoas, setAdminPessoas] = useState(saved.adminPessoas ?? [])
  const [ruaFreelancers, setRuaFreelancers] = useState(saved.ruaFreelancers ?? [])

  const aplicarDados = useCallback((d) => {
    if (!d || typeof d !== 'object') return
    if (d.dataInicio != null) setDataInicio(d.dataInicio)
    if (d.dataFim != null) setDataFim(d.dataFim)
    if (d.orcDisponivel != null) setOrcDisponivel(d.orcDisponivel)
    if (Array.isArray(d.cabosPessoas)) setCabosPessoas(d.cabosPessoas)
    if (Array.isArray(d.ruaPessoas)) setRuaPessoas(d.ruaPessoas)
    if (Array.isArray(d.comites)) setComites(d.comites)
    if (d.combPreco != null) setCombPreco(d.combPreco)
    if (Array.isArray(d.carros)) {
      setCarros(d.carros.map(c => normalizarCarroCombustivel(c, { dataInicio: d.dataInicio, dataFim: d.dataFim })))
    }
    if (Array.isArray(d.adminPessoas)) setAdminPessoas(d.adminPessoas)
    if (Array.isArray(d.ruaFreelancers)) setRuaFreelancers(d.ruaFreelancers)
  }, [])

  useEffect(() => {
    function recarregar() {
      skipSave.current = true
      aplicarDados(mesclarPrevisaoCompleta())
      setEquipeTick(t => t + 1)
    }
    recarregar()
    function onStorageChanged(e) {
      const key = e?.detail?.key || e?.key
      if (key === EMPRESAS_KEY) {
        setEmpresasTick(t => t + 1)
        return
      }
      if (e?.type === SYNC_EVENT && (e?.detail?.fromServer || e?.detail?.syncNow)) {
        recarregar()
        return
      }
      if (!e?.detail?.external) return
      if (key && key !== PREVISAO_KEY && key !== EQUIPE_KEY) return
      recarregar()
    }
    function onEquipePrevisao() {
      recarregar()
    }
    function onFocus() {
      setEmpresasTick(t => t + 1)
    }
    window.addEventListener(SYNC_STORAGE_EVENT, onStorageChanged)
    window.addEventListener(SYNC_EVENT, onStorageChanged)
    window.addEventListener(EQUIPE_PREVISAO_EVENT, onEquipePrevisao)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener(SYNC_STORAGE_EVENT, onStorageChanged)
      window.removeEventListener(SYNC_EVENT, onStorageChanged)
      window.removeEventListener(EQUIPE_PREVISAO_EVENT, onEquipePrevisao)
      window.removeEventListener('focus', onFocus)
    }
  }, [aplicarDados])

  const empresasPrevisao = useMemo(() => loadEmpresasPrevisao(), [empresasTick])
  const totalEmpresas = useMemo(
    () => empresasPrevisao.reduce((s, e) => s + e.valor, 0),
    [empresasPrevisao],
  )

  const equipeCompleta = useMemo(() => listaEquipeCompleta({
    dataInicio, dataFim, orcDisponivel,
    cabosPessoas, ruaPessoas, comites, combPreco, carros, adminPessoas,
  }), [dataInicio, dataFim, orcDisponivel, cabosPessoas, ruaPessoas, comites, combPreco, carros, adminPessoas, equipeTick])

  const cargosResumo = useMemo(() => resumoCargos(equipeCompleta), [equipeCompleta])
  const totalEquipeCargos = useMemo(() => cargosResumo.reduce((s, c) => s + c.total, 0), [cargosResumo])

  function marcarEditado() { skipSave.current = false }

  useEffect(() => {
    if (skipSave.current) return
    savePrevisaoSeguro({
      dataInicio, dataFim, orcDisponivel,
      cabosPessoas, ruaPessoas, comites, combPreco, carros, adminPessoas,
      ruaFreelancers,
    })
    flushAfterSave().catch(() => {})
  }, [dataInicio, dataFim, orcDisponivel, cabosPessoas, ruaPessoas, comites, combPreco, carros, adminPessoas, ruaFreelancers])

  const diasCampanha = useMemo(() => {
    if (!dataInicio || !dataFim) return 0
    const diff = Math.round((new Date(dataFim) - new Date(dataInicio)) / 86400000) + 1
    return diff >= 1 ? diff : 0
  }, [dataInicio, dataFim])
  const meses = useMemo(() => diasCampanha > 0 ? diasCampanha / 30.44 : 1, [diasCampanha])

  const fmtData = (iso) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : '—'

  const totalCabos  = useMemo(() => cabosPessoas.reduce((s, p) => s + (Number(p.valor) || 0), 0), [cabosPessoas])
  const pessoalRuaLista = useMemo(
    () => ruaPessoas.filter(p => normalizarCargo(p.cargo) === 'Pessoal de Rua'),
    [ruaPessoas],
  )
  const apoiadoresLista = useMemo(
    () => ruaPessoas.filter(p => normalizarCargo(p.cargo) === 'Apoiador'),
    [ruaPessoas],
  )
  const multiplicadoresLista = useMemo(
    () => ruaPessoas.filter(p => normalizarCargo(p.cargo) === 'Multiplicador'),
    [ruaPessoas],
  )
  const igrejaLista = useMemo(
    () => ruaPessoas.filter(p => normalizarCargo(p.cargo) === 'Igreja'),
    [ruaPessoas],
  )
  const ruaOutrosLista = useMemo(
    () => ruaPessoas.filter(p => {
      const c = normalizarCargo(p.cargo)
      return !['Pessoal de Rua', 'Apoiador', 'Multiplicador', 'Igreja', 'Comunidade WhatsApp'].includes(c)
    }),
    [ruaPessoas],
  )
  const totalPessoalRua = useMemo(
    () => pessoalRuaLista.reduce((s, p) => s + (Number(p.valor) || 0), 0),
    [pessoalRuaLista],
  )
  const totalApoiadores = useMemo(
    () => apoiadoresLista.reduce((s, p) => s + (Number(p.valor) || 0), 0),
    [apoiadoresLista],
  )
  const totalMultiplicadores = useMemo(
    () => multiplicadoresLista.reduce((s, p) => s + (Number(p.valor) || 0), 0),
    [multiplicadoresLista],
  )
  const totalIgreja = useMemo(
    () => igrejaLista.reduce((s, p) => s + (Number(p.valor) || 0), 0),
    [igrejaLista],
  )
  const totalRuaOutros = useMemo(
    () => ruaOutrosLista.reduce((s, p) => s + (Number(p.valor) || 0), 0),
    [ruaOutrosLista],
  )
  const totalRua = totalPessoalRua + totalApoiadores + totalMultiplicadores + totalIgreja + totalRuaOutros
  // Valor do contrato = total na previsão (não rateia por mês/dia)
  const comitesComCusto = useMemo(() => comites.map(c => {
    const diasUsados = num(c.dias) > 0 ? num(c.dias) : diasCampanha
    const totalPeriodo = num(c.valorMensal)
    return { ...c, diasUsados, totalPeriodo }
  }), [comites, diasCampanha])
  const totalComite = useMemo(() => comitesComCusto.reduce((s, c) => s + c.totalPeriodo, 0), [comitesComCusto])
  const carrosComCusto = useMemo(() => carros.map(c => {
    const cedencias = (c.cedencias || []).map(ce => {
      const litros = num(ce.litros)
      const total = litros * num(combPreco)
      return { ...ce, litros, total }
    })
    const totalLitros = cedencias.reduce((s, ce) => s + ce.litros, 0)
    const totalPeriodo = cedencias.reduce((s, ce) => s + ce.total, 0)
    return { ...c, cedencias, totalLitros, custoPorLitro: num(combPreco), totalPeriodo }
  }), [carros, combPreco])
  const totalComb = useMemo(() => carrosComCusto.reduce((s, c) => s + c.totalPeriodo, 0), [carrosComCusto])
  const totalAdmin  = useMemo(() => adminPessoas.reduce((s, p) => s + (Number(p.valor) || 0), 0), [adminPessoas])
  const totalFreelancers = useMemo(() => totalRuaFreelancers(ruaFreelancers), [ruaFreelancers])
  const qtdFreelancers = useMemo(() => qtdPessoasFreelancers(ruaFreelancers), [ruaFreelancers])

  const adminCards = useMemo(() => {
    const ordem = cargosAdmin()
    const grupos = {}
    for (const p of adminPessoas) {
      const cargo = normalizarCargo(p.cargo) || 'Outro'
      if (!grupos[cargo]) grupos[cargo] = []
      grupos[cargo].push(p)
    }
    const conhecidos = ordem.map(cargo => ({
      cargo,
      pessoas: grupos[cargo] || [],
      total: (grupos[cargo] || []).reduce((s, p) => s + (Number(p.valor) || 0), 0),
      cor: corCargo(cargo),
    }))
    const extras = Object.keys(grupos)
      .filter(c => !ordem.includes(c))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map(cargo => ({
        cargo,
        pessoas: grupos[cargo],
        total: grupos[cargo].reduce((s, p) => s + (Number(p.valor) || 0), 0),
        cor: corCargo(cargo),
      }))
    return [...conhecidos, ...extras]
  }, [adminPessoas])

  const totalGeral     = totalCabos + totalRua + totalFreelancers + totalComite + totalComb + totalAdmin + totalEmpresas
  const orcDispNum     = num(orcDisponivel)
  const saldoFinal     = orcDispNum - totalGeral
  const pctUtilizado   = orcDispNum > 0 ? Math.min(100, (totalGeral / orcDispNum) * 100) : 0
  const temOrcamento   = orcDispNum > 0

  // Publica resumo canônico (categorias = cards da Previsão, Adm. por cargo)
  useEffect(() => {
    publicarPrevisaoResumo({
      dataInicio, dataFim, orcDisponivel,
      cabosPessoas, ruaPessoas, comites, combPreco, carros, adminPessoas,
      ruaFreelancers,
    }, { mesclarEquipe: false })
  }, [totalGeral, orcDispNum, saldoFinal, pctUtilizado, temOrcamento, totalEmpresas, totalCabos, totalPessoalRua, totalApoiadores, totalMultiplicadores, totalIgreja, totalFreelancers, totalComite, totalComb, totalAdmin, dataInicio, dataFim, orcDisponivel, cabosPessoas, ruaPessoas, comites, combPreco, carros, adminPessoas, ruaFreelancers])

  // Budget alerts
  const alertaOrcamento = useMemo(() => {
    if (!temOrcamento) return null
    if (saldoFinal < 0) return { tipo: 'critico', msg: 'Orçamento excedido! Ajuste os valores.' }
    if (pctUtilizado > 90) return { tipo: 'alerta', msg: 'Orçamento quase esgotado (90%+)' }
    if (pctUtilizado > 75) return { tipo: 'aviso', msg: 'Orçamento em 75%+ da capacidade' }
    return null
  }, [temOrcamento, saldoFinal, pctUtilizado])

  // Budget stats colors
  const budgetStats = useMemo(() => [
    { label: 'Previsão de Gasto', value: fmt(totalGeral), cor: '#1d4ed8' },
    { label: 'Utilização', value: pctUtilizado.toFixed(1) + '%', cor: pctUtilizado >= 100 ? '#ef4444' : pctUtilizado >= 80 ? '#f59e0b' : '#10b981' },
    { label: saldoFinal >= 0 ? 'Saldo Livre' : 'Déficit', value: fmt(Math.abs(saldoFinal)), cor: saldoFinal >= 0 ? '#10b981' : '#ef4444' },
  ], [totalGeral, pctUtilizado, saldoFinal])

  // Export/Print functions
  async function salvarTudo() {
    const resumo = publicarPrevisaoResumo({
      dataInicio, dataFim, orcDisponivel,
      cabosPessoas, ruaPessoas, comites, combPreco, carros, adminPessoas,
      ruaFreelancers,
    }, { mesclarEquipe: false })
    await saveToCloud({
      previsao_data: {
        dataInicio, dataFim, orcDisponivel,
        cabosPessoas, ruaPessoas, comites, combPreco, carros, adminPessoas,
        ruaFreelancers,
      },
      previsao_resumo: resumo,
    })
  }

  function exportarDados() {
    const dados = {
      periodo: { inicio: dataInicio, fim: dataFim, dias: diasCampanha, meses: meses.toFixed(1) },
      orcamento: { disponivel: orcDispNum, totalGeral, saldoFinal, pctUtilizado },
      categorias: {
        cabos: totalCabos,
        rua: totalPessoalRua,
        apoiadores: totalApoiadores,
        multiplicadores: totalMultiplicadores,
        igreja: totalIgreja,
        freelancersRua: totalFreelancers,
        comite: totalComite,
        combustivel: totalComb,
        administrativo: totalAdmin,
        empresas: totalEmpresas,
      },
      detalhes: {
        cabosPessoas,
        ruaPessoas,
        ruaFreelancers,
        comites: comitesComCusto,
        carros: carrosComCusto,
        adminPessoas,
        empresas: empresasPrevisao,
        combustivel: { preco: combPreco },
      },
    }
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `previsao-orcamento-${dataInicio}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function imprimirRelatorio() {
    window.print()
  }

  function addCabo(p)    { marcarEditado(); setCabosPessoas(prev => [...prev, p]) }
  function updateCabo(id, d) { marcarEditado(); setCabosPessoas(prev => prev.map(p => p.id === id ? { ...p, ...d } : p)) }
  function removeCabo(id)    { marcarEditado(); setCabosPessoas(prev => prev.filter(p => p.id !== id)) }

  function addRua(p) {
    marcarEditado()
    setRuaPessoas(prev => [...prev, { ...p, cargo: 'Pessoal de Rua' }])
  }
  function updateRua(id, d) {
    marcarEditado()
    setRuaPessoas(prev => prev.map(p => p.id === id ? { ...p, ...d, cargo: 'Pessoal de Rua' } : p))
  }
  function removeRua(id) { marcarEditado(); setRuaPessoas(prev => prev.filter(p => p.id !== id)) }

  function addApoiador(p) {
    marcarEditado()
    setRuaPessoas(prev => [...prev, { ...p, cargo: 'Apoiador', valor: 0 }])
  }
  function updateApoiador(id, d) {
    marcarEditado()
    setRuaPessoas(prev => prev.map(p => p.id === id ? { ...p, ...d, cargo: 'Apoiador', valor: 0 } : p))
  }
  function removeApoiador(id) { marcarEditado(); setRuaPessoas(prev => prev.filter(p => p.id !== id)) }

  function addMultiplicador(p) {
    marcarEditado()
    setRuaPessoas(prev => [...prev, { ...p, cargo: 'Multiplicador' }])
  }
  function updateMultiplicador(id, d) {
    marcarEditado()
    setRuaPessoas(prev => prev.map(p => p.id === id ? { ...p, ...d, cargo: 'Multiplicador' } : p))
  }
  function removeMultiplicador(id) { marcarEditado(); setRuaPessoas(prev => prev.filter(p => p.id !== id)) }

  function addIgreja(p) {
    marcarEditado()
    setRuaPessoas(prev => [...prev, { ...p, cargo: 'Igreja' }])
  }
  function updateIgreja(id, d) {
    marcarEditado()
    setRuaPessoas(prev => prev.map(p => p.id === id ? { ...p, ...d, cargo: 'Igreja' } : p))
  }
  function removeIgreja(id) { marcarEditado(); setRuaPessoas(prev => prev.filter(p => p.id !== id)) }

  function addAdmin(p, cargo) {
    marcarEditado()
    setAdminPessoas(prev => [...prev, { ...p, cargo: cargo || p.cargo || 'Coordenador' }])
  }
  function updateAdmin(id, d, cargo) {
    marcarEditado()
    // Preferir o cargo escolhido no formulário (permite trocar Coordenador → Administrativo etc.)
    setAdminPessoas(prev => prev.map(p => p.id === id
      ? { ...p, ...d, cargo: d.cargo || cargo || p.cargo }
      : p))
  }
  function removeAdmin(id) { marcarEditado(); setAdminPessoas(prev => prev.filter(p => p.id !== id)) }

  function adicionarComite() {
    marcarEditado()
    const novoId = comites.length === 0 ? 1 : Math.max(...comites.map(c => c.id)) + 1
    setComites(prev => [...prev, { id: novoId, nome: `Comitê ${prev.length + 1}`, contrato: '', locador: '', dias: '', valorMensal: 0 }])
  }
  function removerComite(id)    { marcarEditado(); setComites(prev => prev.filter(c => c.id !== id)) }
  function atualizarComite(id, campo, valor) { marcarEditado(); setComites(prev => prev.map(c => c.id === id ? { ...c, [campo]: valor } : c)) }

  function adicionarCarro() {
    marcarEditado()
    const novoId = carros.length === 0 ? 1 : Math.max(...carros.map(c => c.id)) + 1
    const novoNum = carros.length + 1
    setCarros(prev => [...prev, {
      id: novoId,
      nome: `Carro ${novoNum}`,
      cedencias: [{ id: gerarCedenciaId(), dataInicio: dataInicio, dataFim: dataFim, litros: 100 }],
    }])
  }

  function removerCarro(id) {
    marcarEditado()
    setCarros(prev => prev.filter(c => c.id !== id))
  }

  const equipeMembros = useMemo(() => loadEquipe(), [equipeTick])

  function vincularCarroMembro(carroId, equipeId) {
    marcarEditado()
    const membro = equipeMembros.find(m => m.id === equipeId)
    setCarros(prev => {
      const next = prev.map(c => {
        if (c.id !== carroId) return c
        if (!equipeId) return { ...c, equipeId: undefined }
        return { ...c, equipeId, nome: membro ? nomeVeiculoMembro(membro) : c.nome }
      })
      const carro = next.find(c => c.id === carroId)
      if (carro?.equipeId) sincronizarCombustivelCarroParaMembro(carro)
      return next
    })
  }

  function atualizarCarro(id, campo, valor) {
    marcarEditado()
    setCarros(prev => {
      const next = prev.map(c => c.id === id ? { ...c, [campo]: valor } : c)
      const carro = next.find(c => c.id === id)
      if (carro?.equipeId) sincronizarCombustivelCarroParaMembro(carro)
      return next
    })
  }

  function atualizarCedencia(carroId, cedenciaId, campo, valor) {
    marcarEditado()
    setCarros(prev => {
      const next = prev.map(c => {
        if (c.id !== carroId) return c
        const cedencias = (c.cedencias || []).map(ce =>
          ce.id === cedenciaId ? { ...ce, [campo]: valor } : ce
        )
        return { ...c, cedencias }
      })
      const carro = next.find(c => c.id === carroId)
      if (carro?.equipeId) sincronizarCombustivelCarroParaMembro(carro)
      return next
    })
  }

  function adicionarCedencia(carroId) {
    marcarEditado()
    setCarros(prev => prev.map(c => {
      if (c.id !== carroId) return c
      return {
        ...c,
        cedencias: [...(c.cedencias || []), { id: gerarCedenciaId(), dataInicio: dataInicio, dataFim: dataFim, litros: '' }],
      }
    }))
  }

  function removerCedencia(carroId, cedenciaId) {
    marcarEditado()
    setCarros(prev => prev.map(c => {
      if (c.id !== carroId) return c
      const cedencias = (c.cedencias || []).filter(ce => ce.id !== cedenciaId)
      return {
        ...c,
        cedencias: cedencias.length ? cedencias : [{ id: gerarCedenciaId(), dataInicio: dataInicio, dataFim: dataFim, litros: '' }],
      }
    }))
  }

  const categorias = [
    { nome: 'Cabos Eleitorais',   valor: totalCabos,  cor: CORES[0], icon: UserCheck, qtd: cabosPessoas.length },
    { nome: 'Pessoal de Rua',     valor: totalPessoalRua, cor: CORES[1], icon: Users, qtd: pessoalRuaLista.length },
    { nome: 'Rua Freelancer',     valor: totalFreelancers, cor: '#a855f7', icon: Footprints, qtd: qtdFreelancers },
    { nome: 'Apoiadores',         valor: totalApoiadores, cor: '#10b981', icon: Users, qtd: apoiadoresLista.length },
    { nome: 'Multiplicadores',    valor: totalMultiplicadores, cor: '#ea580c', icon: Users, qtd: multiplicadoresLista.length },
    { nome: 'Igreja',             valor: totalIgreja, cor: '#22d3ee', icon: Church, qtd: igrejaLista.length },
    ...(totalRuaOutros > 0
      ? [{ nome: 'Outros (rua)', valor: totalRuaOutros, cor: '#94a3b8', icon: Users, qtd: ruaOutrosLista.length }]
      : []),
    { nome: 'Aluguel de Comitê',  valor: totalComite, cor: CORES[2], icon: Building2, qtd: null },
    { nome: 'Combustível',        valor: totalComb,   cor: CORES[3], icon: Fuel, qtd: carros.length },
    { nome: 'Equipe Adm.',        valor: totalAdmin,  cor: CORES[4], icon: Briefcase, qtd: adminPessoas.length },
    { nome: 'Empresas',           valor: totalEmpresas, cor: '#d4af5f', icon: Building2, qtd: empresasPrevisao.length },
  ]


  const categoriasOrdenadas = useMemo(
    () => [...categorias].sort((a, b) => b.valor - a.valor),
    [categorias]
  )

  const maiorCategoria = categoriasOrdenadas[0]
  const pctMaior = totalGeral > 0 && maiorCategoria
    ? (maiorCategoria.valor / totalGeral) * 100
    : 0

  const categoriaStats = useMemo(() => categorias.map(c => ({
    label: c.nome,
    valor: fmt(c.valor),
    hint: `${totalGeral > 0 ? ((c.valor / totalGeral) * 100).toFixed(1) : '0.0'}% do total`,
    cor: c.cor,
  })), [categorias, totalGeral])

  const orcCor = !temOrcamento ? '#10b981'
    : saldoFinal < 0 ? '#ef4444'
    : pctUtilizado >= 90 ? '#f59e0b'
    : pctUtilizado >= 75 ? '#fbbf24'
    : '#10b981'

  return (
    <ModuleWrap className="pb-10 flex-1 overflow-auto">

      <PageHeader
        eyebrow="Operação"
        title="Previsão de Gasto"
        subtitle="Cada item entra na previsão na hora — edite ou remova quando quiser"
        icon={TrendingUp}
        actions={
          <>
            <SaveButton onSave={salvarTudo} variant="ghost" />
            <Button variant="ghost" onClick={exportarDados} icon={Download}>Exportar</Button>
            <Button onClick={imprimirRelatorio} icon={Printer}>Imprimir</Button>
          </>
        }
      />

      {alertaOrcamento && (
        <Card className="mb-5 p-4 flex items-center gap-3 anim-fade-up"
          style={{
            background: alertaOrcamento.tipo === 'critico' ? 'rgba(239,68,68,0.1)' : alertaOrcamento.tipo === 'alerta' ? 'rgba(245,158,11,0.1)' : 'rgba(59,130,246,0.08)',
            borderColor: alertaOrcamento.tipo === 'critico' ? 'rgba(239,68,68,0.3)' : alertaOrcamento.tipo === 'alerta' ? 'rgba(245,158,11,0.3)' : 'rgba(59,130,246,0.25)',
          }}>
          <AlertTriangle size={18} style={{
            color: alertaOrcamento.tipo === 'critico' ? '#f87171' : alertaOrcamento.tipo === 'alerta' ? '#fbbf24' : '#60a5fa',
            flexShrink: 0,
          }} />
          <p className="font-semibold" style={{ fontSize: 13, color: 'var(--text-primary)' }}>{alertaOrcamento.msg}</p>
        </Card>
      )}

      <Card className="mb-6 p-4 anim-fade-up">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Calendar size={14} style={{ color: 'var(--accent-bright)' }} />
            <span className="eyebrow">Período da campanha</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Início</span>
            <input type="date" value={dataInicio} max={dataFim || undefined}
              onChange={e => { marcarEditado(); setDataInicio(e.target.value) }}
              className="input-dark px-3 py-2 text-sm disabled:opacity-50" />
            <span style={{ color: 'var(--text-faint)' }}>→</span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Fim</span>
            <input type="date" value={dataFim} min={dataInicio || undefined}
              onChange={e => { marcarEditado(); setDataFim(e.target.value) }}
              className="input-dark px-3 py-2 text-sm disabled:opacity-50" />
          </div>
          {diasCampanha > 0 ? (
            <Pill color="#34d399" dot>
              {diasCampanha} dias · ≈ {meses.toFixed(1)} meses
            </Pill>
          ) : (
            <Pill color="#f87171">Selecione datas válidas</Pill>
          )}
        </div>
      </Card>

      <StatGrid stats={categoriaStats} columns={5} className="mb-6" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <Card className="p-7 flex flex-col justify-between anim-fade-up"
          style={{ minHeight: 190, background: 'var(--bg-surface)', borderColor: 'rgba(212,175,95,0.22)' }}>
          <div>
            <p className="eyebrow" style={{ color: 'var(--gold)' }}>Total previsto da campanha</p>
            <p className="font-extrabold tnum mt-2" style={{ fontSize: 28, lineHeight: 1.15, color: 'var(--gold-bright)', letterSpacing: '-0.01em' }}>
              {fmt(totalGeral)}
            </p>
          </div>
          <div className="mt-4 pt-4 flex items-end justify-between gap-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Média por mês</p>
              <p className="font-bold tnum" style={{ fontSize: 16, color: 'var(--text-primary)' }}>
                {fmt(meses > 0 ? totalGeral / meses : 0)}
              </p>
            </div>
            <ProgressRing pct={temOrcamento ? Math.min(pctUtilizado, 100) : 0} size={88} stroke={7}
              from={orcCor} to={`${orcCor}99`} label={temOrcamento ? 'do orçamento' : 'sem orç.'} />
          </div>
        </Card>

        <Card className="lg:col-span-2 p-6 anim-fade-up">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(251,191,36,0.12)' }}>
                <Wallet size={18} style={{ color: '#fbbf24' }} />
              </div>
              <div>
                <p className="font-bold" style={{ fontSize: 14, color: 'var(--text-primary)' }}>Orçamento Disponível</p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Quanto você tem para investir no total</p>
              </div>
            </div>
            <div className="flex items-stretch rounded-xl overflow-hidden input-dark" style={{ padding: 0, maxWidth: 220 }}>
              <span className="text-sm px-3 flex items-center" style={{ color: 'var(--text-tertiary)', borderRight: '1px solid var(--border-subtle)' }}>R$</span>
              <input type="number" min="0" step="any" placeholder="0,00"
                value={orcDisponivel}
                onChange={e => { marcarEditado(); setOrcDisponivel(e.target.value) }}
                className="w-full px-3 py-2.5 text-sm font-bold text-right bg-transparent border-0 focus:outline-none disabled:opacity-50" />
            </div>
          </div>

          {temOrcamento ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                {budgetStats.map(({ label, value, cor }) => (
                  <div key={label} className="rounded-2xl p-3 text-center"
                    style={{ background: `${cor}10`, border: `1px solid ${cor}28` }}>
                    <p className="eyebrow" style={{ color: cor }}>{label}</p>
                    <p className="font-black tnum mt-1" style={{ fontSize: 16, color: cor }}>{value}</p>
                  </div>
                ))}
              </div>
              <div>
                <div className="flex justify-between mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  <span>R$ 0</span>
                  <span className={pctUtilizado >= 100 ? 'font-bold' : ''} style={{ color: pctUtilizado >= 100 ? '#f87171' : undefined }}>
                    {pctUtilizado >= 100 ? 'Acima do orçamento' : `${(100 - pctUtilizado).toFixed(1)}% disponível`}
                  </span>
                  <span>{fmt(orcDispNum)}</span>
                </div>
                <div className="w-full rounded-full overflow-hidden" style={{ height: 10, background: 'var(--bg-raised)' }}>
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(100, pctUtilizado)}%`,
                      background: pctUtilizado >= 100
                        ? 'linear-gradient(90deg,#ef4444,#dc2626)'
                        : pctUtilizado >= 80
                        ? 'linear-gradient(90deg,#f59e0b,#d97706)'
                        : 'linear-gradient(90deg,#22c55e,#16a34a)',
                      boxShadow: `0 0 12px ${orcCor}44`,
                    }} />
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8" style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              Preencha o orçamento disponível para ver a análise de utilização
            </div>
          )}
        </Card>
      </div>

      {/* Cards calculadoras */}
      <div className="space-y-5">

        {/* Equipe por cargo — todos os 9 cargos da aba Equipe */}
        <CardCategoria cor="#6366f1" icon={Users} titulo="Equipe por Cargo"
          descricao={`${equipeCompleta.length} membro${equipeCompleta.length !== 1 ? 's' : ''} · sincronizado com a aba Equipe`}
          total={totalEquipeCargos}>
          <div className="flex items-center justify-between gap-3 mb-4 p-3 rounded-2xl"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)' }}>
            <p className="flex-1" style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Cadastre na aba <strong style={{ color: '#a5b4fc' }}>Equipe</strong> com cargo e remuneração — cada cargo aparece abaixo com totais e integrantes
            </p>
            <button type="button" onClick={() => {
              skipSave.current = true
              aplicarDados(mesclarPrevisaoCompleta())
              setEquipeTick(t => t + 1)
            }}
              className="btn-primary flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl flex-shrink-0">
              <RefreshCw size={12}/> Atualizar
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
            {cargosResumo.map(({ cargo, qtd, total }) => {
              const cor = corCargo(cargo)
              const pctTotal = totalEquipeCargos > 0 ? (total / totalEquipeCargos) * 100 : 0
              return (
                <ResumoCargoChip key={cargo} cargo={cargo} qtd={qtd} total={total} cor={cor} pctTotal={pctTotal}/>
              )
            })}
          </div>
          <div className="mb-4 px-1">
            <p className="font-bold mb-2" style={{ fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
              TODOS OS CARGOS
            </p>
            <LegendaCargos />
          </div>
          {equipeCompleta.length === 0 ? (
            <div className="text-center py-10 rounded-2xl"
              style={{ fontSize: 12, color: 'var(--text-tertiary)', border: '1.5px dashed rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)' }}>
              <Users size={28} className="mx-auto mb-2 opacity-30"/>
              Nenhum membro na Equipe — cadastre em Equipe com um dos cargos: {CARGOS.join(', ')}
            </div>
          ) : (
            <div className="space-y-4 max-h-[28rem] overflow-y-auto pr-0.5">
              {cargosResumo.filter(c => c.qtd > 0).map(({ cargo, membros, total, categoria }) => {
                const cor = corCargo(cargo)
                const pctTotal = totalEquipeCargos > 0 ? (total / totalEquipeCargos) * 100 : 0
                return (
                  <GrupoCargoMembros key={cargo} cargo={cargo} categoria={categoria}
                    membros={membros} total={total} cor={cor} pctTotal={pctTotal}/>
                )
              })}
            </div>
          )}
        </CardCategoria>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <CardCategoria cor={CORES[0]} icon={UserCheck} titulo="Cabos Eleitorais"
            descricao={`${cabosPessoas.length} cabo${cabosPessoas.length !== 1 ? 's' : ''} · pagamento único por contrato`}
            total={totalCabos}>
            <ListaPessoas pessoas={cabosPessoas} onAdd={addCabo} onUpdate={updateCabo}
              onRemove={removeCabo} valorPadrao={10000} tipo="cabo" cor={CORES[0]} />
          </CardCategoria>

          {/* 2 - Pessoal de Rua (somente esse cargo) */}
          <CardCategoria cor={CORES[1]} icon={Users} titulo="Pessoal de Rua"
            descricao={`${pessoalRuaLista.length} pessoa${pessoalRuaLista.length !== 1 ? 's' : ''} · valor total por contrato`}
            total={totalPessoalRua}>
            <ListaPessoas pessoas={pessoalRuaLista} onAdd={addRua} onUpdate={updateRua}
              onRemove={removeRua} valorPadrao={2000} tipo="rua" cor={CORES[1]} />
          </CardCategoria>

          {/* 2a - Equipe de Rua Freelancer (qtd × diária × dias) */}
          <CardCategoria cor="#a855f7" icon={Footprints} titulo="Equipe de Rua Freelancer"
            descricao={`${qtdFreelancers} pessoa${qtdFreelancers !== 1 ? 's' : ''} · ${ruaFreelancers.length} linha${ruaFreelancers.length !== 1 ? 's' : ''} · qtd × diária × dias`}
            total={totalFreelancers}>
            <EquipeRuaFreelancers
              compact
              onChange={(lista) => {
                marcarEditado()
                setRuaFreelancers(lista)
              }}
            />
          </CardCategoria>

          {/* 2b - Apoiadores (ex-Assessor / Voluntário · sem remuneração) */}
          <CardCategoria cor="#10b981" icon={Users} titulo="Apoiadores"
            descricao={`${apoiadoresLista.length} apoiador${apoiadoresLista.length !== 1 ? 'es' : ''} · sem remuneração por enquanto`}
            total={totalApoiadores} defaultCollapsed={apoiadoresLista.length > 8}>
            <ListaPessoas pessoas={apoiadoresLista} onAdd={addApoiador} onUpdate={updateApoiador}
              onRemove={removeApoiador} valorPadrao={0} tipo="voluntario" cor="#10b981" />
          </CardCategoria>

          {/* 2c - Multiplicadores */}
          <CardCategoria cor="#ea580c" icon={Users} titulo="Multiplicadores"
            descricao={`${multiplicadoresLista.length} multiplicador${multiplicadoresLista.length !== 1 ? 'es' : ''} · valor total por contrato`}
            total={totalMultiplicadores} defaultCollapsed={multiplicadoresLista.length > 8}>
            <ListaPessoas pessoas={multiplicadoresLista} onAdd={addMultiplicador} onUpdate={updateMultiplicador}
              onRemove={removeMultiplicador} valorPadrao={0} tipo="multiplicador" cor="#ea580c" />
          </CardCategoria>

          {/* 2d - Igreja */}
          <CardCategoria cor="#22d3ee" icon={Church} titulo="Igreja"
            descricao={`${igrejaLista.length} pessoa${igrejaLista.length !== 1 ? 's' : ''} · valor total por contrato`}
            total={totalIgreja} defaultCollapsed={igrejaLista.length > 8}>
            <ListaPessoas pessoas={igrejaLista} onAdd={addIgreja} onUpdate={updateIgreja}
              onRemove={removeIgreja} valorPadrao={0} tipo="rua" cor="#22d3ee" cargoFixo="Igreja" />
          </CardCategoria>

          {/* 3 - Aluguel de Comitê */}
          <CardCategoria cor={CORES[2]} icon={Building2} titulo="Aluguel de Comitê"
            descricao={`${comites.length} ${comites.length === 1 ? 'comitê' : 'comitês'} · valor por contrato`}
            total={totalComite}>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'rgba(203,213,235,0.45)' }}>
                {comites.length === 0 ? 'Nenhum comitê adicionado' : `${comites.length} comitê${comites.length !== 1 ? 's' : ''}`}
              </span>
              
                <button onClick={adicionarComite}
                  className="flex items-center gap-1.5 text-white font-bold px-3 py-2 rounded-xl whitespace-nowrap transition-all"
                  style={{ background: CORES[2], fontSize: 12, boxShadow: `0 4px 12px ${CORES[2]}55` }}>
                  <Plus size={13} /> Adicionar comitê
                </button>
              
            </div>
            <div className="space-y-2">
              {comites.length === 0 && (
                <div className="text-center py-4 rounded-xl"
                  style={{ fontSize: 12, color: 'rgba(203,213,235,0.45)', background: 'var(--bg-surface)', border: '1.5px dashed rgba(255,255,255,0.12)' }}>
                  Nenhum comitê adicionado
                </div>
              )}
              {comitesComCusto.map(c => (
                <div key={c.id} className="rounded-2xl p-3"
                  style={{ background: 'var(--bg-surface)', border: '1.5px solid rgba(255,255,255,0.12)' }}>
                  <div className="flex items-center justify-between mb-2.5">
                    <input value={c.nome}
                      onChange={e => atualizarComite(c.id, 'nome', e.target.value)}
                      placeholder="Nome do comitê"
                      className="text-xs font-bold txt-2 bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1 flex-1 min-w-0 disabled:cursor-not-allowed" />
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-bold" style={{ fontSize: 12, color: CORES[2] }}>
                        {fmt(c.totalPeriodo)}
                      </span>
                      
                        <button onClick={() => removerComite(c.id)}
                          className="p-1 rounded-lg hov-srf transition-colors">
                          <Trash2 size={12} style={{ color: '#f87171' }} />
                        </button>
                      
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Campo label="Nº do contrato" type="text" value={c.contrato}
                      onChange={v => atualizarComite(c.id, 'contrato', v)} />
                    <Campo label="Nº do locador" type="text" value={c.locador}
                      onChange={v => atualizarComite(c.id, 'locador', v)} />
                    <Campo label="Dias contratados" suffix="dias" value={c.dias}
                      onChange={v => atualizarComite(c.id, 'dias', v)} />
                    <Campo label="Valor do contrato (aluguel + água + luz)" prefix="R$" value={c.valorMensal}
                      onChange={v => atualizarComite(c.id, 'valorMensal', v)} />
                  </div>
                  <p className="mt-2" style={{ fontSize: 10, color: 'rgba(203,213,235,0.45)' }}>
                    Total na previsão: {fmt(c.totalPeriodo)}
                    {c.diasUsados > 0 && (
                      <span> · {c.diasUsados} dias contratados{num(c.dias) <= 0 ? ' (período da campanha)' : ''}</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
            <div className="pt-2 space-y-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
              {comitesComCusto.length > 1 && comitesComCusto.map(c => (
                <LinhaCalculo key={c.id} label={c.nome || 'Comitê'} value={c.totalPeriodo} />
              ))}
              <LinhaCalculo
                label={`Total ${comites.length} ${comites.length === 1 ? 'comitê' : 'comitês'}`}
                value={totalComite} destaque />
            </div>
          </CardCategoria>

          {/* 4 - Combustível */}
          <CardCategoria cor={CORES[3]} icon={Fuel}
            titulo="Combustível"
            descricao={`${carros.length} ${carros.length === 1 ? 'veículo' : 'veículos'} · R$ ${num(combPreco).toFixed(2)}/L`}
            total={totalComb}>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Campo label="Preço do combustível (R$/L)" prefix="R$" value={combPreco}
                  hint="Preço médio atual da gasolina em Blumenau/SC"
                  onChange={v => { marcarEditado(); setCombPreco(v) }} />
              </div>
              
                <button onClick={adicionarCarro}
                  className="flex items-center gap-1.5 text-white font-bold px-3 py-2.5 rounded-xl whitespace-nowrap transition-all"
                  style={{ background: CORES[3], fontSize: 12, boxShadow: `0 4px 12px ${CORES[3]}55` }}>
                  <Plus size={13} /> Adicionar veículo
                </button>
              
            </div>
            <div className="space-y-2">
              {carros.length === 0 && (
                <div className="text-center py-4 rounded-xl"
                  style={{ fontSize: 12, color: 'rgba(203,213,235,0.45)', background: 'var(--bg-surface)', border: '1.5px dashed rgba(255,255,255,0.12)' }}>
                  Nenhum veículo adicionado
                </div>
              )}
              {carrosComCusto.map(carro => (
                <div key={carro.id} className="rounded-2xl p-3"
                  style={{ background: 'var(--bg-surface)', border: '1.5px solid rgba(255,255,255,0.12)' }}>
                  <div className="flex items-center justify-between mb-2.5">
                    <input value={carro.nome}
                      onChange={e => atualizarCarro(carro.id, 'nome', e.target.value)}
                      className="text-xs font-bold txt-2 bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-purple-400 rounded px-1 w-28 disabled:cursor-not-allowed" />
                    <div className="flex items-center gap-2">
                      <span className="font-bold" style={{ fontSize: 12, color: CORES[3] }}>
                        {fmt(carro.totalPeriodo)}
                      </span>
                      
                        <button onClick={() => removerCarro(carro.id)}
                          className="p-1 rounded-lg hov-srf transition-colors">
                          <Trash2 size={12} style={{ color: '#f87171' }} />
                        </button>
                      
                    </div>
                  </div>

                  <div className="space-y-2">
                    {(carro.cedencias || []).map((ced, ci) => (
                      <div key={ced.id} className="rounded-xl p-2.5"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold txt-3" style={{ fontSize: 10 }}>
                            Cedência {ci + 1}
                          </span>
                          {(carro.cedencias?.length || 0) > 1 && (
                            <button type="button" onClick={() => removerCedencia(carro.id, ced.id)}
                              className="p-0.5 rounded" style={{ color: '#f87171' }}>
                              <Trash2 size={10}/>
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <Campo label="Data cedido" type="date" value={ced.dataInicio}
                            onChange={v => atualizarCedencia(carro.id, ced.id, 'dataInicio', v)} />
                          <Campo label="Data fim" type="date" value={ced.dataFim}
                            onChange={v => atualizarCedencia(carro.id, ced.id, 'dataFim', v)} />
                        </div>
                        <Campo label="Litros cedidos" suffix="L" value={ced.litros}
                          onChange={v => atualizarCedencia(carro.id, ced.id, 'litros', v)} />
                        <p className="mt-1.5" style={{ fontSize: 10, color: 'rgba(203,213,235,0.45)' }}>
                          {fmt(num(combPreco))}/L × {num(ced.litros).toLocaleString('pt-BR')} L = {fmt(ced.total)}
                          {ced.dataInicio && ced.dataFim && (
                            <span> · {fmtData(ced.dataInicio)} a {fmtData(ced.dataFim)}</span>
                          )}
                        </p>
                      </div>
                    ))}
                    
                      <button type="button" onClick={() => adicionarCedencia(carro.id)}
                        className="w-full flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold"
                        style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px dashed rgba(245,158,11,0.35)' }}>
                        <Plus size={12}/> Ceder mais combustível
                      </button>
                    
                  </div>

                  <div className="mt-2">
                    <label className="block mb-1 font-semibold" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                      Membro da equipe
                    </label>
                    <select value={carro.equipeId || ''}
                      onChange={e => vincularCarroMembro(carro.id, e.target.value || null)}
                      className="w-full rounded-lg px-2 py-1.5 text-xs input-dark focus:outline-none focus:ring-2 focus:ring-cyan-400">
                      <option value="">Sem vínculo</option>
                      {equipeMembros.map(m => (
                        <option key={m.id} value={m.id}>{m.nome} — {normalizarCargo(m.cargo)}</option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-2 font-semibold" style={{ fontSize: 10, color: 'rgba(203,213,235,0.55)' }}>
                    Total: {fmt(num(combPreco))}/L × {num(carro.totalLitros).toLocaleString('pt-BR')} L = {fmt(carro.totalPeriodo)}
                  </p>
                </div>
              ))}
            </div>
            <div className="pt-2 space-y-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
              {carrosComCusto.length > 1 && carrosComCusto.map(c => (
                <LinhaCalculo key={c.id} label={c.nome} value={c.totalPeriodo} />
              ))}
              <LinhaCalculo
                label={`Total ${carros.length} ${carros.length === 1 ? 'veículo' : 'veículos'} · ${carrosComCusto.reduce((s, c) => s + c.totalLitros, 0).toLocaleString('pt-BR')} L`}
                value={totalComb} destaque />
            </div>
          </CardCategoria>

          {/* Empresas parceiras (sincronizado com a aba Empresas) */}
          <CardCategoria
            cor="#d4af5f"
            icon={Building2}
            titulo="Empresas / Fornecedores"
            descricao={`${empresasPrevisao.length} empresa${empresasPrevisao.length !== 1 ? 's' : ''} · valor do contrato · aba Empresas`}
            total={totalEmpresas}
          >
            <p className="mb-3" style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Cadastre o <strong style={{ color: 'var(--gold-bright)' }}>valor a pagar</strong> na aba Empresas.
              Só entram aqui empresas <strong>ativas</strong> com valor preenchido.
            </p>
            {empresasPrevisao.length === 0 ? (
              <div className="text-center py-4 rounded-xl"
                style={{ fontSize: 12, color: 'rgba(203,213,235,0.45)', background: 'var(--bg-surface)', border: '1.5px dashed rgba(255,255,255,0.12)' }}>
                Nenhuma empresa com valor cadastrado
              </div>
            ) : (
              <div className="space-y-2">
                {empresasPrevisao.map(emp => (
                  <div key={emp.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl"
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                    <div className="min-w-0">
                      <p className="font-bold truncate" style={{ fontSize: 12, color: 'var(--text-primary)' }}>{emp.nome}</p>
                      <p className="truncate" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{emp.categoria}</p>
                    </div>
                    <span className="font-bold flex-shrink-0 tnum" style={{ fontSize: 13, color: 'var(--gold-bright)' }}>
                      {fmt(emp.valor)}
                    </span>
                  </div>
                ))}
                <LinhaCalculo
                  label={`Total ${empresasPrevisao.length} empresa${empresasPrevisao.length !== 1 ? 's' : ''}`}
                  value={totalEmpresas}
                  destaque
                />
              </div>
            )}
          </CardCategoria>

          {/* 5 - Equipe Administrativa (um card por cargo) */}
          {adminCards.map(({ cargo, pessoas, total, cor }) => (
            <CardCategoria
              key={cargo}
              cor={cor}
              icon={Briefcase}
              titulo={cargo}
              descricao={`${pessoas.length} ${pessoas.length === 1 ? 'pessoa' : 'pessoas'} · valor por contrato`}
              total={total}
              defaultCollapsed={pessoas.length > 8}
            >
              <ListaPessoas
                pessoas={pessoas}
                onAdd={p => addAdmin(p, cargo)}
                onUpdate={(id, d) => updateAdmin(id, d, cargo)}
                onRemove={removeAdmin}
                valorPadrao={5000}
               
                tipo="admin"
                cor={cor}
                cargoFixo={cargo}
              />
            </CardCategoria>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {totalGeral > 0 && (
          <div className="budget-kpi-strip anim-fade-up">
            <div className="budget-kpi-chip">
              <DollarSign size={13} style={{ color: '#34d399' }} />
              <span>Total previsto <strong>{fmt(totalGeral)}</strong></span>
            </div>
            <div className="budget-kpi-chip">
              <TrendingUp size={13} style={{ color: '#fbbf24' }} />
              <span>Maior peso <strong>{maiorCategoria?.nome}</strong> ({pctMaior.toFixed(1)}%)</span>
            </div>
            <div className="budget-kpi-chip">
              <Users size={13} style={{ color: 'var(--accent-bright)' }} />
              <span><strong>{categoriasOrdenadas.filter(c => c.valor > 0).length}</strong> categorias com custo</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Card className="p-6 anim-fade-up budget-analytics-panel" spotlight>
            <div className="budget-panel-head">
              <div className="flex items-center gap-3">
                <IconBadge icon={DollarSign} from="#10b981" to="#059669" size={42} soft />
                <div className="budget-panel-head-copy">
                  <h2>Distribuição do Orçamento</h2>
                  <p>Participação de cada categoria no total previsto</p>
                </div>
              </div>
            </div>

            {totalGeral > 0 ? (
              <div className="budget-chart-layout">
                <div className="budget-chart-ring">
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={categoriasOrdenadas.filter(c => c.valor > 0).map(c => ({
                          name: c.nome,
                          value: c.valor,
                          fill: c.cor,
                        }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={68}
                        outerRadius={98}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="rgba(7,10,18,0.85)"
                        strokeWidth={2}
                        labelLine={false}
                        label={false}
                        onMouseEnter={(_, idx) => setHoverCategoria(categoriasOrdenadas.filter(c => c.valor > 0)[idx]?.nome ?? null)}
                        onMouseLeave={() => setHoverCategoria(null)}
                      >
                        {categoriasOrdenadas.filter(c => c.valor > 0).map(c => (
                          <Cell
                            key={c.nome}
                            fill={c.cor}
                            opacity={hoverCategoria && hoverCategoria !== c.nome ? 0.28 : 1}
                            style={{ filter: hoverCategoria === c.nome ? `drop-shadow(0 0 10px ${c.cor}88)` : undefined }}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v, name) => [fmt(v), name]}
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid var(--border-soft)',
                          background: 'var(--bg-overlay)',
                          color: 'var(--text-primary)',
                          boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
                          fontSize: 12,
                          padding: '10px 12px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="budget-chart-center">
                    <p className="eyebrow">Total previsto</p>
                    <p className="budget-chart-center-value tnum">{fmt(totalGeral)}</p>
                    <p className="budget-chart-center-sub">{categoriasOrdenadas.filter(c => c.valor > 0).length} categorias</p>
                  </div>
                </div>

                <div className="budget-legend">
                  {categoriasOrdenadas.filter(c => c.valor > 0).map(c => {
                    const pct = totalGeral > 0 ? (c.valor / totalGeral) * 100 : 0
                    return (
                      <button
                        key={c.nome}
                        type="button"
                        className={`budget-legend-item ${hoverCategoria === c.nome ? 'is-active' : ''}`}
                        style={{ '--swatch': c.cor }}
                        onMouseEnter={() => setHoverCategoria(c.nome)}
                        onMouseLeave={() => setHoverCategoria(null)}
                      >
                        <span className="budget-legend-swatch" style={{ backgroundColor: c.cor }} />
                        <span>
                          <span className="budget-legend-name">{c.nome}</span>
                          {c.qtd != null && (
                            <span className="budget-legend-meta">
                              {c.qtd} {c.qtd === 1 ? 'item' : 'itens'}
                            </span>
                          )}
                        </span>
                        <span className="budget-legend-value" style={{ color: c.cor }}>
                          <strong className="tnum">{fmt(c.valor)}</strong>
                          <span>{pct.toFixed(1)}%</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="py-14 text-center rounded-2xl" style={{ background: 'var(--bg-raised)', border: '1px dashed var(--border-soft)' }}>
                <Wallet size={28} className="mx-auto mb-3 opacity-40" />
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Preencha as categorias acima para visualizar a distribuição.</p>
              </div>
            )}
          </Card>

          <Card className="p-6 anim-fade-up budget-analytics-panel stagger-1" spotlight>
            <div className="budget-panel-head">
              <div className="flex items-center gap-3">
                <IconBadge icon={TrendingUp} from="#f59e0b" to="#fbbf24" size={42} soft />
                <div className="budget-panel-head-copy">
                  <h2>Detalhamento por Categoria</h2>
                  <p>Ranking por valor e peso no orçamento</p>
                </div>
              </div>
            </div>

            <div className="budget-breakdown-list">
              {categoriasOrdenadas.map((c, idx) => {
                const pct = totalGeral > 0 ? (c.valor / totalGeral) * 100 : 0
                const Icon = c.icon
                return (
                  <div
                    key={c.nome}
                    className={`budget-breakdown-row ${hoverCategoria === c.nome ? 'is-active' : ''}`}
                    style={{ '--row-color': c.cor }}
                    onMouseEnter={() => setHoverCategoria(c.nome)}
                    onMouseLeave={() => setHoverCategoria(null)}
                  >
                    <div className="budget-breakdown-top">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="budget-breakdown-rank">{idx + 1}</span>
                        <div className="budget-breakdown-icon" style={{ background: `${c.cor}18` }}>
                          <Icon size={16} style={{ color: c.cor }} />
                        </div>
                        <div className="min-w-0">
                          <p className="budget-breakdown-title truncate">{c.nome}</p>
                          <p className="budget-breakdown-sub">
                            {c.qtd != null
                              ? `${c.qtd} ${c.qtd === 1 ? 'registro' : 'registros'}`
                              : 'Custo fixo do período'}
                          </p>
                        </div>
                      </div>
                      <div className="budget-breakdown-amount" style={{ color: c.cor }}>
                        <strong className="tnum">{fmt(c.valor)}</strong>
                        <span>{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="budget-breakdown-track">
                      <div
                        className="budget-breakdown-fill"
                        style={{
                          width: `${Math.max(pct, c.valor > 0 ? 2 : 0)}%`,
                          background: `linear-gradient(90deg, ${c.cor}, color-mix(in srgb, ${c.cor} 70%, white))`,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {totalGeral > 0 && (
              <div className="budget-breakdown-footer">
                <div>
                  <p className="eyebrow">Total geral</p>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    Soma de todas as categorias no período
                  </p>
                </div>
                <strong className="tnum">{fmt(totalGeral)}</strong>
              </div>
            )}
          </Card>
        </div>
      </div>
    </ModuleWrap>
  )
}
