import { useMemo, useState } from 'react'
import { Church, Search, Plus, X, Check } from 'lucide-react'
import { BAIRROS_BLUMENAU } from '../utils/constants'
import { montarEnderecoIgreja } from '../utils/agendaLocal'
import { DENOMINACOES, SETORES } from '../constants/igrejasTheme'
import IgrejaFormEndereco from './IgrejaFormEndereco'
import { getAllIgrejasCatalog } from '../utils/igrejasCatalog'
import { addChurchFromForm } from '../utils/churchVisitMutations'

const SETORES_OPTS = [...Object.keys(SETORES), ...BAIRROS_BLUMENAU.filter(b => !SETORES[b])]

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Campo de igreja do membro: busca na base + cadastro rápido se não existir.
 */
export default function EquipeIgrejaCampo({
  igrejaId = null,
  igrejaNome = '',
  onChange,
}) {
  const [query, setQuery] = useState('')
  const [aberto, setAberto] = useState(false)
  const [novaAberta, setNovaAberta] = useState(false)
  const [tick, setTick] = useState(0)
  const [nova, setNova] = useState({
    nome: '', setor: '', denominacao: 'Assembleia de Deus', endereco: '',
    cep: '', logradouro: '', numero: '', bairro: '', cidade: 'Blumenau', uf: 'SC',
  })
  const [erroNova, setErroNova] = useState('')

  const catalog = useMemo(() => getAllIgrejasCatalog(), [tick])

  const selecionada = useMemo(() => {
    if (igrejaId != null) {
      const byId = catalog.find(i => i.id === igrejaId)
      if (byId) return byId
    }
    if (igrejaNome) return { id: igrejaId, nome: igrejaNome }
    return null
  }, [catalog, igrejaId, igrejaNome])

  const sugestoes = useMemo(() => {
    const q = norm(query)
    if (!q) return catalog.slice(0, 12)
    return catalog
      .filter(ig =>
        norm(ig.nome).includes(q)
        || norm(ig.setor).includes(q)
        || norm(ig.endereco).includes(q)
        || norm(ig.denominacao).includes(q)
      )
      .slice(0, 14)
  }, [catalog, query])

  function escolher(ig) {
    onChange?.({ igrejaId: ig.id, igrejaNome: ig.nome })
    setQuery('')
    setAberto(false)
    setNovaAberta(false)
  }

  function limpar() {
    onChange?.({ igrejaId: null, igrejaNome: '' })
    setQuery('')
  }

  function abrirNova() {
    setNova({
      nome: query.trim() || '',
      setor: '',
      denominacao: 'Assembleia de Deus',
      endereco: '',
      cep: '', logradouro: '', numero: '', bairro: '', cidade: 'Blumenau', uf: 'SC',
    })
    setErroNova('')
    setNovaAberta(true)
    setAberto(false)
  }

  async function salvarNova() {
    setErroNova('')
    try {
      const criada = await addChurchFromForm({
        ...nova,
        endereco: montarEnderecoIgreja(nova) || nova.endereco,
      })
      setTick(t => t + 1)
      escolher(criada)
      setNovaAberta(false)
    } catch (e) {
      setErroNova(e?.message || 'Não foi possível cadastrar a igreja')
    }
  }

  return (
    <div className="relative">
      <label className="block font-semibold mb-1.5"
        style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>
        Igreja
      </label>

      {selecionada?.nome ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: 'var(--bg-raised)', border: '1.5px solid var(--border-subtle)', minHeight: 38 }}>
          <Church size={14} style={{ color: 'var(--accent-bright)', flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate" style={{ fontSize: 13, color: 'var(--text-primary)' }}>
              {selecionada.nome}
            </p>
            {(selecionada.setor || selecionada.denominacao) && (
              <p className="truncate" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                {[selecionada.denominacao, selecionada.setor].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <button type="button" onClick={limpar} className="p-1 rounded-lg hov-srf"
            title="Remover igreja" style={{ color: 'var(--text-tertiary)' }}>
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-tertiary)' }} />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setAberto(true) }}
            onFocus={() => setAberto(true)}
            onBlur={() => setTimeout(() => setAberto(false), 180)}
            placeholder="Buscar igreja na base…"
            className="input-dark w-full px-3 py-2 pl-9"
            style={{ fontSize: 13 }}
          />
        </div>
      )}

      {aberto && !selecionada?.nome && (
        <div className="absolute z-50 left-0 right-0 mt-1 rounded-xl overflow-hidden"
          style={{
            background: 'var(--bg-overlay)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
          }}>
          <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
            {sugestoes.length === 0 ? (
              <p className="px-3 py-3 text-center" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                Nenhuma igreja encontrada
              </p>
            ) : sugestoes.map(ig => (
              <button
                key={ig.id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => escolher(ig)}
                className="w-full text-left px-3 py-2 hov-srf transition-colors"
              >
                <p className="font-semibold truncate" style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                  {ig.nome}
                </p>
                <p className="truncate" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                  {[ig.denominacao || 'Assembleia de Deus', ig.setor, ig.endereco].filter(Boolean).join(' · ')}
                </p>
              </button>
            ))}
          </div>
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={abrirNova}
            className="w-full flex items-center gap-2 px-3 py-2.5 font-semibold"
            style={{
              fontSize: 12,
              color: 'var(--accent-bright)',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(37,99,235,0.08)',
            }}
          >
            <Plus size={14} />
            {query.trim()
              ? `Cadastrar "${query.trim()}" na base`
              : 'Cadastrar nova igreja na base'}
          </button>
        </div>
      )}

      {novaAberta && (
        <div className="mt-2 rounded-xl p-3 space-y-2.5"
          style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(59,130,246,0.25)' }}>
          <p className="font-bold flex items-center gap-1.5" style={{ fontSize: 11, color: 'var(--accent-bright)' }}>
            <Plus size={12} /> Nova igreja na base do sistema
          </p>
          <input
            value={nova.nome}
            onChange={e => setNova(p => ({ ...p, nome: e.target.value }))}
            placeholder="Nome da igreja *"
            className="input-dark w-full px-3 py-2"
            style={{ fontSize: 13 }}
          />
          <select
            value={nova.denominacao}
            onChange={e => setNova(p => ({ ...p, denominacao: e.target.value }))}
            className="input-dark w-full px-2 py-2"
            style={{ fontSize: 12, background: 'var(--bg-raised)' }}
          >
            {DENOMINACOES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <IgrejaFormEndereco
            form={nova}
            onChange={setNova}
            setoresOpcoes={SETORES_OPTS}
            compact
          />
          {erroNova && (
            <p style={{ fontSize: 11, color: '#fbbf24' }}>{erroNova}</p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setNovaAberta(false)}
              className="flex-1 py-2 rounded-xl font-semibold"
              style={{ fontSize: 12, background: 'var(--bg-raised)', color: 'var(--text-secondary)' }}>
              Cancelar
            </button>
            <button type="button" onClick={salvarNova} disabled={!nova.nome.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl font-bold text-white"
              style={{
                fontSize: 12,
                background: 'linear-gradient(135deg,#1d4ed8,#1e40af)',
                opacity: nova.nome.trim() ? 1 : 0.45,
              }}>
              <Check size={13} /> Salvar na base
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
