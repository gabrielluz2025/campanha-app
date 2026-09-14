import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Plus, Trash2, Save, Loader2, ImagePlus, GripVertical, Eye, EyeOff, Crop,
  LayoutTemplate, Type, Palette, Image as ImageIcon, Shield, Columns2, Square, PanelTop, Share2,
} from 'lucide-react'
import {
  LAYOUTS, TIPOS_CAMPO, TIPOS_REDE, CATALOGO_CAMPOS, normalizeLeadFormConfig, newCustomField, newInteresse,
  newRedeSocial, compressImageFile, formatBytes, fotoHint,
} from '../utils/leadFormConfig'
import { getStoredTenantMeta } from '../lib/tenant'
import LeadFormPreview from './LeadFormPreview'
import ImagePositionEditor, { FramedCoverPhoto } from './ImagePositionEditor'

const LAYOUT_ICONS = {
  card: Square,
  hero: PanelTop,
  split: Columns2,
}

const CATALOGO_IDS_SET = new Set(CATALOGO_CAMPOS.map(c => c.id))

function isCampoCatalogo(c) {
  return !!(c?.catalogo || CATALOGO_IDS_SET.has(c?.id))
}

function isCampoFixo(c) {
  return c?.id === 'nome' || c?.id === 'telefone'
}

export default function LeadFormBuilder({ open, onClose, initialConfig, onSave }) {
  const [cfg, setCfg] = useState(() => normalizeLeadFormConfig(initialConfig))
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [aba, setAba] = useState('visual')
  const [ajuste, setAjuste] = useState(null)

  const campanhaNome = useMemo(
    () => getStoredTenantMeta()?.name || 'Sua campanha',
    [open],
  )

  useEffect(() => {
    if (open) {
      setCfg(normalizeLeadFormConfig(initialConfig))
      setErro('')
      setAba('visual')
      setAjuste(null)
    }
  }, [open, initialConfig])

  if (!open) return null

  function upd(key, value) {
    setCfg(prev => ({ ...prev, [key]: value }))
  }

  function updCampo(idx, patch) {
    setCfg(prev => {
      const campos = prev.campos.map((c, i) => (i === idx ? { ...c, ...patch } : c))
      return { ...prev, campos }
    })
  }

  function moverCampo(idx, dir) {
    setCfg(prev => {
      const campos = [...prev.campos]
      const j = idx + dir
      if (j < 0 || j >= campos.length) return prev
      ;[campos[idx], campos[j]] = [campos[j], campos[idx]]
      return { ...prev, campos }
    })
  }

  function removerCampo(idx) {
    setCfg(prev => {
      const c = prev.campos[idx]
      if (!c) return prev
      if (c.id === 'nome' || c.id === 'telefone') return prev
      if (c.catalogo || CATALOGO_IDS_SET.has(c.id)) {
        // Catálogo: só oculta, não apaga
        const campos = prev.campos.map((x, i) => (i === idx ? { ...x, ativo: false } : x))
        return { ...prev, campos }
      }
      return { ...prev, campos: prev.campos.filter((_, i) => i !== idx) }
    })
  }

  async function onFoto(e, key) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErro('')
    try {
      const isSplit = key === 'foto' && cfg.layout === 'split'
      const result = await compressImageFile(file, {
        maxW: key === 'logo' ? 480 : 1400,
        maxH: key === 'logo' ? 480 : 1400,
        maxBytes: key === 'logo' ? 180000 : isSplit ? 650000 : 480000,
        keepAlpha: key === 'logo',
      })
      setCfg(prev => ({
        ...prev,
        [key]: result.dataUrl,
        [`${key}Meta`]: {
          width: result.width,
          height: result.height,
          bytes: result.bytes,
          name: result.name,
        },
        [`${key}X`]: 50,
        [`${key}Y`]: 50,
        [`${key}Zoom`]: 100,
      }))
      setAjuste({ key, x: 50, y: 50, zoom: 100 })
    } catch (err) {
      setErro(err.message || 'Falha na imagem')
    }
  }

  function limparFoto(key) {
    setCfg(prev => ({
      ...prev,
      [key]: '',
      [`${key}Meta`]: null,
      [`${key}X`]: 50,
      [`${key}Y`]: 50,
      [`${key}Zoom`]: 100,
    }))
  }

  function abrirAjuste(key) {
    if (!cfg[key]) return
    setAjuste({
      key,
      x: cfg[`${key}X`] ?? 50,
      y: cfg[`${key}Y`] ?? 50,
      zoom: cfg[`${key}Zoom`] ?? 100,
    })
  }

  function confirmarAjuste({ x, y, zoom }) {
    if (!ajuste) return
    setCfg(prev => ({
      ...prev,
      [`${ajuste.key}X`]: x,
      [`${ajuste.key}Y`]: y,
      [`${ajuste.key}Zoom`]: zoom,
    }))
    setAjuste(null)
  }

  async function salvar() {
    setBusy(true)
    setErro('')
    try {
      await onSave(normalizeLeadFormConfig(cfg))
      onClose()
    } catch (e) {
      setErro(e.message || 'Falha ao salvar')
    } finally {
      setBusy(false)
    }
  }

  const tabs = [
    { id: 'visual', label: 'Visual' },
    { id: 'campos', label: 'Campos' },
    { id: 'interesses', label: 'Interesses' },
    { id: 'previa', label: 'Prévia', mobileOnly: true },
  ]

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-5"
      style={{ zIndex: 10060, background: 'rgba(2,6,23,0.78)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-6xl max-h-[94vh] overflow-hidden flex flex-col rounded-t-2xl sm:rounded-2xl"
        style={{
          background: 'linear-gradient(180deg, #0f172a 0%, #0b1220 100%)',
          border: '1px solid rgba(148,163,184,0.14)',
          boxShadow: '0 32px 100px rgba(0,0,0,0.55)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="px-5 sm:px-6 py-4 flex items-center justify-between flex-shrink-0 gap-3"
          style={{ borderBottom: '1px solid rgba(148,163,184,0.1)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', boxShadow: '0 8px 20px rgba(37,99,235,0.35)' }}
            >
              <LayoutTemplate size={18} color="#fff" />
            </span>
            <div className="min-w-0">
              <p className="font-bold text-white text-[15px] leading-tight truncate">Formulário público</p>
              <p className="text-[11px] mt-0.5 truncate" style={{ color: '#64748b' }}>
                Personalize layout, textos e mídia · prévia em tempo real
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl flex-shrink-0"
            style={{ color: '#94a3b8', background: 'rgba(255,255,255,0.04)' }}
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 sm:px-6 pt-3 flex-shrink-0">
          <div
            className="inline-flex p-1 rounded-xl gap-0.5 flex-wrap"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148,163,184,0.1)' }}
          >
            {tabs.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setAba(t.id)}
                className={`px-3.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${t.mobileOnly ? 'md:hidden' : ''}`}
                style={{
                  background: aba === t.id ? 'rgba(37,99,235,0.9)' : 'transparent',
                  color: aba === t.id ? '#fff' : '#94a3b8',
                  boxShadow: aba === t.id ? '0 4px 12px rgba(37,99,235,0.35)' : undefined,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex min-h-0 mt-3">
          <div
            className={`flex-1 overflow-y-auto px-5 sm:px-6 pb-5 space-y-4 ${aba === 'previa' ? 'hidden md:block' : ''}`}
          >
            {aba === 'visual' && (
              <>
                <Section icon={LayoutTemplate} title="Layout" hint="Como a página pública aparece">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {LAYOUTS.map(l => {
                      const Icon = LAYOUT_ICONS[l.id] || Square
                      const active = cfg.layout === l.id
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => upd('layout', l.id)}
                          className="text-left rounded-xl p-3 transition-all"
                          style={{
                            border: `1px solid ${active ? 'rgba(96,165,250,0.55)' : 'rgba(148,163,184,0.12)'}`,
                            background: active ? 'rgba(37,99,235,0.14)' : 'rgba(255,255,255,0.02)',
                            boxShadow: active ? '0 0 0 1px rgba(59,130,246,0.2)' : undefined,
                          }}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className="w-8 h-8 rounded-lg flex items-center justify-center"
                              style={{
                                background: active ? 'rgba(37,99,235,0.35)' : 'rgba(255,255,255,0.05)',
                                color: active ? '#93c5fd' : '#64748b',
                              }}
                            >
                              <Icon size={15} />
                            </span>
                            <p className="text-[12px] font-bold text-white leading-tight">{l.label}</p>
                          </div>
                          <LayoutThumb id={l.id} active={active} accent={cfg.corAcento} primary={cfg.corPrimaria} />
                          <p className="text-[10px] mt-2 leading-snug" style={{ color: '#64748b' }}>{l.desc}</p>
                        </button>
                      )
                    })}
                  </div>
                </Section>

                <Section icon={Type} title="Textos do formulário" hint="Título, subtítulo e botão">
                  <div className="space-y-3">
                    <Field label="Slogan">
                      <input className={inp} value={cfg.slogan} onChange={e => upd('slogan', e.target.value)} />
                    </Field>
                    <Field label="Título do formulário">
                      <input className={inp} value={cfg.titulo} onChange={e => upd('titulo', e.target.value)} />
                    </Field>
                    <Field label="Subtítulo">
                      <textarea className={inp} rows={2} value={cfg.subtitulo} onChange={e => upd('subtitulo', e.target.value)} />
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Faixa de valores">
                        <input className={inp} value={cfg.valores} onChange={e => upd('valores', e.target.value)} />
                      </Field>
                      <Field label="Texto do botão">
                        <input className={inp} value={cfg.cta} onChange={e => upd('cta', e.target.value)} />
                      </Field>
                    </div>
                  </div>
                </Section>

                {cfg.layout === 'split' && (
                  <Section icon={Columns2} title="Identidade do cartaz" hint="Textos sobre a foto">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Field label="Cargo">
                        <input className={inp} value={cfg.cargo || ''} onChange={e => upd('cargo', e.target.value)}
                          placeholder="Deputado Federal" />
                      </Field>
                      <Field label="Nome no cartaz">
                        <input className={inp} value={cfg.nomeCandidato || ''} onChange={e => upd('nomeCandidato', e.target.value)}
                          placeholder="Seu nome" />
                      </Field>
                      <Field label="Partido">
                        <input className={inp} value={cfg.partido || ''} onChange={e => upd('partido', e.target.value)}
                          placeholder="PL" />
                      </Field>
                    </div>
                    <Field label="Pilares (uma linha cada, até 3)">
                      <textarea className={inp} rows={3} value={cfg.posterPilares || ''}
                        onChange={e => upd('posterPilares', e.target.value)}
                        placeholder={'Trabalho por quem mais precisa\nCompromisso com o desenvolvimento\nFé, família e liberdade'} />
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Frase da faixa inferior">
                        <input className={inp} value={cfg.posterRodape || ''} onChange={e => upd('posterRodape', e.target.value)}
                          placeholder="Juntos por um Brasil melhor" />
                      </Field>
                      <Field label="Texto @ (opcional)">
                        <input className={inp} value={cfg.redesHandle || ''} onChange={e => upd('redesHandle', e.target.value)}
                          placeholder="@sua.campanha" />
                      </Field>
                    </div>
                  </Section>
                )}

                {cfg.layout === 'split' && (
                  <Section icon={Share2} title="Redes sociais" hint="Links dos ícones no rodapé — a pessoa clica e abre">
                    <div className="space-y-2.5">
                      {(cfg.redesSociais || []).map((rede, idx) => {
                        const meta = TIPOS_REDE.find(t => t.id === rede.tipo) || TIPOS_REDE[TIPOS_REDE.length - 1]
                        return (
                          <div
                            key={rede.id}
                            className="rounded-xl p-2.5 space-y-2"
                            style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(148,163,184,0.1)' }}
                          >
                            <div className="flex items-center gap-2">
                              <select
                                className={inp}
                                value={rede.tipo}
                                onChange={e => setCfg(p => ({
                                  ...p,
                                  redesSociais: (p.redesSociais || []).map((r, i) =>
                                    i === idx ? { ...r, tipo: e.target.value } : r,
                                  ),
                                }))}
                                style={{ maxWidth: 160 }}
                              >
                                {TIPOS_REDE.map(t => (
                                  <option key={t.id} value={t.id}>{t.label}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="p-2 rounded-lg flex-shrink-0"
                                style={{ background: 'rgba(248,113,113,0.1)' }}
                                title="Remover"
                                onClick={() => setCfg(p => ({
                                  ...p,
                                  redesSociais: (p.redesSociais || []).filter((_, i) => i !== idx),
                                }))}
                              >
                                <Trash2 size={14} style={{ color: '#f87171' }} />
                              </button>
                            </div>
                            <input
                              className={inp}
                              value={rede.url || ''}
                              onChange={e => setCfg(p => ({
                                ...p,
                                redesSociais: (p.redesSociais || []).map((r, i) =>
                                  i === idx ? { ...r, url: e.target.value } : r,
                                ),
                              }))}
                              placeholder={meta.placeholder}
                            />
                          </div>
                        )
                      })}

                      {(cfg.redesSociais || []).length < 12 && (
                        <button
                          type="button"
                          onClick={() => setCfg(p => {
                            const used = new Set((p.redesSociais || []).map(r => r.tipo))
                            const nextTipo = TIPOS_REDE.find(t => !used.has(t.id))?.id || 'site'
                            return {
                              ...p,
                              redesSociais: [...(p.redesSociais || []), newRedeSocial(nextTipo)],
                            }
                          })}
                          className="flex items-center gap-2 text-[11px] font-bold px-3.5 py-2.5 rounded-xl w-full justify-center"
                          style={{ color: '#93c5fd', background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(59,130,246,0.2)' }}
                        >
                          <Plus size={14} /> Adicionar rede social
                        </button>
                      )}

                      <p className="text-[10px]" style={{ color: '#64748b' }}>
                        Instagram, Facebook, YouTube, TikTok, X, LinkedIn, Telegram e mais. Só entram no rodapé as que tiverem link.
                      </p>
                    </div>
                  </Section>
                )}

                <Section icon={Palette} title="Cores" hint="Fundo, botão e textos do cartaz">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <ColorField label="Fundo" value={cfg.corPrimaria} onChange={v => upd('corPrimaria', v)} />
                    <ColorField label="Botão / acento" value={cfg.corAcento} onChange={v => upd('corAcento', v)} />
                    <ColorField label="Valores (faixa)" value={cfg.corDestaque} onChange={v => upd('corDestaque', v)} />
                    <ColorField label="Textos do cartaz" value={cfg.corTexto || '#ffffff'} onChange={v => upd('corTexto', v)} />
                    <ColorField label="Destaque do slogan" value={cfg.corSloganDestaque || '#4ade80'} onChange={v => upd('corSloganDestaque', v)} />
                  </div>
                </Section>

                <Section icon={ImageIcon} title="Mídia" hint="Foto do painel e logo">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <ImageSlot
                      label="Foto do cartaz"
                      hint={fotoHint(cfg.layout, 'foto')}
                      src={cfg.foto}
                      meta={cfg.fotoMeta}
                      posX={cfg.fotoX}
                      posY={cfg.fotoY}
                      zoom={cfg.fotoZoom}
                      fit="cover"
                      onPick={e => onFoto(e, 'foto')}
                      onClear={() => limparFoto('foto')}
                      onAdjust={() => abrirAjuste('foto')}
                    />
                    <ImageSlot
                      label="Logo (opcional)"
                      hint={fotoHint(cfg.layout, 'logo')}
                      src={cfg.logo}
                      meta={cfg.logoMeta}
                      posX={cfg.logoX}
                      posY={cfg.logoY}
                      zoom={cfg.logoZoom}
                      fit="contain"
                      onPick={e => onFoto(e, 'logo')}
                      onClear={() => limparFoto('logo')}
                      onAdjust={() => abrirAjuste('logo')}
                    />
                  </div>
                  {(cfg.layout === 'hero' || cfg.layout === 'split') && !cfg.foto && (
                    <p
                      className="text-[11px] rounded-xl px-3 py-2.5 mt-1"
                      style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.15)' }}
                    >
                      {cfg.layout === 'split'
                        ? <>Carregue a foto — ela preenche o painel e os textos ficam por cima.</>
                        : <>Este layout precisa da foto principal. Carregue e use Enquadrar.</>}
                    </p>
                  )}
                </Section>

                <Section icon={Shield} title="Privacidade" hint="Consentimento LGPD">
                  <label className="flex items-center gap-2.5 text-[12px] cursor-pointer" style={{ color: '#cbd5e1' }}>
                    <input
                      type="checkbox"
                      checked={cfg.mostrarLgpd}
                      onChange={e => upd('mostrarLgpd', e.target.checked)}
                      style={{ accentColor: '#2563eb' }}
                    />
                    Exibir checkbox de consentimento LGPD
                  </label>
                  {cfg.mostrarLgpd && (
                    <Field label="Texto LGPD">
                      <textarea className={inp} rows={2} value={cfg.textoLgpd} onChange={e => upd('textoLgpd', e.target.value)} />
                    </Field>
                  )}
                </Section>
              </>
            )}

            {aba === 'campos' && (
              <>
                <p
                  className="text-[11px] leading-relaxed rounded-xl px-3 py-2.5"
                  style={{ background: 'rgba(255,255,255,0.03)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.1)' }}
                >
                  Campos do cadastro de membro/apoiador já vêm prontos — ligue os que quiser, ordene e, se precisar, crie campos extras.
                  Nome e WhatsApp ficam sempre ativos (anti-duplicata).
                </p>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#64748b' }}>
                    Campos do cadastro
                  </p>
                  <span className="text-[10px]" style={{ color: '#475569' }}>
                    {cfg.campos.filter(c => isCampoCatalogo(c) && c.ativo).length}/{cfg.campos.filter(isCampoCatalogo).length} ativos
                  </span>
                </div>

                {cfg.campos.map((c, idx) => {
                  if (!isCampoCatalogo(c)) return null
                  const fixo = isCampoFixo(c)
                  return (
                    <div
                      key={c.id}
                      className="rounded-xl p-3.5 space-y-2.5"
                      style={{
                        background: c.ativo ? 'rgba(37,99,235,0.08)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${c.ativo ? 'rgba(59,130,246,0.25)' : 'rgba(148,163,184,0.1)'}`,
                        opacity: c.ativo ? 1 : 0.72,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical size={14} style={{ color: '#475569' }} />
                        <div className="flex-1 min-w-0">
                          <input
                            className={inp}
                            value={c.label}
                            onChange={e => updCampo(idx, { label: e.target.value })}
                          />
                          <p className="text-[10px] mt-1 truncate" style={{ color: '#475569' }}>
                            id: {c.id} · cadastro de membro
                          </p>
                        </div>
                        <label
                          className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-1.5 rounded-lg cursor-pointer whitespace-nowrap"
                          style={{
                            background: c.ativo ? 'rgba(22,163,74,0.18)' : 'rgba(255,255,255,0.04)',
                            color: c.ativo ? '#86efac' : '#94a3b8',
                          }}
                          title={fixo ? 'Sempre ativo' : (c.ativo ? 'Ocultar no formulário' : 'Exibir no formulário')}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={!!c.ativo}
                            disabled={fixo}
                            onChange={() => {
                              if (fixo) return
                              updCampo(idx, { ativo: !c.ativo })
                            }}
                          />
                          {c.ativo ? 'Ativo' : 'Off'}
                        </label>
                        <button type="button" className="px-2 py-1 rounded-lg text-[10px] font-bold" style={{ color: '#64748b', background: 'rgba(255,255,255,0.04)' }}
                          onClick={() => moverCampo(idx, -1)}>↑</button>
                        <button type="button" className="px-2 py-1 rounded-lg text-[10px] font-bold" style={{ color: '#64748b', background: 'rgba(255,255,255,0.04)' }}
                          onClick={() => moverCampo(idx, 1)}>↓</button>
                      </div>
                      {c.ativo && (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              className={inp}
                              value={c.tipo}
                              disabled={fixo || c.id === 'cidade' || c.id === 'bairro' || c.id === 'cep' || c.id === 'data_nascimento'}
                              onChange={e => updCampo(idx, { tipo: e.target.value })}
                            >
                              {TIPOS_CAMPO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                            </select>
                            <input className={inp} placeholder="Placeholder" value={c.placeholder || ''}
                              onChange={e => updCampo(idx, { placeholder: e.target.value })} />
                          </div>
                          <label className="flex items-center gap-2 text-[11px]" style={{ color: '#94a3b8' }}>
                            <input type="checkbox" checked={!!c.obrigatorio}
                              disabled={fixo}
                              onChange={e => updCampo(idx, { obrigatorio: e.target.checked })}
                              style={{ accentColor: '#2563eb' }} />
                            Obrigatório
                          </label>
                        </>
                      )}
                    </div>
                  )
                })}

                <div className="flex items-center justify-between gap-2 pt-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#64748b' }}>
                    Campos extras (manuais)
                  </p>
                </div>

                {cfg.campos.every(c => isCampoCatalogo(c)) && (
                  <p className="text-[11px]" style={{ color: '#64748b' }}>
                    Nenhum campo extra ainda. Use o botão abaixo se precisar de algo além do cadastro padrão.
                  </p>
                )}

                {cfg.campos.map((c, idx) => {
                  if (isCampoCatalogo(c)) return null
                  return (
                    <div
                      key={c.id}
                      className="rounded-xl p-3.5 space-y-2.5"
                      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(148,163,184,0.1)' }}
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical size={14} style={{ color: '#475569' }} />
                        <input className={inp} value={c.label} onChange={e => updCampo(idx, { label: e.target.value })} />
                        <button
                          type="button"
                          className="p-1.5 rounded-lg"
                          title={c.ativo ? 'Ocultar' : 'Mostrar'}
                          style={{ background: 'rgba(255,255,255,0.04)' }}
                          onClick={() => updCampo(idx, { ativo: !c.ativo })}
                        >
                          {c.ativo ? <Eye size={14} style={{ color: '#94a3b8' }} /> : <EyeOff size={14} style={{ color: '#f87171' }} />}
                        </button>
                        <button type="button" className="px-2 py-1 rounded-lg text-[10px] font-bold" style={{ color: '#64748b', background: 'rgba(255,255,255,0.04)' }}
                          onClick={() => moverCampo(idx, -1)}>↑</button>
                        <button type="button" className="px-2 py-1 rounded-lg text-[10px] font-bold" style={{ color: '#64748b', background: 'rgba(255,255,255,0.04)' }}
                          onClick={() => moverCampo(idx, 1)}>↓</button>
                        <button type="button" className="p-1.5 rounded-lg" style={{ background: 'rgba(248,113,113,0.1)' }}
                          onClick={() => removerCampo(idx)}>
                          <Trash2 size={14} style={{ color: '#f87171' }} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select className={inp} value={c.tipo}
                          onChange={e => updCampo(idx, { tipo: e.target.value })}>
                          {TIPOS_CAMPO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                        <input className={inp} placeholder="Placeholder" value={c.placeholder || ''}
                          onChange={e => updCampo(idx, { placeholder: e.target.value })} />
                      </div>
                      <label className="flex items-center gap-2 text-[11px]" style={{ color: '#94a3b8' }}>
                        <input type="checkbox" checked={!!c.obrigatorio}
                          onChange={e => updCampo(idx, { obrigatorio: e.target.checked })}
                          style={{ accentColor: '#2563eb' }} />
                        Obrigatório
                      </label>
                      {c.tipo === 'select' && (
                        <Field label="Opções (uma por linha)">
                          <textarea className={inp} rows={3}
                            value={(c.opcoes || []).join('\n')}
                            onChange={e => updCampo(idx, { opcoes: e.target.value.split('\n').map(x => x.trim()).filter(Boolean) })} />
                        </Field>
                      )}
                    </div>
                  )
                })}

                <button type="button"
                  onClick={() => setCfg(p => ({ ...p, campos: [...p.campos, newCustomField()] }))}
                  className="flex items-center gap-2 text-[11px] font-bold px-3.5 py-2.5 rounded-xl"
                  style={{ color: '#93c5fd', background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(59,130,246,0.2)' }}>
                  <Plus size={14} /> Adicionar campo extra
                </button>
              </>
            )}

            {aba === 'interesses' && (
              <>
                <div className="rounded-xl p-3.5 space-y-2.5 mb-1"
                  style={{ background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.25)' }}>
                  <p className="text-[12px] font-bold" style={{ color: '#86efac' }}>Canal do WhatsApp</p>
                  <p className="text-[10px] leading-relaxed" style={{ color: '#94a3b8' }}>
                    Quem marcar o interesse no canal recebe este link na tela de sucesso do formulário.
                    Cole o link do Canal (Compartilhar → Copiar link).
                  </p>
                  <Field label="Link do canal">
                    <input
                      className={inp}
                      value={cfg.whatsappCanalUrl || ''}
                      placeholder="https://www.whatsapp.com/channel/..."
                      onChange={e => upd('whatsappCanalUrl', e.target.value)}
                    />
                  </Field>
                  <Field label="Título do botão / seção">
                    <input
                      className={inp}
                      value={cfg.whatsappCanalTitulo || ''}
                      placeholder="Canal oficial no WhatsApp"
                      onChange={e => upd('whatsappCanalTitulo', e.target.value)}
                    />
                  </Field>
                  {!cfg.whatsappCanalUrl && (
                    <p className="text-[10px] font-semibold" style={{ color: '#fbbf24' }}>
                      Sem link cadastrado, o botão do canal não aparece após o cadastro.
                    </p>
                  )}
                </div>

                <Field label="Título da seção">
                  <input className={inp} value={cfg.secaoInteressesTitulo} onChange={e => upd('secaoInteressesTitulo', e.target.value)} />
                </Field>
                {cfg.interesses.map((it, idx) => (
                  <div key={it.id} className="flex items-center gap-2 rounded-xl p-2.5"
                    style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(148,163,184,0.1)' }}>
                    <input className={inp} value={it.label}
                      onChange={e => setCfg(p => ({
                        ...p,
                        interesses: p.interesses.map((x, i) => i === idx ? { ...x, label: e.target.value } : x),
                      }))} />
                    <label className="text-[10px] flex items-center gap-1 whitespace-nowrap" style={{ color: '#94a3b8' }}>
                      <input type="checkbox" checked={!!it.padrao}
                        onChange={e => setCfg(p => ({
                          ...p,
                          interesses: p.interesses.map((x, i) => i === idx ? { ...x, padrao: e.target.checked } : x),
                        }))}
                        style={{ accentColor: '#2563eb' }} />
                      Pré
                    </label>
                    <button type="button" className="p-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}
                      onClick={() => setCfg(p => ({
                        ...p,
                        interesses: p.interesses.map((x, i) => i === idx ? { ...x, ativo: !x.ativo } : x),
                      }))}>
                      {it.ativo !== false ? <Eye size={14} style={{ color: '#94a3b8' }} /> : <EyeOff size={14} style={{ color: '#f87171' }} />}
                    </button>
                    <button type="button" className="p-1.5 rounded-lg" style={{ background: 'rgba(248,113,113,0.1)' }}
                      onClick={() => setCfg(p => ({ ...p, interesses: p.interesses.filter((_, i) => i !== idx) }))}>
                      <Trash2 size={14} style={{ color: '#f87171' }} />
                    </button>
                  </div>
                ))}
                <button type="button"
                  onClick={() => setCfg(p => ({ ...p, interesses: [...p.interesses, newInteresse()] }))}
                  className="flex items-center gap-2 text-[11px] font-bold px-3.5 py-2.5 rounded-xl"
                  style={{ color: '#93c5fd', background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(59,130,246,0.2)' }}>
                  <Plus size={14} /> Adicionar interesse
                </button>
              </>
            )}

            {erro && <p className="text-[12px] font-semibold" style={{ color: '#f87171' }}>{erro}</p>}
          </div>

          <aside
            className={`
              overflow-y-auto flex-shrink-0
              ${aba === 'previa' ? 'flex flex-col w-full px-5 py-4' : 'hidden'}
              md:flex md:flex-col md:w-[360px] lg:w-[400px] md:border-l md:px-5 md:py-4
            `}
            style={{ borderColor: 'rgba(148,163,184,0.1)', background: 'rgba(0,0,0,0.18)' }}
          >
            <div className="flex items-center justify-between mb-3.5 flex-shrink-0">
              <div>
                <p className="text-[12px] font-bold text-white">Prévia ao vivo</p>
                <p className="text-[10px] mt-0.5" style={{ color: '#475569' }}>
                  Atualiza enquanto você edita
                </p>
              </div>
              <span
                className="text-[10px] font-bold px-2 py-1 rounded-md"
                style={{ background: 'rgba(37,99,235,0.18)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.2)' }}
              >
                {LAYOUTS.find(l => l.id === cfg.layout)?.label || cfg.layout}
              </span>
            </div>

            <div
              className="mx-auto w-full rounded-[22px] overflow-hidden flex-1 min-h-0"
              style={{
                maxWidth: 320,
                border: '3px solid rgba(148,163,184,0.2)',
                boxShadow: '0 16px 48px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.04)',
                maxHeight: 'calc(94vh - 210px)',
                background: '#020617',
              }}
            >
              <div className="h-full overflow-y-auto">
                <LeadFormPreview config={cfg} campanhaNome={campanhaNome} compact />
              </div>
            </div>
          </aside>
        </div>

        <div
          className="px-5 sm:px-6 py-3.5 flex gap-2.5 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(148,163,184,0.1)', background: 'rgba(0,0,0,0.2)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold"
            style={{ border: '1px solid rgba(148,163,184,0.18)', color: '#94a3b8' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={salvar}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', boxShadow: '0 8px 24px rgba(37,99,235,0.35)' }}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar formulário
          </button>
        </div>
      </div>

      <ImagePositionEditor
        open={!!ajuste && !!cfg[ajuste?.key]}
        src={ajuste ? cfg[ajuste.key] : ''}
        meta={ajuste ? cfg[`${ajuste.key}Meta`] : null}
        x={ajuste?.x ?? 50}
        y={ajuste?.y ?? 50}
        zoom={ajuste?.zoom ?? 100}
        aspect={
          ajuste?.key === 'logo'
            ? 'logo'
            : cfg.layout === 'split'
              ? 'split'
              : 'hero'
        }
        title={
          ajuste?.key === 'logo'
            ? 'Enquadrar logo'
            : cfg.layout === 'split'
              ? 'Enquadrar foto do cartaz'
              : 'Enquadrar foto'
        }
        onCancel={() => setAjuste(null)}
        onConfirm={confirmarAjuste}
      />
    </div>,
    document.body,
  )
}

function Section({ icon: Icon, title, hint, children }) {
  return (
    <section
      className="rounded-2xl p-4 space-y-3"
      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(148,163,184,0.1)' }}
    >
      <div className="flex items-start gap-2.5">
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: 'rgba(37,99,235,0.15)', color: '#93c5fd' }}
        >
          <Icon size={14} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-white leading-tight">{title}</p>
          {hint && <p className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>{hint}</p>}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function LayoutThumb({ id, active, accent, primary }) {
  const border = active ? 'rgba(147,197,253,0.35)' : 'rgba(148,163,184,0.15)'
  if (id === 'split') {
    return (
      <div className="h-12 rounded-lg overflow-hidden flex" style={{ border: `1px solid ${border}` }}>
        <div className="flex-1 relative" style={{ background: primary || '#0f172a' }}>
          <div className="absolute inset-x-1 bottom-1 space-y-0.5">
            <div className="h-1 w-2/3 rounded-full bg-white/50" />
            <div className="h-1 w-1/2 rounded-full" style={{ background: accent || '#22c55e' }} />
          </div>
        </div>
        <div className="w-[42%] bg-white" />
      </div>
    )
  }
  if (id === 'hero') {
    return (
      <div className="h-12 rounded-lg overflow-hidden flex flex-col" style={{ border: `1px solid ${border}` }}>
        <div className="h-[45%]" style={{ background: primary || '#0f172a' }} />
        <div className="flex-1 bg-white px-1.5 py-1">
          <div className="h-1 w-3/4 rounded-full bg-slate-200" />
        </div>
      </div>
    )
  }
  return (
    <div className="h-12 rounded-lg overflow-hidden flex items-center justify-center px-3" style={{ border: `1px solid ${border}`, background: primary || '#0f172a' }}>
      <div className="w-full h-7 rounded bg-white/95" />
    </div>
  )
}

function ColorField({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-wide" style={{ color: '#64748b' }}>
        {label}
      </label>
      <div
        className="flex items-center gap-2 rounded-xl px-2 py-1.5"
        style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(148,163,184,0.12)' }}
      >
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0"
        />
        <input
          className="flex-1 bg-transparent text-[11px] font-mono font-semibold outline-none uppercase min-w-0"
          style={{ color: '#cbd5e1' }}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[10px] font-bold mb-1.5 uppercase tracking-wide" style={{ color: '#64748b' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function ImageSlot({
  label, hint, src, meta, posX = 50, posY = 50, zoom = 100, fit = 'cover',
  onPick, onClear, onAdjust,
}) {
  const sizeLine = meta?.width
    ? `${meta.width}×${meta.height} px${meta.bytes ? ` · ${formatBytes(meta.bytes)}` : ''}`
    : null

  return (
    <div>
      <p className="text-[10px] font-bold mb-1 uppercase tracking-wide" style={{ color: '#64748b' }}>{label}</p>
      {hint && (
        <p className="text-[10px] mb-2" style={{ color: '#475569' }}>{hint}</p>
      )}
      <div
        className="rounded-xl overflow-hidden relative"
        style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(148,163,184,0.14)', minHeight: 118 }}
      >
        {src ? (
          <>
            <div
              className="w-full h-[118px] overflow-hidden relative"
              style={{
                background: fit === 'contain'
                  ? 'radial-gradient(ellipse at 40% 60%, rgba(21,128,61,0.28), #0f172a 70%)'
                  : '#020617',
              }}
            >
              {fit === 'contain' ? (
                <div className="absolute inset-0 flex items-end justify-center p-2">
                  <img
                    src={src}
                    alt=""
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                      objectPosition: `${posX}% ${posY}%`,
                      filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.4))',
                      transform: zoom > 100 ? `scale(${1 + (zoom - 100) / 280})` : undefined,
                      transformOrigin: 'bottom center',
                    }}
                  />
                </div>
              ) : (
                <FramedCoverPhoto src={src} x={posX} y={posY} zoom={zoom} />
              )}
            </div>
            <div className="absolute top-2 right-2 flex gap-1">
              <button type="button" onClick={onAdjust}
                className="px-2 py-1 rounded-lg text-[10px] font-bold text-white flex items-center gap-1"
                style={{ background: 'rgba(29,78,216,0.92)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                <Crop size={10} /> Enquadrar
              </button>
              <button type="button" onClick={onClear}
                className="px-2 py-1 rounded-lg text-[10px] font-bold text-white"
                style={{ background: 'rgba(15,23,42,0.75)' }}>
                Remover
              </button>
            </div>
          </>
        ) : (
          <label className="flex flex-col items-center justify-center h-[118px] cursor-pointer gap-1.5 px-3">
            <span
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(37,99,235,0.12)', color: '#93c5fd' }}
            >
              <ImagePlus size={18} />
            </span>
            <span className="text-[12px] font-bold" style={{ color: '#93c5fd' }}>Carregar imagem</span>
            <span className="text-[10px] text-center" style={{ color: '#475569' }}>
              {fit === 'contain' ? 'PNG / WebP · fundo transparente' : 'JPG ou PNG · até ~650 KB'}
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={onPick} />
          </label>
        )}
      </div>
      {src && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {sizeLine && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8' }}>
              {sizeLine}
            </span>
          )}
          {meta?.name && (
            <span className="text-[10px] truncate max-w-[140px]" style={{ color: '#475569' }}>
              {meta.name}
            </span>
          )}
          <label className="text-[10px] font-bold cursor-pointer" style={{ color: '#93c5fd' }}>
            Trocar
            <input type="file" accept="image/*" className="hidden" onChange={onPick} />
          </label>
        </div>
      )}
    </div>
  )
}

const inp = 'w-full px-3 py-2.5 rounded-xl text-sm outline-none'
  + ' bg-[rgba(0,0,0,0.28)] text-slate-100 placeholder:text-slate-500'
  + ' border border-[rgba(148,163,184,0.14)] focus:border-blue-400/50'
