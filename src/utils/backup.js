// Backup resiliente: snapshot local + nuvem, restauração controlada.

import { getPhpAuthContext } from '../lib/cloudSync'

const PHP_API = typeof window !== 'undefined'
  ? `${window.location.origin}/api.php`
  : '/api.php'

/** Chaves que mais doem se sumirem — entram em todo snapshot. */
export const CRITICAL_BACKUP_KEYS = [
  'materiais_estoque',
  'materiais_distribuicao',
  'materiais_entradas',
  'materiais_retiradas',
  'materiais_coordenadores',
  'materiais_retirada_cfg',
  'materiais_removidos',
  'materiais_distribuicao_removidos',
  'materiais_retiradas_removidos',
  'materiais_categorias',
  'rotas_logistica',
  'rotas_logistica_removidos',
  'rotas_ativa_id',
  'rotas_compartilhamentos',
  'equipe_membros',
  'equipe_tarefas',
  'equipe_removidos',
  'igrejas_visitas',
  'igrejas_custom',
  'igrejas_enrich',
  'igrejas_overrides',
  'igrejas_notas',
  'igrejas_prioridades',
  'geo_coords_igrejas',
  'pastores_igrejas',
  'apoiadores_lista',
  'apoiadores_removidos',
  'apoiadores_interacoes',
  'agenda_eventos',
  'previsao_data',
  'eleitores_data',
  'metas_zona',
  'metas_cidade',
  'meta_global_votos',
  'empresas_lista',
  'tesouraria_movimentos',
  'tesouraria_conta',
]

const CACHE_SKIP = /_(cache|ack)$|^igrejas_google|^igrejas_osm|^igrejas_overpass|^geo_bairro_cache/

const LOCAL_META_KEY = 'campanha_backup_meta'
const LOCAL_SNAP_PREFIX = 'campanha_backup_snap_'
const MAX_LOCAL_SNAPS = 5
const DAILY_KEY = 'campanha_backup_daily_ymd'

// Prefixos/chaves usadas pelos módulos do app (export completo arquivo).
const APP_KEYS = [
  'previsao_data',
  'agenda_eventos', 'agenda_compartilhamentos',
  'equipe_membros', 'equipe_tarefas',
  'eleitores_data', 'metas_zona', 'metas_cidade', 'meta_global_votos',
  'pastores_igrejas', 'geo_coords_igrejas', 'igrejas_visitas',
  'igrejas_notas', 'igrejas_prioridades', 'igrejas_custom', 'igrejas_overrides', 'igrejas_enrich',
  'igrejas_rota', 'rotas_paradas',
  'rotas_logistica', 'rotas_ativa_id', 'rotas_logistica_removidos', 'rotas_compartilhamentos',
  'equipe_removidos', 'equipe_contratos_config', 'equipe_contratos_rascunhos',
  'pesquisas_enquetes', 'pesquisas_respostas', 'pesquisas_manchetes',
  'materiais_estoque', 'materiais_distribuicao', 'materiais_removidos',
  'materiais_coordenadores', 'materiais_retiradas', 'materiais_retirada_cfg',
  'materiais_entradas', 'materiais_categorias',
  'apoiadores_lista', 'apoiadores_interacoes',
  'empresas_lista',
  'tesouraria_movimentos',
  'tesouraria_conta',
]

function coletarChaves(criticasOnly = false) {
  if (criticasOnly) {
    return CRITICAL_BACKUP_KEYS.filter(k => {
      try { return localStorage.getItem(k) != null } catch { return false }
    })
  }
  const presentes = Object.keys(localStorage)
  const set = new Set(APP_KEYS)
  presentes.forEach(k => {
    if (CACHE_SKIP.test(k)) return
    if (
      APP_KEYS.includes(k)
      || /^(previsao|agenda|equipe|eleitores|metas|meta|pastores|geo|igrejas|pesquisas|materiais|apoiadores|empresas|rotas|rota_|tesouraria)/.test(k)
    ) {
      set.add(k)
    }
  })
  return [...set].filter(k => {
    if (CACHE_SKIP.test(k)) return false
    try { return localStorage.getItem(k) !== null } catch { return false }
  })
}

export function coletarDadosBackup({ criticasOnly = false } = {}) {
  const dados = {}
  for (const k of coletarChaves(criticasOnly)) {
    try {
      const v = localStorage.getItem(k)
      if (v != null) dados[k] = v
    } catch { /* ignore */ }
  }
  return dados
}

function authHeaders(extra = {}) {
  const { accessToken, tenantId } = getPhpAuthContext()
  const h = { ...extra }
  if (accessToken) h.Authorization = `Bearer ${accessToken}`
  if (tenantId) h['X-Tenant-Id'] = tenantId
  return h
}

function hasCloudAuth() {
  const { accessToken, tenantId } = getPhpAuthContext()
  return Boolean(accessToken && tenantId)
}

function readLocalMeta() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_META_KEY) || '{"items":[]}')
  } catch {
    return { items: [] }
  }
}

function writeLocalMeta(meta) {
  localStorage.setItem(LOCAL_META_KEY, JSON.stringify(meta))
}

function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function resumoDados(dados) {
  const keys = Object.keys(dados || {})
  let materiais = 0
  let rotas = 0
  let equipe = 0
  try { materiais = JSON.parse(dados.materiais_estoque || '[]')?.length || 0 } catch { /* */ }
  try { rotas = JSON.parse(dados.rotas_logistica || '[]')?.length || 0 } catch { /* */ }
  try { equipe = JSON.parse(dados.equipe_membros || '[]')?.length || 0 } catch { /* */ }
  return { keys: keys.length, materiais, rotas, equipe }
}

/** Snapshot só neste aparelho (últimos 5). */
export function salvarSnapshotLocal({ label = 'Snapshot', kind = 'manual' } = {}) {
  const dados = coletarDadosBackup({ criticasOnly: true })
  const id = uid()
  const snap = {
    id,
    label,
    kind,
    createdAt: new Date().toISOString(),
    resumo: resumoDados(dados),
    dados,
  }
  const meta = readLocalMeta()
  const items = Array.isArray(meta.items) ? meta.items : []
  // grava payload
  try {
    localStorage.setItem(LOCAL_SNAP_PREFIX + id, JSON.stringify(snap))
  } catch (e) {
    // Quota: remove o mais antigo e tenta de novo
    while (items.length) {
      const old = items.shift()
      try { localStorage.removeItem(LOCAL_SNAP_PREFIX + old.id) } catch { /* */ }
      try {
        localStorage.setItem(LOCAL_SNAP_PREFIX + id, JSON.stringify(snap))
        break
      } catch { /* continue */ }
    }
    if (!localStorage.getItem(LOCAL_SNAP_PREFIX + id)) {
      throw new Error('Armazenamento cheio — não deu para salvar snapshot local. Use o backup na nuvem ou baixe o arquivo.')
    }
  }
  items.unshift({
    id,
    label,
    kind,
    createdAt: snap.createdAt,
    resumo: snap.resumo,
    where: 'local',
  })
  while (items.length > MAX_LOCAL_SNAPS) {
    const drop = items.pop()
    try { localStorage.removeItem(LOCAL_SNAP_PREFIX + drop.id) } catch { /* */ }
  }
  writeLocalMeta({ items })
  return snap
}

export function listarSnapshotsLocais() {
  const meta = readLocalMeta()
  return (meta.items || []).map(i => ({ ...i, where: 'local' }))
}

export function carregarSnapshotLocal(id) {
  try {
    const raw = localStorage.getItem(LOCAL_SNAP_PREFIX + id)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function aplicarDadosBackup(dados) {
  if (!dados || typeof dados !== 'object') throw new Error('Backup inválido.')
  let n = 0
  Object.entries(dados).forEach(([k, v]) => {
    if (!k || k.startsWith('_') || k.startsWith('campanha_backup')) return
    if (CACHE_SKIP.test(k)) return
    if (typeof v === 'string') {
      localStorage.setItem(k, v)
      n++
    } else if (v !== undefined) {
      localStorage.setItem(k, JSON.stringify(v))
      n++
    }
  })
  return n
}

/** Exporta arquivo JSON completo (download). */
export function exportarBackup() {
  const dados = coletarDadosBackup({ criticasOnly: false })
  const backup = {
    _app: 'campanha-app',
    _versao: 2,
    _exportadoEm: new Date().toISOString(),
    dados,
  }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  a.href = url
  a.download = `backup-campanha-${stamp}.json`
  a.click()
  URL.revokeObjectURL(url)
  return Object.keys(dados).length
}

export function importarBackup(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result)
        const dados = parsed && parsed.dados ? parsed.dados : parsed
        if (!dados || typeof dados !== 'object') {
          reject(new Error('Arquivo de backup inválido.'))
          return
        }
        const n = aplicarDadosBackup(dados)
        resolve(n)
      } catch {
        reject(new Error('Não foi possível ler o arquivo. Verifique se é um backup válido.'))
      }
    }
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'))
    reader.readAsText(file)
  })
}

/** Envia snapshot crítico para a nuvem (MySQL). */
export async function salvarSnapshotNuvem({ label = 'Snapshot', kind = 'manual' } = {}) {
  if (!hasCloudAuth()) {
    return { ok: false, error: 'Faça login na campanha para salvar na nuvem.' }
  }
  const dados = coletarDadosBackup({ criticasOnly: true })
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 120000)
  try {
    const r = await fetch(`${PHP_API}?action=backup_save`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ label, kind, dados }),
      signal: ctrl.signal,
    })
    clearTimeout(t)
    const data = await r.json().catch(() => ({}))
    if (!r.ok || data.ok === false) {
      return { ok: false, error: data.error || `HTTP ${r.status}` }
    }
    return { ok: true, backup: data.backup, resumo: resumoDados(dados) }
  } catch (e) {
    clearTimeout(t)
    return { ok: false, error: e?.name === 'AbortError' ? 'Timeout ao enviar backup' : (e.message || 'Falha de rede') }
  }
}

export async function listarSnapshotsNuvem() {
  if (!hasCloudAuth()) return { ok: false, items: [], error: 'Sem login' }
  try {
    const r = await fetch(`${PHP_API}?action=backup_list`, {
      headers: authHeaders(),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok || data.ok === false) {
      return { ok: false, items: [], error: data.error || `HTTP ${r.status}` }
    }
    const items = (data.items || []).map(i => ({ ...i, where: 'cloud' }))
    return { ok: true, items }
  } catch (e) {
    return { ok: false, items: [], error: e.message || 'Falha de rede' }
  }
}

export async function baixarSnapshotNuvem(id) {
  if (!hasCloudAuth()) return { ok: false, error: 'Sem login' }
  try {
    const r = await fetch(`${PHP_API}?action=backup_get&id=${encodeURIComponent(id)}`, {
      headers: authHeaders(),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok || data.ok === false) {
      return { ok: false, error: data.error || `HTTP ${r.status}` }
    }
    return { ok: true, backup: data.backup }
  } catch (e) {
    return { ok: false, error: e.message || 'Falha de rede' }
  }
}

/**
 * Salva snapshot local + nuvem.
 * kind: 'manual' | 'daily' | 'pre_deploy'
 */
export async function criarSnapshotSeguro({ label, kind = 'manual' } = {}) {
  const lab = label || (kind === 'daily'
    ? `Backup diário ${new Date().toLocaleDateString('pt-BR')}`
    : kind === 'pre_deploy'
      ? `Antes do deploy ${new Date().toLocaleString('pt-BR')}`
      : `Snapshot ${new Date().toLocaleString('pt-BR')}`)

  let local = null
  let localError = null
  try {
    local = salvarSnapshotLocal({ label: lab, kind })
  } catch (e) {
    localError = e.message
  }

  const cloud = await salvarSnapshotNuvem({ label: lab, kind })
  return {
    ok: Boolean(local || cloud.ok),
    local,
    localError,
    cloud,
    label: lab,
  }
}

/** Uma vez por dia civil — chamado após login/sync. */
export async function garantirBackupDiario() {
  const ymd = new Date().toISOString().slice(0, 10)
  try {
    if (sessionStorage.getItem(DAILY_KEY) === ymd) return { skipped: true }
  } catch { /* */ }
  try {
    const last = localStorage.getItem(DAILY_KEY)
    if (last === ymd) {
      try { sessionStorage.setItem(DAILY_KEY, ymd) } catch { /* */ }
      return { skipped: true }
    }
  } catch { /* */ }

  const result = await criarSnapshotSeguro({ kind: 'daily' })
  if (result.ok) {
    try { localStorage.setItem(DAILY_KEY, ymd) } catch { /* */ }
    try { sessionStorage.setItem(DAILY_KEY, ymd) } catch { /* */ }
  }
  return result
}

export async function restaurarSnapshot({ where, id }) {
  let dados = null
  if (where === 'local') {
    const snap = carregarSnapshotLocal(id)
    if (!snap?.dados) throw new Error('Snapshot local não encontrado.')
    dados = snap.dados
  } else {
    const res = await baixarSnapshotNuvem(id)
    if (!res.ok || !res.backup?.dados) throw new Error(res.error || 'Snapshot na nuvem não encontrado.')
    dados = res.backup.dados
  }
  // Safety: snapshot local do estado atual antes de sobrescrever
  try {
    salvarSnapshotLocal({ label: 'Antes de restaurar', kind: 'pre_restore' })
  } catch { /* ignore */ }
  return aplicarDadosBackup(dados)
}
