@echo off
title NOMAD Brasil - Iniciando
echo ========================================================
echo   NOMAD Brasil - Central de Sobrevivencia e Resiliencia
echo ========================================================
echo.
cd /d "%~dp0"

echo Verificando e iniciando servicos Docker...
docker compose up -d

echo.
echo Aguardando inicializacao do portal...
timeout /t 2 /nobreak >nul

echo Abrindo NOMAD Brasil no seu navegador...
start http://localhost:8000

echo.
echo Pronto! O NOMAD Brasil esta em execucao.
echo Voce pode minimizar ou fechar esta janela.
timeout /t 3 >nul
exit
