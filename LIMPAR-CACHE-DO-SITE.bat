@echo off
chcp 65001 >nul
echo Abrindo limpeza de cache do campanha.space...
start "" "https://campanha.space/reset-app.html"
powershell -NoProfile -Command "[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.MessageBox]::Show('A pagina vai limpar o cache do app sozinha e voltar ao site.`n`nDepois teste Ver rua de novo (Ctrl+Shift+R se precisar).','Limpar cache',0,64)"
pause
