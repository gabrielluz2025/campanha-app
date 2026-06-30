@echo off
title Sistema de Campanha - Iniciando...
color 0A
echo ============================================
echo    SISTEMA DE CAMPANHA ELEITORAL
echo ============================================
echo.
echo Iniciando o servidor...
echo.

cd /d "%~dp0"

start /B cmd /c "npx vite --host > nul 2>&1"

echo Aguardando servidor iniciar...
timeout /t 4 /nobreak > nul

start "" http://localhost:5173

echo.
echo Sistema iniciado com sucesso!
echo Acesse: http://localhost:5173
echo.
echo Para fechar, use o arquivo "fechar.bat"
echo ============================================
exit
