@echo off
title Agente de Impresion - Mundo de Pekes
color 0A
echo.
echo  ==========================================
echo   Agente de Impresion - Mundo de Pekes
echo  ==========================================
echo.

:: Agregar Node.js al PATH explicitamente
set PATH=C:\Program Files\nodejs;%PATH%

:: Verificar Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    color 0C
    echo  [ERROR] Node.js no esta instalado.
    echo.
    echo  Por favor instala Node.js desde:
    echo  https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Instalar dependencias si no existen
if not exist "node_modules\" (
    echo  Instalando dependencias por primera vez...
    echo.
    call npm install
    echo.
)

echo  Iniciando agente en http://localhost:3000
echo  (Deja esta ventana abierta mientras usas el sistema)
echo  Para detener: presiona Ctrl+C
echo.

node index.js

pause
