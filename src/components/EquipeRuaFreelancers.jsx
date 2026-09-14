import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Users, Calculator } from 'lucide-react'
import { confirmAction } from '../utils/confirm'
import { Button } from './ui'
import {
  freelancerVazio, loadRuaFreelancers, salvarRuaFreelancers,
  totalLinhaFreelancer, totalRuaFreelancers, qtdPessoasFreelancers, fmtMoedaBr, parseNum,
} from '../utils/equipeRuaFreelancer'
import { EQUIPE_PREVISAO_EVENT, PREVISAO_KEY } from '../utils/equipeSync'
import { SYNC_STORAGE_EVENT, SYNC_EVENT } from '../lib/cloudSync'

const INPUT = 'input-dark w-full px-3 py-2'
const INPUT_STY = { fontSize: 13 }

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[11px] font-semibold block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>{label}</label>
      {children}
    </div>
  )
}

/**
 * Cadastro de equipes de rua freelancer (qtd × diária × dias).
 * Persiste em previsao_data.ruaFreelancers e entra no total da Previsão.
 */
export default function EquipeRuaFreelancers({ compact = false, onChange }) {
  const [lista, setLista] = useState(() => loadRuaFreelancers())
  const [form, setForm] = useState(null) // null | objeto em edição / novo
  const [erro, setErro] = useState('')

  useEffect(() => {
    function reload() {
      setLista(loadRuaFreelancers())
    }
    function onSync(e) {
      const key = e?.detail?.key || e?.key
      if (e?.type === SYNC_EVENT && (e?.detail?.fromServer || e?.detail?.syncNow)) {
        reload()
        return
      }
      if (key && key !== PREVISAO_KEY) return
      if (e?.type === SYNC_STORAGE_EVENT && !e?.detail?.external && key === PREVISAO_KEY) return
      reload()
    }
    window.addEventListener(EQUIPE_PREVISAO_EVENT, reload)
    window.addEventListener(SYNC_STORAGE_EVENT, onSync)
    window.addEventListener(SYNC_EVENT, onSync)
    return () => {
      window.removeEventListener(EQUIPE_PREVISAO_EVENT, reload)
      window.removeEventListener(SYNC_STORAGE_EVENT, onSync)
      window.removeEventListener(SYNC_EVENT, onSync)
    }
  }, [])

  const totalGeral = useMemo(() => totalRuaFreelancers(lista), [lista])
  const qtdPessoas = useMemo(() => qtdPessoasFreelancers(lista), [lista])
  const previewTotal = form ? totalLinhaFreelancer(form) : 0

  function persist(nova) {
    const salva = salvarRuaFreelancers(nova)
    setLista(salva)
    onChange?.(salva)
  }

  function abrirNovo() {
    setErro('')
    setForm(freelancerVazio())
  }

  function abrirEditar(item) {
    setErro('')
    setForm({ ...item })
  }

  function cancelar() {
    setForm(null)
    setErro('')
  }

  function upd(k, v) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function salvarForm() {
    if (!form) return
    const q = parseNum(form.quantidade)
    const d = parseNum(form.dias)
    const v = parseNum(form.valorDiario)
    if (q <= 0) { setErro('Informe a quantidade de pessoas.'); return }
    if (v <= 0) { setErro('Informe o valor diário.'); return }
    if (d <= 0) { setErro('Informe quantos dias.'); return }

    const item = {
      ...form,
      nome: String(form.nome || '').trim() || `Equipe freela (${q} pess.)`,
      quantidade: q,
      valorDiario: v,
      dias: d,
    }
    const existe = lista.some(x => x.id === item.id)
    const nova = existe
      ? lista.map(x => x.id === item.id ? item : x)
      : [item, ...lista]
    persist(nova)
    setForm(null)
    setErro('')
  }

  async function excluir(id) {
    const ok = await confirmAction({
      title: 'Excluir equipe freelancer?',
      message: 'O valor sairá da Previsão de Gastos.',
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    persist(lista.filter(x => x.id !== id))
  }

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-3 gap-3"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
          <div>
            <p className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-faint)' }}>Linhas</p>
            <p className="text-xl font-black tnum" style={{ color: 'var(--text-primary)' }}>{lista.length}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-faint)' }}>Pessoas</p>
            <p className="text-xl font-black tnum" style={{ color: 'var(--text-primary)' }}>{qtdPessoas}</p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-faint)' }}>Total previsto</p>
            <p className="text-xl font-black tnum" style={{ color: 'var(--gold-bright)' }}>{fmtMoedaBr(totalGeral)}</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
          Quantidade × valor diário × dias · entra na <strong style={{ color: 'var(--text-secondary)' }}>Previsão de Gastos</strong>
        </p>
        {!form && (
          <Button icon={Plus} onClick={abrirNovo}>Adicionar equipe</Button>
        )}
      </div>

      {form && (
        <div className="rounded-2xl p-4 space-y-3"
          style={{ background: 'var(--bg-card)', border: '1px solid rgba(168,85,247,0.35)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Calculator size={16} style={{ color: '#c084fc' }} />
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              {lista.some(x => x.id === form.id) ? 'Editar equipe freelancer' : 'Nova equipe freelancer'}
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nome / descrição">
              <input className={INPUT} style={INPUT_STY} value={form.nome}
                onChange={e => upd('nome', e.target.value)}
                placeholder="Ex.: Panfletagem centro, Equipe freela Gaspar" />
            </Field>
            <Field label="Observações">
              <input className={INPUT} style={INPUT_STY} value={form.observacoes || ''}
                onChange={e => upd('observacoes', e.target.value)}
                placeholder="Opcional" />
            </Field>
            <Field label="Quantidade de pessoas">
              <input type="number" min="1" step="1" className={INPUT} style={INPUT_STY}
                value={form.quantidade}
                onChange={e => upd('quantidade', e.target.value)} />
            </Field>
            <Field label="Valor diário (R$ por pessoa)">
              <input type="number" min="0" step="0.01" className={INPUT} style={INPUT_STY}
                value={form.valorDiario}
                onChange={e => upd('valorDiario', e.target.value)}
                placeholder="Ex.: 150" />
            </Field>
            <Field label="Quantos dias">
              <input type="number" min="1" step="1" className={INPUT} style={INPUT_STY}
                value={form.dias}
                onChange={e => upd('dias', e.target.value)}
                placeholder="Ex.: 45" />
            </Field>
            <div className="flex flex-col justify-end">
              <p className="text-[10px] font-bold uppercase mb-1" style={{ color: 'var(--text-faint)' }}>Total da linha</p>
              <p className="text-lg font-black tnum" style={{ color: '#c084fc' }}>{fmtMoedaBr(previewTotal)}</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
                {parseNum(form.quantidade) || 0} × {fmtMoedaBr(parseNum(form.valorDiario))} × {parseNum(form.dias) || 0} dias
              </p>
            </div>
          </div>
          {erro && <p className="text-sm font-semibold" style={{ color: '#f87171' }}>{erro}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={cancelar}>Cancelar</Button>
            <Button onClick={salvarForm}>Salvar na previsão</Button>
          </div>
        </div>
      )}

      {lista.length === 0 && !form ? (
        <div className="rounded-2xl p-8 text-center"
          style={{ background: 'var(--bg-card)', border: '1.5px dashed rgba(255,255,255,0.12)' }}>
          <Users size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Nenhuma equipe freelancer</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Cadastre quantidade, diária e dias para prever o custo de rua.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {lista.map(item => {
            const tot = totalLinhaFreelancer(item)
            return (
              <div key={item.id} className="rounded-2xl p-3.5 flex flex-wrap items-center gap-3 justify-between"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
                <div className="min-w-0 flex-1">
                  <p className="font-bold truncate" style={{ color: 'var(--text-primary)', fontSize: 14 }}>{item.nome}</p>
                  <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    <span className="tnum">{item.quantidade}</span> pessoa{item.quantidade !== 1 ? 's' : ''}
                    {' · '}diária <span className="tnum">{fmtMoedaBr(item.valorDiario)}</span>
                    {' · '}<span className="tnum">{item.dias}</span> dia{item.dias !== 1 ? 's' : ''}
                  </p>
                  {item.observacoes && (
                    <p className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>{item.observacoes}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <p className="font-black tnum text-sm whitespace-nowrap" style={{ color: '#c084fc' }}>{fmtMoedaBr(tot)}</p>
                  <button type="button" onClick={() => abrirEditar(item)} className="p-2 rounded-lg"
                    style={{ color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)' }}
                    title="Editar">
                    <Pencil size={14} />
                  </button>
                  <button type="button" onClick={() => excluir(item.id)} className="p-2 rounded-lg"
                    style={{ color: '#f87171', border: '1px solid rgba(248,113,113,0.35)' }}
                    title="Excluir">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
          {compact && lista.length > 0 && (
            <div className="flex justify-between items-center pt-2 px-1"
              style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <span className="text-[12px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>
                {qtdPessoas} pessoas · {lista.length} linha{lista.length !== 1 ? 's' : ''}
              </span>
              <span className="text-sm font-black tnum" style={{ color: '#c084fc' }}>{fmtMoedaBr(totalGeral)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
