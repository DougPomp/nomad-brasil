@echo off
chcp 65001 >nul
title NOMAD Brasil - Instalador Automático
color 0A

echo ====================================================================
echo        NOMAD BRASIL - CENTRAL OFFLINE DE RESILIÊNCIA & MAPAS
echo                      Instalador Automático (Setup)
echo ====================================================================
echo.

:: 1. Verificar Docker
echo [*] Verificando Docker Engine...
docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERRO] O Docker não está em execução ou não foi encontrado!
    echo        Inicie o Docker Desktop e execute este instalador novamente.
    echo.
    pause
    exit /b 1
)
echo [OK] Docker detectado e operacional!
echo.

:: 2. Criar Estrutura de Diretórios
echo [*] Configurando estrutura de diretórios...
if not exist "storage\zim" mkdir "storage\zim"
if not exist "storage\maps\basemaps-assets\fonts" mkdir "storage\maps\basemaps-assets\fonts"
if not exist "storage\maps\basemaps-assets\sprites" mkdir "storage\maps\basemaps-assets\sprites"
if not exist "app\data\routes_cache" mkdir "app\data\routes_cache"
echo [OK] Diretórios configurados!
echo.

:: 3. Download automático do Mapa Vetorial do Brasil (1.57 GB)
if not exist "storage\maps\brazil-streets.pmtiles" (
    echo [*] Mapa vetorial do Brasil (brazil-streets.pmtiles) não encontrado.
    echo     Iniciando download do mapa vetorial nacional (1.57 GB)...
    curl -L -o "storage\maps\brazil-streets.pmtiles" "https://build.protomaps.com/20261101.pmtiles" --progress-bar
    if %ERRORLEVEL% neq 0 (
        echo [AVISO] Falha no download do mapa completo. Você poderá baixar manualmente mais tarde.
    ) else (
        echo [OK] Mapa do Brasil baixado com sucesso!
    )
) else (
    echo [OK] Mapa vetorial (brazil-streets.pmtiles) já presente no armazenamento.
)
echo.

:: 4. Download da Wikipédia Offline (Kiwix ZIM)
echo [*] Verificando acervo da Wikipédia Offline...
set FOUND_ZIM=0
for %%f in (storage\zim\*.zim) do set FOUND_ZIM=1

if %FOUND_ZIM% equ 0 (
    echo [!] Nenhum arquivo ZIM encontrado em storage\zim\
    echo.
    echo Escolha uma opção de acervo offline para download automático:
    echo   [1] Wikipédia Completa em Português (~23 GB - Todos os artigos, fotos e diagramas)
    echo   [2] Wikipédia Médica / Primeiros Socorros (~1.2 GB - Enciclopédia médica completa)
    echo   [3] Pular download de ZIM agora (adicionarei meus arquivos ZIM manualmente)
    echo.
    set /p ZIM_CHOICE="Digite sua opção (1, 2 ou 3): "

    if "%ZIM_CHOICE%"=="1" (
        echo [*] Baixando Wikipédia Completa (23 GB)... Esse download pode levar algum tempo.
        curl -L -o "storage\zim\wikipedia_pt_all_maxi_2026-05.zim" "https://download.kiwix.org/zim/wikipedia/wikipedia_pt_all_maxi_2026-05.zim" --progress-bar
    )
    if "%ZIM_CHOICE%"=="2" (
        echo [*] Baixando Enciclopédia Médica Offline (1.2 GB)...
        curl -L -o "storage\zim\wikipedia_pt_medicine_maxi_2026-05.zim" "https://download.kiwix.org/zim/wikipedia/wikipedia_pt_medicine_maxi_2026-05.zim" --progress-bar
    )
) else (
    echo [OK] Acervo ZIM encontrado em storage\zim\!
)
echo.

:: 5. Subir os Contêineres Docker
echo [*] Inicializando contêineres Docker do NOMAD Brasil...
docker compose up -d

echo.
echo ====================================================================
echo        SISTEMA NOMAD BRASIL INICIADO COM SUCESSO!
echo ====================================================================
echo.
echo  - Portal Web:       http://localhost:8000
echo  - Estante Kiwix:    http://localhost:8090
echo.
echo Abrindo o portal no seu navegador...
start http://localhost:8000
echo.
pause
