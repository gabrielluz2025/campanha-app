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
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    env[key] = val
  }
  return env
}

const env = loadEnv(envPath)

const rawHost = env.FTP_HOST || process.env.FTP_HOST
const HOST = rawHost.replace(/^ftp:\/\//, '')
const USER = env.FTP_USER || process.env.FTP_USER
const PASS = env.FTP_PASS || process.env.FTP_PASS
const REMOTE_DIR = env.FTP_REMOTE_DIR || process.env.FTP_REMOTE_DIR || '/public_html'
const API_REMOTE_DIR = env.FTP_API_DIR || process.env.FTP_API_DIR || '/public_html/api'

if (!HOST || !USER || !PASS) {
  console.error('Configure FTP_HOST, FTP_USER e FTP_PASS no arquivo .env.deploy')
  process.exit(1)
}

const DIST = path.resolve(__dirname, '../dist')
const API_DIR = path.resolve(__dirname, '../hostinger/api')
const API_FILES = ['tse.php', 'tse-limpar-teste.php', 'import.php']
const LOCAL_RELEASES = path.resolve(__dirname, '../.releases')
const KEEP_RELEASES = 2

function stampNow() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** Copia só o essencial do dist para poder voltar o frontend. */
function saveLocalRelease(stamp) {
  const essential = [
    'index.html',
    'sw.js',
    'manifest.webmanifest',
    'api.php',
    'assets',
  ]
  if (!fs.existsSync(DIST)) return null
  fs.mkdirSync(LOCAL_RELEASES, { recursive: true })
  const dest = path.join(LOCAL_RELEASES, stamp)
  fs.mkdirSync(dest, { recursive: true })

  function copyRecursive(src, dst) {
    const st = fs.statSync(src)
    if (st.isDirectory()) {
      fs.mkdirSync(dst, { recursive: true })
      for (const name of fs.readdirSync(src)) {
        copyRecursive(path.join(src, name), path.join(dst, name))
      }
    } else {
      fs.copyFileSync(src, dst)
    }
  }

  for (const name of essential) {
    const src = path.join(DIST, name)
    if (!fs.existsSync(src)) continue
    copyRecursive(src, path.join(dest, name))
  }

  // Mantém só as N releases mais recentes
  const dirs = fs.readdirSync(LOCAL_RELEASES)
    .filter(n => {
      try { return fs.statSync(path.join(LOCAL_RELEASES, n)).isDirectory() } catch { return false }
    })
    .sort()
    .reverse()
  for (const old of dirs.slice(KEEP_RELEASES)) {
    fs.rmSync(path.join(LOCAL_RELEASES, old), { recursive: true, force: true })
    console.log('Release local removida (retenção):', old)
  }

  console.log('Release local salva:', dest)
  return dest
}

async function removeDirRecursive(client, dirName) {
  await client.cd(dirName)
  const list = await client.list()
  for (const item of list) {
    if (item.name.startsWith('.')) continue
    if (item.type === 2) {
      await removeDirRecursive(client, item.name)
    } else {
      await client.remove(item.name)
    }
  }
  await client.cd('..')
  await client.removeDir(dirName)
}

async function uploadDir(client, localDir, remoteDir) {
  const entries = fs.readdirSync(localDir, { withFileTypes: true })
  await client.ensureDir(remoteDir)
  for (const entry of entries) {
    const localPath = path.join(localDir, entry.name)
    const remotePath = remoteDir + '/' + entry.name
    if (entry.isDirectory()) {
      await client.ensureDir(remotePath)
      await uploadDir(client, localPath, remotePath)
    } else {
      console.log('Enviando:', remotePath)
      await client.uploadFrom(localPath, entry.name)
    }
  }
  await client.cd('..')
}

async function pruneRemoteReleases(client, releasesRemote, keep) {
  try {
    await client.cd('/')
    await client.ensureDir(releasesRemote)
    await client.cd(releasesRemote)
    const list = await client.list()
    const dirs = list
      .filter(i => i.type === 2 && !i.name.startsWith('.'))
      .map(i => i.name)
      .sort()
      .reverse()
    for (const old of dirs.slice(keep)) {
      console.log('Removendo release remota antiga:', old)
      await removeDirRecursive(client, old)
    }
  } catch (e) {
    console.log('Aviso ao limpar releases remotas:', e.message)
  }
}

async function main() {
  const client = new ftp.Client()
  client.ftp.verbose = false
  const stamp = stampNow()
  try {
    // 1) Arquiva o dist localmente (volta rápida sem FTP)
    saveLocalRelease(stamp)

    console.log('Conectando ao FTP:', HOST)
    await client.access({ host: HOST, user: USER, password: PASS, secure: false })
    console.log('Conectado!')

    // 2) Cópia versionada no servidor (só frontend essencial — não duplica geojson)
    const releasesRemote = REMOTE_DIR + '/_releases'
    const releaseDest = releasesRemote + '/' + stamp
    const localRelease = path.join(LOCAL_RELEASES, stamp)
    console.log('Arquivando release remota:', releaseDest)
    await client.cd('/')
    if (fs.existsSync(localRelease)) {
      await uploadDir(client, localRelease, releaseDest)
    } else {
      await uploadDir(client, DIST, releaseDest)
    }
    await pruneRemoteReleases(client, releasesRemote, KEEP_RELEASES)

    // 3) Limpa assets antigos do site ao vivo
    for (const dir of ['assets', 'static']) {
      try {
        await client.cd('/')
        await client.cd(REMOTE_DIR + '/' + dir)
        const list = await client.list()
        for (const item of list) {
          if (item.name.startsWith('.')) continue
          if (item.type === 2) {
            await removeDirRecursive(client, item.name)
          } else {
            console.log('Removendo antigo:', dir + '/' + item.name)
            await client.remove(item.name)
          }
        }
        await client.cd('..')
        await client.removeDir(dir)
      } catch (e) {
        // dir pode não existir ou estar vazio
      }
    }
    await client.cd('/')

    // 4) Publica dist no site
    await uploadDir(client, DIST, REMOTE_DIR)

    // 5) APIs PHP auxiliares
    await client.ensureDir(API_REMOTE_DIR)
    for (const file of API_FILES) {
      const local = path.join(API_DIR, file)
      if (!fs.existsSync(local)) continue
      console.log('Enviando API:', API_REMOTE_DIR + '/' + file)
      await client.uploadFrom(local, file)
    }

    console.log('Deploy concluído!')
    console.log('Rollback local:  node scripts/rollback-ftp.cjs --list')
    console.log('Rollback remoto: node scripts/rollback-ftp.cjs --remote', stamp)
  } catch (err) {
    console.error('Erro no deploy:', err.message)
    process.exit(1)
  } finally {
    client.close()
  }
}

main()
