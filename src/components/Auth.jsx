import { useState } from 'react'
import { Flag, Mail, Lock, LogIn, UserPlus, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [modo, setModo]       = useState('login') // 'login' | 'signup'
  const [email, setEmail]     = useState('')
  const [senha, setSenha]     = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro]       = useState('')
  const [aviso, setAviso]     = useState('')

  async function submeter(e) {
    e.preventDefault()
    setErro(''); setAviso('')
    if (!email.trim() || !senha) { setErro('Preencha e-mail e senha.'); return }
    if (senha.length < 6) { setErro('A senha precisa ter ao menos 6 caracteres.'); return }

    setCarregando(true)
    try {
      if (modo === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: senha })
        if (error) throw error
        if (!data.session) {
          setAviso('Conta criada! Verifique seu e-mail para confirmar o acesso (se a confirmação estiver ativada).')
          setModo('login')
        }
      }
    } catch (err) {
      setErro(traduzErro(err.message))
    } finally {
      setCarregando(false)
    }
  }

  function traduzErro(msg = '') {
    if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.'
    if (/already registered/i.test(msg))        return 'Este e-mail já está cadastrado.'
    if (/email not confirmed/i.test(msg))        return 'Confirme seu e-mail antes de entrar.'
    return msg || 'Ocorreu um erro. Tente novamente.'
  }

  const inp = 'w-full rounded-xl pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all'
  const inpStyle = { background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#08080d' }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-7">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: 'linear-gradient(135deg, #fbbf24, #f97316)', boxShadow: '0 8px 30px rgba(251,191,36,0.35)' }}>
            <Flag size={24} className="text-black" />
          </div>
          <h1 className="text-display font-bold text-white" style={{ fontSize: 22 }}>Campanha</h1>
          <p className="font-semibold" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Coordenação Eleitoral</p>
        </div>

        <div className="rounded-2xl p-6" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
          <div className="flex rounded-xl p-1 mb-5 gap-1" style={{ background: 'var(--bg-raised)' }}>
            {[['login', 'Entrar'], ['signup', 'Criar conta']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => { setModo(id); setErro(''); setAviso('') }}
                className="flex-1 py-2 rounded-lg text-sm font-bold transition-all"
                style={{
                  background: modo === id ? 'var(--accent)' : 'transparent',
                  color:      modo === id ? '#fff' : 'var(--text-tertiary)',
                }}>
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submeter} className="space-y-3">
            <div className="relative">
              <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com" className={inp} style={inpStyle} autoComplete="email" />
            </div>
            <div className="relative">
              <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
                placeholder="Senha (mín. 6 caracteres)" className={inp} style={inpStyle}
                autoComplete={modo === 'login' ? 'current-password' : 'new-password'} />
            </div>

            {erro &&  <p className="text-sm" style={{ color: '#f87171' }}>{erro}</p>}
            {aviso && <p className="text-sm" style={{ color: '#34d399' }}>{aviso}</p>}

            <button type="submit" disabled={carregando}
              className="w-full flex items-center justify-center gap-2 text-white font-bold py-2.5 rounded-xl transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', boxShadow: '0 6px 20px rgba(37,99,235,0.4)' }}>
              {carregando ? <Loader2 size={16} className="animate-spin" />
                : modo === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}
              {carregando ? 'Aguarde...' : modo === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>
        </div>

        <p className="text-center mt-5" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          Seus dados ficam sincronizados com segurança na nuvem.
        </p>
      </div>
    </div>
  )
}
