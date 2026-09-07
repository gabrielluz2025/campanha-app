@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  ============================================================
echo   CORRECAO DEFINITIVA - Ver rua (2 arquivos)
echo  ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 set "PATH=C:\Program Files\nodejs;%PATH%"

echo [1/3] Baixando site atual e aplicando correcao...
powershell -NoProfile -Command ^
  "Invoke-WebRequest -Uri 'https://campanha.space/assets/index-DhnYuIz6.js' -OutFile 'tmp-live.js';" ^
  "Invoke-WebRequest -Uri 'https://campanha.space/' -OutFile 'tmp-live-index.html'"
node scripts\patch-live-bundle.js
if errorlevel 1 (
  echo ERRO ao gerar arquivos.
  pause
  exit /b 1
)

echo.
echo [2/3] Abrindo pasta e Hostinger...
explorer /select,"%~dp0deploy-hostinger\index.html"
start "" "https://hpanel.hostinger.com/websites/campanha.space/files/file-manager"

powershell -NoProfile -Command ^
  "[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms');" ^
  "[System.Windows.Forms.MessageBox]::Show(" ^
  "'Faca upload destes 2 arquivos (SUBSTITUIR):`n`n" ^
  "1) public_html\index.html`n" ^
  "2) public_html\assets\index-DhnYuIz6.js`n`n" ^
  "Ambos estao em deploy-hostinger\`n`n" ^
  "Depois feche o Chrome COMPLETAMENTE e abra:`n" ^
  "https://campanha.space/?v=novo`n`n" ^
  "Teste Ver rua - deve abrir Google Maps.`n" ^
  "Nao deve aparecer caixa preta.'," ^
  "'Upload de 2 arquivos',0,64)"

echo.
echo [3/3] Depois do upload, abra o site em aba anonima para testar.
pause
