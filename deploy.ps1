# deploy.ps1 — Build + upload FTP para campanha.space (Hostinger)

param(
    [switch]$SkipBuild,
    [switch]$Quick
)

$ErrorActionPreference = 'Stop'

$FTP_HOST = 'campanha.space'
$FTP_USER = 'u176739135'
$FTP_DIR  = '/public_html'
$DIST_DIR = Join-Path $PSScriptRoot 'dist'

if (-not $env:FTP_PASS) {
    $envFile = Join-Path $PSScriptRoot '.env.ps1'
    if (Test-Path $envFile) { . $envFile }
}

if (-not $env:FTP_PASS) {
    Write-Host 'Senha FTP ausente. Crie .env.ps1 com $env:FTP_PASS ou exporte a variavel.' -ForegroundColor Red
    exit 1
}

function New-FtpRequest {
    param(
        [string]$Path,
        [string]$Method
    )

    $uri = "ftp://${FTP_HOST}${Path}"
    $req = [System.Net.FtpWebRequest]::Create($uri)
    $req.Method = $Method
    $req.Credentials = New-Object System.Net.NetworkCredential($FTP_USER, $env:FTP_PASS)
    $req.UseBinary = $true
    $req.UsePassive = $true
    $req.KeepAlive = $false
    $req.Timeout = 30000
    $req.ReadWriteTimeout = 300000
    return $req
}

function Test-FtpLogin {
    try {
        $req = New-FtpRequest -Path $FTP_DIR -Method ([System.Net.WebRequestMethods+Ftp]::PrintWorkingDirectory)
        $resp = $req.GetResponse()
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $pwd = $reader.ReadToEnd().Trim()
        $reader.Close()
        $resp.Close()
        Write-Host "FTP OK em $FTP_DIR ($pwd)" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "Falha no login FTP (530 = senha errada). No Hostinger: Sites > campanha.space > FTP > Alterar senha FTP." -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Yellow
        return $false
    }
}

function Ensure-FtpDirectory {
    param([string]$RemoteDir)

    try {
        $req = New-FtpRequest -Path $RemoteDir -Method ([System.Net.WebRequestMethods+Ftp]::MakeDirectory)
        $resp = $req.GetResponse()
        $resp.Close()
    } catch {}
}

function Upload-FtpFile {
    param(
        [string]$LocalPath,
        [string]$RemotePath
    )

    $req = New-FtpRequest -Path $RemotePath -Method ([System.Net.WebRequestMethods+Ftp]::UploadFile)
    $bytes = [System.IO.File]::ReadAllBytes($LocalPath)
    $stream = $req.GetRequestStream()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()
    $resp = $req.GetResponse()
    $resp.Close()
    Write-Host "  -> $RemotePath"
}

function Upload-FtpTree {
    param(
        [string]$LocalDir,
        [string]$RemoteDir
    )

    Ensure-FtpDirectory -RemoteDir $RemoteDir

    Get-ChildItem $LocalDir | ForEach-Object {
        if ($_.PSIsContainer) {
            Upload-FtpTree -LocalDir $_.FullName -RemoteDir "$RemoteDir/$($_.Name)"
        } else {
            Upload-FtpFile -LocalPath $_.FullName -RemotePath "$RemoteDir/$($_.Name)"
        }
    }
}

if (-not $SkipBuild) {
    Write-Host "`n[1/3] Gerando build..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'ERRO no build!' -ForegroundColor Red
        exit 1
    }
    Write-Host 'Build OK' -ForegroundColor Green
} else {
    Write-Host "`n[1/3] Build ignorado (-SkipBuild)" -ForegroundColor DarkGray
}

if (-not (Test-Path $DIST_DIR)) {
    Write-Host "Pasta dist nao encontrada: $DIST_DIR" -ForegroundColor Red
    exit 1
}

Write-Host "`n[2/3] Testando FTP..." -ForegroundColor Cyan
if (-not (Test-FtpLogin)) { exit 1 }

Write-Host "`n[3/3] Enviando arquivos..." -ForegroundColor Cyan

if ($Quick) {
    Upload-FtpFile -LocalPath (Join-Path $DIST_DIR 'index.html') -RemotePath "$FTP_DIR/index.html"
    $assets = Join-Path $DIST_DIR 'assets'
    if (Test-Path $assets) {
        Upload-FtpTree -LocalDir $assets -RemoteDir "$FTP_DIR/assets"
    }
} else {
    Upload-FtpTree -LocalDir $DIST_DIR -RemoteDir $FTP_DIR
}

Write-Host "`nDeploy concluido: https://campanha.space" -ForegroundColor Green
