import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Loader2, Lock, MessageCircle, Radio, Search, Users } from 'lucide-react'
import { loadBairrosSc, listarCidadesSc, bairrosDaCidadeSc } from '../utils/bairrosSc'
import { normStr } from '../utils/constants'
import { normalizeLeadFormConfig, interesseQuerCanal } from '../utils/leadFormConfig'
import { formatarCep, buscarEnderecoPorCep } from '../utils/agendaLocal'
import {
  formatTelefoneInput,
  analisarTelefone,
  formatDataBrInput,
  analisarDataBr,
  capitalizarNome,
  isCampoCep,
  isCampoRua,
  isCampoDataNascimento,
  formatCpfInput,
} from '../utils/telefoneBr'
import { LogoMark } from './ImagePositionEditor'
import CampaignPoster, { LandingFooter } from './CampaignPoster'

const PHP_API = typeof window !== 'undefined'
  ? `${window.location.origin}/api.php`
  : '/api.php'

export default function CadastroPublico({ token }) {
  const [info, setInfo] = useState(null)
  const [erroInfo, setErroInfo] = useState('')
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [values, setValues] = useState({})
  const [extras, setExtras] = useState({})
  const [interessesSel, setInteressesSel] = useState([])
  const [lgpd, setLgpd] = useState(false)
  const [website, setWebsite] = useState('')
  const [mapa, setMapa] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(null)
  const [cepStatus, setCepStatus] = useState('') // '', 'buscando', 'ok', 'erro'
  const [telInfo, setTelInfo] = useState(null)
  const [dataInfo, setDataInfo] = useState(null)
  const cepBusy = useRef(false)
  const [isMobileLayout, setIsMobileLayout] = useState(false)

  const cfg = useMemo(() => normalizeLeadFormConfig(info?.config), [info])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const sync = () => setIsMobileLayout(mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    mq.addListener?.(sync)
    return () => {
      mq.removeEventListener?.('change', sync)
      mq.removeListener?.(sync)
    }
  }, [])

  // Trava altura/scroll da página pública — sem “poço” depois do rodapé
  useEffect(() => {
    if (loadingInfo || erroInfo) return undefined
    if (cfg.layout !== 'split') return undefined

    const html = document.documentElement
    const body = document.body
    const root = document.getElementById('root')
    html.classList.add('cadastro-publico-ativo')
    body.classList.add('cadastro-publico-ativo')
    root?.classList.add('cadastro-publico-ativo')

    return () => {
      html.classList.remove('cadastro-publico-ativo')
      body.classList.remove('cadastro-publico-ativo')
      root?.classList.remove('cadastro-publico-ativo')
    }
  }, [cfg.layout, loadingInfo, erroInfo])

  useEffect(() => {
    let cancel = false
    ;(async () => {
      setLoadingInfo(true)
      setErroInfo('')
      try {
        const r = await fetch(`${PHP_API}?action=lead_form_info&token=${encodeURIComponent(token)}`)
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error || 'Link inválido')
        if (!cancel) {
          setInfo(data)
          const c = normalizeLeadFormConfig(data.config)
          const init = {}
          c.campos.forEach(campo => { if (campo.sistema) init[campo.id] = '' })
          setValues(init)
          setInteressesSel(c.interesses.filter(i => i.ativo !== false && i.padrao).map(i => i.id))
        }
      } catch (e) {
        if (!cancel) setErroInfo(e.message || 'Não foi possível abrir o cadastro.')
      } finally {
        if (!cancel) setLoadingInfo(false)
      }
    })()
    return () => { cancel = true }
  }, [token])

  useEffect(() => {
    loadBairrosSc().then(setMapa).catch(() => setMapa({ Blumenau: [] }))
  }, [])

  const cidades = useMemo(() => listarCidadesSc(mapa), [mapa])
  const bairros = useMemo(() => bairrosDaCidadeSc(mapa, values.cidade), [mapa, values.cidade])
  const camposAtivos = useMemo(() => cfg.campos.filter(c => c.ativo !== false), [cfg])
  const interessesAtivos = useMemo(() => cfg.interesses.filter(i => i.ativo !== false), [cfg])

  function setVal(id, v) {
    setValues(prev => ({ ...prev, [id]: v }))
  }

  function setCampoValue(campo, v) {
    if (campo.sistema) setVal(campo.id, v)
    else setExtras(prev => ({ ...prev, [campo.id]: v }))
  }

  function matchCidadeSc(lista, localidade) {
    const nome = String(localidade || '').trim()
    if (!nome) return ''
    const lower = nome.toLowerCase()
    const exact = lista.find(c => c.toLowerCase() === lower)
    if (exact) return exact
    // Sem match parcial (evita CEP ligar cidade errada) — deixa o usuário escolher
    return ''
  }

  async function onCepChange(campo, raw) {
    const cep = formatarCep(raw)
    setCampoValue(campo, cep)
    setCepStatus('')

    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8) return
    if (cepBusy.current) return
    cepBusy.current = true
    setCepStatus('buscando')
    try {
      const data = await buscarEnderecoPorCep(cep)
      if (!data) {
        setCepStatus('erro')
        return
      }

      const cidadeSc = matchCidadeSc(cidades, data.localidade)
      const cidadeLivre = String(data.localidade || '').trim()
      const bairro = String(data.bairro || '').trim()
      const rua = String(data.logradouro || '').trim()
      const uf = String(data.uf || '').trim().toUpperCase()

      setValues(prev => ({
        ...prev,
        // Prefere cidade da lista SC; senão grava o nome livre (outras cidades/UFs)
        ...(cidadeSc ? { cidade: cidadeSc } : (cidadeLivre ? { cidade: cidadeLivre } : {})),
        ...(bairro ? { bairro } : {}),
        ...(uf ? { uf, estado: uf } : {}),
      }))

      setExtras(prev => ({
        ...prev,
        ...(cidadeSc || !cidadeLivre ? {} : { cidade: cidadeLivre }),
        ...(bairro ? { bairro } : {}),
        ...(uf ? { uf, estado: uf } : {}),
      }))

      const campoRua = camposAtivos.find(isCampoRua)
      if (campoRua && rua) {
        if (campoRua.sistema) setVal(campoRua.id, rua)
        else setExtras(prev => ({ ...prev, [campoRua.id]: rua }))
      }

      setCepStatus('ok')
    } catch {
      setCepStatus('erro')
    } finally {
      cepBusy.current = false
    }
  }

  function onTelefoneChange(v) {
    const formatted = formatTelefoneInput(v)
    setVal('telefone', formatted)
    // Enquanto digita: só feedback leve (sem erro de “incompleto” a cada tecla)
    if (!formatted) {
      setTelInfo(null)
      return
    }
    const info = analisarTelefone(formatted)
    const digits = String(info.digits || '').replace(/\D/g, '')
    if (info.ok || info.estrangeiro || digits.length >= 10) {
      setTelInfo(info)
    } else {
      setTelInfo({ ...info, erro: null })
    }
  }

  function onTelefoneBlur() {
    const formatted = formatTelefoneInput(values.telefone || '')
    if (formatted !== (values.telefone || '')) setVal('telefone', formatted)
    const info = analisarTelefone(formatted)
    // Ao sair do campo: aplica normalização (ex.: 9 do celular antigo) e valida
    if (info.formatted && info.formatted !== formatted) setVal('telefone', info.formatted)
    setTelInfo(info.formatted ? info : null)
  }

  function onDataNascimentoChange(campo, v) {
    const masked = formatDataBrInput(v)
    if (campo.sistema) setVal(campo.id, masked)
    else setExtras(p => ({ ...p, [campo.id]: masked }))
    if (!masked) {
      setDataInfo(null)
      return
    }
    const digits = masked.replace(/\D/g, '')
    if (digits.length < 8) {
      setDataInfo({ ok: false, formatted: masked, erro: null })
      return
    }
    setDataInfo(analisarDataBr(masked))
  }

  function onDataNascimentoBlur(campo) {
    const raw = campo.sistema ? (values[campo.id] || '') : (extras[campo.id] || '')
    if (!String(raw).trim()) {
      setDataInfo(null)
      return
    }
    const info = analisarDataBr(raw)
    if (info.formatted) {
      if (campo.sistema) setVal(campo.id, info.formatted)
      else setExtras(p => ({ ...p, [campo.id]: info.formatted }))
    }
    setDataInfo(info)
  }

  function onNomeChange(v) {
    setVal('nome', capitalizarNome(v))
  }

  function toggleInteresse(id) {
    setInteressesSel(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return [...s]
    })
  }

  async function enviar(e) {
    e.preventDefault()
    setErro('')

    const nomeOk = capitalizarNome(values.nome || '').trim()
    if (!nomeOk) {
      setErro('Informe o nome completo.')
      return
    }

    const tel = analisarTelefone(values.telefone || '')
    if (tel.formatted) setVal('telefone', tel.formatted)
    setTelInfo(tel)
    if (!tel.ok) {
      setErro(tel.erro || 'Celular / WhatsApp inválido.')
      return
    }

    if (!(values.cidade || '').trim()) {
      setErro('Informe a cidade.')
      return
    }
    if (!(values.bairro || '').trim()) {
      setErro('Informe o bairro.')
      return
    }
    const ruaOk = String(extras.logradouro || values.logradouro || '').trim()
    const numOk = String(extras.numero || values.numero || '').trim()
    if (!ruaOk) {
      setErro('Informe a rua / logradouro.')
      return
    }
    if (!numOk) {
      setErro('Informe o número.')
      return
    }

    const campoData = camposAtivos.find(c => isCampoDataNascimento(c))
    let extrasEnvio = {
      ...extras,
      logradouro: ruaOk,
      numero: numOk,
      complemento: String(extras.complemento || values.complemento || '').trim(),
    }
    if (campoData) {
      const rawData = campoData.sistema
        ? (values[campoData.id] || '')
        : (extras[campoData.id] || '')
      if (String(rawData).trim() || campoData.obrigatorio) {
        const dataNasc = analisarDataBr(rawData)
        setDataInfo(dataNasc)
        if (!dataNasc.ok) {
          setErro(dataNasc.erro || 'Data de nascimento inválida.')
          return
        }
        if (campoData.sistema) setVal(campoData.id, dataNasc.formatted)
        extrasEnvio = {
          ...extrasEnvio,
          [campoData.id]: dataNasc.formatted,
          data_nascimento_iso: dataNasc.iso,
        }
      }
    }

    setEnviando(true)
    try {
      const interesseLabels = interessesAtivos
        .filter(i => interessesSel.includes(i.id))
        .map(i => i.label)

      const r = await fetch(`${PHP_API}?action=lead_form_submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: info?.token || token,
          nome: nomeOk,
          email: (values.email || '').trim(),
          telefone: tel.formatted,
          cidade: values.cidade || '',
          bairro: (values.bairro || '').trim(),
          profissao: (values.profissao || '').trim(),
          interesses: interesseLabels,
          extras: {
            ...extrasEnvio,
            ...(tel.estrangeiro ? { telefone_pais: tel.pais } : {}),
          },
          lgpd,
          website,
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Falha ao enviar cadastro.')
      setOk(data)
    } catch (err) {
      setErro(err.message || 'Erro ao enviar.')
    } finally {
      setEnviando(false)
    }
  }

  const waLink = ok?.whatsapp
    ? `https://wa.me/${ok.whatsapp.startsWith('55') ? ok.whatsapp : `55${ok.whatsapp}`}?text=${encodeURIComponent('Olá! Acabei de me cadastrar pelo formulário e quero fazer parte do time.')}`
    : null

  const querCanal = interesseQuerCanal(interessesSel, cfg.interesses)
  const canalUrl = (cfg.whatsappCanalUrl || '').trim()
  const mostrarCanal = !!(ok && querCanal && canalUrl)

  if (loadingInfo) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: cfg.corPrimaria }}>
        <Loader2 className="animate-spin" size={28} style={{ color: cfg.corDestaque }} />
        <p style={{ color: 'rgba(255,255,255,0.75)' }}>Carregando cadastro…</p>
      </div>
    )
  }

  if (erroInfo) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: '#0b1f4d' }}>
        <div className="max-w-md w-full rounded-3xl p-6 text-center bg-white">
          <p className="font-bold text-lg mb-2 text-slate-900">Link indisponível</p>
          <p className="text-sm text-slate-500">{erroInfo}</p>
        </div>
      </div>
    )
  }

  const pageStyle = {
    minHeight: '100vh',
    background: `linear-gradient(165deg, ${cfg.corPrimaria} 0%, ${cfg.corPrimaria}cc 45%, ${cfg.corAcento} 100%)`,
    fontFamily: "'Manrope', system-ui, sans-serif",
  }

  const formCard = (embedded = false) => (
    <div
      className={`bg-white w-full flex flex-col ${embedded ? 'h-auto' : 'h-full overflow-hidden rounded-3xl'}`}
      style={embedded ? undefined : { boxShadow: '0 25px 60px rgba(0,0,0,0.28)' }}
    >
      <div className={`text-center flex-shrink-0 ${embedded ? 'px-4 pt-4 pb-2.5' : 'px-6 pt-7 pb-5'}`}>
        {cfg.logo && cfg.layout !== 'split' ? (
          <LogoMark src={cfg.logo} x={cfg.logoX} y={cfg.logoY} maxH={48} maxW={180} className="mb-4" />
        ) : (
          <div
            className={`mx-auto flex items-center justify-center ${embedded ? 'mb-2 w-9 h-9 rounded-xl' : 'mb-4 w-11 h-11 rounded-2xl'}`}
            style={{ background: `linear-gradient(135deg,${cfg.corPrimaria},${cfg.corAcento})` }}
          >
            <Users size={embedded ? 16 : 20} color="#fff" />
          </div>
        )}
        <h2
          className="font-extrabold text-slate-900"
          style={{
            fontFamily: "'Sora', system-ui, sans-serif",
            fontSize: embedded ? 15 : 17,
            lineHeight: 1.25,
          }}
        >
          {cfg.titulo}
        </h2>
        {cfg.subtitulo && (
          <p
            className="mt-1 text-slate-500 mx-auto"
            style={{ fontSize: embedded ? 11.5 : 12.5, lineHeight: 1.4, maxWidth: 340 }}
          >
            {cfg.subtitulo.replace('{campanha}', info?.tenant_name || 'campanha')}
          </p>
        )}
        <p className="mt-1.5 text-[10px] text-slate-400">
          <span style={{ color: '#dc2626' }}>*</span> campos obrigatórios
        </p>
      </div>

      <div className="flex-1" style={{ borderTop: '1px solid #eef2f7' }}>
        {ok ? (
          <div className="px-6 py-10 text-center space-y-4">
            <CheckCircle2 size={44} className="mx-auto" style={{ color: cfg.corAcento }} />
            <p className="font-bold text-lg text-slate-900">{ok.message || 'Cadastro recebido!'}</p>
            <p className="text-sm text-slate-500">
              {ok.updated
                ? 'Identificamos seu WhatsApp e atualizamos seus dados — sem duplicar.'
                : 'Você entrou como simpatizante na rede de apoiadores.'}
            </p>

            {mostrarCanal && (
              <div className="rounded-2xl p-4 text-left space-y-3"
                style={{ background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.28)' }}>
                <p className="font-extrabold text-slate-900 flex items-center gap-2" style={{ fontSize: 14 }}>
                  <Radio size={16} style={{ color: '#16a34a' }} />
                  {cfg.whatsappCanalTitulo || 'Canal oficial no WhatsApp'}
                </p>
                <p className="text-slate-500" style={{ fontSize: 12, lineHeight: 1.45 }}>
                  Toque no botão abaixo para seguir o canal e receber as novidades da campanha.
                </p>
                <a
                  href={canalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    const t = info?.token || token
                    if (!t) return
                    const body = JSON.stringify({ token: t })
                    try {
                      if (navigator.sendBeacon) {
                        navigator.sendBeacon(
                          `${PHP_API}?action=lead_canal_click`,
                          new Blob([body], { type: 'application/json' }),
                        )
                      } else {
                        fetch(`${PHP_API}?action=lead_canal_click`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body,
                          keepalive: true,
                        }).catch(() => {})
                      }
                    } catch { /* ignore */ }
                  }}
                  className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl font-extrabold text-white"
                  style={{ background: '#16a34a', boxShadow: '0 8px 24px rgba(22,163,74,0.28)' }}
                >
                  <Radio size={18} /> Entrar no canal
                </a>
              </div>
            )}

            {querCanal && !canalUrl && (
              <p className="text-sm text-amber-700 rounded-xl px-3 py-2"
                style={{ background: 'rgba(245,158,11,0.12)' }}>
                Interesse no canal registrado. Em breve a equipe envia o acesso.
              </p>
            )}

            {waLink && (
              <a href={waLink} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl font-extrabold"
                style={{
                  background: mostrarCanal ? 'transparent' : cfg.corAcento,
                  color: mostrarCanal ? cfg.corPrimaria : '#fff',
                  border: mostrarCanal ? `1.5px solid ${cfg.corPrimaria}33` : 'none',
                }}>
                <MessageCircle size={18} />
                {mostrarCanal ? 'Falar com a campanha' : 'Entrar no WhatsApp'}
              </a>
            )}
          </div>
        ) : (
          <form
            onSubmit={enviar}
            className={embedded ? 'px-4 py-3.5' : 'px-6 py-5'}
          >
            <input
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              className="sr-only"
              aria-hidden="true"
            />

            <div className={`grid grid-cols-1 sm:grid-cols-2 ${embedded ? 'gap-x-2.5 gap-y-2' : 'gap-x-3 gap-y-3.5'}`}>
              {camposAtivos.map(campo => (
                <div key={campo.id} className={campoLargo(campo) ? 'sm:col-span-2' : ''}>
                  <Campo
                    campo={campo}
                    compact={embedded}
                    value={campo.sistema ? (values[campo.id] || '') : (extras[campo.id] || '')}
                    onChange={v => {
                      if (campo.id === 'nome') onNomeChange(v)
                      else if (campo.id === 'telefone' || campo.tipo === 'tel') onTelefoneChange(v)
                      else if (isCampoDataNascimento(campo)) onDataNascimentoChange(campo, v)
                      else if (isCampoCep(campo)) onCepChange(campo, v)
                      else if (campo.id === 'cpf') {
                        const masked = formatCpfInput(v)
                        if (campo.sistema) setVal('cpf', masked)
                        else setExtras(p => ({ ...p, cpf: masked }))
                      }
                      else if (campo.sistema) {
                        if (campo.id === 'cidade') setValues(p => ({ ...p, cidade: v, bairro: '' }))
                        else setVal(campo.id, v)
                      } else {
                        setExtras(p => ({ ...p, [campo.id]: v }))
                      }
                    }}
                    onBlur={() => {
                      if (campo.id === 'telefone' || campo.tipo === 'tel') onTelefoneBlur()
                      else if (isCampoDataNascimento(campo)) onDataNascimentoBlur(campo)
                    }}
                    cidades={cidades}
                    bairros={bairros}
                    accent={cfg.corPrimaria}
                    hint={
                      campo.id === 'telefone' || campo.tipo === 'tel'
                        ? (telInfo?.erro || telInfo?.aviso || '')
                        : isCampoDataNascimento(campo)
                          ? (dataInfo?.erro || '')
                          : isCampoCep(campo)
                            ? (cepStatus === 'buscando'
                              ? 'Buscando endereço…'
                              : cepStatus === 'ok'
                                ? 'Endereço preenchido — confira número e apto.'
                                : cepStatus === 'erro'
                                  ? 'CEP não encontrado. Preencha cidade, bairro e rua abaixo.'
                                  : 'Opcional: se souber, preenche cidade, bairro e rua.')
                            : ''
                    }
                    hintTone={
                      (campo.id === 'telefone' || campo.tipo === 'tel') && telInfo?.erro
                        ? 'erro'
                        : (campo.id === 'data_nascimento' || campo.tipo === 'date') && dataInfo?.erro
                          ? 'erro'
                          : isCampoCep(campo) && cepStatus === 'erro'
                            ? 'erro'
                            : (campo.id === 'telefone' || campo.tipo === 'tel') && telInfo?.estrangeiro
                              ? 'info'
                              : cepStatus === 'ok'
                                ? 'ok'
                                : 'muted'
                    }
                  />
                </div>
              ))}
            </div>

            {interessesAtivos.length > 0 && (
              <div className={embedded ? 'pt-2.5' : 'pt-1'}>
                <p className="font-extrabold mb-1.5 uppercase" style={{ fontSize: 10, color: cfg.corPrimaria, letterSpacing: '0.05em' }}>
                  {cfg.secaoInteressesTitulo}
                </p>
                <div className={embedded ? 'space-y-1.5' : 'space-y-2'}>
                  {interessesAtivos.map(item => (
                    <label key={item.id} className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" checked={interessesSel.includes(item.id)}
                        onChange={() => toggleInteresse(item.id)} className="mt-0.5" style={{ accentColor: cfg.corAcento }} />
                      <span className="text-slate-700" style={{ fontSize: embedded ? 12.5 : 14, lineHeight: 1.35 }}>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {cfg.mostrarLgpd && (
              <label className="flex items-start gap-2 cursor-pointer pt-1.5">
                <input type="checkbox" checked={lgpd} onChange={e => setLgpd(e.target.checked)}
                  className="mt-0.5" style={{ accentColor: cfg.corPrimaria }} required />
                <span className="text-slate-600" style={{ fontSize: embedded ? 11 : 12, lineHeight: 1.4 }}>{cfg.textoLgpd}</span>
              </label>
            )}

            {erro && <p className="text-sm text-red-600 mt-1">{erro}</p>}

            <button type="submit" disabled={enviando || (cfg.mostrarLgpd && !lgpd)}
              className={`w-full rounded-2xl font-extrabold text-white flex items-center justify-center gap-2 disabled:opacity-50 ${embedded ? 'py-3 mt-2.5' : 'py-3.5 mt-1'}`}
              style={{ background: cfg.corAcento, fontSize: embedded ? 14 : 15, boxShadow: `0 10px 28px ${cfg.corAcento}55` }}>
              {enviando ? <Loader2 size={18} className="animate-spin" /> : <MessageCircle size={18} />}
              {cfg.cta}
            </button>

            <p className="flex items-center justify-center gap-1.5 pt-1.5 text-[10px] text-slate-400">
              <Lock size={11} /> Seus dados estão protegidos
            </p>
          </form>
        )}
      </div>
    </div>
  )

  // ── Landing: um único flyer (marca + formulário + rodapé) ──
  if (cfg.layout === 'split') {
    return (
      <div
        className="cadastro-publico-page w-full flex flex-col items-stretch md:items-center md:justify-[safe_center] md:min-h-[100dvh] md:px-5 md:py-6 lg:px-6 lg:py-8"
        style={{
          background: isMobileLayout
            ? '#ffffff'
            : `linear-gradient(165deg, ${cfg.corPrimaria} 0%, #061428 55%, ${cfg.corPrimaria} 100%)`,
          fontFamily: "'Manrope', system-ui, sans-serif",
        }}
      >
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Sora:wght@600;700;800&display=swap');
          /* Um único scrollport (html). overflow-x em body/#root quebra a roda do mouse. */
          html.cadastro-publico-ativo {
            height: auto !important;
            min-height: 100% !important;
            max-height: none !important;
            background: #ffffff !important;
            overflow-x: clip;
            overflow-y: auto !important;
          }
          html.cadastro-publico-ativo body,
          html.cadastro-publico-ativo #root {
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            background: #ffffff !important;
            overflow: visible !important;
          }
          html.cadastro-publico-ativo body {
            margin: 0 !important;
            padding: 0 !important;
          }
          .cadastro-publico-page {
            min-height: 0 !important;
            height: auto !important;
            overflow: visible !important;
          }
          .cadastro-poster-col {
            height: min(36svh, 240px);
            background: ${cfg.corPrimaria || '#0b1f4d'};
          }
          @media (min-width: 480px) {
            .cadastro-poster-col { height: min(38svh, 260px); }
          }
          @media (min-width: 768px) {
            html.cadastro-publico-ativo,
            html.cadastro-publico-ativo body,
            html.cadastro-publico-ativo #root {
              background: transparent !important;
            }
            .cadastro-poster-col {
              height: auto !important;
              min-height: 100%;
              align-self: stretch;
            }
          }
        `}</style>

        <div
          className="w-full flex-shrink-0"
          style={{ background: `linear-gradient(165deg, ${cfg.corPrimaria} 0%, #061428 100%)` }}
        >
          {cfg.logo && (
            <div className="py-2 sm:py-3 px-3 flex justify-center">
              <div
                className="rounded-xl sm:rounded-2xl px-3 py-1.5 sm:px-4 sm:py-2.5 flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                <LogoMark src={cfg.logo} x={cfg.logoX} y={cfg.logoY} maxH={36} maxW={140} className="sm:hidden" />
                <LogoMark src={cfg.logo} x={cfg.logoX} y={cfg.logoY} maxH={44} maxW={160} className="hidden sm:block" />
              </div>
            </div>
          )}
        </div>

        <div
          className="w-full overflow-hidden rounded-none sm:rounded-2xl lg:rounded-[28px] flex flex-col flex-shrink-0 md:max-w-[1040px]"
          style={{
            boxShadow: isMobileLayout ? 'none' : '0 32px 80px rgba(0,0,0,0.45)',
            background: '#fff',
          }}
        >
          <div className="grid md:grid-cols-[minmax(240px,0.9fr)_1.1fr] items-start md:items-stretch">
            <div className="cadastro-poster-col relative w-full overflow-hidden">
              <div className="absolute inset-0">
                <CampaignPoster
                  cfg={cfg}
                  campanhaNome={info?.tenant_name || 'Campanha'}
                  whatsapp={info?.whatsapp || ''}
                  embedded
                  compact={isMobileLayout}
                  dense={isMobileLayout}
                />
              </div>
            </div>
            <div
              className="w-full bg-white md:border-l"
              style={{ borderColor: 'rgba(0,0,0,0.06)' }}
            >
              {formCard(true)}
            </div>
          </div>
          <LandingFooter cfg={cfg} whatsapp={info?.whatsapp || ''} embedded />
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Sora:wght@600;700;800&display=swap');`}</style>

      {cfg.layout === 'hero' && cfg.foto && (
        <div className="w-full relative overflow-hidden" style={{ height: 'min(42vh, 360px)' }}>
          <img
            src={cfg.foto}
            alt=""
            className="absolute inset-0 w-full h-full"
            style={{
              objectFit: 'cover',
              objectPosition: `${cfg.fotoX ?? 50}% ${cfg.fotoY ?? 50}%`,
              transform: (cfg.fotoZoom || 100) > 100 ? `scale(${(cfg.fotoZoom || 100) / 100})` : undefined,
              transformOrigin: `${cfg.fotoX ?? 50}% ${cfg.fotoY ?? 50}%`,
            }}
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent)' }} />
        </div>
      )}

      <div className="mx-auto px-4 py-8 sm:py-10 max-w-lg">
        <header className="mb-6 text-center sm:text-left">
          {cfg.slogan && (
            <p className="font-extrabold tracking-wide uppercase mb-2"
              style={{ fontFamily: "'Sora', system-ui, sans-serif", fontSize: 12, color: cfg.corDestaque, letterSpacing: '0.08em' }}>
              {cfg.slogan}
            </p>
          )}
          <h1 className="font-extrabold text-white leading-tight"
            style={{ fontFamily: "'Sora', system-ui, sans-serif", fontSize: 'clamp(1.35rem, 4vw, 1.85rem)' }}>
            {info?.tenant_name || 'Campanha'}
          </h1>
          {cfg.valores && (
            <div className="mt-3 inline-flex px-3 py-1.5 rounded-full font-bold text-white"
              style={{ background: cfg.corAcento, fontSize: 11, letterSpacing: '0.04em' }}>
              {cfg.valores}
            </div>
          )}
        </header>
        {formCard()}
      </div>
    </div>
  )
}

function campoLargo(campo) {
  if (!campo) return true
  if (campo.tipo === 'textarea' || campo.tipo === 'tel') return true
  return ['nome', 'email', 'telefone', 'logradouro'].includes(campo.id)
}

/** Busca com lista (cidade / bairro). Com allowFreeText, permite adicionar nome que não está na lista. */
function titleCaseLocal(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/(^|[\s/'’-])(\S)/g, (_, a, b) => a + b.toUpperCase())
}

function CampoBuscaLista({
  label,
  hintEl,
  value,
  onChange,
  opcoes = [],
  required,
  placeholder,
  cls,
  sty,
  compact = false,
  listId = 'campo-busca-list',
  emptyLabel = 'Nenhum resultado',
  allowFreeText = false,
  autoComplete = 'off',
  addLabel = 'Usar',
}) {
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef(null)
  const listRef = useRef(null)

  const base = useMemo(() => {
    const list = Array.isArray(opcoes) ? [...opcoes] : []
    if (value && !list.some(o => normStr(o) === normStr(value))) list.unshift(value)
    return list
  }, [opcoes, value])

  useEffect(() => {
    setQuery(value || '')
  }, [value])

  useEffect(() => {
    function onDoc(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtradas = useMemo(() => {
    const q = normStr(query)
    if (!q) return base.slice(0, 12)
    const starts = []
    const contains = []
    for (const c of base) {
      const n = normStr(c)
      if (n.startsWith(q)) starts.push(c)
      else if (n.includes(q)) contains.push(c)
    }
    return [...starts, ...contains].slice(0, 12)
  }, [base, query])

  const queryTrim = String(query || '').trim()
  const exactHit = queryTrim
    ? base.find(c => normStr(c) === normStr(queryTrim))
    : null
  const podeAdicionar = allowFreeText && queryTrim && !exactHit
  const itens = useMemo(() => {
    const rows = filtradas.map(c => ({ tipo: 'opt', valor: c }))
    if (podeAdicionar) rows.push({ tipo: 'add', valor: titleCaseLocal(queryTrim) })
    return rows
  }, [filtradas, podeAdicionar, queryTrim])

  useEffect(() => {
    setHighlight(0)
  }, [query, open])

  function escolher(item) {
    const final = item?.tipo === 'add' ? titleCaseLocal(item.valor) : item.valor
    onChange(final)
    setQuery(final)
    setOpen(false)
  }

  function commitLivre() {
    const t = titleCaseLocal(query)
    if (!t) {
      onChange('')
      setQuery('')
      return
    }
    const exact = base.find(c => normStr(c) === normStr(t))
    const final = exact || t
    onChange(final)
    setQuery(final)
  }

  function onInputChange(raw) {
    setQuery(raw)
    setOpen(true)
    if (!allowFreeText && value && normStr(raw) !== normStr(value)) onChange('')
  }

  function onBlur() {
    window.setTimeout(() => {
      if (!wrapRef.current) return
      if (allowFreeText) {
        commitLivre()
      } else {
        const exact = base.find(c => normStr(c) === normStr(query))
        if (exact) {
          if (exact !== value) onChange(exact)
          setQuery(exact)
        } else if (value) {
          setQuery(value)
        } else {
          setQuery('')
        }
      }
      setOpen(false)
    }, 120)
  }

  function onKeyDown(e) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true)
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => Math.min(h + 1, Math.max(itens.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && itens[highlight]) escolher(itens[highlight])
      else if (allowFreeText) {
        commitLivre()
        setOpen(false)
      }
    }
  }

  useEffect(() => {
    const el = listRef.current?.querySelectorAll('[data-opt]')?.[highlight]
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [highlight])

  return (
    <div ref={wrapRef} className="relative">
      {label}
      <div className="relative">
        <Search
          size={compact ? 13 : 14}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: '#94a3b8' }}
          aria-hidden
        />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listId}
          autoComplete={autoComplete}
          required={required && !value}
          value={query}
          onChange={e => onInputChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={`${cls} pl-9`}
          style={sty}
        />
      </div>
      {open && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg"
          style={{ maxHeight: compact ? 180 : 220 }}
        >
          {itens.length === 0 ? (
            <li className="px-3 py-2.5 text-xs text-slate-400">
              {allowFreeText && !queryTrim
                ? 'Digite o nome do bairro ou escolha na lista'
                : emptyLabel}
            </li>
          ) : (
            itens.map((item, i) => (
              <li
                key={item.tipo === 'add' ? `add:${item.valor}` : item.valor}
                role="option"
                aria-selected={item.valor === value || i === highlight}
              >
                <button
                  type="button"
                  data-opt
                  className="w-full text-left px-3 py-2 text-sm transition-colors"
                  style={{
                    background: i === highlight ? '#eff6ff' : item.valor === value ? '#f8fafc' : '#fff',
                    color: item.tipo === 'add' ? '#1d4ed8' : '#0f172a',
                    fontWeight: item.tipo === 'add' || item.valor === value ? 700 : 500,
                  }}
                  onMouseDown={e => e.preventDefault()}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => escolher(item)}
                >
                  {item.tipo === 'add' ? `${addLabel} «${item.valor}»` : item.valor}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {hintEl}
    </div>
  )
}

function Campo({ campo, value, onChange, onBlur, cidades, bairros, accent = '#1e3a8a', hint = '', hintTone = 'muted', compact = false }) {
  const labelBase = String(campo.label || '')
    .replace(/\s*\[?\s*opcional\s*\]?/gi, '')
    .replace(/\s*\(opcional\)/gi, '')
    .trim()
  const label = (
    <label className="block font-bold mb-0.5 uppercase" style={{ fontSize: compact ? 9 : 10, color: accent, letterSpacing: '0.05em' }}>
      {labelBase}
      {campo.obrigatorio ? (
        <span className="normal-case" style={{ color: '#dc2626', marginLeft: 3 }} title="Campo obrigatório" aria-label="obrigatório">*</span>
      ) : (
        <span className="normal-case font-semibold" style={{ color: '#94a3b8', marginLeft: 4, letterSpacing: 0 }}>(opcional)</span>
      )}
    </label>
  )
  const sty = { background: '#fff', border: '1px solid #dbe3ee', color: '#0f172a' }
  const cls = compact
    ? 'w-full rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2'
    : 'w-full rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2'
  const hintColor = hintTone === 'erro' ? '#dc2626' : hintTone === 'ok' ? '#15803d' : hintTone === 'info' ? '#2563eb' : '#94a3b8'

  const hintEl = hint ? (
    <p className="mt-0.5 text-[10px] leading-snug" style={{ color: hintColor }}>{hint}</p>
  ) : null

  if (campo.tipo === 'cidade') {
    return (
      <CampoBuscaLista
        label={label}
        hintEl={hintEl}
        value={value}
        onChange={onChange}
        opcoes={cidades}
        required={campo.obrigatorio}
        placeholder={campo.placeholder || 'Digite para buscar a cidade'}
        cls={cls}
        sty={sty}
        compact={compact}
        listId="cidade-busca-list"
        emptyLabel="Nenhuma cidade encontrada"
        autoComplete="address-level2"
      />
    )
  }
  if (campo.tipo === 'bairro') {
    return (
      <CampoBuscaLista
        label={label}
        hintEl={hintEl}
        value={value}
        onChange={onChange}
        opcoes={bairros}
        required={campo.obrigatorio}
        placeholder={campo.placeholder || 'Digite para buscar o bairro'}
        cls={cls}
        sty={sty}
        compact={compact}
        listId="bairro-busca-list"
        emptyLabel="Nenhum bairro na lista — digite para adicionar"
        allowFreeText
        addLabel="Adicionar"
        autoComplete="address-level3"
      />
    )
  }
  if (campo.tipo === 'textarea') {
    return (
      <div>
        {label}
        <textarea required={campo.obrigatorio} value={value} onChange={e => onChange(e.target.value)}
          placeholder={campo.placeholder} rows={compact ? 2 : 3} className={cls} style={sty} />
        {hintEl}
      </div>
    )
  }
  if (campo.tipo === 'select') {
    return (
      <div>
        {label}
        <select required={campo.obrigatorio} value={value} onChange={e => onChange(e.target.value)} className={cls} style={sty}>
          <option value="">{campo.placeholder || 'Selecione'}</option>
          {(campo.opcoes || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {hintEl}
      </div>
    )
  }

  const isCep = isCampoCep(campo)
  const isTel = campo.tipo === 'tel' || campo.id === 'telefone'
  const isNome = campo.id === 'nome'
  const isDate = isCampoDataNascimento(campo)
  const isCpf = campo.id === 'cpf'
  const displayValue = isDate ? formatDataBrInput(value) : value

  return (
    <div>
      {label}
      <input
        required={campo.obrigatorio}
        type={campo.tipo === 'email' ? 'email' : isTel ? 'tel' : 'text'}
        inputMode={isTel || isCep || isCpf || isDate ? 'numeric' : undefined}
        autoComplete={isNome ? 'name' : isTel ? 'tel' : isCep ? 'postal-code' : isDate ? 'bday' : undefined}
        value={displayValue}
        onChange={e => {
          const raw = e.target.value
          onChange(isDate ? formatDataBrInput(raw) : raw)
        }}
        onBlur={e => {
          if (isNome) onChange(capitalizarNome(e.target.value))
          else if (isDate) onChange(formatDataBrInput(e.target.value))
          onBlur?.(e)
        }}
        placeholder={
          isDate
            ? (campo.placeholder || '00/00/0000')
            : isCep
              ? (campo.placeholder || '00000-000')
              : campo.placeholder
        }
        maxLength={isDate ? 10 : isCep ? 9 : isCpf ? 14 : isTel ? 16 : undefined}
        className={cls}
        style={sty}
      />
      {hintEl}
    </div>
  )
}
