/** Upload rápido: index.html + assets + PWA/SW + api (sem geojson/fotos). */
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

const env = loadEnv(envPath)
const HOST = (env.FTP_HOST || '').replace(/^ftp:\/\//, '')
const USER = env.FTP_USER
const PASS = env.FTP_PASS
const REMOTE_DIR = env.FTP_REMOTE_DIR || '/public_html'
const DIST = path.resolve(__dirname, '../dist')

async function main() {
  const client = new ftp.Client(120000)
  try {
    await client.access({ host: HOST, user: USER, password: PASS, secure: false })
    await client.ensureDir(REMOTE_DIR)

    console.log('Enviando index.html')
    await client.uploadFrom(path.join(DIST, 'index.html'), 'index.html')

    await client.ensureDir(REMOTE_DIR + '/assets')
    for (const f of fs.readdirSync(path.join(DIST, 'assets'))) {
      console.log('Enviando assets/' + f)
      await client.uploadFrom(path.join(DIST, 'assets', f), f)
    }

    await client.cd(REMOTE_DIR)

    const rootFiles = [
      'api.php', 'serve.php', '.htaccess', '_redirects', 'pdf.worker.min.js',
      'retirada.html', 'verificar.html', 'assinar.html', 'contrato-pdf.html', 'iphone.html', 'atalho.php', 'pwa-192.png', 'pwa-512.png', 'apple-touch-icon.png',
      'manifest.webmanifest', 'sw.js',
    ]
    for (const f of fs.readdirSync(DIST)) {
      if (/^workbox-.*\.js$/i.test(f) || f === 'registerSW.js') rootFiles.push(f)
    }

    for (const f of [...new Set(rootFiles)]) {
      const local = path.join(DIST, f)
      if (!fs.existsSync(local) || !fs.statSync(local).isFile()) continue
      console.log('Enviando', f)
      await client.uploadFrom(local, f)
    }

    const wellKnownLocal = path.join(DIST, '.well-known', 'assetlinks.json')
    if (fs.existsSync(wellKnownLocal)) {
      await client.ensureDir(REMOTE_DIR + '/.well-known')
      console.log('Enviando .well-known/assetlinks.json')
      await client.uploadFrom(wellKnownLocal, 'assetlinks.json')
      await client.cd(REMOTE_DIR)
    }

    const secretsLocal = path.join(__dirname, '../public/api-secrets.php')
    if (fs.existsSync(secretsLocal)) {
      console.log('Enviando api-secrets.php')
      await client.uploadFrom(secretsLocal, 'api-secrets.php')
    } else {
      console.log('Aviso: public/api-secrets.php ausente — mantendo cópia remota.')
    }

    console.log('Deploy essencial concluído!')
  } catch (err) {
    console.error('Erro:', err.message)
    process.exit(1)
  } finally {
    client.close()
  }
}

main()
