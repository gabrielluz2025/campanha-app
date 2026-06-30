@echo off
title Sistema de Campanha - Encerrando...
color 0C
echo ============================================
echo    ENCERRANDO SISTEMA DE CAMPANHA
echo ============================================
echo.

echo Fechando servidor Vite (porta 5173)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    taskkill /PID %%a /F > nul 2>&1
)

echo Fechando processos Node.js relacionados...
taskkill /F /IM node.exe > nul 2>&1

echo.
echo Sistema encerrado com sucesso!
echo ============================================
timeout /t 3 /nobreak > nul
exit
