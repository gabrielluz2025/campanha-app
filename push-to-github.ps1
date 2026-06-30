# ─────────────────────────────────────────────────────────────
# push-to-github.ps1 — Envia o código para o GitHub
# Execute clicando com o botão direito → "Executar com PowerShell"
# ─────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

# Navega para a pasta do projeto
$project = "$PSScriptRoot"
Set-Location $project

# Verifica se o git está instalado
try { $gitVersion = git --version } catch {
    Write-Host "Git não encontrado. Baixe em https://git-scm.com/download/win" -ForegroundColor Red
    exit 1
}

Write-Host "Git: $gitVersion" -ForegroundColor Green

# Inicializa o repositório se necessário
if (-not (Test-Path ".git")) {
    git init
    Write-Host "Repositório Git inicializado" -ForegroundColor Green
}

# Configura o remote para o GitHub
$remoteUrl = "https://github.com/gabrielluz2025/campanha-app.git"
git remote remove origin 2>$null
git remote add origin $remoteUrl
Write-Host "Remote configurado: $remoteUrl" -ForegroundColor Green

# Cria/atualiza .gitignore
@"
node_modules/
dist/
.cache/
.env
.env.local
*.local
"@ | Out-File -FilePath ".gitignore" -Encoding utf8 -Force

# Adiciona todos os arquivos e faz commit
Write-Host "Adicionando arquivos..." -ForegroundColor Cyan
git add .
git commit -m "Initial commit"

# Envia para o GitHub
Write-Host "Enviando para o GitHub..." -ForegroundColor Cyan
git branch -M main
git push -u origin main

Write-Host "`nPronto! Codigo enviado para: $remoteUrl" -ForegroundColor Green
Write-Host "Agora volte ao Netlify e conecte o repositorio para deploy automatico." -ForegroundColor Cyan
