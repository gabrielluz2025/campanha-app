@echo off
cd /d "%~dp0"
if not exist ".env.ps1" (
  copy /Y ".env.ps1.example" ".env.ps1" >nul
)
notepad ".env.ps1"
echo.
echo Salve o arquivo no Bloco de Notas e feche esta janela.
pause
