const fs = require('fs')
const path = require('path')
const ftp = require('basic-ftp')

const envPath = path.resolve(__dirname, '../.env.deploy')
function loadEnv(p) {
  const env = {}
  if (!fs.existsSync(p)) return env
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}

async function main() {
  const env = loadEnv(envPath)
  const client = new ftp.Client()
  await client.access({
    host: (env.FTP_HOST || '').replace(/^ftp:\/\//, ''),
    user: env.FTP_USER,
    password: env.FTP_PASS,
    secure: false,
  })
  await client.cd('/')
  await client.uploadFrom(path.resolve(__dirname, '../dist/reset-app.html'), 'reset-app.html')
  console.log('reset-app.html OK')
  client.close()
}

main().catch((e) => { console.error(e.message); process.exit(1) })
