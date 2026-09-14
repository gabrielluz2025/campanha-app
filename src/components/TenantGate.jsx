import { useState, useEffect } from 'react'
import { Flag, Loader2, Building2, LogOut, KeyRound, Clock, ShieldCheck, RefreshCw, Users } from 'lucide-react'
import { claimLegacyTenant, requestAccess, fetchMyTenants } from '../lib/tenant'

/**
 * Sem campanha:
 * - Equipe → pede kind=team (entra na Campanha principal)
 * - Candidato → pede kind=tool (dono libera uso da ferramenta + cria campanha dele)
 */
export default function TenantGate({
  accessToken,
  tenants = [],
  canClaimLegacy = false,
  canCreateTenant = false,
  defaultTenantName = 'Campanha principal',
  accessRequest = null,
  onSelect,
  onCreated,
  onLogout,
  onRefresh,
  userEmail,
}) {
  const [nomeCampanha, setNomeCampanha] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [pedido, setPedido] = useState(accessRequest)
  const [okMsg, setOkMsg] = useState('')

  useEffect(() => {
    setPedido(accessRequest)
  }, [accessRequest])

  async function assumir() {
    setErro('')
    setBusy(true)
    try {
      const res = await claimLegacyTenant(accessToken)
      onCreated?.(res.tenant)
    } catch (err) {
      setErro(err.message || 'Não foi possível assumir a campanha.')
    } finally {
      setBusy(false)
    }
  }

  async function solicitarEquipe() {
    setErro('')
    setOkMsg('')
    setBusy(true)
    try {
      const res = await requestAccess(accessToken, { kind: 'team' })
      setPedido(res.accessRequest || { status: 'pending', kind: 'team' })
      setOkMsg(res.already
        ? 'Pedido já na fila. Aguarde o dono liberar.'
        : 'Pedido enviado: entrada na equipe. Aguarde liberação.')
      onRefresh?.()
    } catch (err) {
      setErro(err.message || 'Não foi possível solicitar.')
    } finally {
      setBusy(false)
    }
  }

  async function solicitarFerramenta(e) {
    e.preventDefault()
    setErro('')
    setOkMsg('')
    if (!nomeCampanha.trim() || nomeCampanha.trim().length < 2) {
      setErro('Informe o nome da sua campanha.')
      return
    }
    setBusy(true)
    try {
      const res = await requestAccess(accessToken, {
        kind: 'tool',
        campaignName: nomeCampanha.trim(),
      })
      setPedido(res.accessRequest || { status: 'pending', kind: 'tool' })
      setOkMsg(res.already
        ? 'Pedido já na fila. Aguarde liberação do uso da ferramenta.'
        : 'Pedido enviado: uso da ferramenta. Quando liberarem, sua campanha será criada.')
      onRefresh?.()
    } catch (err) {
      setErro(err.message || 'Não foi possível solicitar.')
    } finally {
      setBusy(false)
    }
  }

  async function verificar() {
    setErro('')
    setOkMsg('')
    setBusy(true)
    try {
      const res = await fetchMyTenants(accessToken)
      setPedido(res.accessRequest || null)
      if ((res.tenants || []).length > 0) {
        onRefresh?.(res)
        return
      }
      setOkMsg(res.accessRequest
        ? 'Ainda aguardando aprovação…'
        : 'Nenhum acesso liberado ainda.')
    } catch (err) {
      setErro(err.message || 'Falha ao verificar.')
    } finally {
      setBusy(false)
    }
  }

  const aguardando = Boolean(pedido?.status === 'pending')
  const kind = pedido?.kind || 'team'
  const semCampanha = tenants.length === 0

  return (
    <div className="app-shell min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md anim-fade-up">
        <div className="flex flex-col items-center mb-7">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
            style={{
              background: 'linear-gradient(145deg, #fcd34d, #f0b429 45%, #ea580c)',
              boxShadow: '0 10px 32px rgba(240,180,41,0.38), inset 0 1px 0 rgba(255,255,255,0.35)',
            }}>
            <Flag size={24} className="text-black" />
          </div>
          <h1 className="text-display font-extrabold" style={{ fontSize: 24, color: 'var(--text-primary)' }}>
            {semCampanha ? 'Como deseja continuar?' : 'Sua campanha'}
          </h1>
          <p className="text-center mt-1" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {semCampanha
              ? 'Equipe entra na campanha. Candidato pede uso da ferramenta.'
              : 'Escolha a campanha para continuar.'}
          </p>
          {userEmail && (
            <p className="mt-2 font-medium" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{userEmail}</p>
          )}
        </div>

        <div className="rounded-2xl p-6 space-y-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          {tenants.length > 0 && (
            <div className="space-y-2">
              <p className="font-bold text-xs uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                Suas campanhas
              </p>
              {tenants.map(t => (
                <button
                  key={t.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onSelect?.(t)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors"
                  style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(37,99,235,0.2)' }}>
                    <Building2 size={16} style={{ color: '#60a5fa' }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{t.name}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                      {t.role === 'owner' ? 'Dono' : 'Membro'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {canClaimLegacy && (
            <button
              type="button"
              disabled={busy}
              onClick={assumir}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm text-white"
              style={{ background: 'linear-gradient(135deg,#059669,#047857)' }}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
              Assumir campanha atual (dados existentes)
            </button>
          )}

          {aguardando && semCampanha && (
            <div
              className="rounded-xl p-4 space-y-3"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)' }}
            >
              <div className="flex items-start gap-2.5">
                <Clock size={18} className="mt-0.5 flex-shrink-0" style={{ color: '#fbbf24' }} />
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Aguardando aprovação</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: 4 }}>
                    {kind === 'tool'
                      ? `Pedido para usar a ferramenta${pedido?.campaign_name ? ` (“${pedido.campaign_name}”)` : ''}. Quando liberarem, clique em Verificar.`
                      : `Pedido para entrar na equipe de “${defaultTenantName}”. Quando liberarem, clique em Verificar.`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={verificar}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                Verificar se já liberaram
              </button>
            </div>
          )}

          {!aguardando && semCampanha && !canClaimLegacy && (
            <>
              <div
                className="rounded-xl p-4 space-y-3"
                style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.28)' }}
              >
                <div className="flex items-start gap-2.5">
                  <Users size={18} className="mt-0.5 flex-shrink-0" style={{ color: '#93c5fd' }} />
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Faço parte da equipe</p>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: 4 }}>
                      Quero trabalhar em “{defaultTenantName}”. O dono libera em Acesso da equipe.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={solicitarEquipe}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm text-white"
                  style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  Pedir entrada na equipe
                </button>
              </div>

              <form
                onSubmit={solicitarFerramenta}
                className="rounded-xl p-4 space-y-3"
                style={{ background: 'rgba(212,175,95,0.08)', border: '1px solid rgba(212,175,95,0.28)' }}
              >
                <div className="flex items-start gap-2.5">
                  <Flag size={18} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--gold)' }} />
                  <div>
                    <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Sou candidato</p>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: 4 }}>
                      Quero usar a ferramenta na minha campanha (dados separados). Não entro na equipe de outro.
                    </p>
                  </div>
                </div>
                <input
                  value={nomeCampanha}
                  onChange={e => setNomeCampanha(e.target.value)}
                  placeholder="Nome da sua campanha"
                  className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#d4af5f,#a8842e)' }}
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Flag size={16} />}
                  Pedir uso da ferramenta
                </button>
              </form>
            </>
          )}

          {canCreateTenant && !semCampanha && (
            <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>
              Você já é dono. Para outra campanha, use o painel quando disponível.
            </p>
          )}

          {okMsg && <p className="text-sm" style={{ color: '#86efac' }}>{okMsg}</p>}
          {erro && <p className="text-sm" style={{ color: '#f87171' }}>{erro}</p>}
        </div>

        {onLogout && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onLogout()
              } catch {
                setBusy(false)
              }
            }}
            className="mt-5 w-full flex items-center justify-center gap-2 text-xs font-semibold disabled:opacity-50"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
            Sair da conta
          </button>
        )}
      </div>
    </div>
  )
}
