/**
 * Validação estrutural do sync (sem browser).
 * Roda: node scripts/validate-sync-core.cjs
 */
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const files = {
  cloudSync: path.join(root, 'src/lib/cloudSync.js'),
  equipe: path.join(root, 'src/components/Equipe.jsx'),
  eleitores: path.join(root, 'src/components/Eleitores.jsx'),
  previsao: path.join(root, 'src/components/PrevisaoGasto.jsx'),
  materiais: path.join(root, 'src/components/Materiais.jsx'),
  montarRotas: path.join(root, 'src/components/MontarRotas.jsx'),
  sidebar: path.join(root, 'src/components/Sidebar.jsx'),
  backup: path.join(root, 'src/utils/backup.js'),
  api: path.join(root, 'public/api.php'),
}

let failed = 0
function ok(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    failed++
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function read(p) {
  return fs.readFileSync(p, 'utf8')
}

console.log('\n=== Validação Sync / Tempo Real ===\n')

const cs = read(files.cloudSync)
console.log('cloudSync.js')
ok('LIVE_PULL_MS definido', /LIVE_PULL_MS\s*=\s*120000/.test(cs))
ok('tenant sync watch', /startTenantSyncWatchSafe/.test(cs))
ok('beaconSaveAll só pending', /function beaconSaveAll[\s\S]*pending\.size === 0/.test(cs))
ok('pushAllLocal exclui igrejas', /pushAllLocal[\s\S]*!isChurchSystemKey/.test(cs))
ok('livePullTimer ativo', /livePullTimer\s*=\s*setInterval/.test(cs))
ok('scheduleLivePull existe', /function scheduleLivePull/.test(cs))
ok('visibility → pull', /visibilityState === 'hidden'[\s\S]*scheduleLivePull|scheduleLivePull\(0\)/.test(cs))
ok('online → pull', /addEventListener\('online'/.test(cs))
ok('syncNow faz pullAll', /export async function syncNow[\s\S]*await pullAll/.test(cs))
ok('syncNow dispara SYNC_EVENT', /syncNow: true/.test(cs))
ok('pullAgainRequested', /pullAgainRequested/.test(cs))
ok('preferNonEmptyCollection', /function preferNonEmptyCollection/.test(cs))
ok('mergeMateriaisEstoque', /function mergeMateriaisEstoque|export function mergeMateriaisEstoque/.test(cs))
ok('protege agenda/empresas/previsao', /agenda_eventos/.test(cs) && /previsao_data/.test(cs))
ok('teardown limpa livePullTimer', /clearInterval\(livePullTimer\)/.test(cs))
ok('apenas um syncNow exportado', (cs.match(/export async function syncNow/g) || []).length === 1)

console.log('\nListeners nas telas')
const eq = read(files.equipe)
ok('Equipe escuta SYNC_EVENT', /addEventListener\(SYNC_EVENT/.test(eq))
ok('Equipe importa SYNC_EVENT', /SYNC_EVENT/.test(eq))

const el = read(files.eleitores)
ok('Eleitores escuta SYNC_EVENT', /addEventListener\(SYNC_EVENT/.test(el))

const pr = read(files.previsao)
ok('Previsão escuta SYNC_EVENT', /addEventListener\(SYNC_EVENT/.test(pr))

const mat = read(files.materiais)
ok('Materiais escuta SYNC_EVENT', /addEventListener\(SYNC_EVENT/.test(mat))
ok('Materiais recupera estoque', /recuperarEstoqueDeHistorico/.test(mat))

const mr = read(files.montarRotas)
ok('MontarRotas escuta SYNC_EVENT', /addEventListener\(SYNC_EVENT/.test(mr))

const ag = read(path.join(root, 'src/components/Agenda.jsx'))
ok('Agenda escuta SYNC_EVENT', /addEventListener\(SYNC_EVENT/.test(ag))
const em = read(path.join(root, 'src/components/Empresas.jsx'))
ok('Empresas escuta SYNC_EVENT', /addEventListener\(SYNC_EVENT/.test(em))

console.log('\nBackup / proteção')
const bk = read(files.backup)
ok('backup diário', /garantirBackupDiario/.test(bk))
ok('snapshot nuvem', /backup_save/.test(bk))
const api = read(files.api)
ok('mergeEquipeMembrosPhp no API', /function mergeEquipeMembrosPhp/.test(api))
ok('rota_live_sessions com tenant', /rota_live_sessions[\s\S]*tenant_id = \?/.test(api))
ok('store_sync_wait autenticado', /store_sync_wait/.test(api) && /tenantStoreSyncToken/.test(api))
ok('rota share expira', /function assertRotaShareAtivo/.test(api))
ok('API backup_list', /backup_list/.test(api))
ok('API backup_save', /backup_save/.test(api))
ok('tabela data_backups', /data_backups/.test(api))

console.log('\nFotos por URL')
ok('API media_upload', /action === 'media_upload'/.test(api))
ok('grava em /uploads/', /\/uploads\//.test(api) && /file_put_contents/.test(api))
const mediaUtil = read(path.join(root, 'src/utils/mediaUpload.js'))
ok('util mediaUpload', /uploadMediaDataUrl/.test(mediaUtil) && /migrarFotosParaUrl/.test(mediaUtil))
ok('Materiais usa ensureRemoteFoto', /ensureRemoteFoto/.test(mat))
ok('Equipe usa ensureRemoteFoto', /ensureRemoteFoto/.test(eq))
ok('merge prefer URL remota', /\/uploads\//.test(cs) && /prefer/.test(cs))
ok('sanitize push Base64', /sanitizeSyncPayload/.test(mediaUtil) && /sanitizeSyncPayload/.test(cs))

console.log('\nPull incremental')
ok('API store_meta', /action === 'store_meta'/.test(api))
ok('GET parcial keys/since', /\$_GET\['keys'\]/.test(api) && /\$_GET\['since'\]/.test(api))
ok('phpGetSmart', /function phpGetSmart/.test(cs))
ok('phpGetStoreMeta', /function phpGetStoreMeta/.test(cs))
ok('syncNow forceFull', /pullAll\(currentUserId, \{ forceFull: true \}/.test(cs))

console.log('\n=== Resultado ===')
if (failed) {
  console.log(`${failed} verificação(ões) FALHARAM\n`)
  process.exit(1)
}
console.log('Todas as verificações estruturais passaram.\n')
process.exit(0)
