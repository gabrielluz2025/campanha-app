const fs = require('fs')
const path = require('path')
const ftp = require('basic-ftp')

const APPLY = process.argv.includes('--apply')
const TOKEN = 'campanha-dedupe-igrejas-20260831-k4'
const TEMPLATE = path.resolve(__dirname, 'restaurar-gps-catalogo.php')
const DUMP = path.resolve(__dirname, '../tmp-igrejas-dump.json')
const TMP_PHP = path.resolve(__dirname, '../tmp-restaurar-gps.php')
const REMOTE_NAME = '_tmp_restaura_gps.php'
const BLOQUEAR = new Set([56])

const env = {}
const envPath = path.resolve(__dirname, '../.env.deploy')
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  if (!line.trim() || line.startsWith('#')) continue
  const idx = line.indexOf('=')
  if (idx === -1) continue
  env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
}

function coordsParaRestaurar() {
  const dump = JSON.parse(fs.readFileSync(DUMP, 'utf8'))
  const src = dump.geo_coords_igrejas || {}
  const restore = {}
  for (const [key, xy] of Object.entries(src)) {
    const id = Number(key)
    if (!id || id > 1999 || BLOQUEAR.has(id)) continue
    if (!xy || !Number.isFinite(Number(xy.lat)) || !Number.isFinite(Number(xy.lng))) continue
    restore[String(id)] = { lat: Number(xy.lat), lng: Number(xy.lng) }
  }
  return restore
}

async function main() {
  const restore = coordsParaRestaurar()
  const json = JSON.stringify(restore)
  const php = fs.readFileSync(TEMPLATE, 'utf8').replace('__RESTORE_JSON__', json.replace(/\\/g, '\\\\').replace(/'/g, "\\'"))
  fs.writeFileSync(TMP_PHP, php)

  const client = new ftp.Client(120000)
  const host = (env.FTP_HOST || '').replace(/^ftp:\/\//, '')
  const remoteDir = env.FTP_REMOTE_DIR || '/public_html'
  await client.access({ host, user: env.FTP_USER, password: env.FTP_PASS, secure: false })
  await client.ensureDir(remoteDir)
  await client.uploadFrom(TMP_PHP, REMOTE_NAME)
  console.log('php enviado, coords', Object.keys(restore).length)

  const url = `https://campanha.space/${REMOTE_NAME}?token=${encodeURIComponent(TOKEN)}${APPLY ? '&apply=1' : ''}`
  const res = await fetch(url)
  const text = await res.text()
  console.log('http', res.status)
  console.log(text)

  try {
    await client.remove(REMOTE_NAME)
    console.log('php removido do servidor')
  } catch (e) {
    console.log('aviso: nao removeu php remoto:', e.message)
  }
  client.close()
  try { fs.unlinkSync(TMP_PHP) } catch { /* ignore */ }
}

main().catch((e) => { console.error(e); process.exit(1) })
