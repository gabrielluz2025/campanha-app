# deploy-live.ps1 — Publica correcoes no campanha.space (via SSH/SCP Hostinger)
# Caminho real do site: domains/campanha.space/public_html/

param(
    [switch]$SkipPatch
)

$ErrorActionPreference = 'Stop'

$SSH_HOST = '77.37.127.105'
$SSH_PORT = 65002
$SSH_USER = 'u176739135'
$REMOTE_BASE = 'domains/campanha.space/public_html'
$HOSTKEY = 'SHA256:bycKXC6JIWcmfBPG+p8WJpnCOyGAd8kP5GEBksgHKDw'

$Root = $PSScriptRoot
$DeployDir = Join-Path $Root 'deploy-hostinger'
$AssetsDir = Join-Path $DeployDir 'assets'

if (-not $env:FTP_PASS) {
    $envFile = Join-Path $Root '.env.ps1'
    if (Test-Path $envFile) { . $envFile }
}

if (-not $env:FTP_PASS) {
    Write-Host 'Senha ausente. Coloque $env:FTP_PASS em .env.ps1 (mesma senha FTP/SSH do Hostinger).' -ForegroundColor Red
    exit 1
}

$Plink = 'C:\Program Files\PuTTY\plink.exe'
$Pscp  = 'C:\Program Files\PuTTY\pscp.exe'

if (-not (Test-Path $Pscp)) {
    Write-Host 'PuTTY nao encontrado. Instale: winget install PuTTY.PuTTY' -ForegroundColor Red
    exit 1
}

function Invoke-ScpUpload {
    param(
        [string]$LocalPath,
        [string]$RemotePath
    )

    & $Pscp -batch -hostkey $HOSTKEY -P $SSH_PORT -pw $env:FTP_PASS `
        $LocalPath "${SSH_USER}@${SSH_HOST}:${RemotePath}"

    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao enviar $RemotePath"
    }

    Write-Host "  OK $RemotePath" -ForegroundColor Green
}

Write-Host "`n[1/3] Preparando arquivos..." -ForegroundColor Cyan

if (-not $SkipPatch) {
    $env:Path = "C:\Program Files\nodejs;" + $env:Path
    Invoke-WebRequest -Uri 'https://campanha.space/assets/index-DhnYuIz6.js' -OutFile (Join-Path $Root 'tmp-live.js') | Out-Null
    Invoke-WebRequest -Uri 'https://campanha.space/' -OutFile (Join-Path $Root 'tmp-live-index.html') | Out-Null
    node (Join-Path $Root 'scripts\patch-live-bundle.js')
    if ($LASTEXITCODE -ne 0) { throw 'patch-live-bundle.js falhou' }
}

$indexFile = Join-Path $DeployDir 'index.html'
$jsFile    = Join-Path $AssetsDir 'index-verrua.js'
$jsLegacy  = Join-Path $AssetsDir 'index-DhnYuIz6.js'

foreach ($f in @($indexFile, $jsFile)) {
    if (-not (Test-Path $f)) {
        Write-Host "Arquivo nao encontrado: $f" -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n[2/3] Testando SSH..." -ForegroundColor Cyan
$test = & $Plink -batch -hostkey $HOSTKEY -P $SSH_PORT -pw $env:FTP_PASS `
    "${SSH_USER}@${SSH_HOST}" "echo SSH_OK" 2>&1
if ($test -notmatch 'SSH_OK') {
    Write-Host "SSH falhou: $test" -ForegroundColor Red
    Write-Host 'Ative SSH no Hostinger: Avancado > SSH. Use a mesma senha do FTP em .env.ps1' -ForegroundColor Yellow
    exit 1
}
Write-Host 'SSH OK' -ForegroundColor Green

Write-Host "`n[3/3] Enviando para $REMOTE_BASE ..." -ForegroundColor Cyan
Invoke-ScpUpload -LocalPath $indexFile -RemotePath "$REMOTE_BASE/index.html"
Invoke-ScpUpload -LocalPath $jsFile -RemotePath "$REMOTE_BASE/assets/index-verrua.js"
if (Test-Path $jsLegacy) {
    Invoke-ScpUpload -LocalPath $jsLegacy -RemotePath "$REMOTE_BASE/assets/index-DhnYuIz6.js"
}

Write-Host "`nDeploy concluido: https://campanha.space" -ForegroundColor Green
Write-Host "Teste Ver rua (aba anonima se ainda cachear)." -ForegroundColor DarkGray
