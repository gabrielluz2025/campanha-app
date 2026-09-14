const fs = require('fs')
const path = require('path')
const Client = require('ssh2-sftp-client')

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

const HOST = env.SFTP_HOST || env.FTP_HOST || process.env.SFTP_HOST || process.env.FTP_HOST
const PORT = parseInt(env.SFTP_PORT || process.env.SFTP_PORT || '65002', 10)
const USER = env.SFTP_USER || env.FTP_USER || process.env.SFTP_USER || process.env.FTP_USER
const PASS = env.SFTP_PASS || env.FTP_PASS || process.env.SFTP_PASS || process.env.FTP_PASS
const REMOTE_DIR = env.SFTP_REMOTE_DIR || env.FTP_REMOTE_DIR || process.env.SFTP_REMOTE_DIR || process.env.FTP_REMOTE_DIR || '/public_html'
const API_REMOTE_DIR = env.SFTP_API_DIR || env.FTP_API_DIR || process.env.SFTP_API_DIR || process.env.FTP_API_DIR || '/public_html/api'

if (!HOST || !USER || !PASS) {
  console.error('Configure SFTP_HOST, SFTP_USER e SFTP_PASS (ou FTP_*) no arquivo .env.deploy')
  process.exit(1)
}

const DIST = path.resolve(__dirname, '../dist')
const API_FILE = path.resolve(__dirname, '../hostinger/api/tse.php')

async function removeDirRecursive(sftp, remoteDir) {
  const list = await sftp.list(remoteDir)
  for (const item of list) {
    if (item.name.startsWith('.')) continue
    const remotePath = remoteDir + '/' + item.name
    if (item.type === 'd') {
      await removeDirRecursive(sftp, remotePath)
      await sftp.rmdir(remotePath, true)
    } else {
      await sftp.delete(remotePath)
    }
  }
}

async function uploadDir(sftp, localDir, remoteDir) {
  await sftp.mkdir(remoteDir, true)
  const entries = fs.readdirSync(localDir, { withFileTypes: true })
  for (const entry of entries) {
    const localPath = path.join(localDir, entry.name)
    const remotePath = remoteDir + '/' + entry.name
    if (entry.isDirectory()) {
      await uploadDir(sftp, localPath, remotePath)
    } else {
      console.log('Enviando:', remotePath)
      await sftp.put(localPath, remotePath)
    }
  }
}

async function main() {
  const sftp = new Client()
  try {
    console.log('Conectando via SFTP:', HOST, 'porta', PORT)
    await sftp.connect({ host: HOST, port: PORT, username: USER, password: PASS })
    console.log('Conectado!')

    // Limpa assets antigos para evitar mistura de versões
    const assetsDir = REMOTE_DIR + '/assets'
    try {
      const list = await sftp.list(assetsDir)
      if (list.length > 0) {
        console.log('Limpando assets antigos...')
        await removeDirRecursive(sftp, assetsDir)
      }
    } catch (e) {
      // assets pode não existir
    }

    // Envia dist
    console.log('Enviando frontend...')
    await uploadDir(sftp, DIST, REMOTE_DIR)

    // Envia tse.php
    await sftp.mkdir(API_REMOTE_DIR, true)
    const apiRemotePath = API_REMOTE_DIR + '/tse.php'
    console.log('Enviando API:', apiRemotePath)
    await sftp.put(API_FILE, apiRemotePath)

    console.log('Deploy concluído!')
  } catch (err) {
    console.error('Erro no deploy:', err.message)
    process.exit(1)
  } finally {
    await sftp.end()
  }
}

main()
