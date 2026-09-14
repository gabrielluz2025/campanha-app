import { getPhpAuthContext } from '../lib/cloudSync'

const PHP_API = typeof window !== 'undefined'
  ? `${window.location.origin}/api.php`
  : '/api.php'

export function isDataUrl(value) {
  return String(value || '').startsWith('data:image')
}

export function isRemoteMediaUrl(value) {
  const s = String(value || '').trim()
  if (!s || isDataUrl(s)) return false
  return s.startsWith('/uploads/') || /^https?:\/\//i.test(s)
}

export function isUsableFoto(value) {
  const s = String(value || '').trim()
  return isDataUrl(s) || isRemoteMediaUrl(s)
}

/**
 * Envia data URL para o servidor e devolve caminho público (/uploads/...).
 * Offline ou sem auth: devolve null (caller pode manter Base64 temporário).
 */
export async function uploadMediaDataUrl({ scope = 'materiais', entityId, dataUrl }) {
  if (!isDataUrl(dataUrl)) return { ok: false, error: 'not_data_url' }
  const { accessToken, tenantId } = getPhpAuthContext()
  if (!accessToken || !tenantId) {
    return { ok: false, error: 'no_auth' }
  }
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 45000) : null
  try {
    const r = await fetch(`${PHP_API}?action=media_upload`, {
      method: 'POST',
      signal: ctrl?.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-Tenant-Id': tenantId,
      },
      body: JSON.stringify({
        scope: scope === 'equipe' ? 'equipe' : 'materiais',
        entityId: String(entityId || '').slice(0, 64),
        dataUrl,
      }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j?.ok || !j?.url) {
      return { ok: false, error: j?.error || `http_${r.status}` }
    }
    return { ok: true, url: String(j.url), bytes: j.bytes }
  } catch (e) {
    return { ok: false, error: e?.name === 'AbortError' ? 'timeout' : (e?.message || 'network') }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Garante foto remota. Se já for URL, devolve; se data URL, sobe e devolve URL.
 * Falha de upload: devolve a data URL original como fallback (não perde a foto no offline).
 * Expõe lastUploadError para que o chamador possa informar o usuário.
 */
export let lastUploadError = null

export async function ensureRemoteFoto(entityId, foto, scope = 'materiais') {
  const raw = String(foto || '').trim()
  if (!raw) return ''
  if (isRemoteMediaUrl(raw)) return raw
  if (!isDataUrl(raw)) return ''
  lastUploadError = null
  const up = await uploadMediaDataUrl({ scope, entityId, dataUrl: raw })
  if (up.ok && up.url) return up.url
  lastUploadError = up.error || 'erro_desconhecido'
  return raw
}

/**
 * Após check-in otimista (foto local): sobe em background e patch no histórico.
 */
export function finalizarFotoCheckInCampoBackground({
  igrejaId,
  entradaId,
  entityId,
  fotoDataUrl,
  onPatched,
}) {
  if (igrejaId == null || !fotoDataUrl) return
  ensureRemoteFoto(entityId, fotoDataUrl, 'equipe')
    .then((url) => {
      if (url && isRemoteMediaUrl(url) && entradaId) {
        import('./igrejasVisitas.js').then(({ patchFotoEntradaVisita }) => {
          const reg = patchFotoEntradaVisita(igrejaId, entradaId, url)
          onPatched?.(reg)
          import('./persist.js').then(({ flushAfterSave }) => flushAfterSave().catch(() => {}))
        })
        return
      }
      if (isDataUrl(url || fotoDataUrl) && entradaId) {
        import('./campoFotoUploadQueue.js').then(({ enqueueCampoFotoUpload }) => {
          enqueueCampoFotoUpload({ igrejaId, entradaId, entityId, fotoDataUrl: url || fotoDataUrl })
        })
      }
    })
    .catch(() => {
      if (entradaId) {
        import('./campoFotoUploadQueue.js').then(({ enqueueCampoFotoUpload }) => {
          enqueueCampoFotoUpload({ igrejaId, entradaId, entityId, fotoDataUrl })
        })
      }
    })
}

/**
 * Migra itens com foto Base64 → URL. Retorna { lista, migrados }.
 */
export async function migrarFotosParaUrl(lista, { scope = 'materiais', idKey = 'id' } = {}) {
  if (!Array.isArray(lista) || !lista.length) return { lista: lista || [], migrados: 0 }
  let migrados = 0
  const out = []
  for (const item of lista) {
    if (!item || typeof item !== 'object') {
      out.push(item)
      continue
    }
    const foto = String(item.foto || '')
    if (!isDataUrl(foto)) {
      out.push(item)
      continue
    }
    const entityId = String(item[idKey] || item.id || '').slice(0, 64) || undefined
    const url = await ensureRemoteFoto(entityId, foto, scope)
    if (isRemoteMediaUrl(url) && url !== foto) {
      migrados += 1
      out.push({ ...item, foto: url })
    } else {
      out.push(item)
    }
  }
  return { lista: out, migrados }
}

/** Preferir URL remota sobre Base64 ao mesclar. */
export function preferFotoValor(a, b) {
  const fa = String(a || '')
  const fb = String(b || '')
  if (isRemoteMediaUrl(fa)) return fa
  if (isRemoteMediaUrl(fb)) return fb
  if (isDataUrl(fa) && isDataUrl(fb)) return fa.length <= fb.length ? fa : fb
  return fa || fb
}

/** Remove fotos Base64 do payload enviado à nuvem (ficam só local até migrar). */
export function sanitizeSyncPayload(key, rawStr) {
  if (!rawStr || typeof rawStr !== 'string') return rawStr
  if (key !== 'materiais_estoque' && key !== 'equipe_membros') return rawStr
  try {
    const arr = JSON.parse(rawStr)
    if (!Array.isArray(arr)) return rawStr
    let changed = false
    const out = arr.map((item) => {
      if (!item || typeof item !== 'object') return item
      const foto = String(item.foto || '')
      if (!isDataUrl(foto)) return item
      changed = true
      return { ...item, foto: '' }
    })
    return changed ? JSON.stringify(out) : rawStr
  } catch {
    return rawStr
  }
}
