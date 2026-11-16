@echo off
chcp 65001 >nul
title NOMAD Brasil - Ativar IA Tatica Offline (Ollama)
echo ====================================================================
echo   NOMAD Brasil - Ativar Motor de IA Offline (Ollama + RAG Local)
echo ====================================================================
echo.
cd /d "%~dp0"

docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] O Docker Desktop nao esta em execucao.
    echo        Abra o Docker Desktop primeiro e tente novamente.
    echo.
    pause
    exit /b 1
)

if not exist "storage\ollama" mkdir "storage\ollama"

echo Escolha o modelo leve para baixar/usar offline:
echo   [1] qwen2.5:1.5b  (Recomendado - ~1,0 GB / Melhor em Portugues e CPU)
echo   [2] llama3.2:1b   (Ultra-leve  - ~700 MB / Hardware modesto)
echo   [3] gemma3:1b     (Compacto    - ~815 MB / Google 1B)
echo   [4] phi4-mini     (Intermed.   - ~2,5 GB / 8 GB+ RAM)
echo   [5] gemma3:4b     (Avancado    - ~3,3 GB / Melhor qualidade PT-BR)
echo   [6] Apenas ligar o motor Ollama (sem baixar modelo agora)
echo.
set "AI_CHOICE="
set /p AI_CHOICE="Opcao [Enter = 1 - qwen2.5:1.5b]: "
if "%AI_CHOICE%"=="" set "AI_CHOICE=1"

set "AI_MODEL=qwen2.5:1.5b"
if "%AI_CHOICE%"=="2" set "AI_MODEL=llama3.2:1b"
if "%AI_CHOICE%"=="3" set "AI_MODEL=gemma3:1b"
if "%AI_CHOICE%"=="4" set "AI_MODEL=phi4-mini"
if "%AI_CHOICE%"=="5" set "AI_MODEL=gemma3:4b"
if "%AI_CHOICE%"=="6" set "AI_MODEL=NONE"

echo.
echo [1/3] Subindo servicos NOMAD Brasil + Ollama (perfil ai)...
docker compose --profile ai up -d
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao iniciar os containers Docker.
    pause
    exit /b 1
)

echo.
echo [2/3] Aguardando o motor Ollama responder...
set /a TRIES=0
:wait_ollama
set /a TRIES+=1
docker exec nomad_brasil_ollama ollama list >nul 2>&1
if %errorlevel% equ 0 goto ollama_ready
if %TRIES% geq 15 (
    echo [AVISO] O Ollama ainda esta inicializando. Voce pode baixar o modelo pela aba IA no portal.
    goto open_portal
)
timeout /t 2 /nobreak >nul
goto wait_ollama

:ollama_ready
echo [OK] Motor Ollama ativo na porta 11434!

if "%AI_MODEL%"=="NONE" goto open_portal

echo.
echo [3/3] Verificando modelo "%AI_MODEL%"...
docker exec nomad_brasil_ollama ollama list | findstr /i "%AI_MODEL%" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Modelo "%AI_MODEL%" ja esta instalado offline!
) else (
    echo [*] Baixando "%AI_MODEL%" para storage\ollama (pode levar alguns minutos)...
    docker exec nomad_brasil_ollama ollama pull %AI_MODEL%
    if %errorlevel% neq 0 (
        echo [AVISO] Nao foi possivel baixar "%AI_MODEL%" agora. Se estiver offline, o chat ainda funciona em Modo RAG Local.
    ) else (
        echo [OK] Modelo "%AI_MODEL%" baixado e pronto para uso 100%% offline!
    )
)

:open_portal
echo.
echo ====================================================================
echo   IA Tatica pronta! Abra a aba "IA Tatica Offline" no portal.
echo   Portal Web: http://localhost:8000
echo   Ollama API: http://localhost:11434
echo ====================================================================
start http://localhost:8000
echo.
pause
