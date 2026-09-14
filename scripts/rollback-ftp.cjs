/**
 * Rollback do frontend a partir de uma release arquivada.
 *
 * Uso:
 *   node scripts/rollback-ftp.cjs --list
 *   node scripts/rollback-ftp.cjs --local 20260903-091500
 *   node scripts/rollback-ftp.cjs --remote 20260903-091500
 */
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
const LOCAL_RELEASES = path.resolve(__dirname, '../.releases')

const args = process.argv.slice(2)
function flag(name) {
  const i = args.indexOf(name)
  return i >= 0 ? (args[i + 1] || true) : null
}

async function removeDirRecursive(client, dirName) {
  await client.cd(dirName)
  const list = await client.list()
  for (const item of list) {
    if (item.name.startsWith('.')) continue
    if (item.type === 2) await removeDirRecursive(client, item.name)
    else await client.remove(item.name)
  }
  await client.cd('..')
  await client.removeDir(dirName)
}

async function uploadDir(client, localDir, remoteDir) {
  const entries = fs.readdirSync(localDir, { withFileTypes: true })
  await client.ensureDir(remoteDir)
  for (const entry of entries) {
    const localPath = path.join(localDir, entry.name)
    if (entry.isDirectory()) {
      await client.ensureDir(remoteDir + '/' + entry.name)
      await uploadDir(client, localPath, remoteDir + '/' + entry.name)
    } else {
      console.log('Enviando:', remoteDir + '/' + entry.name)
      await client.uploadFrom(localPath, entry.name)
    }
  }
  await client.cd('..')
}

async function main() {
  if (flag('--list')) {
    console.log('Releases locais (.releases/):')
    if (!fs.existsSync(LOCAL_RELEASES)) {
      console.log('  (nenhuma)')
    } else {
      for (const n of fs.readdirSync(LOCAL_RELEASES).sort().reverse()) {
        console.log(' ', n)
      }
    }
    if (HOST && USER && PASS) {
      const client = new ftp.Client()
      try {
        await client.access({ host: HOST, user: USER, password: PASS, secure: false })
        await client.cd(REMOTE_DIR + '/_releases')
        const list = await client.list()
        console.log('Releases remotas (_releases/):')
        list.filter(i => i.type === 2).map(i => i.name).sort().reverse().forEach(n => console.log(' ', n))
      } catch (e) {
        console.log('Não listou remotas:', e.message)
      } finally {
        client.close()
      }
    }
    return
  }

  const localStamp = flag('--local')
  const remoteStamp = flag('--remote')
  if (!localStamp && !remoteStamp) {
    console.log('Uso: --list | --local STAMP | --remote STAMP')
    process.exit(1)
  }

  if (!HOST || !USER || !PASS) {
    console.error('Configure .env.deploy')
    process.exit(1)
  }

  const client = new ftp.Client()
  try {
    await client.access({ host: HOST, user: USER, password: PASS, secure: false })

    // Limpa assets ao vivo
    for (const dir of ['assets']) {
      try {
        await client.cd('/')
        await client.cd(REMOTE_DIR + '/' + dir)
        const list = await client.list()
        for (const item of list) {
          if (item.name.startsWith('.')) continue
          if (item.type === 2) await removeDirRecursive(client, item.name)
          else await client.remove(item.name)
        }
        await client.cd('..')
        await client.removeDir(dir)
      } catch { /* */ }
    }

    if (localStamp) {
      const src = path.join(LOCAL_RELEASES, localStamp)
      if (!fs.existsSync(src)) {
        console.error('Release local não encontrada:', src)
        process.exit(1)
      }
      console.log('Restaurando release local', localStamp, '→', REMOTE_DIR)
      await client.cd('/')
      await uploadDir(client, src, REMOTE_DIR)
    } else {
      // Baixa release remota para temp e reenvia (basic-ftp não tem copy server-side fácil)
      const tmp = path.join(LOCAL_RELEASES, `_rollback_${remoteStamp}`)
      fs.rmSync(tmp, { recursive: true, force: true })
      fs.mkdirSync(tmp, { recursive: true })
      console.log('Baixando release remota', remoteStamp)
      await client.downloadToDir(tmp, REMOTE_DIR + '/_releases/' + remoteStamp)
      console.log('Republicando no site…')
      await client.cd('/')
      await uploadDir(client, tmp, REMOTE_DIR)
      fs.rmSync(tmp, { recursive: true, force: true })
    }

    console.log('Rollback concluído. Faça Ctrl+F5 no navegador.')
  } catch (e) {
    console.error('Erro:', e.message)
    process.exit(1)
  } finally {
    client.close()
  }
}

main()
