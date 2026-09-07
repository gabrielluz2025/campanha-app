@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  ============================================================
echo   Publicar correcao do "Ver rua" no campanha.space
echo  ============================================================
echo.

if not exist "deploy-hostinger\assets\index-DhnYuIz6.js" (
  echo Gerando arquivo corrigido...
  node scripts\patch-live-bundle.js
  if errorlevel 1 (
    echo ERRO: Node.js nao encontrado. Instale Node e tente de novo.
    pause
    exit /b 1
  )
)

if not exist "deploy-hostinger\correcao-ver-rua.zip" (
  powershell -NoProfile -Command "Compress-Archive -Path 'deploy-hostinger\assets\index-DhnYuIz6.js' -DestinationPath 'deploy-hostinger\correcao-ver-rua.zip' -Force"
)

echo Abrindo a pasta com o arquivo corrigido...
explorer /select,"%~dp0deploy-hostinger\assets\index-DhnYuIz6.js"

echo Abrindo o Gerenciador de Arquivos da Hostinger no navegador...
start "" "https://hpanel.hostinger.com/websites/campanha.space/files/file-manager"

powershell -NoProfile -Command ^
  "[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms');" ^
  "[System.Windows.Forms.MessageBox]::Show(" ^
  "'Siga estes 4 passos (leva ~1 minuto):`n`n" ^
  "1) Faca login no Hostinger se pedir.`n" ^
  "2) Entre na pasta public_html, depois assets.`n" ^
  "3) Clique em Upload e envie este arquivo:`n" ^
  "   index-DhnYuIz6.js`n" ^
  "   (esta na pasta deploy-hostinger\assets)`n" ^
  "4) Confirme SUBSTITUIR o arquivo antigo.`n`n" ^
  "Depois teste em campanha.space: Mapa ^> Ver rua.`n" ^
  "Deve abrir o Google Maps em nova aba.`n`n" ^
  "IMPORTANTE: o FTP normal NAO atualiza este site.`n" ^
  "So funciona pelo Gerenciador de Arquivos.'," ^
  "'Publicar correcao - Ver rua'," ^
  "[System.Windows.Forms.MessageBoxButtons]::OK," ^
  "[System.Windows.Forms.MessageBoxIcon]::Information)"

echo.
echo Pronto. Quando terminar o upload, teste o botao Ver rua no site.
pause
