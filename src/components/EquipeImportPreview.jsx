import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, Trash2, AlertCircle, UserPlus, RefreshCw } from 'lucide-react'
import { CARGOS } from '../utils/equipeSync'
import { classificarLinhaImportacao, normalizarParcialImportacao } from '../utils/equipeImportXlsx'

const VINCULOS = ['Voluntário', 'CLT', 'PJ', 'Autônomo', 'Estagiário', 'Comissionado', 'Outro']

const CAMPOS_EDIT = [
  { key: 'nome', label: 'Nome*', type: 'text', wide: true },
  { key: 'cargo', label: 'Cargo', type: 'select', options: CARGOS },
  { key: 'vinculo', label: 'Vínculo', type: 'select', options: VINCULOS },
  { key: 'telefone', label: 'Telefone', type: 'text' },
  { key: 'cpf', label: 'CPF', type: 'text' },
  { key: 'dataNascimento', label: 'Nascimento', type: 'date' },
  { key: 'cep', label: 'CEP', type: 'text' },
  { key: 'logradouro', label: 'Logradouro', type: 'text', wide: true },
  { key: 'numero', label: 'Nº', type: 'text' },
  { key: 'complemento', label: 'Complemento', type: 'text' },
  { key: 'bairroResidencia', label: 'Bairro', type: 'text' },
  { key: 'cidade', label: 'Cidade', type: 'text' },
  { key: 'estado', label: 'UF', type: 'text' },
  { key: 'bairros', label: 'Atuação', type: 'bairros', wide: true },
  { key: 'salario', label: 'Remuneração', type: 'text' },
  { key: 'dataInicio', label: 'Início', type: 'date' },
  { key: 'contrato', label: 'Contrato', type: 'text' },
  { key: 'banco', label: 'Banco', type: 'text' },
  { key: 'agencia', label: 'Agência', type: 'text' },
  { key: 'conta', label: 'Conta', type: 'text' },
  { key: 'pix', label: 'PIX', type: 'text' },
  { key: 'indicacaoPor', label: 'Indicação', type: 'text' },
  { key: 'observacoes', label: 'Obs.', type: 'text', wide: true },
]

const STATUS_META = {
  novo: { label: 'Novo', cor: '#34d399', Icon: UserPlus },
  complementar: { label: 'Complementar', cor: '#60a5fa', Icon: RefreshCw },
  completo: { label: 'Já completo', cor: '#94a3b8', Icon: Check },
}

function valorCampo(row, key) {
  if (key === 'bairros') {
    return Array.isArray(row.bairros) ? row.bairros.join(', ') : String(row.bairros || '')
  }
  return row[key] ?? ''
}

/**
 * Modal de revisão: editar / excluir linhas antes de confirmar a importação.
 */
export default function EquipeImportPreview({
  linhasIniciais,
  membrosAtuais,
  arquivoNome,
  onCancelar,
  onConfirmar,
  confirmando,
}) {
  const [linhas, setLinhas] = useState(() =>
    (linhasIniciais || []).map((p, i) => ({
      _key: `${i}-${p.nome}`,
      incluir: true,
      ...p,
      bairros: Array.isArray(p.bairros) ? p.bairros : [],
    })),
  )
  const [indice, setIndice] = useState(0)

  const classificacoes = useMemo(
    () => linhas.map(l => classificarLinhaImportacao(membrosAtuais, l)),
    [linhas, membrosAtuais],
  )

  const resumo = useMemo(() => {
    let novos = 0
    let complementar = 0
    let completo = 0
    let excluidos = 0
    linhas.forEach((l, i) => {
      if (!l.incluir || !String(l.nome || '').trim()) {
        excluidos += 1
        return
      }
      const s = classificacoes[i]?.status
      if (s === 'novo') novos += 1
      else if (s === 'complementar') complementar += 1
      else completo += 1
    })
    return { novos, complementar, completo, excluidos }
  }, [linhas, classificacoes])

  const atual = linhas[indice] || null
  const statusAtual = classificacoes[indice]

  function updLinha(i, patch) {
    setLinhas(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  function updCampo(key, raw) {
    if (!atual) return
    if (key === 'bairros') {
      updLinha(indice, {
        bairros: String(raw || '')
          .split(/[,;|/]/)
          .map(s => s.trim())
          .filter(Boolean),
      })
      return
    }
    updLinha(indice, { [key]: raw })
  }

  function confirmar() {
    const parciais = linhas
      .filter(l => l.incluir && String(l.nome || '').trim())
      .map(l => {
        const { _key, incluir, ...rest } = l
        return normalizarParcialImportacao(rest)
      })
      .filter(Boolean)
    if (!parciais.length) {
      window.alert('Nenhuma linha válida para importar. Marque ao menos um membro com Nome.')
      return
    }
    onConfirmar(parciais)
  }

  if (!atual) return null

  const meta = STATUS_META[statusAtual?.status] || STATUS_META.novo
  const StatusIcon = meta.Icon

  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center p-3 md:p-6"
      style={{ zIndex: 2147483000, background: 'rgba(15,23,42,0.82)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancelar() }}
    >
      <div
        className="w-full max-w-5xl max-h-[92vh] rounded-3xl overflow-hidden flex flex-col"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: '0 24px 80px rgba(0,0,0,0.45)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-subtle)', background: 'linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 100%)' }}>
          <div>
            <h2 className="font-black text-white" style={{ fontSize: 18 }}>Revisar importação</h2>
            <p className="text-blue-100 mt-0.5" style={{ fontSize: 12 }}>
              {arquivoNome ? `${arquivoNome} · ` : ''}
              Confira e edite antes de gravar no sistema
            </p>
          </div>
          <button type="button" onClick={onCancelar} className="p-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.12)' }}>
            <X size={18} className="text-white" />
          </button>
        </div>

        <div className="px-5 py-3 flex flex-wrap gap-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <span className="px-2.5 py-1 rounded-lg font-bold" style={{ fontSize: 11, background: 'rgba(52,211,153,0.15)', color: '#34d399' }}>
            {resumo.novos} novo(s)
          </span>
          <span className="px-2.5 py-1 rounded-lg font-bold" style={{ fontSize: 11, background: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>
            {resumo.complementar} complementar
          </span>
          <span className="px-2.5 py-1 rounded-lg font-bold" style={{ fontSize: 11, background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>
            {resumo.completo} já completo
          </span>
          {resumo.excluidos > 0 && (
            <span className="px-2.5 py-1 rounded-lg font-bold" style={{ fontSize: 11, background: 'rgba(248,113,113,0.12)', color: '#f87171' }}>
              {resumo.excluidos} fora da importação
            </span>
          )}
        </div>

        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          {/* Lista lateral */}
          <div className="md:w-56 flex-shrink-0 overflow-auto"
            style={{ borderRight: '1px solid var(--border-subtle)', maxHeight: '40vh' }}>
            {linhas.map((l, i) => {
              const st = classificacoes[i]
              const m = STATUS_META[st?.status] || STATUS_META.novo
              const ativo = i === indice
              return (
                <button
                  key={l._key}
                  type="button"
                  onClick={() => setIndice(i)}
                  className="w-full text-left px-3 py-2.5 transition-colors"
                  style={{
                    background: ativo ? 'rgba(37,99,235,0.18)' : 'transparent',
                    borderBottom: '1px solid var(--border-subtle)',
                    opacity: l.incluir ? 1 : 0.45,
                  }}
                >
                  <p className="font-bold truncate" style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                    {l.nome || '(sem nome)'}
                  </p>
                  <p className="truncate mt-0.5" style={{ fontSize: 10, color: m.cor }}>
                    {l.incluir ? m.label : 'Excluído'} · {l.cargo || '—'}
                  </p>
                </button>
              )
            })}
          </div>

          {/* Formulário */}
          <div className="flex-1 overflow-auto p-4 md:p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold"
                  style={{ fontSize: 11, background: meta.cor + '22', color: meta.cor }}>
                  <StatusIcon size={12} /> {meta.label}
                </span>
                {statusAtual?.existenteNome && (
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    Match: {statusAtual.existenteNome}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer select-none"
                  style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={!!atual.incluir}
                    onChange={e => updLinha(indice, { incluir: e.target.checked })}
                  />
                  Incluir na importação
                </label>
                <button
                  type="button"
                  title="Remover desta revisão"
                  onClick={() => updLinha(indice, { incluir: false })}
                  className="p-2 rounded-xl"
                  style={{ background: 'rgba(248,113,113,0.12)' }}
                >
                  <Trash2 size={14} style={{ color: '#f87171' }} />
                </button>
              </div>
            </div>

            {statusAtual?.status === 'complementar' && (
              <div className="flex gap-2 p-3 rounded-2xl" style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)' }}>
                <AlertCircle size={16} style={{ color: '#60a5fa', flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  Este membro já existe. Na confirmação, <strong style={{ color: 'var(--text-primary)' }}>só campos vazios</strong> no cadastro atual serão preenchidos — dados já salvos não são sobrescritos.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CAMPOS_EDIT.map(campo => (
                <label
                  key={campo.key}
                  className={campo.wide ? 'sm:col-span-2' : ''}
                  style={{ fontSize: 11, color: 'var(--text-tertiary)' }}
                >
                  {campo.label}
                  {campo.type === 'select' ? (
                    <select
                      value={atual[campo.key] || ''}
                      onChange={e => updCampo(campo.key, e.target.value)}
                      className="input-dark w-full mt-1 px-3 py-2"
                      style={{ fontSize: 13 }}
                    >
                      {campo.options.map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={campo.type === 'date' ? 'date' : 'text'}
                      value={valorCampo(atual, campo.key)}
                      onChange={e => updCampo(campo.key, e.target.value)}
                      className="input-dark w-full mt-1 px-3 py-2"
                      style={{ fontSize: 13 }}
                    />
                  )}
                </label>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                disabled={indice <= 0}
                onClick={() => setIndice(i => Math.max(0, i - 1))}
                className="px-3 py-2 rounded-xl font-semibold disabled:opacity-40"
                style={{ fontSize: 12, background: 'var(--bg-raised)', color: 'var(--text-secondary)' }}
              >
                ← Anterior
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {indice + 1} / {linhas.length}
              </span>
              <button
                type="button"
                disabled={indice >= linhas.length - 1}
                onClick={() => setIndice(i => Math.min(linhas.length - 1, i + 1))}
                className="px-3 py-2 rounded-xl font-semibold disabled:opacity-40"
                style={{ fontSize: 12, background: 'var(--bg-raised)', color: 'var(--text-secondary)' }}
              >
                Próximo →
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-4"
          style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <button
            type="button"
            onClick={onCancelar}
            disabled={confirmando}
            className="px-4 py-2.5 rounded-2xl font-bold"
            style={{ fontSize: 13, background: 'var(--bg-raised)', color: 'var(--text-secondary)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={confirmando}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-white disabled:opacity-60"
            style={{ fontSize: 13, background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', boxShadow: '0 4px 14px rgba(29,78,216,0.35)' }}
          >
            <Check size={16} />
            {confirmando ? 'Importando…' : `Confirmar importação (${resumo.novos + resumo.complementar + resumo.completo})`}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
