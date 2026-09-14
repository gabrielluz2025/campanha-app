const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

const envPath = path.join(__dirname, '../.env')
const env = {}
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
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

async function main() {
  console.log('Criando tabela em', database)
  const conn = await mysql.createConnection({
    host,
    user,
    password,
    database,
    port: 3306,
    ssl: { rejectUnauthorized: false },
    connectTimeout: 15000,
  })

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS tse_votos_sc (
      ano INT NOT NULL,
      cargo VARCHAR(50) NOT NULL,
      numero INT NOT NULL,
      municipio VARCHAR(100) NOT NULL,
      zona VARCHAR(10) NOT NULL,
      secao VARCHAR(10) NOT NULL,
      local VARCHAR(255) DEFAULT NULL,
      votos INT NOT NULL DEFAULT 0,
      PRIMARY KEY (ano, cargo, numero, municipio, zona, secao),
      KEY idx_numero_cargo_ano (ano, cargo, numero),
      KEY idx_municipio (municipio)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  console.log('Tabela tse_votos_sc criada.')
  await conn.end()
}

main().catch(err => {
  console.error('FALHA:', err.message)
  process.exit(1)
})
