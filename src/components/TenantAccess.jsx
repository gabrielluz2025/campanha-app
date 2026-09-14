import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, UserPlus, Loader2, Shield, Pencil, Check, Wallet, Ban, Clock, CheckCircle2, XCircle, KeyRound, Search, Users, Crown } from 'lucide-react'
import { inviteMember, listMembers, removeMember, updateMemberAccess, listAccessRequests, reviewAccessRequest, setMemberPassword, listCandidates, updateCandidate } from '../lib/tenant'
import {
  ABAS_ACESSO, ABAS_ACESSO_IDS, ABAS_PADRAO_CANDIDATO, MSG_FINANCEIRO,
  parseAllowedTabs, parseCanViewFinance, tabsNeedFinancePrompt, compactAllowedTabs,
} from '../utils/acessoAbas'
import { confirmAction } from '../utils/confirm'

function AbasCheckboxes({ selected, onChange, disabled, onFinanceHint }) {
  const allOn = selected.length === ABAS_ACESSO_IDS.length

  async function toggle(id) {
    if (disabled) return
    const on = selected.includes(id)
    if (on) {
      onChange(selected.filter(x => x !== id))
      return
    }
    const next = [...selected, id]
    onChange(next)
    if (onFinanceHint && tabsNeedFinancePrompt([id])) {
      onFinanceHint(next)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold" style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Abas liberadas
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(allOn ? [] : [...ABAS_ACESSO_IDS])}
          className="text-xs font-semibold px-2 py-0.5 rounded-lg"
          style={{ color: '#93c5fd', background: 'rgba(59,130,246,0.12)' }}
        >
          {allOn ? 'Limpar' : 'Todas'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-1">
        {ABAS_ACESSO.map(aba => {
          const on = selected.includes(aba.id)
          return (
            <label
              key={aba.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer"
              style={{
                background: on ? 'rgba(37,99,235,0.18)' : 'var(--bg-raised)',
                border: `1px solid ${on ? 'rgba(37,99,235,0.4)' : 'var(--border-subtle)'}`,
                opacity: disabled ? 0.6 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={disabled}
                onChange={() => toggle(aba.id)}
                className="accent-blue-500"
              />
              <span className="text-xs font-semibold truncate" style={{ color: on ? '#fff' : 'var(--text-secondary)' }}>
                {aba.label}
              </span>
            </label>
          )
        })}
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>
        {selected.length} de {ABAS_ACESSO_IDS.length} abas · dá para liberar ou retirar a qualquer momento
      </p>
      <p style={{ fontSize: 10, color: 'var(--text-faint)', lineHeight: 1.4 }}>
        Dica: marque só <strong style={{ color: 'var(--text-tertiary)' }}>Contratos</strong> para a pessoa ver apenas essa área (sem o restante da Equipe).
      </p>
    </div>
  )
}

function FinanceToggle({ checked, onChange, disabled }) {
  async function handleToggle() {
    if (disabled) return
    if (checked) {
      const ok = await confirmAction({
        title: 'Retirar área financeira?',
        message: 'A pessoa deixará de ver valores em R$, salários, pagamentos, orçamento e relatórios financeiros — mesmo nas abas ainda liberadas.',
        confirmLabel: 'Retirar financeiro',
        danger: true,
      })
      if (ok) onChange(false)
      return
    }
    const ok = await confirmAction({
      title: 'Liberar área financeira?',
      message: MSG_FINANCEIRO,
      confirmLabel: 'Sim, liberar',
      cancelLabel: 'Não',
      danger: false,
    })
    if (ok) onChange(true)
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleToggle}
      className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-opacity disabled:opacity-60"
      style={{
        background: checked ? 'rgba(245,158,11,0.14)' : 'var(--bg-raised)',
        border: `1px solid ${checked ? 'rgba(245,158,11,0.45)' : 'var(--border-subtle)'}`,
      }}
    >
      <Wallet size={16} className="mt-0.5 flex-shrink-0" style={{ color: checked ? '#fbbf24' : 'var(--text-tertiary)' }} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold" style={{ color: checked ? '#fde68a' : 'var(--text-primary)' }}>
          {checked ? 'Área financeira liberada' : 'Área financeira bloqueada'}
        </p>
        <p style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.4, marginTop: 2 }}>
          Previsão, salários, pagamentos, valores de empresas, caixa no Dashboard e relatórios em R$.
        </p>
      </div>
      <span
        className="text-[10px] font-bold px-2 py-0.5 rounded-md flex-shrink-0"
        style={{
          color: checked ? '#78350f' : 'var(--text-tertiary)',
          background: checked ? '#fbbf24' : 'rgba(255,255,255,0.06)',
        }}
      >
        {checked ? 'SIM' : 'NÃO'}
      </span>
    </button>
  )
}

const inpStyle = {
  background: 'var(--bg-raised, #1a1a28)',
  border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
  color: 'var(--text-primary, #fff)',
}

function PasswordFields({ password, password2, onPassword, onPassword2, disabled, hint }) {
  return (
    <div className="space-y-2">
      <p className="font-bold" style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Senha de acesso
      </p>
      <input
        type="password"
        value={password}
        onChange={e => onPassword(e.target.value)}
        placeholder="Senha (mín. 6 caracteres)"
        autoComplete="new-password"
        disabled={disabled}
        className="w-full rounded-xl px-3 py-2.5 text-sm"
        style={inpStyle}
      />
      <input
        type="password"
        value={password2}
        onChange={e => onPassword2(e.target.value)}
        placeholder="Confirmar senha"
        autoComplete="new-password"
        disabled={disabled}
        className="w-full rounded-xl px-3 py-2.5 text-sm"
        style={inpStyle}
      />
      {hint && (
        <p style={{ fontSize: 10, color: 'var(--text-faint)', lineHeight: 1.4 }}>{hint}</p>
      )}
    </div>
  )
}

function normalizeMember(m) {
  if (!m || typeof m !== 'object') return null
  const allowed = parseAllowedTabs(m.allowed_tabs ?? m.allowedTabs)
  const finance = parseCanViewFinance(m.can_view_finance ?? m.canViewFinance, m.role, allowed)
  return {
    ...m,
    email: String(m.email || '').toLowerCase(),
    allowedTabs: allowed,
    canViewFinance: finance,
  }
}

export default function TenantAccess({ open, onClose, accessToken, tenant, userEmail, isPlatformAdmin = false }) {
  const [members, setMembers] = useState([])
  const [requests, setRequests] = useState([])
  const [candidates, setCandidates] = useState([])
  const [buscaCand, setBuscaCand] = useState('')
  const [email, setEmail] = useState('')
  const [inviteTabs, setInviteTabs] = useState([...ABAS_ACESSO_IDS])
  const [inviteFinance, setInviteFinance] = useState(false)
  const [invitePassword, setInvitePassword] = useState('')
  const [invitePassword2, setInvitePassword2] = useState('')
  const [inviteAsOwner, setInviteAsOwner] = useState(false)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [editingEmail, setEditingEmail] = useState(null)
  const [editTabs, setEditTabs] = useState([])
  const [editFinance, setEditFinance] = useState(false)
  const [passwordEmail, setPasswordEmail] = useState(null)
  const [memberPassword, setMemberPassword] = useState('')
  const [memberPassword2, setMemberPassword2] = useState('')
  /** Pedido em revisão com escolha de módulos */
  const [aprovarReq, setAprovarReq] = useState(null)
  const [aprovTabs, setAprovTabs] = useState([...ABAS_PADRAO_CANDIDATO])
  const [aprovFinance, setAprovFinance] = useState(false)
  const [editCand, setEditCand] = useState(null)

  const isOwner = tenant?.role === 'owner'

  async function reloadMembers() {
    const res = await listMembers(accessToken, tenant.id)
    setMembers((res.members || []).map(normalizeMember).filter(Boolean))
  }

  async function reloadRequests() {
    if (!isOwner) { setRequests([]); return }
    const res = await listAccessRequests(accessToken, tenant.id)
    setRequests(res.requests || [])
  }

  async function reloadCandidates() {
    if (!isPlatformAdmin) { setCandidates([]); return }
    try {
      const res = await listCandidates(accessToken, tenant.id)
      setCandidates(Array.isArray(res.candidates) ? res.candidates : [])
    } catch {
      setCandidates([])
    }
  }

  useEffect(() => {
    if (!open || !accessToken || !tenant?.id) return
    let cancel = false
    setErro('')
    setEditingEmail(null)
    setPasswordEmail(null)
    setEditCand(null)
    setBuscaCand('')
    Promise.all([
      listMembers(accessToken, tenant.id),
      isOwner ? listAccessRequests(accessToken, tenant.id).catch(() => ({ requests: [] })) : Promise.resolve({ requests: [] }),
      isPlatformAdmin ? listCandidates(accessToken, tenant.id).catch(() => ({ candidates: [] })) : Promise.resolve({ candidates: [] }),
    ])
      .then(([mem, acc, cands]) => {
        if (cancel) return
        setMembers((mem.members || []).map(normalizeMember).filter(Boolean))
        setRequests(Array.isArray(acc.requests) ? acc.requests : [])
        setCandidates(Array.isArray(cands.candidates) ? cands.candidates : [])
      })
      .catch(err => { if (!cancel) setErro(err.message) })
    return () => { cancel = true }
  }, [open, accessToken, tenant?.id, isOwner, isPlatformAdmin])

  async function revisarPedido(req, decision, opts = {}) {
    setErro(''); setOk('')
    setBusy(true)
    try {
      const tabs = compactAllowedTabs(opts.allowedTabs)
      if (decision === 'approve' && Array.isArray(tabs) && tabs.length === 0) {
        setErro('Selecione ao menos uma aba para liberar.')
        setBusy(false)
        return
      }
      await reviewAccessRequest(accessToken, tenant.id, req.id, decision, {
        allowedTabs: decision === 'approve' ? tabs : null,
        canViewFinance: decision === 'approve' ? !!opts.canViewFinance : false,
      })
      setOk(decision === 'approve'
        ? (req.kind === 'tool'
          ? `Ferramenta liberada para ${req.email} com os módulos escolhidos.`
          : `Acesso à equipe liberado para ${req.email}.`)
        : `Pedido de ${req.email} recusado.`)
      setAprovarReq(null)
      await reloadRequests()
      if (decision === 'approve' && req.kind !== 'tool') await reloadMembers()
      if (decision === 'approve' && req.kind === 'tool') await reloadCandidates()
    } catch (err) {
      setErro(err.message || 'Falha ao revisar pedido.')
    } finally {
      setBusy(false)
    }
  }

  function abrirAprovacao(req) {
    setErro('')
    setAprovarReq(req)
    if (req.kind === 'tool') {
      setAprovTabs([...ABAS_PADRAO_CANDIDATO])
      setAprovFinance(false)
    } else {
      setAprovTabs([...ABAS_ACESSO_IDS])
      setAprovFinance(false)
    }
  }

  function abrirEdicaoCand(c) {
    setEditCand(c)
    setEditTabs(c.allowedTabs == null ? [...ABAS_ACESSO_IDS] : [...(c.allowedTabs || [])])
    setEditFinance(!!c.canViewFinance)
    setErro(''); setOk('')
  }

  async function salvarEdicaoCand() {
    if (!editCand) return
    setBusy(true)
    setErro(''); setOk('')
    try {
      const tabs = compactAllowedTabs(editTabs)
      if (Array.isArray(tabs) && tabs.length === 0) {
        setErro('Selecione ao menos uma aba.')
        setBusy(false)
        return
      }
      await updateCandidate(accessToken, tenant.id, {
        targetTenantId: editCand.tenantId || editCand.tenant_id,
        email: editCand.email,
        allowedTabs: tabs,
        canViewFinance: editFinance,
      })
      setOk(`Módulos de ${editCand.name || editCand.email} atualizados.`)
      setEditCand(null)
      await reloadCandidates()
    } catch (err) {
      setErro(err.message || 'Falha ao atualizar candidato.')
    } finally {
      setBusy(false)
    }
  }

  async function maybeAskFinance(currentFinance, setFinance) {
    if (currentFinance) return
    const yes = await confirmAction({
      title: 'Liberar área financeira?',
      message: MSG_FINANCEIRO,
      confirmLabel: 'Sim, liberar',
      cancelLabel: 'Só as abas',
      danger: false,
    })
    if (yes) setFinance(true)
  }

  function checkPasswords(pw, pw2) {
    if (!pw && !pw2) return null
    if (pw.length < 6) return 'A senha precisa ter ao menos 6 caracteres.'
    if (pw !== pw2) return 'As senhas não coincidem.'
    return null
  }

  async function tornarDono(target) {
    setErro(''); setOk('')
    const ok2 = await confirmAction({
      title: 'Tornar co-dono?',
      message: `${target} terá acesso total à campanha como co-dono (mesmos poderes que você). Continuar?`,
      confirmLabel: 'Sim, tornar co-dono',
      danger: true,
    })
    if (!ok2) return
    setBusy(true)
    try {
      await updateMemberAccess(accessToken, tenant.id, target, { role: 'owner' })
      setOk(`${target} agora é co-dono da campanha.`)
      await reloadMembers()
    } catch (err) {
      setErro(err.message || 'Falha ao promover.')
    } finally {
      setBusy(false)
    }
  }

  async function convidar(e) {
    e.preventDefault()
    setErro(''); setOk('')
    if (!isOwner) { setErro('Apenas o dono pode convidar.'); return }

    // Ao convidar como dono, não exige abas selecionadas
    if (!inviteAsOwner && !inviteTabs.length) { setErro('Selecione ao menos uma aba.'); return }

    const pwErr = checkPasswords(invitePassword, invitePassword2)
    if (pwErr) { setErro(pwErr); return }

    if (inviteAsOwner) {
      // Confirmar promoção direta a dono
      const confirmOwner = await confirmAction({
        title: 'Convidar como co-dono?',
        message: `${email.trim()} terá acesso total à campanha como co-dono. Tem certeza?`,
        confirmLabel: 'Sim, convidar como dono',
        danger: true,
      })
      if (!confirmOwner) return
    }

    let finance = inviteAsOwner ? true : inviteFinance
    if (!inviteAsOwner && !finance && tabsNeedFinancePrompt(inviteTabs)) {
      const yes = await confirmAction({
        title: 'Liberar área financeira?',
        message: 'Você liberou abas que podem mostrar valores em R$. ' + MSG_FINANCEIRO,
        confirmLabel: 'Sim, liberar financeiro',
        cancelLabel: 'Sem financeiro',
        danger: false,
      })
      finance = yes
      setInviteFinance(yes)
    }

    setBusy(true)
    const invitedEmail = email.trim()
    try {
      const res = await inviteMember(
        accessToken,
        tenant.id,
        invitedEmail,
        inviteAsOwner ? 'owner' : 'member',
        inviteAsOwner ? null : inviteTabs,
        inviteAsOwner ? true : finance,
        invitePassword || '',
      )
      setEmail('')
      setInviteTabs([...ABAS_ACESSO_IDS])
      setInviteFinance(false)
      setInvitePassword('')
      setInvitePassword2('')
      setInviteAsOwner(false)
      if (res.password_set) {
        setOk(`Acesso liberado com senha definida. Passe o e-mail e a senha para ${invitedEmail}.`)
      } else {
        const link = res.invite_url || ''
        if (link) {
          try { await navigator.clipboard.writeText(link) } catch { /* ignore */ }
        }
        if (res.email_sent) {
          setOk('Convite ok — e-mail enviado pedindo para criar a senha.' + (link ? ' Link também copiado.' : ''))
        } else {
          setOk(link
            ? 'Convite ok — e-mail pode não ter chegado. Link copiado: envie para a pessoa criar a senha.'
            : 'Convite registrado. Peça para a pessoa criar conta com esse e-mail.')
        }
      }
      await reloadMembers()
    } catch (err) {
      setErro(err.message || 'Falha ao convidar.')
    } finally {
      setBusy(false)
    }
  }

  async function cortarAcesso(target) {
    setErro(''); setOk('')
    const okCut = await confirmAction({
      title: 'Cortar acesso?',
      message: `${target} perderá o acesso a esta campanha imediatamente. Você pode convidar de novo depois.`,
      confirmLabel: 'Cortar acesso',
      danger: true,
    })
    if (!okCut) return
    setBusy(true)
    try {
      await removeMember(accessToken, tenant.id, target)
      setMembers(m => m.filter(x => x.email !== target))
      if (editingEmail === target) setEditingEmail(null)
      if (passwordEmail === target) setPasswordEmail(null)
      setOk('Acesso cortado.')
    } catch (err) {
      setErro(err.message || 'Falha ao cortar acesso.')
    } finally {
      setBusy(false)
    }
  }

  function abrirEdicao(m) {
    if (m.role === 'owner') return
    setEditingEmail(m.email)
    setPasswordEmail(null)
    setEditTabs(m.allowedTabs == null ? [...ABAS_ACESSO_IDS] : [...m.allowedTabs])
    setEditFinance(!!m.canViewFinance)
    setErro(''); setOk('')
  }

  function abrirSenha(m) {
    if (m.role === 'owner' && m.email !== String(userEmail || '').toLowerCase()) return
    setPasswordEmail(m.email)
    setEditingEmail(null)
    setMemberPassword('')
    setMemberPassword2('')
    setErro(''); setOk('')
  }

  async function salvarSenha() {
    if (!passwordEmail) return
    const pwErr = checkPasswords(memberPassword, memberPassword2)
    if (pwErr) { setErro(pwErr); return }
    if (!memberPassword) { setErro('Informe a senha.'); return }
    setBusy(true)
    setErro(''); setOk('')
    try {
      await setMemberPassword(accessToken, tenant.id, passwordEmail, memberPassword)
      setOk(`Senha definida para ${passwordEmail}. Passe a senha para a pessoa.`)
      setPasswordEmail(null)
      setMemberPassword('')
      setMemberPassword2('')
    } catch (err) {
      setErro(err.message || 'Falha ao definir senha.')
    } finally {
      setBusy(false)
    }
  }

  async function salvarEdicao() {
    if (!editingEmail) return
    if (!editTabs.length) { setErro('Selecione ao menos uma aba (ou corte o acesso).'); return }

    let finance = editFinance
    if (!finance && tabsNeedFinancePrompt(editTabs)) {
      const yes = await confirmAction({
        title: 'Liberar área financeira?',
        message: 'Há abas com área financeira. ' + MSG_FINANCEIRO,
        confirmLabel: 'Sim, liberar',
        cancelLabel: 'Manter bloqueado',
        danger: false,
      })
      finance = yes
      setEditFinance(yes)
    }

    setBusy(true)
    setErro(''); setOk('')
    try {
      await updateMemberAccess(accessToken, tenant.id, editingEmail, {
        allowedTabs: editTabs,
        canViewFinance: finance,
      })
      setOk(`Permissões atualizadas para ${editingEmail}.`)
      setEditingEmail(null)
      await reloadMembers()
    } catch (err) {
      setErro(err.message || 'Falha ao atualizar permissões.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Acesso à campanha"
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        zIndex: 10000,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
        style={{
          background: 'var(--bg-surface, #141420)',
          border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
          boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-bold text-white text-sm">Acesso à campanha</p>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              {tenant?.name} · equipe, candidatos e módulos
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-tertiary)' }}>
            <X size={16} />
          </button>
        </div>

        {isOwner && requests.length > 0 && (
          <div className="mb-4 space-y-2">
            <p className="font-bold flex items-center gap-1.5" style={{ fontSize: 11, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <Clock size={12} /> Pedidos aguardando ({requests.length})
            </p>
            {requests.map(req => {
              const expandido = aprovarReq?.id === req.id
              return (
              <div
                key={req.id || req.email}
                className="flex flex-col gap-2 px-3 py-2.5 rounded-xl"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)' }}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{req.email}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {req.kind === 'tool'
                        ? `Quer usar a ferramenta · campanha “${req.campaign_name || '—'}”`
                        : 'Quer entrar na sua equipe'}
                      {req.created_at ? ` · ${new Date(req.created_at).toLocaleString('pt-BR')}` : ''}
                    </p>
                  </div>
                </div>

                {expandido && (
                  <div className="rounded-xl px-2.5 py-2 space-y-2"
                    style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <p className="font-bold" style={{ fontSize: 11, color: '#fde68a' }}>
                      {req.kind === 'tool'
                        ? 'Quais módulos este candidato poderá usar?'
                        : 'Quais abas esta pessoa poderá usar?'}
                    </p>
                    <AbasCheckboxes
                      selected={aprovTabs}
                      onChange={setAprovTabs}
                      disabled={busy}
                      onFinanceHint={() => maybeAskFinance(aprovFinance, setAprovFinance)}
                    />
                    <FinanceToggle
                      checked={aprovFinance}
                      onChange={setAprovFinance}
                      disabled={busy}
                    />
                    <div className="flex items-center gap-1.5 justify-end pt-1">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setAprovarReq(null)}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={busy || aprovTabs.length === 0}
                        onClick={() => revisarPedido(req, 'approve', {
                          allowedTabs: aprovTabs,
                          canViewFinance: aprovFinance,
                        })}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-white disabled:opacity-40"
                        style={{ background: 'linear-gradient(135deg,#059669,#047857)' }}
                      >
                        {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        Confirmar liberação
                      </button>
                    </div>
                  </div>
                )}

                {!expandido && (
                <div className="flex items-center gap-1.5 justify-end">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => abrirAprovacao(req)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-white"
                    style={{ background: 'linear-gradient(135deg,#059669,#047857)' }}
                  >
                    <CheckCircle2 size={12} />
                    {req.kind === 'tool' ? 'Escolher módulos' : 'Escolher abas'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => revisarPedido(req, 'reject')}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold"
                    style={{ color: '#fca5a5', background: 'rgba(239,68,68,0.12)' }}
                  >
                    <XCircle size={12} /> Recusar
                  </button>
                </div>
                )}
              </div>
              )
            })}
          </div>
        )}

        {isPlatformAdmin && (
          <div className="mb-4 space-y-2">
            <p className="font-bold flex items-center gap-1.5" style={{ fontSize: 11, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <Users size={12} /> Candidatos liberados ({candidates.length})
            </p>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
              <input
                value={buscaCand}
                onChange={e => setBuscaCand(e.target.value)}
                placeholder="Buscar por nome da campanha ou e-mail…"
                className="w-full rounded-xl pl-8 pr-3 py-2 text-xs"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            {candidates.length === 0 ? (
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Nenhum candidato liberado ainda. Quando alguém pedir a ferramenta e você aprovar, aparece aqui.
              </p>
            ) : (
              candidates
                .filter(c => {
                  const q = String(buscaCand || '').trim().toLowerCase()
                  if (!q) return true
                  return String(c.name || '').toLowerCase().includes(q)
                    || String(c.email || '').toLowerCase().includes(q)
                })
                .map(c => {
                  const editing = editCand && (editCand.tenantId || editCand.tenant_id) === (c.tenantId || c.tenant_id)
                    && editCand.email === c.email
                  const tabsLabel = c.allowedTabs == null
                    ? 'Todas as abas'
                    : `${c.allowedTabs.length} módulo${c.allowedTabs.length !== 1 ? 's' : ''}`
                  return (
                    <div key={`${c.tenantId}-${c.email}`} className="rounded-xl overflow-hidden"
                      style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)' }}>
                      <div className="flex items-center gap-2 px-3 py-2">
                        <Shield size={14} style={{ color: '#93c5fd' }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white truncate">{c.name || 'Campanha'}</p>
                          <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                            {c.email} · {tabsLabel} {c.canViewFinance ? '· financeiro' : '· sem financeiro'}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => (editing ? setEditCand(null) : abrirEdicaoCand(c))}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold"
                          style={{ color: '#93c5fd', background: 'rgba(59,130,246,0.2)' }}
                        >
                          <Pencil size={12} /> {editing ? 'Fechar' : 'Módulos'}
                        </button>
                      </div>
                      {editing && (
                        <div className="px-3 pb-3 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          <AbasCheckboxes
                            selected={editTabs}
                            onChange={setEditTabs}
                            disabled={busy}
                            onFinanceHint={() => maybeAskFinance(editFinance, setEditFinance)}
                          />
                          <FinanceToggle checked={editFinance} onChange={setEditFinance} disabled={busy} />
                          <button
                            type="button"
                            disabled={busy || editTabs.length === 0}
                            onClick={salvarEdicaoCand}
                            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold text-white disabled:opacity-40"
                            style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}
                          >
                            {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            Salvar módulos do candidato
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })
            )}
            {buscaCand.trim() && candidates.every(c => {
              const q = buscaCand.trim().toLowerCase()
              return !String(c.name || '').toLowerCase().includes(q)
                && !String(c.email || '').toLowerCase().includes(q)
            }) && (
              <p style={{ fontSize: 11, color: '#fbbf24' }}>
                Nenhum resultado para “{buscaCand.trim()}”. Confira o nome da campanha ou o e-mail usado no pedido.
              </p>
            )}
          </div>
        )}

        <p className="font-bold mb-2" style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Equipe desta campanha
        </p>

        <ul className="space-y-2 mb-4">
          {members.filter(Boolean).map(m => {
            const editing = editingEmail === m.email
            const settingPw = passwordEmail === m.email
            const tabsLabel = m.allowedTabs == null
              ? 'Todas as abas'
              : `${m.allowedTabs.length} aba${m.allowedTabs.length !== 1 ? 's' : ''}`
            const finLabel = m.canViewFinance ? '· financeiro' : '· sem financeiro'
            const canManage = isOwner && m.email !== String(userEmail || '').toLowerCase() && (
              m.role !== 'owner' || m.allowedTabs != null
            )
            const canMakeOwner = isOwner && m.role !== 'owner' && m.email !== String(userEmail || '').toLowerCase()
            return (
              <li key={m.email || m.id} className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-raised, #1a1a28)' }}>
                <div className="flex items-center gap-2 px-3 py-2">
                  <Shield size={14} style={{ color: m.role === 'owner' ? '#fbbf24' : 'var(--text-tertiary)' }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white truncate">{m.email}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                      {m.role === 'owner' ? 'Dono' : 'Membro'} · {tabsLabel} {finLabel}
                    </p>
                  </div>
                  {(canManage || canMakeOwner) && (
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      {canMakeOwner && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => tornarDono(m.email)}
                          title="Tornar co-dono"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold"
                          style={{ color: '#fbbf24', background: 'rgba(251,191,36,0.12)' }}
                        >
                          <Crown size={12} />
                          Co-dono
                        </button>
                      )}
                      {canManage && <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => (settingPw ? setPasswordEmail(null) : abrirSenha(m))}
                          title="Definir senha"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold"
                          style={{ color: '#fde68a', background: 'rgba(245,158,11,0.14)' }}
                        >
                          <KeyRound size={12} />
                          {settingPw ? 'Fechar' : 'Senha'}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => (editing ? setEditingEmail(null) : abrirEdicao(m))}
                          title="Editar permissões"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold"
                          style={{ color: '#93c5fd', background: 'rgba(59,130,246,0.12)' }}
                        >
                          <Pencil size={12} />
                          {editing ? 'Fechar' : 'Abas'}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => cortarAcesso(m.email)}
                          title="Cortar acesso"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold"
                          style={{ color: '#fca5a5', background: 'rgba(239,68,68,0.12)' }}
                        >
                          <Ban size={12} />
                          Cortar
                        </button>
                      </>}
                    </div>
                  )}
                </div>
                {settingPw && (
                  <div className="px-3 pb-3 pt-1 space-y-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <PasswordFields
                      password={memberPassword}
                      password2={memberPassword2}
                      onPassword={setMemberPassword}
                      onPassword2={setMemberPassword2}
                      disabled={busy}
                      hint="A pessoa entra em campanha.space com este e-mail e a senha que você definir."
                    />
                    <button type="button" disabled={busy} onClick={salvarSenha}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg,#d97706,#b45309)' }}>
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                      Salvar senha
                    </button>
                  </div>
                )}
                {editing && (
                  <div className="px-3 pb-3 pt-1 space-y-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <AbasCheckboxes
                      selected={editTabs}
                      onChange={setEditTabs}
                      disabled={busy}
                      onFinanceHint={() => maybeAskFinance(editFinance, setEditFinance)}
                    />
                    <FinanceToggle checked={editFinance} onChange={setEditFinance} disabled={busy} />
                    <button type="button" disabled={busy} onClick={salvarEdicao}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg,#059669,#047857)' }}>
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Salvar permissões
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {isOwner ? (
          <form onSubmit={convidar} className="space-y-3">
            <p className="font-bold" style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Novo convite
            </p>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@equipe.com"
              className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={inpStyle}
              required
            />
            {/* Toggle: convidar como co-dono */}
            <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-xl"
              style={{ background: inviteAsOwner ? 'rgba(234,179,8,0.12)' : 'var(--bg-raised)', border: `1px solid ${inviteAsOwner ? 'rgba(234,179,8,0.4)' : 'var(--border-subtle)'}` }}>
              <input type="checkbox" checked={inviteAsOwner} disabled={busy}
                onChange={e => setInviteAsOwner(e.target.checked)} className="accent-yellow-400" />
              <Crown size={13} style={{ color: inviteAsOwner ? '#facc15' : 'var(--text-tertiary)' }} />
              <span className="text-xs font-semibold" style={{ color: inviteAsOwner ? '#facc15' : 'var(--text-secondary)' }}>
                Convidar como co-dono (acesso total)
              </span>
            </label>
            <PasswordFields
              password={invitePassword}
              password2={invitePassword2}
              onPassword={setInvitePassword}
              onPassword2={setInvitePassword2}
              disabled={busy}
              hint="Preencha para você criar a senha. Deixe em branco para a pessoa criar pelo link do convite."
            />
            {!inviteAsOwner && <>
              <AbasCheckboxes
                selected={inviteTabs}
                onChange={setInviteTabs}
                disabled={busy}
                onFinanceHint={() => maybeAskFinance(inviteFinance, setInviteFinance)}
              />
              <FinanceToggle checked={inviteFinance} onChange={setInviteFinance} disabled={busy} />
            </>}
            {inviteAsOwner && (
              <p className="text-xs px-1" style={{ color: '#fbbf24' }}>
                ⚠️ Co-dono tem acesso completo a todos os módulos e pode gerenciar membros.
              </p>
            )}
            <button type="submit" disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
              style={{ background: inviteAsOwner ? 'linear-gradient(135deg,#b45309,#92400e)' : 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : inviteAsOwner ? <Crown size={15} /> : <UserPlus size={15} />}
              {inviteAsOwner ? 'Convidar como co-dono' : invitePassword ? 'Convidar com senha' : 'Convidar'}
            </button>
          </form>
        ) : (
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Peça ao dono da campanha para gerenciar acessos.
          </p>
        )}

        {erro && <p className="text-xs mt-3" style={{ color: '#f87171' }}>{erro}</p>}
        {ok && <p className="text-xs mt-3" style={{ color: '#34d399' }}>{ok}</p>}
      </div>
    </div>,
    document.body,
  )
}
