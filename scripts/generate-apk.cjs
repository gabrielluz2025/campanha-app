/**
 * Gera APK Android (Trusted Web Activity) a partir do PWA em campanha.space.
 * O app abre o site ao vivo — atualizar o site atualiza o APK automaticamente.
 *
 * Uso: node scripts/generate-apk.cjs
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const AdmZip = require('adm-zip')

const ROOT = path.resolve(__dirname, '..')
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'android-twa.json'), 'utf8'))
const APK_DIR = path.join(ROOT, 'apk')
const SIGN_DIR = path.join(APK_DIR, 'signing')
const SIGN_JSON = path.join(SIGN_DIR, 'signing.json')
const DESKTOP_APK = path.join(
  process.env.USERPROFILE || ROOT,
  'Desktop',
  'Campanha.apk',
)
const API_URLS = [
  'https://pwabuilder-cloudapk.azurewebsites.net/generateAppPackage',
  'https://android.pwabuilder.com/generateAppPackage',
]

function loadOrCreateSigning() {
  fs.mkdirSync(SIGN_DIR, { recursive: true })
  if (fs.existsSync(SIGN_JSON)) {
    return JSON.parse(fs.readFileSync(SIGN_JSON, 'utf8'))
  }
  const pass = crypto.randomBytes(9).toString('base64url')
  const signing = {
    alias: 'campanha',
    fullName: 'Sistema de Campanha',
    organization: 'Campanha',
    organizationalUnit: 'App',
    countryCode: 'BR',
    keyPassword: pass,
    storePassword: pass,
  }
  fs.writeFileSync(SIGN_JSON, JSON.stringify(signing, null, 2))
  console.log('Chave de assinatura criada em apk/signing/ — FAÇA BACKUP desta pasta.')
  return signing
}

function keystoreToDataUrl(filePath) {
  const buf = fs.readFileSync(filePath)
  return `data:application/octet-stream;base64,${buf.toString('base64')}`
}

function buildBody(signing) {
  const keystorePath = path.join(SIGN_DIR, 'signing.keystore')
  const hasKeystore = fs.existsSync(keystorePath)
  const body = {
    additionalTrustedOrigins: [],
    appVersion: String(CFG.appVersion || '1.0.0'),
    appVersionCode: Number(CFG.appVersionCode || 1),
    backgroundColor: CFG.backgroundColor,
    display: 'standalone',
    enableNotifications: false,
    enableSiteSettingsShortcut: true,
    fallbackType: 'customtabs',
    features: {
      locationDelegation: { enabled: true },
      playBilling: { enabled: false },
    },
    host: CFG.host,
    iconUrl: CFG.iconUrl,
    maskableIconUrl: CFG.maskableIconUrl || CFG.iconUrl,
    includeSourceCode: false,
    isChromeOSOnly: false,
    launcherName: CFG.launcherName,
    name: CFG.name,
    navigationColor: CFG.navigationColor,
    navigationColorDark: CFG.navigationColorDark || CFG.navigationColor,
    navigationDividerColor: CFG.navigationColor,
    navigationDividerColorDark: CFG.navigationColorDark || CFG.navigationColor,
    orientation: 'portrait',
    packageId: CFG.packageId,
    shortcuts: [],
    signing,
    signingMode: hasKeystore ? 'mine' : 'new',
    splashScreenFadeOutDuration: 300,
    startUrl: CFG.startUrl || '/',
    themeColor: CFG.themeColor,
    themeColorDark: CFG.themeColorDark || CFG.themeColor,
    webManifestUrl: CFG.webManifestUrl,
  }
  if (hasKeystore) {
    body.signing = {
      ...signing,
      file: keystoreToDataUrl(keystorePath),
    }
  }
  return body
}

async function postGenerate(url, body) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 12 * 60 * 1000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/zip, application/octet-stream, */*',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const buf = Buffer.from(await res.arrayBuffer())
    return { ok: res.ok, status: res.status, buf, contentType: res.headers.get('content-type') || '' }
  } finally {
    clearTimeout(t)
  }
}

function looksLikeZip(buf) {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b
}

async function main() {
  fs.mkdirSync(APK_DIR, { recursive: true })
  const signing = loadOrCreateSigning()
  const body = buildBody(signing)
  console.log(`Gerando APK ${body.packageId} (${body.signingMode})… isso pode levar alguns minutos.`)

  let lastErr = ''
  let zipBuf = null
  for (const url of API_URLS) {
    console.log('Tentando', url)
    try {
      const result = await postGenerate(url, body)
      if (result.ok && looksLikeZip(result.buf)) {
        zipBuf = result.buf
        break
      }
      const text = result.buf.slice(0, 2000).toString('utf8')
      lastErr = `${url} → HTTP ${result.status}: ${text}`
      console.warn(lastErr)
    } catch (err) {
      lastErr = `${url} → ${err.message}`
      console.warn(lastErr)
    }
  }

  if (!zipBuf) {
    console.error('Não foi possível gerar o APK.')
    console.error(lastErr)
    process.exit(1)
  }

  const zipPath = path.join(APK_DIR, 'campanha-android.zip')
  fs.writeFileSync(zipPath, zipBuf)
  console.log('Zip salvo em', zipPath)

  const zip = new AdmZip(zipPath)
  zip.extractAllTo(APK_DIR, true)

  const files = []
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name)
      if (fs.statSync(p).isDirectory()) walk(p)
      else files.push(p)
    }
  }
  walk(APK_DIR)

  const apkSrc = files.find(f => /\.apk$/i.test(f) && !/unsigned/i.test(path.basename(f)))
    || files.find(f => /\.apk$/i.test(f))
  const aabSrc = files.find(f => /\.aab$/i.test(f))
  const linksSrc = files.find(f => /assetlinks\.json$/i.test(path.basename(f)))
  const keySrc = files.find(f => /signing\.keystore$/i.test(path.basename(f)))
  const infoSrc = files.find(f => /signing-key-info\.txt$/i.test(path.basename(f)))

  if (!apkSrc) {
    console.error('O zip não veio com APK. Arquivos:', files.map(f => path.relative(APK_DIR, f)).join(', '))
    process.exit(1)
  }

  const apkDest = path.join(APK_DIR, 'Campanha.apk')
  if (path.resolve(apkSrc) !== path.resolve(apkDest)) fs.copyFileSync(apkSrc, apkDest)

  try {
    fs.copyFileSync(apkDest, DESKTOP_APK)
    console.log('APK na Área de Trabalho:', DESKTOP_APK)
  } catch {
    console.log('APK em', apkDest)
  }

  if (aabSrc) {
    const aabDest = path.join(APK_DIR, 'Campanha.aab')
    if (path.resolve(aabSrc) !== path.resolve(aabDest)) fs.copyFileSync(aabSrc, aabDest)
  }
  if (keySrc) {
    fs.copyFileSync(keySrc, path.join(SIGN_DIR, 'signing.keystore'))
    console.log('Keystore guardado em apk/signing/signing.keystore')
  }
  if (infoSrc) {
    fs.copyFileSync(infoSrc, path.join(SIGN_DIR, 'signing-key-info.txt'))
  }
  if (linksSrc) {
    const wellKnown = path.join(ROOT, 'public', '.well-known')
    fs.mkdirSync(wellKnown, { recursive: true })
    fs.copyFileSync(linksSrc, path.join(wellKnown, 'assetlinks.json'))
    fs.copyFileSync(linksSrc, path.join(APK_DIR, 'assetlinks.json'))
    console.log('assetlinks.json copiado para public/.well-known/ — publique no site para sumir a barra de URL.')
  }

  console.log('Pronto:', apkDest)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
