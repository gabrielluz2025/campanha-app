const fs = require('fs')
const path = require('path')
const ftp = require('basic-ftp')

const APPLY = process.argv.includes('--apply')
const TOKEN = 'campanha-dedupe-igrejas-20260831-k4'
const LOCAL_PHP = path.resolve(__dirname, 'limpar-igrejas-mapa.php')
const REMOTE_NAME = '_tmp_limpa_igrejas.php'

const env = {}
const envPath = path.resolve(__dirname, '../.env.deploy')
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  if (!line.trim() || line.startsWith('#')) continue
  const idx = line.indexOf('=')
  if (idx === -1) continue
  env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
}

async function main() {
  const client = new ftp.Client(120000)
  const host = (env.FTP_HOST || '').replace(/^ftp:\/\//, '')
  const remoteDir = env.FTP_REMOTE_DIR || '/public_html'
  await client.access({ host, user: env.FTP_USER, password: env.FTP_PASS, secure: false })
  await client.ensureDir(remoteDir)
  await client.uploadFrom(LOCAL_PHP, REMOTE_NAME)
  console.log('php enviado')

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
}

main().catch((e) => { console.error(e); process.exit(1) })
