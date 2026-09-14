import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Users, Plus, X, Pencil, Trash2, Phone, Mail, CreditCard,
  MapPin, Briefcase, Search, UserCheck, CheckCircle,
  Clock, AlertCircle, ListTodo, History, Target,
  DollarSign, CalendarDays,   FileText, SlidersHorizontal, Fuel,
  MessageCircle, Church, Footprints, ScrollText, Printer, Camera, Loader2,
} from 'lucide-react'
import EquipeIgrejas from './EquipeIgrejas'
import EquipeIgrejaCampo from './EquipeIgrejaCampo'
import EquipeIndicacoes from './EquipeIndicacoes'
import EquipeFinanceiro from './EquipeFinanceiro'
import EquipeRuaFreelancers from './EquipeRuaFreelancers'
import EquipeContratos from './EquipeContratos'
import EquipeRelatorioContratos from './EquipeRelatorioContratos'
import EquipeRelatorioIndicacoes from './EquipeRelatorioIndicacoes'
import EquipeRelatorioIgrejas from './EquipeRelatorioIgrejas'
import EquipeRelatorioMembros from './EquipeRelatorioMembros'
import { garantirNumeroContrato } from '../utils/equipeContratoDoc'
import { confirmAction } from '../utils/confirm'
import { useCanViewFinance, useCanViewContratos, useSomenteContratos } from '../context/AccessContext'
import { useTabActive } from '../context/TabActiveContext'
import { useMobileLayout } from '../hooks/useViewportMode'
import SaveButton from './SaveButton'
import { flushAfterSave, writeStorage, liberarCachePesadoLocal } from '../utils/persist'
import { ListCrudLayout } from '../layouts'
import { RecordCard, StatusPill, SegmentedControl, BottomSheet, Button, Pill } from './ui'
import { SYNC_STORAGE_EVENT, SYNC_EVENT } from '../lib/cloudSync'
import {
  ensureRemoteFoto, isDataUrl, isUsableFoto, migrarFotosParaUrl,
} from '../utils/mediaUpload'
import { formatarCep, buscarEnderecoPorCep } from '../utils/agendaLocal'
import { formatDataBrInput, analisarDataBr } from '../utils/telefoneBr'
import {
  loadBairrosSc, listarCidadesSc, bairrosDaCidadeSc, inferirCidadeAtuacao,
} from '../utils/bairrosSc'
import {
  CARGOS, CARGO_CORES, EQUIPE_KEY, PREVISAO_KEY, EQUIPE_PREVISAO_EVENT,
  uid, normalizarCargo, agruparPorCargo, categoriaPrevisaoLabel,
  atualizarMembroEmPrevisao, removerMembroDaPrevisao, saveEquipe,
  loadEquipe, sincronizarEquipeComPrevisao, sincronizarCombustivelNaPrevisao,
  sincronizarCombustivelCarrosParaEquipe, normalizarCombustivelMembro,
  COMBUSTIVEL_VAZIO, loadPrevisao, marcarEquipeRemovido,
} from '../utils/equipeSync'
import { labelIndicacao as labelIndicacaoCadastro, cpfMembro as cpfMembroCadastro } from '../utils/equipeCadastro'
import { compressImageFile } from '../utils/leadFormConfig'
import { sincronizarFormularioNaEquipe, excluirPessoaCompleta } from '../utils/apoiadoresSync'
import {
  loadFinanceiro, getFinanceiroMembro, totalPago,
  valorContratoEfetivo, fmtMoeda as fmtMoedaFin,
} from '../utils/equipeFinanceiro'
import { linkWhatsApp } from '../utils/rotaUtils'

function labelCategoriaPrevisao(cargo) {
  return categoriaPrevisaoLabel(cargo)
}

const STORAGE_KEY = EQUIPE_KEY
const STORAGE_KEY_TAREFAS = 'equipe_tarefas'
const STORAGE_KEY_LOG = 'equipe_log'

const STATUS_TAREFA = [
  { id: 'pendente', label: 'Pendente', cor: '#f59e0b' },
  { id: 'em_andamento', label: 'Em Andamento', cor: '#3b82f6' },
  { id: 'concluida', label: 'Concluída', cor: '#10b981' },
  { id: 'cancelada', label: 'Cancelada', cor: '#ef4444' },
]

const CARGO_CORES_LOCAL = CARGO_CORES

const CARGOS_IGREJA = [
  'Membro',
  'Pastor',
  'Pastora',
  'Esposa(o) de pastor',
  'Diácono',
  'Diaconisa',
  'Presbítero',
  'Líder de célula',
  'Líder de louvor',
  'Músico',
  'Obreiro',
  'Obreira',
  'Porteiro',
  'Auxiliar',
  'Professor(a) EBD',
  'Jovem / Adolescente',
  'Visitante',
  'Outro',
]

const FORM_VAZIO = {
  nome: '', cargo: 'Apoiador', telefone: '', email: '', cpf: '', rg: '', dataNascimento: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairroResidencia: '', cidade: '', estado: '',
  cidadeAtuacao: 'Blumenau', bairros: [], observacoes: '', foto: '',
  fotoX: 50, fotoY: 50,
  igrejaId: null, igrejaNome: '', cargoIgreja: '', cargoIgrejaOutro: '',
  temIgreja: false,
  vinculo: 'Voluntário', salario: '', dataInicio: '', contrato: '',
  banco: '', agencia: '', conta: '', pix: '',
  indicacaoMembroId: '', indicacaoPor: '',
  combustivel: { ...COMBUSTIVEL_VAZIO },
}

const TAREFA_VAZIA = {
  titulo: '', descricao: '', status: 'pendente', prioridade: 'media', prazo: '',
}

const VINCULOS = [
  'Voluntário', 'CLT', 'PJ', 'Autônomo', 'Estagiário', 'Comissionado', 'Outro',
]

const VINCULO_CORES = {
  Voluntário: '#6366f1',
  CLT: '#10b981',
  PJ: '#f59e0b',
  Autônomo: '#06b6d4',
  Estagiário: '#ec4899',
  Comissionado: '#f97316',
  'Comunidade WhatsApp': '#25D366',
  Outro: 'rgba(203,213,235,0.55)',
}

const ABA_ICONS = {
  membros: Users,
  tarefas: ListTodo,
  indicacoes: UserCheck,
  igrejas: Church,
  rua: Footprints,
  financeiro: DollarSign,
  contratos: ScrollText,
  log: History,
}

const MOBILE_PRIMARY_ABAS = ['membros', 'tarefas', 'indicacoes']

const TAREFA_STATUS_VARIANT = {
  pendente: 'pendente',
  em_andamento: 'em-rota',
  concluida: 'visitada',
  cancelada: 'esgotado',
}

function useIsMobileNav() {
  return useMobileLayout()
}

const PRIORIDADES = [
  { id: 'baixa', label: 'Baixa', cor: 'rgba(203,213,235,0.60)' },
  { id: 'media', label: 'Média', cor: '#f59e0b' },
  { id: 'alta', label: 'Alta', cor: '#ef4444' },
]

const INPUT_CLS = 'input-dark w-full px-3 py-2'
const INPUT_STY = { fontSize: 13 }

function uidLocal() { return uid() }

const PALETA_AVATAR = [
  '#3b82f6','#06b6d4','#ec4899','#f97316',
  '#10b981','#06b6d4','#f59e0b','#ef4444','#2563eb','#84cc16',
]
function initials(n)   { return String(n || '').split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?' }
function avatarCor(id) { return PALETA_AVATAR[parseInt(String(id || '0').slice(-4), 36) % PALETA_AVATAR.length] }
function toTitleCase(s){ return s.replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()) }
function formatTel(v)  {
  const d = (v||'').replace(/\D/g,'').slice(0,11)
  if (d.length <=  2) return d
  if (d.length <=  6) return `(${d.slice(0,2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`
}
/** Dígitos do telefone (remove +55 se vier com DDI). */
function digitosTel(v) {
  let d = String(v || '').replace(/\D/g, '')
  if (d.startsWith('55') && d.length > 11) d = d.slice(2)
  return d
}
function telefonesIguais(a, b) {
  const da = digitosTel(a)
  const db = digitosTel(b)
  if (da.length < 8 || db.length < 8) return false
  if (da === db) return true
  // Mesmo celular com/sem DDD: últimos 9 dígitos
  if (da.length >= 9 && db.length >= 9 && da.slice(-9) === db.slice(-9)) return true
  return false
}
function acharMembroPorTelefone(membros, telefone, excluirId = null) {
  const dig = digitosTel(telefone)
  if (dig.length < 8) return null
  return membros.find(m => {
    if (excluirId && String(m.id) === String(excluirId)) return false
    return telefonesIguais(m.telefone, telefone)
  }) || null
}
function formatCpf(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}
function formatRg(v) {
  return String(v || '').replace(/[^\dA-Za-z.\-/]/g, '').slice(0, 20).toUpperCase()
}
function cpfMembro(m) {
  return cpfMembroCadastro(m)
}
function fmtSalario(v) {
  if (!v) return ''
  return `R$ ${parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 })}`
}
function parseDataFlex(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return { d: Number(m[1]), mo: Number(m[2]), y: Number(m[3]) }
  const dig = s.replace(/\D/g, '')
  if (dig.length === 8) {
    return { d: Number(dig.slice(0, 2)), mo: Number(dig.slice(2, 4)), y: Number(dig.slice(4)) }
  }
  return null
}

/** Exibe data em DD/MM/AAAA (aceita ISO ou BR). */
function fmtData(raw) {
  const p = parseDataFlex(raw)
  if (!p || !p.y || !p.mo || !p.d) return ''
  return `${String(p.d).padStart(2, '0')}/${String(p.mo).padStart(2, '0')}/${p.y}`
}

function formatarEnderecoMembro(m) {
  if (!m) return ''
  const partes = []
  const rua = [m.logradouro, m.numero].filter(Boolean).join(', ')
  if (rua) partes.push(rua)
  if (m.complemento) partes.push(m.complemento)
  if (m.bairroResidencia) partes.push(m.bairroResidencia)
  const cidadeUf = [m.cidade, m.estado].filter(Boolean).join('/')
  if (cidadeUf) partes.push(cidadeUf)
  if (m.cep) partes.push(`CEP ${m.cep}`)
  return partes.join(' — ')
}
function normalizarIndicacaoForm(form, membros) {
  const membroId = form.indicacaoMembroId || ''
  if (!membroId) return { indicacaoMembroId: '', indicacaoPor: '' }
  if (membroId === '__outro__') {
    return {
      indicacaoMembroId: '',
      indicacaoPor: toTitleCase((form.indicacaoPor || '').trim()),
    }
  }
  const ref = membros.find(m => m.id === membroId)
  return { indicacaoMembroId: membroId, indicacaoPor: ref?.nome || '' }
}
function indicacaoInicial(membro) {
  if (membro.indicacaoMembroId) {
    return { indicacaoMembroId: membro.indicacaoMembroId, indicacaoPor: membro.indicacaoPor || '' }
  }
  if (membro.indicacaoPor) {
    return { indicacaoMembroId: '__outro__', indicacaoPor: membro.indicacaoPor }
  }
  return { indicacaoMembroId: '', indicacaoPor: '' }
}
function labelIndicacao(membro, membros = []) {
  return labelIndicacaoCadastro(membro, membros)
}

export default function Equipe() {
  const canViewFinance = useCanViewFinance()
  const canViewContratos = useCanViewContratos()
  const somenteContratos = useSomenteContratos()
  const tabActive = useTabActive()
  const tabActiveRef = useRef(tabActive)
  tabActiveRef.current = tabActive
  const skipWrite = useRef(true)

  const [membros, setMembros]   = useState(() => {
    try {
      return loadEquipe().map(m => ({ ...m, cargo: normalizarCargo(m.cargo) }))
    } catch { return [] }
  })
  const [tarefas, setTarefas]   = useState(() => JSON.parse(localStorage.getItem(STORAGE_KEY_TAREFAS) || '[]'))
  const [log, setLog]           = useState(() => JSON.parse(localStorage.getItem(STORAGE_KEY_LOG) || '[]'))
  const [modal, setModal]       = useState(null)   // null | 'novo' | id | 'tarefa_novo' | 'tarefa_id'
  const [form, setForm]         = useState(FORM_VAZIO)
  const [tarefaForm, setTarefaForm] = useState(TAREFA_VAZIA)
  const [filtro, setFiltro]     = useState('Todos')
  const [busca, setBusca]       = useState('')
  const [aba, setAba]           = useState(() => (somenteContratos ? 'contratos' : 'membros')) // membros | tarefas | indicacoes | igrejas | rua | financeiro | contratos | log
  const [bairroOpen,   setBairroOpen]   = useState(false)
  const [bairroBusca,  setBairroBusca]  = useState('')
  const [bairrosScMap, setBairrosScMap] = useState(null)
  const [cepErro,      setCepErro]      = useState('')
  const [buscandoCep,  setBuscandoCep]  = useState(false)
  const fotoInputRef = useRef(null)
  const cepReqRef = useRef(0)
  const cepAbortRef = useRef(null)
  const [fotoRaw,      setFotoRaw]      = useState('')
  const [ajusteX,      setAjusteX]      = useState(50)
  const [ajusteY,      setAjusteY]      = useState(50)
  const [modalAjuste,  setModalAjuste]  = useState(false)
  const [saveErro,     setSaveErro]     = useState('')
  const [fotoProcessando, setFotoProcessando] = useState(false)
  const [membroDetalhe, setMembroDetalhe] = useState(null)
  const [relatorioContratosAberto, setRelatorioContratosAberto] = useState(false)
  const [relatorioIndicacoesAberto, setRelatorioIndicacoesAberto] = useState(false)
  const [relatorioIgrejasAberto, setRelatorioIgrejasAberto] = useState(false)
  const [relatorioMembrosAberto, setRelatorioMembrosAberto] = useState(false)
  const [financeiroMembro, setFinanceiroMembro] = useState(null)
  const [finTick, setFinTick] = useState(0)
  const [buscaFin, setBuscaFin] = useState('')
  const [navSheetSnap, setNavSheetSnap] = useState('closed')
  const isMobile = useIsMobileNav()

  useEffect(() => {
    if (somenteContratos) {
      if (aba !== 'contratos') setAba('contratos')
      return
    }
    if (!canViewFinance && aba === 'financeiro') setAba('membros')
    if (!canViewContratos && aba === 'contratos') setAba('membros')
  }, [canViewFinance, canViewContratos, somenteContratos, aba])

  const abasEquipe = useMemo(() => {
    if (somenteContratos) {
      return [{ id: 'contratos', label: 'Contratos', icon: ScrollText }]
    }
    return [
      { id: 'membros', label: 'Membros', icon: Users },
      { id: 'tarefas', label: 'Tarefas', icon: ListTodo },
      { id: 'indicacoes', label: 'Indicações', icon: UserCheck },
      { id: 'igrejas', label: 'Igrejas', icon: Church },
      { id: 'rua', label: 'Rua Freelancer', icon: Footprints },
      ...(canViewFinance ? [{ id: 'financeiro', label: 'Financeiro', icon: DollarSign }] : []),
      ...(canViewContratos ? [{ id: 'contratos', label: 'Contratos', icon: ScrollText }] : []),
      { id: 'log', label: 'Log', icon: History },
    ]
  }, [somenteContratos, canViewFinance, canViewContratos])

  const mobileSegmentOptions = useMemo(() => {
    if (somenteContratos) return []
    return [
      ...abasEquipe
        .filter(a => MOBILE_PRIMARY_ABAS.includes(a.id))
        .map(a => ({ id: a.id, label: a.label, icon: a.icon })),
      { id: 'mais', label: 'Mais', icon: SlidersHorizontal },
    ]
  }, [abasEquipe, somenteContratos])

  const mobileSecondaryAbas = useMemo(
    () => abasEquipe.filter(a => !MOBILE_PRIMARY_ABAS.includes(a.id)),
    [abasEquipe],
  )

  const mobileSegmentValue = MOBILE_PRIMARY_ABAS.includes(aba) ? aba : 'mais'

  const headerIcon = ABA_ICONS[aba] || Users
  const headerTitle =
    aba === 'membros' ? 'Equipe' :
    aba === 'tarefas' ? 'Tarefas' :
    aba === 'indicacoes' ? 'Indicações & Cadastros' :
    aba === 'igrejas' ? 'Igrejas' :
    aba === 'rua' ? 'Equipe de Rua Freelancer' :
    aba === 'financeiro' ? 'Financeiro & Contratos' :
    aba === 'contratos' ? 'Contratos' :
    'Log de Atividade'
  const headerSubtitle =
    aba === 'membros' ? `${membros.length} membro${membros.length !== 1 ? 's' : ''} cadastrado${membros.length !== 1 ? 's' : ''}` :
    aba === 'tarefas' ? `${tarefas.length} tarefa${tarefas.length !== 1 ? 's' : ''}` :
    aba === 'indicacoes' ? 'Responsáveis pelas indicações e qualidade dos cadastros' :
    aba === 'igrejas' ? 'AD / ADBLU e outras denominações' :
    aba === 'rua' ? 'Quantidade × valor diário × dias · soma na Previsão de Gastos' :
    aba === 'financeiro' ? 'Pagamentos, contratos e saldo devedor por membro' :
    aba === 'contratos' ? 'Prestação de serviços · PDF no modelo da campanha' :
    `${log.length} registro${log.length !== 1 ? 's' : ''}`

  function onMobileSegmentChange(id) {
    if (id === 'mais') {
      setNavSheetSnap(prev => (prev === 'half' || prev === 'full' ? 'closed' : 'half'))
      return
    }
    setAba(id)
    setNavSheetSnap('closed')
  }

  function escolherAbaMobile(id) {
    setAba(id)
    setNavSheetSnap('closed')
  }

  function renderMembroLead(m) {
    const cor = avatarCor(m.id)
    if (m.foto) {
      return (
        <img
          src={m.foto}
          alt=""
          className="w-full h-full object-cover"
          style={{ objectPosition: `${m.fotoX ?? 50}% ${m.fotoY ?? 50}%` }}
        />
      )
    }
    return (
      <div
        className="w-full h-full flex items-center justify-center font-black text-white text-sm"
        style={{ background: `linear-gradient(135deg,${cor},${cor}aa)` }}
      >
        {initials(m.nome)}
      </div>
    )
  }

  useEffect(() => {
    loadBairrosSc().then(setBairrosScMap).catch(() => {})
  }, [])

  const cidadesAtuacao = useMemo(() => listarCidadesSc(bairrosScMap), [bairrosScMap])
  const bairrosAtuacaoOpts = useMemo(
    () => bairrosDaCidadeSc(bairrosScMap, form.cidadeAtuacao),
    [bairrosScMap, form.cidadeAtuacao],
  )

  useEffect(() => {
    if (skipWrite.current) {
      skipWrite.current = false
      return
    }
    saveEquipe(membros)
  }, [membros])
  useEffect(() => { writeStorage(STORAGE_KEY_TAREFAS, tarefas) }, [tarefas])
  useEffect(() => { writeStorage(STORAGE_KEY_LOG, log) }, [log])

  // Fotos Base64 da equipe → URL no servidor
  useEffect(() => {
    let cancelled = false
    async function migrar() {
      if (!Array.isArray(membros) || !membros.some(m => isDataUrl(m?.foto))) return
      const { lista, migrados } = await migrarFotosParaUrl(membros, { scope: 'equipe' })
      if (cancelled || !migrados) return
      skipWrite.current = true
      setMembros(lista)
      saveEquipe(lista)
      flushAfterSave()
    }
    const t = setTimeout(migrar, 1800)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [membros])

  useEffect(() => {
    if (sessionStorage.getItem('equipe_reconcile_v1')) return
    sessionStorage.setItem('equipe_reconcile_v1', '1')
    // Previsão primeiro; depois força Comunidade WhatsApp (não deixa voltar a Cabo)
    sincronizarEquipeComPrevisao({ gravar: true })
    sincronizarCombustivelCarrosParaEquipe(loadPrevisao())
    sincronizarCombustivelNaPrevisao(loadEquipe())
    sincronizarFormularioNaEquipe({ gravar: true })
    skipWrite.current = true
    setMembros(loadEquipe().map(m => ({ ...m, cargo: normalizarCargo(m.cargo) })))
  }, [])

  useEffect(() => {
    function recarregar(fromServer = false) {
      if (!tabActiveRef.current) return
      try {
        // Após pull da nuvem: só lê o storage (merge já uniu). Evita write storm.
        if (!fromServer) {
          sincronizarEquipeComPrevisao({ gravar: true })
          sincronizarCombustivelCarrosParaEquipe(loadPrevisao())
        }
        skipWrite.current = true
        setMembros(loadEquipe().map(m => ({ ...m, cargo: normalizarCargo(m.cargo) })))
      } catch { /* ignore */ }
    }
    function onStorage(e) {
      if (e.type === SYNC_STORAGE_EVENT && !e?.detail?.external) return
      const key = e.detail?.key
      if (key && key !== PREVISAO_KEY && key !== EQUIPE_KEY) return
      recarregar(false)
    }
    function onSyncEvent(e) {
      if (e?.detail?.fromServer || e?.detail?.syncNow) recarregar(true)
      else recarregar(false)
    }
    function onEquipePrevisao() {
      recarregar(false)
    }
    window.addEventListener(SYNC_STORAGE_EVENT, onStorage)
    window.addEventListener(SYNC_EVENT, onSyncEvent)
    window.addEventListener(EQUIPE_PREVISAO_EVENT, onEquipePrevisao)
    return () => {
      window.removeEventListener(SYNC_STORAGE_EVENT, onStorage)
      window.removeEventListener(SYNC_EVENT, onSyncEvent)
      window.removeEventListener(EQUIPE_PREVISAO_EVENT, onEquipePrevisao)
    }
  }, [])

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const updComb = (k, v) => setForm(p => ({
    ...p,
    combustivel: { ...normalizarCombustivelMembro(p), [k]: v },
  }))
  const updTarefa = (k, v) => setTarefaForm(p => ({ ...p, [k]: v }))

  function abrirNovo()  {
    setForm(FORM_VAZIO)
    setCepErro('')
    setBuscandoCep(false)
    setModal('novo')
  }
  function abrirEditar(m) {
    const bairros = Array.isArray(m.bairros) ? m.bairros
      : (m.bairro ? m.bairro.split(',').map(b => b.trim()).filter(Boolean) : [])
    const cidadeAtuacao = m.cidadeAtuacao
      || inferirCidadeAtuacao(bairrosScMap, bairros)
      || 'Blumenau'
    setForm({
      ...m,
      cpf: m.cpf || '',
      dataNascimento: m.dataNascimento ? (fmtData(m.dataNascimento) || m.dataNascimento) : '',
      cep: m.cep || '',
      logradouro: m.logradouro || '',
      numero: m.numero || '',
      complemento: m.complemento || '',
      bairroResidencia: m.bairroResidencia || '',
      cidade: m.cidade || '',
      estado: m.estado || '',
      banco: m.banco || '',
      agencia: m.agencia || '',
      conta: m.conta || '',
      pix: m.pix || '',
      igrejaId: m.igrejaId ?? null,
      igrejaNome: m.igrejaNome || '',
      cargoIgreja: (m.cargoIgreja && CARGOS_IGREJA.includes(m.cargoIgreja))
        ? m.cargoIgreja
        : (m.cargoIgreja ? 'Outro' : ''),
      cargoIgrejaOutro: (m.cargoIgreja && !CARGOS_IGREJA.includes(m.cargoIgreja))
        ? m.cargoIgreja
        : '',
      temIgreja: Boolean(
        m.igrejaId != null
        || String(m.igrejaNome || '').trim()
        || String(m.cargoIgreja || '').trim()
        || normalizarCargo(m.cargo) === 'Igreja'
      ),
      cidadeAtuacao,
      bairros,
      combustivel: normalizarCombustivelMembro(m),
      ...indicacaoInicial(m),
    })
    setCepErro('')
    setBuscandoCep(false)
    setBairroBusca('')
    setModal(m.id)
  }
  function abrirNovaTarefa() { setTarefaForm(TAREFA_VAZIA); setModal('tarefa_novo') }
  function fechar() {
    setModal(null)
    setBairroOpen(false)
    setBairroBusca('')
    setCepErro('')
    setBuscandoCep(false)
    setSaveErro('')
  }

  function trocarCidadeAtuacao(cidade, { limparBairros = true } = {}) {
    setForm(p => {
      const mesma = (p.cidadeAtuacao || '').toLowerCase() === (cidade || '').toLowerCase()
      return {
        ...p,
        cidadeAtuacao: cidade,
        bairros: limparBairros && !mesma ? [] : p.bairros,
      }
    })
    setBairroBusca('')
    setBairroOpen(false)
  }

  async function onCepChange(valor) {
    const cep = formatarCep(valor)
    setForm(p => ({ ...p, cep }))
    setCepErro('')
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8) {
      setBuscandoCep(false)
      try { cepAbortRef.current?.abort() } catch { /* ignore */ }
      return
    }

    const reqId = ++cepReqRef.current
    try { cepAbortRef.current?.abort() } catch { /* ignore */ }
    const ac = new AbortController()
    cepAbortRef.current = ac

    setBuscandoCep(true)
    const data = await buscarEnderecoPorCep(cep, { signal: ac.signal })
    if (reqId !== cepReqRef.current) return
    setBuscandoCep(false)
    if (!data) {
      setCepErro('CEP não encontrado — preencha o endereço manualmente')
      return
    }
    // Sempre substitui pelos dados do CEP (qualquer cidade/UF do Brasil)
    setForm(p => ({
      ...p,
      cep,
      logradouro: data.logradouro || '',
      bairroResidencia: data.bairro || '',
      cidade: data.localidade || '',
      estado: data.uf || '',
    }))
    setCepErro('')
  }

  function salvarNumeroContrato(membroId, valor) {
    const numero = String(valor || '').trim()
    const membro = membros.find(m => m.id === membroId)
    if (!membro || (membro.contrato || '') === numero) return
    const atualizado = { ...membro, contrato: numero }
    const novaLista = membros.map(m => m.id === membroId ? atualizado : m)
    saveEquipe(novaLista)
    setMembros(novaLista)
    atualizarMembroEmPrevisao(atualizado, novaLista)
    adicionarLog('membro_editado', `Nº do contrato ${numero ? 'definido' : 'removido'}: ${membro.nome}`, { nome: membro.nome, contrato: numero })
    flushAfterSave()
  }

  function atualizarMembroContrato(atualizado) {
    if (!atualizado?.id) return
    const novaLista = membros.map(m => String(m.id) === String(atualizado.id) ? { ...m, ...atualizado } : m)
    saveEquipe(novaLista)
    setMembros(novaLista)
    atualizarMembroEmPrevisao(atualizado, novaLista)
    sincronizarCombustivelNaPrevisao(novaLista)
    adicionarLog('membro_editado', `Contrato atualizado: ${atualizado.nome || ''}`, {
      nome: atualizado.nome,
      contrato: atualizado.contrato,
    })
    flushAfterSave()
  }

  function adicionarLog(tipo, mensagem, dados = {}) {
    const entrada = {
      id: uid(),
      tipo,
      mensagem,
      dados,
      timestamp: new Date().toISOString(),
    }
    setLog(p => [entrada, ...p].slice(0, 100)) // manter últimas 100 entradas
  }

  async function salvar() {
    if (!form.nome.trim()) {
      setSaveErro('Preencha o nome do membro.')
      return
    }
    const telDup = acharMembroPorTelefone(
      membros,
      form.telefone,
      modal === 'novo' ? null : modal,
    )
    if (telDup) {
      setSaveErro(`Este telefone já está em ${telDup.nome}. Troque o número para salvar.`)
      return
    }
    const nomeFinal = toTitleCase(form.nome.trim())
    const nasc = analisarDataBr(form.dataNascimento || '')
    const memberId = modal === 'novo' ? uidLocal() : modal
    let fotoFinal = String(form.foto || '').trim()
    if (isUsableFoto(fotoFinal)) {
      setFotoProcessando(true)
      try {
        fotoFinal = await ensureRemoteFoto(memberId, fotoFinal, 'equipe')
      } finally {
        setFotoProcessando(false)
      }
    } else {
      fotoFinal = ''
    }
    const dados = {
      ...form,
      id: memberId,
      foto: fotoFinal,
      nome: nomeFinal,
      cpf: formatCpf(form.cpf || ''),
      rg: formatRg(form.rg || ''),
      dataNascimento: String(form.dataNascimento || '').trim()
        ? (nasc.ok ? nasc.formatted : formatDataBrInput(form.dataNascimento))
        : '',
      cep: formatarCep(form.cep || ''),
      logradouro: toTitleCase((form.logradouro || '').trim()),
      numero: String(form.numero || '').trim(),
      complemento: String(form.complemento || '').trim(),
      bairroResidencia: toTitleCase((form.bairroResidencia || '').trim()),
      cidade: toTitleCase((form.cidade || '').trim()),
      estado: String(form.estado || '').trim().toUpperCase().slice(0, 2),
      cargo: normalizarCargo(form.cargo),
      igrejaId: (form.temIgreja || normalizarCargo(form.cargo) === 'Igreja')
        ? (form.igrejaId ?? null)
        : null,
      igrejaNome: (form.temIgreja || normalizarCargo(form.cargo) === 'Igreja')
        ? String(form.igrejaNome || '').trim()
        : '',
      cargoIgreja: (form.temIgreja || normalizarCargo(form.cargo) === 'Igreja')
        ? (form.cargoIgreja === 'Outro'
          ? (String(form.cargoIgrejaOutro || '').trim() || 'Outro')
          : String(form.cargoIgreja || '').trim())
        : '',
      combustivel: normalizarCombustivelMembro(form),
      ...normalizarIndicacaoForm(form, membros),
    }
    delete dados.cargoIgrejaOutro
    delete dados.temIgreja
    try {
      liberarCachePesadoLocal()
      if (modal === 'novo') {
        const novo = garantirNumeroContrato(dados, membros)
        const novaLista = [...membros, novo]
        saveEquipe(novaLista)
        setMembros(novaLista)
        atualizarMembroEmPrevisao(novo, novaLista)
        sincronizarCombustivelNaPrevisao(novaLista)
        adicionarLog('membro_criado', `Novo membro adicionado: ${nomeFinal}`, { nome: nomeFinal, cargo: dados.cargo })
      } else {
        const atualizado = garantirNumeroContrato(dados, membros)
        const novaLista = membros.map(m => m.id === modal ? atualizado : m)
        saveEquipe(novaLista)
        setMembros(novaLista)
        atualizarMembroEmPrevisao(atualizado, novaLista)
        sincronizarCombustivelNaPrevisao(novaLista)
        adicionarLog('membro_editado', `Membro editado: ${nomeFinal}`, { nome: nomeFinal, cargo: dados.cargo })
      }
      setSaveErro('')
      fechar()
      flushAfterSave()
    } catch (e) {
      console.error(e)
      const msg = e?.message?.includes('cheio') || e?.name === 'QuotaExceededError'
        ? 'Não coube no navegador. Use uma foto menor (ou recorte o rosto) e tente de novo.'
        : (e?.message || 'Não foi possível salvar. Tente de novo.')
      setSaveErro(msg)
      window.alert(msg)
    }
  }

  async function aplicarFotoArquivo(file) {
    if (!file || !file.type?.startsWith('image/')) return
    setFotoProcessando(true)
    setSaveErro('')
    const tentativas = [
      { maxW: 512, maxH: 512, quality: 0.78, maxBytes: 140000, forceJpeg: true },
      { maxW: 400, maxH: 400, quality: 0.68, maxBytes: 90000, forceJpeg: true },
      { maxW: 320, maxH: 320, quality: 0.58, maxBytes: 60000, forceJpeg: true },
      { maxW: 240, maxH: 240, quality: 0.5, maxBytes: 40000, forceJpeg: true },
    ]
    try {
      let img = null
      for (const opts of tentativas) {
        try {
          img = await compressImageFile(file, opts)
          break
        } catch { /* tenta menor */ }
      }
      if (!img) throw new Error('Não foi possível processar esta imagem. Tente outra foto.')
      setFotoRaw(img.dataUrl)
      setAjusteX(50)
      setAjusteY(50)
      setModalAjuste(true)
    } catch (e) {
      setSaveErro(e?.message || 'Não foi possível usar esta foto. Tente outra.')
    } finally {
      setFotoProcessando(false)
    }
  }

  function handleFotoChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    aplicarFotoArquivo(file)
  }

  useEffect(() => {
    const aberto = modal === 'novo' || (typeof modal === 'string' && modal && !modal.startsWith('tarefa_'))
    if (!aberto) return undefined
    function onPaste(e) {
      const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'))
      if (!item) return
      const file = item.getAsFile()
      if (file) {
        e.preventDefault()
        aplicarFotoArquivo(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [modal])

  function confirmarAjuste() {
    upd('foto',  fotoRaw)
    upd('fotoX', ajusteX)
    upd('fotoY', ajusteY)
    setModalAjuste(false)
  }

  function salvarTarefa() {
    if (!tarefaForm.titulo.trim()) return
    const taskId = modal.startsWith('tarefa_') ? modal.replace('tarefa_', '') : null
    if (modal === 'tarefa_novo') {
      const nova = { ...tarefaForm, id: uid() }
      setTarefas(p => [...p, nova])
      adicionarLog('tarefa_criada', `Nova tarefa criada: ${tarefaForm.titulo}`, { titulo: tarefaForm.titulo, prioridade: tarefaForm.prioridade })
    } else if (taskId) {
      setTarefas(p => p.map(t => t.id === taskId ? { ...tarefaForm, id: t.id } : t))
      adicionarLog('tarefa_editada', `Tarefa editada: ${tarefaForm.titulo}`, { titulo: tarefaForm.titulo, status: tarefaForm.status })
    }
    fechar()
    flushAfterSave()
  }

  async function excluirMembro(id) {
    const m = membros.find(x => String(x.id) === String(id))
    if (!m) return
    const ok = await confirmAction({
      title: 'Remover membro',
      message: `Remover ${m.nome} da equipe? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Remover',
      danger: true,
    })
    if (!ok) return

    // Comunidade / lead: apaga também em Apoiadores e marca como removido (senão o sync traz de volta)
    const ehComunidade = m.origem === 'cadastro_publico'
      || String(m.id || '').startsWith('lead-')
      || String(m.apoiadorRedeId || '').startsWith('lead-')
      || normalizarCargo(m.cargo) === 'Comunidade WhatsApp'

    if (ehComunidade) {
      const { equipe } = excluirPessoaCompleta({
        id: m.id,
        apoiadorRedeId: m.apoiadorRedeId,
        telefone: m.telefone,
      }, { flush: false })
      marcarEquipeRemovido(id)
      const novaLista = equipe.map(x => ({ ...x, cargo: normalizarCargo(x.cargo) }))
      setMembros(novaLista)
      removerMembroDaPrevisao(id)
      sincronizarCombustivelNaPrevisao(novaLista)
      adicionarLog('membro_excluido', `Membro excluído: ${m.nome}`, { nome: m.nome })
      await flushAfterSave()
      return
    }

    marcarEquipeRemovido(id)
    const novaLista = membros.filter(x => String(x.id) !== String(id))
    saveEquipe(novaLista)
    setMembros(novaLista)
    removerMembroDaPrevisao(id)
    sincronizarCombustivelNaPrevisao(novaLista)
    adicionarLog('membro_excluido', `Membro excluído: ${m.nome}`, { nome: m.nome })
    await flushAfterSave()
  }

  async function excluirTarefa(id) {
    const t = tarefas.find(x => x.id === id)
    if (!t) return
    const ok = await confirmAction({
      title: 'Remover tarefa',
      message: `Remover a tarefa "${t.titulo}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Remover',
    })
    if (!ok) return
    setTarefas(p => p.filter(x => x.id !== id))
    adicionarLog('tarefa_excluida', `Tarefa excluída: ${t.titulo}`, { titulo: t.titulo })
  }

  const cargosAtivos = useMemo(() =>
    ['Todos', ...CARGOS.filter(c => membros.some(m => normalizarCargo(m.cargo) === c))], [membros])

  const membrosFiltrados = useMemo(() => {
    const qRaw = String(busca || '').trim().toLowerCase()
    const qNorm = qRaw.normalize('NFD').replace(/\p{M}/gu, '')
    const tokens = qNorm.split(/\s+/).filter(Boolean)
    const digitosQ = qRaw.replace(/\D/g, '')

    return membros.filter(m => {
      if (filtro !== 'Todos' && normalizarCargo(m.cargo) !== filtro) return false
      if (!tokens.length && !digitosQ) return true

      const texto = [
        m.nome,
        m.cidade,
        m.cidadeAtuacao,
        m.logradouro,
        m.bairroResidencia,
        m.email,
        m.telefone,
        m.cpf,
        m.rg,
        m.cep,
        normalizarCargo(m.cargo),
        labelIndicacao(m, membros),
        Array.isArray(m.bairros) ? m.bairros.join(' ') : (m.bairro || ''),
      ]
        .map(v => String(v || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, ''))
        .join(' ')

      const digitosM = `${m.telefone || ''}${m.cpf || ''}${m.rg || ''}${m.cep || ''}`.replace(/\D/g, '')

      const textoOk = tokens.every(t => texto.includes(t))
      const digitosOk = digitosQ.length >= 3 && digitosM.includes(digitosQ)
      return textoOk || digitosOk
    })
  }, [membros, filtro, busca])

  const membrosIndicacao = useMemo(() =>
    membros
      .filter(m => modal === 'novo' || m.id !== modal)
      .slice()
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  [membros, modal])

  const telefoneDuplicado = useMemo(() => {
    if (!form.telefone || digitosTel(form.telefone).length < 8) return null
    return acharMembroPorTelefone(
      membros,
      form.telefone,
      modal && modal !== 'novo' ? modal : null,
    )
  }, [form.telefone, membros, modal])

  const tarefasFiltradas = useMemo(() => {
    return tarefas.filter(t => {
      if (busca) {
        const q = busca.toLowerCase()
        return t.titulo.toLowerCase().includes(q) ||
               (t.descricao || '').toLowerCase().includes(q)
      }
      return true
    }).sort((a, b) => {
      // Ordenar por prioridade (alta > media > baixa) e depois por prazo
      const priOrder = { alta: 0, media: 1, baixa: 2 }
      if (priOrder[a.prioridade] !== priOrder[b.prioridade]) {
        return priOrder[a.prioridade] - priOrder[b.prioridade]
      }
      if (a.prazo && b.prazo) return new Date(a.prazo) - new Date(b.prazo)
      return 0
    })
  }, [tarefas, busca])

  const statsPorCargo = useMemo(() =>
    CARGOS.reduce((acc, c) => {
      const qtd = membros.filter(m => normalizarCargo(m.cargo) === c).length
      if (qtd > 0) acc[c] = qtd
      return acc
    }, {}), [membros])

  const piramide = useMemo(() => agruparPorCargo(membrosFiltrados), [membrosFiltrados])

  function CardMembro({ m, compact }) {
    const cor      = avatarCor(m.id)
    const cargoCor = CARGO_CORES_LOCAL[normalizarCargo(m.cargo)] || 'rgba(203,213,235,0.60)'
    const comb     = normalizarCombustivelMembro(m)
    return (
      <div className="rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderTop: `3px solid ${cargoCor}`,
          width: compact ? 200 : undefined,
          minWidth: compact ? 180 : undefined,
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
        }}
        onClick={() => setMembroDetalhe(m)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMembroDetalhe(m) } }}>
        <div className={compact ? 'px-3 pt-3 pb-3' : 'px-5 pt-5 pb-5'}>
          <div className={`flex items-start justify-between ${compact ? 'mb-2' : 'mb-4'}`}>
            <div className={`${compact ? 'w-10 h-10' : 'w-14 h-14'} rounded-xl overflow-hidden flex-shrink-0`}
              style={{ background: `linear-gradient(135deg,${cor},${cor}aa)`, boxShadow: `0 4px 14px ${cor}55` }}>
              {m.foto
                ? <img src={m.foto} alt={m.nome} className="w-full h-full object-cover"
                    style={{ objectPosition: `${m.fotoX??50}% ${m.fotoY??50}%` }} />
                : <div className="w-full h-full flex items-center justify-center font-black text-white" style={{ fontSize: compact ? 14 : 18 }}>
                    {initials(m.nome)}
                  </div>
              }
            </div>
            <div className="flex gap-1" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
              <button
                type="button"
                onClick={e => { e.preventDefault(); e.stopPropagation(); abrirEditar(m) }}
                className="p-1.5 rounded-lg hov-srf transition-colors"
                aria-label="Editar membro"
              >
                <Pencil size={compact ? 12 : 13} style={{ color: 'var(--text-secondary)' }} />
              </button>
              <button
                type="button"
                onClick={e => { e.preventDefault(); e.stopPropagation(); excluirMembro(m.id) }}
                className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                aria-label="Remover membro"
              >
                <Trash2 size={compact ? 12 : 13} style={{ color: '#f87171' }} />
              </button>
            </div>
          </div>
          <h3 className="font-black text-white leading-tight truncate" style={{ fontSize: compact ? 12 : 15 }}>{m.nome}</h3>
          <div className="flex flex-wrap gap-1 mt-1">
            <span className="inline-block px-2 py-0.5 rounded-full font-bold"
              style={{ fontSize: 9, background: cargoCor + '18', color: cargoCor }}>
              {normalizarCargo(m.cargo)}
            </span>
            {(m.vinculo && m.vinculo !== 'Voluntário') || m.vinculo === 'Voluntário' ? (
              <span className="inline-block px-1.5 py-0.5 rounded-full font-bold"
                style={{ fontSize: 8, background: (VINCULO_CORES[m.vinculo||'Voluntário']||'#6366f1') + '18', color: VINCULO_CORES[m.vinculo||'Voluntário']||'#6366f1' }}>
                {m.vinculo||'Voluntário'}
              </span>
            ) : null}
            {comb.ativo && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-bold"
                style={{ fontSize: 8, background: 'rgba(6,182,212,0.18)', color: '#22d3ee' }}>
                <Fuel size={8} /> Combustível
              </span>
            )}
          </div>
          {compact && (
            <p className="mt-2 truncate" style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
              Toque para ver detalhes
            </p>
          )}
          {!compact && (m.telefone || cpfMembro(m) || m.email || m.igrejaNome || (Array.isArray(m.bairros) && m.bairros.length > 0)) && (
            <div className="mt-3 space-y-1.5 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              {m.telefone && (
                <div className="flex items-center gap-2">
                  <Phone size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  <span className="truncate" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.telefone}</span>
                </div>
              )}
              {cpfMembro(m) && (
                <div className="flex items-center gap-2">
                  <CreditCard size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  <span className="truncate" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{cpfMembro(m)}</span>
                </div>
              )}
              {m.email && (
                <div className="flex items-center gap-2">
                  <Mail size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  <span className="truncate lowercase" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.email}</span>
                </div>
              )}
              {m.igrejaNome && (
                <div className="flex items-start gap-2">
                  <Church size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {m.igrejaNome}{m.cargoIgreja ? ` · ${m.cargoIgreja}` : ''}
                  </span>
                </div>
              )}
              {Array.isArray(m.bairros) && m.bairros.length > 0 && (
                <div className="flex items-start gap-2">
                  <MapPin size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{m.bairros.join(', ')}</span>
                </div>
              )}
            </div>
          )}
          {!compact && ((canViewFinance && m.salario) || m.dataInicio || m.contrato) && (
            <div className="mt-3 space-y-1.5 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              {canViewFinance && m.salario && (
                <div className="flex items-center gap-2">
                  <DollarSign size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtSalario(m.salario)}</span>
                </div>
              )}
              {m.contrato && (
                <div className="flex items-center gap-2">
                  <FileText size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  <span className="truncate" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.contrato}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto" >

      {/* ── Modal Membro ──────────────────────────────────── */}
      {modal && (modal === 'novo' || (typeof modal === 'string' && !modal.startsWith('tarefa_'))) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-md rounded-3xl overflow-hidden"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-soft)', boxShadow: 'var(--shadow-lg)' }}>

            {/* Header do modal */}
            <div className="flex items-center justify-between px-6 py-4"
              style={{ background: 'linear-gradient(135deg,#1e3a8a,#1e40af)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.18)' }}>
                  <Users size={17} className="text-white" />
                </div>
                <h3 className="font-bold text-white" style={{ fontSize: 15 }}>
                  {modal === 'novo' ? 'Novo Membro' : 'Editar Membro'}
                </h3>
              </div>
              <button onClick={fechar} className="p-1.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                <X size={16} />
              </button>
            </div>

            {/* Corpo */}
            <div className="px-6 py-4 space-y-3.5 overflow-y-auto" style={{ maxHeight: '62vh' }}>

              {/* Foto do membro */}
              <div className="flex flex-col items-center gap-2 pt-1 pb-1">
                <input ref={fotoInputRef} type="file" accept="image/*" className="hidden"
                  onChange={handleFotoChange} />
                <div className="relative">
                  <button type="button" onClick={() => !fotoProcessando && fotoInputRef.current?.click()}
                    disabled={fotoProcessando}
                    className="relative group rounded-2xl overflow-hidden"
                    style={{ width: 88, height: 88, flexShrink: 0, opacity: fotoProcessando ? 0.7 : 1 }}>
                    {form.foto
                      ? <img src={form.foto} alt="foto" className="w-full h-full object-cover"
                          style={{ objectPosition: `${form.fotoX??50}% ${form.fotoY??50}%` }} />
                      : <div className="w-full h-full flex items-center justify-center font-black text-white"
                          style={{ background: 'var(--bg-hover)', fontSize: 24 }}>
                          {form.nome ? initials(form.nome) : <Camera size={22} style={{ opacity: 0.7 }} />}
                        </div>
                    }
                    {fotoProcessando && (
                      <div className="absolute inset-0 flex items-center justify-center"
                        style={{ background: 'rgba(0,0,0,0.55)' }}>
                        <Loader2 size={22} className="text-white animate-spin"/>
                      </div>
                    )}
                    {!fotoProcessando && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'rgba(0,0,0,0.55)' }}>
                      <Camera size={18} className="text-white"/>
                      <span style={{ fontSize: 9, color: '#fff', fontWeight: 600 }}>Trocar</span>
                    </div>
                    )}
                  </button>
                  {form.foto && (
                    <button type="button" onClick={() => upd('foto', '')}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: '#ef4444', border: '2px solid var(--bg-surface)' }}>
                      <X size={9} className="text-white" />
                    </button>
                  )}
                </div>
                <p className="text-center" style={{ fontSize: 10, color: 'var(--text-faint)', lineHeight: 1.4, maxWidth: 280 }}>
                  Clique na foto, use a galeria ou <strong>Ctrl+V</strong> para colar.
                  PNG, WhatsApp e fotos grandes são ajustadas automaticamente.
                </p>
                {form.foto && (
                  <button type="button" onClick={() => { setFotoRaw(form.foto); setAjusteX(form.fotoX??50); setAjusteY(form.fotoY??50); setModalAjuste(true) }}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition-all hov-srf"
                    style={{ fontSize: 11, color: 'var(--accent-bright)', border: '1px solid rgba(91,155,255,0.25)' }}>
                    <SlidersHorizontal size={10} /> Ajustar posição
                  </button>
                )}
              </div>

              <div>
                <label className="block font-semibold mb-1.5"
                  style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>Nome *</label>
                <input value={form.nome} onChange={e => upd('nome', e.target.value)}
                  onBlur={e => upd('nome', toTitleCase(e.target.value.trim()))}
                  placeholder="Nome completo" className={INPUT_CLS}
                  style={{ ...INPUT_STY, textTransform: 'capitalize' }} />
              </div>

              <div>
                <label className="block font-semibold mb-1.5"
                  style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>Cargo</label>
                <select value={form.cargo} onChange={e => {
                  const cargo = e.target.value
                  if (normalizarCargo(cargo) === 'Igreja') {
                    setForm(p => ({ ...p, cargo, temIgreja: true }))
                  } else {
                    setForm(p => ({ ...p, cargo }))
                  }
                }}
                  className={INPUT_CLS} style={{ ...INPUT_STY, background: 'var(--bg-raised)' }}>
                  {CARGOS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  Na Previsão de Gastos: <strong style={{ color: 'var(--accent-bright)' }}>{labelCategoriaPrevisao(form.cargo)}</strong>
                </p>
              </div>

              <div>
                <label className="block font-semibold mb-1.5"
                  style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>Indicação</label>
                <select
                  value={form.indicacaoMembroId || ''}
                  onChange={e => {
                    const v = e.target.value
                    upd('indicacaoMembroId', v)
                    if (v !== '__outro__') upd('indicacaoPor', '')
                  }}
                  className={INPUT_CLS}
                  style={{ ...INPUT_STY, background: 'var(--bg-raised)' }}>
                  <option value="">Sem indicação</option>
                  {membrosIndicacao.map(m => (
                    <option key={m.id} value={m.id}>{m.nome} — {normalizarCargo(m.cargo)}</option>
                  ))}
                  <option value="__outro__">Outra pessoa (digitar nome)</option>
                </select>
                {form.indicacaoMembroId === '__outro__' && (
                  <input
                    value={form.indicacaoPor || ''}
                    onChange={e => upd('indicacaoPor', e.target.value)}
                    onBlur={e => upd('indicacaoPor', toTitleCase(e.target.value.trim()))}
                    placeholder="Nome de quem indicou"
                    className={`${INPUT_CLS} mt-2`}
                    style={{ ...INPUT_STY, textTransform: 'capitalize' }}
                  />
                )}
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  Registre quem trouxe ou indicou este integrante para a equipe
                </p>
              </div>

              {/* Igreja: caixinha — pode vincular sem mudar o cargo da campanha */}
              <label
                className="flex items-start gap-2.5 rounded-2xl px-3 py-2.5 cursor-pointer"
                style={{
                  background: form.temIgreja || normalizarCargo(form.cargo) === 'Igreja'
                    ? 'rgba(34,211,238,0.08)'
                    : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${form.temIgreja || normalizarCargo(form.cargo) === 'Igreja'
                    ? 'rgba(34,211,238,0.35)'
                    : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(form.temIgreja || normalizarCargo(form.cargo) === 'Igreja')}
                  disabled={normalizarCargo(form.cargo) === 'Igreja'}
                  onChange={e => {
                    const on = e.target.checked
                    if (!on) {
                      setForm(p => ({
                        ...p,
                        temIgreja: false,
                        igrejaId: null,
                        igrejaNome: '',
                        cargoIgreja: '',
                        cargoIgrejaOutro: '',
                      }))
                    } else {
                      upd('temIgreja', true)
                    }
                  }}
                  className="mt-0.5 flex-shrink-0"
                  style={{ width: 15, height: 15, accentColor: '#22d3ee' }}
                />
                <span className="min-w-0">
                  <span className="font-bold block" style={{ fontSize: 12, color: '#e2e8f0' }}>
                    Vincular a uma igreja
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                    Não altera o cargo. Conta na aba Igrejas da equipe.
                  </span>
                </span>
              </label>

              {(form.temIgreja || normalizarCargo(form.cargo) === 'Igreja') && (
              <div className="rounded-2xl p-3 space-y-3" style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.25)' }}>
                <p className="font-bold flex items-center gap-1.5" style={{ fontSize: 11, color: '#22d3ee', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <Church size={12} /> Dados da igreja
                </p>
                <EquipeIgrejaCampo
                  igrejaId={form.igrejaId}
                  igrejaNome={form.igrejaNome}
                  onChange={({ igrejaId, igrejaNome }) => {
                    setForm(p => ({ ...p, igrejaId: igrejaId ?? null, igrejaNome: igrejaNome || '', temIgreja: true }))
                  }}
                />
                <div>
                  <label className="block font-semibold mb-1.5"
                    style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Cargo na igreja</label>
                  <select
                    value={form.cargoIgreja || ''}
                    onChange={e => upd('cargoIgreja', e.target.value)}
                    className={INPUT_CLS}
                    style={{ ...INPUT_STY, background: 'var(--bg-raised)' }}
                  >
                    <option value="">Sem cargo / não informado</option>
                    {CARGOS_IGREJA.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {form.cargoIgreja === 'Outro' && (
                    <input
                      value={form.cargoIgrejaOutro || ''}
                      onChange={e => upd('cargoIgrejaOutro', e.target.value)}
                      onBlur={e => upd('cargoIgrejaOutro', toTitleCase(e.target.value.trim()))}
                      placeholder="Descreva o cargo na igreja"
                      className={`${INPUT_CLS} mt-2`}
                      style={INPUT_STY}
                    />
                  )}
                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                    Pastor, Diácono, etc. — aparece na aba Igrejas da equipe
                  </p>
                </div>
              </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1.5"
                    style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>Telefone</label>
                  <input value={form.telefone} onChange={e => upd('telefone', formatTel(e.target.value))}
                    placeholder="(47) 9xxxx-xxxx" className={INPUT_CLS}
                    style={{
                      ...INPUT_STY,
                      ...(telefoneDuplicado ? { borderColor: '#f87171', boxShadow: '0 0 0 1px rgba(248,113,113,0.35)' } : {}),
                    }}
                    aria-invalid={!!telefoneDuplicado}
                  />
                  {telefoneDuplicado && (
                    <p className="mt-1.5 flex items-start gap-1.5"
                      style={{ fontSize: 11, color: '#f87171', lineHeight: 1.35 }}>
                      <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span>
                        Já cadastrado: <strong>{telefoneDuplicado.nome}</strong>
                        {telefoneDuplicado.cargo ? ` (${normalizarCargo(telefoneDuplicado.cargo)})` : ''}
                      </span>
                    </p>
                  )}
                </div>
                <div>
                  <label className="block font-semibold mb-1.5"
                    style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>CPF</label>
                  <input value={form.cpf || ''} onChange={e => upd('cpf', formatCpf(e.target.value))}
                    placeholder="000.000.000-00" className={INPUT_CLS} style={INPUT_STY}
                    inputMode="numeric" />
                </div>
                <div>
                  <label className="block font-semibold mb-1.5"
                    style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>RG</label>
                  <input value={form.rg || ''} onChange={e => upd('rg', formatRg(e.target.value))}
                    placeholder="00.000.000-0" className={INPUT_CLS} style={INPUT_STY} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1.5"
                    style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>E-mail</label>
                  <input value={form.email} onChange={e => upd('email', e.target.value.toLowerCase())}
                    placeholder="email@exemplo.com" className={INPUT_CLS} style={INPUT_STY} />
                </div>
                <div>
                  <label className="block font-semibold mb-1.5"
                    style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>Data de nascimento</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="bday"
                    placeholder="00/00/0000"
                    maxLength={10}
                    value={formatDataBrInput(form.dataNascimento || '')}
                    onChange={e => upd('dataNascimento', formatDataBrInput(e.target.value))}
                    onBlur={() => {
                      const raw = String(form.dataNascimento || '').trim()
                      if (!raw) return
                      const a = analisarDataBr(raw)
                      if (a.ok) upd('dataNascimento', a.formatted)
                    }}
                    className={INPUT_CLS}
                    style={INPUT_STY}
                  />
                </div>
              </div>

              {/* Endereço residencial */}
              <div className="rounded-2xl p-3 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="font-bold" style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Endereço residencial
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1.5"
                      style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>CEP</label>
                    <div className="flex items-center gap-2">
                      <input value={form.cep || ''} onChange={e => onCepChange(e.target.value)}
                        onBlur={e => {
                          const d = String(e.target.value || '').replace(/\D/g, '')
                          if (d.length === 8 && !form.logradouro && !form.cidade) onCepChange(e.target.value)
                        }}
                        placeholder="00000-000" inputMode="numeric" maxLength={9}
                        className={INPUT_CLS} style={INPUT_STY} />
                      {buscandoCep && (
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>Buscando…</span>
                      )}
                    </div>
                    {cepErro && (
                      <p style={{ fontSize: 10, color: '#f87171', marginTop: 4 }}>{cepErro}</p>
                    )}
                    {!cepErro && form.cidade && form.estado && form.cep?.replace(/\D/g, '').length === 8 && (
                      <p style={{ fontSize: 10, color: '#34d399', marginTop: 4 }}>
                        {form.cidade}/{form.estado}{form.logradouro ? ` · ${form.logradouro}` : ''}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block font-semibold mb-1.5"
                      style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Número</label>
                    <input value={form.numero || ''} onChange={e => upd('numero', e.target.value)}
                      placeholder="Ex.: 120" className={INPUT_CLS} style={INPUT_STY} />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold mb-1.5"
                    style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Logradouro</label>
                  <input value={form.logradouro || ''} onChange={e => upd('logradouro', e.target.value)}
                    onBlur={e => upd('logradouro', toTitleCase(e.target.value.trim()))}
                    placeholder="Rua, avenida… (preenchido pelo CEP ou digite)"
                    className={INPUT_CLS} style={INPUT_STY} />
                </div>

                <div>
                  <label className="block font-semibold mb-1.5"
                    style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Complemento</label>
                  <input value={form.complemento || ''} onChange={e => upd('complemento', e.target.value)}
                    placeholder="Apto, bloco…" className={INPUT_CLS} style={INPUT_STY} />
                </div>

                <div>
                  <label className="block font-semibold mb-1.5"
                    style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Bairro</label>
                  <input value={form.bairroResidencia || ''} onChange={e => upd('bairroResidencia', e.target.value)}
                    onBlur={e => upd('bairroResidencia', toTitleCase(e.target.value.trim()))}
                    placeholder="Bairro onde mora"
                    className={INPUT_CLS} style={INPUT_STY} />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block font-semibold mb-1.5"
                      style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Cidade</label>
                    <input value={form.cidade || ''} onChange={e => upd('cidade', e.target.value)}
                      onBlur={e => upd('cidade', toTitleCase(e.target.value.trim()))}
                      placeholder="Cidade"
                      className={INPUT_CLS} style={INPUT_STY} />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1.5"
                      style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>UF</label>
                    <input value={form.estado || ''} onChange={e => upd('estado', e.target.value.toUpperCase().slice(0, 2))}
                      placeholder="UF" maxLength={2}
                      className={INPUT_CLS} style={{ ...INPUT_STY, textTransform: 'uppercase' }} />
                  </div>
                </div>

                <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                  Digite o CEP para preencher automaticamente. Sem CEP, preencha os campos à mão.
                </p>
              </div>

              <div className="rounded-2xl p-3 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="font-bold" style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Área de atuação
                </p>

                <div>
                  <label className="block font-semibold mb-1.5"
                    style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>1. Cidade de atuação</label>
                  <select
                    value={form.cidadeAtuacao || ''}
                    onChange={e => trocarCidadeAtuacao(e.target.value)}
                    className={INPUT_CLS}
                    style={{ ...INPUT_STY, background: 'var(--bg-raised)' }}
                  >
                    <option value="">Selecione a cidade...</option>
                    {form.cidadeAtuacao && !cidadesAtuacao.includes(form.cidadeAtuacao) && (
                      <option value={form.cidadeAtuacao}>{form.cidadeAtuacao}</option>
                    )}
                    {cidadesAtuacao.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="relative">
                  <label className="block font-semibold mb-1.5"
                    style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>2. Bairro / Setor de atuação</label>
                  <button
                    type="button"
                    disabled={!form.cidadeAtuacao}
                    onClick={() => { if (form.cidadeAtuacao) { setBairroOpen(v => !v); setBairroBusca('') } }}
                    className="w-full text-left px-3 py-2 rounded-xl flex items-center justify-between gap-2 disabled:opacity-50"
                    style={{ ...INPUT_STY, background: 'var(--bg-raised)', border: '1.5px solid rgba(255,255,255,0.12)', minHeight: 38 }}>
                    <span className="flex flex-wrap gap-1 flex-1 min-w-0">
                      {!form.cidadeAtuacao
                        ? <span style={{ color: 'var(--text-faint)' }}>Selecione a cidade primeiro...</span>
                        : form.bairros.length === 0
                          ? <span style={{ color: 'var(--text-faint)' }}>Selecione os bairros...</span>
                          : form.bairros.length <= 3
                            ? form.bairros.map(b => (
                                <span key={b} className="px-1.5 py-0.5 rounded-md font-medium"
                                  style={{ fontSize: 10, background: 'rgba(37,99,235,0.18)', color: '#93c5fd' }}>{b}</span>
                              ))
                            : <>
                                {form.bairros.slice(0, 2).map(b => (
                                  <span key={b} className="px-1.5 py-0.5 rounded-md font-medium"
                                    style={{ fontSize: 10, background: 'rgba(37,99,235,0.18)', color: '#93c5fd' }}>{b}</span>
                                ))}
                                <span className="px-1.5 py-0.5 rounded-md"
                                  style={{ fontSize: 10, background: 'rgba(37,99,235,0.12)', color: '#60a5fa' }}>+{form.bairros.length - 2} mais</span>
                              </>
                      }
                    </span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                      style={{ flexShrink: 0, color: 'rgba(203,213,235,0.45)', transform: bairroOpen ? 'rotate(180deg)' : '', transition: 'transform .15s' }}>
                      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  {bairroOpen && form.cidadeAtuacao && (
                    <div className="absolute z-50 left-0 right-0 mt-1 rounded-xl overflow-hidden"
                      style={{ background: 'var(--bg-overlay)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 8px 32px rgba(0,0,0,0.55)', top: '100%' }}>
                      <div className="p-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                        <input autoFocus value={bairroBusca} onChange={e => setBairroBusca(e.target.value)}
                          placeholder={`Buscar bairro em ${form.cidadeAtuacao}...`}
                          className="w-full bg-transparent outline-none text-xs px-2 py-1"
                          style={{ color: 'var(--text-primary)' }} />
                      </div>
                      <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
                        {form.bairros.length > 0 && (
                          <button type="button" onClick={() => upd('bairros', [])}
                            className="w-full text-left px-3 py-1.5 text-xs hov-srf transition-colors"
                            style={{ color: '#f87171', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            Limpar seleção
                          </button>
                        )}
                        {bairrosAtuacaoOpts.length === 0 && (
                          <p className="px-3 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            Nenhum bairro cadastrado para esta cidade.
                          </p>
                        )}
                        {bairrosAtuacaoOpts
                          .filter(b => !bairroBusca || b.toLowerCase().includes(bairroBusca.toLowerCase()))
                          .map(b => {
                            const sel = form.bairros.includes(b)
                            return (
                              <button key={b} type="button"
                                onClick={() => upd('bairros', sel ? form.bairros.filter(x => x !== b) : [...form.bairros, b])}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hov-srf transition-colors">
                                <div className="w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center"
                                  style={{ background: sel ? '#2563eb' : 'transparent', border: sel ? '1.5px solid #2563eb' : '1.5px solid rgba(255,255,255,0.25)' }}>
                                  {sel && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                </div>
                                <span className="text-xs" style={{ color: sel ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: sel ? 600 : 400 }}>{b}</span>
                              </button>
                            )
                          })}
                      </div>
                      <div className="px-3 py-2 flex justify-between items-center"
                        style={{ borderTop: '1px solid rgba(255,255,255,0.07)', fontSize: 11, color: 'var(--text-tertiary)' }}>
                        <span>{form.bairros.length} selecionado{form.bairros.length !== 1 ? 's' : ''} · {form.cidadeAtuacao}</span>
                        <button type="button" onClick={() => setBairroOpen(false)}
                          className="font-bold" style={{ color: 'var(--accent-bright)', fontSize: 11 }}>Fechar</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Vínculo e contrato ── */}
              <div className="rounded-2xl p-3 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="font-bold" style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Vínculo &amp; Remuneração</p>
                <div className={`grid gap-3 ${canViewFinance ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <div>
                    <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Tipo de vínculo</label>
                    <select value={form.vinculo||'Voluntário'} onChange={e => upd('vinculo', e.target.value)}
                      className={INPUT_CLS} style={{ ...INPUT_STY, background: 'var(--bg-raised)' }}>
                      {VINCULOS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  {canViewFinance && (
                    <div>
                      <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Remuneração (R$)</label>
                      <input type="number" min="0" step="0.01" value={form.salario} onChange={e => upd('salario', e.target.value)}
                        placeholder="0,00" className={INPUT_CLS} style={INPUT_STY} />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Data de início</label>
                    <input type="date" value={form.dataInicio||''} onChange={e => upd('dataInicio', e.target.value)}
                      className={INPUT_CLS} style={{ ...INPUT_STY, colorScheme: 'dark' }} />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Nº do contrato</label>
                    <input value={form.contrato||''} onChange={e => upd('contrato', e.target.value)}
                      placeholder="Ex: CTR-2024-001" className={INPUT_CLS} style={INPUT_STY} />
                  </div>
                </div>
              </div>

              {/* ── Dados bancários ── */}
              {canViewFinance && (
              <div className="rounded-2xl p-3 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="font-bold" style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Dados bancários
                </p>
                <div>
                  <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Banco</label>
                  <input value={form.banco || ''} onChange={e => upd('banco', e.target.value)}
                    placeholder="Ex: Banco do Brasil, Itaú, Nubank…"
                    className={INPUT_CLS} style={INPUT_STY} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Agência</label>
                    <input value={form.agencia || ''} onChange={e => upd('agencia', e.target.value)}
                      placeholder="0001" className={INPUT_CLS} style={INPUT_STY} />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Conta</label>
                    <input value={form.conta || ''} onChange={e => upd('conta', e.target.value)}
                      placeholder="12345-6" className={INPUT_CLS} style={INPUT_STY} />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Chave PIX</label>
                  <input value={form.pix || ''} onChange={e => upd('pix', e.target.value)}
                    placeholder="CPF, e-mail, telefone ou chave aleatória"
                    className={INPUT_CLS} style={INPUT_STY} />
                </div>
              </div>
              )}

              {/* ── Combustível ── */}
              <div className="rounded-2xl p-3 space-y-3"
                style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)' }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold flex items-center gap-2"
                    style={{ fontSize: 11, color: '#22d3ee', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <Fuel size={13} /> Combustível
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={!!form.combustivel?.ativo}
                      onChange={e => updComb('ativo', e.target.checked)}
                      className="rounded" />
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Vincular veículo</span>
                  </label>
                </div>
                {form.combustivel?.ativo && (
                  <>
                    <div>
                      <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        Nome / modelo do veículo
                      </label>
                      <input value={form.combustivel?.veiculo || ''} onChange={e => updComb('veiculo', e.target.value)}
                        placeholder={`Ex: Fiat Uno — ${form.nome || 'motorista'}`}
                        className={INPUT_CLS} style={INPUT_STY} />
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          Litros cedidos
                        </label>
                        <input type="number" min="0" step="0.1" value={form.combustivel?.litrosMes ?? ''}
                          onChange={e => updComb('litrosMes', e.target.value)}
                          placeholder="100" className={INPUT_CLS} style={INPUT_STY} />
                      </div>
                    </div>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                      Aparece automaticamente em <strong style={{ color: '#22d3ee' }}>Combustível</strong> na Previsão de Gastos
                    </p>
                  </>
                )}
              </div>

              <div>
                <label className="block font-semibold mb-1.5"
                  style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>Observações</label>
                <textarea value={form.observacoes} onChange={e => upd('observacoes', e.target.value)}
                  placeholder="Notas adicionais..." rows={2}
                  className={`${INPUT_CLS} resize-none`}
                  style={{ ...INPUT_STY, fontSize: 12 }} />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 space-y-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              {saveErro && (
                <p className="rounded-xl px-3 py-2 font-semibold"
                  style={{ fontSize: 11, color: '#fca5a5', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)' }}>
                  {saveErro}
                </p>
              )}
              <div className="flex gap-2">
              <button onClick={fechar} className="px-5 py-2.5 rounded-2xl font-semibold text-sm"
                style={{ border: '1px solid var(--border-soft)', color: 'var(--text-secondary)' }}>
                Cancelar
              </button>
              <button type="button" onClick={salvar} disabled={!form.nome.trim()}
                className="flex-1 py-2.5 rounded-2xl font-bold text-white text-sm disabled:opacity-40 transition-all"
                style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)',
                         boxShadow: '0 4px 14px rgba(79,70,229,0.35)' }}>
                Salvar
              </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Tarefa ─────────────────────────────────── */}
      {modal && (modal === 'tarefa_novo' || (typeof modal === 'string' && modal.startsWith('tarefa_'))) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-md rounded-3xl overflow-hidden"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-soft)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="flex items-center justify-between px-6 py-4"
              style={{ background: 'linear-gradient(135deg,#1e3a8a,#1e40af)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.18)' }}>
                  <ListTodo size={17} className="text-white" />
                </div>
                <h3 className="font-bold text-white" style={{ fontSize: 15 }}>
                  {modal === 'tarefa_novo' ? 'Nova Tarefa' : 'Editar Tarefa'}
                </h3>
              </div>
              <button onClick={fechar} className="p-1.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                <X size={16} />
              </button>
            </div>
            <div className="px-6 py-4 space-y-3.5 overflow-y-auto" style={{ maxHeight: '62vh' }}>
              <div>
                <label className="block font-semibold mb-1.5"
                  style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>Título *</label>
                <input value={tarefaForm.titulo} onChange={e => updTarefa('titulo', e.target.value)}
                  placeholder="Título da tarefa" className={INPUT_CLS} style={INPUT_STY} />
              </div>
              <div>
                <label className="block font-semibold mb-1.5"
                  style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>Descrição</label>
                <textarea value={tarefaForm.descricao} onChange={e => updTarefa('descricao', e.target.value)}
                  placeholder="Detalhes da tarefa" className={INPUT_CLS} style={{ ...INPUT_STY, minHeight: 80 }} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold mb-1.5"
                    style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>Status</label>
                  <select value={tarefaForm.status} onChange={e => updTarefa('status', e.target.value)}
                    className={INPUT_CLS} style={{ ...INPUT_STY, background: 'var(--bg-raised)' }}>
                    {STATUS_TAREFA.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1.5"
                    style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>Prioridade</label>
                  <select value={tarefaForm.prioridade} onChange={e => updTarefa('prioridade', e.target.value)}
                    className={INPUT_CLS} style={{ ...INPUT_STY, background: 'var(--bg-raised)' }}>
                    {PRIORIDADES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-semibold mb-1.5"
                  style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>Prazo</label>
                <input type="date" value={tarefaForm.prazo} onChange={e => updTarefa('prazo', e.target.value)}
                  className={INPUT_CLS} style={{ ...INPUT_STY, fontSize: 12 }} />
              </div>
            </div>
            <div className="px-6 py-4 flex gap-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button onClick={fechar} className="px-5 py-2.5 rounded-2xl font-semibold text-sm"
                style={{ border: '1px solid var(--border-soft)', color: 'var(--text-secondary)' }}>
                Cancelar
              </button>
              <button onClick={salvarTarefa} disabled={!tarefaForm.titulo.trim()}
                className="flex-1 py-2.5 rounded-2xl font-bold text-white text-sm disabled:opacity-40 transition-all"
                style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)',
                         boxShadow: '0 4px 14px rgba(79,70,229,0.35)' }}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      <ListCrudLayout
        icon={headerIcon}
        title={headerTitle}
        subtitle={headerSubtitle}
        wrapClassName={`space-y-5${isMobile && !somenteContratos ? ' pb-28' : ' pb-10'}`}
        kpis={aba === 'membros' && Object.keys(statsPorCargo).length > 0
          ? Object.entries(statsPorCargo).slice(0, 4).map(([cargo, qtd], i) => ({
            label: cargo,
            value: qtd,
            gold: i === 0,
          }))
          : undefined}
        kpiColumns={aba === 'membros' ? Math.min(4, Object.keys(statsPorCargo).length) : undefined}
        toolbar={!isMobile && !somenteContratos ? (
          <SegmentedControl
            className="segmented-control--multi"
            options={abasEquipe}
            value={aba}
            onChange={setAba}
            aria-label="Seções da equipe"
          />
        ) : null}
        headerActions={
          <>
            <SaveButton variant="ghost" />
            {aba === 'membros' ? (
              <>
                <Button icon={Printer} variant="ghost" onClick={() => setRelatorioMembrosAberto(true)}>
                  Relatório
                </Button>
                <Button icon={Plus} onClick={abrirNovo}>Adicionar Membro</Button>
              </>
            ) : aba === 'tarefas' ? (
              <Button icon={Plus} onClick={abrirNovaTarefa}>Nova Tarefa</Button>
            ) : aba === 'indicacoes' ? (
              <Button icon={FileText} onClick={() => setRelatorioIndicacoesAberto(true)}>Relatório PDF</Button>
            ) : aba === 'igrejas' ? (
              <Button icon={FileText} onClick={() => setRelatorioIgrejasAberto(true)}>Relatório PDF</Button>
            ) : aba === 'financeiro' ? (
              <Button icon={FileText} onClick={() => setRelatorioContratosAberto(true)}>Relatório Contratos</Button>
            ) : null}
          </>
        }
      >

        {/* ABA: MEMBROS */}
        {aba === 'membros' && (
          <>
            {/* Barra de busca + filtros de cargo */}
            <div className="rounded-3xl p-4 space-y-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div className="relative w-full">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--text-tertiary)' }} />
                <input value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar por nome, bairro, telefone ou CPF…"
                  className="input-dark w-full pl-10 pr-3 py-2.5"
                  style={{ fontSize: 13, minWidth: 0 }} />
              </div>
              <div className="flex gap-2 flex-wrap">
                {cargosAtivos.map(c => (
                  <button key={c} onClick={() => setFiltro(c)}
                    className="px-3 py-2 rounded-xl font-semibold transition-all"
                    style={{
                      fontSize: 12,
                      background: filtro === c ? '#1d4ed8' : 'var(--bg-raised)',
                      color:      filtro === c ? '#fff'    : 'var(--text-secondary)',
                    }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid de membros */}
            {membrosFiltrados.length === 0 ? (
              <div className="rounded-3xl p-14 text-center"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div className="w-20 h-20 rounded-3xl mx-auto mb-5 flex items-center justify-center"
              style={{ background: 'var(--bg-raised)' }}>
              <Users size={34} style={{ color: 'var(--text-faint)' }} />
            </div>
            <p className="font-bold text-white/70" style={{ fontSize: 16 }}>
              {membros.length === 0 ? 'Nenhum membro cadastrado' : 'Nenhum resultado'}
            </p>
            <p className="text-white/35 mt-2" style={{ fontSize: 13 }}>
              {membros.length === 0
                ? 'Clique em "Adicionar Membro" para cadastrar a equipe'
                : 'Tente ajustar os filtros de busca'}
            </p>
            {membros.length === 0 && (
              <button onClick={abrirNovo}
                className="mt-5 flex items-center gap-2 font-bold text-white px-6 py-3 rounded-2xl mx-auto"
                style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)',
                         boxShadow: '0 4px 14px rgba(79,70,229,0.35)', fontSize: 13 }}>
                <Plus size={16} /> Adicionar Primeiro Membro
              </button>
            )}
          </div>
        ) : isMobile ? (
          <div className="space-y-2">
            {(busca.trim() || filtro !== 'Todos') && (
              <p className="px-1 pb-1" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {membrosFiltrados.length} resultado{membrosFiltrados.length !== 1 ? 's' : ''}
                {busca.trim() ? ` para “${busca.trim()}”` : ''}
                {filtro !== 'Todos' ? ` · ${filtro}` : ''}
              </p>
            )}
            {membrosFiltrados.map(m => {
              const cargoCor = CARGO_CORES_LOCAL[normalizarCargo(m.cargo)] || 'rgba(203,213,235,0.60)'
              const bairrosTxt = Array.isArray(m.bairros) && m.bairros.length > 0
                ? m.bairros.join(', ')
                : (m.telefone || '')
              return (
                <RecordCard
                  key={m.id}
                  primary={m.nome}
                  secondary={[normalizarCargo(m.cargo), m.vinculo || 'Voluntário'].join(' · ')}
                  meta={bairrosTxt}
                  lead={renderMembroLead(m)}
                  status={<Pill color={cargoCor} dot>{normalizarCargo(m.cargo)}</Pill>}
                  onClick={() => setMembroDetalhe(m)}
                  actions={(
                    <div className="flex gap-1" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); abrirEditar(m) }}
                        className="p-1.5 rounded-lg hov-srf transition-colors"
                        aria-label="Editar membro"
                      >
                        <Pencil size={13} style={{ color: 'var(--text-secondary)' }} />
                      </button>
                      <button
                        type="button"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); excluirMembro(m.id) }}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                        aria-label="Remover membro"
                      >
                        <Trash2 size={13} style={{ color: '#f87171' }} />
                      </button>
                    </div>
                  )}
                />
              )
            })}
          </div>
        ) : (
          <div className="rounded-3xl p-6 md:p-8"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-center font-bold uppercase tracking-widest mb-2"
              style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
              Pirâmide organizacional · maior cargo no topo
            </p>
            {(busca.trim() || filtro !== 'Todos') && (
              <p className="text-center mb-6" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {membrosFiltrados.length} resultado{membrosFiltrados.length !== 1 ? 's' : ''}
                {busca.trim() ? ` para “${busca.trim()}”` : ''}
                {filtro !== 'Todos' ? ` · ${filtro}` : ''}
              </p>
            )}
            <div className={`flex flex-col items-center gap-2 ${(busca.trim() || filtro !== 'Todos') ? '' : 'mt-6'}`}>
              {piramide.map(({ cargo, membros: lista }, nivel) => {
                const cargoCor = CARGO_CORES_LOCAL[cargo] || 'rgba(203,213,235,0.60)'
                const largura = Math.min(96, 42 + nivel * 14)
                return (
                  <div key={cargo} className="flex flex-col items-center w-full">
                    {nivel > 0 && (
                      <div className="flex items-center justify-center gap-2 mb-3" style={{ width: `${largura}%` }}>
                        <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)' }} />
                        <div className="w-2 h-2 rotate-45" style={{ background: cargoCor + '66', border: `1px solid ${cargoCor}` }} />
                        <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)' }} />
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-3 px-4 py-1.5 rounded-full"
                      style={{ background: cargoCor + '18', border: `1px solid ${cargoCor}44` }}>
                      <Briefcase size={12} style={{ color: cargoCor }} />
                      <span className="font-bold" style={{ fontSize: 11, color: cargoCor }}>{cargo}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>({lista.length})</span>
                    </div>
                    <div className="flex flex-wrap justify-center gap-3 mb-2" style={{ maxWidth: `${largura}%` }}>
                      {lista.map(m => <CardMembro key={m.id} m={m} compact />)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
          </>
        )}

        {/* ABA: TAREFAS */}
        {aba === 'tarefas' && (
          <>
            <div className="rounded-3xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--text-tertiary)' }} />
                <input value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar tarefas…"
                  className="input-dark w-full pl-9 pr-3 py-2"
                  style={{ fontSize: 13 }} />
              </div>
            </div>

            {tarefasFiltradas.length === 0 ? (
              <div className="rounded-3xl p-14 text-center"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div className="w-20 h-20 rounded-3xl mx-auto mb-5 flex items-center justify-center"
                  style={{ background: 'var(--bg-raised)' }}>
                  <ListTodo size={34} style={{ color: 'var(--text-faint)' }} />
                </div>
                <p className="font-bold text-white/70" style={{ fontSize: 16 }}>
                  {tarefas.length === 0 ? 'Nenhuma tarefa cadastrada' : 'Nenhum resultado'}
                </p>
                <p className="text-white/35 mt-2" style={{ fontSize: 13 }}>
                  {tarefas.length === 0 ? 'Clique em "Nova Tarefa" para começar' : 'Tente ajustar a busca'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {tarefasFiltradas.map(t => {
                  const status = STATUS_TAREFA.find(s => s.id === t.status) || STATUS_TAREFA[0]
                  const prioridade = PRIORIDADES.find(p => p.id === t.prioridade) || PRIORIDADES[1]
                  const prazoTxt = t.prazo
                    ? new Date(t.prazo + 'T12:00').toLocaleDateString('pt-BR')
                    : null
                  return (
                    <RecordCard
                      key={t.id}
                      primary={t.titulo}
                      secondary={t.descricao || 'Sem descrição'}
                      meta={prazoTxt ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock size={11} /> Prazo {prazoTxt}
                        </span>
                      ) : null}
                      icon={ListTodo}
                      status={
                        <StatusPill
                          variant={TAREFA_STATUS_VARIANT[t.status] || 'pendente'}
                          label={status.label}
                          bordered={false}
                          pulse={t.status === 'em_andamento'}
                        />
                      }
                      onClick={() => { setTarefaForm({ ...t }); setModal('tarefa_' + t.id) }}
                      actions={(
                        <div className="flex flex-col items-end gap-2">
                          <Pill color={prioridade.cor}>{prioridade.label}</Pill>
                          <div className="flex gap-1" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={e => { e.preventDefault(); e.stopPropagation(); setTarefaForm({ ...t }); setModal('tarefa_' + t.id) }}
                              className="p-1.5 rounded-xl hover:srf/5 transition-colors"
                              aria-label="Editar tarefa"
                            >
                              <Pencil size={13} style={{ color: 'var(--text-secondary)' }} />
                            </button>
                            <button
                              type="button"
                              onClick={e => { e.preventDefault(); e.stopPropagation(); excluirTarefa(t.id) }}
                              className="p-1.5 rounded-xl hover:bg-red-500/10 transition-colors"
                              aria-label="Excluir tarefa"
                            >
                              <Trash2 size={13} style={{ color: '#f87171' }} />
                            </button>
                          </div>
                        </div>
                      )}
                    />
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ABA: INDICAÇÕES */}
        {aba === 'indicacoes' && (
          <EquipeIndicacoes
            membros={membros}
            onEditar={(m) => { abrirEditar(m) }}
          />
        )}

        {/* ABA: IGREJAS */}
        {aba === 'igrejas' && (
          <EquipeIgrejas
            membros={membros}
            onEditar={(m) => { abrirEditar(m) }}
          />
        )}

        {/* ABA: EQUIPE DE RUA FREELANCER */}
        {aba === 'rua' && <EquipeRuaFreelancers />}

        {/* ABA: CONTRATOS (PDF prestação de serviços) */}
        {aba === 'contratos' && (
          <EquipeContratos
            membros={membros}
            onAtualizarMembro={atualizarMembroContrato}
          />
        )}

        {/* ABA: FINANCEIRO & CONTRATOS */}
        {aba === 'financeiro' && (() => {
          void finTick
          const finAll = loadFinanceiro()
          const termo = buscaFin.trim().toLowerCase()
          const linhas = membros
            .map(m => {
              const fin = getFinanceiroMembro(finAll, m.id)
              const total = valorContratoEfetivo(fin, m)
              const pago = totalPago(fin)
              return { m, fin, total, pago, saldo: total - pago }
            })
            .filter(l => !termo
              || l.m.nome.toLowerCase().includes(termo)
              || String(l.m.contrato || '').toLowerCase().includes(termo))
            .sort((a, b) => a.m.nome.localeCompare(b.m.nome, 'pt-BR'))
          const totGeral   = linhas.reduce((s, l) => s + l.total, 0)
          const pagoGeral  = linhas.reduce((s, l) => s + l.pago, 0)
          const saldoGeral = totGeral - pagoGeral
          const semNumero  = linhas.filter(l => l.total > 0 && !String(l.m.contrato || '').trim()).length
          return (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total em contratos', valor: fmtMoedaFin(totGeral),  cor: 'var(--text-primary)' },
                  { label: 'Total pago',         valor: fmtMoedaFin(pagoGeral), cor: '#34d399' },
                  { label: 'Saldo devedor',      valor: fmtMoedaFin(saldoGeral < 0 ? 0 : saldoGeral), cor: saldoGeral > 0 ? '#f87171' : '#34d399' },
                  { label: 'Sem nº de contrato', valor: String(semNumero),      cor: semNumero > 0 ? '#fbbf24' : 'var(--text-primary)' },
                ].map(card => (
                  <div key={card.label} className="rounded-2xl px-4 py-3"
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                    <p className="font-black" style={{ fontSize: 20, color: card.cor }}>{card.valor}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{card.label}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-3xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--text-tertiary)' }} />
                  <input value={buscaFin} onChange={e => setBuscaFin(e.target.value)}
                    placeholder="Buscar por nome ou nº do contrato…"
                    className="input-dark w-full pl-9 pr-3 py-2"
                    style={{ fontSize: 13 }} />
                </div>
              </div>

              {linhas.length === 0 ? (
                <div className="rounded-3xl p-10 text-center" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                    {membros.length === 0 ? 'Cadastre membros na aba Membros para acompanhar o financeiro' : 'Nenhum membro encontrado'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {linhas.map(({ m, fin, total, pago, saldo }) => {
                    const pct = total > 0 ? Math.min(100, Math.round((pago / total) * 100)) : 0
                    const quitado = total > 0 && saldo <= 0
                    const temContratoNum = String(m.contrato || '').trim() !== ''
                    return (
                      <div key={m.id} className="rounded-3xl p-4"
                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                        <div className="flex flex-col md:flex-row md:items-center gap-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
                              style={{ background: 'rgba(37,99,235,0.15)' }}>
                              {m.foto
                                ? <img src={m.foto} alt={m.nome} className="w-full h-full object-cover"
                                    style={{ objectPosition: `${m.fotoX??50}% ${m.fotoY??50}%` }} />
                                : <Users size={16} style={{ color: 'var(--accent-bright)' }} />}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold truncate" style={{ fontSize: 13, color: 'var(--text-primary)' }}>{m.nome}</p>
                              <p className="truncate" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                {[m.cargo, m.vinculo].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                          </div>

                          <div className="flex-shrink-0" style={{ width: 170 }}>
                            <p className="font-bold mb-1" style={{ fontSize: 9, color: temContratoNum ? 'var(--text-tertiary)' : '#fbbf24' }}>
                              Nº DO CONTRATO {!temContratoNum && total > 0 ? '· PENDENTE' : ''}
                            </p>
                            <input
                              key={`${m.id}-${m.contrato || ''}`}
                              defaultValue={m.contrato || ''}
                              placeholder="Adicionar nº…"
                              className="input-dark w-full px-2.5 py-1.5"
                              style={{ fontSize: 12, borderColor: !temContratoNum && total > 0 ? 'rgba(251,191,36,0.4)' : undefined }}
                              onBlur={e => salvarNumeroContrato(m.id, e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                            />
                          </div>

                          <div className="flex items-center gap-4 flex-shrink-0">
                            <div style={{ minWidth: 90 }}>
                              <p className="font-bold" style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>VALOR</p>
                              <p className="font-bold" style={{ fontSize: 13, color: 'var(--text-primary)' }}>{fmtMoedaFin(total)}</p>
                            </div>
                            <div style={{ minWidth: 90 }}>
                              <p className="font-bold" style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>PAGO</p>
                              <p className="font-bold" style={{ fontSize: 13, color: '#34d399' }}>{fmtMoedaFin(pago)}</p>
                            </div>
                            <div style={{ minWidth: 90 }}>
                              <p className="font-bold" style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>SALDO</p>
                              <p className="font-bold" style={{ fontSize: 13, color: quitado ? '#34d399' : (total > 0 ? '#f87171' : 'var(--text-tertiary)') }}>
                                {total > 0 ? fmtMoedaFin(saldo < 0 ? 0 : saldo) : '—'}
                              </p>
                            </div>
                          </div>

                          <button type="button" onClick={() => setFinanceiroMembro(m)}
                            className="flex-shrink-0 px-4 py-2 rounded-xl font-bold transition-all"
                            style={{ fontSize: 12, background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.25)' }}>
                            {(fin.pagamentos?.length || fin.contratos?.length || String(fin.valorContrato ?? '').trim()) ? 'Abrir' : 'Adicionar'}
                          </button>
                        </div>

                        {total > 0 && (
                          <div className="mt-3 flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                              <div className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, background: quitado ? '#10b981' : '#3b82f6' }} />
                            </div>
                            <span className="font-bold flex-shrink-0" style={{ fontSize: 10, color: quitado ? '#34d399' : 'var(--text-tertiary)' }}>
                              {quitado ? 'Quitado' : `${pct}%`}
                            </span>
                            {(fin.contratos?.length > 0) && (
                              <span className="flex-shrink-0 flex items-center gap-1" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                <FileText size={11} /> {fin.contratos.length}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )
        })()}

        {/* ABA: LOG */}
        {aba === 'log' && (
          log.length === 0 ? (
            <div className="rounded-3xl p-12 text-center" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <History size={32} style={{ color: 'var(--text-faint)', marginBottom: 8 }} />
              <p className="text-white/35" style={{ fontSize: 12 }}>Nenhuma atividade registrada</p>
            </div>
          ) : (
            <div className="space-y-2">
              {log.map(l => {
                const LogIcon = l.tipo.includes('membro') ? Users
                  : l.tipo.includes('tarefa') ? ListTodo
                    : History
                return (
                  <RecordCard
                    key={l.id}
                    primary={l.mensagem}
                    secondary={new Date(l.timestamp).toLocaleString('pt-BR')}
                    icon={LogIcon}
                    status={
                      <StatusPill
                        variant="pendente"
                        label={l.tipo.includes('membro') ? 'Membro' : l.tipo.includes('tarefa') ? 'Tarefa' : 'Sistema'}
                        bordered={false}
                      />
                    }
                  />
                )
              })}
            </div>
          )
        )}
      </ListCrudLayout>

      {isMobile && !somenteContratos && mobileSegmentOptions.length > 0 && (
        <>
          <SegmentedControl
            fixedBottom
            options={mobileSegmentOptions}
            value={mobileSegmentValue}
            onChange={onMobileSegmentChange}
            aria-label="Navegação da equipe"
          />
          <BottomSheet
            snap={navSheetSnap}
            onSnapChange={setNavSheetSnap}
            showScrim={navSheetSnap !== 'closed'}
            header={(
              <p className="font-bold" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                Mais seções
              </p>
            )}
          >
            <div className="space-y-2 pb-2">
              {mobileSecondaryAbas.map(t => {
                const TabIcon = t.icon
                const active = aba === t.id
                return (
                  <RecordCard
                    key={t.id}
                    primary={t.label}
                    secondary={active ? 'Seção atual' : 'Toque para abrir'}
                    icon={TabIcon}
                    onClick={() => escolherAbaMobile(t.id)}
                    status={active ? <StatusPill variant="em-rota" label="Ativa" bordered={false} pulse /> : null}
                  />
                )
              })}
            </div>
          </BottomSheet>
        </>
      )}

      {/* ── Modal: Detalhes do membro ─────────────────────── */}
      {membroDetalhe && (() => {
        const m = membroDetalhe
        const cor = avatarCor(m.id)
        const cargoCor = CARGO_CORES_LOCAL[normalizarCargo(m.cargo)] || 'rgba(203,213,235,0.60)'
        const comb = normalizarCombustivelMembro(m)
        const bairros = Array.isArray(m.bairros) ? m.bairros
          : (m.bairro ? m.bairro.split(',').map(b => b.trim()).filter(Boolean) : [])
        const waUrl = m.telefone ? linkWhatsApp(m.telefone, `Olá ${m.nome?.split(' ')[0] || ''}, tudo bem?`) : ''
        const InfoRow = ({ icon: Icon, label, value, href }) => (
          value ? (
            <div className="flex items-start gap-3 py-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.05)' }}>
                <Icon size={14} style={{ color: cargoCor }}/>
              </div>
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 2 }}>{label}</p>
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer"
                    className="font-semibold truncate block hover:underline"
                    style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                    {value}
                  </a>
                ) : (
                  <p className="font-semibold" style={{ fontSize: 13, color: 'var(--text-primary)' }}>{value}</p>
                )}
              </div>
            </div>
          ) : null
        )
        return (
          <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center p-0 sm:p-4"
            style={{ background: 'var(--scrim)', backdropFilter: 'blur(8px)' }}
            onClick={() => setMembroDetalhe(null)}>
            <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[92vh] flex flex-col anim-fade-up"
              style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}
              onClick={e => e.stopPropagation()}>

              <div className="px-6 pt-6 pb-5 flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${cargoCor}33 0%, rgba(30,58,138,0.4) 100%)`, borderBottom: `1px solid ${cargoCor}30` }}>
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0"
                    style={{ background: `linear-gradient(135deg,${cor},${cor}aa)`, boxShadow: `0 6px 20px ${cor}55` }}>
                    {m.foto
                      ? <img src={m.foto} alt={m.nome} className="w-full h-full object-cover"
                          style={{ objectPosition: `${m.fotoX??50}% ${m.fotoY??50}%` }}/>
                      : <div className="w-full h-full flex items-center justify-center font-black text-white text-xl">
                          {initials(m.nome)}
                        </div>}
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <h3 className="font-black text-white leading-tight" style={{ fontSize: 18 }}>{m.nome}</h3>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="px-2.5 py-0.5 rounded-full font-bold"
                        style={{ fontSize: 10, background: cargoCor + '25', color: cargoCor, border: `1px solid ${cargoCor}44` }}>
                        {normalizarCargo(m.cargo)}
                      </span>
                      <span className="px-2 py-0.5 rounded-full font-bold"
                        style={{ fontSize: 9, background: (VINCULO_CORES[m.vinculo||'Voluntário']||'#6366f1') + '20', color: VINCULO_CORES[m.vinculo||'Voluntário']||'#6366f1' }}>
                        {m.vinculo || 'Voluntário'}
                      </span>
                      {comb.ativo && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold"
                          style={{ fontSize: 9, background: 'rgba(6,182,212,0.2)', color: '#22d3ee' }}>
                          <Fuel size={9}/> Combustível
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                      {labelCategoriaPrevisao(m.cargo)}
                    </p>
                  </div>
                  <button type="button" onClick={() => setMembroDetalhe(null)}
                    className="p-1.5 rounded-xl flex-shrink-0" style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}>
                    <X size={16}/>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
                <InfoRow icon={Phone} label="Telefone" value={m.telefone} href={m.telefone ? `tel:${m.telefone.replace(/\D/g,'')}` : null}/>
                <InfoRow icon={CreditCard} label="CPF" value={cpfMembro(m) || null}/>
                <InfoRow icon={CreditCard} label="RG" value={m.rg || null}/>
                <InfoRow icon={Mail} label="E-mail" value={m.email} href={m.email ? `mailto:${m.email}` : null}/>
                <InfoRow icon={CalendarDays} label="Data de nascimento" value={m.dataNascimento ? fmtData(m.dataNascimento) : null}/>
                <InfoRow icon={UserCheck} label="Indicação" value={labelIndicacao(m, membros) || null}/>
                <InfoRow icon={Church} label="Igreja" value={m.igrejaNome || null}/>
                <InfoRow icon={Briefcase} label="Cargo na igreja" value={m.cargoIgreja || null}/>
                <InfoRow icon={MapPin} label="Endereço" value={formatarEnderecoMembro(m) || null}/>
                <InfoRow icon={MapPin} label="Cidade de atuação" value={m.cidadeAtuacao || null}/>
                <InfoRow icon={MapPin} label="Bairros de atuação" value={bairros.length ? bairros.join(', ') : null}/>
                {canViewFinance && <InfoRow icon={DollarSign} label="Remuneração" value={m.salario ? fmtSalario(m.salario) : null}/>}
                <InfoRow icon={FileText} label="Contrato" value={m.contrato || null}/>
                <InfoRow icon={CalendarDays} label="Data de início" value={m.dataInicio ? new Date(m.dataInicio + 'T12:00').toLocaleDateString('pt-BR') : null}/>
                {canViewFinance && <InfoRow icon={CreditCard} label="Banco" value={m.banco || null}/>}
                {canViewFinance && <InfoRow icon={CreditCard} label="Agência" value={m.agencia || null}/>}
                {canViewFinance && <InfoRow icon={CreditCard} label="Conta" value={m.conta || null}/>}
                {canViewFinance && <InfoRow icon={CreditCard} label="PIX" value={m.pix || null}/>}
                {comb.ativo && (
                  <div className="rounded-xl p-3 mt-2"
                    style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.25)' }}>
                    <p className="font-bold flex items-center gap-1.5 mb-2" style={{ fontSize: 11, color: '#22d3ee' }}>
                      <Fuel size={12}/> Veículo / Combustível
                    </p>
                    {comb.veiculo && <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>🚗 {comb.veiculo}</p>}
                    {comb.litrosMes && <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>⛽ {comb.litrosMes} L cedidos</p>}
                  </div>
                )}
                {m.observacoes && (
                  <div className="rounded-xl p-3 mt-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <p className="font-bold mb-1" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Observações</p>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{m.observacoes}</p>
                  </div>
                )}
                {!m.telefone && !cpfMembro(m) && !m.email && !m.dataNascimento && !formatarEnderecoMembro(m) && !labelIndicacao(m, membros) && !bairros.length && !m.salario && !m.contrato && !m.dataInicio && !m.banco && !m.agencia && !m.conta && !m.pix && !m.observacoes && !comb.ativo && (
                  <p className="text-center py-6" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    Cadastre mais dados em Editar para enriquecer o perfil
                  </p>
                )}
              </div>

              <div className="flex-shrink-0 px-5 py-4 flex gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                {waUrl && (
                  <a href={waUrl} target="_blank" rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white"
                    style={{ background: '#25D366', fontSize: 13 }}>
                    <MessageCircle size={16}/> WhatsApp
                  </a>
                )}
                <button type="button"
                  onClick={() => { setMembroDetalhe(null); abrirEditar(m) }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold"
                  style={{ background: 'rgba(37,99,235,0.2)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.3)', fontSize: 13 }}>
                  <Pencil size={14}/> Editar
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Modal: Ajustar posição da foto ─────────────────── */}
      {modalAjuste && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'var(--scrim)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-sm rounded-3xl overflow-hidden"
            style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>

            <div className="flex items-center justify-between px-5 py-4"
              style={{ background: 'linear-gradient(135deg,#1e3a8a,#1e40af)' }}>
              <div className="flex items-center gap-2.5">
                <SlidersHorizontal size={16} className="text-white" />
                <h3 className="font-bold text-white" style={{ fontSize: 14 }}>Ajustar posição da foto</h3>
              </div>
              <button onClick={() => setModalAjuste(false)} className="p-1.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                <X size={15} />
              </button>
            </div>

            <div className="px-5 py-5 space-y-5">
              {/* Preview */}
              <div className="flex justify-center">
                <div className="rounded-2xl overflow-hidden" style={{ width: 120, height: 120, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
                  <img src={fotoRaw} alt="preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${ajusteX}% ${ajusteY}%` }} />
                </div>
              </div>

              {/* Slider X */}
              <div>
                <label className="flex items-center justify-between font-semibold mb-2"
                  style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  <span>Posição horizontal</span>
                  <span style={{ color: 'var(--accent-bright)' }}>{ajusteX}%</span>
                </label>
                <input type="range" min="0" max="100" value={ajusteX}
                  onChange={e => setAjusteX(Number(e.target.value))}
                  className="w-full" style={{ accentColor: 'var(--accent-bright)' }} />
                <div className="flex justify-between mt-1" style={{ fontSize: 10, color: 'rgba(203,213,235,0.35)' }}>
                  <span>Esquerda</span><span>Direita</span>
                </div>
              </div>

              {/* Slider Y */}
              <div>
                <label className="flex items-center justify-between font-semibold mb-2"
                  style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  <span>Posição vertical</span>
                  <span style={{ color: 'var(--accent-bright)' }}>{ajusteY}%</span>
                </label>
                <input type="range" min="0" max="100" value={ajusteY}
                  onChange={e => setAjusteY(Number(e.target.value))}
                  className="w-full" style={{ accentColor: 'var(--accent-bright)' }} />
                <div className="flex justify-between mt-1" style={{ fontSize: 10, color: 'rgba(203,213,235,0.35)' }}>
                  <span>Topo</span><span>Base</span>
                </div>
              </div>

              {/* Ações */}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setModalAjuste(false)}
                  className="px-4 py-2.5 rounded-2xl font-semibold text-sm"
                  style={{ border: '1px solid var(--border-soft)', color: 'var(--text-secondary)' }}>
                  Cancelar
                </button>
                <button onClick={confirmarAjuste}
                  className="flex-1 py-2.5 rounded-2xl font-bold text-white text-sm"
                  style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)', boxShadow: '0 4px 14px rgba(29,78,216,0.35)' }}>
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {relatorioContratosAberto && (
        <EquipeRelatorioContratos
          membros={membros}
          onFechar={() => setRelatorioContratosAberto(false)}
        />
      )}

      {relatorioIndicacoesAberto && (
        <EquipeRelatorioIndicacoes
          membros={membros}
          onFechar={() => setRelatorioIndicacoesAberto(false)}
        />
      )}

      {relatorioIgrejasAberto && (
        <EquipeRelatorioIgrejas
          membros={membros}
          onFechar={() => setRelatorioIgrejasAberto(false)}
        />
      )}
      {relatorioMembrosAberto && (
        <EquipeRelatorioMembros
          membros={membros}
          membrosFiltrados={membrosFiltrados}
          filtroAtual={filtro}
          buscaAtual={busca}
          onFechar={() => setRelatorioMembrosAberto(false)}
        />
      )}

      {financeiroMembro && (
        <EquipeFinanceiro
          membro={financeiroMembro}
          onFechar={() => setFinanceiroMembro(null)}
          onAtualizar={() => setFinTick(t => t + 1)}
        />
      )}
    </div>
  )
}
