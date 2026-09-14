import { useRef, useState } from 'react'
import { Camera, Loader2, Save, X } from 'lucide-react'
import CultoHorariosEditor from './CultoHorariosEditor'
import IgrejaFormEndereco from './IgrejaFormEndereco'
import { lerIgrejaFoto } from '../utils/igrejaImportFoto'

const DENOM_PADRAO = 'Assembleia de Deus'

function FormAlert({ type, children }) {
  if (!children) return null
  const isErr = type === 'err'
  return (
    <p className="rounded-lg px-2.5 py-1.5 font-semibold"
      style={{
        fontSize: 11,
        background: isErr ? 'rgba(248,113,113,0.12)' : 'rgba(34,197,94,0.12)',
        color: isErr ? '#fca5a5' : '#86efac',
        border: `1px solid ${isErr ? 'rgba(248,113,113,0.3)' : 'rgba(34,197,94,0.3)'}`,
      }}>
      {children}
    </p>
  )
}

export const fieldInput = {
  width: '100%',
  fontSize: 12,
  padding: '8px 10px',
  borderRadius: 10,
  background: 'rgba(0,0,0,0.25)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'inherit',
  colorScheme: 'dark',
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block font-bold uppercase tracking-wide mb-1"
        style={{ fontSize: 9, color: 'var(--text-faint)', letterSpacing: '0.05em' }}>
        {label}
      </span>
      {children}
    </label>
  )
}

/**
 * Formulário completo de edição de igreja — nome, endereço, culto, contatos, pastores.
 */
export default function IgrejaFormEdicao({
  ig,
  editForm,
  onEditForm,
  editErro = '',
  editOk = '',
  onSalvar,
  onCancel,
  onRemover,
  setoresOpcoes = [],
  denominacoes = [],
  onCorrigirGps,
  fichaCompleta = true,
  showOcr = true,
  showExcluir = true,
  compact = false,
}) {
  const [ocrLoad, setOcrLoad] = useState(false)
  const fotoInputRef = useRef(null)

  async function importarFichaDaFoto(file) {
    if (!file || !onEditForm) return
    setOcrLoad(true)
    try {
      const dados = await lerIgrejaFoto(file)
      onEditForm({
        ...editForm,
        culto: dados.culto || editForm.culto || '',
        telefone: dados.telefone || editForm.telefone || '',
        whatsapp: dados.whatsapp || editForm.whatsapp || editForm.telefone || '',
        pastor1: dados.pastor1 || editForm.pastor1 || '',
        pastor2: dados.pastor2 || editForm.pastor2 || '',
        nome: dados.nome || editForm.nome || '',
      })
    } catch {
      window.alert('Não foi possível ler a foto. Tente outra imagem com texto mais nítido.')
    } finally {
      setOcrLoad(false)
    }
  }

  return (
    <div
      className={`space-y-2.5 ${compact ? 'p-3' : 'p-3'} rounded-xl`}
      style={{
        background: 'rgba(0,0,0,0.35)',
        border: '1px solid rgba(212,175,95,0.22)',
        maxHeight: compact ? 'min(72vh, 520px)' : undefined,
        overflowY: compact ? 'auto' : undefined,
      }}
    >
      <p className="font-bold sticky top-0 z-10 py-0.5"
        style={{ fontSize: 11, color: 'var(--gold-bright)', background: 'rgba(0,0,0,0.35)' }}>
        Editar ficha — {ig?.nome || 'Igreja'}
      </p>

      {showOcr && fichaCompleta && (
        <>
          <input
            ref={fotoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) importarFichaDaFoto(f)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            disabled={ocrLoad}
            onClick={() => fotoInputRef.current?.click()}
            className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg font-bold"
            style={{ fontSize: 11, background: 'rgba(59,130,246,0.15)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.35)' }}
          >
            {ocrLoad ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
            {ocrLoad ? 'Lendo foto…' : 'Preencher da foto (horários / pastor / tel.)'}
          </button>
        </>
      )}

      {fichaCompleta && (
        <>
          <Field label="Nome *">
            <input
              value={editForm.nome || ''}
              onChange={e => onEditForm({ ...editForm, nome: e.target.value })}
              placeholder="Nome da igreja"
              style={fieldInput}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Denominação">
              <select
                value={editForm.denominacao || DENOM_PADRAO}
                onChange={e => onEditForm({ ...editForm, denominacao: e.target.value })}
                style={fieldInput}
              >
                {(denominacoes.length ? denominacoes : [DENOM_PADRAO, 'Batista', 'Universal', 'Quadrangular', 'Outra']).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="Instagram / rede (opcional)">
              <input
                value={editForm.instagram || ''}
                onChange={e => onEditForm({ ...editForm, instagram: e.target.value })}
                placeholder="@igreja ou link"
                style={fieldInput}
              />
            </Field>
          </div>
          <Field label="Endereço">
            <IgrejaFormEndereco
              form={editForm}
              onChange={onEditForm}
              setoresOpcoes={setoresOpcoes}
              compact
              igrejaId={ig?.id}
            />
            {onCorrigirGps && editForm.endereco && (
              <button
                type="button"
                onClick={() => onCorrigirGps(ig.id, editForm.endereco)}
                className="mt-1.5 flex items-center gap-1 rounded-lg px-2 py-1 font-bold"
                style={{ fontSize: 10, background: 'rgba(59,130,246,0.15)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.3)' }}
              >
                Corrigir GPS pelo endereço
              </button>
            )}
            {/* Aviso sobre o Pin Arrastável */}
            <div
              className="mt-3 flex items-start gap-2 rounded-lg p-2.5"
              style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)' }}
            >
              <span className="text-base leading-none">📍</span>
                <p className="text-xs text-yellow-800 dark:text-yellow-400 m-0 leading-snug">
                <b>O endereço está certo, mas o mapa errou?</b><br />
                Arraste o pin desta igreja diretamente no mapa e solte no local exato. Ele será salvo automaticamente.
                <br />
                <span style={{ opacity: 0.85 }}>Ou use o botão azul <b>GPS</b> no mapa para recalcular todas de uma vez.</span>
              </p>
            </div>
          </Field>
        </>
      )}

      {!fichaCompleta && (
        <Field label="Setor / bairro">
          <select
            value={editForm.setor || ''}
            onChange={e => onEditForm({ ...editForm, setor: e.target.value, bairro: e.target.value })}
            style={fieldInput}
          >
            <option value="">Selecione…</option>
            {editForm.setor && !setoresOpcoes.includes(editForm.setor) && (
              <option value={editForm.setor}>{editForm.setor}</option>
            )}
            {setoresOpcoes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      )}

      <Field label="Horários de culto">
        <CultoHorariosEditor
          compact={compact}
          value={editForm.culto || ''}
          onChange={c => onEditForm({ ...editForm, culto: c })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Telefone">
          <input
            value={editForm.telefone || ''}
            onChange={e => onEditForm({ ...editForm, telefone: e.target.value })}
            placeholder="(47) 99999-9999"
            style={fieldInput}
          />
        </Field>
        <Field label="WhatsApp">
          <input
            value={editForm.whatsapp || ''}
            onChange={e => onEditForm({ ...editForm, whatsapp: e.target.value })}
            placeholder="(47) 99999-9999"
            style={fieldInput}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {['pastor1', 'esposa1', 'pastor2', 'esposa2'].map((key, i) => (
          <Field key={key} label={['1º Pastor', 'Esposa', '2º Pastor', 'Esposa'][i]}>
            <input
              value={editForm[key] || ''}
              onChange={e => onEditForm({ ...editForm, [key]: e.target.value })}
              style={fieldInput}
            />
          </Field>
        ))}
      </div>

      <FormAlert type="err">{editErro}</FormAlert>
      <FormAlert type="ok">{editOk}</FormAlert>

      <div className="flex gap-1.5 pt-0.5 sticky bottom-0 z-10 pb-0.5"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent)' }}>
        <button
          type="button"
          onClick={() => onSalvar(ig.id)}
          className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-lg font-bold"
          style={{ fontSize: 11, background: 'linear-gradient(135deg,#f0d48a,#a8842e)', color: '#1a1408' }}
        >
          <Save size={11} /> Salvar alterações
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="px-3 rounded-lg font-bold flex items-center justify-center"
            style={{ fontSize: 11, color: 'var(--text-faint)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <X size={12} />
          </button>
        )}
        {showExcluir && onRemover && (
          <button
            type="button"
            onClick={e => onRemover(ig.id, e)}
            className="px-3 rounded-lg font-bold"
            style={{ fontSize: 10, color: '#fca5a5' }}
          >
            Excluir
          </button>
        )}
      </div>
    </div>
  )
}
