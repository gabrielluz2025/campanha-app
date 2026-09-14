const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

const APPLY = process.argv.includes('--apply')
const MAX_ID_CATALOGO = 1999

const env = {}
const envPath = path.join(__dirname, '../.env')
fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).forEach(line => {
  const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
  if (!m) return
  let val = m[2].trim()
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
  env[m[1]] = val
})

function limpo(v) {
  const s = String(v || '').trim()
  if (!s || s === '—' || s === '-' || s === '–' || s === '/fotos/sem-foto.jpg') return ''
  return s
}

function nomeGenerico(nome) {
  const n = limpo(nome).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (n.length < 8) return true
  return /^(IGREJA|TEMPLO|CAPELA|PAROQUIA|CHURCH|PLACE OF WORSHIP)$/.test(n)
}

function classificar(ig) {
  const endereco = limpo(ig.endereco)
  const culto = limpo(ig.culto)
  const pastor = limpo(ig.pastor1) || limpo(ig.pastor2)
  const telefone = limpo(ig.telefone) || limpo(ig.whatsapp)
  const redes = limpo(ig.instagram) || limpo(ig.facebook) || limpo(ig.website)
  const contato = Boolean(pastor || telefone || redes)
  const endOk = endereco.length >= 8
  if (!endOk && !contato && !culto) return 'branco'
  if (endOk && contato) return 'presta'
  return 'parcial'
}

function daBusca(ig) {
  const f = String(ig.fonte || '').toLowerCase()
  if (f === 'osm' || f === 'google' || f === 'nominatim') return true
  return Number(ig.id) > MAX_ID_CATALOGO
}

function parseStoreValue(raw) {
  if (raw == null) return null
  let v = raw
  if (Buffer.isBuffer(v)) v = v.toString('utf8')
  if (typeof v !== 'string') return v
  try { return JSON.parse(v) } catch { return null }
}

async function connect() {
  const hosts = [env.HOSTINGER_DB_HOST, '193.203.175.85'].filter(Boolean)
  let last
  for (const host of hosts) {
    try {
      const conn = await mysql.createConnection({
        host,
        user: env.HOSTINGER_DB_USER,
        password: env.HOSTINGER_DB_PASSWORD,
        database: env.HOSTINGER_DB_NAME,
        port: 3306,
        ssl: { rejectUnauthorized: false },
        connectTimeout: 15000,
      })
      await conn.query('SELECT 1')
      return conn
    } catch (e) {
      last = e
    }
  }
  throw last || new Error('sem host')
}

async function main() {
  const conn = await connect()
  const [rows] = await conn.execute(
    'SELECT tenant_id, `key`, `value`, updated_at FROM store WHERE `key` IN (?, ?, ?, ?)',
    ['igrejas_custom', 'igrejas_enrich', 'geo_coords_igrejas', 'igrejas_visitas'],
  )

  const byTenant = new Map()
  for (const r of rows) {
    if (!byTenant.has(r.tenant_id)) byTenant.set(r.tenant_id, {})
    byTenant.get(r.tenant_id)[r.key] = { value: parseStoreValue(r.value), updated_at: r.updated_at, rawLen: String(r.value || '').length }
  }

  console.log('tenants com chaves de igreja:', byTenant.size)
  console.log('modo:', APPLY ? 'APPLY (grava)' : 'DRY-RUN (só mostra)')

  for (const [tenant, bag] of byTenant) {
    const custom = Array.isArray(bag.igrejas_custom?.value) ? bag.igrejas_custom.value : []
    const counts = { total: custom.length, catalogoId: 0, busca: 0, branco: 0, parcial: 0, presta: 0, nomeFraco: 0 }
    const exemplos = { branco: [], parcial: [], presta: [] }
    for (const ig of custom) {
      const busca = daBusca(ig)
      if (!busca) { counts.catalogoId += 1; continue }
      counts.busca += 1
      const nivel = classificar(ig)
      counts[nivel] += 1
      if (nomeGenerico(ig.nome)) counts.nomeFraco += 1
      if (exemplos[nivel].length < 8) exemplos[nivel].push(`${ig.id} | ${ig.nome || '?'} | ${limpo(ig.endereco) || 'sem end'}`)
    }

    const manter = custom.filter(ig => {
      if (!daBusca(ig)) return true
      const nivel = classificar(ig)
      if (nivel === 'branco') return false
      if (nomeGenerico(ig.nome) && nivel !== 'presta') return false
      return true
    })
    const removidas = custom.length - manter.length

    console.log('\n=== tenant', tenant.slice(0, 8), '===')
    console.log(JSON.stringify(counts, null, 2))
    console.log('removeria:', removidas, '| ficaria:', manter.length)
    console.log('exemplos branco:', exemplos.branco)
    console.log('exemplos parcial:', exemplos.parcial)
    console.log('exemplos presta:', exemplos.presta)

    if (!APPLY || removidas <= 0) continue

    const idsFora = new Set(custom.filter(ig => !manter.some(m => m.id === ig.id)).map(ig => ig.id))
    await conn.execute(
      'UPDATE store SET `value` = ?, updated_at = NOW() WHERE tenant_id = ? AND `key` = ?',
      [JSON.stringify(manter), tenant, 'igrejas_custom'],
    )

    if (bag.igrejas_enrich?.value && typeof bag.igrejas_enrich.value === 'object') {
      const enrich = { ...bag.igrejas_enrich.value }
      for (const id of idsFora) {
        delete enrich[id]
        delete enrich[String(id)]
      }
      await conn.execute(
        'UPDATE store SET `value` = ?, updated_at = NOW() WHERE tenant_id = ? AND `key` = ?',
        [JSON.stringify(enrich), tenant, 'igrejas_enrich'],
      )
    }
    if (bag.geo_coords_igrejas?.value && typeof bag.geo_coords_igrejas.value === 'object') {
      const coords = { ...bag.geo_coords_igrejas.value }
      for (const id of idsFora) {
        delete coords[id]
        delete coords[String(id)]
      }
      await conn.execute(
        'UPDATE store SET `value` = ?, updated_at = NOW() WHERE tenant_id = ? AND `key` = ?',
        [JSON.stringify(coords), tenant, 'geo_coords_igrejas'],
      )
    }
    console.log('gravado tenant', tenant.slice(0, 8), 'removidas', removidas)
  }

  await conn.end()
}

main().catch(err => {
  console.error('FALHA:', err.message)
  process.exit(1)
})
