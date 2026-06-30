# ─────────────────────────────────────────────────────────────
# deploy.ps1 — Build + Upload FTP para campanha.space
# ─────────────────────────────────────────────────────────────

$FTP_HOST = "77.37.127.105"
$FTP_USER = "u176739135"
$FTP_PASS = $env:FTP_PASS          # lido do arquivo .env.ps1
$FTP_DIR  = "/public_html"   # PHP roda aqui
$DIST_DIR = "$PSScriptRoot\dist"

# ── 1. Build ──────────────────────────────────────────────────
Write-Host "`n[1/3] Gerando build..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "ERRO no build!" -ForegroundColor Red; exit 1 }
Write-Host "Build OK" -ForegroundColor Green

# ── 2. Coletar arquivos ───────────────────────────────────────
Write-Host "`n[2/3] Enviando arquivos para campanha.space..." -ForegroundColor Cyan

$session = New-Object System.Net.WebClient
$session.Credentials = New-Object System.Net.NetworkCredential($FTP_USER, $FTP_PASS)

function Upload-File($localPath, $remotePath) {
    try {
        $uri = "ftp://${FTP_HOST}${remotePath}"
        $session.UploadFile($uri, $localPath)
    } catch {
        Write-Host "  ERRO: $localPath → $_" -ForegroundColor Yellow
    }
}

function Upload-Dir($localDir, $remoteDir) {
    # Cria diretório remoto
    try {
        $req = [System.Net.FtpWebRequest]::Create("ftp://${FTP_HOST}${remoteDir}")
        $req.Credentials = New-Object System.Net.NetworkCredential($FTP_USER, $FTP_PASS)
        $req.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
        $req.GetResponse() | Out-Null
    } catch {}

    Get-ChildItem $localDir | ForEach-Object {
        if ($_.PSIsContainer) {
            Upload-Dir $_.FullName "$remoteDir/$($_.Name)"
        } else {
            Write-Host "  → $remoteDir/$($_.Name)"
            Upload-File $_.FullName "$remoteDir/$($_.Name)"
        }
    }
}

Upload-Dir $DIST_DIR $FTP_DIR

# ── 2b. Envia também na raiz (onde o domínio principal serve) ─
Write-Host "`n  Atualizando raiz FTP (domínio principal)..." -ForegroundColor Cyan
Upload-Dir $DIST_DIR ""

# ── 3. Concluído ──────────────────────────────────────────────
Write-Host "`n[3/3] Deploy concluido!" -ForegroundColor Green
Write-Host "Site: https://campanha.space" -ForegroundColor Cyan
