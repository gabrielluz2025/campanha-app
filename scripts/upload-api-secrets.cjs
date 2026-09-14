/** Envia api-secrets.php completo (return array) — nunca sobrescrever só com define(). */
const fs = require('fs')
const path = require('path')
const ftp = require('basic-ftp')

const envPath = path.resolve(__dirname, '../.env.deploy')
const secretsPath = path.resolve(__dirname, '../public/api-secrets.php')

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
  if (!fs.existsSync(secretsPath)) {
    console.error('Arquivo public/api-secrets.php não encontrado localmente.')
    process.exit(1)
  }
  const env = loadEnv(envPath)
  let php = fs.readFileSync(secretsPath, 'utf8')
  const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (serviceKey) {
    if (/('SUPABASE_SERVICE_ROLE_KEY'\s*=>\s*')([^']*)(')/.test(php)) {
      php = php.replace(
        /('SUPABASE_SERVICE_ROLE_KEY'\s*=>\s*')([^']*)(')/,
        `$1${serviceKey.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}$3`,
      )
    }
  }
  const tmp = path.resolve(__dirname, '../dist/api-secrets.php')
  fs.writeFileSync(tmp, php)

  const client = new ftp.Client(30000)
  const host = (env.FTP_HOST || '').replace(/^ftp:\/\//, '')
  const root = env.FTP_REMOTE_DIR || '/'
  try {
    await client.access({ host, user: env.FTP_USER, password: env.FTP_PASS, secure: false })
    await client.cd(root)
    console.log('Enviando api-secrets.php para', await client.pwd())
    await client.uploadFrom(tmp, 'api-secrets.php')
    console.log('api-secrets.php restaurado.')
  } catch (err) {
    console.error('Erro:', err.message)
    process.exit(1)
  } finally {
    client.close()
  }
}

main()
