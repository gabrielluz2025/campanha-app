import { useMemo, useState, useEffect } from 'react'
import {
  Search, FileText, Printer, Settings2, Pencil, AlertTriangle,
  Check, X, ChevronRight, ArrowLeft, Plus, Trash2, Eye, CheckSquare, Square,
  ShieldCheck, Copy, Upload, MessageCircle, ExternalLink, Download, PenLine, RotateCcw,
} from 'lucide-react'
import { flushAfterSave } from '../utils/persist'
import {
  loadContratosConfig, saveContratosConfig, CONTRATOS_CONFIG_DEFAULT,
  CONTRATO_DATA_INICIO_FIXA, CONTRATO_DATA_FIM_FIXA,
  membroElegivelContrato,
} from '../utils/equipeContratoDoc'
import {
  CONTRATO_TEMPLATES, CONTRATO_CATEGORIAS,
  listarTemplates, getTemplate, gerarCorpoContrato,
  loadRascunhos, saveRascunhos, uidRascunho, imprimirTextoContrato,
  gerarPdfBlobContrato, baixarBlobArquivo,
  podeGerarContrato, pendenciasContratoCampanha,
} from '../utils/equipeContratoTemplates'
import { fmtMoeda, parseValor } from '../utils/equipeFinanceiro'
import { normalizarCargo, CARGO_ORDEM } from '../utils/equipeSync'
import { confirmAction } from '../utils/confirm'
import {
  garantirAutenticidade, urlVerificacao, urlAssinatura, urlPdfContrato,
  statusAssinatura, rotuloStatusAssinatura, hashBytes,
  carregarRegistroContrato, mesclarAssinaturaRemota, mensagemEnvioContrato,
  GOVBR_ASSINADOR, ehAssinaturaGovbr,
} from '../utils/contratoAutenticidade'
import { qrSvgMarkup } from '../utils/qrSvg'
import { linkWhatsApp } from '../utils/rotaUtils'

const CFG_FIELDS = [
  { key: 'ano', label: 'Ano' },
  { key: 'candidatoNome', label: 'Nome / razão do candidato' },
  { key: 'candidatoCnpj', label: 'CNPJ da campanha' },
  { key: 'candidatoEndereco', label: 'Endereço do candidato' },
  { key: 'horasPadrao', label: 'Horário / jornada padrão' },
  { key: 'foro', label: 'Foro (comarca)' },
  { key: 'cidadeAssinatura', label: 'Cidade na assinatura' },
]

function Campo({ label, children }) {
  return (
    <div>
      <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function ehLinhaTituloContrato(ln) {
  const t = String(ln || '').trim()
  if (!t || t.length > 160) return false
  if (!/CONTRATO|TERMO|RECIBO|AUTORIZAÇ|AUTORIZAC/i.test(t)) return false
  return t === t.toUpperCase() || /^CONTRATO\b/i.test(t)
}

function PreviaContrato({ corpo, auth = null }) {
  const linhas = String(corpo || '').split('\n')
  let idxAss = -1
  for (let i = linhas.length - 1; i >= 0; i--) {
    if ((linhas[i].match(/_/g) || []).length >= 40 && /\s{3,}/.test(linhas[i])) {
      idxAss = i
      break
    }
  }

  let linhasCorpo = linhas
  let cols = [
    { e: '', d: '' },
    { e: 'CONTRATANTE', d: 'CONTRATADO(A)' },
    { e: '', d: '' },
    { e: 'CONTRATANTE', d: 'CONTRATADO(A)' },
  ]
  if (idxAss >= 0 && idxAss + 3 < linhas.length) {
    linhasCorpo = linhas.slice(0, idxAss)
    const bloco = linhas.slice(idxAss, idxAss + 4)
    cols = bloco.map(ln => {
      const parts = ln.split(/\s{3,}/)
      return { e: (parts[0] || '').trim(), d: (parts[1] || '').trim() }
    })
  }

  const titulos = []
  let i = 0
  while (i < linhasCorpo.length) {
    const t = linhasCorpo[i].trim()
    if (!t) {
      if (titulos.length) { i += 1; break }
      i += 1
      continue
    }
    if (ehLinhaTituloContrato(t)) {
      titulos.push(t)
      i += 1
      continue
    }
    break
  }
  const corpoTxt = linhasCorpo.slice(i).join('\n').trim()
  const codigo = auth?.codigo || ''

  return (
    <div
      className="mx-auto shadow-xl"
      style={{
        width: '100%',
        maxWidth: 820,
        minHeight: 1100,
        background: '#fff',
        color: '#111',
        padding: '48px 52px',
        fontFamily: '"Times New Roman", Times, Georgia, serif',
        fontSize: 15,
        lineHeight: 1.55,
        boxSizing: 'border-box',
      }}
    >
      {titulos.length > 0 && (
        <div style={{
          textAlign: 'center',
          fontWeight: 700,
          fontSize: 15,
          textTransform: 'uppercase',
          marginBottom: 18,
          lineHeight: 1.45,
        }}>
          {titulos.map((t, idx) => (
            <div key={idx}>{t}</div>
          ))}
        </div>
      )}
      <div style={{ whiteSpace: 'pre-wrap', textAlign: 'justify' }}>
        {corpoTxt || (titulos.length ? '' : '—')}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 28,
        marginTop: 36,
        textAlign: 'center',
      }}>
        {[0, 1].map(side => (
          <div key={side}>
            <p style={{
              fontFamily: 'Arial, sans-serif',
              fontSize: 9,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#444',
              marginBottom: 6,
            }}>
              {side === 0 ? 'Assine somente neste quadro — Contratante' : 'Assine somente neste quadro — Contratado'}
            </p>
            <div style={{
              minHeight: 112,
              border: '1.6px dashed #333',
              background: '#fafafa',
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {(() => {
                const src = side === 0 ? auth?.assinaturaDeputado : auth?.assinaturaContratado
                if (!src) return null
                if (ehAssinaturaGovbr(src)) {
                  return (
                    <div style={{ textAlign: 'center', color: '#1351b4', fontFamily: 'Arial, sans-serif' }}>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>Gov.br</div>
                      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Assinado digitalmente
                      </div>
                    </div>
                  )
                }
                return (
                  <img
                    src={src}
                    alt="Assinatura"
                    style={{ maxWidth: '96%', maxHeight: 104, objectFit: 'contain' }}
                  />
                )
              })()}
            </div>
            <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
              {side === 0 ? cols[1]?.e : cols[1]?.d}
            </p>
            <p style={{ fontSize: 12, marginBottom: 4 }}>
              {side === 0 ? cols[2]?.e : cols[2]?.d}
            </p>
            <p style={{ fontSize: 11, color: '#333', textTransform: 'uppercase' }}>
              {side === 0 ? cols[3]?.e : cols[3]?.d}
            </p>
          </div>
        ))}
      </div>
      {codigo ? (
        <div style={{
          marginTop: 22,
          paddingTop: 12,
          borderTop: '1px solid #bbb',
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          fontFamily: 'Arial, sans-serif',
          fontSize: 11,
          lineHeight: 1.45,
          color: '#222',
        }}>
          <div
            style={{ width: 88, height: 88, flexShrink: 0 }}
            dangerouslySetInnerHTML={{
              __html: qrSvgMarkup(urlVerificacao(codigo), 88),
            }}
          />
          <div>
            <p style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>
              Documento autenticado pela campanha
            </p>
            <p><strong>Código:</strong> {codigo}</p>
            <p style={{ marginTop: 4, color: '#444' }}>
              O selo Gov.br deve ir somente nos quadros acima.
            </p>
          </div>
        </div>
      ) : (
        <p style={{
          marginTop: 18,
          fontFamily: 'Arial, sans-serif',
          fontSize: 11,
          color: '#666',
        }}>
          Ao gerar o PDF o código de autenticidade e o QR aparecem neste rodapé.
        </p>
      )}
    </div>
  )
}

function PainelConfig({ aberto, onFechar, config, onSalvar }) {
  const [draft, setDraft] = useState(config)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    if (aberto) {
      setDraft({ ...CONTRATOS_CONFIG_DEFAULT, ...config })
      setOk(false)
    }
  }, [aberto, config])

  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(7,10,18,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={onFechar}>
      <div className="w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[94vh] flex flex-col"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg,#1e3a8a,#1e40af)' }}>
          <div>
            <h3 className="font-bold text-white" style={{ fontSize: 15 }}>Dados padrão da campanha</h3>
            <p style={{ fontSize: 11, color: 'rgba(191,219,254,0.95)' }}>
              Preenchem automaticamente todos os modelos
            </p>
          </div>
          <button type="button" onClick={onFechar} className="p-1.5 rounded-xl text-white"
            style={{ background: 'rgba(255,255,255,0.15)' }}>
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {CFG_FIELDS.map(f => (
            <Campo key={f.key} label={f.label}>
              <input className="input-dark w-full py-2.5" style={{ fontSize: 13 }}
                value={draft[f.key] || ''}
                onChange={e => setDraft(p => ({ ...p, [f.key]: e.target.value }))} />
            </Campo>
          ))}
        </div>
        <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <button type="button" onClick={onFechar}
            className="px-3 py-2 rounded-xl font-semibold"
            style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.06)' }}>
            Fechar
          </button>
          <button type="button" onClick={() => {
            onSalvar(draft)
            setOk(true)
            setTimeout(() => setOk(false), 1500)
          }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-white"
            style={{ fontSize: 12, background: ok ? '#059669' : '#2563eb' }}>
            {ok ? <Check size={14} /> : null}
            {ok ? 'Salvo' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Aba Contratos — escolher modelo da advogada, pessoa, editar texto completo e prévia/PDF.
 */
export default function EquipeContratos({ membros = [], onAtualizarMembro }) {
  const [config, setConfig] = useState(() => loadContratosConfig())
  const [cfgAberto, setCfgAberto] = useState(false)
  const [rascunhos, setRascunhos] = useState(() => loadRascunhos())
  const [etapa, setEtapa] = useState('lista') // lista | modelo | pessoa | editor
  const [categoria, setCategoria] = useState('equipe')
  const [buscaTpl, setBuscaTpl] = useState('')
  const [buscaPessoa, setBuscaPessoa] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [membroId, setMembroId] = useState('')
  const [rascunhoId, setRascunhoId] = useState('')
  const [titulo, setTitulo] = useState('')
  const [corpo, setCorpo] = useState('')
  const [objetoA, setObjetoA] = useState('')
  const [horas, setHoras] = useState('')
  const [msg, setMsg] = useState('')
  const [mostrarPrevia, setMostrarPrevia] = useState(true)
  const [selecionados, setSelecionados] = useState(() => new Set())
  const [filtroLista, setFiltroLista] = useState('todos') // todos | prontos | rascunhos
  const [buscaLista, setBuscaLista] = useState('')

  const templates = useMemo(() => {
    const q = buscaTpl.trim().toLowerCase()
    return listarTemplates(categoria).filter(t =>
      !q || t.nome.toLowerCase().includes(q) || t.id.includes(q),
    )
  }, [categoria, buscaTpl])

  const idsComContratoPronto = useMemo(() => {
    const set = new Set()
    for (const r of rascunhos) {
      if (r.status !== 'pronto' || !r.membroId) continue
      // Mesmo modelo: já gerado e só falta assinar
      if (templateId && String(r.templateId) === String(templateId)) {
        set.add(String(r.membroId))
        continue
      }
      // Sem modelo no contexto: qualquer contrato pronto conta
      if (!templateId) set.add(String(r.membroId))
    }
    return set
  }, [rascunhos, templateId])

  const pessoas = useMemo(() => {
    const q = buscaPessoa.trim().toLowerCase()
    return [...membros]
      .filter(m => membroElegivelContrato(m))
      .filter(m => !idsComContratoPronto.has(String(m.id)))
      .filter(m => {
        if (!q) return true
        return (m.nome || '').toLowerCase().includes(q)
          || (m.cpf || '').includes(q)
          || (m.cargo || '').toLowerCase().includes(q)
      })
      .sort((a, b) => {
        const ca = CARGO_ORDEM[normalizarCargo(a.cargo)] ?? 99
        const cb = CARGO_ORDEM[normalizarCargo(b.cargo)] ?? 99
        if (ca !== cb) return ca - cb
        return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
      })
  }, [membros, buscaPessoa, idsComContratoPronto])

  const gruposCargo = useMemo(() => {
    const map = new Map()
    for (const m of pessoas) {
      const cargo = normalizarCargo(m.cargo) || 'Sem cargo'
      if (!map.has(cargo)) map.set(cargo, [])
      map.get(cargo).push(m)
    }
    return [...map.entries()].sort((a, b) =>
      (CARGO_ORDEM[a[0]] ?? 99) - (CARGO_ORDEM[b[0]] ?? 99)
      || a[0].localeCompare(b[0], 'pt-BR'),
    )
  }, [pessoas])

  const rascunhosFiltrados = useMemo(() => {
    const q = buscaLista.trim().toLowerCase()
    return rascunhos.filter(r => {
      const status = r.status === 'pronto' ? 'pronto' : 'rascunho'
      if (filtroLista === 'prontos' && status !== 'pronto') return false
      if (filtroLista === 'rascunhos' && status !== 'rascunho') return false
      if (!q) return true
      const pessoa = membros.find(m => String(m.id) === String(r.membroId))
      return (r.titulo || '').toLowerCase().includes(q)
        || (pessoa?.nome || '').toLowerCase().includes(q)
        || (getTemplate(r.templateId)?.nome || '').toLowerCase().includes(q)
        || String(r.codigoAutenticidade || '').toLowerCase().includes(q)
    })
  }, [rascunhos, filtroLista, buscaLista, membros])

  const campanhaPend = useMemo(() => pendenciasContratoCampanha(config), [config])

  const tplAtual = getTemplate(templateId)
  const membroAtual = membros.find(m => String(m.id) === String(membroId)) || null
  const rascunhoAtual = rascunhos.find(r => String(r.id) === String(rascunhoId)) || null

  function flash(t) {
    setMsg(t)
    setTimeout(() => setMsg(''), 3500)
  }

  function persistRascunhos(lista) {
    setRascunhos(lista)
    saveRascunhos(lista)
    flushAfterSave()
  }

  async function puxarAssinaturasRemotas() {
    const atuais = loadRascunhos()
    let mudou = false
    const lista = []
    for (const r of atuais) {
      if (!r.codigoAutenticidade) {
        lista.push(r)
        continue
      }
      const rem = await carregarRegistroContrato(r.codigoAutenticidade)
      const next = mesclarAssinaturaRemota(r, rem)
      if (next !== r) mudou = true
      lista.push(next)
    }
    if (mudou) persistRascunhos(lista)
  }

  useEffect(() => {
    puxarAssinaturasRemotas()
    const t = setInterval(puxarAssinaturasRemotas, 8000)
    const onFocus = () => puxarAssinaturasRemotas()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', onFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function aplicarAuthNaLista(id, patchOrFn) {
    const lista = await Promise.all(rascunhos.map(async r => {
      if (String(r.id) !== String(id)) return r
      const base = typeof patchOrFn === 'function' ? patchOrFn(r) : { ...r, ...patchOrFn }
      const membro = membros.find(m => String(m.id) === String(base.membroId)) || null
      return garantirAutenticidade(base, { membro, config })
    }))
    persistRascunhos(lista)
    return lista.find(r => String(r.id) === String(id))
  }

  async function imprimirRascunho(r) {
    const doc = await prepararPdfDoc(r)
    if (!doc) return
    const res = imprimirTextoContrato(doc.titulo, doc.corpo, authDoDoc(doc))
    if (!res.ok) flash('Permita pop-ups para imprimir')
    return doc
  }

  async function baixarPdfRascunho(r) {
    const doc = await prepararPdfDoc(r)
    if (!doc) return
    flash('Gerando PDF…')
    const pdf = await gerarPdfBlobContrato(doc.titulo, doc.corpo, authDoDoc(doc))
    if (!pdf.ok) {
      flash('Não foi possível baixar o PDF. Tente Imprimir e salvar como PDF.')
      return
    }
    baixarBlobArquivo(pdf.blob, pdf.filename)
    flash('PDF baixado')
  }

  async function prepararPdfDoc(r) {
    if (r?.id && rascunhos.some(x => String(x.id) === String(r.id))) {
      const membro = membros.find(m => String(m.id) === String(r.membroId)) || null
      const doc = await garantirAutenticidade({ ...r }, { membro, config })
      persistRascunhos(rascunhos.map(x => String(x.id) === String(doc.id) ? doc : x))
      return doc
    }
    return prepararDocPublico(r)
  }

  function authDoDoc(doc) {
    return {
      codigo: doc?.codigoAutenticidade,
      hash: doc?.hashCorpo,
      assinaturaContratado: doc?.assinaturaContratado,
      assinaturaDeputado: doc?.assinaturaDeputado,
    }
  }

  function salvarConfig(draft) {
    const salvo = saveContratosConfig(draft)
    setConfig(salvo)
    flushAfterSave()
    flash('Dados da campanha salvos')
    return salvo
  }

  function iniciarNovo() {
    setTemplateId('')
    setMembroId('')
    setRascunhoId('')
    setTitulo('')
    setCorpo('')
    setObjetoA('')
    setHoras(config.horasPadrao || '8 horas diárias')
    setSelecionados(new Set())
    setEtapa('modelo')
  }

  function escolherModelo(id) {
    setTemplateId(id)
    setSelecionados(new Set())
    const t = getTemplate(id)
    if (t && !t.precisaPessoa) {
      if (campanhaPend.length) {
        flash(`Preencha na campanha: ${campanhaPend.join(', ')}`)
        setCfgAberto(true)
        return
      }
      gerarUm(id, null)
    } else {
      setEtapa('pessoa')
    }
  }

  function extrasDe(membro) {
    return {
      objetoA: objetoA || (membro?.cargo || ''),
      atividades: objetoA || membro?.cargo || '',
      dataInicio: CONTRATO_DATA_INICIO_FIXA,
      dataFim: CONTRATO_DATA_FIM_FIXA,
      horas: horas || membro?.horasContratado || config.horasPadrao || '8 horas diárias',
    }
  }

  function gerarUm(tid, membro, { abrirEditor = true, status = 'rascunho' } = {}) {
    const t = getTemplate(tid)
    if (!t) return null
    if (t.precisaPessoa && !membro) {
      flash('Selecione uma pessoa')
      return null
    }
    if (membro && !membroElegivelContrato(membro)) {
      flash(`${membro.nome || 'Esta pessoa'} não tem remuneração — só quem recebe aparece para contrato`)
      return null
    }
    if (campanhaPend.length) {
      flash(`Não é possível gerar: falta ${campanhaPend.join(', ')}`)
      setCfgAberto(true)
      return null
    }
    if (membro) {
      const check = podeGerarContrato(membro, config)
      if (!check.ok) {
        flash(`${membro.nome}: dados pendentes — ${check.membro.join(', ')}`)
        return null
      }
    }
    const texto = gerarCorpoContrato(tid, membro, config, extrasDe(membro))
    const nomeTpl = t.nome
    const nomePessoa = membro?.nome ? ` — ${membro.nome}` : ''
    const tituloNovo = `${nomeTpl}${nomePessoa}`
    if (abrirEditor) {
      setMembroId(membro?.id || '')
      setTitulo(tituloNovo)
      setCorpo(texto)
      setRascunhoId('')
      setEtapa('editor')
    }
    return {
      id: uidRascunho(),
      titulo: tituloNovo,
      corpo: texto,
      templateId: tid,
      membroId: membro?.id || '',
      status,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    }
  }

  function gerar(tid = templateId, mid = membroId) {
    const membro = mid ? membros.find(m => String(m.id) === String(mid)) : null
    gerarUm(tid, membro, { abrirEditor: true })
  }

  function toggleSel(id) {
    setSelecionados(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function toggleCargo(lista) {
    const ids = lista.map(m => String(m.id))
    const todos = ids.every(id => selecionados.has(id))
    setSelecionados(prev => {
      const n = new Set(prev)
      ids.forEach(id => (todos ? n.delete(id) : n.add(id)))
      return n
    })
  }

  function gerarLote() {
    if (campanhaPend.length) {
      flash(`Não é possível gerar: falta ${campanhaPend.join(', ')}`)
      setCfgAberto(true)
      return
    }
    if (selecionados.size === 0) {
      flash('Selecione ao menos uma pessoa')
      return
    }
    const gerados = []
    const bloqueados = []
    for (const id of selecionados) {
      const m = membros.find(x => String(x.id) === String(id))
      if (!m) continue
      if (!membroElegivelContrato(m)) {
        bloqueados.push(`${m.nome} (sem remuneração)`)
        continue
      }
      const check = podeGerarContrato(m, config)
      if (!check.ok) {
        bloqueados.push(`${m.nome} (${check.membro.join(', ')})`)
        continue
      }
      const doc = gerarUm(templateId, m, { abrirEditor: false, status: 'pronto' })
      if (doc) gerados.push(doc)
    }
    if (gerados.length) {
      persistRascunhos([...gerados, ...rascunhos])
      setSelecionados(new Set())
      setFiltroLista('prontos')
      setEtapa('lista')
    }
    if (bloqueados.length && gerados.length) {
      flash(`${gerados.length} contrato(s) salvo(s). Bloqueados: ${bloqueados.length}`)
    } else if (gerados.length) {
      flash(`${gerados.length} contrato(s) gerado(s) e salvos como prontos`)
    } else {
      flash(`Nenhum gerado. Pendências: ${bloqueados.slice(0, 3).join(' · ')}${bloqueados.length > 3 ? '…' : ''}`)
    }
  }

  function abrirContrato(r) {
    setRascunhoId(r.id)
    setTemplateId(r.templateId || '')
    setMembroId(r.membroId || '')
    setTitulo(r.titulo || '')
    setCorpo(r.corpo || '')
    setEtapa('editor')
  }

  async function salvarContrato(status = 'rascunho') {
    const agora = new Date().toISOString()
    const membro = membroAtual
    let base
    if (rascunhoId) {
      const atual = rascunhos.find(r => String(r.id) === String(rascunhoId)) || {}
      base = {
        ...atual,
        titulo: titulo.trim() || atual.titulo,
        corpo,
        templateId,
        membroId,
        status,
        atualizadoEm: agora,
      }
    } else {
      base = {
        id: uidRascunho(),
        titulo: titulo.trim() || (tplAtual?.nome || 'Contrato'),
        corpo,
        templateId,
        membroId,
        status,
        criadoEm: agora,
        atualizadoEm: agora,
      }
    }
    const doc = await garantirAutenticidade(base, { membro, config })
    const lista = rascunhoId
      ? rascunhos.map(r => String(r.id) === String(rascunhoId) ? doc : r)
      : [doc, ...rascunhos]
    persistRascunhos(lista)
    setRascunhoId(doc.id)
    flash(status === 'pronto' ? 'Contrato salvo como pronto' : 'Rascunho salvo')
    return doc
  }

  async function excluirRascunho(id) {
    const ok = await confirmAction({
      title: 'Excluir contrato',
      message: 'Remover este contrato salvo?',
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    persistRascunhos(rascunhos.filter(r => String(r.id) !== String(id)))
    if (String(rascunhoId) === String(id)) {
      setEtapa('lista')
      setRascunhoId('')
    }
  }

  async function imprimir() {
    const statusKeep = rascunhoAtual?.status === 'pronto' ? 'pronto' : 'rascunho'
    const doc = await salvarContrato(statusKeep)
    if (!doc) return
    const res = imprimirTextoContrato(doc.titulo, doc.corpo, authDoDoc(doc))
    if (!res.ok) flash('Permita pop-ups para imprimir')
  }

  async function baixarPdf() {
    const statusKeep = rascunhoAtual?.status === 'pronto' ? 'pronto' : 'rascunho'
    const doc = await salvarContrato(statusKeep)
    if (!doc) return
    flash('Gerando PDF…')
    const pdf = await gerarPdfBlobContrato(doc.titulo, doc.corpo, authDoDoc(doc))
    if (!pdf.ok) {
      flash('Não foi possível baixar o PDF. Tente Imprimir e salvar como PDF.')
      return
    }
    baixarBlobArquivo(pdf.blob, pdf.filename)
    flash('PDF baixado')
  }

  async function prepararDocPublico(r) {
    if (r?.id && rascunhos.some(x => String(x.id) === String(r.id))) {
      return aplicarAuthNaLista(r.id, {
        titulo: r.titulo || titulo,
        corpo: r.corpo || corpo,
        templateId: r.templateId || templateId,
        membroId: r.membroId || membroId,
      })
    }
    return salvarContrato('rascunho')
  }

  async function copiarLinkConferencia(r) {
    const doc = await prepararDocPublico(r)
    if (!doc?.codigoAutenticidade) return
    if (doc.publicadoOk === false) {
      flash('Não foi possível publicar no servidor. Confira a internet e tente de novo.')
      return
    }
    const url = urlVerificacao(doc.codigoAutenticidade)
    try {
      await navigator.clipboard.writeText(url)
      flash('Link de conferência copiado')
    } catch {
      window.prompt('Copie o link:', url)
    }
  }

  async function copiarLinkAssinatura(r) {
    const doc = await prepararDocPublico(r)
    if (!doc?.codigoAutenticidade) return
    if (doc.publicadoOk === false) {
      flash('Não foi possível publicar no servidor. Confira a internet e tente de novo.')
      return
    }
    const url = urlAssinatura(doc.codigoAutenticidade)
    const texto = `Assine seu contrato neste link:\n${url}`
    try {
      await navigator.clipboard.writeText(texto)
      flash('Link para a pessoa assinar copiado — mande no WhatsApp')
    } catch {
      window.prompt('Copie o link:', url)
    }
  }

  async function enviarWhatsAppContrato(r) {
    const modo = await confirmAction({
      title: 'Como a pessoa vai assinar?',
      message: 'Escolha o que vai no WhatsApp. Gov.br é o jeito oficial. Mão livre só se ela não conseguir o Gov.br.',
      danger: false,
      choices: [
        { id: 'govbr', label: 'Enviar para Gov.br', color: '#1351b4' },
        { id: 'mao', label: 'Enviar para assinar à mão', color: '#0d9488' },
      ],
    })
    if (!modo) return
    let doc = await prepararDocPublico(r)
    if (!doc?.codigoAutenticidade) return
    if (modo === 'mao' && !doc.permitirAssinaturaMaoLivre && doc.id) {
      doc = await aplicarAuthNaLista(doc.id, {
        permitirAssinaturaMaoLivre: true,
        atualizadoEm: new Date().toISOString(),
      }) || doc
    }
    if (doc.publicadoOk === false) {
      flash('Não foi possível publicar o contrato no servidor. Confira a internet e tente de novo.')
      return
    }
    const membro = membros.find(m => String(m.id) === String(doc.membroId || r?.membroId || membroId))
      || membroAtual
    const url = urlAssinatura(doc.codigoAutenticidade)
    const texto = mensagemEnvioContrato({
      nome: membro?.nome || doc.contratadoNome || '',
      titulo: doc.titulo || r?.titulo || titulo,
      urlAssinar: url,
      codigo: doc.codigoAutenticidade,
      modo,
    })
    flash(modo === 'govbr' ? 'Gerando PDF para o Gov.br…' : 'Abrindo WhatsApp…')
    let pdf = { ok: false }
    if (modo === 'govbr') {
      pdf = await gerarPdfBlobContrato(doc.titulo, doc.corpo, authDoDoc(doc))
      if (pdf.ok) {
        const file = new File([pdf.blob], pdf.filename, { type: 'application/pdf' })
        try {
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: doc.titulo || 'Contrato',
              text: texto,
            })
            flash('Envie pelo WhatsApp: o PDF e o passo a passo do Gov.br vão juntos')
            return
          }
        } catch (e) {
          if (e?.name === 'AbortError') return
        }
        baixarBlobArquivo(pdf.blob, pdf.filename)
      }
    }
    const wa = linkWhatsApp(membro?.telefone, texto)
    if (!wa) {
      try { await navigator.clipboard.writeText(texto) } catch { window.prompt('Copie a mensagem:', texto) }
      flash(pdf.ok
        ? 'PDF baixado e mensagem copiada. Abra o WhatsApp, anexe o PDF e cole o texto.'
        : 'Essa pessoa não tem telefone no cadastro. Mensagem copiada — cole no WhatsApp.')
      return
    }
    window.open(wa, '_blank', 'noopener,noreferrer')
    flash(modo === 'mao'
      ? `WhatsApp aberto: ela assina à mão no link.`
      : (pdf.ok
        ? `PDF baixado. Anexe o arquivo na conversa com o passo a passo do Gov.br.`
        : `WhatsApp aberto para ${membro?.nome || 'a pessoa'}`))
  }

  async function marcarAssinatura(r, quem) {
    const campo = quem === 'deputado' ? 'assinadoDeputadoEm' : 'assinadoContratadoEm'
    const campoMetodo = quem === 'deputado' ? 'metodoAssinaturaDeputado' : 'metodoAssinaturaContratado'
    const campoImg = quem === 'deputado' ? 'assinaturaDeputado' : 'assinaturaContratado'
    const ja = r[campo]
    const ok = await confirmAction({
      title: ja ? 'Remover marcação?' : 'Registrar assinatura',
      message: ja
        ? 'Tirar a marcação desta assinatura?'
        : (quem === 'deputado'
          ? 'Confirma que o deputado / campanha já assinou este PDF no Gov.br ou na tela?'
          : 'Confirma que o contratado já assinou este PDF no Gov.br ou na tela?'),
    })
    if (!ok) return
    const viaGov = !ja && (r.pdfAssinadoNome || ehAssinaturaGovbr(r[campoImg]))
    const patch = {
      [campo]: ja ? '' : new Date().toISOString(),
      [campoMetodo]: ja ? '' : (viaGov ? 'govbr' : 'manual'),
      atualizadoEm: new Date().toISOString(),
    }
    if (!ja && viaGov && !r[campoImg]) patch[campoImg] = 'govbr'
    if (ja) {
      patch[campoImg] = ''
      patch[quem === 'deputado' ? 'resetarAssinaturaDeputado' : 'resetarAssinaturaContratado'] = true
    }
    const doc = await aplicarAuthNaLista(r.id, patch)
    if (doc?.publicadoOk === false) {
      flash('Não foi possível atualizar no servidor. Tente de novo.')
      return
    }
    flash(ja ? 'Marcação removida' : 'Assinatura registrada')
  }

  async function resetarAssinatura(r, quem) {
    const alvo = r || rascunhoAtual
    if (!alvo?.id) return
    const rotulo = quem === 'deputado' ? 'do deputado / campanha' : 'do contratado'
    const ok = await confirmAction({
      title: 'Resetar assinatura?',
      message: `Isso apaga a assinatura ${rotulo} neste contrato. A pessoa pode assinar de novo no mesmo link.`,
      confirmLabel: 'Resetar',
    })
    if (!ok) return
    const agora = new Date().toISOString()
    const patch = quem === 'deputado'
      ? {
          assinadoDeputadoEm: '',
          assinaturaDeputado: '',
          metodoAssinaturaDeputado: '',
          resetarAssinaturaDeputado: true,
          atualizadoEm: agora,
        }
      : {
          assinadoContratadoEm: '',
          assinaturaContratado: '',
          metodoAssinaturaContratado: '',
          resetarAssinaturaContratado: true,
          atualizadoEm: agora,
        }
    const doc = await aplicarAuthNaLista(alvo.id, patch)
    if (doc?.publicadoOk === false) {
      flash('Não foi possível resetar no servidor. Tente de novo.')
      return
    }
    flash('Assinatura resetada. Pode assinar de novo no mesmo link.')
  }

  async function autorizarMaoLivre(r) {
    const alvo = r || rascunhoAtual
    if (!alvo?.id) {
      const doc = await prepararDocPublico(alvo)
      if (!doc?.id) return
      return autorizarMaoLivre(doc)
    }
    const ja = Boolean(alvo.permitirAssinaturaMaoLivre)
    const ok = await confirmAction({
      title: ja ? 'Bloquear assinatura à mão?' : 'Autorizar assinatura à mão livre?',
      message: ja
        ? 'A pessoa deixa de poder desenhar a assinatura no link. O Gov.br continua valendo.'
        : 'Use só se a pessoa não conseguir o Gov.br (conta, nível Prata/Ouro ou celular). No link dela aparece o quadro para assinar à mão, com CPF.',
      confirmLabel: ja ? 'Bloquear' : 'Autorizar',
    })
    if (!ok) return
    const doc = await aplicarAuthNaLista(alvo.id, {
      permitirAssinaturaMaoLivre: !ja,
      atualizadoEm: new Date().toISOString(),
    })
    if (doc?.publicadoOk === false) {
      flash('Não foi possível publicar a autorização. Tente de novo.')
      return
    }
    flash(!ja ? 'Mão livre liberada no link da pessoa' : 'Assinatura à mão bloqueada')
  }

  async function abrirGovBr(r, quem = 'deputado') {
    const doc = await prepararDocPublico(r)
    if (!doc?.codigoAutenticidade) return
    if (doc.publicadoOk === false) {
      flash('Não foi possível publicar no servidor. Confira a internet e tente de novo.')
      return
    }
    const pdfUrl = urlPdfContrato(doc.codigoAutenticidade)
    window.open(pdfUrl, '_blank', 'noopener,noreferrer')
    setTimeout(() => {
      window.open(GOVBR_ASSINADOR, '_blank', 'noopener,noreferrer')
    }, 400)
    flash(quem === 'deputado'
      ? 'PDF aberto: salve o arquivo, assine no Gov.br e depois anexe o PDF assinado aqui.'
      : 'PDF e portal Gov.br abertos para a pessoa assinar.')
  }

  async function anexarPdfAssinado(r, file) {
    if (!file) return
    const buf = await file.arrayBuffer()
    const hash = await hashBytes(new Uint8Array(buf))
    await aplicarAuthNaLista(r.id, {
      pdfAssinadoNome: file.name,
      pdfAssinadoHash: hash,
      pdfAssinadoEm: new Date().toISOString(),
    })
    flash(`PDF anexado na conferência: ${file.name}`)
  }

  function regenerar() {
    if (!templateId) {
      flash('Este contrato não tem modelo vinculado')
      return
    }
    gerar(templateId, membroId)
    flash('Texto regenerado a partir do modelo')
  }

  function tentarAbrirPessoa(m) {
    const check = podeGerarContrato(m, config)
    if (campanhaPend.length) {
      flash(`Preencha na campanha: ${campanhaPend.join(', ')}`)
      setCfgAberto(true)
      return
    }
    if (!check.ok) {
      flash(`Não é possível gerar — falta: ${check.membro.join(', ')}`)
      return
    }
    if (!horas && m.horasContratado) setHoras(m.horasContratado)
    gerarUm(templateId, m, { abrirEditor: true })
  }

  // ── LISTA ──
  if (etapa === 'lista') {
    const nProntos = rascunhos.filter(r => r.status === 'pronto').length
    const nRasc = rascunhos.filter(r => r.status !== 'pronto').length
    return (
      <div className="space-y-4">
        <div className="rounded-3xl p-4 space-y-3"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={iniciarNovo}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-white"
              style={{ fontSize: 12, background: '#0d9488' }}>
              <Plus size={14} /> Novo contrato
            </button>
            <button type="button" onClick={() => setCfgAberto(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold"
              style={{ fontSize: 12, background: 'rgba(37,99,235,0.18)', color: '#93c5fd' }}>
              <Settings2 size={14} /> Dados da campanha
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Contratos salvos no sistema · {nProntos} pronto(s) · {nRasc} rascunho(s) · imprimir, baixar PDF ou enviar com o link
          </p>
          {campanhaPend.length > 0 && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-xl"
              style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: '#fbbf24' }} />
              <span style={{ fontSize: 12, color: '#fcd34d' }}>
                Geração bloqueada até preencher: {campanhaPend.join(', ')}.
              </span>
            </div>
          )}
          {msg && <p className="font-semibold" style={{ fontSize: 12, color: '#34d399' }}>{msg}</p>}
        </div>

        {rascunhos.length === 0 ? (
          <div className="rounded-3xl p-10 text-center"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <FileText size={28} className="mx-auto mb-3" style={{ color: 'var(--text-faint)' }} />
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              Nenhum contrato salvo ainda. Clique em Novo contrato.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              {[
                { id: 'todos', label: `Todos (${rascunhos.length})` },
                { id: 'prontos', label: `Prontos (${nProntos})` },
                { id: 'rascunhos', label: `Rascunhos (${nRasc})` },
              ].map(f => (
                <button key={f.id} type="button" onClick={() => setFiltroLista(f.id)}
                  className="px-3 py-1.5 rounded-xl font-semibold"
                  style={{
                    fontSize: 11,
                    background: filtroLista === f.id ? 'rgba(13,148,136,0.22)' : 'rgba(255,255,255,0.05)',
                    color: filtroLista === f.id ? '#5eead4' : 'var(--text-tertiary)',
                    border: `1px solid ${filtroLista === f.id ? 'rgba(13,148,136,0.4)' : 'transparent'}`,
                  }}>
                  {f.label}
                </button>
              ))}
              <div className="relative flex-1 min-w-[160px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--text-tertiary)' }} />
                <input value={buscaLista} onChange={e => setBuscaLista(e.target.value)}
                  placeholder="Buscar contrato ou pessoa..."
                  className="input-dark w-full pl-9 pr-3 py-2" style={{ fontSize: 12 }} />
              </div>
            </div>

            {rascunhosFiltrados.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '12px 4px' }}>
                Nenhum contrato neste filtro.
              </p>
            ) : (
              <div className="space-y-2">
                {rascunhosFiltrados.map(r => {
                  const tpl = getTemplate(r.templateId)
                  const pessoa = membros.find(m => String(m.id) === String(r.membroId))
                  const pronto = r.status === 'pronto'
                  const stAss = statusAssinatura(r)
                  return (
                    <div key={r.id} className="rounded-3xl px-4 py-3 flex items-center gap-2 flex-wrap"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                      <button type="button" onClick={() => abrirContrato(r)}
                        className="flex-1 min-w-[180px] text-left">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold truncate" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                            {r.titulo || 'Contrato'}
                          </p>
                          <span className="px-2 py-0.5 rounded-lg font-bold shrink-0"
                            style={{
                              fontSize: 10,
                              background: pronto ? 'rgba(16,185,129,0.18)' : 'rgba(148,163,184,0.15)',
                              color: pronto ? '#34d399' : '#94a3b8',
                            }}>
                            {pronto ? 'Pronto' : 'Rascunho'}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg font-bold shrink-0"
                            style={{
                              fontSize: 10,
                              background: stAss === 'completo' ? 'rgba(16,185,129,0.18)' : 'rgba(56,189,248,0.14)',
                              color: stAss === 'completo' ? '#34d399' : '#7dd3fc',
                            }}>
                            {rotuloStatusAssinatura(stAss)}
                          </span>
                          {r.permitirAssinaturaMaoLivre ? (
                            <span className="px-2 py-0.5 rounded-lg font-bold shrink-0"
                              style={{ fontSize: 10, background: 'rgba(245,158,11,0.18)', color: '#fbbf24' }}>
                              Mão livre
                            </span>
                          ) : null}
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                          {tpl?.nome || 'Modelo livre'}
                          {pessoa ? ` · ${pessoa.nome}` : ''}
                          {pessoa?.cargo ? ` · ${normalizarCargo(pessoa.cargo)}` : ''}
                          {r.codigoAutenticidade ? ` · ${r.codigoAutenticidade}` : ''}
                        </p>
                      </button>
                      <button type="button" onClick={() => abrirContrato(r)}
                        className="flex items-center gap-1 px-2.5 py-2 rounded-xl font-bold"
                        style={{ fontSize: 11, background: 'rgba(37,99,235,0.16)', color: '#93c5fd' }}>
                        <Pencil size={12} /> Editar
                      </button>
                      <button type="button" onClick={() => imprimirRascunho(r)}
                        className="flex items-center gap-1 px-2.5 py-2 rounded-xl font-bold"
                        style={{ fontSize: 11, background: 'rgba(148,163,184,0.16)', color: '#cbd5e1' }}
                        title="Imprimir">
                        <Printer size={12} /> Imprimir
                      </button>
                      <button type="button" onClick={() => baixarPdfRascunho(r)}
                        className="flex items-center gap-1 px-2.5 py-2 rounded-xl font-bold"
                        style={{ fontSize: 11, background: 'rgba(13,148,136,0.18)', color: '#5eead4' }}
                        title="Baixar PDF">
                        <Download size={12} /> PDF
                      </button>
                      <button type="button" onClick={() => enviarWhatsAppContrato(r)}
                        className="flex items-center gap-1 px-2.5 py-2 rounded-xl font-bold text-white"
                        style={{ fontSize: 11, background: '#16a34a' }}
                        title="Escolher Gov.br ou mão livre e enviar no WhatsApp">
                        <MessageCircle size={12} /> WhatsApp
                      </button>
                      <button type="button" onClick={() => excluirRascunho(r.id)}
                        className="p-2 rounded-xl"
                        style={{ color: '#f87171', background: 'rgba(248,113,113,0.1)' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <PainelConfig aberto={cfgAberto} onFechar={() => setCfgAberto(false)}
          config={config} onSalvar={salvarConfig} />
      </div>
    )
  }

  // ── ESCOLHER MODELO ──
  if (etapa === 'modelo') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setEtapa('lista')}
            className="flex items-center gap-1 px-3 py-2 rounded-xl font-semibold"
            style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.06)' }}>
            <ArrowLeft size={14} /> Voltar
          </button>
          <p className="font-bold" style={{ fontSize: 15, color: 'var(--text-primary)' }}>
            1. Escolha o modelo
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {CONTRATO_CATEGORIAS.map(c => (
            <button key={c.id} type="button" onClick={() => setCategoria(c.id)}
              className="px-3 py-1.5 rounded-xl font-semibold"
              style={{
                fontSize: 11,
                background: categoria === c.id ? 'rgba(13,148,136,0.25)' : 'rgba(255,255,255,0.05)',
                color: categoria === c.id ? '#5eead4' : 'var(--text-tertiary)',
                border: categoria === c.id ? '1px solid rgba(45,212,191,0.4)' : '1px solid transparent',
              }}>
              {c.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-tertiary)' }} />
          <input value={buscaTpl} onChange={e => setBuscaTpl(e.target.value)}
            placeholder="Buscar modelo..."
            className="input-dark w-full pl-9 pr-3 py-2.5" style={{ fontSize: 13 }} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {templates.map(t => (
            <button key={t.id} type="button" onClick={() => escolherModelo(t.id)}
              className="rounded-3xl p-4 text-left transition-all"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold" style={{ fontSize: 14, color: 'var(--text-primary)' }}>{t.nome}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                    {t.precisaPessoa ? 'Vincula a uma pessoa da equipe' : 'Fornecedor / patrimônio'}
                  </p>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── ESCOLHER PESSOA ──
  if (etapa === 'pessoa') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setEtapa('modelo')}
            className="flex items-center gap-1 px-3 py-2 rounded-xl font-semibold"
            style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.06)' }}>
            <ArrowLeft size={14} /> Modelos
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-bold truncate" style={{ fontSize: 15, color: 'var(--text-primary)' }}>
              2. Pessoas por cargo
            </p>
            <p className="truncate" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              {tplAtual?.nome}
            </p>
          </div>
          {selecionados.size > 0 && (
            <button type="button" onClick={gerarLote}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-white shrink-0"
              style={{ fontSize: 12, background: '#0d9488' }}>
              <FileText size={13} /> Gerar lote ({selecionados.size})
            </button>
          )}
        </div>

        <Campo label="Objeto / atividade (preenche o item a) do contrato)">
          <input className="input-dark w-full py-2.5" style={{ fontSize: 13 }}
            value={objetoA} onChange={e => setObjetoA(e.target.value)}
            placeholder="Ex.: Mobilização de rua, panfletagem, coordenação..." />
        </Campo>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl px-3 py-2.5"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
            <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Data início (fixa)</p>
            <p className="font-bold" style={{ fontSize: 13, color: 'var(--text-primary)' }}>
              {CONTRATO_DATA_INICIO_FIXA.split('-').reverse().join('/')}
            </p>
          </div>
          <div className="rounded-2xl px-3 py-2.5"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
            <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Data término (fixa)</p>
            <p className="font-bold" style={{ fontSize: 13, color: 'var(--text-primary)' }}>
              {CONTRATO_DATA_FIM_FIXA.split('-').reverse().join('/')}
            </p>
          </div>
          <Campo label="Horário / carga horária">
            <input className="input-dark w-full py-2.5" style={{ fontSize: 13 }}
              value={horas} onChange={e => setHoras(e.target.value)}
              placeholder={config.horasPadrao || '8 horas diárias'} />
          </Campo>
        </div>

        {campanhaPend.length > 0 && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: '#fbbf24' }} />
            <span style={{ fontSize: 12, color: '#fcd34d' }}>
              Preencha os dados da campanha antes de gerar: {campanhaPend.join(', ')}.
              {' '}
              <button type="button" onClick={() => setCfgAberto(true)}
                className="underline font-semibold">Abrir</button>
            </span>
          </div>
        )}

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-tertiary)' }} />
          <input value={buscaPessoa} onChange={e => setBuscaPessoa(e.target.value)}
            placeholder="Buscar por nome, CPF ou cargo..."
            className="input-dark w-full pl-9 pr-3 py-2.5" style={{ fontSize: 13 }} />
        </div>

        {msg && <p style={{ fontSize: 12, color: '#fbbf24' }}>{msg}</p>}

        <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          Marque várias pessoas e use &quot;Gerar lote&quot;, ou toque no nome para abrir um contrato.
          Só entram quem tem remuneração e ainda não tem contrato pronto neste modelo (quem já gerou some da lista).
          Quem tiver dados pendentes fica bloqueado.
        </p>

        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
          {gruposCargo.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: 12 }}>
              {buscaPessoa.trim()
                ? 'Nenhuma pessoa disponível nessa busca.'
                : idsComContratoPronto.size > 0
                  ? 'Todas as pessoas com remuneração já têm contrato pronto neste modelo. Veja a lista de contratos salvos.'
                  : 'Ninguém com remuneração na equipe. Cadastre o valor na aba Equipe para aparecer aqui.'}
            </p>
          ) : gruposCargo.map(([cargo, lista]) => {
            const ids = lista.map(m => String(m.id))
            const todosSel = ids.length > 0 && ids.every(id => selecionados.has(id))
            const okCount = lista.filter(m => podeGerarContrato(m, config).ok).length
            return (
              <div key={cargo} className="rounded-3xl overflow-hidden"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center gap-2 px-3 py-2.5"
                  style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border-subtle)' }}>
                  <button type="button" onClick={() => toggleCargo(lista)}
                    className="p-1 rounded-lg" title="Selecionar cargo"
                    style={{ color: todosSel ? '#5eead4' : 'var(--text-tertiary)' }}>
                    {todosSel ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold" style={{ fontSize: 13, color: 'var(--text-primary)' }}>{cargo}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                      {lista.length} pessoa(s) · {okCount} prontas para contrato
                    </p>
                  </div>
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                  {lista.map(m => {
                    const check = podeGerarContrato(m, config)
                    const sel = selecionados.has(String(m.id))
                    const pend = check.membro
                    return (
                      <div key={m.id} className="flex items-stretch gap-1 px-2 py-1"
                        style={{
                          background: sel ? 'rgba(13,148,136,0.1)' : 'transparent',
                          opacity: check.ok ? 1 : 0.72,
                        }}>
                        <button type="button" onClick={() => toggleSel(String(m.id))}
                          className="px-2 py-3" style={{ color: sel ? '#5eead4' : 'var(--text-tertiary)' }}
                          title="Selecionar para lote">
                          {sel ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                        <button type="button" onClick={() => tentarAbrirPessoa(m)}
                          className="flex-1 min-w-0 text-left py-2.5 pr-2 flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold truncate" style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                              {m.nome}
                            </p>
                            <p style={{ fontSize: 11, color: pend.length ? '#fbbf24' : 'var(--text-tertiary)' }}>
                              {pend.length
                                ? `Pendente: ${pend.join(', ')}`
                                : [m.cpf, parseValor(m.salario) > 0 ? fmtMoeda(parseValor(m.salario)) : null]
                                  .filter(Boolean).join(' · ') || 'Dados OK'}
                            </p>
                          </div>
                          {check.ok
                            ? <ChevronRight size={16} style={{ color: 'var(--text-tertiary)' }} />
                            : <AlertTriangle size={14} style={{ color: '#fbbf24' }} />}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {selecionados.size > 0 && (
          <div className="sticky bottom-2 flex justify-end">
            <button type="button" onClick={gerarLote}
              className="flex items-center gap-1.5 px-4 py-3 rounded-2xl font-bold text-white shadow-lg"
              style={{ fontSize: 13, background: '#0d9488' }}>
              <FileText size={15} /> Gerar {selecionados.size} contrato(s) e salvar
            </button>
          </div>
        )}

        <PainelConfig aberto={cfgAberto} onFechar={() => setCfgAberto(false)}
          config={config} onSalvar={salvarConfig} />
      </div>
    )
  }

  // ── EDITOR + PRÉVIA ──
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setEtapa('lista')}
          className="flex items-center gap-1 px-3 py-2 rounded-xl font-semibold"
          style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.06)' }}>
          <ArrowLeft size={14} /> Lista
        </button>
        <button type="button" onClick={() => setCfgAberto(true)}
          className="flex items-center gap-1 px-3 py-2 rounded-xl font-semibold"
          style={{ fontSize: 12, background: 'rgba(37,99,235,0.16)', color: '#93c5fd' }}>
          <Settings2 size={13} /> Campanha
        </button>
        {templateId && (
          <button type="button" onClick={regenerar}
            className="flex items-center gap-1 px-3 py-2 rounded-xl font-semibold"
            style={{ fontSize: 12, color: 'var(--text-tertiary)', background: 'rgba(255,255,255,0.05)' }}>
            Regenerar do modelo
          </button>
        )}
        <div className="flex-1" />
        <button type="button" onClick={() => setMostrarPrevia(p => !p)}
          className="flex items-center gap-1 px-3 py-2 rounded-xl font-semibold"
          style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.06)' }}>
          <Eye size={13} /> {mostrarPrevia ? 'Ocultar prévia' : 'Ver prévia'}
        </button>
        <button type="button" onClick={() => salvarContrato('rascunho')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold"
          style={{ fontSize: 12, background: 'rgba(37,99,235,0.2)', color: '#93c5fd' }}>
          <Check size={13} /> Rascunho
        </button>
        <button type="button" onClick={() => salvarContrato('pronto')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-white"
          style={{ fontSize: 12, background: '#2563eb' }}>
          <Check size={13} /> Salvar pronto
        </button>
        <button type="button" onClick={imprimir}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold"
          style={{ fontSize: 12, background: 'rgba(148,163,184,0.18)', color: '#e2e8f0' }}>
          <Printer size={13} /> Imprimir
        </button>
        <button type="button" onClick={baixarPdf}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-white"
          style={{ fontSize: 12, background: '#0d9488' }}>
          <Download size={13} /> Baixar PDF
        </button>
      </div>

      {msg && <p className="font-semibold" style={{ fontSize: 12, color: '#34d399' }}>{msg}</p>}

      {!config.candidatoNome && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <AlertTriangle size={14} style={{ color: '#fbbf24' }} />
          <span style={{ fontSize: 12, color: '#fcd34d' }}>
            Preencha os dados da campanha (nome/CNPJ) para os modelos saírem completos.
          </span>
        </div>
      )}

      {membroAtual && (
        <div className="rounded-2xl px-4 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <div>
            <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Contratado</p>
            <p className="font-semibold" style={{ fontSize: 12, color: 'var(--text-primary)' }}>{membroAtual.nome}</p>
          </div>
          <div>
            <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>CPF</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{membroAtual.cpf || '—'}</p>
          </div>
          <div>
            <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Telefone</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{membroAtual.telefone || '—'}</p>
          </div>
          <div>
            <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Remuneração</p>
            <p style={{ fontSize: 12, color: '#34d399' }}>
              {parseValor(membroAtual.salario) > 0 ? fmtMoeda(parseValor(membroAtual.salario)) : '—'}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-3xl p-4 space-y-3"
        style={{ background: 'var(--bg-surface)', border: '1px solid rgba(45,212,191,0.28)' }}>
        <div className="flex items-start gap-2">
          <ShieldCheck size={16} className="shrink-0 mt-0.5" style={{ color: '#5eead4' }} />
          <div className="min-w-0 flex-1">
            <p className="font-bold" style={{ fontSize: 13, color: 'var(--text-primary)' }}>
              Assinatura Gov.br e autenticidade
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {rascunhoAtual?.codigoAutenticidade
                ? `Código ${rascunhoAtual.codigoAutenticidade} · ${rotuloStatusAssinatura(statusAssinatura(rascunhoAtual))}`
                : 'Ao gerar o PDF o sistema cria o código, o QR e os dois quadros de assinatura no fim do documento.'}
              {rascunhoAtual?.metodoAssinaturaContratado === 'govbr' ? ' · Contratado via Gov.br' : ''}
              {rascunhoAtual?.metodoAssinaturaContratado === 'tela' ? ' · Contratado à mão livre' : ''}
              {rascunhoAtual?.metodoAssinaturaDeputado === 'govbr' ? ' · Deputado via Gov.br' : ''}
              {rascunhoAtual?.permitirAssinaturaMaoLivre ? ' · Mão livre autorizada' : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => enviarWhatsAppContrato(rascunhoAtual || {
            id: rascunhoId, titulo, corpo, templateId, membroId,
          })}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-white"
            style={{ fontSize: 12, background: '#16a34a' }}>
            <MessageCircle size={13} /> Enviar no WhatsApp
          </button>
          <button type="button" onClick={() => copiarLinkAssinatura(rascunhoAtual || {
            id: rascunhoId, titulo, corpo, templateId, membroId,
          })}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-white"
            style={{ fontSize: 12, background: '#2563eb' }}>
            <Copy size={13} /> Copiar link
          </button>
          <button type="button" onClick={() => copiarLinkConferencia(rascunhoAtual || {
            id: rascunhoId, titulo, corpo, templateId, membroId,
          })}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold"
            style={{ fontSize: 12, background: 'rgba(37,99,235,0.18)', color: '#93c5fd' }}>
            <Copy size={13} /> Link de conferência
          </button>
          <button type="button" onClick={() => abrirGovBr(rascunhoAtual || {
            id: rascunhoId, titulo, corpo, templateId, membroId,
          })}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-white"
            style={{ fontSize: 12, background: '#1351b4' }}>
            <ExternalLink size={13} /> Assinar no Gov.br
          </button>
          <button type="button" onClick={() => autorizarMaoLivre(rascunhoAtual || {
            id: rascunhoId, titulo, corpo, templateId, membroId,
          })}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold"
            style={{
              fontSize: 12,
              background: rascunhoAtual?.permitirAssinaturaMaoLivre ? 'rgba(245,158,11,0.22)' : 'rgba(255,255,255,0.06)',
              color: rascunhoAtual?.permitirAssinaturaMaoLivre ? '#fbbf24' : 'var(--text-secondary)',
            }}>
            <PenLine size={13} />
            {rascunhoAtual?.permitirAssinaturaMaoLivre ? 'Mão livre liberada' : 'Autorizar mão livre'}
          </button>
          {rascunhoAtual && (
            <>
              <button type="button" onClick={() => marcarAssinatura(rascunhoAtual, 'contratado')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold"
                style={{
                  fontSize: 12,
                  background: rascunhoAtual.assinadoContratadoEm ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)',
                  color: rascunhoAtual.assinadoContratadoEm ? '#34d399' : 'var(--text-secondary)',
                }}>
                <Check size={13} /> Contratado {rascunhoAtual.assinadoContratadoEm ? 'ok' : ''}
              </button>
              <button type="button" onClick={() => marcarAssinatura(rascunhoAtual, 'deputado')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold"
                style={{
                  fontSize: 12,
                  background: rascunhoAtual.assinadoDeputadoEm ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)',
                  color: rascunhoAtual.assinadoDeputadoEm ? '#34d399' : 'var(--text-secondary)',
                }}>
                <Check size={13} /> Deputado {rascunhoAtual.assinadoDeputadoEm ? 'ok' : ''}
              </button>
              {(rascunhoAtual.assinadoContratadoEm || rascunhoAtual.assinaturaContratado) && (
                <button type="button" onClick={() => resetarAssinatura(rascunhoAtual, 'contratado')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold"
                  style={{ fontSize: 12, background: 'rgba(239,68,68,0.16)', color: '#fca5a5' }}>
                  <RotateCcw size={13} /> Resetar assinatura
                </button>
              )}
              {(rascunhoAtual.assinadoDeputadoEm || rascunhoAtual.assinaturaDeputado) && (
                <button type="button" onClick={() => resetarAssinatura(rascunhoAtual, 'deputado')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold"
                  style={{ fontSize: 12, background: 'rgba(239,68,68,0.10)', color: '#fca5a5' }}>
                  <RotateCcw size={13} /> Resetar deputado
                </button>
              )}
              <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold cursor-pointer"
                style={{ fontSize: 12, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                <Upload size={13} /> Anexar PDF assinado
                <input type="file" accept="application/pdf" className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) anexarPdfAssinado(rascunhoAtual, f)
                  }} />
              </label>
            </>
          )}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          O WhatsApp pergunta se envia para <strong>Gov.br</strong> ou <strong>mão livre</strong>.
          Mão livre já libera o quadro no link da pessoa.
          Errou a assinatura? Use <strong>Resetar assinatura</strong> — o mesmo link volta a pedir a assinatura.
        </p>
        {rascunhoAtual?.pdfAssinadoNome && (
          <p style={{ fontSize: 11, color: '#5eead4' }}>
            Arquivo na conferência: {rascunhoAtual.pdfAssinadoNome}
          </p>
        )}
      </div>

      <Campo label="Título">
        <input className="input-dark w-full py-2.5" style={{ fontSize: 13 }}
          value={titulo} onChange={e => setTitulo(e.target.value)} />
      </Campo>

      <div className="rounded-3xl overflow-hidden flex flex-col"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
        <div className="px-4 py-2.5 font-semibold" style={{ fontSize: 12, color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>
          Editar contrato completo
          {membroAtual ? ` · ${membroAtual.nome}` : ''}
          {tplAtual ? ` · ${tplAtual.nome}` : ''}
        </div>
        <textarea
          value={corpo}
          onChange={e => setCorpo(e.target.value)}
          className="w-full px-4 py-3 bg-transparent outline-none resize-y"
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: 'var(--text-primary)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            minHeight: 320,
          }}
          spellCheck
        />
      </div>

      {mostrarPrevia && (
        <div className="rounded-3xl overflow-hidden"
          style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid var(--border-subtle)' }}>
          <div className="px-4 py-2.5 font-semibold flex items-center justify-between"
            style={{ fontSize: 12, color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>
            <span>Prévia (tamanho de leitura — igual ao PDF)</span>
            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>A4</span>
          </div>
          <div className="p-4 sm:p-6 overflow-x-auto" style={{ background: '#cbd5e1' }}>
            <PreviaContrato
              corpo={corpo}
              auth={rascunhoAtual?.codigoAutenticidade
                ? {
                    codigo: rascunhoAtual.codigoAutenticidade,
                    hash: rascunhoAtual.hashCorpo,
                    assinaturaContratado: rascunhoAtual.assinaturaContratado,
                    assinaturaDeputado: rascunhoAtual.assinaturaDeputado,
                  }
                : null}
            />
          </div>
        </div>
      )}

      <PainelConfig aberto={cfgAberto} onFechar={() => setCfgAberto(false)}
        config={config} onSalvar={salvarConfig} />
    </div>
  )
}
