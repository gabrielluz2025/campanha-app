const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

const envPath = path.join(__dirname, '../.env')
console.log('envPath:', envPath)
const env = {}
if (fs.existsSync(envPath)) {
  console.log('env file exists, size:', fs.statSync(envPath).size)
  const content = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '')
  content.split(/\r?\n/).forEach(line => {
    const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) return
    let val = m[2].trim()
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1)
    env[m[1]] = val
  })
}

const host = env.HOSTINGER_DB_HOST || process.env.HOSTINGER_DB_HOST
const user = env.HOSTINGER_DB_USER || process.env.HOSTINGER_DB_USER
const password = env.HOSTINGER_DB_PASSWORD || process.env.HOSTINGER_DB_PASSWORD
const database = env.HOSTINGER_DB_NAME || process.env.HOSTINGER_DB_NAME
console.log('env keys:', Object.keys(env).join(', '))

async function test() {
  const hosts = [host, '193.203.175.85']
  for (const h of hosts) {
    try {
      console.log('Tentando host:', h)
      const conn = await mysql.createConnection({
        host: h,
        user,
        password,
        database,
        port: 3306,
        ssl: { rejectUnauthorized: false },
        connectTimeout: 10000,
      })
      const [rows] = await conn.execute('SELECT 1 as ok, NOW() as now')
      console.log('Conectado em', h, ':', rows[0])
      await conn.end()
      return
    } catch (err) {
      console.error('Falha em', h, ':', err.message)
    }
  }
  throw new Error('Não conectou em nenhum host')
}

test().catch(err => {
  console.error('FALHA:', err.message)
  console.error('CODE:', err.code || err.errno)
  console.error('STACK:', err.stack)
  process.exit(1)
})
