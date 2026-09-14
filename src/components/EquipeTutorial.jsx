import { useState } from 'react'
import {
  BookOpen, Plus, Users, X, Phone, Mail, MapPin, Fuel,
  UserCheck, DollarSign, FileText, SlidersHorizontal, ChevronRight,
  CheckCircle2, Lightbulb, ArrowRight,
} from 'lucide-react'
import { CARGOS, CARGO_CORES } from '../utils/equipeSync'

const VINCULOS = ['Voluntário', 'CLT', 'PJ', 'Autônomo', 'Estagiário', 'Comissionado', 'Outro']

function TelaSistema({ titulo, children, destaque }) {
  return (
    <div className="relative rounded-2xl overflow-hidden"
      style={{
        border: destaque ? '2px solid rgba(91,155,255,0.55)' : '1px solid var(--border-subtle)',
        boxShadow: destaque ? '0 0 0 4px rgba(91,155,255,0.12), 0 12px 40px rgba(0,0,0,0.35)' : '0 8px 32px rgba(0,0,0,0.25)',
      }}>
      <div className="flex items-center gap-2 px-3 py-2"
        style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex gap-1">
          {['#f87171', '#fbbf24', '#34d399'].map(c => (
            <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
          ))}
        </div>
        <span className="flex-1 text-center truncate" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
          {titulo || 'campanha.space — Equipe'}
        </span>
      </div>
      {children}
      {destaque && (
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-lg font-bold"
          style={{ fontSize: 9, background: 'rgba(91,155,255,0.9)', color: '#fff' }}>
          Tela do sistema
        </div>
      )}
    </div>
  )
}

function CampoDestaque({ numero, titulo, obrigatorio, children, dica, ondeUsa }) {
  return (
    <div id={`campo-${numero}`} className="scroll-mt-28">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e40af)', color: '#fff', fontSize: 13 }}>
          {numero}
        </div>
        <div>
          <h3 className="font-bold text-white flex items-center gap-2" style={{ fontSize: 16 }}>
            {titulo}
            {obrigatorio && (
              <span className="px-1.5 py-0.5 rounded-md font-bold"
                style={{ fontSize: 9, background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                Obrigatório
              </span>
            )}
          </h3>
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <div>{children}</div>
        <div className="space-y-3">
          {dica && (
            <div className="rounded-2xl p-4" style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(91,155,255,0.2)' }}>
              <p className="font-bold flex items-center gap-2 mb-2" style={{ fontSize: 12, color: 'var(--accent-bright)' }}>
                <Lightbulb size={14} /> Como preencher
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{dica}</p>
            </div>
          )}
          {ondeUsa && (
            <div className="rounded-2xl p-4" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
              <p className="font-bold mb-2" style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Onde isso aparece no sistema
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{ondeUsa}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MockInput({ label, value, placeholder, tipo = 'text', highlight }) {
  return (
    <div>
      {label && (
        <label className="block font-semibold mb-1.5"
          style={{ fontSize: 11, color: highlight ? 'var(--accent-bright)' : 'var(--text-tertiary)' }}>
          {label}
        </label>
      )}
      <div className="w-full px-3 py-2 rounded-xl"
        style={{
          fontSize: 13,
          background: 'var(--bg-raised)',
          border: highlight ? '2px solid rgba(91,155,255,0.6)' : '1.5px solid rgba(255,255,255,0.12)',
          color: value ? 'var(--text-primary)' : 'var(--text-faint)',
          minHeight: 38,
        }}>
        {value || placeholder}
      </div>
    </div>
  )
}

function MockSelect({ label, value, highlight }) {
  return (
    <div>
      <label className="block font-semibold mb-1.5"
        style={{ fontSize: 11, color: highlight ? 'var(--accent-bright)' : 'var(--text-tertiary)' }}>
        {label}
      </label>
      <div className="w-full px-3 py-2 rounded-xl flex items-center justify-between"
        style={{
          fontSize: 13,
          background: 'var(--bg-raised)',
          border: highlight ? '2px solid rgba(91,155,255,0.6)' : '1.5px solid rgba(255,255,255,0.12)',
          color: 'var(--text-primary)',
        }}>
        <span>{value}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: 'var(--text-tertiary)' }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}

function MockModalHeader({ titulo = 'Novo Membro' }) {
  return (
    <div className="flex items-center justify-between px-5 py-3"
      style={{ background: 'linear-gradient(135deg,#1e3a8a,#1e40af)' }}>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.18)' }}>
          <Users size={15} className="text-white" />
        </div>
        <span className="font-bold text-white" style={{ fontSize: 14 }}>{titulo}</span>
      </div>
      <div className="p-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.15)' }}>
        <X size={14} className="text-white" />
      </div>
    </div>
  )
}

const PASSOS = [
  { id: 'inicio', label: 'Como começar' },
  { id: 'campo-1', label: 'Foto' },
  { id: 'campo-2', label: 'Nome' },
  { id: 'campo-3', label: 'Cargo' },
  { id: 'campo-4', label: 'Indicação' },
  { id: 'campo-5', label: 'Telefone e E-mail' },
  { id: 'campo-6', label: 'Bairros' },
  { id: 'campo-7', label: 'Vínculo' },
  { id: 'campo-8', label: 'Combustível' },
  { id: 'campo-9', label: 'Observações' },
  { id: 'campo-10', label: 'Salvar' },
]

export default function EquipeTutorial({ onAbrirNovo }) {
  const [passoAtivo, setPassoAtivo] = useState('inicio')

  function irPara(id) {
    setPassoAtivo(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6">

      {/* Índice lateral */}
      <aside className="lg:w-56 flex-shrink-0">
        <div className="lg:sticky lg:top-4 rounded-2xl p-4 space-y-1"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <p className="font-bold uppercase tracking-wider mb-3 px-2"
            style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            Índice do tutorial
          </p>
          {PASSOS.map(p => (
            <button key={p.id} type="button" onClick={() => irPara(p.id)}
              className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 transition-all"
              style={{
                fontSize: 12,
                background: passoAtivo === p.id ? 'rgba(37,99,235,0.15)' : 'transparent',
                color: passoAtivo === p.id ? 'var(--accent-bright)' : 'var(--text-secondary)',
                fontWeight: passoAtivo === p.id ? 600 : 400,
              }}>
              <ChevronRight size={12} style={{ opacity: passoAtivo === p.id ? 1 : 0.4 }} />
              {p.label}
            </button>
          ))}
          {onAbrirNovo && (
            <button type="button" onClick={onAbrirNovo}
              className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-white"
              style={{ fontSize: 12, background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)' }}>
              <Plus size={14} /> Abrir formulário
            </button>
          )}
        </div>
      </aside>

      {/* Conteúdo */}
      <div className="flex-1 space-y-10 min-w-0">

        {/* Intro */}
        <section className="rounded-3xl p-6 md:p-8"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e40af)' }}>
              <BookOpen size={22} className="text-white" />
            </div>
            <div>
              <h2 className="font-black text-white" style={{ fontSize: 20 }}>Tutorial: Cadastrar um membro</h2>
              <p className="mt-1" style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Guia passo a passo com telas reais do sistema. Aprenda a preencher cada campo do formulário
                <strong style={{ color: 'var(--text-primary)' }}> Novo Membro</strong> e entenda como os dados
                são usados na equipe, nas rotas e na previsão de gastos.
              </p>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3 mt-5">
            {[
              { n: '1', t: 'Abra o formulário', d: 'Botão "Adicionar Membro" no topo' },
              { n: '2', t: 'Preencha os campos', d: 'Só o nome é obrigatório' },
              { n: '3', t: 'Clique em Salvar', d: 'O membro entra na pirâmide' },
            ].map(s => (
              <div key={s.n} className="rounded-2xl p-4" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
                <p className="font-black" style={{ fontSize: 22, color: 'var(--accent-bright)' }}>{s.n}</p>
                <p className="font-bold text-white mt-1" style={{ fontSize: 13 }}>{s.t}</p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Passo 1: Como começar */}
        <section id="inicio" className="scroll-mt-28 rounded-3xl p-6 md:p-8 space-y-5"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <CampoDestaque
            numero="→"
            titulo="Passo 1 — Abrir o cadastro"
            dica="Na aba Equipe, clique no botão branco/azul «Adicionar Membro» no canto superior direito. O formulário abre em uma janela (modal) sobre a tela. Você também pode clicar em «Adicionar Primeiro Membro» quando a equipe estiver vazia."
            ondeUsa="Depois de salvar, o membro aparece nos cards da pirâmide organizacional, na busca global, nas rotas (aba Equipe) e no relatório."
          >
            <TelaSistema destaque titulo="campanha.space — Equipe">
              <div className="px-4 py-5" style={{ background: 'linear-gradient(135deg,#1e3a8a,#1d4ed8 60%,#1e40af)' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: 'rgba(255,255,255,0.18)' }}>
                      <Users size={20} className="text-white" />
                    </div>
                    <div>
                      <p className="font-black text-white" style={{ fontSize: 16 }}>Equipe</p>
                      <p style={{ fontSize: 10, color: '#bfdbfe' }}>0 membros cadastrados</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 rounded-2xl font-bold"
                    style={{
                      background: 'rgba(255,255,255,0.18)',
                      border: '2px solid rgba(91,155,255,0.8)',
                      color: '#fff',
                      fontSize: 11,
                      boxShadow: '0 0 0 3px rgba(91,155,255,0.25)',
                    }}>
                    <Plus size={13} /> Adicionar Membro
                    <ArrowRight size={12} className="ml-1 animate-pulse" />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  {['Membros', 'Tarefas', 'Log', 'Tutorial'].map((t, i) => (
                    <span key={t} className="px-3 py-1.5 rounded-xl font-semibold"
                      style={{
                        fontSize: 10,
                        background: i === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
                        color: i === 0 ? '#fff' : '#bfdbfe',
                        border: '1px solid rgba(255,255,255,0.12)',
                      }}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="p-6 text-center" style={{ background: 'var(--bg-base)' }}>
                <Users size={28} style={{ color: 'var(--text-faint)', margin: '0 auto' }} />
                <p className="font-bold mt-3" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Nenhum membro cadastrado
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  Clique em &quot;Adicionar Membro&quot; para cadastrar a equipe
                </p>
              </div>
            </TelaSistema>
          </CampoDestaque>
        </section>

        {/* Visão geral do modal */}
        <section className="rounded-3xl p-6 md:p-8"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <h3 className="font-bold text-white mb-4" style={{ fontSize: 16 }}>Visão geral do formulário</h3>
          <TelaSistema destaque titulo="Formulário — Novo Membro">
            <MockModalHeader />
            <div className="px-5 py-4 space-y-3" style={{ background: 'var(--bg-surface)', maxHeight: 280, overflow: 'hidden' }}>
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center font-black"
                  style={{ background: 'var(--bg-hover)', fontSize: 20, color: 'var(--text-tertiary)' }}>?</div>
              </div>
              <MockInput label="Nome *" placeholder="Nome completo" />
              <MockSelect label="Cargo" value="Voluntário" />
              <MockSelect label="Indicação" value="Sem indicação" />
              <div className="grid grid-cols-2 gap-2">
                <MockInput label="Telefone" placeholder="(47) 9xxxx-xxxx" />
                <MockInput label="E-mail" placeholder="email@exemplo.com" />
              </div>
              <MockInput label="Bairro / Setor de atuação" placeholder="Selecione os bairros..." />
            </div>
            <div className="px-5 py-3 flex gap-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div className="px-4 py-2 rounded-2xl" style={{ fontSize: 11, border: '1px solid var(--border-soft)', color: 'var(--text-secondary)' }}>
                Cancelar
              </div>
              <div className="flex-1 py-2 rounded-2xl text-center font-bold text-white"
                style={{ fontSize: 11, background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)' }}>
                Salvar
              </div>
            </div>
          </TelaSistema>
          <p className="mt-4" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            Role o formulário para ver todos os campos. Os blocos <strong style={{ color: 'var(--text-secondary)' }}>Vínculo &amp; Remuneração</strong> e <strong style={{ color: '#22d3ee' }}>Combustível</strong> ficam mais abaixo.
          </p>
        </section>

        {/* Campo 1: Foto */}
        <section className="rounded-3xl p-6 md:p-8"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <CampoDestaque
            numero={1}
            titulo="Foto do membro"
            dica="Clique no quadrado com «?» ou na foto para escolher uma imagem do celular ou computador. Formatos aceitos: JPG, PNG, etc. Se não enviar foto, o sistema mostra as iniciais do nome com uma cor automática. Depois de adicionar a foto, use «Ajustar posição» para centralizar o rosto no card."
            ondeUsa="A foto aparece no card do membro, na pirâmide da equipe, nos detalhes ao tocar no card e no avatar da busca global."
          >
            <TelaSistema titulo="Formulário — Foto">
              <MockModalHeader />
              <div className="px-5 py-6 flex flex-col items-center gap-3" style={{ background: 'var(--bg-surface)' }}>
                <div className="relative">
                  <div className="w-20 h-20 rounded-2xl flex items-center justify-center font-black"
                    style={{
                      background: 'var(--bg-hover)',
                      fontSize: 22,
                      color: 'var(--text-tertiary)',
                      border: '2px solid rgba(91,155,255,0.6)',
                      boxShadow: '0 0 0 4px rgba(91,155,255,0.15)',
                    }}>
                    MS
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg"
                  style={{ fontSize: 10, color: 'var(--accent-bright)', border: '1px solid rgba(91,155,255,0.25)' }}>
                  <SlidersHorizontal size={10} /> Ajustar posição
                </div>
                <p className="text-center" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                  Passe o mouse sobre a foto → aparece «Trocar»
                </p>
              </div>
            </TelaSistema>
          </CampoDestaque>
        </section>

        {/* Campo 2: Nome */}
        <section className="rounded-3xl p-6 md:p-8"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <CampoDestaque
            numero={2}
            titulo="Nome"
            obrigatorio
            dica="Digite o nome completo da pessoa. O sistema corrige automaticamente para Primeira Letra Maiúscula (ex.: «maria silva» vira «Maria Silva»). Sem o nome preenchido o botão Salvar fica desabilitado."
            ondeUsa="Nome principal em todos os lugares: cards, rotas, WhatsApp, relatório, indicações e log de atividade."
          >
            <TelaSistema titulo="Formulário — Nome">
              <MockModalHeader />
              <div className="px-5 py-4" style={{ background: 'var(--bg-surface)' }}>
                <MockInput label="Nome *" value="Maria Silva Santos" highlight />
              </div>
            </TelaSistema>
          </CampoDestaque>
        </section>

        {/* Campo 3: Cargo */}
        <section className="rounded-3xl p-6 md:p-8"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <CampoDestaque
            numero={3}
            titulo="Cargo"
            dica="Escolha o papel da pessoa na campanha. A ordem na pirâmide segue a hierarquia: Coordenador no topo, depois Administrativo, Comunicação, e assim por diante. O cargo também define em qual categoria da Previsão de Gastos o membro entra."
            ondeUsa="Define cor do card, posição na pirâmide, filtros por cargo, rotas e categoria de custo na Previsão de Gastos."
          >
            <TelaSistema titulo="Formulário — Cargo">
              <MockModalHeader />
              <div className="px-5 py-4 space-y-2" style={{ background: 'var(--bg-surface)' }}>
                <MockSelect label="Cargo" value="Administrativo" highlight />
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                  Na Previsão de Gastos: <strong style={{ color: 'var(--accent-bright)' }}>Administrativo</strong>
                </p>
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {CARGOS.slice(0, 6).map(c => (
                    <span key={c} className="px-2 py-0.5 rounded-full font-bold"
                      style={{ fontSize: 9, background: (CARGO_CORES[c] || '#6366f1') + '22', color: CARGO_CORES[c] || '#6366f1' }}>
                      {c}
                    </span>
                  ))}
                  <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>+ mais opções</span>
                </div>
              </div>
            </TelaSistema>
          </CampoDestaque>
        </section>

        {/* Campo 4: Indicação */}
        <section className="rounded-3xl p-6 md:p-8"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <CampoDestaque
            numero={4}
            titulo="Indicação"
            dica="Registre quem trouxe essa pessoa para a equipe. Você pode escolher um membro já cadastrado na lista, ou selecionar «Outra pessoa» e digitar o nome manualmente (útil quando quem indicou ainda não está no sistema). Deixe em «Sem indicação» se não houver."
            ondeUsa="Aparece no card («Indicação: …»), nos detalhes do membro e na busca global."
          >
            <TelaSistema titulo="Formulário — Indicação">
              <MockModalHeader />
              <div className="px-5 py-4 space-y-2" style={{ background: 'var(--bg-surface)' }}>
                <MockSelect label="Indicação" value="João Pereira — Coordenador" highlight />
                <p className="flex items-center gap-1" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                  <UserCheck size={10} /> Registre quem trouxe ou indicou este integrante
                </p>
              </div>
            </TelaSistema>
          </CampoDestaque>
        </section>

        {/* Campo 5: Telefone e Email */}
        <section className="rounded-3xl p-6 md:p-8"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <CampoDestaque
            numero={5}
            titulo="Telefone e E-mail"
            dica="Telefone: digite com DDD; o sistema formata sozinho no padrão (47) 99999-9999. E-mail: opcional, salvo em minúsculas. Com telefone cadastrado você pode enviar rotas pelo WhatsApp na aba Montar Rotas."
            ondeUsa="Telefone no card, detalhes, link WhatsApp nas rotas e busca. E-mail no perfil e busca global."
          >
            <TelaSistema titulo="Formulário — Contato">
              <MockModalHeader />
              <div className="px-5 py-4 grid grid-cols-2 gap-3" style={{ background: 'var(--bg-surface)' }}>
                <div>
                  <label className="block font-semibold mb-1.5 flex items-center gap-1"
                    style={{ fontSize: 11, color: 'var(--accent-bright)' }}>
                    <Phone size={10} /> Telefone
                  </label>
                  <div className="px-3 py-2 rounded-xl"
                    style={{ fontSize: 13, background: 'var(--bg-raised)', border: '2px solid rgba(91,155,255,0.6)' }}>
                    (47) 99999-8888
                  </div>
                </div>
                <div>
                  <label className="block font-semibold mb-1.5 flex items-center gap-1"
                    style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    <Mail size={10} /> E-mail
                  </label>
                  <div className="px-3 py-2 rounded-xl"
                    style={{ fontSize: 13, background: 'var(--bg-raised)', border: '1.5px solid rgba(255,255,255,0.12)' }}>
                    maria@email.com
                  </div>
                </div>
              </div>
            </TelaSistema>
          </CampoDestaque>
        </section>

        {/* Campo 6: Bairros */}
        <section className="rounded-3xl p-6 md:p-8"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <CampoDestaque
            numero={6}
            titulo="Bairro / Setor de atuação"
            dica="Clique no campo para abrir a lista de bairros de Blumenau. Você pode selecionar vários — marque cada bairro onde a pessoa atua. Use a busca no topo da lista para achar rápido. «Limpar seleção» remove todos. Esse dado é essencial para montar rotas por região."
            ondeUsa="Card do membro, filtros de busca, paradas na aba Equipe de Montar Rotas e entregas de materiais nos bairros da rota."
          >
            <TelaSistema titulo="Formulário — Bairros">
              <MockModalHeader />
              <div className="px-5 py-4 relative" style={{ background: 'var(--bg-surface)' }}>
                <label className="block font-semibold mb-1.5 flex items-center gap-1"
                  style={{ fontSize: 11, color: 'var(--accent-bright)' }}>
                  <MapPin size={10} /> Bairro / Setor de atuação
                </label>
                <div className="px-3 py-2 rounded-xl flex flex-wrap gap-1"
                  style={{ background: 'var(--bg-raised)', border: '2px solid rgba(91,155,255,0.6)', minHeight: 38 }}>
                  {['Centro', 'Garcia'].map(b => (
                    <span key={b} className="px-1.5 py-0.5 rounded-md font-medium"
                      style={{ fontSize: 10, background: 'rgba(37,99,235,0.18)', color: '#93c5fd' }}>{b}</span>
                  ))}
                </div>
                <div className="mt-2 rounded-xl overflow-hidden"
                  style={{ border: '1px solid rgba(255,255,255,0.12)', background: 'var(--bg-overlay)' }}>
                  <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', fontSize: 11, color: 'var(--text-faint)' }}>
                    Buscar bairro...
                  </div>
                  {['Centro', 'Garcia', 'Velha'].map((b, i) => (
                    <div key={b} className="flex items-center gap-2 px-3 py-1.5"
                      style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      <div className="w-3.5 h-3.5 rounded flex items-center justify-center"
                        style={{ background: i < 2 ? '#2563eb' : 'transparent', border: i < 2 ? '1.5px solid #2563eb' : '1.5px solid rgba(255,255,255,0.25)' }}>
                        {i < 2 && <CheckCircle2 size={8} className="text-white" />}
                      </div>
                      {b}
                    </div>
                  ))}
                  <div className="px-3 py-1.5" style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>2 selecionados</div>
                </div>
              </div>
            </TelaSistema>
          </CampoDestaque>
        </section>

        {/* Campo 7: Vínculo */}
        <section className="rounded-3xl p-6 md:p-8"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <CampoDestaque
            numero={7}
            titulo="Vínculo & Remuneração"
            dica="Bloco opcional para controle interno. Tipo de vínculo: Voluntário, CLT, PJ, etc. Remuneração: valor mensal em reais (use ponto para centavos, ex.: 2500.00). Data de início: quando a pessoa entrou. Nº do contrato: referência do documento, se houver."
            ondeUsa="Badge de vínculo no card, detalhes do membro, Previsão de Gastos (salário entra automaticamente na categoria do cargo) e relatório."
          >
            <TelaSistema titulo="Formulário — Vínculo">
              <MockModalHeader />
              <div className="px-5 py-4 rounded-2xl m-3 space-y-3"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="font-bold uppercase" style={{ fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>
                  Vínculo &amp; Remuneração
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <MockSelect label="Tipo de vínculo" value="CLT" highlight />
                  <div>
                    <label className="block font-semibold mb-1.5 flex items-center gap-1"
                      style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      <DollarSign size={10} /> Remuneração (R$)
                    </label>
                    <div className="px-3 py-2 rounded-xl" style={{ fontSize: 13, background: 'var(--bg-raised)', border: '1.5px solid rgba(255,255,255,0.12)' }}>
                      2500.00
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <MockInput label="Data de início" value="01/03/2026" />
                  <div>
                    <label className="block font-semibold mb-1.5 flex items-center gap-1"
                      style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      <FileText size={10} /> Nº do contrato
                    </label>
                    <div className="px-3 py-2 rounded-xl" style={{ fontSize: 12, background: 'var(--bg-raised)', border: '1.5px solid rgba(255,255,255,0.12)' }}>
                      CTR-2026-001
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {VINCULOS.map(v => (
                    <span key={v} className="px-2 py-0.5 rounded-full" style={{ fontSize: 8, background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>{v}</span>
                  ))}
                </div>
              </div>
            </TelaSistema>
          </CampoDestaque>
        </section>

        {/* Campo 8: Combustível */}
        <section className="rounded-3xl p-6 md:p-8"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <CampoDestaque
            numero={8}
            titulo="Combustível"
            dica="Ative «Vincular veículo» quando a campanha cede combustível para essa pessoa (geralmente motoristas). Informe o nome/modelo do carro e quantos litros são cedidos por mês. Os dados sincronizam automaticamente com a seção Combustível na Previsão de Gastos."
            ondeUsa="Badge «Combustível» no card, Previsão de Gastos → Combustível, e controle de custos de veículos da equipe."
          >
            <TelaSistema titulo="Formulário — Combustível">
              <MockModalHeader />
              <div className="px-5 py-4 m-3 rounded-2xl space-y-3"
                style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)' }}>
                <div className="flex items-center justify-between">
                  <p className="font-bold flex items-center gap-2" style={{ fontSize: 11, color: '#22d3ee' }}>
                    <Fuel size={13} /> Combustível
                  </p>
                  <span className="flex items-center gap-1" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                    <CheckCircle2 size={12} style={{ color: '#22d3ee' }} /> Vincular veículo
                  </span>
                </div>
                <MockInput label="Nome / modelo do veículo" value="Fiat Uno — Maria" highlight />
                <MockInput label="Litros cedidos" value="100" />
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                  Aparece em <strong style={{ color: '#22d3ee' }}>Combustível</strong> na Previsão de Gastos
                </p>
              </div>
            </TelaSistema>
          </CampoDestaque>
        </section>

        {/* Campo 9: Observações */}
        <section className="rounded-3xl p-6 md:p-8"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <CampoDestaque
            numero={9}
            titulo="Observações"
            dica="Campo livre para anotações: horário de disponibilidade, funções extras, restrições, lembretes internos. Não é obrigatório."
            ondeUsa="Visível ao editar o membro e nos detalhes do perfil."
          >
            <TelaSistema titulo="Formulário — Observações">
              <MockModalHeader />
              <div className="px-5 py-4" style={{ background: 'var(--bg-surface)' }}>
                <label className="block font-semibold mb-1.5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  Observações
                </label>
                <div className="px-3 py-2 rounded-xl" style={{
                  fontSize: 12,
                  background: 'var(--bg-raised)',
                  border: '2px solid rgba(91,155,255,0.6)',
                  color: 'var(--text-secondary)',
                  minHeight: 56,
                  lineHeight: 1.5,
                }}>
                  Disponível seg–sex, 8h–18h. Responsável pelo bairro Garcia.
                </div>
              </div>
            </TelaSistema>
          </CampoDestaque>
        </section>

        {/* Campo 10: Salvar */}
        <section id="campo-10" className="scroll-mt-28 rounded-3xl p-6 md:p-8"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <CampoDestaque
            numero={10}
            titulo="Salvar o membro"
            dica="Revise os dados e clique em «Salvar». O membro entra imediatamente na pirâmide da equipe, na posição correspondente ao cargo. Para alterar depois, clique no ícone de lápis no card ou abra os detalhes e use Editar. «Cancelar» fecha sem salvar."
            ondeUsa="Após salvar, use a busca e filtros por cargo para encontrar o membro. Ele também fica disponível para rotas e indicações de novos membros."
          >
            <TelaSistema destaque titulo="Formulário — Salvar">
              <MockModalHeader />
              <div className="px-5 py-3 flex gap-2" style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                <div className="px-5 py-2.5 rounded-2xl font-semibold"
                  style={{ fontSize: 12, border: '1px solid var(--border-soft)', color: 'var(--text-secondary)' }}>
                  Cancelar
                </div>
                <div className="flex-1 py-2.5 rounded-2xl text-center font-bold text-white"
                  style={{
                    fontSize: 12,
                    background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)',
                    border: '2px solid rgba(91,155,255,0.8)',
                    boxShadow: '0 0 0 3px rgba(91,155,255,0.2), 0 4px 14px rgba(79,70,229,0.35)',
                  }}>
                  Salvar
                </div>
              </div>
            </TelaSistema>
          </CampoDestaque>

          <div className="mt-8 rounded-2xl p-5 text-center"
            style={{ background: 'linear-gradient(135deg,rgba(37,99,235,0.12),rgba(30,64,175,0.08))', border: '1px solid rgba(91,155,255,0.25)' }}>
            <CheckCircle2 size={32} className="mx-auto mb-3" style={{ color: 'var(--accent-bright)' }} />
            <p className="font-bold text-white" style={{ fontSize: 15 }}>Pronto para cadastrar?</p>
            <p className="mt-2 mb-4" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Abra o formulário real e coloque em prática o que aprendeu.
            </p>
            {onAbrirNovo && (
              <button type="button" onClick={onAbrirNovo}
                className="inline-flex items-center gap-2 font-bold text-white px-6 py-3 rounded-2xl"
                style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)', fontSize: 14 }}>
                <Plus size={16} /> Adicionar Membro agora
              </button>
            )}
          </div>
        </section>

      </div>
    </div>
  )
}
