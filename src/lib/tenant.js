const PHP_API = typeof window !== 'undefined'
  ? `${window.location.origin}/api.php`
  : '/api.php'

const ACTIVE_TENANT_KEY = 'campanha_active_tenant'
const ACTIVE_TENANT_META = 'campanha_active_tenant_meta'

function isAppDataKey(key) {
  if (!key || key === 'campanha_sync_local_at') return false
  if (
    key === ACTIVE_TENANT_KEY
    || key === ACTIVE_TENANT_META
    || key === 'campanha_theme'
    || key.startsWith('campanha_active_')
    || key.startsWith('campanha_sync_')
  ) return false
  return /^(previsao|agenda|equipe|eleitores|metas|meta|pastores|geo|igrejas|pesquisas|materiais|apoiadores|empresas|mapa|rotas|contrato)/.test(key)
}

export function getStoredTenantId() {
  try { return localStorage.getItem(ACTIVE_TENANT_KEY) || '' } catch { return '' }
}

export function getStoredTenantMeta() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_TENANT_META) || 'null') } catch { return null }
}

export function storeActiveTenant(tenant) {
  if (!tenant?.id) return
  const allowedTabs = tenant.allowedTabs ?? tenant.allowed_tabs ?? null
  const role = tenant.role || 'member'
  const isFullOwner = role === 'owner' && (allowedTabs == null || allowedTabs === undefined)
  const canViewFinance = isFullOwner
    ? true
    : (tenant.canViewFinance ?? tenant.can_view_finance)
  localStorage.setItem(ACTIVE_TENANT_KEY, tenant.id)
  localStorage.setItem(ACTIVE_TENANT_META, JSON.stringify({
    id: tenant.id,
    name: tenant.name || '',
    role,
    allowedTabs: allowedTabs == null ? null : allowedTabs,
    canViewFinance: canViewFinance == null ? true : !!canViewFinance,
  }))
}


export function clearStoredTenant() {
  try {
    localStorage.removeItem(ACTIVE_TENANT_KEY)
    localStorage.removeItem(ACTIVE_TENANT_META)
  } catch { /* ignore */ }
}

/** Remove dados de app do navegador (não mexe na sessão Supabase). */
export function clearAppLocalData() {
  const keys = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k) continue
    if (isAppDataKey(k) || k === 'campanha_sync_local_at') keys.push(k)
  }
  for (const k of keys) {
    try { localStorage.removeItem(k) } catch { /* ignore */ }
  }
}

async function apiAction(accessToken, action, { method = 'GET', body, tenantId } = {}) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
  }
  if (tenantId) headers['X-Tenant-Id'] = tenantId
  if (body != null) headers['Content-Type'] = 'application/json'

  const r = await fetch(`${PHP_API}?action=${encodeURIComponent(action)}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `Erro HTTP ${r.status}`)
  return data
}

export async function fetchMyTenants(accessToken) {
  return apiAction(accessToken, 'me')
}

export async function claimLegacyTenant(accessToken) {
  return apiAction(accessToken, 'claim_legacy', { method: 'POST', body: {} })
}

export async function createTenant(accessToken, name) {
  return apiAction(accessToken, 'create_tenant', { method: 'POST', body: { name } })
}

export async function requestAccess(accessToken, { kind = 'team', campaignName = '', tenantId } = {}) {
  const body = { kind }
  if (campaignName) body.campaign_name = campaignName
  if (tenantId) body.tenant_id = tenantId
  return apiAction(accessToken, 'request_access', {
    method: 'POST',
    body,
  })
}

export async function listAccessRequests(accessToken, tenantId) {
  return apiAction(accessToken, 'access_requests', { tenantId })
}

export async function reviewAccessRequest(accessToken, tenantId, id, decision, { allowedTabs, canViewFinance } = {}) {
  const body = { id, decision }
  if (allowedTabs !== undefined) body.allowed_tabs = allowedTabs
  if (canViewFinance !== undefined) body.can_view_finance = !!canViewFinance
  return apiAction(accessToken, 'access_review', {
    method: 'POST',
    tenantId,
    body,
  })
}

export async function listCandidates(accessToken, tenantId) {
  return apiAction(accessToken, 'list_candidates', { tenantId })
}

export async function updateCandidate(accessToken, tenantId, {
  targetTenantId, email, allowedTabs, canViewFinance,
} = {}) {
  return apiAction(accessToken, 'update_candidate', {
    method: 'POST',
    tenantId,
    body: {
      target_tenant_id: targetTenantId,
      email,
      allowed_tabs: allowedTabs,
      can_view_finance: !!canViewFinance,
    },
  })
}

export async function listMembers(accessToken, tenantId) {
  return apiAction(accessToken, 'members', { tenantId })
}

export async function inviteMember(accessToken, tenantId, email, role = 'member', allowedTabs = null, canViewFinance = false, password = '') {
  const body = {
    email,
    role,
    allowed_tabs: allowedTabs,
    can_view_finance: !!canViewFinance,
  }
  if (password) body.password = password
  return apiAction(accessToken, 'invite', {
    method: 'POST',
    tenantId,
    body,
  })
}

export async function setMemberPassword(accessToken, tenantId, email, password) {
  return apiAction(accessToken, 'set_member_password', {
    method: 'POST',
    tenantId,
    body: { email, password },
  })
}

export async function fetchInviteInfo(token) {
  const r = await fetch(`${PHP_API}?action=invite_info&token=${encodeURIComponent(token)}`)
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `Erro HTTP ${r.status}`)
  return data
}

export async function claimInvite(accessToken, token) {
  return apiAction(accessToken, 'invite_claim', {
    method: 'POST',
    body: { token },
  })
}

export async function listPendingChanges(accessToken, tenantId) {
  return apiAction(accessToken, 'pending_list', { tenantId })
}

export async function reviewPendingChange(accessToken, tenantId, id, decision) {
  return apiAction(accessToken, 'pending_review', {
    method: 'POST',
    tenantId,
    body: { id, decision },
  })
}

export async function rejectAllPending(accessToken, tenantId) {
  return apiAction(accessToken, 'pending_reject_all', {
    method: 'POST',
    tenantId,
    body: {},
  })
}

export async function submitPendingChange(accessToken, tenantId, { key, value, changeAction = 'set' }) {
  return apiAction(accessToken, 'submit_pending', {
    method: 'POST',
    tenantId,
    body: { key, value, change_action: changeAction },
  })
}

export async function updateMemberAccess(accessToken, tenantId, email, { role, allowedTabs, canViewFinance } = {}) {
  const body = { email }
  if (role != null) body.role = role
  if (allowedTabs !== undefined) body.allowed_tabs = allowedTabs
  if (canViewFinance !== undefined) body.can_view_finance = !!canViewFinance
  return apiAction(accessToken, 'update_member', {
    method: 'POST',
    tenantId,
    body,
  })
}

export async function removeMember(accessToken, tenantId, email) {
  return apiAction(accessToken, 'remove_member', {
    method: 'POST',
    tenantId,
    body: { email },
  })
}

/** Link público de cadastro de apoiadores (cria se ainda não existir). */
export async function getLeadFormLink(accessToken, tenantId) {
  return apiAction(accessToken, 'lead_form_link', { tenantId })
}

export async function updateLeadFormLink(accessToken, tenantId, { whatsapp, titulo, active, config, slug } = {}) {
  const body = {}
  if (whatsapp != null) body.whatsapp = whatsapp
  if (titulo != null) body.titulo = titulo
  if (active != null) body.active = active
  if (config != null) body.config = config
  if (slug != null) body.slug = slug
  return apiAction(accessToken, 'lead_form_link', {
    method: 'POST',
    tenantId,
    body,
  })
}

