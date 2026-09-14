import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Pencil, Trash2 } from 'lucide-react'
import { BAIRROS_BLUMENAU } from '../../../utils/constants'
import { confirmAction } from '../../../utils/confirm'
import { flushAfterSave } from '../../../utils/persist'
import { useMapaEleitoral } from '../context/MapaEleitoralContext'
import { FORM_SECAO_VAZIO } from '../constants'

function uid() {
  return `m-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

export default function EleitoralSecoesModal({ open, onClose }) {
  const { secoes, setSecoes, bairroSel, isBlumenau } = useMapaEleitoral()
  const [form, setForm] = useState({ ...FORM_SECAO_VAZIO })
  const [editId, setEditId] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!open) return
    setEditId(null)
    setErro('')
    setForm({
      ...FORM_SECAO_VAZIO,
      bairro: bairroSel || BAIRROS_BLUMENAU[0],
    })
  }, [open, bairroSel])

  if (!open || !isBlumenau) return null

  const manuais = secoes.slice().sort((a, b) =>
    String(a.bairro).localeCompare(String(b.bairro), 'pt-BR')
    || String(a.colegio).localeCompare(String(b.colegio), 'pt-BR'),
  )

  function abrirNovo() {
    setEditId(null)
    setErro('')
    setForm({
      ...FORM_SECAO_VAZIO,
      bairro: bairroSel || BAIRROS_BLUMENAU[0],
    })
  }

  function abrirEditar(s) {
    setEditId(s.id)
    setErro('')
    setForm({ ...s })
  }

  function salvar(e) {
    e?.preventDefault?.()
    setErro('')
    if (!form.bairro || !String(form.colegio || '').trim() || !String(form.secao || '').trim()) {
      setErro('Preencha bairro, colégio e seção.')
      return
    }
    const payload = {
      ...form,
      colegio: String(form.colegio).trim(),
      secao: String(form.secao).trim(),
      totalEleitores: Number(form.totalEleitores) || 0,
      votosObtidos: Number(form.votosObtidos) || 0,
    }
    if (editId) {
      setSecoes(prev => prev.map(s => (s.id === editId ? { ...payload, id: editId } : s)))
    } else {
      setSecoes(prev => [...prev, { ...payload, id: uid() }])
    }
    flushAfterSave()
    setEditId(null)
    setForm({ ...FORM_SECAO_VAZIO, bairro: form.bairro })
  }

  async function excluir(id) {
    const s = secoes.find(x => x.id === id)
    const ok = await confirmAction({
      title: 'Excluir seção manual',
      message: `Remover seção ${s?.secao} — ${s?.colegio}?`,
    })
    if (!ok) return
    setSecoes(prev => prev.filter(x => x.id !== id))
    if (editId === id) abrirNovo()
    flushAfterSave()
  }

  return createPortal(
    <div className="me-modal-backdrop" role="dialog" aria-modal="true" aria-label="Seções manuais">
      <div className="me-modal">
        <div className="me-modal__head">
          <div>
            <h2>Seções manuais</h2>
            <p>Blumenau — complementa o PDF do TRE no mapa e no radar.</p>
          </div>
          <button type="button" className="me-modal__close" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <form className="me-modal__form" onSubmit={salvar}>
          <div className="me-modal__grid">
            <label>
              <span>Bairro</span>
              <select
                value={form.bairro}
                onChange={e => setForm(p => ({ ...p, bairro: e.target.value }))}
              >
                {BAIRROS_BLUMENAU.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Seção</span>
              <input
                value={form.secao}
                onChange={e => setForm(p => ({ ...p, secao: e.target.value }))}
                placeholder="Ex: 0123"
              />
            </label>
          </div>
          <label>
            <span>Colégio</span>
            <input
              value={form.colegio}
              onChange={e => setForm(p => ({ ...p, colegio: e.target.value }))}
              placeholder="Nome do local de votação"
            />
          </label>
          <div className="me-modal__grid">
            <label>
              <span>Eleitores aptos</span>
              <input
                type="number"
                min="0"
                value={form.totalEleitores}
                onChange={e => setForm(p => ({ ...p, totalEleitores: e.target.value }))}
              />
            </label>
            <label>
              <span>Votos obtidos</span>
              <input
                type="number"
                min="0"
                value={form.votosObtidos}
                onChange={e => setForm(p => ({ ...p, votosObtidos: e.target.value }))}
              />
            </label>
          </div>
          {erro && <p className="me-modal__erro">{erro}</p>}
          <div className="me-modal__actions">
            <button type="button" className="me-btn-ghost" onClick={abrirNovo}>
              <Plus size={14} /> Nova
            </button>
            <button type="submit" className="me-btn-primary">
              {editId ? 'Salvar alterações' : 'Adicionar seção'}
            </button>
          </div>
        </form>

        <div className="me-modal__list">
          <p className="me-modal__list-title">{manuais.length} seção(ões) manual(is)</p>
          {manuais.map(s => (
            <div key={s.id} className={`me-modal__row${editId === s.id ? ' me-modal__row--active' : ''}`}>
              <div>
                <strong>{s.bairro}</strong>
                <span>{s.colegio} · Seção {s.secao}</span>
                <span className="me-modal__row-meta">
                  {s.votosObtidos || 0} votos · {s.totalEleitores || 0} aptos
                </span>
              </div>
              <div className="me-modal__row-btns">
                <button type="button" onClick={() => abrirEditar(s)} aria-label="Editar">
                  <Pencil size={14} />
                </button>
                <button type="button" onClick={() => excluir(s.id)} aria-label="Excluir">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {!manuais.length && (
            <p className="me-empty">Nenhuma seção manual. Use o formulário acima.</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function EleitoralSecoesButton() {
  const { isBlumenau, secoes } = useMapaEleitoral()
  const [open, setOpen] = useState(false)
  if (!isBlumenau) return null
  return (
    <>
      <button
        type="button"
        className="me-btn-ghost me-btn-secoes"
        onClick={() => setOpen(true)}
      >
        <Pencil size={12} />
        Seções manuais ({secoes.length})
      </button>
      <EleitoralSecoesModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
