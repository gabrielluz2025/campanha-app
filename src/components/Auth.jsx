import { useEffect, useState } from 'react'
import { Flag, Mail, Lock, LogIn, UserPlus, Loader2, ArrowLeft, KeyRound, Sun, Moon, ShieldCheck, Smartphone } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useTheme } from '../theme/ThemeContext'
import { claimInvite, fetchInviteInfo } from '../lib/tenant'

function lerTokenConvite() {
  try {
    const q = new URLSearchParams(window.location.search)
    const t = q.get('convite') || q.get('invite') || ''
    return t.trim()
  } catch {
    return ''
  }
}

export default function Auth() {
  const tokenConvite = lerTokenConvite()
  const [modo, setModo] = useState(tokenConvite ? 'convite' : 'login') // login | signup | reset | convite
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [convite, setConvite] = useState(null) // { email, tenant_name, ... }
  const { isLight, toggleTheme } = useTheme()

  useEffect(() => {
    if (!tokenConvite) return
    let cancel = false
    setCarregando(true)
    fetchInviteInfo(tokenConvite)
      .then(info => {
        if (cancel) return
        setConvite(info)
        setEmail(info.email || '')
        setModo('convite')
      })
      .catch(err => {
        if (cancel) return
        setErro(err.message || 'Convite inválido ou expirado.')
        setModo('login')
      })
      .finally(() => { if (!cancel) setCarregando(false) })
    return () => { cancel = true }
  }, [tokenConvite])

  function setModoLimpo(novo) {
    if (tokenConvite && convite) return // trava no fluxo do convite
    setModo(novo)
    setErro('')
    setAviso('')
  }

  async function submeter(e) {
    e.preventDefault()
    setErro(''); setAviso('')
    if (!email.trim()) { setErro('Preencha o e-mail.'); return }

    if (modo !== 'reset') {
      if (!senha) { setErro('Preencha a senha.'); return }
      if (senha.length < 6) { setErro('A senha precisa ter ao menos 6 caracteres.'); return }
    }

    if (modo === 'convite') {
      if (senha !== senha2) { setErro('As senhas não coincidem.'); return }
    }

    setCarregando(true)
    try {
      if (modo === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
        if (error) throw error
      } else if (modo === 'convite') {
        const mail = (convite?.email || email).trim().toLowerCase()
        // Tenta criar conta; se já existir, faz login com a senha informada
        const { data, error } = await supabase.auth.signUp({ email: mail, password: senha })
        if (error) {
          if (/already registered|already been registered|User already registered/i.test(error.message || '')) {
            const login = await supabase.auth.signInWithPassword({ email: mail, password: senha })
            if (login.error) throw login.error
          } else {
            throw error
          }
        } else if (!data.session) {
          // Conta criada mas precisa confirmar e-mail no Supabase
          setAviso('Conta criada! Se pedir confirmação, abra o e-mail do Supabase e depois entre com a senha que você criou.')
        }
        const session = (await supabase.auth.getSession()).data.session
        if (session?.access_token && tokenConvite) {
          try { await claimInvite(session.access_token, tokenConvite) } catch { /* membro já existe */ }
        }
        // limpa ?convite= da URL sem recarregar
        try {
          const url = new URL(window.location.href)
          url.searchParams.delete('convite')
          url.searchParams.delete('invite')
          window.history.replaceState({}, '', url.pathname + url.search + url.hash)
        } catch { /* ignore */ }
      } else if (modo === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: senha })
        if (error) throw error
        if (!data.session) {
          setAviso('Conta criada! Entre e escolha: equipe ou candidato (uso da ferramenta).')
          setModo('login')
        } else {
          setAviso('Conta criada! Escolha: pedir entrada na equipe ou uso da ferramenta.')
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin
        })
        if (error) throw error
        setAviso('Link de redefinição enviado! Verifique seu e-mail.')
      }
    } catch (err) {
      setErro(traduzErro(err.message))
    } finally {
      setCarregando(false)
    }
  }

  function traduzErro(msg = '') {
    if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.'
    if (/already registered/i.test(msg)) return 'Este e-mail já está cadastrado. Use Entrar.'
    if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar.'
    return msg || 'Ocorreu um erro. Tente novamente.'
  }

  const inp = 'w-full rounded-xl pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all'
  const inpStyle = { background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }

  return (
    <div className="app-shell min-h-screen flex items-center justify-center px-4 relative">
      <button
        type="button"
        onClick={toggleTheme}
        title={isLight ? 'Modo escuro' : 'Modo claro'}
        className="absolute top-4 right-4 p-2.5 rounded-xl"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--gold)' }}
      >
        {isLight ? <Moon size={16} /> : <Sun size={16} />}
      </button>
      <div className="w-full max-w-sm anim-fade-up">
        <div className="flex flex-col items-center mb-7">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
            style={{
              background: 'linear-gradient(145deg, #fcd34d, #f0b429 45%, #ea580c)',
              boxShadow: '0 10px 32px rgba(240,180,41,0.38), inset 0 1px 0 rgba(255,255,255,0.35)',
            }}>
            <Flag size={24} className="text-black" />
          </div>
          <h1 className="text-display font-extrabold" style={{ fontSize: 26, color: 'var(--text-primary)' }}>Campanha</h1>
          <p className="font-semibold" style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>
            Coordenação Eleitoral
          </p>
        </div>

        <div className="rounded-2xl p-6 surface" style={{ boxShadow: 'var(--shadow-lg)' }}>
          {modo === 'convite' && convite && (
            <div className="mb-5 rounded-xl p-3" style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.35)' }}>
              <div className="flex items-start gap-2">
                <ShieldCheck size={16} className="mt-0.5 flex-shrink-0" style={{ color: '#93c5fd' }} />
                <div>
                  <p className="text-sm font-bold" style={{ color: '#dbeafe' }}>Convite aceito</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: 4 }}>
                    Campanha <strong style={{ color: '#fff' }}>{convite.tenant_name}</strong>.
                    Crie sua senha abaixo para entrar.
                  </p>
                </div>
              </div>
            </div>
          )}

          {modo !== 'reset' && modo !== 'convite' && (
            <div className="flex rounded-xl p-1 mb-5 gap-1" style={{ background: 'var(--bg-raised)' }}>
              {[['login', 'Entrar'], ['signup', 'Criar conta']].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setModoLimpo(id)}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${modo === id ? 'text-on-solid' : ''}`}
                  style={{
                    background: modo === id ? 'var(--accent)' : 'transparent',
                    color: modo === id ? undefined : 'var(--text-tertiary)',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {modo === 'reset' && (
            <div className="flex items-center gap-2 mb-5">
              <button type="button" onClick={() => setModoLimpo('login')} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                <ArrowLeft size={16} style={{ color: 'var(--text-tertiary)' }} />
              </button>
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Redefinir senha</span>
            </div>
          )}

          <form onSubmit={submeter} className="space-y-3">
            <div className="relative">
              <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com" className={inp} style={inpStyle} autoComplete="email"
                readOnly={modo === 'convite'} />
            </div>
            {modo !== 'reset' && (
              <div className="relative">
                <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
                  placeholder={modo === 'convite' ? 'Crie sua senha (mín. 6)' : 'Senha (mín. 6 caracteres)'}
                  className={inp} style={inpStyle}
                  autoComplete={modo === 'login' ? 'current-password' : 'new-password'} />
              </div>
            )}
            {modo === 'convite' && (
              <div className="relative">
                <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                <input type="password" value={senha2} onChange={e => setSenha2(e.target.value)}
                  placeholder="Confirme a senha" className={inp} style={inpStyle}
                  autoComplete="new-password" />
              </div>
            )}

            {erro && <p className="text-sm" style={{ color: '#f87171' }}>{erro}</p>}
            {aviso && <p className="text-sm" style={{ color: '#34d399' }}>{aviso}</p>}

            <button type="submit" disabled={carregando || (modo === 'convite' && !convite)}
              className="w-full flex items-center justify-center gap-2 text-white font-bold py-2.5 rounded-xl transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', boxShadow: '0 6px 20px rgba(37,99,235,0.4)' }}>
              {carregando ? <Loader2 size={16} className="animate-spin" />
                : modo === 'reset' ? <KeyRound size={16} />
                : modo === 'convite' ? <ShieldCheck size={16} />
                : modo === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}
              {carregando ? 'Aguarde...'
                : modo === 'reset' ? 'Enviar link de redefinição'
                : modo === 'convite' ? 'Criar senha e entrar'
                : modo === 'login' ? 'Entrar' : 'Criar conta'}
            </button>

            {modo === 'login' && (
              <button type="button" onClick={() => setModoLimpo('reset')}
                className="w-full text-xs font-medium hover:underline"
                style={{ color: 'var(--text-tertiary)' }}>
                Esqueci minha senha
              </button>
            )}
          </form>

          <a
            href="/iphone.html"
            className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold"
            style={{
              color: 'var(--gold)',
              border: '1px solid rgba(212,175,95,0.28)',
              background: 'rgba(212,175,95,0.08)',
            }}
          >
            <Smartphone size={14} />
            Instalar no iPhone
          </a>
        </div>

        <p className="text-center mt-5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          Seus dados ficam sincronizados com segurança na nuvem.
        </p>
      </div>
    </div>
  )
}
